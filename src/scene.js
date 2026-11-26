import * as THREE from 'three';
import { FACE_ORDER, FACES, HALF, SIZE, cellKey } from './maze.js';
import { GHOST_TYPES } from './ghost-game.js';

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

function makeGhost(color, id) {
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
  const markerShape = { red: new THREE.SphereGeometry(0.11, 10, 8), pink: new THREE.OctahedronGeometry(0.14), cyan: new THREE.CylinderGeometry(0.14, 0.14, 0.08, 6), purple: new THREE.ConeGeometry(0.14, 0.24, 3) }[id];
  const marker = new THREE.Mesh(markerShape, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  marker.position.set(0, 0.46, 0.16);
  group.add(marker);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.045, 8, 30), new THREE.MeshBasicMaterial({ color: 0xffdc40 }));
  ring.position.z = -0.24;
  ring.visible = false;
  group.add(ring);
  group.userData.ring = ring;
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
    this.trapMeshes = new Map();
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
    const coreGeometry = new THREE.OctahedronGeometry(0.34);
    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x75f9f0, emissive: 0x18c8cf, emissiveIntensity: 1.2 });
    const exitGeometry = new THREE.TorusGeometry(0.37, 0.09, 8, 24);
    const exitMaterial = new THREE.MeshBasicMaterial({ color: 0x9dff81 });

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
        else if (cell.item === 'core') mesh = new THREE.Mesh(coreGeometry, coreMaterial);
        else if (cell.item === 'exit') {
          mesh = new THREE.Mesh(exitGeometry, exitMaterial);
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
    this.ghostGroups = Object.fromEntries(Object.values(GHOST_TYPES).map(type => {
      const group = makeGhost(type.color, type.id);
      this.scene.add(group);
      return [type.id, group];
    }));
  }

  syncItems() {
    for (const [id, mesh] of this.itemMeshes) {
      const item = this.game.cells.get(id)?.item;
      mesh.visible = item === 'exit' ? this.game.exitReady : Boolean(item);
    }
  }

  syncTraps() {
    const present = new Set(this.game.traps.map(cellKey));
    for (const [id, mesh] of this.trapMeshes) {
      if (!present.has(id)) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.trapMeshes.delete(id); }
    }
    for (const trap of this.game.traps) {
      const id = cellKey(trap);
      if (this.trapMeshes.has(id)) continue;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 18), new THREE.MeshBasicMaterial({ color: 0xff87dc }));
      mesh.position.copy(positionOf(trap, 0.22));
      mesh.quaternion.copy(QUATERNIONS[trap.face]);
      this.scene.add(mesh);
      this.trapMeshes.set(id, mesh);
    }
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
    for (const group of Object.values(this.ghostGroups)) group.visible = false;
    this.game.ghosts.forEach(ghost => {
      const group = this.ghostGroups[ghost.id];
      group.visible = ghost.inactive <= 0;
      this.actorTransform(ghost, group, 0.45, time);
      group.scale.setScalar(this.game.powerTime > 0 ? 0.92 : 1);
      group.userData.ring.visible = ghost === this.game.activeGhost && ghost.inactive <= 0;
      const material = group.children[0].material;
      material.color.set(this.game.powerTime > 0 ? 0x4b69ff : GHOST_TYPES[ghost.id].color);
      material.emissive.set(this.game.powerTime > 0 ? 0x203fd1 : GHOST_TYPES[ghost.id].color);
      material.emissiveIntensity = this.game.powerTime > 0 ? 0.45 : 0.28;
    });
    this.syncTraps();

    const follow = this.game.activeGhost || this.game.player;
    const face = follow.motion?.to.face || follow.face;
    const { n, u, v } = FACES[face];
    const normal = v3(n), right = v3(u), up = v3(v).negate();
    const cameraTarget = normal.clone().multiplyScalar(2.2);
    const cameraPosition = normal.clone().multiplyScalar(19).addScaledVector(right, 3.2).addScaledVector(up, 3.8);
    const damping = 1 - Math.exp(-dt * 3.3);
    const currentDirection = this.camera.position.clone().normalize();
    const targetDirection = cameraPosition.clone().normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
    currentDirection.applyQuaternion(new THREE.Quaternion().slerp(rotation, damping));
    this.camera.position.copy(currentDirection.multiplyScalar(THREE.MathUtils.lerp(this.camera.position.length(), cameraPosition.length(), damping)));
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
