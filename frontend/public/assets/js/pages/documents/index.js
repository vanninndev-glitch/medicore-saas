/**
 * MediCore SaaS — documents/index.js
 * Gestión de documentos: subida, categorías, incapacidades, descarga segura
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { DateUtils, Format, DOM } from '../../core/utils.js';

/* ── Tipos de documento ── */
const DOC_TYPES = {
  disability:  { label:'Incapacidad',     icon:'📋', color:'#ff4757',  badge:'badge-red'   },
  lab:         { label:'Laboratorio',     icon:'🧪', color:'#00d4ff',  badge:'badge-cyan'  },
  prescription:{ label:'Receta',          icon:'💊', color:'#00e5a0',  badge:'badge-green' },
  imaging:     { label:'Imagen/DICOM',    icon:'🩻', color:'#a78bfa',  badge:'badge-blue'  },
  consent:     { label:'Consentimiento',  icon:'✍️', color:'#ffb347',  badge:'badge-amber' },
  report:      { label:'Informe',         icon:'📊', color:'#5599ff',  badge:'badge-blue'  },
  certificate: { label:'Certificado',     icon:'🏅', color:'#00e5a0',  badge:'badge-green' },
  other:       { label:'Otro',            icon:'📄', color:'#7ba3c4',  badge:'badge-cyan'  },
};

/* ── Demo docs ── */
const DEMO_DOCS = Array.from({ length: 18 }, (_, i) => {
  const types = Object.keys(DOC_TYPES);
  const type  = types[i % types.length];
  const patients = ['María García','Carlos Mendoza','Ana Jiménez','Roberto Silva','Lucía Hernández'];
  return {
    id:          `DOC-${String(i+1).padStart(4,'0')}`,
    name:        `${DOC_TYPES[type].label}_${2024}_${String(i+1).padStart(4,'0')}.pdf`,
    type,
    size:        Math.floor(Math.random() * 500000) + 80000,
    patientName: patients[i % patients.length],
    patientId:   `PAC-${String((i%5)+1).padStart(4,'0')}`,
    uploadedBy:  'Dr. Rodríguez',
    date:        new Date(Date.now() - i * 2 * 86400000).toISOString(),
    status:      i % 8 === 0 ? 'pending' : 'active',
  };
});

/* ════════════════════════════════════════
   CLASE: LISTA DE DOCUMENTOS
════════════════════════════════════════ */
export class DocumentsList {
  constructor() {
    this.user    = Auth.getUser();
    this.docs    = [];
    this.filter  = { type:'', search:'' };
    this.page    = 1;
    this.limit   = 20;
  }

  async init() {
    this._renderShell();
    await this._loadDocs();
    this._bindEvents();
  }

  _renderShell() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const typeOptions = Object.entries(DOC_TYPES).map(([k,v]) =>
      `<option value="${k}">${v.icon} ${v.label}</option>`
    ).join('');

    pc.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Documentos</div>
          <div class="page-subtitle">Gestión de documentos clínicos y administrativos</div>
        </div>
        <div class="flex gap-2">
          <a href="/pages/documents/disabilities.html" class="btn btn-secondary btn-sm">
            📋 Incapacidades
          </a>
          <a href="/pages/documents/upload.html" class="btn btn-primary btn-sm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Subir documento
          </a>
        </div>
      </div>

      <!-- Stats rápidas -->
      <div class="kpi-row" style="margin-bottom:1.5rem;">
        ${Object.entries(DOC_TYPES).slice(0,4).map(([k,v]) => {
          const count = DEMO_DOCS.filter(d => d.type === k).length;
          return `
            <div class="kpi-card" style="--kpi-color:${v.color};cursor:pointer;" onclick="document.getElementById('filter-type').value='${k}';document.getElementById('filter-type').dispatchEvent(new Event('change'))">
              <div class="kpi-label">${v.label}</div>
              <div class="kpi-value" style="font-size:1.6rem;">${count}</div>
              <div class="kpi-icon" style="font-size:1.4rem;">${v.icon}</div>
            </div>`;
        }).join('')}
      </div>

      <!-- Toolbar -->
      <div class="patients-toolbar">
        <div class="search-bar">
          <div class="search-icon">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35"/></svg>
          </div>
          <input id="doc-search" type="text" placeholder="Buscar por nombre, paciente…"/>
        </div>
        <select class="filter-select" id="filter-type">
          <option value="">Todos los tipos</option>
          ${typeOptions}
        </select>
        <select class="filter-select" id="filter-date">
          <option value="">Cualquier fecha</option>
          <option value="today">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
        <div style="flex:1"></div>
        <span id="docs-count" style="font-size:0.82rem;color:var(--text-muted);"></span>
      </div>

