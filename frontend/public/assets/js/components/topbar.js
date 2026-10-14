/**
 * MediCore SaaS — topbar.js
 * Barra superior: búsqueda global, notificaciones RT, acciones rápidas
 */

import { Auth }   from '../core/auth.js';
import { Store }  from '../core/store.js';
import { API }    from '../core/api.js';

export class Topbar {
  constructor(sidebar) {
    this.sidebar      = sidebar;
    this.user         = Auth.getUser();
    this.searchTimer  = null;
    this.notifOpen    = false;

    this._render();
    this._bindEvents();
    this._watchStore();
    this._loadNotifications();
  }

  /* ── Render ── */
  _render() {
    const el = document.getElementById('topbar');
    if (!el) return;
    this.el = el;
    el.id = 'topbar';

    el.innerHTML = this._buildHTML();
  }

  _buildHTML() {
    const page  = this._getPageTitle();
    const crumb = this._getBreadcrumb();

    return `
      <!-- Toggle sidebar -->
      <button class="topbar-toggle" id="topbar-toggle" aria-label="Toggle menú">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <!-- Breadcrumb (desktop) -->
      <div class="topbar-breadcrumb hide-mobile">
        <span>${crumb.parent}</span>
        ${crumb.current ? `<span class="bc-sep">/</span><span class="bc-current">${crumb.current}</span>` : ''}
      </div>

      <!-- Búsqueda global -->
      <div class="topbar-search">
        <div class="topbar-search-icon">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        <input
          type="text"
          class="topbar-search-input"
          id="global-search"
          placeholder="Buscar pacientes, citas, documentos…"
          autocomplete="off"
          aria-label="Búsqueda global"
        />
        <div class="search-kbd hide-mobile">
          <span class="kbd">⌘</span>
          <span class="kbd">K</span>
        </div>
        <!-- Resultados -->
        <div class="search-results" id="search-results" role="listbox"></div>
      </div>

      <div class="topbar-spacer"></div>

      <!-- Estado del sistema -->
      <div class="system-status hide-mobile" id="system-status">
        <div class="dot dot-green"></div>
        <span>Sistema activo</span>
      </div>

      <!-- Acciones -->
      <div class="topbar-actions">

        <!-- Acción rápida: Nueva cita -->
        <button class="topbar-btn" id="btn-new-appointment" title="Nueva cita" aria-label="Nueva cita">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/>
            <line x1="12" y1="11" x2="12" y2="17" stroke-linecap="round"/>
            <line x1="9" y1="14" x2="15" y2="14" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Notificaciones -->
        <button class="topbar-btn" id="btn-notifications" title="Notificaciones" aria-label="Notificaciones" aria-haspopup="true">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          <span class="notif-badge" id="notif-badge" style="display:none">0</span>
        </button>

        <!-- Modo oscuro / claro (toggle) -->
        <button class="topbar-btn hide-mobile" id="btn-theme" title="Cambiar tema" aria-label="Cambiar tema">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" id="theme-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
          </svg>
        </button>

      </div>

      <!-- Panel de notificaciones -->
      <div class="notif-panel" id="notif-panel" role="dialog" aria-label="Notificaciones">
        <div class="notif-header">
          <span class="notif-title">Notificaciones</span>
          <button class="btn btn-ghost btn-sm" id="mark-all-read">Marcar todas leídas</button>
        </div>
        <div class="notif-list" id="notif-list">
          <div class="notif-empty">
            <svg width="32" height="32" fill="none" stroke="var(--text-muted)" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 0.5rem;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            Sin notificaciones nuevas
          </div>
        </div>
        <div class="notif-footer">
          <a href="/pages/notifications/index.html" style="font-size:0.82rem;color:var(--accent-cyan);">
            Ver todas las notificaciones
          </a>
        </div>
      </div>
    `;
  }

  /* ── Breadcrumb dinámico ── */
  _getPageTitle() {
    return document.title.replace(' — MediCore', '') || 'Dashboard';
  }

  _getBreadcrumb() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    const sectionMap = {
      patients: 'Pacientes', records: 'Historial Clínico',
      appointments: 'Citas', documents: 'Documentos',
      lab: 'Laboratorio', pharmacy: 'Farmacia',
      billing: 'Facturación', reports: 'Reportes',
      superadmin: 'Superadmin', config: 'Configuración',
      urgencies: 'Urgencias', surgeries: 'Quirófano',
      hospitalizations: 'Hospitalización', imaging: 'Imagen',
      pharmacy: 'Farmacia', hr: 'RRHH', quality: 'Calidad',
    };

    const section = parts.find(p => sectionMap[p]);
    return {
      parent: 'MediCore',
      current: section ? sectionMap[section] : 'Dashboard',
    };
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    if (!this.el) return;

