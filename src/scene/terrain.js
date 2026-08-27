import * as THREE from 'three';
import { createRiverbankTexture, createSandTexture, createCliffTexture, createTreeSpriteTexture } from '../utils/textures.js';
import { centerX, widthAt } from './riverPath.js';
import { buildCurvedGrid } from './ribbon.js';
import { SEGMENT_LENGTH, SEGMENTS_PER_SIDE, SPAWN_Z, RECYCLE_Z } from './world.js';

const BANK_WIDTH = 13;
const SHORE_WIDTH = 0.4;
const CLIFF_WIDTH = 2.6;
const CLIFF_HEIGHT = 3.4;
const ROWS = 6;

const treeTextures = [0, 1, 2, 3].map(createTreeSpriteTexture);

function makeTreeSprite() {
  const tex = treeTextures[Math.floor(Math.random() * treeTextures.length)];
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.4 });
  const sprite = new THREE.Sprite(mat);
  const scale = 2.2 + Math.random() * 1.6;
  sprite.scale.set(scale * 0.6, scale, 1);
  return sprite;
}

// Riverbank edge (where the shore meets water) at downstream distance d, on
// the given side (-1 left, +1 right).
function riverEdge(d, side) {
  return centerX(d) + side * widthAt(d) / 2;
}

function buildGroundGeometries(D0, side) {
  const shoreGeo = buildCurvedGrid({
    length: SEGMENT_LENGTH,
    rows: ROWS,
    cols: 1,
    uvXRepeat: 1,
    uvZDensity: 0.3,
    xAt(z, cf) {
      const d = D0 - z;
      return riverEdge(d, side) + side * cf * SHORE_WIDTH;
    },
  });

  const cliffGeo = buildCurvedGrid({
    length: SEGMENT_LENGTH,
    rows: ROWS,
    cols: 1,
    uvXRepeat: 1,
    uvZDensity: 0.4,
    xAt(z, cf) {
      const d = D0 - z;
      const shoreOuter = riverEdge(d, side) + side * SHORE_WIDTH;
      return shoreOuter + side * cf * CLIFF_WIDTH;
    },
    yAt(z, cf) {
      return cf * CLIFF_HEIGHT;
    },
  });

  const plateauGeo = buildCurvedGrid({
    length: SEGMENT_LENGTH,
    rows: ROWS,
    cols: 1,
    uvXRepeat: 2,
    uvZDensity: 0.15,
    xAt(z, cf) {
      const d = D0 - z;
      const cliffOuter = riverEdge(d, side) + side * (SHORE_WIDTH + CLIFF_WIDTH);
      return cliffOuter + side * cf * BANK_WIDTH;
    },
    yAt() {
      return CLIFF_HEIGHT;
    },
  });

  return { shoreGeo, cliffGeo, plateauGeo };
}

function treeLateralX(D0, side, localZ) {
  const d = D0 - localZ;
  const cliffOuter = riverEdge(d, side) + side * (SHORE_WIDTH + CLIFF_WIDTH);
  return cliffOuter + side * (0.1 + Math.random() * 0.85) * BANK_WIDTH;
}

function buildSegment(side, sandTex, cliffTex, grassTex, D0) {
  const group = new THREE.Group();
  const { shoreGeo, cliffGeo, plateauGeo } = buildGroundGeometries(D0, side);

  const sandMat = new THREE.MeshLambertMaterial({ map: sandTex, flatShading: true, side: THREE.DoubleSide });
  const cliffMat = new THREE.MeshLambertMaterial({ map: cliffTex, flatShading: true, side: THREE.DoubleSide });
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTex, flatShading: true, side: THREE.DoubleSide });

  const shore = new THREE.Mesh(shoreGeo, sandMat);
  shore.position.y = 0.01;
  group.add(shore);

  const cliff = new THREE.Mesh(cliffGeo, cliffMat);
  group.add(cliff);

  const plateau = new THREE.Mesh(plateauGeo, grassMat);
  group.add(plateau);

  const trees = [];
  const treeCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < treeCount; i++) {
    const tree = makeTreeSprite();
    const localZ = (Math.random() - 0.5) * SEGMENT_LENGTH;
    const x = treeLateralX(D0, side, localZ);
    tree.position.set(x, CLIFF_HEIGHT + tree.scale.y / 2, localZ);
    group.add(tree);
    trees.push(tree);
  }

  group.userData = { shore, cliff, plateau, trees };
  return group;
}

function rebuildSegment(entry, sandTex, cliffTex, grassTex, D0) {
  entry.group.userData.shore.geometry.dispose();
  entry.group.userData.cliff.geometry.dispose();
  entry.group.userData.plateau.geometry.dispose();
  const { shoreGeo, cliffGeo, plateauGeo } = buildGroundGeometries(D0, entry.side);
  entry.group.userData.shore.geometry = shoreGeo;
  entry.group.userData.cliff.geometry = cliffGeo;
  entry.group.userData.plateau.geometry = plateauGeo;
  for (const tree of entry.group.userData.trees) {
    const localZ = (Math.random() - 0.5) * SEGMENT_LENGTH;
    const x = treeLateralX(D0, entry.side, localZ);
    tree.position.set(x, tree.position.y, localZ);
  }
}

export function createTerrain(scene, world) {
  const bankTex = createRiverbankTexture();
  const sandTex = createSandTexture();
  const cliffTex = createCliffTexture();
  const segments = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < SEGMENTS_PER_SIDE; i++) {
      const z = SPAWN_Z + i * SEGMENT_LENGTH;
      const D0 = world.distance - z;
      const seg = buildSegment(side, sandTex, cliffTex, bankTex, D0);
      seg.position.z = z;
      scene.add(seg);
      segments.push({ group: seg, side });
    }
  }

  function respawn(entry) {
    let minZ = Infinity;
    for (const s of segments) {
      if (s.side === entry.side && s.group.position.z < minZ) minZ = s.group.position.z;
    }
    const newZ = minZ - SEGMENT_LENGTH;
    entry.group.position.z = newZ;
    const D0 = world.distance - newZ;
    rebuildSegment(entry, sandTex, cliffTex, bankTex, D0);
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
