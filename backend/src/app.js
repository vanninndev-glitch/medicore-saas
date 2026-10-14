/**
 * MediCore SaaS — app.js
 * Configuración completa de Express: middlewares, rutas, error handler
 */

'use strict';

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const compression= require('compression');
const path       = require('path');

const { server: srvCfg, cors: corsCfg, isProd } = require('./config/env');
const logger     = require('./utils/logger');
const Response   = require('./utils/response');
const {
  generalLimiter, sanitizeInputs, detectSQLi, httpLogger,
} = require('./middlewares/index');

/* ── Importar rutas de módulos ── */
const authRoutes         = require('./modules/auth/auth.routes');
const patientsRoutes     = require('./modules/patients/patients.routes');
const recordsRoutes      = require('./modules/records/records.routes');
const appointmentsRoutes = require('./modules/appointments/appointments.routes');
const documentsRoutes    = require('./modules/documents/documents.routes');
const disabilitiesRoutes = require('./modules/disabilities/disabilities.routes');
const labRoutes          = require('./modules/lab/lab.routes');
const pharmacyRoutes     = require('./modules/pharmacy/pharmacy.routes');
const billingRoutes      = require('./modules/billing/billing.routes');
const admissionsRoutes   = require('./modules/admissions/admissions.routes');
const reportsRoutes      = require('./modules/reports/reports.routes');
const notificationsRoutes= require('./modules/notifications/notifications.routes');
const hospitalsRoutes    = require('./modules/hospitals/hospitals.routes');
const superadminRoutes   = require('./modules/superadmin/superadmin.routes');
const searchRoutes       = require('./modules/search/search.routes');

const app = express();

/* ══════════════════════════════════════════
   MIDDLEWARES GLOBALES
══════════════════════════════════════════ */

/* ── Helmet: cabeceras HTTP seguras ── */
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:        ["'self'", 'fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      connectSrc:     ["'self'", 'ws:', 'wss:'],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

/* ── CORS ── */
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, mobile apps)
    if (!origin) return callback(null, true);
    // Permitir siempre cualquier puerto de localhost/127.0.0.1
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (corsCfg.origins.includes(origin) || corsCfg.origins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origen no permitido — ${origin}`));
    }
  },
  credentials:     true,
  methods:         ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders:  ['Content-Type','Authorization','X-Hospital-ID','X-Request-ID'],
  exposedHeaders:  ['X-Total-Count','X-Page','X-Limit'],
  maxAge:          86400,
}));

/* ── Compresión gzip ── */
app.use(compression());

/* ── Parsers ── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── HTTP Logger (Morgan) ── */
app.use(httpLogger);

/* ── Rate limiting global ── */
app.use(generalLimiter);

/* ── Sanitización anti-XSS e inyecciones ── */
app.use(sanitizeInputs);
app.use(detectSQLi);

/* ── Request ID para trazabilidad ── */
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || require('uuid').v4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

/* ══════════════════════════════════════════
   HEALTH CHECK (sin auth)
══════════════════════════════════════════ */
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    service:   'MediCore SaaS API',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  });
});

/* ══════════════════════════════════════════
   RUTAS DE LA API
══════════════════════════════════════════ */
const API = srvCfg.apiPrefix;

app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/patients`,      patientsRoutes);
app.use(`${API}/records`,       recordsRoutes);
app.use(`${API}/appointments`,  appointmentsRoutes);
app.use(`${API}/documents`,     documentsRoutes);
app.use(`${API}/disabilities`,  disabilitiesRoutes);
app.use(`${API}/lab`,           labRoutes);
app.use(`${API}/pharmacy`,      pharmacyRoutes);
app.use(`${API}/billing`,       billingRoutes);
app.use(`${API}/admissions`,    admissionsRoutes);
app.use(`${API}/reports`,       reportsRoutes);
app.use(`${API}/notifications`, notificationsRoutes);
app.use(`${API}/hospitals`,     hospitalsRoutes);
app.use(`${API}/superadmin`,    superadminRoutes);
app.use(`${API}/search`,        searchRoutes);

/* ── Patient portal (alias) ── */
app.use(`${API}/patient-portal`, patientsRoutes);

/* ══════════════════════════════════════════
   SERVIR FRONTEND (producción)
══════════════════════════════════════════ */
{
  const frontendPath = path.join(__dirname, '../../frontend/public');
  app.use(express.static(frontendPath, {
    maxAge: isProd ? '1d' : 0,
    etag:   true,
    index:  'index.html',
  }));

  // SPA fallback — devolver index.html para rutas no encontradas
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith(API)) {
      return res.sendFile(path.join(frontendPath, 'index.html'));
    }
    next();
  });
}

/* ══════════════════════════════════════════
   MANEJO DE ERRORES GLOBAL
══════════════════════════════════════════ */

/* 404 — Ruta no encontrada */
app.use((req, res) => {
  Response.notFound(res, `Ruta no encontrada: ${req.method} ${req.path}`);
});

/* Error handler global */
app.use((err, req, res, next) => {
  /* CORS error */
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ success: false, message: err.message });
  }

  /* Multer errors */
  if (err.code === 'LIMIT_FILE_SIZE') {
    return Response.badRequest(res, `Archivo demasiado grande. Máximo ${require('./config/env').storage.maxSizeMB}MB.`);
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return Response.badRequest(res, 'Máximo 5 archivos por solicitud.');
  }

  /* JWT errors manejados aquí como fallback */
  if (err.name === 'UnauthorizedError') {
    return Response.unauthorized(res);
  }

  /* Errores de base de datos */
  if (err.code === '23505') { // PostgreSQL: unique violation
    return Response.conflict(res, 'El registro ya existe.');
  }

  if (err.code === '23503') { // PostgreSQL: foreign key violation
    return Response.badRequest(res, 'Referencia a registro inexistente.');
  }

  /* Log del error */
  logger.error('[App] Error no manejado:', {
    message:   err.message,
    stack:     err.stack,
    requestId: req.requestId,
    path:      req.path,
    method:    req.method,
    userId:    req.userId,
  });

  /* En producción no revelar detalles internos */
  const message = isProd ? 'Error interno del servidor.' : err.message;
  Response.serverError(res, message);
});

module.exports = app;
