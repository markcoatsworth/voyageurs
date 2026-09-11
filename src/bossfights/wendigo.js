// Le Wendigo — the famine-spirit of the deep bush (an Algonquian terror the
// coureurs de bois picked up and never shook): a starved giant, ribs like a
// ship's frames, antlers of bare branch, that hunts by sound and movement
// and is never, ever full. It has come down onto the cold water of the lower
// Saguenay and paces the far cliff on the long lonely reach between
// Petit-Saguenay and the mouth at Tadoussac.
//
// The first "fight" in the game, and deliberately gentle. No projectiles,
// nothing to kill it with, no killing it anyway. It paces the shore (PROWL)
// and every so often rears up and stops dead to LISTEN — and in that window
// you take your hands off the paddle and go still in the water. Down (brake
// / backwater) is fine, that reads as bracing to a stop; it's Up/Left/Right
// — actively working the canoe — that it hears. There's no on-screen prompt:
// the tell is the telegraph (it rears, the eyes flare, a long drawn breath)
// and the very first LISTEN never strikes, a free dry run. Ride it out a
// couple of times and you drift to the Saint Lawrence, where it won't
// follow.
//
// Cold-white render (frostIntensityAt) — the fjord going bloodless and
// silent, the far end of the palette from Le Diable's hellstorm.
import { CANVAS_WIDTH } from '../shared/config.js';
import { MOUTH_DISTANCE } from '../world/river/path.js';

// Anchored to the mouth (Tadoussac), the way the loup-garou is anchored to
// Québec City: it stalks the last long reach before open water and falls
// back as that water comes into view. Petit-Saguenay sits around
// MOUTH_DISTANCE - 225, so the trigger still leaves a calm ~55-unit paddle
// out of the last village before the cold comes down.
export const TRIGGER_DISTANCE = MOUTH_DISTANCE - 170;
export const DELIVERANCE_DISTANCE = MOUTH_DISTANCE - 50;

// The cold fades in over this many units before the trigger and lifts after
// deliverance — same shape as the loup-garou's nightIntensityAt.
const FROST_FADE_IN = 58;   // ~from Petit-Saguenay's dock
const FROST_FADE_OUT = 42;  // clear again just before the mouth

// PROWL: safe, it paces. LISTEN: a telegraph (it rears up, eyes flare, a
// drawn breath — react, no punishment yet), then the hot window (be off the
// paddle), then it turns away. No on-screen instruction — the tell is the
// telegraph and the first listen is a free dry run. One cycle ~6.6s, so the
// ~17s fight is three or so listens, the first free. Tightened once from
// 3.1/1.5/1.9 to put it a little more on the attack.
const PROWL_TIME = 2.6;
const LISTEN_TELEGRAPH = 1.3;
const LISTEN_HOT = 2.0;
const LISTEN_RECOVER = 0.8;
// A failsafe end for a capped/edge case where the player never reaches the
// mouth (mirrors the loup-garou's clock > 42) — it can't hound them forever.
const MAX_CLOCK = 40;

// It used to just pop onto the screen at full opacity the instant it was
// spotted — jarring for the very first encounter in the game. Now it
// materializes gradually over SPAWN_FADE seconds (see draw()'s spawnIn), and
// the first PROWL runs long enough (PROWL_TIME + FIRST_PROWL_EXTRA) that it's
// fully solid *before* it first rears up to listen, instead of telegraphing
// while still half a ghost.
const SPAWN_FADE = 5.0;
const FIRST_PROWL_EXTRA = 2.6;

const SWAY_PX = 62;        // how far it ranges along the far shore
const SWAY_PERIOD = 7.4;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// Pure function of position, independent of the fight's state latch (so it
// also covers the tail after deliverance) — the cold that creeps in over the
// approach and lifts as the mouth opens up.
export function frostIntensityAt(flowDistance) {
  if (flowDistance <= TRIGGER_DISTANCE - FROST_FADE_IN
    || flowDistance >= DELIVERANCE_DISTANCE + FROST_FADE_OUT) return 0;
  const up = (flowDistance - (TRIGGER_DISTANCE - FROST_FADE_IN)) / FROST_FADE_IN;
  const down = (DELIVERANCE_DISTANCE + FROST_FADE_OUT - flowDistance) / FROST_FADE_OUT;
  return smoothstep(Math.min(up, down));
}

