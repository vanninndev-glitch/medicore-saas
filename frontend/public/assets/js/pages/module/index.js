/**
 * MediCore SaaS — pages/module/index.js
 * Motor universal de módulos: datos reales del backend + fallback demo
 */
import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';
import { Format, DateUtils } from '../../core/utils.js';

/* ─── Datos demo para cuando el backend no tiene registros ─── */
const DEMO = {
  beds: [
    {number:'A01',ward:'General',floor:'1',status:'occupied', patient_name:'María García'},
    {number:'A02',ward:'General',floor:'1',status:'available',patient_name:null},
    {number:'A03',ward:'UCI',    floor:'2',status:'occupied', patient_name:'Carlos Mendoza'},
    {number:'A04',ward:'UCI',    floor:'2',status:'cleaning', patient_name:null},
    {number:'B01',ward:'Maternidad',floor:'2',status:'occupied',patient_name:'Ana Jiménez'},
    {number:'B02',ward:'Maternidad',floor:'2',status:'reserved',patient_name:null},
    {number:'B03',ward:'Pediatría', floor:'3',status:'available',patient_name:null},
    {number:'B04',ward:'Cirugía',   floor:'3',status:'maintenance',patient_name:null},
  ],
  urgencies:[
    {patient_name:'Roberto Silva',  triage_level:1,reason:'Dolor torácico severo',  status:'in_treatment',minutes_waiting:5},
    {patient_name:'Lucía Hernández',triage_level:2,reason:'Fractura expuesta',       status:'in_triage',   minutes_waiting:12},
    {patient_name:'Pedro López',    triage_level:3,reason:'Fiebre alta 39.8°C',     status:'waiting',     minutes_waiting:28},
    {patient_name:'Carmen Ruiz',    triage_level:4,reason:'Dolor abdominal leve',   status:'waiting',     minutes_waiting:45},
    {patient_name:'Jorge Peña',     triage_level:5,reason:'Revisión de herida',     status:'waiting',     minutes_waiting:60},
  ],
  invoices:[
    {folio:'FAC-2024-000001',patient_name:'María García',  total:2500,paid:2500,balance:0,   status:'paid'},
    {folio:'FAC-2024-000002',patient_name:'Carlos Mendoza',total:8900,paid:4450,balance:4450,status:'partial'},
    {folio:'FAC-2024-000003',patient_name:'Ana Jiménez',   total:1200,paid:0,   balance:1200,status:'pending'},
    {folio:'FAC-2024-000004',patient_name:'Roberto Silva', total:15600,paid:15600,balance:0, status:'paid'},
  ],
  users:[
    {name:'Dr. Carlos Rodríguez',email:'doctor@medicore.demo',   role:'doctor',          status:'active'},
    {name:'Dra. Ana Martínez',   email:'doctor2@medicore.demo',  role:'doctor',          status:'active'},
    {name:'Enf. Patricia Romero',email:'enfermera@medicore.demo',role:'nurse',           status:'active'},
    {name:'Lic. Sofía Castro',   email:'recepcion@medicore.demo',role:'receptionist',    status:'active'},
    {name:'TLM. Jorge Flores',   email:'lab@medicore.demo',      role:'lab_technician',  status:'active'},
    {name:'QFB. Laura Sánchez',  email:'farmacia@medicore.demo', role:'pharmacist',      status:'active'},
  ],
  inventory:[
    {name:'Metformina',   presentation:'500mg tab',category:'Antidiabético', stock:450,min_stock:50, price:12.50,controlled:false},
    {name:'Losartán',     presentation:'50mg tab', category:'Antihipert.',   stock:320,min_stock:40, price:18.00,controlled:false},
    {name:'Clonazepam',   presentation:'0.5mg tab',category:'Ansiolítico',   stock:80, min_stock:20, price:15.00,controlled:true},
    {name:'Tramadol',     presentation:'50mg cap', category:'Analgésico',    stock:60, min_stock:15, price:28.00,controlled:true},
    {name:'Paracetamol',  presentation:'500mg tab',category:'Analgésico',    stock:800,min_stock:100,price:4.50, controlled:false},
    {name:'Amoxicilina',  presentation:'500mg cap',category:'Antibiótico',   stock:200,min_stock:30, price:9.00, controlled:false},
    {name:'Insulina NPH', presentation:'100UI/mL', category:'Insulina',      stock:45, min_stock:10, price:185,  controlled:false},
    {name:'Omeprazol',    presentation:'20mg cap', category:'Gastroprot.',   stock:500,min_stock:60, price:8.50, controlled:false},
  ],
  quality:[
    {label:'Reingresos 30 días',      value:'3.1%',  status:'ok'},
    {label:'Tiempo espera (min)',      value:'18 min',status:'ok'},
    {label:'Entrega lab',              value:'2.3 h', status:'ok'},
    {label:'Infecciones nosocomiales', value:'0.8%',  status:'ok'},
    {label:'Satisfacción paciente',    value:'94.2%', status:'ok'},
    {label:'Cirugías sin complicac.',  value:'98.2%', status:'ok'},
  ],
  surgeries:[
    {date:'2024-12-20 08:00',patient:'María García',   procedure:'Apendicectomía laparoscópica', surgeon:'Dr. Rodríguez',room:'Qx 1',status:'scheduled'},
    {date:'2024-12-20 10:30',patient:'Carlos Mendoza', procedure:'Colecistectomía',               surgeon:'Dra. Martínez', room:'Qx 2',status:'scheduled'},
    {date:'2024-12-20 14:00',patient:'Ana Jiménez',    procedure:'Cesárea electiva',              surgeon:'Dr. García',    room:'Qx 1',status:'scheduled'},
    {date:'2024-12-19 09:00',patient:'Roberto Silva',  procedure:'Hernioplastia',                 surgeon:'Dr. Rodríguez',room:'Qx 2',status:'completed'},
  ],
  shifts:[
    {name:'Dr. Carlos Rodríguez',role:'doctor',    shift:'Matutino 08:00-16:00',days:'Lun-Vie',status:'active'},
    {name:'Dra. Ana Martínez',   role:'doctor',    shift:'Vespertino 16:00-00:00',days:'Lun-Vie',status:'active'},
    {name:'Enf. Patricia Romero',role:'nurse',     shift:'Nocturno 00:00-08:00',  days:'Lun-Dom',status:'active'},
    {name:'TLM. Jorge Flores',   role:'lab_tech',  shift:'Matutino 07:00-15:00',  days:'Lun-Sáb',status:'active'},
  ],
  social:[
    {patient:'María García',   issue:'Apoyo económico',   status:'En proceso', worker:'TS. González'},
    {patient:'Roberto Silva',  issue:'Familiar en crisis', status:'Resuelto',   worker:'TS. González'},
    {patient:'Carmen López',   issue:'Violencia doméstica',status:'Activo',     worker:'TS. Pérez'},
  ],
  rehabilitation:[
    {patient:'Carlos Mendoza',diagnosis:'Post-quirúrgico rodilla',sessions:12,completed:8,therapist:'FT. Reyes',status:'En tratamiento'},
    {patient:'Ana Jiménez',   diagnosis:'Lumbalgia crónica',       sessions:20,completed:20,therapist:'FT. Reyes',status:'Alta'},
    {patient:'Roberto Silva', diagnosis:'ACV rehabilitación',      sessions:30,completed:5, therapist:'FT. Cruz', status:'En tratamiento'},
  ],
  nutrition:[
    {patient:'María García',   diagnosis:'DM2 + obesidad',diet:'Hipocalórica 1500 kcal',nutritionist:'LN. Flores',status:'Activo'},
    {patient:'Carlos Mendoza', diagnosis:'Post-quirúrgico',diet:'Blanda progresiva',    nutritionist:'LN. Flores',status:'Activo'},
    {patient:'Roberto Silva',  diagnosis:'HTA + dislipidemia',diet:'Hiposódica',        nutritionist:'LN. Torres',status:'Alta'},
  ],
};

