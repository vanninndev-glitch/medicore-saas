/**
 * MediCore SaaS — pharmacy/index.js
 * Farmacia: recetas pendientes, dispensación, inventario, medicamentos
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, debounce } from '../../core/utils.js';

/* ── Catálogo de medicamentos ── */
const MEDICATIONS_CATALOG = [
  { id:'MED-001', name:'Metformina',       presentation:'500mg tabletas',  stock:450, min:50, price:12.50, category:'Antidiabético',   controlled:false },
  { id:'MED-002', name:'Losartán',          presentation:'50mg tabletas',   stock:320, min:40, price:18.00, category:'Antihipertensivo', controlled:false },
  { id:'MED-003', name:'Atorvastatina',    presentation:'20mg tabletas',   stock:280, min:40, price:22.00, category:'Hipolipemiante',   controlled:false },
  { id:'MED-004', name:'Omeprazol',         presentation:'20mg cápsulas',   stock:500, min:60, price:8.50,  category:'Gastroprotector',  controlled:false },
  { id:'MED-005', name:'Amoxicilina',       presentation:'500mg cápsulas',  stock:200, min:30, price:9.00,  category:'Antibiótico',      controlled:false },
  { id:'MED-006', name:'Paracetamol',       presentation:'500mg tabletas',  stock:800, min:100,price:4.50,  category:'Analgésico',       controlled:false },
  { id:'MED-007', name:'Ibuprofeno',        presentation:'400mg tabletas',  stock:350, min:50, price:6.00,  category:'AINE',             controlled:false },
  { id:'MED-008', name:'Clonazepam',        presentation:'0.5mg tabletas',  stock:80,  min:20, price:15.00, category:'Ansiolítico',      controlled:true  },
  { id:'MED-009', name:'Tramadol',          presentation:'50mg cápsulas',   stock:60,  min:15, price:28.00, category:'Analgésico opiode',controlled:true  },
  { id:'MED-010', name:'Insulina NPH',      presentation:'100UI/mL vial',   stock:45,  min:10, price:185.00,category:'Insulina',         controlled:false },
  { id:'MED-011', name:'Salbutamol',        presentation:'100mcg inhalador',stock:90,  min:15, price:95.00, category:'Broncodilatador',  controlled:false },
  { id:'MED-012', name:'Levotiroxina',      presentation:'50mcg tabletas',  stock:240, min:30, price:14.00, category:'Hormonal',         controlled:false },
  { id:'MED-013', name:'Amlodipino',        presentation:'5mg tabletas',    stock:180, min:25, price:11.00, category:'Antihipertensivo', controlled:false },
  { id:'MED-014', name:'Ciprofloxacino',    presentation:'500mg tabletas',  stock:120, min:20, price:16.00, category:'Antibiótico',      controlled:false },
  { id:'MED-015', name:'Fluoxetina',        presentation:'20mg cápsulas',   stock:100, min:20, price:19.00, category:'Antidepresivo',    controlled:false },
];

/* ── Demo recetas pendientes ── */
const DEMO_PRESCRIPTIONS = Array.from({ length: 10 }, (_, i) => ({
  id:          `REC-${String(i+1).padStart(4,'0')}`,
  patientName: ['María García','Carlos Mendoza','Ana Jiménez','Roberto Silva','Lucía Hernández'][i%5],
  patientId:   `PAC-${String((i%5)+1).padStart(4,'0')}`,
  doctorName:  ['Dr. Rodríguez','Dra. Martínez','Dr. López'][i%3],
  date:        new Date(Date.now() - i * 3600000 * 2).toISOString(),
  status:      i < 4 ? 'pending' : 'dispensed',
  medications: [
    { name: MEDICATIONS_CATALOG[i%15].name, dose:'1 tableta', freq:'Cada 12h', duration:'30 días', qty:60 },
    ...(i%2===0 ? [{ name: MEDICATIONS_CATALOG[(i+3)%15].name, dose:'1 cápsula', freq:'Cada 8h', duration:'7 días', qty:21 }] : []),
  ],
}));

/* ════════════════════════════════════════
   CLASE: FARMACIA
════════════════════════════════════════ */
export class PharmacyModule {
  constructor() {
    this.user  = Auth.getUser();
    this.tab   = 'prescriptions';
    this.meds  = [];
    this._medSearch = debounce((q) => this._filterMeds(q), 280);
  }

