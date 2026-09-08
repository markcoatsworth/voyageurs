// Chasse-galerie — the flying canoe.
// Past Montreal the canoe lifts off the water and flies the whole Ottawa
// River gorge up to the voyageurs' winter camp at Gatineau, through the
// Devil's own weather — a black sky burning at the horizon (see game.js's
// flight render). There's no landing along the way. Parish churches stand
// along both banks with their ends reaching into the water — the middle of
// the channel stays open, so mostly you just keep off the banks on the
// bends, but every
// so often a church reaches far enough across to force a dodge toward the
// far bank, and those alternate sides. Clip a steeple (or "swear") and the
// devil's pact breaks. A light crosswind nudges you off line; the river
// current doesn't apply in the sky (see game.js's flight branch).

import { centerX, widthAt } from '../world/river/path.js';
import { VILLAGES } from '../world/river/route.js';
import { worldToScreen, PIXELS_PER_UNIT } from '../shared/config.js';
import { hashRange } from '../shared/hash.js';

const MONTREAL = VILLAGES.find(v => v.name === 'Montreal');
const GATINEAU = VILLAGES.find(v => v.name === 'Gatineau');

// Where the canoe leaves the water and takes flight. Exported (like
// blockade.js's SHIP_FLOW_DISTANCE) so main.js's ?start= keyword can drop a
// tester right on the cusp of it without re-deriving Montreal's geography.
export const TRIGGER_DISTANCE = MONTREAL.flowDistance + 20; // Shortly after Montreal

// The flight ends a little short of Gatineau's own dock, so the canoe
// glides back down onto the water and you paddle the last stretch in to the
// winter camp rather than the sky just switching off mid-channel.
const FLIGHT_END = GATINEAU.flowDistance - 18;

const FLIGHT_HEIGHT = 8;       // cruising altitude, world units above the river
// The take-off and landing are gradual, measured in flow-distance rather
// than seconds: the canoe rises over the first CLIMB_DISTANCE units out of
// Montreal and settles back down over the last DESCENT_DISTANCE into
// Gatineau, so neither end is an abrupt switch.
const CLIMB_DISTANCE = 80;
const DESCENT_DISTANCE = 110;
// The hellstorm look fades in and out over a longer stretch still, so the
// world darkens around you as you climb the Ottawa rather than snapping.
// Nonzero from TRIGGER_DISTANCE to a little past FLIGHT_END (STORM_TAIL).
const STORM_FADE_IN = 220;
const STORM_FADE_OUT = 150;
const STORM_TAIL = 70;

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// Altitude (world units above the water) purely as a function of how far
// into the flight you are — a smooth rise, a plateau at FLIGHT_HEIGHT, a
// smooth descent.
function altitudeAt(flowDistance) {
  const climb = (flowDistance - TRIGGER_DISTANCE) / CLIMB_DISTANCE;
  const descend = (FLIGHT_END - flowDistance) / DESCENT_DISTANCE;
  return FLIGHT_HEIGHT * smoothstep(Math.min(climb, descend));
}

// How far past the water's edge the flying canoe can push before the hard
// clamp, world units — a shallow strip so there's no invisible wall right
// at the waterline. That strip IS the bank treetops, and flying into it
// costs you (game.js) — the devil's canoe is meant to stay over the river.
export const FLIGHT_LATERAL_MARGIN = 1.1;

// --- the crosswind -------------------------------------------------------
// A gentle lateral acceleration (world units/sec^2) the whole flight, so
// holding the thread takes small constant corrections. Secondary to the
// steeples — the player's steering accel (game.js STEER_ACCEL) dwarfs it.
// Scaled by altitude — calm on the runway, full at height.
const WIND_STRENGTH = 3.5;
export function flightWind(flowDistance, time, altFrac) {
  const d = flowDistance;
  const wave =
    0.6 * Math.sin(d * 0.028) +
    0.4 * Math.sin(d * 0.011 + 2.1);
  return WIND_STRENGTH * wave * Math.max(0, Math.min(1, altFrac));
}

