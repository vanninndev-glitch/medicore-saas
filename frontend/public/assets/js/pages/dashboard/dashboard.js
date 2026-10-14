/**
 * MediCore SaaS — dashboard.js
 * Lógica completa del dashboard: KPIs, gráficas, camas, actividad, tiempo real
 */

import { API }          from '../../core/api.js';
import { Store }        from '../../core/store.js';
import { Auth }         from '../../core/auth.js';
import { DateUtils, Format } from '../../core/utils.js';
import { DashboardScene }   from '../../three/dashboard-bg.js';

/* ══════════════════════════════════════════
   DATOS DEMO (se usan cuando la API no responde)
══════════════════════════════════════════ */
const DEMO_DATA = {
  kpis: {
    patientsToday:  { value: 47,  delta: +12, trend: 'up' },
    appointmentsToday: { value: 38, delta: +5, trend: 'up' },
    bedsOccupied:   { value: 82,  total: 120, delta: -3, trend: 'down' },
    urgenciesActive:{ value: 6,   delta: +2,  trend: 'up' },
    labPending:     { value: 14,  delta: -4,  trend: 'down' },
    revenueToday:   { value: 48500, delta: +8.3, trend: 'up' },
  },
  appointmentsToday: [
    { id:1, time:'08:00', patientName:'María García López',    type:'Consulta General',  status:'confirmed', color:'#00e5a0' },
    { id:2, time:'08:30', patientName:'Carlos Mendoza Ruiz',   type:'Cardiología',        status:'waiting',   color:'#5599ff' },
    { id:3, time:'09:00', patientName:'Ana Jiménez Torres',    type:'Pediatría',          status:'in_progress',color:'#00d4ff' },
    { id:4, time:'09:30', patientName:'Roberto Silva Peña',    type:'Traumatología',      status:'confirmed', color:'#a78bfa' },
    { id:5, time:'10:00', patientName:'Lucía Hernández Vega',  type:'Ginecología',        status:'confirmed', color:'#ffb347' },
    { id:6, time:'10:30', patientName:'Fernando Díaz Morales', type:'Neurología',         status:'cancelled', color:'#ff4757' },
  ],
  urgencies: [
    { id:1, name:'Juan Pérez Soto',    triage:1, reason:'Dolor torácico severo',    waitMin:5  },
    { id:2, name:'Elena Ramos Cruz',   triage:2, reason:'Fractura expuesta fémur',  waitMin:12 },
    { id:3, name:'Miguel Torres Díaz', triage:3, reason:'Fiebre 39.5°C, cefalea',   waitMin:25 },
  ],
  activity: [
    { type:'appointment', text:'Nueva cita agendada para <strong>María García</strong>', time: new Date(Date.now()-5*60000).toISOString(),   color:'#00e5a0' },
    { type:'lab',         text:'Resultados de laboratorio listos — <strong>Expediente #4821</strong>', time: new Date(Date.now()-18*60000).toISOString(), color:'#00d4ff' },
    { type:'urgency',     text:'Paciente admitido a urgencias — Triage <strong>Nivel 2</strong>', time: new Date(Date.now()-32*60000).toISOString(), color:'#ff4757' },
    { type:'record',      text:'Historial clínico actualizado — <strong>Dr. López</strong>', time: new Date(Date.now()-45*60000).toISOString(), color:'#5599ff' },
    { type:'document',    text:'Incapacidad generada — <strong>Folio INC-2024-0891</strong>', time: new Date(Date.now()-58*60000).toISOString(), color:'#a78bfa' },
    { type:'bed',         text:'Cama <strong>B-14</strong> asignada a paciente nuevo', time: new Date(Date.now()-72*60000).toISOString(), color:'#ffb347' },
  ],
  beds: (() => {
    const beds = [];
    const statuses = ['available','available','available','occupied','occupied','occupied','occupied','reserved','cleaning','maintenance'];
    for (let i = 1; i <= 40; i++) {
      const st = statuses[Math.floor(Math.random() * statuses.length)];
      beds.push({ number: i < 10 ? `0${i}` : `${i}`, status: st, ward: i <= 20 ? 'A' : 'B', patient: st === 'occupied' ? 'Pac.' : null });
    }
    return beds;
  })(),
  chartConsultas: {
    labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
    data:   [32, 45, 38, 51, 47, 22, 18],
    prev:   [28, 40, 35, 44, 42, 20, 15],
  },
  chartDiagnoses: {
    labels: ['HTA','DM2','EPOC','Obesidad','Ansiedad','Fractura','Infección'],
    data:   [24, 18, 12, 15, 10, 8, 7],
  },
};

