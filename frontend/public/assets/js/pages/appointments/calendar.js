/**
 * MediCore SaaS — appointments/calendar.js
 * Calendario de citas: vista mensual, semanal, diaria, nueva cita, tiempo real
 */

import { API }        from '../../core/api.js';
import { Auth }       from '../../core/auth.js';
import { Toast }      from '../../components/toast.js';
import { DateUtils, Format, debounce } from '../../core/utils.js';

/* ── Colores por especialidad ── */
const SPECIALTY_COLORS = {
  'Medicina General':  { bg: 'rgba(0,212,255,0.25)',   border: '#00d4ff', text: '#00d4ff' },
  'Cardiología':       { bg: 'rgba(255,71,87,0.2)',    border: '#ff4757', text: '#ff4757' },
  'Neurología':        { bg: 'rgba(167,139,250,0.2)',  border: '#a78bfa', text: '#a78bfa' },
  'Pediatría':         { bg: 'rgba(0,229,160,0.2)',    border: '#00e5a0', text: '#00e5a0' },
  'Ginecología':       { bg: 'rgba(255,100,180,0.2)',  border: '#ff64b4', text: '#ff64b4' },
  'Traumatología':     { bg: 'rgba(255,179,71,0.2)',   border: '#ffb347', text: '#ffb347' },
  'Oncología':         { bg: 'rgba(255,128,0,0.2)',    border: '#ff8000', text: '#ff8000' },
  'Endocrinología':    { bg: 'rgba(26,111,255,0.2)',   border: '#1a6fff', text: '#5599ff' },
  'Psiquiatría':       { bg: 'rgba(100,200,255,0.2)',  border: '#64c8ff', text: '#64c8ff' },
  'default':           { bg: 'rgba(0,212,255,0.2)',    border: '#00d4ff', text: '#00d4ff' },
};

/* ── Demo appointments ── */
const generateDemoAppts = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const specialties = Object.keys(SPECIALTY_COLORS).slice(0, -1);
  const doctors = ['Dr. Rodríguez','Dra. Martínez','Dr. López','Dra. García','Dr. Herrera'];
  const patients = ['María García','Carlos Mendoza','Ana Jiménez','Roberto Silva','Lucía Hernández','Fernando Díaz'];
  const statuses = ['confirmed','confirmed','confirmed','waiting','completed','cancelled'];

  return Array.from({ length: 35 }, (_, i) => {
    const day     = (i % 28) + 1;
    const hour    = 8 + (i % 10);
    const min     = i % 2 === 0 ? '00' : '30';
    const spec    = specialties[i % specialties.length];
    const color   = SPECIALTY_COLORS[spec] || SPECIALTY_COLORS.default;
    return {
      id:          `CIT-${String(i + 1).padStart(4,'0')}`,
      patientId:   `PAC-${String(i + 1).padStart(4,'0')}`,
      patientName: patients[i % patients.length],
      doctorName:  doctors[i % doctors.length],
      specialty:   spec,
      date:        new Date(year, month, day, hour, parseInt(min)).toISOString(),
      duration:    30,
      status:      statuses[i % statuses.length],
      type:        i % 3 === 0 ? 'Primera vez' : 'Seguimiento',
      color,
    };
  });
};

/* ══════════════════════════════════════════
   CLASE PRINCIPAL: CALENDARIO
══════════════════════════════════════════ */
export class AppointmentsCalendar {
  constructor() {
    this.user        = Auth.getUser();
    this.view        = localStorage.getItem('mc_cal_view') || 'month'; // month | week | day
    this.current     = new Date();
    this.selected    = new Date();
    this.appointments= [];
    this.loading     = false;
  }

  async init() {
    this._renderShell();
    await this._loadAppointments();
    this._renderCalendar();
    this._renderDayPanel();
    this._bindEvents();
    this._bindSocket();
  }

  /* ── Shell principal ── */
  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Citas y Agenda</div>
          <div class="page-subtitle">Calendario de consultas en tiempo real</div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-secondary btn-sm" id="btn-today">Hoy</button>
          <a href="/pages/appointments/new.html" class="btn btn-primary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Nueva cita
          </a>
        </div>
      </div>

