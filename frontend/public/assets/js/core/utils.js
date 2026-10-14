/**
 * MediCore SaaS — utils.js
 * Helpers globales: fechas, formato, validación, DOM, paginación, export
 */

/* ══════════════════════════════════════════
   FECHAS Y TIEMPO
══════════════════════════════════════════ */
export const DateUtils = {

  /* Formato: dd/mm/yyyy */
  format(date, locale = 'es-MX') {
    if (!date) return '—';
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  },

  /* Formato: dd/mm/yyyy HH:mm */
  formatDateTime(date, locale = 'es-MX') {
    if (!date) return '—';
    return new Date(date).toLocaleString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  /* Tiempo relativo */
  timeAgo(date) {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Ahora mismo';
    if (mins < 60)  return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `Hace ${days}d`;
    return DateUtils.format(date);
  },

  /* Calcular edad a partir de fecha de nacimiento */
  age(dob) {
    if (!dob) return '—';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  },

  /* ISO string del inicio del día */
  startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  },

  /* ISO string del fin del día */
  endOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  },

  /* Rango de semana actual */
  currentWeekRange() {
    const now  = new Date();
    const day  = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: this.startOfDay(start), end: this.endOfDay(end) };
  },
};

/* ══════════════════════════════════════════
   FORMATO DE DATOS
══════════════════════════════════════════ */
export const Format = {

  /* Moneda MXN */
  currency(amount, locale = 'es-MX', currency = 'MXN') {
    if (amount == null) return '—';
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  },

  /* Número con separadores */
  number(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('es-MX').format(n);
  },

  /* Porcentaje */
  percent(n, decimals = 1) {
    if (n == null) return '—';
    return `${Number(n).toFixed(decimals)}%`;
  },

  /* Nombre de archivo legible */
  fileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)} ${units[i]}`;
  },

  /* Capitalizar primera letra */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /* Iniciales de nombre */
  initials(name = '') {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  },

  /* CURP formateada */
  curp(str) {
    return str?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18) || '';
  },

  /* Teléfono */
  phone(str) {
    const digits = (str || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return digits;
  },
};

/* ══════════════════════════════════════════
   VALIDACIÓN
══════════════════════════════════════════ */
export const Validate = {

  required(v, label = 'Campo')  { return v?.toString().trim() ? null : `${label} es requerido`; },
  email(v)    { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Email inválido'; },
  minLen(v, n){ return v?.length >= n ? null : `Mínimo ${n} caracteres`; },
  maxLen(v, n){ return v?.length <= n ? null : `Máximo ${n} caracteres`; },
  phone(v)    { return /^\d{10}$/.test(v?.replace(/\D/g, '')) ? null : 'Teléfono inválido (10 dígitos)'; },
  curp(v)     { return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/.test(v?.toUpperCase()) ? null : 'CURP inválida'; },
  rfc(v)      { return /^[A-Z]{3,4}\d{6}[A-Z\d]{3}$/.test(v?.toUpperCase()) ? null : 'RFC inválido'; },
  date(v)     { return v && !isNaN(Date.parse(v)) ? null : 'Fecha inválida'; },
  positive(v) { return !isNaN(v) && Number(v) > 0 ? null : 'Debe ser un número positivo'; },

  /* Validar objeto con reglas */
  form(data, rules) {
    const errors = {};
    for (const [field, fieldRules] of Object.entries(rules)) {
      for (const rule of fieldRules) {
        const error = rule(data[field]);
        if (error) { errors[field] = error; break; }
      }
    }
    return { valid: Object.keys(errors).length === 0, errors };
  },
};

/* ══════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════ */
export const DOM = {

  /* Query segura */
  $(sel, parent = document)  { return parent.querySelector(sel); },
  $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; },

  /* Crear elemento con atributos */
  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    });
    children.forEach(child => el.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child
    ));
    return el;
  },

  /* Mostrar/ocultar con animación */
  show(el, display = 'flex') {
    if (!el) return;
    el.style.display = display;
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '1';
    });
  },

  hide(el) {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s ease';
    setTimeout(() => { el.style.display = 'none'; }, 200);
  },

  /* Errores en formulario */
  setError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errEl = document.getElementById(`${fieldId}-error`);
    if (input) input.style.borderColor = message ? 'var(--accent-red)' : '';
    if (errEl) {
      errEl.textContent = message || '';
      errEl.style.display = message ? 'block' : 'none';
    }
  },

  clearErrors(...fieldIds) {
    fieldIds.forEach(id => this.setError(id, ''));
  },

  /* Scroll suave a elemento */
  scrollTo(el, offset = 80) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  },
};

/* ══════════════════════════════════════════
   PAGINACIÓN
══════════════════════════════════════════ */
export class Pagination {
  constructor({ total, page = 1, limit = 20, onPage }) {
    this.total  = total;
    this.page   = page;
    this.limit  = limit;
    this.onPage = onPage;
    this.pages  = Math.ceil(total / limit);
  }

  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (this.pages <= 1) { el.innerHTML = ''; return; }

    const start = (this.page - 1) * this.limit + 1;
    const end   = Math.min(this.page * this.limit, this.total);

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <span style="font-size:0.82rem;color:var(--text-muted);">
          Mostrando ${start}–${end} de ${Format.number(this.total)} registros
        </span>
        <div style="display:flex;gap:0.3rem;align-items:center;">
          <button class="btn btn-secondary btn-sm" ${this.page <= 1 ? 'disabled' : ''} data-page="${this.page - 1}">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          ${this._pageButtons()}
          <button class="btn btn-secondary btn-sm" ${this.page >= this.pages ? 'disabled' : ''} data-page="${this.page + 1}">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>`;

    el.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= this.pages) {
          this.page = p;
          this.onPage?.(p);
          this.render(containerId);
        }
      });
    });
  }

  _pageButtons() {
    const range = [];
    const delta = 2;
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.pages, this.page + delta); i++) {
      range.push(i);
    }
    return range.map(p => `
      <button class="btn ${p === this.page ? 'btn-primary' : 'btn-secondary'} btn-sm" data-page="${p}" style="min-width:32px;">
        ${p}
      </button>`).join('');
  }
}

/* ══════════════════════════════════════════
   EXPORTACIÓN
══════════════════════════════════════════ */
export const Exporter = {

  /* Exportar a CSV */
  toCSV(data, filename = 'export.csv') {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows    = data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(',')
    );
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    this._download(blob, filename);
  },

  /* Descargar blob */
  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ══════════════════════════════════════════
   DEBOUNCE / THROTTLE
══════════════════════════════════════════ */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
}
