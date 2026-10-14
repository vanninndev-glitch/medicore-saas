/**
 * MediCore SaaS — modules/hospitals/hospitals.routes.js
 * Configuración del hospital, módulos activos, plugin system, usuarios
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param } = require('express-validator');
const { v4: uuidv4 }  = require('uuid');
const bcrypt          = require('bcryptjs');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const {
  authenticate, requireRole, resolveTenant,
  validate, auditLog,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   HOSPITALS SERVICE
════════════════════════════════════════ */
const HospitalsService = {

  /* ── Obtener configuración del hospital ── */
  async getConfig(hospitalId) {
    const cacheKey = `hospital:config:${hospitalId}`;
    const cached   = await Redis.get(cacheKey);
    if (cached) return cached;

    const hospital = await DB.queryOne(
      'SELECT id, name, slug, city, address, phone, email, logo_url, plan, modules, custom_fields, webhooks, status, created_at FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    if (!hospital) return null;

    /* Contar usuarios y pacientes */
    const [userCount, patientCount] = await Promise.all([
      DB.queryOne('SELECT COUNT(*) as cnt FROM users WHERE hospital_id = $1 AND status = $2', [hospitalId, 'active']),
      DB.queryOne('SELECT COUNT(*) as cnt FROM patients WHERE hospital_id = $1 AND status != $2', [hospitalId, 'deleted']),
    ]);

    hospital.userCount    = parseInt(userCount?.cnt    || 0);
    hospital.patientCount = parseInt(patientCount?.cnt || 0);

    await Redis.set(cacheKey, hospital, 300);
    return hospital;
  },

  /* ── Actualizar configuración ── */
  async updateConfig(hospitalId, data) {
    const allowed = ['name','city','address','phone','email'];
    const sets    = [];
    const values  = [hospitalId];
    let idx       = 2;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (!sets.length) return null;
    sets.push('updated_at = NOW()');

    await DB.query(`UPDATE hospitals SET ${sets.join(', ')} WHERE id = $1`, values);
    await Redis.del(`hospital:config:${hospitalId}`);
    return { id: hospitalId };
  },

  /* ── Actualizar módulos activos (plugin system) ── */
  async updateModules(hospitalId, modules) {
    await DB.query(
      'UPDATE hospitals SET modules = $2::jsonb, updated_at = NOW() WHERE id = $1',
      [hospitalId, JSON.stringify(modules)]
    );
    // Invalidar caché de tenants y config
    await Redis.del(`hospital:config:${hospitalId}`);
    await Redis.del(`hospital:${hospitalId}:active`);
    return { id: hospitalId, modules };
  },

  /* ── Listar usuarios del hospital ── */
  async listUsers({ hospitalId, role, status, search, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId];
    let where    = 'WHERE hospital_id = $1';
    let idx      = 2;

    if (role)   { where += ` AND role = $${idx++}`;   params.push(role); }
    if (status) { where += ` AND status = $${idx++}`; params.push(status); }
    if (search) { where += ` AND (name ILIKE $${idx} OR email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT id, name, email, role, specialty, cedula, phone, status, last_login_at, created_at
         FROM users ${where} ORDER BY name LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM users ${where}`, params),
    ]);
    return { users: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Crear usuario en el hospital ── */
  async createUser(data, hospitalId, createdBy) {
    const exists = await DB.queryOne('SELECT id FROM users WHERE email = $1', [data.email?.toLowerCase()]);
    if (exists) throw Object.assign(new Error('El email ya está en uso'), { code: 'DUPLICATE' });

    const hash = await bcrypt.hash(data.password || 'TempPass123!', 12);
    const id   = uuidv4();

    await DB.query(
      `INSERT INTO users (id, hospital_id, name, email, password_hash, role, specialty, cedula, phone, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,NOW(),NOW())`,
      [id, hospitalId, data.name, data.email.toLowerCase(), hash, data.role, data.specialty || null, data.cedula || null, data.phone || null, createdBy]
    );

    logger.info(`[Hospital] Usuario creado: ${data.email} (${data.role}) en hospital ${hospitalId}`);
    return { id, email: data.email, role: data.role };
  },

  /* ── Actualizar usuario ── */
  async updateUser(userId, data, hospitalId) {
    const allowed = ['name','role','specialty','cedula','phone','status'];
    const sets    = [];
    const values  = [userId, hospitalId];
    let idx       = 3;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!sets.length) return null;
    sets.push('updated_at = NOW()');

    await DB.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND hospital_id = $2`, values);
    return { id: userId };
  },

  /* ── Actualizar webhooks ── */
  async updateWebhooks(hospitalId, webhooks) {
    await DB.query('UPDATE hospitals SET webhooks = $2::jsonb, updated_at = NOW() WHERE id = $1', [hospitalId, JSON.stringify(webhooks)]);
    await Redis.del(`hospital:config:${hospitalId}`);
    return { id: hospitalId };
  },
};

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

/* Config del hospital */
router.get('/config', requireRole('superadmin','hospital_admin'), asyncHandler(async (req, res) => {
  const config = await HospitalsService.getConfig(req.hospitalId);
  if (!config) return Response.notFound(res, 'Hospital no encontrado');
  return Response.ok(res, config);
}));

router.put('/config', requireRole('superadmin','hospital_admin'),
  [body('name').optional().notEmpty()], validate,
  auditLog('hospital:config'), asyncHandler(async (req, res) => {
    const result = await HospitalsService.updateConfig(req.hospitalId, req.body);
    if (!result) return Response.badRequest(res, 'No hay campos válidos para actualizar');
    return Response.ok(res, result, 'Configuración actualizada');
  })
);

/* Módulos (plugin system) */
router.put('/modules', requireRole('superadmin','hospital_admin'),
  [body('modules').isObject()], validate,
  auditLog('hospital:modules'), asyncHandler(async (req, res) => {
    const result = await HospitalsService.updateModules(req.hospitalId, req.body.modules);
    global.io?.emitToHospital(req.hospitalId, 'hospital:modules_updated', result);
    return Response.ok(res, result, 'Módulos actualizados correctamente');
  })
);

/* Webhooks */
router.put('/webhooks', requireRole('superadmin','hospital_admin'),
  [body('webhooks').isArray()], validate,
  asyncHandler(async (req, res) => {
    const result = await HospitalsService.updateWebhooks(req.hospitalId, req.body.webhooks);
    return Response.ok(res, result, 'Webhooks actualizados');
  })
);

/* Usuarios */
router.get('/users', requireRole('superadmin','hospital_admin'), asyncHandler(async (req, res) => {
  const { role, status, search, page = 1, limit = 30 } = req.query;
  const result = await HospitalsService.listUsers({
    hospitalId: req.hospitalId, role, status, search,
    page: +page, limit: +limit,
  });
  return Response.paginated(res, result.users, result.total, page, limit);
}));

router.post('/users', requireRole('superadmin','hospital_admin'),
  [body('name').notEmpty(), body('email').isEmail(), body('role').notEmpty()],
  validate, auditLog('hospital:user_create'),
  asyncHandler(async (req, res) => {
    try {
      const result = await HospitalsService.createUser(req.body, req.hospitalId, req.userId);
      return Response.created(res, result, 'Usuario creado correctamente');
    } catch (err) {
      if (err.code === 'DUPLICATE') return Response.conflict(res, err.message);
      throw err;
    }
  })
);

router.put('/users/:id', param('id').isUUID(), requireRole('superadmin','hospital_admin'), validate,
  auditLog('hospital:user_update'), asyncHandler(async (req, res) => {
    const result = await HospitalsService.updateUser(req.params.id, req.body, req.hospitalId);
    if (!result) return Response.notFound(res, 'Usuario no encontrado');
    return Response.ok(res, result, 'Usuario actualizado');
  })
);

router.delete('/users/:id', param('id').isUUID(), requireRole('superadmin','hospital_admin'), validate,
  auditLog('hospital:user_delete'), asyncHandler(async (req, res) => {
    if (req.params.id === req.userId) return Response.badRequest(res, 'No puedes eliminar tu propio usuario');
    await DB.query("UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND hospital_id = $2", [req.params.id, req.hospitalId]);
    return Response.ok(res, null, 'Usuario desactivado');
  })
);

module.exports = router;
