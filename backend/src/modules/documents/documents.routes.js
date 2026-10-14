/**
 * MediCore SaaS — modules/documents/documents.routes.js
 * Documentos: subida cifrada AES-256, MinIO/S3, categorías, descarga segura
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const crypto       = require('crypto');
const path         = require('path');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const { encryption: encCfg, storage: storageCfg } = require('../../config/env');
const {
  authenticate, requirePermission, resolveTenant,
  validate, auditLog, upload, uploadLimiter,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   ENCRYPTION SERVICE
════════════════════════════════════════ */
const EncryptionService = {
  encrypt(buffer) {
    const iv         = crypto.randomBytes(encCfg.ivLength);
    const key        = Buffer.from(encCfg.key, 'utf8');
    const cipher     = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted  = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag    = cipher.getAuthTag();
    // Estructura: [iv (16 bytes)] + [authTag (16 bytes)] + [encrypted data]
    return Buffer.concat([iv, authTag, encrypted]);
  },

  decrypt(encryptedBuffer) {
    const iv        = encryptedBuffer.subarray(0, encCfg.ivLength);
    const authTag   = encryptedBuffer.subarray(encCfg.ivLength, encCfg.ivLength + 16);
    const data      = encryptedBuffer.subarray(encCfg.ivLength + 16);
    const key       = Buffer.from(encCfg.key, 'utf8');
    const decipher  = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  },
};

