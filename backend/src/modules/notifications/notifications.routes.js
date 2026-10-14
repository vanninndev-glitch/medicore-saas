/**
 * MediCore SaaS — modules/notifications/notifications.routes.js
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { param }    = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const DB       = require('../../config/database');
const Response = require('../../utils/response');
const { authenticate, resolveTenant, validate } = require('../../middlewares/index');

router.use(authenticate, resolveTenant);

/* Listar notificaciones del usuario */
router.get('/', asyncHandler(async (req, res) => {
  const { unread, limit = 20, page = 1 } = req.query;
  const offset = (page - 1) * limit;
  const params = [req.userId, req.hospitalId];
  let where    = 'WHERE n.user_id = $1 AND n.hospital_id = $2';
  if (unread === 'true') { where += ' AND n.read = false'; }

  const [rows, countRes] = await Promise.all([
    DB.query(
      `SELECT id, type, message, data, read, created_at FROM notifications n ${where} ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    ),
    DB.queryOne(`SELECT COUNT(*) as total FROM notifications n ${where}`, params),
  ]);

  return Response.paginated(res, rows, parseInt(countRes?.total || 0), page, limit);
}));

/* Marcar como leída */
router.patch('/:id/read', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await DB.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  return Response.ok(res, null, 'Notificación marcada como leída');
}));

/* Marcar todas como leídas */
router.patch('/read-all', asyncHandler(async (req, res) => {
  await DB.query('UPDATE notifications SET read = true WHERE user_id = $1 AND hospital_id = $2 AND read = false', [req.userId, req.hospitalId]);
  return Response.ok(res, null, 'Todas las notificaciones marcadas como leídas');
}));

/* Contador de no leídas */
router.get('/unread-count', asyncHandler(async (req, res) => {
  const result = await DB.queryOne('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND hospital_id = $2 AND read = false', [req.userId, req.hospitalId]);
  return Response.ok(res, { count: parseInt(result?.cnt || 0) });
}));

module.exports = router;
