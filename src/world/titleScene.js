// The title menu's backdrop: the game's own river, live, with no canoe on it
// — the fjord from the put-in, drifting downstream behind the menu. Second
// attempt: the first was a side-on dusk painting (pitch #2), turned down for
// its palette and for not working in portrait; this is pitch #1, "the live
// river as a backdrop".
//
// The constraint that shapes everything here is portrait on a phone, where
// the menu box spans nearly the whole width: anything that matters has to
// be *above and below* the menu, and the sides are only allowed to be
// pleasant filler on desktop. A top-down river does that naturally — it
// runs top to bottom — but the game's view is a fixed 320x220 landscape
// frame (terrain.js and waterGL.js both bake CANVAS_WIDTH/HEIGHT and the
// canoe anchor in, the shader at codegen time), which in portrait is a
// letterboxed strip right behind the menu, the one place it can't be seen.
//
// So instead of resizing the renderer, this tiles it. Every pixel of the
// game's terrain and water is a pure function of (world distance, camera
// X), so a 320x220 render at (D - k, cam) is exactly the stretch of river
// just *above* the one at (D, cam), and one at (D, cam + 20 units) is the
// bank just to the right. Rendering a grid of those into one big canvas
// gives an arbitrarily large, seamless view of the same world with no
// changes to terrain.js or the shader. In portrait that's a column of
// 3-4 tiles — the river straight through the whole screen; on desktop it's
// a row, and the outer tiles are the forest and grass either side.
//
// Two details the seams depend on:
//   - TILE_STEP_Y is 208, not 220: drawBanks() fills its grass with a
//     16px pattern anchored to each tile's own origin, and 220 isn't a
//     multiple of 16, so stacking at 220 would put a phase jump in the
//     grass at every seam. 208 = 13 * 16; each tile contributes only its
//     top 208 rows, and the 12 it doesn't are the next tile's first 12
//     anyway (same world). 320 is already a multiple of 16 sideways.
//   - Only those top 208 rows are copied (rather than letting the next
//     tile overdraw the overlap), so nothing semi-transparent — tree
//     shadows, foam — gets painted twice and darkens a strip.
//
// Pixel scale matches main.js's resize() for the game itself (integer when
// that's >= 2, fractional to fill a small screen otherwise), so the river
// here is the same size as the river you're about to paddle, and the
// centre tile sits exactly where the game's own screen will.

import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { drawBanks, drawWaterFallback } from './terrain.js';
import { createWaterRenderer } from './waterGL.js';
import { centerX } from './river/path.js';

const TILE_STEP_X = CANVAS_WIDTH; // 320 = 20 * 16
const TILE_STEP_Y = 208; // 13 * 16 — see the module comment
const TILE_STEP_X_UNITS = TILE_STEP_X / PIXELS_PER_UNIT;
const TILE_STEP_Y_UNITS = TILE_STEP_Y / PIXELS_PER_UNIT;

// Drift speed, world units/s. The game cruises at BASE_SPEED 8; this is a
// slow float, not a run — the backdrop shouldn't feel like it's leaving
// without you. 1.6, down from a first 3 over two rounds ("slow down the
// speed going down the river slightly", then "even a bit slower still").
const DRIFT_SPEED = 1.6;
// The stretch of fjord it loops over, from the put-in. Stops well short of
// the first village (Sainte-Rose-du-Nord, ~299 — villages are hidden here,
// and a dock with no village would look like a bug) and far short of the
// Wendigo's frost. At DRIFT_SPEED that's ~2.8 minutes a lap, with a short fade
// through dark at the wrap rather than a hard cut.
const LOOP_START = 0;
const LOOP_LENGTH = 270;
const WRAP_FADE = 1.2; // seconds each side of the wrap

const FPS = 30;

// Which tiles are needed to cover a W x H internal canvas, and where each
// lands. Pure, so the smoke test can check coverage for any viewport.
export function tileLayout(W, H) {
  const x0 = Math.round((W - CANVAS_WIDTH) / 2);
  const y0 = Math.round((H - CANVAS_HEIGHT) / 2);
  const tiles = [];
  const iLo = -Math.ceil(x0 / TILE_STEP_X);
  const iHi = Math.ceil((W - x0) / TILE_STEP_X) - 1;
  const jLo = -Math.ceil(y0 / TILE_STEP_Y);
  const jHi = Math.ceil((H - y0) / TILE_STEP_Y) - 1;
  for (let j = jLo; j <= jHi; j++) {
    for (let i = iLo; i <= iHi; i++) {
      tiles.push({
        x: x0 + i * TILE_STEP_X,
        y: y0 + j * TILE_STEP_Y,
        // Up the screen is further downstream (larger d), as in the game.
        dOffset: -j * TILE_STEP_Y_UNITS,
        camOffset: i * TILE_STEP_X_UNITS,
      });
    }
  }
  return { x0, y0, tiles };
}

// main.js's resize() rule for the game screen, repeated so the river here
// is drawn at the same size as the one the game opens on.
function pixelScale(vw, vh) {
  const raw = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
  const floored = Math.floor(raw);
  return floored >= 2 ? floored : Math.max(raw, 1);
}

