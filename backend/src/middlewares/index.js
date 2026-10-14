/**
 * MediCore SaaS — middlewares/index.js
 * Todos los middlewares de seguridad en un solo módulo:
 * JWT auth, RBAC, tenant resolver, rate limit, sanitización, audit log
 */

'use strict';

const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const xss        = require('xss');
const sanitize   = require('sanitize-html');
const { validationResult } = require('express-validator');

const { jwt: jwtCfg, rateLimit: rlCfg } = require('../config/env');
const Response   = require('../utils/response');
const logger     = require('../utils/logger');
const Redis      = require('../config/redis');
const DB         = require('../config/database');

/* ══════════════════════════════════════════
   1. AUTENTICACIÓN JWT
══════════════════════════════════════════ */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.unauthorized(res);
    }

    const token = authHeader.split(' ')[1];

    // Verificar token en blacklist de Redis (logout)
    const isBlacklisted = await Redis.exists(`blacklist:${token}`);
    if (isBlacklisted) return Response.unauthorized(res, 'Token revocado. Inicia sesión nuevamente.');

    // Verificar firma y expiración
    let payload;
    try {
      payload = jwt.verify(token, jwtCfg.secret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'Sesión expirada. Inicia sesión nuevamente.'
        : 'Token inválido.';
      return Response.unauthorized(res, msg);
    }

    // Verificar que el usuario aún existe y está activo
    const user = await DB.queryOne(
      'SELECT id, name, email, role, hospital_id, status FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!user || user.status !== 'active') {
      return Response.unauthorized(res, 'Usuario no encontrado o inactivo.');
    }

    // Agregar usuario y hospital al request
    req.user      = user;
    req.userId    = user.id;
    req.userRole  = user.role;
    req.hospitalId = req.headers['x-hospital-id'] || user.hospital_id;

    next();
  } catch (err) {
    logger.error('[Auth middleware]', err);
    return Response.serverError(res);
  }
};

/* ── Middleware de auth opcional (no falla si no hay token) ── */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  return authenticate(req, res, next);
};

/* ══════════════════════════════════════════
   2. RBAC — Control de acceso por rol
══════════════════════════════════════════ */

/* Jerarquía de roles (mayor número = más permisos) */
const ROLE_HIERARCHY = {
  patient:       1,
  receptionist:  2,
  lab_technician:2,
  pharmacist:    2,
  nurse:         3,
  patient_admin: 3,
  records_admin: 3,
  doctor:        4,
  medical_director: 5,
  hospital_admin:6,
  superadmin:    10,
};

/* Matriz de permisos por módulo */
const PERMISSIONS = {
  /* Pacientes */
  'patients:read':         ['superadmin','hospital_admin','medical_director','doctor','nurse','receptionist','records_admin','patient_admin'],
  'patients:write':        ['superadmin','hospital_admin','medical_director','doctor','receptionist','patient_admin'],
  'patients:delete':       ['superadmin','hospital_admin','patient_admin'],

  /* Historial clínico */
  'records:read':          ['superadmin','hospital_admin','medical_director','doctor','nurse','records_admin'],
  'records:write':         ['superadmin','medical_director','doctor'],
  'records:delete':        ['superadmin','medical_director','records_admin'],

  /* Citas */
  'appointments:read':     ['superadmin','hospital_admin','medical_director','doctor','nurse','receptionist','patient'],
  'appointments:write':    ['superadmin','hospital_admin','doctor','receptionist','patient'],
  'appointments:delete':   ['superadmin','hospital_admin','doctor','receptionist'],

  /* Documentos */
  'documents:read':        ['superadmin','hospital_admin','medical_director','doctor','nurse','records_admin','patient'],
  'documents:write':       ['superadmin','hospital_admin','doctor','nurse','records_admin'],
  'documents:delete':      ['superadmin','hospital_admin','records_admin'],

  /* Incapacidades */
  'disabilities:read':     ['superadmin','hospital_admin','medical_director','doctor','records_admin','patient'],
  'disabilities:write':    ['superadmin','medical_director','doctor'],

  /* Laboratorio */
  'lab:read':              ['superadmin','hospital_admin','medical_director','doctor','nurse','lab_technician','patient'],
  'lab:write':             ['superadmin','medical_director','doctor','lab_technician'],

  /* Farmacia */
  'pharmacy:read':         ['superadmin','hospital_admin','doctor','nurse','pharmacist'],
  'pharmacy:write':        ['superadmin','pharmacist','doctor'],

  /* Facturación */
  'billing:read':          ['superadmin','hospital_admin','receptionist'],
  'billing:write':         ['superadmin','hospital_admin','receptionist'],

  /* Reportes */
  'reports:read':          ['superadmin','hospital_admin','medical_director','doctor'],

  /* Configuración del hospital */
  'hospital:config':       ['superadmin','hospital_admin'],

  /* Superadmin exclusivo */
  'superadmin:all':        ['superadmin'],
};

