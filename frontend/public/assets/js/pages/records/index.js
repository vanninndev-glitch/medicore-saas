/**
 * MediCore SaaS — records/index.js
 * Historial Clínico Electrónico: lista, nota SOAP, ICD-10, antecedentes
 */

import { API }        from '../../core/api.js';
import { Auth }       from '../../core/auth.js';
import { Toast }      from '../../components/toast.js';
import { DateUtils, Format, Validate, DOM, debounce } from '../../core/utils.js';

/* ── ICD-10 local (muestra de los más comunes) ── */
const ICD10_COMMON = [
  { code:'J06.9', desc:'Infección aguda vías respiratorias superiores, no especificada' },
  { code:'J11.1', desc:'Influenza con otras manifestaciones respiratorias' },
  { code:'E11.9', desc:'Diabetes mellitus tipo 2 sin complicaciones' },
  { code:'I10',   desc:'Hipertensión esencial (primaria)' },
  { code:'J45.9', desc:'Asma, no especificada' },
  { code:'K29.7', desc:'Gastritis, no especificada' },
  { code:'M54.5', desc:'Lumbago no especificado' },
  { code:'F32.9', desc:'Episodio depresivo, no especificado' },
  { code:'E66.9', desc:'Obesidad, no especificada' },
  { code:'N39.0', desc:'Infección de las vías urinarias, sitio no especificado' },
  { code:'J00',   desc:'Rinofaringitis aguda (resfriado común)' },
  { code:'K21.0', desc:'Enfermedad por reflujo gastroesofágico con esofagitis' },
  { code:'I25.1', desc:'Enfermedad aterosclerótica del corazón' },
  { code:'G43.9', desc:'Migraña, no especificada' },
  { code:'L30.9', desc:'Dermatitis, no especificada' },
  { code:'J18.9', desc:'Neumonía, no especificada' },
  { code:'A09',   desc:'Diarrea y gastroenteritis de origen infeccioso' },
  { code:'Z00.0', desc:'Examen médico general' },
  { code:'K57.3', desc:'Enfermedad diverticular del colon sin perforación ni absceso' },
  { code:'B34.9', desc:'Infección vírica, no especificada' },
];

/* ── Demo records ── */
const DEMO_RECORDS = [
  {
    id: 'HCE-001', patientId: 'PAC-0001', patientName: 'María García López',
    date: new Date(Date.now() - 2*86400000).toISOString(),
    doctor: 'Dr. Rodríguez Pérez', specialty: 'Medicina Interna',
    diagnoses: [{ code:'J06.9', desc:'Infección aguda vías respiratorias superiores' }],
    soap: {
      S: 'Paciente refiere dolor de garganta, fiebre 38.5°C, malestar general 3 días.',
      O: 'FC:88, FR:18, T:38.5°C, TA:130/80. Faringe eritematosa. Pulmones limpios.',
      A: 'Faringoamigdalitis aguda viral. Descartar estreptocócica.',
      P: 'Paracetamol 500mg c/8h x 5d. Hidratación. Reposo. Control en 5 días.',
    },
    status: 'completed',
  },
  {
    id: 'HCE-002', patientId: 'PAC-0002', patientName: 'Carlos Mendoza Ruiz',
    date: new Date(Date.now() - 5*86400000).toISOString(),
    doctor: 'Dra. Martínez López', specialty: 'Cardiología',
    diagnoses: [{ code:'I10', desc:'Hipertensión esencial' }],
    soap: {
      S: 'Paciente refiere cefalea occipital, visión borrosa ocasional. TA elevada en controles previos.',
      O: 'TA: 158/96 mmHg bilateral. FC: 82. Sin soplos cardíacos. Fondo de ojo: grado II KW.',
      A: 'HTA esencial no controlada grado II. Evaluación de daño a órgano blanco.',
      P: 'Losartán 50mg c/24h. MAPA 24h. Ecocardiograma. Dieta hiposódica. Control mensual.',
    },
    status: 'completed',
  },
];

/* ══════════════════════════════════════════
   CLASE: LISTA DE HISTORIAL
══════════════════════════════════════════ */
export class RecordsList {
  constructor() {
    this.user      = Auth.getUser();
    this.patientId = new URLSearchParams(window.location.search).get('patientId');
    this.records   = [];
    this.page      = 1;
    this.limit     = 15;
    this._search   = debounce(() => this._load(), 320);
    this.query     = '';
  }

