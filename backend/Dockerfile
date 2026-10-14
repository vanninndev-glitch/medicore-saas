# ============================================================
# MediCore SaaS — Dockerfile
# Multi-stage build: dependencias → producción
# ============================================================

# ── Stage 1: Dependencias ──────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Instalar solo dependencias de producción
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# ── Stage 2: Producción ────────────────────────────────
FROM node:20-alpine AS runner

# Metadatos de la imagen
LABEL maintainer="MediCore SaaS"
LABEL version="1.0.0"
LABEL description="MediCore SaaS — Backend hospitalario multi-tenant"

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache \
    curl \
    tzdata \
    && cp /usr/share/zoneinfo/America/Mexico_City /etc/localtime \
    && echo "America/Mexico_City" > /etc/timezone \
    && apk del tzdata

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S medicore \
    && adduser  -u 1001 -S medicore -G medicore

# Copiar dependencias del stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=medicore:medicore . .

# Crear directorios necesarios
RUN mkdir -p logs uploads \
    && chown -R medicore:medicore logs uploads

# Cambiar a usuario no-root
USER medicore

# Variables de entorno de producción
ENV NODE_ENV=production
ENV PORT=3000

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Script de inicio: migraciones → seeds opcionales → servidor
CMD ["sh", "-c", "\
    echo '[ MediCore ] Aplicando migraciones...' && \
    node src/database/migrate.js && \
    if [ \"$SEED_DEMO_DATA\" = 'true' ]; then \
        echo '[ MediCore ] Cargando datos demo...' && \
        node src/database/seeds/index.js || true; \
    fi && \
    echo '[ MediCore ] Iniciando servidor...' && \
    node server.js \
"]
