/**
 * MediCore SaaS — auth.js
 * Gestión de autenticación: login, logout, refresh token, sesión activa
 */

import { API } from './api.js';
import { Store } from './store.js';
import { Toast } from '../components/toast.js';

const TOKEN_KEY   = 'mc_access_token';
const REFRESH_KEY = 'mc_refresh_token';
const USER_KEY    = 'mc_user';

export const Auth = {

  /* ── Guardar sesión ── */
  setSession(data) {
    localStorage.setItem(TOKEN_KEY,   data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    localStorage.setItem(USER_KEY,    JSON.stringify(data.user));
    Store.set('user', data.user);
    Store.set('isAuthenticated', true);
  },

  /* ── Obtener token ── */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  },

  /* ── Obtener usuario actual ── */
  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /* ── ¿Está autenticado? ── */
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Verificar expiración (con 30s de margen)
      return payload.exp * 1000 > Date.now() + 30_000;
    } catch {
      return false;
    }
  },

  /* ── Login ── */
  async login(email, password, hospitalSlug = null) {
    const body = { email, password };
    if (hospitalSlug) body.hospitalSlug = hospitalSlug;

    const res = await API.post('/auth/login', body, { public: true });

    if (res.success) {
      this.setSession(res.data);
      this._scheduleRefresh(res.data.accessToken);
      return { success: true, user: res.data.user };
    }

    return { success: false, message: res.message || 'Credenciales incorrectas' };
  },

  /* ── Logout ── */
  async logout() {
    try {
      await API.post('/auth/logout', { refreshToken: this.getRefreshToken() });
    } catch { /* silencioso */ }

    this._clearSession();
    window.location.href = '/index.html';
  },

  /* ── Refresh token ── */
  async refresh() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this._clearSession();
      return false;
    }

    try {
      const res = await API.post('/auth/refresh', { refreshToken }, { public: true });
      if (res.success) {
        localStorage.setItem(TOKEN_KEY, res.data.accessToken);
        this._scheduleRefresh(res.data.accessToken);
        return true;
      }
    } catch { /* continúa */ }

    this._clearSession();
    return false;
  },

  /* ── Limpiar sesión ── */
  _clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    Store.set('user', null);
    Store.set('isAuthenticated', false);
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
  },

  /* ── Programar refresh automático ── */
  _scheduleRefresh(token) {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const msUntilExpiry = payload.exp * 1000 - Date.now();
      // Refrescar 2 minutos antes de expirar
      const delay = Math.max(msUntilExpiry - 120_000, 30_000);
      this._refreshTimer = setTimeout(() => this.refresh(), delay);
    } catch { /* no schedule */ }
  },

  /* ── Verificar acceso a ruta (guarda de navegación) ── */
  requireAuth() {
    if (!this.isAuthenticated()) {
      sessionStorage.setItem('mc_redirect', window.location.pathname);
      window.location.href = '/index.html';
      return false;
    }
    return true;
  },

  /* ── Verificar rol mínimo ── */
  hasRole(...roles) {
    const user = this.getUser();
    if (!user) return false;
    return roles.includes(user.role);
  },

  /* ── Verificar permiso específico ── */
  can(permission) {
    const user = this.getUser();
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    return user.permissions?.includes(permission) ?? false;
  },

  /* ── Redirect post-login ── */
  redirectAfterLogin(user) {
    const saved = sessionStorage.getItem('mc_redirect');
    sessionStorage.removeItem('mc_redirect');

    // Redirigir según rol
    const roleRoutes = {
      superadmin:        '/pages/superadmin/tenants.html',
      hospital_admin:    '/pages/dashboard.html',
      medical_director:  '/pages/dashboard.html',
      doctor:            '/pages/dashboard.html',
      nurse:             '/pages/dashboard.html',
      receptionist:      '/pages/appointments/index.html',
      records_admin:     '/pages/records/index.html',
      patient_admin:     '/pages/patients/index.html',
      lab_technician:    '/pages/lab/index.html',
      pharmacist:        '/pages/pharmacy/index.html',
      patient:           '/pages/patient-portal/index.html',
    };

    const dest = saved || roleRoutes[user.role] || '/pages/dashboard.html';
    window.location.href = dest;
  },
};
