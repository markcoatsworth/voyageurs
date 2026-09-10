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
// How long with zero net forward progress before the stall failsafe below
// mercy-delivers the player — generous, since it only needs to catch someone
// genuinely stuck (see the failsafe's own comment by bestD/stallClock).
const STALL_TIME_LIMIT = 10;
const STALL_PROGRESS_EPS = 0.05; // world units — ignores noise, not real advance

// The cold-blue nightfall fades in over this many units before the trigger
// and out after deliverance — same shape as chasseGalerie's stormIntensityAt,
// gentler in game.js's render (this isn't the Devil).
const NIGHT_FADE_IN = 55;
const NIGHT_FADE_OUT = 45;

// It's a screen-space presence (like Le Diable), hanging over the middle of
// the view against the moon — not pinned to a world point. It drifts a
// little side to side; the strike still reaches a real spot on the water.
const SWAY_PX = 26;        // how far its body drifts either side of centre
const SWAY_PERIOD = 6.2;   // seconds for a full drift
const BASE_Y = 118;        // screen y of the haunch line (the moon sits behind)

// Strike cadence and reach, eased from the start of the stretch to the end.
// Big deliberate boss, not a yappy dog — a few weighty strikes, each with a
// readable wind-up (the head rearing back) and a generous dodge. Tightened
// once from 2.1/1.4 cadence and 1.25/0.95 wind-up: the fight read a shade too
// easy, so the strikes come a touch quicker and land a touch sooner — still
// well inside "read it and steer aside," just less forgiving of dawdling.
const FIRST_STRIKE_DELAY = 1.05;
const STRIKE_INTERVAL_FAR = 2.0;
const STRIKE_INTERVAL_NEAR = 1.3;
// The wind-up: the head rears back and the landing ring is marked on the
// water — aimed where the canoe will be if it holds this speed and line.
// The whole wind-up is your window to leave the ring by *any* means:
// steer aside, brake short, or gun it past. Do nothing and the jaws find
// you (light chip damage — first encounter).
const WINDUP_FAR = 1.2;
const WINDUP_NEAR = 0.9;
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

  // Stall failsafe: tracks the furthest flowDistance actually reached, and
  // how long it's been since that record last advanced — not a flat
  // wall-clock timer. A fixed "42 seconds since spotted" assumed a desktop
  // pace covering the ~144-unit approach; on touch devices (MOBILE_SPEED_SCALE
  // and the halved steering in game.js) that same distance can genuinely take
  // longer even while dodging cleanly, so a flat timer fired mid-approach and
  // "delivered" the player while they were still far short of the city. This
  // only trips for someone making no real headway (braking through every
  // strike, or pinned by the current), regardless of how fast their device
  // moves — real progress, at any pace, always resolves by proximity instead.
  let bestD = 0;
  let stallClock = 0;

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
    bestD = 0;
    stallClock = 0;
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
        bestD = playerFlowDistance;
        stallClock = 0;
      }

      if (spotted) clock += dt; // drives drift, cadence, and the hover animation

      if (phase === 'stalking') {
        // Deliverance is normally reaching the city; stallClock is the
        // failsafe for a player who brakes on every wind-up and stalls
        // against the upstream current — it can't hound them forever.
        if (playerFlowDistance > bestD + STALL_PROGRESS_EPS) {
          bestD = playerFlowDistance;
          stallClock = 0;
        } else {
          stallClock += dt;
        }
        if (playerFlowDistance >= DELIVERANCE_DISTANCE || stallClock > STALL_TIME_LIMIT) {
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

      const bob = Math.sin(clock * 1.6) * 3 + Math.sin(clock * 0.8) * 2;
      const bodyX = clamp(CANVAS_WIDTH / 2 + swayPx, 118, CANVAS_WIDTH - 118);
      const baseY = BASE_Y - bob - retreatT * 46; // haunch line, screen-space
      const alpha = clamp(phase === 'delivered' ? 1 - retreatT : 1, 0, 1);

      const { ext, jaws, glow } = strikePhase();
      const plunge = clamp(ext, 0, 1);        // 0 reared/hovering .. 1 jaws at the water
      const rear = clamp(-ext / 0.28, 0, 1);  // the wind-up coil

      // The strike's real landing spot on the water (its z scrolls it down
      // into view over the wind-up); the head and forelimbs reach for it.
      let ringX = bodyX, ringY = baseY + 120;
      if (strike) {
        const tp = worldToScreen(strike.targetX, worldDistance - strike.targetD, cameraWorldX);
        ringX = clamp(tp.x, 26, CANVAS_WIDTH - 26);
        ringY = clamp(tp.y, 34, CANVAS_HEIGHT - 6);
        if (strike.t < strike.windup + HOT_TIME) {
          const warn = clamp(strike.t / strike.windup, 0, 1);
          const rPx = HIT_DX * PIXELS_PER_UNIT;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = `rgba(3, 4, 8, ${0.12 + warn * 0.16})`;
          ctx.beginPath();
          ctx.ellipse(ringX, ringY, rPx * (2.4 - warn * 1.4), rPx * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(158, 44, 38, ${0.3 + warn * 0.5})`;
          ctx.lineWidth = 1 + warn * 2;
          ctx.beginPath();
          ctx.ellipse(ringX, ringY, rPx, rPx * 0.58, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Pose: hunched howler when calm — head thrown up and back over the
      // shoulders — driving the whole front half down at the ring on a strike.
      const sh = {
        x: lerp(bodyX - 2, ringX, plunge * 0.5),
        y: lerp(baseY - 40, ringY - 46, plunge) - rear * 9,
      };
      const hd = {
        x: lerp(bodyX - 6, ringX, plunge * 0.9),
        y: lerp(sh.y - 15, ringY - 12, plunge) - rear * 12,
      };
      // The muzzle points down-forward at the canoe when calm (a wolf head
      // squared at you, jaws parted), thrusting at the ring on a strike; the
      // wind-up rears it up and back.
      const snout = {
        x: lerp(hd.x + 4, ringX + 2, plunge) - rear * 10,
        y: lerp(hd.y + 17, ringY + 1, plunge) - rear * 24,
      };
      drawDemonWolf(ctx, {
        hip: { x: bodyX, y: baseY }, sh, hd, snout,
        ringX, ringY, plunge, rear, jaws, glow, alpha, clock,
      });
    },
  };
}

const fract = (v) => v - Math.floor(v);
const rand = (i, seed) => fract(Math.sin(i * 12.9898 + seed * 4.1) * 43758.5453);

// A fur-edged tapered mass from A (width w0) to B (width w1) — the workhorse
// for limbs, neck and torso. Jitter on the edge kills the smooth-cartoon read.
function furTaper(ctx, ax, ay, w0, bx, by, w1, spike, seed) {
  let dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  const nx = -dy, ny = dx;
  const N = 5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = lerp(w0, w1, t) / 2 + (i % 2 ? spike * (0.4 + rand(i, seed)) : -spike * 0.3);
    ctx.lineTo(lerp(ax, bx, t) + nx * w, lerp(ay, by, t) + ny * w);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const w = lerp(w0, w1, t) / 2 + (i % 2 ? spike * (0.4 + rand(i + 20, seed)) : -spike * 0.3);
    ctx.lineTo(lerp(ax, bx, t) - nx * w, lerp(ay, by, t) - ny * w);
  }
  ctx.closePath();
  ctx.fill();
}

// A single fur tuft / claw — a thin triangle poking out of an edge in
// direction (dx, dy).
function spike(ctx, x, y, dx, dy, len, w) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  ctx.beginPath();
  ctx.moveTo(x - uy * w, y + ux * w);
  ctx.lineTo(x + ux * len, y + uy * len);
  ctx.lineTo(x + uy * w, y - ux * w);
  ctx.closePath();
  ctx.fill();
}

// The demon-wolf: a big black silhouette hung over the river against the
// moon — an upright, hunched myth-wolf with a long thrown-back snout, sharp
// ears, a spiked mane and long clawed arms; the spectral hindquarters fray
// into shadow. On a strike the whole front half drives down at the water.
// Almost no interior detail — the shape and the moon do the work, with a
// cold rim to lift it off the night and eyes that catch light on the wind-up.
function drawDemonWolf(ctx, p) {
  const { hip, sh, hd, snout, ringX, ringY, plunge, rear, jaws, glow, alpha, clock } = p;
  const S = '#0c0d16';  // silhouette
  const D = '#050609';   // darkest — fray, ears, mane
  ctx.save();
  ctx.globalAlpha = alpha;

  // --- tail: a curved ragged plume, up and back, behind everything
  ctx.fillStyle = S;
  ctx.beginPath();
  ctx.moveTo(hip.x + 8, hip.y + 2);
  ctx.quadraticCurveTo(hip.x + 34, hip.y - 4, hip.x + 28, hip.y - 34);
  ctx.quadraticCurveTo(hip.x + 22, hip.y - 18, hip.x + 12, hip.y - 3);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 4; i++) spike(ctx, hip.x + 18 + i * 3, hip.y - 8 - i * 7, 0.5, -0.9, 8, 2);

  // --- spectral fray hanging off the hips, drifting
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = D;
  for (let i = 0; i < 8; i++) {
    const w = Math.sin(clock * 1.3 + i * 1.2) * 4;
    const fx = hip.x - 24 + i * 6 + w;
    const h = 12 + (i % 3) * 11 + Math.sin(clock * 2 + i) * 5;
    ctx.beginPath();
    ctx.moveTo(fx - 3, hip.y + 6);
    ctx.lineTo(fx + w * 0.5, hip.y + 6 + h);
    ctx.lineTo(fx + 3, hip.y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // --- hind legs: digitigrade — thigh down, shin back, foot forward
  ctx.fillStyle = S;
  for (const s of [-1, 1]) {
    const knee = { x: hip.x + s * 13, y: hip.y + 22 };
    const ankle = { x: hip.x + s * 7, y: hip.y + 40 };
    const toe = { x: hip.x + s * 17, y: hip.y + 46 };
    furTaper(ctx, hip.x + s * 8, hip.y + 4, 15, knee.x, knee.y, 10, 1.4, s * 3);
    furTaper(ctx, knee.x, knee.y, 10, ankle.x, ankle.y, 6, 1.2, s * 5);
    furTaper(ctx, ankle.x, ankle.y, 6, toe.x, toe.y, 4, 1, s * 7);
  }

  // --- hips
  ctx.fillStyle = S;
  ctx.beginPath();
  ctx.ellipse(hip.x, hip.y, 21, 19, 0, 0, TAU);
  ctx.fill();

  // --- torso: hips -> shoulders (stretches long on a strike)
  furTaper(ctx, hip.x, hip.y - 8, 33, sh.x, sh.y + 6, 40, 2, 11);

  // --- shoulder hump
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, 26, 21, 0, 0, TAU);
  ctx.fill();

  // --- mane: a spiked ridge along the hunched back, tallest over the
  // shoulders and easing off before the head so it never crowds the skull
  ctx.fillStyle = D;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const bx = lerp(hip.x - 15, sh.x - 12, f);
    const by = lerp(hip.y - 13, sh.y - 15, f);
    const h = (6 + rand(i, 3) * 8 + Math.sin(f * Math.PI) * 10) * (1 - f * 0.45);
    ctx.beginPath();
    ctx.moveTo(bx - 5, by + 6);
    ctx.lineTo(bx - 1 + rand(i, 9) * 3, by - h);
    ctx.lineTo(bx + 5, by + 6);
    ctx.closePath();
    ctx.fill();
  }

  // --- arms: far arm raised with claws splayed (howl) / near arm forward;
  // both sweep down to the ring on a strike
  ctx.fillStyle = S;
  for (const s of [-1, 1]) {
    const sho = { x: sh.x + s * 16, y: sh.y + 2 };
    const rest = s < 0
      ? { x: sh.x - 27, y: sh.y - 26 - rear * 6 }
      : { x: sh.x + 27, y: sh.y + 6 };
    const hitH = { x: ringX + s * 13, y: ringY - 3 };
    const hand = { x: lerp(rest.x, hitH.x, plunge), y: lerp(rest.y, hitH.y, plunge) };
    const elbow = { x: (sho.x + hand.x) / 2 + s * 7, y: (sho.y + hand.y) / 2 + (s < 0 ? -3 : 8) };
    furTaper(ctx, sho.x, sho.y, 13, elbow.x, elbow.y, 10, 1.4, s * 12);
    furTaper(ctx, elbow.x, elbow.y, 10, hand.x, hand.y, 6, 1.2, s * 15);
    const cdx = plunge > 0.35 ? 0 : (s < 0 ? -0.35 : 0.45);
    const cdy = plunge > 0.35 ? 1 : -0.9;
    for (let c = -1; c <= 1; c++) spike(ctx, hand.x + c * 3, hand.y, cdx + c * 0.22, cdy, 9, 1.6);
  }

  // --- neck + head
  ctx.fillStyle = S;
  furTaper(ctx, sh.x - 2, sh.y - 8, 18, hd.x, hd.y + 2, 13, 1.4, 21);
  ctx.beginPath();
  ctx.ellipse(hd.x, hd.y, 12, 11, 0, 0, TAU);
  ctx.fill();

  // ears: two clean pointed triangles up off the skull, angled back
  ctx.fillStyle = D;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hd.x + s * 3, hd.y - 6);
    ctx.lineTo(hd.x + s * 11, hd.y - 4);
    ctx.lineTo(hd.x + s * 6 - 3, hd.y - 20);
    ctx.closePath();
    ctx.fill();
  }

  // --- snout: a long unmistakable wedge off the skull toward `snout`, split
  // into an upper and lower jaw swung apart by `jaws` (perp to its axis).
  const sdx = snout.x - hd.x, sdy = snout.y - hd.y;
  const sl = Math.hypot(sdx, sdy) || 1;
  const nx = -sdy / sl, ny = sdx / sl;   // perpendicular
  const g = 2 + jaws * 8;
  ctx.fillStyle = S; // upper jaw
  ctx.beginPath();
  ctx.moveTo(hd.x + nx * 6, hd.y + ny * 6);
  ctx.lineTo(hd.x - nx * 3, hd.y - ny * 3);
  ctx.lineTo(snout.x - nx * 1.5, snout.y - ny * 1.5);
  ctx.lineTo(snout.x + nx * g, snout.y + ny * g);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = D; // lower jaw, swung open
  ctx.beginPath();
  ctx.moveTo(hd.x - nx * 6, hd.y - ny * 6);
  ctx.lineTo(hd.x + nx * 2, hd.y + ny * 2);
  ctx.lineTo(snout.x + nx * 1.5, snout.y + ny * 1.5);
  ctx.lineTo(snout.x - nx * g, snout.y - ny * g);
  ctx.closePath();
  ctx.fill();
  // fangs at the jaw line
  ctx.fillStyle = 'rgba(226, 224, 214, 0.85)';
  for (const s of [-1, 1]) {
    const fx = lerp(hd.x, snout.x, 0.55) + nx * s * 1.5;
    const fy = lerp(hd.y, snout.y, 0.55) + ny * s * 1.5;
    spike(ctx, fx, fy, sdx / sl, sdy / sl, 4, 1);
  }
  if (jaws > 0.3) {
    ctx.fillStyle = `rgba(184, 70, 46, ${0.32 * (jaws - 0.3)})`;
    ctx.beginPath();
    ctx.ellipse(lerp(hd.x, snout.x, 0.5), lerp(hd.y, snout.y, 0.5), 3, g * 0.7, 0, 0, TAU);
    ctx.fill();
  }

  // --- cold rim on the moonward (upper) edge
  ctx.strokeStyle = `rgba(140, 172, 214, ${0.22 * alpha})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sh.x - 24, sh.y - 4);
  ctx.quadraticCurveTo(sh.x - 4, sh.y - 26, sh.x + 18, sh.y - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hd.x, hd.y, 11, Math.PI * 1.1, Math.PI * 2);
  ctx.stroke();

  // --- eyes: two points, a faint ember always, flaring pale-gold on the
  // wind-up
  for (const s of [-1, 1]) {
    const ex = hd.x + s * 4 + (snout.x - hd.x) * 0.12;
    const ey = hd.y - 1 + (snout.y - hd.y) * 0.12;
    if (glow > 0.05) {
      ctx.fillStyle = `rgba(255, 206, 120, ${0.55 * glow})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.6 + glow * 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = glow > 0.45 ? '#ffe6a0' : 'rgba(210, 150, 90, 0.8)';
    ctx.fillRect(ex - 0.9, ey - 0.9, 1.8, 1.8);
  }

  ctx.restore();
}
