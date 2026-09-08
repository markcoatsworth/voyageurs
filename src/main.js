import { CANVAS_WIDTH, CANVAS_HEIGHT } from './shared/config.js';
import { createObstacleField } from './world/obstacles.js';
import { createWaterRenderer } from './world/waterGL.js';
import { createMusic } from './audio/music.js';
import { createMinimap } from './world/minimap.js';
import { createTouchControls, isTouchPrimary } from './core/touchControls.js';
import { Input } from './core/input.js';
import { Game } from './core/game.js';
import { VILLAGES } from './world/river/route.js';
import { SEGMENT_SHAPE_OFFSET } from './world/river/path.js';
import { SHIP_FLOW_DISTANCE } from './bossfights/blockade.js';
import { TRIGGER_DISTANCE as CHASSE_GALERIE_FLOW_DISTANCE } from './bossfights/chasseGalerie.js';

const app = document.getElementById('app');

// Dev/testing cheat: ?start=<village name> drops the canoe there instead of
// the put-in — e.g. ?start=tadoussac, ?start=sept-iles, ?start=quebec-city.
// Matched case-insensitively and with accents stripped (typing "iles" for
// "Îles" is the whole point of a URL you type by hand). Each village
// already knows which of the three river segments (see world/river/route.js's
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
// Hyphens and spaces are treated as the same separator on both sides of the
// comparison \u2014 some village names use a hyphen as part of the real name
// (Sept-\u00celes, Baie-Saint-Paul), others are two plain words (Qu\u00e9bec City),
// and there's no way for someone typing a URL by hand to know which is
// which. Collapsing both to one form before comparing means "quebec-city",
// "quebec city", and "quebec+city" (a literal space, once the browser
// decodes it) all match "Qu\u00e9bec City" \u2014 and "sept-iles"/"sept iles" still
// both match "Sept-\u00celes" too.
function normalizeStartName(s) {
  return stripAccents(s.toLowerCase()).replace(/[-\s]+/g, ' ').trim();
}
// Also-recognized, dev-only keywords that aren't real places — not part of
// VILLAGES, so they never show up on the minimap or anywhere in-game, they
// just give ?start= a couple more names to jump to for testing. One entry
// per boss fight (bossfights/blockade.js and bossfights/chasseGalerie.js
// today; more planned, each landing here the same way as it's built) —
// normalizeStartName() is applied to
// these keys too, so "british-blockade", "british blockade", and
// "british+blockade" all work, same as every real village name already
// does. "british-blockade" drops the canoe already within firing range of
// the Château Gauntlet instead of needing to paddle the ~30 units past
// Québec City's dock it'd normally take to reach it — 90 units short of the
// ship, comfortably inside APPROACH_RANGE (190) so cannon fire starts
// immediately, but with real room left to practice finding the gap before
// the hull itself.
//
// "chasse-galerie" drops the canoe a few units *past* chasseGalerie.js's
// TRIGGER_DISTANCE so the flight is already active on the first frame — the
// canoe still lifts off gradually from there. (It used to land 10 units
// short, but on a touch device the dialled-down forward paddle can't fight
// the backward Ottawa current + rapids over that gap, so the flight never
// started.)
const START_KEYWORDS = {
  [normalizeStartName('british-blockade')]: { flowDistance: SHIP_FLOW_DISTANCE - 90, segment: 'lawrenceWest' },
  [normalizeStartName('chasse-galerie')]: { flowDistance: CHASSE_GALERIE_FLOW_DISTANCE + 3, segment: 'lawrenceWest' },
};
function parseStartLocation() {
  const raw = new URLSearchParams(window.location.search).get('start');
  if (!raw) return { flowDistance: 0, segment: 'fjord' };
  const wanted = normalizeStartName(raw);
  const keyword = START_KEYWORDS[wanted];
  if (keyword) return keyword;
  const match = VILLAGES.find((v) => wanted === normalizeStartName(v.name));
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
// leaves a river-shaped hole (see world/terrain.js) for it to show through.
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
// buttons already do. See world/minimap.js for why it's a real,
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

const dpad = document.getElementById('touch-dpad'); // the steer pad wrapper
const weaponDpad = document.getElementById('weapon-dpad'); // the fire-button column, opposite side
const DPAD_GAP = 4; // breathing room between the canvas and the steer pad

// Keep the weapon controls (index.html #weapon-dpad) level with the move
// controls, straight across on the left edge: vertically centred on the move
// cluster (which is taller — 2+ keycap rows vs. one), anchored left instead
// of right. Called at the end of resize() and again by game.js (via
// ui.layoutWeaponPad) the moment the pistol is picked up and the pad stops
// being display:none, since resize() may not fire around then. A zero-size
// rect (still hidden) just parks it at the cluster's centre — harmless, and
// the follow-up call once it's visible fixes it.
function positionWeaponPad() {
  const r = dpad.getBoundingClientRect();
  const wr = weaponDpad.getBoundingClientRect();
  weaponDpad.style.left = '20px';
  weaponDpad.style.right = 'auto';
  weaponDpad.style.bottom = 'auto';
  weaponDpad.style.top = `${Math.round(r.top + r.height / 2 - wr.height / 2)}px`;
}

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

  // Desktop only: size the "how to play" keycap cue (style.css's --key) to
  // fill the sidebar column beside the game — as wide as the space allows,
  // but never so tall it would run into the minimap sitting above it. Left
  // unset on touch, where the round steer pad is the real control and has
  // its own fixed size. The inverted-T cluster is 3.36·key wide (3 caps +
  // 2 gaps of 0.18·key); ~2.4·key tall once the "MOVE" label above it is
  // counted.
  // --key lives on :root so both the MOVE cue (#steer-pad) and the FIRE cue
  // (#weapon-dpad) on the opposite edge read the same keycap size.
  if (isTouchPrimary()) {
    document.documentElement.style.removeProperty('--key');
  } else {
    const byWidth = (sidebarWidth - 24) / 3.36;
    const byHeight = (window.innerHeight - size - 80) / 2.4;
    const key = Math.max(30, Math.min(120, byWidth, byHeight));
    document.documentElement.style.setProperty('--key', `${Math.round(key)}px`);
  }

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
    // Centre it vertically in the empty column between the minimap (which
    // sits at the top of this same margin) and the bottom of the window,
    // so the big desktop cue doesn't look stranded down in the corner.
    const minimapBottom = minimap.el.getBoundingClientRect().bottom;
    const top = minimapBottom + Math.max(
      12,
      (window.innerHeight - minimapBottom - 20 - dpadRect.height) / 2,
    );
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(top)}px`;
  } else if (bottomMargin >= dpadRect.height + DPAD_GAP) {
    // Below the canvas — but on a tall phone with a short landscape canvas
    // there's a lot of empty space down here, and a pad floating right
    // under the canvas ends up mid-screen, out of comfortable thumb reach.
    // Sit it near the bottom edge instead, never higher than just-below the
    // canvas and never off-screen.
    const nearBottom = window.innerHeight - dpadRect.height - 28;
    const justBelowCanvas = screenRect.bottom + DPAD_GAP;
    const top = Math.min(
      window.innerHeight - dpadRect.height,
      Math.max(justBelowCanvas, nearBottom),
    );
    dpad.style.right = '20px';
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(top)}px`;
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

  positionWeaponPad();
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
  weaponPad: weaponDpad,
  // Called by game.js right after it un-hides the weapon pad, so the pad is
  // positioned immediately instead of waiting for the next window resize.
  layoutWeaponPad: positionWeaponPad,
  minimap,
};

