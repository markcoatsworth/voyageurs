// Villages along the river, one at each real waypoint from river/route.js
// (except the put-in). Each has a small dock sticking out into the channel
// — run the canoe into one and game.js sends the player ashore instead of
// taking damage — plus a handful of log buildings on the bank behind it.
import { CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_HEIGHT, PIXELS_PER_UNIT } from './config.js';
import { centerX, widthAt } from '../river/path.js';
import { hashRange } from '../river/hash.js';
import { VILLAGES } from '../river/route.js';
import { createCabinSprite, createPineTreeSprite } from './sprites.js';

export { VILLAGES };

// Docks are deliberately a generous target, not a precision landing: the
// canoe only gets ~10 world units of visible lead time to react (the
// screen's forward view) and needs to cross most of the channel to reach
// one, which was consistently missable at the old, shore-hugging size.
// Reaching this far toward center means a dock can cover most or all of a
// narrow stretch's width — intentional, not a bug: on a wide stretch it
// still takes real steering to the correct side, and a narrow stretch has
// its two banks close together anyway, so "generous" converges to "hit
// the correct half of the river."
const DOCK_LENGTH = 6; // world units the dock reaches from shore into the channel
const DOCK_WIDTH_Z = 2.2; // dock's own extent along the river's flow axis
export const DOCK_HIT_Z = 1.3; // how close (in flowDistance) counts as "touching" the dock

// Buildings sit past the rocky shoreline (terrain.js's shore+bank-rock bands
// are ~2.2 units deep), each offset slightly along the flow axis (dOffset)
// and inland from the bank (depth) so they read as a small cluster instead
// of a straight row.
const BUILDING_SHORE_OFFSET = 2.4;
const BUILDING_LAYOUT = [
  { variant: 0, dOffset: 0.6, depth: 3.6 },
  { variant: 1, dOffset: -2.6, depth: 1.6 },
  { variant: 2, dOffset: 2.4, depth: 1.9 },
];

// How far along d a village's clearing suppresses the boreal-forest scatter
// (terrain.js) so buildings aren't drawn underneath a wall of trees. Trees
// still surround the village — see VILLAGE_TREE_LAYOUT below — this just
// stops the dense random forest from also filling the same clearing and
// burying the buildings under it.
const CLEARING_HALF_D = 6;

// A hand-placed ring of pine trees framing the building cluster: behind it
// (deeper inland, reads as "the village backs onto the forest") and along
// its open sides, but clear of every building footprint and clear of the
// dock's own approach lane. Each gets a little per-village jitter (below)
// so six villages using the same layout don't look identical.
const VILLAGE_TREE_LAYOUT = [
  { dOffset: -4.4, depth: 1.0 },
  { dOffset: -5.0, depth: 3.2 },
  { dOffset: -4.2, depth: 5.4 },
  { dOffset: -1.4, depth: 6.6 },
  { dOffset: 1.4, depth: 6.8 },
  { dOffset: 3.8, depth: 5.2 },
  { dOffset: 4.6, depth: 2.8 },
  { dOffset: 4.0, depth: 0.8 },
  { dOffset: -1.6, depth: 0.6 },
  { dOffset: 2.0, depth: 0.7 },
];

const cabinSprites = BUILDING_LAYOUT.map((b) => createCabinSprite(b.variant));
const villageTreeSprites = [0, 1, 2].map(createPineTreeSprite);

function bankEdge(d, side) {
  return centerX(d) + side * widthAt(d) / 2;
}

function toScreen(worldX, z, cameraWorldX) {
  return {
    x: CANOE_SCREEN_X + (worldX - cameraWorldX) * PIXELS_PER_UNIT,
    y: CANOE_SCREEN_Y + z * PIXELS_PER_UNIT,
  };
}

// Used by terrain.js to keep the forest scatter from covering a village.
export function isNearVillage(d, side) {
  for (const v of VILLAGES) {
    if (v.side === side && Math.abs(d - v.flowDistance) < CLEARING_HALF_D) return true;
  }
  return false;
}

