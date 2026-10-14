/**
 * MediCore SaaS — utils/logger.js
 * Logger centralizado con Winston: consola + archivos rotativos
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json, errors } = format;
const path = require('path');
const fs   = require('fs');

const { logging } = require('../config/env');

/* ── Crear directorio de logs si no existe ── */
const logDir = path.dirname(logging.filePath);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

/* ── Formato para consola (dev) ── */
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta)}` : '';
  const trace   = stack ? `\n${stack}` : '';
  return `${timestamp} [${level}] ${message}${trace}${metaStr}`;
});

/* ── Formato JSON para archivos (prod) ── */
const fileFormat = combine(
  errors({ stack: true }),
  timestamp(),
  json(),
);

const logger = createLogger({
  level: logging.level,
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),

  transports: [
    /* Consola: solo en desarrollo */
    new transports.Console({
      format: combine(colorize(), consoleFormat),
      silent: process.env.NODE_ENV === 'test',
    }),

    /* Archivo de errores */
    new transports.File({
      filename:    logging.filePath.replace('.log', '.error.log'),
      level:       'error',
      format:      fileFormat,
      maxsize:     20 * 1024 * 1024, // 20 MB
      maxFiles:    14,
      tailable:    true,
    }),

    /* Archivo de todos los logs */
    new transports.File({
      filename:    logging.filePath,
      format:      fileFormat,
      maxsize:     20 * 1024 * 1024,
      maxFiles:    14,
      tailable:    true,
    }),
  ],

  exceptionHandlers: [
    new transports.File({
      filename: logging.filePath.replace('.log', '.exceptions.log'),
      format:   fileFormat,
    }),
  ],

  rejectionHandlers: [
    new transports.File({
      filename: logging.filePath.replace('.log', '.rejections.log'),
      format:   fileFormat,
    }),
  ],
});

module.exports = logger;
