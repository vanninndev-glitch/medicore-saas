/**
 * MediCore SaaS — login-scene.js
 * Three.js: partículas de ADN + red neuronal médica para el fondo del login
 */

export class LoginScene {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.width  = window.innerWidth;
    this.height = window.innerHeight;
    this.mouse  = { x: 0, y: 0 };
    this.frame  = 0;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._buildDNA();
    this._buildParticles();
    this._buildConnections();
    this._bindEvents();
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 0);
  }

  _initScene() {
    this.scene = new THREE.Scene();
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 0, 28);
  }

  /* ── Hélice de ADN ── */
  _buildDNA() {
    this.dnaGroup = new THREE.Group();
    this.dnaGroup.position.set(-18, 0, -10);
    this.dnaGroup.rotation.z = 0.3;

    const strandMat1 = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.7 });
    const strandMat2 = new THREE.MeshBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.7 });
    const bridgeMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    const sphereGeo  = new THREE.SphereGeometry(0.18, 8, 8);
    const bridgeGeo  = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);

    const steps = 60;
    const helixRadius = 1.6;
    const helixPitch  = 0.38;

    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 8;
      const y = (i - steps / 2) * helixPitch;

      // Strand A
      const xA = Math.cos(t) * helixRadius;
      const zA = Math.sin(t) * helixRadius;
      const sA = new THREE.Mesh(sphereGeo, strandMat1);
      sA.position.set(xA, y, zA);
      this.dnaGroup.add(sA);

      // Strand B (opuesto)
      const xB = Math.cos(t + Math.PI) * helixRadius;
      const zB = Math.sin(t + Math.PI) * helixRadius;
      const sB = new THREE.Mesh(sphereGeo, strandMat2);
      sB.position.set(xB, y, zB);
      this.dnaGroup.add(sB);

      // Puentes cada 5 pasos
      if (i % 5 === 0) {
        const bx = (xA + xB) / 2;
        const bz = (zA + zB) / 2;
        const dist = Math.sqrt((xA - xB) ** 2 + (zA - zB) ** 2);
        const bridge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, dist, 6),
          bridgeMat
        );
        bridge.position.set(bx, y, bz);
        const angle = Math.atan2(xA - xB, zA - zB);
        bridge.rotation.z = Math.PI / 2;
        bridge.rotation.y = angle;
        this.dnaGroup.add(bridge);
      }
    }

    this.scene.add(this.dnaGroup);
  }

  /* ── Partículas flotantes ── */
  _buildParticles() {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
      sizes[i] = Math.random() * 2.5 + 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0x00d4ff,
      size: 0.12,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);

    // Segundo sistema — verde
    const count2 = 80;
    const pos2   = new Float32Array(count2 * 3);
    for (let i = 0; i < count2; i++) {
      pos2[i * 3]     = (Math.random() - 0.5) * 60;
      pos2[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos2[i * 3 + 2] = (Math.random() - 0.5) * 30 - 8;
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    const mat2 = new THREE.PointsMaterial({
      color: 0x00e5a0,
      size: 0.09,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
    });
    this.particles2 = new THREE.Points(geo2, mat2);
    this.scene.add(this.particles2);
  }

  /* ── Red de conexiones (nodos médicos) ── */
  _buildConnections() {
    this.nodesGroup = new THREE.Group();
    this.nodesGroup.position.set(12, 2, -8);

    const nodeCount = 18;
    const nodePositions = [];
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x1a6fff, transparent: true, opacity: 0.6 });
    const nodeGeo = new THREE.SphereGeometry(0.22, 10, 10);

    for (let i = 0; i < nodeCount; i++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 6
      );
      nodePositions.push(pos);
      const mesh = new THREE.Mesh(nodeGeo, nodeMat);
      mesh.position.copy(pos);
      this.nodesGroup.add(mesh);
    }

    // Líneas de conexión entre nodos cercanos
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1a6fff,
      transparent: true,
      opacity: 0.12,
    });

    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodePositions[i].distanceTo(nodePositions[j]);
        if (dist < 5.5) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            nodePositions[i], nodePositions[j],
          ]);
          this.nodesGroup.add(new THREE.Line(geo, lineMat));
        }
      }
    }

    this.scene.add(this.nodesGroup);
  }

  /* ── Eventos ── */
  _bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / this.width  - 0.5) * 2;
      this.mouse.y = (e.clientY / this.height - 0.5) * 2;
    });

    window.addEventListener('resize', () => {
      this.width  = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });
  }

  /* ── Loop de animación ── */
  _animate() {
    requestAnimationFrame(() => this._animate());
    this.frame++;
    const t = this.frame * 0.005;

    // Rotar ADN suavemente
    this.dnaGroup.rotation.y = t * 0.4;
    this.dnaGroup.position.y = Math.sin(t * 0.5) * 1.2;

    // Flotar partículas
    this.particles.rotation.y  = t * 0.03;
    this.particles.rotation.x  = t * 0.015;
    this.particles2.rotation.y = -t * 0.02;
    this.particles2.rotation.z =  t * 0.01;

    // Rotar nodos de red
    this.nodesGroup.rotation.y = t * 0.15;
    this.nodesGroup.rotation.x = Math.sin(t * 0.3) * 0.1;

    // Cámara sigue el mouse suavemente
    this.camera.position.x += (this.mouse.x * 3 - this.camera.position.x) * 0.04;
    this.camera.position.y += (-this.mouse.y * 2 - this.camera.position.y) * 0.04;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.dispose();
  }
}
