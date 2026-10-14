/**
 * MediCore SaaS — modules/appointments/appointments.routes.js
 * Citas: CRUD, slots disponibles, calendar view, Socket.IO
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const dayjs        = require('dayjs');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const {
  authenticate, requirePermission, resolveTenant,
  validate, auditLog,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   APPOINTMENTS SERVICE
════════════════════════════════════════ */
const AppointmentsService = {

  /* ── Listar citas por rango de fechas ── */
  async list({ hospitalId, doctorId, patientId, start, end, status, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId];
    let where    = 'WHERE a.hospital_id = $1';
    let idx      = 2;

    if (doctorId)  { where += ` AND a.doctor_id = $${idx++}`;  params.push(doctorId); }
    if (patientId) { where += ` AND a.patient_id = $${idx++}`; params.push(patientId); }
    if (status)    { where += ` AND a.status = $${idx++}`;     params.push(status); }
    if (start)     { where += ` AND a.date >= $${idx++}`;      params.push(start); }
    if (end)       { where += ` AND a.date <= $${idx++}`;      params.push(end); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT a.id, a.date, a.duration, a.type, a.channel, a.status,
                a.specialty, a.reason, a.notes,
                p.name  as patient_name, p.id as patient_id, p.phone as patient_phone,
                u.name  as doctor_name,  u.id as doctor_id
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN users    u ON u.id = a.doctor_id
         ${where}
         ORDER BY a.date ASC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM appointments a ${where}`, params),
    ]);

    return { appointments: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Obtener slots disponibles de un médico en una fecha ── */
  async getSlots(doctorId, date, hospitalId, duration = 30) {
    const cacheKey = `slots:${doctorId}:${date}`;
    const cached   = await Redis.get(cacheKey);
    if (cached) return cached;

    /* Obtener horario del médico */
    const schedule = await DB.queryOne(
      `SELECT start_time, end_time, break_start, break_end
       FROM doctor_schedules
       WHERE doctor_id = $1 AND hospital_id = $2
         AND day_of_week = $3 AND is_active = true`,
      [doctorId, hospitalId, dayjs(date).day()]
    );

    if (!schedule) return { occupied: [], available: [], message: 'El médico no tiene horario para este día' };

    /* Citas ya agendadas ese día */
    const existing = await DB.query(
      `SELECT date, duration FROM appointments
       WHERE doctor_id = $1 AND hospital_id = $2
         AND DATE(date) = $3 AND status NOT IN ('cancelled','no_show')`,
      [doctorId, hospitalId, date]
    );

    const occupiedTimes = existing.map(a => dayjs(a.date).format('HH:mm'));

    const result = { occupied: occupiedTimes, available: [] };
    await Redis.set(cacheKey, result, 300);
    return result;
  },

  /* ── Crear cita ── */
  async create(data, hospitalId, createdBy) {
    /* Verificar paciente y médico */
    const [patient, doctor] = await Promise.all([
      DB.queryOne('SELECT id, name FROM patients WHERE id = $1 AND hospital_id = $2', [data.patientId, hospitalId]),
      DB.queryOne('SELECT id, name FROM users WHERE id = $1 AND role IN ($2,$3) AND status = $4',
        [data.doctorId, 'doctor', 'medical_director', 'active']),
    ]);

    if (!patient) throw Object.assign(new Error('Paciente no encontrado'), { code: 'NOT_FOUND' });
    if (!doctor)  throw Object.assign(new Error('Médico no encontrado'),   { code: 'NOT_FOUND' });

    /* Verificar solapamiento */
    const overlap = await DB.queryOne(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND hospital_id = $2
         AND status NOT IN ('cancelled','no_show')
         AND date BETWEEN $3 AND $4`,
      [
        data.doctorId, hospitalId,
        dayjs(data.date).subtract(data.duration - 1, 'minute').toISOString(),
        dayjs(data.date).add(data.duration - 1, 'minute').toISOString(),
      ]
    );

    if (overlap) throw Object.assign(new Error('El médico ya tiene una cita en ese horario'), { code: 'CONFLICT' });

    const id = uuidv4();

    await DB.query(
      `INSERT INTO appointments (
        id, hospital_id, patient_id, doctor_id,
        date, duration, type, channel, specialty,
        reason, notes, status, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed',$12,NOW(),NOW())`,
      [
        id, hospitalId, data.patientId, data.doctorId,
        data.date, data.duration || 30, data.type || 'consultation',
        data.channel || 'presencial', data.specialty || '',
        data.reason || null, data.notes || null, createdBy,
      ]
    );

    /* Invalidar caché de slots */
    const dateStr = dayjs(data.date).format('YYYY-MM-DD');
    await Redis.del(`slots:${data.doctorId}:${dateStr}`);

    /* Emitir Socket.IO */
    global.io?.emitToHospital(hospitalId, 'appointment:created', {
      id, patientName: patient.name, doctorName: doctor.name,
      date: data.date, specialty: data.specialty,
    });

    /* Notificar al médico */
    global.io?.emitToUser(data.doctorId, 'notification:new', {
      id: uuidv4(), type: 'appointment',
      message: `Nueva cita asignada: ${patient.name} — ${dayjs(data.date).format('DD/MM/YYYY HH:mm')}`,
      createdAt: new Date().toISOString(), read: false,
    });

    return { id, patientName: patient.name, doctorName: doctor.name };
  },

  /* ── Actualizar estado de cita ── */
  async updateStatus(id, status, hospitalId, userId) {
    const validStatuses = ['confirmed','waiting','in_progress','completed','cancelled','no_show','rescheduled'];
    if (!validStatuses.includes(status)) throw new Error(`Estado inválido: ${status}`);

    const appt = await DB.queryOne(
      'SELECT id, patient_id, doctor_id, date FROM appointments WHERE id = $1 AND hospital_id = $2',
      [id, hospitalId]
    );
    if (!appt) return null;

    await DB.query(
      'UPDATE appointments SET status = $3, updated_at = NOW(), updated_by = $4 WHERE id = $1 AND hospital_id = $2',
      [id, hospitalId, status, userId]
    );

    /* Invalidar caché */
    const dateStr = dayjs(appt.date).format('YYYY-MM-DD');
    await Redis.del(`slots:${appt.doctor_id}:${dateStr}`);

    global.io?.emitToHospital(hospitalId, `appointment:${status === 'cancelled' ? 'cancelled' : 'updated'}`, {
      id, status, patientId: appt.patient_id, doctorId: appt.doctor_id,
    });

    return { id, status };
  },

  /* ── Resumen para dashboard ── */
  async getDashboardSummary(hospitalId) {
    const today = dayjs().format('YYYY-MM-DD');
    const [todayCount, pendingCount, stats] = await Promise.all([
      DB.queryOne(
        `SELECT COUNT(*) as cnt FROM appointments WHERE hospital_id = $1 AND DATE(date) = $2 AND status != 'cancelled'`,
        [hospitalId, today]
      ),
      DB.queryOne(
        `SELECT COUNT(*) as cnt FROM appointments WHERE hospital_id = $1 AND DATE(date) = $2 AND status IN ('confirmed','waiting')`,
        [hospitalId, today]
      ),
      DB.query(
        `SELECT status, COUNT(*) as cnt FROM appointments
         WHERE hospital_id = $1 AND DATE(date) = $2
         GROUP BY status`,
        [hospitalId, today]
      ),
    ]);
    return { today: parseInt(todayCount?.cnt || 0), pending: parseInt(pendingCount?.cnt || 0), byStatus: stats };
  },
};