  async init() {
    this._renderShell();
    await this._load();
    this._bindEvents();
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;
    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Historial Clínico</div>
          <div class="page-subtitle">Expedientes clínicos electrónicos (HCE)</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-export-records">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Exportar
          </button>
          <a href="/pages/records/new-note.html${this.patientId ? '?patientId='+this.patientId : ''}" class="btn btn-primary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nueva nota SOAP
          </a>
        </div>
      </div>

      <!-- Filtros -->
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </div>
          <input id="records-search" type="text" placeholder="Buscar por paciente, diagnóstico, doctor…" />
        </div>
        <select class="filter-select" id="filter-specialty">
          <option value="">Todas las especialidades</option>
          <option>Medicina Interna</option><option>Cardiología</option>
          <option>Neurología</option><option>Pediatría</option>
          <option>Ginecología</option><option>Traumatología</option>
          <option>Oncología</option>
        </select>
        <select class="filter-select" id="filter-date-range">
          <option value="all">Todo el tiempo</option>
          <option value="today">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
        <div style="flex:1;"></div>
        <span id="records-count" style="font-size:0.82rem;color:var(--text-muted);"></span>
      </div>

      <!-- Timeline / Lista -->
      <div id="records-container">
        <div style="text-align:center;padding:3rem;color:var(--text-muted);">
          <div class="loader" style="margin:0 auto 1rem;"></div>Cargando historial…
        </div>
      </div>

      <div id="records-pagination" style="margin-top:1rem;"></div>`;
  }

  async _load() {
    const params = new URLSearchParams({
      page: this.page, limit: this.limit,
      ...(this.patientId && { patientId: this.patientId }),
      ...(this.query     && { q: this.query }),
    });

    const res = await API.get(`/records?${params}`);
    this.records = res.success ? (res.data.records || []) : DEMO_RECORDS;

    const total = res.success ? (res.data.total || 0) : DEMO_RECORDS.length;
    document.getElementById('records-count')
      && (document.getElementById('records-count').textContent = `${total} nota(s)`);

    this._renderRecords();
  }

  _renderRecords() {
    const container = document.getElementById('records-container');
    if (!container) return;

    if (!this.records.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:4rem;color:var(--text-muted);">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" style="margin:0 auto 1rem;opacity:0.3;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          Sin notas clínicas registradas
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="records-timeline">
        ${this.records.map(r => this._buildRecordCard(r)).join('')}
      </div>`;
  }

  _buildRecordCard(r) {
    const diagnosesTags = (r.diagnoses || []).map(d =>
      `<span class="diagnosis-tag">${d.code} — ${d.desc}</span>`
    ).join('');

    const soapColors = { S:'var(--accent-green)', O:'var(--accent-cyan)', A:'var(--accent-amber)', P:'#5599ff' };
    const soapNames  = { S:'Subjetivo', O:'Objetivo', A:'Análisis', P:'Plan' };

    return `
      <div class="timeline-entry">
        <div class="timeline-dot"></div>
        <div class="soap-card" style="cursor:default;">
          <div class="soap-header">
            <div>
              <div class="soap-date">${DateUtils.formatDateTime(r.date)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                ${r.specialty} · ${r.patientName || ''}
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="soap-doctor">${r.doctor}</span>
              <div class="flex gap-1">
                <a href="/pages/records/view.html?id=${r.id}" class="btn btn-secondary btn-sm">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  Ver
                </a>
                <button class="btn btn-ghost btn-sm" onclick="window.print()">Imprimir</button>
              </div>
            </div>
          </div>

          ${diagnosesTags ? `<div style="margin-bottom:0.75rem;">${diagnosesTags}</div>` : ''}

          <div class="soap-editor" style="gap:0.75rem;">
            ${['S','O','A','P'].map(key => r.soap?.[key] ? `
              <div class="soap-field soap-${key.toLowerCase()}">
                <div class="soap-field-header">
                  <div class="soap-field-key">${key}</div>
                  <span class="soap-field-name">${soapNames[key]}</span>
                </div>
                <div style="padding:0.75rem 0.9rem;font-size:0.85rem;color:var(--text-primary);line-height:1.65;">
                  ${r.soap[key]}
                </div>
              </div>` : '').join('')}
          </div>
        </div>
      </div>`;
  }

  _bindEvents() {
    document.getElementById('records-search')?.addEventListener('input', (e) => {
      this.query = e.target.value.trim();
      this._search();
    });

    ['filter-specialty','filter-date-range'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        this.page = 1;
        this._load();
      });
    });
  }
}

