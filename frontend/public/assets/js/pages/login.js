/**
 * MediCore SaaS — login.js
 * Lógica completa de la página de login
 */

import { Auth }  from '../core/auth.js';
import { Toast } from '../components/toast.js';
import { LoginScene } from '../three/login-scene.js';

/* ── Inicializar escena Three.js ── */
function initScene() {
  if (typeof THREE === 'undefined') return;
  try { new LoginScene('login-canvas'); } catch (e) {
    console.warn('[MediCore] Three.js scene error:', e);
  }
}

/* ── Animaciones de entrada escalonadas ── */
function runEntryAnimations() {
  const els = document.querySelectorAll('[data-animate]');
  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    setTimeout(() => {
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 100 + i * 120);
  });
}

/* ── Toggle visibilidad de contraseña ── */
function initPasswordToggle() {
  const toggle = document.getElementById('toggle-password');
  const input  = document.getElementById('password');
  if (!toggle || !input) return;

  toggle.addEventListener('click', () => {
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    toggle.innerHTML = isText
      ? `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`
      : `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>`;
  });
}

/* ── Validación del formulario ── */
function validateForm(email, password) {
  const errors = [];

  if (!email) {
    errors.push('El correo electrónico es requerido.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Ingresa un correo electrónico válido.');
  }

  if (!password) {
    errors.push('La contraseña es requerida.');
  } else if (password.length < 6) {
    errors.push('La contraseña debe tener al menos 6 caracteres.');
  }

  return errors;
}

/* ── Estado del botón de submit ── */
function setLoading(loading) {
  const btn      = document.getElementById('login-btn');
  const btnText  = document.getElementById('btn-text');
  const btnLoader= document.getElementById('btn-loader');

  if (!btn) return;

  btn.disabled = loading;
  if (btnText)  btnText.style.display  = loading ? 'none' : 'block';
  if (btnLoader)btnLoader.style.display = loading ? 'flex' : 'none';
}

/* ── Mostrar error de campo ── */
function setFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  const errEl = document.getElementById(`${fieldId}-error`);

  if (field) {
    field.style.borderColor = message
      ? 'var(--accent-red)'
      : 'var(--border-dim)';
  }
  if (errEl) {
    errEl.textContent = message || '';
    errEl.style.display = message ? 'block' : 'none';
  }
}

/* ── Limpiar errores ── */
function clearErrors() {
  ['email', 'password'].forEach(f => setFieldError(f, ''));
}

/* ── Animación de éxito ── */
function playSuccessAnimation(callback) {
  const panel = document.querySelector('.login-panel');
  if (panel) {
    panel.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
    panel.style.transform  = 'scale(1.03)';
    panel.style.opacity    = '0';
  }
  setTimeout(callback, 500);
}

/* ── Submit handler ── */
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();

  const email    = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  // Validar
  const errors = validateForm(email, password);
  if (errors.length) {
    errors.forEach(err => Toast.error(err));
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('email', 'Correo inválido');
    }
    if (!password || password.length < 6) {
      setFieldError('password', 'Contraseña muy corta');
    }
    return;
  }

  setLoading(true);

  const result = await Auth.login(email, password);

  setLoading(false);

  if (result.success) {
    Toast.success(`Bienvenido, ${result.user.name.split(' ')[0]}`);
    playSuccessAnimation(() => Auth.redirectAfterLogin(result.user));
  } else {
    Toast.error(result.message || 'Error al iniciar sesión');
    setFieldError('password', result.message || 'Credenciales incorrectas');

    // Agitar panel
    const panel = document.querySelector('.login-panel');
    if (panel) {
      panel.style.animation = 'none';
      panel.offsetHeight; // reflow
      panel.style.animation = 'shake 0.4s ease';
    }
  }
}

/* ── Demo login (datos de prueba) ── */
async function handleDemoLogin(role) {
  const demos = {
    doctor:     { email: 'doctor@medicore.demo',     password: 'Demo2024!' },
    admin:      { email: 'admin@medicore.demo',       password: 'Demo2024!' },
    nurse:      { email: 'enfermera@medicore.demo',   password: 'Demo2024!' },
    patient:    { email: 'paciente@medicore.demo',    password: 'Demo2024!' },
    superadmin: { email: 'superadmin@medicore.demo',  password: 'Demo2024!' },
  };

  const creds = demos[role];
  if (!creds) return;

  document.getElementById('email').value    = creds.email;
  document.getElementById('password').value = creds.password;

  Toast.info(`Cargando demo de ${role}…`);
  await new Promise(r => setTimeout(r, 600));
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}

/* ── Inicialización ── */
document.addEventListener('DOMContentLoaded', () => {
  // Si ya está autenticado, redirigir
  if (Auth.isAuthenticated()) {
    const user = Auth.getUser();
    if (user) { Auth.redirectAfterLogin(user); return; }
  }

  initScene();
  runEntryAnimations();
  initPasswordToggle();

  // Bind form
  const form = document.getElementById('login-form');
  if (form) form.addEventListener('submit', handleLogin);

  // Bind demo buttons
  document.querySelectorAll('[data-demo-role]').forEach(btn => {
    btn.addEventListener('click', () => handleDemoLogin(btn.dataset.demoRole));
  });

  // Limpiar error al escribir
  ['email', 'password'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => setFieldError(id, ''));
  });
});
