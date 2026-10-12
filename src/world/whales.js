// Belugas — the white whales of the St. Lawrence estuary. Scenery only: no
// collision, never in the way (the canoe passes straight through one).
//
// Placement is stateless and hashed per distance slot, so the same whales
// surface in the same places every run, like the trees.
//
// Only in the estuary (whalesAllowedAt): from the Tadoussac crossing up to
// Baie-Saint-Paul, opposite Île aux Coudres — the upper end of where real
// belugas range. They used to appear anywhere the river was wider than
// ESTUARY_WIDTH_THRESHOLD, which put them on Lac Saint-Pierre and around
// Montréal, both fresh water ("limit them to the estuary").
//
// And drawn as whales, not a pale oval ("make them look more like whales. I
// want to see a blowhole spout and also a tail coming out of the water"):
// each one runs its own breathing cycle (WHALE_CYCLE) — a ripple, the white
// back breaking the surface, a spout from the blowhole, rolling under head
// first, then the tail flukes lifting clear of the water and slipping down,
// then a long stretch under. Height out of the water is drawn up the screen,
// the same pseudo-3D the churches and trees use.
import { CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, braidAt, southIslandAt, ESTUARY_WIDTH_THRESHOLD, SEGMENT_SHAPE_OFFSET } from './river/path.js';
import { hash, hashRange } from '../shared/hash.js';
import { VILLAGES } from './villages.js';

// A whale every ~8 units on average (was every 15: 9 apart, 60% filled),
// once the estuary was the only place they appear and each spends a good
// part of its breath under: at the old density one was on screen in only
// about a fifth of frames.
const SLOT_SPACING = 7;
const SPAWN_CHANCE = 0.85;
const WHALE_REACH = 8; // units either side of mid-river — see drawWhales

// The estuary: all of lawrenceEast (the real estuary below Tadoussac — only
// reachable by ?start= now), and lawrenceWest from its start at the
// Tadoussac crossing up to Baie-Saint-Paul.
const ESTUARY_END = VILLAGES.find((v) => v.name === 'Baie-Saint-Paul').flowDistance;
export function whalesAllowedAt(d) {
  if (d >= SEGMENT_SHAPE_OFFSET.lawrenceEast && d < SEGMENT_SHAPE_OFFSET.lawrenceWest) return true;
  return d >= SEGMENT_SHAPE_OFFSET.lawrenceWest && d <= ESTUARY_END;
}

// One breath, in seconds, and where each part of it falls (fractions of the
// cycle). Mostly under — a whale that's always showing reads as a buoy.
export const WHALE_CYCLE = 11;
const P = {
  ripple: [0.0, 0.07],
  back: [0.06, 0.44],    // back breaks the surface, holds, rolls under
  spout: [0.15, 0.33],
  flukes: [0.46, 0.66],
};

const WHITE = '#eef4f5';
const SHADE = '#bfcfd4';
const DARK = '#6f8189';
export const SPOUT_COLOR = '#f4fbff';
export const FLUKE_COLOR = '#e3ecef';
const RING = (a) => `rgba(222, 240, 248, ${a})`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Every ellipse radius goes through this: the canvas throws on a negative
// one, and the body's inner fill (W/2 - 0.4) went negative in the first
// instant of surfacing, while the back was still a sliver — a crash, the
// whole run stopped ("major-axis radius ... is negative").
const r = (v) => Math.max(0.1, v);
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const within = ([a, b], u) => u >= a && u < b;
const progress = ([a, b], u) => clamp01((u - a) / (b - a));

function ring(ctx, x, y, rx, ry, a) {
  ctx.strokeStyle = RING(a);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, r(rx), r(ry), 0, 0, Math.PI * 2);
  ctx.stroke();
}

