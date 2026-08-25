import * as THREE from 'three';
import { createBarkTexture } from '../utils/textures.js';

// Builds a low-poly birch-bark canoe with a paddler, flat-shaded so it reads
// as chunky pixel-art despite being real 3D geometry.
export function createCanoe() {
  const group = new THREE.Group();

  const barkTex = createBarkTexture();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xc98a4b, map: barkTex, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x5f3b20, flatShading: true });

  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -1.4);
  hullShape.quadraticCurveTo(0.55, -1.1, 0.5, -0.4);
  hullShape.lineTo(0.48, 0.6);
  hullShape.quadraticCurveTo(0.5, 1.05, 0, 1.5);
  hullShape.quadraticCurveTo(-0.5, 1.05, -0.48, 0.6);
  hullShape.lineTo(-0.5, -0.4);
  hullShape.quadraticCurveTo(-0.55, -1.1, 0, -1.4);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.35,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 1,
    curveSegments: 6,
  });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, 0.25, 0);

  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  group.add(hull);

  // Gunwale trim rim
  const trimGeo = new THREE.TorusGeometry(0.5, 0.03, 4, 12);
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.rotation.x = Math.PI / 2;
  trim.scale.set(1, 1.9, 1);
  trim.position.y = 0.42;
  group.add(trim);

  // Paddler: simple low-poly figure with a red ceinture fleche sash
  const paddler = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc98a5e, flatShading: true });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true });
  const sashMat = new THREE.MeshLambertMaterial({ color: 0xb5322f, flatShading: true });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.24), shirtMat);
  torso.position.y = 0.75;
  paddler.add(torso);

  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.26), sashMat);
  sash.position.y = 0.62;
  paddler.add(sash);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
  head.position.y = 1.13;
  paddler.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), sashMat);
  cap.position.y = 1.28;
  paddler.add(cap);

  paddler.position.set(0, 0.25, -0.1);
  group.add(paddler);

  // Paddle, animated externally by rotating this group
  const paddleGroup = new THREE.Group();
  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30, flatShading: true });
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x8a5a34, flatShading: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), shaftMat);
  paddleGroup.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.04), bladeMat);
  blade.position.y = -0.7;
  paddleGroup.add(blade);
  paddleGroup.position.set(0.42, 1.15, -0.1);
  paddleGroup.rotation.z = 0.5;
  paddleGroup.rotation.x = 0.3;
  group.add(paddleGroup);

  group.userData.paddle = paddleGroup;
  group.userData.hull = hull;

  return group;
}
