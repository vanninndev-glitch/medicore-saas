/**
 * MediCore SaaS — config/env.js
 * Carga y valida variables de entorno al arranque.
 * Si falta una variable crítica, detiene el proceso.
 */

'use strict';

require('dotenv').config();

/* ── Variables requeridas — si falta alguna, crashea limpio ── */
const REQUIRED = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'ENCRYPTION_KEY',
];

const missing = REQUIRED.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`\n[MediCore] ❌ Variables de entorno faltantes:\n  ${missing.join('\n  ')}\n`);
  console.error('Copia .env.example a .env y configura los valores.\n');
  process.exit(1);
}

if (process.env.ENCRYPTION_KEY?.length !== 32) {
  console.error('[MediCore] ❌ ENCRYPTION_KEY debe tener exactamente 32 caracteres.');
  process.exit(1);
}

/* ── Exportar configuración tipada ── */
module.exports = {
  env:     process.env.NODE_ENV || 'development',
  isDev:   process.env.NODE_ENV !== 'production',
  isProd:  process.env.NODE_ENV === 'production',

  server: {
    port:      parseInt(process.env.PORT)      || 3000,
    apiPrefix: process.env.API_PREFIX          || '/api/v1',
  },

  db: {
    type:     process.env.DB_TYPE     || 'postgres',
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT)    || 5432,
    name:     process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    poolMin:  parseInt(process.env.DB_POOL_MIN)|| 2,
    poolMax:  parseInt(process.env.DB_POOL_MAX)|| 20,
    ssl:      process.env.DB_SSL === 'true',
  },

  redis: {
    host:     process.env.REDIS_HOST     || 'localhost',
    port:     parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db:       parseInt(process.env.REDIS_DB)   || 0,
    tls:      process.env.REDIS_TLS === 'true',
  },

  jwt: {
    secret:         process.env.JWT_SECRET,
    expiresIn:      process.env.JWT_EXPIRES_IN         || '15m',
    refreshSecret:  process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),
  },

  storage: {
    type:       process.env.STORAGE_TYPE   || 'minio',
    endpoint:   process.env.MINIO_ENDPOINT || 'localhost',
    port:       parseInt(process.env.MINIO_PORT) || 9000,
    accessKey:  process.env.MINIO_ACCESS_KEY,
    secretKey:  process.env.MINIO_SECRET_KEY,
    bucket:     process.env.MINIO_BUCKET   || 'medicore-docs',
    useSSL:     process.env.MINIO_USE_SSL === 'true',
    localPath:  process.env.UPLOAD_LOCAL_PATH || './uploads',
    maxSizeMB:  parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 25,
  },

  encryption: {
    key:      process.env.ENCRYPTION_KEY,
    ivLength: parseInt(process.env.ENCRYPTION_IV_LENGTH) || 16,
  },

  mail: {
    host:   process.env.MAIL_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user:   process.env.MAIL_USER,
    pass:   process.env.MAIL_PASS,
    from:   process.env.MAIL_FROM   || 'MediCore <noreply@medicore.mx>',
  },

  twilio: {
    sid:   process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from:  process.env.TWILIO_PHONE_FROM,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
    authMax:  parseInt(process.env.RATE_LIMIT_AUTH_MAX)   || 10,
  },

  logging: {
    level:    process.env.LOG_LEVEL      || 'info',
    filePath: process.env.LOG_FILE_PATH  || './logs/medicore.log',
    maxSize:  process.env.LOG_MAX_SIZE   || '20m',
    maxFiles: process.env.LOG_MAX_FILES  || '14d',
  },

  superadmin: {
    email:    process.env.SUPERADMIN_EMAIL    || 'superadmin@medicore.mx',
    password: process.env.SUPERADMIN_PASSWORD || 'Admin123!',
    name:     process.env.SUPERADMIN_NAME     || 'Superadministrador',
  },

  demo: {
    seedData:     process.env.SEED_DEMO_DATA === 'true',
    hospitalName: process.env.DEMO_HOSPITAL_NAME || 'Hospital Demo MediCore',
    hospitalSlug: process.env.DEMO_HOSPITAL_SLUG || 'demo',
  },

  saas: {
    name:         process.env.SAAS_NAME          || 'MediCore',
    domain:       process.env.SAAS_DOMAIN        || 'medicore.mx',
    supportEmail: process.env.SAAS_SUPPORT_EMAIL || 'soporte@medicore.mx',
  },
};
