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
// as his health drops). Phases / the drag attack / imps / a weak point all
// come later — see the design notes this came out of.
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

const HP_MAX = 240;
const BULLET_DAMAGE = 4;      // per pistol hit
const CONTACT_DAMAGE = 20;    // a fireball that connects (game.js applies INVULN_TIME)

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
const CANOE_HIT_R = 4;        // the canoe's a thin sliver — only a near-centre hit counts
// The multi-shot volleys aim at points spread perpendicular to the canoe by
// this many pixels *at the canoe's range*, rather than by a fixed angle
// (which fans out tight up close and wide far away, so you couldn't thread
// it when pressed toward the Devil). A gap this wide leaves a
// SPREAD_GAP - 2*(FIREBALL_R + CANOE_HIT_R) ≈ 22px lane to slip through.
const SPREAD_GAP = 42;
const TELEGRAPH = 0.55;       // wind-up before a shot: the flame in his hand swells
const FIRE_INTERVAL_FULL = 2.1;   // seconds between shots at full health
const FIRE_INTERVAL_LOW = 1.1;    // ...and when nearly dead

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

    // dt: seconds. playerFlowDistance: game.js's clock. canoe: {x,y} screen
    // space. bulletScreens: [{x,y,ref}] pistol shots in screen space.
    // onHitPlayer(dmg): called when a fireball connects.
    // Returns { hitBullets: [ref] } — shots that struck him this frame, for
    // game.js to remove from the pool.
    update(dt, playerFlowDistance, canoe, bulletScreens, onHitPlayer) {
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
        //     3-shot spread once he's badly hurt ---
        const hpFrac = hp / HP_MAX;
        if (telegraph > 0) {
          telegraph -= dt;
          if (telegraph <= 0) {
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
            const offsets = hpFrac < 0.4
              ? [-SPREAD_GAP, 0, SPREAD_GAP]
              : hpFrac < 0.7 ? [-SPREAD_GAP / 2, SPREAD_GAP / 2] : [0];
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
        } else {
          fireTimer -= dt;
          if (fireTimer <= 0) {
            const interval = FIRE_INTERVAL_LOW + (FIRE_INTERVAL_FULL - FIRE_INTERVAL_LOW) * hpFrac;
            fireTimer = interval;
            telegraph = TELEGRAPH;
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
      drawDevil(ctx, cx, cy, time, telegraph, hitFlash, dieK, bodyFade);
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
function drawDevil(ctx, cx, cy, time, telegraph, hitFlash, dieK, fade = 1) {
  const windK = telegraph > 0 ? clamp01(1 - telegraph / TELEGRAPH) : 0;
  const wag = Math.sin(time * 1.1) * 3;

  ctx.save();
  ctx.globalAlpha = clamp01(fade);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.translate(cx, cy + dieK * 24);         // sinks into the fire as he's undone
  ctx.scale(SCALE, SCALE);
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
  //     instant before he throws (the only wind-up cue) ---
  const fl = clamp01(0.5 + Math.sin(time * 11) * 0.18 + windK * 0.95);
  const fr = (2.6 + windK * 7) * Math.max(0.5, fl);
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

function drawFireball(ctx, f, time) {
  ctx.save();
  // a short tail, opposite the travel direction
  const len = Math.hypot(f.vx, f.vy) || 1;
  const ux = f.vx / len, uy = f.vy / len;
  for (let i = 4; i >= 1; i--) {
    ctx.globalAlpha = 0.12 * i;
    ctx.fillStyle = i > 2 ? '#ff7a1e' : '#a82810';
    ctx.beginPath();
    ctx.arc(f.x - ux * i * 3, f.y - uy * i * 3, 5 - i * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ff7a1e';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#a82810';
  ctx.beginPath();
  ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8a2c';
  ctx.beginPath();
  ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe0a0';
  ctx.beginPath();
  ctx.arc(f.x - ux, f.y - uy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