// --- the churches along the gorge -------------------------------------
// Every church stands on a bank and only nips into the water — the middle
// of the channel stays open. Most just cost the careless who drift wide on
// a bend; roughly one in four "reaches" far enough to force a real dodge
// toward the far bank, and those alternate sides so a cluster of them is a
// weave with clear water between.
const STEEPLE_SPACING = 25;    // nominal flow-distance between churches
const STEEPLE_JITTER = 4;
const STEEPLE_HIT_Z = 1.9;     // half-depth of the collision box along the flow
const REACH_NORMAL = 1.3;      // how far a normal church nips in from its bank
const REACH_REACHING = 5;      // a "reaching" church crosses the centre line —
                               // large so it always clamps to REACH_MIN_INNER
const REACH_MIN_INNER = 0.15;   // how far past centre a reaching church's inner
                               // edge sits — enough that a dead-centre line
                               // clips it, not so far the far-side thread
                               // brushes the bank treetops
const REACHING_CHANCE = 0.26;  // odds a church is a reaching one
const SAME_SIDE_CHANCE = 0.16; // odds a church repeats the previous bank
const STEEPLE_VISUAL_H = 7;    // world-units tall (hash-varied per church)
const STEEPLE_OVERHANG = 0.8;  // how far the church body spills past its own bank

// Built once at module load — pure geometry over the flight span. Each entry
// is one church: `worldX`/`hx`/`hz` are its collision box, `gapOffset` is the
// centre-relative lateral offset to aim for to clear it, `side` is the bank.
const STEEPLES = (() => {
  const from = TRIGGER_DISTANCE - 4;
  const to = FLIGHT_END + 4;
  const out = [];
  let side = 1;
  let d = from + 12;
  let i = 0;
  while (d < to) {
    const waterHalf = widthAt(d) / 2;
    const cx = centerX(d);
    const reaching = hashRange(i, 3, 0, 1) < REACHING_CHANCE;
    const reach = reaching ? REACH_REACHING : REACH_NORMAL;
    // Inner edge (facing the open channel): `reach` in from this church's own
    // bank, but never more than REACH_MIN_INNER past the centre line.
    const innerX = side * Math.max(waterHalf - reach, -REACH_MIN_INNER);
    const outerX = side * (waterHalf + STEEPLE_OVERHANG);
    // Aim just clear of the inner edge, toward the open middle — but keep
    // the thread inside the water (the bank treetops are a hazard now, see
    // game.js), so never send it closer than ~0.7 units off the far bank.
    const threadLimit = Math.max(0, waterHalf - 1.0);
    const gapOffset = reaching
      ? Math.max(-threadLimit, Math.min(threadLimit, innerX - side * 1.5))
      : 0;
    out.push({
      flowDistance: d,
      side,
      reaching,
      worldX: cx + (innerX + outerX) / 2,
      hx: Math.abs(outerX - innerX) / 2,
      hz: STEEPLE_HIT_Z,
      gapOffset,
      h: STEEPLE_VISUAL_H * hashRange(i, 6, 0.85, 1.3),
    });
    i++;
    if (hashRange(i, 9, 0, 1) >= SAME_SIDE_CHANCE) side = -side;
    d += STEEPLE_SPACING + hashRange(i, 11, -STEEPLE_JITTER, STEEPLE_JITTER);
  }
  return out;
})();

// --- lightning -------------------------------------------------------
// A deterministic flicker in [0,1] for render() to flash the screen with.
// Pure mood (a flash briefly *helps* visibility).
export function lightningFlash(time) {
  const period = 2.9;
  const idx = Math.floor(time / period);
  const local = time - idx * period;
  const start = hashRange(idx, 5, 0.2, period - 0.7);
  const t = local - start;
  if (t < 0 || t > 0.4) return 0;
  const envelope = 1 - t / 0.4;
  const flicker = (t < 0.06 || (t > 0.12 && t < 0.18)) ? 1 : 0.35;
  return envelope * flicker;
}

