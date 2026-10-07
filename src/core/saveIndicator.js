// The "Saving" indicator: a little side-on canoe with two voyageurs
// paddling in time, "SAVING" underneath, in the bottom-right corner of the
// game screen for SHOW_MS every time main.js actually writes the
// checkpoint. Asked for as "a small canoe with two guys paddling and the
// text 'Saving' underneath... for 2 seconds" — the implicit checkpoint
// (main.js's top comment) used to be completely silent, which is fine for
// saving but leaves no way to know it happened.
//
// Drawn on its own tiny canvas (SPRITE_W x SPRITE_H, shown at 2x by
// style.css) rather than borrowing sprites.js's canoe: that one is
// top-down, and a paddling stroke only reads side-on. Animates only while
// it's showing — nothing runs for the 99% of the time it's hidden.

// 5s — first cut was the 2s originally asked for; lengthened by request.
export const SHOW_MS = 5000;
const FPS = 8;
export const SPRITE_W = 44;
export const SPRITE_H = 22;

const HULL = '#c8873f'; // birchbark, oiled
const HULL_DARK = '#8a5a2b';
const GUNWALE = '#5a3218';
const CAPOTE = '#2e4a6b'; // the blue hooded coat
const SKIN = '#e0b080';
const TUQUE = '#c8382a';
const PADDLE = '#e0a458';
const RIPPLE = '#7ec8e3';
const SPLASH = '#e8f6ff';

// Blade position through one stroke, relative to the paddler's shoulder:
// reach forward, pull, finish behind, lifted recovery. Both paddlers in
// unison — voyageurs kept time.
const STROKE = [
  { dx: 6, dy: 8 },
  { dx: 1, dy: 9 },
  { dx: -4, dy: 8 },
  { dx: 2, dy: 3 },
];

function px(ctx, x, y, w = 1, h = 1) {
  ctx.fillRect(x, y, w, h);
}

function line(ctx, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    px(ctx, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  }
}

// One frame of the canoe, heading right. Exported for the smoke test.
export function drawSavingFrame(ctx, frame) {
  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
  const wl = 17 + (frame % 8 < 4 ? 0 : 1); // waterline, with a one-pixel bob
  const x0 = 4;
  const len = 36;

  // Ripples sliding back past the hull — the canoe "moves" while the
  // sprite stays put.
  ctx.fillStyle = RIPPLE;
  const span = SPRITE_W + 8;
  for (let k = 0; k < 5; k++) {
    const x = (((k * 11 - frame * 2) % span) + span) % span - 5;
    px(ctx, x, 19 + (k % 2) * 2, 4, 1);
  }

  // Hull, a column at a time: three pixels deep amidships, sweeping up into
  // the canot's tall curled bow and stern, the keel lifting toward each end
  // so the tips come to a point rather than a block.
  for (let i = 0; i < len; i++) {
    const e = Math.abs((2 * i) / (len - 1) - 1);
    const rise = Math.round(Math.max(0, (e - 0.55) / 0.45) ** 2 * 6);
    const top = wl - 3 - rise;
    const bottom = wl - (e > 0.8 ? Math.round(((e - 0.8) / 0.2) * 3) : 0);
    ctx.fillStyle = HULL;
    px(ctx, x0 + i, top, 1, bottom - top + 1);
    ctx.fillStyle = GUNWALE;
    px(ctx, x0 + i, top);
    ctx.fillStyle = HULL_DARK;
    px(ctx, x0 + i, bottom);
  }

  // Two paddlers, bow and stern: blue capote, face, red tuque with a
  // tassel that flops in time with the stroke.
  const stroke = STROKE[Math.floor(frame / 2) % STROKE.length];
  for (const u of [0.3, 0.66]) {
    const x = x0 + Math.round(u * (len - 1));
    const gy = wl - 3; // gunwale amidships
    ctx.fillStyle = CAPOTE;
    px(ctx, x - 1, gy - 4, 3, 4);
    ctx.fillStyle = SKIN;
    px(ctx, x - 1, gy - 6, 3, 2);
    ctx.fillStyle = TUQUE;
    px(ctx, x - 1, gy - 7, 3, 1);
    px(ctx, x - 2, gy - 7 + (frame % 4 < 2 ? 0 : 1)); // tassel
    // Paddle: grip above the shoulder, blade the last two pixels.
    const sx = x + 1;
    const sy = gy - 4;
    const bx = sx + stroke.dx;
    const by = sy + stroke.dy;
    ctx.fillStyle = PADDLE;
    line(ctx, sx - Math.sign(stroke.dx || 1) * 2, sy - 3, bx, by);
    px(ctx, bx, by - 1, 1, 3);
    if (stroke.dy >= 8) {
      ctx.fillStyle = SPLASH;
      px(ctx, bx - 1, wl + 1, 3, 1);
    }
  }
}

export function createSaveIndicator() {
  const el = document.createElement('div');
  el.id = 'save-indicator';
  el.setAttribute('role', 'status');
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d');
  const label = document.createElement('div');
  label.className = 'save-label';
  label.textContent = 'SAVING';
  el.append(canvas, label);

  let frame = 0;
  let animTimer = null;
  let hideTimer = null;

  function stopAnim() {
    clearInterval(animTimer);
    animTimer = null;
  }

  return {
    element: el,
    // Up for SHOW_MS from *this* call — a second save landing while it's
    // still showing restarts the clock rather than cutting it short.
    show() {
      clearTimeout(hideTimer);
      el.classList.add('show');
      if (!animTimer && ctx) {
        drawSavingFrame(ctx, frame);
        animTimer = setInterval(() => drawSavingFrame(ctx, ++frame), 1000 / FPS);
      }
      hideTimer = setTimeout(() => {
        el.classList.remove('show');
        // Keep animating through the fade-out (style.css), then stop.
        hideTimer = setTimeout(stopAnim, 400);
      }, SHOW_MS);
    },
    isShowing() {
      return el.classList.contains('show');
    },
  };
}
