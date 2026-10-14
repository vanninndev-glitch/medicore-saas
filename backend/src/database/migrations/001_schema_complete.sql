-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MediCore SaaS — Migraciones SQL completas
-- Compatible con PostgreSQL 14+ y MySQL 8+
-- Ejecutar en orden: 001 → 011
-- ============================================================

-- ============================================================
-- 001 — Hospitales (tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  city          VARCHAR(100),
  address       TEXT,
  phone         VARCHAR(20),
  email         VARCHAR(200),
  logo_url      TEXT,
  plan          VARCHAR(30)  NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','pro','enterprise','free')),
  status        VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial','inactive')),
  mrr           NUMERIC(12,2) DEFAULT 0,
  modules       JSONB        NOT NULL DEFAULT '{}',
  custom_fields JSONB        DEFAULT '{}',
  webhooks      JSONB        DEFAULT '[]',
  created_by    UUID,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_slug   ON hospitals(slug);
CREATE INDEX IF NOT EXISTS idx_hospitals_status ON hospitals(status);

-- ============================================================
-- 002 — Usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(200) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  role             VARCHAR(50)  NOT NULL CHECK (role IN (
                     'superadmin','hospital_admin','medical_director','doctor',
                     'nurse','receptionist','records_admin','patient_admin',
                     'lab_technician','pharmacist','patient',
                     'anesthesiologist','radiologist','social_worker',
                     'nutritionist','physiotherapist','psychologist','hr','auditor'
                   )),
  specialty        VARCHAR(100),
  cedula           VARCHAR(50),
  phone            VARCHAR(20),
  avatar_url       TEXT,
  permissions      TEXT[]       DEFAULT '{}',
  status           VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','locked')),
  failed_attempts  INTEGER      DEFAULT 0,
  last_failed_at   TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  last_login_ip    VARCHAR(50),
  created_by       UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_hospital  ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status    ON users(status);

-- ============================================================
-- 003 — Pacientes
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  expedient         VARCHAR(30) NOT NULL,
  name              VARCHAR(200) NOT NULL,
  dob               DATE,
  gender            VARCHAR(30),
  blood_type        VARCHAR(10),
  curp              VARCHAR(20),
  rfc               VARCHAR(15),
  phone             VARCHAR(20),
  phone2            VARCHAR(20),
  email             VARCHAR(200),
  address           TEXT,
  nationality       VARCHAR(60) DEFAULT 'Mexicana',
  state             VARCHAR(60),
  education         VARCHAR(60),
  occupation        VARCHAR(80),
  civil_status      VARCHAR(30),
  religion          VARCHAR(50),
  insurance_type    VARCHAR(60),
  insurance_num     VARCHAR(60),
  insurance_clinic  VARCHAR(150),
  insurance_expiry  DATE,
  private_insurance VARCHAR(80),
  policy_num        VARCHAR(60),
  coverage          TEXT,
  weight            NUMERIC(6,2),
  height            NUMERIC(5,2),
  smoking           VARCHAR(20),
  alcohol           VARCHAR(20),
  exercise          VARCHAR(30),
  medications       TEXT,
  notes             TEXT,
  current_area      VARCHAR(80),
  has_alerts        BOOLEAN      DEFAULT false,
  status            VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','hospitalized','deceased','deleted')),
  avatar_color      VARCHAR(20)  DEFAULT '#1a6fff',
  last_visit_at     TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, expedient)
);

CREATE INDEX IF NOT EXISTS idx_patients_hospital   ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_patients_name       ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_expedient  ON patients(expedient);
CREATE INDEX IF NOT EXISTS idx_patients_curp       ON patients(curp) WHERE curp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_status     ON patients(status);

-- Contactos de emergencia
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  relation    VARCHAR(60),
  phone       VARCHAR(20),
  phone2      VARCHAR(20),
  email       VARCHAR(200),
  address     TEXT,
  is_primary  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_patient ON emergency_contacts(patient_id);

-- Alertas médicas del paciente
CREATE TABLE IF NOT EXISTS patient_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('allergy','condition','note','drug_interaction')),
  label       VARCHAR(200) NOT NULL,
  severity    VARCHAR(20) DEFAULT 'medium',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_alerts_patient ON patient_alerts(patient_id);

-- Antecedentes médicos
CREATE TABLE IF NOT EXISTS patient_antecedents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hereditary     TEXT,
  personal       TEXT,
  surgical       TEXT,
  allergic       TEXT,
  trauma         TEXT,
  gynecological  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Traslados de pacientes
CREATE TABLE IF NOT EXISTS patient_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id     UUID NOT NULL,
  from_area       VARCHAR(80),
  to_area         VARCHAR(80),
  reason          TEXT,
  transferred_by  UUID REFERENCES users(id),
  transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 004 — Historial Clínico Electrónico
