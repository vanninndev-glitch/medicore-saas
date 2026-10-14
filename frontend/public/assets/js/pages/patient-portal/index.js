/**
 * MediCore SaaS — patient-portal/index.js
 * Portal del paciente: mis citas, documentos, historial clínico propio
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format } from '../../core/utils.js';

/* ── Demo data del paciente ── */
const DEMO_PORTAL = {
  patient: {
    id: 'PAC-0001', name: 'María García López',
    dob: '1985-06-15', gender: 'Femenino', bloodType: 'A+',
    phone: '5512345678', email: 'maria@ejemplo.com',
    insurance: 'IMSS', insuranceNum: '87654321200',
    expedient: 'EXP-2024-1001',
    alerts: ['Alergia: Penicilina', 'DM Tipo 2'],
    avatarColor: '#1a6fff',
  },
  appointments: [
    { id:'CIT-001', date: new Date(Date.now()+5*86400000).toISOString(),  doctor:'Dr. Rodríguez', specialty:'Medicina Interna', status:'confirmed', type:'Seguimiento' },
    { id:'CIT-002', date: new Date(Date.now()+35*86400000).toISOString(), doctor:'Dra. Martínez',  specialty:'Endocrinología',  status:'confirmed', type:'Control DM2' },
    { id:'CIT-003', date: new Date(Date.now()-15*86400000).toISOString(), doctor:'Dr. López',      specialty:'Cardiología',     status:'completed', type:'Primera vez' },
  ],
  documents: [
    { id:'DOC-001', name:'Incapacidad_2024_0891.pdf', type:'Incapacidad', size:245000, date: new Date(Date.now()-2*86400000).toISOString() },
    { id:'DOC-002', name:'Lab_glucosa_HbA1c.pdf',    type:'Laboratorio', size:182000, date: new Date(Date.now()-30*86400000).toISOString() },
    { id:'DOC-003', name:'Receta_Metformina.pdf',    type:'Receta',      size:98000,  date: new Date(Date.now()-30*86400000).toISOString() },
  ],
  labResults: [
    { id:'LAB-001', date: new Date(Date.now()-30*86400000).toISOString(), tests:[
        { name:'Glucosa',    value:105, unit:'mg/dL', min:70, max:100, status:'high' },
        { name:'HbA1c',      value:6.8, unit:'%',     min:0,  max:5.7, status:'high' },
        { name:'Colesterol', value:188, unit:'mg/dL', min:0,  max:200, status:'normal' },
    ]},
  ],
  vitals: [
    { date:'2024-11-01', bp:'130/80', hr:88, temp:38.5, weight:68 },
    { date:'2024-10-01', bp:'128/78', hr:82, temp:36.8, weight:67.5 },
  ],
  notifications: [
    { id:1, text:'Su cita con Dr. Rodríguez es mañana a las 10:00 AM', time: new Date(Date.now()-3600000).toISOString(), read:false },
    { id:2, text:'Resultado de laboratorio disponible para descarga',   time: new Date(Date.now()-86400000).toISOString(), read:false },
    { id:3, text:'Próxima cita: 20/01/2025 — Recordatorio 24h',         time: new Date(Date.now()-172800000).toISOString(), read:true },
  ],
};

/* ════════════════════════════════════════
   CLASE: PORTAL DEL PACIENTE
════════════════════════════════════════ */
export class PatientPortal {
  constructor() {
    this.user    = Auth.getUser();
    this.patient = null;
    this.data    = null;
    this.tab     = 'overview';
  }

  async init() {
    await this._loadData();
    this._renderShell();
    this._bindEvents();
    this._bindSocket();
  }

  async _loadData() {
    const res  = await API.get('/patient-portal/me');
    this.data  = res.success ? res.data : DEMO_PORTAL;
    this.patient = this.data.patient;
  }

  /* ── Shell principal ── */
  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const p        = this.patient;
    const initials = Format.initials(p.name);
    const age      = DateUtils.age(p.dob);
    const unread   = this.data.notifications?.filter(n => !n.read).length || 0;

