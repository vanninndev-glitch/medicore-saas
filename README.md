# MediCore SaaS 🏥
> Sistema de Gestión Hospitalaria Multi-tenant · Producción-ready · NOM-024 · HL7 FHIR

[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-blue)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-black)](https://socket.io)
[![License](https://img.shields.io/badge/License-UNLICENSED-red)]()

---

## 📋 Descripción

MediCore SaaS es un sistema hospitalario completo **multi-tenant** diseñado para operar múltiples hospitales desde una sola instancia. Incluye **28 módulos clínicos**, **25 roles de usuario**, **21 especialidades médicas** y cumplimiento con normativas mexicanas (NOM-024, NOM-004, CFDI 4.0).

---

## ✨ Características principales

| Módulo | Descripción |
|--------|-------------|
| 🏥 Historial Clínico (HCE) | Notas SOAP, ICD-10, antecedentes, signos vitales |
| 📅 Citas | Calendario 3 vistas, slots automáticos, Socket.IO |
| 🧪 Laboratorio (LIS) | Solicitudes, resultados, valores de referencia, DICOM |
| 💊 Farmacia | Recetas, dispensación, inventario, controlados |
| 📋 Incapacidades | ST-7/ST-9, folio único, QR verificable, PDF |
| 🏨 Gestión de Camas | Mapa en tiempo real, 5 estados, UCI, NICU |
| 🚨 Urgencias | Triaje Manchester/ESI, cola tiempo real |
| 💰 Facturación | CFDI 4.0, seguros médicos, pagos parciales |
| 📊 Reportes | Dashboard ejecutivo, KPIs, exportación PDF/CSV |
| 🔒 Documentos | Subida cifrada AES-256, MinIO, descarga segura |
| 🌐 Telemedicina | Video, chat médico, receta electrónica |
| 🔧 Plugin System | Módulos por hospital, campos personalizados |

---

## 🚀 Instalación rápida

### Prerequisitos

- **Node.js** 20 LTS o superior
- **PostgreSQL** 14+ o **MySQL** 8+
- **Redis** 7+
- **MinIO** (opcional, o configurar almacenamiento local)
- **Docker** + **docker-compose** (recomendado)

---

### Opción A — Docker (Recomendado)

```bash
# 1. Clonar o descomprimir el proyecto
cd medicore

# 2. Copiar y configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus valores

# 3. Levantar todos los servicios
docker-compose up -d

# 4. Verificar que todo está corriendo
docker-compose ps
docker-compose logs -f app

# 5. Abrir el sistema
# Frontend: http://localhost
# API:      http://localhost:3000/api/v1
# Health:   http://localhost:3000/health
# MinIO UI: http://localhost:9001
```

---

### Opción B — Instalación manual

```bash
# 1. Backend
cd medicore/backend
npm install
cp .env.example .env
# Editar .env con tus valores de DB, Redis, etc.

# 2. Aplicar migraciones
node src/database/migrate.js

# 3. Cargar datos demo (opcional)
SEED_DEMO_DATA=true node src/database/seeds/index.js

# 4. Iniciar servidor de desarrollo
npm run dev

# 5. Producción con PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## ⚙️ Configuración de variables de entorno

Copia `.env.example` a `.env` y configura:

```env
# Base de datos (PostgreSQL recomendado)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medicore
DB_USER=medicore_user
DB_PASSWORD=TuPasswordSegura123!

# JWT — Genera secretos aleatorios de 64+ caracteres
JWT_SECRET=tu_secreto_jwt_64_caracteres_min
JWT_REFRESH_SECRET=tu_secreto_refresh_64_caracteres_min

# Cifrado AES-256 para documentos — EXACTAMENTE 32 caracteres
ENCRYPTION_KEY=32CharactersExactForAES256Key!!x

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO / almacenamiento
STORAGE_TYPE=minio
MINIO_ENDPOINT=localhost
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

> ⚠️ **Importante**: Nunca commitear el archivo `.env` al repositorio.

---

## 🔐 Seguridad

MediCore implementa múltiples capas de seguridad:

| Capa | Implementación |
|------|---------------|
| Autenticación | JWT (access 15min + refresh 7d con rotación) |
| Autorización | RBAC — 25 roles con permisos granulares |
| Multi-tenant | `hospital_id` en cada query + middleware tenant |
| Cifrado datos | AES-256-GCM para todos los documentos médicos |
| Transporte | HTTPS/TLS obligatorio en producción |
| Headers HTTP | Helmet.js con CSP, HSTS, X-Frame-Options |
| Rate limiting | express-rate-limit con Redis, por IP y usuario |
| Sanitización | XSS, SQLi, inyecciones detectadas y bloqueadas |
| Contraseñas | bcrypt con salt rounds 12 |
| Audit log | Toda acción sensible registrada con IP y timestamp |
| Blacklist JWT | Tokens revocados almacenados en Redis |
| RLS PostgreSQL | Row-Level Security en tablas sensibles |

---

## 📁 Estructura del proyecto

```
medicore/
├── frontend/public/          # Frontend estático
│   ├── assets/
│   │   ├── css/              # Tailwind + CSS custom
│   │   └── js/
│   │       ├── core/         # auth, api, store, socket, router, utils
│   │       ├── components/   # sidebar, topbar, toast, modal
│   │       ├── pages/        # módulos por página
│   │       └── three/        # escenas Three.js
│   ├── pages/                # HTML por módulo
│   └── demo/                 # Demo pública
│
├── backend/
│   ├── src/
│   │   ├── config/           # DB, Redis, env
│   │   ├── middlewares/      # auth, RBAC, rate limit, sanitize, audit
│   │   ├── modules/          # 16 módulos (auth, patients, records...)
│   │   ├── sockets/          # Socket.IO eventos en tiempo real
│   │   ├── services/         # PDF, email, storage, encryption
│   │   ├── database/
│   │   │   ├── migrations/   # SQL schemas
│   │   │   └── seeds/        # Datos demo
│   │   └── utils/            # logger, response, pagination
│   ├── server.js             # Entry point
│   ├── Dockerfile
│   └── ecosystem.config.js   # PM2
│
├── nginx/
│   └── nginx.conf            # Reverse proxy + SSL
├── docker-compose.yml
└── README.md
```

---

## 🗄️ Base de datos

### Tablas principales (11 grupos)

| Grupo | Tablas |
|-------|--------|
| Tenants | `hospitals` |
| Usuarios | `users`, `doctor_schedules` |
| Pacientes | `patients`, `emergency_contacts`, `patient_alerts`, `patient_antecedents` |
| HCE | `clinical_records`, `vital_signs` |
| Citas | `appointments` |
| Documentos | `documents`, `document_access_log` |
| Incapacidades | `disabilities` |
| Laboratorio | `lab_orders`, `lab_reference_values` |
| Farmacia | `prescriptions`, `pharmacy_inventory`, `inventory_movements` |
| Facturación | `invoices`, `payments`, `hospital_beds`, `hospitalizations`, `urgencies` |
| Sistema | `notifications`, `audit_logs` |

### Aplicar migraciones

```bash
# Manual
node src/database/migrate.js

# Con Docker
docker-compose exec app node src/database/migrate.js
```

---

## 🔌 API Reference

### Base URL
```
https://tu-dominio.com/api/v1
```

### Autenticación
```http
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

### Endpoints principales

```http
# Pacientes
GET    /patients              ?search=&status=&area=&page=&limit=
POST   /patients
GET    /patients/:id
PUT    /patients/:id
GET    /patients/search        ?q=&limit=
GET    /patients/:id/appointments
GET    /patients/:id/documents

# Historial Clínico
GET    /records               ?patientId=&doctorId=&specialty=
POST   /records
GET    /records/:id
PUT    /records/:id

# Citas
GET    /appointments           ?start=&end=&doctorId=&status=
POST   /appointments
GET    /appointments/slots     ?doctorId=&date=&duration=
PATCH  /appointments/:id/status

# Documentos
GET    /documents
POST   /documents/upload       (multipart/form-data)
GET    /documents/:id/download
DELETE /documents/:id

# Incapacidades
GET    /disabilities
POST   /disabilities/generate
GET    /disabilities/:id/pdf
GET    /disabilities/verify/:folio  (público)

# Laboratorio
GET    /lab/orders
POST   /lab/orders
PUT    /lab/results/:id

# Farmacia
GET    /pharmacy/prescriptions
POST   /pharmacy/prescriptions/:id/dispense
GET    /pharmacy/inventory
PATCH  /pharmacy/inventory/:id

# Reportes
GET    /reports/dashboard
GET    /reports/executive      ?range=week|month|quarter|year
GET    /reports/export         ?type=patients|appointments|billing
GET    /reports/productivity

# Búsqueda global
GET    /search                 ?q=&limit=
GET    /search/patients        ?q=
GET    /search/doctors         ?q=&specialty=

# Hospital (admin)
GET    /hospitals/config
PUT    /hospitals/config
PUT    /hospitals/modules
GET    /hospitals/users
POST   /hospitals/users

# Superadmin
GET    /superadmin/metrics
GET    /superadmin/hospitals
POST   /superadmin/hospitals
PUT    /superadmin/hospitals/:id
PUT    /superadmin/hospitals/:id/modules
GET    /superadmin/audit-log
```

### Headers requeridos

```http
Authorization: Bearer <access_token>
X-Hospital-ID: <hospital_uuid>
Content-Type: application/json
```

---

## 🔄 WebSocket (Socket.IO)

### Conexión
```javascript
const socket = io('https://tu-dominio.com', {
  auth: { token: 'jwt_access_token' }
});
```

### Eventos del servidor → cliente

| Evento | Descripción |
|--------|-------------|
| `appointment:created` | Nueva cita agendada |
| `appointment:updated` | Cita actualizada |
| `appointment:cancelled` | Cita cancelada |
| `urgency:new` | Nueva urgencia admitida |
| `bed:status_changed` | Cambio de estado de cama |
| `lab:result_ready` | Resultado de lab disponible |
| `notification:new` | Notificación push |
| `pharmacy:low_stock` | Alerta de stock bajo |
| `record:updated` | Historial clínico modificado |

### Salas (rooms)
- `hospital:{id}` — Todos los usuarios del hospital
- `user:{id}` — Notificaciones personales
- `hospital:{id}:role:{rol}` — Por rol específico

---

## 👥 Credenciales demo

```
superadmin@medicore.demo   → Superadmin SaaS
admin@medicore.demo        → Admin Hospital
director@medicore.demo     → Director Médico
doctor@medicore.demo       → Dr. Carlos Rodríguez
doctor2@medicore.demo      → Dra. Ana Martínez
enfermera@medicore.demo    → Enf. Patricia Romero
recepcion@medicore.demo    → Recepcionista
laboratorio@medicore.demo  → Técnico Lab
farmacia@medicore.demo     → Farmacéutico
paciente@medicore.demo     → Portal paciente

Password universal: Demo2024!
```

---

## 📊 Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `superadmin` | Gestión global del SaaS (todos los tenants) |
| `hospital_admin` | Configura su hospital: usuarios, módulos |
| `medical_director` | Supervisión clínica, reportes ejecutivos |
| `doctor` | HCE, citas, recetas, incapacidades |
| `nurse` | Signos vitales, medicación, notas |
| `receptionist` | Citas, admisiones, datos básicos |
| `records_admin` | Expedientes, auditoría documental |
| `patient_admin` | Alta/baja/traslado de pacientes |
| `lab_technician` | Solicitudes y resultados de laboratorio |
| `pharmacist` | Recetas, dispensación, inventario |
| `patient` | Portal propio: citas, docs, historial |

---

## 🏗️ Escalabilidad

### Multi-tenant
- Aislamiento por `hospital_id` en todas las queries
- Módulos activables/desactivables por hospital (plugin system)
- Campos personalizados por hospital
- Webhooks configurables por hospital

### Producción
- PM2 en modo cluster (un proceso por CPU)
- PostgreSQL con pool de conexiones
- Redis para caché, sesiones y rate limiting
- MinIO para almacenamiento distribuido de documentos
- Nginx como reverse proxy con rate limiting

---

## 📋 Normativas

| Normativa | Estado |
|-----------|--------|
| NOM-024-SSA3-2012 | ✅ Diseño alineado |
| NOM-004-SSA3-2012 | ✅ Retención 5 años |
| CFDI 4.0 (SAT) | ✅ Facturación electrónica |
| HL7 / FHIR | ✅ Adaptadores disponibles |
| COFEPRIS | ✅ Control de medicamentos |
| AES-256 | ✅ Cifrado de documentos |

> La **certificación SIRES** ante la DGIS requiere trámite adicional como empresa.

---

## 🐛 Soporte

- **Email**: soporte@medicore.mx
- **Documentación**: https://docs.medicore.mx
- **Issues**: Reportar en el repositorio del proyecto

---

## 📄 Licencia

UNLICENSED — Uso comercial restringido.  
© 2024 MediCore SaaS — Todos los derechos reservados.
