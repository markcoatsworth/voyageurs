// Le Loup-garou — but not the folk-tale farmer-turned-dog: a wide spectral
// apparition, the glowing head and forequarters of a myth-wolf hanging over
// the river on the run into Québec City, that levels its long muzzle at the
// canoe and lunges its jaws down at the water. A man who skipped his Easter
// confession seven years running is cursed to this until someone draws his
// blood; here
// there's nothing to draw it with (the pistol is a long way off) and no
// projectiles anywhere — the whole encounter is reading the wind-up, then
// steering or braking out from under the maw while you hold a line up the
// current. You don't beat it: you outlast it to the lights of Québec City,
// which it can't pass.
//
// MVP-plus. One phase: it looms and drifts over the channel and strikes on
// a slow cadence, escalating mildly, then deliverance at the capital. The
// second form, the paw-sweep, the "crashes into holy ground and a freed man
// crawls ashore" beat — later.
import { centerX } from '../world/river/path.js';
import { worldToScreen, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';
import { VILLAGES } from '../world/villages.js';

const QUEBEC_CITY = VILLAGES.find((v) => v.name === 'Quebec City');
// Spotted here (howl, nightfall already well underway), falls back here (the
// city in view). Anchored to Québec City's flowDistance so it follows if the
// capital ever moves; deliverance a short paddle short of the King's Wharf,
// leaving calm water to steer onto the dock and go ashore for repairs.
export const TRIGGER_DISTANCE = QUEBEC_CITY.flowDistance - 172; // a few units past Beaupré
export const DELIVERANCE_DISTANCE = QUEBEC_CITY.flowDistance - 28;
// Deliberately a short fight — this is early in the game and shouldn't be
// punishing yet. ~145 units / ~13s vs. the blockade's ~340.
const FIGHT_LENGTH = DELIVERANCE_DISTANCE - TRIGGER_DISTANCE;

// The cold-blue nightfall fades in over this many units before the trigger
// and out after deliverance — same shape as chasseGalerie's stormIntensityAt,
// gentler in game.js's render (this isn't the Devil).
const NIGHT_FADE_IN = 55;
const NIGHT_FADE_OUT = 45;

// A screen-space apparition (like Le Diable) hanging over the middle of the
// view, not pinned to a world point — it drifts a little side to side while
// the strike still reaches a real spot on the water.
const SWAY_PX = 26;        // how far it drifts either side of centre
const SWAY_PERIOD = 6.2;   // seconds for a full drift

// Strike cadence and reach, eased from the start of the stretch to the end.
// Big deliberate boss, not a yappy dog — a few weighty strikes, each with a
// readable wind-up (the head rearing back) and a generous dodge.
const FIRST_STRIKE_DELAY = 1.1;
const STRIKE_INTERVAL_FAR = 2.1;
const STRIKE_INTERVAL_NEAR = 1.4;
// The wind-up: the head rears back and the landing ring is marked on the
// water — aimed where the canoe will be if it holds this speed and line.
// The whole wind-up is your window to leave the ring by *any* means:
// steer aside, brake short, or gun it past. Do nothing and the jaws find
// you (light chip damage — first encounter).
const WINDUP_FAR = 1.25;
const WINDUP_NEAR = 0.95;
const HOT_TIME = 0.3;      // jaws-down: the damaging window
const RECOVER_TIME = 0.34; // hauling the head back up to the hover
const HIT_DX = 2.0;        // maw half-width — a second of steering clears it
// Half-depth along the current. Modest, because the strike is led at your
// *current* speed: hold it and you're in the jaws, but any real change of
// pace slides you out along this axis. (The river's own rapids nudge your
// effective speed around too, so a truly held line still gets grazed, not
// pinned.)
const HIT_DZ = 1.8;

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// Pure function of position, independent of the fight's state latch (so it
// also covers the tail after deliverance) — the cold night that creeps in
// over the approach and lifts as the city comes into view.
export function nightIntensityAt(flowDistance) {
  if (flowDistance <= TRIGGER_DISTANCE - NIGHT_FADE_IN
    || flowDistance >= DELIVERANCE_DISTANCE + NIGHT_FADE_OUT) return 0;
  const up = (flowDistance - (TRIGGER_DISTANCE - NIGHT_FADE_IN)) / NIGHT_FADE_IN;
  const down = (DELIVERANCE_DISTANCE + NIGHT_FADE_OUT - flowDistance) / NIGHT_FADE_OUT;
  return smoothstep(Math.min(up, down));
}

export function createLoupGarou() {
  let phase = 'idle';        // 'idle' | 'stalking' | 'delivered'
  let active = false;
  let spotted = false;
  let justSpotted = false;
  let justDelivered = false;

  let clock = 0;             // seconds since spotted, drives the drift + cadence
  let swayPx = 0;          // current screen-space drift of the body from centre
  let strike = null;         // { t, windup, targetD, targetX, hit }
  let strikeTimer = FIRST_STRIKE_DELAY;
  let retreatT = 0;          // 0..1 once delivered, the beast dissolving up-shore

  function reset() {
    phase = 'idle';
    active = false;
    spotted = false;
    justSpotted = false;
    justDelivered = false;
    clock = 0;
    swayPx = 0;
    strike = null;
    strikeTimer = FIRST_STRIKE_DELAY;
    retreatT = 0;
  }

  // How wide the jaws are gaping (0..1) and how hot the eyes burn (0..1) right
  // now — pure animation, derived from the strike timeline. Calm, it keeps a
  // slight howling gape and a faint ember in the eyes.
  function striking() { return !!strike; }
  function strikePhase() {
    if (!strike) return { ext: 0, jaws: 0.16, glow: 0.08 };
    if (strike.t < strike.windup) {
      const w = strike.t / strike.windup;
      return { ext: -0.28 * smoothstep(w), jaws: 0.35 * w, glow: 0.4 + 0.6 * w };
    }
    const a = (strike.t - strike.windup) / (HOT_TIME + RECOVER_TIME);
    const down = a < 0.32 ? a / 0.32 : 1 - (a - 0.32) / 0.68; // slam, then recoil
    return { ext: clamp(down, 0, 1), jaws: 0.4 + 0.6 * clamp(down, 0, 1), glow: 1 - 0.6 * a };
  }

  return {
    reset,

    isActive() { return active; },
    // True from the wind-up through the recovery — "it's committing, move".
    isStriking() { return striking(); },
    // World-X of the strike's landing ring (null when there's no strike) —
    // it's telegraphed on the water, so surfacing it is fair; a dodge assist
    // could use it later.
    strikeTargetX() { return strike ? strike.targetX : null; },
    nightIntensity(flowDistance) { return nightIntensityAt(flowDistance); },

    consumeJustSpotted() { const v = justSpotted; justSpotted = false; return v; },
    consumeJustDelivered() { const v = justDelivered; justDelivered = false; return v; },

    // onHit(entry) is only ever called with { type: 'wolf' } — game.js's
    // handleHit gives it its own (gentle, early-game) damage. effectiveSpeed
    // leads the strike ahead of the canoe, same reasoning as the blockade's
    // shots: aim at "where you are now" and your own forward speed carries
    // you clear by construction.
    update(dt, playerFlowDistance, playerWorldX, effectiveSpeed, onHit) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE
        && playerFlowDistance < DELIVERANCE_DISTANCE;

      if (phase === 'idle' && inRange) {
        phase = 'stalking';
        active = true;
        spotted = true;
        justSpotted = true;
        clock = 0;
        strikeTimer = FIRST_STRIKE_DELAY;
      }

      if (spotted) clock += dt; // drives drift, cadence, and the hover animation

      if (phase === 'stalking') {
        // Deliverance is normally reaching the city; the clock is also a
        // failsafe for a player who brakes on every wind-up and stalls
        // against the upstream current — it can't hound them forever.
        if (playerFlowDistance >= DELIVERANCE_DISTANCE || clock > 42) {
          phase = 'delivered';
          justDelivered = true;
          active = false;
          strike = null;
        }
      }

      // Slow screen-space drift, two terms so it's not a clean metronome.
      swayPx = Math.sin(clock * TAU / SWAY_PERIOD) * SWAY_PX
        + Math.sin(clock * 0.63 + 1.3) * SWAY_PX * 0.35;

      const progress = clamp((playerFlowDistance - TRIGGER_DISTANCE) / FIGHT_LENGTH, 0, 1);

      if (phase === 'stalking' && !strike) {
        strikeTimer -= dt;
        if (strikeTimer <= 0) {
          const windup = lerp(WINDUP_FAR, WINDUP_NEAR, progress);
          strike = {
            t: 0,
            windup,
            // Locked at the wind-up start: where the canoe will be if it
            // holds this speed, pulled a fifth toward mid-channel so
            // hugging a bank is punished and a dead-centre line is still
            // contested. Fixed from here — the ring on the water doesn't
            // chase you, so leaving it (any direction) dodges.
            targetD: playerFlowDistance + effectiveSpeed * windup,
            targetX: lerp(playerWorldX, centerX(playerFlowDistance), 0.2),
            hit: false,
          };
          strikeTimer = lerp(STRIKE_INTERVAL_FAR, STRIKE_INTERVAL_NEAR, progress);
        }
      }

      if (strike) {
        strike.t += dt;
        if (strike.t >= strike.windup && strike.t < strike.windup + HOT_TIME && !strike.hit) {
          if (Math.abs(playerFlowDistance - strike.targetD) < HIT_DZ
            && Math.abs(playerWorldX - strike.targetX) < HIT_DX) {
            strike.hit = true;
            onHit({ type: 'wolf' });
          }
        }
        if (strike.t >= strike.windup + HOT_TIME + RECOVER_TIME) strike = null;
      }

      if (phase === 'delivered') retreatT = Math.min(1, retreatT + dt / 1.6);

      return { active, spotted };
    },

    // Like the blockade's, rendering ignores the update() gate — it draws the
    // beast while the fight is live and dissolving away over the short
    // retreat after.
    draw(ctx, worldDistance, cameraWorldX) {
      if (!spotted) return;
      if (!active && (phase !== 'delivered' || retreatT >= 1)) return;

      const drift = Math.sin(clock * 1.4) * 3 + Math.sin(clock * 0.7) * 2;
      const cx = clamp(CANVAS_WIDTH / 2 + swayPx, 96, CANVAS_WIDTH - 96);
      const cy = 100 - drift - retreatT * 42; // vertical centre of the apparition
      const fade = clamp(phase === 'delivered' ? 1 - retreatT : 1, 0, 1);

      const { ext, jaws, glow } = strikePhase();
      const plunge = clamp(ext, 0, 1);
      const rear = clamp(-ext / 0.28, 0, 1);
      // How solid it is right now — it thins between strikes and gathers to
      // lunge. Never fully opaque; it's a ghost.
      const presence = fade * (0.5 + 0.13 * Math.sin(clock * 1.7) + 0.32 * plunge + 0.16 * rear);

      // The strike's real spot on the water — scrolls down into view over the
      // wind-up as the canoe closes; the head reaches for it.
      let ringX = cx;
      let ringY = cy + 90;
      if (strike) {
        const tp = worldToScreen(strike.targetX, worldDistance - strike.targetD, cameraWorldX);
        ringX = clamp(tp.x, 24, CANVAS_WIDTH - 24);
        ringY = clamp(tp.y, 40, CANVAS_HEIGHT - 6);
        if (strike.t < strike.windup + HOT_TIME) {
          const warn = clamp(strike.t / strike.windup, 0, 1);
          const rPx = HIT_DX * PIXELS_PER_UNIT;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.fillStyle = `rgba(3, 4, 8, ${0.12 + warn * 0.15})`;
          ctx.beginPath();
          ctx.ellipse(ringX, ringY, rPx * (2.4 - warn * 1.4), rPx * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(120, 170, 205, ${0.3 + warn * 0.5})`;
          ctx.lineWidth = 1 + warn * 2;
          ctx.beginPath();
          ctx.ellipse(ringX, ringY, rPx, rPx * 0.58, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Anchors. Wide low mass; the head sits forward-low with a long snout
      // pointed at the canoe, thrown up and back on the wind-up, driven down
      // at the ring on the strike.
      const head = {
        x: lerp(cx, ringX, plunge * 0.85),
        y: lerp(cy + 4, ringY - 16, plunge) - rear * 15,
      };
      const snout = {
        x: lerp(head.x + 3, ringX + 2, plunge) - rear * 9,
        y: lerp(head.y + 22, ringY + 1, plunge) - rear * 26,
      };
      drawGhostWolf(ctx, {
        cx, cy, hw: 96, head, snout,
        ringX, ringY, plunge, rear, jaws, glow, presence, clock,
      });
    },
  };
}

const fract = (v) => v - Math.floor(v);
const rand = (i, s) => fract(Math.sin(i * 12.9898 + s * 4.1) * 43758.5453);

// A soft filled ellipse in the current fill style — the ghost is built from
// stacked haze, not hard edges.
function haze(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU);
  ctx.fill();
}

// A tapering curved wisp from A through a bend to a fine tip at B.
function wisp(ctx, ax, ay, bx, by, cxb, cyb, w) {
  const mx1 = (ax + bx) / 2, my1 = (ay + by) / 2;
  let dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const nx = -dy, ny = dx;
  ctx.beginPath();
  ctx.moveTo(ax + nx * w, ay + ny * w);
  ctx.quadraticCurveTo(cxb + nx * w * 0.5, cyb + ny * w * 0.5, bx, by);
  ctx.quadraticCurveTo(cxb - nx * w * 0.5, cyb - ny * w * 0.5, ax - nx * w, ay - ny * w);
  ctx.closePath();
  ctx.fill();
  void mx1; void my1;
}

// Le Loup-garou as a wide spectral apparition over the river: the head and
// forequarters of a wolf in cold pale light — big pointed ears, a long
// muzzle levelled at the canoe, a spectral ruff spreading wide to both
// sides, forelegs reaching down. Drawn as a glowing contour over a faint
// translucent fill, edges fraying into drift. It casts its own light — there
// is no moon.
function drawGhostWolf(ctx, p) {
  const { cx, cy, hw, head, snout, ringX, ringY, plunge, jaws, glow, presence, clock } = p;
  if (presence <= 0.02) return;
  const A = presence;
  const ang = Math.atan2(snout.y - head.y, snout.x - head.x); // toward the muzzle

  ctx.save();

  // --- ambient aura: its own cold light on the dark, additive
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(cx, cy, 6, cx, cy, hw * 1.15);
  aura.addColorStop(0, `rgba(96, 142, 198, ${0.13 * A})`);
  aura.addColorStop(0.6, `rgba(64, 100, 152, ${0.05 * A})`);
  aura.addColorStop(1, 'rgba(64, 100, 152, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(cx - hw * 1.3, cy - hw, hw * 2.6, hw * 1.9);
  ctx.globalCompositeOperation = 'source-over';

  // --- wide spectral ruff behind the head — soft blobs spreading sideways,
  // this is the "wide"
  ctx.fillStyle = `rgba(118, 152, 202, ${0.09 * A})`;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const dr = Math.sin(clock * 1.1 + i * 1.5 + s) * 6;
      haze(ctx, head.x + s * (22 + i * 22), head.y - 4 - i * 3 + dr, 27 - i * 4, 19 - i * 3, s * 0.22);
    }
  }
  // rising tendrils off the crown
  ctx.fillStyle = `rgba(134, 168, 212, ${0.08 * A})`;
  for (let i = 0; i < 5; i++) {
    const bx = head.x + lerp(-44, 44, i / 4) + Math.sin(clock * 0.9 + i) * 4;
    const rise = 22 + rand(i, 2) * 30 + Math.sin(clock * 1.6 + i * 2) * 6;
    wisp(ctx, bx, head.y - 24, bx + Math.sin(clock + i) * 10, head.y - 24 - rise,
      bx, head.y - 24 - rise * 0.5, 3);
  }

  // --- forelegs: reaching down wide; the near one drives at the ring on a strike
  ctx.fillStyle = `rgba(132, 166, 210, ${0.11 * A})`;
  for (const s of [-1, 1]) {
    const strikeLeg = plunge > 0.35 && s === (ringX >= head.x ? 1 : -1);
    const paw = strikeLeg
      ? { x: ringX + s * 7, y: ringY - 2 }
      : { x: head.x + s * hw * 0.52, y: head.y + 46 + Math.sin(clock * 1.3 + s) * 3 };
    wisp(ctx, head.x + s * 14, head.y + 16, paw.x, paw.y,
      (head.x + paw.x) / 2 + s * 10, (head.y + paw.y) / 2 + 6, 6);
    ctx.strokeStyle = `rgba(180, 206, 238, ${0.22 * A})`;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath();
      ctx.moveTo(paw.x + c * 3, paw.y);
      ctx.lineTo(paw.x + c * 4 + s * 2, paw.y + 7);
      ctx.stroke();
    }
  }

  // --- the head, in a local frame where local +y points down the muzzle
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(ang - Math.PI / 2);
  const jr = jaws * 8;

  const contour = () => {
    ctx.beginPath();
    ctx.moveTo(-30, -6);                       // left ear outer base
    ctx.lineTo(-25, -42);                      // left ear tip
    ctx.lineTo(-12, -15);                      // left ear inner notch
    ctx.quadraticCurveTo(0, -21, 12, -15);     // brow
    ctx.lineTo(25, -42);                       // right ear tip
    ctx.lineTo(30, -6);                        // right ear outer base
    ctx.quadraticCurveTo(25, 8, 15, 18);       // right cheek
    ctx.quadraticCurveTo(12, 32, 6, 42 + jr);  // to the nose
    ctx.lineTo(-6, 42 + jr);
    ctx.quadraticCurveTo(-12, 32, -15, 18);
    ctx.quadraticCurveTo(-25, 8, -30, -6);
    ctx.closePath();
  };

  ctx.fillStyle = `rgba(150, 182, 222, ${0.12 * A})`;
  contour(); ctx.fill();
  ctx.fillStyle = `rgba(172, 202, 238, ${0.1 * A})`;
  ctx.beginPath(); ctx.ellipse(0, 6, 17, 22, 0, 0, TAU); ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(148, 214, 252, ${0.48 * A})`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  contour(); ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = `rgba(148, 214, 252, ${0.28 * A})`;
  ctx.beginPath();
  ctx.moveTo(-23, -35); ctx.lineTo(-14, -14);
  ctx.moveTo(23, -35); ctx.lineTo(14, -14);
  ctx.stroke();
  if (jaws > 0.18) {
    ctx.beginPath();
    ctx.moveTo(-9, 22); ctx.quadraticCurveTo(0, 25 + jr * 0.6, 9, 22);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // eyes — slanted glowing points
  const g2 = clamp(0.35 + 0.8 * glow, 0, 1);
  for (const s of [-1, 1]) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150, 224, 255, ${0.5 * g2 * A})`;
    haze(ctx, s * 8, -2, 2 + g2 * 3.5, 2 + g2 * 3.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(230, 250, 255, ${(0.45 + 0.55 * g2) * A})`;
    haze(ctx, s * 8, -2, 1.5, 2, s * 0.5);
  }
  ctx.restore(); // out of the head frame

  ctx.restore();
}
