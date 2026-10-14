/**
 * MediCore SaaS — toast.js
 * Sistema de notificaciones toast
 */

export const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toast-container';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  },

  show(message, type = 'info', duration = 4000) {
    const icons = {
      success: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      error:   `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      warning: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
      info:    `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    };

    const colorMap = {
      success: 'var(--accent-green)',
      error:   'var(--accent-red)',
      warning: 'var(--accent-amber)',
      info:    'var(--accent-cyan)',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.color = colorMap[type] || colorMap.info;
    toast.innerHTML = `
      <span style="flex-shrink:0">${icons[type] || icons.info}</span>
      <span style="color: var(--text-primary); flex:1; font-size:0.88rem">${message}</span>
      <button onclick="this.parentElement.remove()" style="color:var(--text-muted);padding:2px;flex-shrink:0">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    this._getContainer().appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  },

  success(msg, duration) { return this.show(msg, 'success', duration); },
  error(msg, duration)   { return this.show(msg, 'error',   duration); },
  warning(msg, duration) { return this.show(msg, 'warning', duration); },
  info(msg, duration)    { return this.show(msg, 'info',    duration); },
};
