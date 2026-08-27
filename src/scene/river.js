import * as THREE from 'three';
import { createWaterTexture } from '../utils/textures.js';
import { centerX, widthAt } from './riverPath.js';
import { buildCurvedGrid } from './ribbon.js';
import { SEGMENT_LENGTH, SEGMENTS_PER_SIDE, SPAWN_Z, RECYCLE_Z } from './world.js';

const ROWS = 6;
const COLS = 4;

function buildWaterGeometry(D0) {
  return buildCurvedGrid({
    length: SEGMENT_LENGTH,
    rows: ROWS,
    cols: COLS,
    uvXRepeat: 3,
    uvZDensity: 0.3,
    xAt(z, cf) {
      const d = D0 - z;
      const half = widthAt(d) / 2;
      return centerX(d) + (cf * 2 - 1) * half;
    },
  });
}

export function createRiver(scene, world) {
  const waterTex = createWaterTexture();
  const mat = new THREE.MeshLambertMaterial({ map: waterTex, flatShading: true, side: THREE.DoubleSide });

  const segments = [];
  for (let i = 0; i < SEGMENTS_PER_SIDE; i++) {
    const z = SPAWN_Z + i * SEGMENT_LENGTH;
    const D0 = world.distance - z;
    const geo = buildWaterGeometry(D0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    scene.add(mesh);
    segments.push({ mesh, geo, base: geo.attributes.position.array.slice() });
  }

  function respawn(entry) {
    let minZ = Infinity;
    for (const s of segments) if (s.mesh.position.z < minZ) minZ = s.mesh.position.z;
    const newZ = minZ - SEGMENT_LENGTH;
    const D0 = world.distance - newZ;
    entry.mesh.position.z = newZ;
    entry.geo.dispose();
    entry.geo = buildWaterGeometry(D0);
    entry.mesh.geometry = entry.geo;
    entry.base = entry.geo.attributes.position.array.slice();
  }

  return {
    update(time, dt, speed) {
      waterTex.offset.y -= dt * speed * 0.05;
      for (const entry of segments) {
        entry.mesh.position.z += speed * dt;
        const pos = entry.geo.attributes.position.array;
        const worldZ = entry.mesh.position.z;
        for (let i = 0; i < pos.length; i += 3) {
          const bx = entry.base[i];
          const bz = entry.base[i + 2];
          pos[i + 1] = Math.sin(bz * 0.35 + bx * 0.6 + worldZ * 0.35 + time * 2.2) * 0.04
            + Math.cos(bx * 1.1 + bz * 0.2 + time * 1.3) * 0.03;
        }
        entry.geo.attributes.position.needsUpdate = true;

        if (entry.mesh.position.z > RECYCLE_Z) respawn(entry);
      }
    },
  };
}
