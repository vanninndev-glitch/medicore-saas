/**
 * MediCore SaaS — modules/pharmacy/pharmacy.routes.js
 * Farmacia: recetas, dispensación, inventario, control de medicamentos
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param } = require('express-validator');
const { v4: uuidv4 }  = require('uuid');

const DB       = require('../../config/database');
const Redis    = require('../../config/redis');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const { authenticate, requirePermission, resolveTenant, validate, auditLog } = require('../../middlewares/index');

/* ════════════════════════════════════════
   PHARMACY SERVICE
════════════════════════════════════════ */
const PharmacyService = {

  /* ── Listar recetas pendientes ── */
  async listPrescriptions({ hospitalId, status, patientId, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId]; let where = 'WHERE rx.hospital_id = $1'; let idx = 2;
    if (status)    { where += ` AND rx.status = $${idx++}`;     params.push(status); }
    if (patientId) { where += ` AND rx.patient_id = $${idx++}`; params.push(patientId); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT rx.id, rx.medications, rx.status, rx.notes, rx.created_at,
                p.name as patient_name, p.id as patient_id,
                u.name as doctor_name
         FROM prescriptions rx
         JOIN patients p ON p.id = rx.patient_id
         JOIN users    u ON u.id = rx.doctor_id
         ${where} ORDER BY rx.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM prescriptions rx ${where}`, params),
    ]);
    return { prescriptions: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Dispensar receta ── */
  async dispensePrescription(prescriptionId, hospitalId, pharmacistId) {
    const rx = await DB.queryOne(
      "SELECT * FROM prescriptions WHERE id = $1 AND hospital_id = $2 AND status = 'pending'",
      [prescriptionId, hospitalId]
    );
    if (!rx) throw Object.assign(new Error('Receta no encontrada o ya dispensada'), { code: 'NOT_FOUND' });

    const medications = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : rx.medications;

    return await DB.transaction(async (tx) => {
      /* Verificar y descontar inventario */
      for (const med of medications) {
        if (!med.medId) continue;
        const item = await tx.queryOne(
          'SELECT id, stock, name FROM pharmacy_inventory WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
          [med.medId, hospitalId]
        );
        if (!item) throw new Error(`Medicamento ${med.name} no encontrado en inventario`);
        if (item.stock < (med.qty || 1)) {
          throw Object.assign(new Error(`Stock insuficiente para ${item.name}: disponible ${item.stock}`), { code: 'INSUFFICIENT_STOCK' });
        }
        await tx.query(
          'UPDATE pharmacy_inventory SET stock = stock - $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
          [med.medId, hospitalId, med.qty || 1]
        );
      }

      /* Marcar como dispensada */
      await tx.query(
        "UPDATE prescriptions SET status = 'dispensed', dispensed_by = $3, dispensed_at = NOW(), updated_at = NOW() WHERE id = $1 AND hospital_id = $2",
        [prescriptionId, hospitalId, pharmacistId]
      );

      /* Registrar movimiento de inventario */
      for (const med of medications) {
        if (!med.medId) continue;
        await tx.query(
          `INSERT INTO inventory_movements (id, hospital_id, medication_id, type, quantity, reference_id, reference_type, performed_by, created_at)
           VALUES ($1,$2,$3,'dispense',$4,$5,'prescription',$6,NOW())`,
          [uuidv4(), hospitalId, med.medId, -(med.qty || 1), prescriptionId, pharmacistId]
        );
      }

      return { id: prescriptionId };
    });
  },

  /* ── Dispensación manual ── */
  async manualDispense({ patient, items, prescriptionId, notes, hospitalId, pharmacistId }) {
    return await DB.transaction(async (tx) => {
      const dispenseId = uuidv4();
      for (const item of items) {
        if (!item.medId) continue;
        const med = await tx.queryOne(
          'SELECT id, stock, name, controlled FROM pharmacy_inventory WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
          [item.medId, hospitalId]
        );
        if (!med) throw new Error(`Medicamento ${item.medId} no encontrado`);
        if (med.stock < item.qty) {
          throw Object.assign(new Error(`Stock insuficiente para ${med.name}`), { code: 'INSUFFICIENT_STOCK' });
        }
        await tx.query(
          'UPDATE pharmacy_inventory SET stock = stock - $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
          [item.medId, hospitalId, item.qty]
        );
        await tx.query(
          `INSERT INTO inventory_movements (id, hospital_id, medication_id, type, quantity, reference_id, reference_type, notes, performed_by, created_at)
           VALUES ($1,$2,$3,'manual_dispense',$4,$5,'manual_dispense',$6,$7,NOW())`,
          [uuidv4(), hospitalId, item.medId, -item.qty, dispenseId, notes || null, pharmacistId]
        );
      }

      /* Verificar stock bajo y emitir alertas */
      await this._checkLowStock(hospitalId, items.map(i => i.medId).filter(Boolean));
      return { id: dispenseId };
    });
  },

  /* ── Ajustar inventario ── */
  async adjustInventory({ medId, type, qty, reason, hospitalId, userId }) {
    const med = await DB.queryOne(
      'SELECT id, stock, name, min_stock FROM pharmacy_inventory WHERE id = $1 AND hospital_id = $2',
      [medId, hospitalId]
    );
    if (!med) return null;

    let newStock;
    if (type === 'add')  newStock = med.stock + qty;
    else if (type === 'sub')  newStock = Math.max(0, med.stock - qty);
    else newStock = qty; // set

    await DB.transaction(async (tx) => {
      await tx.query(
        'UPDATE pharmacy_inventory SET stock = $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2',
        [medId, hospitalId, newStock]
      );
      await tx.query(
        `INSERT INTO inventory_movements (id, hospital_id, medication_id, type, quantity, notes, performed_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [uuidv4(), hospitalId, medId, type, type === 'add' ? qty : type === 'sub' ? -qty : (newStock - med.stock), reason || null, userId]
      );
    });

    if (newStock <= med.min_stock) {
      global.io?.emitToHospital(hospitalId, 'pharmacy:low_stock', { medId, name: med.name, stock: newStock, minStock: med.min_stock });
    }

    await Redis.del(`pharmacy:inventory:${hospitalId}`);
    return { id: medId, newStock };
  },

  /* ── Listar inventario ── */
  async listInventory({ hospitalId, category, stockFilter, search, page, limit }) {
    const cacheKey = `pharmacy:inventory:${hospitalId}:${page}:${category}:${stockFilter}`;
    const cached   = await Redis.get(cacheKey);
    if (cached && !search) return cached;

    const offset = (page - 1) * limit;
    const params = [hospitalId]; let where = 'WHERE hospital_id = $1'; let idx = 2;
    if (category)    { where += ` AND category = $${idx++}`;          params.push(category); }
    if (stockFilter === 'low') { where += ` AND stock <= min_stock`; }
    if (search)      { where += ` AND name ILIKE $${idx++}`;          params.push(`%${search}%`); }

    const [rows, countRes] = await Promise.all([
      DB.query(`SELECT * FROM pharmacy_inventory ${where} ORDER BY name LIMIT $${idx} OFFSET $${idx+1}`, [...params, limit, offset]),
      DB.queryOne(`SELECT COUNT(*) as total FROM pharmacy_inventory ${where}`, params),
    ]);
    const result = { medications: rows, total: parseInt(countRes?.total || 0) };
    if (!search) await Redis.set(cacheKey, result, 120);
    return result;
  },

  async _checkLowStock(hospitalId, medIds) {
    for (const medId of medIds) {
      const med = await DB.queryOne('SELECT name, stock, min_stock FROM pharmacy_inventory WHERE id = $1', [medId]);
      if (med && med.stock <= med.min_stock) {
        global.io?.emitToHospital(hospitalId, 'pharmacy:low_stock', { medId, name: med.name, stock: med.stock });
      }
    }
  },
};

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

