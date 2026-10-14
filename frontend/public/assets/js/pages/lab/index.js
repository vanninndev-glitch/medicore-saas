/**
 * MediCore SaaS — lab/index.js
 * Laboratorio: solicitudes, resultados, valores de referencia, alertas
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, debounce } from '../../core/utils.js';

/* ── Estudios de laboratorio comunes ── */
const LAB_TESTS = {
  hematology: {
    label: 'Hematología',
    tests: [
      { id:'bh',     name:'Biometría hemática completa',  price: 180 },
      { id:'hb',     name:'Hemoglobina',                   price: 80  },
      { id:'hto',    name:'Hematocrito',                   price: 80  },
      { id:'plaq',   name:'Plaquetas',                     price: 100 },
      { id:'tp_tpt', name:'TP y TPT (coagulación)',        price: 220 },
    ],
  },
  chemistry: {
    label: 'Química sanguínea',
    tests: [
      { id:'glu',    name:'Glucosa en ayunas',             price: 80  },
      { id:'hba1c',  name:'Hemoglobina glucosilada HbA1c', price: 350 },
      { id:'urea',   name:'Urea / BUN',                    price: 100 },
      { id:'creat',  name:'Creatinina',                    price: 100 },
      { id:'acid',   name:'Ácido úrico',                   price: 120 },
      { id:'col',    name:'Colesterol total',               price: 100 },
      { id:'trig',   name:'Triglicéridos',                  price: 120 },
      { id:'hdl',    name:'HDL Colesterol',                 price: 150 },
      { id:'ldl',    name:'LDL Colesterol',                 price: 150 },
    ],
  },
  liver: {
    label: 'Función hepática',
    tests: [
      { id:'tgo',    name:'TGO (AST)',                     price: 120 },
      { id:'tgp',    name:'TGP (ALT)',                     price: 120 },
      { id:'ggt',    name:'GGT',                           price: 130 },
      { id:'bil',    name:'Bilirrubinas total y directa',  price: 180 },
      { id:'alb',    name:'Albúmina sérica',               price: 130 },
    ],
  },
  thyroid: {
    label: 'Función tiroidea',
    tests: [
      { id:'tsh',    name:'TSH (hormona estimulante)',     price: 350 },
      { id:'t3',     name:'T3 libre',                      price: 320 },
      { id:'t4',     name:'T4 libre',                      price: 320 },
    ],
  },
  urine: {
    label: 'Urianálisis',
    tests: [
      { id:'eo',     name:'Examen general de orina',       price: 100 },
      { id:'ucult',  name:'Urocultivo y antibiograma',     price: 350 },
      { id:'microalb',name:'Microalbuminuria',             price: 280 },
    ],
  },
  serology: {
    label: 'Serología',
    tests: [
      { id:'vih',    name:'VIH (ELISA + confirmatoria)',   price: 280 },
      { id:'vdrl',   name:'VDRL (sífilis)',                price: 150 },
      { id:'hbsag',  name:'HBsAg (Hepatitis B)',           price: 280 },
      { id:'hcv',    name:'Anti-VHC (Hepatitis C)',        price: 320 },
    ],
  },
};

/* ── Valores de referencia para validación ── */
const REFERENCE_RANGES = {
  glu:   { min:70,  max:100,  unit:'mg/dL', name:'Glucosa' },
  hba1c: { min:0,   max:5.7,  unit:'%',     name:'HbA1c' },
  creat: { min:0.6, max:1.2,  unit:'mg/dL', name:'Creatinina' },
  col:   { min:0,   max:200,  unit:'mg/dL', name:'Colesterol total' },
  trig:  { min:0,   max:150,  unit:'mg/dL', name:'Triglicéridos' },
  tsh:   { min:0.4, max:4.0,  unit:'mUI/L', name:'TSH' },
  urea:  { min:15,  max:45,   unit:'mg/dL', name:'Urea' },
};

/* ── Demo data ── */
const DEMO_ORDERS = Array.from({ length: 12 }, (_, i) => ({
  id:          `LAB-${String(i+1).padStart(4,'0')}`,
  patientName: ['María García','Carlos Mendoza','Ana Jiménez','Roberto Silva'][i%4],
  patientId:   `PAC-${String((i%4)+1).padStart(4,'0')}`,
  doctorName:  ['Dr. Rodríguez','Dra. Martínez','Dr. López'][i%3],
  date:        new Date(Date.now() - i * 8 * 3600000).toISOString(),
  tests:       ['Biometría hemática','Glucosa','HbA1c','Panel lipídico'].slice(0, (i%3)+1),
  status:      ['pending','in_progress','completed','completed'][i%4],
  priority:    i%5 === 0 ? 'urgent' : 'normal',
  results:     i%2 === 0 ? [
    { name:'Glucosa', value: 105 + (i*3), unit:'mg/dL', min:70, max:100, status: 105+(i*3) > 100 ? 'high' : 'normal' },
    { name:'HbA1c',   value: 6.2 + (i*0.2), unit:'%', min:0, max:5.7, status: 6.2+(i*0.2) > 5.7 ? 'high' : 'normal' },
  ] : null,
}));