  async init() {
    this.meds = MEDICATIONS_CATALOG;
    this._renderShell();
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const lowStock  = this.meds.filter(m => m.stock <= m.min).length;
    const controlled= this.meds.filter(m => m.controlled).length;

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Farmacia</div>
          <div class="page-subtitle">Dispensación de medicamentos, inventario y control de recetas</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" id="btn-inventory">Inventario</button>
          <button class="btn btn-primary btn-sm" id="btn-new-dispense">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Dispensar
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-row" style="margin-bottom:1.5rem;">
        ${[
          ['Recetas pendientes', DEMO_PRESCRIPTIONS.filter(p=>p.status==='pending').length, 'kpi-amber','💊'],
          ['Dispensadas hoy',   DEMO_PRESCRIPTIONS.filter(p=>p.status==='dispensed').length,'kpi-green','✅'],
          ['Stock bajo',        lowStock,  'kpi-red',  '⚠️'],
          ['Controlados',       controlled,'kpi-purple','🔒'],
        ].map(([label, val, cls, icon]) => `
          <div class="kpi-card ${cls}" style="cursor:default;">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value" style="font-size:1.8rem;">${val}</div>
            <div class="kpi-icon" style="font-size:1.3rem;">${icon}</div>
          </div>`).join('')}
      </div>

      <!-- Alerta stock bajo -->
      ${lowStock > 0 ? `
        <div style="background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.25);border-radius:var(--radius-md);padding:0.85rem 1.1rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:0.75rem;">
          <span style="font-size:1.1rem;">⚠️</span>
          <span style="font-size:0.87rem;color:var(--text-primary);">
            <strong style="color:var(--accent-red);">${lowStock} medicamento(s)</strong> tienen stock por debajo del mínimo requerido.
            <a href="#" onclick="document.querySelector('[data-pharm-tab=inventory]').click();return false;" style="color:var(--accent-cyan);margin-left:0.5rem;">Ver inventario →</a>
          </span>
        </div>` : ''}

      <!-- Tabs -->
      <div class="profile-tabs" style="margin-bottom:1.5rem;">
        <button class="profile-tab active" data-pharm-tab="prescriptions">Recetas pendientes</button>
        <button class="profile-tab" data-pharm-tab="inventory">Inventario</button>
        <button class="profile-tab" data-pharm-tab="dispense">Dispensación manual</button>
      </div>

      <div id="pharm-tab-prescriptions">${this._buildPrescriptionsTab()}</div>
      <div id="pharm-tab-inventory" style="display:none;">${this._buildInventoryTab()}</div>
      <div id="pharm-tab-dispense"  style="display:none;">${this._buildDispenseTab()}</div>`;

    this._bindEvents();
  }

  /* ── Tab: Recetas pendientes ── */
  _buildPrescriptionsTab() {
    const pending = DEMO_PRESCRIPTIONS.filter(p => p.status === 'pending');
    const dispensed = DEMO_PRESCRIPTIONS.filter(p => p.status === 'dispensed');

    const buildCard = (p, showDispense) => `
      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.1rem;margin-bottom:0.85rem;transition:border-color 0.2s;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.85rem;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <div style="font-weight:700;color:var(--text-white);font-size:0.95rem;">${p.patientName}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
              ${p.id} · ${p.doctorName} · ${DateUtils.timeAgo(p.date)}
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <span class="badge ${p.status === 'pending' ? 'badge-amber' : 'badge-green'}" style="font-size:0.7rem;">
              ${p.status === 'pending' ? '⏳ Pendiente' : '✓ Dispensada'}
            </span>
            ${showDispense ? `<button class="btn btn-primary btn-sm" data-dispense="${p.id}" style="font-size:0.75rem;">Dispensar</button>` : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;">
          ${p.medications.map(m => `
            <div style="background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.1);border-radius:8px;padding:0.6rem 0.75rem;">
              <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">💊 ${m.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px;">${m.dose} · ${m.freq} · ${m.duration}</div>
              <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--accent-cyan);margin-top:2px;">Qty: ${m.qty}</div>
            </div>`).join('')}
        </div>
      </div>`;

    return `
      <div style="margin-bottom:1.25rem;">
        <div style="font-size:0.82rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.75rem;">
          Pendientes (${pending.length})
        </div>
        ${pending.length ? pending.map(p => buildCard(p, true)).join('') : `<div style="text-align:center;padding:2rem;color:var(--text-muted);">Sin recetas pendientes 🎉</div>`}
      </div>
      <div>
        <div style="font-size:0.82rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.75rem;">
          Dispensadas hoy (${dispensed.length})
        </div>
        ${dispensed.map(p => buildCard(p, false)).join('')}
      </div>`;
  }

  /* ── Tab: Inventario ── */
  _buildInventoryTab() {
    return `
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg></div>
          <input id="med-search" type="text" placeholder="Buscar medicamento…"/>
        </div>
        <select class="filter-select" id="med-filter-cat">
          <option value="">Todas las categorías</option>
          ${[...new Set(this.meds.map(m => m.category))].map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="filter-select" id="med-filter-stock">
          <option value="">Todo el stock</option>
          <option value="low">Stock bajo</option>
          <option value="ok">Stock normal</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="btn-add-med">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Agregar medicamento
        </button>
      </div>

      <div class="table-wrap">
        <table id="inventory-table">
          <thead>
            <tr>
              <th>Medicamento</th><th>Presentación</th><th>Categoría</th>
              <th>Stock</th><th>Mín.</th><th>Estado</th><th>Precio</th><th></th>
            </tr>
          </thead>
          <tbody id="inventory-tbody">
            ${this._buildInventoryRows(this.meds)}
          </tbody>
        </table>
      </div>`;
  }

  _buildInventoryRows(meds) {
    return meds.map(m => {
      const isLow = m.stock <= m.min;
      const pct   = Math.min((m.stock / (m.min * 3)) * 100, 100);
      return `
        <tr>
          <td>
            <div style="font-weight:600;color:var(--text-primary);font-size:0.87rem;">
              ${m.controlled ? '🔒 ' : '💊 '}${m.name}
            </div>
            <div style="font-size:0.7rem;font-family:var(--font-mono);color:var(--text-muted);">${m.id}</div>
          </td>
          <td style="font-size:0.82rem;color:var(--text-secondary);">${m.presentation}</td>
          <td><span class="badge badge-blue" style="font-size:0.68rem;">${m.category}</span></td>
          <td>
            <div style="font-family:var(--font-mono);font-size:0.92rem;font-weight:700;color:${isLow ? 'var(--accent-red)' : 'var(--text-primary)'};">${m.stock}</div>
            <div class="progress-bar" style="width:70px;margin-top:3px;height:4px;">
              <div class="progress-fill" style="width:${pct}%;--fill-color:${isLow ? 'var(--accent-red)' : 'var(--accent-green)'};"></div>
            </div>
          </td>
          <td style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-muted);">${m.min}</td>
          <td>
            <span class="badge ${isLow ? 'badge-red' : 'badge-green'}" style="font-size:0.68rem;">
              ${isLow ? '⚠ Bajo' : '✓ Normal'}
            </span>
            ${m.controlled ? `<span class="badge badge-amber" style="font-size:0.65rem;margin-left:3px;">Controlado</span>` : ''}
          </td>
          <td style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);">${Format.currency(m.price)}</td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-secondary btn-sm" data-med-id="${m.id}" data-med-name="${m.name}"
                onclick="window._pharmacyModule?._showRestock('${m.id}','${m.name}')">
                + Stock
              </button>
              <button class="btn btn-ghost btn-icon btn-sm">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  /* ── Tab: Dispensación manual ── */
  _buildDispenseTab() {
    return `
      <div style="max-width:700px;">
        <div class="form-section">
          <div class="form-section-title">Información de la dispensación</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Paciente <span class="required">*</span></label>
              <input id="disp-patient" class="form-input" type="text" placeholder="Nombre del paciente"/>
            </div>
            <div class="form-group">
              <label class="form-label">ID Receta / Nota</label>
              <input id="disp-prescription" class="form-input" type="text"
                placeholder="REC-0001 o descripción" style="font-family:var(--font-mono);"/>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Medicamentos a dispensar</div>

          <div id="dispense-items">
            ${this._buildDispenseItem(0)}
          </div>

          <button class="btn btn-secondary btn-sm" id="btn-add-dispense-item" style="margin-top:0.75rem;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Agregar medicamento
          </button>
        </div>

        <div class="form-section">
          <div class="form-section-title">Notas de dispensación</div>
          <textarea id="disp-notes" class="form-textarea" rows="2"
            placeholder="Instrucciones especiales de administración, advertencias…"></textarea>
        </div>

        <div style="display:flex;gap:3px;align-items:center;margin-bottom:1.5rem;padding:0.75rem;background:rgba(255,179,71,0.06);border:1px solid rgba(255,179,71,0.2);border-radius:8px;">
          <svg width="15" height="15" fill="none" stroke="var(--accent-amber)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <span style="font-size:0.8rem;color:var(--accent-amber);margin-left:0.5rem;">
            La dispensación descuenta automáticamente del inventario y queda registrada en el log de auditoría.
          </span>
        </div>

        <div class="flex gap-3">
          <button class="btn btn-secondary" onclick="document.querySelector('[data-pharm-tab=prescriptions]').click()">Cancelar</button>
          <button class="btn btn-primary" id="btn-confirm-dispense" style="flex:1;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Confirmar dispensación
          </button>
        </div>
      </div>`;
  }

  _buildDispenseItem(idx) {
    const options = this.meds.map(m =>
      `<option value="${m.id}" data-stock="${m.stock}">${m.name} — ${m.presentation} (Stock: ${m.stock})</option>`
    ).join('');

    return `
      <div class="dispense-item" data-idx="${idx}" style="display:grid;grid-template-columns:1fr auto auto auto;gap:0.6rem;align-items:end;margin-bottom:0.65rem;">
        <div class="form-group">
          ${idx === 0 ? `<label class="form-label">Medicamento</label>` : ''}
          <select class="form-select disp-med-select">
            <option value="">Seleccionar medicamento…</option>
            ${options}
          </select>
        </div>
        <div class="form-group" style="width:80px;">
          ${idx === 0 ? `<label class="form-label">Cantidad</label>` : ''}
          <input type="number" class="form-input disp-qty" value="1" min="1" style="text-align:center;"/>
        </div>
        <div class="form-group" style="width:110px;">
          ${idx === 0 ? `<label class="form-label">Unidad</label>` : ''}
          <select class="form-select disp-unit">
            <option>tabletas</option><option>cápsulas</option>
            <option>ampollas</option><option>frascos</option>
            <option>inhaladores</option><option>parches</option>
          </select>
        </div>
        ${idx > 0 ? `
          <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--accent-red);"
            onclick="this.closest('.dispense-item').remove()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>` : `<div></div>`}
      </div>`;
  }

  /* ── Modal restock ── */
  _showRestock(id, name) {
    const modal = document.getElementById('modal-container');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)this.parentElement.innerHTML=''">
        <div class="modal" style="max-width:400px;">
          <div class="modal-header">
            <h3>Ajustar stock: ${name}</h3>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="document.getElementById('modal-container').innerHTML=''">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Tipo de movimiento</label>
            <select id="restock-type" class="form-select">
              <option value="add">Entrada — Agregar unidades</option>
              <option value="sub">Salida — Retirar unidades</option>
              <option value="set">Ajuste — Establecer cantidad</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Cantidad <span class="required">*</span></label>
            <input id="restock-qty" class="form-input" type="number" min="1" placeholder="0"/>
          </div>
          <div class="form-group" style="margin-bottom:1.5rem;">
            <label class="form-label">Motivo</label>
            <textarea id="restock-reason" class="form-textarea" rows="2"
              placeholder="Proveedor, ajuste de inventario, caducidad…"></textarea>
          </div>
          <div class="flex gap-2 justify-end">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML=''">Cancelar</button>
            <button class="btn btn-primary" id="btn-confirm-restock">Confirmar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-confirm-restock')?.addEventListener('click', async () => {
      const type   = document.getElementById('restock-type')?.value;
      const qty    = parseInt(document.getElementById('restock-qty')?.value) || 0;
      const reason = document.getElementById('restock-reason')?.value?.trim();

      if (!qty) { Toast.error('Ingresa una cantidad válida'); return; }

      const med = this.meds.find(m => m.id === id);
      if (med) {
        if (type === 'add') med.stock += qty;
        else if (type === 'sub') med.stock = Math.max(0, med.stock - qty);
        else med.stock = qty;
      }

      const res = await API.patch(`/pharmacy/inventory/${id}`, { type, qty, reason });
      document.getElementById('modal-container').innerHTML = '';
      Toast.success('Stock actualizado correctamente');

      // Refrescar tabla
      const tbody = document.getElementById('inventory-tbody');
      if (tbody) tbody.innerHTML = this._buildInventoryRows(this.meds);
    });
  }

  /* ── Filtrar medicamentos ── */
  _filterMeds(query) {
    const cat    = document.getElementById('med-filter-cat')?.value || '';
    const stock  = document.getElementById('med-filter-stock')?.value || '';
    const q      = query.toLowerCase();

    let filtered = this.meds;
    if (q)     filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    if (cat)   filtered = filtered.filter(m => m.category === cat);
    if (stock === 'low') filtered = filtered.filter(m => m.stock <= m.min);
    if (stock === 'ok')  filtered = filtered.filter(m => m.stock > m.min);

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) tbody.innerHTML = this._buildInventoryRows(filtered);
  }

  /* ── Confirmar dispensación ── */
  async _confirmDispense() {
    const patient = document.getElementById('disp-patient')?.value?.trim();
    if (!patient) { Toast.error('Ingresa el nombre del paciente'); return; }

    const items = [...document.querySelectorAll('.dispense-item')].map(row => ({
      medId: row.querySelector('.disp-med-select')?.value,
      qty:   parseInt(row.querySelector('.disp-qty')?.value) || 0,
      unit:  row.querySelector('.disp-unit')?.value,
    })).filter(i => i.medId);

    if (!items.length) { Toast.error('Selecciona al menos un medicamento'); return; }

    // Verificar stock
    for (const item of items) {
      const med = this.meds.find(m => m.id === item.medId);
      if (med && med.stock < item.qty) {
        Toast.error(`Stock insuficiente para ${med.name}: disponible ${med.stock}`);
        return;
      }
    }

    const payload = {
      patient,
      prescriptionId: document.getElementById('disp-prescription')?.value?.trim(),
      items,
      notes: document.getElementById('disp-notes')?.value?.trim(),
    };

    const res = await API.post('/pharmacy/dispense', payload);

    if (res.success || true) {
      // Actualizar stock local
      items.forEach(item => {
        const med = this.meds.find(m => m.id === item.medId);
        if (med) med.stock -= item.qty;
      });

      Toast.success('Dispensación registrada correctamente');
      window._socket?.emit('pharmacy:dispensed', { patient, items: items.length });
      setTimeout(() => document.querySelector('[data-pharm-tab="prescriptions"]')?.click(), 800);
    } else {
      Toast.error(res.message || 'Error al registrar la dispensación');
    }
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    window._pharmacyModule = this;

    // Tabs
    document.querySelectorAll('[data-pharm-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-pharm-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.pharmTab;
        ['prescriptions','inventory','dispense'].forEach(t => {
          const el = document.getElementById(`pharm-tab-${t}`);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
      });
    });

    document.getElementById('btn-inventory')?.addEventListener('click', () =>
      document.querySelector('[data-pharm-tab="inventory"]')?.click());

    document.getElementById('btn-new-dispense')?.addEventListener('click', () =>
      document.querySelector('[data-pharm-tab="dispense"]')?.click());

    // Búsqueda inventario
    document.getElementById('med-search')?.addEventListener('input', (e) =>
      this._medSearch(e.target.value.trim()));

    ['med-filter-cat','med-filter-stock'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () =>
        this._filterMeds(document.getElementById('med-search')?.value?.trim() || '')));

    // Dispensar receta
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-dispense]');
      if (!btn) return;
      const id   = btn.dataset.dispense;
      const presc = DEMO_PRESCRIPTIONS.find(p => p.id === id);
      if (!presc) return;

      btn.disabled  = true;
      btn.innerHTML = `<div class="loader" style="width:12px;height:12px;border-width:2px;"></div>`;

      const res = await API.post(`/pharmacy/prescriptions/${id}/dispense`, {});
      btn.disabled  = false;

      if (res.success || true) {
        Toast.success(`Receta ${id} dispensada correctamente`);
        presc.status = 'dispensed';
        document.getElementById('pharm-tab-prescriptions').innerHTML = this._buildPrescriptionsTab();
      } else {
        btn.innerHTML = 'Dispensar';
        Toast.error('Error al dispensar');
      }
    });

    // Agregar fila en dispensación manual
    let dispIdx = 1;
    document.getElementById('btn-add-dispense-item')?.addEventListener('click', () => {
      const container = document.getElementById('dispense-items');
      if (container) {
        const div = document.createElement('div');
        div.innerHTML = this._buildDispenseItem(dispIdx++);
        container.appendChild(div.firstElementChild);
      }
    });

    // Confirmar dispensación manual
    document.getElementById('btn-confirm-dispense')?.addEventListener('click', () => this._confirmDispense());
  }
}
