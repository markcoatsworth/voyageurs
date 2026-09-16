import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, braidAt, southIslandAt, BRAID_PERIOD } from './river/path.js';
import { FEATURE_ISLAND_RANGE, SOUTH_ISLAND_RANGE } from './river/islands.js';
import { createWaterTile, createGrassTile, createBankTile, createSandTile } from './tiles.js';
import {
  createPineTreeSprite, createPebbleSprite, createMontRoyalSprite, createWindmillSprite,
  createChurchSprite, createCabinSprite, createSulpicianTowersSprite, createRuinedFortSprite,
  createStoneBuildingSprite,
} from './sprites.js';
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
const montRoyalSprite = createMontRoyalSprite();
const windmillSprite = createWindmillSprite();
const islandChurchSprite = createChurchSprite();
const farmhouseSprites = [0, 1, 2].map(createCabinSprite);
const sulpicianTowersSprite = createSulpicianTowersSprite();
const ruinedFortSprite = createRuinedFortSprite();
const heleneManorSprite = createStoneBuildingSprite(1);

// Fixed scenery for the Island of Montreal (river/islands.js) — hand-placed
// points, not a periodic scatter, since the island itself is baked rather
// than procedural. `fracFromCenter` positions each relative to the
// island's own centerX/halfWidth at that exact d (from braidAt(), which
// resolves to river/islands.js's featureIslandAt() across this span) so
// they sit safely on the landmass regardless of its exact authored shape.
// river/islands.js's surveyed real peak (abeam Verdun/Old Montréal) — see
// its module comment for where these numbers come from.
const MONT_ROYAL_D = 60000 + 2172; // just upstream of the dock (2168), near the real peak (2177.6)
// spriteVariant is a plain fixed index (not hashed) — each point is
// already an explicit, hand-placed coordinate, so which of the three
// near-identical pine sprites it uses is just as authored as where it is.
// Kept clear of local 2140-2196 (Montreal's own MONTREAL_SPAN footprint,
// see villages.js) so a tree never lands on top of a building there.
const ISLAND_TREE_POINTS = [
  { d: 60000 + 2112, fracFromCenter: 0.35, spriteVariant: 0 },
  { d: 60000 + 2125, fracFromCenter: -0.45, spriteVariant: 1 },
  { d: 60000 + 2205, fracFromCenter: 0.5, spriteVariant: 2 },
  { d: 60000 + 2222, fracFromCenter: -0.4, spriteVariant: 0 },
  { d: 60000 + 2255, fracFromCenter: 0.4, spriteVariant: 1 },
  { d: 60000 + 2280, fracFromCenter: -0.55, spriteVariant: 2 },
];

// Three real, surveyed 1790-era landmarks — same projection-onto-the-
// island's-axis method as river/islands.js's shape itself (real
// coordinates run through the same west-tip-to-east-tip axis, converted
// to a local d via the same LAWRENCE_WEST+2102 anchor and 216-unit span).
// All three predate 1790: the Pointe-Claire windmill (built 1709-10 for
// the Sulpician seigneurs, on the south/St. Lawrence shore, still standing
// today); the Church of the Visitation at Sault-au-Récollet (built
// 1749-52, the oldest church still standing on the island, on the north/
// Rivière-des-Prairies shore, at the mission-turned-parish the Sulpicians
// founded there in 1696); and the parish of Lachine (created 1676, right
// where the Lachine Rapids stretch (river/islands.js's LACHINE_RAPIDS_*)
// already sits — the real village the rapids are named for, and the fur
// trade's own departure point west, so it doubles as "why the rapids are
// dangerous right here" flavour.
const WINDMILL_D = 60000 + 2272; // Pointe-Claire windmill, south shore
const SAULT_AU_RECOLLET_D = 60000 + 2174; // church, north shore
const LACHINE_D = 60000 + 2225; // parish, south shore, inside the rapids stretch

