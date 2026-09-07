// Chasse-galerie — the flying canoe.
// Past Montreal the canoe lifts off the water and flies the whole Ottawa
// River gorge up to the voyageurs' winter camp at Gatineau, on a stormy
// night. There's no landing along the way, and the gorge is tight: big
// parish churches jut in from alternating banks, each one cutting across
// most of the channel and leaving only a narrow thread on the far side.
// Fly the thread, weave bank to bank as the churches alternate. Clip a
// steeple (or "swear") and the devil's pact breaks. A light crosswind
// nudges you off line; the river current doesn't apply in the sky (see
// game.js's flight branch).

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
// units — just a little overhang room; the churches spill onto the banks so
// there's nothing to gain by flying wide. game.js widens its lateral clamp
// to this while the flight is active (and drops the "ran aground" penalty).
export const FLIGHT_LATERAL_MARGIN = 2;

// --- the crosswind -------------------------------------------------------
// A gentle lateral acceleration (world units/sec^2) the whole flight, so
// holding the thread takes small constant corrections. Secondary to the
// steeples — the player's steering accel (game.js STEER_ACCEL) dwarfs it.
// Scaled by altitude — calm on the runway, full at height.
const WIND_STRENGTH = 4.5;
export function flightWind(flowDistance, time, altFrac) {
  const d = flowDistance;
  const wave =
    0.6 * Math.sin(d * 0.028) +
    0.4 * Math.sin(d * 0.011 + 2.1);
  return WIND_STRENGTH * wave * Math.max(0, Math.min(1, altFrac));
}

// --- the gorge slalom --------------------------------------------------
const STEEPLE_SPACING = 26;    // nominal flow-distance between churches
const STEEPLE_JITTER = 4;
const STEEPLE_HIT_Z = 2.7;     // half-depth along the flow — the churches are deep
const GORGE_GAP = 3.4;         // width of the clear thread past a church
const GORGE_GAP_EASY = 4.8;    // occasional breather
const GORGE_GAP_HARD = 2.7;    // occasional squeeze
const GAP_CENTER_MAX = 1.4;    // the thread never sits further off centre than
                               // this, so the weave stays within the canoe's
                               // steering reach between churches
const SAME_SIDE_CHANCE = 0.16; // odds a church repeats the previous bank
const STEEPLE_VISUAL_H = 11;   // tall
const STEEPLE_OVERHANG = 2.4;  // how far the church body spills past its own bank

// Built once at module load — pure geometry over the flight span. Each entry
// is one church: `worldX`/`hx`/`hz` are its collision box (which reaches from
// past its own bank across the centre line, cutting off most of the gorge),
// `gapOffset` is the centre-relative lateral offset of the clear thread it
// leaves on the far side (aim there), `side` is the bank it stands on.
const STEEPLES = (() => {
  const from = TRIGGER_DISTANCE - 4;
  const to = FLIGHT_END + 4;
  const out = [];
  let side = 1;
  let d = from + 12;
  let i = 0;
  while (d < to) {
    const gapRoll = hashRange(i, 3, 0, 1);
    const gap = gapRoll < 0.16 ? GORGE_GAP_EASY : gapRoll > 0.83 ? GORGE_GAP_HARD : GORGE_GAP;
    const waterHalf = widthAt(d) / 2;
    const cx = centerX(d);
    // Thread sits `gap/2` off the far bank, but never more than
    // GAP_CENTER_MAX off centre — otherwise a wide spot would demand a weave
    // the canoe can't physically cross in one church-spacing.
    const gapCenter = -side * Math.min(Math.max(0, waterHalf - gap / 2), GAP_CENTER_MAX);
    const innerX = gapCenter + side * (gap / 2); // church edge facing the thread
    const outerX = side * (waterHalf + STEEPLE_OVERHANG);
    out.push({
      flowDistance: d,
      side,
      worldX: cx + (innerX + outerX) / 2,
      hx: Math.abs(outerX - innerX) / 2,
      hz: STEEPLE_HIT_Z,
      gapOffset: gapCenter,
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
        console.log('[CHASSE-GALERIE] Taking flight into the gorge!');
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

// A big stone parish church, its body cutting across the water from one
// bank, a bell tower and tall spire looming over the gap it leaves.
function drawChurch(ctx, s, z, cameraWorldX) {
  const screen = worldToScreen(s.worldX, z, cameraWorldX);
  const halfPx = s.hx * PIXELS_PER_UNIT;
  const bodyH = s.h * 0.34 * PIXELS_PER_UNIT;
  const spireH = s.h * PIXELS_PER_UNIT;
  const waterY = screen.y;

  // tower/spire sit at the channel-facing end (toward -side)
  const towerX = screen.x - s.side * (halfPx - 7);
  const towerW = 11;

  // nave — a long stone hall spilling from the bank into the water
  ctx.fillStyle = '#54545c';
  ctx.fillRect(screen.x - halfPx, waterY - bodyH, halfPx * 2, bodyH + 6);
  // pitched roof
  ctx.fillStyle = '#3b3b42';
  ctx.beginPath();
  ctx.moveTo(screen.x - halfPx, waterY - bodyH);
  ctx.lineTo(screen.x, waterY - bodyH - 9);
  ctx.lineTo(screen.x + halfPx, waterY - bodyH);
  ctx.closePath();
  ctx.fill();

  // a few lit windows so the church reads at night and telegraphs its width
  ctx.fillStyle = '#e7c15a';
  for (let wx = screen.x - halfPx + 6; wx < screen.x + halfPx - 4; wx += 9) {
    ctx.fillRect(wx, waterY - bodyH * 0.62, 2, 4);
  }

  // bell tower
  ctx.fillStyle = '#4a4a52';
  ctx.fillRect(towerX - towerW / 2, waterY - spireH * 0.62, towerW, spireH * 0.62 + 4);
  // spire
  ctx.fillStyle = '#2c2c31';
  ctx.beginPath();
  ctx.moveTo(towerX, waterY - spireH);
  ctx.lineTo(towerX - towerW / 2, waterY - spireH * 0.6);
  ctx.lineTo(towerX + towerW / 2, waterY - spireH * 0.6);
  ctx.closePath();
  ctx.fill();
  // cross
  ctx.strokeStyle = '#20201f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(towerX, waterY - spireH - 5);
  ctx.lineTo(towerX, waterY - spireH + 7);
  ctx.moveTo(towerX - 3.5, waterY - spireH + 1);
  ctx.lineTo(towerX + 3.5, waterY - spireH + 1);
  ctx.stroke();
}
