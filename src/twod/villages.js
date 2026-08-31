// Villages along the river, one at each real waypoint from river/route.js
// (except the put-in). Each has a small dock sticking out into the channel
// — run the canoe into one and game.js sends the player ashore instead of
// taking damage — plus a handful of log buildings on the bank behind it.
import { CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_HEIGHT, PIXELS_PER_UNIT } from './config.js';
import { centerX, widthAt } from '../river/path.js';
import { hashRange } from '../river/hash.js';
import { VILLAGES } from '../river/route.js';
import {
  createCabinSprite, createPineTreeSprite, createRepairShopSprite,
  createStoneBuildingSprite, createChurchSprite, createRampartSprite,
} from './sprites.js';

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
const DOCK_HIT_Z = 1.3; // how close (in flowDistance) counts as "touching" the dock

// Québec City's dock isn't a village pier at all — it's the King's Wharf, a
// working port for the capital, and it's drawn to match: a genuinely huge
// stone quay reaching deep across the channel (well past the centerline,
// per an explicit request to make it "so big I cannot miss" after a more
// modest oversizing still wasn't visible/findable enough), wide along the
// shore to match, easy to spot from the moment Québec City comes into view.
const QUEBEC_CITY_DOCK_REACH = 32; // ~72% of the full ~44-unit channel width, vs. ~6 everywhere else
const QUEBEC_CITY_DOCK_WIDTH_Z = 12; // vs. 2.2 everywhere else
const QUEBEC_CITY_DOCK_HIT_Z = 7; // vs. 1.3 everywhere else

// Buildings sit past the rocky shoreline (terrain.js's shore+bank-rock bands
// are ~2.2 units deep), each offset slightly along the flow axis (dOffset)
// and inland from the bank (depth) so they read as a small cluster instead
// of a straight row. The specific per-building offsets and count come from
// villageLayout() below, keyed on the village's seed.
const BUILDING_SHORE_OFFSET = 2.4;

// Guaranteed to exist right beside every dock — the future repair shop
// ("get your canoe fixed"). Deliberately *not* part of villageLayout()'s
// random cluster below: that layout can put its nearest building several
// units down the bank depending on the village's seed, which defeats the
// point of a landmark you can count on being exactly where you tie up
// every time. Fixed just past the dock's own footprint (DOCK_WIDTH_Z),
// always on the downstream side, right at the shoreline.
const REPAIR_SHOP_D_OFFSET = 2.1;
const REPAIR_SHOP_DEPTH = 1.0;
const repairShopSprite = createRepairShopSprite();

// Procedural per-village layout. Deterministic in `seed` (VILLAGES[i].seed)
// so a village is laid out the same way every frame and matches its
// on-foot scene (villageScene.js reads the same descriptors), but no two
// villages share a footprint. Descriptors are coordinate-space-neutral:
//   building.along  -1..1  position along the bank / flow axis
//   building.inland  0..1  0 = hard against the shore, 1 = deep in the clearing
//   building.mirror  bool  flip the sprite horizontally
// The first building is always the larger "post" (cabin variant 0); the
// rest are laid out in evenly-spaced slots along the bank (plus jitter) so
// a 4- or 5-building village spreads into a row instead of a pile.
const layoutCache = new Map();
export function villageLayout(seed) {
  const cached = layoutCache.get(seed);
  if (cached) return cached;
  const r = (salt, min, max) => hashRange(seed, salt, min, max);
  const count = 3 + Math.floor(r(1, 0, 2.999)); // 3..5 buildings
  const buildings = [];
  for (let i = 0; i < count; i++) {
    // Slot centre in -1..1, then a little jitter that can't cross into the
    // neighbouring slot.
    const slot = ((i + 0.5) / count) * 2 - 1;
    const jitter = r(30 + i, -1, 1) * (0.9 / count);
    buildings.push({
      variant: i === 0 ? 0 : 1 + Math.floor(r(20 + i, 0, 1.999)),
      along: (slot + jitter) * 0.92,
      inland: i === 0 ? r(40, 0.35, 0.85) : r(40 + i, 0, 1),
      mirror: r(50 + i, 0, 1) < 0.5,
    });
  }
  const layout = {
    buildings,
    dock: {
      lengthScale: r(2, 0.85, 1.2),
      plankSpacing: Math.round(r(3, 4, 6.5)),
    },
    treeCount: 7 + Math.floor(r(4, 0, 4.999)), // 7..11 of the framing ring
  };
  layoutCache.set(seed, layout);
  return layout;
}

// How far along d a village's clearing suppresses the boreal-forest scatter
// (terrain.js) so buildings aren't drawn underneath a wall of trees. Trees
// still surround the village — see VILLAGE_TREE_LAYOUT below — this just
// stops the dense random forest from also filling the same clearing and
// burying the buildings under it.
const CLEARING_HALF_D = 6;