      <div class="calendar-layout">
        <!-- Área principal del calendario -->
        <div>
          <!-- Controles del calendario -->
          <div class="calendar-header">
            <div class="calendar-nav">
              <button class="btn btn-secondary btn-icon btn-sm" id="cal-prev" aria-label="Anterior">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <div class="calendar-title" id="cal-title"></div>
              <button class="btn btn-secondary btn-icon btn-sm" id="cal-next" aria-label="Siguiente">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
            <div class="calendar-view-btns">
              <button class="calendar-view-btn${this.view==='month'?' active':''}" data-view="month">Mes</button>
              <button class="calendar-view-btn${this.view==='week'?' active':''}" data-view="week">Semana</button>
              <button class="calendar-view-btn${this.view==='day'?' active':''}" data-view="day">Día</button>
            </div>
          </div>
          <!-- Contenido del calendario -->
          <div id="calendar-content"></div>
        </div>

        <!-- Panel derecho: día seleccionado -->
        <div class="day-appointments-panel">
          <div class="day-panel-header">
            <div>
              <div class="day-panel-title" id="day-panel-title">Citas del día</div>
              <div class="day-panel-date" id="day-panel-date"></div>
            </div>
            <span class="badge badge-cyan" id="day-count">0</span>
          </div>
          <div class="day-appointments-list" id="day-appointments-list">
            <div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">
              Selecciona un día
            </div>
          </div>
          <div style="padding:0.75rem;border-top:1px solid var(--border-subtle);">
            <a id="btn-new-day-appt" href="/pages/appointments/new.html" class="btn btn-primary btn-sm" style="width:100%;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Agendar en este día
            </a>
          </div>
        </div>
      </div>`;
  }

  /* ── Cargar citas ── */
  async _loadAppointments() {
    const start = this._getViewStart();
    const end   = this._getViewEnd();

    const res = await API.get(`/appointments?start=${start}&end=${end}&limit=200`);
    this.appointments = res.success
      ? (res.data.appointments || [])
      : generateDemoAppts();
  }

  /* ── Renderizar calendario según vista ── */
  _renderCalendar() {
    this._updateTitle();
    if (this.view === 'month') this._renderMonthView();
    else if (this.view === 'week') this._renderWeekView();
    else this._renderDayView();
  }

  _updateTitle() {
    const el = document.getElementById('cal-title');
    if (!el) return;

    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const days   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

    if (this.view === 'month') {
      el.textContent = `${months[this.current.getMonth()]} ${this.current.getFullYear()}`;
    } else if (this.view === 'week') {
      const weekStart = this._getWeekStart(this.current);
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      el.textContent = `${weekStart.getDate()} – ${weekEnd.getDate()} ${months[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    } else {
      el.textContent = `${days[this.current.getDay()]}, ${this.current.getDate()} de ${months[this.current.getMonth()]}`;
    }
  }

  /* ── Vista mensual ── */
  _renderMonthView() {
    const content = document.getElementById('calendar-content');
    if (!content) return;

    const year  = this.current.getFullYear();
    const month = this.current.getMonth();
    const today = new Date();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    let html = `<div class="calendar-grid">`;

    // Headers
    dayNames.forEach(d => {
      html += `<div class="calendar-day-header">${d}</div>`;
    });

    // Celdas del mes anterior
    for (let i = firstDay - 1; i >= 0; i--) {
      const day  = daysInPrevMonth - i;
      const date = new Date(year, month - 1, day);
      html += this._buildMonthCell(date, true);
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const date     = new Date(year, month, d);
      const isToday  = date.toDateString() === today.toDateString();
      const isSelected = date.toDateString() === this.selected.toDateString();
      html += this._buildMonthCell(date, false, isToday, isSelected);
    }

    // Completar última fila con días del mes siguiente
    const totalCells = firstDay + daysInMonth;
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      html += this._buildMonthCell(date, true);
    }

    html += `</div>`;
    content.innerHTML = html;