// Returns the village whose dock the canoe is currently touching, or null.
export function getDockHit(flowDistance, canoeWorldX) {
  for (const v of VILLAGES) {
    if (Math.abs(flowDistance - v.flowDistance) > DOCK_HIT_Z) continue;
    const edge = bankEdge(v.flowDistance, v.side);
    const inner = edge - v.side * DOCK_LENGTH;
    const lo = Math.min(edge, inner);
    const hi = Math.max(edge, inner);
    if (canoeWorldX >= lo && canoeWorldX <= hi) return v;
  }
  return null;
}

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 5;

export function drawVillages(ctx, worldDistance, cameraWorldX) {
  VILLAGES.forEach((v, i) => {
    const z = worldDistance - v.flowDistance;
    if (Math.abs(z) > VISIBLE_Z_RANGE) return;
    drawOneVillage(ctx, v, i, worldDistance, cameraWorldX);
  });
}

function drawOneVillage(ctx, v, vIndex, worldDistance, cameraWorldX) {
  const edge = bankEdge(v.flowDistance, v.side);
  const inner = edge - v.side * DOCK_LENGTH;
  const z0 = worldDistance - v.flowDistance;

  // Dock: a plank deck with pilings, drawn as an axis-aligned rectangle in
  // world space — valid here because x and z scale to screen independently
  // (no rotation), unlike a real oblique-angle pier.
  const corners = [
    toScreen(edge, z0 - DOCK_WIDTH_Z / 2, cameraWorldX),
    toScreen(inner, z0 - DOCK_WIDTH_Z / 2, cameraWorldX),
    toScreen(inner, z0 + DOCK_WIDTH_Z / 2, cameraWorldX),
    toScreen(edge, z0 + DOCK_WIDTH_Z / 2, cameraWorldX),
  ];
  const left = Math.min(...corners.map((c) => c.x));
  const right = Math.max(...corners.map((c) => c.x));
  const top = Math.min(...corners.map((c) => c.y));
  const bottom = Math.max(...corners.map((c) => c.y));

  ctx.fillStyle = '#3f2b1a';
  ctx.fillRect(left - 1, top - 1, right - left + 2, bottom - top + 2);
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = '#5f3b20';
  ctx.lineWidth = 1;
  const plankSpacing = 5;
  for (let px = left + plankSpacing; px < right; px += plankSpacing) {
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
  }
  // pilings at the outer (water) end
  ctx.fillStyle = '#3f2b1a';
  const pilingX = v.side > 0 ? left : right;
  ctx.fillRect(pilingX - 1, top - 1, 2, bottom - top + 2);

  // Buildings and their surrounding trees, merged into one painter's-
  // algorithm pass (sorted so the nearer thing — larger z — draws last, on
  // top) so a tree in front of a cabin actually overlaps it correctly
  // instead of every building drawing over every tree regardless of depth.
  const scenery = BUILDING_LAYOUT.map((b, i) => {
    const d = v.flowDistance + b.dOffset;
    const z = worldDistance - d;
    const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
    return { z, worldX, sprite: cabinSprites[i], anchor: 0.85 };
  });

  VILLAGE_TREE_LAYOUT.forEach((t, i) => {
    const jitterD = hashRange(vIndex * 41 + i, 601, -0.35, 0.35);
    const jitterDepth = hashRange(vIndex * 41 + i, 602, -0.3, 0.3);
    const d = v.flowDistance + t.dOffset + jitterD;
    const z = worldDistance - d;
    const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + t.depth + jitterDepth);
    const sprite = villageTreeSprites[Math.floor(hashRange(vIndex * 41 + i, 603, 0, villageTreeSprites.length))];
    scenery.push({ z, worldX, sprite, anchor: 0.72 });
  });

  scenery.sort((a, b) => a.z - b.z);

  for (const s of scenery) {
    const p = toScreen(s.worldX, s.z, cameraWorldX);
    ctx.drawImage(s.sprite, p.x - s.sprite.width / 2, p.y - s.sprite.height * s.anchor);
  }
}