/* Middleware: requiere roles específicos */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return Response.unauthorized(res);
  if (!roles.includes(req.userRole)) {
    logger.warn(`[RBAC] Acceso denegado: ${req.userRole} intentó acceder a ruta restringida para ${roles.join(',')}`);
    return Response.forbidden(res);
  }
  next();
};

/* Middleware: requiere permiso específico */
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return Response.unauthorized(res);

  const allowedRoles = PERMISSIONS[permission] || [];
  if (!allowedRoles.includes(req.userRole)) {
    logger.warn(`[RBAC] Sin permiso: ${req.userRole} para "${permission}"`);
    return Response.forbidden(res, `No tienes permiso para: ${permission}`);
  }
  next();
};

/* Middleware: verificar que pertenece al mismo hospital ── */
const requireSameHospital = (req, res, next) => {
  if (!req.user) return Response.unauthorized(res);
  if (req.userRole === 'superadmin') return next(); // superadmin puede todo

  const reqHospitalId = req.params.hospitalId || req.body?.hospitalId;
  if (reqHospitalId && reqHospitalId !== req.hospitalId) {
    return Response.forbidden(res, 'No tienes acceso a este hospital.');
  }
  next();
};

/* ══════════════════════════════════════════
   3. TENANT RESOLVER
══════════════════════════════════════════ */
const resolveTenant = async (req, res, next) => {
  // Superadmin no necesita hospital_id para ciertas rutas
  if (req.userRole === 'superadmin' && !req.headers['x-hospital-id']) {
    req.hospitalId = null;
    return next();
  }

  const hospitalId = req.headers['x-hospital-id'] || req.user?.hospital_id;
  if (!hospitalId) {
    return Response.badRequest(res, 'Hospital no especificado (X-Hospital-ID header requerido).');
  }

  // Verificar que el hospital existe y está activo (cache en Redis)
  const cacheKey = `hospital:${hospitalId}:active`;
  let isActive   = await Redis.get(cacheKey);

  if (isActive === null) {
    const hospital = await DB.queryOne(
      'SELECT id, status, modules FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    isActive = hospital?.status === 'active';
    await Redis.set(cacheKey, isActive, 300); // 5 min cache
  }

  if (!isActive) {
    return Response.forbidden(res, 'Hospital inactivo o suspendido.');
  }

  req.hospitalId = hospitalId;
  next();
};

/* ══════════════════════════════════════════
   4. RATE LIMITING
══════════════════════════════════════════ */

/* Rate limit general */
const generalLimiter = rateLimit({
  windowMs: rlCfg.windowMs,
  max:      rlCfg.max,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => Response.tooMany(res),
  skip: (req) => req.userRole === 'superadmin',
});

/* Rate limit para login (más estricto) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      rlCfg.authMax,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => Response.tooMany(res, 'Demasiados intentos de inicio de sesión. Espera 15 minutos.'),
  keyGenerator: (req) => `auth:${req.ip}:${req.body?.email || ''}`,
});

/* Rate limit para subida de archivos */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max:      50,
  handler:  (req, res) => Response.tooMany(res, 'Límite de uploads alcanzado. Espera 1 hora.'),
});

