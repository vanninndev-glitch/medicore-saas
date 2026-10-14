/**
 * MediCore SaaS — modules/admissions/admissions.routes.js
 * Admisiones: urgencias, triaje, camas, hospitalizaciones
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param } = require('express-validator');
const { v4: uuidv4 }  = require('uuid');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const { authenticate, requirePermission, resolveTenant, validate, auditLog } = require('../../middlewares/index');

/* ── SERVICE ── */
const AdmissionsService = {

  /* ── Estado de camas ── */
  async getBedsStatus(hospitalId) {
    const cacheKey = `beds:${hospitalId}`;
    const cached   = await Redis.get(cacheKey);
    if (cached) return cached;

    const beds = await DB.query(
      `SELECT b.id, b.number, b.ward, b.floor, b.type, b.status,
              p.name as patient_name, p.id as patient_id,
              h.admitted_at
       FROM hospital_beds b
       LEFT JOIN hospitalizations h ON h.bed_id = b.id AND h.status = 'active'
       LEFT JOIN patients p ON p.id = h.patient_id
       WHERE b.hospital_id = $1
       ORDER BY b.ward, b.number`,
      [hospitalId]
    );

    const summary = {
      total:       beds.length,
      available:   beds.filter(b => b.status === 'available').length,
      occupied:    beds.filter(b => b.status === 'occupied').length,
      reserved:    beds.filter(b => b.status === 'reserved').length,
      cleaning:    beds.filter(b => b.status === 'cleaning').length,
      maintenance: beds.filter(b => b.status === 'maintenance').length,
    };

    const result = { beds, summary };
    await Redis.set(cacheKey, result, 30); // 30 seg cache (tiempo real)
    return result;
  },

  /* ── Asignar cama ── */
  async assignBed({ bedId, patientId, hospitalId, userId }) {
    const bed = await DB.queryOne("SELECT id, status FROM hospital_beds WHERE id = $1 AND hospital_id = $2", [bedId, hospitalId]);
    if (!bed) return { error: 'Cama no encontrada' };
    if (bed.status !== 'available' && bed.status !== 'reserved') return { error: 'Cama no disponible' };

    await DB.transaction(async (tx) => {
      await tx.query("UPDATE hospital_beds SET status = 'occupied', updated_at = NOW() WHERE id = $1", [bedId]);
      await tx.query(
        `INSERT INTO hospitalizations (id, hospital_id, patient_id, bed_id, status, admitted_by, admitted_at, created_at)
         VALUES ($1,$2,$3,$4,'active',$5,NOW(),NOW())`,
        [uuidv4(), hospitalId, patientId, bedId, userId]
      );
    });

    await Redis.del(`beds:${hospitalId}`);
    global.io?.emitToHospital(hospitalId, 'bed:assigned', { bedId, patientId });
    global.io?.emitToHospital(hospitalId, 'bed:status_changed', { bedId, status: 'occupied' });
    return { success: true };
  },

  /* ── Liberar cama ── */
  async releaseBed({ bedId, hospitalId, userId, status = 'cleaning' }) {
    await DB.transaction(async (tx) => {
      await tx.query(`UPDATE hospital_beds SET status = $2, updated_at = NOW() WHERE id = $1`, [bedId, status]);
      await tx.query(`UPDATE hospitalizations SET status = 'discharged', discharged_by = $3, discharged_at = NOW() WHERE bed_id = $1 AND hospital_id = $2 AND status = 'active'`, [bedId, hospitalId, userId]);
    });

    await Redis.del(`beds:${hospitalId}`);
    global.io?.emitToHospital(hospitalId, 'bed:status_changed', { bedId, status });
    return { success: true };
  },

  /* ── Triaje de urgencias ── */
  async listUrgencies(hospitalId) {
    return DB.query(
      `SELECT u.id, u.triage_level, u.reason, u.status, u.wait_minutes, u.created_at,
              p.name as patient_name, p.id as patient_id,
              EXTRACT(EPOCH FROM (NOW() - u.created_at))/60 as minutes_waiting
       FROM urgencies u JOIN patients p ON p.id = u.patient_id
       WHERE u.hospital_id = $1 AND u.status IN ('waiting','in_triage','in_treatment')
       ORDER BY u.triage_level ASC, u.created_at ASC`,
      [hospitalId]
    );
  },

  async createUrgency({ patientId, triageLevel, reason, hospitalId, userId }) {
    const id = uuidv4();
    await DB.query(
      `INSERT INTO urgencies (id, hospital_id, patient_id, triage_level, reason, status, admitted_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'waiting',$6,NOW(),NOW())`,
      [id, hospitalId, patientId, triageLevel, reason, userId]
    );

    const patient = await DB.queryOne('SELECT name FROM patients WHERE id = $1', [patientId]);
    global.io?.emitToHospital(hospitalId, 'urgency:new', {
      id, patientId, patientName: patient?.name, triage: triageLevel, reason,
    });

    return { id };
  },

  async updateUrgencyStatus(urgencyId, status, hospitalId) {
    await DB.query(
      'UPDATE urgencies SET status = $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
      [urgencyId, hospitalId, status]
    );
    global.io?.emitToHospital(hospitalId, 'urgency:updated', { id: urgencyId, status });
    return { id: urgencyId, status };
  },
};

