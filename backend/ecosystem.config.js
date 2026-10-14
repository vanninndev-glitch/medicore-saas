/**
 * MediCore SaaS — ecosystem.config.js
 * Configuración de PM2 para producción: clustering, auto-restart, logs
 * Uso: pm2 start ecosystem.config.js --env production
 */

'use strict';

module.exports = {
  apps: [
    {
      /* ── Aplicación principal ── */
      name:           'medicore-api',
      script:         'server.js',
      cwd:            '/app',

      /* ── Clustering ── */
      instances:      'max',     // Un proceso por CPU disponible
      exec_mode:      'cluster', // Modo cluster para multi-core
      wait_ready:     true,
      listen_timeout: 10000,

      /* ── Entorno ── */
      env_production: {
        NODE_ENV:    'production',
        PORT:        3000,
      },
      env_development: {
        NODE_ENV:    'development',
        PORT:        3000,
      },

      /* ── Auto-restart ── */
      watch:           false,     // No en producción
      ignore_watch:    ['node_modules', 'logs', 'uploads'],
      max_restarts:    10,
      min_uptime:      '5s',
      restart_delay:   3000,
      autorestart:     true,

      /* ── Memoria ── */
      max_memory_restart: '512M',

      /* ── Logs ── */
      log_file:       '/app/logs/medicore.log',
      out_file:       '/app/logs/medicore.out.log',
      error_file:     '/app/logs/medicore.error.log',
      log_date_format:'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:     true,
      log_type:       'json',

      /* ── Señales ── */
      kill_timeout:   5000,
      shutdown_with_message: true,

      /* ── Health check ── */
      exp_backoff_restart_delay: 100,
    },
  ],
};
