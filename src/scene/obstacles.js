import * as THREE from 'three';
import { createRockTexture, createBarkTexture } from '../utils/textures.js';
import { RIVER_HALF_WIDTH } from './river.js';

const SPAWN_Z = -190;
const RECYCLE_Z = 8;
const POOL_SIZE = 14;
const MIN_GAP = 9;
const PLAY_HALF_WIDTH = RIVER_HALF_WIDTH - 0.6;

const ROCK = 'rock';
const LOG = 'log';
const PELT = 'pelt';

function buildRock(tex) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat);
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  return mesh;
}

function buildLog(tex) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.4, 7), mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.y = 0.15;
  return mesh;
}

function buildPelt() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xa06a3a, flatShading: true });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.7), mat);
  mesh.position.y = 0.12;
  return mesh;
}

export function createObstacleField(scene) {
  const rockTex = createRockTexture();
  const barkTex = createBarkTexture();

  const pool = [];
  let nextSpawnZ = SPAWN_Z;

  function spawnOne(z) {
    const roll = Math.random();
    const type = roll < 0.45 ? ROCK : roll < 0.8 ? LOG : PELT;
    const mesh = type === ROCK ? buildRock(rockTex) : type === LOG ? buildLog(barkTex) : buildPelt();
    mesh.position.x = (Math.random() * 2 - 1) * PLAY_HALF_WIDTH;
    mesh.position.z = z;
    scene.add(mesh);
    pool.push({ mesh, type, active: true, spinPhase: Math.random() * Math.PI * 2 });
  }

  for (let i = 0; i < POOL_SIZE; i++) {
    spawnOne(nextSpawnZ);
    nextSpawnZ -= MIN_GAP + Math.random() * 10;
  }

  function respawn(entry) {
    scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    const roll = Math.random();
    entry.type = roll < 0.45 ? ROCK : roll < 0.8 ? LOG : PELT;
    entry.mesh = entry.type === ROCK ? buildRock(rockTex) : entry.type === LOG ? buildLog(barkTex) : buildPelt();
    let furthest = 0;
    for (const e of pool) if (e.mesh.position.z < furthest) furthest = e.mesh.position.z;
    entry.mesh.position.x = (Math.random() * 2 - 1) * PLAY_HALF_WIDTH;
    entry.mesh.position.z = furthest - (MIN_GAP + Math.random() * 10);
    entry.active = true;
    scene.add(entry.mesh);
  }

  return {
    pool,
    update(time, dt, speed, canoeX, onHit, onCollect) {
      for (const entry of pool) {
        entry.mesh.position.z += speed * dt;

        if (entry.type === PELT) {
          entry.mesh.rotation.y = time * 2 + entry.spinPhase;
          entry.mesh.position.y = 0.12 + Math.sin(time * 3 + entry.spinPhase) * 0.05;
        }

        if (entry.active && Math.abs(entry.mesh.position.z) < 0.9) {
          const dx = Math.abs(entry.mesh.position.x - canoeX);
          const hitRadius = entry.type === LOG ? 1.1 : 0.6;
          if (dx < hitRadius) {
            entry.active = false;
            if (entry.type === PELT) onCollect(entry);
            else onHit(entry);
          }
        }

        if (entry.mesh.position.z > RECYCLE_Z) {
          respawn(entry);
        }
      }
    },
    reset() {
      let z = SPAWN_Z;
      for (const entry of pool) {
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        const roll = Math.random();
        entry.type = roll < 0.45 ? ROCK : roll < 0.8 ? LOG : PELT;
        entry.mesh = entry.type === ROCK ? buildRock(rockTex) : entry.type === LOG ? buildLog(barkTex) : buildPelt();
        entry.mesh.position.x = (Math.random() * 2 - 1) * PLAY_HALF_WIDTH;
        entry.mesh.position.z = z;
        entry.active = true;
        scene.add(entry.mesh);
        z -= MIN_GAP + Math.random() * 10;
      }
    },
  };
}