// The back above water, top-down: a white body along the river, the round
// melon at the head end, flippers just behind it, tapering to the tail.
// `show` 0..1 is how much is out; `roll` 0..1 sinks it head first.
function drawBack(ctx, x, y, dir, show, roll, seed) {
  const L = 22 * show, W = 8.5 * show;
  if (L < 2) return;
  const headY = y + dir * (L / 2 - 3);
  // Rolling under head first: the visible body slides toward the tail.
  const cy = y - dir * roll * L * 0.35;
  const len = L * (1 - roll * 0.6);
  ring(ctx, x, cy, W * 0.75, len * 0.6, 0.45);
  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.ellipse(x + 0.6, cy + 0.6, r(W / 2), r(len / 2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.ellipse(x, cy, r(W / 2 - 0.4), r(len / 2 - 0.4), 0, 0, Math.PI * 2);
  ctx.fill();
  if (roll < 0.35) {
    // The melon and the flippers, only while the head is still up.
    const hy = headY - dir * roll * L * 0.35;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.ellipse(x, hy, r(W * 0.42), r(W * 0.48), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SHADE;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + s * (W / 2 + 0.8), hy - dir * 4, 1.6, 2.6, s * 0.5 * dir, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = DARK; // the blowhole
    ctx.fillRect(Math.round(x) - 1, Math.round(hy - dir * 2), 2, 1);
  }
  // Water sheeting off the flanks.
  ctx.fillStyle = RING(0.6);
  const t = hash(seed) * 3;
  ctx.fillRect(Math.round(x - W / 2 - 1), Math.round(cy + Math.sin(t) * 3), 1, 2);
  ctx.fillRect(Math.round(x + W / 2), Math.round(cy - Math.sin(t) * 3), 1, 2);
}

// The spout: a column of spray rising up-screen from the blowhole, fanning
// out into a mist at the top and falling away. `p` 0..1 through it.
function drawSpout(ctx, x, y, p, seed) {
  const rise = Math.sin(Math.min(1, p * 1.4) * Math.PI / 2) * 18;
  const fade = 1 - smooth(0.55, 1, p);
  if (fade <= 0) return;
  ctx.fillStyle = SPOUT_COLOR;
  // The column.
  for (let h = 0; h < rise; h += 1.5) {
    const w = 1 + (h / 18) * 2;
    ctx.globalAlpha = fade * (0.9 - (h / 18) * 0.4);
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.max(1, Math.round(w)), 1);
  }
  // The plume at the top, spreading as it goes.
  for (let i = 0; i < 14; i++) {
    const a = hash(seed * 31 + i) * Math.PI * 2;
    const r = (0.4 + hash(seed * 17 + i) * 0.6) * (2 + p * 7);
    const px = x + Math.cos(a) * r;
    const py = y - rise + Math.sin(a) * r * 0.6 + p * p * 6; // drifting down as it thins
    ctx.globalAlpha = fade * 0.85;
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// The flukes: the tail stock lifting clear of the water at the tail end,
// the two lobes spread at the top with the notch between them, drips
// running off the tips, and the ring where it leaves the water.
function drawFlukes(ctx, x, y, p) {
  const lift = Math.sin(p * Math.PI);        // up and back down
  const h = lift * 13;
  if (h < 1) return;
  const tilt = (p - 0.5) * 3;                // leans as it goes over
  const topX = x + tilt;
  const topY = y - h;
  ring(ctx, x, y, 5 + p * 3, 2 + p, 0.55);
  // Tail stock.
  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(topX - 1, topY + 2);
  ctx.lineTo(topX + 1, topY + 2);
  ctx.lineTo(x + 2, y);
  ctx.closePath();
  ctx.fill();
  // The lobes: each a curved blade sweeping out and back from the notch.
  ctx.fillStyle = FLUKE_COLOR;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(topX, topY + 2);
    ctx.quadraticCurveTo(topX + s * 5, topY - 2, topX + s * 8, topY - 1);
    ctx.quadraticCurveTo(topX + s * 6, topY + 2, topX + s * 1, topY + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = DARK; // the notch
  ctx.fillRect(Math.round(topX), Math.round(topY + 1), 1, 2);
  // Drips off the tips, falling back to the water.
  ctx.fillStyle = SPOUT_COLOR;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const fall = ((p * 4 + k / 3) % 1) * h;
      ctx.globalAlpha = 0.7 * lift;
      ctx.fillRect(Math.round(topX + s * 7.5), Math.round(topY + fall), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// One whale at screen (x, y), heading `dir` (-1 head up-screen, +1 down),
// at `u` 0..1 through its breathing cycle. Exported for the smoke test.
export function drawWhale(ctx, x, y, dir, u, seed = 0) {
  ctx.save();
  if (within(P.ripple, u)) {
    const r = progress(P.ripple, u);
    ring(ctx, x, y, 3 + r * 6, 1.5 + r * 3, 0.4 * (1 - r * 0.5));
  }
  if (within(P.back, u)) {
    const show = smooth(P.back[0], P.back[0] + 0.08, u);
    const roll = smooth(P.back[1] - 0.1, P.back[1], u);
    drawBack(ctx, x, y, dir, show, roll, seed);
  }
  if (within(P.spout, u)) {
    const headY = y + dir * 8;
    drawSpout(ctx, x, headY - dir * 2, progress(P.spout, u), seed);
  }
  if (within(P.flukes, u)) {
    drawFlukes(ctx, x, y - dir * 9, progress(P.flukes, u));
  }
  ctx.restore();
}

export function drawWhales(ctx, time, worldDistance, cameraWorldX, worldToScreen) {
  const dNear = worldDistance - 6;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 4;
  const slotLo = Math.floor(dNear / SLOT_SPACING);
  const slotHi = Math.ceil(dFar / SLOT_SPACING);

  for (let slot = slotLo; slot <= slotHi; slot++) {
    if (hash(slot * 7 + 3) > SPAWN_CHANCE) continue;
    const d = slot * SLOT_SPACING + hashRange(slot, 1, -2, 2);
    if (!whalesAllowedAt(d)) continue;
    const width = widthAt(d);
    if (width <= ESTUARY_WIDTH_THRESHOLD) continue;

    // Within WHALE_REACH of mid-river: the estuary is 40-55 units wide
    // against a 20-unit screen, and spread over 70% of it (as they first
    // were) most whales surfaced off the edge of the view.
    const lateralFrac = hashRange(slot, 2, -0.7, 0.7);
    const worldX = centerX(d) + lateralFrac * Math.min(width / 2, WHALE_REACH / 0.7);
    const braid = braidAt(d);
    if (braid && Math.abs(worldX - braid.centerX) < braid.halfWidth + 0.5) continue; // don't swim through the island
    const south = southIslandAt(d);
    if (south && Math.abs(worldX - south.centerX) < south.halfWidth + 0.5) continue; // or Île Sainte-Hélène/Nuns' Island
    const z = worldDistance - d;
    const { x, y } = worldToScreen(worldX, z, cameraWorldX);

    // Its own place in the cycle, and which way it's swimming.
    const u = ((time / WHALE_CYCLE + hash(slot * 13 + 5)) % 1 + 1) % 1;
    const dir = hash(slot * 17 + 9) > 0.5 ? 1 : -1;
    drawWhale(ctx, x, y, dir, u, slot);
  }
}
