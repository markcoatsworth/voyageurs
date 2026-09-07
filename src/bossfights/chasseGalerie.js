// Chasse-galerie — the flying canoe.
// Past Montreal the canoe lifts off the water and flies the whole Ottawa
// River stretch up to the voyageurs' winter camp at Gatineau. There's no
// landing anywhere along the way: the settled banks are lined with parish
// church steeples the whole distance, and clipping one costs you (in the
// legend, brushing a steeple or swearing breaks the devil's pact). The
// steeples all stand on land, past the water's edge — fly the open river
// and you're safe; stray out over a bank and there's a spire there. The
// river current doesn't apply in the sky (see game.js's flight branch).

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

// The steeple line — parish churches packed along both banks for the whole
// flight, every one standing on land past the water's edge. Hash-placed
// (like the trees and whales) so it's dense and deterministic without
// storing anything; the open river down the middle is always a clear lane.
const STEEPLE_HIT_Z = 2.2;     // half-length of the collision box along the flow
const STEEPLE_HIT_X = 2.3;     // half-width of the collision box across the river
const STEEPLE_VISUAL_H = 7;    // nominal world-units tall (hash-varied per spire)
const CHAPEL_SPACING = 12;     // nominal flow-distance between chapel slots
const CHAPEL_JITTER = 4.5;     // flow-distance wobble per slot
const CHAPEL_SIDE_CHANCE = 0.72; // odds a given slot has a chapel on a given bank
const CHAPEL_INSET_MIN = 2.6;  // nearest a steeple sits to the water (fully on land)
const CHAPEL_INSET_MAX = FLIGHT_LATERAL_MARGIN; // farthest — out at the flight limit

// Built once at module load — pure geometry over the flight span.
const STEEPLES = (() => {
  const from = TRIGGER_DISTANCE - 6;
  const to = FLIGHT_END + 6;
  const out = [];
  const slots = Math.ceil((to - from) / CHAPEL_SPACING);
  for (let i = 0; i < slots; i++) {
    const d = from + i * CHAPEL_SPACING + hashRange(i, 11, -CHAPEL_JITTER, CHAPEL_JITTER);
    if (d < from || d > to) continue;
    const waterHalf = widthAt(d) / 2;
    for (const side of [-1, 1]) {
      const salt = side < 0 ? 20 : 40;
      if (hashRange(i, salt, 0, 1) > CHAPEL_SIDE_CHANCE) continue;
      const inset = hashRange(i, salt + 1, CHAPEL_INSET_MIN, CHAPEL_INSET_MAX);
      out.push({
        flowDistance: d,
        side,
        worldX: centerX(d) + side * (waterHalf + inset),
        h: STEEPLE_VISUAL_H * hashRange(i, salt + 2, 0.8, 1.3),
      });
    }
  }
  return out.sort((a, b) => a.flowDistance - b.flowDistance);
})();

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
        console.log('[CHASSE-GALERIE] Taking flight! Weave between the steeples!');
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
      if (active && altitude > 0.5) {
        for (const s of STEEPLES) {
          if (Math.abs(playerFlowDistance - s.flowDistance) < STEEPLE_HIT_Z
            && Math.abs(canoeWorldX - s.worldX) < STEEPLE_HIT_X) {
            hit = true;
            break;
          }
        }
      }

      return { hit, active, altitude };
    },

    reset() {
      active = false;
      flightDone = false;
      altitude = 0;
    },

    drawSteeples(ctx, worldDistance, cameraWorldX) {
      if (!active) return;

      for (const steeple of STEEPLES) {
        // z < 0 is ahead of the canoe (up the screen), z > 0 behind it. Cull
        // to a bit more than the visible span so tall spires still poke in
        // from just off the top edge.
        const z = worldDistance - steeple.flowDistance;
        if (z < -18 || z > 6) continue;
        const screen = worldToScreen(steeple.worldX, z, cameraWorldX);

        const h = steeple.h * PIXELS_PER_UNIT;
        const baseW = 9;
        const tipW = 3;

        // little stone nave at the base
        ctx.fillStyle = '#6b6b65';
        ctx.fillRect(screen.x - baseW, screen.y - h * 0.28, baseW * 2, h * 0.28);

        // the spire
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y - h);
        ctx.lineTo(screen.x - tipW, screen.y - h * 0.72);
        ctx.lineTo(screen.x - baseW, screen.y - h * 0.28);
        ctx.lineTo(screen.x + baseW, screen.y - h * 0.28);
        ctx.lineTo(screen.x + tipW, screen.y - h * 0.72);
        ctx.closePath();
        ctx.fill();

        // cross at the peak
        ctx.strokeStyle = '#2a2a2a';
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

    // How far past the water's edge the canoe may currently drift, world
    // units — scales with altitude, so it opens up as you climb out and
    // eases back to the river as you glide down at the end (no hard snap
    // back inside the banks when the flight flag finally flips off).
    lateralMargin() {
      return FLIGHT_LATERAL_MARGIN * Math.max(0, Math.min(1, altitude / FLIGHT_HEIGHT));
    },
  };
}
