import { CANVAS_WIDTH, CANVAS_HEIGHT } from './twod/config.js';
import { createObstacleField } from './twod/obstacles.js';
import { createWaterRenderer } from './twod/waterGL.js';
import { createMusic } from './twod/music.js';
import { Input } from './utils/input.js';
import { Game } from './game.js';

const app = document.getElementById('app');

// A positioned wrapper so the WebGL water layer and the 2D sprite/terrain
// layer stack exactly on top of each other and scale together. The water
// canvas sits below; the 2D canvas is cleared to transparent each frame and
// leaves a river-shaped hole (see twod/terrain.js) for it to show through.
const screen = document.createElement('div');
screen.style.position = 'relative';
app.appendChild(screen);

// <canvas> is a replaced element (like <img>) — `inset:0` alone doesn't
// stretch a replaced element's auto width/height the way it would a <div>,
// so width/height:100% has to be explicit or these stay at native 320x220.
function layerStyle(el) {
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.imageRendering = 'pixelated';
}

const waterCanvas = document.createElement('canvas');
waterCanvas.width = CANVAS_WIDTH;
waterCanvas.height = CANVAS_HEIGHT;
layerStyle(waterCanvas);
screen.appendChild(waterCanvas);

const canvas = document.createElement('canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
layerStyle(canvas);
screen.appendChild(canvas);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Falls back to null (handled in game.js as a 2D-drawn water fill) if this
// browser/environment has no WebGL.
const water = createWaterRenderer(waterCanvas);

function resize() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / CANVAS_WIDTH,
    window.innerHeight / CANVAS_HEIGHT
  )));
  screen.style.width = `${CANVAS_WIDTH * scale}px`;
  screen.style.height = `${CANVAS_HEIGHT * scale}px`;
}
window.addEventListener('resize', resize);
resize();

// Shared downstream-distance clock: written by Game each frame, read by
// obstacles/terrain/whales whenever they need "what's here right now?"
const world = { distance: 0 };

const obstacles = createObstacleField(world);
const input = new Input();

const ui = {
  hud: document.getElementById('hud'),
  hudScore: document.getElementById('hud-score'),
  hudDistance: document.getElementById('hud-distance'),
  hudSpeedFill: document.getElementById('hud-speed-fill'),
  titleScreen: document.getElementById('title-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  finalStats: document.getElementById('final-stats'),
  restartBtn: document.getElementById('restart-btn'),
  milestoneBanner: document.getElementById('milestone-banner'),
};

const game = new Game({ ctx, water, input, obstacles, world, ui });

// The canoe launches immediately — this intro caption is just a fading
// overlay, not a gate, so it disappears on its own after a few seconds.
setTimeout(() => ui.titleScreen.classList.add('intro-fade-out'), 4500);

// Background music — browsers block autoplay until a real user gesture, so
// this starts on the player's first keypress or click rather than on load.
const music = createMusic();
const muteBtn = document.getElementById('mute-btn');
muteBtn.classList.toggle('muted', music.muted);
muteBtn.addEventListener('click', () => {
  const muted = music.toggleMute();
  muteBtn.classList.toggle('muted', muted);
});
window.addEventListener('keydown', () => music.start(), { once: true });
window.addEventListener('pointerdown', () => music.start(), { once: true });

let lastTime = performance.now();
function loop(now) {
  // rAF's timestamp can occasionally predate the performance.now() call
  // above (most noticeably on the very first frame), so clamp dt to
  // non-negative — a negative dt would tick every timer in the game
  // backwards for a frame.
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 1 / 20));
  lastTime = now;
  game.update(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
