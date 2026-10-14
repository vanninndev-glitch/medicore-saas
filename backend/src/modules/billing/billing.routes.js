/**
 * MediCore SaaS — modules/billing/billing.routes.js
 * Facturación: cargos, cobros, CFDI 4.0, seguros médicos
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param } = require('express-validator');
const { v4: uuidv4 }  = require('uuid');
const dayjs        = require('dayjs');

const DB       = require('../../config/database');
const Response = require('../../utils/response');
const { authenticate, requirePermission, resolveTenant, validate, auditLog } = require('../../middlewares/index');

/* ── SERVICE ── */
const BillingService = {

  async listInvoices({ hospitalId, patientId, status, from, to, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId]; let where = 'WHERE i.hospital_id = $1'; let idx = 2;
    if (patientId) { where += ` AND i.patient_id = $${idx++}`; params.push(patientId); }
    if (status)    { where += ` AND i.status = $${idx++}`;     params.push(status); }
    if (from)      { where += ` AND i.created_at >= $${idx++}`;params.push(from); }
    if (to)        { where += ` AND i.created_at <= $${idx++}`;params.push(to); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT i.id, i.folio, i.total, i.paid, i.balance, i.status, i.cfdi_uuid, i.created_at,
                p.name as patient_name
         FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id
         ${where} ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total, SUM(total) as sum_total FROM invoices i ${where}`, params),
    ]);
    return { invoices: rows, total: parseInt(countRes?.total || 0), sumTotal: parseFloat(countRes?.sum_total || 0) };
  },

  async createCharge({ patientId, items, insuranceId, notes, hospitalId, createdBy }) {
    const id    = uuidv4();
    const folio = await this._generateFolio(hospitalId);
    const total = items.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);

    await DB.query(
      `INSERT INTO invoices (id, hospital_id, patient_id, folio, items, total, paid, balance, status, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,0,$6,'pending',$7,$8,NOW(),NOW())`,
      [id, hospitalId, patientId || null, folio, JSON.stringify(items), total, notes || null, createdBy]
    );
    return { id, folio, total };
  },

  async registerPayment({ invoiceId, amount, method, hospitalId, userId }) {
    const inv = await DB.queryOne('SELECT id, total, paid, balance FROM invoices WHERE id = $1 AND hospital_id = $2', [invoiceId, hospitalId]);
    if (!inv) throw Object.assign(new Error('Factura no encontrada'), { code: 'NOT_FOUND' });

    const newPaid    = parseFloat(inv.paid) + parseFloat(amount);
    const newBalance = parseFloat(inv.total) - newPaid;
    const newStatus  = newBalance <= 0 ? 'paid' : 'partial';

    await DB.transaction(async (tx) => {
      await tx.query(
        'UPDATE invoices SET paid = $3, balance = $4, status = $5, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
        [invoiceId, hospitalId, newPaid, Math.max(0, newBalance), newStatus]
      );
      await tx.query(
        `INSERT INTO payments (id, invoice_id, hospital_id, amount, method, registered_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [uuidv4(), invoiceId, hospitalId, amount, method || 'cash', userId]
      );
    });
    return { id: invoiceId, status: newStatus, balance: Math.max(0, newBalance) };
  },

  async _generateFolio(hospitalId) {
    const yr  = new Date().getFullYear();
    const res = await DB.queryOne('SELECT COUNT(*) as cnt FROM invoices WHERE hospital_id = $1 AND EXTRACT(YEAR FROM created_at) = $2', [hospitalId, yr]);
    return `FAC-${yr}-${String(parseInt(res?.cnt || 0) + 1).padStart(6, '0')}`;
  },
};

/* ── RUTAS ── */
router.use(authenticate, resolveTenant);

router.get('/', requirePermission('billing:read'), asyncHandler(async (req, res) => {
  const { patientId, status, from, to, page = 1, limit = 30 } = req.query;
  const result = await BillingService.listInvoices({ hospitalId: req.hospitalId, patientId, status, from, to, page: +page, limit: +limit });
  return Response.paginated(res, result.invoices, result.total, page, limit);
}));

router.get('/summary', requirePermission('billing:read'), asyncHandler(async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const [daily, monthly] = await Promise.all([
    DB.queryOne(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(paid),0) as paid FROM invoices WHERE hospital_id = $1 AND DATE(created_at) = $2`, [req.hospitalId, today]),
    DB.queryOne(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(paid),0) as paid FROM invoices WHERE hospital_id = $1 AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`, [req.hospitalId]),
  ]);
  return Response.ok(res, { daily, monthly });
}));

router.post('/charges', [body('items').isArray({ min: 1 })], requirePermission('billing:write'), validate,
  auditLog('billing:charge'), asyncHandler(async (req, res) => {
    const result = await BillingService.createCharge({ ...req.body, hospitalId: req.hospitalId, createdBy: req.userId });
    return Response.created(res, result, `Cargo registrado — Folio ${result.folio}`);
  })
);

router.post('/payments', [body('invoiceId').isUUID(), body('amount').isNumeric()], requirePermission('billing:write'), validate,
  auditLog('billing:payment'), asyncHandler(async (req, res) => {
    try {
      const result = await BillingService.registerPayment({ ...req.body, hospitalId: req.hospitalId, userId: req.userId });
      return Response.ok(res, result, 'Pago registrado correctamente');
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      throw err;
    }
  })
);

module.exports = router;
