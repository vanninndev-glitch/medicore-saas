/**
 * MediCore SaaS — server.js
 * Entry point: inicializa DB, Redis, Socket.IO y el servidor HTTP
 * con graceful shutdown y manejo de señales del OS.
 */

'use strict';

const http   = require('http');
const app    = require('./src/app');
const DB     = require('./src/config/database');
const Redis  = require('./src/config/redis');
const logger = require('./src/utils/logger');
const { server: srvCfg } = require('./src/config/env');

let server;

/* ════════════════════════════════════════
   INICIALIZACIÓN
════════════════════════════════════════ */
async function start() {
  try {
    logger.info('╔══════════════════════════════════════╗');
    logger.info('║   MediCore SaaS — Iniciando...       ║');
    logger.info('╚══════════════════════════════════════╝');

    /* 1. Conectar a la base de datos */
    logger.info('[Boot] Conectando a base de datos…');
    await DB.connect();

    /* 2. Conectar a Redis */
    logger.info('[Boot] Conectando a Redis…');
    try {
      await Redis.connect();
    } catch (err) {
      logger.warn('[Boot] Redis no disponible, continuando sin caché:', err.message);
    }

    /* 3. Crear servidor HTTP */
    server = http.createServer(app);

    /* 4. Inicializar Socket.IO */
    logger.info('[Boot] Iniciando Socket.IO…');
    const initSockets = require('./src/sockets/index');
    initSockets(server);

    /* 5. Levantar servidor */
    server.listen(srvCfg.port, () => {
      logger.info(`[Boot] ✅ Servidor corriendo en puerto ${srvCfg.port}`);
      logger.info(`[Boot] 🔗 API: http://localhost:${srvCfg.port}${srvCfg.apiPrefix}`);
      logger.info(`[Boot] 🏥 Health: http://localhost:${srvCfg.port}/health`);
      logger.info(`[Boot] Entorno: ${process.env.NODE_ENV || 'development'}`);
    });

    /* 6. Manejo de errores del servidor HTTP */
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`[Boot] Puerto ${srvCfg.port} ya está en uso.`);
        process.exit(1);
      }
      logger.error('[Boot] Error del servidor HTTP:', err);
    });

  } catch (err) {
    logger.error('[Boot] Error fatal al inicializar:', err);
    process.exit(1);
  }
}

/* ════════════════════════════════════════
   GRACEFUL SHUTDOWN
════════════════════════════════════════ */
async function shutdown(signal) {
  logger.info(`\n[Shutdown] Señal ${signal} recibida. Cerrando graciosamente…`);

  /* Dejar de aceptar nuevas conexiones */
  server?.close(async () => {
    logger.info('[Shutdown] Servidor HTTP cerrado.');

    try {
      await DB.close();
      logger.info('[Shutdown] Base de datos cerrada.');
    } catch (err) {
      logger.error('[Shutdown] Error cerrando DB:', err);
    }

    try {
      await Redis.close();
      logger.info('[Shutdown] Redis cerrado.');
    } catch (err) {
      logger.error('[Shutdown] Error cerrando Redis:', err);
    }

    logger.info('[Shutdown] ✅ MediCore SaaS detenido limpiamente.');
    process.exit(0);
  });

  /* Forzar cierre después de 15 segundos */
  setTimeout(() => {
    logger.error('[Shutdown] Tiempo de cierre agotado. Forzando salida.');
    process.exit(1);
  }, 15000);
}

/* ── Señales del sistema operativo ── */
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

/* ── Excepciones no capturadas ── */
process.on('uncaughtException', (err) => {
  logger.error('[Process] uncaughtException:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Process] unhandledRejection:', reason);
  // No cerrar por unhandledRejection — solo loguear
});

/* ── Iniciar ── */
start();