/* ════════════════════════════════════════
   CONTROLLER
════════════════════════════════════════ */
const AppointmentsController = {

  list: async (req, res) => {
    const { doctorId, patientId, start, end, status, page = 1, limit = 50 } = req.query;
    const result = await AppointmentsService.list({
      hospitalId: req.hospitalId,
      doctorId, patientId, start, end, status,
      page: Math.max(parseInt(page), 1),
      limit: Math.min(parseInt(limit), 200),
    });
    return Response.paginated(res, result.appointments, result.total, page, limit);
  },

  getById: async (req, res) => {
    const appt = await DB.queryOne(
      `SELECT a.*, p.name as patient_name, u.name as doctor_name
       FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = a.doctor_id
       WHERE a.id = $1 AND a.hospital_id = $2`,
      [req.params.id, req.hospitalId]
    );
    if (!appt) return Response.notFound(res, 'Cita no encontrada');
    return Response.ok(res, appt);
  },

  getSlots: async (req, res) => {
    const { doctorId, date, duration } = req.query;
    if (!doctorId || !date) return Response.badRequest(res, 'doctorId y date son requeridos');
    const slots = await AppointmentsService.getSlots(doctorId, date, req.hospitalId, parseInt(duration) || 30);
    return Response.ok(res, slots);
  },

  create: async (req, res) => {
    try {
      const result = await AppointmentsService.create(req.body, req.hospitalId, req.userId);
      return Response.created(res, result, 'Cita agendada correctamente');
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      if (err.code === 'CONFLICT')  return Response.conflict(res, err.message);
      throw err;
    }
  },

  updateStatus: async (req, res) => {
    const { status } = req.body;
    const result = await AppointmentsService.updateStatus(req.params.id, status, req.hospitalId, req.userId);
    if (!result) return Response.notFound(res, 'Cita no encontrada');
    return Response.ok(res, result, `Estado actualizado a: ${status}`);
  },

  dashboard: async (req, res) => {
    const summary = await AppointmentsService.getDashboardSummary(req.hospitalId);
    return Response.ok(res, summary);
  },
};

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
const createValidators = [
  body('patientId').isUUID().withMessage('ID de paciente inválido'),
  body('doctorId').isUUID().withMessage('ID de médico inválido'),
  body('date').isISO8601().withMessage('Fecha inválida'),
  body('duration').optional().isInt({ min: 5, max: 240 }).withMessage('Duración inválida (5-240 min)'),
  body('type').optional().isIn(['primera_vez','seguimiento','urgencia','interconsulta','procedimiento']),
];

router.use(authenticate, resolveTenant);

router.get('/',          requirePermission('appointments:read'),  asyncHandler(AppointmentsController.list));
router.get('/slots',     requirePermission('appointments:read'),  asyncHandler(AppointmentsController.getSlots));
router.get('/dashboard', requirePermission('appointments:read'),  asyncHandler(AppointmentsController.dashboard));
router.get('/:id', param('id').isUUID(), requirePermission('appointments:read'), validate, asyncHandler(AppointmentsController.getById));

router.post('/', createValidators, requirePermission('appointments:write'), validate,
  auditLog('appointment:create'), asyncHandler(AppointmentsController.create));

router.patch('/:id/status', param('id').isUUID(),
  body('status').notEmpty(), requirePermission('appointments:write'), validate,
  auditLog('appointment:status'), asyncHandler(AppointmentsController.updateStatus));

module.exports = router;
