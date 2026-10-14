/**
 * MediCore SaaS — modules/lab/lab.routes.js
 * Laboratorio: solicitudes, resultados, valores de referencia, alertas
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const DB       = require('../../config/database');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const { authenticate, requirePermission, resolveTenant, validate, auditLog } = require('../../middlewares/index');

/* ── SERVICE ── */
const LabService = {

  async listOrders({ hospitalId, patientId, status, priority, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId]; let where = 'WHERE o.hospital_id = $1'; let idx = 2;
    if (patientId) { where += ` AND o.patient_id = $${idx++}`; params.push(patientId); }
    if (status)    { where += ` AND o.status = $${idx++}`;     params.push(status); }
    if (priority)  { where += ` AND o.priority = $${idx++}`;   params.push(priority); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT o.id, o.tests, o.status, o.priority, o.indication, o.notes, o.created_at,
                p.name as patient_name, p.id as patient_id, p.expedient,
                u.name as doctor_name
         FROM lab_orders o
         JOIN patients p ON p.id = o.patient_id
         JOIN users    u ON u.id = o.doctor_id
         ${where} ORDER BY o.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM lab_orders o ${where}`, params),
    ]);
    return { orders: rows, total: parseInt(countRes?.total || 0) };
  },

  async createOrder(data, hospitalId, doctorId) {
    const patient = await DB.queryOne('SELECT id, name FROM patients WHERE id = $1 AND hospital_id = $2', [data.patientId, hospitalId]);
    if (!patient) throw Object.assign(new Error('Paciente no encontrado'), { code: 'NOT_FOUND' });

    const id = uuidv4();
    await DB.query(
      `INSERT INTO lab_orders (id, hospital_id, patient_id, doctor_id, tests, priority, indication, notes, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW(),NOW())`,
      [id, hospitalId, data.patientId, doctorId, JSON.stringify(data.tests || []), data.priority || 'normal', data.indication || null, data.notes || null]
    );

    /* Notificar técnicos de laboratorio */
    global.io?.emitToRole(hospitalId, 'lab_technician', 'lab:order_created', {
      id, patientName: patient.name, tests: data.tests?.map(t => t.name), priority: data.priority,
    });

    return { id };
  },

  async saveResults(orderId, hospitalId, results, technicianId) {
    const order = await DB.queryOne('SELECT id, patient_id, doctor_id FROM lab_orders WHERE id = $1 AND hospital_id = $2', [orderId, hospitalId]);
    if (!order) return null;

    await DB.query(
      `UPDATE lab_orders SET results = $3, status = 'completed', completed_at = NOW(), completed_by = $4, updated_at = NOW()
       WHERE id = $1 AND hospital_id = $2`,
      [orderId, hospitalId, JSON.stringify(results), technicianId]
    );

    /* Verificar valores fuera de rango → alertas */
    const abnormal = (results || []).filter(r => r.status !== 'normal');
    if (abnormal.length) {
      await DB.query(
        `INSERT INTO notifications (id, user_id, hospital_id, type, message, data, created_at)
         VALUES ($1,$2,$3,'lab','Resultados con valores anormales disponibles',$4::jsonb,NOW())`,
        [uuidv4(), order.doctor_id, hospitalId, JSON.stringify({ orderId, abnormal: abnormal.length })]
      );
    }

    /* Emitir Socket.IO */
    global.io?.emitToUser(order.doctor_id, 'lab:result_ready', { orderId, patientId: order.patient_id, abnormal: abnormal.length });
    global.io?.emitToHospital(hospitalId, 'lab:result_ready', { orderId });

    return { id: orderId };
  },
};

/* ── CONTROLLER ── */
router.use(authenticate, resolveTenant);

router.get('/orders', requirePermission('lab:read'), asyncHandler(async (req, res) => {
  const { patientId, status, priority, page = 1, limit = 30 } = req.query;
  const result = await LabService.listOrders({ hospitalId: req.hospitalId, patientId, status, priority, page: +page, limit: +limit });
  return Response.paginated(res, result.orders, result.total, page, limit);
}));

router.get('/orders/:id', param('id').isUUID(), requirePermission('lab:read'), validate, asyncHandler(async (req, res) => {
  const order = await DB.queryOne(
    `SELECT o.*, p.name as patient_name, u.name as doctor_name FROM lab_orders o JOIN patients p ON p.id = o.patient_id JOIN users u ON u.id = o.doctor_id WHERE o.id = $1 AND o.hospital_id = $2`,
    [req.params.id, req.hospitalId]
  );
  if (!order) return Response.notFound(res, 'Solicitud no encontrada');
  return Response.ok(res, order);
}));

router.post('/orders', [body('patientId').isUUID(), body('tests').isArray({ min: 1 })], requirePermission('lab:write'), validate,
  auditLog('lab:order'), asyncHandler(async (req, res) => {
    try {
      const result = await LabService.createOrder(req.body, req.hospitalId, req.userId);
      return Response.created(res, result, 'Solicitud enviada al laboratorio');
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      throw err;
    }
  })
);

router.put('/results/:id', param('id').isUUID(), [body('results').isArray()], requirePermission('lab:write'), validate,
  auditLog('lab:results'), asyncHandler(async (req, res) => {
    const result = await LabService.saveResults(req.params.id, req.hospitalId, req.body.results, req.userId);
    if (!result) return Response.notFound(res, 'Solicitud no encontrada');
    return Response.ok(res, result, 'Resultados guardados correctamente');
  })
);

router.get('/references', requirePermission('lab:read'), asyncHandler(async (req, res) => {
  const refs = await DB.query('SELECT * FROM lab_reference_values WHERE hospital_id = $1 OR hospital_id IS NULL ORDER BY test_name', [req.hospitalId]);
  return Response.ok(res, { references: refs });
}));

module.exports = router;
