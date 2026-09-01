import { CANVAS_WIDTH, CANVAS_HEIGHT } from './twod/config.js';
import { createObstacleField } from './twod/obstacles.js';
import { createWaterRenderer } from './twod/waterGL.js';
import { createMusic } from './twod/music.js';
import { createMinimap } from './twod/minimap.js';
import { createTouchControls, isTouchPrimary } from './twod/touchControls.js';
import { Input } from './utils/input.js';
import { Game } from './game.js';
import { VILLAGES } from './river/route.js';
import { SEGMENT_SHAPE_OFFSET } from './river/path.js';

const app = document.getElementById('app');

// Dev/testing cheat: ?start=<village name> drops the canoe there instead of
// the put-in — e.g. ?start=tadoussac, ?start=sept-iles, ?start=quebec-city.
// Matched case-insensitively and with accents stripped (typing "iles" for
// "Îles" is the whole point of a URL you type by hand). Each village
// already knows which of the three river segments (see river/route.js's
// module comment) it's actually on, so starting on the Québec City stretch
// works the same way as anywhere else — no separate handling needed here.
// Unrecognized or absent falls back to the real start (the put-in, fjord).
//
// Deliberately lands a bit *before* the village's own flowDistance, not
// exactly on it: arriving at a dock normally means steering into position
// over some real distance of approach, and starting with zero of that
// runway is its own bug for the fjord's own last stop specifically —
// Tadoussac's flowDistance is also exactly where the fjord segment's hard
// ceiling sits (game.js's SEGMENT_BOUNDS), so landing precisely on it left
// no room to steer into the dock before already being jammed against it.
const START_APPROACH_BUFFER = 25;
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function parseStartLocation() {
  const raw = new URLSearchParams(window.location.search).get('start');
  if (!raw) return { flowDistance: 0, segment: 'fjord' };
  const wanted = stripAccents(raw.trim().toLowerCase());
  const match = VILLAGES.find((v) => wanted === stripAccents(v.name.toLowerCase()));
  if (!match) {
    if (raw.trim()) console.warn(`?start=${raw}: no matching village, starting from the put-in instead.`);
    return { flowDistance: 0, segment: 'fjord' };
  }
  const segmentStart = SEGMENT_SHAPE_OFFSET[match.segment];
  const flowDistance = Math.max(segmentStart, match.flowDistance - START_APPROACH_BUFFER);
  return { flowDistance, segment: match.segment };
}
const { flowDistance: startFlowDistance, segment: startSegment } = parseStartLocation();

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

// Sits in the top-right corner below the mute/pause buttons (#right-panel
// in index.html/style.css). This doesn't reserve any space from the game
// canvas — the canvas keeps rendering at full size — it just relies on the
// same fixed-to-viewport corner positioning the buttons already use. On a
// wide/short-ish window the canvas doesn't reach the corner anyway (there's
// empty background on either side once it's scaled to an integer
// multiple), so nothing ends up under it there; on a narrow phone where the
// canvas does reach every edge, this floats over it the same way the
// buttons already do. See twod/minimap.js for why it's a real,
// geographically-placed route rather than an invented shape.
const minimap = createMinimap();
document.getElementById('right-panel').appendChild(minimap.el);

// How big that empty margin needs to be judged, in px: small enough that a
// narrow/phone-width window (no margin at all) still gets a usable
// minimum, capped so a huge ultrawide monitor doesn't blow it up past a
// sensible size relative to the game view.
const MINIMAP_MIN = 110;
// On a real touch device the canvas fills the full viewport width (see
// resize()'s own comment on scale), so sidebarWidth below is always
// ~0 and the minimap always ends up sitting right at MINIMAP_MIN,
// floating over the canvas rather than beside it either way — may as
// well have that floor be a size actually worth reading on a phone.
const MOBILE_MINIMAP_MIN = 150;
const MINIMAP_MAX = 280;

const dpad = document.getElementById('touch-dpad');
const DPAD_GAP = 4; // breathing room between the canvas and the dpad row