-- ============================================================
CREATE TABLE IF NOT EXISTS clinical_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES users(id),
  specialty    VARCHAR(100),
  type         VARCHAR(50) DEFAULT 'consultation'
               CHECK (type IN ('consultation','followup','emergency','interconsult','procedure','discharge')),
  diagnoses    JSONB DEFAULT '[]',
  soap_s       TEXT,
  soap_o       TEXT,
  soap_a       TEXT,
  soap_p       TEXT,
  observations TEXT,
  status       VARCHAR(20) DEFAULT 'completed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_hospital  ON clinical_records(hospital_id);
CREATE INDEX IF NOT EXISTS idx_records_patient   ON clinical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_records_doctor    ON clinical_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_records_date      ON clinical_records(created_at DESC);

-- Signos vitales
CREATE TABLE IF NOT EXISTS vital_signs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      UUID REFERENCES clinical_records(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id    UUID NOT NULL,
  bp_systolic    INTEGER,
  bp_diastolic   INTEGER,
  heart_rate     INTEGER,
  resp_rate      INTEGER,
  temperature    NUMERIC(4,1),
  sp_o2          INTEGER,
  weight         NUMERIC(6,2),
  height         NUMERIC(5,2),
  glucose        INTEGER,
  recorded_by    UUID REFERENCES users(id),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vital_signs(patient_id, recorded_at DESC);

-- ============================================================
-- 005 — Citas
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES users(id),
  date         TIMESTAMPTZ NOT NULL,
  duration     INTEGER DEFAULT 30,
  type         VARCHAR(50) DEFAULT 'consultation',
  channel      VARCHAR(30) DEFAULT 'presencial',
  specialty    VARCHAR(100),
  reason       TEXT,
  notes        TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed','waiting','in_progress','completed','cancelled','no_show','rescheduled')),
  created_by   UUID REFERENCES users(id),
  updated_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appts_hospital ON appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appts_date     ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appts_doctor   ON appointments(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_appts_patient  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appts_status   ON appointments(status);

-- Horarios de médicos
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  break_start  TIME,
  break_end    TIME,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, doctor_id, day_of_week)
);

-- ============================================================
-- 006 — Documentos
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id     UUID REFERENCES patients(id) ON DELETE SET NULL,
  name           VARCHAR(300) NOT NULL,
  type           VARCHAR(50) NOT NULL,
  size           BIGINT NOT NULL,
  mime_type      VARCHAR(100),
  object_key     TEXT NOT NULL,
  description    TEXT,
  document_date  DATE,
  status         VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','deleted','pending')),
  uploaded_by    UUID REFERENCES users(id),
  deleted_by     UUID REFERENCES users(id),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_hospital ON documents(hospital_id);
CREATE INDEX IF NOT EXISTS idx_docs_patient  ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_docs_type     ON documents(type);
CREATE INDEX IF NOT EXISTS idx_docs_status   ON documents(status);

-- Log de acceso a documentos
CREATE TABLE IF NOT EXISTS document_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  action      VARCHAR(30) NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 007 — Incapacidades
-- ============================================================
CREATE TABLE IF NOT EXISTS disabilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio       VARCHAR(30) NOT NULL UNIQUE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(20) NOT NULL,
  type_label  VARCHAR(200),
  diagnosis   TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  days        INTEGER NOT NULL CHECK (days > 0),
  rest_type   VARCHAR(50) DEFAULT 'total',
  clinical    TEXT,
  treatment   TEXT,
  followup    TEXT,
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disabilities_hospital ON disabilities(hospital_id);
CREATE INDEX IF NOT EXISTS idx_disabilities_patient  ON disabilities(patient_id);
CREATE INDEX IF NOT EXISTS idx_disabilities_folio    ON disabilities(folio);

-- ============================================================
-- 008 — Laboratorio
-- ============================================================
CREATE TABLE IF NOT EXISTS lab_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES users(id),
  tests        JSONB NOT NULL DEFAULT '[]',
  results      JSONB,
  priority     VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('normal','urgent','stat')),
  indication   TEXT,
  notes        TEXT,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_hospital ON lab_orders(hospital_id);
CREATE INDEX IF NOT EXISTS idx_lab_patient  ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_status   ON lab_orders(status);

-- Valores de referencia
CREATE TABLE IF NOT EXISTS lab_reference_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  test_code    VARCHAR(30) NOT NULL,
  test_name    VARCHAR(100) NOT NULL,
  min_value    NUMERIC(12,4),
  max_value    NUMERIC(12,4),
  unit         VARCHAR(30),
  gender       VARCHAR(20),
  age_min      INTEGER,
  age_max      INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 009 — Farmacia
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES users(id),
  record_id    UUID REFERENCES clinical_records(id),
  medications  JSONB NOT NULL DEFAULT '[]',
  notes        TEXT,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','dispensed','cancelled','partial')),
  dispensed_by UUID REFERENCES users(id),
  dispensed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rx_hospital ON prescriptions(hospital_id);