export function createWendigo() {
  let phase = 'idle';        // 'idle' | 'stalking' | 'delivered'
  let active = false;
  let spotted = false;
  let justSpotted = false;
  let justListening = false;
  let justLunged = false;
  let justDelivered = false;

  let clock = 0;             // seconds since spotted
  let sub = 'prowl';         // 'prowl' | 'listen'
  let subT = 0;              // seconds in the current sub-phase
  let listenCount = 0;       // 1 = the free one
  let struck = false;        // a lunge already landed this listen
  let lunge = 0;             // 0..1, decays — the strike animation
  let sway = 0;              // screen-space position along the far shore
  let retreatT = 0;          // 0..1 once delivered, sliding back into the cliff

  function reset() {
    phase = 'idle';
    active = false;
    spotted = false;
    justSpotted = justListening = justLunged = justDelivered = false;
    clock = 0;
    sub = 'prowl';
    subT = 0;
    listenCount = 0;
    struck = false;
    lunge = 0;
    sway = 0;
    retreatT = 0;
  }

  // 0 while prowling, ramps to 1 across the telegraph, holds through the hot
  // window, eases back over the recover. game.js drives the frost glare and
  // the telegraph glare off this.
  function listenGlare() {
    if (phase !== 'stalking' || sub !== 'listen') return 0;
    if (subT < LISTEN_TELEGRAPH) return smoothstep(subT / LISTEN_TELEGRAPH);
    if (subT < LISTEN_TELEGRAPH + LISTEN_HOT) return 1;
    return 1 - smoothstep((subT - LISTEN_TELEGRAPH - LISTEN_HOT) / LISTEN_RECOVER);
  }

  return {
    reset,

    isActive() { return active; },
    isListening() { return phase === 'stalking' && sub === 'listen'; },
    listenGlare,
    frostIntensity(flowDistance) { return frostIntensityAt(flowDistance); },

    consumeJustSpotted() { const v = justSpotted; justSpotted = false; return v; },
    consumeJustListening() { const v = justListening; justListening = false; return v; },
    consumeJustLunged() { const v = justLunged; justLunged = false; return v; },
    consumeJustDelivered() { const v = justDelivered; justDelivered = false; return v; },

    // `stirring` is game.js's "the player is actively working the canoe"
    // (Up/Left/Right held — not Down, which reads as bracing to a stop).
    // onHit(entry) is only ever called with { type: 'wendigo' }; game.js's
    // handleHit gives it its own (very light, first-encounter) damage.
    update(dt, playerFlowDistance, stirring, onHit) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE
        && playerFlowDistance < DELIVERANCE_DISTANCE;

      if (phase === 'idle' && inRange) {
        phase = 'stalking';
        active = true;
        spotted = true;
        justSpotted = true;
        clock = 0;
        sub = 'prowl';
        subT = 0;
      }
      if (!spotted) return { active, spotted };

      clock += dt;

      if (phase === 'stalking'
        && (playerFlowDistance >= DELIVERANCE_DISTANCE || clock > MAX_CLOCK)) {
        phase = 'delivered';
        justDelivered = true;
        active = false;
        sub = 'prowl';
        struck = false;
        lunge = 0;
      }

      if (phase === 'stalking') {
        subT += dt;
        if (sub === 'prowl') {
          const prowlNeeded = listenCount === 0 ? PROWL_TIME + FIRST_PROWL_EXTRA : PROWL_TIME;
          if (subT >= prowlNeeded) {
            sub = 'listen';
            subT = 0;
            struck = false;
            listenCount++;
            justListening = true;
          }
        } else {
          const hotStart = LISTEN_TELEGRAPH;
          const hotEnd = LISTEN_TELEGRAPH + LISTEN_HOT;
          if (subT >= hotStart && subT < hotEnd && stirring && !struck) {
            struck = true;
            lunge = 1;
            justLunged = true;
            // The first listen is a free teaching beat — the scare, the
            // sound, the cue, but no blow.
            if (listenCount > 1) onHit({ type: 'wendigo' });
          }
          if (subT >= hotEnd + LISTEN_RECOVER) {
            sub = 'prowl';
            subT = 0;
          }
        }
      }

      lunge = Math.max(0, lunge - dt / 0.45);

      // It paces the shore while prowling; the instant it listens it goes
      // rigid (the stillness is half the tell) and turns to face straight
      // down the channel — sway eases to centre so it's squared on the canoe
      // by the time the jaws come.
      if (phase === 'stalking' && sub === 'listen') {
        sway *= Math.max(0, 1 - dt * 2.4);
      } else {
        sway = Math.sin(clock * TAU / SWAY_PERIOD) * SWAY_PX
          + Math.sin(clock * 0.7 + 1.1) * SWAY_PX * 0.28;
      }

      if (phase === 'delivered') retreatT = Math.min(1, retreatT + dt / 1.8);

      return { active, spotted };
    },

    // Like the loup-garou's, rendering ignores the update() gate — it draws
    // the beast while the fight is live and dissolving away over the short
    // retreat after.
    draw(ctx) {
      if (!spotted) return;
      if (!active && (phase !== 'delivered' || retreatT >= 1)) return;

      const glare = listenGlare();
      // Materializes slowly rather than popping in — see SPAWN_FADE's
      // comment. clock is already well past SPAWN_FADE by the time
      // deliverance/retreat can happen, so multiplying it in here never
      // rushes the retreat fade.
      const spawnIn = smoothstep(clock / SPAWN_FADE);
      const alpha = clamp((phase === 'delivered' ? 1 - retreatT : 1) * spawnIn, 0, 1);
      // Far shore, upper part of the frame. Leans out over the water as it
      // listens, drives down toward the canoe on a lunge, and rises back
      // into the cliff on the retreat.
      const bx = clamp(CANVAS_WIDTH / 2 + sway, 44, CANVAS_WIDTH - 44);
      // On the far shore it stands tall and cold; as it listens it rears and
      // leans down the channel, and on a lunge it drops and swells right over
      // the canoe.
      const groundY = 26 + glare * 6 + lunge * 60 - retreatT * 30;
      const scale = 1.02 + glare * 0.08 + lunge * 0.4;
      drawWendigo(ctx, { bx, groundY, glare, lunge, alpha, clock, scale });
    },
  };
}

