import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, braidAt, BRAID_PERIOD } from './river/path.js';
import { createWaterTile, createGrassTile, createBankTile, createSandTile } from './tiles.js';
import { createPineTreeSprite, createPebbleSprite } from './sprites.js';
import { hash, hashRange } from '../shared/hash.js';
import { isNearVillage, drawVillages } from './villages.js';

// Sample every 2px down the screen when building curve outlines. Braid
// islands taper from zero width in as little as ~2 world units (32px) —
// coarser sampling left a visible gap between this polygon and the water
// shader's per-pixel-exact edge right at the tip, where the curve is
// changing fastest.
const STEP = 2;
const SHORE_WIDTH = 0.4;
const BANK_ROCK_WIDTH = 1.8;

// Trees scatter over a 2D grid — along the river (D) and back into the bank
// (DEPTH) — instead of a single thin line hugging the shore, so it reads as
// an actual boreal forest covering the bank rather than a hedge.
const TREE_D_SPACING = 0.85;
const TREE_DEPTH_SPACING = 1.15;
const TREE_DEPTH_MAX = 8; // world units back from the bank's outer edge
const TREE_CHANCE = 0.8;

const PEBBLE_SPACING = 0.55;
const PEBBLE_CHANCE = 0.8;

let patterns = null;
const treeSprites = [0, 1, 2].map(createPineTreeSprite);
const pebbleSprites = [0, 1, 2].map(createPebbleSprite);

function ensurePatterns(ctx) {
  if (patterns) return patterns;
  patterns = {
    water: ctx.createPattern(createWaterTile(), 'repeat'),
    grass: ctx.createPattern(createGrassTile(), 'repeat'),
    bank: ctx.createPattern(createBankTile(), 'repeat'),
    sand: ctx.createPattern(createSandTile(), 'repeat'),
  };
  return patterns;
}

function dAtScreenY(y, worldDistance) {
  return worldDistance - (y - CANOE_SCREEN_Y) / PIXELS_PER_UNIT;
}

function toScreenX(worldX, cameraWorldX) {
  return CANOE_SCREEN_X + (worldX - cameraWorldX) * PIXELS_PER_UNIT;
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

// Draws grass/bank/sand/pebbles/trees — everything except the water
// surface itself. The water is left as a transparent hole in this canvas so
// the WebGL shader layer underneath (waterGL.js) shows through it; when
// that's unavailable, drawWaterFallback() below fills the same hole with a
// flat animated pattern instead.
export function drawBanks(ctx, worldDistance, cameraWorldX) {
  const pat = ensurePatterns(ctx);

  ctx.fillStyle = pat.grass;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const riverEdgeX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * widthAt(d) / 2, cameraWorldX);
  };
  const bankOuterX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH + BANK_ROCK_WIDTH), cameraWorldX);
  };
  const sandOuterX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH), cameraWorldX);
  };

  for (const side of [-1, 1]) {
    const outer = (y) => bankOuterX(y, side);
    const inner = (y) => riverEdgeX(y, side);
    ctx.fillStyle = pat.bank;
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

  drawBraidIslands(ctx, worldDistance, cameraWorldX);
  drawShorelineStones(ctx, worldDistance, cameraWorldX, riverEdgeX);
  drawTrees(ctx, worldDistance, cameraWorldX);
  drawVillages(ctx, worldDistance, cameraWorldX);
}

// The mid-channel islands that split the river into two short passages
// (world/river/path.js's braidAt). Drawn as a lens-shaped sand fill — plain small
// land, not the same rocky/cliff-like texture as the outer shore (that one
// reads as the fjord wall, which a mid-river island obviously isn't) —
// right on top of the water hole punched above, so it reads as solid land
// sitting between two open channels.
function drawBraidIslands(ctx, worldDistance, cameraWorldX) {
  const pat = ensurePatterns(ctx);

  const islandX = (y, edge) => {
    const d = dAtScreenY(y, worldDistance);
    const braid = braidAt(d);
    const cx = braid ? braid.centerX + edge * braid.halfWidth : centerX(d);
    return toScreenX(cx, cameraWorldX);
  };

  ctx.fillStyle = pat.sand;
  pathBetween(ctx, (y) => islandX(y, -1), (y) => islandX(y, 1));
  ctx.fill();

  // One tree near the widest point of each island currently in view —
  // these are small, a full forest scatter would swallow them.
  const dNear = worldDistance - (CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT - 2;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 2;
  const cycleLo = Math.floor(dNear / BRAID_PERIOD) - 1;
  const cycleHi = Math.ceil(dFar / BRAID_PERIOD) + 1;
  for (let cycle = cycleLo; cycle <= cycleHi; cycle++) {
    const braidCenterD = cycle * BRAID_PERIOD + BRAID_PERIOD / 2;
    const braid = braidAt(braidCenterD);
    if (!braid) continue;
    const z = worldDistance - braidCenterD;
    const y = CANOE_SCREEN_Y + z * PIXELS_PER_UNIT;
    const screenX = toScreenX(braid.centerX, cameraWorldX);
    const sprite = treeSprites[Math.floor(hashRange(cycle, 501, 0, treeSprites.length))];
    ctx.drawImage(sprite, screenX - sprite.width / 2, y - sprite.height * 0.72);
  }
}

// CPU fallback for browsers without WebGL — same river-shaped hole, filled
// with the old flat animated pattern instead of the shader. Drawn as two
// passes (each side out to the island, or the full channel when there's no
// island at that row) so it doesn't paint water back over an island that
// drawBanks() already filled in as solid land.
export function drawWaterFallback(ctx, worldDistance, cameraWorldX) {
  const pat = ensurePatterns(ctx);
  const edgeX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    return toScreenX(centerX(d) + side * widthAt(d) / 2, cameraWorldX);
  };
  const islandX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    const braid = braidAt(d);
    const cx = braid ? braid.centerX + side * braid.halfWidth : centerX(d) + side * widthAt(d) / 2;
    return toScreenX(cx, cameraWorldX);
  };

  const scroll = (worldDistance * PIXELS_PER_UNIT * 0.6) % 16;
  if (pat.water.setTransform) pat.water.setTransform(new DOMMatrix().translate(0, scroll));
  ctx.fillStyle = pat.water;
  pathBetween(ctx, (y) => edgeX(y, -1), (y) => islandX(y, -1));
  ctx.fill();
  pathBetween(ctx, (y) => islandX(y, 1), (y) => edgeX(y, 1));
  ctx.fill();
}

