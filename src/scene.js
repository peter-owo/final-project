import * as THREE from 'three';
import { FACE_ORDER, FACES, HALF, SIZE, cellKey } from './maze.js';

const CUBE_RADIUS = HALF + 0.5;
const v3 = values => new THREE.Vector3(...values);
const basis = face => {
  const { u, v, n } = FACES[face];
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(u), v3(v).negate(), v3(n)));
};
const QUATERNIONS = Object.fromEntries(FACE_ORDER.map(face => [face, basis(face)]));
const HEADINGS = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };

function positionOf(cell, height = 0) {
  const { n, u, v } = FACES[cell.face];
  return v3(n).multiplyScalar(CUBE_RADIUS + height)
    .addScaledVector(v3(u), cell.x - HALF)
    .addScaledVector(v3(v), cell.y - HALF);
}

function pacmanShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(0.36) * 0.42, Math.sin(0.36) * 0.42);
  shape.absarc(0, 0, 0.42, 0.36, Math.PI * 2 - 0.36, false);
  shape.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 2, curveSegments: 24 });
}

function makeGhost(color) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.39, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), material);
  dome.position.y = 0.08;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.48, 20), material);
  body.position.y = -0.16;
  group.add(dome, body);
  for (const x of [-0.17, 0, 0.17]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), material);
    foot.position.set(x, -0.4, 0);
    group.add(foot);
  }
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x142485 });
  for (const x of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), white);
    eye.position.set(x, 0.07, 0.35);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), pupil);
    iris.position.set(x + 0.025, 0.05, 0.45);
    group.add(eye, iris);
  }
  return group;
}