const S = '#0a0e11';                                     // cold near-black silhouette
const RIM = (a) => `rgba(150, 198, 220, ${a})`;          // moon-cold edge light

// A tapered quad from A (half-width w0) to B (half-width w1) — the workhorse
// for the wendigo's stick limbs and narrow torso.
function limb(ctx, ax, ay, bx, by, w0, w1) {
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  ctx.beginPath();
  ctx.moveTo(ax + nx * w0, ay + ny * w0);
  ctx.lineTo(bx + nx * w1, by + ny * w1);
  ctx.lineTo(bx - nx * w1, by - ny * w1);
  ctx.lineTo(ax - nx * w0, ay - ny * w0);
  ctx.closePath();
  ctx.fill();
}

// A single claw / talon — a thin triangle poking out of a hand.
function claw(ctx, x, y, dx, dy, len) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  ctx.beginPath();
  ctx.moveTo(x - uy * 1.3, y + ux * 1.3);
  ctx.lineTo(x + ux * len, y + uy * len);
  ctx.lineTo(x + uy * 1.3, y - ux * 1.3);
  ctx.closePath();
  ctx.fill();
}

// The wendigo: a huge, starved silhouette on the far cliff — long spindly
// legs fading into the dark shore, a hollow ribbed torso hunched high at the
// shoulders, arms hanging well past the knees, a low thrust-forward skull
// with a gaping maw and heavy horns that curl up, back and hook forward
// again. Hollow eyes hold a faint cold light and flare white when it listens
// or lunges. Little interior detail; the shape, the rim light and the breath
// carry it.
function drawWendigo(ctx, p) {
  const { bx, groundY, glare, lunge, alpha, clock, scale } = p;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Grow about a pivot near the head, so a lunge plunges the whole body
  // down-screen toward the canoe rather than swelling in place.
  ctx.translate(bx, groundY);
  ctx.scale(scale, scale);
  ctx.translate(-bx, -groundY);

  const drift = Math.sin(clock * 1.3) * 2;
  // How far the head/neck thrust forward and down — small at rest, more as it
  // rears to listen, hard on a lunge.
  const thrust = 0.35 + glare * 0.35 + lunge * 0.7;

  const pelvis = { x: bx - drift * 0.5, y: groundY + 82 };
  const chest = { x: bx + drift * 0.4, y: groundY + 46 };
  const withers = { x: bx + drift * 0.4, y: groundY + 30 };            // high hunched back
  const neck = { x: bx + drift + 7 * thrust, y: groundY + 24 + thrust * 12 };
  const head = { x: neck.x + 7 + thrust * 6, y: neck.y + 6 + thrust * 9 };

  ctx.fillStyle = S;

  // --- body mist: a low pale haze it stands in, swelling as it listens
  const breath = Math.max(glare, lunge);
  if (breath > 0.03) {
    ctx.globalAlpha = alpha * 0.16 * breath;
    ctx.fillStyle = '#dff0f6';
    ctx.beginPath();
    ctx.ellipse(bx, groundY + 78, 34, 16, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = S;
  }

  // --- legs: long, spindly, planted, fading into the dark shore
  for (const s of [-1, 1]) {
    const knee = { x: pelvis.x + s * 9, y: pelvis.y + 30 };
    const foot = { x: pelvis.x + s * 4, y: pelvis.y + 60 };
    limb(ctx, pelvis.x, pelvis.y, knee.x, knee.y, 5.5, 3.4);
    limb(ctx, knee.x, knee.y, foot.x, foot.y, 3.4, 2);
  }

  // --- torso: pelvis -> chest -> a high hunched withers, then a narrow yoke
  limb(ctx, pelvis.x, pelvis.y, chest.x, chest.y, 9, 10);
  limb(ctx, chest.x, chest.y, withers.x, withers.y, 10, 8);
  const shL = { x: withers.x - 16, y: withers.y + 1 };
  const shR = { x: withers.x + 16, y: withers.y + 1 };
  limb(ctx, shL.x, shL.y, shR.x, shR.y, 4.5, 4.5);

  // --- arms: gaunt, hanging past the knees; thrown forward and down on a lunge
  for (const s of [-1, 1]) {
    const sh = s < 0 ? shL : shR;
    const rElbow = { x: sh.x + s * 7, y: sh.y + 32 };
    const rHand = { x: sh.x + s * 3, y: sh.y + 64 };
    const lElbow = { x: sh.x + s * 12, y: sh.y + 34 + lunge * 14 };
    const lHand = { x: sh.x + s * 8, y: sh.y + 78 + lunge * 52 };
    const elbow = { x: lerp(rElbow.x, lElbow.x, lunge), y: lerp(rElbow.y, lElbow.y, lunge) };
    const hand = { x: lerp(rHand.x, lHand.x, lunge), y: lerp(rHand.y, lHand.y, lunge) };
    limb(ctx, sh.x, sh.y, elbow.x, elbow.y, 3.6, 2.7);
    limb(ctx, elbow.x, elbow.y, hand.x, hand.y, 2.7, 1.8);
    for (let c = -1; c <= 1; c++) claw(ctx, hand.x + c * 2.4, hand.y, c * 0.32, 1, 8 + lunge * 5);
  }

  // --- neck + low thrust-forward skull
  limb(ctx, withers.x, withers.y + 2, neck.x, neck.y, 5, 3.6);
  limb(ctx, neck.x, neck.y, head.x, head.y, 3.6, 2.6);
  ctx.beginPath();
  ctx.ellipse(head.x, head.y - 1, 6.5, 8.5, 0, 0, TAU);
  ctx.fill();

  // --- maw: a dark gape under the skull, always a little open, wide on a lunge
  const gape = 3 + glare * 3 + lunge * 13;
  ctx.fillStyle = '#05070a';
  ctx.beginPath();
  ctx.moveTo(head.x - 4.5, head.y + 2);
  ctx.lineTo(head.x + 5.5, head.y + 2);
  ctx.lineTo(head.x + 3, head.y + 2 + gape);
  ctx.lineTo(head.x - 3, head.y + 2 + gape);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(220, 232, 238, 0.72)'; // a ragged tooth row
  for (let t = -2; t <= 2; t++) {
    ctx.beginPath();
    ctx.moveTo(head.x + t * 2.1 - 0.8, head.y + 2);
    ctx.lineTo(head.x + t * 2.1, head.y + 4 + (t % 2 ? 1.4 : 0));
    ctx.lineTo(head.x + t * 2.1 + 0.8, head.y + 2);
    ctx.closePath();
    ctx.fill();
  }

  // --- horns: heavy and curling — they rise off the crown, sweep out and
  // back in a broad arc, then the tips hook back down and outward, like a
  // bison's or a twisted ram's. One forked tine off the outer sweep. Never
  // meeting over the head — the curl opens outward, away from the face.
  ctx.strokeStyle = S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const cx = head.x + s * 3, cy = head.y - 6;             // root at the crown
    ctx.lineWidth = 4.6;                                    // thick rising base, out and up
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(head.x + s * 20, head.y - 14, head.x + s * 26, head.y - 30);
    ctx.stroke();
    ctx.lineWidth = 3.1;                                    // the crown of the arc, sweeping back over
    ctx.beginPath();
    ctx.moveTo(head.x + s * 26, head.y - 30);
    ctx.quadraticCurveTo(head.x + s * 27, head.y - 46, head.x + s * 16, head.y - 50);
    ctx.stroke();
    ctx.lineWidth = 1.9;                                    // the tip, hooking back down and outward
    ctx.beginPath();
    ctx.moveTo(head.x + s * 16, head.y - 50);
    ctx.quadraticCurveTo(head.x + s * 10, head.y - 44, head.x + s * 18, head.y - 38);
    ctx.stroke();
    ctx.lineWidth = 1.7;                                    // forked tine off the outer sweep
    ctx.beginPath();
    ctx.moveTo(head.x + s * 24, head.y - 24);
    ctx.quadraticCurveTo(head.x + s * 34, head.y - 24, head.x + s * 38, head.y - 34);
    ctx.stroke();
  }

  // --- ribcage: a few cold-lit arcs across the hollow chest
  ctx.strokeStyle = RIM(0.5 * alpha);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(chest.x, chest.y - 6 + i * 6, 9 - i * 0.7, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  }

  // --- cold rim down the shaded edge and over the skull
  ctx.strokeStyle = RIM((0.3 + glare * 0.4) * alpha);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(shL.x - 3, shL.y);
  ctx.lineTo(chest.x - 5, chest.y);
  ctx.lineTo(pelvis.x - 6, pelvis.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(head.x, head.y - 1, 8, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();

  // --- breath: a pale plume out of the maw that swells as it listens / lunges
  if (breath > 0.03) {
    ctx.globalAlpha = alpha * 0.55 * breath;
    ctx.fillStyle = '#e4f2f8';
    for (let i = 0; i < 4; i++) {
      const px = head.x + (2 + i * 4) + Math.sin(clock * 2 + i) * 2.5;
      const py = head.y + 8 + i * 6 + lunge * 26;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.5 + i * 2.4, 2.4 + i * 1.2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }

  // --- eyes: two cold points, faintly lit at rest, flaring white on the
  // listen and the lunge
  const eg = Math.max(0.12, glare, lunge);
  for (const s of [-1, 1]) {
    const ex = head.x + s * 2.6;
    const ey = head.y - 2.5;
    if (eg > 0.2) {
      ctx.fillStyle = `rgba(210, 240, 255, ${0.55 * eg})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.6 + eg * 3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = eg > 0.5 ? '#eaf7ff' : 'rgba(190, 224, 240, 0.85)';
    ctx.fillRect(ex - 0.9, ey - 0.9, 1.8, 1.8);
  }

  ctx.restore();
}
