import * as THREE from 'three';
import { createRiverbankTexture, createTreeSpriteTexture } from '../utils/textures.js';
import { RIVER_HALF_WIDTH } from './river.js';

const SEGMENT_LENGTH = 24;
const SEGMENTS_PER_SIDE = 8;
const BANK_WIDTH = 14;
const SPAWN_Z = -(SEGMENTS_PER_SIDE * SEGMENT_LENGTH) + 20;
const RECYCLE_Z = 14;

const treeTextures = [0, 1, 2, 3].map(createTreeSpriteTexture);

function makeTreeSprite() {
  const tex = treeTextures[Math.floor(Math.random() * treeTextures.length)];
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.4 });
  const sprite = new THREE.Sprite(mat);
  const scale = 2.2 + Math.random() * 1.6;
  sprite.scale.set(scale * 0.6, scale, 1);
  return sprite;
}

function buildSegment(side, bankTex) {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(BANK_WIDTH, SEGMENT_LENGTH);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ map: bankTex, flatShading: true });
  const ground = new THREE.Mesh(geo, mat);
  ground.position.x = side * (RIVER_HALF_WIDTH + BANK_WIDTH / 2 + 0.6);
  group.add(ground);

  const trees = [];
  const treeCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < treeCount; i++) {
    const tree = makeTreeSprite();
    const localX = (0.15 + Math.random() * 0.85) * (BANK_WIDTH / 2) * side;
    const localZ = (Math.random() - 0.5) * SEGMENT_LENGTH;
    tree.position.set(ground.position.x + localX, tree.scale.y / 2, localZ);
    group.add(tree);
    trees.push(tree);
  }

  group.userData.trees = trees;
  group.userData.ground = ground;
  return group;
}

export function createTerrain(scene) {
  const bankTex = createRiverbankTexture();
  const segments = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < SEGMENTS_PER_SIDE; i++) {
      const seg = buildSegment(side, bankTex);
      seg.position.z = SPAWN_Z + i * SEGMENT_LENGTH;
      scene.add(seg);
      segments.push({ group: seg, side });
    }
  }

  function respawn(entry) {
    let minZ = Infinity;
    for (const s of segments) {
      if (s.side === entry.side && s.group.position.z < minZ) minZ = s.group.position.z;
    }
    entry.group.position.z = minZ - SEGMENT_LENGTH;
    const bankWidthHalf = BANK_WIDTH / 2;
    const baseX = entry.group.userData.ground.position.x;
    for (const tree of entry.group.userData.trees) {
      const localX = (0.15 + Math.random() * 0.85) * bankWidthHalf * entry.side;
      const localZ = (Math.random() - 0.5) * SEGMENT_LENGTH;
      tree.position.set(baseX + localX, tree.position.y, localZ);
    }
  }

  return {
    update(dt, speed) {
      for (const entry of segments) {
        entry.group.position.z += speed * dt;
        if (entry.group.position.z > RECYCLE_Z) {
          respawn(entry);
        }
      }
    },
  };
}