// A change that breaks one system shouldn't leave the whole page frozen on
// the title with no clue why. This routes the error to the on-screen panel
// defined in index.html (window.showVoyageursError) — same UI whether the
// failure is at module load, in the Game constructor, or mid-frame. See
// loop() below for the per-frame guard and test/smoke.mjs for the test that
// catches these before they ship.
function showFatalError(err, context, { fatal = true } = {}) {
  console.error(`Voyageurs crashed while ${context}:`, err);
  const detail = (err && (err.stack || err.message)) || String(err);
  const summary = (err && err.message) || String(err);
  if (typeof window.showVoyageursError === 'function') {
    window.showVoyageursError(summary, detail, { when: context, fatal });
  } else {
    // Panel helper somehow isn't there (index.html edited?) — last resort.
    window.__voyageursErrorShown = true;
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(12,10,20,0.94);' +
      'color:#f4d79a;font:12px/1.5 monospace;padding:24px;overflow:auto';
    box.textContent = `Voyageurs error while ${context}:\n\n${detail}`;
    document.body.appendChild(box);
  }
}

// "Now playing" card (bottom-left, #now-playing in index.html). Built here
// rather than in music.js so the audio layer stays DOM-free — music.js just
// calls onTrack({ title, artist }) whenever a new track actually starts.
const nowPlayingEl = document.getElementById('now-playing');
const NOW_PLAYING_LINGER = 7000;
let nowPlayingHideTimer;
function showNowPlaying(track) {
  if (!track || !nowPlayingEl) return;
  nowPlayingEl.textContent = '';
  const head = document.createElement('div');
  head.className = 'np-head';
  const eq = document.createElement('div');
  eq.className = 'np-eq';
  eq.innerHTML = '<span></span><span></span><span></span><span></span>';
  const label = document.createElement('div');
  label.className = 'np-label';
  label.textContent = 'NOW PLAYING';
  head.append(eq, label);
  const title = document.createElement('div');
  title.className = 'np-title';
  title.textContent = track.title;
  const artist = document.createElement('div');
  artist.className = 'np-artist';
  artist.textContent = track.artist;
  nowPlayingEl.append(head, title, artist);

  nowPlayingEl.classList.add('show');
  clearTimeout(nowPlayingHideTimer);
  nowPlayingHideTimer = setTimeout(() => nowPlayingEl.classList.remove('show'), NOW_PLAYING_LINGER);
}

