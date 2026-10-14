/**
 * MediCore SaaS — sockets/index.js
 * Socket.IO: auth JWT, salas por hospital, todos los eventos en tiempo real
 */

'use strict';

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { jwt: jwtCfg, cors: corsCfg } = require('../config/env');
const logger     = require('../utils/logger');
const DB         = require('../config/database');
const Redis      = require('../config/redis');

/* ════════════════════════════════════════
   INICIALIZAR SOCKET.IO
════════════════════════════════════════ */
module.exports = function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin:      corsCfg.origins,
      credentials: true,
    },
    transports:          ['websocket', 'polling'],
    pingTimeout:         20000,
    pingInterval:        10000,
    connectTimeout:      10000,
    maxHttpBufferSize:   1e6, // 1 MB máximo por evento
  });

  /* ── Middleware de autenticación JWT ── */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('No autenticado'));

      // Verificar blacklist
      const isBlacklisted = await Redis.exists(`blacklist:${token}`);
      if (isBlacklisted) return next(new Error('Token revocado'));

      const payload = jwt.verify(token, jwtCfg.secret);

      const user = await DB.queryOne(
        'SELECT id, name, role, hospital_id FROM users WHERE id = $1 AND status = $2',
        [payload.sub, 'active']
      );

      if (!user) return next(new Error('Usuario no encontrado'));

      socket.user      = user;
      socket.userId    = user.id;
      socket.userRole  = user.role;
      socket.hospitalId= user.hospital_id;

      next();
    } catch (err) {
      logger.warn('[Socket] Auth fallida:', err.message);
      next(new Error('Token inválido'));
    }
  });

  /* ════════════════════════════════════════
     EVENTOS DE CONEXIÓN
  ════════════════════════════════════════ */
  io.on('connection', async (socket) => {
    const { userId, userRole, hospitalId } = socket;

    logger.info(`[Socket] Usuario conectado: ${userId} (${userRole}) socket: ${socket.id}`);

    /* ── Unirse a sala del hospital ── */
    socket.on('join:hospital', async ({ hospitalId: hId }) => {
      const targetHospital = hId || hospitalId;
      if (!targetHospital) return;

      // Superadmin puede unirse a cualquier sala
      if (userRole === 'superadmin' || targetHospital === hospitalId) {
        await socket.join(`hospital:${targetHospital}`);
        logger.debug(`[Socket] ${userId} unido a hospital:${targetHospital}`);
        socket.emit('joined:hospital', { hospitalId: targetHospital });
      }
    });

    /* ── Unirse a sala personal ── */
    socket.on('join:user', ({ userId: uid }) => {
      if (uid === userId || userRole === 'superadmin') {
        socket.join(`user:${uid}`);
        logger.debug(`[Socket] ${userId} unido a user:${uid}`);
      }
    });

    /* ── Sala de rol (doctor, nurse, etc.) ── */
    if (hospitalId) {
      socket.join(`hospital:${hospitalId}:role:${userRole}`);
    }

    /* ── Unirse a sala de urgencias ── */
    socket.on('join:room', ({ room }) => {
      const allowedRooms = ['urgencies', 'beds', 'lab', 'pharmacy', 'dashboard'];
      if (allowedRooms.some(r => room.includes(r))) {
        socket.join(`${hospitalId}:${room}`);
      }
    });

    socket.on('leave:room', ({ room }) => {
      socket.leave(`${hospitalId}:${room}`);
    });

    /* ════════════════════════════════════════
       EVENTOS DE NEGOCIO (cliente → servidor)
    ════════════════════════════════════════ */

    /* ── Cita creada ── */
    socket.on('appointment:created', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}`).emit('appointment:created', {
        ...data, emittedBy: userId, timestamp: new Date().toISOString(),
      });
    });

    /* ── Cita actualizada ── */
    socket.on('appointment:updated', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}`).emit('appointment:updated', data);
    });

    /* ── Cita cancelada ── */
    socket.on('appointment:cancelled', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}`).emit('appointment:cancelled', data);
    });

    /* ── Nueva urgencia ── */
    socket.on('urgency:new', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}`).emit('urgency:new', {
        ...data, timestamp: new Date().toISOString(),
      });
      // Notificar específicamente a doctores y enfermeros
      io.to(`hospital:${hospitalId}:role:doctor`).emit('alert:clinical', {
        message: `Nueva urgencia triage ${data.triage}: ${data.patientName}`,
        level:   data.triage,
      });
    });

    /* ── Cambio de estado de cama ── */
    socket.on('bed:status_changed', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}`).emit('bed:status_changed', data);
    });

    /* ── Resultado de laboratorio listo ── */
    socket.on('lab:result_ready', (data) => {
      if (!hospitalId) return;
      // Notificar al médico solicitante
      if (data.doctorId) {
        io.to(`user:${data.doctorId}`).emit('lab:result_ready', data);
      }
      io.to(`hospital:${hospitalId}`).emit('lab:result_ready', data);
    });

    /* ── Orden de laboratorio creada ── */
    socket.on('lab:order_created', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}:role:lab_technician`).emit('lab:order_created', {
        ...data, timestamp: new Date().toISOString(),
      });
    });

    /* ── Dispensación de farmacia ── */
    socket.on('pharmacy:dispensed', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}:role:pharmacist`).emit('pharmacy:dispensed', data);
    });

    /* ── Alerta de stock bajo ── */
    socket.on('pharmacy:low_stock', (data) => {
      if (!hospitalId) return;
      io.to(`hospital:${hospitalId}:role:pharmacist`).emit('pharmacy:low_stock', data);
      io.to(`hospital:${hospitalId}:role:hospital_admin`).emit('pharmacy:low_stock', data);
    });

    /* ── Historial clínico actualizado ── */
    socket.on('record:updated', (data) => {
      if (!hospitalId || !data.patientId) return;
      io.to(`hospital:${hospitalId}`).emit('record:updated', {
        ...data, updatedBy: userId,
      });
    });

    /* ── Notificación directa a usuario ── */
    socket.on('notification:send', (data) => {
      if (!data.targetUserId) return;
      io.to(`user:${data.targetUserId}`).emit('notification:new', {
        ...data,
        id:        require('uuid').v4(),
        read:      false,
        createdAt: new Date().toISOString(),
      });
    });

    /* ── Chat interno médico ── */
    socket.on('chat:message', (data) => {
      if (!hospitalId || !data.message?.trim()) return;
      const sanitized = data.message.replace(/<[^>]*>/g, '').slice(0, 1000);
      io.to(`hospital:${hospitalId}`).emit('chat:message', {
        id:        require('uuid').v4(),
        from:      { id: userId, name: socket.user.name, role: userRole },
        message:   sanitized,
        timestamp: new Date().toISOString(),
      });
    });

    /* ── Indicador de escritura (chat) ── */
    socket.on('chat:typing', (data) => {
      if (!hospitalId) return;
      socket.to(`hospital:${hospitalId}`).emit('chat:typing', {
        userId, name: socket.user.name, ...data,
      });
    });

    /* ── Dashboard: solicitar datos en tiempo real ── */
    socket.on('dashboard:subscribe', async () => { throttle('dash:'+hospitalId, ()=>{}, 5000);
      if (!hospitalId) return;
      socket.join(`${hospitalId}:dashboard`);
    });

    socket.on('dashboard:unsubscribe', () => {
      if (!hospitalId) return;
      socket.leave(`${hospitalId}:dashboard`);
    });

    /* ════════════════════════════════════════
       DESCONEXIÓN
    ════════════════════════════════════════ */
    socket.on('disconnect', (reason) => {
      logger.debug(`[Socket] Usuario desconectado: ${userId} — ${reason}`);
    });

    socket.on('error', (err) => {
      logger.error(`[Socket] Error en socket ${socket.id}:`, err);
    });

    /* ── Emitir contador de usuarios online al hospital ── */
    if (hospitalId) {
      const hospitalSockets = await io.in(`hospital:${hospitalId}`).fetchSockets();
      io.to(`hospital:${hospitalId}`).emit('hospital:online_count', {
        count: hospitalSockets.length,
      });
    }
  });

  /* ════════════════════════════════════════
     FUNCIONES UTILITARIAS EXPORTADAS
     (para usar desde controllers)
  ════════════════════════════════════════ */
  io.emitToHospital = (hospitalId, event, data) => {
    io.to(`hospital:${hospitalId}`).emit(event, data);
  };

  io.emitToUser = (userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  io.emitToRole = (hospitalId, role, event, data) => {
    io.to(`hospital:${hospitalId}:role:${role}`).emit(event, data);
  };

  io.broadcastSuperadmin = (event, data) => {
    io.to('hospital:superadmin:role:superadmin').emit(event, data);
  };

  /* ── Exponer io globalmente para los controllers ── */
  global.io = io;

  logger.info('[Socket.IO] ✅ Servidor Socket.IO iniciado');
  return io;
};