/* ══════════════════════════════════════════
   CLASE PRINCIPAL DASHBOARD
══════════════════════════════════════════ */
export class Dashboard {
  constructor() {
    this.user    = Auth.getUser();
    this.data    = null;
    this.charts  = {};
    this.scene   = null;
    this._unsubs = [];
  }

  /* ── Inicializar ── */
  async init() {
    this._renderSkeleton();
    this._initThreeJS();

    const [data] = await Promise.all([
      this._fetchDashboardData(),
      new Promise(r => setTimeout(r, 400)), // mínimo skeleton visible
    ]);

    this.data = data;
    this._renderWelcome();
    this._renderKPIs();
    this._renderAppointments();
    this._renderUrgencies();
    this._renderBeds();
    this._renderActivity();
    this._renderCharts();
    this._renderMiniMetrics();
    this._bindSocketEvents();
    this._startClock();
    this._animateKPIs();
  }

  /* ── Fetch con fallback a demo ── */
  async _fetchDashboardData() {
    const res = await API.get('/dashboard/summary');
    if (res.success) return res.data;
    return DEMO_DATA; // fallback demo
  }

  /* ── Three.js de fondo ── */
  _initThreeJS() {
    if (typeof THREE !== 'undefined') {
      try { this.scene = new DashboardScene('dashboard-canvas'); } catch (e) {
        console.warn('[Dashboard] Three.js:', e);
      }
    }
  }