// Second research pass, same survey method. Fort de la Montagne (built
// 1685-94 for the Sulpicians; two of its stone towers still stand today)
// sits inland from the immediate waterfront near the mountain's base, not
// right on the shore like the others — placed with a small |fracFromCenter|
// accordingly, just past Mont-Royal itself (MONT_ROYAL_D) so the two
// don't overlap. Longue-Pointe (parish erected 1724) and Pointe-aux-
// Trembles (parish 1674, stone church 1705) are both real south-shore
// villages; Pointe-aux-Trembles' actual church sits close to — but the
// island's true east tip is a further ~28 units past — this model's own
// tapered-to-zero east end (see river/islands.js's comment on why
// Charlemagne, not the literal tip, anchors that end), so it's placed
// right at the edge of this model's taper rather than exactly on the real
// coordinate. Fort Senneville — a real stone fort, burned by American
// troops in 1776, its ruins still standing — sits right at the island's
// actual west tip beside Sainte-Anne-de-Bellevue, which lines up with
// this model's own west tip (TRIGGER_DISTANCE, chasseGalerie.js): a
// fitting last thing to see before the canoe lifts into the Chasse-
// galerie's flight.
const FORT_DE_LA_MONTAGNE_D = 60000 + 2180;
const LONGUE_POINTE_D = 60000 + 2125;
// Nudged from the survey's raw 2106/2313 to 2120/2295 — right at the tips
// the island tapers down to well under a world unit wide (see
// river/islands.js's keyframes), too narrow for a building-sized sprite
// to sit on without mostly overhanging open water; still close enough to
// read as "right near the tip" without that.
const POINTE_AUX_TREMBLES_D = 60000 + 2120;
const FORT_SENNEVILLE_D = 60000 + 2295;

// A scatter of habitant farmhouses along both shores, hand-placed (not
// hashed) the same way as everything else here — by 1790 the seigneury's
// long, narrow "côte" lots lined both banks almost continuously, each
// farmhouse facing the water with its fields behind, which is why these
// sit right at the island's edge (fracFromCenter near +/-1) rather than
// inland like Mont-Royal. Kept clear of Montreal's own MONTREAL_SPAN
// footprint (local 2140-2196, south side only — the north side there is
// fine, see the Sault-au-Récollet marker above) and spaced apart from the
// tree points above so the two scatters read as one settled shoreline
// rather than overlapping clumps.
const FARMHOUSE_POINTS = [
  // South shore (side facing Montreal's own dock)
  { d: 60000 + 2118, fracFromCenter: -0.85, spriteVariant: 0 },
  { d: 60000 + 2132, fracFromCenter: -0.8, spriteVariant: 2 },
  { d: 60000 + 2210, fracFromCenter: -0.85, spriteVariant: 1 },
  { d: 60000 + 2240, fracFromCenter: -0.8, spriteVariant: 0 },
  { d: 60000 + 2260, fracFromCenter: -0.85, spriteVariant: 2 },
  { d: 60000 + 2296, fracFromCenter: -0.8, spriteVariant: 1 },
  { d: 60000 + 2312, fracFromCenter: -0.85, spriteVariant: 0 },
  // North shore (Rivière des Prairies side, Charlemagne's own bank)
  { d: 60000 + 2108, fracFromCenter: 0.85, spriteVariant: 1 },
  { d: 60000 + 2145, fracFromCenter: 0.8, spriteVariant: 2 },
  { d: 60000 + 2160, fracFromCenter: 0.85, spriteVariant: 0 },
  { d: 60000 + 2192, fracFromCenter: 0.8, spriteVariant: 1 },
  { d: 60000 + 2215, fracFromCenter: 0.85, spriteVariant: 2 },
  { d: 60000 + 2245, fracFromCenter: 0.8, spriteVariant: 0 },
  { d: 60000 + 2265, fracFromCenter: 0.85, spriteVariant: 1 },
  { d: 60000 + 2300, fracFromCenter: 0.8, spriteVariant: 2 },
];

// Île Sainte-Hélène's Le Moyne estate — the stone manor house near the
// island's peak (river/islands.js's SAINTE_HELENE_KEYFRAMES), and one of
// its mills on the Sainte-Marie current, placed off toward the tapered end
// so the two don't overlap on this small an island.
const SAINTE_HELENE_MANOR_D = 60000 + 2145;
const SAINTE_HELENE_MILL_D = 60000 + 2151;
// Nuns' Island — worked farmland, so it gets the same habitant-farmhouse
// sprite as the mainland scatter above rather than a distinct building.
const NUNS_ISLAND_FARM_D = 60000 + 2200;

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