/* ─── Configuración de módulos ─── */
const MODULES = {
  /* Hospitalizaciones */
  'hospitalizations/beds':     {title:'Gestión de Camas',      icon:'🏨',type:'beds',      endpoint:'/admissions/beds'},
  'hospitalizations/index':    {title:'Hospitalizaciones',      icon:'🏨',type:'beds',      endpoint:'/admissions/beds'},
  'hospitalizations/active':   {title:'Pacientes Hospitalizados',icon:'🏨',type:'beds',     endpoint:'/admissions/beds',filter:b=>b.status==='occupied'},
  'hospitalizations/icu':      {title:'UCI',                    icon:'🏥',type:'beds',      endpoint:'/admissions/beds',filter:b=>/UCI|ICU/i.test(b.ward||'')},
  'hospitalizations/maternity':{title:'Maternidad',             icon:'🤰',type:'beds',      endpoint:'/admissions/beds',filter:b=>/Mater/i.test(b.ward||'')},
  'hospitalizations/discharge':{title:'Altas Médicas',          icon:'🏨',type:'beds',      endpoint:'/admissions/beds',filter:b=>b.status==='available'},
  /* Urgencias */
  'urgencies/index':           {title:'Urgencias',              icon:'🚨',type:'urgencies', endpoint:'/admissions/urgencies'},
  'urgencies/triage':          {title:'Triaje',                 icon:'🚨',type:'urgencies', endpoint:'/admissions/urgencies'},
  'urgencies/queue':           {title:'Cola de Espera',         icon:'🚨',type:'urgencies', endpoint:'/admissions/urgencies'},
  'urgencies/admit':           {title:'Admisión a Urgencias',   icon:'🚨',type:'urgencies', endpoint:'/admissions/urgencies'},
  'patients/transfers':       {title:'Traslados de Pacientes', icon:'↔️',type:'beds',      endpoint:'/admissions/beds'},
  'admissions/index':          {title:'Admisiones',             icon:'🏨',type:'beds',      endpoint:'/admissions/beds'},
  /* Facturación */
  'billing/index':             {title:'Facturación',            icon:'💰',type:'invoices',  endpoint:'/billing'},
  'billing/charges':           {title:'Cargos y Cobros',        icon:'💰',type:'invoices',  endpoint:'/billing'},
  'billing/cfdi':              {title:'Facturación CFDI 4.0',   icon:'🧾',type:'invoices',  endpoint:'/billing'},
  'billing/insurance':         {title:'Seguros Médicos',        icon:'🩺',type:'invoices',  endpoint:'/billing'},
  'billing/reports':           {title:'Reportes de Facturación',icon:'📊',type:'invoices',  endpoint:'/billing'},
  /* RRHH */
  'hr/index':                  {title:'Recursos Humanos',       icon:'👥',type:'users',     endpoint:'/hospitals/users'},
  'hr/directory':              {title:'Directorio de Personal', icon:'👥',type:'users',     endpoint:'/hospitals/users'},
  'hr/shifts':                 {title:'Turnos del Personal',    icon:'🗓️',type:'shifts'},
  'hr/payroll':                {title:'Nómina',                 icon:'💵',type:'payroll'},
  /* Inventario */
  'inventory/index':           {title:'Inventario General',     icon:'📦',type:'inventory', endpoint:'/pharmacy/inventory'},
  'pharmacy/inventory':        {title:'Inventario de Farmacia', icon:'💊',type:'inventory', endpoint:'/pharmacy/inventory'},
  'pharmacy/medications':      {title:'Catálogo de Medicamentos',icon:'💊',type:'inventory',endpoint:'/pharmacy/inventory'},
  /* Quirófano */
  'surgeries/index':           {title:'Quirófano',              icon:'🔪',type:'surgeries'},
  'surgeries/schedule':        {title:'Agenda Quirúrgica',      icon:'🔪',type:'surgeries'},
  'surgeries/records':         {title:'Actas Operatorias',      icon:'🔪',type:'surgeries'},
  'surgeries/anesthesia':      {title:'Plan Anestésico',        icon:'💉',type:'anesthesia'},
  /* Calidad */
  'quality/index':             {title:'Indicadores de Calidad', icon:'📊',type:'quality',   endpoint:'/reports/quality'},
  /* Config */
  'config/hospital':           {title:'Configuración del Hospital',icon:'⚙️',type:'config', endpoint:'/hospitals/config'},
  'config/modules':            {title:'Módulos Activos',         icon:'🧩',type:'config',   endpoint:'/hospitals/config'},
  /* Clínicos especializados */
  'social-work/index':         {title:'Trabajo Social',          icon:'🤝',type:'social'},
  'rehabilitation/index':      {title:'Rehabilitación',          icon:'🦾',type:'rehabilitation'},
  'nutrition/index':           {title:'Nutrición',               icon:'🥗',type:'nutrition'},
};