/* Recetas */
router.get('/prescriptions', requirePermission('pharmacy:read'), asyncHandler(async (req, res) => {
  const { status, patientId, page = 1, limit = 30 } = req.query;
  const result = await PharmacyService.listPrescriptions({ hospitalId: req.hospitalId, status, patientId, page: +page, limit: +limit });
  return Response.paginated(res, result.prescriptions, result.total, page, limit);
}));

router.post('/prescriptions/:id/dispense', param('id').isUUID(), requirePermission('pharmacy:write'), validate,
  auditLog('pharmacy:dispense'), asyncHandler(async (req, res) => {
    try {
      const result = await PharmacyService.dispensePrescription(req.params.id, req.hospitalId, req.userId);
      return Response.ok(res, result, 'Receta dispensada correctamente');
    } catch (err) {
      if (err.code === 'NOT_FOUND')         return Response.notFound(res, err.message);
      if (err.code === 'INSUFFICIENT_STOCK') return Response.badRequest(res, err.message);
      throw err;
    }
  })
);

/* Dispensación manual */
router.post('/dispense', [body('items').isArray({ min: 1 })], requirePermission('pharmacy:write'), validate,
  auditLog('pharmacy:manual_dispense'), asyncHandler(async (req, res) => {
    try {
      const result = await PharmacyService.manualDispense({ ...req.body, hospitalId: req.hospitalId, pharmacistId: req.userId });
      return Response.created(res, result, 'Dispensación registrada correctamente');
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STOCK') return Response.badRequest(res, err.message);
      throw err;
    }
  })
);

/* Inventario */
router.get('/inventory', requirePermission('pharmacy:read'), asyncHandler(async (req, res) => {
  const { category, stock, search, page = 1, limit = 50 } = req.query;
  const result = await PharmacyService.listInventory({ hospitalId: req.hospitalId, category, stockFilter: stock, search, page: +page, limit: +limit });
  return Response.paginated(res, result.medications, result.total, page, limit);
}));

router.patch('/inventory/:id', param('id').isUUID(),
  [body('type').isIn(['add','sub','set']), body('qty').isInt({ min: 0 })],
  requirePermission('pharmacy:write'), validate,
  auditLog('pharmacy:inventory'), asyncHandler(async (req, res) => {
    const result = await PharmacyService.adjustInventory({ medId: req.params.id, ...req.body, hospitalId: req.hospitalId, userId: req.userId });
    if (!result) return Response.notFound(res, 'Medicamento no encontrado');
    return Response.ok(res, result, 'Inventario actualizado');
  })
);

/* Agregar medicamento */
router.post('/inventory', [body('name').notEmpty(), body('category').notEmpty()], requirePermission('pharmacy:write'), validate,
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    const { name, presentation, category, stock, minStock, price, controlled } = req.body;
    await DB.query(
      `INSERT INTO pharmacy_inventory (id, hospital_id, name, presentation, category, stock, min_stock, price, controlled, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
      [id, req.hospitalId, name, presentation || null, category, stock || 0, minStock || 10, price || 0, controlled || false]
    );
    await Redis.del(`pharmacy:inventory:${req.hospitalId}`);
    return Response.created(res, { id }, 'Medicamento agregado al inventario');
  })
);

module.exports = router;