  /* ── Skeleton loader ── */
  _renderSkeleton() {
    const pc = document.getElementById('page-content');
    if (!pc) return;
    pc.innerHTML = `
      <canvas id="dashboard-canvas" style="position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.3;"></canvas>
      <div style="position:relative;z-index:1;">
        <div id="welcome-section"></div>
        <div class="kpi-row" id="kpi-row" style="margin-bottom:1.25rem;">
          ${Array(6).fill(0).map(() => `
            <div class="kpi-card" style="min-height:110px;">
              <div style="height:10px;width:60%;background:rgba(255,255,255,0.06);border-radius:4px;margin-bottom:1rem;"></div>
              <div style="height:32px;width:45%;background:rgba(255,255,255,0.08);border-radius:6px;margin-bottom:0.75rem;animation:pulse 1.5s infinite;"></div>
              <div style="height:20px;width:30%;background:rgba(255,255,255,0.04);border-radius:4px;"></div>
            </div>`).join('')}
        </div>
        <div class="dashboard-grid" id="dashboard-grid">
          ${Array(4).fill(0).map(() => `
            <div class="chart-panel" style="grid-column:span 6;min-height:280px;">
              <div style="height:14px;width:40%;background:rgba(255,255,255,0.07);border-radius:4px;margin-bottom:1.5rem;animation:pulse 1.5s infinite;"></div>
              <div style="height:200px;background:rgba(255,255,255,0.03);border-radius:8px;animation:pulse 1.5s infinite;"></div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  /* ── Welcome banner ── */
  _renderWelcome() {
    const el = document.getElementById('welcome-section');
    if (!el) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const firstName = this.user?.name?.split(' ')[0] || 'Doctor';

    const roleGreeting = {
      superadmin: 'Vista global del sistema SaaS',
      hospital_admin: `Vista general — ${this.user?.hospitalName || 'Tu hospital'}`,
      medical_director: 'Resumen ejecutivo médico',
      doctor: 'Tu agenda y pacientes de hoy',
      nurse: 'Turno activo — cuidados y seguimiento',
      receptionist: 'Agenda del día y admisiones',
    };

    el.innerHTML = `
      <div class="welcome-banner" style="margin-bottom:1.25rem;">
        <div>
          <div class="welcome-time" id="live-clock">
            ${DateUtils.formatDateTime(new Date())}
          </div>
          <div class="welcome-name">${greeting}, ${firstName}</div>
          <div class="welcome-sub">${roleGreeting[this.user?.role] || 'Panel de control hospitalario'}</div>
        </div>
        <div class="flex gap-3 flex-wrap">
          <a href="/pages/appointments/new.html" class="btn btn-primary btn-sm">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Nueva cita
          </a>
          <a href="/pages/patients/register.html" class="btn btn-secondary btn-sm">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            Nuevo paciente
          </a>
        </div>
      </div>`;
  }

  /* ── KPI Cards ── */
  _renderKPIs() {
    const kpis = this.data?.kpis || DEMO_DATA.kpis;
    const el   = document.getElementById('kpi-row');
    if (!el) return;

    const cards = [
      {
        id: 'kpi-patients', key: 'patientsToday', cls: 'kpi-blue',
        label: 'Pacientes hoy',
        value: kpis.patientsToday?.value ?? 0,
        delta: kpis.patientsToday?.delta,
        trend: kpis.patientsToday?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
        href: '/pages/patients/index.html',
      },
      {
        id: 'kpi-appointments', key: 'appointmentsToday', cls: 'kpi-cyan',
        label: 'Citas programadas',
        value: kpis.appointmentsToday?.value ?? 0,
        delta: kpis.appointmentsToday?.delta,
        trend: kpis.appointmentsToday?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/></svg>`,
        href: '/pages/appointments/index.html',
      },
      {
        id: 'kpi-beds', key: 'bedsOccupied', cls: 'kpi-amber',
        label: 'Camas ocupadas',
        value: kpis.bedsOccupied?.value ?? 0,
        suffix: kpis.bedsOccupied?.total ? `/${kpis.bedsOccupied.total}` : '',
        delta: kpis.bedsOccupied?.delta,
        trend: kpis.bedsOccupied?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M3 12V8a4 4 0 014-4h10a4 4 0 014 4v4M3 12v6m18-6v6M3 18h18"/></svg>`,
        href: '/pages/hospitalizations/beds.html',
      },
      {
        id: 'kpi-urgencies', key: 'urgenciesActive', cls: 'kpi-red',
        label: 'Urgencias activas',
        value: kpis.urgenciesActive?.value ?? 0,
        delta: kpis.urgenciesActive?.delta,
        trend: kpis.urgenciesActive?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
        href: '/pages/urgencies/index.html',
      },
      {
        id: 'kpi-lab', key: 'labPending', cls: 'kpi-green',
        label: 'Lab. pendientes',
        value: kpis.labPending?.value ?? 0,
        delta: kpis.labPending?.delta,
        trend: kpis.labPending?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6m-3 9v4"/></svg>`,
        href: '/pages/lab/index.html',
      },
      {
        id: 'kpi-revenue', key: 'revenueToday', cls: 'kpi-purple',
        label: 'Ingresos hoy',
        value: Format.currency(kpis.revenueToday?.value ?? 0),
        isFormatted: true,
        delta: kpis.revenueToday?.delta,
        trend: kpis.revenueToday?.trend,
        icon: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        href: '/pages/billing/index.html',
      },
    ];

    el.innerHTML = cards.map(c => {
      const deltaHtml = c.delta !== undefined ? `
        <span class="kpi-delta ${c.trend === 'up' ? 'up' : c.trend === 'down' ? 'down' : 'flat'}">
          ${c.trend === 'up' ? '↑' : c.trend === 'down' ? '↓' : '→'}
          ${Math.abs(c.delta)}${typeof c.delta === 'number' && !c.isFormatted ? '' : '%'} vs ayer
        </span>` : '';

      const displayValue = c.isFormatted ? c.value : `<span data-target="${c.value}">0</span>${c.suffix || ''}`;

      return `
        <a href="${c.href}" class="kpi-card ${c.cls}" id="${c.id}" style="text-decoration:none;">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-value">${displayValue}</div>
          ${deltaHtml}
          <div class="kpi-icon">${c.icon}</div>
        </a>`;
    }).join('');
  }

  /* ── Animar números KPI ── */
  _animateKPIs() {
    document.querySelectorAll('[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target) || 0;
      const duration = 1200;
      const start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(ease * target);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ── Grid principal de paneles ── */
  _setupGrid() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    grid.innerHTML = `
      <!-- Col izquierda -->
      <div style="grid-column: span 8; display:flex; flex-direction:column; gap:1.25rem;" class="col-lg-8">
        <div class="chart-panel" id="chart-consultas-panel"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
          <div class="chart-panel" id="chart-diagnoses-panel"></div>
          <div class="chart-panel" id="beds-panel"></div>
        </div>
      </div>
      <!-- Col derecha -->
      <div style="grid-column: span 4; display:flex; flex-direction:column; gap:1.25rem;" class="col-lg-4">
        <div class="chart-panel" id="appointments-panel"></div>
        <div class="chart-panel" id="urgencies-panel"></div>
        <div class="chart-panel" id="activity-panel"></div>
        <div class="chart-panel" id="mini-metrics-panel"></div>
      </div>`;
  }

  /* ── Gráficas ── */
  _renderCharts() {
    this._setupGrid();

    // Dar tiempo al DOM
    requestAnimationFrame(() => {
      this._renderChartConsultas();
      this._renderChartDiagnoses();
      this._renderBeds();
      this._renderAppointments();
      this._renderUrgencies();
      this._renderActivity();
      this._renderMiniMetrics();
    });
  }

  _renderChartConsultas() {
    const panel = document.getElementById('chart-consultas-panel');
    if (!panel) return;

    const d = this.data?.chartConsultas || DEMO_DATA.chartConsultas;

    panel.innerHTML = `
      <div class="chart-panel-header">
        <div>
          <div class="chart-title">Consultas por día</div>
          <div class="chart-subtitle">Esta semana vs semana anterior</div>
        </div>
        <div class="chart-filters">
          <button class="chart-filter-btn active" data-range="week">Semana</button>
          <button class="chart-filter-btn" data-range="month">Mes</button>
          <button class="chart-filter-btn" data-range="year">Año</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="chart-consultas"></canvas></div>`;

    const ctx = document.getElementById('chart-consultas')?.getContext('2d');
    if (!ctx) return;

    this.charts.consultas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [
          {
            label: 'Esta semana',
            data: d.data,
            backgroundColor: 'rgba(0,212,255,0.25)',
            borderColor: 'rgba(0,212,255,0.8)',
            borderWidth: 1.5,
            borderRadius: 5,
          },
          {
            label: 'Semana anterior',
            data: d.prev,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1.5,
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#7ba3c4', font: { size: 11 }, boxWidth: 10 } },
          tooltip: { backgroundColor: '#0f1f33', borderColor: 'rgba(0,212,255,0.3)', borderWidth: 1, titleColor: '#e8f4fd', bodyColor: '#7ba3c4' },
        },
        scales: {
          x: { ticks: { color: '#3d6080', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#3d6080', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
        },
      },
    });

    // Filtros
    panel.querySelectorAll('.chart-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.chart-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._loadChartRange(btn.dataset.range);
      });
    });
  }

  async _loadChartRange(range) {
    const res = await API.get(`/dashboard/chart/consultas?range=${range}`);
    const d   = res.success ? res.data : this._generateRangeData(range);

    if (this.charts.consultas) {
      this.charts.consultas.data.labels   = d.labels;
      this.charts.consultas.data.datasets[0].data = d.data;
      this.charts.consultas.data.datasets[1].data = d.prev;
      this.charts.consultas.update();
    }
  }

  _generateRangeData(range) {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    if (range === 'month') {
      return {
        labels: Array.from({length: 4}, (_, i) => `Sem ${i+1}`),
        data: [185,210,198,230], prev: [170,195,185,210],
      };
    }
    return {
      labels: months,
      data: Array.from({length:12}, () => 400+Math.floor(Math.random()*200)),
      prev: Array.from({length:12}, () => 350+Math.floor(Math.random()*200)),
    };
  }

  _renderChartDiagnoses() {
    const panel = document.getElementById('chart-diagnoses-panel');
    if (!panel) return;

    const d = this.data?.chartDiagnoses || DEMO_DATA.chartDiagnoses;

    panel.innerHTML = `
      <div class="chart-panel-header">
        <div>
          <div class="chart-title">Top diagnósticos</div>
          <div class="chart-subtitle">ICD-10 este mes</div>
        </div>
      </div>
      <div class="chart-wrap" style="height:180px;"><canvas id="chart-diagnoses"></canvas></div>`;

    const ctx = document.getElementById('chart-diagnoses')?.getContext('2d');
    if (!ctx) return;

    this.charts.diagnoses = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.data,
          backgroundColor: [
            'rgba(0,212,255,0.7)','rgba(0,229,160,0.7)','rgba(26,111,255,0.7)',
            'rgba(255,179,71,0.7)','rgba(167,139,250,0.7)','rgba(255,71,87,0.7)',
            'rgba(255,128,0,0.7)',
          ],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#7ba3c4', font: { size: 10 }, boxWidth: 10, padding: 8 },
          },
          tooltip: {
            backgroundColor: '#0f1f33',
            borderColor: 'rgba(0,212,255,0.3)',
            borderWidth: 1,
          },
        },
      },
    });
  }

  /* ── Mapa de camas ── */
  _renderBeds() {
    const panel = document.getElementById('beds-panel');
    if (!panel) return;

    const beds = this.data?.beds || DEMO_DATA.beds;
    const occupied    = beds.filter(b => b.status === 'occupied').length;
    const available   = beds.filter(b => b.status === 'available').length;
    const total       = beds.length;
    const occupancy   = Math.round((occupied / total) * 100);

    panel.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.75rem;">
        <div>
          <div class="chart-title">Mapa de camas</div>
          <div class="chart-subtitle">${occupied}/${total} ocupadas · ${occupancy}%</div>
        </div>
        <a href="/pages/hospitalizations/beds.html" style="font-size:0.78rem;color:var(--accent-cyan);">Ver todo</a>
      </div>
      <!-- Leyenda -->
      <div class="flex flex-wrap gap-3" style="margin-bottom:0.85rem;">
        ${[
          ['available','var(--accent-green)','Disponible'],
          ['occupied','var(--accent-red)','Ocupada'],
          ['reserved','var(--accent-amber)','Reservada'],
          ['cleaning','#5599ff','Limpieza'],
        ].map(([s,c,l]) => `
          <span style="display:flex;align-items:center;gap:0.3rem;font-size:0.68rem;color:var(--text-muted);">
            <span style="width:8px;height:8px;border-radius:2px;background:${c};opacity:0.7;flex-shrink:0;"></span>${l}
          </span>`).join('')}
      </div>
      <!-- Grid de camas -->
      <div class="beds-grid" id="beds-grid">
        ${beds.map(b => `
          <div class="bed-cell ${b.status}" title="Cama ${b.ward}-${b.number} · ${b.status}" data-bed-id="${b.number}">
            <span class="bed-number">${b.ward}${b.number}</span>
            ${b.status === 'occupied' ? `<svg width="9" height="9" fill="currentColor" viewBox="0 0 20 20" style="opacity:0.7"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>` : ''}
          </div>`).join('')}
      </div>
      <!-- Barra de ocupación -->
      <div style="margin-top:0.85rem;">
        <div class="flex justify-between" style="margin-bottom:4px;">
          <span style="font-size:0.72rem;color:var(--text-muted);">Ocupación</span>
          <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-secondary);">${occupancy}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="beds-progress"
            style="width:0%;--fill-color:${occupancy > 85 ? 'var(--accent-red)' : occupancy > 65 ? 'var(--accent-amber)' : 'var(--accent-green)'};">
          </div>
        </div>
      </div>`;

    // Animar barra
    setTimeout(() => {
      const bar = document.getElementById('beds-progress');
      if (bar) bar.style.width = `${occupancy}%`;
    }, 300);

    // Click en cama
    panel.querySelectorAll('.bed-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const id = cell.dataset.bedId;
        window.location.href = `/pages/hospitalizations/beds.html?bed=${id}`;
      });
    });
  }

  /* ── Citas del día ── */
  _renderAppointments() {
    const panel = document.getElementById('appointments-panel');
    if (!panel) return;

    const appts = this.data?.appointmentsToday || DEMO_DATA.appointmentsToday;

    const statusBadge = {
      confirmed:    { label: 'Confirmada',  cls: 'badge-green' },
      waiting:      { label: 'En espera',   cls: 'badge-amber' },
      in_progress:  { label: 'En curso',    cls: 'badge-cyan'  },
      cancelled:    { label: 'Cancelada',   cls: 'badge-red'   },
      completed:    { label: 'Completada',  cls: 'badge-blue'  },
    };

    panel.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.75rem;">
        <div>
          <div class="chart-title">Citas de hoy</div>
          <div class="chart-subtitle">${appts.length} programadas</div>
        </div>
        <a href="/pages/appointments/index.html" style="font-size:0.78rem;color:var(--accent-cyan);">Ver todas</a>
      </div>
      <div class="appointment-list">
        ${appts.slice(0, 6).map(a => {
          const st = statusBadge[a.status] || statusBadge.confirmed;
          return `
            <div class="appointment-row" onclick="window.location='/pages/appointments/index.html?id=${a.id}'">
              <div class="appt-time">${a.time}</div>
              <div class="appt-divider" style="background:${a.color};"></div>
              <div class="appt-info">
                <div class="appt-patient">${a.patientName}</div>
                <div class="appt-type">${a.type}</div>
              </div>
              <span class="badge ${st.cls}" style="font-size:0.65rem;">${st.label}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ── Urgencias activas ── */
  _renderUrgencies() {
    const panel = document.getElementById('urgencies-panel');
    if (!panel) return;

    const urg = this.data?.urgencies || DEMO_DATA.urgencies;

    panel.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.75rem;">
        <div class="flex items-center gap-2">
          <div class="chart-title">Urgencias activas</div>
          ${urg.length > 0 ? `<span class="badge badge-red" style="animation:pulse 2s infinite;">${urg.length}</span>` : ''}
        </div>
        <a href="/pages/urgencies/index.html" style="font-size:0.78rem;color:var(--accent-cyan);">Ver triaje</a>
      </div>
      ${urg.length === 0
        ? `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;">
             <div class="dot dot-green" style="margin:0 auto 0.5rem;"></div>Sin urgencias activas
           </div>`
        : urg.map(u => `
          <div class="urgency-item" onclick="window.location='/pages/urgencies/triage.html?id=${u.id}'">
            <div class="triage-badge triage-${u.triage}" title="Triage nivel ${u.triage}">T${u.triage}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${u.reason}</div>
            </div>
            <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">${u.waitMin}m</div>
          </div>`).join('')}`;
  }

  /* ── Actividad reciente ── */
  _renderActivity() {
    const panel = document.getElementById('activity-panel');
    if (!panel) return;

    const acts = this.data?.activity || DEMO_DATA.activity;

    panel.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.5rem;">
        <div>
          <div class="chart-title">Actividad reciente</div>
          <div class="chart-subtitle">Últimas acciones del sistema</div>
        </div>
      </div>
      <div class="activity-list">
        ${acts.map(a => `
          <div class="activity-item">
            <div class="activity-dot-wrap">
              <div class="activity-dot" style="border-color:${a.color};background:${a.color}22;"></div>
              <div class="activity-line"></div>
            </div>
            <div class="activity-body">
              <div class="activity-text">${a.text}</div>
              <div class="activity-meta">${DateUtils.timeAgo(a.time)}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ── Mini métricas ── */
  _renderMiniMetrics() {
    const panel = document.getElementById('mini-metrics-panel');
    if (!panel) return;

    const metrics = [
      { label: 'Tiempo espera promedio', value: '18 min', color: 'var(--accent-cyan)' },
      { label: 'Satisfacción paciente',  value: '94.2%',  color: 'var(--accent-green)' },
      { label: 'Reingresos 30d',         value: '3.1%',   color: 'var(--accent-amber)' },
      { label: 'Estancia media',         value: '2.8 días', color: '#5599ff' },
      { label: 'Docs procesados hoy',    value: '127',    color: 'var(--accent-cyan)' },
    ];

    panel.innerHTML = `
      <div class="chart-title" style="margin-bottom:1rem;">Indicadores clave</div>
      ${metrics.map(m => `
        <div class="mini-metric">
          <span class="mini-metric-label">${m.label}</span>
          <span class="mini-metric-value" style="color:${m.color};">${m.value}</span>
        </div>`).join('')}`;
  }

  /* ── Eventos Socket en tiempo real ── */
  _bindSocketEvents() {
    const socket = window._socket;
    if (!socket) return;

    // Nueva cita → actualizar panel
    const unsubAppt = socket.on('appointment:created', (data) => {
      this._addActivityItem({
        text: `Nueva cita — <strong>${data.patientName}</strong>`,
        time: new Date().toISOString(),
        color: '#00e5a0',
      });
      const kpiEl = document.querySelector('#kpi-appointments [data-target]');
      if (kpiEl) kpiEl.textContent = parseInt(kpiEl.textContent || 0) + 1;
    });

    // Nueva urgencia
    const unsubUrg = socket.on('urgency:new', (data) => {
      this._addActivityItem({
        text: `Urgencia admitida — Triage <strong>Nivel ${data.triage}</strong>`,
        time: new Date().toISOString(),
        color: '#ff4757',
      });
    });

    // Cambio de cama
    const unsubBed = socket.on('bed:status_changed', () => {
      // Recargar datos de camas en background
      API.get('/dashboard/beds').then(res => {
        if (res.success) {
          this.data = { ...this.data, beds: res.data };
          this._renderBeds();
        }
      });
    });

    // Resultado de lab
    const unsubLab = socket.on('lab:result_ready', (data) => {
      this._addActivityItem({
        text: `Resultado listo — <strong>${data.patientName}</strong>`,
        time: new Date().toISOString(),
        color: '#00d4ff',
      });
      const kpiEl = document.querySelector('#kpi-lab [data-target]');
      if (kpiEl) {
        const cur = parseInt(kpiEl.textContent || 0);
        kpiEl.textContent = Math.max(0, cur - 1);
      }
    });

    this._unsubs.push(unsubAppt, unsubUrg, unsubBed, unsubLab);
  }

  /* ── Agregar item de actividad en tiempo real ── */
  _addActivityItem(item) {
    const list = document.querySelector('#activity-panel .activity-list');
    if (!list) return;

    const el = document.createElement('div');
    el.className = 'activity-item';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-10px)';
    el.innerHTML = `
      <div class="activity-dot-wrap">
        <div class="activity-dot" style="border-color:${item.color};background:${item.color}22;"></div>
        <div class="activity-line"></div>
      </div>
      <div class="activity-body">
        <div class="activity-text">${item.text}</div>
        <div class="activity-meta">Ahora mismo</div>
      </div>`;

    list.insertBefore(el, list.firstChild);

    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    // Quitar el último si hay más de 8
    const items = list.querySelectorAll('.activity-item');
    if (items.length > 8) items[items.length - 1].remove();
  }

  /* ── Reloj en vivo ── */
  _startClock() {
    const update = () => {
      const el = document.getElementById('live-clock');
      if (el) el.textContent = DateUtils.formatDateTime(new Date());
    };
    update();
    this._clockInterval = setInterval(update, 30000);
  }

  /* ── Destruir instancia ── */
  destroy() {
    this._unsubs.forEach(fn => fn?.());
    clearInterval(this._clockInterval);
    Object.values(this.charts).forEach(c => c?.destroy());
    this.scene?.destroy();
  }
}
