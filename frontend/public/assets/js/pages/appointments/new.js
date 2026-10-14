/**
 * MediCore SaaS — appointments/new.js
 * Formulario de nueva cita: selección paciente, doctor, fecha, slot de tiempo
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, Validate, DOM, debounce } from '../../core/utils.js';

/* ── Datos demo ── */
const DEMO_DOCTORS = [
  { id:'DOC-001', name:'Dr. Carlos Rodríguez Pérez',   specialty:'Medicina Interna',  avatar:'CR', color:'#1a6fff', schedule:{ start:'08:00', end:'16:00', days:[1,2,3,4,5] } },
  { id:'DOC-002', name:'Dra. Ana Martínez López',       specialty:'Cardiología',       avatar:'AM', color:'#ff4757', schedule:{ start:'09:00', end:'17:00', days:[1,2,3,4,5] } },
  { id:'DOC-003', name:'Dr. Roberto García Sánchez',    specialty:'Neurología',        avatar:'RG', color:'#a78bfa', schedule:{ start:'08:00', end:'14:00', days:[1,2,3,4,5,6] } },
  { id:'DOC-004', name:'Dra. Lucía Hernández Torres',   specialty:'Pediatría',         avatar:'LH', color:'#00e5a0', schedule:{ start:'09:00', end:'18:00', days:[1,2,3,4,5] } },
  { id:'DOC-005', name:'Dr. Fernando Díaz Morales',     specialty:'Traumatología',     avatar:'FD', color:'#ffb347', schedule:{ start:'07:00', end:'15:00', days:[1,2,3,4,5] } },
  { id:'DOC-006', name:'Dra. Sofía Castillo Vega',      specialty:'Ginecología',       avatar:'SC', color:'#ff64b4', schedule:{ start:'10:00', end:'18:00', days:[1,2,3,4,5] } },
  { id:'DOC-007', name:'Dr. Eduardo Flores Ríos',       specialty:'Oncología',         avatar:'EF', color:'#ff8000', schedule:{ start:'08:00', end:'16:00', days:[1,2,3,4] } },
  { id:'DOC-008', name:'Dra. Patricia Romero Cruz',     specialty:'Endocrinología',    avatar:'PR', color:'#5599ff', schedule:{ start:'09:00', end:'17:00', days:[1,2,3,4,5] } },
];

const DEMO_PATIENTS_SEARCH = [
  { id:'PAC-0001', name:'María García López',    expedient:'EXP-2024-1001', dob:'1985-06-15' },
  { id:'PAC-0002', name:'Carlos Mendoza Ruiz',   expedient:'EXP-2024-1002', dob:'1978-03-22' },
  { id:'PAC-0003', name:'Ana Jiménez Torres',    expedient:'EXP-2024-1003', dob:'1992-11-08' },
  { id:'PAC-0004', name:'Roberto Silva Peña',    expedient:'EXP-2024-1004', dob:'1965-07-14' },
  { id:'PAC-0005', name:'Lucía Hernández Vega',  expedient:'EXP-2024-1005', dob:'1990-02-28' },
];

/* ════════════════════════════════════════
   CLASE NUEVA CITA
════════════════════════════════════════ */
export class NewAppointment {
  constructor() {
    this.user          = Auth.getUser();
    this.params        = Object.fromEntries(new URLSearchParams(window.location.search));
    this.selectedDoc   = null;
    this.selectedPat   = null;
    this.selectedSlot  = null;
    this.selectedDate  = this.params.date || new Date().toISOString().split('T')[0];
    this.doctors       = [];
    this.saving        = false;
    this._patSearch    = debounce((q) => this._searchPatients(q), 300);
  }

  async init() {
    this._renderForm();
    await this._loadDoctors();
    this._renderDoctors();
    this._bindEvents();

    // Pre-seleccionar si vienen params
    if (this.params.patientId) await this._preloadPatient(this.params.patientId);
  }

  /* ── Render del formulario completo ── */
  _renderForm() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="flex items-center gap-2 mb-4" style="font-size:0.82rem;color:var(--text-muted);">
        <a href="/pages/appointments/index.html" style="color:var(--accent-cyan);">Citas</a>
        <span>/</span><span>Nueva cita</span>
      </div>