    pc.innerHTML = `
      <!-- Header del portal -->
      <div style="background:linear-gradient(135deg,rgba(26,111,255,0.12),rgba(0,212,255,0.07));border:1px solid rgba(0,212,255,0.15);border-radius:var(--radius-lg);padding:1.75rem 2rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;position:relative;overflow:hidden;">
        <div style="position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(0,212,255,0.1),transparent 70%);pointer-events:none;"></div>
        <div class="flex items-center gap-4">
          <div style="width:72px;height:72px;border-radius:50%;background:${p.avatarColor}22;color:${p.avatarColor};display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;border:3px solid ${p.avatarColor}44;box-shadow:0 0 20px ${p.avatarColor}33;flex-shrink:0;">${initials}</div>
          <div>
            <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;color:#fff;">Bienvenido/a, ${p.name.split(' ')[0]}</div>
            <div class="flex flex-wrap gap-3 mt-1">
              <span style="font-size:0.82rem;color:var(--text-secondary);">📋 ${p.expedient}</span>
              <span style="font-size:0.82rem;color:var(--text-secondary);">🎂 ${age} años</span>
              <span style="font-size:0.82rem;color:var(--text-secondary);">🩸 ${p.bloodType}</span>
              <span style="font-size:0.82rem;color:var(--text-secondary);">🏥 ${p.insurance}</span>
            </div>
            ${p.alerts?.length ? `
              <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.3rem;">
                ${p.alerts.map(a => `<span style="font-size:0.72rem;background:rgba(255,71,87,0.12);color:var(--accent-red);border:1px solid rgba(255,71,87,0.2);border-radius:100px;padding:0.15rem 0.55rem;">⚠ ${a}</span>`).join('')}
              </div>` : ''}
          </div>
        </div>
        <div class="flex flex-col gap-2" style="flex-shrink:0;">
          <a href="/pages/appointments/new.html?patientId=${p.id}" class="btn btn-primary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="12" y1="11" x2="12" y2="17" stroke-linecap="round"/></svg>
            Agendar cita
          </a>
          ${unread > 0 ? `<div style="font-size:0.78rem;color:var(--accent-amber);text-align:center;">🔔 ${unread} notificación(es) sin leer</div>` : ''}
        </div>
      </div>

      <!-- Tabs del portal -->
      <div class="profile-tabs" style="margin-bottom:1.5rem;">
        <button class="profile-tab active" data-portal-tab="overview">Resumen</button>
        <button class="profile-tab" data-portal-tab="appointments">Mis citas</button>
        <button class="profile-tab" data-portal-tab="documents">Mis documentos</button>
        <button class="profile-tab" data-portal-tab="lab">Mis resultados</button>
        <button class="profile-tab" data-portal-tab="vitals">Signos vitales</button>
        <button class="profile-tab" data-portal-tab="notifications">
          Notificaciones ${unread > 0 ? `<span class="nav-badge" style="font-size:0.65rem;margin-left:4px;">${unread}</span>` : ''}
        </button>
      </div>

      <!-- Contenido de tabs -->
      <div id="portal-tab-overview">${this._buildOverviewTab()}</div>
      <div id="portal-tab-appointments" style="display:none;">${this._buildAppointmentsTab()}</div>
      <div id="portal-tab-documents"    style="display:none;">${this._buildDocumentsTab()}</div>
      <div id="portal-tab-lab"          style="display:none;">${this._buildLabTab()}</div>
      <div id="portal-tab-vitals"       style="display:none;">${this._buildVitalsTab()}</div>
      <div id="portal-tab-notifications"style="display:none;">${this._buildNotificationsTab()}</div>`;
  }

  /* ── Resumen general ── */
  _buildOverviewTab() {
    const upcoming = this.data.appointments?.filter(a => a.status === 'confirmed' && new Date(a.date) > new Date()) || [];
    const nextAppt = upcoming[0];

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem;">

        <!-- Próxima cita -->
        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">📅 Próxima cita</div>
          ${nextAppt ? `
            <div style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:10px;padding:1rem;">
              <div style="font-size:0.95rem;font-weight:700;color:#fff;margin-bottom:0.3rem;">${nextAppt.specialty}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.5rem;">${nextAppt.doctor}</div>
              <div style="font-family:var(--font-mono);font-size:0.82rem;color:var(--accent-cyan);margin-bottom:0.5rem;">
                📅 ${DateUtils.formatDateTime(nextAppt.date)}
              </div>
              <span class="badge badge-green" style="font-size:0.7rem;">Confirmada</span>
            </div>
            <div class="flex gap-2 mt-3">
              <button class="btn btn-secondary btn-sm" style="flex:1;">Cancelar cita</button>
              <a href="/pages/appointments/new.html?patientId=${this.patient.id}" class="btn btn-primary btn-sm" style="flex:1;">Reagendar</a>
            </div>` : `
            <div style="text-align:center;padding:1.5rem;color:var(--text-muted);">
              Sin citas próximas
              <div style="margin-top:0.75rem;">
                <a href="/pages/appointments/new.html?patientId=${this.patient.id}" class="btn btn-primary btn-sm">Agendar ahora</a>
              </div>
            </div>`}
        </div>

        <!-- Alertas médicas -->
        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">⚕️ Mis alertas médicas</div>
          ${this.patient.alerts?.length ? `
            ${this.patient.alerts.map(a => `
              <div style="display:flex;align-items:center;gap:0.65rem;padding:0.65rem;background:rgba(255,71,87,0.06);border:1px solid rgba(255,71,87,0.15);border-radius:8px;margin-bottom:0.5rem;">
                <span style="font-size:1rem;flex-shrink:0;">⚠️</span>
                <span style="font-size:0.87rem;color:var(--text-primary);">${a}</span>
              </div>`).join('')}
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.75rem;">
              Informa siempre de estas alertas a tu médico antes de cualquier tratamiento.
            </div>` : `<div style="color:var(--text-muted);font-size:0.85rem;">Sin alertas médicas registradas ✓</div>`}
        </div>

        <!-- Información de contacto -->
        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">📞 Mi información</div>
          ${[
            ['Expediente',  this.patient.expedient],
            ['Teléfono',    Format.phone(this.patient.phone)],
            ['Email',       this.patient.email],
            ['Seguro',      `${this.patient.insurance} · ${this.patient.insuranceNum}`],
          ].map(([label, val]) => `
            <div class="mini-metric">
              <span class="mini-metric-label">${label}</span>
              <span style="font-size:0.85rem;color:var(--text-primary);">${val}</span>
            </div>`).join('')}
        </div>

        <!-- Documentos recientes -->
        <div class="chart-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div class="chart-title">📄 Documentos recientes</div>
            <button class="profile-tab" data-portal-tab="documents" style="font-size:0.78rem;color:var(--accent-cyan);background:none;border:none;cursor:pointer;padding:0;">Ver todos →</button>
          </div>
          ${(this.data.documents || []).slice(0, 3).map(d => `
            <div style="display:flex;align-items:center;gap:0.65rem;padding:0.6rem;border-radius:8px;transition:background 0.15s;cursor:pointer;"
              onmouseover="this.style.background='rgba(0,212,255,0.04)'" onmouseout="this.style.background=''">
              <span style="font-size:1.2rem;">📋</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.83rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${DateUtils.timeAgo(d.date)}</div>
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" title="Descargar">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </button>
            </div>`).join('')}
        </div>

      </div>`;
  }

  /* ── Mis citas ── */
  _buildAppointmentsTab() {
    const upcoming  = this.data.appointments?.filter(a => new Date(a.date) > new Date()) || [];
    const past      = this.data.appointments?.filter(a => new Date(a.date) <= new Date()) || [];

    const statusMap = {
      confirmed:  ['badge-green','Confirmada'],
      waiting:    ['badge-amber','En espera'],
      completed:  ['badge-blue','Completada'],
      cancelled:  ['badge-red','Cancelada'],
    };

    const buildList = (appts, canCancel) => appts.map(a => {
      const [cls, label] = statusMap[a.status] || statusMap.confirmed;
      return `
        <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.1rem;margin-bottom:0.75rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;transition:border-color 0.2s;">
          <div style="width:3px;height:48px;background:var(--accent-cyan);border-radius:2px;flex-shrink:0;"></div>
          <div style="flex:1;min-width:180px;">
            <div style="font-weight:700;color:#fff;font-size:0.95rem;">${a.specialty}</div>
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">${a.doctor}</div>
            <div style="font-family:var(--font-mono);font-size:0.78rem;color:var(--accent-cyan);margin-top:4px;">
              📅 ${DateUtils.formatDateTime(a.date)}
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge ${cls}" style="font-size:0.72rem;">${label}</span>
            ${canCancel && a.status === 'confirmed' ? `
              <button class="btn btn-secondary btn-sm" style="font-size:0.72rem;">Cancelar</button>
              <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;">Reagendar</button>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div>
        <div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.75rem;">Próximas citas (${upcoming.length})</div>
        ${upcoming.length ? buildList(upcoming, true) : `<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sin citas programadas. <a href="/pages/appointments/new.html?patientId=${this.patient.id}" style="color:var(--accent-cyan);">Agendar →</a></div>`}

        <div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin:1.5rem 0 0.75rem;">Historial de citas (${past.length})</div>
        ${buildList(past, false)}
      </div>`;
  }

  /* ── Mis documentos ── */
  _buildDocumentsTab() {
    const typeIcon = { Incapacidad:'📋', Laboratorio:'🧪', Receta:'💊', Imagen:'🩻', Otro:'📄' };
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Tamaño</th><th></th></tr></thead>
          <tbody>
            ${(this.data.documents || []).map(d => `
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    <span style="font-size:1.1rem;">${typeIcon[d.type] || '📄'}</span>
                    <span style="font-size:0.87rem;color:var(--text-primary);">${d.name}</span>
                  </div>
                </td>
                <td><span class="badge badge-blue" style="font-size:0.7rem;">${d.type}</span></td>
                <td style="font-size:0.82rem;color:var(--text-muted);">${DateUtils.format(d.date)}</td>
                <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${Format.fileSize(d.size)}</td>
                <td>
                  <button class="btn btn-primary btn-sm" style="font-size:0.72rem;" onclick="window._portal?._downloadDoc('${d.id}','${d.name}')">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Descargar
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Mis resultados de laboratorio ── */
  _buildLabTab() {
    const results = this.data.labResults || [];
    return results.map(lab => `
      <div class="form-section" style="margin-bottom:1.25rem;">
        <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.75rem;">
          📅 ${DateUtils.format(lab.date)} — Resultado de laboratorio
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Estudio</th><th>Resultado</th><th>Unidad</th><th>Rango normal</th><th>Estado</th></tr></thead>
            <tbody>
              ${lab.tests.map(t => {
                const isAbn = t.status !== 'normal';
                return `
                  <tr>
                    <td style="font-weight:500;color:var(--text-primary);">${t.name}</td>
                    <td>
                      <span style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700;color:${isAbn ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${t.value} ${t.status === 'high' ? '↑' : t.status === 'low' ? '↓' : ''}
                      </span>
                    </td>
                    <td style="font-size:0.8rem;color:var(--text-muted);">${t.unit}</td>
                    <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${t.min} – ${t.max}</td>
                    <td><span class="badge ${isAbn ? 'badge-red' : 'badge-green'}" style="font-size:0.7rem;">${isAbn ? '⚠ Anormal' : '✓ Normal'}</span></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${lab.tests.some(t => t.status !== 'normal') ? `
          <div style="margin-top:0.75rem;padding:0.75rem;background:rgba(255,179,71,0.08);border:1px solid rgba(255,179,71,0.2);border-radius:8px;font-size:0.82rem;color:var(--accent-amber);">
            ⚠ Algunos valores están fuera del rango normal. Consulta con tu médico para interpretación.
          </div>` : ''}
      </div>`).join('');
  }

  /* ── Signos vitales ── */
  _buildVitalsTab() {
    const vitals = this.data.vitals || [];
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>T/A</th><th>FC (bpm)</th><th>Temp (°C)</th><th>Peso (kg)</th></tr></thead>
          <tbody>
            ${vitals.map(v => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:0.82rem;">${DateUtils.format(v.date+'T12:00:00')}</td>
                <td><span style="font-weight:600;color:var(--text-primary);">${v.bp}</span></td>
                <td>${v.hr}</td>
                <td><span style="color:${v.temp > 37.5 ? 'var(--accent-red)' : 'var(--text-primary)'};">${v.temp}</span></td>
                <td>${v.weight}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Notificaciones ── */
  _buildNotificationsTab() {
    const notifs = this.data.notifications || [];
    return `
      <div style="max-width:600px;">
        <div class="flex justify-between items-center mb-4">
          <span style="font-size:0.85rem;color:var(--text-muted);">${notifs.length} notificación(es)</span>
          <button class="btn btn-ghost btn-sm" onclick="window._portal?._markAllRead()">Marcar todas como leídas</button>
        </div>
        ${notifs.map(n => `
          <div style="display:flex;align-items:flex-start;gap:0.85rem;padding:0.85rem;background:${!n.read ? 'rgba(0,212,255,0.04)' : 'transparent'};border:1px solid ${!n.read ? 'rgba(0,212,255,0.12)' : 'var(--border-subtle)'};border-radius:var(--radius-md);margin-bottom:0.6rem;transition:all 0.2s;" id="notif-${n.id}">
            <div style="width:10px;height:10px;border-radius:50%;background:${!n.read ? 'var(--accent-cyan)' : 'transparent'};border:2px solid ${!n.read ? 'var(--accent-cyan)' : 'var(--border-dim)'};flex-shrink:0;margin-top:4px;box-shadow:${!n.read ? '0 0 6px rgba(0,212,255,0.4)' : 'none'};"></div>
            <div style="flex:1;">
              <div style="font-size:0.87rem;color:var(--text-primary);line-height:1.4;">${n.text}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${DateUtils.timeAgo(n.time)}</div>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="window._portal?._markRead(${n.id})" title="Marcar leída">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </button>
          </div>`).join('')}
      </div>`;
  }

  /* ── Helpers ── */
  async _downloadDoc(id, name) {
    Toast.info('Preparando descarga…');
    const res = await API.download(`/documents/${id}/download`, name);
    if (!res.success) Toast.success('Descarga simulada (modo demo)');
  }

  _markRead(id) {
    const n = this.data.notifications?.find(n => n.id === id);
    if (n) n.read = true;
    const el = document.getElementById(`notif-${id}`);
    if (el) {
      el.style.background = 'transparent';
      el.style.borderColor = 'var(--border-subtle)';
    }
  }

  _markAllRead() {
    this.data.notifications?.forEach(n => { n.read = true; });
    document.querySelectorAll('[id^="notif-"]').forEach(el => {
      el.style.background = 'transparent';
      el.style.borderColor = 'var(--border-subtle)';
    });
    Toast.success('Notificaciones marcadas como leídas');
  }

  /* ── Tabs binding ── */
  _bindEvents() {
    window._portal = this;

    document.querySelectorAll('[data-portal-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-portal-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.portalTab;
        ['overview','appointments','documents','lab','vitals','notifications'].forEach(t => {
          const el = document.getElementById(`portal-tab-${t}`);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
      });
    });
  }

  /* ── Socket tiempo real ── */
  _bindSocket() {
    const socket = window._socket;
    if (!socket) return;

    socket.on('notification:new', (notif) => {
      if (!this.data.notifications) this.data.notifications = [];
      this.data.notifications.unshift({ ...notif, read: false });
      Toast.info(notif.message || 'Nueva notificación');
    });

    socket.on('appointment:updated', (data) => {
      const idx = this.data.appointments?.findIndex(a => a.id === data.id);
      if (idx !== -1 && this.data.appointments) {
        this.data.appointments[idx] = { ...this.data.appointments[idx], ...data };
      }
    });
  }
}
