// Le Diable — the held-arena boss at the head of the Chasse-galerie, right
// before Gatineau. Where the British blockade (bossfights/blockade.js) can
// only be survived and passed, this one you *kill*: the whole fight is
// aiming the canoe under the Devil to land pistol shots (weapons.js) while
// dodging the hellfire he lobs back down at you.
//
// It's a "held arena" — game.js clamps flowDistance at DIABLE_FLOW_DISTANCE
// while isHolding() is true, and asks chasseGalerie.js to keep the canoe
// hovering (setHeldAloft). The flight's own hazards (steeples, wind) are
// suspended for the duration; the Devil is the fight.
//
// MVP: one phase, one attack family (aimed fireballs that fan into a spread
// as his health drops), plus the feint (below) — a wind-up that sometimes
// isn't real, so the telegraph itself has to be read rather than reacted to
// on reflex. Phases / the drag attack / imps / a weak point all come later —
// see the design notes this came out of.
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
} from '../shared/config.js';
import { FLIGHT_END } from './chasseGalerie.js';

// A good chunk before Gatineau's dock (FLIGHT_END is GATINEAU - 18), far
// enough back that the canoe is still at real cruising altitude when the
// clamp bites.
export const DIABLE_FLOW_DISTANCE = FLIGHT_END - 45;
// He looms into view (banner + music) this far before the flow actually
// clamps, so the encounter has a moment of dread before it locks in.
const APPROACH = 16;

// How the fight escalates as hp drops, 0 (full health) -> 1 (dead) — see
// rampT's own comment at the call site for the formula. Replaces an
// earlier version that anchored the ramp to the fight's *original* 240 HP
// pool (a fixed window at the very end) rather than the live HP_MAX
// (3840, after a past "make the fight longer" pass 8x'd the pool without
// touching the ramp) — that kept the finale exactly as dangerous as the
// original short fight, but meant the ramp never engaged at all for
// roughly the first 94% of a now-several-minutes fight: reported as "too
// easy," and flat-until-the-last-few-seconds is exactly why. A naive fix
// (scale the same percentage thresholds against the new HP_MAX directly)
// was tried once already and made the *hardest* tier alone last over a
// minute of continuous dodging — unsurvivable for anyone not perfectly
// dodging the whole time. RAMP_GAMMA > 1 is what avoids repeating that:
// it biases the curve to stay low through the opening (still a real safe
// stretch, just no longer the entire fight) and only climbs to full
// intensity in roughly the last 14% of hp — a real, felt finale, not a
// multi-minute wall. Nudged up from 1.7 (which put that threshold at
// 15.6%) alongside CONTACT_DAMAGE's own reduction (see its comment) after
// a request to tone the fight down slightly — a fractionally later,
// gentler climb into the hardest tier, not a reversal of the escalation
// itself.
const RAMP_GAMMA = 1.9;
// A first pass doubled this (240 -> 480) and landed way short: a real
// playtest cleared it in ~30s. At FIRE_COOLDOWN (weapons.js, 0.16s) and
// BULLET_DAMAGE below, holding the trigger on a well-tracked target caps
// out around 25 dmg/sec -- so 480/25 ~= 19-30s once you're actually
// landing most shots, which is exactly what happened. No HP number was
// ever going to fix that on its own; the real ceiling is damage-per-
// second, not the pool. Scaled from that real data point (30s at 480)
// to a several-minutes target instead of guessing again -- ~8x, for
// somewhere around 4 minutes of sustained, accurate fire. Still not more
// dangerous: BULLET_DAMAGE/CONTACT_DAMAGE and the whole ramp shape below
// are untouched, so this is purely more hits required, nothing riskier
// about landing or missing any one of them.
// Recalibrated again: a request for "~3min for a skilled player, ~5min
// for a slower one" (down from an earlier ~5min/~7min ask — this fight
// has been trending shorter each round, not longer). Using the same
// ~16 dmg/sec real-world baseline above (not the ~25 dmg/sec theoretical
// max, which assumes a stationary target and no need to dodge): 3min *
// 16 = 2880. A slower player naturally lands fewer hits per second while
// also dodging, so the same pool stretches to ~5min for them without a
// second number to separately tune — one pool, and completion time
// falls out of whatever dps the player actually manages, the same way a
// real boss fight would scale with skill on its own.
// Exported so the smoke test's own frame budget can scale off the real
// value instead of a hardcoded ratio that goes stale the next time this
// number moves (it already has, three times).
export const HP_MAX = 2880;
const BULLET_DAMAGE = 4;      // per pistol hit
// A fireball that connects (game.js applies INVULN_TIME). Was 30 — ~3 hits
// and the 4th kills. Every death resets Diable's own hp back to HP_MAX
// (game.js's start() calls diable.reset()), so for anyone who dies even
// once, total time-to-clear is dominated by how often they die and have
// to re-grind the whole pool from scratch, not raw dps — a request for
// "tone it down a little, ~5min for a skilled clean run, ~7min for a
// slower player" is really a request for fewer deaths, not a shorter
// pool (a skilled clean run is already close to 5min; HP_MAX shrinking
// would undershoot that). 25 gives one more hit of margin (4 survived,
// the 5th kills) without touching the pool or the escalation shape.
const CONTACT_DAMAGE = 25;