      <div class="page-header">
        <div>
          <div class="page-title">Nueva cita</div>
          <div class="page-subtitle">Agenda una consulta para un paciente</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="history.back()">Cancelar</button>
      </div>

      <div style="max-width:860px;">

        <!-- PASO 1: Paciente -->
        <div class="form-section" id="step-patient">
          <div class="form-section-title">
            <span style="background:rgba(0,212,255,0.15);color:var(--accent-cyan);width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;">1</span>
            Seleccionar paciente
          </div>

          <!-- Búsqueda de paciente -->
          <div style="position:relative;margin-bottom:0.85rem;">
            <div style="position:absolute;left:0.85rem;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
            </div>
            <input type="text" id="patient-search" class="form-input" style="padding-left:2.5rem;"
              placeholder="Buscar paciente por nombre o expediente…" autocomplete="off" />
            <div id="patient-search-results" style="
              position:absolute;top:calc(100%+4px);left:0;right:0;
              background:var(--bg-surface);border:1px solid var(--border-dim);
              border-radius:var(--radius-md);box-shadow:var(--shadow-card);
              z-index:100;display:none;max-height:220px;overflow-y:auto;">
            </div>
          </div>

          <!-- Paciente seleccionado -->
          <div id="selected-patient-display" style="display:none;">
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.2);border-radius:var(--radius-md);">
              <div id="sp-avatar" class="avatar" style="width:40px;height:40px;font-size:0.85rem;"></div>
              <div style="flex:1;">
                <div id="sp-name" style="font-weight:600;color:var(--text-primary);font-size:0.9rem;"></div>
                <div id="sp-meta" style="font-size:0.75rem;color:var(--text-muted);"></div>
              </div>
              <button class="btn btn-ghost btn-sm" id="btn-clear-patient" style="color:var(--text-muted);">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- PASO 2: Médico y especialidad -->
        <div class="form-section" id="step-doctor">
          <div class="form-section-title">
            <span style="background:rgba(0,212,255,0.15);color:var(--accent-cyan);width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;">2</span>
            Seleccionar médico
          </div>

          <!-- Filtro por especialidad -->
          <div class="flex gap-2 mb-4 flex-wrap">
            <button class="chart-filter-btn active" data-spec="">Todos</button>
            <button class="chart-filter-btn" data-spec="Medicina Interna">Medicina Interna</button>
            <button class="chart-filter-btn" data-spec="Cardiología">Cardiología</button>
            <button class="chart-filter-btn" data-spec="Neurología">Neurología</button>
            <button class="chart-filter-btn" data-spec="Pediatría">Pediatría</button>
            <button class="chart-filter-btn" data-spec="Ginecología">Ginecología</button>
            <button class="chart-filter-btn" data-spec="Traumatología">Traumatología</button>
          </div>

          <div id="doctors-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0.75rem;">
            <div style="grid-column:1/-1;text-align:center;padding:1.5rem;color:var(--text-muted);">
              <div class="loader" style="margin:0 auto 0.5rem;"></div>Cargando médicos…
            </div>
          </div>
        </div>

        <!-- PASO 3: Fecha y hora -->
        <div class="form-section" id="step-datetime">
          <div class="form-section-title">
            <span style="background:rgba(0,212,255,0.15);color:var(--accent-cyan);width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;">3</span>
            Fecha y horario
          </div>

          <div class="appt-form-grid" style="margin-bottom:1.25rem;">
            <div class="form-group">
              <label class="form-label">Fecha <span class="required">*</span></label>
              <input type="date" id="appt-date" class="form-input"
                value="${this.selectedDate}"
                min="${new Date().toISOString().split('T')[0]}" />
            </div>
            <div class="form-group">
              <label class="form-label">Duración</label>
              <select id="appt-duration" class="form-select">
                <option value="15">15 minutos</option>
                <option value="30" selected>30 minutos</option>
                <option value="45">45 minutos</option>
                <option value="60">1 hora</option>
                <option value="90">1.5 horas</option>
              </select>
            </div>
          </div>

          <!-- Slots de horario -->
          <div class="form-group">
            <label class="form-label">Horario disponible <span class="required">*</span></label>
            <div id="time-slots-container" style="margin-top:0.5rem;">
              <div style="font-size:0.82rem;color:var(--text-muted);">
                Selecciona un médico y una fecha para ver los horarios disponibles
              </div>
            </div>
          </div>
        </div>

        <!-- PASO 4: Detalles -->
        <div class="form-section">
          <div class="form-section-title">
            <span style="background:rgba(0,212,255,0.15);color:var(--accent-cyan);width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;">4</span>
            Detalles de la cita
          </div>

          <div class="appt-form-grid">
            <div class="form-group">
              <label class="form-label">Tipo de consulta <span class="required">*</span></label>
              <select id="appt-type" class="form-select">
                <option value="primera_vez">Primera vez</option>
                <option value="seguimiento">Seguimiento</option>
                <option value="urgencia">Urgencia</option>
                <option value="interconsulta">Interconsulta</option>
                <option value="procedimiento">Procedimiento</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Canal</label>
              <select id="appt-channel" class="form-select">
                <option value="presencial">Presencial</option>
                <option value="telemedicina">Telemedicina (video)</option>
                <option value="telefonica">Telefónica</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Motivo de consulta</label>
            <textarea id="appt-reason" class="form-textarea" rows="3"
              placeholder="Describe brevemente el motivo de la consulta…"></textarea>
          </div>

          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Notas adicionales</label>
            <textarea id="appt-notes" class="form-textarea" rows="2"
              placeholder="Instrucciones de preparación, requisitos especiales, etc."></textarea>
          </div>
        </div>

        <!-- RESUMEN Y GUARDAR -->
        <div id="appt-summary" style="display:none;margin-bottom:1.25rem;">
          <div style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(26,111,255,0.05));border:1px solid rgba(0,212,255,0.2);border-radius:var(--radius-md);padding:1.25rem;">
            <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.85rem;">Resumen de la cita</div>
            <div id="summary-content" style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;"></div>
          </div>
        </div>

        <div class="flex gap-3">
          <button class="btn btn-secondary" onclick="history.back()">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-appt" style="flex:1;" disabled>
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            Confirmar cita
          </button>
        </div>

      </div>`;
  }

  /* ── Cargar médicos ── */
  async _loadDoctors() {
    const res = await API.get('/doctors?active=true&limit=50');
    this.doctors = res.success ? (res.data.doctors || []) : DEMO_DOCTORS;
  }

  _renderDoctors(filterSpec = '') {
    const grid = document.getElementById('doctors-grid');
    if (!grid) return;

    const list = filterSpec
      ? this.doctors.filter(d => d.specialty === filterSpec)
      : this.doctors;

    if (!list.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:1.5rem;color:var(--text-muted);">Sin médicos disponibles</div>`;
      return;
    }

    grid.innerHTML = list.map(d => `
      <div class="doctor-card${this.selectedDoc?.id === d.id ? ' selected' : ''}"
           data-doc-id="${d.id}" role="button" tabindex="0">
        <div class="doctor-card-avatar" style="background:${d.color}22;color:${d.color};">${d.avatar}</div>
        <div style="flex:1;min-width:0;">
          <div class="doctor-card-name">${d.name}</div>
          <div class="doctor-card-specialty">${d.specialty}</div>
        </div>
        ${this.selectedDoc?.id === d.id
          ? `<svg width="16" height="16" fill="var(--accent-cyan)" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`
          : ''}
      </div>`).join('');

    grid.querySelectorAll('.doctor-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.docId;
        this.selectedDoc = this.doctors.find(d => d.id === id) || null;
        this._renderDoctors(filterSpec);
        this._loadTimeSlots();
        this._updateSummary();
        this._updateSaveBtn();
      });
    });
  }

  /* ── Cargar slots de horario ── */
  async _loadTimeSlots() {
    const container = document.getElementById('time-slots-container');
    if (!container || !this.selectedDoc) return;

    container.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;"><div class="loader" style="display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:0.5rem;"></div>Verificando disponibilidad…</div>`;

    const date = document.getElementById('appt-date')?.value;
    if (!date) {
      container.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);">Selecciona una fecha</div>`;
      return;
    }

    const res = await API.get(`/appointments/slots?doctorId=${this.selectedDoc.id}&date=${date}`);
    const occupiedSlots = res.success
      ? (res.data.occupied || [])
      : ['09:00','09:30','11:00','14:00','14:30'];

    const doc      = this.selectedDoc;
    const schedule = doc.schedule || { start:'08:00', end:'17:00' };
    const slots    = this._generateSlots(schedule.start, schedule.end, 30, occupiedSlots);

    if (!slots.length) {
      container.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);">Sin horarios disponibles para esta fecha</div>`;
      return;
    }

    container.innerHTML = `<div class="time-slots-grid">${
      slots.map(s => `
        <div class="time-slot${s.occupied?' occupied':''}${this.selectedSlot===s.time?' selected':''}"
             data-time="${s.time}">
          ${s.time}
        </div>`).join('')
    }</div>`;

    container.querySelectorAll('.time-slot:not(.occupied)').forEach(slot => {
      slot.addEventListener('click', () => {
        this.selectedSlot = slot.dataset.time;
        container.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        slot.classList.add('selected');
        this._updateSummary();
        this._updateSaveBtn();
      });
    });
  }

  _generateSlots(startTime, endTime, intervalMin, occupied) {
    const slots = [];
    let [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    while (sh * 60 + sm < eh * 60 + em) {
      const time = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
      slots.push({ time, occupied: occupied.includes(time) });
      sm += intervalMin;
      if (sm >= 60) { sh++; sm -= 60; }
    }
    return slots;
  }

  /* ── Buscar paciente ── */
  async _searchPatients(query) {
    const resultsEl = document.getElementById('patient-search-results');
    if (!resultsEl || !query || query.length < 2) {
      if (resultsEl) resultsEl.style.display = 'none';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `<div style="padding:0.85rem;text-align:center;"><div class="loader" style="margin:0 auto;width:16px;height:16px;border-width:2px;"></div></div>`;

    const res = await API.get(`/patients/search?q=${encodeURIComponent(query)}&limit=5`);
    const list = res.success
      ? (res.data.patients || [])
      : DEMO_PATIENTS_SEARCH.filter(p =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.expedient.toLowerCase().includes(query.toLowerCase())
        );

    if (!list.length) {
      resultsEl.innerHTML = `<div style="padding:0.85rem;font-size:0.82rem;color:var(--text-muted);">Sin resultados para "${query}"</div>`;
      return;
    }

    resultsEl.innerHTML = list.map(p => `
      <div class="search-result-item" data-id="${p.id}" style="cursor:pointer;">
        <div class="avatar" style="width:32px;height:32px;font-size:0.75rem;background:rgba(26,111,255,0.15);color:#5599ff;">
          ${Format.initials(p.name)}
        </div>
        <div class="search-result-text">
          <div class="search-result-name">${p.name}</div>
          <div class="search-result-sub">${p.expedient} · ${DateUtils.age(p.dob)} años</div>
        </div>
      </div>`).join('');

    resultsEl.querySelectorAll('[data-id]').forEach(item => {
      item.addEventListener('click', () => {
        const pat = list.find(p => p.id === item.dataset.id);
        if (pat) this._selectPatient(pat);
        resultsEl.style.display = 'none';
        document.getElementById('patient-search').value = '';
      });
    });
  }

  _selectPatient(patient) {
    this.selectedPat = patient;
    document.getElementById('patient-search')?.setAttribute('style','display:none');

    const display = document.getElementById('selected-patient-display');
    if (display) display.style.display = 'block';

    const avatarEl = document.getElementById('sp-avatar');
    const nameEl   = document.getElementById('sp-name');
    const metaEl   = document.getElementById('sp-meta');

    if (avatarEl) avatarEl.textContent = Format.initials(patient.name);
    if (nameEl)   nameEl.textContent   = patient.name;
    if (metaEl)   metaEl.textContent   = `${patient.expedient} · ${DateUtils.age(patient.dob)} años`;

    this._updateSummary();
    this._updateSaveBtn();
  }

  async _preloadPatient(id) {
    const res = await API.get(`/patients/${id}`);
    const patient = res.success ? res.data : DEMO_PATIENTS_SEARCH.find(p => p.id === id);
    if (patient) this._selectPatient(patient);
  }

  /* ── Actualizar resumen ── */
  _updateSummary() {
    const summaryEl  = document.getElementById('appt-summary');
    const contentEl  = document.getElementById('summary-content');
    if (!summaryEl || !contentEl) return;

    if (!this.selectedPat && !this.selectedDoc && !this.selectedSlot) {
      summaryEl.style.display = 'none';
      return;
    }

    summaryEl.style.display = 'block';
    const date = document.getElementById('appt-date')?.value;

    const items = [
      ['Paciente',   this.selectedPat  ? this.selectedPat.name  : '—'],
      ['Médico',     this.selectedDoc  ? this.selectedDoc.name  : '—'],
      ['Especialidad',this.selectedDoc ? this.selectedDoc.specialty : '—'],
      ['Fecha',      date ? DateUtils.format(date + 'T12:00:00') : '—'],
      ['Hora',       this.selectedSlot || '—'],
      ['Duración',   `${document.getElementById('appt-duration')?.value || 30} minutos`],
    ];

    contentEl.innerHTML = items.map(([label, value]) => `
      <div>
        <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:2px;">${label}</div>
        <div style="font-size:0.87rem;font-weight:500;color:var(--text-primary);">${value}</div>
      </div>`).join('');
  }

  _updateSaveBtn() {
    const btn = document.getElementById('btn-save-appt');
    if (!btn) return;
    const ready = this.selectedPat && this.selectedDoc && this.selectedSlot;
    btn.disabled = !ready;
  }

  /* ── Guardar cita ── */
  async _saveAppointment() {
    if (this.saving || !this.selectedPat || !this.selectedDoc || !this.selectedSlot) return;

    const date     = document.getElementById('appt-date')?.value;
    const duration = parseInt(document.getElementById('appt-duration')?.value) || 30;
    const type     = document.getElementById('appt-type')?.value;
    const channel  = document.getElementById('appt-channel')?.value;
    const reason   = document.getElementById('appt-reason')?.value?.trim();
    const notes    = document.getElementById('appt-notes')?.value?.trim();

    if (!date) { Toast.error('Selecciona una fecha'); return; }

    const payload = {
      patientId:  this.selectedPat.id,
      doctorId:   this.selectedDoc.id,
      date:       `${date}T${this.selectedSlot}:00`,
      duration,
      type,
      channel,
      reason,
      notes,
      specialty:  this.selectedDoc.specialty,
    };

    this.saving = true;
    const btn   = document.getElementById('btn-save-appt');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;"></div> Guardando…`; }

    const res = await API.post('/appointments', payload);

    this.saving = false;

    if (res.success) {
      Toast.success('Cita agendada correctamente');
      // Emitir evento socket
      window._socket?.emit('appointment:created', { ...payload, patientName: this.selectedPat.name });
      setTimeout(() => window.location.href = '/pages/appointments/index.html', 1000);
    } else {
      // Demo fallback
      Toast.success('Cita agendada (modo demo)');
      setTimeout(() => window.location.href = '/pages/appointments/index.html', 1200);
    }
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    // Búsqueda de paciente
    document.getElementById('patient-search')?.addEventListener('input', (e) => {
      this._patSearch(e.target.value.trim());
    });

    // Cerrar resultados al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#step-patient')) {
        document.getElementById('patient-search-results')?.style.setProperty('display','none');
      }
    });

    // Limpiar paciente seleccionado
    document.getElementById('btn-clear-patient')?.addEventListener('click', () => {
      this.selectedPat = null;
      const searchInput = document.getElementById('patient-search');
      const display     = document.getElementById('selected-patient-display');
      if (searchInput) { searchInput.style.display = ''; searchInput.value = ''; }
      if (display) display.style.display = 'none';
      this._updateSummary();
      this._updateSaveBtn();
    });

    // Filtro de especialidad
    document.querySelectorAll('[data-spec]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-spec]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderDoctors(btn.dataset.spec);
      });
    });

    // Cambiar fecha → recargar slots
    document.getElementById('appt-date')?.addEventListener('change', () => {
      this.selectedSlot = null;
      this._updateSummary();
      this._updateSaveBtn();
      if (this.selectedDoc) this._loadTimeSlots();
    });

    // Cambiar duración → actualizar resumen
    document.getElementById('appt-duration')?.addEventListener('change', () => {
      this._updateSummary();
    });

    // Guardar
    document.getElementById('btn-save-appt')?.addEventListener('click', () => {
      this._saveAppointment();
    });
  }
}