/* ══════════════════════════════════════════
   5. SANITIZACIÓN DE INPUTS
══════════════════════════════════════════ */
const sanitizeInputs = (req, res, next) => {
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string') {
        // Remover XSS y HTML peligroso
        obj[key] = xss(val.trim(), {
          whiteList: {},       // Sin tags HTML permitidos
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script', 'style'],
        });
      } else if (typeof val === 'object' && val !== null) {
        clean(val);
      }
    }
  };

  clean(req.body);
  clean(req.query);
  // Params no se sanitizan agresivamente (UUIDs, IDs)
  next();
};

/* ── Detectar y bloquear patrones de SQLi ── */
const detectSQLi = (req, res, next) => {
  const sqliPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
    /UNION.*SELECT/i,
    /INSERT.*INTO/i,
    /DROP.*TABLE/i,
    /DELETE.*FROM/i,
    /1=1|1='1'|'1'='1'/i,
  ];

  const checkValue = (val) => {
    if (typeof val !== 'string') return false;
    return sqliPatterns.some(p => p.test(val));
  };

  const checkObj = (obj) => {
    if (!obj) return false;
    return Object.values(obj).some(v =>
      typeof v === 'string' ? checkValue(v) : checkObj(v)
    );
  };

  if (checkObj(req.body) || checkObj(req.query)) {
    logger.warn(`[Security] Posible SQLi detectado desde IP: ${req.ip}`, {
      body: req.body, query: req.query, path: req.path,
    });
    return Response.badRequest(res, 'Solicitud bloqueada por seguridad.');
  }

  next();
};

/* ══════════════════════════════════════════
   6. VALIDACIÓN DE express-validator
══════════════════════════════════════════ */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map(e => ({
      field:   e.path,
      message: e.msg,
      value:   e.value,
    }));
    return Response.validationError(res, formatted);
  }
  next();
};

/* ══════════════════════════════════════════
   7. AUDIT LOG
══════════════════════════════════════════ */
const auditLog = (action) => async (req, res, next) => {
  // Se ejecuta antes del response
  res.on('finish', () => {
    if (res.statusCode < 400) {
      DB.query(
        `INSERT INTO audit_logs (user_id, hospital_id, action, resource_type, resource_id, ip, user_agent, status_code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          req.userId    || null,
          req.hospitalId|| null,
          action,
          req.baseUrl,
          req.params?.id || null,
          req.ip,
          req.headers['user-agent'] || '',
          res.statusCode,
        ]
      ).catch(err => logger.error('[Audit]', err));
    }
  });
  next();
};

/* ══════════════════════════════════════════
   8. MULTER — Subida de archivos
══════════════════════════════════════════ */
const multer   = require('multer');
const { storage: storageCfg } = require('../config/env');

const multerStorage = multer.memoryStorage(); // Procesamos en memoria → MinIO/S3

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png',
    'image/dicom', 'application/dicom',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage:   multerStorage,
  fileFilter,
  limits: {
    fileSize: storageCfg.maxSizeMB * 1024 * 1024,
    files:    5,
  },
});

/* ══════════════════════════════════════════
   9. MORGAN HTTP LOGGER
══════════════════════════════════════════ */
const morgan = require('morgan');

const httpLogger = morgan(
  ':method :url :status :response-time ms — :res[content-length] bytes',
  {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health',
  }
);

module.exports = {
  /* Auth */
  authenticate,
  optionalAuth,

  /* RBAC */
  requireRole,
  requirePermission,
  requireSameHospital,
  PERMISSIONS,

  /* Tenant */
  resolveTenant,

  /* Rate limits */
  generalLimiter,
  authLimiter,
  uploadLimiter,

  /* Seguridad */
  sanitizeInputs,
  detectSQLi,

  /* Validación */
  validate,

  /* Audit */
  auditLog,

  /* Upload */
  upload,

  /* HTTP Logger */
  httpLogger,
};