// --- his screen footprint. He stands in the upper half of the channel; the
// canoe is pulled low for the fight (chasseGalerie.js's boss hover height),
// so there's a real arena between them for the fire to cross.
const BODY_HALF_W = 34;       // collision half-extent (his suited torso) for incoming bullets
const BODY_HALF_H = 32;
const BASE_CY = 64;           // torso centre at rest — head & horns clear the top edge
const SWAY_X = CANVAS_WIDTH * 0.17;

// --- his fireballs
const FIREBALL_SPEED = 98;    // px/sec — slow enough to read and dodge over the arena
const FIREBALL_R = 6;         // collision radius
const CANOE_HIT_R = 5;        // the canoe's a thin sliver — only a near-centre hit counts
// The multi-shot volleys aim at points spread perpendicular to the canoe by
// this many pixels *at the canoe's range*, rather than by a fixed angle
// (which fans out tight up close and wide far away, so you couldn't thread
// it when pressed toward the Devil). This gap leaves a
// SPREAD_GAP - 2*(FIREBALL_R + CANOE_HIT_R) ≈ 12px lane to slip through —
// threadable, but it takes a committed dodge rather than a nudge.
const SPREAD_GAP = 34;
const TELEGRAPH = 0.5;        // wind-up before a shot: the flame in his hand swells
const FIRE_INTERVAL_FULL = 1.8;   // seconds between shots at full health
const FIRE_INTERVAL_LOW = 1.0;    // ...and when nearly dead

// The feint — the trickster half of a "beau danseur" devil who's supposed
// to charm and deceive, not just bludgeon. Some wind-ups are a real throw;
// this fraction of them are a taunt instead (the flame flares and gutters
// rather than launching), identical to a real one for the whole telegraph
// so there's genuinely nothing to see until it resolves. Deliberately not
// punishing either way: guessing wrong costs a wasted dodge, never health
// (no fireball exists to hit you regardless) — this is about making the
// telegraph worth reading, not adding danger. Left as a flat, constant
// chance rather than ramping with rampT, so it reads as a fixed piece of
// his character throughout the fight, not an escalating threat.
const FEINT_CHANCE = 0.3;
const FEINT_FLOURISH_TIME = 0.4; // how long the "gotcha" flourish plays

const TAU = Math.PI * 2;
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// He's drawn at this scale around (cx, cy). Screen position of the flame in
// his outstretched right hand — the source of every fireball and the only
// wind-up tell. windK 0..1 is how far into the throw motion he is; the hand
// comes up and forward as it climbs.
const SCALE = 1.0;
function handPos(cx, cy, windK = 1) {
  // must match drawDevil's right-hand position exactly
  return {
    x: cx + lerp(21, 26, windK) * SCALE,
    y: cy + lerp(11, -2, windK) * SCALE,
  };
}

