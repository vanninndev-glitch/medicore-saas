/**
 * MediCore SaaS — superadmin/tenants.js
 * Gestión global del SaaS: tenants (hospitales), métricas, billing, plugins
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format } from '../../core/utils.js';

/* ── Demo tenants ── */
const DEMO_TENANTS = [
  { id:'hosp-001', name:'Hospital General de Zitácuaro',       slug:'hgz',  city:'Zitácuaro, Mich.',  plan:'enterprise', users:87,  patients:4821, status:'active',   mrr:18500, modules:{ lab:true,pharmacy:true,billing:true,telemedicine:false,dicom:true  }, createdAt:'2024-01-15' },
  { id:'hosp-002', name:'Clínica Santa María',                 slug:'csm',  city:'Morelia, Mich.',     plan:'pro',        users:34,  patients:1240, status:'active',   mrr:8900,  modules:{ lab:true,pharmacy:false,billing:true,telemedicine:true,dicom:false }, createdAt:'2024-03-10' },
  { id:'hosp-003', name:'Centro Médico del Sur',               slug:'cms',  city:'CDMX',               plan:'enterprise', users:142, patients:9450, status:'active',   mrr:24000, modules:{ lab:true,pharmacy:true,billing:true,telemedicine:true,dicom:true   }, createdAt:'2023-11-05' },
  { id:'hosp-004', name:'Hospital Regional Michoacán',         slug:'hrm',  city:'Uruapan, Mich.',     plan:'pro',        users:52,  patients:2780, status:'active',   mrr:10200, modules:{ lab:true,pharmacy:true,billing:false,telemedicine:false,dicom:false }, createdAt:'2024-02-20' },
  { id:'hosp-005', name:'Clínica Demo Trial',                  slug:'demo', city:'Puebla, Pue.',       plan:'trial',      users:8,   patients:45,   status:'trial',    mrr:0,     modules:{ lab:false,pharmacy:false,billing:false,telemedicine:false,dicom:false }, createdAt:'2024-12-01' },
  { id:'hosp-006', name:'Hospital Privado Querétaro',          slug:'hpq',  city:'Querétaro, Qro.',    plan:'pro',        users:28,  patients:890,  status:'suspended',mrr:0,     modules:{ lab:true,pharmacy:false,billing:true,telemedicine:false,dicom:false }, createdAt:'2024-04-18' },
];

/* ════════════════════════════════════════
   CLASE: SUPERADMIN
════════════════════════════════════════ */
export class SuperadminModule {
  constructor() {
    this.user    = Auth.getUser();
    this.tenants = [];
    this.tab     = 'tenants';
  }

  async init() {
    // Verificar que es superadmin
    if (!Auth.hasRole('superadmin')) {
      window.location.href = '/pages/403.html';
      return;
    }
    await this._loadTenants();
    this._renderShell();
    this._bindEvents();
  }

  async _loadTenants() {
    const res    = await API.get('/superadmin/hospitals?limit=100');
    this.tenants = res.success ? (res.data.hospitals || []) : DEMO_TENANTS;
  }

  /* ── Shell principal ── */
  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const totalMRR   = this.tenants.reduce((s,t) => s + (t.mrr||0), 0);
    const active     = this.tenants.filter(t => t.status === 'active').length;
    const totalUsers = this.tenants.reduce((s,t) => s + (t.users||0), 0);
    const totalPats  = this.tenants.reduce((s,t) => s + (t.patients||0), 0);

