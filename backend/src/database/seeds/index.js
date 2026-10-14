/**
 * MediCore SaaS — database/seeds/index.js
 * Datos de demostración para desarrollo y testing
 * Crea hospital demo con usuarios, pacientes, citas, historial y más
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const DB     = require('../../config/database');
const logger = require('../../utils/logger');

/* ══════════════════════════════════════════
   IDs FIJOS para relaciones coherentes
══════════════════════════════════════════ */
const IDS = {
  hospital:   '00000000-0000-0000-0000-000000000001',
  superadmin: '00000000-0000-0000-0000-000000000010',
  admin:      '00000000-0000-0000-0000-000000000011',
  director:   '00000000-0000-0000-0000-000000000012',
  doctor1:    '00000000-0000-0000-0000-000000000013',
  doctor2:    '00000000-0000-0000-0000-000000000014',
  doctor3:    '00000000-0000-0000-0000-000000000015',
  nurse1:     '00000000-0000-0000-0000-000000000016',
  receptionist:'00000000-0000-0000-0000-000000000017',
  labtech:    '00000000-0000-0000-0000-000000000018',
  pharmacist: '00000000-0000-0000-0000-000000000019',
  patient1:   '00000000-0000-0000-0000-000000000020',
  patient2:   '00000000-0000-0000-0000-000000000021',
  patient3:   '00000000-0000-0000-0000-000000000022',
  patient4:   '00000000-0000-0000-0000-000000000023',
  patient5:   '00000000-0000-0000-0000-000000000024',
  patientUser:'00000000-0000-0000-0000-000000000025',
};

