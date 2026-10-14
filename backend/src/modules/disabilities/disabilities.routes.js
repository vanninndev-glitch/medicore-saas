/**
 * MediCore SaaS — modules/disabilities/disabilities.routes.js
 * Incapacidades: generación PDF con folio único, firma, QR, IMSS ST-7/ST-9
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { body, param } = require('express-validator');
const { v4: uuidv4 }  = require('uuid');
const PDFDocument  = require('pdfkit');
const QRCode       = require('qrcode');
const dayjs        = require('dayjs');

const DB       = require('../../config/database');
const Response = require('../../utils/response');
const logger   = require('../../utils/logger');
const { saas: saasCfg } = require('../../config/env');
const {
  authenticate, requirePermission, resolveTenant,
  validate, auditLog,
} = require('../../middlewares/index');

/* ════════════════════════════════════════
   PDF GENERATOR SERVICE
════════════════════════════════════════ */
const PDFService = {

  async generateDisabilityPDF(disability, patient, doctor, hospital) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc    = new PDFDocument({ size: 'LETTER', margin: 50 });
        const chunks = [];

        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        /* ── Colores corporativos ── */
        const PRIMARY   = '#1a6fff';
        const SECONDARY = '#0a1520';
        const TEXT      = '#111111';
        const MUTED     = '#666666';

        /* ── HEADER ── */
        doc.rect(0, 0, doc.page.width, 90).fill(SECONDARY);

        doc.fillColor('#00d4ff')
           .font('Helvetica-Bold').fontSize(22)
           .text('MediCore SaaS', 50, 20);

        doc.fillColor('#ffffff')
           .font('Helvetica').fontSize(10)
           .text('Sistema de Gestión Hospitalaria', 50, 48);

        doc.fillColor('#ffffff')
           .font('Helvetica-Bold').fontSize(14)
           .text('CONSTANCIA DE INCAPACIDAD MÉDICA', 50, 65);

        /* Folio en header */
        doc.fillColor('#00d4ff')
           .font('Helvetica-Bold').fontSize(10)
           .text(`FOLIO: ${disability.folio}`, 400, 28, { align: 'right', width: 145 });

        doc.fillColor('#ffffff')
           .font('Helvetica').fontSize(9)
           .text(`Emitido: ${dayjs(disability.created_at).format('DD/MM/YYYY HH:mm')}`, 400, 48, { align: 'right', width: 145 })
           .text(`Tipo: ${disability.type}`, 400, 62, { align: 'right', width: 145 });

        /* ── INFORMACIÓN DEL HOSPITAL ── */
        doc.moveDown(4);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('INSTITUCIÓN MÉDICA', 50);
        doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
        doc.moveDown(0.5);

        doc.fillColor(TEXT).font('Helvetica').fontSize(10)
           .text(`${hospital?.name || saasCfg.name}`, 50, doc.y)
           .font('Helvetica').fontSize(9).fillColor(MUTED)
           .text(`${hospital?.address || ''} · ${hospital?.city || ''}`);

        doc.moveDown(1);

        /* ── DATOS DEL PACIENTE ── */
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('DATOS DEL PACIENTE');
        doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
        doc.moveDown(0.5);

        const patientData = [
          ['Nombre completo',  patient.name],
          ['Fecha de nacimiento', dayjs(patient.dob).format('DD/MM/YYYY')],
          ['Edad',             `${dayjs().diff(dayjs(patient.dob), 'year')} años`],
          ['CURP',             patient.curp || '—'],
          ['No. de expediente', patient.expedient],
          ['Tipo de sangre',   patient.blood_type || '—'],
          ['Seguro médico',    `${patient.insurance_type || ''} ${patient.insurance_num ? '· ' + patient.insurance_num : ''}`],
        ];

        this._drawTable(doc, patientData, TEXT, MUTED);

        doc.moveDown(1);

        /* ── DATOS DE LA INCAPACIDAD ── */
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('DATOS DE LA INCAPACIDAD');
        doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
        doc.moveDown(0.5);

        const disData = [
          ['Tipo de incapacidad', disability.type_label || disability.type],
          ['Diagnóstico (CIE-10)', disability.diagnosis],
          ['Fecha de inicio',     dayjs(disability.start_date).format('DD/MM/YYYY')],
          ['Fecha de alta',       dayjs(disability.end_date).format('DD/MM/YYYY')],
          ['Días de incapacidad', `${disability.days} día(s)`],
          ['Tipo de reposo',      disability.rest_type || 'Reposo total'],
        ];

        this._drawTable(doc, disData, TEXT, MUTED);

        doc.moveDown(1);

        /* ── DESCRIPCIÓN CLÍNICA ── */
        if (disability.clinical) {
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('DESCRIPCIÓN CLÍNICA');
          doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
          doc.moveDown(0.5);
          doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(disability.clinical, { width: doc.page.width - 100 });
          doc.moveDown(1);
        }

        /* ── TRATAMIENTO ── */
        if (disability.treatment) {
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('TRATAMIENTO INDICADO');
          doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
          doc.moveDown(0.5);
          doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(disability.treatment, { width: doc.page.width - 100 });
          doc.moveDown(1);
        }

        /* ── SEGUIMIENTO ── */
        if (disability.followup) {
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('INSTRUCCIONES DE SEGUIMIENTO');
          doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
          doc.moveDown(0.5);
          doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(disability.followup, { width: doc.page.width - 100 });
          doc.moveDown(1.5);
        }

        /* ── DATOS DEL MÉDICO ── */
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text('MÉDICO TRATANTE');
        doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(PRIMARY);
        doc.moveDown(0.5);

        const doctorData = [
          ['Nombre',   doctor?.name || '—'],
          ['Cédula profesional', doctor?.cedula || '—'],
          ['Especialidad',       doctor?.specialty || 'Médico General'],
        ];
        this._drawTable(doc, doctorData, TEXT, MUTED);

        /* ── QR de verificación ── */
        const verifyUrl = `https://${saasCfg.domain}/verify/${disability.folio}`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 80, margin: 1 });
        const qrBase64  = qrDataUrl.split(',')[1];
        const qrBuffer  = Buffer.from(qrBase64, 'base64');

        const qrY = doc.page.height - 170;
        doc.image(qrBuffer, doc.page.width - 110, qrY, { width: 65 });
        doc.fillColor(MUTED).font('Helvetica').fontSize(7)
           .text('Escanea para verificar', doc.page.width - 120, qrY + 68, { width: 80, align: 'center' });

        /* ── FIRMA ── */
        const sigY = doc.page.height - 120;
        doc.moveTo(60,  sigY).lineTo(240, sigY).stroke('#cccccc');
        doc.moveTo(340, sigY).lineTo(520, sigY).stroke('#cccccc');

        doc.fillColor(TEXT).font('Helvetica').fontSize(9)
           .text(doctor?.name || 'Médico tratante', 60, sigY + 5, { width: 180, align: 'center' })
           .text(`Cédula: ${doctor?.cedula || '—'}`, 60, sigY + 18, { width: 180, align: 'center' });

        doc.fillColor(TEXT).font('Helvetica').fontSize(9)
           .text('Sello del hospital', 340, sigY + 5, { width: 180, align: 'center' });

        /* ── FOOTER ── */
        doc.rect(0, doc.page.height - 45, doc.page.width, 45).fill('#0a1520');
        doc.fillColor('#7ba3c4').font('Helvetica').fontSize(7.5)
           .text(
             `Este documento fue generado electrónicamente por ${saasCfg.name} · Folio: ${disability.folio} · ${dayjs().format('DD/MM/YYYY HH:mm')} · Verificar en: ${saasCfg.domain}/verify/${disability.folio}`,
             50, doc.page.height - 30, { width: doc.page.width - 100, align: 'center' }
           );

        /* ── Nota de validez ── */
        doc.fillColor(MUTED).font('Helvetica').fontSize(8)
           .text(
             'Este documento tiene validez únicamente con la firma autógrafa del médico y el sello oficial de la institución médica.',
             50, doc.page.height - 55, { width: doc.page.width - 100, align: 'center' }
           );

        doc.end();

      } catch (err) {
        reject(err);
      }
    });
  },

  _drawTable(doc, rows, textColor, mutedColor) {
    rows.forEach(([label, value]) => {
      const y = doc.y;
      doc.fillColor(mutedColor).font('Helvetica-Bold').fontSize(9)
         .text(label + ':', 50, y, { width: 160, continued: false });
      doc.fillColor(textColor).font('Helvetica').fontSize(10)
         .text(String(value || '—'), 215, y, { width: 340 });
      doc.moveDown(0.45);
    });
  },
};

