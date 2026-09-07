// Chasse-galerie — the flying canoe.
// Past Montreal the canoe lifts off the water and flies the whole Ottawa
// River stretch up to the voyageurs' winter camp at Gatineau, through a
// night storm. There's no landing anywhere along the way. Four things are
// trying to end the flight (clip any church steeple or "swear" and the
// devil's pact breaks):
//   - parish steeples packed along both banks, all on land past the water
//   - pinch points where a parish crowds both banks right to the waterline,
//     leaving only a thread down the middle
//   - storm clouds hanging in the channel itself — fair game to hit, you're
//     airborne — that also buffet you sideways
//   - a crosswind that shoves the canoe toward the banks the whole way
// The river current doesn't apply in the sky (see game.js's flight branch).

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
const CLIMB_RATE = 3;          // world units of altitude gained/shed per second
const DESCENT_RANGE = 48;      // how far out from FLIGHT_END the glide-down starts

// How far past the water's edge the flying canoe is allowed to drift, world
// units — out over the settled banks where the steeples stand, but no
// further. game.js widens its lateral clamp to this while the flight is
// active (and drops the "ran aground" penalty — you're in the air).
export const FLIGHT_LATERAL_MARGIN = 7;

// --- the crosswind ---------------------------------------------------------
// A lateral acceleration (world units/sec^2) applied to the canoe the whole
// flight, so holding a dead-centre line is a constant fight rather than a
// free ride. Peaks around WIND_STRENGTH; the player's own steering accel
// (game.js STEER_ACCEL) is stronger, so it's beatable but never idle.
// Scaled by altitude fraction — calm on the runway, full force at height.
const WIND_STRENGTH = 9;
export function flightWind(flowDistance, time, altFrac) {
  const d = flowDistance;
  const wave =
    0.55 * Math.sin(d * 0.031) +
    0.30 * Math.sin(d * 0.0117 + 2.1) +
    0.15 * Math.sin(d * 0.084 + time * 0.6);
  return WIND_STRENGTH * wave * Math.max(0, Math.min(1, altFrac));
}

// --- steeples ------------------------------------------------------------
const STEEPLE_HIT_Z = 2.2;     // half-length of the collision box along the flow
const STEEPLE_HIT_X = 2.3;     // half-width of the collision box across the river
const STEEPLE_VISUAL_H = 7;    // nominal world-units tall (hash-varied per spire)
const CHAPEL_SPACING = 12;     // nominal flow-distance between chapel slots
const CHAPEL_JITTER = 4.5;     // flow-distance wobble per slot
const CHAPEL_SIDE_CHANCE = 0.72; // odds a normal slot has a chapel on a given bank
const CHAPEL_INSET_MIN = 2.6;  // nearest a normal steeple sits to the water
const CHAPEL_INSET_MAX = FLIGHT_LATERAL_MARGIN; // farthest — out at the flight limit
// Pinch points: a parish crowding both banks right down to the waterline.
const PINCH_CHANCE = 0.11;     // of slots (never two in a row — see the builder)
const PINCH_INSET_MIN = 0.0;   // right at the water's edge
const PINCH_INSET_MAX = 1.1;
const PINCH_STACK = 5;         // flow-distance between the two spires of a pinch side

// --- storm clouds ------------------------------------------------------
// Clouds sit off to one side of the channel, never dead centre, so there's
// always a lane past them — consecutive clouds on opposite banks make a
// weave. Wide but softer than a steeple.
const CLOUD_HIT_Z = 2.5;
const CLOUD_HIT_X = 2.8;
const CLOUD_SPACING = 32;
const CLOUD_JITTER = 9;
const CLOUD_CHANCE = 0.8;
const CLOUD_OFF_MIN = 1.8;     // nearest a cloud sits to the centre line
const CLOUD_OFF_MAX = 4.6;     // farthest
const CLOUD_CLEAR_OF_PINCH = 15; // keep clouds away from a pinch's narrow gap

