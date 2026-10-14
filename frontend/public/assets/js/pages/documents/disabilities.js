/**
 * MediCore SaaS — documents/disabilities.js
 * Incapacidades: generación, folio único, listado, descarga PDF
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, Validate, debounce } from '../../core/utils.js';

/* ── Catálogos ── */
const DISABILITY_TYPES = [
  { id:'ST7',   label:'ST-7 — Incapacidad temporal por enfermedad general' },
  { id:'ST9',   label:'ST-9 — Incapacidad por maternidad / riesgo de trabajo' },
  { id:'CERT',  label:'Certificado médico de incapacidad laboral' },
  { id:'RT',    label:'Riesgo de trabajo' },
  { id:'PROX',  label:'Prórroga de incapacidad' },
];

const DIAGNOSES_COMMON = [
  'J06.9 — Infección aguda vías respiratorias superiores',
  'M54.5 — Lumbago no especificado',
  'K29.7 — Gastritis no especificada',
  'J11.1 — Influenza con manifestaciones respiratorias',
  'N39.0 — Infección de vías urinarias',
  'K21.0 — ERGE con esofagitis',
  'F32.9 — Episodio depresivo no especificado',
  'A09   — Diarrea y gastroenteritis infecciosa',
  'R51   — Cefalea',
  'M25.5 — Dolor articular',
];

/* ── Demo incapacidades ── */
const DEMO_DISABILITIES = Array.from({ length: 8 }, (_, i) => ({
  id:          `INC-2024-${String(900 + i).padStart(4,'0')}`,
  folio:       `FOLIO-2024-${String(1000 + i).padStart(6,'0')}`,
  patientName: ['María García','Carlos Mendoza','Ana Jiménez','Roberto Silva'][i%4],
  patientId:   `PAC-${String((i%4)+1).padStart(4,'0')}`,
  doctorName:  'Dr. Carlos Rodríguez Pérez',
  doctorCedula:'1234567',
  type:        DISABILITY_TYPES[i%5].id,
  typeLabel:   DISABILITY_TYPES[i%5].label,
  diagnosis:   DIAGNOSES_COMMON[i%10],
  startDate:   new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
  endDate:     new Date(Date.now() + (3 - i + 7) * 86400000).toISOString().split('T')[0],
  days:        3 + (i % 7),
  createdAt:   new Date(Date.now() - i * 86400000).toISOString(),
  status:      i < 6 ? 'active' : 'expired',
}));

/* ════════════════════════════════════════
   CLASE: INCAPACIDADES
════════════════════════════════════════ */
export class DisabilitiesModule {
  constructor() {
    this.user    = Auth.getUser();
    this.params  = Object.fromEntries(new URLSearchParams(window.location.search));
    this.saving  = false;
    this._patSearch = debounce((q) => this._searchPatients(q), 300);
    this.selectedPatient = null;
  }