/* ─── Placeholders para módulos aún no implementados en backend ─── */
const PLACEHOLDER = {
  'appointments/telemedicine': ['Telemedicina','🌐','Consultas por videollamada con seguimiento remoto'],
  'appointments/waitlist':     ['Lista de Espera','📋','Control de pacientes en espera de cita'],
  'config/appointment-types':  ['Tipos de Cita','⚙️','Configura duraciones y tipos de consulta'],
  'config/areas':              ['Áreas del Hospital','⚙️','Gestión de áreas, plantas y servicios'],
  'config/integrations':       ['Integraciones','🔌','Conexiones con laboratorios y sistemas externos'],
  'config/webhooks':           ['Webhooks','🔌','Notificaciones automáticas a sistemas externos'],
  'imaging/index':             ['Radiología / DICOM','🩻','Solicitudes de imagen y visor DICOM integrado'],
  'imaging/orders':            ['Solicitudes de Imagen','🩻','Gestión de solicitudes radiológicas'],
  'imaging/reports':           ['Informes Radiológicos','🩻','Redacción y firma de informes'],
  'imaging/viewer':            ['Visor DICOM','🩻','Visualización de estudios de imagen'],
  'lab/blood-bank':            ['Banco de Sangre','🩸','Control de unidades y compatibilidad'],
  'pathology/index':           ['Patología','🔬','Solicitudes y resultados de biopsia'],
  'research/index':            ['Investigación Clínica','🔬','Protocolos y ensayos clínicos'],
  'teaching/index':            ['Enseñanza Médica','🎓','Casos clínicos y formación de residentes'],
};