export function createChasseGalerie() {
  let active = false;
  let flightDone = false;
  let altitude = 0;

  return {
    update(playerFlowDistance, canoeWorldX, dt) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE && playerFlowDistance < FLIGHT_END;

      if (inRange && !flightDone && !active) {
        active = true;
        console.log('[CHASSE-GALERIE] Taking flight into the gorge!');
      }
      if (active && playerFlowDistance >= FLIGHT_END) {
        active = false;
        flightDone = true;
        console.log('[CHASSE-GALERIE] Back on the water — Gatineau ahead.');
      }

      // Altitude follows the distance-based curve while flying and eases back
      // to the water otherwise (belt-and-braces — the curve is already ~0 by
      // FLIGHT_END).
      const targetAlt = active ? altitudeAt(playerFlowDistance) : 0;
      altitude += Math.max(-3 * dt, Math.min(3 * dt, targetAlt - altitude));

      let hit = false;
      if (active && altitude > 0.5) {
        for (const s of STEEPLES) {
          if (Math.abs(playerFlowDistance - s.flowDistance) < s.hz
            && Math.abs(canoeWorldX - s.worldX) < s.hx) {
            hit = true;
            break;
          }
        }
      }

      return { hit, active, altitude };
    },

    // Lateral acceleration from the storm wind at the canoe's position.
    windAccel(flowDistance, time) {
      if (!active) return 0;
      return flightWind(flowDistance, time, altitude / FLIGHT_HEIGHT);
    },

    reset() {
      active = false;
      flightDone = false;
      altitude = 0;
    },

    drawStorm(ctx, worldDistance, cameraWorldX) {
      if (!active) return;

      const visible = [];
      for (const s of STEEPLES) {
        const z = worldDistance - s.flowDistance;
        if (z < -20 || z > 6) continue;
        visible.push({ s, z });
      }
      // Farthest ahead first, so nearer churches paint over them.
      visible.sort((a, b) => a.z - b.z);

      for (const { s, z } of visible) {
        drawChurch(ctx, s, z, cameraWorldX);
      }
    },

    isActive() {
      return active;
    },

    getAltitude() {
      return altitude;
    },

    // 0 on the water, 1 at cruising height — the master "how much am I
    // flying" value the game blends take-off physics with.
    liftFraction() {
      return Math.max(0, Math.min(1, altitude / FLIGHT_HEIGHT));
    },

    // How fully the hellstorm look should be applied at a given point on the
    // river, 0..1 — a slow fade in from Montreal and out past Gatineau, so
    // the world darkens around you as you climb rather than snapping. Pure
    // function of position (independent of the `active` latch) so it also
    // covers the short tail after the flight officially ends.
    stormIntensityAt(flowDistance) {
      if (flowDistance <= TRIGGER_DISTANCE || flowDistance >= FLIGHT_END + STORM_TAIL) return 0;
      const up = (flowDistance - TRIGGER_DISTANCE) / STORM_FADE_IN;
      const down = (FLIGHT_END + STORM_TAIL - flowDistance) / (STORM_FADE_OUT + STORM_TAIL);
      return smoothstep(Math.min(up, down));
    },

    // The centre-relative lateral offset to be at right now to thread the
    // churches: a straight ramp from the gap you just flew to the gap you're
    // headed for, so at each church you're exactly in its gap and the weave
    // between is gradual and trackable. There is always a clear line; this
    // is it. Used by the smoke test (proves the flight stays fair) and could
    // drive an assist line later.
    clearOffsetAhead(flowDistance) {
      let idx = -1;
      for (let k = 0; k < STEEPLES.length; k++) {
        if (STEEPLES[k].flowDistance + STEEPLES[k].hz >= flowDistance) { idx = k; break; }
      }
      if (idx === -1) return 0;
      const next = STEEPLES[idx];
      const prev = idx > 0 ? STEEPLES[idx - 1] : null;
      if (!prev || flowDistance >= next.flowDistance) return next.gapOffset;
      const t = (flowDistance - prev.flowDistance) / (next.flowDistance - prev.flowDistance);
      return prev.gapOffset + (next.gapOffset - prev.gapOffset) * Math.max(0, Math.min(1, t));
    },

    // How far past the water's edge the canoe may currently drift, world
    // units — scales with altitude, so it opens on take-off and eases back
    // to the river on the glide down (no hard snap back inside the banks
    // when the flight flag finally flips off).
    lateralMargin() {
      return FLIGHT_LATERAL_MARGIN * Math.max(0, Math.min(1, altitude / FLIGHT_HEIGHT));
    },
  };
}