  async init() {
    this._renderShell();
    if (this.params.patientId) await this._preloadPatient(this.params.patientId);
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Incapacidades</div>
          <div class="page-subtitle">Generación y gestión de incapacidades médicas</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-new-disability">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Nueva incapacidad
        </button>
      </div>

      <!-- Tabs -->
      <div class="profile-tabs" style="margin-bottom:1.5rem;">
        <button class="profile-tab active" data-dis-tab="list">Historial</button>
        <button class="profile-tab" data-dis-tab="new" id="tab-new-btn">Nueva incapacidad</button>
      </div>

      <div id="dis-tab-list">${this._buildListTab()}</div>
      <div id="dis-tab-new" style="display:none;">${this._buildNewTab()}</div>`;

    this._bindEvents();
  }

  /* ── Tab: Listado ── */
  _buildListTab() {
    return `
      <div class="patients-toolbar" style="margin-bottom:1.25rem;">
        <div class="search-bar">
          <div class="search-icon">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </div>
          <input type="text" placeholder="Buscar por folio, paciente…"/>
        </div>
        <select class="filter-select">
          <option value="">Todos los tipos</option>
          ${DISABILITY_TYPES.map(t => `<option value="${t.id}">${t.id}</option>`).join('')}
        </select>
        <select class="filter-select">
          <option value="">Todos los estados</option>
          <option value="active">Vigente</option>
          <option value="expired">Expirada</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Paciente</th><th>Tipo</th><th>Diagnóstico</th>
              <th>Inicio</th><th>Fin</th><th>Días</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${DEMO_DISABILITIES.map(d => `
              <tr>
                <td>
                  <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent-cyan);">${d.folio}</span>
                </td>
                <td>
                  <div style="font-weight:600;color:var(--text-primary);font-size:0.87rem;">${d.patientName}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted);">${d.patientId}</div>
                </td>
                <td><span class="badge badge-blue" style="font-size:0.7rem;">${d.type}</span></td>
                <td style="font-size:0.8rem;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.diagnosis}</td>
                <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${DateUtils.format(d.startDate+'T12:00:00')}</td>
                <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${DateUtils.format(d.endDate+'T12:00:00')}</td>
                <td style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary);text-align:center;">${d.days}</td>
                <td>
                  <span class="badge ${d.status === 'active' ? 'badge-green' : 'badge-red'}" style="font-size:0.7rem;">
                    ${d.status === 'active' ? 'Vigente' : 'Expirada'}
                  </span>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-primary btn-sm" style="font-size:0.72rem;" data-print="${d.id}">
                      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      PDF
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-view="${d.id}" title="Ver">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Tab: Nueva incapacidad ── */
  _buildNewTab() {
    return `
      <div style="max-width:720px;">

        <!-- Paciente -->
        <div class="form-section">
          <div class="form-section-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            Paciente
          </div>
          <div style="position:relative;">
            <div style="position:absolute;left:0.85rem;top:50%;transform:translateY(-50%);color:var(--text-muted);">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            </div>
            <input id="dis-patient-search" class="form-input" type="text" style="padding-left:2.5rem;"
              placeholder="Buscar paciente por nombre o expediente…" autocomplete="off"/>
            <div id="dis-patient-results" style="position:absolute;top:calc(100%+4px);left:0;right:0;background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:var(--radius-md);box-shadow:var(--shadow-card);z-index:100;display:none;max-height:200px;overflow-y:auto;"></div>
          </div>
          <div id="dis-patient-selected" style="display:none;margin-top:0.6rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:var(--radius-md);">
              <div class="avatar" style="width:38px;height:38px;background:rgba(26,111,255,0.15);color:#5599ff;font-size:0.85rem;" id="dis-p-avatar"></div>
              <div style="flex:1;">
                <div id="dis-p-name" style="font-weight:600;color:var(--text-primary);"></div>
                <div id="dis-p-meta" style="font-size:0.75rem;color:var(--text-muted);"></div>
              </div>
              <button class="btn btn-ghost btn-sm" id="dis-p-clear">✕</button>
            </div>
          </div>
        </div>

        <!-- Tipo y diagnóstico -->
        <div class="form-section">
          <div class="form-section-title">Clasificación</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Tipo de incapacidad <span class="required">*</span></label>
              <select id="dis-type" class="form-select">
                <option value="">Seleccionar tipo…</option>
                ${DISABILITY_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Diagnóstico CIE-10 <span class="required">*</span></label>
              <select id="dis-diagnosis" class="form-select">
                <option value="">Seleccionar diagnóstico…</option>
                ${DIAGNOSES_COMMON.map(d => `<option value="${d}">${d}</option>`).join('')}
                <option value="other">Otro (especificar)</option>
              </select>
            </div>
          </div>
          <div class="form-group" id="dis-other-diag-group" style="margin-top:0.75rem;display:none;">
            <label class="form-label">Especificar diagnóstico</label>
            <input id="dis-other-diagnosis" class="form-input" type="text" placeholder="CIE-10 — Descripción del diagnóstico"/>
          </div>
        </div>

        <!-- Fechas y días -->
        <div class="form-section">
          <div class="form-section-title">Período de incapacidad</div>
          <div class="form-grid form-grid-3">
            <div class="form-group">
              <label class="form-label">Fecha de inicio <span class="required">*</span></label>
              <input id="dis-start" class="form-input" type="date" value="${new Date().toISOString().split('T')[0]}"/>
            </div>
            <div class="form-group">
              <label class="form-label">Días de incapacidad <span class="required">*</span></label>
              <input id="dis-days" class="form-input" type="number" min="1" max="365" placeholder="3" value="3"/>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha de alta (calculada)</label>
              <input id="dis-end" class="form-input" type="date" readonly style="opacity:0.7;cursor:not-allowed;"/>
            </div>
          </div>
          <div class="form-group" style="margin-top:0.75rem;">
            <label class="form-label">Indicaciones de reposo</label>
            <select id="dis-rest" class="form-select">
              <option value="total">Reposo total en cama</option>
              <option value="relative">Reposo relativo en hogar</option>
              <option value="work">Incapacidad laboral, puede deambular</option>
              <option value="partial">Incapacidad parcial — trabajo modificado</option>
            </select>
          </div>
        </div>

        <!-- Notas médicas -->
        <div class="form-section">
          <div class="form-section-title">Notas médicas y tratamiento</div>
          <div class="form-group">
            <label class="form-label">Descripción clínica</label>
            <textarea id="dis-clinical" class="form-textarea" rows="3"
              placeholder="Descripción del cuadro clínico que justifica la incapacidad, síntomas, evolución…"></textarea>
          </div>
          <div class="form-group" style="margin-top:0.85rem;">
            <label class="form-label">Tratamiento indicado</label>
            <textarea id="dis-treatment" class="form-textarea" rows="2"
              placeholder="Medicamentos indicados, cuidados en casa, restricciones de actividad…"></textarea>
          </div>
          <div class="form-group" style="margin-top:0.85rem;">
            <label class="form-label">Instrucciones de seguimiento</label>
            <input id="dis-followup" class="form-input" type="text"
              placeholder="Ej: Cita de revisión en 7 días, acudir a urgencias si hay fiebre >38.5°C…"/>
          </div>
        </div>

        <!-- Vista previa del documento -->
        <div class="form-section" style="background:rgba(0,212,255,0.04);border-color:rgba(0,212,255,0.15);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
            <div class="form-section-title" style="margin-bottom:0;">Vista previa</div>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);" id="dis-folio-preview">FOLIO: —</span>
          </div>

          <!-- Documento preview -->
          <div id="disability-preview" style="
            background:#fff;color:#111;border-radius:8px;padding:1.5rem;
            font-family:Arial,sans-serif;font-size:0.82rem;line-height:1.6;
            max-height:400px;overflow-y:auto;
          ">
            <div style="text-align:center;border-bottom:2px solid #1a6fff;padding-bottom:1rem;margin-bottom:1rem;">
              <div style="font-size:1.1rem;font-weight:900;color:#1a6fff;letter-spacing:0.05em;">MediCore SaaS</div>
              <div style="font-size:0.78rem;color:#555;">Sistema de Gestión Hospitalaria</div>
              <div style="font-size:1rem;font-weight:700;margin-top:0.5rem;color:#111;">CONSTANCIA DE INCAPACIDAD MÉDICA</div>
            </div>
            <div id="preview-content" style="color:#555;font-style:italic;">
              Completa el formulario para ver la vista previa del documento.
            </div>
            <div style="margin-top:1.5rem;border-top:1px solid #ddd;padding-top:1rem;display:flex;justify-content:space-between;align-items:flex-end;">
              <div>
                <div style="height:40px;border-bottom:1px solid #111;width:180px;margin-bottom:4px;"></div>
                <div style="font-size:0.75rem;color:#555;">Firma del médico</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.72rem;color:#888;">Documento generado electrónicamente</div>
                <div style="font-size:0.7rem;color:#aaa;" id="preview-date"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-2">
          <button class="btn btn-secondary" onclick="document.querySelector('[data-dis-tab=list]').click()">Cancelar</button>
          <button class="btn btn-secondary" id="btn-preview-pdf">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Vista previa
          </button>
          <button class="btn btn-primary" id="btn-generate-disability" style="flex:1;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Generar y descargar PDF
          </button>
        </div>
      </div>`;
  }

  /* ── Calcular fecha fin ── */
  _calcEndDate() {
    const startVal = document.getElementById('dis-start')?.value;
    const daysVal  = parseInt(document.getElementById('dis-days')?.value) || 0;
    if (!startVal || !daysVal) return;

    const end = new Date(startVal + 'T12:00:00');
    end.setDate(end.getDate() + daysVal - 1);
    const endInput = document.getElementById('dis-end');
    if (endInput) endInput.value = end.toISOString().split('T')[0];

    this._updatePreview();
  }

  /* ── Actualizar vista previa ── */
  _updatePreview() {
    const get = (id) => document.getElementById(id)?.value?.trim() || '';
    const folio = `FOLIO-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900000)+100000)}`;

    const type      = get('dis-type');
    const typLabel  = DISABILITY_TYPES.find(t => t.id === type)?.label || '—';
    const diagnosis = get('dis-diagnosis') === 'other' ? get('dis-other-diagnosis') : get('dis-diagnosis');
    const start     = get('dis-start');
    const days      = get('dis-days');
    const end       = get('dis-end');
    const rest      = get('dis-rest');
    const patient   = this.selectedPatient;
    const doctor    = this.user;

    const folioEl = document.getElementById('dis-folio-preview');
    if (folioEl) folioEl.textContent = `FOLIO: ${folio}`;

    const dateEl = document.getElementById('preview-date');
    if (dateEl) dateEl.textContent = `Emitido: ${new Date().toLocaleDateString('es-MX')}`;

    const content = document.getElementById('preview-content');
    if (!content) return;

    content.style.color = '#111';
    content.style.fontStyle = 'normal';
    content.innerHTML = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;">
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;width:35%;">Paciente:</td>
            <td style="padding:4px 8px;">${patient ? patient.name : '—'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Expediente:</td>
            <td style="padding:4px 8px;font-family:monospace;">${patient ? patient.expedient : '—'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Médico:</td>
            <td style="padding:4px 8px;">${this.user?.name || 'Dr. —'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Tipo:</td>
            <td style="padding:4px 8px;">${typLabel}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Diagnóstico:</td>
            <td style="padding:4px 8px;">${diagnosis || '—'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Inicio:</td>
            <td style="padding:4px 8px;font-family:monospace;">${start ? DateUtils.format(start+'T12:00:00') : '—'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Alta:</td>
            <td style="padding:4px 8px;font-family:monospace;">${end ? DateUtils.format(end+'T12:00:00') : '—'}</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Días:</td>
            <td style="padding:4px 8px;font-weight:700;color:#1a6fff;">${days || '—'} día(s)</td></tr>
        <tr><td style="padding:4px 8px;background:#f8f9fa;font-weight:700;">Indicaciones:</td>
            <td style="padding:4px 8px;">${rest || '—'}</td></tr>
      </table>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:0.5rem 0.75rem;font-size:0.78rem;color:#856404;">
        Este documento es válido únicamente con la firma del médico y el sello oficial del hospital.
        Folio: <strong style="font-family:monospace;">${folio}</strong>
      </div>`;
  }

  /* ── Buscar pacientes ── */
  async _searchPatients(query) {
    const resultsEl = document.getElementById('dis-patient-results');
    if (!resultsEl || !query || query.length < 2) {
      if (resultsEl) resultsEl.style.display = 'none';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `<div style="padding:0.85rem;text-align:center;"><div class="loader" style="margin:0 auto;width:16px;height:16px;border-width:2px;"></div></div>`;

    const res = await API.get(`/patients/search?q=${encodeURIComponent(query)}&limit=5`);
    const list = res.success ? (res.data.patients || []) : [
      { id:'PAC-0001', name:'María García López',  expedient:'EXP-2024-1001', dob:'1985-06-15' },
      { id:'PAC-0002', name:'Carlos Mendoza Ruiz', expedient:'EXP-2024-1002', dob:'1978-03-22' },
      { id:'PAC-0003', name:'Ana Jiménez Torres',  expedient:'EXP-2024-1003', dob:'1992-11-08' },
    ].filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

    if (!list.length) {
      resultsEl.innerHTML = `<div style="padding:0.85rem;font-size:0.82rem;color:var(--text-muted);">Sin resultados</div>`;
      return;
    }

    resultsEl.innerHTML = list.map(p => `
      <div class="search-result-item" data-id="${p.id}" style="cursor:pointer;">
        <div class="avatar" style="width:32px;height:32px;font-size:0.75rem;background:rgba(26,111,255,0.15);color:#5599ff;">
          ${p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <div class="search-result-text">
          <div class="search-result-name">${p.name}</div>
          <div class="search-result-sub">${p.expedient}</div>
        </div>
      </div>`).join('');

    resultsEl.querySelectorAll('[data-id]').forEach(item => {
      item.addEventListener('click', () => {
        const p = list.find(x => x.id === item.dataset.id);
        if (p) this._selectPatient(p);
        resultsEl.style.display = 'none';
        document.getElementById('dis-patient-search').value = '';
      });
    });
  }

  _selectPatient(p) {
    this.selectedPatient = p;
    const search   = document.getElementById('dis-patient-search');
    const selected = document.getElementById('dis-patient-selected');
    if (search)   search.style.display = 'none';
    if (selected) selected.style.display = 'block';

    const avatarEl = document.getElementById('dis-p-avatar');
    const nameEl   = document.getElementById('dis-p-name');
    const metaEl   = document.getElementById('dis-p-meta');

    if (avatarEl) avatarEl.textContent = p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    if (nameEl)   nameEl.textContent   = p.name;
    if (metaEl)   metaEl.textContent   = p.expedient;

    this._updatePreview();
  }

  async _preloadPatient(id) {
    const res = await API.get(`/patients/${id}`);
    if (res.success && res.data) this._selectPatient(res.data);
  }

  /* ── Generar incapacidad ── */
  async _generateDisability() {
    if (this.saving) return;

    if (!this.selectedPatient) { Toast.error('Selecciona un paciente'); return; }
    const type = document.getElementById('dis-type')?.value;
    if (!type)  { Toast.error('Selecciona el tipo de incapacidad'); return; }
    const days = parseInt(document.getElementById('dis-days')?.value) || 0;
    if (!days)  { Toast.error('Ingresa los días de incapacidad'); return; }

    const diagnosis = document.getElementById('dis-diagnosis')?.value === 'other'
      ? document.getElementById('dis-other-diagnosis')?.value?.trim()
      : document.getElementById('dis-diagnosis')?.value;
    if (!diagnosis) { Toast.error('Selecciona o especifica el diagnóstico'); return; }

    this.saving = true;
    const btn = document.getElementById('btn-generate-disability');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loader" style="width:14px;height:14px;border-width:2px;"></div> Generando PDF…`; }

    const payload = {
      patientId:   this.selectedPatient.id,
      type,
      diagnosis,
      startDate:   document.getElementById('dis-start')?.value,
      endDate:     document.getElementById('dis-end')?.value,
      days,
      restType:    document.getElementById('dis-rest')?.value,
      clinical:    document.getElementById('dis-clinical')?.value?.trim(),
      treatment:   document.getElementById('dis-treatment')?.value?.trim(),
      followup:    document.getElementById('dis-followup')?.value?.trim(),
    };

    const res = await API.post('/disabilities/generate', payload);
    this.saving = false;
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generar y descargar PDF`; }

    if (res.success) {
      Toast.success(`Incapacidad generada: ${res.data.folio}`);
      // Descargar PDF desde el servidor
      await API.download(`/disabilities/${res.data.id}/pdf`, `incapacidad_${res.data.folio}.pdf`);
    } else {
      // Demo: simular éxito y mostrar vista previa imprimible
      Toast.success('Incapacidad generada (modo demo) — folio asignado');
      this._printPreview();
    }
  }

  _printPreview() {
    const preview = document.getElementById('disability-preview');
    if (!preview) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html><html><head><title>Incapacidad Médica</title>
      <style>body{font-family:Arial,sans-serif;padding:2rem;color:#111;}</style></head>
      <body>${preview.innerHTML}<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    // Tabs
    document.querySelectorAll('[data-dis-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dis-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.disTab;
        ['list','new'].forEach(t => {
          const el = document.getElementById(`dis-tab-${t}`);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
      });
    });

    document.getElementById('btn-new-disability')?.addEventListener('click', () => {
      document.querySelector('[data-dis-tab="new"]')?.click();
    });

    // Calcular fecha fin automáticamente
    ['dis-start','dis-days'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this._calcEndDate());
      document.getElementById(id)?.addEventListener('input',  () => this._calcEndDate());
    });

    // Búsqueda de paciente
    document.getElementById('dis-patient-search')?.addEventListener('input', (e) => {
      this._patSearch(e.target.value.trim());
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dis-patient-search') && !e.target.closest('#dis-patient-results')) {
        document.getElementById('dis-patient-results')?.style.setProperty('display','none');
      }
    });

    // Limpiar paciente
    document.getElementById('dis-p-clear')?.addEventListener('click', () => {
      this.selectedPatient = null;
      document.getElementById('dis-patient-search').style.display = '';
      document.getElementById('dis-patient-selected').style.display = 'none';
      this._updatePreview();
    });

    // Mostrar campo "otro diagnóstico"
    document.getElementById('dis-diagnosis')?.addEventListener('change', (e) => {
      const group = document.getElementById('dis-other-diag-group');
      if (group) group.style.display = e.target.value === 'other' ? 'block' : 'none';
      this._updatePreview();
    });

    // Actualizar preview en tiempo real
    ['dis-type','dis-rest','dis-clinical','dis-treatment'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this._updatePreview());
    });

    // Vista previa
    document.getElementById('btn-preview-pdf')?.addEventListener('click', () => {
      this._updatePreview();
      Toast.info('Vista previa actualizada');
    });

    // Generar
    document.getElementById('btn-generate-disability')?.addEventListener('click', () => {
      this._generateDisability();
    });

    // Botones de PDF en la lista
    document.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.print;
        Toast.info('Preparando PDF…');
        const res = await API.download(`/disabilities/${id}/pdf`, `incapacidad_${id}.pdf`);
        if (!res.success) Toast.success('Descarga simulada (modo demo)');
      });
    });
  }
}
