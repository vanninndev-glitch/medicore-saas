/**
 * MediCore SaaS — pages/profile/index.js
 * Perfil del usuario: datos reales (/auth/me) + cambio de contraseña
 */
import { API }   from '../../core/api.js';
import { Auth }  from '../../core/auth.js';
import { Toast } from '../../components/toast.js';

export class ProfileModule {
  async init() {
    const pc = document.getElementById('page-content');
    if (!pc) return;

    const res  = await API.get('/auth/me');
    const u    = res.success ? res.data : Auth.getUser();

    pc.innerHTML = `
      <div style="max-width:520px;">
        <h1 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:1.25rem;">👤 Mi Perfil</h1>

        <div class="chart-panel" style="margin-bottom:1.25rem;">
          ${[['Nombre',u.name],['Email',u.email],['Rol',u.role],['Hospital',u.hospital_name||'—']]
            .map(([l,v]) => `<div class="mini-metric"><span class="mini-metric-label">${l}</span><span>${v}</span></div>`).join('')}
        </div>

        <div class="chart-panel">
          <div class="chart-title" style="margin-bottom:1rem;">Cambiar contraseña</div>
          <div class="form-group">
            <label class="form-label">Contraseña actual</label>
            <input id="cur-pass" type="password" class="form-input"/>
          </div>
          <div class="form-group">
            <label class="form-label">Nueva contraseña (mín. 8 caracteres)</label>
            <input id="new-pass" type="password" class="form-input"/>
          </div>
          <button id="btn-change-pass" class="btn btn-primary" style="margin-top:0.5rem;">Actualizar contraseña</button>
        </div>
      </div>`;

    document.getElementById('btn-change-pass').addEventListener('click', async () => {
      const currentPassword = document.getElementById('cur-pass').value;
      const newPassword     = document.getElementById('new-pass').value;
      if (!currentPassword || newPassword.length < 8) {
        Toast.error('Completa ambos campos (nueva contraseña: mín. 8 caracteres)');
        return;
      }
      const r = await API.put('/auth/change-password', { currentPassword, newPassword });
      if (r.success) {
        Toast.success('Contraseña actualizada correctamente');
        document.getElementById('cur-pass').value = '';
        document.getElementById('new-pass').value = '';
      } else {
        Toast.error(r.message || 'No se pudo actualizar la contraseña');
      }
    });
  }
}