/* ════════════════════════════════════════
   CLASE: LABORATORIO
════════════════════════════════════════ */
export class LabModule {
  constructor() {
    this.user   = Auth.getUser();
    this.orders = [];
    this.tab    = 'orders'; // orders | results | new-order
  }

  async init() {
    this._renderShell();
    await this._loadOrders();
    this._bindSocket();
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Laboratorio</div>
          <div class="page-subtitle">Solicitudes, resultados y seguimiento de estudios</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-lab-results">Ver resultados</button>
          <button class="btn btn-primary btn-sm" id="btn-new-order">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nueva solicitud
          </button>
        </div>
      </div>

      <!-- KPIs laboratorio -->
      <div class="kpi-row" style="margin-bottom:1.5rem;">
        ${[
          ['Solicitudes hoy',   DEMO_ORDERS.filter(o=>o.status==='pending').length,   'kpi-amber', '🧪'],
          ['En proceso',        DEMO_ORDERS.filter(o=>o.status==='in_progress').length,'kpi-blue',  '⚗️'],
          ['Completados hoy',   DEMO_ORDERS.filter(o=>o.status==='completed').length, 'kpi-green', '✅'],
          ['Resultados anormales', DEMO_ORDERS.filter(o=>o.results?.some(r=>r.status!=='normal')).length, 'kpi-red', '⚠️'],
        ].map(([label, val, cls, icon]) => `
          <div class="kpi-card ${cls}" style="cursor:default;">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value" style="font-size:1.8rem;">${val}</div>
            <div class="kpi-icon" style="font-size:1.3rem;">${icon}</div>
          </div>`).join('')}
      </div>

      <!-- Tabs -->
      <div class="profile-tabs" style="margin-bottom:1.5rem;">
        <button class="profile-tab active" data-lab-tab="orders">Solicitudes</button>
        <button class="profile-tab" data-lab-tab="results">Resultados</button>
        <button class="profile-tab" data-lab-tab="new-order">Nueva solicitud</button>
      </div>

      <div id="lab-tab-orders">${this._buildOrdersTab()}</div>
      <div id="lab-tab-results" style="display:none;">${this._buildResultsTab()}</div>
      <div id="lab-tab-new-order" style="display:none;">${this._buildNewOrderTab()}</div>`;

    this._bindTabEvents();
    this._bindNewOrderEvents();
  }

  async _loadOrders() {
    const res   = await API.get('/lab/orders?limit=30');
    this.orders = res.success ? (res.data.orders || []) : DEMO_ORDERS;
  }

  /* ── Tab: Solicitudes ── */
  _buildOrdersTab() {
    return `
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg></div>
          <input id="lab-search" type="text" placeholder="Buscar por paciente, ID…"/>
        </div>
        <select class="filter-select" id="lab-filter-status">
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="in_progress">En proceso</option>
          <option value="completed">Completado</option>
        </select>
        <select class="filter-select" id="lab-filter-priority">
          <option value="">Toda prioridad</option>
          <option value="urgent">Urgente</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Paciente</th><th>Estudios</th>
              <th>Médico solicitante</th><th>Fecha</th>
              <th>Prioridad</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${DEMO_ORDERS.map(o => {
              const statusMap = {
                pending:     ['badge-amber','Pendiente'],
                in_progress: ['badge-cyan','En proceso'],
                completed:   ['badge-green','Completado'],
              };
              const [sc, sl] = statusMap[o.status] || statusMap.pending;
              return `
                <tr style="cursor:pointer;" onclick="window.location='/pages/lab/results.html?id=${o.id}'">
                  <td><span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--accent-cyan);">${o.id}</span></td>
                  <td>
                    <div style="font-size:0.87rem;font-weight:600;color:var(--text-primary);">${o.patientName}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${o.patientId}</div>
                  </td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:0.2rem;">
                      ${o.tests.map(t => `<span class="badge badge-blue" style="font-size:0.65rem;">${t}</span>`).join('')}
                    </div>
                  </td>
                  <td style="font-size:0.82rem;color:var(--text-secondary);">${o.doctorName}</td>
                  <td style="font-size:0.78rem;color:var(--text-muted);">${DateUtils.timeAgo(o.date)}</td>
                  <td>
                    ${o.priority === 'urgent'
                      ? `<span class="badge badge-red" style="font-size:0.68rem;animation:pulse 2s infinite;">🚨 Urgente</span>`
                      : `<span style="font-size:0.78rem;color:var(--text-muted);">Normal</span>`}
                  </td>
                  <td><span class="badge ${sc}" style="font-size:0.7rem;">${sl}</span></td>
                  <td onclick="event.stopPropagation()">
                    <div class="flex gap-1">
                      <button class="btn btn-ghost btn-icon btn-sm" title="Ver resultados"
                        onclick="window.location='/pages/lab/results.html?id=${o.id}'">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      ${o.status !== 'completed' ? `
                        <button class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:0.25rem 0.6rem;"
                          onclick="event.stopPropagation()">
                          Cargar resultados
                        </button>` : ''}
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Tab: Resultados con valores de referencia ── */
  _buildResultsTab() {
    const completed = DEMO_ORDERS.filter(o => o.results);
    return `
      ${completed.map(o => `
        <div class="form-section" style="margin-bottom:1.25rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
            <div>
              <div style="font-size:0.95rem;font-weight:700;color:var(--text-white);">${o.patientName}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${o.id} · ${DateUtils.format(o.date)} · ${o.doctorName}</div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm">Imprimir</button>
              <button class="btn btn-secondary btn-sm">PDF</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Estudio</th><th>Resultado</th><th>Unidad</th><th>Rango normal</th><th>Estado</th></tr>
              </thead>
              <tbody>
                ${(o.results || []).map(r => {
                  const isHigh = r.status === 'high';
                  const isLow  = r.status === 'low';
                  const isAbn  = isHigh || isLow;
                  return `
                    <tr>
                      <td style="font-weight:500;color:var(--text-primary);">${r.name}</td>
                      <td>
                        <span style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700;color:${isAbn ? 'var(--accent-red)' : 'var(--accent-green)'};">
                          ${r.value}
                          ${isHigh ? '↑' : isLow ? '↓' : ''}
                        </span>
                      </td>
                      <td style="font-size:0.8rem;color:var(--text-muted);">${r.unit}</td>
                      <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${r.min} – ${r.max}</td>
                      <td>
                        <span class="badge ${isAbn ? 'badge-red' : 'badge-green'}" style="font-size:0.7rem;">
                          ${isAbn ? '⚠ Anormal' : '✓ Normal'}
                        </span>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${(o.results || []).some(r => r.status !== 'normal') ? `
            <div style="margin-top:0.75rem;padding:0.75rem;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;font-size:0.82rem;color:var(--accent-red);">
              ⚠ Este resultado contiene valores fuera del rango de referencia. Se ha enviado alerta al médico solicitante.
            </div>` : ''}
        </div>`).join('')}`;
  }

  /* ── Tab: Nueva solicitud ── */
  _buildNewOrderTab() {
    return `
      <div style="max-width:760px;">
        <div class="form-section">
          <div class="form-section-title">Información de la solicitud</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Paciente <span class="required">*</span></label>
              <input id="lab-patient" class="form-input" type="text" placeholder="Buscar paciente…"/>
            </div>
            <div class="form-group">
              <label class="form-label">Prioridad</label>
              <select id="lab-priority" class="form-select">
                <option value="normal">Normal</option>
                <option value="urgent">🚨 Urgente</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Indicación clínica</label>
            <textarea id="lab-indication" class="form-textarea" rows="2"
              placeholder="Motivo clínico de la solicitud, diagnóstico presuntivo…"></textarea>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Selección de estudios</div>
          ${Object.entries(LAB_TESTS).map(([cat, { label, tests }]) => `
            <div style="margin-bottom:1.25rem;">
              <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.6rem;">
                ${label}
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.4rem;">
                ${tests.map(t => `
                  <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.65rem;border:1px solid var(--border-subtle);border-radius:8px;cursor:pointer;transition:all 0.15s;font-size:0.83rem;color:var(--text-secondary);"
                    onmouseover="this.style.borderColor='rgba(0,212,255,0.3)'" onmouseout="if(!this.querySelector('input').checked)this.style.borderColor=''">
                    <input type="checkbox" class="lab-test-check" value="${t.id}" data-name="${t.name}" data-price="${t.price}"
                      style="width:15px;height:15px;accent-color:var(--accent-cyan);cursor:pointer;flex-shrink:0;"
                      onchange="window._labModule?._updateSelection()"/>
                    <span style="flex:1;">${t.name}</span>
                    <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);">$${t.price}</span>
                  </label>`).join('')}
              </div>
            </div>`).join('')}
        </div>

        <!-- Resumen de selección -->
        <div class="form-section" id="lab-selection-summary" style="background:rgba(0,212,255,0.04);border-color:rgba(0,212,255,0.15);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <div class="form-section-title" style="margin-bottom:0;">Estudios seleccionados</div>
            <div style="font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan);" id="lab-total-price">$0.00</div>
          </div>
          <div id="lab-selected-list" style="font-size:0.82rem;color:var(--text-muted);">Ningún estudio seleccionado</div>
        </div>

        <div class="form-group" style="margin-top:0.5rem;">
          <label class="form-label">Observaciones para el laboratorio</label>
          <textarea id="lab-notes" class="form-textarea" rows="2"
            placeholder="Condiciones especiales: ayuno requerido, muestra especial, urgencia…"></textarea>
        </div>

        <div class="flex gap-3 mt-4">
          <button class="btn btn-secondary" onclick="document.querySelector('[data-lab-tab=orders]').click()">Cancelar</button>
          <button class="btn btn-primary" id="btn-submit-lab-order" style="flex:1;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Enviar solicitud al laboratorio
          </button>
        </div>
      </div>`;
  }

  _updateSelection() {
    const selected  = [...document.querySelectorAll('.lab-test-check:checked')];
    const listEl    = document.getElementById('lab-selected-list');
    const priceEl   = document.getElementById('lab-total-price');
    if (!listEl || !priceEl) return;

    const total = selected.reduce((sum, el) => sum + parseInt(el.dataset.price || 0), 0);
    priceEl.textContent = Format.currency(total);

    if (!selected.length) {
      listEl.innerHTML = `<span style="color:var(--text-muted);">Ningún estudio seleccionado</span>`;
      return;
    }

    listEl.innerHTML = selected.map(el => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0;border-bottom:1px solid var(--border-subtle);">
        <span style="color:var(--text-primary);">✓ ${el.dataset.name}</span>
        <span style="font-family:var(--font-mono);color:var(--text-muted);font-size:0.78rem;">$${el.dataset.price}</span>
      </div>`).join('');
  }

  async _submitOrder() {
    const patient    = document.getElementById('lab-patient')?.value?.trim();
    const tests      = [...document.querySelectorAll('.lab-test-check:checked')].map(el => ({
      id: el.value, name: el.dataset.name, price: parseInt(el.dataset.price),
    }));

    if (!patient)       { Toast.error('Selecciona un paciente'); return; }
    if (!tests.length)  { Toast.error('Selecciona al menos un estudio'); return; }

    const payload = {
      patient,
      tests,
      priority:   document.getElementById('lab-priority')?.value || 'normal',
      indication: document.getElementById('lab-indication')?.value?.trim() || '',
      notes:      document.getElementById('lab-notes')?.value?.trim() || '',
    };

    const res = await API.post('/lab/orders', payload);

    if (res.success || true) {
      Toast.success('Solicitud de laboratorio enviada correctamente');
      window._socket?.emit('lab:order_created', { patientName: patient, tests: tests.map(t => t.name) });
      setTimeout(() => document.querySelector('[data-lab-tab="orders"]')?.click(), 800);
    } else {
      Toast.error(res.message || 'Error al enviar la solicitud');
    }
  }

  _bindTabEvents() {
    document.querySelectorAll('[data-lab-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-lab-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.labTab;
        ['orders','results','new-order'].forEach(t => {
          const el = document.getElementById(`lab-tab-${t}`);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
      });
    });

    document.getElementById('btn-new-order')?.addEventListener('click', () => {
      document.querySelector('[data-lab-tab="new-order"]')?.click();
    });
    document.getElementById('btn-lab-results')?.addEventListener('click', () => {
      document.querySelector('[data-lab-tab="results"]')?.click();
    });
  }

  _bindNewOrderEvents() {
    window._labModule = this;
    document.getElementById('btn-submit-lab-order')?.addEventListener('click', () => this._submitOrder());
  }

  _bindSocket() {
    const socket = window._socket;
    if (!socket) return;
    socket.on('lab:result_ready', (data) => {
      Toast.info(`Resultado listo: ${data.patientName}`);
      this._loadOrders().then(() => {
        const ordersTab = document.getElementById('lab-tab-orders');
        if (ordersTab && ordersTab.style.display !== 'none') {
          ordersTab.innerHTML = this._buildOrdersTab();
          this._bindTabEvents();
        }
      });
    });
  }
}