export class GenericModule {
  constructor() {
    // /pages/urgencies/index.html -> urgencies/index
    const raw = window.location.pathname.replace(/^\/pages\//,'').replace(/\.html$/,'');
    this.slug = raw;
    this.cfg  = MODULES[this.slug];
    this.ph   = PLACEHOLDER[this.slug];
  }

  async init() {
    const pc = document.getElementById('page-content');
    if (!pc) return;
    if (this.cfg) return this._render(pc);
    return this._placeholder(pc);
  }

  async _render(pc) {
    const { title, icon, type, endpoint, filter } = this.cfg;

    pc.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;">
        <h1 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;color:#fff;">${icon} ${title}</h1>
        <div class="flex gap-2" id="module-actions"></div>
      </div>
      <div id="module-body"><div style="text-align:center;padding:3rem;color:var(--text-muted);">
        <div class="loader" style="margin:0 auto 1rem;"></div>Cargando datos…
      </div></div>`;

    /* Intentar datos reales, fallback a demo */
    let data = null;
    if (endpoint) {
      const r = await API.get(endpoint + '?limit=100');
      data = r.success ? r.data : null;
    }

    const body    = document.getElementById('module-body');
    const actions = document.getElementById('module-actions');

    /* ── CAMAS ── */
    if (type === 'beds') {
      let beds = data?.beds || DEMO.beds;
      if (filter) beds = beds.filter(filter);
      const summary = ['available','occupied','reserved','cleaning','maintenance']
        .map(s => [s, beds.filter(b=>b.status===s).length]);

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
          ${[['Disponibles','available','kpi-green'],['Ocupadas','occupied','kpi-red'],
             ['Reservadas','reserved','kpi-amber'],['Limpieza','cleaning','kpi-blue'],['Mant.','maintenance','kpi-purple']]
            .map(([l,s,cls]) => `<div class="kpi-card ${cls}" style="cursor:default;">
              <div class="kpi-label">${l}</div>
              <div class="kpi-value" style="font-size:1.5rem;">${beds.filter(b=>b.status===s).length}</div></div>`).join('')}
        </div>
        ${this._table(['Cama','Área','Piso','Estado','Paciente','Acciones'],
          beds.map(b => [b.number, b.ward||'—', b.floor||'1',
            this._badge(b.status, {available:'badge-green',occupied:'badge-red',reserved:'badge-amber',cleaning:'badge-blue',maintenance:'badge-purple'}),
            b.patient_name||'—',
            `<button class="btn btn-ghost btn-sm" style="font-size:0.7rem;">Ver detalle</button>`]))}`;
    }

    /* ── URGENCIAS ── */
    else if (type === 'urgencies') {
      const urg = data?.urgencies || DEMO.urgencies;
      const triageColors = {1:'#ff4757',2:'#ff8c00',3:'#ffb300',4:'#00c4a7',5:'#1a6fff'};
      const triageLabels = {1:'Resucitación',2:'Emergencia',3:'Urgente',4:'Menos urgente',5:'No urgente'};

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.6rem;margin-bottom:1.5rem;">
          ${[1,2,3,4,5].map(t => `<div style="background:${triageColors[t]}15;border:1px solid ${triageColors[t]}40;border-radius:8px;padding:0.65rem;text-align:center;">
            <div style="font-size:0.7rem;color:${triageColors[t]};font-weight:700;">Nivel ${t}</div>
            <div style="font-size:1.3rem;font-weight:800;color:#fff;">${urg.filter(u=>u.triage_level===t).length}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);">${triageLabels[t]}</div>
          </div>`).join('')}
        </div>
        ${this._table(['Paciente','Triaje','Motivo','Estado','Espera','Acciones'],
          urg.map(u => [u.patient_name,
            `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:700;color:${triageColors[u.triage_level]};">⬤ Nivel ${u.triage_level}</span>`,
            u.reason,
            this._badge(u.status,{waiting:'badge-amber',in_triage:'badge-blue',in_treatment:'badge-green'}),
            `${Math.round(u.minutes_waiting||0)} min`,
            `<button class="btn btn-primary btn-sm" style="font-size:0.7rem;">Atender</button>`]))}`;

      actions.innerHTML = `<button class="btn btn-primary" onclick="window.location='/pages/urgencies/admit.html'">+ Nuevo paciente</button>`;
    }

    /* ── FACTURAS ── */
    else if (type === 'invoices') {
      const inv = (Array.isArray(data) ? data : data?.invoices) || DEMO.invoices;
      const total  = inv.reduce((s,i)=>s+parseFloat(i.total||0),0);
      const cobrado= inv.reduce((s,i)=>s+parseFloat(i.paid||0),0);
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
          ${[['Total facturado',Format.currency(total),'kpi-blue'],
             ['Cobrado',Format.currency(cobrado),'kpi-green'],
             ['Por cobrar',Format.currency(total-cobrado),'kpi-amber'],
             ['Facturas',inv.length,'kpi-cyan']]
            .map(([l,v,c])=>`<div class="kpi-card ${c}" style="cursor:default;"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:1.3rem;">${v}</div></div>`).join('')}
        </div>
        ${this._table(['Folio','Paciente','Total','Pagado','Saldo','Estado'],
          inv.map(i=>[i.folio,i.patient_name||'—',Format.currency(i.total),Format.currency(i.paid),Format.currency(i.balance),
            this._badge(i.status,{paid:'badge-green',partial:'badge-amber',pending:'badge-red',cancelled:'badge-blue'})]))}`;
      actions.innerHTML = `<button class="btn btn-primary">+ Nuevo cargo</button>`;
    }

    /* ── USUARIOS / DIRECTORIO ── */
    else if (type === 'users') {
      const us = (Array.isArray(data) ? data : data?.users) || DEMO.users;
      const roleLabel = {doctor:'Doctor',nurse:'Enfermera',receptionist:'Recepcionista',lab_technician:'Lab. Técnico',pharmacist:'Farmacéutico',hospital_admin:'Administrador',medical_director:'Director Médico'};
      body.innerHTML = this._table(['Nombre','Email','Rol','Estado','Acciones'],
        us.map(u=>[u.name, u.email, roleLabel[u.role]||u.role,
          this._badge(u.status,{active:'badge-green',inactive:'badge-red',locked:'badge-amber'}),
          `<button class="btn btn-ghost btn-sm" style="font-size:0.7rem;">Editar</button>`]));
      actions.innerHTML = `<button class="btn btn-primary">+ Nuevo usuario</button>`;
    }

    /* ── INVENTARIO ── */
    else if (type === 'inventory') {
      const med = (Array.isArray(data) ? data : data?.medications) || DEMO.inventory;
      const low = med.filter(m=>m.stock<=m.min_stock);
      body.innerHTML = `
        ${low.length ? `<div style="background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem;color:var(--accent-red);">
          ⚠️ ${low.length} medicamento(s) con stock bajo: ${low.map(m=>m.name).join(', ')}</div>` : ''}
        ${this._table(['Medicamento','Presentación','Categoría','Stock','Mín.','Precio','Control'],
          med.map(m=>[m.name,m.presentation||'-',m.category||'-',
            `<span style="color:${m.stock<=m.min_stock?'var(--accent-red)':'var(--accent-green)'};font-weight:700;">${m.stock}</span>`,
            m.min_stock, Format.currency(m.price||0),
            m.controlled?'<span class="badge badge-red" style="font-size:0.65rem;">⚠ Controlado</span>':'<span style="color:var(--text-muted);font-size:0.8rem;">—</span>']))}`;
      actions.innerHTML = `<button class="btn btn-primary">+ Agregar medicamento</button>`;
    }

    /* ── QUIRÓFANO ── */
    else if (type === 'surgeries') {
      const surg = DEMO.surgeries;
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
          ${[['Programadas',surg.filter(s=>s.status==='scheduled').length,'kpi-cyan'],
             ['Completadas',surg.filter(s=>s.status==='completed').length,'kpi-green'],
             ['Quirófanos',2,'kpi-blue']]
            .map(([l,v,c])=>`<div class="kpi-card ${c}" style="cursor:default;"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:1.5rem;">${v}</div></div>`).join('')}
        </div>
        ${this._table(['Fecha','Paciente','Procedimiento','Cirujano','Sala','Estado'],
          surg.map(s=>[s.date,s.patient,s.procedure,s.surgeon,s.room,
            this._badge(s.status,{scheduled:'badge-amber',completed:'badge-green',cancelled:'badge-red'})]))}`;
      actions.innerHTML = `<button class="btn btn-primary">+ Programar cirugía</button>`;
    }

    /* ── ANESTESIA ── */
    else if (type === 'anesthesia') {
      body.innerHTML = `
        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">Plan Anestésico — Dr. Carlos Rodríguez · Hoy</div>
          ${this._table(['Paciente','Procedimiento','Técnica','ASA','Medicamentos','Estado'],
            [['María García','Apendicectomía','Anestesia general','II','Propofol 200mg, Fentanilo 100mcg','Programado'],
             ['Carlos Mendoza','Colecistectomía','Anestesia general','I','Propofol 150mg, Rocuronio 40mg','Programado'],
             ['Ana Jiménez','Cesárea','Raquídea','II','Bupivacaína 0.5% 12mg','Programado']]
            .map(r=>[...r.slice(0,5),`<span class="badge badge-amber" style="font-size:0.7rem;">${r[5]}</span>`]))}
        </div>`;
    }

    /* ── CALIDAD ── */
    else if (type === 'quality') {
      const ind = (data?.indicators) || DEMO.quality;
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem;">
          ${ind.map(i=>`<div class="chart-panel">
            <div style="font-size:0.8rem;color:var(--text-muted);">${i.label}</div>
            <div style="font-family:var(--font-display);font-size:2rem;font-weight:800;color:${i.status==='warn'?'var(--accent-amber)':'var(--accent-green)'};margin-top:0.25rem;">${i.value}</div>
            <div style="font-size:0.7rem;margin-top:0.25rem;">${i.status==='ok'?'<span class="badge badge-green" style="font-size:0.65rem;">✓ En meta</span>':'<span class="badge badge-amber" style="font-size:0.65rem;">⚠ Revisar</span>'}</div>
          </div>`).join('')}
        </div>`;
    }

    /* ── CONFIG ── */
    else if (type === 'config') {
      const h = data || {name:'Hospital Demo MediCore',plan:'enterprise',status:'active',userCount:11,patientCount:5,modules:{lab:true,pharmacy:true,billing:true,telemedicine:true}};
      body.innerHTML = `
        <div class="chart-panel" style="margin-bottom:1rem;">
          <div class="chart-title" style="margin-bottom:1rem;">Información del hospital</div>
          ${[['Nombre',h.name],['Plan',h.plan],['Estado',h.status],['Usuarios activos',h.userCount],['Pacientes',h.patientCount]]
            .map(([l,v])=>`<div class="mini-metric"><span class="mini-metric-label">${l}</span><span style="font-size:0.87rem;">${v}</span></div>`).join('')}
        </div>
        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">Módulos activos</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.5rem;">
            ${[['lab','🧪','Laboratorio'],['pharmacy','💊','Farmacia'],['billing','💰','Facturación'],
               ['telemedicine','🌐','Telemedicina'],['dicom','🩻','DICOM'],['hr','👥','RRHH']]
              .map(([k,icon,label])=>`<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid var(--border-subtle);border-radius:8px;">
                <span>${icon}</span><span style="font-size:0.83rem;">${label}</span>
                <span style="margin-left:auto;" class="badge ${h.modules?.[k]?'badge-green':'badge-red'}" style="font-size:0.65rem;">${h.modules?.[k]?'Activo':'Inactivo'}</span>
              </div>`).join('')}
          </div>
        </div>`;
    }

    /* ── TURNOS ── */
    else if (type === 'shifts') {
      body.innerHTML = this._table(['Personal','Rol','Turno','Días','Estado'],
        DEMO.shifts.map(s=>[s.name,s.role,s.shift,s.days,
          this._badge(s.status,{active:'badge-green'})]));
      actions.innerHTML = `<button class="btn btn-primary">+ Asignar turno</button>`;
    }

    /* ── NÓMINA ── */
    else if (type === 'payroll') {
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
          ${[['Total nómina',Format.currency(285400),'kpi-blue'],['Personal',11,'kpi-cyan'],['Período','Dic 2024','kpi-green']]
            .map(([l,v,c])=>`<div class="kpi-card ${c}" style="cursor:default;"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:1.3rem;">${v}</div></div>`).join('')}
        </div>
        ${this._table(['Empleado','Puesto','Salario base','IMSS','ISR','Neto'],
          [['Dr. Carlos Rodríguez','Médico internista',Format.currency(45000),Format.currency(3825),Format.currency(5200),Format.currency(35975)],
           ['Dra. Ana Martínez','Cardióloga',Format.currency(50000),Format.currency(4250),Format.currency(6100),Format.currency(39650)],
           ['Enf. Patricia Romero','Jefa de enfermería',Format.currency(22000),Format.currency(1870),Format.currency(1800),Format.currency(18330)],
           ['Lic. Sofía Castro','Recepcionista',Format.currency(12000),Format.currency(1020),Format.currency(600),Format.currency(10380)]])}`;
    }

    /* ── TRABAJO SOCIAL ── */
    else if (type === 'social') {
      body.innerHTML = this._table(['Paciente','Situación','Estado','Trabajadora social','Acciones'],
        DEMO.social.map(s=>[s.patient,s.issue,
          this._badge(s.status.toLowerCase().replace(' ','_'),{'en proceso':'badge-amber',resuelto:'badge-green',activo:'badge-blue'}),
          s.worker,`<button class="btn btn-ghost btn-sm" style="font-size:0.7rem;">Ver expediente</button>`]));
      actions.innerHTML = `<button class="btn btn-primary">+ Nuevo caso</button>`;
    }

    /* ── REHABILITACIÓN ── */
    else if (type === 'rehabilitation') {
      body.innerHTML = this._table(['Paciente','Diagnóstico','Sesiones','Avance','Terapeuta','Estado'],
        DEMO.rehabilitation.map(r=>[r.patient,r.diagnosis,`${r.completed}/${r.sessions}`,
          `<div style="background:rgba(255,255,255,0.05);border-radius:100px;height:6px;width:80px;overflow:hidden;"><div style="background:var(--accent-cyan);height:100%;width:${Math.round(r.completed/r.sessions*100)}%;"></div></div>`,
          r.therapist,this._badge(r.status.toLowerCase(),{'en tratamiento':'badge-cyan',alta:'badge-green'})]));
      actions.innerHTML = `<button class="btn btn-primary">+ Nuevo paciente</button>`;
    }

    /* ── NUTRICIÓN ── */
    else if (type === 'nutrition') {
      body.innerHTML = this._table(['Paciente','Diagnóstico','Dieta prescrita','Nutriólogo','Estado'],
        DEMO.nutrition.map(n=>[n.patient,n.diagnosis,n.diet,n.nutritionist,
          this._badge(n.status.toLowerCase(),{activo:'badge-cyan',alta:'badge-green'})]));
      actions.innerHTML = `<button class="btn btn-primary">+ Nueva consulta</button>`;
    }

    /* ── Fallback ── */
    else {
      body.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">Sin datos disponibles</div>`;
    }
  }