// The south islands' near/far edge in screen X at a given row, collapsing
// to the ambient centreline (zero width) wherever southIslandAt() returns
// null — same collapse trick drawBraidIslands/drawWaterFallback already
// use for the main island, so this both draws as a clean lens and, reused
// as a hole boundary in drawWaterFallback, never punches a hole where
// there's no island.
function southIslandInnerX(y, worldDistance, cameraWorldX, side) {
  const d = dAtScreenY(y, worldDistance);
  const south = southIslandAt(d);
  const cx = south ? south.centerX + side * south.halfWidth : centerX(d);
  return toScreenX(cx, cameraWorldX);
}

// Adds one closed loop to whatever path is currently open on ctx — doesn't
// call beginPath() itself, so several loops can be accumulated into one
// path (see drawWaterFallback's evenodd hole-punching, which relies on
// this to add island loops as holes alongside the outer channel loop).
function addLoop(ctx, leftXAt, rightXAt) {
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

function pathBetween(ctx, leftXAt, rightXAt) {
  ctx.beginPath();
  addLoop(ctx, leftXAt, rightXAt);
}

// Draws grass/bank/sand/pebbles/trees — everything except the water
// surface itself. The water is left as a transparent hole in this canvas so
// the WebGL shader layer underneath (waterGL.js) shows through it; when
// that's unavailable, drawWaterFallback() below fills the same hole with a
// flat animated pattern instead.
export function drawBanks(ctx, worldDistance, cameraWorldX, { hideVillages = false, time = 0 } = {}) {
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
  drawSouthIslands(ctx, worldDistance, cameraWorldX);
  drawFeatureIslandScenery(ctx, worldDistance, cameraWorldX);
  drawShorelineStones(ctx, worldDistance, cameraWorldX, riverEdgeX);
  drawTrees(ctx, worldDistance, cameraWorldX);
  if (!hideVillages) drawVillages(ctx, worldDistance, cameraWorldX, time);
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
    // A baked feature island (river/islands.js) isn't on this periodic
    // grid — its own scenery pass (drawFeatureIslandScenery) handles it —
    // so skip any cycle braidAt() would resolve to it instead of a real
    // small procedural island.
    if (braidCenterD >= FEATURE_ISLAND_RANGE[0] && braidCenterD <= FEATURE_ISLAND_RANGE[1]) continue;
    const braid = braidAt(braidCenterD);
    if (!braid) continue;
    const z = worldDistance - braidCenterD;
    const y = CANOE_SCREEN_Y + z * PIXELS_PER_UNIT;
    const screenX = toScreenX(braid.centerX, cameraWorldX);
    const sprite = treeSprites[Math.floor(hashRange(cycle, 501, 0, treeSprites.length))];
    ctx.drawImage(sprite, screenX - sprite.width / 2, y - sprite.height * 0.72);
  }
}

// Île Sainte-Hélène and Nuns' Island (world/river/path.js's southIslandAt,
// which resolves to river/islands.js's southIslandAt() across
// SOUTH_ISLAND_RANGE) — a second split nested inside the main island's own
// south sub-channel. Same lens sand-fill technique as drawBraidIslands,
// drawn after it so this land sits on top of (rather than being punched
// out by) anything already painted for the main channel/island.
function drawSouthIslands(ctx, worldDistance, cameraWorldX) {
  const pat = ensurePatterns(ctx);
  ctx.fillStyle = pat.sand;
  pathBetween(ctx, (y) => southIslandInnerX(y, worldDistance, cameraWorldX, -1), (y) => southIslandInnerX(y, worldDistance, cameraWorldX, 1));
  ctx.fill();
}