    // Toggle sidebar
    document.getElementById('topbar-toggle')?.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        this.sidebar?.toggleMobile();
      } else {
        this.sidebar?.toggleCollapse();
      }
    });

    // Búsqueda global
    const searchInput = document.getElementById('global-search');
    const searchResults = document.getElementById('search-results');

    searchInput?.addEventListener('input', (e) => {
      clearTimeout(this.searchTimer);
      const q = e.target.value.trim();

      if (q.length < 2) {
        searchResults?.classList.remove('visible');
        return;
      }

      this.searchTimer = setTimeout(() => this._runSearch(q), 320);
    });

    searchInput?.addEventListener('focus', () => {
      if (searchInput.value.length >= 2) {
        searchResults?.classList.add('visible');
      }
    });

    // Cerrar búsqueda al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar-search')) {
        searchResults?.classList.remove('visible');
      }
    });

    // Shortcut ⌘K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      }
      if (e.key === 'Escape') {
        searchResults?.classList.remove('visible');
        searchInput?.blur();
        this._closeNotifPanel();
      }
    });

    // Notificaciones
    document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleNotifPanel();
    });

    document.addEventListener('click', () => this._closeNotifPanel());

    document.getElementById('mark-all-read')?.addEventListener('click', () => {
      Store.markAllRead();
      this._renderNotifications([]);
      const badge = document.getElementById('notif-badge');
      if (badge) badge.style.display = 'none';
    });

    // Nueva cita rápida
    document.getElementById('btn-new-appointment')?.addEventListener('click', () => {
      window.location.href = '/pages/appointments/new.html';
    });

    // Tema
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this._toggleTheme();
    });
  }

  /* ── Búsqueda global ── */
  async _runSearch(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = `
      <div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">
        <div class="loader" style="margin:0 auto;"></div>
      </div>`;
    resultsEl.classList.add('visible');

    const res = await API.get(`/search?q=${encodeURIComponent(query)}&limit=5`);

    if (!res.success) {
      resultsEl.innerHTML = `<div class="notif-empty">Error al buscar</div>`;
      return;
    }

    const data = res.data || { patients: [], appointments: [], documents: [] };
    let html = '';

    if (data.patients?.length) {
      html += `<div class="search-section-title">Pacientes</div>`;
      for (const p of data.patients) {
        html += `
          <a href="/pages/patients/profile.html?id=${p.id}" class="search-result-item">
            <div class="search-result-icon" style="background:rgba(26,111,255,0.15);color:#5599ff;">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div class="search-result-text">
              <div class="search-result-name">${p.name}</div>
              <div class="search-result-sub">${p.expedient || ''} · ${p.dob || ''}</div>
            </div>
          </a>`;
      }
    }

    if (data.appointments?.length) {
      html += `<div class="search-section-title">Citas</div>`;
      for (const a of data.appointments) {
        html += `
          <a href="/pages/appointments/index.html?id=${a.id}" class="search-result-item">
            <div class="search-result-icon" style="background:rgba(0,229,160,0.12);color:var(--accent-green);">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="search-result-text">
              <div class="search-result-name">${a.patientName}</div>
              <div class="search-result-sub">${a.date} · ${a.doctorName}</div>
            </div>
          </a>`;
      }
    }

    if (!data.patients?.length && !data.appointments?.length) {
      html = `<div class="notif-empty">Sin resultados para "<strong>${query}</strong>"</div>`;
    }

    resultsEl.innerHTML = html;
  }

  /* ── Notificaciones ── */
  async _loadNotifications() {
    const res = await API.get('/notifications?limit=10&unread=true');
    if (!res.success) return;

    const notifs = res.data?.notifications || [];
    Store.set('notifications', notifs);
    Store.set('unreadCount', notifs.filter(n => !n.read).length);

    this._renderNotifications(notifs);
    this._updateBadge(notifs.filter(n => !n.read).length);
  }

  _renderNotifications(notifs) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifs.length) {
      list.innerHTML = `<div class="notif-empty">Sin notificaciones nuevas</div>`;
      return;
    }

    const typeConfig = {
      appointment: { bg: 'rgba(0,229,160,0.1)', color: 'var(--accent-green)' },
      lab:         { bg: 'rgba(0,212,255,0.1)', color: 'var(--accent-cyan)' },
      urgency:     { bg: 'rgba(255,71,87,0.1)', color: 'var(--accent-red)' },
      document:    { bg: 'rgba(26,111,255,0.1)', color: '#5599ff' },
      system:      { bg: 'rgba(255,179,71,0.1)', color: 'var(--accent-amber)' },
    };

    list.innerHTML = notifs.map(n => {
      const cfg = typeConfig[n.type] || typeConfig.system;
      return `
        <div class="notif-item${n.read ? '' : ' unread'}" style="position:relative" data-id="${n.id}">
          <div class="notif-icon" style="background:${cfg.bg};color:${cfg.color};">
            ${this._notifIcon(n.type)}
          </div>
          <div class="notif-body">
            <div class="notif-text">${n.message}</div>
            <div class="notif-time">${this._timeAgo(n.createdAt)}</div>
          </div>
        </div>`;
    }).join('');
  }

  _notifIcon(type) {
    const icons = {
      appointment: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/></svg>`,
      lab:         `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6"/></svg>`,
      urgency:     `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
      document:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`,
    };
    return icons[type] || icons.document;
  }

  _updateBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  _toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    this.notifOpen = !this.notifOpen;
    panel?.classList.toggle('open', this.notifOpen);
    document.getElementById('btn-notifications')?.setAttribute('aria-expanded', this.notifOpen);
  }

  _closeNotifPanel() {
    const panel = document.getElementById('notif-panel');
    this.notifOpen = false;
    panel?.classList.remove('open');
  }

  /* ── Helpers ── */
  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `Hace ${hrs}h`;
    return `Hace ${Math.floor(hrs / 24)}d`;
  }

  _toggleTheme() {
    const body = document.body;
    const isLight = body.classList.toggle('theme-light');
    localStorage.setItem('mc_theme', isLight ? 'light' : 'dark');
    Store.set('theme', isLight ? 'light' : 'dark');
  }

  /* ── Observar store ── */
  _watchStore() {
    Store.on('unreadCount', (count) => this._updateBadge(count));
    Store.on('notifications', (notifs) => this._renderNotifications(notifs));
  }

  /* ── Agregar notificación en tiempo real (llamado desde socket.js) ── */
  addRealTimeNotification(notif) {
    Store.addNotification(notif);
  }
}
