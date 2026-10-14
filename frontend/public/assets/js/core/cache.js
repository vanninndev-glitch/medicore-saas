/**
 * MediCore SaaS — core/cache.js
 * Caché en memoria del frontend: evita peticiones repetidas al backend
 */
const _store = new Map();

export const Cache = {
  /* TTL por defecto: 60 segundos */
  get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) { _store.delete(key); return null; }
    return entry.data;
  },

  set(key, data, ttlMs = 60000) {
    _store.set(key, { data, expires: Date.now() + ttlMs });
  },

  del(key) { _store.delete(key); },

  clear() { _store.clear(); },
};
