/**
 * MediCore SaaS — patients/register.js
 * Formulario completo de registro/edición de paciente
 */

import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { Validate, Format, DOM, DateUtils } from '../../core/utils.js';

/* ── Catálogos ── */
const BLOOD_TYPES  = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Desconocido'];
const INSURANCE    = ['IMSS','ISSSTE','Seguro Popular / Bienestar','PEMEX','SEDENA','SEMAR','Privado','Sin seguro'];
const STATES_MX    = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'];
const EDUCATION    = ['Sin escolaridad','Primaria','Secundaria','Preparatoria','Técnico','Licenciatura','Posgrado'];
const OCCUPATION   = ['Empleado','Estudiante','Ama de casa','Comerciante','Profesionista','Jubilado','Desempleado','Otro'];
const RELIGIONS    = ['Ninguna','Católica','Cristiana','Testigos de Jehová','Judaica','Islámica','Otra'];
const RELATIONSHIP = ['Esposo/a','Padre','Madre','Hijo/a','Hermano/a','Abuelo/a','Tío/a','Amigo/a','Otro'];

/* ════════════════════════════════════════
   CLASE PRINCIPAL
════════════════════════════════════════ */
export class PatientRegister {
  constructor() {
    this.user    = Auth.getUser();
    this.params  = Object.fromEntries(new URLSearchParams(window.location.search));
    this.isEdit  = this.params.mode === 'edit';
    this.patient = null;
    this.saving  = false;
    this.step    = 1;
    this.totalSteps = 5;
  }

  async init() {
    if (this.isEdit && this.params.id) await this._loadPatient();
    this._renderForm();
    this._bindEvents();
    if (this.patient) this._fillForm();
  }

  /* ── Cargar paciente en modo edición ── */
  async _loadPatient() {
    const res = await API.get(`/patients/${this.params.id}`);
    this.patient = res.success ? res.data : null;
  }