// Everything you can hit, built once at module load — pure geometry over the
// flight span. `kind` is 'steeple' or 'cloud'; game.js damages them
// differently and a cloud also shoves you sideways.
const HAZARDS = (() => {
  const from = TRIGGER_DISTANCE - 6;
  const to = FLIGHT_END + 6;
  const steeples = [];
  const pinchCenters = [];

  const slots = Math.ceil((to - from) / CHAPEL_SPACING);
  let prevPinch = false;
  for (let i = 0; i < slots; i++) {
    const d = from + i * CHAPEL_SPACING + hashRange(i, 11, -CHAPEL_JITTER, CHAPEL_JITTER);
    if (d < from || d > to) { prevPinch = false; continue; }
    const waterHalf = widthAt(d) / 2;

    const pinch = !prevPinch && hashRange(i, 7, 0, 1) < PINCH_CHANCE;
    prevPinch = pinch;

    if (pinch) {
      pinchCenters.push(d);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const sd = d + (k - 0.5) * PINCH_STACK;
          const inset = hashRange(i, (side < 0 ? 60 : 70) + k, PINCH_INSET_MIN, PINCH_INSET_MAX);
          steeples.push({
            kind: 'steeple',
            flowDistance: sd,
            worldX: centerX(sd) + side * (widthAt(sd) / 2 + inset),
            hz: STEEPLE_HIT_Z, hx: STEEPLE_HIT_X,
            h: STEEPLE_VISUAL_H * hashRange(i, 80 + k, 0.95, 1.35),
          });
        }
      }
      continue;
    }

    for (const side of [-1, 1]) {
      const salt = side < 0 ? 20 : 40;
      if (hashRange(i, salt, 0, 1) > CHAPEL_SIDE_CHANCE) continue;
      const inset = hashRange(i, salt + 1, CHAPEL_INSET_MIN, CHAPEL_INSET_MAX);
      steeples.push({
        kind: 'steeple',
        flowDistance: d,
        worldX: centerX(d) + side * (waterHalf + inset),
        hz: STEEPLE_HIT_Z, hx: STEEPLE_HIT_X,
        h: STEEPLE_VISUAL_H * hashRange(i, salt + 2, 0.8, 1.3),
      });
    }
  }

  const clouds = [];
  const cslots = Math.ceil((to - from) / CLOUD_SPACING);
  for (let i = 0; i < cslots; i++) {
    if (hashRange(i, 91, 0, 1) > CLOUD_CHANCE) continue;
    const d = from + i * CLOUD_SPACING + hashRange(i, 92, -CLOUD_JITTER, CLOUD_JITTER);
    if (d < from || d > to) continue;
    if (pinchCenters.some(pc => Math.abs(pc - d) < CLOUD_CLEAR_OF_PINCH)) continue;
    const side = hashRange(i, 95, 0, 1) < 0.5 ? -1 : 1;
    clouds.push({
      kind: 'cloud',
      flowDistance: d,
      worldX: centerX(d) + side * hashRange(i, 93, CLOUD_OFF_MIN, CLOUD_OFF_MAX),
      hz: CLOUD_HIT_Z, hx: CLOUD_HIT_X,
      h: 3.4 * hashRange(i, 94, 0.8, 1.4),
      seed: i,
    });
  }

  return [...steeples, ...clouds].sort((a, b) => a.flowDistance - b.flowDistance);
})();

