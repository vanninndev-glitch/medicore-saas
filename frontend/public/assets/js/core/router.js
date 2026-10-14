/**
 * MediCore SaaS — router.js
 * SPA client-side router: historia, parámetros, guards de navegación
 */

import { Auth } from './auth.js';

/* ── Mapa de rutas con guards ── */
const ROUTES = {
  '/':                              { redirect: '/pages/dashboard.html' },
  '/index.html':                    { public: true },
  '/pages/dashboard.html':          { roles: ['superadmin','hospital_admin','medical_director','doctor','nurse','receptionist','records_admin','patient_admin','lab_technician','pharmacist'] },
  '/pages/patients/index.html':     { roles: ['superadmin','hospital_admin','medical_director','doctor','nurse','records_admin','patient_admin'] },
  '/pages/patients/register.html':  { roles: ['superadmin','hospital_admin','receptionist','patient_admin'] },
  '/pages/records/index.html':      { roles: ['superadmin','hospital_admin','medical_director','doctor','nurse','records_admin'] },
  '/pages/appointments/index.html': { roles: ['superadmin','hospital_admin','doctor','nurse','receptionist'] },
  '/pages/lab/index.html':          { roles: ['superadmin','hospital_admin','medical_director','doctor','lab_technician'] },
  '/pages/pharmacy/index.html':     { roles: ['superadmin','hospital_admin','pharmacist','doctor'] },
  '/pages/billing/index.html':      { roles: ['superadmin','hospital_admin','receptionist'] },
  '/pages/reports/index.html':      { roles: ['superadmin','hospital_admin','medical_director','doctor'] },
  '/pages/superadmin/tenants.html': { roles: ['superadmin'] },
  '/pages/patient-portal/index.html': { roles: ['patient'] },
};

export const Router = {

  /* ── Inicializar ── */
  init() {
    this._checkCurrentRoute();
    window.addEventListener('popstate', () => this._checkCurrentRoute());
  },

  /* ── Verificar ruta actual ── */
  _checkCurrentRoute() {
    const path = window.location.pathname;
    const route = ROUTES[path];

    if (!route) return; // Ruta no registrada, dejar pasar

    // Redirect
    if (route.redirect) {
      window.location.replace(route.redirect);
      return;
    }

    // Ruta pública
    if (route.public) return;

    // Verificar autenticación
    if (!Auth.isAuthenticated()) {
      sessionStorage.setItem('mc_redirect', path + window.location.search);
      window.location.href = '/index.html';
      return;
    }

    // Verificar rol
    if (route.roles) {
      const user = Auth.getUser();
      if (!route.roles.includes(user?.role)) {
        window.location.href = '/pages/403.html';
        return;
      }
    }
  },

  /* ── Navegar a una ruta ── */
  navigate(path, params = {}) {
    const url = new URL(path, window.location.origin);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    window.history.pushState({}, '', url.toString());
    this._checkCurrentRoute();
  },

  /* ── Obtener parámetros de la URL actual ── */
  getParams() {
    const params = {};
    new URLSearchParams(window.location.search).forEach((v, k) => {
      params[k] = v;
    });
    return params;
  },

  /* ── Obtener un parámetro específico ── */
  getParam(key, defaultValue = null) {
    return new URLSearchParams(window.location.search).get(key) ?? defaultValue;
  },

  /* ── Volver atrás ── */
  back() {
    window.history.back();
  },

  /* ── Reemplazar ruta sin historial ── */
  replace(path) {
    window.history.replaceState({}, '', path);
    this._checkCurrentRoute();
  },
};