// Visual current flow effects - animated streaks showing St. Lawrence currents
export function drawCurrentEffects(ctx, time, worldDistance, rapids) {
  ctx.save();

  // Current intensity varies with rapids and natural river flow
  const baseIntensity = 0.25 + rapids * 0.4; // stronger in rapids
  const flowSpeed = 60 + rapids * 80; // pixels per second

  // Flowing streaks moving downstream
  const streakCount = Math.floor(15 + rapids * 25);
  const streakSpacing = CANVAS_HEIGHT / streakCount;

  ctx.globalAlpha = baseIntensity;

  for (let i = 0; i < streakCount; i++) {
    // Vertical movement down the screen (flowing toward player)
    const baseY = (i * streakSpacing + (time * flowSpeed) % streakSpacing) % CANVAS_HEIGHT;

    // Horizontal wobble simulating turbulent currents
    const wobbleFreq = 0.8 + (i % 3) * 0.3;
    const wobbleAmp = 30 + rapids * 40;
    const wobblePhase = (i * 0.7);
    const wobbleX = Math.sin(time * wobbleFreq + wobblePhase) * wobbleAmp;

    const x = CANVAS_WIDTH / 2 + wobbleX;
    const y = baseY;

    // Draw flowing streak
    const gradient = ctx.createLinearGradient(x, y, x, y + 20);
    gradient.addColorStop(0, 'rgba(200, 220, 235, 0)');
    gradient.addColorStop(0.5, `rgba(200, 220, 235, ${0.6 + rapids * 0.3})`);
    gradient.addColorStop(1, 'rgba(200, 220, 235, 0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5 + rapids * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.sin(time * 2 + i) * 5), y + 20);
    ctx.stroke();
  }

  ctx.restore();
}

// A chain of small stones right at the waterline, so the shore reads as a
// defined edge rather than a flat color change.
function drawShorelineStones(ctx, worldDistance, cameraWorldX, riverEdgeX) {
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
      const screenX = toScreenX(worldX, cameraWorldX);
      const sprite = pebbleSprites[Math.floor(hashRange(slot, salt + 2, 0, pebbleSprites.length))];
      ctx.drawImage(sprite, screenX - sprite.width / 2, y - sprite.height / 2);
    }
  }
}

// A dense boreal forest covering the bank, not just a treeline at the
// water's edge: trees scatter across a 2D grid — along the river (d) and
// back into the bank (depth) — with per-cell jitter so it doesn't read as a
// grid. Candidates are collected and painter's-algorithm sorted by z before
// drawing, since at this density trees regularly overlap and need nearer
// ones (larger z) to cover farther ones, not just whichever drew last.
function drawTrees(ctx, worldDistance, cameraWorldX) {
  const dNear = worldDistance - (CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT - 2;
  const dFar = worldDistance + CANOE_SCREEN_Y / PIXELS_PER_UNIT + 2;
  const dSlotLo = Math.floor(dNear / TREE_D_SPACING);
  const dSlotHi = Math.ceil(dFar / TREE_D_SPACING);
  const depthSlotMax = Math.ceil(TREE_DEPTH_MAX / TREE_DEPTH_SPACING);

  const candidates = [];

  for (const side of [-1, 1]) {
    const sideSalt = side < 0 ? 11 : 97;
    for (let dSlot = dSlotLo; dSlot <= dSlotHi; dSlot++) {
      for (let depthSlot = 0; depthSlot <= depthSlotMax; depthSlot++) {
        const cell = dSlot * 4001 + depthSlot * 17 + sideSalt;
        if (hash(cell) > TREE_CHANCE) continue;

        const d = dSlot * TREE_D_SPACING + hashRange(cell, 1, -0.35, 0.35);
        if (isNearVillage(d, side)) continue;
        const depth = Math.max(0, depthSlot * TREE_DEPTH_SPACING + hashRange(cell, 2, -0.4, 0.4));
        const z = worldDistance - d;
        const worldX = centerX(d) + side * (widthAt(d) / 2 + SHORE_WIDTH + BANK_ROCK_WIDTH + depth);
        const sprite = treeSprites[Math.floor(hashRange(cell, 3, 0, treeSprites.length))];
        candidates.push({ z, worldX, sprite });
      }
    }
  }

  candidates.sort((a, b) => a.z - b.z);

  for (const c of candidates) {
    const y = CANOE_SCREEN_Y + c.z * PIXELS_PER_UNIT;
    const screenX = toScreenX(c.worldX, cameraWorldX);
    ctx.drawImage(c.sprite, screenX - c.sprite.width / 2, y - c.sprite.height * 0.72);
  }
}