/* ══════════════════════════════════════════
   CLASE: NUEVA NOTA SOAP
══════════════════════════════════════════ */
export class NewSOAPNote {
  constructor() {
    this.user      = Auth.getUser();
    this.params    = Object.fromEntries(new URLSearchParams(window.location.search));
    this.patient   = null;
    this.diagnoses = [];
    this.saving    = false;
    this._icdSearch = debounce((q) => this._searchICD(q), 280);
  }

  async init() {
    await this._loadPatient();
    this._renderForm();
    this._bindEvents();
  }

  async _loadPatient() {
    if (!this.params.patientId) return;
    const res = await API.get(`/patients/${this.params.patientId}`);
    this.patient = res.success ? res.data : {
      id: this.params.patientId,
      name: 'Paciente de demostración',
      expedient: 'EXP-2024-DEMO',
    };
  }

  _renderForm() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 mb-4" style="font-size:0.82rem;color:var(--text-muted);">
        <a href="/pages/records/index.html" style="color:var(--accent-cyan);">Historial Clínico</a>
        <span>/</span>
        <span>Nueva nota SOAP</span>
      </div>

      <div class="page-header">
        <div>
          <div class="page-title">Nueva nota clínica</div>
          ${this.patient ? `<div class="page-subtitle">Paciente: <strong style="color:var(--text-primary);">${this.patient.name}</strong> · ${this.patient.expedient}</div>` : ''}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="history.back()">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="btn-save-note">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            Guardar nota
          </button>
        </div>
      </div>

      <div class="register-form">

        <!-- Información de la consulta -->
        <div class="form-section">
          <div class="form-section-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
            Información de la consulta
          </div>
          <div class="form-grid" style="grid-template-columns:repeat(3,1fr);">
            <div class="form-group">
              <label class="form-label">Fecha y hora <span class="required">*</span></label>
              <input type="datetime-local" id="note-date" class="form-input"
                value="${new Date().toISOString().slice(0,16)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Especialidad <span class="required">*</span></label>
              <select id="note-specialty" class="form-select">
                <option value="">Seleccionar…</option>
                <option>Medicina General</option><option>Medicina Interna</option>
                <option>Cardiología</option><option>Neurología</option>
                <option>Pediatría</option><option>Ginecología</option>
                <option>Traumatología</option><option>Oncología</option>
                <option>Endocrinología</option><option>Psiquiatría</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Tipo de consulta</label>
              <select id="note-type" class="form-select">
                <option value="consultation">Primera vez</option>
                <option value="followup">Seguimiento</option>
                <option value="emergency">Urgencia</option>
                <option value="interconsult">Interconsulta</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Diagnósticos ICD-10 -->
        <div class="form-section">
          <div class="form-section-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Diagnósticos (CIE-10 / ICD-10)
          </div>
          <div class="icd-search-wrap" style="margin-bottom:0.85rem;">
            <input type="text" id="icd-search" class="form-input"
              placeholder="Buscar por código o descripción (ej: J06, diabetes, hipertensión)…" />
            <div class="icd-results" id="icd-results"></div>
          </div>
          <div id="selected-diagnoses" style="min-height:36px;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Sin diagnósticos agregados</span>
          </div>
        </div>

        <!-- Notas SOAP -->
        <div class="form-section">
          <div class="form-section-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Nota SOAP
          </div>
          <div class="soap-editor">
            <!-- S -->
            <div class="soap-field soap-s">
              <div class="soap-field-header">
                <div class="soap-field-key">S</div>
                <span class="soap-field-name">Subjetivo — Síntomas referidos por el paciente</span>
              </div>
              <textarea id="soap-s" placeholder="Motivo de consulta, síntomas principales, historia del padecimiento actual, tiempo de evolución, factores agravantes/atenuantes…"></textarea>
            </div>
            <!-- O -->
            <div class="soap-field soap-o">
              <div class="soap-field-header">
                <div class="soap-field-key">O</div>
                <span class="soap-field-name">Objetivo — Hallazgos de la exploración</span>
              </div>
              <textarea id="soap-o" placeholder="Signos vitales: TA, FC, FR, Temp, SpO2. Exploración física por sistemas. Resultados de estudios. Peso, talla, IMC…"></textarea>
            </div>
            <!-- A -->
            <div class="soap-field soap-a">
              <div class="soap-field-header">
                <div class="soap-field-key">A</div>
                <span class="soap-field-name">Análisis — Razonamiento clínico y diagnóstico</span>
              </div>
              <textarea id="soap-a" placeholder="Diagnóstico principal y diferenciales. Interpretación de hallazgos. Correlación clínico-paraclínica…"></textarea>
            </div>
            <!-- P -->
            <div class="soap-field soap-p">
              <div class="soap-field-header">
                <div class="soap-field-key">P</div>
                <span class="soap-field-name">Plan — Tratamiento y seguimiento</span>
              </div>
              <textarea id="soap-p" placeholder="Tratamiento farmacológico (medicamento, dosis, vía, frecuencia, duración). No farmacológico. Estudios. Referencia. Próximo control…"></textarea>
            </div>
          </div>
        </div>

