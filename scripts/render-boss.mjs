// Rasterise a few frames of the Loup-garou fight to PNGs so the boss art can
// be eyeballed without a deploy round-trip. Not part of the build or tests.
//
//   npm i -D @napi-rs/canvas      # one-time; not a committed dependency
//   node scripts/render-boss.mjs  # writes /tmp/lg-{calm,windup,slam}.png
//
// It backs every <canvas> the game creates with a real @napi-rs/canvas so
// getContext('2d') is a genuine 2D context, drives a headless Game into the
// loup-garou stretch, and grabs a frame in each pose.
import '../test/dom-shim.mjs';
import { makeElement } from '../test/dom-shim.mjs';
import { createCanvas, DOMMatrix, Path2D, Image } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

globalThis.DOMMatrix = DOMMatrix;
globalThis.Path2D = Path2D;
globalThis.Image = Image;
console.log = ((orig) => ((...a) => { if (!String(a[0]).startsWith('[music]')) orig(...a); }))(console.log);

function realCanvasEl(w = 300, h = 150) {
  const shim = makeElement('canvas');
  const canvas = createCanvas(w, h);
  for (const k of ['style', 'classList', 'dataset', 'addEventListener', 'removeEventListener',
    'appendChild', 'setAttribute', 'getAttribute', 'getBoundingClientRect', 'remove']) {
    if (!(k in canvas)) canvas[k] = shim[k];
  }
  canvas._canvas = () => canvas;
  return canvas;
}
const origCreate = globalThis.document.createElement;
globalThis.document.createElement = (t) => (String(t).toLowerCase() === 'canvas' ? realCanvasEl() : origCreate(t));

const { Game } = await import('../src/core/game.js');
const { Input } = await import('../src/core/input.js');
const { createObstacleField } = await import('../src/world/obstacles.js');
const { createMinimap } = await import('../src/world/minimap.js');
const { createMusic } = await import('../src/audio/music.js');
const { createTouchControls } = await import('../src/core/touchControls.js');
const { TRIGGER_DISTANCE } = await import('../src/bossfights/loupGarou.js');
const { CANVAS_WIDTH, CANVAS_HEIGHT } = await import('../src/shared/config.js');

const el = (id) => makeElement(id);
const ui = {
  hud: el('hud'), hudScore: el('s'), hudSpeedFill: el('sp'), hudHealthFill: el('h'),
  hudBlockade: el('b'), hudBlockadeFill: el('bf'), damageFlash: el('f'), titleScreen: el('t'),
  gameoverScreen: el('o'), gameoverTitle: el('ot'), finalStats: el('st'), restartBtn: el('r'),
  pauseScreen: el('p'), milestoneBanner: el('mb'), bossBanner: el('bb'), weaponPad: el('w'), layoutWeaponPad: () => {},
  minimap: createMinimap(),
};
const world = { distance: 0 };
const input = new Input();
createTouchControls(input);
const canvasEl = realCanvasEl(CANVAS_WIDTH, CANVAS_HEIGHT);
const game = new Game({
  ctx: canvasEl.getContext('2d'), water: null, input,
  obstacles: createObstacleField(world), world, ui, music: createMusic(),
  startFlowDistance: TRIGGER_DISTANCE - 10, startSegment: 'lawrenceWest',
});

const saved = {};
let strikeStart = -999;
let wasStriking = false;
for (let i = 0; i < 900; i++) {
  input.state.up = true;
  input.state.left = i % 90 < 22;
  input.state.right = i % 90 >= 45 && i % 90 < 67;
  game.update(1 / 30);
  const lg = game.loupGarou;
  if (!lg.isActive()) continue;
  const striking = lg.isStriking();
  if (striking && !wasStriking) strikeStart = i;
  wasStriking = striking;
  const since = i - strikeStart;
  let tag = null;
  if (!striking && !saved.calm && i > 30) tag = 'calm';
  else if (striking && since === 10 && !saved.windup) tag = 'windup';
  else if (striking && since === 44 && !saved.slam) tag = 'slam';
  if (tag) {
    writeFileSync(`/tmp/lg-${tag}.png`, canvasEl._canvas().toBuffer('image/png'));
    saved[tag] = true;
    console.log('saved', `/tmp/lg-${tag}.png`);
  }
  if (saved.calm && saved.windup && saved.slam) break;
}
