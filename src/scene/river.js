import * as THREE from 'three';
import { createWaterTexture, createSandTexture } from '../utils/textures.js';

export const RIVER_WIDTH = 8;
export const RIVER_HALF_WIDTH = RIVER_WIDTH / 2;
const RIVER_SPAN_BACK = 20;
const RIVER_SPAN_FORWARD = 220;

export function createRiver(scene) {
  const waterTex = createWaterTexture();
  const sandTex = createSandTexture();
  sandTex.repeat.set(2, 60);

  const length = RIVER_SPAN_BACK + RIVER_SPAN_FORWARD;
  const segmentsX = 16;
  const segmentsZ = 60;
  const geo = new THREE.PlaneGeometry(RIVER_WIDTH, length, segmentsX, segmentsZ);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({ map: waterTex, flatShading: true });
  const water = new THREE.Mesh(geo, mat);
  water.position.z = (RIVER_SPAN_BACK - RIVER_SPAN_FORWARD) / 2;
  scene.add(water);

  // Sandy banks hugging the river edge for a soft transition into the grass.
  const sandGeo = new THREE.PlaneGeometry(1.4, length, 1, 1);
  sandGeo.rotateX(-Math.PI / 2);
  const sandMat = new THREE.MeshLambertMaterial({ map: sandTex, flatShading: true });
  const sandL = new THREE.Mesh(sandGeo, sandMat);
  sandL.position.set(-RIVER_HALF_WIDTH - 0.6, 0.01, water.position.z);
  scene.add(sandL);
  const sandR = sandL.clone();
  sandR.position.x = RIVER_HALF_WIDTH + 0.6;
  scene.add(sandR);

  const basePositions = geo.attributes.position.array.slice();

  return {
    mesh: water,
    texture: waterTex,
    update(time, dt, flowSpeed) {
      waterTex.offset.y -= dt * flowSpeed * 0.15;
      const pos = geo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        const x = basePositions[i];
        const z = basePositions[i + 2];
        pos[i + 1] = Math.sin(z * 0.35 + time * 2.2) * 0.045 + Math.cos(x * 0.8 + time * 1.3) * 0.03;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}
