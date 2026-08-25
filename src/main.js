import * as THREE from 'three';
import { PixelationController } from './scene/pixelation.js';
import { createSky } from './scene/sky.js';
import { createRiver } from './scene/river.js';
import { createTerrain } from './scene/terrain.js';
import { createCanoe } from './scene/canoe.js';
import { createObstacleField } from './scene/obstacles.js';
import { Input } from './utils/input.js';
import { Game } from './game.js';

const app = document.getElementById('app');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 3.4, 6.5);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
app.appendChild(renderer.domElement);
new PixelationController(renderer, camera);

// Lighting: a warm low sun plus soft ambient fill, both flat-shading friendly.
const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
sun.position.set(-8, 12, 6);
scene.add(sun);
const ambient = new THREE.HemisphereLight(0xbfe0e6, 0x2e5228, 0.7);
scene.add(ambient);

createSky(scene);
const river = createRiver(scene);
const terrain = createTerrain(scene);
const obstacles = createObstacleField(scene);

const canoe = createCanoe();
scene.add(canoe);

const input = new Input();

const ui = {
  hud: document.getElementById('hud'),
  hudScore: document.getElementById('hud-score'),
  hudDistance: document.getElementById('hud-distance'),
  hudSpeedFill: document.getElementById('hud-speed-fill'),
  titleScreen: document.getElementById('title-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  finalStats: document.getElementById('final-stats'),
  startBtn: document.getElementById('start-btn'),
  restartBtn: document.getElementById('restart-btn'),
};

const game = new Game({ canoe, camera, input, river, terrain, obstacles, ui });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  game.update(dt);
  renderer.render(scene, camera);
});
