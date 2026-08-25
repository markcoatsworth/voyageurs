import * as THREE from 'three';

const SKY_COLOR = 0xbfe0e6;
const FOG_COLOR = 0xbfe0e6;

export function createSky(scene) {
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 40, 150);

  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f9a7a, flatShading: true });
  const hillMatFar = new THREE.MeshLambertMaterial({ color: 0x8fb3ae, flatShading: true });

  const group = new THREE.Group();
  for (let side = -1; side <= 1; side += 2) {
    for (let z = -200; z <= 20; z += 18 + Math.random() * 10) {
      const isFar = Math.random() > 0.5;
      const geo = new THREE.IcosahedronGeometry(4 + Math.random() * 5, 0);
      const hill = new THREE.Mesh(geo, isFar ? hillMatFar : hillMat);
      hill.scale.y = 0.45;
      hill.position.set(side * (18 + Math.random() * 14), -1.5, z);
      group.add(hill);
    }
  }
  scene.add(group);

  return group;
}