  _badge(status, map={}) {
    const defaultMap = {
      active:'badge-green',inactive:'badge-red',available:'badge-green',occupied:'badge-red',
      reserved:'badge-amber',cleaning:'badge-blue',maintenance:'badge-purple',
      waiting:'badge-amber',in_triage:'badge-blue',in_treatment:'badge-green',discharged:'badge-blue',
      pending:'badge-amber',paid:'badge-green',partial:'badge-amber',cancelled:'badge-red',
      completed:'badge-green',scheduled:'badge-amber',locked:'badge-amber',
    };
    const merged  = {...defaultMap,...map};
    const cls     = merged[status] || merged[(status||'').toLowerCase().replace(/\s+/g,'_')] || 'badge-blue';
    const labels  = {active:'Activo',inactive:'Inactivo',available:'Disponible',occupied:'Ocupado',reserved:'Reservado',
      cleaning:'Limpieza',maintenance:'Mantenimiento',waiting:'Esperando',in_triage:'En triaje',in_treatment:'En atención',
      discharged:'Alta',pending:'Pendiente',paid:'Pagado',partial:'Parcial',cancelled:'Cancelado',
      completed:'Completado',scheduled:'Programado',locked:'Bloqueado'};
    return `<span class="badge ${cls}" style="font-size:0.7rem;">${labels[status]||status}</span>`;
  }

  _table(headers, rows) {
    return `<div class="table-wrap"><table>
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="${headers.length}" style="text-align:center;padding:2rem;color:var(--text-muted);">Sin registros</td></tr>`}
      </tbody></table></div>`;
  }

  _placeholder(pc) {
    const [title,icon,desc='Módulo en desarrollo'] = this.ph || ['Módulo','🧩'];
    pc.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1rem;">
        <div style="font-size:3.5rem;opacity:0.5;">${icon}</div>
        <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;color:#fff;">${title}</div>
        <div style="color:var(--text-muted);max-width:400px;line-height:1.7;">${desc}</div>
        <div style="display:flex;gap:0.75rem;margin-top:0.5rem;flex-wrap:wrap;justify-content:center;">
          <a href="/pages/dashboard.html" class="btn btn-secondary">Volver al Dashboard</a>
        </div>
      </div>`;
  }
}