export function createTitleScene() {
  const canvas = document.createElement('canvas');
  canvas.id = 'title-scene';
  const ctx = canvas.getContext('2d');

  // One game-sized tile, re-rendered for every grid cell each frame: the
  // shader's own canvas, and a 2D one for the banks over it.
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = CANVAS_WIDTH;
  waterCanvas.height = CANVAS_HEIGHT;
  const water = createWaterRenderer(waterCanvas);
  const bankCanvas = document.createElement('canvas');
  bankCanvas.width = CANVAS_WIDTH;
  bankCanvas.height = CANVAS_HEIGHT;
  const bankCtx = bankCanvas.getContext('2d');
  if (bankCtx) bankCtx.imageSmoothingEnabled = false;

  const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let W = CANVAS_WIDTH;
  let H = CANVAS_HEIGHT;
  let grid = tileLayout(W, H);
  let raf = 0;
  let lastFrame = -1;
  let stopped = false;
  const t0 = performance.now();

  function drawFrame(target, t) {
    const lap = (t * DRIFT_SPEED) % LOOP_LENGTH;
    const D = LOOP_START + lap;
    // Follow the river's own centreline at the middle of the screen, so it
    // stays framed as it meanders. Every tile shares this camera (offset
    // by whole tiles sideways) — that's what keeps the seams continuous.
    const midRowD = D - (H / 2 - grid.y0 - CANOE_SCREEN_Y) / PIXELS_PER_UNIT;
    const cam = centerX(midRowD);
    for (const tile of grid.tiles) {
      const d = D + tile.dOffset;
      const c = cam + tile.camOffset;
      // Each tile contributes its top TILE_STEP_Y rows only, except the
      // bottom row of tiles, which has nothing below to hand the rest to.
      const rows = tile.y + CANVAS_HEIGHT >= H ? CANVAS_HEIGHT : TILE_STEP_Y;
      if (water) {
        water.render(t, d, c);
        target.drawImage(waterCanvas, 0, 0, CANVAS_WIDTH, rows, tile.x, tile.y, CANVAS_WIDTH, rows);
      }
      drawBanks(bankCtx, d, c, { hideVillages: true, time: t });
      if (!water) drawWaterFallback(bankCtx, d, c);
      target.drawImage(bankCanvas, 0, 0, CANVAS_WIDTH, rows, tile.x, tile.y, CANVAS_WIDTH, rows);
    }
    // Fade through dark at the loop's wrap instead of a hard cut.
    const secsIntoLap = lap / DRIFT_SPEED;
    const secsToWrap = (LOOP_LENGTH - lap) / DRIFT_SPEED;
    const edge = Math.min(secsIntoLap, secsToWrap);
    if (edge < WRAP_FADE && t > WRAP_FADE) {
      target.fillStyle = `rgba(10, 14, 20, ${1 - edge / WRAP_FADE})`;
      target.fillRect(0, 0, W, H);
    }
  }

  function render(now) {
    if (stopped || !ctx || !bankCtx) return;
    // Reduced motion: one still frame of the river, redrawn only on resize.
    const t = reduceMotion ? 8 : (now - t0) / 1000;
    const f = Math.floor(t * FPS);
    if (f === lastFrame) return;
    lastFrame = f;
    drawFrame(ctx, t);
  }

  function resize() {
    const vw = window.innerWidth || CANVAS_WIDTH;
    const vh = window.innerHeight || CANVAS_HEIGHT;
    const scale = pixelScale(vw, vh);
    W = Math.ceil(vw / scale);
    H = Math.ceil(vh / scale);
    canvas.width = W;
    canvas.height = H;
    // Centred on the viewport the same way #app centres the game screen,
    // so the middle tile lines up with it; the odd fractional pixel of
    // overhang is cropped evenly off both edges.
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.style.left = `${Math.round((vw - W * scale) / 2)}px`;
    canvas.style.top = `${Math.round((vh - H * scale) / 2)}px`;
    if (ctx) ctx.imageSmoothingEnabled = false;
    grid = tileLayout(W, H);
    lastFrame = -1;
    render(performance.now());
  }

  function tick(now) {
    if (stopped) return;
    render(now);
    raf = requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reduceMotion) raf = requestAnimationFrame(tick);

  return {
    element: canvas,
    // Fade out (style.css's #title-scene.leaving), then gone — including
    // its WebGL context, so the game's own water renderer isn't sharing
    // the GPU with a second one nobody can see.
    dismiss() {
      if (stopped) return;
      canvas.classList.add('leaving');
      window.removeEventListener('resize', resize);
      setTimeout(() => {
        stopped = true;
        cancelAnimationFrame(raf);
        canvas.remove();
        try {
          waterCanvas.getContext('webgl')?.getExtension?.('WEBGL_lose_context')?.loseContext();
        } catch { /* nothing to release */ }
      }, 900);
    },
    // Test hook: draw one frame at an arbitrary time through a caller's
    // context, so the tiling and the water path run without a browser.
    debugDrawFrame(testCtx, t) {
      drawFrame(testCtx, t);
    },
  };
}
