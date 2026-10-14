/**
 * MediCore SaaS — modules/records/records.routes.js
 * Historial clínico electrónico: notas SOAP, ICD-10, signos vitales, interconsultas
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const {
  authenticate, requirePermission, resolveTenant,
  validate, auditLog,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   RECORDS SERVICE
════════════════════════════════════════ */
const RecordsService = {

  /* ── Listar notas del historial ── */
  async list({ hospitalId, patientId, doctorId, specialty, dateFrom, dateTo, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId];
    let where = 'WHERE r.hospital_id = $1';
    let idx   = 2;

    if (patientId) { where += ` AND r.patient_id = $${idx++}`; params.push(patientId); }
    if (doctorId)  { where += ` AND r.doctor_id = $${idx++}`;  params.push(doctorId); }
    if (specialty) { where += ` AND r.specialty = $${idx++}`;  params.push(specialty); }
    if (dateFrom)  { where += ` AND r.created_at >= $${idx++}`;params.push(dateFrom); }
    if (dateTo)    { where += ` AND r.created_at <= $${idx++}`;params.push(dateTo); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT r.id, r.patient_id, r.specialty, r.type, r.status,
                r.diagnoses, r.soap_s, r.soap_o, r.soap_a, r.soap_p,
                r.created_at, r.updated_at,
                p.name  as patient_name, p.expedient,
                u.name  as doctor_name
         FROM clinical_records r
         JOIN patients p ON p.id = r.patient_id
         JOIN users    u ON u.id = r.doctor_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM clinical_records r ${where}`, params),
    ]);

    return { records: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Obtener nota por ID ── */
  async getById(id, hospitalId) {
    const record = await DB.queryOne(
      `SELECT r.*,
              p.name  as patient_name, p.expedient, p.dob, p.blood_type,
              u.name  as doctor_name, u.role as doctor_role
       FROM clinical_records r
       JOIN patients p ON p.id = r.patient_id
       JOIN users    u ON u.id = r.doctor_id
       WHERE r.id = $1 AND r.hospital_id = $2`,
      [id, hospitalId]
    );
    if (!record) return null;

    /* Signos vitales de esa nota */
    record.vitals = await DB.queryOne(
      'SELECT * FROM vital_signs WHERE record_id = $1',
      [id]
    );

    return record;
  },

  /* ── Crear nota SOAP ── */
  async create(data, hospitalId, doctorId) {
    /* Verificar que el paciente pertenece al hospital */
    const patient = await DB.queryOne(
      'SELECT id FROM patients WHERE id = $1 AND hospital_id = $2',
      [data.patientId, hospitalId]
    );
    if (!patient) throw Object.assign(new Error('Paciente no encontrado'), { code: 'NOT_FOUND' });

    const id = uuidv4();

    await DB.transaction(async (tx) => {
      /* Insertar nota */
      await tx.query(
        `INSERT INTO clinical_records (
          id, hospital_id, patient_id, doctor_id, specialty, type,
          diagnoses, soap_s, soap_o, soap_a, soap_p,
          observations, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed',NOW(),NOW())`,
        [
          id, hospitalId, data.patientId, doctorId,
          data.specialty, data.type || 'consultation',
          JSON.stringify(data.diagnoses || []),
          data.soap?.S || null, data.soap?.O || null,
          data.soap?.A || null, data.soap?.P || null,
          data.observations || null,
        ]
      );

      /* Signos vitales */
      if (data.vitals && Object.values(data.vitals).some(v => v != null)) {
        await tx.query(
          `INSERT INTO vital_signs (
            id, record_id, patient_id, hospital_id,
            bp_systolic, bp_diastolic, heart_rate, resp_rate,
            temperature, sp_o2, weight, height, glucose,
            recorded_by, recorded_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
          [
            uuidv4(), id, data.patientId, hospitalId,
            data.vitals.bpSystolic  || null,
            data.vitals.bpDiastolic || null,
            data.vitals.heartRate   || null,
            data.vitals.respRate    || null,
            data.vitals.temperature || null,
            data.vitals.spO2        || null,
            data.vitals.weight      || null,
            data.vitals.height      || null,
            data.vitals.glucose     || null,
            doctorId,
          ]
        );
      }

      /* Actualizar última visita del paciente */
      await tx.query(
        'UPDATE patients SET last_visit_at = NOW(), updated_at = NOW() WHERE id = $1',
        [data.patientId]
      );
    });

    await Redis.del(`patient:${data.patientId}`);

    /* Emitir evento Socket.IO */
    global.io?.emitToHospital(hospitalId, 'record:updated', {
      patientId: data.patientId, recordId: id, doctorId,
    });

    return { id };
  },

  /* ── Actualizar nota ── */
  async update(id, data, hospitalId, doctorId) {
    const existing = await DB.queryOne(
      'SELECT id, doctor_id, created_at FROM clinical_records WHERE id = $1 AND hospital_id = $2',
      [id, hospitalId]
    );
    if (!existing) return null;

    /* Solo el autor puede editar en las primeras 24h */
    const hoursSince = (Date.now() - new Date(existing.created_at).getTime()) / 3600000;
    if (existing.doctor_id !== doctorId && hoursSince > 24) {
      throw Object.assign(new Error('Solo el autor puede editar notas pasadas 24 horas'), { code: 'FORBIDDEN' });
    }

    await DB.query(
      `UPDATE clinical_records SET
        diagnoses = $3, soap_s = $4, soap_o = $5, soap_a = $6, soap_p = $7,
        observations = $8, updated_at = NOW()
       WHERE id = $1 AND hospital_id = $2`,
      [
        id, hospitalId,
        JSON.stringify(data.diagnoses || []),
        data.soap?.S || null, data.soap?.O || null,
        data.soap?.A || null, data.soap?.P || null,
        data.observations || null,
      ]
    );

    return { id };
  },

  /* ── Historial de signos vitales del paciente ── */
  async getVitalSigns(patientId, hospitalId, limit = 10) {
    return DB.query(
      `SELECT vs.*, u.name as recorded_by_name
       FROM vital_signs vs
       JOIN users u ON u.id = vs.recorded_by
       WHERE vs.patient_id = $1 AND vs.hospital_id = $2
       ORDER BY vs.recorded_at DESC
       LIMIT $3`,
      [patientId, hospitalId, limit]
    );
  },
};

/* ════════════════════════════════════════
   RECORDS CONTROLLER
════════════════════════════════════════ */
const RecordsController = {

  list: async (req, res) => {
    const { patientId, doctorId, specialty, dateFrom, dateTo, page = 1, limit = 15 } = req.query;
    const result = await RecordsService.list({
      hospitalId: req.hospitalId,
      patientId, doctorId, specialty, dateFrom, dateTo,
      page: Math.max(parseInt(page), 1),
      limit: Math.min(parseInt(limit), 50),
    });
    return Response.paginated(res, result.records, result.total, page, limit);
  },

  getById: async (req, res) => {
    const record = await RecordsService.getById(req.params.id, req.hospitalId);
    if (!record) return Response.notFound(res, 'Nota clínica no encontrada');
    return Response.ok(res, record);
  },

  create: async (req, res) => {
    try {
      const result = await RecordsService.create(req.body, req.hospitalId, req.userId);
      return Response.created(res, result, 'Nota clínica guardada correctamente');
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      throw err;
    }
  },

  update: async (req, res) => {
    try {
      const result = await RecordsService.update(req.params.id, req.body, req.hospitalId, req.userId);
      if (!result) return Response.notFound(res, 'Nota clínica no encontrada');
      return Response.ok(res, result, 'Nota actualizada correctamente');
    } catch (err) {
      if (err.code === 'FORBIDDEN') return Response.forbidden(res, err.message);
      throw err;
    }
  },

  getVitalSigns: async (req, res) => {
    const vitals = await RecordsService.getVitalSigns(
      req.params.patientId, req.hospitalId, parseInt(req.query.limit) || 10
    );
    return Response.ok(res, { vitals });
  },
};

/* ════════════════════════════════════════
   VALIDADORES
════════════════════════════════════════ */
const createValidators = [
  body('patientId').isUUID().withMessage('ID de paciente inválido'),
  body('specialty').notEmpty().withMessage('Especialidad requerida'),
  body('diagnoses').optional().isArray().withMessage('Diagnósticos debe ser un array'),
];

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

router.get('/',                                         requirePermission('records:read'),  asyncHandler(RecordsController.list));
router.get('/:id',         param('id').isUUID(),        requirePermission('records:read'),  validate, asyncHandler(RecordsController.getById));
router.get('/vitals/:patientId', param('patientId').isUUID(), requirePermission('records:read'), validate, asyncHandler(RecordsController.getVitalSigns));

router.post('/',           createValidators,             requirePermission('records:write'), validate,
  auditLog('record:create'), asyncHandler(RecordsController.create));

router.put('/:id',         param('id').isUUID(),         requirePermission('records:write'), validate,
  auditLog('record:update'), asyncHandler(RecordsController.update));

module.exports = router;