/* ════════════════════════════════════════
   STORAGE SERVICE (MinIO / local)
════════════════════════════════════════ */
const StorageService = {
  _client: null,

  async getClient() {
    if (this._client) return this._client;
    if (storageCfg.type === 'minio' || storageCfg.type === 's3') {
      const Minio = require('minio');
      this._client = new Minio.Client({
        endPoint:  storageCfg.endpoint,
        port:      storageCfg.port,
        useSSL:    storageCfg.useSSL,
        accessKey: storageCfg.accessKey,
        secretKey: storageCfg.secretKey,
      });
      // Verificar / crear bucket
      const exists = await this._client.bucketExists(storageCfg.bucket);
      if (!exists) {
        await this._client.makeBucket(storageCfg.bucket, 'us-east-1');
        logger.info(`[Storage] Bucket creado: ${storageCfg.bucket}`);
      }
    }
    return this._client;
  },

  async upload(objectKey, buffer, mimeType) {
    if (storageCfg.type === 'local') {
      const fs   = require('fs').promises;
      const dir  = path.join(storageCfg.localPath, path.dirname(objectKey));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(storageCfg.localPath, objectKey), buffer);
      return objectKey;
    }
    const client = await this.getClient();
    await client.putObject(storageCfg.bucket, objectKey, buffer, buffer.length, { 'Content-Type': mimeType });
    return objectKey;
  },

  async download(objectKey) {
    if (storageCfg.type === 'local') {
      const fs = require('fs').promises;
      return fs.readFile(path.join(storageCfg.localPath, objectKey));
    }
    const client  = await this.getClient();
    const chunks  = [];
    const stream  = await client.getObject(storageCfg.bucket, objectKey);
    return new Promise((resolve, reject) => {
      stream.on('data',  chunk => chunks.push(chunk));
      stream.on('end',   ()    => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  },

  async delete(objectKey) {
    if (storageCfg.type === 'local') {
      const fs = require('fs').promises;
      await fs.unlink(path.join(storageCfg.localPath, objectKey)).catch(() => {});
      return;
    }
    const client = await this.getClient();
    await client.removeObject(storageCfg.bucket, objectKey);
  },

  /* URL prefirmada para descarga directa (temporal) */
  async presignedUrl(objectKey, expirySeconds = 300) {
    if (storageCfg.type === 'local') return null;
    const client = await this.getClient();
    return client.presignedGetObject(storageCfg.bucket, objectKey, expirySeconds);
  },
};

/* ════════════════════════════════════════
   DOCUMENTS SERVICE
════════════════════════════════════════ */
const DocumentsService = {

  /* ── Listar documentos ── */
  async list({ hospitalId, patientId, type, search, page, limit }) {
    const params = [hospitalId];
    let where    = 'WHERE d.hospital_id = $1';
    let idx      = 2;

    if (patientId) { where += ` AND d.patient_id = $${idx++}`;  params.push(patientId); }
    if (type)      { where += ` AND d.type = $${idx++}`;        params.push(type); }
    if (search) {
      where += ` AND (d.name ILIKE $${idx} OR p.name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    const offset = ((page - 1) * limit);
    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT d.id, d.name, d.type, d.size, d.mime_type, d.status,
                d.patient_id, d.created_at,
                p.name as patient_name,
                u.name as uploaded_by_name
         FROM documents d
         LEFT JOIN patients p ON p.id = d.patient_id
         LEFT JOIN users    u ON u.id = d.uploaded_by
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM documents d LEFT JOIN patients p ON p.id = d.patient_id ${where}`, params),
    ]);

    return { documents: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Subir documento con cifrado ── */
  async upload({ file, type, patientId, description, date, hospitalId, uploadedBy }) {
    const ALLOWED_MIME = [
      'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw Object.assign(new Error('Tipo de archivo no permitido'), { code: 'INVALID_TYPE' });
    }

    const maxBytes = storageCfg.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw Object.assign(new Error(`Archivo demasiado grande (máx ${storageCfg.maxSizeMB}MB)`), { code: 'TOO_LARGE' });
    }

    const id         = uuidv4();
    const ext        = path.extname(file.originalname).toLowerCase();
    const objectKey  = `hospitals/${hospitalId}/documents/${id}${ext}`;

    /* Cifrar con AES-256-GCM */
    const encryptedBuffer = EncryptionService.encrypt(file.buffer);

    /* Subir a MinIO/local */
    await StorageService.upload(objectKey, encryptedBuffer, 'application/octet-stream');

    /* Guardar metadatos en DB */
    await DB.query(
      `INSERT INTO documents (
        id, hospital_id, patient_id, name, type, size, mime_type,
        object_key, description, document_date, status,
        uploaded_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,NOW(),NOW())`,
      [
        id, hospitalId, patientId || null,
        file.originalname, type, file.size, file.mimetype,
        objectKey, description || null, date || null, uploadedBy,
      ]
    );

    logger.info(`[Documents] Documento subido: ${id} (${file.size} bytes) por usuario ${uploadedBy}`);
    return { id, name: file.originalname, size: file.size };
  },

  /* ── Descargar documento (descifrar) ── */
  async download(id, hospitalId, userId) {
    const doc = await DB.queryOne(
      'SELECT * FROM documents WHERE id = $1 AND hospital_id = $2 AND status != $3',
      [id, hospitalId, 'deleted']
    );
    if (!doc) return null;

    /* Descargar de storage */
    const encryptedBuffer = await StorageService.download(doc.object_key);

    /* Descifrar */
    const decrypted = EncryptionService.decrypt(encryptedBuffer);

    /* Registrar acceso en audit */
    await DB.query(
      `INSERT INTO document_access_log (id, document_id, user_id, action, accessed_at)
       VALUES ($1,$2,$3,'download',NOW())`,
      [uuidv4(), id, userId]
    );

    return { buffer: decrypted, mimeType: doc.mime_type, name: doc.name };
  },

  /* ── Eliminar documento ── */
  async delete(id, hospitalId, userId) {
    const doc = await DB.queryOne(
      'SELECT object_key FROM documents WHERE id = $1 AND hospital_id = $2',
      [id, hospitalId]
    );
    if (!doc) return false;

    await Promise.all([
      DB.query('UPDATE documents SET status = $3, deleted_by = $4, deleted_at = NOW() WHERE id = $1 AND hospital_id = $2',
        [id, hospitalId, 'deleted', userId]),
      StorageService.delete(doc.object_key),
    ]);

    return true;
  },
};

/* ════════════════════════════════════════
   CONTROLLER
════════════════════════════════════════ */
const DocumentsController = {

  list: async (req, res) => {
    const { patientId, type, search, page = 1, limit = 20 } = req.query;
    const result = await DocumentsService.list({
      hospitalId: req.hospitalId,
      patientId, type, search,
      page: Math.max(parseInt(page), 1),
      limit: Math.min(parseInt(limit), 100),
    });
    return Response.paginated(res, result.documents, result.total, page, limit);
  },

  upload: async (req, res) => {
    if (!req.file) return Response.badRequest(res, 'No se recibió ningún archivo');
    const { type, patientId, description, date } = req.body;
    if (!type) return Response.badRequest(res, 'Tipo de documento requerido');

    try {
      const result = await DocumentsService.upload({
        file: req.file, type, patientId, description, date,
        hospitalId: req.hospitalId, uploadedBy: req.userId,
      });
      return Response.created(res, result, 'Documento subido y cifrado correctamente');
    } catch (err) {
      if (err.code === 'INVALID_TYPE') return Response.badRequest(res, err.message);
      if (err.code === 'TOO_LARGE')    return Response.badRequest(res, err.message);
      throw err;
    }
  },

  download: async (req, res) => {
    const result = await DocumentsService.download(req.params.id, req.hospitalId, req.userId);
    if (!result) return Response.notFound(res, 'Documento no encontrado');

    res.setHeader('Content-Type',        result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.name)}"`);
    res.setHeader('Content-Length',      result.buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(result.buffer);
  },

  delete: async (req, res) => {
    const deleted = await DocumentsService.delete(req.params.id, req.hospitalId, req.userId);
    if (!deleted) return Response.notFound(res, 'Documento no encontrado');
    return Response.ok(res, null, 'Documento eliminado correctamente');
  },
};

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

router.get('/',                                     requirePermission('documents:read'),  asyncHandler(DocumentsController.list));
router.get('/:id/download', param('id').isUUID(),   requirePermission('documents:read'),  validate, auditLog('document:download'), asyncHandler(DocumentsController.download));

router.post('/upload', uploadLimiter, upload.single('file'), requirePermission('documents:write'),
  auditLog('document:upload'), asyncHandler(DocumentsController.upload));

router.delete('/:id', param('id').isUUID(),         requirePermission('documents:delete'), validate,
  auditLog('document:delete'), asyncHandler(DocumentsController.delete));

module.exports = router;