// Background music — browsers block autoplay until a real user gesture, so
// this starts on the player's first keypress or click rather than on load.
const music = createMusic({ onTrack: showNowPlaying });

// Registered before Game is constructed so a startup throw can't strand the
// title screen on forever — the caption still fades out on its own timer
// regardless of whether the game behind it came up.
//
// The canoe launches immediately — this intro caption is just a fading
// overlay, not a gate, so it disappears on its own after a few seconds.
setTimeout(() => ui.titleScreen.classList.add('intro-fade-out'), 4500);
// opacity:0 alone leaves it fully interactive-transparent but still
// occupying its layout box forever — harmless once every .screen
// self-centers independently (see style.css), but there's no reason for
// an invisible element to keep existing at all once its own fade
// transition (0.8s) has actually finished.
setTimeout(() => ui.titleScreen.classList.add('hidden'), 4500 + 900);

let game = null;
try {
  game = new Game({ ctx, water, input, obstacles, world, ui, music, startFlowDistance, startSegment });
  // Lets the index.html error handler word later crashes as "running the
  // game" rather than "loading the game".
  window.__voyageursReady = true;
} catch (err) {
  showFatalError(err, 'starting up');
}

const muteBtn = document.getElementById('mute-btn');
function syncMuteBtn(muted) {
  muteBtn.classList.toggle('muted', muted);
  muteBtn.textContent = muted ? 'MUSIC OFF' : 'MUSIC ON';
  muteBtn.title = muted ? 'Turn the music back on' : 'Turn the music off';
}
syncMuteBtn(music.muted);
muteBtn.addEventListener('click', () => {
  const muted = music.toggleMute();
  syncMuteBtn(muted);
  // Unmuting is a natural "wait, what is this?" moment — flash the card
  // back up for the track that's currently going.
  if (!muted) showNowPlaying(music.nowPlaying);
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

// Escape has no touch equivalent, hence a visible button — shown for every
// input type, not just touch, since a tappable/clickable pause control is
// a reasonable thing to want on desktop too. The label flips to RESUME
// while paused so it's obvious the same button gets you back.
const pauseBtn = document.getElementById('pause-btn');
function togglePause() {
  game?.togglePause();
  const paused = !!game?.paused;
  pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
  pauseBtn.title = paused ? 'Resume the game' : 'Pause the game';
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    togglePause();
  }
});

pauseBtn.addEventListener('click', togglePause);

// The on-screen fire button (index.html #fire-z). Drives the exact same
// path the Z key does — input.onWeaponFire, wired by game.js, which ignores
// the shot unless you're actually paddling the river. One press = one shot.
// The lit state mirrors input.js's keycap feedback so tap and keypress look
// the same. Kept clear of whether the pad is currently shown — game.js
// handles that; a press on a display:none button can't reach here anyway.
const fireBtn = document.getElementById('fire-z');
fireBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onWeaponFire?.('pistol');
  fireBtn.classList.add('active');
});
const clearFireBtn = () => fireBtn.classList.remove('active');
for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  fireBtn.addEventListener(evt, clearFireBtn);
}

let lastTime = performance.now();
let loopBroken = false;
function loop(now) {
  // rAF's timestamp can occasionally predate the performance.now() call
  // above (most noticeably on the very first frame), so clamp dt to
  // non-negative — a negative dt would tick every timer in the game
  // backwards for a frame.
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 1 / 20));
  lastTime = now;
  if (game && !loopBroken) {
    try {
      game.update(dt);
    } catch (err) {
      // Stop calling update rather than re-throwing the same error 60x a
      // second — the last frame it managed to draw stays on screen under
      // the error overlay.
      loopBroken = true;
      showFatalError(err, 'running the game');
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