export class GameScene {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070815');
    this.scene.fog = new THREE.FogExp2('#070815', 0.015);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.camera.position.set(3.2, 3.8, 19);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 2.2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.scene.add(new THREE.AmbientLight(0x8495ff, 2.1));
    const light = new THREE.DirectionalLight(0xffffff, 2.1);
    light.position.set(8, 12, 15);
    this.scene.add(light);
    const blue = new THREE.PointLight(0x275bff, 150, 35);
    blue.position.set(-10, 5, 13);
    this.scene.add(blue);
    this.starField();
    this.itemMeshes = new Map();
    this.buildMaze();
    this.buildActors();
    this.resize();
    this.lastFrame = performance.now();
    this.elapsed = 0;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  starField() {
    const points = [];
    for (let i = 0; i < 250; i++) {
      const radius = 32 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      points.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x6573b3, size: 0.08, transparent: true, opacity: 0.7 })));
  }

  buildMaze() {
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1030, roughness: 0.95, side: THREE.DoubleSide });
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x17265a, transparent: true, opacity: 0.35 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1428a5, emissive: 0x102dad, emissiveIntensity: 0.48, metalness: 0.2, roughness: 0.5 });
    const wallEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x427cff, transparent: true, opacity: 0.8 });
    const wallGeometry = new THREE.BoxGeometry(0.98, 0.98, 0.48);
    const wallEdges = new THREE.EdgesGeometry(wallGeometry);
    const dotGeometry = new THREE.SphereGeometry(0.105, 10, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffdca3 });
    const powerGeometry = new THREE.SphereGeometry(0.31, 16, 12);
    const powerMaterial = new THREE.MeshStandardMaterial({ color: 0xffd75b, emissive: 0xffa800, emissiveIntensity: 1.7 });
    const shieldGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.13, 6);
    const shieldMaterial = new THREE.MeshStandardMaterial({ color: 0x67f6f0, emissive: 0x0ec5dd, emissiveIntensity: 1 });
    const speedGeometry = new THREE.ConeGeometry(0.37, 0.55, 3);
    const speedMaterial = new THREE.MeshStandardMaterial({ color: 0xff8be1, emissive: 0xd921af, emissiveIntensity: 1 });

    for (const face of FACE_ORDER) {
      const faceGroup = new THREE.Group();
      faceGroup.position.copy(v3(FACES[face].n).multiplyScalar(CUBE_RADIUS));
      faceGroup.quaternion.copy(QUATERNIONS[face]);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), floorMaterial);
      faceGroup.add(floor);
      const lines = [];
      for (let i = 0; i <= SIZE; i++) {
        const p = i - SIZE / 2;
        lines.push(-SIZE / 2, p, 0.012, SIZE / 2, p, 0.012, p, -SIZE / 2, 0.012, p, SIZE / 2, 0.012);
      }
      const grid = new THREE.BufferGeometry();
      grid.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      faceGroup.add(new THREE.LineSegments(grid, gridMaterial));
      this.scene.add(faceGroup);
    }

    for (const cell of this.game.cells.values()) {
      if (cell.wall) {
        const group = new THREE.Group();
        group.position.copy(positionOf(cell, 0.26));
        group.quaternion.copy(QUATERNIONS[cell.face]);
        group.add(new THREE.Mesh(wallGeometry, wallMaterial), new THREE.LineSegments(wallEdges, wallEdgeMaterial));
        this.scene.add(group);
      } else if (cell.item) {
        let mesh;
        if (cell.item === 'power') mesh = new THREE.Mesh(powerGeometry, powerMaterial);
        else if (cell.item === 'shield') {
          mesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(FACES[cell.face].n));
        } else if (cell.item === 'speed') {
          mesh = new THREE.Mesh(speedGeometry, speedMaterial);
          mesh.quaternion.copy(QUATERNIONS[cell.face]);
        } else mesh = new THREE.Mesh(dotGeometry, dotMaterial);
        mesh.position.copy(positionOf(cell, cell.item === 'dot' ? 0.18 : 0.4));
        this.scene.add(mesh);
        this.itemMeshes.set(cellKey(cell), mesh);
      }
    }
  }

  buildActors() {
    this.playerGroup = new THREE.Group();
    this.playerBody = new THREE.Mesh(pacmanShape(), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffb400, emissiveIntensity: 0.38, metalness: 0.12, roughness: 0.38 }));
    this.playerGroup.add(this.playerBody);
    this.scene.add(this.playerGroup);
    this.ghostGroups = [0xff5359, 0xff7fd4, 0x61eaff].map(color => {
      const group = makeGhost(color);
      this.scene.add(group);
      return group;
    });
    this.ghostColors = [0xff5359, 0xff7fd4, 0x61eaff];
  }

  syncItems() {
    for (const [id, mesh] of this.itemMeshes) mesh.visible = Boolean(this.game.cells.get(id)?.item);
  }

  actorTransform(actor, group, height, time) {
    if (actor.motion) {
      const t = Math.min(1, actor.motion.progress);
      const smooth = t * t * (3 - 2 * t);
      group.position.copy(positionOf(actor.motion.from, height)).lerp(positionOf(actor.motion.to, height), smooth);
      group.position.addScaledVector(v3(FACES[actor.motion.from.face].n), Math.sin(Math.PI * smooth) * 0.23);
      group.quaternion.copy(QUATERNIONS[actor.motion.from.face]).slerp(QUATERNIONS[actor.motion.to.face], smooth);
    } else {
      group.position.copy(positionOf(actor, height));
      group.quaternion.copy(QUATERNIONS[actor.face]);
    }
    group.position.addScaledVector(v3(FACES[actor.face].n), Math.sin(time * 5 + (actor.index || 0)) * 0.025);
  }

  render(dt) {
    const time = this.elapsed;
    this.actorTransform(this.game.player, this.playerGroup, 0.42, time);
    this.playerBody.rotation.z = HEADINGS[this.game.player.direction] || 0;
    this.playerBody.scale.y = 0.95 + 0.05 * Math.sin(time * 15);
    this.playerGroup.visible = this.game.player.invulnerable <= 0 || Math.floor(time * 8) % 2 === 0;
    this.game.ghosts.forEach((ghost, index) => {
      const group = this.ghostGroups[index];
      group.visible = ghost.inactive <= 0;
      this.actorTransform(ghost, group, 0.45, time);
      group.scale.setScalar(this.game.powerTime > 0 ? 0.92 : 1);
      const material = group.children[0].material;
      material.color.setHex(this.game.powerTime > 0 ? 0x4b69ff : this.ghostColors[index]);
      material.emissive.setHex(this.game.powerTime > 0 ? 0x203fd1 : this.ghostColors[index]);
      material.emissiveIntensity = this.game.powerTime > 0 ? 0.45 : 0.28;
    });

    const face = this.game.player.motion?.to.face || this.game.player.face;
    const { n, u, v } = FACES[face];
    const normal = v3(n), right = v3(u), up = v3(v).negate();
    const cameraTarget = normal.clone().multiplyScalar(2.2);
    const cameraPosition = normal.clone().multiplyScalar(19).addScaledVector(right, 3.2).addScaledVector(up, 3.8);
    const damping = 1 - Math.exp(-dt * 3.3);
    this.camera.position.lerp(cameraPosition, damping);
    this.camera.up.lerp(up, damping).normalize();
    this.camera.lookAt(cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.elapsed += dt;
    this.game.update(dt);
    this.render(dt);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