export function createDiable() {
  // idle -> appearing -> fighting -> dying -> done
  let phase = 'idle';
  let hp = HP_MAX;
  let t = 0;          // seconds in the current phase
  let sway = 0;       // sway clock (keeps advancing across phases)
  let fireTimer = FIRE_INTERVAL_FULL;
  let telegraph = 0;  // counts down while winding up a shot
  let isFeint = false; // whether the current/last wind-up is a real throw
  let feintFlourish = 0; // counts down the "gotcha" flourish after a feint resolves
  let hitFlash = 0;   // white flash when shot
  const fireballs = [];
  let justAppeared = false;
  let justDefeated = false;

  function centreX() {
    return CANVAS_WIDTH / 2 + Math.sin(sway * 0.65) * SWAY_X;
  }
  function centreY() {
    return BASE_CY + Math.sin(sway * 1.5) * 4;
  }

  function reset() {
    phase = 'idle';
    hp = HP_MAX;
    t = 0;
    sway = 0;
    fireTimer = FIRE_INTERVAL_FULL;
    telegraph = 0;
    isFeint = false;
    feintFlourish = 0;
    hitFlash = 0;
    fireballs.length = 0;
    justAppeared = false;
    justDefeated = false;
  }

  return {
    reset,
    // Drawn (and ticking) from first sighting through the death throes.
    isActive() { return phase === 'appearing' || phase === 'fighting' || phase === 'dying'; },
    // game.js clamps flowDistance at the arena while this holds.
    isHolding() { return phase === 'appearing' || phase === 'fighting'; },
    isDefeated() { return phase === 'dying' || phase === 'done'; },
    hpPct() { return clamp01(hp / HP_MAX) * 100; },

    consumeJustAppeared() { const v = justAppeared; justAppeared = false; return v; },
    consumeJustDefeated() { const v = justDefeated; justDefeated = false; return v; },

    // Screen-space x of his body right now — where to line the canoe up to
    // land shots. Used by the smoke test's autopilot (proves the fight is
    // winnable) and could drive an on-screen aim assist later.
    debugCentreX() { return centreX(); },
    // Live fireballs, for the same "is this fair" checks.
    getFireballs() { return fireballs; },
    // Whether he's mid-windup right now (the flame swelling in his hand) —
    // the one real dodge tell (TELEGRAPH's own comment). A shot's flight
    // time is short enough that reacting only once it's airborne doesn't
    // leave room to actually clear the gap between shots in a spread; the
    // real move is to already be moving by the time he throws.
    isTelegraphing() { return telegraph > 0; },

    // dt: seconds. playerFlowDistance: game.js's clock. canoe: {x,y} screen
    // space. bulletScreens: [{x,y,ref}] pistol shots in screen space.
    // onHitPlayer(dmg): called when a fireball connects. onCollide():
    // called when the canoe itself overlaps his body — flying into him
    // directly rather than dodging his fire. No cooldown in here; relies
    // on game.js's own invulnTimer (set from the callback, same as every
    // other hazard) to turn "still overlapping" into one penalty, not one
    // per frame.
    // Returns { hitBullets: [ref] } — shots that struck him this frame, for
    // game.js to remove from the pool.
    update(dt, playerFlowDistance, canoe, bulletScreens, onHitPlayer, onCollide) {
      const hitBullets = [];

      if (phase === 'idle') {
        if (playerFlowDistance >= DIABLE_FLOW_DISTANCE - APPROACH) {
          phase = 'appearing';
          justAppeared = true;
          t = 0;
        }
        return { hitBullets };
      }

      t += dt;
      sway += dt;
      if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt);
      if (feintFlourish > 0) feintFlourish = Math.max(0, feintFlourish - dt);

      if (phase === 'appearing') {
        // He rises in over ~1s; the fight proper starts once the flow is
        // actually clamped at the arena (game.js) and he's fully present.
        if (t >= 1.0 && playerFlowDistance >= DIABLE_FLOW_DISTANCE - 1.5) {
          phase = 'fighting';
          t = 0;
          fireTimer = FIRE_INTERVAL_FULL;
        }
      } else if (phase === 'fighting') {
        const cx = centreX();
        const cy = centreY();

        // --- incoming pistol fire ---
        for (const b of bulletScreens) {
          if (Math.abs(b.x - cx) < BODY_HALF_W && Math.abs(b.y - cy) < BODY_HALF_H) {
            hitBullets.push(b.ref);
            hp -= BULLET_DAMAGE;
            // Only kick off a fresh blanch once the last one's spent, so a
            // fast stream of hits doesn't hold him permanently white.
            if (hitFlash <= 0) hitFlash = 0.08;
          }
        }

        // --- flying the canoe straight into him ---
        // Same box his own bullet-hit check above uses. This costs furs
        // (game.js's handleHit, via onCollide), not hull health — a real
        // deterrent against just ramming through him for position instead
        // of actually dodging his fire, without turning "got too close"
        // into a death the way a fireball hit is.
        if (Math.abs(canoe.x - cx) < BODY_HALF_W && Math.abs(canoe.y - cy) < BODY_HALF_H) {
          onCollide();
        }

        if (hp <= 0) {
          hp = 0;
          phase = 'dying';
          t = 0;
          justDefeated = true;
          fireballs.length = 0;
          telegraph = 0;
          return { hitBullets };
        }

        // --- his attack: a fireball aimed at the canoe, fanning to a
        //     3-shot spread as he escalates ---
        // rampT: 0 at full health, climbing smoothly to 1 at death — see
        // RAMP_GAMMA's own comment for why this is a continuous curve
        // across the whole fight rather than a percentage cutoff (which
        // broke once tried directly against a much bigger HP_MAX) or an
        // anchor to a fixed end-of-fight HP window (which is what this
        // replaced — technically safe, but never escalated at all until
        // the last few seconds).
        const rampT = Math.pow(clamp01(1 - hp / HP_MAX), RAMP_GAMMA);
        if (telegraph > 0) {
          telegraph -= dt;
          if (telegraph <= 0) {
            if (isFeint) {
              // The flame flares and gutters instead of launching — the
              // "gotcha" flourish (draw()) carries the tell that this one
              // wasn't real. No fireball, no danger, just a taunt.
              feintFlourish = FEINT_FLOURISH_TIME;
            } else {
              // launched from the flame in his outstretched hand
              const hand = handPos(cx, cy);
              const sx = hand.x;
              const sy = hand.y;
              const ang = Math.atan2(canoe.y - sy, canoe.x - sx);
              // Perpendicular to the aim line, so each shot in a volley is
              // aimed at a point offset sideways from the canoe by a fixed
              // pixel amount — a consistent gap no matter the range.
              const px = -Math.sin(ang);
              const py = Math.cos(ang);
              const offsets = rampT > 0.75
                ? [-SPREAD_GAP, 0, SPREAD_GAP]
                : rampT > 0.4 ? [-SPREAD_GAP / 2, SPREAD_GAP / 2] : [0];
              for (const off of offsets) {
                const a = Math.atan2(
                  (canoe.y + py * off) - sy,
                  (canoe.x + px * off) - sx,
                );
                fireballs.push({
                  x: sx,
                  y: sy,
                  vx: Math.cos(a) * FIREBALL_SPEED,
                  // never let one drift upward — it must always come down at you
                  vy: Math.max(55, Math.sin(a) * FIREBALL_SPEED),
                  born: 0,
                });
              }
            }
          }
        } else {
          fireTimer -= dt;
          if (fireTimer <= 0) {
            const interval = FIRE_INTERVAL_FULL - (FIRE_INTERVAL_FULL - FIRE_INTERVAL_LOW) * rampT;
            fireTimer = interval;
            telegraph = TELEGRAPH;
            isFeint = Math.random() < FEINT_CHANCE;
          }
        }
      } else if (phase === 'dying') {
        if (t >= 2.4) phase = 'done';
      }

      // --- fireballs travel + strike the canoe (any phase they're airborne) ---
      for (let i = fireballs.length - 1; i >= 0; i--) {
        const f = fireballs[i];
        f.born += dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.y > CANVAS_HEIGHT + 12 || f.x < -12 || f.x > CANVAS_WIDTH + 12) {
          fireballs.splice(i, 1);
          continue;
        }
        if (phase === 'fighting' && Math.hypot(f.x - canoe.x, f.y - canoe.y) < FIREBALL_R + CANOE_HIT_R) {
          fireballs.splice(i, 1);
          onHitPlayer(CONTACT_DAMAGE);
        }
      }

      return { hitBullets };
    },

    draw(ctx, time) {
      if (phase === 'idle' || phase === 'done') return;
      const cx = centreX();
      const cy = centreY();

      // How present he and his fire are. The fire igniting is his entrance;
      // the fire going out is his death — there's no cartoon explosion.
      const dieK = phase === 'dying' ? clamp01(t / 2.6) : 0;
      let presence = phase === 'appearing' ? clamp01(t / 1.2) : 1;
      presence *= 1 - dieK;

      // A wall of hellfire across the top of the channel — he is the black
      // cut-out standing in front of it.
      drawHellfireWall(ctx, cx, time, presence);

      // The Devil: a flat black silhouette, no face, no glow of his own.
      const bodyFade = phase === 'appearing'
        ? clamp01((t - 0.4) / 0.9)
        : 1 - dieK * 0.9;
      ctx.save();
      ctx.globalAlpha = 1;
      drawDevil(ctx, cx, cy, time, telegraph, hitFlash, dieK, bodyFade, feintFlourish);
      ctx.restore();

      // His fireballs on top — thrown from the flame in his hand.
      for (const f of fireballs) drawFireball(ctx, f, time);
    },
  };
}

