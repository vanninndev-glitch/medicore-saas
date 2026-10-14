/**
 * MediCore SaaS — patients/list.js
 * Lista de pacientes: búsqueda, filtros, paginación, acciones
 */

import { API }               from '../../core/api.js';
import { Auth }              from '../../core/auth.js';
import { Toast }             from '../../components/toast.js';
import { DateUtils, Format, Validate, DOM, Pagination, Exporter, debounce } from '../../core/utils.js';

/* ══════════════════════════════════════════
   DATOS DEMO
══════════════════════════════════════════ */
const DEMO_PATIENTS = Array.from({ length: 48 }, (_, i) => ({
  id: `PAC-${String(i + 1).padStart(4, '0')}`,
  expedient: `EXP-2024-${String(1000 + i).padStart(4, '0')}`,
  name: ['María García López','Carlos Mendoza Ruiz','Ana Jiménez Torres',
    'Roberto Silva Peña','Lucía Hernández Vega','Fernando Díaz Morales',
    'Patricia Romero Cruz','Miguel Ángel Torres','Laura Sánchez Reyes',
    'José Luis Martínez','Sofía Castillo Vega','Eduardo Flores Ríos'][i % 12],
  dob: `19${60 + (i % 40)}-${String((i % 12) + 1).padStart(2,'0')}-${String((i % 28) + 1).padStart(2,'0')}`,
  gender: i % 2 === 0 ? 'Femenino' : 'Masculino',
  bloodType: ['A+','B+','O+','AB+','A-','O-'][i % 6],
  phone: `55${String(10000000 + i * 777).slice(0,8)}`,
  email: `paciente${i+1}@ejemplo.com`,
  area: ['Consulta Externa','Hospitalización','Urgencias','UCI','Pediatría','Ginecología'][i % 6],
  status: i % 7 === 0 ? 'inactive' : 'active',
  lastVisit: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000).toISOString(),
  alerts: i % 4 === 0 ? ['Alergia: Penicilina'] : [],
  insurance: ['IMSS','ISSSTE','Seguro Popular','Privado','Sin seguro'][i % 5],
  avatarColor: ['#1a6fff','#00d4ff','#00e5a0','#ff4757','#a78bfa','#ffb347'][i % 6],
}));

/* ══════════════════════════════════════════
   CLASE PRINCIPAL
══════════════════════════════════════════ */
export class PatientsList {
  constructor() {
    this.user       = Auth.getUser();
    this.patients   = [];
    this.filtered   = [];
    this.page       = 1;
    this.limit      = 20;
    this.total      = 0;
    this.filters    = { search: '', status: '', area: '', insurance: '' };
    this._pagination = null;
    this._searchFn  = debounce((q) => this._applyFilters(), 320);
  }

  /* ── Inicializar ── */
  async init() {
    this._renderShell();
    await this._loadPatients();
    this._bindEvents();
  }

  /* ── Shell HTML ── */
  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <!-- Encabezado -->
      <div class="page-header">
        <div>
          <div class="page-title">Pacientes</div>
          <div class="page-subtitle">Registro y gestión de pacientes del hospital</div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-secondary btn-sm" id="btn-export">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Exportar
          </button>
          <a href="/pages/patients/register.html" class="btn btn-primary btn-sm">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo paciente
          </a>
        </div>
      </div>

      <!-- Toolbar de búsqueda y filtros -->
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
            </svg>
          </div>
          <input type="text" id="search-input" placeholder="Buscar por nombre, expediente, CURP…" autocomplete="off" />
        </div>
        <select class="filter-select" id="filter-status">
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="hospitalized">Hospitalizado</option>
        </select>
        <select class="filter-select" id="filter-area">
          <option value="">Todas las áreas</option>
          <option value="Consulta Externa">Consulta Externa</option>
          <option value="Hospitalización">Hospitalización</option>
          <option value="Urgencias">Urgencias</option>
          <option value="UCI">UCI</option>
          <option value="Pediatría">Pediatría</option>
          <option value="Ginecología">Ginecología</option>
        </select>
        <select class="filter-select" id="filter-insurance">
          <option value="">Todos los seguros</option>
          <option value="IMSS">IMSS</option>
          <option value="ISSSTE">ISSSTE</option>
          <option value="Seguro Popular">Seguro Popular</option>
          <option value="Privado">Privado</option>
        </select>
        <div style="flex:1;"></div>
        <span id="results-count" style="font-size:0.82rem;color:var(--text-muted);white-space:nowrap;"></span>
      </div>

