/**
 * MediCore SaaS — modules/auth/auth.routes.js + controller + service
 * Autenticación: login, refresh, logout, cambio de contraseña, perfil
 */

'use strict';

/* ════════════════════════════════════════
   AUTH SERVICE
════════════════════════════════════════ */
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const DB      = require('../../config/database');
const Redis   = require('../../config/redis');
const logger  = require('../../utils/logger');
const { jwt: jwtCfg } = require('../../config/env');

const AuthService = {

  /* ── Generar tokens ── */
  generateTokens(userId, role, hospitalId) {
    const payload = { sub: userId, role, hospitalId };

    const accessToken = jwt.sign(payload, jwtCfg.secret, {
      expiresIn: jwtCfg.expiresIn,
      issuer:    'medicore.saas',
      audience:  'medicore.client',
    });

    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh' },
      jwtCfg.refreshSecret,
      { expiresIn: jwtCfg.refreshExpires }
    );

    return { accessToken, refreshToken };
  },

  /* ── Login ── */
  async login(email, password, ip) {
    const user = await DB.queryOne(
      `SELECT u.*, h.name as hospital_name, h.slug as hospital_slug
       FROM users u
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       WHERE u.email = $1 AND u.status = 'active'`,
      [email.toLowerCase().trim()]
    );

    if (!user) {
      // Evitar timing attacks — comparar igualmente si no existe
      await bcrypt.compare(password, '$2a$12$invalidhashpadding000000000000000000000000000000000000');
      logger.warn(`[Auth] Login fallido: usuario no encontrado — ${email} desde ${ip}`);
      return { success: false, message: 'Credenciales incorrectas.' };
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logger.warn(`[Auth] Login fallido: contraseña incorrecta — ${email} desde ${ip}`);

      // Incrementar intentos fallidos
      await DB.query(
        'UPDATE users SET failed_attempts = failed_attempts + 1, last_failed_at = NOW() WHERE id = $1',
        [user.id]
      );

      // Bloquear tras 5 intentos
      if (user.failed_attempts >= 4) {
        await DB.query(
          "UPDATE users SET status = 'locked' WHERE id = $1",
          [user.id]
        );
        return { success: false, message: 'Cuenta bloqueada por múltiples intentos fallidos. Contacta al administrador.' };
      }

      return { success: false, message: 'Credenciales incorrectas.' };
    }

    // Verificar hospital activo
    if (user.role !== 'superadmin' && user.hospital_id) {
      const hospital = await DB.queryOne(
        "SELECT status FROM hospitals WHERE id = $1",
        [user.hospital_id]
      );
      if (!hospital || hospital.status !== 'active') {
        return { success: false, message: 'El hospital asociado está inactivo.' };
      }
    }

    // Reset intentos fallidos
    await DB.query(
      'UPDATE users SET failed_attempts = 0, last_login_at = NOW(), last_login_ip = $2 WHERE id = $1',
      [user.id, ip]
    );

    const tokens = this.generateTokens(user.id, user.role, user.hospital_id);

    // Guardar refresh token en Redis
    await Redis.set(
      `refresh:${user.id}:${tokens.refreshToken.slice(-20)}`,
      { userId: user.id, token: tokens.refreshToken },
      7 * 24 * 3600
    );

    logger.info(`[Auth] Login exitoso: ${user.email} (${user.role}) desde ${ip}`);

    return {
      success: true,
      data: {
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id:           user.id,
          name:         user.name,
          email:        user.email,
          role:         user.role,
          hospitalId:   user.hospital_id,
          hospitalName: user.hospital_name,
          hospitalSlug: user.hospital_slug,
          permissions:  user.permissions || [],
          avatar:       user.avatar_url,
        },
      },
    };
  },

  /* ── Refresh token ── */
  async refresh(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, jwtCfg.refreshSecret);
    } catch {
      return { success: false, message: 'Refresh token inválido o expirado.' };
    }

    if (payload.type !== 'refresh') {
      return { success: false, message: 'Token inválido.' };
    }

    // Verificar en Redis
    const key = `refresh:${payload.sub}:${refreshToken.slice(-20)}`;
    const stored = await Redis.get(key);
    if (!stored) {
      return { success: false, message: 'Sesión expirada. Inicia sesión nuevamente.' };
    }

    const user = await DB.queryOne(
      "SELECT id, role, hospital_id, status FROM users WHERE id = $1",
      [payload.sub]
    );

    if (!user || user.status !== 'active') {
      return { success: false, message: 'Usuario inactivo.' };
    }

    // Rotar refresh token
    await Redis.del(key);
    const tokens = this.generateTokens(user.id, user.role, user.hospital_id);
    await Redis.set(
      `refresh:${user.id}:${tokens.refreshToken.slice(-20)}`,
      { userId: user.id },
      7 * 24 * 3600
    );

    return { success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } };
  },

  /* ── Logout ── */
  async logout(accessToken, refreshToken, userId) {
    // Blacklist del access token hasta que expire
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await Redis.setRaw(`blacklist:${accessToken}`, '1', ttl);
      }
    } catch { /* continúa */ }

    // Eliminar refresh token de Redis
    if (refreshToken && userId) {
      const key = `refresh:${userId}:${refreshToken.slice(-20)}`;
      await Redis.del(key);
    }

    logger.info(`[Auth] Logout: userId ${userId}`);
    return { success: true };
  },

  /* ── Cambiar contraseña ── */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await DB.queryOne(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!user) return { success: false, message: 'Usuario no encontrado.' };

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return { success: false, message: 'Contraseña actual incorrecta.' };

    if (newPassword.length < 8) {
      return { success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres.' };
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await DB.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, userId]
    );

    // Invalidar todas las sesiones activas
    const keys = await Redis.keys(`refresh:${userId}:*`);
    if (keys.length) await Promise.all(keys.map(k => Redis.del(k)));

    logger.info(`[Auth] Contraseña cambiada: userId ${userId}`);
    return { success: true, message: 'Contraseña actualizada correctamente.' };
  },
};