// A hand-placed ring of pine trees framing the building cluster: behind it
// (deeper inland, reads as "the village backs onto the forest") and along
// its open sides, but clear of every building footprint and clear of the
// dock's own approach lane. Each gets a little per-village jitter (below),
// and villageLayout().treeCount trims how much of the ring is drawn, so no
// two villages get the same treeline.
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

// One sprite per cabin variant, shared across every village; villageLayout
// picks which variant (and whether to mirror it) per building.
const cabinSprites = [0, 1, 2].map(createCabinSprite);
const villageTreeSprites = [0, 1, 2].map(createPineTreeSprite);

// Québec City — a real 1790s colonial capital, not another fur-trade
// village, so it gets its own hand-authored layout instead of
// villageLayout()'s small random cluster: a lot more buildings, spread
// over a much wider stretch of riverbank, in stone rather than log, with a
// church spire rising over the town and a run of fortification wall along
// the water — three cues that (unlike a bigger pile of the same cabins)
// actually read as "this is a real city" from the water. Functionally
// still just scenery for now (see the module comment) — the dock/repair
// shop below works exactly the same as every other village; only what's
// drawn behind it changes.
const stoneSprites = [0, 1, 2].map(createStoneBuildingSprite);
const churchSprite = createChurchSprite();
const rampartSprite = createRampartSprite();

const QUEBEC_CITY_SPAN = 24; // half-width of the town along the riverbank, world units
const QUEBEC_CITY_STONE_COUNT = 14; // vs. villageLayout()'s usual 3-5
const QUEBEC_CITY_RAMPART_SPACING = 4.2; // ≈ the rampart sprite's own drawn width, so segments tile edge to edge

// Positions are given directly in world units (dOffset along the river,
// depth inland from the bank) rather than villageLayout()'s -1..1
// normalized scheme — that scheme assumes a small handful of buildings
// jittered within a few units of the dock, nowhere near the spread a real
// town needs. The sine-based depth/offset variation is deliberate, fixed
// texture (every load looks the same, matching how villageLayout() is
// itself seeded/deterministic), not true randomness.
function buildQuebecCityBuildings() {
  const buildings = [];
  for (let i = 0; i < QUEBEC_CITY_STONE_COUNT; i++) {
    const t = QUEBEC_CITY_STONE_COUNT > 1 ? (i / (QUEBEC_CITY_STONE_COUNT - 1)) * 2 - 1 : 0;
    const dOffset = t * QUEBEC_CITY_SPAN + Math.sin(i * 2.4) * 1.7;
    const depth = 2.0 + ((Math.sin(i * 1.7) + 1) / 2) * 3.4;
    buildings.push({ dOffset, depth, variant: i % stoneSprites.length, mirror: i % 2 === 0 });
  }
  return buildings;
}
const QUEBEC_CITY_BUILDINGS = buildQuebecCityBuildings();

// The church sits deeper inland than the row of houses in front of it —
// this game has no real elevation, so "set back and much taller" is what
// stands in for "up on the bluff, visible over the rooftops."
const QUEBEC_CITY_CHURCH = { dOffset: -3, depth: 6.2 };

function buildQuebecCityRamparts() {
  const ramparts = [];
  for (let d = -QUEBEC_CITY_SPAN - 2; d <= QUEBEC_CITY_SPAN + 2; d += QUEBEC_CITY_RAMPART_SPACING) {
    ramparts.push({ dOffset: d });
  }
  return ramparts;
}
const QUEBEC_CITY_RAMPARTS = buildQuebecCityRamparts();

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
    // Québec City's own clearing has to cover its whole hand-authored
    // spread (QUEBEC_CITY_SPAN, plus the ramparts' own margin past it) —
    // the wilderness forest scatter showing up between rampart segments
    // would rather defeat "walled city," which every other village's much
    // smaller CLEARING_HALF_D was never built to cover.
    const halfD = v.name === 'Québec City' ? QUEBEC_CITY_SPAN + 4 : CLEARING_HALF_D;
    if (v.side === side && Math.abs(d - v.flowDistance) < halfD) return true;
  }
  return false;
}

function dockReach(v) {
  if (v.name === 'Québec City') return QUEBEC_CITY_DOCK_REACH;
  return DOCK_LENGTH * villageLayout(v.seed).dock.lengthScale;
}

function dockWidthZ(v) {
  return v.name === 'Québec City' ? QUEBEC_CITY_DOCK_WIDTH_Z : DOCK_WIDTH_Z;
}