  /* ── Render del formulario completo ── */
  _renderForm() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    pc.innerHTML = `
      <div class="flex items-center gap-2 mb-4" style="font-size:0.82rem;color:var(--text-muted);">
        <a href="/pages/patients/index.html" style="color:var(--accent-cyan);">Pacientes</a>
        <span>/</span>
        <span>${this.isEdit ? 'Editar paciente' : 'Registrar paciente'}</span>
      </div>

      <div class="page-header">
        <div>
          <div class="page-title">${this.isEdit ? 'Editar paciente' : 'Nuevo paciente'}</div>
          <div class="page-subtitle">${this.isEdit ? 'Actualiza la información del expediente' : 'Completa el expediente clínico del paciente'}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="history.back()">Cancelar</button>
      </div>

      <!-- Indicador de pasos -->
      <div style="display:flex;align-items:center;gap:0;margin-bottom:2rem;overflow-x:auto;padding-bottom:0.5rem;">
        ${[
          ['1','Datos personales'],
          ['2','Información clínica'],
          ['3','Contacto de emergencia'],
          ['4','Antecedentes'],
          ['5','Seguro médico'],
        ].map(([num, label], i) => `
          <div class="flex items-center">
            <div style="display:flex;flex-direction:column;align-items:center;gap:0.3rem;min-width:80px;">
              <div id="step-indicator-${num}" style="
                width:32px;height:32px;border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                font-size:0.8rem;font-weight:700;
                background:${this.step == num ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)'};
                color:${this.step == num ? '#000' : 'var(--text-muted)'};
                border:2px solid ${this.step == num ? 'var(--accent-cyan)' : 'var(--border-subtle)'};
                transition:all 0.3s ease;
              ">${num}</div>
              <span style="font-size:0.68rem;color:${this.step == num ? 'var(--accent-cyan)' : 'var(--text-muted)'};white-space:nowrap;">${label}</span>
            </div>
            ${i < 4 ? `<div style="width:40px;height:1px;background:var(--border-subtle);margin-bottom:18px;flex-shrink:0;"></div>` : ''}
          </div>`).join('')}
      </div>

      <div style="max-width:780px;">

        <!-- ═══ PASO 1: Datos personales ═══ -->
        <div id="form-step-1" class="form-step">
          ${this._buildStep1()}
        </div>

        <!-- ═══ PASO 2: Información clínica ═══ -->
        <div id="form-step-2" class="form-step" style="display:none;">
          ${this._buildStep2()}
        </div>

        <!-- ═══ PASO 3: Contacto de emergencia ═══ -->
        <div id="form-step-3" class="form-step" style="display:none;">
          ${this._buildStep3()}
        </div>

        <!-- ═══ PASO 4: Antecedentes ═══ -->
        <div id="form-step-4" class="form-step" style="display:none;">
          ${this._buildStep4()}
        </div>

        <!-- ═══ PASO 5: Seguro médico ═══ -->
        <div id="form-step-5" class="form-step" style="display:none;">
          ${this._buildStep5()}
        </div>

        <!-- Navegación entre pasos -->
        <div class="flex justify-between items-center mt-4" style="padding-top:1rem;border-top:1px solid var(--border-subtle);">
          <button class="btn btn-secondary" id="btn-prev" style="${this.step === 1 ? 'opacity:0;pointer-events:none;' : ''}">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Anterior
          </button>
          <span style="font-size:0.8rem;color:var(--text-muted);">Paso ${this.step} de ${this.totalSteps}</span>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" id="btn-save-draft">Guardar borrador</button>
            <button class="btn btn-primary" id="btn-next">
              ${this.step === this.totalSteps ? (this.isEdit ? 'Actualizar paciente' : 'Registrar paciente') : 'Siguiente'}
              ${this.step < this.totalSteps ? `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>` : ''}
            </button>
          </div>
        </div>

      </div>`;
  }

  /* ── PASO 1: Datos personales ── */
  _buildStep1() {
    return `
      <div class="form-section">
        <div class="form-section-title">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          Datos personales
        </div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">Primer nombre <span class="required">*</span></label>
            <input id="p-firstname" class="form-input" type="text" placeholder="María" autocomplete="given-name"/>
            <div id="p-firstname-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Segundo nombre</label>
            <input id="p-middlename" class="form-input" type="text" placeholder="Isabel"/>
          </div>
          <div class="form-group">
            <label class="form-label">Apellido paterno <span class="required">*</span></label>
            <input id="p-lastname1" class="form-input" type="text" placeholder="García" autocomplete="family-name"/>
            <div id="p-lastname1-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Apellido materno <span class="required">*</span></label>
            <input id="p-lastname2" class="form-input" type="text" placeholder="López"/>
            <div id="p-lastname2-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de nacimiento <span class="required">*</span></label>
            <input id="p-dob" class="form-input" type="date" max="${new Date().toISOString().split('T')[0]}"/>
            <div id="p-dob-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Género <span class="required">*</span></label>
            <select id="p-gender" class="form-select">
              <option value="">Seleccionar…</option>
              <option value="Femenino">Femenino</option>
              <option value="Masculino">Masculino</option>
              <option value="No binario">No binario</option>
              <option value="Prefiero no decir">Prefiero no decir</option>
            </select>
            <div id="p-gender-error" class="form-error"></div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Identificación oficial</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">CURP</label>
            <input id="p-curp" class="form-input" type="text" placeholder="GALO850615MDFRPR09" maxlength="18"
              style="font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;"/>
            <div id="p-curp-error" class="form-error"></div>
            <div class="form-hint">18 caracteres alfanuméricos</div>
          </div>
          <div class="form-group">
            <label class="form-label">RFC</label>
            <input id="p-rfc" class="form-input" type="text" placeholder="GALM850615A12" maxlength="13"
              style="font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;"/>
          </div>
          <div class="form-group">
            <label class="form-label">Estado de nacimiento</label>
            <select id="p-state" class="form-select">
              <option value="">Seleccionar…</option>
              ${STATES_MX.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nacionalidad</label>
            <input id="p-nationality" class="form-input" type="text" placeholder="Mexicana" value="Mexicana"/>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Contacto y domicilio</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Teléfono principal <span class="required">*</span></label>
            <input id="p-phone" class="form-input" type="tel" placeholder="5512345678" maxlength="10"/>
            <div id="p-phone-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono alternativo</label>
            <input id="p-phone2" class="form-input" type="tel" placeholder="5587654321" maxlength="10"/>
          </div>
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input id="p-email" class="form-input" type="email" placeholder="maria@ejemplo.com"/>
            <div id="p-email-error" class="form-error"></div>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label class="form-label">Domicilio completo</label>
          <textarea id="p-address" class="form-textarea" rows="2"
            placeholder="Calle, número, colonia, municipio, estado, CP…"></textarea>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Información socioeconómica</div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">Escolaridad</label>
            <select id="p-education" class="form-select">
              <option value="">Seleccionar…</option>
              ${EDUCATION.map(e => `<option value="${e}">${e}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ocupación</label>
            <select id="p-occupation" class="form-select">
              <option value="">Seleccionar…</option>
              ${OCCUPATION.map(o => `<option value="${o}">${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Estado civil</label>
            <select id="p-civil" class="form-select">
              <option value="">Seleccionar…</option>
              <option>Soltero/a</option><option>Casado/a</option>
              <option>Divorciado/a</option><option>Viudo/a</option>
              <option>Unión libre</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Religión</label>
            <select id="p-religion" class="form-select">
              <option value="">Seleccionar…</option>
              ${RELIGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;
  }

  /* ── PASO 2: Información clínica ── */
  _buildStep2() {
    return `
      <div class="form-section">
        <div class="form-section-title">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          Datos clínicos básicos
        </div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">Tipo de sangre <span class="required">*</span></label>
            <select id="p-blood" class="form-select">
              <option value="">Seleccionar…</option>
              ${BLOOD_TYPES.map(b => `<option value="${b}">${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Peso actual (kg)</label>
            <input id="p-weight" class="form-input" type="number" placeholder="70" step="0.1" min="1" max="500"/>
          </div>
          <div class="form-group">
            <label class="form-label">Talla (cm)</label>
            <input id="p-height" class="form-input" type="number" placeholder="170" min="40" max="250"/>
          </div>
        </div>
        <div id="p-imc-display" style="margin-top:0.5rem;font-size:0.82rem;color:var(--text-muted);"></div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Alergias conocidas</div>
        <div style="margin-bottom:0.75rem;">
          <div class="flex gap-2">
            <input id="allergy-input" class="form-input" type="text"
              placeholder="Ej: Penicilina, Ibuprofeno, Látex…" style="flex:1;"/>
            <button class="btn btn-secondary btn-sm" id="btn-add-allergy" type="button">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Agregar
            </button>
          </div>
        </div>
        <div id="allergies-list" style="display:flex;flex-wrap:wrap;gap:0.4rem;min-height:32px;">
          <span style="font-size:0.8rem;color:var(--text-muted);">Sin alergias registradas</span>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Enfermedades crónicas</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.6rem;">
          ${['Diabetes mellitus tipo 2','Hipertensión arterial','Asma','EPOC','Obesidad',
            'Insuficiencia renal','Cardiopatía','Epilepsia','Hipotiroidismo','VIH/SIDA',
            'Artritis reumatoide','Lupus eritematoso'].map(d => `
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;color:var(--text-secondary);cursor:pointer;padding:0.4rem;border-radius:6px;transition:background 0.15s;">
              <input type="checkbox" class="chronic-disease" value="${d}"
                style="width:15px;height:15px;accent-color:var(--accent-cyan);cursor:pointer;"/>
              ${d}
            </label>`).join('')}
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label class="form-label">Otras enfermedades crónicas</label>
          <textarea id="p-other-chronic" class="form-textarea" rows="2" placeholder="Especifica otras condiciones crónicas…"></textarea>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Hábitos</div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">Tabaquismo</label>
            <select id="p-smoking" class="form-select">
              <option value="">Seleccionar…</option>
              <option value="no">No fumador</option>
              <option value="ex">Ex fumador</option>
              <option value="yes">Fumador activo</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Alcoholismo</label>
            <select id="p-alcohol" class="form-select">
              <option value="">Seleccionar…</option>
              <option value="no">No consume</option>
              <option value="social">Ocasional/social</option>
              <option value="moderate">Moderado</option>
              <option value="high">Frecuente</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Actividad física</label>
            <select id="p-exercise" class="form-select">
              <option value="">Seleccionar…</option>
              <option value="sedentary">Sedentario</option>
              <option value="light">Actividad ligera</option>
              <option value="moderate">Actividad moderada</option>
              <option value="intense">Actividad intensa</option>
            </select>
          </div>
        </div>
      </div>`;
  }

  /* ── PASO 3: Contacto de emergencia ── */
  _buildStep3() {
    return `
      <div class="form-section">
        <div class="form-section-title">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          Contacto de emergencia principal
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Nombre completo <span class="required">*</span></label>
            <input id="ec-name" class="form-input" type="text" placeholder="Pedro García López"/>
            <div id="ec-name-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Parentesco <span class="required">*</span></label>
            <select id="ec-relation" class="form-select">
              <option value="">Seleccionar…</option>
              ${RELATIONSHIP.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <div id="ec-relation-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono <span class="required">*</span></label>
            <input id="ec-phone" class="form-input" type="tel" placeholder="5587654321" maxlength="10"/>
            <div id="ec-phone-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono alternativo</label>
            <input id="ec-phone2" class="form-input" type="tel" placeholder="5512345678" maxlength="10"/>
          </div>
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input id="ec-email" class="form-input" type="email" placeholder="pedro@ejemplo.com"/>
          </div>
          <div class="form-group">
            <label class="form-label">Domicilio</label>
            <input id="ec-address" class="form-input" type="text" placeholder="Dirección del contacto"/>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Segundo contacto de emergencia (opcional)</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Nombre completo</label>
            <input id="ec2-name" class="form-input" type="text" placeholder="Laura García"/>
          </div>
          <div class="form-group">
            <label class="form-label">Parentesco</label>
            <select id="ec2-relation" class="form-select">
              <option value="">Seleccionar…</option>
              ${RELATIONSHIP.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="ec2-phone" class="form-input" type="tel" placeholder="5523456789" maxlength="10"/>
          </div>
        </div>
      </div>`;
  }

  /* ── PASO 4: Antecedentes ── */
  _buildStep4() {
    const antFields = [
      ['Antecedentes heredofamiliares', 'p-ant-hereditary',
        'Diabetes en familiares de primer grado, hipertensión, cáncer, cardiopatías, etc.'],
      ['Antecedentes personales patológicos', 'p-ant-personal',
        'Enfermedades previas, hospitalizaciones, transfusiones, accidentes, traumatismos…'],
      ['Antecedentes quirúrgicos', 'p-ant-surgical',
        'Cirugías realizadas, fecha aproximada, complicaciones…'],
      ['Antecedentes alérgicos', 'p-ant-allergic',
        'Reacciones alérgicas documentadas a medicamentos, alimentos, materiales…'],
      ['Antecedentes traumatológicos', 'p-ant-trauma',
        'Fracturas, esguinces, luxaciones, politraumatismos…'],
    ];

    const gynFields = `
      <div class="form-section" id="gyn-section" style="display:none;">
        <div class="form-section-title">Antecedentes gineco-obstétricos</div>
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">Menarca (edad)</label>
            <input id="p-menarche" class="form-input" type="number" placeholder="12" min="8" max="20"/>
          </div>
          <div class="form-group">
            <label class="form-label">FUM (última menstruación)</label>
            <input id="p-fum" class="form-input" type="date"/>
          </div>
          <div class="form-group">
            <label class="form-label">Ciclo menstrual</label>
            <input id="p-cycle" class="form-input" type="text" placeholder="Regular / 28 días"/>
          </div>
          <div class="form-group">
            <label class="form-label">Gestas (embarazos)</label>
            <input id="p-gestas" class="form-input" type="number" placeholder="0" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Partos</label>
            <input id="p-partos" class="form-input" type="number" placeholder="0" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Cesáreas</label>
            <input id="p-cesareas" class="form-input" type="number" placeholder="0" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Abortos</label>
            <input id="p-abortos" class="form-input" type="number" placeholder="0" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Método anticonceptivo</label>
            <select id="p-contraceptive" class="form-select">
              <option value="">Seleccionar…</option>
              <option>Ninguno</option><option>Hormonal oral</option>
              <option>DIU</option><option>Barrera</option>
              <option>Inyectable</option><option>Implante</option>
              <option>Ligadura de trompas</option><option>Abstinencia</option>
            </select>
          </div>
        </div>
      </div>`;

    return `
      ${antFields.map(([title, id, placeholder]) => `
        <div class="form-section">
          <div class="form-section-title">${title}</div>
          <textarea id="${id}" class="form-textarea" rows="3" placeholder="${placeholder}"></textarea>
        </div>`).join('')}
      ${gynFields}
      <div class="form-section">
        <div class="form-section-title">Medicamentos actuales</div>
        <textarea id="p-medications" class="form-textarea" rows="3"
          placeholder="Listado de medicamentos que toma actualmente: nombre, dosis, frecuencia…"></textarea>
      </div>
      <div class="form-section">
        <div class="form-section-title">Notas adicionales del expediente</div>
        <textarea id="p-notes" class="form-textarea" rows="3"
          placeholder="Observaciones clínicas relevantes, consideraciones especiales…"></textarea>
      </div>`;
  }

  /* ── PASO 5: Seguro médico ── */
  _buildStep5() {
    return `
      <div class="form-section">
        <div class="form-section-title">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Seguro médico
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Tipo de seguro <span class="required">*</span></label>
            <select id="p-insurance" class="form-select">
              <option value="">Seleccionar…</option>
              ${INSURANCE.map(i => `<option value="${i}">${i}</option>`).join('')}
            </select>
            <div id="p-insurance-error" class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Número de afiliación</label>
            <input id="p-insurance-num" class="form-input" type="text"
              placeholder="87654321200" style="font-family:var(--font-mono);"/>
          </div>
          <div class="form-group">
            <label class="form-label">Clínica/UMAE asignada</label>
            <input id="p-clinic" class="form-input" type="text" placeholder="UMAE Hospital de Especialidades…"/>
          </div>
          <div class="form-group">
            <label class="form-label">Vigencia</label>
            <input id="p-insurance-expiry" class="form-input" type="date"/>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Seguro médico privado (opcional)</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Aseguradora</label>
            <input id="p-private-ins" class="form-input" type="text" placeholder="GNP, AXA, Mapfre…"/>
          </div>
          <div class="form-group">
            <label class="form-label">Número de póliza</label>
            <input id="p-policy-num" class="form-input" type="text"
              placeholder="POL-123456" style="font-family:var(--font-mono);"/>
          </div>
          <div class="form-group">
            <label class="form-label">Cobertura</label>
            <input id="p-coverage" class="form-input" type="text" placeholder="Hospitalización, cirugía, consultas…"/>
          </div>
          <div class="form-group">
            <label class="form-label">Vigencia de la póliza</label>
            <input id="p-policy-expiry" class="form-input" type="date"/>
          </div>
        </div>
      </div>

      <!-- Resumen pre-guardado -->
      <div class="form-section" style="background:linear-gradient(135deg,rgba(0,212,255,0.06),rgba(26,111,255,0.04));border-color:rgba(0,212,255,0.15);">
        <div class="form-section-title">Resumen del expediente</div>
        <div id="register-summary" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;">
          <div style="font-size:0.82rem;color:var(--text-muted);">Completa todos los pasos para ver el resumen</div>
        </div>
      </div>`;
  }

  /* ── Rellenar formulario en modo edición ── */
  _fillForm() {
    if (!this.patient) return;
    const p = this.patient;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };

    const nameParts = p.name?.split(' ') || [];
    set('p-firstname',  nameParts[0] || '');
    set('p-middlename', nameParts.length > 3 ? nameParts[1] : '');
    set('p-lastname1',  nameParts[nameParts.length > 3 ? 2 : 1] || '');
    set('p-lastname2',  nameParts[nameParts.length - 1] || '');
    set('p-dob',        p.dob || '');
    set('p-gender',     p.gender || '');
    set('p-curp',       p.curp || '');
    set('p-phone',      p.phone || '');
    set('p-email',      p.email || '');
    set('p-address',    p.address || '');
    set('p-blood',      p.bloodType || '');
    set('p-insurance',  p.insurance || '');
    set('p-insurance-num', p.insuranceNum || '');
    if (p.emergency) {
      set('ec-name',     p.emergency.name     || '');
      set('ec-relation', p.emergency.relation || '');
      set('ec-phone',    p.emergency.phone    || '');
    }
  }

  /* ── Validar paso actual ── */
  _validateStep() {
    let valid = true;

    if (this.step === 1) {
      const fields = [
        ['p-firstname',  (v) => Validate.required(v, 'Nombre')],
        ['p-lastname1',  (v) => Validate.required(v, 'Apellido paterno')],
        ['p-lastname2',  (v) => Validate.required(v, 'Apellido materno')],
        ['p-dob',        (v) => Validate.required(v, 'Fecha de nacimiento') || Validate.date(v)],
        ['p-gender',     (v) => Validate.required(v, 'Género')],
        ['p-phone',      (v) => Validate.required(v, 'Teléfono') || Validate.phone(v)],
      ];
      fields.forEach(([id, validator]) => {
        const el  = document.getElementById(id);
        const err = validator(el?.value?.trim());
        DOM.setError(id, err);
        if (err) valid = false;
      });

      const emailEl = document.getElementById('p-email');
      if (emailEl?.value?.trim()) {
        const emailErr = Validate.email(emailEl.value.trim());
        DOM.setError('p-email', emailErr);
        if (emailErr) valid = false;
      }

      const curpEl = document.getElementById('p-curp');
      if (curpEl?.value?.trim()) {
        const curpErr = Validate.curp(curpEl.value.trim());
        DOM.setError('p-curp', curpErr);
        if (curpErr) valid = false;
      }
    }

    if (this.step === 3) {
      const fields = [
        ['ec-name',     (v) => Validate.required(v, 'Nombre del contacto')],
        ['ec-relation', (v) => Validate.required(v, 'Parentesco')],
        ['ec-phone',    (v) => Validate.required(v, 'Teléfono') || Validate.phone(v)],
      ];
      fields.forEach(([id, validator]) => {
        const el  = document.getElementById(id);
        const err = validator(el?.value?.trim());
        DOM.setError(id, err);
        if (err) valid = false;
      });
    }

    if (this.step === 5) {
      const insEl = document.getElementById('p-insurance');
      const insErr = Validate.required(insEl?.value, 'Seguro médico');
      DOM.setError('p-insurance', insErr);
      if (insErr) valid = false;
    }

    return valid;
  }

  /* ── Navegar entre pasos ── */
  _goToStep(n) {
    const current = document.getElementById(`form-step-${this.step}`);
    const next    = document.getElementById(`form-step-${n}`);
    if (!next) return;

    if (current) current.style.display = 'none';
    next.style.display = 'block';

    this.step = n;
    this._updateStepIndicators();

    // Mostrar/ocultar botón anterior
    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) btnPrev.style.cssText = this.step === 1 ? 'opacity:0;pointer-events:none;' : '';

    // Actualizar texto botón siguiente
    const btnNext = document.getElementById('btn-next');
    if (btnNext) {
      if (this.step === this.totalSteps) {
        btnNext.innerHTML = this.isEdit ? 'Actualizar paciente' : 'Registrar paciente';
      } else {
        btnNext.innerHTML = `Siguiente <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;
      }
    }

    // Actualizar contador
    const counter = document.querySelector('[id="btn-prev"] ~ span');
    document.querySelectorAll('span').forEach(s => {
      if (s.textContent.startsWith('Paso ')) s.textContent = `Paso ${this.step} de ${this.totalSteps}`;
    });

    // Mostrar sección ginecológica si es femenino
    if (this.step === 4) {
      const gender  = document.getElementById('p-gender')?.value;
      const gynSect = document.getElementById('gyn-section');
      if (gynSect) gynSect.style.display = gender === 'Femenino' ? 'block' : 'none';
    }

    // Construir resumen en paso 5
    if (this.step === 5) this._buildSummary();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  _updateStepIndicators() {
    for (let i = 1; i <= this.totalSteps; i++) {
      const el = document.getElementById(`step-indicator-${i}`);
      if (!el) continue;
      const isDone    = i < this.step;
      const isCurrent = i === this.step;
      el.style.background   = isDone ? 'rgba(0,229,160,0.2)' : isCurrent ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.06)';
      el.style.color        = isDone ? 'var(--accent-green)' : isCurrent ? '#000' : 'var(--text-muted)';
      el.style.borderColor  = isDone ? 'var(--accent-green)' : isCurrent ? 'var(--accent-cyan)' : 'var(--border-subtle)';
      el.innerHTML          = isDone
        ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
        : i;
    }
  }

  _buildSummary() {
    const el = document.getElementById('register-summary');
    if (!el) return;
    const get = (id) => document.getElementById(id)?.value?.trim() || '—';
    const items = [
      ['Nombre',    `${get('p-firstname')} ${get('p-lastname1')} ${get('p-lastname2')}`],
      ['Nacimiento', get('p-dob') ? DateUtils.format(get('p-dob') + 'T12:00:00') : '—'],
      ['Género',    get('p-gender')],
      ['Teléfono',  Format.phone(get('p-phone'))],
      ['Sangre',    get('p-blood')],
      ['Seguro',    get('p-insurance')],
      ['Contacto emergencia', get('ec-name')],
    ];
    el.innerHTML = items.map(([label, value]) => `
      <div>
        <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:2px;">${label}</div>
        <div style="font-size:0.87rem;color:var(--text-primary);font-weight:500;">${value}</div>
      </div>`).join('');
  }

  /* ── Recopilar datos del formulario ── */
  _collectData() {
    const get      = (id) => document.getElementById(id)?.value?.trim() || '';
    const checked  = (sel) => [...document.querySelectorAll(sel)].filter(c => c.checked).map(c => c.value);

    return {
      firstName:     get('p-firstname'),
      middleName:    get('p-middlename'),
      lastName1:     get('p-lastname1'),
      lastName2:     get('p-lastname2'),
      name:          [get('p-firstname'), get('p-middlename'), get('p-lastname1'), get('p-lastname2')].filter(Boolean).join(' '),
      dob:           get('p-dob'),
      gender:        get('p-gender'),
      curp:          get('p-curp').toUpperCase(),
      rfc:           get('p-rfc').toUpperCase(),
      state:         get('p-state'),
      nationality:   get('p-nationality'),
      phone:         get('p-phone'),
      phone2:        get('p-phone2'),
      email:         get('p-email'),
      address:       get('p-address'),
      education:     get('p-education'),
      occupation:    get('p-occupation'),
      civilStatus:   get('p-civil'),
      religion:      get('p-religion'),
      bloodType:     get('p-blood'),
      weight:        parseFloat(get('p-weight')) || null,
      height:        parseFloat(get('p-height')) || null,
      allergies:     [...document.querySelectorAll('.allergy-tag')].map(t => t.dataset.allergy),
      chronicDiseases: checked('.chronic-disease'),
      otherChronic:  get('p-other-chronic'),
      smoking:       get('p-smoking'),
      alcohol:       get('p-alcohol'),
      exercise:      get('p-exercise'),
      emergency: {
        name:     get('ec-name'),
        relation: get('ec-relation'),
        phone:    get('ec-phone'),
        phone2:   get('ec2-phone'),
        email:    get('ec-email'),
        address:  get('ec-address'),
      },
      emergency2: get('ec2-name') ? { name: get('ec2-name'), relation: get('ec2-relation'), phone: get('ec2-phone') } : null,
      antecedents: {
        hereditary:  get('p-ant-hereditary'),
        personal:    get('p-ant-personal'),
        surgical:    get('p-ant-surgical'),
        allergic:    get('p-ant-allergic'),
        trauma:      get('p-ant-trauma'),
      },
      gynecological: {
        menarche:     parseInt(get('p-menarche')) || null,
        fum:          get('p-fum'),
        cycle:        get('p-cycle'),
        gestas:       parseInt(get('p-gestas')) || 0,
        partos:       parseInt(get('p-partos')) || 0,
        cesareas:     parseInt(get('p-cesareas')) || 0,
        abortos:      parseInt(get('p-abortos')) || 0,
        contraceptive:get('p-contraceptive'),
      },
      medications:   get('p-medications'),
      notes:         get('p-notes'),
      insurance:     get('p-insurance'),
      insuranceNum:  get('p-insurance-num'),
      clinic:        get('p-clinic'),
      insuranceExpiry: get('p-insurance-expiry'),
      privateInsurance: get('p-private-ins'),
      policyNum:     get('p-policy-num'),
      coverage:      get('p-coverage'),
      policyExpiry:  get('p-policy-expiry'),
    };
  }

  /* ── Guardar paciente ── */
  async _save() {
    if (this.saving) return;
    const data = this._collectData();

    this.saving = true;
    const btn = document.getElementById('btn-next');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;"></div> Guardando…`; }

    const res = this.isEdit
      ? await API.put(`/patients/${this.params.id}`, data)
      : await API.post('/patients', data);

    this.saving = false;
    if (btn) { btn.disabled = false; btn.innerHTML = this.isEdit ? 'Actualizar paciente' : 'Registrar paciente'; }

    if (res.success) {
      Toast.success(this.isEdit ? 'Paciente actualizado correctamente' : 'Paciente registrado exitosamente');
      setTimeout(() => {
        const id = res.data?.id || this.params.id;
        window.location.href = id
          ? `/pages/patients/profile.html?id=${id}`
          : '/pages/patients/index.html';
      }, 1000);
    } else {
      // Demo fallback
      Toast.success(this.isEdit ? 'Paciente actualizado (modo demo)' : 'Paciente registrado (modo demo)');
      setTimeout(() => window.location.href = '/pages/patients/index.html', 1200);
    }
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    // Siguiente / Guardar
    document.getElementById('btn-next')?.addEventListener('click', () => {
      if (!this._validateStep()) {
        Toast.error('Corrige los errores antes de continuar');
        return;
      }
      if (this.step < this.totalSteps) {
        this._goToStep(this.step + 1);
      } else {
        this._save();
      }
    });

    // Anterior
    document.getElementById('btn-prev')?.addEventListener('click', () => {
      if (this.step > 1) this._goToStep(this.step - 1);
    });

    // Guardar borrador
    document.getElementById('btn-save-draft')?.addEventListener('click', () => {
      const data = this._collectData();
      localStorage.setItem('mc_patient_draft', JSON.stringify(data));
      Toast.info('Borrador guardado localmente');
    });

    // IMC auto-calc
    ['p-weight','p-height'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const w = parseFloat(document.getElementById('p-weight')?.value);
        const h = parseFloat(document.getElementById('p-height')?.value);
        const el = document.getElementById('p-imc-display');
        if (!el || !w || !h) return;
        const imc = w / ((h/100) ** 2);
        const cat = imc < 18.5 ? 'Bajo peso' : imc < 25 ? 'Normal' : imc < 30 ? 'Sobrepeso' : 'Obesidad';
        const col = imc < 18.5 ? '#5599ff' : imc < 25 ? 'var(--accent-green)' : imc < 30 ? 'var(--accent-amber)' : 'var(--accent-red)';
        el.innerHTML = `IMC: <strong style="color:${col}">${imc.toFixed(1)}</strong> — ${cat}`;
      });
    });

    // CURP auto-uppercase
    document.getElementById('p-curp')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Agregar alergia
    const addAllergy = () => {
      const input = document.getElementById('allergy-input');
      const val   = input?.value?.trim();
      if (!val) return;
      const list = document.getElementById('allergies-list');
      if (!list) return;

      const placeholder = list.querySelector('span');
      if (placeholder) placeholder.remove();

      const tag = document.createElement('span');
      tag.className = 'alert-tag alert-allergy';
      tag.dataset.allergy = val;
      tag.innerHTML = `⚠ ${val} <button data-allergy="${val}" style="margin-left:4px;font-size:0.9rem;line-height:1;">×</button>`;
      tag.querySelector('button').addEventListener('click', () => {
        tag.remove();
        if (!list.querySelector('.alert-tag')) {
          list.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">Sin alergias registradas</span>`;
        }
      });
      list.appendChild(tag);
      if (input) input.value = '';
    };

    document.getElementById('btn-add-allergy')?.addEventListener('click', addAllergy);
    document.getElementById('allergy-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addAllergy(); }
    });

    // Limpiar errores al escribir
    document.querySelectorAll('.form-input, .form-select').forEach(el => {
      el.addEventListener('input', () => DOM.setError(el.id, ''));
      el.addEventListener('change', () => DOM.setError(el.id, ''));
    });
  }
}
