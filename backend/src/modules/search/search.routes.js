/**
 * MediCore SaaS — modules/search/search.routes.js
 * Búsqueda global: pacientes, citas, documentos, médicos, todo desde un endpoint
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const { authenticate, resolveTenant } = require('../../middlewares/index');

router.use(authenticate, resolveTenant);

/* ── Búsqueda global ── */
router.get('/', asyncHandler(async (req, res) => {
  const { q, limit = 5 } = req.query;

  if (!q || q.trim().length < 2) {
    return Response.ok(res, { patients: [], appointments: [], documents: [] });
  }

  const query      = `%${q.trim()}%`;
  const hospitalId = req.hospitalId;
  const lim        = Math.min(parseInt(limit), 10);

  /* Buscar en paralelo en múltiples entidades */
  const [patients, appointments, documents, doctors] = await Promise.all([

    /* Pacientes */
    DB.query(
      `SELECT id, expedient, name, dob, gender, phone,
              EXTRACT(YEAR FROM AGE(dob)) as age
       FROM patients
       WHERE hospital_id = $1 AND status = 'active'
         AND (name ILIKE $2 OR expedient ILIKE $2 OR curp ILIKE $2 OR phone LIKE $2)
       ORDER BY name LIMIT $3`,
      [hospitalId, query, lim]
    ),

    /* Citas */
    DB.query(
      `SELECT a.id, a.date, a.status, a.specialty,
              p.name as patient_name, u.name as doctor_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users    u ON u.id = a.doctor_id
       WHERE a.hospital_id = $1
         AND (p.name ILIKE $2 OR a.specialty ILIKE $2)
         AND a.date >= NOW() - INTERVAL '7 days'
       ORDER BY a.date DESC LIMIT $3`,
      [hospitalId, query, lim]
    ),

    /* Documentos */
    DB.query(
      `SELECT d.id, d.name, d.type, d.created_at, p.name as patient_name
       FROM documents d LEFT JOIN patients p ON p.id = d.patient_id
       WHERE d.hospital_id = $1 AND d.status = 'active'
         AND (d.name ILIKE $2 OR p.name ILIKE $2)
       ORDER BY d.created_at DESC LIMIT $3`,
      [hospitalId, query, lim]
    ),

    /* Médicos */
    DB.query(
      `SELECT id, name, specialty, email
       FROM users
       WHERE hospital_id = $1 AND status = 'active'
         AND role IN ('doctor','medical_director')
         AND (name ILIKE $2 OR specialty ILIKE $2 OR email ILIKE $2)
       ORDER BY name LIMIT $3`,
      [hospitalId, query, lim]
    ),
  ]);

  return Response.ok(res, { patients, appointments, documents, doctors });
}));

/* ── Búsqueda de pacientes específica ── */
router.get('/patients', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q || q.trim().length < 2) return Response.ok(res, { patients: [] });

  const patients = await DB.query(
    `SELECT id, expedient, name, dob, gender, blood_type, phone, email,
            insurance_type, current_area, status,
            EXTRACT(YEAR FROM AGE(dob)) as age
     FROM patients
     WHERE hospital_id = $1 AND status = 'active'
       AND (name ILIKE $2 OR expedient ILIKE $2 OR curp ILIKE $2 OR phone LIKE $2)
     ORDER BY name LIMIT $3`,
    [req.hospitalId, `%${q.trim()}%`, Math.min(parseInt(limit), 20)]
  );

  return Response.ok(res, { patients });
}));

/* ── Búsqueda de médicos disponibles ── */
router.get('/doctors', asyncHandler(async (req, res) => {
  const { q, specialty, limit = 10 } = req.query;
  const params = [req.hospitalId, 'active'];
  let where    = "WHERE u.hospital_id = $1 AND u.status = $2 AND u.role IN ('doctor','medical_director')";
  let idx      = 3;

  if (specialty) { where += ` AND u.specialty = $${idx++}`; params.push(specialty); }
  if (q)         { where += ` AND (u.name ILIKE $${idx} OR u.specialty ILIKE $${idx})`; params.push(`%${q.trim()}%`); idx++; }

  const doctors = await DB.query(
    `SELECT u.id, u.name, u.specialty, u.cedula, u.email,
            ds.start_time, ds.end_time
     FROM users u
     LEFT JOIN doctor_schedules ds ON ds.doctor_id = u.id AND ds.day_of_week = EXTRACT(DOW FROM NOW()) AND ds.is_active = true
     ${where}
     ORDER BY u.name LIMIT $${idx}`,
    [...params, Math.min(parseInt(limit), 20)]
  );

  return Response.ok(res, { doctors });
}));

module.exports = router;