/* ── RUTAS ── */
router.use(authenticate, resolveTenant);

/* Camas */
router.get('/beds', requirePermission('patients:read'), asyncHandler(async (req, res) => {
  const result = await AdmissionsService.getBedsStatus(req.hospitalId);
  return Response.ok(res, result);
}));

router.post('/beds/assign', [body('bedId').isUUID(), body('patientId').isUUID()], requirePermission('patients:write'), validate,
  auditLog('bed:assign'), asyncHandler(async (req, res) => {
    const result = await AdmissionsService.assignBed({ ...req.body, hospitalId: req.hospitalId, userId: req.userId });
    if (result.error) return Response.badRequest(res, result.error);
    return Response.ok(res, null, 'Cama asignada correctamente');
  })
);

router.post('/beds/release', [body('bedId').isUUID()], requirePermission('patients:write'), validate,
  auditLog('bed:release'), asyncHandler(async (req, res) => {
    const result = await AdmissionsService.releaseBed({ ...req.body, hospitalId: req.hospitalId, userId: req.userId });
    return Response.ok(res, null, 'Cama liberada');
  })
);

router.patch('/beds/:id', param('id').isUUID(), requirePermission('patients:write'), validate,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const valid = ['available','occupied','reserved','cleaning','maintenance'];
    if (!valid.includes(status)) return Response.badRequest(res, 'Estado inválido');
    await DB.query("UPDATE hospital_beds SET status = $2, updated_at = NOW() WHERE id = $1 AND hospital_id = $3", [req.params.id, status, req.hospitalId]);
    await Redis.del(`beds:${req.hospitalId}`);
    global.io?.emitToHospital(req.hospitalId, 'bed:status_changed', { bedId: req.params.id, status });
    return Response.ok(res, null, 'Estado de cama actualizado');
  })
);

/* Urgencias */
router.get('/urgencies', requirePermission('patients:read'), asyncHandler(async (req, res) => {
  const urgencies = await AdmissionsService.listUrgencies(req.hospitalId);
  return Response.ok(res, { urgencies });
}));

router.post('/urgencies', [body('patientId').isUUID(), body('triageLevel').isInt({ min:1, max:5 }), body('reason').notEmpty()],
  requirePermission('patients:write'), validate, auditLog('urgency:create'), asyncHandler(async (req, res) => {
    const result = await AdmissionsService.createUrgency({ ...req.body, hospitalId: req.hospitalId, userId: req.userId });
    return Response.created(res, result, 'Urgencia registrada');
  })
);

router.patch('/urgencies/:id/status', param('id').isUUID(), [body('status').notEmpty()],
  requirePermission('patients:write'), validate, asyncHandler(async (req, res) => {
    const result = await AdmissionsService.updateUrgencyStatus(req.params.id, req.body.status, req.hospitalId);
    return Response.ok(res, result, 'Estado actualizado');
  })
);

module.exports = router;
