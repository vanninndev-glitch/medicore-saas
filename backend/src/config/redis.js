/**
 * MediCore SaaS — config/redis.js
 * Cliente Redis: caché, sesiones de refresh token, rate limiting
 */

'use strict';

const { redis: cfg } = require('./env');
const logger          = require('../utils/logger');

let client;

const Redis = {
  /* ── Conectar ── */
  async connect() {
    const { createClient } = require('redis');

    client = createClient({
      socket: {
        host:      cfg.host,
        port:      cfg.port,
        tls:       cfg.tls,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('[Redis] Máximo de reintentos alcanzado');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 200, 3000);
        },
      },
      password: cfg.password || undefined,
      database: cfg.db,
    });

    client.on('connect',       () => logger.info(`[Redis] Conectado a ${cfg.host}:${cfg.port}`));
    client.on('error',   (err) => logger.error(`[Redis] Error: ${err.message}`));
    client.on('reconnecting',  () => logger.warn('[Redis] Reconectando…'));

    await client.connect();
    return client;
  },

  /* ── GET ── */
  async get(key) {
    if (!client?.isOpen) return null;
    try {
      const val = await client.get(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  },

  /* ── SET con expiración ── */
  async set(key, value, ttlSeconds = null) {
    if (!client?.isOpen) return;
    const opts = ttlSeconds ? { EX: ttlSeconds } : {};
    await client.set(key, JSON.stringify(value), opts);
  },

  /* ── SET string simple (sin serializar) ── */
  async setRaw(key, value, ttlSeconds = null) {
    if (!client?.isOpen) return;
    const opts = ttlSeconds ? { EX: ttlSeconds } : {};
    await client.set(key, value, opts);
  },

  /* ── GET string simple ── */
  async getRaw(key) {
    if (!client?.isOpen) return null;
    return client.get(key);
  },

  /* ── DELETE ── */
  async del(key) {
    if (!client?.isOpen) return;
    await client.del(key);
  },

  /* ── EXISTS ── */
  async exists(key) {
    if (!client?.isOpen) return false;
    const n = await client.exists(key);
    return n > 0;
  },

  /* ── TTL restante ── */
  async ttl(key) {
    if (!client?.isOpen) return -1;
    return client.ttl(key);
  },

  /* ── INCR con expiración (rate limiting) ── */
  async incr(key, ttlSeconds) {
    if (!client?.isOpen) return 1;
    const val = await client.incr(key);
    if (val === 1 && ttlSeconds) await client.expire(key, ttlSeconds);
    return val;
  },

  /* ── Patron de llaves ── */
  async keys(pattern) {
    if (!client?.isOpen) return [];
    return client.keys(pattern);
  },

  /* ── Flush por patrón ── */
  async delPattern(pattern) {
    if (!client?.isOpen) return;
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(keys);
  },

  /* ── Obtener cliente directo ── */
  getClient() { return client; },

  /* ── Cerrar ── */
  async close() {
    if (!client?.isOpen) return;
    await client.quit();
    logger.info('[Redis] Conexión cerrada');
  },
};

module.exports = Redis;