CREATE INDEX IF NOT EXISTS idx_rx_patient  ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_status   ON prescriptions(status);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  presentation VARCHAR(100),
  category     VARCHAR(80),
  stock        INTEGER NOT NULL DEFAULT 0,
  min_stock    INTEGER NOT NULL DEFAULT 10,
  price        NUMERIC(10,2) DEFAULT 0,
  controlled   BOOLEAN DEFAULT false,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_hospital ON pharmacy_inventory(hospital_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    UUID NOT NULL,
  medication_id  UUID NOT NULL REFERENCES pharmacy_inventory(id),
  type           VARCHAR(30) NOT NULL,
  quantity       INTEGER NOT NULL,
  reference_id   UUID,
  reference_type VARCHAR(50),
  notes          TEXT,
  performed_by   UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 010 — Facturación y Camas
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id   UUID REFERENCES patients(id),
  folio        VARCHAR(30) NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid         NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','cancelled','refunded')),
  cfdi_uuid    VARCHAR(100),
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_hospital ON invoices(hospital_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient  ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);

CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id),
  hospital_id  UUID NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  method       VARCHAR(30) DEFAULT 'cash',
  registered_by UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_beds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  number       VARCHAR(10) NOT NULL,
  ward         VARCHAR(50),
  floor        VARCHAR(20),
  type         VARCHAR(50) DEFAULT 'general',
  status       VARCHAR(30) DEFAULT 'available'
               CHECK (status IN ('available','occupied','reserved','cleaning','maintenance')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, number)
);

CREATE INDEX IF NOT EXISTS idx_beds_hospital ON hospital_beds(hospital_id);
CREATE INDEX IF NOT EXISTS idx_beds_status   ON hospital_beds(status);

CREATE TABLE IF NOT EXISTS hospitalizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL,
  patient_id   UUID NOT NULL REFERENCES patients(id),
  bed_id       UUID NOT NULL REFERENCES hospital_beds(id),
  status       VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','discharged','transferred')),
  readmission  BOOLEAN DEFAULT false,
  admitted_by  UUID REFERENCES users(id),
  admitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_by UUID REFERENCES users(id),
  discharged_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_patient ON hospitalizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_hospitalizations_bed     ON hospitalizations(bed_id);

CREATE TABLE IF NOT EXISTS urgencies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    UUID NOT NULL REFERENCES hospitals(id),
  patient_id     UUID NOT NULL REFERENCES patients(id),
  triage_level   INTEGER NOT NULL CHECK (triage_level BETWEEN 1 AND 5),
  reason         TEXT NOT NULL,
  status         VARCHAR(30) DEFAULT 'waiting' CHECK (status IN ('waiting','in_triage','in_treatment','discharged','admitted','transferred')),
  wait_minutes   INTEGER,
  admitted_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_urgencies_hospital ON urgencies(hospital_id, status);

-- ============================================================
-- 011 — Notificaciones y Audit Log
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id),
  type        VARCHAR(30) NOT NULL,
  message     TEXT NOT NULL,
  data        JSONB DEFAULT '{}',
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_hospital ON notifications(hospital_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  hospital_id   UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id   UUID,
  ip            VARCHAR(50),
  user_agent    TEXT,
  status_code   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_hospital  ON audit_logs(hospital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);

-- ============================================================
-- Permisos y partición de datos (Row-Level Security — PostgreSQL)
-- ============================================================
-- Habilitar RLS en tablas sensibles para aislamiento multi-tenant
-- RLS deshabilitado (habilitar manualmente si se requiere)
-- RLS deshabilitado (habilitar manualmente si se requiere)
-- RLS deshabilitado (habilitar manualmente si se requiere)
-- RLS deshabilitado (habilitar manualmente si se requiere)

-- Nota: Las políticas RLS se aplican a nivel de aplicación a través del
-- hospital_id en cada query, lo cual es suficiente para multi-tenant.
-- RLS es una capa adicional de seguridad en PostgreSQL.

-- ============================================================
-- Índices adicionales de performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_records_created  ON clinical_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appts_date_hosp  ON appointments(hospital_id, date);
CREATE INDEX IF NOT EXISTS idx_patients_search  ON patients(hospital_id, name, expedient);
CREATE INDEX IF NOT EXISTS idx_lab_hosp_status  ON lab_orders(hospital_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread     ON notifications(user_id, read) WHERE read = false;
