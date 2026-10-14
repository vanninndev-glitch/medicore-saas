/**
 * MediCore SaaS — sidebar.js
 * Componente de navegación lateral completo
 * Menú dinámico según rol, submenús, collapse, mobile, tooltips
 */

import { Auth }  from '../core/auth.js';
import { Store } from '../core/store.js';

/* ══════════════════════════════════════════════════════════════
   MAPA DE NAVEGACIÓN COMPLETO POR ROL
   Cada item: { id, label, icon, href, badge?, children?, roles? }
══════════════════════════════════════════════════════════════ */
const NAV_MAP = [
  {
    group: 'Principal',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/pages/dashboard.html',
        icon: iconDashboard(),
        roles: ['superadmin','hospital_admin','medical_director','doctor','nurse',
                'receptionist','records_admin','patient_admin','lab_technician','pharmacist'],
      },
    ],
  },
  {
    group: 'Clínico',
    roles: ['superadmin','hospital_admin','medical_director','doctor','nurse',
            'records_admin','patient_admin'],
    items: [
      {
        id: 'patients',
        label: 'Pacientes',
        icon: iconPatients(),
        href: '/pages/patients/index.html',
        badge: null,
        children: [
          { label: 'Lista de pacientes',    href: '/pages/patients/index.html' },
          { label: 'Registrar paciente',    href: '/pages/patients/register.html' },
          { label: 'Traslados de área',     href: '/pages/patients/transfers.html' },
          { label: 'Índice maestro (MPI)',  href: '/pages/patients/mpi.html' },
        ],
      },
      {
        id: 'records',
        label: 'Historial Clínico',
        icon: iconRecords(),
        href: '/pages/records/index.html',
        children: [
          { label: 'Expedientes',           href: '/pages/records/index.html' },
          { label: 'Nueva nota SOAP',       href: '/pages/records/new-note.html' },
          { label: 'Antecedentes',          href: '/pages/records/antecedents.html' },
          { label: 'Interconsultas',        href: '/pages/records/interconsults.html' },
          { label: 'Resumen de egreso',     href: '/pages/records/discharge.html' },
        ],
      },
      {
        id: 'appointments',
        label: 'Citas y Agenda',
        icon: iconCalendar(),
        href: '/pages/appointments/index.html',
        children: [
          { label: 'Calendario',            href: '/pages/appointments/index.html' },
          { label: 'Nueva cita',            href: '/pages/appointments/new.html' },
          { label: 'Lista de espera',       href: '/pages/appointments/waitlist.html' },
          { label: 'Telemedicina',          href: '/pages/appointments/telemedicine.html' },
        ],
      },
      {
        id: 'hospitalizations',
        label: 'Hospitalización',
        icon: iconBed(),
        href: '/pages/hospitalizations/index.html',
        children: [
          { label: 'Camas / mapa',          href: '/pages/hospitalizations/beds.html' },
          { label: 'Ingresos activos',      href: '/pages/hospitalizations/active.html' },
          { label: 'UCI / Terapia Int.',    href: '/pages/hospitalizations/icu.html' },
          { label: 'Maternidad / NICU',     href: '/pages/hospitalizations/maternity.html' },
          { label: 'Altas médicas',         href: '/pages/hospitalizations/discharge.html' },
        ],
      },
      {
        id: 'urgencies',
        label: 'Urgencias',
        icon: iconUrgency(),
        href: '/pages/urgencies/index.html',
        badge: '0',
        badgeType: 'red',
        children: [
          { label: 'Triaje activo',         href: '/pages/urgencies/triage.html' },
          { label: 'Cola de espera',        href: '/pages/urgencies/queue.html' },
          { label: 'Admitir paciente',      href: '/pages/urgencies/admit.html' },
        ],
      },
      {
        id: 'surgeries',
        label: 'Quirófano',
        icon: iconSurgery(),
        href: '/pages/surgeries/index.html',
        roles: ['superadmin','hospital_admin','medical_director','doctor'],
        children: [
          { label: 'Agenda quirúrgica',     href: '/pages/surgeries/schedule.html' },
          { label: 'Actas operatorias',     href: '/pages/surgeries/records.html' },
          { label: 'Plan anestésico',       href: '/pages/surgeries/anesthesia.html' },
        ],
      },
    ],
  },
  {
    group: 'Diagnóstico',
    roles: ['superadmin','hospital_admin','medical_director','doctor','nurse',
            'lab_technician'],
    items: [
      {
        id: 'lab',
        label: 'Laboratorio',
        icon: iconLab(),
        href: '/pages/lab/index.html',
        children: [
          { label: 'Solicitudes',           href: '/pages/lab/orders.html' },
          { label: 'Resultados',            href: '/pages/lab/results.html' },
          { label: 'Banco de sangre',       href: '/pages/lab/blood-bank.html' },
          { label: 'Valores de referencia', href: '/pages/lab/references.html' },
        ],
      },
      {
        id: 'imaging',
        label: 'Imagen / DICOM',
        icon: iconImaging(),
        href: '/pages/imaging/index.html',
        children: [
          { label: 'Solicitudes imagen',    href: '/pages/imaging/orders.html' },
          { label: 'Visor DICOM',           href: '/pages/imaging/viewer.html' },
          { label: 'Informes radiológicos', href: '/pages/imaging/reports.html' },
        ],
      },
      {
        id: 'pathology',
        label: 'Patología',
        icon: iconPathology(),
        href: '/pages/pathology/index.html',
        roles: ['superadmin','hospital_admin','medical_director','doctor'],
      },
    ],
  },
  {
    group: 'Farmacia y Nutrición',
    roles: ['superadmin','hospital_admin','medical_director','doctor','nurse','pharmacist'],
    items: [
      {
        id: 'pharmacy',
        label: 'Farmacia',
        icon: iconPharmacy(),
        href: '/pages/pharmacy/index.html',
        children: [
          { label: 'Recetas pendientes',    href: '/pages/pharmacy/pending.html' },
          { label: 'Dispensación',          href: '/pages/pharmacy/dispense.html' },
          { label: 'Inventario',            href: '/pages/pharmacy/inventory.html' },
          { label: 'Medicamentos',          href: '/pages/pharmacy/medications.html' },
        ],
      },
      {
        id: 'nutrition',
        label: 'Nutrición',
        icon: iconNutrition(),
        href: '/pages/nutrition/index.html',
        roles: ['superadmin','hospital_admin','doctor','nurse'],
      },
      {
        id: 'rehabilitation',
        label: 'Rehabilitación',
        icon: iconRehab(),
        href: '/pages/rehabilitation/index.html',
        roles: ['superadmin','hospital_admin','doctor','nurse'],
      },
    ],
  },
  {
    group: 'Documentos',
    roles: ['superadmin','hospital_admin','medical_director','doctor','nurse',
            'records_admin','patient_admin'],
    items: [
      {
        id: 'documents',
        label: 'Documentos',
        icon: iconDocuments(),
        href: '/pages/documents/index.html',
        children: [
          { label: 'Todos los documentos',  href: '/pages/documents/index.html' },
          { label: 'Subir documento',       href: '/pages/documents/upload.html' },
          { label: 'Incapacidades',         href: '/pages/documents/disabilities.html' },
          { label: 'Consentimientos',       href: '/pages/documents/consents.html' },
          { label: 'Recetas digitales',     href: '/pages/documents/prescriptions.html' },
        ],
      },
    ],
  },
  {
    group: 'Administrativo',
    roles: ['superadmin','hospital_admin','medical_director','receptionist',
            'patient_admin','records_admin'],
    items: [
      {
        id: 'admissions',
        label: 'Admisiones',
        icon: iconAdmissions(),
        href: '/pages/admissions/index.html',
      },
      {
        id: 'billing',
        label: 'Facturación',
        icon: iconBilling(),
        href: '/pages/billing/index.html',
        roles: ['superadmin','hospital_admin','receptionist'],
        children: [
          { label: 'Cargos y cobros',       href: '/pages/billing/charges.html' },
          { label: 'CFDI / Facturas',       href: '/pages/billing/cfdi.html' },
          { label: 'Seguros médicos',       href: '/pages/billing/insurance.html' },
          { label: 'Reportes financieros',  href: '/pages/billing/reports.html' },
        ],
      },
      {
        id: 'social-work',
        label: 'Trabajo Social',
        icon: iconSocialWork(),
        href: '/pages/social-work/index.html',
        roles: ['superadmin','hospital_admin','medical_director'],
      },
      {
        id: 'hr',
        label: 'RRHH / Personal',
        icon: iconHR(),
        href: '/pages/hr/index.html',
        roles: ['superadmin','hospital_admin'],
        children: [
          { label: 'Directorio personal',   href: '/pages/hr/directory.html' },
          { label: 'Turnos y guardias',     href: '/pages/hr/shifts.html' },
          { label: 'Nómina',                href: '/pages/hr/payroll.html' },
        ],
      },
      {
        id: 'inventory',
        label: 'Almacén / Compras',
        icon: iconInventory(),
        href: '/pages/inventory/index.html',
        roles: ['superadmin','hospital_admin'],
      },
    ],
  },
  {
    group: 'Calidad e Investigación',
    roles: ['superadmin','hospital_admin','medical_director'],
    items: [
      {
        id: 'quality',
        label: 'Calidad / Auditoría',
        icon: iconQuality(),
        href: '/pages/quality/index.html',
      },
      {
        id: 'research',
        label: 'Investigación',
        icon: iconResearch(),
        href: '/pages/research/index.html',
      },
      {
        id: 'teaching',
        label: 'Enseñanza / Residencia',
        icon: iconTeaching(),
        href: '/pages/teaching/index.html',
      },
    ],
  },
  {
    group: 'Reportes',
    roles: ['superadmin','hospital_admin','medical_director','doctor'],
    items: [
      {
        id: 'reports',
        label: 'Reportes y Analytics',
        icon: iconReports(),
        href: '/pages/reports/index.html',
        children: [
          { label: 'Dashboard ejecutivo',   href: '/pages/reports/executive.html' },
          { label: 'Productividad médica',  href: '/pages/reports/productivity.html' },
          { label: 'Diagnósticos (ICD-10)', href: '/pages/reports/diagnoses.html' },
          { label: 'Ocupación de camas',    href: '/pages/reports/beds.html' },
          { label: 'Exportar datos',        href: '/pages/reports/export.html' },
        ],
      },
    ],
  },
  {
    group: 'Superadmin',
    roles: ['superadmin'],
    items: [
      {
        id: 'tenants',
        label: 'Hospitales / Tenants',
        icon: iconTenants(),
        href: '/pages/superadmin/tenants.html',
      },
      {
        id: 'saas-billing',
        label: 'Facturación SaaS',
        icon: iconSaasBilling(),
        href: '/pages/superadmin/billing.html',
      },
      {
        id: 'global-metrics',
        label: 'Métricas Globales',
        icon: iconGlobalMetrics(),
        href: '/pages/superadmin/metrics.html',
      },
      {
        id: 'plugin-system',
        label: 'Plugin System',
        icon: iconPlugins(),
        href: '/pages/superadmin/plugins.html',
      },
    ],
  },
  {
    group: 'Configuración',
    items: [
      {
        id: 'hospital-config',
        label: 'Config. Hospital',
        icon: iconConfig(),
        href: '/pages/config/hospital.html',
        roles: ['superadmin','hospital_admin'],
        children: [
          { label: 'General',               href: '/pages/config/hospital.html' },
          { label: 'Módulos activos',       href: '/pages/config/modules.html' },
          { label: 'Áreas y servicios',     href: '/pages/config/areas.html' },
          { label: 'Tipos de cita',         href: '/pages/config/appointment-types.html' },
          { label: 'Integraciones',         href: '/pages/config/integrations.html' },
          { label: 'Webhooks',              href: '/pages/config/webhooks.html' },
        ],
      },
      {
        id: 'my-profile',
        label: 'Mi Perfil',
        icon: iconProfile(),
        href: '/pages/profile/index.html',
      },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════
   ÍCONOS SVG (inline, 20×20)
══════════════════════════════════════════════════════════════ */
function svg(path, extra = '') {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" ${extra}>${path}</svg>`;
}

function iconDashboard()    { return svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'); }
function iconPatients()     { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>'); }
function iconRecords()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>'); }
function iconCalendar()     { return svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-linecap="round"/>'); }
function iconBed()          { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M3 12V8a4 4 0 014-4h10a4 4 0 014 4v4M3 12v6m18-6v6M3 18h18"/><circle cx="9" cy="10" r="1" fill="currentColor"/>'); }
function iconUrgency()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'); }
function iconSurgery()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v4l3 3"/>'); }
function iconLab()          { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3h6m-3 9v4m0 0l-2-2m2 2l2-2"/>'); }
function iconImaging()      { return svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 8v1M12 15v1M8 12h1M15 12h1"/>'); }
function iconPathology()    { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>'); }
function iconPharmacy()     { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 2v20M2 12h20"/><rect x="4" y="4" width="16" height="16" rx="8"/>'); }
function iconNutrition()    { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 2a9 9 0 019 9c0 4.5-3 8-7 9v2H10v-2c-4-1-7-4.5-7-9a9 9 0 019-9z"/>'); }
function iconRehab()        { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>'); }
function iconDocuments()    { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2zM10 13h4M10 17h4M10 9h1"/>'); }
function iconAdmissions()   { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>'); }
function iconBilling()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M9 14l2 2 4-4M7 4H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3m-7 0V2m0 2h6V2m0 2"/>'); }
function iconSocialWork()   { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>'); }
function iconHR()           { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>'); }
function iconInventory()    { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>'); }
function iconQuality()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>'); }
function iconResearch()     { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>'); }
function iconTeaching()     { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>'); }
function iconReports()      { return svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/>'); }
function iconTenants()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>'); }
function iconSaasBilling()  { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'); }
function iconGlobalMetrics(){ return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'); }
function iconPlugins()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"/>'); }
function iconConfig()       { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>'); }
function iconProfile()      { return svg('<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>'); }

/* ══════════════════════════════════════════════════════════════
   CLASE PRINCIPAL SIDEBAR
══════════════════════════════════════════════════════════════ */
export class Sidebar {
  constructor() {
    this.user       = Auth.getUser();
    this.collapsed  = localStorage.getItem('mc_sidebar_collapsed') === 'true';
    this.mobileOpen = false;
    this.activeId   = this._resolveActiveId();
    this.openMenus  = new Set(JSON.parse(localStorage.getItem('mc_open_menus') || '[]'));

    this._render();
    this._bindEvents();
    this._watchStore();
    this._applyCollapsed();
  }

  /* ── Determinar item activo por URL ── */
  _resolveActiveId() {
    const path = window.location.pathname;
    for (const group of NAV_MAP) {
      for (const item of group.items) {
        if (item.href && path.includes(item.href.replace('/pages/', '').replace('.html', ''))) {
          return item.id;
        }
        if (item.children) {
          for (const child of item.children) {
            if (path.includes(child.href.replace('/pages/', '').replace('.html', ''))) {
              return item.id;
            }
          }
        }
      }
    }
    return 'dashboard';
  }

  /* ── Filtrar nav por rol del usuario ── */
  _allowedForRole(item) {
    if (!item.roles) return true;
    if (!this.user) return false;
    return item.roles.includes(this.user.role);
  }

  /* ── Renderizado del sidebar ── */
  _render() {
    const el = document.getElementById('sidebar');
    if (!el) return;

    el.className = `sidebar${this.collapsed ? ' collapsed' : ''}`;
    el.innerHTML = this._buildHTML();
    this.el = el;
  }

  _buildHTML() {
    const user = this.user || { name: 'Usuario', role: 'doctor', hospitalName: 'Hospital Demo' };
    const initials = user.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
    const roleLabels = {
      superadmin: 'Superadministrador', hospital_admin: 'Admin Hospital',
      medical_director: 'Director Médico', doctor: 'Médico',
      nurse: 'Enfermero/a', receptionist: 'Recepcionista',
      records_admin: 'Admin Historiales', patient_admin: 'Admin Pacientes',
      lab_technician: 'Técnico Lab.', pharmacist: 'Farmacéutico',
      patient: 'Paciente',
    };

    return `
      <!-- Header -->
      <div class="sidebar-header">
        <div class="sidebar-logo-mark">
          <svg width="22" height="22" fill="none" viewBox="0 0 28 28">
            <path d="M14 4v20M4 14h20" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="sidebar-logo-text">
          <div class="sidebar-logo-name">Medi<span style="color:var(--accent-cyan)">Core</span></div>
          <div class="sidebar-logo-sub">Sistema Hospitalario</div>
        </div>
      </div>

      <!-- Hospital activo -->
      <div class="sidebar-hospital">
        <div class="hospital-badge">
          <div class="hospital-dot"></div>
          <span class="hospital-name">${user.hospitalName || 'Hospital Demo'}</span>
        </div>
      </div>

      <!-- Navegación -->
      <nav class="sidebar-nav" role="navigation" aria-label="Menú principal">
        ${this._buildNav()}
      </nav>

      <!-- Usuario -->
      <div class="sidebar-user" id="sidebar-user-btn" role="button" aria-haspopup="true" aria-expanded="false">
        <div class="sidebar-user-avatar">${initials}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${user.name || 'Usuario'}</div>
          <div class="sidebar-user-role">${roleLabels[user.role] || user.role}</div>
        </div>
        <svg width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2" viewBox="0 0 24 24" class="nav-arrow">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>

        <!-- Menú de usuario -->
        <div class="user-menu" id="user-menu" role="menu">
          <a href="/pages/profile/index.html" class="user-menu-item" role="menuitem">
            ${iconProfile()}
            <span>Mi perfil</span>
          </a>
          <a href="/pages/config/hospital.html" class="user-menu-item" role="menuitem">
            ${iconConfig()}
            <span>Configuración</span>
          </a>
          <div style="height:1px;background:var(--border-subtle);margin:4px 0;"></div>
          <div class="user-menu-item danger" id="logout-btn" role="menuitem">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            <span>Cerrar sesión</span>
          </div>
        </div>
      </div>
    `;
  }

  _buildNav() {
    let html = '';

    for (const group of NAV_MAP) {
      // Filtrar grupo por rol
      if (group.roles && !group.roles.includes(this.user?.role) && this.user?.role !== 'superadmin') {
        continue;
      }

      // Filtrar items por rol
      const visibleItems = group.items.filter(item => this._allowedForRole(item));
      if (!visibleItems.length) continue;

      html += `<div class="nav-group">
        <div class="nav-group-title">${group.group}</div>`;

      for (const item of visibleItems) {
        const isActive   = this.activeId === item.id;
        const hasChildren = item.children?.length > 0;
        const isOpen     = this.openMenus.has(item.id);

        html += `
          <div class="nav-item${isActive ? ' active' : ''}${hasChildren && isOpen ? ' expanded' : ''}"
               data-id="${item.id}"
               ${item.href && !hasChildren ? `onclick="window.location='${item.href}'"` : ''}
               role="button"
               tabindex="0"
               aria-label="${item.label}"
               ${hasChildren ? `aria-expanded="${isOpen}"` : ''}>
            <span class="nav-item-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
            ${item.badge !== undefined && item.badge !== null
              ? `<span class="nav-badge${item.badgeType === 'cyan' ? ' cyan' : ''}" id="badge-${item.id}">${item.badge}</span>`
              : ''}
            ${hasChildren
              ? `<svg class="nav-arrow" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                 </svg>`
              : ''}
            <span class="nav-tooltip">${item.label}</span>
          </div>`;

        if (hasChildren) {
          html += `<div class="nav-submenu${isOpen ? ' open' : ''}" id="sub-${item.id}">`;
          for (const child of item.children) {
            const childActive = window.location.pathname.includes(
              child.href.replace('/pages/', '').replace('.html', '')
            );
            html += `
              <a href="${child.href}"
                 class="nav-sub-item${childActive ? ' active' : ''}"
                 tabindex="0">
                <span class="nav-sub-dot"></span>
                ${child.label}
              </a>`;
          }
          html += `</div>`;
        }
      }

      html += `</div>`;
    }

    return html;
  }

  /* ── Binding de eventos ── */
  _bindEvents() {
    if (!this.el) return;

    // Items con submenú
    this.el.querySelectorAll('.nav-item[data-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        const id  = item.dataset.id;
        const sub = document.getElementById(`sub-${id}`);
        if (!sub) return;

        e.stopPropagation();
        const isOpen = sub.classList.contains('open');

        if (isOpen) {
          sub.classList.remove('open');
          item.classList.remove('expanded');
          item.setAttribute('aria-expanded', 'false');
          this.openMenus.delete(id);
        } else {
          sub.classList.add('open');
          item.classList.add('expanded');
          item.setAttribute('aria-expanded', 'true');
          this.openMenus.add(id);
        }

        localStorage.setItem('mc_open_menus', JSON.stringify([...this.openMenus]));
      });

      // Keyboard accessibility
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });

    // Menú de usuario
    const userBtn  = document.getElementById('sidebar-user-btn');
    const userMenu = document.getElementById('user-menu');

    userBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = userMenu?.classList.toggle('open');
      userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', () => {
      userMenu?.classList.remove('open');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Auth.logout();
    });
  }

  /* ── Observar cambios en el store (notificaciones, urgencias, etc.) ── */
  _watchStore() {
    Store.on('urgencyCount', (count) => {
      const badge = document.getElementById('badge-urgencies');
      if (badge) {
        badge.textContent = count || '0';
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    });

    Store.on('user', () => this._render());
  }

  /* ── Toggle collapse ── */
  toggleCollapse() {
    this.collapsed = !this.collapsed;
    localStorage.setItem('mc_sidebar_collapsed', this.collapsed);
    this._applyCollapsed();
  }

  _applyCollapsed() {
    const sidebar = document.getElementById('sidebar');
    const topbar  = document.getElementById('topbar');
    const content = document.getElementById('main-content');

    if (!sidebar) return;

    if (this.collapsed) {
      sidebar.classList.add('collapsed');
      topbar?.classList.add('sidebar-collapsed');
      if (content) content.style.marginLeft = 'var(--sidebar-collapsed)';
    } else {
      sidebar.classList.remove('collapsed');
      topbar?.classList.remove('sidebar-collapsed');
      if (content) content.style.marginLeft = 'var(--sidebar-w)';
    }
  }

  /* ── Toggle mobile ── */
  toggleMobile() {
    this.mobileOpen = !this.mobileOpen;
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');

    sidebar?.classList.toggle('mobile-open', this.mobileOpen);
    overlay?.classList.toggle('visible', this.mobileOpen);
  }

  /* ── Actualizar badge de un módulo ── */
  updateBadge(moduleId, count) {
    const badge = document.getElementById(`badge-${moduleId}`);
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}
