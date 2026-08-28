import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from './config.js';
import { centerX, widthAt } from '../river/path.js';
import { createWaterTile, createGrassTile, createCliffTile, createSandTile } from './tiles.js';
import { createTreeSprite, createPebbleSprite } from './sprites.js';
import { hash, hashRange } from './hash.js';

const STEP = 4; // sample every 4px down the screen when building curve outlines
const SHORE_WIDTH = 0.4;
const CLIFF_WIDTH = 1.8;
const TREE_SLOT_SPACING = 1.6; // world units between candidate tree slots per side
const TREE_CHANCE = 0.55;
const PEBBLE_SPACING = 0.55;
const PEBBLE_CHANCE = 0.8;

let patterns = null;
const treeSprites = [0, 1, 2, 3].map(createTreeSprite);
const pebbleSprites = [0, 1, 2].map(createPebbleSprite);

function ensurePatterns(ctx) {
  if (patterns) return patterns;
  patterns = {
    water: ctx.createPattern(createWaterTile(), 'repeat'),
    grass: ctx.createPattern(createGrassTile(), 'repeat'),
    cliff: ctx.createPattern(createCliffTile(), 'repeat'),
    sand: ctx.createPattern(createSandTile(), 'repeat'),
  };
  return patterns;
}

function dAtScreenY(y, worldDistance) {
  return worldDistance - (y - CANOE_SCREEN_Y) / PIXELS_PER_UNIT;
}

function toScreenX(worldX, canoeWorldX) {
  return CANOE_SCREEN_X + (worldX - canoeWorldX) * PIXELS_PER_UNIT;
}

function pathBetween(ctx, leftXAt, rightXAt) {
  ctx.beginPath();
  for (let y = 0; y <= CANVAS_HEIGHT; y += STEP) {
    const x = leftXAt(y);
    if (y === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let y = CANVAS_HEIGHT; y >= 0; y -= STEP) {
    ctx.lineTo(rightXAt(y), y);
  }
  ctx.closePath();
}

// Draws grass/cliff/sand/pebbles/trees — everything except the water
// surface itself. The water is left as a transparent hole in this canvas so
// the WebGL shader layer underneath (waterGL.js) shows through it; when
// that's unavailable, drawWaterFallback() below fills the same hole with a
// flat animated pattern instead.
export function drawBanks(ctx, worldDistance, canoeWorldX) {
  const pat = ensurePatterns(ctx);

  ctx.fillStyle = pat.grass;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const riverEdgeX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * widthAt(d) / 2, canoeWorldX);
  };
  const cliffOuterX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH + CLIFF_WIDTH), canoeWorldX);
  };
  const sandOuterX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH), canoeWorldX);
  };

  for (const side of [-1, 1]) {
    const outer = (y) => cliffOuterX(y, side);
    const inner = (y) => riverEdgeX(y, side);
    ctx.fillStyle = pat.cliff;
    if (side < 0) pathBetween(ctx, outer, inner); else pathBetween(ctx, inner, outer);
    ctx.fill();

    const sandOuter = (y) => sandOuterX(y, side);
    ctx.fillStyle = pat.sand;
    if (side < 0) pathBetween(ctx, sandOuter, inner); else pathBetween(ctx, inner, sandOuter);
    ctx.fill();
  }

  // The grass base fill above painted straight over the water region too —
  // punch it back out to transparent so the WebGL layer underneath (or the
  // 2D fallback) actually shows through instead of being hidden behind it.
  ctx.save();
  pathBetween(ctx, (y) => riverEdgeX(y, -1), (y) => riverEdgeX(y, 1));
  ctx.clip();
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();

  drawShorelineStones(ctx, worldDistance, canoeWorldX, riverEdgeX);
  drawTrees(ctx, worldDistance, canoeWorldX);
}

// CPU fallback for browsers without WebGL — same river-shaped hole, filled
// with the old flat animated pattern instead of the shader.
export function drawWaterFallback(ctx, worldDistance, canoeWorldX) {
  const pat = ensurePatterns(ctx);
  const riverEdgeX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * widthAt(d) / 2, canoeWorldX);
  };
  const scroll = (worldDistance * PIXELS_PER_UNIT * 0.6) % 16;
  if (pat.water.setTransform) pat.water.setTransform(new DOMMatrix().translate(0, scroll));
  ctx.fillStyle = pat.water;
  pathBetween(ctx, (y) => riverEdgeX(y, -1), (y) => riverEdgeX(y, 1));
  ctx.fill();
}

// A chain of small stones right at the waterline, so the shore reads as a
// defined edge rather than a flat color change.
function drawShorelineStones(ctx, worldDistance, canoeWorldX, riverEdgeX) {
  const dNear = worldDistance - (CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT - 1;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 1;
  const slotLo = Math.floor(dNear / PEBBLE_SPACING);
  const slotHi = Math.ceil(dFar / PEBBLE_SPACING);

  for (const side of [-1, 1]) {
    for (let slot = slotLo; slot <= slotHi; slot++) {
      const salt = side < 0 ? 211 : 337;
      if (hash(slot * 5 + salt) > PEBBLE_CHANCE) continue;
      const d = slot * PEBBLE_SPACING;
      const z = worldDistance - d;
      const y = CANOE_SCREEN_Y + z * PIXELS_PER_UNIT;
      const wobble = hashRange(slot, salt + 1, -0.12, 0.18);
      const worldX = centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH * 0.5 + wobble);
      const screenX = toScreenX(worldX, canoeWorldX);
      const sprite = pebbleSprites[Math.floor(hashRange(slot, salt + 2, 0, pebbleSprites.length))];
      ctx.drawImage(sprite, screenX - sprite.width / 2, y - sprite.height / 2);
    }
  }
}

function drawTrees(ctx, worldDistance, canoeWorldX) {
  const dNear = worldDistance - (CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT - 2;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 2;
  const slotLo = Math.floor(dNear / TREE_SLOT_SPACING);
  const slotHi = Math.ceil(dFar / TREE_SLOT_SPACING);

  for (const side of [-1, 1]) {
    for (let slot = slotLo; slot <= slotHi; slot++) {
      const salt = side < 0 ? 11 : 97;
      if (hash(slot * 3 + salt) > TREE_CHANCE) continue;
      const d = slot * TREE_SLOT_SPACING + hashRange(slot, salt + 1, -0.5, 0.5);
      const z = worldDistance - d;
      const y = CANOE_SCREEN_Y + z * PIXELS_PER_UNIT;
      const outerX = centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH + CLIFF_WIDTH);
      const jitter = hashRange(slot, salt + 2, 0.15, 1.6) * side;
      const worldX = outerX + jitter;
      const screenX = toScreenX(worldX, canoeWorldX);
      const sprite = treeSprites[Math.floor(hashRange(slot, salt + 3, 0, treeSprites.length))];
      ctx.drawImage(sprite, screenX - sprite.width / 2, y - sprite.height * 0.7);
    }
  }
}
