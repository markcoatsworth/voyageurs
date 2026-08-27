import * as THREE from 'three';
import { createRockTexture, createBarkTexture, createTreeSpriteTexture } from '../utils/textures.js';
import { centerX, widthAt } from './riverPath.js';
import { SPAWN_Z, RECYCLE_Z } from './world.js';

const POOL_SIZE = 16;
const BASE_GAP = 9;
const GAP_VARIANCE = 10;
const GAP_SHRINK_PER_METER = 0.012;
const MIN_GAP = 5.5;
const EDGE_MARGIN = 0.7;

const ROCK = 'rock';
const LOG = 'log';
const ISLAND = 'island';
const PELT = 'pelt';

const islandTreeTextures = [createTreeSpriteTexture(0), createTreeSpriteTexture(2)];

function pickType() {
  const roll = Math.random();
  if (roll < 0.35) return ROCK;
  if (roll < 0.6) return LOG;
  if (roll < 0.7) return ISLAND;
  return PELT;
}

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

function buildIsland(rockTex) {
  const group = new THREE.Group();
  const moundMat = new THREE.MeshLambertMaterial({ map: rockTex, color: 0x8a7a4a, flatShading: true });
  const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), moundMat);
  mound.scale.y = 0.4;
  mound.position.y = 0.2;
  group.add(mound);

  const treeTex = islandTreeTextures[Math.floor(Math.random() * islandTreeTextures.length)];
  const treeMat = new THREE.SpriteMaterial({ map: treeTex, transparent: true, alphaTest: 0.4 });
  const tree = new THREE.Sprite(treeMat);
  const scale = 2.4;
  tree.scale.set(scale * 0.6, scale, 1);
  tree.position.set(0.2, 0.4 + scale / 2, -0.1);
  group.add(tree);
  return group;
}

function buildMesh(type, rockTex, barkTex) {
  if (type === ROCK) return buildRock(rockTex);
  if (type === LOG) return buildLog(barkTex);
  if (type === ISLAND) return buildIsland(rockTex);
  return buildPelt();
}

function hitRadiusFor(type) {
  if (type === LOG) return 1.1;
  if (type === ISLAND) return 1.8;
  return 0.6;
}

// Picks a world X for an obstacle at downstream distance d, staying clear of
// the banks. Islands bias toward mid-channel so they force a real left/right
// choice; everything else scatters across the navigable width.
function pickX(type, d) {
  const half = widthAt(d) / 2 - EDGE_MARGIN;
  if (type === ISLAND) {
    const clearance = half - 1.3;
    if (clearance < 0.4) return null; // channel too narrow here, fall back
    return centerX(d) + (Math.random() * 2 - 1) * clearance * 0.5;
  }
  return centerX(d) + (Math.random() * 2 - 1) * Math.max(0.1, half);
}

function gapFor(distance) {
  const shrink = Math.min(BASE_GAP + GAP_VARIANCE - MIN_GAP, distance * GAP_SHRINK_PER_METER);
  return Math.max(MIN_GAP, BASE_GAP + Math.random() * GAP_VARIANCE - shrink);
}

export function createObstacleField(scene, world) {
  const rockTex = createRockTexture();
  const barkTex = createBarkTexture();

  const pool = [];

  function place(z) {
    const d = world.distance - z;
    let type = pickType();
    let x = pickX(type, d);
    if (x === null) { type = ROCK; x = pickX(type, d); }
    const mesh = buildMesh(type, rockTex, barkTex);
    mesh.position.x = x;
    mesh.position.z = z;
    scene.add(mesh);
    return { mesh, type, active: true, spinPhase: Math.random() * Math.PI * 2 };
  }

  let z = SPAWN_Z;
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(place(z));
    z -= gapFor(world.distance - z);
  }

  function respawn(entry, distanceNow) {
    scene.remove(entry.mesh);
    entry.mesh.traverse((obj) => obj.geometry && obj.geometry.dispose());

    let furthest = 0;
    for (const e of pool) if (e.mesh.position.z < furthest) furthest = e.mesh.position.z;
    const newZ = furthest - gapFor(distanceNow);
    const d = distanceNow - newZ;

    let type = pickType();
    let x = pickX(type, d);
    if (x === null) { type = ROCK; x = pickX(type, d); }

    const mesh = buildMesh(type, rockTex, barkTex);
    mesh.position.x = x;
    mesh.position.z = newZ;
    scene.add(mesh);

    entry.mesh = mesh;
    entry.type = type;
    entry.active = true;
  }

  return {
    pool,
    update(time, dt, speed, canoeWorldX, onHit, onCollect) {
      for (const entry of pool) {
        entry.mesh.position.z += speed * dt;

        if (entry.type === PELT) {
          entry.mesh.rotation.y = time * 2 + entry.spinPhase;
          entry.mesh.position.y = 0.12 + Math.sin(time * 3 + entry.spinPhase) * 0.05;
        }

        if (entry.active && Math.abs(entry.mesh.position.z) < 0.9) {
          const dx = Math.abs(entry.mesh.position.x - canoeWorldX);
          if (dx < hitRadiusFor(entry.type)) {
            entry.active = false;
            if (entry.type === PELT) onCollect(entry);
            else onHit(entry);
          }
        }

        if (entry.mesh.position.z > RECYCLE_Z) {
          respawn(entry, world.distance);
        }
      }
    },
    reset() {
      let zCursor = SPAWN_Z;
      for (const entry of pool) {
        scene.remove(entry.mesh);
        entry.mesh.traverse((obj) => obj.geometry && obj.geometry.dispose());
        const fresh = place(zCursor);
        entry.mesh = fresh.mesh;
        entry.type = fresh.type;
        entry.active = true;
        zCursor -= gapFor(world.distance - zCursor);
      }
    },
  };
}