/* ════════════════════════════════════════
   DISABILITIES SERVICE
════════════════════════════════════════ */
const DisabilitiesService = {

  /* ── Generar folio único ── */
  async generateFolio(hospitalId) {
    const year  = new Date().getFullYear();
    const res   = await DB.queryOne(
      'SELECT COUNT(*) as cnt FROM disabilities WHERE hospital_id = $1 AND EXTRACT(YEAR FROM created_at) = $2',
      [hospitalId, year]
    );
    const seq = parseInt(res?.cnt || 0) + 1;
    return `INC-${year}-${String(seq).padStart(6, '0')}`;
  },

  /* ── Listar incapacidades ── */
  async list({ hospitalId, patientId, doctorId, page, limit }) {
    const offset = (page - 1) * limit;
    const params = [hospitalId];
    let where    = 'WHERE d.hospital_id = $1';
    let idx      = 2;

    if (patientId) { where += ` AND d.patient_id = $${idx++}`; params.push(patientId); }
    if (doctorId)  { where += ` AND d.doctor_id  = $${idx++}`; params.push(doctorId); }

    const [rows, countRes] = await Promise.all([
      DB.query(
        `SELECT d.*, p.name as patient_name, p.expedient,
                u.name as doctor_name
         FROM disabilities d
         JOIN patients p ON p.id = d.patient_id
         JOIN users    u ON u.id = d.doctor_id
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      DB.queryOne(`SELECT COUNT(*) as total FROM disabilities d ${where}`, params),
    ]);

    return { disabilities: rows, total: parseInt(countRes?.total || 0) };
  },

  /* ── Crear incapacidad ── */
  async create(data, hospitalId, doctorId) {
    const [patient, doctor] = await Promise.all([
      DB.queryOne(
        'SELECT id, name, dob, curp, expedient, blood_type, insurance_type, insurance_num FROM patients WHERE id = $1 AND hospital_id = $2',
        [data.patientId, hospitalId]
      ),
      DB.queryOne(
        'SELECT id, name, cedula, specialty FROM users WHERE id = $1',
        [doctorId]
      ),
    ]);

    if (!patient) throw Object.assign(new Error('Paciente no encontrado'), { code: 'NOT_FOUND' });

    const folio = await this.generateFolio(hospitalId);
    const id    = uuidv4();

    await DB.query(
      `INSERT INTO disabilities (
        id, folio, hospital_id, patient_id, doctor_id,
        type, type_label, diagnosis, start_date, end_date, days,
        rest_type, clinical, treatment, followup, status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',NOW(),NOW())`,
      [
        id, folio, hospitalId, data.patientId, doctorId,
        data.type, data.typeLabel || data.type, data.diagnosis,
        data.startDate, data.endDate, data.days,
        data.restType || 'total', data.clinical || null,
        data.treatment || null, data.followup || null,
      ]
    );

    logger.info(`[Disabilities] Incapacidad generada: ${folio} para paciente ${patient.name}`);

    return {
      id, folio, patient, doctor,
      disability: { ...data, folio, id, created_at: new Date().toISOString() },
    };
  },

  /* ── Generar PDF ── */
  async generatePDF(id, hospitalId) {
    const dis = await DB.queryOne(
      `SELECT d.*, p.name as patient_name, p.dob, p.curp, p.expedient,
              p.blood_type, p.insurance_type, p.insurance_num,
              u.name as doctor_name, u.cedula as doctor_cedula, u.specialty as doctor_specialty,
              h.name as hospital_name, h.address as hospital_address
       FROM disabilities d
       JOIN patients  p ON p.id = d.patient_id
       JOIN users     u ON u.id = d.doctor_id
       JOIN hospitals h ON h.id = d.hospital_id
       WHERE d.id = $1 AND d.hospital_id = $2`,
      [id, hospitalId]
    );

    if (!dis) throw Object.assign(new Error('Incapacidad no encontrada'), { code: 'NOT_FOUND' });

    const patient  = { name: dis.patient_name, dob: dis.dob, curp: dis.curp, expedient: dis.expedient, blood_type: dis.blood_type, insurance_type: dis.insurance_type, insurance_num: dis.insurance_num };
    const doctor   = { name: dis.doctor_name, cedula: dis.doctor_cedula, specialty: dis.doctor_specialty };
    const hospital = { name: dis.hospital_name, address: dis.hospital_address };

    const pdfBuffer = await PDFService.generateDisabilityPDF(dis, patient, doctor, hospital);
    return { buffer: pdfBuffer, folio: dis.folio };
  },

  /* ── Verificar folio (público) ── */
  async verifyFolio(folio) {
    const dis = await DB.queryOne(
      `SELECT d.folio, d.type, d.diagnosis, d.start_date, d.end_date, d.days, d.status,
              p.name as patient_name,
              u.name as doctor_name, h.name as hospital_name
       FROM disabilities d
       JOIN patients  p ON p.id = d.patient_id
       JOIN users     u ON u.id = d.doctor_id
       JOIN hospitals h ON h.id = d.hospital_id
       WHERE d.folio = $1`,
      [folio]
    );
    return dis;
  },
};

/* ════════════════════════════════════════
   CONTROLLER
════════════════════════════════════════ */
const DisabilitiesController = {

  list: async (req, res) => {
    const { patientId, doctorId, page = 1, limit = 20 } = req.query;
    const result = await DisabilitiesService.list({
      hospitalId: req.hospitalId, patientId, doctorId,
      page: Math.max(parseInt(page), 1),
      limit: Math.min(parseInt(limit), 100),
    });
    return Response.paginated(res, result.disabilities, result.total, page, limit);
  },

  generate: async (req, res) => {
    try {
      const result = await DisabilitiesService.create(req.body, req.hospitalId, req.userId);
      return Response.created(res, { id: result.id, folio: result.folio }, `Incapacidad generada con folio ${result.folio}`);
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      throw err;
    }
  },

  downloadPDF: async (req, res) => {
    try {
      const { buffer, folio } = await DisabilitiesService.generatePDF(req.params.id, req.hospitalId);
      res.setHeader('Content-Type',        'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="incapacidad_${folio}.pdf"`);
      res.setHeader('Content-Length',      buffer.length);
      return res.send(buffer);
    } catch (err) {
      if (err.code === 'NOT_FOUND') return Response.notFound(res, err.message);
      throw err;
    }
  },

  verify: async (req, res) => {
    const dis = await DisabilitiesService.verifyFolio(req.params.folio);
    if (!dis) return Response.notFound(res, 'Folio no encontrado o inválido');
    return Response.ok(res, dis);
  },
};

/* ════════════════════════════════════════
   VALIDADORES
════════════════════════════════════════ */
const generateValidators = [
  body('patientId').isUUID().withMessage('ID de paciente inválido'),
  body('type').notEmpty().withMessage('Tipo de incapacidad requerido'),
  body('diagnosis').notEmpty().withMessage('Diagnóstico requerido'),
  body('startDate').isISO8601().withMessage('Fecha de inicio inválida'),
  body('endDate').isISO8601().withMessage('Fecha de fin inválida'),
  body('days').isInt({ min: 1, max: 365 }).withMessage('Días inválidos (1-365)'),
];

/* ════════════════════════════════════════
   RUTAS
════════════════════════════════════════ */
router.use(authenticate, resolveTenant);

router.get('/',                                      requirePermission('disabilities:read'),  asyncHandler(DisabilitiesController.list));
router.get('/:id/pdf', param('id').isUUID(),         requirePermission('disabilities:read'),  validate, auditLog('disability:download'), asyncHandler(DisabilitiesController.downloadPDF));

router.post('/generate', generateValidators,          requirePermission('disabilities:write'), validate,
  auditLog('disability:generate'), asyncHandler(DisabilitiesController.generate));

/* Verificación pública (sin auth) */
router.get('/verify/:folio', asyncHandler(DisabilitiesController.verify));

module.exports = router;