    // Bind clicks en celdas
    content.querySelectorAll('.calendar-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date;
        if (!dateStr) return;
        this.selected = new Date(dateStr + 'T00:00:00');
        this._renderDayPanel();
        // Actualizar selección visual
        content.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
      });
    });

    // Bind en eventos del calendario
    content.querySelectorAll('.cal-event').forEach(ev => {
      ev.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = ev.dataset.id;
        if (id) this._showAppointmentModal(id);
      });
    });
  }

  _buildMonthCell(date, otherMonth, isToday = false, isSelected = false) {
    const dateStr = date.toISOString().split('T')[0];
    const appts   = this._getAppointmentsForDate(date);
    const maxShow = 3;

    let eventsHtml = appts.slice(0, maxShow).map(a => {
      const color = a.color || SPECIALTY_COLORS.default;
      const time  = new Date(a.date).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      return `
        <span class="cal-event" data-id="${a.id}"
          style="background:${color.bg};color:${color.text};border-left:2px solid ${color.border};">
          ${time} ${a.patientName?.split(' ')[0] || ''}
        </span>`;
    }).join('');

    if (appts.length > maxShow) {
      eventsHtml += `<span class="cal-event-more">+${appts.length - maxShow} más</span>`;
    }

    return `
      <div class="calendar-cell${otherMonth?' other-month':''}${isToday?' today':''}${isSelected?' selected':''}"
           data-date="${dateStr}">
        <div class="cell-day-num">${date.getDate()}</div>
        ${eventsHtml}
      </div>`;
  }

  /* ── Vista semanal ── */
  _renderWeekView() {
    const content   = document.getElementById('calendar-content');
    if (!content) return;

    const weekStart = this._getWeekStart(this.current);
    const days      = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const dayNames  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const today     = new Date();
    const hours     = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 – 19:00

    let html = `<div class="week-grid" style="max-height:600px;overflow-y:auto;">`;

    // Col de horas
    html += `<div class="week-time-col">
      <div style="height:60px;border-bottom:1px solid var(--border-subtle);"></div>
      ${hours.map(h => `<div class="week-time-slot">${String(h).padStart(2,'0')}:00</div>`).join('')}
    </div>`;

    // Columnas de días
    days.forEach((day, di) => {
      const isToday   = day.toDateString() === today.toDateString();
      const dayAppts  = this._getAppointmentsForDate(day);

      html += `<div class="week-day-col">
        <div class="week-day-header">
          <div class="week-day-name">${dayNames[day.getDay()]}</div>
          <div class="week-day-num${isToday?' today':''}">${day.getDate()}</div>
        </div>
        <div style="position:relative;">
          ${hours.map(h => `<div class="week-slot" data-hour="${h}" data-date="${day.toISOString().split('T')[0]}"></div>`).join('')}
          ${dayAppts.map(a => this._buildWeekEvent(a, hours[0])).join('')}
        </div>
      </div>`;
    });

    html += `</div>`;
    content.innerHTML = html;

    // Click en slot vacío → nueva cita
    content.querySelectorAll('.week-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const date = slot.dataset.date;
        const hour = slot.dataset.hour;
        window.location.href = `/pages/appointments/new.html?date=${date}&time=${hour}:00`;
      });
    });

    content.querySelectorAll('.week-event').forEach(ev => {
      ev.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showAppointmentModal(ev.dataset.id);
      });
    });
  }

  _buildWeekEvent(appt, firstHour) {
    const startDt    = new Date(appt.date);
    const startHour  = startDt.getHours() + startDt.getMinutes() / 60;
    const slotHeight = 56; // px por hora
    const top        = (startHour - firstHour) * slotHeight;
    const height     = Math.max((appt.duration || 30) / 60 * slotHeight, 24);
    const color      = appt.color || SPECIALTY_COLORS.default;
    const time       = startDt.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });

    return `
      <div class="week-event" data-id="${appt.id}"
        style="top:${top}px;height:${height}px;background:${color.bg};border-left:2px solid ${color.border};color:${color.text};">
        <div style="font-size:0.65rem;font-weight:700;">${time}</div>
        <div style="font-size:0.65rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${appt.patientName?.split(' ')[0]}</div>
      </div>`;
  }

  /* ── Vista diaria ── */
  _renderDayView() {
    const content = document.getElementById('calendar-content');
    if (!content) return;

    const appts = this._getAppointmentsForDate(this.current);
    const hours = Array.from({ length: 14 }, (_, i) => i + 7);

    let html = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;">
        ${hours.map(h => {
          const hourAppts = appts.filter(a => new Date(a.date).getHours() === h);
          return `
            <div style="display:flex;align-items:stretch;border-bottom:1px solid var(--border-subtle);min-height:60px;">
              <div style="width:60px;padding:0.4rem 0.6rem;font-size:0.72rem;font-family:var(--font-mono);color:var(--text-muted);flex-shrink:0;border-right:1px solid var(--border-subtle);">
                ${String(h).padStart(2,'0')}:00
              </div>
              <div style="flex:1;padding:0.3rem;display:flex;flex-wrap:wrap;gap:0.3rem;cursor:pointer;"
                   onclick="window.location='/pages/appointments/new.html?date=${this.current.toISOString().split('T')[0]}&time=${h}:00'">
                ${hourAppts.map(a => {
                  const color = a.color || SPECIALTY_COLORS.default;
                  const time  = new Date(a.date).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
                  return `
                    <div onclick="event.stopPropagation()" data-id="${a.id}"
                      style="background:${color.bg};border-left:3px solid ${color.border};border-radius:6px;padding:0.35rem 0.6rem;cursor:pointer;flex:1;min-width:160px;transition:opacity 0.15s;"
                      onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                      <div style="font-size:0.75rem;font-weight:700;color:${color.text};">${time} · ${a.specialty}</div>
                      <div style="font-size:0.82rem;color:var(--text-primary);font-weight:600;">${a.patientName}</div>
                      <div style="font-size:0.72rem;color:var(--text-muted);">${a.doctorName} · ${a.type}</div>
                    </div>`;
                }).join('')}
                ${hourAppts.length === 0 ? `<div style="flex:1;"></div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    content.innerHTML = html;
  }

  /* ── Panel del día seleccionado ── */
  _renderDayPanel() {
    const list    = document.getElementById('day-appointments-list');
    const title   = document.getElementById('day-panel-title');
    const dateEl  = document.getElementById('day-panel-date');
    const countEl = document.getElementById('day-count');
    const btnLink = document.getElementById('btn-new-day-appt');

    if (!list) return;

    const appts    = this._getAppointmentsForDate(this.selected);
    const dateStr  = this.selected.toISOString().split('T')[0];
    const months   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    if (title) title.textContent = `${this.selected.getDate()} de ${months[this.selected.getMonth()]}`;
    if (dateEl) dateEl.textContent = `${appts.length} cita(s) programada(s)`;
    if (countEl) countEl.textContent = appts.length;
    if (btnLink) btnLink.href = `/pages/appointments/new.html?date=${dateStr}`;

    if (!appts.length) {
      list.innerHTML = `
        <div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" style="margin:0 auto 0.5rem;opacity:0.3;">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          </svg>
          Sin citas para este día
        </div>`;
      return;
    }

    const statusColor = {
      confirmed:   '#00e5a0', waiting: '#ffb347',
      in_progress: '#00d4ff', completed: '#5599ff', cancelled: '#ff4757',
    };

    list.innerHTML = appts
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(a => {
        const color = a.color || SPECIALTY_COLORS.default;
        const time  = new Date(a.date).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
        const sc    = statusColor[a.status] || '#7ba3c4';
        return `
          <div class="day-appt-item" onclick="window.location='/pages/appointments/view.html?id=${a.id}'">
            <div class="day-appt-time">${time}</div>
            <div class="day-appt-bar" style="background:${color.border};"></div>
            <div class="day-appt-info">
              <div class="day-appt-patient">${a.patientName}</div>
              <div class="day-appt-type">${a.specialty} · ${a.doctorName}</div>
              <div style="margin-top:3px;">
                <span style="font-size:0.68rem;color:${sc};font-weight:600;">
                  ● ${a.status === 'confirmed' ? 'Confirmada' : a.status === 'waiting' ? 'En espera' : a.status === 'in_progress' ? 'En consulta' : a.status === 'completed' ? 'Completada' : 'Cancelada'}
                </span>
              </div>
            </div>
          </div>`;
      }).join('');
  }

  /* ── Modal de detalle de cita ── */
  _showAppointmentModal(id) {
    const appt = this.appointments.find(a => a.id === id);
    if (!appt) return;

    const color  = appt.color || SPECIALTY_COLORS.default;
    const time   = new Date(appt.date).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const date   = DateUtils.format(appt.date);
    const modal  = document.getElementById('modal-container');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)this.parentElement.innerHTML=''">
        <div class="modal" style="max-width:460px;">
          <div class="modal-header">
            <div>
              <h3 style="font-size:1rem;">${appt.patientName}</h3>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${appt.specialty} · ${appt.type}</div>
            </div>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="document.getElementById('modal-container').innerHTML=''">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${[
              ['Fecha','📅',date],
              ['Hora','🕐',time],
              ['Médico','👨‍⚕️',appt.doctorName],
              ['Duración','⏱',`${appt.duration || 30} minutos`],
              ['ID Cita','#',appt.id],
            ].map(([label, icon, value]) => `
              <div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem;background:rgba(255,255,255,0.025);border-radius:8px;">
                <span style="font-size:1rem;">${icon}</span>
                <div>
                  <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">${label}</div>
                  <div style="font-size:0.87rem;color:var(--text-primary);font-weight:500;">${value}</div>
                </div>
              </div>`).join('')}
          </div>
          <div class="flex gap-2 mt-4">
            <a href="/pages/patients/profile.html?id=${appt.patientId}" class="btn btn-secondary btn-sm">Ver paciente</a>
            <a href="/pages/appointments/view.html?id=${appt.id}" class="btn btn-primary btn-sm" style="flex:1;">Ver detalle completo</a>
          </div>
        </div>
      </div>`;
  }

  /* ── Helpers de fecha ── */
  _getAppointmentsForDate(date) {
    const dateStr = date.toISOString().split('T')[0];
    return this.appointments.filter(a => a.date?.startsWith(dateStr));
  }

  _getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  _getViewStart() {
    if (this.view === 'month') {
      return new Date(this.current.getFullYear(), this.current.getMonth(), 1).toISOString();
    }
    if (this.view === 'week') {
      return this._getWeekStart(this.current).toISOString();
    }
    const d = new Date(this.current); d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  _getViewEnd() {
    if (this.view === 'month') {
      return new Date(this.current.getFullYear(), this.current.getMonth() + 1, 0, 23, 59, 59).toISOString();
    }
    if (this.view === 'week') {
      const end = this._getWeekStart(this.current);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    }
    const d = new Date(this.current); d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  /* ── Navegación ── */
  _navigate(direction) {
    if (this.view === 'month') {
      this.current.setMonth(this.current.getMonth() + direction);
    } else if (this.view === 'week') {
      this.current.setDate(this.current.getDate() + direction * 7);
    } else {
      this.current.setDate(this.current.getDate() + direction);
    }
    this._loadAppointments().then(() => this._renderCalendar());
  }

  /* ── Eventos de UI ── */
  _bindEvents() {
    document.getElementById('cal-prev')?.addEventListener('click', () => this._navigate(-1));
    document.getElementById('cal-next')?.addEventListener('click', () => this._navigate(1));

    document.getElementById('btn-today')?.addEventListener('click', () => {
      this.current  = new Date();
      this.selected = new Date();
      this._loadAppointments().then(() => {
        this._renderCalendar();
        this._renderDayPanel();
      });
    });

    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.view = btn.dataset.view;
        localStorage.setItem('mc_cal_view', this.view);
        document.querySelectorAll('.calendar-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderCalendar();
      });
    });
  }

  /* ── Socket tiempo real ── */
  _bindSocket() {
    const socket = window._socket;
    if (!socket) return;

    socket.on('appointment:created', (data) => {
      this.appointments.push({ ...data, color: SPECIALTY_COLORS[data.specialty] || SPECIALTY_COLORS.default });
      this._renderCalendar();
      this._renderDayPanel();
      Toast.info(`Nueva cita: ${data.patientName} — ${DateUtils.format(data.date)}`);
    });

    socket.on('appointment:updated', (data) => {
      const idx = this.appointments.findIndex(a => a.id === data.id);
      if (idx !== -1) {
        this.appointments[idx] = { ...this.appointments[idx], ...data };
        this._renderCalendar();
        this._renderDayPanel();
      }
    });

    socket.on('appointment:cancelled', (data) => {
      const idx = this.appointments.findIndex(a => a.id === data.id);
      if (idx !== -1) {
        this.appointments[idx].status = 'cancelled';
        this._renderCalendar();
        this._renderDayPanel();
      }
    });
  }
}