      <!-- Tabla -->
      <div class="table-wrap" id="patients-table-wrap">
        <table id="patients-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Expediente</th>
              <th>Edad / Género</th>
              <th>Área</th>
              <th>Seguro</th>
              <th>Última visita</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="patients-tbody">
            <tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);">
              <div class="loader" style="margin:0 auto 1rem;"></div>Cargando pacientes…
            </td></tr>
          </tbody>
        </table>
      </div>

      <!-- Paginación -->
      <div id="pagination-container" style="margin-top:1rem;"></div>`;
  }

  /* ── Cargar pacientes desde API ── */
  async _loadPatients() {
    const params = new URLSearchParams({
      page: this.page, limit: this.limit,
      ...(this.filters.search    && { search: this.filters.search }),
      ...(this.filters.status    && { status: this.filters.status }),
      ...(this.filters.area      && { area: this.filters.area }),
      ...(this.filters.insurance && { insurance: this.filters.insurance }),
    });

    const res = await API.get(`/patients?${params}`);

    if (res.success) {
      this.patients = res.data.patients || [];
      this.total    = res.data.total    || 0;
    } else {
      // Fallback demo con filtros simulados
      this.patients = DEMO_PATIENTS;
      this.total    = DEMO_PATIENTS.length;
      this._applyClientFilters();
    }

    this._renderTable();
    this._renderPagination();
    this._updateCount();
  }

  /* ── Filtros del lado cliente (demo) ── */
  _applyClientFilters() {
    let list = [...DEMO_PATIENTS];
    const q  = this.filters.search.toLowerCase();

    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.expedient.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    if (this.filters.status) {
      list = list.filter(p => p.status === this.filters.status);
    }
    if (this.filters.area) {
      list = list.filter(p => p.area === this.filters.area);
    }
    if (this.filters.insurance) {
      list = list.filter(p => p.insurance === this.filters.insurance);
    }

    this.total    = list.length;
    const start   = (this.page - 1) * this.limit;
    this.patients = list.slice(start, start + this.limit);
  }

  /* ── Renderizar tabla ── */
  _renderTable() {
    const tbody = document.getElementById('patients-tbody');
    if (!tbody) return;

    if (!this.patients.length) {
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" style="margin:0 auto 0.75rem;opacity:0.3;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <div>No se encontraron pacientes</div>
          <div style="font-size:0.78rem;margin-top:0.3rem;opacity:0.6;">Intenta cambiar los filtros de búsqueda</div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = this.patients.map(p => {
      const age      = DateUtils.age(p.dob);
      const initials = Format.initials(p.name);
      const lastVisit= DateUtils.timeAgo(p.lastVisit);
      const hasAlerts = p.alerts?.length > 0;

      return `
        <tr class="patient-row" data-id="${p.id}" onclick="window.location='/pages/patients/profile.html?id=${p.id}'" tabindex="0" role="row">
          <td>
            <div class="patient-avatar-cell">
              <div class="patient-mini-avatar" style="background:${p.avatarColor}22;color:${p.avatarColor};">${initials}</div>
              <div>
                <div class="patient-name-cell">
                  ${p.name}
                  ${hasAlerts ? `<span title="${p.alerts.join(', ')}" style="color:var(--accent-red);font-size:0.7rem;margin-left:4px;">⚠</span>` : ''}
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${p.id}</div>
              </div>
            </div>
          </td>
          <td><span class="patient-id-cell">${p.expedient}</span></td>
          <td>
            <div style="font-size:0.87rem;color:var(--text-primary);">${age} años</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${p.gender}</div>
          </td>
          <td><span class="badge badge-blue" style="font-size:0.72rem;">${p.area}</span></td>
          <td><span style="font-size:0.82rem;color:var(--text-secondary);">${p.insurance}</span></td>
          <td><span style="font-size:0.82rem;color:var(--text-muted);">${lastVisit}</span></td>
          <td>
            <span class="badge ${p.status === 'active' ? 'badge-green' : 'badge-red'}" style="font-size:0.72rem;">
              <span class="dot ${p.status === 'active' ? 'dot-green' : 'dot-red'}" style="width:5px;height:5px;box-shadow:none;"></span>
              ${p.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td onclick="event.stopPropagation()">
            <div class="flex gap-1 justify-center">
              <a href="/pages/patients/profile.html?id=${p.id}" class="btn btn-ghost btn-icon btn-sm" title="Ver perfil">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </a>
              <a href="/pages/records/index.html?patientId=${p.id}" class="btn btn-ghost btn-icon btn-sm" title="Historial clínico">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </a>
              <a href="/pages/appointments/new.html?patientId=${p.id}" class="btn btn-ghost btn-icon btn-sm" title="Nueva cita">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/><line x1="12" y1="11" x2="12" y2="17" stroke-linecap="round"/></svg>
              </a>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Keyboard navigation en filas
    tbody.querySelectorAll('.patient-row').forEach(row => {
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') row.click();
      });
    });
  }

  /* ── Paginación ── */
  _renderPagination() {
    this._pagination = new Pagination({
      total: this.total,
      page: this.page,
      limit: this.limit,
      onPage: (p) => {
        this.page = p;
        this._loadPatients();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
    this._pagination.render('pagination-container');
  }

  _updateCount() {
    const el = document.getElementById('results-count');
    if (el) el.textContent = `${Format.number(this.total)} pacientes`;
  }

  /* ── Aplicar filtros ── */
  _applyFilters() {
    this.page = 1;
    this._loadPatients();
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    // Búsqueda
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value.trim();
      this._searchFn();
    });

    // Filtros select
    ['filter-status', 'filter-area', 'filter-insurance'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const key = id.replace('filter-', '');
        this.filters[key] = e.target.value;
        this._applyFilters();
      });
    });

    // Exportar
    document.getElementById('btn-export')?.addEventListener('click', () => {
      const exportData = this.patients.map(p => ({
        ID: p.id,
        Expediente: p.expedient,
        Nombre: p.name,
        'Fecha Nacimiento': DateUtils.format(p.dob),
        Edad: DateUtils.age(p.dob),
        Género: p.gender,
        'Tipo Sangre': p.bloodType,
        Área: p.area,
        Seguro: p.insurance,
        Estado: p.status,
        'Última Visita': DateUtils.format(p.lastVisit),
      }));
      Exporter.toCSV(exportData, `pacientes_${new Date().toISOString().split('T')[0]}.csv`);
      Toast.success('Exportación generada');
    });
  }
}