function resize() {
  // The canvas's own size is unaffected by the dpad — it's picked exactly
  // as before, filling as much of the actual viewport as an integer scale
  // allows. The dpad below just uses whatever margin that leaves rather
  // than shrinking the canvas to manufacture room for itself.
  const rawScale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  const flooredScale = Math.floor(rawScale);
  // An integer multiple keeps pixel-art edges crisp, but on a small/mobile
  // screen that floors all the way down to 1x, leaving most of the
  // viewport empty — better to fill the screen at a fractional scale
  // (image-rendering: pixelated still looks fine, just not perfectly even)
  // than to render a postage stamp in the corner.
  const scale = flooredScale >= 2 ? flooredScale : Math.max(rawScale, 1);
  const canvasWidth = CANVAS_WIDTH * scale;
  const canvasHeight = CANVAS_HEIGHT * scale;
  screen.style.width = `${canvasWidth}px`;
  screen.style.height = `${canvasHeight}px`;

  // #app centers the canvas in the full viewport, so each side gets an
  // equal share of whatever width is left over. The minimap fills that
  // margin (minus its own edge gaps) instead of sitting at a fixed size
  // that's lost in a much bigger sidebar on a wide window.
  const sidebarWidth = (window.innerWidth - canvasWidth) / 2;
  const minimapMin = isTouchPrimary() ? MOBILE_MINIMAP_MIN : MINIMAP_MIN;
  const size = Math.round(Math.max(minimapMin, Math.min(MINIMAP_MAX, sidebarWidth - 32)));
  minimap.el.style.width = `${size}px`;

  // Which margin actually has room for the dpad varies a lot by window
  // shape, and picking the wrong one is exactly what went wrong before: on
  // a typical wide desktop window the strip *beside* the canvas is huge
  // (hundreds of px) while the strip *below* it is often under 40px — an
  // integer-scale canvas height rarely leaves much vertical slack once it's
  // already claimed most of the width. So check the side margin first
  // (cheap and static — that whole column never overlaps the canvas at any
  // vertical position, so no dynamic top is even needed there), and only
  // fall back to positioning below the canvas — computed from its actual
  // rendered bottom edge via getBoundingClientRect, not re-derived from the
  // centering math above — when the window is narrow enough that the side
  // margin can't fit it but a bottom margin can. Real dpad dimensions (not
  // hardcoded copies of style.css's numbers) so this can't drift out of
  // sync with the CSS.
  const screenRect = screen.getBoundingClientRect();
  const dpadRect = dpad.getBoundingClientRect();
  const rightMargin = window.innerWidth - screenRect.right;
  const bottomMargin = window.innerHeight - screenRect.bottom;

  if (rightMargin >= dpadRect.width + DPAD_GAP) {
    dpad.style.right = '20px';
    dpad.style.top = 'auto';
    dpad.style.bottom = '20px';
  } else if (bottomMargin >= dpadRect.height + DPAD_GAP) {
    dpad.style.right = '20px';
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(screenRect.bottom + DPAD_GAP)}px`;
  } else {
    // Neither margin fits it — a window shaped so tightly that avoiding the
    // canvas entirely isn't possible without shrinking it, which the canvas
    // never does. Clamp to the lowest fully on-screen row instead of
    // pushing the dpad off the bottom of the screen: a dpad you can still
    // see and press, overlapping the canvas slightly, beats one that's
    // technically clear of it but invisible.
    dpad.style.right = '20px';
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(window.innerHeight - dpadRect.height)}px`;
  }
}
window.addEventListener('resize', resize);
resize();

// Shared downstream-distance clock: written by Game each frame, read by
// obstacles/terrain/whales whenever they need "what's here right now?"
const world = { distance: 0 };

const obstacles = createObstacleField(world);
const input = new Input();
createTouchControls(input);

const ui = {
  hud: document.getElementById('hud'),
  hudScore: document.getElementById('hud-score'),
  hudSpeedFill: document.getElementById('hud-speed-fill'),
  hudHealthFill: document.getElementById('hud-health-fill'),
  hudBlockade: document.getElementById('hud-blockade'),
  hudBlockadeFill: document.getElementById('hud-blockade-fill'),
  damageFlash: document.getElementById('damage-flash'),
  titleScreen: document.getElementById('title-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  finalStats: document.getElementById('final-stats'),
  restartBtn: document.getElementById('restart-btn'),
  pauseScreen: document.getElementById('pause-screen'),
  milestoneBanner: document.getElementById('milestone-banner'),
  minimap,
};

// Background music — browsers block autoplay until a real user gesture, so
// this starts on the player's first keypress or click rather than on load.
const music = createMusic();

const game = new Game({ ctx, water, input, obstacles, world, ui, music, startFlowDistance, startSegment });

// The canoe launches immediately — this intro caption is just a fading
// overlay, not a gate, so it disappears on its own after a few seconds.
setTimeout(() => ui.titleScreen.classList.add('intro-fade-out'), 4500);
// opacity:0 alone leaves it fully interactive-transparent but still
// occupying its layout box forever — harmless once every .screen
// self-centers independently (see style.css), but there's no reason for
// an invisible element to keep existing at all once its own fade
// transition (0.8s) has actually finished.
setTimeout(() => ui.titleScreen.classList.add('hidden'), 4500 + 900);

const muteBtn = document.getElementById('mute-btn');
muteBtn.classList.toggle('muted', music.muted);
muteBtn.addEventListener('click', () => {
  const muted = music.toggleMute();
  muteBtn.classList.toggle('muted', muted);
});
// Mobile browsers are picky about exactly which gesture type counts as
// "real" user activation for unlocking audio, and (confirmed on a real
// device) the very first attempt can fail for reasons outside this code's
// control — so these deliberately stay attached rather than {once: true}.
// music.start() only actually retries play() until one succeeds (see its
// own comment); once that happens every later call here is an instant
// no-op, so leaving these listeners running permanently costs nothing.
for (const evt of ['pointerdown', 'touchend', 'keydown', 'click']) {
  window.addEventListener(evt, () => music.start());
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    game.togglePause();
  }
});

// Escape has no touch equivalent, hence a visible button — shown for every
// input type, not just touch, since a tappable/clickable pause control is
// a reasonable thing to want on desktop too.
document.getElementById('pause-btn').addEventListener('click', () => game.togglePause());

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
