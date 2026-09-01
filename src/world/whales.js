import { CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, braidAt, ESTUARY_WIDTH_THRESHOLD } from './river/path.js';
import { hash, hashRange } from '../shared/hash.js';
import { createWhaleSprite } from './sprites.js';

const SLOT_SPACING = 9;
const SPAWN_CHANCE = 0.6;

const whaleSprite = createWhaleSprite();

export function drawWhales(ctx, time, worldDistance, cameraWorldX, worldToScreen) {
  const dNear = worldDistance - 6;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 4;
  const slotLo = Math.floor(dNear / SLOT_SPACING);
  const slotHi = Math.ceil(dFar / SLOT_SPACING);

  for (let slot = slotLo; slot <= slotHi; slot++) {
    if (hash(slot * 7 + 3) > SPAWN_CHANCE) continue;
    const d = slot * SLOT_SPACING + hashRange(slot, 1, -2, 2);
    const width = widthAt(d);
    if (width <= ESTUARY_WIDTH_THRESHOLD) continue;

    const lateralFrac = hashRange(slot, 2, -0.7, 0.7);
    const worldX = centerX(d) + lateralFrac * (width / 2);
    const braid = braidAt(d);
    if (braid && Math.abs(worldX - braid.centerX) < braid.halfWidth + 0.5) continue; // don't swim through the island
    const z = worldDistance - d;
    const { x, y } = worldToScreen(worldX, z, cameraWorldX);

    const phase = hash(slot * 13 + 5) * Math.PI * 2;
    const bob = Math.sin(time * 0.6 + phase);
    const bobOffset = Math.max(0, bob) * 5;
    if (bob < -0.1) continue; // fully submerged most of the cycle

    ctx.save();
    ctx.globalAlpha = 0.55 + Math.max(0, bob) * 0.45;
    ctx.drawImage(whaleSprite, x - whaleSprite.width / 2, y - whaleSprite.height / 2 + (8 - bobOffset));
    ctx.restore();
  }
}