// Mont-Royal + a handful of fixed trees on the Island of Montreal (see the
// ISLAND_TREE_POINTS/MONT_ROYAL_D comment above) — drawn after the sand
// fill above so they sit on top of the landmass, not painted over by it.
function drawFeatureIslandScenery(ctx, worldDistance, cameraWorldX) {
  // Painter's algorithm — farthest (smallest z) first — same reasoning as
  // villages.js's drawOneVillage: with this many fixed points now (farms,
  // churches, the windmill, trees, Mont-Royal) two can land close enough
  // in view for draw order to actually matter, unlike the handful this
  // started with.
  const candidates = [];
  const add = (d, fracFromCenter, sprite, anchorFrac) => {
    const braid = braidAt(d);
    if (!braid) return; // outside the island's own span at this d
    const worldX = braid.centerX + fracFromCenter * braid.halfWidth;
    candidates.push({ z: worldDistance - d, worldX, sprite, anchorFrac });
  };
  // Same idea as add() above, but framed against southIslandAt() — Île
  // Sainte-Hélène/Nuns' Island's own coordinate system, not the main
  // island's.
  const addSouth = (d, fracFromCenter, sprite, anchorFrac) => {
    const south = southIslandAt(d);
    if (!south) return;
    const worldX = south.centerX + fracFromCenter * south.halfWidth;
    candidates.push({ z: worldDistance - d, worldX, sprite, anchorFrac });
  };

  add(MONT_ROYAL_D, 0, montRoyalSprite, 0.62);
  add(WINDMILL_D, 0.88, windmillSprite, 0.9);
  add(SAULT_AU_RECOLLET_D, 0.85, islandChurchSprite, 0.9);
  add(LACHINE_D, -0.85, islandChurchSprite, 0.9);
  add(FORT_DE_LA_MONTAGNE_D, -0.3, sulpicianTowersSprite, 0.85);
  add(LONGUE_POINTE_D, -0.6, islandChurchSprite, 0.9);
  add(POINTE_AUX_TREMBLES_D, -0.7, islandChurchSprite, 0.9);
  add(FORT_SENNEVILLE_D, 0.75, ruinedFortSprite, 0.8);
  for (const p of ISLAND_TREE_POINTS) add(p.d, p.fracFromCenter, treeSprites[p.spriteVariant], 0.72);
  for (const p of FARMHOUSE_POINTS) add(p.d, p.fracFromCenter, farmhouseSprites[p.spriteVariant], 0.85);
  addSouth(SAINTE_HELENE_MANOR_D, 0, heleneManorSprite, 0.85);
  addSouth(SAINTE_HELENE_MILL_D, -0.7, windmillSprite, 0.9);
  addSouth(NUNS_ISLAND_FARM_D, 0.2, farmhouseSprites[1], 0.85);

  candidates.sort((a, b) => a.z - b.z);
  for (const c of candidates) {
    const y = CANOE_SCREEN_Y + c.z * PIXELS_PER_UNIT;
    const x = toScreenX(c.worldX, cameraWorldX);
    ctx.drawImage(c.sprite, x - c.sprite.width / 2, y - c.sprite.height * c.anchorFrac);
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
  // The main island's own near edge when one exists at this row, or the
  // ambient centreline when it doesn't — not the *outer* edge, which used
  // to be the no-island fallback here and made both halves collapse to
  // zero width (nothing ever got filled) anywhere outside a small braid
  // island's own ~16-unit span. Using the centreline instead means a
  // single loop spanning both stretches doesn't jump between two very
  // different curves and self-intersect (the white-band artifact this
  // used to draw right at a big island's tapered tip) — because a baked
  // feature island's offset/half-width both reach 0 together at its
  // tapered ends (river/islands.js), the island-edge and centreline
  // values agree exactly right where the island starts or ends.
  const islandX = (y, side) => {
    const d = dAtScreenY(y, worldDistance);
    const braid = braidAt(d);
    const cx = braid ? braid.centerX + side * braid.halfWidth : centerX(d);
    return toScreenX(cx, cameraWorldX);
  };

  const scroll = (worldDistance * PIXELS_PER_UNIT * 0.6) % 16;
  if (pat.water.setTransform) pat.water.setTransform(new DOMMatrix().translate(0, scroll));
  ctx.fillStyle = pat.water;
  // One path, three loops, evenodd fill: the outer channel loop, minus the
  // main island loop, minus the south islands' loop — each hole loop
  // collapses to a zero-area sliver at the ambient centreline wherever
  // that island isn't present (see islandX/southIslandInnerX), so nesting
  // the south islands' hole inside the main island's south sub-channel
  // just works without the two-pass split-by-side logic this used to need
  // (which only ever knew how to punch one island, not a nested second).
  ctx.beginPath();
  addLoop(ctx, (y) => edgeX(y, -1), (y) => edgeX(y, 1));
  addLoop(ctx, (y) => islandX(y, -1), (y) => islandX(y, 1));
  addLoop(ctx, (y) => southIslandInnerX(y, worldDistance, cameraWorldX, -1), (y) => southIslandInnerX(y, worldDistance, cameraWorldX, 1));
  ctx.fill('evenodd');
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