/* ════════════════════════════════════════
   AUTH CONTROLLER
════════════════════════════════════════ */
const Response = require('../../utils/response');
const { body }  = require('express-validator');
const { validate, authLimiter } = require('../../middlewares/index');

const AuthController = {

  login: async (req, res) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password, req.ip);

    if (!result.success) {
      return Response.unauthorized(res, result.message);
    }
    return Response.ok(res, result.data, 'Sesión iniciada correctamente');
  },

  refresh: async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return Response.badRequest(res, 'Refresh token requerido.');

    const result = await AuthService.refresh(refreshToken);
    if (!result.success) return Response.unauthorized(res, result.message);
    return Response.ok(res, result.data);
  },

  logout: async (req, res) => {
    const { refreshToken } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    await AuthService.logout(token, refreshToken, req.userId);
    return Response.ok(res, null, 'Sesión cerrada correctamente');
  },

  me: async (req, res) => {
    const user = await DB.queryOne(
      `SELECT u.id, u.name, u.email, u.role, u.hospital_id, u.avatar_url, u.created_at,
              h.name as hospital_name, h.slug as hospital_slug, h.modules as hospital_modules
       FROM users u
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (!user) return Response.notFound(res, 'Usuario no encontrado');
    delete user.password_hash;
    return Response.ok(res, user);
  },

  changePassword: async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(req.userId, currentPassword, newPassword);
    if (!result.success) return Response.badRequest(res, result.message);
    return Response.ok(res, null, result.message);
  },

  updateProfile: async (req, res) => {
    const { name, phone, email } = req.body;
    const allowedFields = {};
    if (name)  allowedFields.name  = name.trim();
    if (phone) allowedFields.phone = phone.trim();

    if (email && email !== req.user.email) {
      const exists = await DB.queryOne('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), req.userId]);
      if (exists) return Response.conflict(res, 'El correo ya está en uso.');
      allowedFields.email = email.toLowerCase().trim();
    }

    if (!Object.keys(allowedFields).length) {
      return Response.badRequest(res, 'No hay campos válidos para actualizar.');
    }

    const sets  = Object.keys(allowedFields).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals  = Object.values(allowedFields);
    await DB.query(`UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $1`, [req.userId, ...vals]);

    return Response.ok(res, null, 'Perfil actualizado correctamente');
  },
};

/* ════════════════════════════════════════
   AUTH ROUTES
════════════════════════════════════════ */
const express   = require('express');
const router    = express.Router();
const asyncHandler = require('express-async-handler');
const { authenticate } = require('../../middlewares/index');

/* Validadores */
const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

const refreshValidators = [
  body('refreshToken').notEmpty().withMessage('Refresh token requerido'),
];

const changePasswordValidators = [
  body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
  body('newPassword').isLength({ min: 8 }).withMessage('Nueva contraseña: mínimo 8 caracteres'),
];

/* Rutas públicas */
router.post('/login',   authLimiter, loginValidators,   validate, asyncHandler(AuthController.login));
router.post('/refresh', refreshValidators, validate,             asyncHandler(AuthController.refresh));

/* Rutas protegidas */
router.post('/logout',          authenticate, asyncHandler(AuthController.logout));
router.get('/me',               authenticate, asyncHandler(AuthController.me));
router.put('/change-password',  authenticate, changePasswordValidators, validate, asyncHandler(AuthController.changePassword));
router.put('/profile',          authenticate, asyncHandler(AuthController.updateProfile));

module.exports = router;