async function seed() {
  logger.info('[Seeds] Iniciando carga de datos demo…');

  await DB.connect();

  try {
    await DB.transaction(async (tx) => {

      /* ── Hash de contraseña demo ── */
      const demoHash = await bcrypt.hash('Demo2024!', 12);

      /* ════════════════════════════
         1. HOSPITAL DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando hospital demo…');
      await tx.query(`
        INSERT INTO hospitals (id, name, slug, city, address, phone, email, plan, status, mrr, modules, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          IDS.hospital,
          'Hospital Demo MediCore',
          'demo',
          'Zitácuaro, Michoacán',
          'Av. Revolución 100, Centro, Zitácuaro, Mich. CP 61500',
          '7151234567',
          'contacto@hospitaldemo.mx',
          'enterprise',
          'active',
          18500,
          JSON.stringify({
            lab: true, pharmacy: true, billing: true, telemedicine: true,
            dicom: true, hr: true, research: true, teaching: true,
          }),
        ]
      );

      /* ════════════════════════════
         2. USUARIOS
      ════════════════════════════ */
      logger.info('[Seeds] Creando usuarios demo…');
      const users = [
        { id: IDS.superadmin, hospital: null,         name: 'Superadministrador MediCore', email: 'superadmin@medicore.demo',    role: 'superadmin',         specialty: null,              cedula: null },
        { id: IDS.admin,      hospital: IDS.hospital, name: 'Dr. Roberto Administrador',  email: 'admin@medicore.demo',         role: 'hospital_admin',     specialty: null,              cedula: null },
        { id: IDS.director,   hospital: IDS.hospital, name: 'Dr. Luis Pérez Morales',     email: 'director@medicore.demo',      role: 'medical_director',   specialty: 'Medicina Interna',cedula: '1234567' },
        { id: IDS.doctor1,    hospital: IDS.hospital, name: 'Dr. Carlos Rodríguez Pérez', email: 'doctor@medicore.demo',        role: 'doctor',             specialty: 'Medicina Interna',cedula: '2345678' },
        { id: IDS.doctor2,    hospital: IDS.hospital, name: 'Dra. Ana Martínez López',    email: 'doctor2@medicore.demo',       role: 'doctor',             specialty: 'Cardiología',     cedula: '3456789' },
        { id: IDS.doctor3,    hospital: IDS.hospital, name: 'Dr. Roberto García Sánchez', email: 'doctor3@medicore.demo',       role: 'doctor',             specialty: 'Neurología',      cedula: '4567890' },
        { id: IDS.nurse1,     hospital: IDS.hospital, name: 'Enf. Patricia Romero Cruz',  email: 'enfermera@medicore.demo',     role: 'nurse',              specialty: null,              cedula: null },
        { id: IDS.receptionist,hospital: IDS.hospital,name: 'Lic. Sofía Castro Vega',    email: 'recepcion@medicore.demo',     role: 'receptionist',       specialty: null,              cedula: null },
        { id: IDS.labtech,    hospital: IDS.hospital, name: 'TLM. Jorge Flores Ríos',     email: 'laboratorio@medicore.demo',   role: 'lab_technician',     specialty: null,              cedula: null },
        { id: IDS.pharmacist, hospital: IDS.hospital, name: 'QFB. Laura Sánchez Reyes',   email: 'farmacia@medicore.demo',      role: 'pharmacist',         specialty: null,              cedula: null },
        { id: IDS.patientUser,hospital: IDS.hospital, name: 'María García López',          email: 'paciente@medicore.demo',      role: 'patient',            specialty: null,              cedula: null },
      ];

      for (const u of users) {
        await tx.query(`
          INSERT INTO users (id, hospital_id, name, email, password_hash, role, specialty, cedula, status, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW())
          ON CONFLICT (id) DO NOTHING`,
          [u.id, u.hospital, u.name, u.email, demoHash, u.role, u.specialty, u.cedula]
        );
      }

      /* ── Horarios de médicos (lunes a viernes 08:00-17:00) ── */
      for (const doctorId of [IDS.doctor1, IDS.doctor2, IDS.doctor3]) {
        for (let day = 1; day <= 5; day++) {
          await tx.query(`
            INSERT INTO doctor_schedules (id, hospital_id, doctor_id, day_of_week, start_time, end_time, break_start, break_end, is_active, created_at)
            VALUES ($1,$2,$3,$4,'08:00','17:00','14:00','15:00',true,NOW())
            ON CONFLICT (hospital_id, doctor_id, day_of_week) DO NOTHING`,
            [uuidv4(), IDS.hospital, doctorId, day]
          );
        }
      }

      /* ════════════════════════════
         3. PACIENTES DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando pacientes demo…');
      const patients = [
        { id: IDS.patient1, expedient: 'EXP-2024-0001', name: 'María García López',      dob: '1985-06-15', gender: 'Femenino',  blood: 'A+',  phone: '5512345678', insurance: 'IMSS',       insuranceNum: '87654321200', color: '#1a6fff', curp: 'GALM850615MDFRRR09' },
        { id: IDS.patient2, expedient: 'EXP-2024-0002', name: 'Carlos Mendoza Ruiz',    dob: '1978-03-22', gender: 'Masculino', blood: 'O+',  phone: '5523456789', insurance: 'ISSSTE',     insuranceNum: '12345678901', color: '#00d4ff', curp: 'MERC780322HDFNRR02' },
        { id: IDS.patient3, expedient: 'EXP-2024-0003', name: 'Ana Jiménez Torres',     dob: '1992-11-08', gender: 'Femenino',  blood: 'B+',  phone: '5534567890', insurance: 'Privado',    insuranceNum: 'POL-001234',  color: '#00e5a0', curp: 'JITA921108MDFMRN07' },
        { id: IDS.patient4, expedient: 'EXP-2024-0004', name: 'Roberto Silva Peña',     dob: '1965-07-14', gender: 'Masculino', blood: 'AB+', phone: '5545678901', insurance: 'Sin seguro', insuranceNum: null,          color: '#ffb347', curp: 'SIPR650714HMCLNB03' },
        { id: IDS.patient5, expedient: 'EXP-2024-0005', name: 'Lucía Hernández Vega',   dob: '1990-02-28', gender: 'Femenino',  blood: 'O-',  phone: '5556789012', insurance: 'IMSS',       insuranceNum: '98765432100', color: '#a78bfa', curp: 'HEVL900228MDFRGC08' },
      ];

      for (const p of patients) {
        await tx.query(`
          INSERT INTO patients (id, hospital_id, expedient, name, dob, gender, blood_type, phone, insurance_type, insurance_num, curp, avatar_color, status, created_by, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,NOW(),NOW())
          ON CONFLICT (id) DO NOTHING`,
          [p.id, IDS.hospital, p.expedient, p.name, p.dob, p.gender, p.blood, p.phone, p.insurance, p.insuranceNum, p.curp, p.color, IDS.admin]
        );
      }

      /* ── Alertas para paciente1 ── */
      await tx.query(`
        INSERT INTO patient_alerts (id, patient_id, type, label, created_at) VALUES
        ($1,$2,'allergy','Alergia: Penicilina',NOW()),
        ($3,$2,'allergy','Alergia: Ibuprofeno',NOW()),
        ($4,$2,'condition','DM Tipo 2',NOW()),
        ($5,$2,'condition','HTA',NOW())
        ON CONFLICT DO NOTHING`,
        [uuidv4(), IDS.patient1, uuidv4(), uuidv4(), uuidv4()]
      );
      await tx.query(`UPDATE patients SET has_alerts = true WHERE id = $1`, [IDS.patient1]);

      /* ── Contacto de emergencia ── */
      await tx.query(`
        INSERT INTO emergency_contacts (id, patient_id, name, relation, phone, is_primary, created_at)
        VALUES ($1,$2,'Pedro García López','Esposo','5587654321',true,NOW())
        ON CONFLICT DO NOTHING`,
        [uuidv4(), IDS.patient1]
      );

      /* ════════════════════════════
         4. NOTAS CLÍNICAS DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando historial clínico demo…');
      const now = new Date();

      const record1Id = uuidv4();
      await tx.query(`
        INSERT INTO clinical_records (id, hospital_id, patient_id, doctor_id, specialty, type, diagnoses, soap_s, soap_o, soap_a, soap_p, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'Medicina Interna','consultation',$5::jsonb,$6,$7,$8,$9,'completed',$10,NOW())
        ON CONFLICT DO NOTHING`,
        [
          record1Id, IDS.hospital, IDS.patient1, IDS.doctor1,
          JSON.stringify([{ code: 'J06.9', desc: 'Infección aguda vías respiratorias superiores' }]),
          'Paciente refiere dolor de garganta, fiebre de 38.5°C y malestar general de 3 días de evolución.',
          'FC: 88/min, FR: 18/min, T: 38.5°C, TA: 130/80 mmHg. Faringe eritematosa. Pulmones limpios.',
          'Faringoamigdalitis aguda viral. Descartar estreptocócica.',
          'Paracetamol 500mg c/8h × 5 días. Hidratación oral. Reposo.',
          new Date(Date.now() - 2*86400000),
        ]
      );

      await tx.query(`
        INSERT INTO vital_signs (id, record_id, patient_id, hospital_id, bp_systolic, bp_diastolic, heart_rate, temperature, weight, height, glucose, recorded_by, recorded_at)
        VALUES ($1,$2,$3,$4,130,80,88,38.5,68,165,105,$5,NOW())
        ON CONFLICT DO NOTHING`,
        [uuidv4(), record1Id, IDS.patient1, IDS.hospital, IDS.doctor1]
      );

      /* Nota 2 — endocrinología */
      await tx.query(`
        INSERT INTO clinical_records (id, hospital_id, patient_id, doctor_id, specialty, type, diagnoses, soap_s, soap_o, soap_a, soap_p, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'Endocrinología','followup',$5::jsonb,$6,$7,$8,$9,'completed',$10,NOW())
        ON CONFLICT DO NOTHING`,
        [
          uuidv4(), IDS.hospital, IDS.patient1, IDS.doctor2,
          JSON.stringify([{ code: 'E11.9', desc: 'Diabetes mellitus tipo 2 sin complicaciones' }]),
          'Control de DM2. Refiere buena adherencia al tratamiento. Sin hipoglucemias.',
          'Glucosa ayunas: 148 mg/dL. HbA1c: 7.2%. TA: 125/80. Peso: 68kg.',
          'DM2 con control subóptimo. Ajuste de dosis de Metformina.',
          'Metformina 850mg c/12h. Dieta hipoglucémica. Control HbA1c en 3 meses.',
          new Date(Date.now() - 30*86400000),
        ]
      );

      /* ════════════════════════════
         5. CITAS DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando citas demo…');
      const appts = [
        { patient: IDS.patient1, doctor: IDS.doctor1, daysFrom:  5, status: 'confirmed',  specialty: 'Medicina Interna', type: 'followup',     hour: 10 },
        { patient: IDS.patient2, doctor: IDS.doctor2, daysFrom:  2, status: 'confirmed',  specialty: 'Cardiología',      type: 'primera_vez',  hour: 9  },
        { patient: IDS.patient3, doctor: IDS.doctor1, daysFrom:  0, status: 'in_progress',specialty: 'Medicina Interna', type: 'consultation', hour: 8  },
        { patient: IDS.patient4, doctor: IDS.doctor3, daysFrom:  7, status: 'confirmed',  specialty: 'Neurología',       type: 'primera_vez',  hour: 11 },
        { patient: IDS.patient5, doctor: IDS.doctor2, daysFrom: -1, status: 'completed',  specialty: 'Cardiología',      type: 'followup',     hour: 14 },
      ];

      for (const a of appts) {
        const date = new Date();
        date.setDate(date.getDate() + a.daysFrom);
        date.setHours(a.hour, 0, 0, 0);
        await tx.query(`
          INSERT INTO appointments (id, hospital_id, patient_id, doctor_id, date, duration, type, channel, specialty, status, created_by, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,30,$6,'presencial',$7,$8,$9,NOW(),NOW())
          ON CONFLICT DO NOTHING`,
          [uuidv4(), IDS.hospital, a.patient, a.doctor, date.toISOString(), a.type, a.specialty, a.status, IDS.receptionist]
        );
      }

      /* ════════════════════════════
         6. INCAPACIDAD DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando incapacidad demo…');
      await tx.query(`
        INSERT INTO disabilities (id, folio, hospital_id, patient_id, doctor_id, type, type_label, diagnosis, start_date, end_date, days, rest_type, clinical, treatment, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'ST7','ST-7 — Incapacidad temporal por enfermedad general','J06.9 — Infección aguda vías respiratorias superiores','2024-11-01','2024-11-03',3,'total','Faringoamigdalitis aguda viral con fiebre de 38.5°C','Paracetamol 500mg c/8h. Reposo. Hidratación.','active',NOW(),NOW())
        ON CONFLICT DO NOTHING`,
        [uuidv4(), 'INC-2024-000001', IDS.hospital, IDS.patient1, IDS.doctor1]
      );

      /* ════════════════════════════
         7. LABORATORIO DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando órdenes de lab demo…');
      await tx.query(`
        INSERT INTO lab_orders (id, hospital_id, patient_id, doctor_id, tests, results, priority, indication, status, completed_at, completed_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'normal','Control DM2','completed',NOW(),$7,NOW(),NOW())
        ON CONFLICT DO NOTHING`,
        [
          uuidv4(), IDS.hospital, IDS.patient1, IDS.doctor1,
          JSON.stringify([{ id:'glu', name:'Glucosa en ayunas' }, { id:'hba1c', name:'HbA1c' }]),
          JSON.stringify([
            { name:'Glucosa', value:148, unit:'mg/dL', min:70, max:100, status:'high' },
            { name:'HbA1c',   value:7.2, unit:'%',     min:0,  max:5.7, status:'high' },
          ]),
          IDS.labtech,
        ]
      );

      /* Valores de referencia comunes */
      const refs = [
        ['glu',  'Glucosa en ayunas', 70,   100,  'mg/dL'],
        ['hba1c','HbA1c',              0,    5.7,  '%'],
        ['creat','Creatinina',          0.6,  1.2,  'mg/dL'],
        ['col',  'Colesterol total',    0,    200,  'mg/dL'],
        ['trig', 'Triglicéridos',       0,    150,  'mg/dL'],
        ['tsh',  'TSH',                 0.4,  4.0,  'mUI/L'],
        ['urea', 'Urea',               15,   45,   'mg/dL'],
      ];

      for (const [code, name, min, max, unit] of refs) {
        await tx.query(`
          INSERT INTO lab_reference_values (id, hospital_id, test_code, test_name, min_value, max_value, unit, created_at)
          VALUES ($1,NULL,$2,$3,$4,$5,$6,NOW()) ON CONFLICT DO NOTHING`,
          [uuidv4(), code, name, min, max, unit]
        );
      }

      /* ════════════════════════════
         8. INVENTARIO FARMACIA DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando inventario de farmacia demo…');
      const meds = [
        ['Metformina',    '500mg tabletas',   'Antidiabético',    450, 50,  12.50, false],
        ['Losartán',      '50mg tabletas',    'Antihipertensivo', 320, 40,  18.00, false],
        ['Atorvastatina', '20mg tabletas',    'Hipolipemiante',   280, 40,  22.00, false],
        ['Omeprazol',     '20mg cápsulas',    'Gastroprotector',  500, 60,  8.50,  false],
        ['Amoxicilina',   '500mg cápsulas',   'Antibiótico',      200, 30,  9.00,  false],
        ['Paracetamol',   '500mg tabletas',   'Analgésico',       800, 100, 4.50,  false],
        ['Ibuprofeno',    '400mg tabletas',   'AINE',             350, 50,  6.00,  false],
        ['Clonazepam',    '0.5mg tabletas',   'Ansiolítico',      80,  20,  15.00, true ],
        ['Tramadol',      '50mg cápsulas',    'Analgésico opioide',60, 15,  28.00, true ],
        ['Insulina NPH',  '100UI/mL vial',    'Insulina',         45,  10, 185.00, false],
        ['Salbutamol',    '100mcg inhalador', 'Broncodilatador',  90,  15,  95.00, false],
        ['Levotiroxina',  '50mcg tabletas',   'Hormonal',         240, 30,  14.00, false],
      ];

      for (const [name, presentation, category, stock, minStock, price, controlled] of meds) {
        await tx.query(`
          INSERT INTO pharmacy_inventory (id, hospital_id, name, presentation, category, stock, min_stock, price, controlled, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) ON CONFLICT DO NOTHING`,
          [uuidv4(), IDS.hospital, name, presentation, category, stock, minStock, price, controlled]
        );
      }

      /* ════════════════════════════
         9. CAMAS DEMO (20 camas)
      ════════════════════════════ */
      logger.info('[Seeds] Creando camas demo…');
      const statuses = ['available','available','available','occupied','occupied','occupied','occupied','reserved','cleaning','maintenance'];

      for (let i = 1; i <= 20; i++) {
        const ward   = i <= 10 ? 'A' : 'B';
        const num    = i <= 10 ? i : i - 10;
        const status = statuses[(i - 1) % statuses.length];
        await tx.query(`
          INSERT INTO hospital_beds (id, hospital_id, number, ward, floor, type, status, created_at, updated_at)
          VALUES ($1,$2,$3,$4,'1','general',$5,NOW(),NOW())
          ON CONFLICT (hospital_id, number) DO NOTHING`,
          [uuidv4(), IDS.hospital, `${ward}${String(num).padStart(2,'0')}`, ward, status]
        );
      }

      /* ════════════════════════════
         10. NOTIFICACIONES DEMO
      ════════════════════════════ */
      logger.info('[Seeds] Creando notificaciones demo…');
      const notifs = [
        { userId: IDS.doctor1,    type: 'appointment', msg: 'Nueva cita asignada: María García — mañana 10:00 AM' },
        { userId: IDS.doctor1,    type: 'lab',         msg: 'Resultados de laboratorio listos — Expediente EXP-2024-0001' },
        { userId: IDS.labtech,    type: 'lab',         msg: 'Nueva solicitud de laboratorio urgente recibida' },
        { userId: IDS.patientUser,type: 'appointment', msg: 'Su cita con Dr. Rodríguez es en 5 días a las 10:00 AM' },
        { userId: IDS.pharmacist, type: 'system',      msg: 'Medicamento Clonazepam con stock bajo: 80 unidades' },
      ];

      for (const n of notifs) {
        await tx.query(`
          INSERT INTO notifications (id, user_id, hospital_id, type, message, read, created_at)
          VALUES ($1,$2,$3,$4,$5,false,NOW()) ON CONFLICT DO NOTHING`,
          [uuidv4(), n.userId, IDS.hospital, n.type, n.msg]
        );
      }

      logger.info('[Seeds] ✅ Todos los datos demo cargados correctamente');
    });

    logger.info('\n╔══════════════════════════════════════╗');
    logger.info('║   CREDENCIALES DE DEMO                ║');
    logger.info('╠══════════════════════════════════════╣');
    logger.info('║  Superadmin: superadmin@medicore.demo ║');
    logger.info('║  Admin Hosp: admin@medicore.demo       ║');
    logger.info('║  Doctor:     doctor@medicore.demo      ║');
    logger.info('║  Enfermera:  enfermera@medicore.demo   ║');
    logger.info('║  Laboratorio:laboratorio@medicore.demo ║');
    logger.info('║  Farmacia:   farmacia@medicore.demo    ║');
    logger.info('║  Paciente:   paciente@medicore.demo    ║');
    logger.info('║  Password:   Demo2024!                 ║');
    logger.info('╚══════════════════════════════════════╝\n');

  } catch (err) {
    logger.error('[Seeds] Error:', err);
    throw err;
  } finally {
    await DB.close();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
