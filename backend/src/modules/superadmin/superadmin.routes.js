/**
 * MediCore SaaS — modules/superadmin/superadmin.routes.js
 * Panel superadmin: tenants, billing SaaS, métricas globales, plugin system
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
  authenticate, requireRole, validate, auditLog,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   SUPERADMIN SERVICE
════════════════════════════════════════ */
const SuperadminService = {

  /* ── Métricas globales del SaaS ── */
  async getGlobalMetrics() {
    const cacheKey = 'superadmin:metrics';
    const cached   = await Redis.get(cacheKey);
    if (cached) return cached;

    const [hospitals, users, patients, activeHospitals, revenue] = await Promise.all([
      DB.queryOne('SELECT COUNT(*) as cnt FROM hospitals'),
      DB.queryOne("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'"),
      DB.queryOne("SELECT COUNT(*) as cnt FROM patients WHERE status != 'deleted'"),
      DB.queryOne("SELECT COUNT(*) as cnt FROM hospitals WHERE status = 'active'"),
      DB.queryOne("SELECT COALESCE(SUM(mrr),0) as mrr FROM hospitals WHERE status = 'active'"),
    ]);

    const metrics = {
      totalHospitals:  parseInt(hospitals?.cnt   || 0),
      activeHospitals: parseInt(activeHospitals?.cnt || 0),
      totalUsers:      parseInt(users?.cnt       || 0),
      totalPatients:   parseInt(patients?.cnt    || 0),
      monthlyRevenue:  parseFloat(revenue?.mrr   || 0),
    };

    await Redis.set(cacheKey, metrics, 300);
    return metrics;
  },

  /* ── Listar hospitales (tenants) ── */
  async listHospitals({ status, plan, search, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [];
    let where    = 'WHERE 1=1';
    let idx      = 1;

    if (status) { where += ` AND h.status = $${idx++}`;          params.push(status); }
    if (plan)   { where += ` AND h.plan = $${idx++}`;            params.push(plan); }
    if (search) { where += ` AND (h.name ILIKE $${idx} OR h.slug ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT h.id, h.name, h.slug, h.city, h.plan, h.status, h.mrr, h.modules, h.created_at,
                (SELECT COUNT(*) FROM users WHERE hospital_id = h.id AND status = 'active') as user_count,
                (SELECT COUNT(*) FROM patients WHERE hospital_id = h.id) as patient_count
         FROM hospitals h ${where}
         ORDER BY h.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM hospitals h ${where}`, params),
    ]);
    return { hospitals: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Crear nuevo hospital (tenant) ── */
  async createHospital(data, superadminId) {
    /* Verificar slug único */
    const slugExists = await DB.queryOne('SELECT id FROM hospitals WHERE slug = $1', [data.slug]);
    if (slugExists) throw Object.assign(new Error(`El slug "${data.slug}" ya está en uso`), { code: 'DUPLICATE' });

    const hospitalId = uuidv4();
    const adminId    = uuidv4();

    await DB.transaction(async (tx) => {
      /* Crear hospital */
      await tx.query(
        `INSERT INTO hospitals (id, name, slug, city, plan, status, mrr, modules, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7::jsonb,$8,NOW(),NOW())`,
        [
          hospitalId, data.name, data.slug, data.city || null,
          data.plan || 'trial',
          data.plan === 'enterprise' ? 18500 : data.plan === 'pro' ? 8900 : 0,
          JSON.stringify(data.modules || {}),
          superadminId,
        ]
      );

      /* Crear admin del hospital */
      if (data.admin?.email) {
        const hash = await bcrypt.hash(data.admin.password || uuidv4().slice(0, 12), 12);
        await tx.query(
          `INSERT INTO users (id, hospital_id, name, email, password_hash, role, status, created_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'hospital_admin','active',$6,NOW(),NOW())`,
          [adminId, hospitalId, data.admin.name || 'Administrador', data.admin.email.toLowerCase(), hash, superadminId]
        );
      }
    });

    logger.info(`[Superadmin] Hospital creado: ${data.name} (${data.slug})`);
    return { id: hospitalId, adminId };
  },

  /* ── Actualizar plan / estado del hospital ── */
  async updateHospital(hospitalId, data) {
    const allowed = { plan: data.plan, status: data.status, mrr: data.mrr };
    const sets    = Object.entries(allowed).filter(([, v]) => v !== undefined).map(([k], i) => `${k} = $${i+2}`);
    const values  = Object.values(allowed).filter(v => v !== undefined);

    if (!sets.length) return null;
    sets.push('updated_at = NOW()');

    await DB.query(`UPDATE hospitals SET ${sets.join(', ')} WHERE id = $1`, [hospitalId, ...values]);

    /* Invalidar caché */
    await Redis.del(`hospital:${hospitalId}:active`);
    await Redis.del(`hospital:config:${hospitalId}`);
    await Redis.del('superadmin:metrics');

    /* Notificar al hospital */
    if (data.status === 'suspended') {
      global.io?.emitToHospital(hospitalId, 'system:maintenance', { message: 'Tu cuenta ha sido suspendida. Contacta soporte.' });
    }

    return { id: hospitalId };
  },

  /* ── Actualizar módulos del hospital ── */
  async updateHospitalModules(hospitalId, modules) {
    await DB.query('UPDATE hospitals SET modules = $2::jsonb, updated_at = NOW() WHERE id = $1', [hospitalId, JSON.stringify(modules)]);
    await Redis.del(`hospital:config:${hospitalId}`);
    global.io?.emitToHospital(hospitalId, 'hospital:modules_updated', { modules });
    return { id: hospitalId, modules };
  },

  /* ── Audit log global ── */
  async getAuditLog({ hospitalId, userId, action, from, to, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [];
    let where    = 'WHERE 1=1';
    let idx      = 1;

    if (hospitalId) { where += ` AND al.hospital_id = $${idx++}`; params.push(hospitalId); }
    if (userId)     { where += ` AND al.user_id = $${idx++}`;     params.push(userId); }
    if (action)     { where += ` AND al.action = $${idx++}`;      params.push(action); }
    if (from)       { where += ` AND al.created_at >= $${idx++}`; params.push(from); }
    if (to)         { where += ` AND al.created_at <= $${idx++}`; params.push(to); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT al.id, al.action, al.resource_type, al.resource_id, al.ip, al.status_code, al.created_at,
                u.name as user_name, u.email as user_email, u.role,
                h.name as hospital_name
         FROM audit_logs al
         LEFT JOIN users     u ON u.id = al.user_id
         LEFT JOIN hospitals h ON h.id = al.hospital_id
         ${where}
         ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM audit_logs al ${where}`, params),
    ]);
    return { logs: rows, total: parseInt(countRes?.total || 0) };
  },
};

/* ════════════════════════════════════════
   RUTAS — Solo superadmin
════════════════════════════════════════ */
router.use(authenticate, requireRole('superadmin'));

/* Métricas globales */
router.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = await SuperadminService.getGlobalMetrics();
  return Response.ok(res, metrics);
}));

/* Hospitales */
router.get('/hospitals', asyncHandler(async (req, res) => {
  const { status, plan, search, page = 1, limit = 30 } = req.query;
  const result = await SuperadminService.listHospitals({ status, plan, search, page: +page, limit: +limit });
  return Response.paginated(res, result.hospitals, result.total, page, limit);
}));

router.get('/hospitals/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const hospital = await DB.queryOne('SELECT * FROM hospitals WHERE id = $1', [req.params.id]);
  if (!hospital) return Response.notFound(res, 'Hospital no encontrado');
  return Response.ok(res, hospital);
}));

router.post('/hospitals',
  [body('name').notEmpty(), body('slug').matches(/^[a-z0-9-]+$/).withMessage('Slug inválido'), body('plan').isIn(['trial','pro','enterprise'])],
  validate, auditLog('superadmin:hospital_create'),
  asyncHandler(async (req, res) => {
    try {
      const result = await SuperadminService.createHospital(req.body, req.userId);
      return Response.created(res, result, `Hospital "${req.body.name}" creado exitosamente`);
    } catch (err) {
      if (err.code === 'DUPLICATE') return Response.conflict(res, err.message);
      throw err;
    }
  })
);

router.put('/hospitals/:id', param('id').isUUID(), validate,
  auditLog('superadmin:hospital_update'), asyncHandler(async (req, res) => {
    const result = await SuperadminService.updateHospital(req.params.id, req.body);
    if (!result) return Response.badRequest(res, 'Sin campos válidos');
    return Response.ok(res, result, 'Hospital actualizado');
  })
);

/* Módulos del hospital */
router.put('/hospitals/:id/modules', param('id').isUUID(), [body('modules').isObject()], validate,
  auditLog('superadmin:modules_update'), asyncHandler(async (req, res) => {
    const result = await SuperadminService.updateHospitalModules(req.params.id, req.body.modules);
    return Response.ok(res, result, 'Módulos actualizados');
  })
);

/* Suspender / activar hospital */
router.patch('/hospitals/:id/status', param('id').isUUID(), [body('status').isIn(['active','suspended','trial'])], validate,
  auditLog('superadmin:hospital_status'), asyncHandler(async (req, res) => {
    await SuperadminService.updateHospital(req.params.id, { status: req.body.status });
    return Response.ok(res, null, `Estado del hospital actualizado a: ${req.body.status}`);
  })
);

/* Audit log global */
router.get('/audit-log', asyncHandler(async (req, res) => {
  const { hospitalId, userId, action, from, to, page = 1, limit = 50 } = req.query;
  const result = await SuperadminService.getAuditLog({ hospitalId, userId, action, from, to, page: +page, limit: +limit });
  return Response.paginated(res, result.logs, result.total, page, limit);
}));

/* Todos los usuarios del SaaS */
router.get('/users', asyncHandler(async (req, res) => {
  const { search, role, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where    = 'WHERE 1=1';
  let idx      = 1;

  if (search) { where += ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
  if (role)   { where += ` AND u.role = $${idx++}`; params.push(role); }

  const [rows, countRes] = await Promise.all([
    DB.query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, h.name as hospital_name
       FROM users u LEFT JOIN hospitals h ON h.id = u.hospital_id
       ${where} ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    ),
    DB.queryOne(`SELECT COUNT(*) as total FROM users u ${where}`, params),
  ]);
  return Response.paginated(res, rows, parseInt(countRes?.total || 0), page, limit);
}));

module.exports = router;
