/**
 * MediCore SaaS — patients/profile.js
 * Perfil completo del paciente: datos, historial SOAP, docs, citas, laboratorio
 */

import { API }        from '../../core/api.js';
import { Auth }       from '../../core/auth.js';
import { Toast }      from '../../components/toast.js';
import { DateUtils, Format, DOM } from '../../core/utils.js';

/* ══════════════════════════════════
   DEMO PATIENT
══════════════════════════════════ */
const DEMO_PATIENT = {
  id: 'PAC-0001',
  expedient: 'EXP-2024-1001',
  name: 'María García López',
  dob: '1985-06-15',
  gender: 'Femenino',
  bloodType: 'A+',
  curp: 'GALM850615MDFRPR09',
  phone: '5512345678',
  email: 'maria.garcia@ejemplo.com',
  address: 'Calle Morelos 245, Col. Centro, CDMX',
  insurance: 'IMSS',
  insuranceNum: '87654321200',
  emergency: { name: 'Pedro García', relation: 'Esposo', phone: '5587654321' },
  area: 'Consulta Externa',
  status: 'active',
  avatarColor: '#1a6fff',
  alerts: [
    { type: 'allergy',   label: 'Alergia: Penicilina' },
    { type: 'allergy',   label: 'Alergia: Ibuprofeno' },
    { type: 'condition', label: 'DM Tipo 2' },
    { type: 'condition', label: 'HTA' },
  ],
  records: [
    {
      id: 'HCE-001',
      date: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
      doctor: 'Dr. Rodríguez Pérez',
      specialty: 'Medicina Interna',
      diagnosis: 'J06.9 - Infección aguda vías respiratorias superiores',
      soap: {
        S: 'Paciente refiere dolor de garganta, fiebre de 38.5°C, malestar general de 3 días de evolución. Niega dificultad respiratoria.',
        O: 'FC: 88/min, FR: 18/min, T: 38.5°C, TA: 130/80 mmHg. Faringe eritematosa, amígdalas sin exudado. Pulmones limpios.',
        A: 'Faringoamigdalitis aguda viral. Descartar estreptocócica. Control de glucosa por DM2.',
        P: 'Paracetamol 500mg c/8h × 5d. Hidratación oral. Reposo. Control en 5 días o antes si empeora.',
      },
    },
    {
      id: 'HCE-002',
      date: new Date(Date.now() - 30*24*60*60*1000).toISOString(),
      doctor: 'Dra. Martínez López',
      specialty: 'Endocrinología',
      diagnosis: 'E11.9 - Diabetes mellitus tipo 2 sin complicaciones',
      soap: {
        S: 'Paciente acude a control de DM2. Refiere buena adherencia a tratamiento. Sin episodios hipoglucémicos.',
        O: 'Glucosa ayunas: 148 mg/dL. HbA1c: 7.2%. TA: 125/80. Peso: 68kg. IMC: 26.3.',
        A: 'DM2 con control subóptimo. Ajuste de metformina. Continuar con dieta.',
        P: 'Metformina 850mg c/12h. Dieta hipoglucémica. Control en 3 meses con HbA1c.',
      },
    },
  ],
  appointments: [
    { id: 'CIT-001', date: new Date(Date.now() + 5*24*60*60*1000).toISOString(), doctor: 'Dr. Rodríguez', type: 'Seguimiento', status: 'confirmed' },
    { id: 'CIT-002', date: new Date(Date.now() + 35*24*60*60*1000).toISOString(), doctor: 'Dra. Martínez', type: 'Control DM2', status: 'confirmed' },
  ],
  documents: [
    { id: 'DOC-001', name: 'Incapacidad_2024_0891.pdf', type: 'Incapacidad', size: 245000, date: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
    { id: 'DOC-002', name: 'Lab_glucosa_HbA1c.pdf',    type: 'Laboratorio', size: 182000, date: new Date(Date.now() - 30*24*60*60*1000).toISOString() },
    { id: 'DOC-003', name: 'Receta_Metformina.pdf',    type: 'Receta',      size: 98000,  date: new Date(Date.now() - 30*24*60*60*1000).toISOString() },
  ],
  vitals: [
    { date: '2024-11-01', bp: '130/80', hr: 88, temp: 38.5, weight: 68, glucose: 148 },
    { date: '2024-10-01', bp: '128/78', hr: 82, temp: 36.8, weight: 67.5, glucose: 155 },
    { date: '2024-09-01', bp: '132/82', hr: 86, temp: 36.7, weight: 68.2, glucose: 162 },
  ],
};

/* ══════════════════════════════════
   CLASE PRINCIPAL
══════════════════════════════════ */
export class PatientProfile {
  constructor() {
    this.user      = Auth.getUser();
    this.patientId = new URLSearchParams(window.location.search).get('id');
    this.patient   = null;
    this.activeTab = 'records';
  }

  async init() {
    if (!this.patientId) {
      window.location.href = '/pages/patients/index.html';
      return;
    }
    await this._loadPatient();
    this._renderProfile();
    this._bindTabs();
    this._bindActions();
  }

  /* ── Cargar paciente ── */
  async _loadPatient() {
    const res = await API.get(`/patients/${this.patientId}`);
    this.patient = res.success ? res.data : { ...DEMO_PATIENT, id: this.patientId };
  }

  /* ── Render principal ── */
  _renderProfile() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const p        = this.patient;
    const age      = DateUtils.age(p.dob);
    const initials = Format.initials(p.name);

    pc.innerHTML = `
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 mb-4" style="font-size:0.82rem;color:var(--text-muted);">
        <a href="/pages/patients/index.html" style="color:var(--accent-cyan);">Pacientes</a>
        <span>/</span>
        <span style="color:var(--text-secondary);">${p.name}</span>
      </div>

      <!-- Header del perfil -->
      <div class="patient-profile-header">
        <div class="patient-big-avatar" style="background:${p.avatarColor}22;color:${p.avatarColor};">${initials}</div>
        <div class="patient-info-block">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="patient-full-name">${p.name}</div>
            <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-red'}">
              ${p.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div class="patient-meta-row">
            <div class="patient-meta-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0"/></svg>
              ${p.expedient}
            </div>
            <div class="patient-meta-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              ${age} años · ${DateUtils.format(p.dob)}
            </div>
            <div class="patient-meta-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              ${p.gender} · Sangre: <strong style="color:var(--accent-red);">${p.bloodType}</strong>
            </div>
            <div class="patient-meta-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              ${Format.phone(p.phone)}
            </div>
            <div class="patient-meta-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              ${p.insurance} ${p.insuranceNum ? `· ${p.insuranceNum}` : ''}
            </div>
          </div>

          <!-- Alertas médicas -->
          ${p.alerts?.length ? `
            <div style="margin-top:0.75rem;">
              ${p.alerts.map(a => `
                <span class="alert-tag alert-${a.type}">
                  ${a.type === 'allergy' ? '⚠' : '●'} ${a.label}
                </span>`).join('')}
            </div>` : ''}
        </div>

        <!-- Acciones del perfil -->
        <div class="flex flex-col gap-2" style="flex-shrink:0;">
          <a href="/pages/appointments/new.html?patientId=${p.id}" class="btn btn-primary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="12" y1="11" x2="12" y2="17" stroke-linecap="round"/></svg>
            Nueva cita
          </a>
          <a href="/pages/records/new-note.html?patientId=${p.id}" class="btn btn-secondary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Nueva nota
          </a>
          <button class="btn btn-secondary btn-sm" id="btn-edit-patient">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            Editar
          </button>
        </div>
      </div>

      <!-- Tabs de navegación -->
      <div class="profile-tabs" role="tablist">
        ${[
          ['records',      'Historial clínico'],
          ['appointments', 'Citas'],
          ['documents',    'Documentos'],
          ['vitals',       'Signos vitales'],
          ['info',         'Datos personales'],
        ].map(([id, label]) => `
          <button class="profile-tab${id === this.activeTab ? ' active' : ''}"
            role="tab" data-tab="${id}" aria-selected="${id === this.activeTab}">
            ${label}
          </button>`).join('')}
      </div>

      <!-- Contenido de tabs -->
      <div id="tab-records"      class="tab-content${this.activeTab === 'records'      ? ' active' : ''}">${this._buildRecordsTab()}</div>
      <div id="tab-appointments" class="tab-content${this.activeTab === 'appointments' ? ' active' : ''}">${this._buildAppointmentsTab()}</div>
      <div id="tab-documents"    class="tab-content${this.activeTab === 'documents'    ? ' active' : ''}">${this._buildDocumentsTab()}</div>
      <div id="tab-vitals"       class="tab-content${this.activeTab === 'vitals'       ? ' active' : ''}">${this._buildVitalsTab()}</div>
      <div id="tab-info"         class="tab-content${this.activeTab === 'info'         ? ' active' : ''}">${this._buildInfoTab()}</div>`;
  }

  /* ── Tab: Historial clínico ── */
  _buildRecordsTab() {
    const records = this.patient.records || [];
    if (!records.length) return `<div style="text-align:center;padding:3rem;color:var(--text-muted);">Sin notas clínicas registradas</div>`;

    return `
      <div class="flex justify-between items-center mb-4">
        <span style="font-size:0.85rem;color:var(--text-muted);">${records.length} nota(s) clínica(s)</span>
        <a href="/pages/records/new-note.html?patientId=${this.patient.id}" class="btn btn-primary btn-sm">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva nota SOAP
        </a>
      </div>
      ${records.map(r => `
        <div class="soap-card">
          <div class="soap-header">
            <div>
              <div class="soap-date">${DateUtils.formatDateTime(r.date)}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">${r.specialty}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-cyan" style="font-size:0.7rem;">${r.diagnosis?.split(' - ')[0] || ''}</span>
              <span class="soap-doctor">${r.doctor}</span>
            </div>
          </div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;padding:0.4rem 0.7rem;background:rgba(0,212,255,0.04);border-radius:6px;border-left:2px solid rgba(0,212,255,0.3);">
            ${r.diagnosis}
          </div>
          ${['S','O','A','P'].map(key => {
            const labels = { S:'Subjetivo', O:'Objetivo', A:'Análisis / Diagnóstico', P:'Plan' };
            return r.soap?.[key] ? `
              <div class="soap-section">
                <div class="soap-section-title">${key} — ${labels[key]}</div>
                <div class="soap-section-body">${r.soap[key]}</div>
              </div>` : '';
          }).join('')}
          <div class="flex gap-2 mt-3">
            <a href="/pages/records/view.html?id=${r.id}" class="btn btn-secondary btn-sm">Ver completo</a>
            <button class="btn btn-ghost btn-sm">Imprimir</button>
          </div>
        </div>`).join('')}`;
  }

  /* ── Tab: Citas ── */
  _buildAppointmentsTab() {
    const appts = this.patient.appointments || [];
    const statusMap = {
      confirmed: ['badge-green','Confirmada'],
      pending:   ['badge-amber','Pendiente'],
      cancelled: ['badge-red','Cancelada'],
      completed: ['badge-blue','Completada'],
    };
    return `
      <div class="flex justify-between items-center mb-4">
        <span style="font-size:0.85rem;color:var(--text-muted);">${appts.length} cita(s)</span>
        <a href="/pages/appointments/new.html?patientId=${this.patient.id}" class="btn btn-primary btn-sm">Nueva cita</a>
      </div>
      ${appts.map(a => {
        const [cls, label] = statusMap[a.status] || statusMap.confirmed;
        return `
          <div class="appointment-row" style="margin-bottom:0.6rem;">
            <div class="appt-time">${DateUtils.format(a.date)}</div>
            <div class="appt-divider" style="background:var(--accent-cyan);"></div>
            <div class="appt-info">
              <div class="appt-patient">${a.doctor}</div>
              <div class="appt-type">${a.type}</div>
            </div>
            <span class="badge ${cls}" style="font-size:0.7rem;">${label}</span>
          </div>`;
      }).join('')}`;
  }

  /* ── Tab: Documentos ── */
  _buildDocumentsTab() {
    const docs = this.patient.documents || [];
    const typeIcons = {
      Incapacidad: '📋', Laboratorio: '🧪', Receta: '💊',
      Imagen: '🩻', Consentimiento: '✍️', Otro: '📄',
    };
    return `
      <div class="flex justify-between items-center mb-4">
        <span style="font-size:0.85rem;color:var(--text-muted);">${docs.length} documento(s)</span>
        <a href="/pages/documents/upload.html?patientId=${this.patient.id}" class="btn btn-primary btn-sm">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          Subir documento
        </a>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Tamaño</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            ${docs.map(d => `
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    <span style="font-size:1.1rem;">${typeIcons[d.type] || '📄'}</span>
                    <span style="font-size:0.87rem;color:var(--text-primary);">${d.name}</span>
                  </div>
                </td>
                <td><span class="badge badge-blue" style="font-size:0.7rem;">${d.type}</span></td>
                <td style="font-size:0.82rem;color:var(--text-muted);">${Format.fileSize(d.size)}</td>
                <td style="font-size:0.82rem;color:var(--text-muted);">${DateUtils.format(d.date)}</td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-ghost btn-icon btn-sm" title="Descargar">
                      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" style="color:var(--accent-red);">
                      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Tab: Signos vitales ── */
  _buildVitalsTab() {
    const vitals = this.patient.vitals || [];
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>T/A</th><th>FC (bpm)</th><th>Temp (°C)</th><th>Peso (kg)</th><th>Glucosa (mg/dL)</th></tr></thead>
          <tbody>
            ${vitals.map(v => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:0.82rem;">${DateUtils.format(v.date)}</td>
                <td><span style="font-weight:600;color:${v.bp > '140' ? 'var(--accent-red)' : 'var(--text-primary)'};">${v.bp}</span></td>
                <td>${v.hr}</td>
                <td><span style="color:${v.temp > 37.5 ? 'var(--accent-red)' : 'var(--text-primary)'};">${v.temp}</span></td>
                <td>${v.weight}</td>
                <td><span style="color:${v.glucose > 126 ? 'var(--accent-amber)' : 'var(--text-primary)'};">${v.glucose}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Tab: Datos personales ── */
  _buildInfoTab() {
    const p = this.patient;
    const fields = [
      ['CURP', p.curp || '—'],
      ['Correo electrónico', p.email || '—'],
      ['Teléfono', Format.phone(p.phone) || '—'],
      ['Domicilio', p.address || '—'],
      ['Seguro médico', `${p.insurance} ${p.insuranceNum ? '· ' + p.insuranceNum : ''}`],
      ['Área actual', p.area || '—'],
      ['Contacto de emergencia', p.emergency ? `${p.emergency.name} (${p.emergency.relation}) — ${Format.phone(p.emergency.phone)}` : '—'],
    ];
    return `
      <div class="form-section" style="max-width:600px;">
        ${fields.map(([label, value]) => `
          <div class="mini-metric">
            <span class="mini-metric-label">${label}</span>
            <span style="font-size:0.87rem;color:var(--text-primary);text-align:right;max-width:300px;">${value}</span>
          </div>`).join('')}
      </div>`;
  }

  /* ── Tabs binding ── */
  _bindTabs() {
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        document.querySelectorAll('.profile-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(`tab-${id}`)?.classList.add('active');
        this.activeTab = id;
      });
    });
  }

  /* ── Acciones ── */
  _bindActions() {
    document.getElementById('btn-edit-patient')?.addEventListener('click', () => {
      window.location.href = `/pages/patients/register.html?id=${this.patient.id}&mode=edit`;
    });
  }
}