// --- the wall of hellfire behind him -------------------------------------
// From the Quebecois folklore image: he is a flat black cut-out standing in
// front of a curtain of flame. The fire is his light source and his death
// tell — it ignites as he arrives and gutters out as he falls. Concentrated
// behind his torso at the top so the lower channel, where you fly, stays
// dark enough to read the incoming fire.
function drawHellfireWall(ctx, cx, time, k) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = 1;
  const flick = 0.8 + Math.sin(time * 17) * 0.1 + Math.sin(time * 6.3) * 0.07;
  const a = clamp01(k) * flick;

  const glow = ctx.createRadialGradient(cx, -12, 6, cx, -12, 175);
  glow.addColorStop(0, `rgba(255,238,188,${(0.8 * a).toFixed(3)})`);
  glow.addColorStop(0.26, `rgba(255,146,38,${(0.66 * a).toFixed(3)})`);
  glow.addColorStop(0.58, `rgba(150,34,6,${(0.4 * a).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(30,4,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT * 0.72);

  // tongues of flame licking up along the top edge
  for (let i = 0; i < 12; i++) {
    const seed = i * 12.9;
    const x = (i / 11) * CANVAS_WIDTH + Math.sin(time * (2 + (i % 3)) + seed) * 11;
    const h = (24 + Math.sin(time * 4.2 + seed) * 15 + (i % 4) * 7) * (0.45 + 0.55 * k);
    const w = 11 + (i % 3) * 5;
    const grd = ctx.createLinearGradient(x, 66, x, 66 - h);
    grd.addColorStop(0, `rgba(255,128,26,${(0.5 * a).toFixed(3)})`);
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 68);
    ctx.quadraticCurveTo(x - w * 0.15, 68 - h * 0.6, x, 68 - h);
    ctx.quadraticCurveTo(x + w * 0.15, 68 - h * 0.6, x + w / 2, 68);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// --- the Devil himself ---------------------------------------------------
// Not a cartoon demon: the folklore "beau danseur" — a tall gentleman in a
// black suit and tie, standing at his ease. What's wrong with him: a smooth
// featureless head with no face at all, two heavy curved horns, a long tail
// ending in a spade barb, and a flame he holds in one hand. Drawn as a flat
// black silhouette against the fire — the same read as the reference image.
// The only motion is slow: he glides, the tail sways, and the flame in his
// hand swells the instant before he throws it (the wind-up tell).
const SIL = '#040308';
// The suited torso + squared shoulders, cut at the waist (his lower half is
// lost in the fire). Its own function so the hit-flash and arrival fade can
// treat him as one shape.
function devilTorsoPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-8, -23);                        // left of the collar notch
  ctx.quadraticCurveTo(-23, -22, -30, -15);   // out to the left shoulder
  ctx.lineTo(-22, 6);
  ctx.quadraticCurveTo(-23, 24, -19, 32);     // jacket, flaring a touch at the waist
  ctx.lineTo(19, 32);
  ctx.quadraticCurveTo(23, 24, 22, 6);
  ctx.lineTo(30, -15);                        // right shoulder
  ctx.quadraticCurveTo(23, -22, 8, -23);
  ctx.quadraticCurveTo(0, -20, -8, -23);      // collar notch dips for the neck
  ctx.closePath();
}
function drawDevil(ctx, cx, cy, time, telegraph, hitFlash, dieK, fade = 1, feintFlourish = 0) {
  const windK = telegraph > 0 ? clamp01(1 - telegraph / TELEGRAPH) : 0;
  // The "gotcha" — head tips back an instant, same read as a silent laugh,
  // right as a feinted wind-up resolves into nothing.
  const feintK = feintFlourish > 0 ? clamp01(feintFlourish / FEINT_FLOURISH_TIME) : 0;
  const wag = Math.sin(time * 1.1) * 3;

  ctx.save();
  ctx.globalAlpha = clamp01(fade);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.translate(cx, cy + dieK * 24);         // sinks into the fire as he's undone
  ctx.scale(SCALE, SCALE);
  ctx.rotate(feintK * -0.12);                // leans back a touch — the "gotcha"
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // --- tail: out from behind the right hip, curling down to a spade barb ---
  ctx.strokeStyle = SIL;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(14, 18);
  ctx.bezierCurveTo(26, 22 + wag, 28, 34 + wag, 32, 40 + wag * 1.7);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(32, 37 + wag * 1.7);
  ctx.lineTo(38, 46 + wag * 1.9);
  ctx.stroke();
  ctx.fillStyle = SIL;
  const bx = 38, by = 46 + wag * 1.9;
  ctx.beginPath();
  ctx.moveTo(bx, by - 5.5);
  ctx.quadraticCurveTo(bx + 5.5, by - 1, bx + 2.6, by + 4.5);
  ctx.quadraticCurveTo(bx, by + 1, bx - 2.6, by + 4.5);
  ctx.quadraticCurveTo(bx - 5.5, by - 1, bx, by - 5.5);
  ctx.closePath();
  ctx.fill();

  // --- left arm, hanging ---
  ctx.strokeStyle = SIL;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-25, -13);
  ctx.lineTo(-29, 8);
  ctx.lineTo(-26, 26);
  ctx.stroke();

  // --- horns: two heavy tapered shapes sweeping up and out ---
  ctx.fillStyle = SIL;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 3, -40);
    ctx.quadraticCurveTo(s * 6, -50, s * 16, -56);
    ctx.quadraticCurveTo(s * 22, -59, s * 24, -62);   // to the point
    ctx.quadraticCurveTo(s * 19, -55, s * 12, -48);
    ctx.quadraticCurveTo(s * 7, -43, s * 6, -38);
    ctx.closePath();
    ctx.fill();
  }

  // --- suited torso ---
  ctx.fillStyle = SIL;
  devilTorsoPath(ctx);
  ctx.fill();

  // --- neck + featureless head ---
  ctx.fillStyle = SIL;
  ctx.fillRect(-3.5, -26, 7, 8);
  ctx.beginPath();
  ctx.ellipse(0, -33, 7.6, 9.4, 0, 0, TAU);
  ctx.fill();
  // the barest cold sheen on the head so black-on-black doesn't disappear
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -33, 7.6, 9.4, 0, 0, TAU);
  ctx.clip();
  const sheen = ctx.createLinearGradient(-7, -40, 3, -27);
  sheen.addColorStop(0, 'rgba(96,102,124,0.18)');
  sheen.addColorStop(1, 'rgba(96,102,124,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-10, -44, 20, 22);
  ctx.restore();

  // --- shirt wedge + tie + a whisper of lapel: the "he's dressed" tell ---
  ctx.fillStyle = '#0d0d16';
  ctx.beginPath();
  ctx.moveTo(-5.5, -20);
  ctx.lineTo(5.5, -20);
  ctx.lineTo(0, -7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#210709';
  ctx.beginPath();
  ctx.moveTo(-2.3, -20); ctx.lineTo(2.3, -20);
  ctx.lineTo(2.6, 4); ctx.lineTo(0, 9); ctx.lineTo(-2.6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,150,170,0.12)';
  ctx.lineWidth = 1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 4, -20);
    ctx.lineTo(s * 13, -2);
    ctx.stroke();
  }

  // --- right arm out to the side, holding the flame ---
  const hx = lerp(21, 26, windK);
  const hy = lerp(11, -2, windK);
  ctx.strokeStyle = SIL;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(25, -13);
  ctx.lineTo(32, lerp(2, -3, windK));
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = SIL;
  ctx.beginPath();
  ctx.arc(hx, hy, 2.6, 0, TAU);
  ctx.fill();

  // --- the flame in his hand: small and steady, swelling white-hot the
  //     instant before he throws (the only wind-up cue) — or, for a
  //     feint, flaring bright right as the wind-up resolves and then
  //     guttering back out over FEINT_FLOURISH_TIME, instead of snapping
  //     straight back to idle the way a real throw's release does.
  const fl = feintK > 0
    ? feintK
    : clamp01(0.5 + Math.sin(time * 11) * 0.18 + windK * 0.95);
  const fr = feintK > 0
    ? 2.6 + feintK * 9
    : (2.6 + windK * 7) * Math.max(0.5, fl);
  const fg = ctx.createRadialGradient(hx, hy - 1, 0.4, hx, hy - 1, fr);
  fg.addColorStop(0, `rgba(255,247,220,${(0.95 * fl).toFixed(2)})`);
  fg.addColorStop(0.45, `rgba(255,150,42,${(0.72 * fl).toFixed(2)})`);
  fg.addColorStop(1, 'rgba(255,110,20,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(hx, hy - 1, fr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,196,110,${(0.45 + windK * 0.4).toFixed(2)})`;
  for (let i = -1; i <= 1; i++) {
    const th = (2.5 + windK * 5) * (0.6 + Math.sin(time * 16 + i) * 0.4);
    ctx.beginPath();
    ctx.moveTo(hx + i * 1.8 - 1.2, hy - 1);
    ctx.quadraticCurveTo(hx + i * 1.8, hy - 1 - th, hx + i * 1.8 + 1.2, hy - 1);
    ctx.closePath();
    ctx.fill();
  }

  // --- hit flash: the fire flares against his edge, no cartoon white pop ---
  if (hitFlash > 0) {
    ctx.strokeStyle = `rgba(255,150,60,${Math.min(0.5, hitFlash * 5).toFixed(2)})`;
    ctx.lineWidth = 2.2;
    devilTorsoPath(ctx);
    ctx.stroke();
  }

  // --- death: dim ember cracks, thin smoke lifting off; the guttering fire
  //     wall (drawHellfireWall) carries the rest ---
  if (dieK > 0) {
    ctx.strokeStyle = `rgba(200,${Math.round(80 - dieK * 55)},28,${((1 - dieK) * 0.65).toFixed(2)})`;
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) {
      const yy = -16 + i * 11;
      const ph = time * 3 + i;
      ctx.beginPath();
      ctx.moveTo(-18, yy + Math.sin(ph) * 3);
      ctx.lineTo(18, yy + Math.sin(ph + 2) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(72,66,72,${((1 - dieK) * 0.38).toFixed(2)})`;
    for (let i = 0; i < 4; i++) {
      const sy = -8 - (time * 24 + i * 38) % 84;
      ctx.beginPath();
      ctx.arc(Math.sin(time + i * 2) * 12, sy, 3.5 + dieK * 5 + i, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}

// Was a flat-filled disc plus a shadowBlur glow, trailed by a clean taper
// of same-shaped circles — reported as "looks like a flashlight," which
// tracks: that's textbook light-source/lens rendering, not fire. Rebuilt
// with the same visual language the rest of this file's fire already
// uses (drawHellfireWall's tongues, the hand-flame in drawDevil) —
// irregular, flickering flame licks trailing behind a soft radial-
// gradient head, instead of a hard-edged ball and a geometric taper.
function drawFireball(ctx, f, time) {
  const len = Math.hypot(f.vx, f.vy) || 1;
  const ux = f.vx / len, uy = f.vy / len;
  // Per-fireball, position-derived (not Math.random(), which would make
  // the flicker jump every frame instead of animating smoothly) — close
  // enough to unique between fireballs in the same volley that they don't
  // flicker in lockstep with each other.
  const seed = f.x * 0.37 + f.y * 0.53;
  ctx.save();

  // Flame licks peeling off behind it — teardrop tongues (same
  // construction as drawHellfireWall's own), each with its own flicker
  // and a little sideways sway, not a straight line of shrinking circles.
  for (let i = 0; i < 3; i++) {
    const flick = 0.55 + Math.sin(time * (10 + i * 4) + seed + i * 2) * 0.45;
    const tLen = (10 + i * 5) * (0.6 + flick * 0.6);
    const tW = 3.4 + i * 1.4;
    const bx = f.x - ux * (2 + i * 2.5);
    const by = f.y - uy * (2 + i * 2.5);
    const sway = Math.sin(time * 6 + seed + i) * 2.5;
    const tx = bx - ux * tLen - uy * sway;
    const ty = by - uy * tLen + ux * sway;
    ctx.globalAlpha = Math.max(0, (0.6 - i * 0.16) * flick);
    ctx.fillStyle = i === 0 ? '#ffcf7a' : i === 1 ? '#ff7e26' : '#a8280c';
    ctx.beginPath();
    ctx.moveTo(bx - uy * tW, by + ux * tW);
    ctx.quadraticCurveTo(bx - ux * tLen * 0.4 - uy * sway * 0.5, by - uy * tLen * 0.4 + ux * sway * 0.5, tx, ty);
    ctx.quadraticCurveTo(bx - ux * tLen * 0.4 + uy * sway * 0.5, by - uy * tLen * 0.4 - ux * sway * 0.5, bx + uy * tW, by - ux * tW);
    ctx.closePath();
    ctx.fill();
  }

  // The head: a soft glowing gradient, not a flat disc + shadowBlur —
  // white-hot centre fading through orange to a transparent red edge,
  // pulsing gently so it reads as a living ember, not a fixed icon.
  ctx.globalAlpha = 1;
  const pulse = 0.85 + Math.sin(time * 16 + seed) * 0.15;
  const r = 8 * pulse;
  const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
  glow.addColorStop(0, 'rgba(255,250,225,0.95)');
  glow.addColorStop(0.3, 'rgba(255,160,40,0.9)');
  glow.addColorStop(0.65, 'rgba(200,50,10,0.55)');
  glow.addColorStop(1, 'rgba(120,20,4,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
  ctx.fill();

  // A small white-hot spark at the leading edge — the one point that
  // should read as genuinely incandescent.
  ctx.fillStyle = 'rgba(255,255,240,0.9)';
  ctx.beginPath();
  ctx.arc(f.x + ux * 1.2, f.y + uy * 1.2, 1.8 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