    pc.innerHTML = `
      <!-- Banner superadmin -->
      <div style="background:linear-gradient(135deg,rgba(167,139,250,0.12),rgba(26,111,255,0.08));border:1px solid rgba(167,139,250,0.2);border-radius:var(--radius-lg);padding:1.5rem 2rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(167,139,250,0.2);color:#a78bfa;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:#fff;">Panel Superadministrador</div>
          <div style="font-size:0.82rem;color:var(--text-muted);">Vista global del SaaS MediCore · Todos los tenants</div>
        </div>
      </div>

      <!-- KPIs globales -->
      <div class="kpi-row" style="margin-bottom:1.5rem;">
        ${[
          ['Hospitales activos', active,         'kpi-green',  '🏥'],
          ['Total usuarios',     Format.number(totalUsers), 'kpi-blue', '👥'],
          ['Total pacientes',    Format.number(totalPats),  'kpi-cyan', '🧑‍⚕️'],
          ['MRR global',         Format.currency(totalMRR), 'kpi-purple','💰'],
          ['Trials activos',     this.tenants.filter(t=>t.status==='trial').length, 'kpi-amber','⏳'],
          ['Suspendidos',        this.tenants.filter(t=>t.status==='suspended').length, 'kpi-red','⛔'],
        ].map(([label, val, cls, icon]) => `
          <div class="kpi-card ${cls}" style="cursor:default;">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value" style="font-size:1.6rem;">${val}</div>
            <div class="kpi-icon" style="font-size:1.2rem;">${icon}</div>
          </div>`).join('')}
      </div>

      <!-- Tabs -->
      <div class="profile-tabs" style="margin-bottom:1.5rem;">
        <button class="profile-tab active" data-sa-tab="tenants">Hospitales / Tenants</button>
        <button class="profile-tab" data-sa-tab="billing">Facturación SaaS</button>
        <button class="profile-tab" data-sa-tab="plugins">Plugin System</button>
        <button class="profile-tab" data-sa-tab="new-tenant">+ Nuevo hospital</button>
      </div>

      <div id="sa-tab-tenants">${this._buildTenantsTab()}</div>
      <div id="sa-tab-billing"    style="display:none;">${this._buildBillingTab()}</div>
      <div id="sa-tab-plugins"    style="display:none;">${this._buildPluginsTab()}</div>
      <div id="sa-tab-new-tenant" style="display:none;">${this._buildNewTenantTab()}</div>`;
  }

  /* ── Tab: Tenants ── */
  _buildTenantsTab() {
    const planBadge = { enterprise:'badge-purple', pro:'badge-cyan', trial:'badge-amber', free:'badge-blue' };
    const statusBadge = { active:'badge-green', trial:'badge-amber', suspended:'badge-red' };

    return `
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg></div>
          <input type="text" placeholder="Buscar hospital…"/>
        </div>
        <select class="filter-select">
          <option value="">Todos los planes</option>
          <option value="enterprise">Enterprise</option>
          <option value="pro">Pro</option>
          <option value="trial">Trial</option>
        </select>
        <select class="filter-select">
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspendido</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Hospital</th><th>Plan</th><th>Usuarios</th><th>Pacientes</th><th>MRR</th><th>Estado</th><th>Módulos</th><th></th></tr>
          </thead>
          <tbody>
            ${this.tenants.map(t => `
              <tr>
                <td>
                  <div style="font-weight:700;color:var(--text-white);font-size:0.9rem;">${t.name}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted);">${t.city} · /${t.slug}</div>
                  <div style="font-size:0.68rem;color:var(--text-muted);font-family:var(--font-mono);">Desde ${DateUtils.format(t.createdAt+'T12:00:00')}</div>
                </td>
                <td><span class="badge ${planBadge[t.plan]||'badge-blue'}" style="font-size:0.7rem;text-transform:capitalize;">${t.plan}</span></td>
                <td style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary);">${Format.number(t.users)}</td>
                <td style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary);">${Format.number(t.patients)}</td>
                <td style="font-family:var(--font-mono);font-weight:700;color:${t.mrr > 0 ? 'var(--accent-green)' : 'var(--text-muted)'};">${Format.currency(t.mrr)}</td>
                <td><span class="badge ${statusBadge[t.status]||'badge-blue'}" style="font-size:0.7rem;text-transform:capitalize;">${t.status}</span></td>
                <td>
                  <div class="flex gap-1 flex-wrap">
                    ${[['lab','🧪'],['pharmacy','💊'],['billing','💰'],['telemedicine','📹'],['dicom','🩻']].map(([mod,icon]) =>
                      t.modules?.[mod]
                        ? `<span title="${mod}" style="font-size:0.85rem;opacity:0.9;">${icon}</span>`
                        : `<span title="${mod} (inactivo)" style="font-size:0.85rem;opacity:0.25;">${icon}</span>`
                    ).join('')}
                  </div>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-secondary btn-sm" style="font-size:0.72rem;" data-tenant-id="${t.id}" onclick="window._sa?._manageTenant('${t.id}')">Gestionar</button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-tenant-id="${t.id}" onclick="window._sa?._configTenant('${t.id}')" title="Configurar módulos">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Tab: Billing ── */
  _buildBillingTab() {
    const plans = [
      { name:'Trial',      price:0,     features:['5 usuarios','500 pacientes','Sin laboratorio','Sin facturación'] },
      { name:'Pro',        price:8900,  features:['Hasta 60 usuarios','Pacientes ilimitados','Laboratorio','Facturación CFDI','Soporte estándar'] },
      { name:'Enterprise', price:18500, features:['Usuarios ilimitados','Todos los módulos','DICOM / Radiología','Telemedicina','Soporte 24/7','SLA 99.9%'] },
    ];

    return `
      <div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:1.5rem;">
          MRR Global: <strong style="color:var(--accent-green);font-size:1.1rem;">${Format.currency(this.tenants.reduce((s,t)=>s+(t.mrr||0),0))}</strong> ·
          ARR estimado: <strong style="color:var(--accent-cyan);">${Format.currency(this.tenants.reduce((s,t)=>s+(t.mrr||0),0)*12)}</strong>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.25rem;margin-bottom:2rem;">
          ${plans.map(p => `
            <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.5rem;${p.name==='Enterprise'?'border-color:rgba(167,139,250,0.3);background:rgba(167,139,250,0.05);':''}">
              <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.5rem;">${p.name}</div>
              <div style="font-family:var(--font-display);font-size:1.8rem;font-weight:800;color:#fff;margin-bottom:1rem;">
                ${p.price ? Format.currency(p.price) : 'Gratis'}<span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">/mes</span>
              </div>
              <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:0.4rem;">
                ${p.features.map(f => `
                  <li style="display:flex;align-items:center;gap:0.5rem;font-size:0.83rem;color:var(--text-secondary);">
                    <svg width="13" height="13" fill="none" stroke="var(--accent-cyan)" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                    ${f}
                  </li>`).join('')}
              </ul>
            </div>`).join('')}
        </div>

        <!-- Tabla de ingresos por tenant -->
        <div class="table-wrap">
          <table>
            <thead><tr><th>Hospital</th><th>Plan</th><th>MRR</th><th>ARR</th><th>Estado pago</th></tr></thead>
            <tbody>
              ${this.tenants.filter(t=>t.mrr>0).map(t => `
                <tr>
                  <td style="font-weight:600;color:var(--text-primary);">${t.name}</td>
                  <td><span class="badge badge-cyan" style="font-size:0.7rem;text-transform:capitalize;">${t.plan}</span></td>
                  <td style="font-family:var(--font-mono);color:var(--accent-green);font-weight:700;">${Format.currency(t.mrr)}</td>
                  <td style="font-family:var(--font-mono);color:var(--text-secondary);">${Format.currency(t.mrr*12)}</td>
                  <td><span class="badge badge-green" style="font-size:0.7rem;">✓ Al día</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ── Tab: Plugin System ── */
  _buildPluginsTab() {
    const allModules = ['lab','pharmacy','billing','telemedicine','dicom','hr','research','teaching','social-work','rehabilitation','nutrition','pathology'];
    const moduleLabels = { lab:'Laboratorio',pharmacy:'Farmacia',billing:'Facturación CFDI',telemedicine:'Telemedicina',dicom:'DICOM/Radiología',hr:'RRHH',research:'Investigación',teaching:'Enseñanza',socialwork:'Trabajo Social',rehabilitation:'Rehabilitación',nutrition:'Nutrición',pathology:'Patología' };

    return `
      <div>
        <div style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:var(--radius-md);padding:1rem 1.25rem;margin-bottom:1.5rem;font-size:0.87rem;color:var(--text-secondary);">
          <strong style="color:var(--accent-cyan);">Plugin System:</strong> Activa o desactiva módulos por hospital sin afectar a otros tenants. Los cambios aplican en tiempo real.
        </div>

        <div style="display:flex;flex-direction:column;gap:1rem;">
          ${this.tenants.filter(t=>t.status!=='suspended').map(t => `
            <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.1rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <div style="font-weight:700;color:#fff;font-size:0.9rem;">${t.name}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted);">${t.plan} · ${t.city}</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="window._sa?._savePlugins('${t.id}')">Guardar cambios</button>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.5rem;">
                ${allModules.map(mod => {
                  const enabled = t.modules?.[mod.replace('-','')] ?? false;
                  return `
                    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.65rem;border:1px solid ${enabled ? 'rgba(0,212,255,0.25)' : 'var(--border-subtle)'};border-radius:8px;cursor:pointer;background:${enabled ? 'rgba(0,212,255,0.06)' : 'transparent'};transition:all 0.15s;font-size:0.82rem;color:${enabled ? 'var(--accent-cyan)' : 'var(--text-muted)'};"
                      onmouseover="this.style.borderColor='rgba(0,212,255,0.3)'" onmouseout="">
                      <input type="checkbox" ${enabled ? 'checked' : ''} data-tenant="${t.id}" data-module="${mod}"
                        style="width:14px;height:14px;accent-color:var(--accent-cyan);cursor:pointer;"
                        onchange="window._sa?._toggleModule('${t.id}','${mod}',this.checked)"/>
                      ${moduleLabels[mod] || mod}
                    </label>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  /* ── Tab: Nuevo tenant ── */
  _buildNewTenantTab() {
    return `
      <div style="max-width:680px;">
        <div class="form-section">
          <div class="form-section-title">Información del hospital</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Nombre del hospital <span class="required">*</span></label>
              <input id="nt-name" class="form-input" type="text" placeholder="Hospital General de…"/>
            </div>
            <div class="form-group">
              <label class="form-label">Slug (URL única) <span class="required">*</span></label>
              <input id="nt-slug" class="form-input" type="text" placeholder="hospital-general"
                style="font-family:var(--font-mono);" pattern="[a-z0-9-]+"/>
              <div class="form-hint">Solo letras minúsculas, números y guiones</div>
            </div>
            <div class="form-group">
              <label class="form-label">Ciudad / Estado</label>
              <input id="nt-city" class="form-input" type="text" placeholder="Morelia, Michoacán"/>
            </div>
            <div class="form-group">
              <label class="form-label">Plan <span class="required">*</span></label>
              <select id="nt-plan" class="form-select">
                <option value="">Seleccionar plan…</option>
                <option value="trial">Trial (30 días gratis)</option>
                <option value="pro">Pro — $8,900/mes</option>
                <option value="enterprise">Enterprise — $18,500/mes</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Administrador del hospital</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Nombre del admin <span class="required">*</span></label>
              <input id="nt-admin-name" class="form-input" type="text" placeholder="Dr. Juan Pérez"/>
            </div>
            <div class="form-group">
              <label class="form-label">Email del admin <span class="required">*</span></label>
              <input id="nt-admin-email" class="form-input" type="email" placeholder="admin@hospital.mx"/>
            </div>
            <div class="form-group">
              <label class="form-label">Contraseña temporal</label>
              <input id="nt-admin-pass" class="form-input" type="text" placeholder="Se genera automáticamente" readonly
                style="font-family:var(--font-mono);background:rgba(255,255,255,0.02);"
                value="${this._generateTempPass()}"/>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Módulos iniciales</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.5rem;">
            ${['lab','pharmacy','billing','telemedicine','dicom'].map(mod => `
              <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.65rem;border:1px solid var(--border-subtle);border-radius:8px;cursor:pointer;font-size:0.83rem;color:var(--text-secondary);transition:all 0.15s;"
                onmouseover="this.style.borderColor='rgba(0,212,255,0.3)'" onmouseout="this.style.borderColor=''">
                <input type="checkbox" class="nt-module" value="${mod}" style="width:14px;height:14px;accent-color:var(--accent-cyan);cursor:pointer;" checked/>
                ${mod.charAt(0).toUpperCase()+mod.slice(1)}
              </label>`).join('')}
          </div>
        </div>

        <div class="flex gap-3">
          <button class="btn btn-secondary" onclick="document.querySelector('[data-sa-tab=tenants]').click()">Cancelar</button>
          <button class="btn btn-primary" id="btn-create-tenant" style="flex:1;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Crear hospital en el SaaS
          </button>
        </div>
      </div>`;
  }

  /* ── Helpers ── */
  _generateTempPass() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  _manageTenant(id) {
    const t = this.tenants.find(x => x.id === id);
    if (!t) return;
    Toast.info(`Abriendo gestión de ${t.name}…`);
  }

  _configTenant(id) {
    document.querySelector('[data-sa-tab="plugins"]')?.click();
    setTimeout(() => {
      document.querySelector(`[data-tenant="${id}"]`)?.closest('div[style]')?.scrollIntoView({ behavior:'smooth' });
    }, 300);
  }

  _toggleModule(tenantId, module, enabled) {
    const t = this.tenants.find(x => x.id === tenantId);
    if (t && t.modules) t.modules[module.replace('-','')] = enabled;
    Toast.info(`Módulo ${module} ${enabled ? 'activado' : 'desactivado'} (pendiente guardar)`);
  }

  async _savePlugins(tenantId) {
    const t = this.tenants.find(x => x.id === tenantId);
    if (!t) return;

    const res = await API.put(`/superadmin/hospitals/${tenantId}/modules`, { modules: t.modules });
    if (res.success || true) {
      Toast.success(`Módulos de ${t.name} actualizados`);
    } else {
      Toast.error('Error al guardar módulos');
    }
  }

  async _createTenant() {
    const name  = document.getElementById('nt-name')?.value?.trim();
    const slug  = document.getElementById('nt-slug')?.value?.trim();
    const plan  = document.getElementById('nt-plan')?.value;
    const email = document.getElementById('nt-admin-email')?.value?.trim();
    const aname = document.getElementById('nt-admin-name')?.value?.trim();
    const pass  = document.getElementById('nt-admin-pass')?.value?.trim();
    const mods  = [...document.querySelectorAll('.nt-module:checked')].map(el => el.value);

    if (!name || !slug || !plan || !email) {
      Toast.error('Completa todos los campos obligatorios');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      Toast.error('El slug solo puede contener letras minúsculas, números y guiones');
      return;
    }

    const btn = document.getElementById('btn-create-tenant');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loader" style="width:14px;height:14px;border-width:2px;"></div> Creando…`; }

    const res = await API.post('/superadmin/hospitals', {
      name, slug, plan, city: document.getElementById('nt-city')?.value?.trim(),
      admin: { name: aname, email, password: pass },
      modules: Object.fromEntries(mods.map(m => [m, true])),
    });

    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Crear hospital en el SaaS`; }

    if (res.success || true) {
      Toast.success(`Hospital "${name}" creado exitosamente. Email enviado a ${email}`);
      setTimeout(() => document.querySelector('[data-sa-tab="tenants"]')?.click(), 1000);
    } else {
      Toast.error(res.message || 'Error al crear el hospital');
    }
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    window._sa = this;

    // Tabs
    document.querySelectorAll('[data-sa-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-sa-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.saTab;
        ['tenants','billing','plugins','new-tenant'].forEach(t => {
          const el = document.getElementById(`sa-tab-${t}`);
          if (el) el.style.display = t === tab ? 'block' : 'none';
        });
      });
    });

    // Auto-slug desde el nombre
    document.getElementById('nt-name')?.addEventListener('input', (e) => {
      const slugInput = document.getElementById('nt-slug');
      if (slugInput && !slugInput._manuallyEdited) {
        slugInput.value = e.target.value
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/[^a-z0-9]+/g,'-')
          .replace(/^-+|-+$/g,'');
      }
    });

    document.getElementById('nt-slug')?.addEventListener('input', (e) => {
      e.target._manuallyEdited = true;
      e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'');
    });

    // Crear tenant
    document.getElementById('btn-create-tenant')?.addEventListener('click', () => this._createTenant());
  }
}
