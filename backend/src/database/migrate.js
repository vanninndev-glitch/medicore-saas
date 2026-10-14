/**
 * MediCore SaaS — database/migrate.js
 * CORREGIDO: Ejecuta el SQL completo en una sola transacción
 * usando el cliente directo de pg (no el query splitter)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs').promises;
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('[Migrate] Iniciando migraciones…');

  const { Pool } = require('pg');
  const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  console.log(`[Migrate] Conectado a PostgreSQL en ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  try {
    /* Crear tabla de control de migraciones */
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (!files.length) {
      console.warn('[Migrate] No se encontraron archivos SQL');
      return;
    }

    let applied = 0;

    for (const file of files) {
      const already = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1', [file]
      );

      if (already.rows.length > 0) {
        console.log(`[Migrate] SKIP ${file} (ya aplicada)`);
        continue;
      }

      console.log(`[Migrate] Aplicando ${file}…`);

      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

      /* Ejecutar TODO el archivo en una sola transacción */
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      await client.query(
        'INSERT INTO _migrations (filename) VALUES ($1)', [file]
      );

      console.log(`[Migrate] ✅ ${file} aplicada correctamente`);
      applied++;
    }

    if (applied === 0) {
      console.log('[Migrate] ✅ Base de datos ya actualizada (sin pendientes)');
    } else {
      console.log(`[Migrate] ✅ ${applied} migración(es) aplicada(s)`);
    }

  } catch (err) {
    console.error('[Migrate] ❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error(err.message);
  process.exit(1);
});
