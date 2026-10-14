/**
 * MediCore SaaS — dashboard-bg.js
 * Three.js fondo sutil del dashboard: moléculas, red de datos médicos
 */

export class DashboardScene {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.width  = window.innerWidth;
    this.height = window.innerHeight;
    this.frame  = 0;
    this.mouse  = { x: 0, y: 0 };

    this._init();
    this._buildParticleField();
    this._buildMolecules();
    this._buildDataLines();
    this._bindEvents();
    this._animate();
  }

  _init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 0);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, this.width / this.height, 0.1, 500);
    this.camera.position.z = 35;
  }

  /* ── Campo de partículas de fondo ── */
  _buildParticleField() {
    const count = 300;
    const pos   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 100;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x00d4ff,
      size: 0.08,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    }));

    this.scene.add(this.particles);

    // Partículas verdes
    const count2 = 120;
    const pos2   = new Float32Array(count2 * 3);
    for (let i = 0; i < count2; i++) {
      pos2[i * 3]     = (Math.random() - 0.5) * 80;
      pos2[i * 3 + 1] = (Math.random() - 0.5) * 70;
      pos2[i * 3 + 2] = (Math.random() - 0.5) * 40 - 15;
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    this.particles2 = new THREE.Points(geo2, new THREE.PointsMaterial({
      color: 0x00e5a0,
      size: 0.06,
      transparent: true,
      opacity: 0.2,
      sizeAttenuation: true,
    }));
    this.scene.add(this.particles2);
  }

  /* ── Moléculas flotantes ── */
  _buildMolecules() {
    this.moleculesGroup = new THREE.Group();
    this.moleculesGroup.position.set(14, 4, -12);

    const atomMat = new THREE.MeshBasicMaterial({ color: 0x1a6fff, transparent: true, opacity: 0.5 });
    const bondMat = new THREE.LineBasicMaterial({ color: 0x1a6fff, transparent: true, opacity: 0.15 });
    const atomGeo = new THREE.SphereGeometry(0.15, 8, 8);

    const atoms = [
      [0, 0, 0], [1.8, 0.8, 0], [-1.5, 1.2, 0.4],
      [0.6, -1.6, 0.8], [2.4, -0.6, -0.5], [-0.8, -0.9, -1.2],
      [1.2, 1.8, -0.8], [-2.1, -0.4, 0.6],
    ];

    const atomMeshes = atoms.map(([x, y, z]) => {
      const m = new THREE.Mesh(atomGeo, atomMat);
      m.position.set(x, y, z);
      this.moleculesGroup.add(m);
      return m.position;
    });

    // Bonds
    for (let i = 0; i < atomMeshes.length; i++) {
      for (let j = i + 1; j < atomMeshes.length; j++) {
        if (atomMeshes[i].distanceTo(atomMeshes[j]) < 2.5) {
          const geo = new THREE.BufferGeometry().setFromPoints([atomMeshes[i], atomMeshes[j]]);
          this.moleculesGroup.add(new THREE.Line(geo, bondMat));
        }
      }
    }

    this.scene.add(this.moleculesGroup);

    // Segunda molécula más pequeña
    this.molecule2 = new THREE.Group();
    this.molecule2.position.set(-16, -6, -8);

    const mat2 = new THREE.MeshBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.4 });
    const atoms2 = [[0,0,0],[1.2,0.7,0],[-1,0.9,0.3],[0.5,-1.2,0.6],[-0.6,-0.7,-0.8]];
    const pos2   = atoms2.map(([x,y,z]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat2);
      m.position.set(x, y, z);
      this.molecule2.add(m);
      return m.position;
    });

    const bondMat2 = new THREE.LineBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.1 });
    for (let i = 0; i < pos2.length; i++) {
      for (let j = i + 1; j < pos2.length; j++) {
        if (pos2[i].distanceTo(pos2[j]) < 1.8) {
          const geo = new THREE.BufferGeometry().setFromPoints([pos2[i], pos2[j]]);
          this.molecule2.add(new THREE.Line(geo, bondMat2));
        }
      }
    }
    this.scene.add(this.molecule2);
  }

  /* ── Líneas de datos (data flow) ── */
  _buildDataLines() {
    this.dataGroup = new THREE.Group();
    this.dataGroup.position.set(-10, 8, -18);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.06,
    });

    for (let i = 0; i < 12; i++) {
      const points = [];
      let x = (Math.random() - 0.5) * 30;
      let y = (Math.random() - 0.5) * 20;
      for (let j = 0; j < 8; j++) {
        points.push(new THREE.Vector3(x + j * 2.5, y + (Math.random() - 0.5) * 3, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this.dataGroup.add(new THREE.Line(geo, lineMat));
    }

    this.scene.add(this.dataGroup);
  }

  _bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / this.width  - 0.5);
      this.mouse.y = (e.clientY / this.height - 0.5);
    });

    window.addEventListener('resize', () => {
      this.width  = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.frame++;
    const t = this.frame * 0.004;

    // Partículas
    this.particles.rotation.y  =  t * 0.02;
    this.particles.rotation.x  =  t * 0.01;
    this.particles2.rotation.y = -t * 0.015;

    // Moléculas
    this.moleculesGroup.rotation.y = t * 0.25;
    this.moleculesGroup.rotation.x = Math.sin(t * 0.4) * 0.15;
    this.moleculesGroup.position.y = 4 + Math.sin(t * 0.6) * 0.8;

    this.molecule2.rotation.y = -t * 0.2;
    this.molecule2.rotation.z =  t * 0.1;
    this.molecule2.position.y = -6 + Math.cos(t * 0.5) * 0.6;

    // Cámara sigue mouse muy sutilmente
    this.camera.position.x += (this.mouse.x * 2 - this.camera.position.x) * 0.02;
    this.camera.position.y += (-this.mouse.y * 1.5 - this.camera.position.y) * 0.02;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer?.dispose();
  }
}
