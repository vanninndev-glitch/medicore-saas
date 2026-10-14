/**
 * MediCore SaaS — config/database.js
 * Pool de conexión a base de datos (PostgreSQL o MySQL)
 * con manejo de errores, reconexión y logging.
 */

'use strict';

const { db: cfg } = require('./env');
const logger       = require('../utils/logger');

let pool;

/* ════════════════════════════════════════
   POSTGRESQL
════════════════════════════════════════ */
function createPgPool() {
  const { Pool } = require('pg');

  const p = new Pool({
    host:     cfg.host,
    port:     cfg.port,
    database: cfg.name,
    user:     cfg.user,
    password: cfg.password,
    min:      cfg.poolMin,
    max:      cfg.poolMax,
    idleTimeoutMillis:    60000,
    connectionTimeoutMillis: 10000,
    statement_timeout:       30000,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
  });

  p.on('connect', () => {
    logger.debug('[DB] Nueva conexión PostgreSQL establecida');
  });

  p.on('error', (err) => {
    logger.error('[DB] Error en pool PostgreSQL:', err.message);
  });

  return p;
}

/* ════════════════════════════════════════
   MYSQL
════════════════════════════════════════ */
function createMysqlPool() {
  const mysql = require('mysql2/promise');

  const p = mysql.createPool({
    host:               cfg.host,
    port:               cfg.port,
    database:           cfg.name,
    user:               cfg.user,
    password:           cfg.password,
    connectionLimit:    cfg.poolMax,
    waitForConnections: true,
    queueLimit:         0,
    timezone:           'Z',
    charset:            'utf8mb4',
  });

  return p;
}

/* ════════════════════════════════════════
   INTERFACE UNIFICADA
════════════════════════════════════════ */
const DB = {
  /* ── Inicializar pool ── */
  async connect() {
    pool = cfg.type === 'mysql' ? createMysqlPool() : createPgPool();

    // Verificar conexión
    try {
      if (cfg.type === 'postgres') {
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
      } else {
        const [rows] = await pool.execute('SELECT NOW()');
      }
      logger.info(`[DB] Conectado a ${cfg.type.toUpperCase()} en ${cfg.host}:${cfg.port}/${cfg.name}`);
    } catch (err) {
      logger.error(`[DB] No se pudo conectar a la base de datos: ${err.message}`);
      throw err;
    }
  },

  /* ── Ejecutar query parametrizada ── */
  async query(sql, params = []) {
    if (!pool) throw new Error('Base de datos no inicializada');

    try {
      if (cfg.type === 'postgres') {
        // Convertir placeholders $1, $2 (ya en formato pg)
        const result = await pool.query(sql, params);
        return result.rows;
      } else {
        // MySQL usa ? como placeholder
        const pgToMysql = sql.replace(/\$\d+/g, '?');
        const [rows] = await pool.execute(pgToMysql, params);
        return rows;
      }
    } catch (err) {
      logger.error(`[DB] Query error: ${err.message}\nSQL: ${sql}`);
      throw err;
    }
  },

  /* ── Query que devuelve un solo registro ── */
  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  },

  /* ── Transacciones ── */
  async transaction(callback) {
    if (cfg.type === 'postgres') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          query: (sql, params) => client.query(sql, params).then(r => r.rows),
          queryOne: async (sql, params) => {
            const r = await client.query(sql, params);
            return r.rows[0] || null;
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await callback({
          query: async (sql, params) => {
            const pg2mysql = sql.replace(/\$\d+/g, '?');
            const [rows] = await conn.execute(pg2mysql, params);
            return rows;
          },
          queryOne: async (sql, params) => {
            const pg2mysql = sql.replace(/\$\d+/g, '?');
            const [rows] = await conn.execute(pg2mysql, params);
            return rows[0] || null;
          },
        });
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  },

  /* ── Obtener pool directo (para usos avanzados) ── */
  getPool() { return pool; },

  /* ── Cerrar pool ── */
  async close() {
    if (!pool) return;
    if (cfg.type === 'postgres') {
      await pool.end();
    } else {
      await pool.end();
    }
    logger.info('[DB] Pool de conexiones cerrado');
  },
};

module.exports = DB;
