import * as THREE from 'three';
import { centerX, widthAt, ESTUARY_WIDTH_THRESHOLD } from './riverPath.js';
import { SPAWN_Z, RECYCLE_Z } from './world.js';

// Purely ambient beluga whales — no collision — that only surface once the
// water has opened out past fjord width into the Saint Lawrence estuary.
// Real belugas gather at the Saguenay's mouth near Tadoussac year-round, so
// their appearance doubles as a "you've made it to open water" cue.

const POOL_SIZE = 5;
const GAP = 26;
const GAP_VARIANCE = 22;

function buildWhale() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xeeece2, flatShading: true });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
  mesh.scale.set(2, 0.6, 0.85);
  mesh.userData.lateralFrac = 0;
  mesh.userData.phase = Math.random() * Math.PI * 2;
  return mesh;
}

export function createWhalePod(scene, world) {
  const pool = [];
  let z = SPAWN_Z;
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = buildWhale();
    mesh.userData.lateralFrac = (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.6);
    mesh.position.z = z;
    mesh.visible = false;
    scene.add(mesh);
    pool.push(mesh);
    z -= GAP + Math.random() * GAP_VARIANCE;
  }

  return {
    update(time, dt, speed) {
      for (const mesh of pool) {
        mesh.position.z += speed * dt;
        const d = world.distance - mesh.position.z;
        const width = widthAt(d);
        const visible = width > ESTUARY_WIDTH_THRESHOLD;
        mesh.visible = visible;
        if (visible) {
          mesh.position.x = centerX(d) + mesh.userData.lateralFrac * (width / 2);
          const bob = Math.sin(time * 0.6 + mesh.userData.phase);
          mesh.position.y = -0.22 + Math.max(0, bob) * 0.42;
          mesh.rotation.y = Math.sin(time * 0.2 + mesh.userData.phase) * 0.3;
        }

        if (mesh.position.z > RECYCLE_Z) {
          let furthest = 0;
          for (const m of pool) if (m.position.z < furthest) furthest = m.position.z;
          mesh.position.z = furthest - (GAP + Math.random() * GAP_VARIANCE);
          mesh.userData.lateralFrac = (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.6);
        }
      }
    },
  };
}
