/**
 * MediCore SaaS — reports/index.js
 * Reportes y analytics: dashboard ejecutivo, KPIs, exportación PDF/Excel
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, Exporter } from '../../core/utils.js';

/* ══════════════════════════════════════════
   CLASE: REPORTES
══════════════════════════════════════════ */
export class ReportsModule {
  constructor() {
    this.user   = Auth.getUser();
    this.charts = {};
    this.range  = 'month';
  }

  async init() {
    this._renderShell();
    await this._loadData();
    this._renderCharts();
    this._bindEvents();
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Reportes y Analytics</div>
          <div class="page-subtitle">Indicadores de desempeño hospitalario</div>
        </div>
        <div class="flex gap-2">
          <div class="chart-filters">
            <button class="chart-filter-btn" data-range="week">Semana</button>
            <button class="chart-filter-btn active" data-range="month">Mes</button>
            <button class="chart-filter-btn" data-range="quarter">Trimestre</button>
            <button class="chart-filter-btn" data-range="year">Año</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-export-csv">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Exportar CSV
          </button>
          <button class="btn btn-primary btn-sm" id="btn-export-pdf">
            Exportar PDF
          </button>
        </div>
      </div>

      <!-- KPIs ejecutivos -->
      <div class="kpi-row" style="margin-bottom:1.5rem;" id="report-kpis">
        ${Array(6).fill(0).map(() => `
          <div class="kpi-card" style="min-height:110px;">
            <div style="height:10px;width:60%;background:rgba(255,255,255,0.06);border-radius:4px;margin-bottom:1rem;animation:pulse 1.5s infinite;"></div>
            <div style="height:32px;width:45%;background:rgba(255,255,255,0.08);border-radius:6px;animation:pulse 1.5s infinite;"></div>
          </div>`).join('')}
      </div>

      <!-- Gráficas principales -->
      <div class="dashboard-grid" id="reports-grid">
        <div style="grid-column:span 7;" class="col-lg-8">
          <div class="chart-panel" style="margin-bottom:1.25rem;">
            <div class="chart-panel-header">
              <div><div class="chart-title">Consultas por período</div><div class="chart-subtitle">Total de atenciones médicas</div></div>
            </div>
            <div class="chart-wrap" style="height:240px;"><canvas id="rpt-consultas"></canvas></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
            <div class="chart-panel">
              <div class="chart-panel-header"><div class="chart-title">Diagnósticos ICD-10</div></div>
              <div class="chart-wrap" style="height:190px;"><canvas id="rpt-diagnoses"></canvas></div>
            </div>
            <div class="chart-panel">
              <div class="chart-panel-header"><div class="chart-title">Ocupación de camas</div></div>
              <div class="chart-wrap" style="height:190px;"><canvas id="rpt-beds"></canvas></div>
            </div>
          </div>
        </div>
        <div style="grid-column:span 5;" class="col-lg-4">
          <div class="chart-panel" style="margin-bottom:1.25rem;" id="rpt-productivity"></div>
          <div class="chart-panel" id="rpt-indicators"></div>
        </div>
      </div>`;
  }

  async _loadData() {
    const res = await API.get(`/reports/dashboard?range=${this.range}`);
    this.data  = res.success ? res.data : this._generateDemoData();
    this._renderKPIs();
  }

  _generateDemoData() {
    return {
      kpis: {
        totalPatients:   { value:1247, delta:8.3,  trend:'up'   },
        totalConsultas:  { value:892,  delta:12.1,  trend:'up'   },
        avgOccupancy:    { value:74,   delta:-2.4,  trend:'down', suffix:'%' },
        avgWaitTime:     { value:18,   delta:-5.2,  trend:'down', suffix:' min' },
        satisfaction:    { value:94.2, delta:1.8,   trend:'up',   suffix:'%' },
        revenue:         { value:1850000, delta:9.7, trend:'up'  },
      },
      consultasChart: {
        labels: ['Sem 1','Sem 2','Sem 3','Sem 4'],
        data:   [205, 230, 218, 239],
        prev:   [188, 210, 200, 218],
      },
      diagnosesChart: {
        labels: ['HTA','DM2','EPOC','Obesidad','Ansiedad','Fractura','Inf. respiratoria'],
        data:   [142, 118, 72, 95, 64, 48, 87],
      },
      bedsChart: {
        labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        data:   [71, 75, 78, 82, 80, 68, 65],
      },
      productivity: [
        { name:'Dr. Rodríguez', specialty:'M. Interna',  consultas:87, satisfaction:96 },
        { name:'Dra. Martínez', specialty:'Cardiología', consultas:72, satisfaction:94 },
        { name:'Dr. López',     specialty:'Neurología',  consultas:65, satisfaction:92 },
        { name:'Dra. García',   specialty:'Pediatría',   consultas:93, satisfaction:98 },
        { name:'Dr. Herrera',   specialty:'Traumatología',consultas:58, satisfaction:91 },
      ],
      qualityIndicators: [
        { label:'Reingresos 30 días',    value:'3.1%',  status:'ok'   },
        { label:'Infecciones nosocomiales', value:'0.8%', status:'ok'  },
        { label:'Tiempo diagnóstico',    value:'2.3 h', status:'warn' },
        { label:'Mortalidad ajustada',   value:'0.4%',  status:'ok'   },
        { label:'Satisfacción',          value:'94.2%', status:'ok'   },
        { label:'Cirugías programadas',  value:'98.2%', status:'ok'   },
      ],
    };
  }

  _renderKPIs() {
    const kpis = this.data?.kpis || {};
    const el   = document.getElementById('report-kpis');
    if (!el) return;

    const cards = [
      { label:'Total pacientes',   key:'totalPatients',  cls:'kpi-blue',   fmt: v => Format.number(v) },
      { label:'Consultas',         key:'totalConsultas', cls:'kpi-cyan',   fmt: v => Format.number(v) },
      { label:'Ocupación promedio',key:'avgOccupancy',   cls:'kpi-amber',  fmt: v => `${v}%` },
      { label:'Espera promedio',   key:'avgWaitTime',    cls:'kpi-green',  fmt: v => `${v} min` },
      { label:'Satisfacción',      key:'satisfaction',   cls:'kpi-purple', fmt: v => `${v}%` },
      { label:'Ingresos período',  key:'revenue',        cls:'kpi-green',  fmt: v => Format.currency(v) },
    ];

    el.innerHTML = cards.map(c => {
      const d     = kpis[c.key] || {};
      const val   = d.value ?? 0;
      const delta = d.delta;
      const trend = d.trend;
      return `
        <div class="kpi-card ${c.cls}" style="cursor:default;">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-value" style="font-size:1.7rem;">${c.fmt(val)}</div>
          ${delta !== undefined ? `
            <span class="kpi-delta ${trend === 'up' ? 'up' : 'down'}">
              ${trend === 'up' ? '↑' : '↓'} ${Math.abs(delta)}% vs período anterior
            </span>` : ''}
        </div>`;
    }).join('');
  }

  _renderCharts() {
    if (typeof Chart === 'undefined') return;
    const d = this.data || this._generateDemoData();

    // Consultas (línea)
    const ctx1 = document.getElementById('rpt-consultas')?.getContext('2d');
    if (ctx1) {
      this.charts.consultas = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: d.consultasChart.labels,
          datasets: [
            { label:'Este período', data: d.consultasChart.data,
              borderColor:'rgba(0,212,255,0.9)', backgroundColor:'rgba(0,212,255,0.08)',
              borderWidth:2, fill:true, tension:0.4, pointBackgroundColor:'rgba(0,212,255,0.9)' },
            { label:'Período anterior', data: d.consultasChart.prev,
              borderColor:'rgba(255,255,255,0.15)', backgroundColor:'transparent',
              borderWidth:1.5, fill:false, tension:0.4, borderDash:[5,5] },
          ],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: { legend:{ labels:{ color:'#7ba3c4', font:{size:11}, boxWidth:10 } },
            tooltip:{ backgroundColor:'#0f1f33', borderColor:'rgba(0,212,255,0.3)', borderWidth:1 } },
          scales: {
            x:{ ticks:{color:'#3d6080',font:{size:11}}, grid:{color:'rgba(255,255,255,0.03)'} },
            y:{ ticks:{color:'#3d6080',font:{size:11}}, grid:{color:'rgba(255,255,255,0.05)'}, beginAtZero:true },
          },
        },
      });
    }

    // Diagnósticos (barra horizontal)
    const ctx2 = document.getElementById('rpt-diagnoses')?.getContext('2d');
    if (ctx2) {
      this.charts.diagnoses = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: d.diagnosesChart.labels,
          datasets: [{ data: d.diagnosesChart.data,
            backgroundColor: ['rgba(0,212,255,0.5)','rgba(0,229,160,0.5)','rgba(26,111,255,0.5)',
              'rgba(255,179,71,0.5)','rgba(167,139,250,0.5)','rgba(255,71,87,0.5)','rgba(255,128,0,0.5)'],
            borderWidth:0, borderRadius:4 }],
        },
        options: {
          indexAxis:'y', responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#0f1f33',borderColor:'rgba(0,212,255,0.3)',borderWidth:1} },
          scales: {
            x:{ ticks:{color:'#3d6080',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'} },
            y:{ ticks:{color:'#7ba3c4',font:{size:10}}, grid:{display:false} },
          },
        },
      });
    }

    // Ocupación de camas (línea suave)
    const ctx3 = document.getElementById('rpt-beds')?.getContext('2d');
    if (ctx3) {
      this.charts.beds = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: d.bedsChart.labels,
          datasets: [{ data: d.bedsChart.data, label:'Ocupación %',
            borderColor:'rgba(255,179,71,0.9)', backgroundColor:'rgba(255,179,71,0.1)',
            borderWidth:2, fill:true, tension:0.4 }],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#0f1f33',borderColor:'rgba(255,179,71,0.3)',borderWidth:1} },
          scales: {
            x:{ ticks:{color:'#3d6080',font:{size:10}}, grid:{color:'rgba(255,255,255,0.03)'} },
            y:{ ticks:{color:'#3d6080',font:{size:10}, callback:v=>`${v}%`}, grid:{color:'rgba(255,255,255,0.04)'}, min:50, max:100 },
          },
        },
      });
    }

    // Productividad médica
    this._renderProductivity();
    this._renderQualityIndicators();
  }

  _renderProductivity() {
    const el = document.getElementById('rpt-productivity');
    if (!el) return;
    const docs = this.data?.productivity || [];
    const max  = Math.max(...docs.map(d => d.consultas), 1);

    el.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.75rem;">
        <div><div class="chart-title">Productividad médica</div><div class="chart-subtitle">Consultas por doctor</div></div>
      </div>
      ${docs.map(d => `
        <div style="margin-bottom:0.75rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
            <div>
              <div style="font-size:0.83rem;font-weight:600;color:var(--text-primary);">${d.name}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);">${d.specialty}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:var(--font-mono);font-size:0.85rem;font-weight:700;color:var(--accent-cyan);">${d.consultas}</div>
              <div style="font-size:0.68rem;color:var(--accent-green);">⭐ ${d.satisfaction}%</div>
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.round((d.consultas/max)*100)}%;--fill-color:var(--accent-cyan);"></div>
          </div>
        </div>`).join('')}`;
  }

  _renderQualityIndicators() {
    const el = document.getElementById('rpt-indicators');
    if (!el) return;
    const indicators = this.data?.qualityIndicators || [];

    const statusConfig = {
      ok:   { color:'var(--accent-green)', icon:'✓' },
      warn: { color:'var(--accent-amber)', icon:'⚠' },
      bad:  { color:'var(--accent-red)',   icon:'✗' },
    };

    el.innerHTML = `
      <div class="chart-panel-header" style="margin-bottom:0.75rem;">
        <div><div class="chart-title">Indicadores de calidad</div><div class="chart-subtitle">NOM-024 / AHRQ</div></div>
      </div>
      ${indicators.map(ind => {
        const cfg = statusConfig[ind.status] || statusConfig.ok;
        return `
          <div class="mini-metric">
            <span class="mini-metric-label">${ind.label}</span>
            <div style="display:flex;align-items:center;gap:0.4rem;">
              <span style="font-size:0.9rem;font-weight:700;font-family:var(--font-mono);color:var(--text-primary);">${ind.value}</span>
              <span style="color:${cfg.color};font-size:0.8rem;">${cfg.icon}</span>
            </div>
          </div>`;
      }).join('')}`;
  }

  /* ── Exportar datos ── */
  async _exportCSV() {
    const exportData = (this.data?.productivity || []).map(d => ({
      'Médico':       d.name,
      'Especialidad': d.specialty,
      'Consultas':    d.consultas,
      'Satisfacción': `${d.satisfaction}%`,
    }));
    Exporter.toCSV(exportData, `reporte_productividad_${new Date().toISOString().split('T')[0]}.csv`);
    Toast.success('Reporte CSV exportado');
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    // Filtros de rango
    document.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.range = btn.dataset.range;
        Object.values(this.charts).forEach(c => c?.destroy());
        this.charts = {};
        this._loadData().then(() => this._renderCharts());
      });
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', () => this._exportCSV());
    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
      Toast.info('Generando PDF del reporte…');
      setTimeout(() => window.print(), 500);
    });
  }
}
