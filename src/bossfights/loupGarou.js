// Le Loup-garou — but not the folk-tale farmer-turned-dog: a diabolical
// myth-wolf, huge, that hangs in the air over the river on the run into
// Québec City, spectral hindquarters trailing away into shadow, and strikes
// down at the canoe with its jaws. A man who skipped his Easter confession
// seven years running is cursed to this until someone draws his blood; here
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
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';
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

// It hangs over the channel this far up-current, drifting slowly across the
// centre line — a looming presence, always on screen, never on a bank.
const HOVER_LEAD = 4.6;
const SWAY_AMP = 4.4;      // world units it drifts either side of centre
const SWAY_PERIOD = 5.6;   // seconds for a full drift
const HOVER_PX = 34;       // pixels it floats above the water, before the bob

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

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 8;
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
  let swayX = 0;             // current lateral world-offset from centre (hover drift)
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
    swayX = 0;
    strike = null;
    strikeTimer = FIRST_STRIKE_DELAY;
    retreatT = 0;
  }

  // How wide the jaws are gaping (0..1) and how hot the eyes/embers burn
  // (0..1) right now — pure animation, derived from the strike timeline.
  function striking() { return !!strike; }
  function strikePhase() {
    if (!strike) return { ext: 0, jaws: 0, glow: 0 };
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

      // Slow drift across the channel centre — two terms so it's not a clean
      // metronome. Clamped to stay within the water.
      const drift = Math.sin(clock * TAU / SWAY_PERIOD) * SWAY_AMP
        + Math.sin(clock * 0.61 + 1.3) * SWAY_AMP * 0.4;
      const room = Math.max(0, widthAt(playerFlowDistance + HOVER_LEAD) / 2 - 3);
      swayX = clamp(drift, -room, room);

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
    draw(ctx, worldDistance, cameraWorldX, time) {
      if (!spotted) return;
      if (!active && (phase !== 'delivered' || retreatT >= 1)) return;

      const homeFlow = worldDistance /* == playerFlowDistance in game.js */ + HOVER_LEAD;
      const z = worldDistance - homeFlow; // ~ -HOVER_LEAD
      if (Math.abs(z) > VISIBLE_Z_RANGE) return;

      const hover = worldToScreen(centerX(homeFlow) + swayX, z, cameraWorldX);
      const bob = Math.sin(clock * 2.1) * 4 + Math.sin(clock * 0.9) * 3;
      const bodyY = hover.y - HOVER_PX - bob - retreatT * 40;

      const { ext, jaws, glow } = strikePhase();
      // The head: from the hover, reaching down toward the strike point on
      // the water when `ext` is positive, reared up above the body when
      // negative (the wind-up).
      let headX = hover.x;
      let headY = bodyY - 8;
      if (strike) {
        const tp = worldToScreen(strike.targetX, worldDistance - strike.targetD, cameraWorldX);
        const reach = clamp(ext, 0, 1);
        headX = lerp(hover.x, tp.x, reach * 0.9);
        headY = lerp(bodyY - 8, tp.y - 6, reach) + (ext < 0 ? ext * 34 : 0);

        // The strike telegraph on the water — a red maw-ring at true size
        // from the first frame (the blockade's visual language), a shrinking
        // shadow closing onto it.
        if (strike.t < strike.windup + HOT_TIME) {
          const warn = clamp(strike.t / strike.windup, 0, 1);
          const rPx = HIT_DX * PIXELS_PER_UNIT;
          ctx.save();
          ctx.fillStyle = `rgba(6, 8, 14, ${0.16 + warn * 0.18})`;
          ctx.beginPath();
          ctx.ellipse(tp.x, tp.y, rPx * (2.5 - warn * 1.5), rPx * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(214, 66, 52, ${0.35 + warn * 0.55})`;
          ctx.lineWidth = 1.5 + warn * 2;
          ctx.beginPath();
          ctx.ellipse(tp.x, tp.y, rPx, rPx * 0.62, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }

      const alpha = clamp(phase === 'delivered' ? 1 - retreatT : 1, 0, 1);
      drawDemonWolf(ctx, hover.x, bodyY, headX, headY, jaws, glow, alpha, clock);

      // a disturbed slick on the water directly under it, so it reads as
      // hanging *over* the river, not standing on it
      ctx.save();
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = '#05070d';
      ctx.beginPath();
      ctx.ellipse(hover.x, hover.y + 2, 34, 8, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  };
}

// The demon-wolf: a big dark forequarters and a heavy angular head, spectral
// hindquarters trailing off into drifting shadow, hellfire eyes, ember-tipped
// hackles. Drawn around (bodyX, bodyY) for the chest/shoulders and (headX,
// headY) for the skull — game.js's render lays a cold night wash behind it,
// so it needs the pale rim and the eye-bloom to separate.
function drawDemonWolf(ctx, bodyX, bodyY, headX, headY, jaws, glow, alpha, clock) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const R = 30; // half the shoulder span, roughly

  // --- spectral hindquarters: ragged shadow wisps trailing up-current ---
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = '#0a0c15';
  for (let i = 0; i < 6; i++) {
    const t = clock * 1.6 + i * 1.1;
    const wx = bodyX + R * 0.5 + i * 6 + Math.sin(t) * 5;
    const wy = bodyY - 2 + Math.sin(t * 1.3 + i) * 5 + i * 1.5;
    ctx.beginPath();
    ctx.ellipse(wx, wy, R * 0.55 - i * 3.2, R * 0.4 - i * 2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // --- cold rim behind the solid mass ---
  ctx.fillStyle = 'rgba(150, 170, 200, 0.20)';
  ctx.beginPath();
  ctx.ellipse(bodyX, bodyY, R + 3, R * 0.8 + 3, 0, 0, TAU);
  ctx.fill();

  // --- chest / shoulders ---
  ctx.fillStyle = '#161821';
  ctx.beginPath();
  ctx.ellipse(bodyX, bodyY, R, R * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0c0d15';
  ctx.beginPath();
  ctx.ellipse(bodyX, bodyY + R * 0.4, R * 0.9, R * 0.5, 0, 0, TAU);
  ctx.fill();

  // --- forelegs raking the air below the chest ---
  ctx.strokeStyle = '#0c0d15';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const px = bodyX + s * R * 0.5;
    const sw = Math.sin(clock * 6 + s) * 6;
    ctx.beginPath();
    ctx.moveTo(px, bodyY + R * 0.4);
    ctx.lineTo(px - s * 6 + sw, bodyY + R * 1.15);
    ctx.stroke();
  }

  // --- hackles: jagged spikes along the neck toward the head, ember tips ---
  const nx = (bodyX + headX) / 2;
  const ny = (bodyY + headY) / 2;
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    const sx = lerp(bodyX - R * 0.3, headX, f);
    const sy = lerp(bodyY - R * 0.5, headY - 6, f) - 4;
    ctx.fillStyle = '#12131c';
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy + 8);
    ctx.lineTo(sx, sy - 6 - (1 - f) * 4);
    ctx.lineTo(sx + 4, sy + 8);
    ctx.closePath();
    ctx.fill();
    if (glow > 0.2) {
      ctx.fillStyle = `rgba(255, 140, 50, ${0.5 * glow})`;
      ctx.fillRect(sx - 1, sy - 6 - (1 - f) * 4, 2, 3);
    }
  }

  // --- neck: a heavy dark taper from shoulders to skull ---
  ctx.fillStyle = '#14151e';
  ctx.beginPath();
  ctx.moveTo(bodyX - R * 0.3, bodyY - R * 0.3);
  ctx.lineTo(bodyX + R * 0.3, bodyY + R * 0.2);
  ctx.lineTo(headX + 10, headY + 12);
  ctx.lineTo(headX - 10, headY - 4);
  ctx.closePath();
  ctx.fill();

  // --- head: long angular skull, ears swept back like horns ---
  const HW = 15, HL = 22;
  ctx.fillStyle = 'rgba(150, 170, 200, 0.18)';
  ctx.beginPath();
  ctx.ellipse(headX, headY, HW + 3, HL * 0.6 + 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#181922';
  ctx.beginPath();
  ctx.moveTo(headX - HW, headY - 6);
  ctx.lineTo(headX + HW, headY - 6);
  ctx.lineTo(headX + HW * 0.5, headY + HL * 0.5);   // toward the muzzle (down)
  ctx.lineTo(headX - HW * 0.5, headY + HL * 0.5);
  ctx.closePath();
  ctx.fill();
  // ears / horns
  ctx.fillStyle = '#101019';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(headX + s * HW * 0.7, headY - 4);
    ctx.lineTo(headX + s * (HW + 8), headY - 18);
    ctx.lineTo(headX + s * HW * 0.3, headY - 8);
    ctx.closePath();
    ctx.fill();
  }

  // --- muzzle + jaws (open by `jaws`) ---
  const gap = jaws * 14;
  ctx.fillStyle = '#141520';
  // upper jaw
  ctx.beginPath();
  ctx.moveTo(headX - HW * 0.5, headY + HL * 0.45);
  ctx.lineTo(headX + HW * 0.5, headY + HL * 0.45);
  ctx.lineTo(headX + 4, headY + HL * 0.8);
  ctx.lineTo(headX - 4, headY + HL * 0.8);
  ctx.closePath();
  ctx.fill();
  // hellfire in the throat when open
  if (jaws > 0.15) {
    ctx.fillStyle = `rgba(255, 110, 40, ${0.6 * jaws})`;
    ctx.beginPath();
    ctx.ellipse(headX, headY + HL * 0.75 + gap * 0.4, 6, 4 + gap * 0.3, 0, 0, TAU);
    ctx.fill();
  }
  // lower jaw, dropped
  ctx.fillStyle = '#101019';
  ctx.beginPath();
  ctx.moveTo(headX - HW * 0.45, headY + HL * 0.8 + gap);
  ctx.lineTo(headX + HW * 0.45, headY + HL * 0.8 + gap);
  ctx.lineTo(headX + 3, headY + HL * 1.0 + gap);
  ctx.lineTo(headX - 3, headY + HL * 1.0 + gap);
  ctx.closePath();
  ctx.fill();
  // fangs
  ctx.fillStyle = '#e8e6dc';
  for (const fx of [-4, -1.5, 1.5, 4]) {
    ctx.beginPath();
    ctx.moveTo(headX + fx - 1, headY + HL * 0.78);
    ctx.lineTo(headX + fx + 1, headY + HL * 0.78);
    ctx.lineTo(headX + fx, headY + HL * 0.78 + 3 + gap * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // --- eyes: big amber discs, bloom scaled by `glow` ---
  for (const s of [-1, 1]) {
    const ex = headX + s * HW * 0.42;
    const ey = headY + 2;
    ctx.fillStyle = `rgba(255, ${Math.round(150 + glow * 60)}, 40, ${0.28 + glow * 0.25})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 6 + glow * 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = glow > 0.7 ? '#ffdf7a' : '#ffb43c';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(ex - 0.6, ey - 2.4, 1.2, 4.8); // slit pupil
  }

  // --- a few embers rising off it ---
  ctx.globalAlpha = alpha * 0.7;
  for (let i = 0; i < 5; i++) {
    const t = (clock * 0.8 + i * 0.7) % 1;
    const ex = bodyX + Math.sin(i * 3 + clock) * R;
    const ey = bodyY - t * 40;
    ctx.fillStyle = `rgba(255, ${120 + i * 20}, 40, ${(1 - t) * 0.6})`;
    ctx.fillRect(ex, ey, 2, 2);
  }
  ctx.restore();
}
