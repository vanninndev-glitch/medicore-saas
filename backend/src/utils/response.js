/**
 * MediCore SaaS — utils/response.js
 * Respuestas HTTP estandarizadas para toda la API.
 * Garantiza formato consistente: { success, data?, message?, errors?, meta? }
 */

'use strict';

const Response = {

  /* ── 200 OK ── */
  ok(res, data = null, message = 'OK', meta = null) {
    const body = { success: true };
    if (data !== null) body.data = data;
    if (message !== 'OK') body.message = message;
    if (meta) body.meta = meta;
    return res.status(200).json(body);
  },

  /* ── 200 con paginación ── */
  paginated(res, items, total, page, limit) {
    return res.status(200).json({
      success: true,
      data: items,
      meta: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasNext:    page * limit < total,
        hasPrev:    page > 1,
      },
    });
  },

  /* ── 201 Created ── */
  created(res, data = null, message = 'Recurso creado') {
    const body = { success: true, message };
    if (data !== null) body.data = data;
    return res.status(201).json(body);
  },

  /* ── 204 No Content ── */
  noContent(res) {
    return res.status(204).send();
  },

  /* ── 400 Bad Request ── */
  badRequest(res, message = 'Solicitud inválida', errors = null) {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(400).json(body);
  },

  /* ── 401 Unauthorized ── */
  unauthorized(res, message = 'No autenticado. Inicia sesión.') {
    return res.status(401).json({ success: false, message });
  },

  /* ── 403 Forbidden ── */
  forbidden(res, message = 'No tienes permisos para realizar esta acción.') {
    return res.status(403).json({ success: false, message });
  },

  /* ── 404 Not Found ── */
  notFound(res, message = 'Recurso no encontrado.') {
    return res.status(404).json({ success: false, message });
  },

  /* ── 409 Conflict ── */
  conflict(res, message = 'El recurso ya existe.') {
    return res.status(409).json({ success: false, message });
  },

  /* ── 422 Unprocessable Entity (validación) ── */
  validationError(res, errors, message = 'Error de validación') {
    return res.status(422).json({ success: false, message, errors });
  },

  /* ── 429 Too Many Requests ── */
  tooMany(res, message = 'Demasiadas solicitudes. Intenta más tarde.') {
    return res.status(429).json({ success: false, message });
  },

  /* ── 500 Internal Server Error ── */
  serverError(res, message = 'Error interno del servidor.') {
    return res.status(500).json({ success: false, message });
  },
};

module.exports = Response;

/* ── Cache middleware en memoria para endpoints costosos (sin Redis) ── */
const _memCache = new Map();

const cacheMiddleware = (ttlMs = 30000) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = `${req.userId}:${req.hospitalId}:${req.originalUrl}`;
  const cached = _memCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return res.json(cached.data);
  }
  const origJson = res.json.bind(res);
  res.json = (data) => {
    if (res.statusCode === 200) {
      _memCache.set(key, { data, expires: Date.now() + ttlMs });
      if (_memCache.size > 500) {
        // Limpiar entradas expiradas
        for (const [k, v] of _memCache) {
          if (Date.now() > v.expires) _memCache.delete(k);
        }
      }
    }
    return origJson(data);
  };
  next();
};

module.exports.cacheMiddleware = cacheMiddleware;
