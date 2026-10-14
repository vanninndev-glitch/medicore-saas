/**
 * MediCore SaaS — socket.js
 * Cliente Socket.IO: tiempo real por hospital, salas, eventos clínicos
 */

import { Store } from './store.js';
import { Auth }  from './auth.js';

const SOCKET_URL = window.MEDICORE_SOCKET_URL || 'http://localhost:3000';

export class SocketClient {
  constructor() {
    this.socket      = null;
    this.connected   = false;
    this.handlers    = {};
    this._listeners  = [];
    this.user        = Auth.getUser();
  }

  /* ── Conectar ── */
  connect() {
    if (typeof io === 'undefined') {
      console.warn('[MediCore Socket] Socket.IO no cargado');
      return;
    }

    const token = Auth.getToken();
    if (!token) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    this._bindCoreEvents();
    this._bindBusinessEvents();
  }

  /* ── Eventos de conexión ── */
  _bindCoreEvents() {
    this.socket.on('connect', () => {
      this.connected = true;
      console.info('[MediCore Socket] Conectado:', this.socket.id);
      Store.set('socketConnected', true);

      // Unirse a sala del hospital
      if (this.user?.hospitalId) {
        this.socket.emit('join:hospital', { hospitalId: this.user.hospitalId });
      }
      // Unirse a sala personal
      if (this.user?.id) {
        this.socket.emit('join:user', { userId: this.user.id });
      }

      this._updateStatusIndicator(true);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      Store.set('socketConnected', false);
      this._updateStatusIndicator(false);
      console.warn('[MediCore Socket] Desconectado:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[MediCore Socket] Error de conexión:', err.message);
      Store.set('socketConnected', false);
    });

    this.socket.on('reconnect', (attempt) => {
      console.info('[MediCore Socket] Reconectado en intento', attempt);
    });
  }

  /* ── Eventos de negocio ── */
  _bindBusinessEvents() {

    /* ── Notificaciones ── */
    this.socket.on('notification:new', (notif) => {
      Store.addNotification(notif);
      this._emit('notification:new', notif);
    });

    /* ── Citas ── */
    this.socket.on('appointment:created', (data) => {
      Store.merge('appointments', { lastUpdate: Date.now() });
      this._emit('appointment:created', data);
    });

    this.socket.on('appointment:updated', (data) => {
      this._emit('appointment:updated', data);
    });

    this.socket.on('appointment:cancelled', (data) => {
      this._emit('appointment:cancelled', data);
    });

    /* ── Urgencias ── */
    this.socket.on('urgency:new', (data) => {
      Store.set('urgencyCount', (Store.get('urgencyCount') || 0) + 1);
      this._emit('urgency:new', data);
    });

    this.socket.on('urgency:updated', (data) => {
      this._emit('urgency:updated', data);
    });

    /* ── Camas ── */
    this.socket.on('bed:status_changed', (data) => {
      this._emit('bed:status_changed', data);
    });

    this.socket.on('bed:assigned', (data) => {
      this._emit('bed:assigned', data);
    });

    /* ── Laboratorio ── */
    this.socket.on('lab:result_ready', (data) => {
      Store.addNotification({
        type: 'lab',
        message: `Resultado de laboratorio listo para ${data.patientName}`,
        createdAt: new Date().toISOString(),
        read: false,
      });
      this._emit('lab:result_ready', data);
    });

    /* ── Historial clínico ── */
    this.socket.on('record:updated', (data) => {
      this._emit('record:updated', data);
    });

    /* ── Alertas clínicas ── */
    this.socket.on('alert:clinical', (data) => {
      Store.addNotification({
        type: 'urgency',
        message: `Alerta clínica: ${data.message}`,
        createdAt: new Date().toISOString(),
        read: false,
      });
      this._emit('alert:clinical', data);
    });

    /* ── Chat interno ── */
    this.socket.on('chat:message', (data) => {
      this._emit('chat:message', data);
    });

    /* ── Sistema ── */
    this.socket.on('system:maintenance', (data) => {
      this._emit('system:maintenance', data);
    });
  }

  /* ── API pública de suscripción ── */
  on(event, callback) {
    if (!this.handlers[event]) this.handlers[event] = new Set();
    this.handlers[event].add(callback);
    return () => this.handlers[event]?.delete(callback);
  }

  off(event, callback) {
    this.handlers[event]?.delete(callback);
  }

  _emit(event, data) {
    this.handlers[event]?.forEach(cb => {
      try { cb(data); } catch (e) { console.error('[Socket handler]', e); }
    });
  }

  /* ── Emitir eventos al servidor ── */
  emit(event, data) {
    if (!this.connected || !this.socket) return;
    this.socket.emit(event, data);
  }

  /* ── Unirse a una sala específica ── */
  joinRoom(room) {
    this.emit('join:room', { room });
  }

  leaveRoom(room) {
    this.emit('leave:room', { room });
  }

  /* ── Indicador de estado en topbar ── */
  _updateStatusIndicator(online) {
    const indicator = document.getElementById('system-status');
    if (!indicator) return;

    indicator.innerHTML = online
      ? `<div class="dot dot-green"></div><span>Sistema activo</span>`
      : `<div class="dot dot-red"></div><span>Sin conexión</span>`;

    indicator.style.background = online
      ? 'rgba(0,229,160,0.08)'
      : 'rgba(255,71,87,0.08)';
    indicator.style.borderColor = online
      ? 'rgba(0,229,160,0.15)'
      : 'rgba(255,71,87,0.15)';
    indicator.style.color = online
      ? 'var(--accent-green)'
      : 'var(--accent-red)';
  }

  /* ── Desconectar limpiamente ── */
  disconnect() {
    this.socket?.disconnect();
    this.socket    = null;
    this.connected = false;
    this.handlers  = {};
  }
}

/* Singleton global */
export const socketClient = new SocketClient();
