// Chasse-galerie — the flying canoe boss fight
// After reaching Montreal, the canoe takes flight up the Ottawa River toward
// Gatineau. Dodge church steeples or lose the devil's blessing.

import { VILLAGES } from '../world/river/route.js';
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';

const MONTREAL = VILLAGES.find(v => v.name === 'Montreal');
const TRIGGER_DISTANCE = MONTREAL.flowDistance + 20; // Shortly after Montreal
const FLIGHT_DURATION = 200; // How long the flight lasts in world units
const FLIGHT_END = TRIGGER_DISTANCE + FLIGHT_DURATION;

// Flying mechanics
const FLIGHT_HEIGHT = 8; // How high above the river (world units)
const FLIGHT_SWAY_SPEED = 1.5; // Side-to-side drift
const STEEPLE_SPACING = 25; // Distance between church steeples

// Church steeple obstacles
const STEEPLE_WIDTH = 2; // Width of steeple collision
const STEEPLE_HEIGHT = 6; // Visual height

export function createChasseGalerie() {
  let active = false;
  let flightStarted = false;
  let altitude = 0; // Current height above river
  let steeples = []; // Active steeple obstacles

  function isInRange(flowDistance) {
    return flowDistance >= TRIGGER_DISTANCE && flowDistance < FLIGHT_END;
  }

  return {
    update(playerFlowDistance, canoeWorldX, dt) {
      const inRange = isInRange(playerFlowDistance);

      if (inRange && !flightStarted) {
        // Start the flight
        active = true;
        flightStarted = true;
        console.log('[CHASSE-GALERIE] Taking flight! Avoid the steeples!');
      }

      if (active) {
        // Gradually lift the canoe
        if (altitude < FLIGHT_HEIGHT) {
          altitude += dt * 3; // Rise speed
        }

        // Generate steeples ahead
        const horizonDistance = playerFlowDistance + 15; // Look-ahead
        while (steeples.length === 0 || steeples[steeples.length - 1].flowDistance < horizonDistance) {
          const lastD = steeples.length > 0 ? steeples[steeples.length - 1].flowDistance : playerFlowDistance;
          const d = lastD + STEEPLE_SPACING + Math.random() * 10;

          // Random side: left (-1) or right (1)
          const side = Math.random() < 0.5 ? -1 : 1;
          // Steeples on the BANK (churches are on shore, not mid-river)
          const bankOffset = 0.85 + Math.random() * 0.1; // 85-95% toward edge
          const offset = side * bankOffset;

          steeples.push({
            flowDistance: d,
            worldX: centerX(d) + offset * widthAt(d) / 2,
            passed: false,
          });
        }

        // Remove steeples that are behind the player
        steeples = steeples.filter(s => s.flowDistance > playerFlowDistance - 5);

        // Check collisions
        for (const steeple of steeples) {
          const dist = Math.abs(playerFlowDistance - steeple.flowDistance);
          const xDist = Math.abs(canoeWorldX - steeple.worldX);

          if (dist < 2 && xDist < STEEPLE_WIDTH) {
            return { hit: true, altitude }; // Collision!
          }
        }

        // End flight
        if (playerFlowDistance >= FLIGHT_END) {
          active = false;
          console.log('[CHASSE-GALERIE] Flight complete!');
        }
      }

      return { hit: false, active, altitude, steeples };
    },

    reset() {
      active = false;
      flightStarted = false;
      altitude = 0;
      steeples = [];
    },

    drawSteeples(ctx, worldDistance, cameraWorldX) {
      if (!active) return;

      for (const steeple of steeples) {
        const z = worldDistance - steeple.flowDistance;
        const screen = worldToScreen(steeple.worldX, z, cameraWorldX);

        // Only draw if on screen
        if (screen.y > -100 && screen.y < CANVAS_HEIGHT + 100) {
          // Simple steeple: dark gray spire
          ctx.fillStyle = '#3a3a3a';
          const baseW = 8;
          const tipW = 3;
          const h = STEEPLE_HEIGHT * PIXELS_PER_UNIT;

          // Draw pointed spire
          ctx.beginPath();
          ctx.moveTo(screen.x, screen.y - h); // tip
          ctx.lineTo(screen.x - tipW, screen.y - h * 0.7);
          ctx.lineTo(screen.x - baseW, screen.y);
          ctx.lineTo(screen.x + baseW, screen.y);
          ctx.lineTo(screen.x + tipW, screen.y - h * 0.7);
          ctx.closePath();
          ctx.fill();

          // Cross on top
          ctx.strokeStyle = '#2a2a2a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(screen.x, screen.y - h - 3);
          ctx.lineTo(screen.x, screen.y - h + 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(screen.x - 3, screen.y - h);
          ctx.lineTo(screen.x + 3, screen.y - h);
          ctx.stroke();
        }
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
