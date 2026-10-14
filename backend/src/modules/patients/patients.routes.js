/**
 * MediCore SaaS — modules/patients/patients.routes.js
 * CRUD completo de pacientes con multi-tenant, búsqueda, filtros y MPI
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, query, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const {
  authenticate, requirePermission, resolveTenant,
  validate, auditLog, upload,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   PATIENTS SERVICE
════════════════════════════════════════ */
const PatientsService = {

  /* ── Listar pacientes con filtros y paginación ── */
  async list({ hospitalId, search, status, area, insurance, page, limit, sortBy, sortDir }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId];
    let whereClause = 'WHERE p.hospital_id = $1';
    let idx = 2;

    if (search) {
      whereClause += ` AND (
        p.name ILIKE $${idx} OR
        p.expedient ILIKE $${idx} OR
        p.curp ILIKE $${idx} OR
        p.phone LIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }

    if (status) {
      whereClause += ` AND p.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (area) {
      whereClause += ` AND p.current_area = $${idx}`;
      params.push(area);
      idx++;
    }

    if (insurance) {
      whereClause += ` AND p.insurance_type = $${idx}`;
      params.push(insurance);
      idx++;
    }

    const validSorts = ['name','expedient','created_at','last_visit_at','dob'];
    const col  = validSorts.includes(sortBy) ? sortBy : 'created_at';
    const dir  = sortDir === 'asc' ? 'ASC' : 'DESC';

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT p.id, p.expedient, p.name, p.dob, p.gender, p.blood_type,
                p.phone, p.email, p.insurance_type, p.current_area,
                p.status, p.avatar_color, p.last_visit_at,
                p.has_alerts,
                EXTRACT(YEAR FROM AGE(p.dob)) AS age
         FROM patients p
         ${whereClause}
         ORDER BY p.${col} ${dir}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(
        `SELECT COUNT(*) as total FROM patients p ${whereClause}`,
        params
      ),
    ]);

    return { patients: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Obtener paciente por ID ── */
  async getById(id, hospitalId) {
    const cacheKey = `patient:${id}`;
    const cached   = await Redis.get(cacheKey);
    if (cached) return cached;

    const patient = await DB.queryOne(
      `SELECT p.*,
              EXTRACT(YEAR FROM AGE(p.dob)) AS age,
              ec.name as emergency_contact_name,
              ec.relation as emergency_contact_relation,
              ec.phone as emergency_contact_phone,
              ec.email as emergency_contact_email
       FROM patients p
       LEFT JOIN emergency_contacts ec ON ec.patient_id = p.id AND ec.is_primary = true
       WHERE p.id = $1 AND p.hospital_id = $2`,
      [id, hospitalId]
    );

    if (!patient) return null;

    /* Obtener alertas */
    patient.alerts = await DB.query(
      'SELECT type, label FROM patient_alerts WHERE patient_id = $1 ORDER BY created_at DESC',
      [id]
    );

    /* Obtener antecedentes */
    patient.antecedents = await DB.queryOne(
      'SELECT * FROM patient_antecedents WHERE patient_id = $1',
      [id]
    );

    await Redis.set(cacheKey, patient, 300); // 5 min cache
    return patient;
  },

  /* ── Crear paciente ── */
  async create(data, hospitalId, createdBy) {
    /* Verificar duplicado por CURP en el mismo hospital */
    if (data.curp) {
      const dup = await DB.queryOne(
        'SELECT id FROM patients WHERE curp = $1 AND hospital_id = $2',
        [data.curp.toUpperCase(), hospitalId]
      );
      if (dup) throw Object.assign(new Error('CURP ya registrada en este hospital'), { code: 'DUPLICATE' });
    }

    /* Generar número de expediente */
    const year        = new Date().getFullYear();
    const countResult = await DB.queryOne(
      'SELECT COUNT(*) as cnt FROM patients WHERE hospital_id = $1 AND EXTRACT(YEAR FROM created_at) = $2',
      [hospitalId, year]
    );
    const seq      = parseInt(countResult?.cnt || 0) + 1;
    const expedient= `EXP-${year}-${String(seq).padStart(4, '0')}`;

    const id = uuidv4();

    return await DB.transaction(async (tx) => {
      /* Insertar paciente */
      await tx.query(
        `INSERT INTO patients (
          id, hospital_id, expedient, name, dob, gender, blood_type,
          curp, rfc, phone, phone2, email, address,
          insurance_type, insurance_num, insurance_clinic, insurance_expiry,
          private_insurance, policy_num, coverage,
          education, occupation, civil_status, religion, nationality, state,
          weight, height, smoking, alcohol, exercise, medications, notes,
          status, avatar_color, created_by, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,
          'active',$34,$35,NOW(),NOW()
        )`,
        [
          id, hospitalId, expedient,
          data.name?.trim(), data.dob, data.gender, data.bloodType,
          data.curp?.toUpperCase() || null, data.rfc?.toUpperCase() || null,
          data.phone, data.phone2 || null, data.email || null, data.address || null,
          data.insurance, data.insuranceNum || null, data.clinic || null, data.insuranceExpiry || null,
          data.privateInsurance || null, data.policyNum || null, data.coverage || null,
          data.education || null, data.occupation || null, data.civilStatus || null,
          data.religion || null, data.nationality || 'Mexicana', data.state || null,
          data.weight || null, data.height || null, data.smoking || null,
          data.alcohol || null, data.exercise || null, data.medications || null, data.notes || null,
          data.avatarColor || '#1a6fff', createdBy,
        ]
      );

      /* Contacto de emergencia */
      if (data.emergency?.name) {
        await tx.query(
          `INSERT INTO emergency_contacts (id, patient_id, name, relation, phone, phone2, email, address, is_primary, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW())`,
          [uuidv4(), id, data.emergency.name, data.emergency.relation,
           data.emergency.phone, data.emergency.phone2 || null,
           data.emergency.email || null, data.emergency.address || null]
        );
      }

      /* Alertas (alergias + enfermedades crónicas) */
      const alerts = [];
      if (data.allergies?.length) {
        data.allergies.forEach(a => alerts.push({ type: 'allergy', label: `Alergia: ${a}` }));
      }
      if (data.chronicDiseases?.length) {
        data.chronicDiseases.forEach(d => alerts.push({ type: 'condition', label: d }));
      }
      if (alerts.length) {
        for (const alert of alerts) {
          await tx.query(
            'INSERT INTO patient_alerts (id, patient_id, type, label, created_at) VALUES ($1,$2,$3,$4,NOW())',
            [uuidv4(), id, alert.type, alert.label]
          );
        }
        await tx.query('UPDATE patients SET has_alerts = true WHERE id = $1', [id]);
      }

      /* Antecedentes */
      if (data.antecedents) {
        await tx.query(
          `INSERT INTO patient_antecedents (id, patient_id, hereditary, personal, surgical, allergic, trauma, gynecological, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [uuidv4(), id,
           data.antecedents.hereditary || null, data.antecedents.personal || null,
           data.antecedents.surgical   || null, data.antecedents.allergic  || null,
           data.antecedents.trauma     || null,
           data.gynecological ? JSON.stringify(data.gynecological) : null]
        );
      }

      return { id, expedient };
    });
  },

  /* ── Actualizar paciente ── */
  async update(id, data, hospitalId) {
    const allowed = [
      'name','phone','phone2','email','address','insurance_type','insurance_num',
      'weight','height','smoking','alcohol','exercise','medications','notes',
      'occupation','civil_status','education','status',
    ];

    const sets   = [];
    const values = [id, hospitalId];
    let idx = 3;

    for (const key of allowed) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (data[camel] !== undefined || data[key] !== undefined) {
        const val = data[camel] ?? data[key];
        sets.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    if (!sets.length) return null;

    sets.push(`updated_at = NOW()`);

    const updated = await DB.queryOne(
      `UPDATE patients SET ${sets.join(', ')} WHERE id = $1 AND hospital_id = $2 RETURNING id, expedient, name`,
      values
    );

    await Redis.del(`patient:${id}`);
    return updated;
  },

  /* ── Búsqueda rápida (MPI — Índice Maestro de Pacientes) ── */
  async search(query, hospitalId, limit = 10) {
    if (!query || query.length < 2) return [];

    return DB.query(
      `SELECT id, expedient, name, dob, gender, blood_type, phone,
              EXTRACT(YEAR FROM AGE(dob)) AS age
       FROM patients
       WHERE hospital_id = $1
         AND (name ILIKE $2 OR expedient ILIKE $2 OR curp ILIKE $2 OR phone LIKE $2)
         AND status = 'active'
       ORDER BY name ASC
       LIMIT $3`,
      [hospitalId, `%${query}%`, limit]
    );
  },

  /* ── Obtener historial de citas del paciente ── */
  async getAppointments(patientId, hospitalId) {
    return DB.query(
      `SELECT a.id, a.date, a.type, a.status, a.specialty, a.duration,
              u.name as doctor_name
       FROM appointments a
       JOIN users u ON u.id = a.doctor_id
       WHERE a.patient_id = $1 AND a.hospital_id = $2
       ORDER BY a.date DESC
       LIMIT 20`,
      [patientId, hospitalId]
    );
  },

  /* ── Obtener documentos del paciente ── */
  async getDocuments(patientId, hospitalId) {
    return DB.query(
      `SELECT id, name, type, size, status, created_at
       FROM documents
       WHERE patient_id = $1 AND hospital_id = $2
       ORDER BY created_at DESC`,
      [patientId, hospitalId]
    );
  },

  /* ── Traslado de área ── */
  async transfer(patientId, hospitalId, fromArea, toArea, reason, userId) {
    await DB.transaction(async (tx) => {
      await tx.query(
        'UPDATE patients SET current_area = $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
        [patientId, hospitalId, toArea]
      );
      await tx.query(
        `INSERT INTO patient_transfers (id, patient_id, hospital_id, from_area, to_area, reason, transferred_by, transferred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [uuidv4(), patientId, hospitalId, fromArea, toArea, reason, userId]
      );
    });
    await Redis.del(`patient:${patientId}`);
    return { success: true };
  },
};

/* ════════════════════════════════════════
   PATIENTS CONTROLLER
════════════════════════════════════════ */
const PatientsController = {

  list: async (req, res) => {
    const { search, status, area, insurance, page = 1, limit = 20, sortBy, sortDir } = req.query;
    const result = await PatientsService.list({
      hospitalId: req.hospitalId,
      search, status, area, insurance,
      page: Math.max(parseInt(page), 1),
      limit: Math.min(parseInt(limit), 100),
      sortBy, sortDir,
    });
    return Response.paginated(res, result.patients, result.total, page, limit);
  },

  getById: async (req, res) => {
    const patient = await PatientsService.getById(req.params.id, req.hospitalId);
    if (!patient) return Response.notFound(res, 'Paciente no encontrado');
    return Response.ok(res, patient);
  },

  create: async (req, res) => {
    try {
      const result = await PatientsService.create(req.body, req.hospitalId, req.userId);
      logger.info(`[Patients] Nuevo paciente creado: ${result.expedient} en hospital ${req.hospitalId}`);
      return Response.created(res, result, `Paciente registrado con expediente ${result.expedient}`);
    } catch (err) {
      if (err.code === 'DUPLICATE') return Response.conflict(res, err.message);
      throw err;
    }
  },

  update: async (req, res) => {
    const updated = await PatientsService.update(req.params.id, req.body, req.hospitalId);
    if (!updated) return Response.notFound(res, 'Paciente no encontrado');
    return Response.ok(res, updated, 'Paciente actualizado correctamente');
  },

  search: async (req, res) => {
    const { q, limit } = req.query;
    if (!q) return Response.ok(res, []);
    const results = await PatientsService.search(q, req.hospitalId, parseInt(limit) || 10);
    return Response.ok(res, { patients: results });
  },

  getAppointments: async (req, res) => {
    const appts = await PatientsService.getAppointments(req.params.id, req.hospitalId);
    return Response.ok(res, { appointments: appts });
  },

  getDocuments: async (req, res) => {
    const docs = await PatientsService.getDocuments(req.params.id, req.hospitalId);
    return Response.ok(res, { documents: docs });
  },

  transfer: async (req, res) => {
    const { fromArea, toArea, reason } = req.body;
    if (!toArea) return Response.badRequest(res, 'Área de destino requerida');
    await PatientsService.transfer(req.params.id, req.hospitalId, fromArea, toArea, reason, req.userId);
    return Response.ok(res, null, `Paciente trasladado a ${toArea}`);
  },
};

/* ════════════════════════════════════════
   VALIDADORES
════════════════════════════════════════ */
const createValidators = [
  body('name').notEmpty().isLength({ max: 200 }).withMessage('Nombre requerido (máx 200 caracteres)'),
  body('dob').isISO8601().withMessage('Fecha de nacimiento inválida'),
  body('gender').isIn(['Femenino','Masculino','No binario','Prefiero no decir']).withMessage('Género inválido'),
  body('phone').matches(/^\d{10}$/).withMessage('Teléfono debe tener 10 dígitos'),
  body('bloodType').optional().isIn(['A+','A-','B+','B-','AB+','AB-','O+','O-','Desconocido']),
  body('curp').optional().matches(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/).withMessage('CURP inválida'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido'),
  body('insurance').notEmpty().withMessage('Tipo de seguro médico requerido'),
];

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

router.get('/',                                       requirePermission('patients:read'),  asyncHandler(PatientsController.list));
router.get('/search',                                 requirePermission('patients:read'),  asyncHandler(PatientsController.search));
router.get('/:id',        param('id').isUUID(),       requirePermission('patients:read'),  validate, asyncHandler(PatientsController.getById));
router.get('/:id/appointments', param('id').isUUID(), requirePermission('patients:read'),  validate, asyncHandler(PatientsController.getAppointments));
router.get('/:id/documents',    param('id').isUUID(), requirePermission('patients:read'),  validate, asyncHandler(PatientsController.getDocuments));

router.post('/',          createValidators,            requirePermission('patients:write'), validate,
  auditLog('patient:create'), asyncHandler(PatientsController.create));

router.put('/:id',        param('id').isUUID(),        requirePermission('patients:write'), validate,
  auditLog('patient:update'), asyncHandler(PatientsController.update));

router.post('/:id/transfer', param('id').isUUID(),     requirePermission('patients:write'), validate,
  auditLog('patient:transfer'), asyncHandler(PatientsController.transfer));

module.exports = router;