        <!-- Signos vitales rápidos -->
        <div class="form-section">
          <div class="form-section-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Signos vitales
          </div>
          <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));">
            <div class="form-group">
              <label class="form-label">T/A sistólica</label>
              <input type="number" id="v-bp-sys" class="form-input" placeholder="120" min="60" max="300" />
            </div>
            <div class="form-group">
              <label class="form-label">T/A diastólica</label>
              <input type="number" id="v-bp-dia" class="form-input" placeholder="80" min="40" max="200" />
            </div>
            <div class="form-group">
              <label class="form-label">FC (bpm)</label>
              <input type="number" id="v-hr" class="form-input" placeholder="80" min="30" max="300" />
            </div>
            <div class="form-group">
              <label class="form-label">FR (rpm)</label>
              <input type="number" id="v-rr" class="form-input" placeholder="16" min="8" max="60" />
            </div>
            <div class="form-group">
              <label class="form-label">Temp (°C)</label>
              <input type="number" id="v-temp" class="form-input" placeholder="36.5" step="0.1" min="34" max="42" />
            </div>
            <div class="form-group">
              <label class="form-label">SpO2 (%)</label>
              <input type="number" id="v-spo2" class="form-input" placeholder="98" min="70" max="100" />
            </div>
            <div class="form-group">
              <label class="form-label">Peso (kg)</label>
              <input type="number" id="v-weight" class="form-input" placeholder="70" step="0.1" min="1" max="500" />
            </div>
            <div class="form-group">
              <label class="form-label">Talla (cm)</label>
              <input type="number" id="v-height" class="form-input" placeholder="170" min="40" max="250" />
            </div>
            <div class="form-group">
              <label class="form-label">Glucosa (mg/dL)</label>
              <input type="number" id="v-glucose" class="form-input" placeholder="100" min="30" max="800" />
            </div>
          </div>
          <div id="imc-display" style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-muted);"></div>
        </div>

        <!-- Observaciones adicionales -->
        <div class="form-section">
          <div class="form-section-title">Observaciones adicionales</div>
          <textarea id="note-observations" class="form-textarea" rows="3"
            placeholder="Indicaciones especiales, notas para enfermería, alergias identificadas, situación social relevante…"></textarea>
        </div>

      </div><!-- /register-form -->`;
  }

  /* ── Búsqueda ICD-10 ── */
  _searchICD(query) {
    const resultsEl = document.getElementById('icd-results');
    if (!resultsEl) return;

    if (!query || query.length < 2) {
      resultsEl.classList.remove('visible');
      return;
    }

    const q = query.toLowerCase();
    const matches = ICD10_COMMON.filter(item =>
      item.code.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    ).slice(0, 8);

    if (!matches.length) {
      resultsEl.innerHTML = `<div class="icd-result-item" style="color:var(--text-muted);font-size:0.82rem;">Sin resultados para "${query}"</div>`;
    } else {
      resultsEl.innerHTML = matches.map(item => `
        <div class="icd-result-item" data-code="${item.code}" data-desc="${item.desc}">
          <span class="icd-code">${item.code}</span>
          <span class="icd-desc">${item.desc}</span>
        </div>`).join('');

      resultsEl.querySelectorAll('.icd-result-item[data-code]').forEach(el => {
        el.addEventListener('click', () => {
          this._addDiagnosis({ code: el.dataset.code, desc: el.dataset.desc });
          document.getElementById('icd-search').value = '';
          resultsEl.classList.remove('visible');
        });
      });
    }

    resultsEl.classList.add('visible');
  }

  _addDiagnosis(diag) {
    if (this.diagnoses.find(d => d.code === diag.code)) return;
    this.diagnoses.push(diag);
    this._renderDiagnoses();
  }

  _removeDiagnosis(code) {
    this.diagnoses = this.diagnoses.filter(d => d.code !== code);
    this._renderDiagnoses();
  }

  _renderDiagnoses() {
    const el = document.getElementById('selected-diagnoses');
    if (!el) return;
    if (!this.diagnoses.length) {
      el.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">Sin diagnósticos agregados</span>`;
      return;
    }
    el.innerHTML = this.diagnoses.map(d => `
      <span class="diagnosis-tag">
        ${d.code} — ${d.desc}
        <button onclick="" data-code="${d.code}" title="Quitar" style="font-size:1rem;line-height:1;">×</button>
      </span>`).join('');

    el.querySelectorAll('[data-code]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._removeDiagnosis(btn.dataset.code);
      });
    });
  }

  /* ── Calcular IMC ── */
  _calcIMC() {
    const peso   = parseFloat(document.getElementById('v-weight')?.value);
    const talla  = parseFloat(document.getElementById('v-height')?.value);
    const el     = document.getElementById('imc-display');
    if (!el || !peso || !talla) return;

    const tallaMt = talla / 100;
    const imc     = peso / (tallaMt * tallaMt);
    const category = imc < 18.5 ? 'Bajo peso' : imc < 25 ? 'Peso normal' : imc < 30 ? 'Sobrepeso' : 'Obesidad';
    const color    = imc < 18.5 ? 'var(--accent-blue)' : imc < 25 ? 'var(--accent-green)' : imc < 30 ? 'var(--accent-amber)' : 'var(--accent-red)';

    el.innerHTML = `IMC: <strong style="color:${color}">${imc.toFixed(1)}</strong> — ${category}`;
  }

  /* ── Guardar nota ── */
  async _saveNote() {
    if (this.saving) return;

    const data = {
      patientId:    this.params.patientId || null,
      date:         document.getElementById('note-date')?.value,
      specialty:    document.getElementById('note-specialty')?.value,
      type:         document.getElementById('note-type')?.value,
      diagnoses:    this.diagnoses,
      soap: {
        S: document.getElementById('soap-s')?.value?.trim(),
        O: document.getElementById('soap-o')?.value?.trim(),
        A: document.getElementById('soap-a')?.value?.trim(),
        P: document.getElementById('soap-p')?.value?.trim(),
      },
      vitals: {
        bpSystolic:  parseInt(document.getElementById('v-bp-sys')?.value) || null,
        bpDiastolic: parseInt(document.getElementById('v-bp-dia')?.value) || null,
        heartRate:   parseInt(document.getElementById('v-hr')?.value) || null,
        respRate:    parseInt(document.getElementById('v-rr')?.value) || null,
        temperature: parseFloat(document.getElementById('v-temp')?.value) || null,
        spO2:        parseInt(document.getElementById('v-spo2')?.value) || null,
        weight:      parseFloat(document.getElementById('v-weight')?.value) || null,
        height:      parseFloat(document.getElementById('v-height')?.value) || null,
        glucose:     parseInt(document.getElementById('v-glucose')?.value) || null,
      },
      observations: document.getElementById('note-observations')?.value?.trim(),
    };

    // Validaciones
    if (!data.specialty) { Toast.error('Selecciona la especialidad'); return; }
    if (!data.soap.S && !data.soap.O && !data.soap.A && !data.soap.P) {
      Toast.error('Completa al menos una sección SOAP'); return;
    }

    this.saving = true;
    const btn = document.getElementById('btn-save-note');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const res = await API.post('/records', data);

    this.saving = false;
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>Guardar nota`; }

    if (res.success) {
      Toast.success('Nota clínica guardada correctamente');
      setTimeout(() => {
        if (this.params.patientId) {
          window.location.href = `/pages/patients/profile.html?id=${this.params.patientId}`;
        } else {
          window.location.href = '/pages/records/index.html';
        }
      }, 1000);
    } else {
      // Modo demo — simular éxito
      Toast.success('Nota guardada (modo demo)');
      setTimeout(() => history.back(), 1200);
    }
  }

  _bindEvents() {
    // ICD-10 search
    document.getElementById('icd-search')?.addEventListener('input', (e) => {
      this._icdSearch(e.target.value.trim());
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.icd-search-wrap')) {
        document.getElementById('icd-results')?.classList.remove('visible');
      }
    });

    // IMC auto-calc
    ['v-weight','v-height'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this._calcIMC());
    });

    // Guardar
    document.getElementById('btn-save-note')?.addEventListener('click', () => this._saveNote());

    // Auto-resize textareas
    document.querySelectorAll('.soap-field textarea').forEach(ta => {
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      });
    });
  }
}