// Exported so game.js can push the canoe back out past the dock's own
// (village-specific) trigger zone when casting off.
export function dockHitZ(v) {
  return v.name === 'Québec City' ? QUEBEC_CITY_DOCK_HIT_Z : DOCK_HIT_Z;
}

// Returns the village whose dock the canoe is currently touching, or null.
export function getDockHit(flowDistance, canoeWorldX) {
  for (const v of VILLAGES) {
    if (Math.abs(flowDistance - v.flowDistance) > dockHitZ(v)) continue;
    const edge = bankEdge(v.flowDistance, v.side);
    const inner = edge - v.side * dockReach(v);
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
  const layout = villageLayout(v.seed);
  const edge = bankEdge(v.flowDistance, v.side);
  const inner = edge - v.side * dockReach(v);
  const z0 = worldDistance - v.flowDistance;

  // Dock: a plank deck with pilings, drawn as an axis-aligned rectangle in
  // world space — valid here because x and z scale to screen independently
  // (no rotation), unlike a real oblique-angle pier.
  const dockWZ = dockWidthZ(v);
  const corners = [
    toScreen(edge, z0 - dockWZ / 2, cameraWorldX),
    toScreen(inner, z0 - dockWZ / 2, cameraWorldX),
    toScreen(inner, z0 + dockWZ / 2, cameraWorldX),
    toScreen(edge, z0 + dockWZ / 2, cameraWorldX),
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
  const plankSpacing = layout.dock.plankSpacing;
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

  const isQuebecCity = v.name === 'Québec City';

  // Buildings and their surrounding trees, merged into one painter's-
  // algorithm pass (sorted so the nearer thing — larger z — draws last, on
  // top) so a tree in front of a cabin actually overlaps it correctly
  // instead of every building drawing over every tree regardless of depth.
  const scenery = isQuebecCity
    ? QUEBEC_CITY_BUILDINGS.map((b) => {
        const d = v.flowDistance + b.dOffset;
        const z = worldDistance - d;
        const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
        return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
      })
    : layout.buildings.map((b) => {
        // along (-1..1) spreads buildings ~±3.4 units along the flow axis;
        // inland (0..1) sets depth from the bank between 1.4 and 4.2 units.
        const d = v.flowDistance + b.along * 3.4;
        const depth = 1.4 + b.inland * 2.8;
        const z = worldDistance - d;
        const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + depth);
        return { z, worldX, sprite: cabinSprites[b.variant % cabinSprites.length], mirror: b.mirror, anchor: 0.85 };
      });

  // The repair shop — always present, always right at the shoreline beside
  // the dock, regardless of the seed above. Same fixed look and position
  // every time (no mirroring/jitter) — a landmark you can count on is the
  // whole point.
  {
    const d = v.flowDistance + REPAIR_SHOP_D_OFFSET;
    const z = worldDistance - d;
    const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + REPAIR_SHOP_DEPTH);
    scenery.push({ z, worldX, sprite: repairShopSprite, mirror: false, anchor: 0.85 });
  }

  if (isQuebecCity) {
    // The church — set back deeper than the row of houses so it reads as
    // rising over them (see QUEBEC_CITY_CHURCH's own comment), and the
    // fortification wall running along the whole river frontage instead of
    // the usual pine-tree treeline — Québec's walls, not a wilderness edge,
    // are what a real 1790s approach would actually show first.
    {
      const d = v.flowDistance + QUEBEC_CITY_CHURCH.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + QUEBEC_CITY_CHURCH.depth);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
    QUEBEC_CITY_RAMPARTS.forEach((r) => {
      const d = v.flowDistance + r.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + 0.6);
      scenery.push({ z, worldX, sprite: rampartSprite, mirror: false, anchor: 0.95 });
    });
  } else {
    VILLAGE_TREE_LAYOUT.slice(0, layout.treeCount).forEach((t, i) => {
      const jitterD = hashRange(vIndex * 41 + i, 601, -0.35, 0.35);
      const jitterDepth = hashRange(vIndex * 41 + i, 602, -0.3, 0.3);
      const d = v.flowDistance + t.dOffset + jitterD;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + t.depth + jitterDepth);
      const sprite = villageTreeSprites[Math.floor(hashRange(vIndex * 41 + i, 603, 0, villageTreeSprites.length))];
      scenery.push({ z, worldX, sprite, anchor: 0.72 });
    });
  }

  scenery.sort((a, b) => a.z - b.z);

  for (const s of scenery) {
    const p = toScreen(s.worldX, s.z, cameraWorldX);
    const dy = p.y - s.sprite.height * s.anchor;
    if (s.mirror) {
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(s.sprite, -s.sprite.width / 2, dy);
      ctx.restore();
    } else {
      ctx.drawImage(s.sprite, p.x - s.sprite.width / 2, dy);
    }
  }
}
