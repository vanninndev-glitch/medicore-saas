import { Cache } from './cache.js';
/**
 * MediCore SaaS — api.js
 * Wrapper de fetch: JWT automático, refresh, manejo de errores centralizado
 */

const BASE_URL = window.MEDICORE_API_URL || 'http://localhost:3000/api/v1';

export const API = {

  /* ── Request base ── */
  async _request(method, endpoint, body = null, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };

    // Agregar JWT salvo en rutas públicas
    if (!opts.public) {
      const token = localStorage.getItem('mc_access_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    // Agregar hospital_id si aplica
    const user = (() => {
      try { return JSON.parse(localStorage.getItem('mc_user')); } catch { return null; }
    })();
    if (user?.hospitalId) headers['X-Hospital-ID'] = user.hospitalId;

    const config = {
      method,
      headers,
      signal: opts.signal,
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      let res = await fetch(`${BASE_URL}${endpoint}`, config);

      // Token expirado → intentar refresh
      if (res.status === 401 && !opts.public && !opts._retried) {
        const refreshed = await this._tryRefresh();
        if (refreshed) {
          const newToken = localStorage.getItem('mc_access_token');
          headers['Authorization'] = `Bearer ${newToken}`;
          res = await fetch(`${BASE_URL}${endpoint}`, { ...config, headers });
        } else {
          // Sesión inválida → logout
          localStorage.clear();
          window.location.href = '/index.html';
          return { success: false, message: 'Sesión expirada' };
        }
      }

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: data.message || `Error ${res.status}`,
          errors:  data.errors || [],
          status:  res.status,
        };
      }

      return { success: true, ...data };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, message: 'Solicitud cancelada', aborted: true };
      }
      console.error('[MediCore API]', err);
      return {
        success: false,
        message: 'Error de conexión. Verifica tu red.',
        networkError: true,
      };
    }
  },

  /* ── Intentar refresh de token ── */
  async _tryRefresh() {
    const refreshToken = localStorage.getItem('mc_refresh_token');
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;
      const data = await res.json();

      if (data.data?.accessToken) {
        localStorage.setItem('mc_access_token', data.data.accessToken);
        return true;
      }
    } catch { /* continúa */ }

    return false;
  },

  /* ── Upload multipart ── */
  async upload(endpoint, formData, opts = {}) {
    const token = localStorage.getItem('mc_access_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const user = (() => {
      try { return JSON.parse(localStorage.getItem('mc_user')); } catch { return null; }
    })();
    if (user?.hospitalId) headers['X-Hospital-ID'] = user.hospitalId;

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
        signal: opts.signal,
      });

      const data = await res.json();
      return res.ok
        ? { success: true, ...data }
        : { success: false, message: data.message || `Error ${res.status}` };

    } catch (err) {
      return { success: false, message: 'Error de conexión al subir archivo.' };
    }
  },

  /* ── Descargar archivo ── */
  async download(endpoint, filename) {
    const token = localStorage.getItem('mc_access_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, { headers });
      if (!res.ok) return { success: false, message: 'Error al descargar' };

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    } catch {
      return { success: false, message: 'Error de conexión al descargar.' };
    }
  },

  /* ── Métodos HTTP ── */
  get(endpoint, opts = {}) {
    if (opts.noCache) return this._request('GET', endpoint, null, opts);
    const cacheKey = 'api:' + endpoint + JSON.stringify(opts.params || '');
    const cached = Cache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    return this._request('GET', endpoint, null, opts).then(res => {
      if (res && res.success) Cache.set(cacheKey, res, opts.ttl || 30000);
      return res;
    });
  },
  post(endpoint, body, opts = {})    { return this._request('POST',   endpoint, body, opts); },
  put(endpoint, body, opts = {})     { return this._request('PUT',    endpoint, body, opts); },
  patch(endpoint, body, opts = {})   { return this._request('PATCH',  endpoint, body, opts); },
  delete(endpoint, opts = {})        { return this._request('DELETE', endpoint, null, opts); },
};
