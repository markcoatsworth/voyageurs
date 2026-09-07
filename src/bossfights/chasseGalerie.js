// Chasse-galerie — the flying canoe.
// Past Montreal the canoe lifts off the water and flies the whole Ottawa
// River stretch up to the voyageurs' winter camp at Gatineau. There's no
// landing anywhere along the way: the riverbank towns you pass (Île-Perrot,
// Hudson, Rigaud, Carillon) don't have docks any more, only big church
// steeples — clip one and it costs you (in the legend, brushing a steeple
// or swearing breaks the devil's pact). Steer between them; the current
// doesn't apply in the sky (see game.js's flight branch).

import { VILLAGES } from '../world/river/route.js';
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';

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

// Church steeples — the only thing the riverbank towns do during the flight.
// Each real parish you fly over (Île-Perrot, Hudson, Rigaud, Carillon) gets
// a pair of spires standing on its own bank; the far half of the channel
// stays a clear lane, so passing a town safely means being over on the
// other side by the time you reach it. The towns sit on alternating banks
// (see route.js), so the flight is a lazy weave with open sky between.
const STEEPLE_HIT_Z = 2.4;     // half-length of the collision box along the flow
const STEEPLE_HIT_X = 2.4;     // half-width across the channel
const STEEPLE_VISUAL_H = 9;    // world units tall — deliberately "big"
const STEEPLE_LONG_GAP = 8;    // flow-distance spacing of a town's two spires
// How far toward the town's own bank each spire sits, as a fraction of the
// channel half-width. Both stay well over on one side of a narrow (~11-unit)
// channel — the centre and the far bank are always a clear lane, so a
// straight line down the middle survives and a drift toward the town's bank
// as you pass it doesn't.
const STEEPLE_LANES = [0.68, 0.9];

// Every named place between the take-off point and the landing — Montreal
// and Gatineau themselves excluded (you start past one and glide down onto
// the other). Pure geometry, so it's built once at module load.
const STEEPLES = (() => {
  const towns = VILLAGES.filter(
    v => v.segment === 'lawrenceWest'
      && v.flowDistance > TRIGGER_DISTANCE + 8
      && v.flowDistance < FLIGHT_END - 8,
  );
  const out = [];
  for (const town of towns) {
    STEEPLE_LANES.forEach((frac, i) => {
      const d = town.flowDistance + (i - 0.5) * STEEPLE_LONG_GAP;
      out.push({
        town: town.name,
        flowDistance: d,
        worldX: centerX(d) + town.side * frac * widthAt(d) / 2,
      });
    });
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
      if (active) {
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
        const z = worldDistance - steeple.flowDistance;
        const screen = worldToScreen(steeple.worldX, z, cameraWorldX);
        if (screen.y < -120 || screen.y > CANVAS_HEIGHT + 120) continue;

        const h = STEEPLE_VISUAL_H * PIXELS_PER_UNIT;
        const baseW = 11;
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
  };
}