// --- lightning ---------------------------------------------------------
// A deterministic flicker in [0,1] for render() to flash the screen with.
// Pure cosmetic (a flash briefly *helps* visibility) — the point is mood.
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

  function targetAltitude(flowDistance) {
    if (!active) return 0;
    const toEnd = FLIGHT_END - flowDistance;
    if (toEnd < DESCENT_RANGE) return FLIGHT_HEIGHT * Math.max(0, toEnd / DESCENT_RANGE);
    return FLIGHT_HEIGHT;
  }

  return {
    update(playerFlowDistance, canoeWorldX, dt) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE && playerFlowDistance < FLIGHT_END;

      if (inRange && !flightDone && !active) {
        active = true;
        console.log('[CHASSE-GALERIE] Taking flight into the storm!');
      }
      if (active && playerFlowDistance >= FLIGHT_END) {
        active = false;
        flightDone = true;
        console.log('[CHASSE-GALERIE] Back on the water — Gatineau ahead.');
      }

      // Ease toward the target height — climb out on take-off, glide down on
      // the approach to FLIGHT_END.
      const target = targetAltitude(playerFlowDistance);
      const step = CLIMB_RATE * dt;
      if (altitude < target) altitude = Math.min(target, altitude + step);
      else if (altitude > target) altitude = Math.max(target, altitude - step);

      let hit = false;
      let hitKind = null;
      if (active && altitude > 0.5) {
        for (const s of HAZARDS) {
          if (Math.abs(playerFlowDistance - s.flowDistance) < s.hz
            && Math.abs(canoeWorldX - s.worldX) < s.hx) {
            hit = true;
            hitKind = s.kind;
            if (s.kind === 'steeple') break; // steeple trumps a cloud on the same frame
          }
        }
      }

      return { hit, hitKind, active, altitude };
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

    drawStorm(ctx, worldDistance, cameraWorldX, time) {
      if (!active) return;

      for (const hz of HAZARDS) {
        // z < 0 is ahead of the canoe (up the screen), z > 0 behind it. Cull
        // to a bit more than the visible span so tall spires still poke in
        // from just off the top edge.
        const z = worldDistance - hz.flowDistance;
        if (z < -18 || z > 6) continue;
        const screen = worldToScreen(hz.worldX, z, cameraWorldX);

        if (hz.kind === 'cloud') {
          drawCloud(ctx, screen.x, screen.y, hz.h * PIXELS_PER_UNIT, hz.seed, time);
          continue;
        }

        const h = hz.h * PIXELS_PER_UNIT;
        const baseW = 9;
        const tipW = 3;

        // little stone nave at the base
        ctx.fillStyle = '#5c5c56';
        ctx.fillRect(screen.x - baseW, screen.y - h * 0.28, baseW * 2, h * 0.28);

        // the spire
        ctx.fillStyle = '#2f2f2f';
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - h);
        ctx.lineTo(screen.x - tipW, screen.y - h * 0.72);
        ctx.lineTo(screen.x - baseW, screen.y - h * 0.28);
        ctx.lineTo(screen.x + baseW, screen.y - h * 0.28);
        ctx.lineTo(screen.x + tipW, screen.y - h * 0.72);
        ctx.closePath();
        ctx.fill();

        // cross at the peak
        ctx.strokeStyle = '#1f1f1f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - h - 4);
        ctx.lineTo(screen.x, screen.y - h + 6);
        ctx.moveTo(screen.x - 3, screen.y - h);
        ctx.lineTo(screen.x + 3, screen.y - h);
        ctx.stroke();
      }
    },

    isActive() {
      return active;
    },

    getAltitude() {
      return altitude;
    },

    // The lateral offset that best threads whatever hazards sit just ahead —
    // there is always a clear line through the storm, and this finds it.
    // Used by the smoke test to prove the flight stays fair; could also
    // drive a difficulty-assist ghost line later.
    clearOffsetAhead(flowDistance) {
      const LOOK = 16;
      const cx = centerX(flowDistance);
      const bound = widthAt(flowDistance) / 2 + FLIGHT_LATERAL_MARGIN;
      let best = 0;
      let bestScore = -Infinity;
      for (let o = -bound; o <= bound; o += 0.4) {
        const wx = cx + o;
        let clearance = Infinity;
        for (const s of HAZARDS) {
          if (s.flowDistance < flowDistance - 2 || s.flowDistance > flowDistance + LOOK) continue;
          clearance = Math.min(clearance, Math.abs(wx - s.worldX) - s.hx);
        }
        const score = Math.min(clearance, 6) - Math.abs(o) * 0.05;
        if (score > bestScore) { bestScore = score; best = o; }
      }
      return best;
    },

    // How far past the water's edge the canoe may currently drift, world
    // units — scales with altitude, so it opens up as you climb out and
    // eases back to the river as you glide down at the end (no hard snap
    // back inside the banks when the flight flag finally flips off).
    lateralMargin() {
      return FLIGHT_LATERAL_MARGIN * Math.max(0, Math.min(1, altitude / FLIGHT_HEIGHT));
    },
  };
}

function drawCloud(ctx, x, y, r, seed, time) {
  const drift = Math.sin(time * 0.8 + seed) * 2;
  ctx.save();
  ctx.translate(x + drift, y);
  // a few overlapping puffs, dark storm-grey with a paler crown
  const puffs = [
    { dx: -r * 0.9, dy: r * 0.15, s: 0.85 },
    { dx: r * 0.9, dy: r * 0.2, s: 0.8 },
    { dx: 0, dy: -r * 0.3, s: 1.05 },
    { dx: -r * 0.25, dy: r * 0.35, s: 0.9 },
    { dx: r * 0.35, dy: r * 0.3, s: 0.85 },
  ];
  ctx.fillStyle = '#4b4f5c';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(p.dx, p.dy + r * 0.25, r * p.s, r * p.s * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#6b7180';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(p.dx, p.dy - r * 0.1, r * p.s * 0.8, r * p.s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
