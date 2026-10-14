/**
 * MediCore SaaS — store.js
 * Estado global reactivo (pub/sub) sin frameworks
 */

const _state = {
  user:            null,
  isAuthenticated: false,
  hospital:        null,
  notifications:   [],
  unreadCount:     0,
  sidebarOpen:     true,
  theme:           localStorage.getItem('mc_theme') || 'dark',
  activeModule:    null,
};

const _listeners = {};

export const Store = {

  /* ── Obtener valor ── */
  get(key) {
    return _state[key];
  },

  /* ── Establecer valor y notificar suscriptores ── */
  set(key, value) {
    const prev = _state[key];
    _state[key] = value;

    if (JSON.stringify(prev) !== JSON.stringify(value)) {
      this._emit(key, value, prev);
    }
  },

  /* ── Actualizar parcialmente un objeto ── */
  merge(key, partial) {
    const current = _state[key] || {};
    this.set(key, { ...current, ...partial });
  },

  /* ── Suscribirse a cambios de una clave ── */
  on(key, callback) {
    if (!_listeners[key]) _listeners[key] = new Set();
    _listeners[key].add(callback);
    // Retornar función de desuscripción
    return () => _listeners[key]?.delete(callback);
  },

  /* ── Desuscribirse ── */
  off(key, callback) {
    _listeners[key]?.delete(callback);
  },

  /* ── Emitir cambio ── */
  _emit(key, value, prev) {
    _listeners[key]?.forEach(cb => {
      try { cb(value, prev); } catch (err) {
        console.error(`[Store] Error en listener de "${key}":`, err);
      }
    });
  },

  /* ── Helpers de notificaciones ── */
  addNotification(notif) {
    const current = _state.notifications;
    this.set('notifications', [notif, ...current].slice(0, 50));
    this.set('unreadCount', _state.unreadCount + 1);
  },

  markAllRead() {
    const updated = _state.notifications.map(n => ({ ...n, read: true }));
    this.set('notifications', updated);
    this.set('unreadCount', 0);
  },

  /* ── Snapshot del estado completo ── */
  snapshot() {
    return { ..._state };
  },
};