// A stone parish church standing on a bank, only its end reaching into the
// water. Anchored at the bank-side collision edge and drawn toward the
// channel: a "reaching" church is drawn the full width of its box (so you
// see it cross the centre line); a normal one hugs its bank.
function drawChurch(ctx, s, z, cameraWorldX) {
  const screen = worldToScreen(s.worldX, z, cameraWorldX);
  const halfPx = s.hx * PIXELS_PER_UNIT;
  const waterY = screen.y;
  const bodyH = s.h * 0.4 * PIXELS_PER_UNIT;
  const spireH = s.h * PIXELS_PER_UNIT;

  const bankEdge = screen.x + s.side * halfPx;
  const naveW = s.reaching ? halfPx * 2 : Math.min(halfPx * 2 * 0.7, 26);
  const x0 = bankEdge;                    // over the bank
  const x1 = bankEdge - s.side * naveW;   // toward the channel
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const mid = (left + right) / 2;

  const towerX = bankEdge - s.side * Math.min(naveW * 0.32, 13);
  const towerW = 8;

  // A cold moonlit halo behind the whole church, so its dark bulk still
  // separates from the burning sky at every edge — eerie, not invisible.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#9fb4c4';
  ctx.fillRect(left - 2, waterY - bodyH - 3, right - left + 4, bodyH + 8);
  ctx.beginPath();
  ctx.moveTo(towerX - towerW / 2 - 2, waterY - spireH * 0.56);
  ctx.lineTo(towerX, waterY - spireH - 3);
  ctx.lineTo(towerX + towerW / 2 + 2, waterY - spireH * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // nave — cold, dead stone. Grey lit only by the moon, no life in it;
  // deliberately not warm. Forbidding, not welcoming: this is holy ground
  // the pact won't let you touch.
  ctx.fillStyle = '#9a9791';
  ctx.fillRect(left, waterY - bodyH, right - left, bodyH + 5);
  // shaded lower course
  ctx.fillStyle = '#48453f';
  ctx.fillRect(left, waterY - bodyH * 0.34, right - left, bodyH * 0.34 + 5);
  // pitched roof — near-black slate
  ctx.fillStyle = '#252229';
  ctx.beginPath();
  ctx.moveTo(left - 1, waterY - bodyH);
  ctx.lineTo(mid, waterY - bodyH - 7);
  ctx.lineTo(right + 1, waterY - bodyH);
  ctx.closePath();
  ctx.fill();
  // dark, empty windows with the faintest cold gleam — nobody's home
  for (let wx = left + 4; wx < right - 3; wx += 8) {
    ctx.fillStyle = '#191719';
    ctx.fillRect(wx - 1, waterY - bodyH * 0.58 - 1, 4, 5);
    ctx.fillStyle = 'rgba(160,176,188,0.55)';
    ctx.fillRect(wx, waterY - bodyH * 0.58, 2, 2);
  }

  // bell tower near the bank end, under the spire
  ctx.fillStyle = '#8a8781';
  ctx.fillRect(towerX - towerW / 2, waterY - spireH * 0.56, towerW, spireH * 0.56 + 4);
  ctx.fillStyle = '#48453f';
  ctx.fillRect(towerX - towerW / 2, waterY - spireH * 0.56, 2, spireH * 0.56 + 4);
  // spire — dark, its moonlit leading edge catching the only light
  ctx.fillStyle = '#5c5966';
  ctx.beginPath();
  ctx.moveTo(towerX, waterY - spireH);
  ctx.lineTo(towerX - towerW / 2, waterY - spireH * 0.54);
  ctx.lineTo(towerX + towerW / 2, waterY - spireH * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b6c0c8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(towerX, waterY - spireH);
  ctx.lineTo(towerX - towerW / 2, waterY - spireH * 0.54);
  ctx.stroke();
  // the cross still holds its own light — the one thing the storm can't dim
  ctx.strokeStyle = '#eef3f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(towerX, waterY - spireH - 4);
  ctx.lineTo(towerX, waterY - spireH + 6);
  ctx.moveTo(towerX - 3, waterY - spireH + 0.5);
  ctx.lineTo(towerX + 3, waterY - spireH + 0.5);
  ctx.stroke();
}