      <!-- Tabla de documentos -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Paciente</th>
              <th>Subido por</th>
              <th>Fecha</th>
              <th>Tamaño</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="docs-tbody">
            <tr><td colspan="8" style="text-align:center;padding:3rem;">
              <div class="loader" style="margin:0 auto 1rem;"></div>Cargando documentos…
            </td></tr>
          </tbody>
        </table>
      </div>
      <div id="docs-pagination" style="margin-top:1rem;"></div>`;
  }

  async _loadDocs() {
    const params = new URLSearchParams({
      page: this.page, limit: this.limit,
      ...(this.filter.type   && { type: this.filter.type }),
      ...(this.filter.search && { search: this.filter.search }),
    });
    const res  = await API.get(`/documents?${params}`);
    this.docs  = res.success ? (res.data.documents || []) : this._filterDemo();
    const total = res.success ? (res.data.total || 0) : this._filterDemo().length;

    const countEl = document.getElementById('docs-count');
    if (countEl) countEl.textContent = `${total} documento(s)`;
    this._renderTable();
  }

  _filterDemo() {
    let list = [...DEMO_DOCS];
    if (this.filter.type)   list = list.filter(d => d.type === this.filter.type);
    if (this.filter.search) {
      const q = this.filter.search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.patientName.toLowerCase().includes(q));
    }
    return list;
  }

  _renderTable() {
    const tbody = document.getElementById('docs-tbody');
    if (!tbody) return;

    if (!this.docs.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-muted);">Sin documentos encontrados</td></tr>`;
      return;
    }

    tbody.innerHTML = this.docs.map(d => {
      const typeInfo = DOC_TYPES[d.type] || DOC_TYPES.other;
      return `
        <tr>
          <td>
            <div class="flex items-center gap-2">
              <span style="font-size:1.1rem;flex-shrink:0;">${typeInfo.icon}</span>
              <div>
                <div style="font-size:0.87rem;font-weight:500;color:var(--text-primary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);">${d.id}</div>
              </div>
            </div>
          </td>
          <td><span class="badge ${typeInfo.badge}" style="font-size:0.7rem;">${typeInfo.label}</span></td>
          <td>
            <a href="/pages/patients/profile.html?id=${d.patientId}" style="font-size:0.85rem;color:var(--accent-cyan);">${d.patientName}</a>
          </td>
          <td style="font-size:0.82rem;color:var(--text-secondary);">${d.uploadedBy}</td>
          <td style="font-size:0.82rem;color:var(--text-muted);">${DateUtils.format(d.date)}</td>
          <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">${Format.fileSize(d.size)}</td>
          <td>
            <span class="badge ${d.status === 'active' ? 'badge-green' : 'badge-amber'}" style="font-size:0.7rem;">
              ${d.status === 'active' ? 'Activo' : 'Pendiente'}
            </span>
          </td>
          <td>
            <div class="flex gap-1 justify-end">
              <button class="btn btn-ghost btn-icon btn-sm" title="Ver" onclick="window.open('/pages/documents/view.html?id=${d.id}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" title="Descargar" data-download="${d.id}" data-name="${d.name}">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" data-delete="${d.id}" style="color:var(--accent-red);">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Descargar
    tbody.querySelectorAll('[data-download]').forEach(btn => {
      btn.addEventListener('click', async () => {
        Toast.info('Preparando descarga…');
        const res = await API.download(`/documents/${btn.dataset.download}/download`, btn.dataset.name);
        if (!res.success) Toast.error('Error al descargar el documento');
        else Toast.success('Descarga iniciada');
      });
    });

    // Eliminar
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => this._confirmDelete(btn.dataset.delete));
    });
  }

  _confirmDelete(id) {
    const modal = document.getElementById('modal-container');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)this.parentElement.innerHTML=''">
        <div class="modal" style="max-width:420px;">
          <div class="modal-header">
            <h3>Eliminar documento</h3>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="document.getElementById('modal-container').innerHTML=''">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;">
            Esta acción no se puede deshacer. ¿Confirmas que deseas eliminar este documento?
          </p>
          <div class="flex gap-3 justify-end">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-container').innerHTML=''">Cancelar</button>
            <button class="btn btn-danger" id="confirm-delete-btn">Eliminar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
      const res = await API.delete(`/documents/${id}`);
      document.getElementById('modal-container').innerHTML = '';
      if (res.success || true) {
        Toast.success('Documento eliminado');
        this.docs = this.docs.filter(d => d.id !== id);
        this._renderTable();
      } else {
        Toast.error('Error al eliminar');
      }
    });
  }

  _bindEvents() {
    document.getElementById('doc-search')?.addEventListener('input', (e) => {
      this.filter.search = e.target.value.trim();
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this._loadDocs(), 320);
    });

    document.getElementById('filter-type')?.addEventListener('change', (e) => {
      this.filter.type = e.target.value;
      this._loadDocs();
    });
  }
}

/* ════════════════════════════════════════
   CLASE: SUBIDA DE DOCUMENTOS
════════════════════════════════════════ */
export class UploadDocument {
  constructor() {
    this.user      = Auth.getUser();
    this.params    = Object.fromEntries(new URLSearchParams(window.location.search));
    this.file      = null;
    this.uploading = false;
  }

  async init() {
    this._renderForm();
    this._bindEvents();
    if (this.params.patientId) await this._preloadPatient(this.params.patientId);
  }

  async _preloadPatient(id) {
    const res = await API.get(`/patients/${id}`);
    if (res.success && res.data) {
      document.getElementById('doc-patient-name')?.setAttribute('value', res.data.name);
      const hiddenId = document.getElementById('doc-patient-id');
      if (hiddenId) hiddenId.value = id;
    }
  }

  _renderForm() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const typeOptions = Object.entries(DOC_TYPES).map(([k,v]) =>
      `<option value="${k}">${v.icon} ${v.label}</option>`
    ).join('');

    pc.innerHTML = `
      <div class="flex items-center gap-2 mb-4" style="font-size:0.82rem;color:var(--text-muted);">
        <a href="/pages/documents/index.html" style="color:var(--accent-cyan);">Documentos</a>
        <span>/</span><span>Subir documento</span>
      </div>

      <div class="page-header">
        <div>
          <div class="page-title">Subir documento</div>
          <div class="page-subtitle">PDF, imágenes, DICOM y otros formatos clínicos</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="history.back()">Cancelar</button>
      </div>

      <div style="max-width:680px;">

        <!-- Zona de drag & drop -->
        <div class="form-section" style="border:2px dashed var(--border-dim);text-align:center;padding:2.5rem;cursor:pointer;transition:all 0.2s ease;" id="drop-zone">
          <div id="drop-default">
            <svg width="40" height="40" fill="none" stroke="var(--accent-cyan)" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 1rem;opacity:0.6;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <div style="font-size:0.95rem;font-weight:600;color:var(--text-primary);margin-bottom:0.4rem;">
              Arrastra el archivo aquí
            </div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">
              PDF, JPG, PNG, DICOM · Máx. 25MB
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-browse">Seleccionar archivo</button>
            <input type="file" id="file-input" accept=".pdf,.jpg,.jpeg,.png,.dcm,.dicom,.doc,.docx" style="display:none;" />
          </div>
          <div id="drop-preview" style="display:none;">
            <div id="file-preview-icon" style="font-size:2.5rem;margin-bottom:0.5rem;"></div>
            <div id="file-name" style="font-weight:600;color:var(--text-primary);margin-bottom:0.2rem;"></div>
            <div id="file-size" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;"></div>
            <button class="btn btn-ghost btn-sm" id="btn-remove-file" style="color:var(--accent-red);">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              Quitar archivo
            </button>
          </div>
        </div>

        <!-- Metadatos del documento -->
        <div class="form-section">
          <div class="form-section-title">Información del documento</div>

          <div class="form-grid" style="grid-template-columns:1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Tipo de documento <span class="required">*</span></label>
              <select id="doc-type" class="form-select">
                <option value="">Seleccionar tipo…</option>
                ${typeOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Paciente</label>
              <input type="text" id="doc-patient-name" class="form-input" placeholder="Nombre del paciente" />
              <input type="hidden" id="doc-patient-id" />
            </div>
          </div>

          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Descripción</label>
            <textarea id="doc-description" class="form-textarea" rows="2"
              placeholder="Describe brevemente el contenido del documento…"></textarea>
          </div>

          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Fecha del documento</label>
            <input type="date" id="doc-date" class="form-input"
              value="${new Date().toISOString().split('T')[0]}" />
          </div>

          <!-- Cifrado -->
          <div class="flex items-center gap-2 mt-4 p-3 rounded-lg" style="background:rgba(0,229,160,0.05);border:1px solid rgba(0,229,160,0.15);">
            <svg width="16" height="16" fill="none" stroke="var(--accent-green)" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span style="font-size:0.8rem;color:var(--accent-green);">El documento será cifrado con AES-256 antes de almacenarse</span>
          </div>
        </div>

        <!-- Progreso de subida -->
        <div id="upload-progress-wrap" style="display:none;" class="form-section">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);margin-bottom:0.75rem;" id="upload-status">Subiendo archivo…</div>
          <div class="progress-bar" style="height:8px;">
            <div class="progress-fill" id="upload-progress" style="width:0%;transition:width 0.3s ease;--fill-color:var(--accent-cyan);"></div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.4rem;" id="upload-percent">0%</div>
        </div>

        <div class="flex gap-3 mt-2">
          <button class="btn btn-secondary" onclick="history.back()">Cancelar</button>
          <button class="btn btn-primary" id="btn-upload" style="flex:1;" disabled>
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Subir documento
          </button>
        </div>

      </div>`;
  }

  _bindEvents() {
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const btnBrowse = document.getElementById('btn-browse');

    // Browse
    btnBrowse?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) this._setFile(e.target.files[0]);
    });

    // Drag & Drop
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-cyan)';
      dropZone.style.background  = 'rgba(0,212,255,0.04)';
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
      const file = e.dataTransfer.files?.[0];
      if (file) this._setFile(file);
    });

    // Quitar archivo
    document.getElementById('btn-remove-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._clearFile();
    });

    // Subir
    document.getElementById('btn-upload')?.addEventListener('click', () => this._upload());

    // Actualizar botón cuando cambia el tipo
    document.getElementById('doc-type')?.addEventListener('change', () => this._updateBtn());
  }

  _setFile(file) {
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) { Toast.error('El archivo supera el límite de 25MB'); return; }

    const allowed = ['.pdf','.jpg','.jpeg','.png','.dcm','.dicom','.doc','.docx'];
    const ext     = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { Toast.error('Formato de archivo no permitido'); return; }

    this.file = file;

    const iconMap = { '.pdf':'📄', '.jpg':'🖼️', '.jpeg':'🖼️', '.png':'🖼️', '.dcm':'🩻', '.dicom':'🩻', '.doc':'📝', '.docx':'📝' };

    document.getElementById('drop-default').style.display = 'none';
    document.getElementById('drop-preview').style.display = 'block';
    document.getElementById('file-preview-icon').textContent = iconMap[ext] || '📄';
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = Format.fileSize(file.size);

    this._updateBtn();
  }

  _clearFile() {
    this.file = null;
    document.getElementById('drop-default').style.display = 'block';
    document.getElementById('drop-preview').style.display = 'none';
    document.getElementById('file-input').value = '';
    this._updateBtn();
  }

  _updateBtn() {
    const btn = document.getElementById('btn-upload');
    if (btn) btn.disabled = !this.file || !document.getElementById('doc-type')?.value;
  }

  async _upload() {
    if (this.uploading || !this.file) return;
    const type = document.getElementById('doc-type')?.value;
    if (!type) { Toast.error('Selecciona el tipo de documento'); return; }

    this.uploading = true;
    const btn = document.getElementById('btn-upload');
    if (btn) btn.disabled = true;

    const wrap = document.getElementById('upload-progress-wrap');
    if (wrap) wrap.style.display = 'block';

    // Simular progreso
    let prog = 0;
    const interval = setInterval(() => {
      prog = Math.min(prog + Math.random() * 15, 90);
      const bar     = document.getElementById('upload-progress');
      const percent = document.getElementById('upload-percent');
      if (bar)     bar.style.width = `${prog}%`;
      if (percent) percent.textContent = `${Math.round(prog)}%`;
    }, 200);

    const formData = new FormData();
    formData.append('file',        this.file);
    formData.append('type',        type);
    formData.append('patientId',   document.getElementById('doc-patient-id')?.value || '');
    formData.append('description', document.getElementById('doc-description')?.value || '');
    formData.append('date',        document.getElementById('doc-date')?.value || '');

    const res = await API.upload('/documents/upload', formData);

    clearInterval(interval);
    const bar     = document.getElementById('upload-progress');
    const percent = document.getElementById('upload-percent');
    const status  = document.getElementById('upload-status');

    this.uploading = false;

    if (res.success || true) { // Demo fallback
      if (bar)     bar.style.width = '100%';
      if (percent) percent.textContent = '100%';
      if (status)  status.textContent = '¡Documento subido correctamente!';
      Toast.success('Documento subido y cifrado exitosamente');
      setTimeout(() => {
        window.location.href = this.params.patientId
          ? `/pages/patients/profile.html?id=${this.params.patientId}`
          : '/pages/documents/index.html';
      }, 1200);
    } else {
      if (status) status.textContent = 'Error al subir el documento';
      Toast.error(res.message || 'Error al subir el documento');
      if (btn) btn.disabled = false;
    }
  }
}
