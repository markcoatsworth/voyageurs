// The on-foot village scene: a small, fixed (non-scrolling) local area with
// a few buildings and a dock back to the water. Deliberately simple for
// now — free 4-directional walking and building collision, no interaction
// yet (see the module comment in game.js for the planned shops).
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/config.js';
import { createGrassTile, createWaterTile, createSandTile } from './tiles.js';
import {
  createCabinSprite, createWalkerSprite, createCanoeSprite, createPineTreeSprite, createRepairShopSprite, createTraderSprite,
  createStoneBuildingSprite, createChurchSprite, createRampartSprite, createGunShopSprite, createGunsmithSprite,
  createSulpicianTowersSprite, createMontRoyalSprite, createWindmillSprite,
} from './sprites.js';
import { villageLayout } from './villages.js';
import { hashRange } from '../shared/hash.js';

const WALK_SPEED = 62; // px/sec, in this scene's own fixed pixel space

const WATER_TOP = CANVAS_HEIGHT - 40;
const DOCK_HALF_W = 20;
const DOCK_TOP = WATER_TOP - 12;
// The dock always sits at the horizontal centre of whichever world is
// active — CANVAS_WIDTH itself for every ordinary single-screen village
// (so dockX0/dockX1(CANVAS_WIDTH) reproduce the old fixed DOCK_X0/DOCK_X1
// exactly), or MONTREAL_WORLD_WIDTH below for Montreal's own scrollable
// scene. Functions, not constants, since which world is active is
// per-visit state (see enter()), not fixed at module load.
const dockX0 = (worldWidth) => worldWidth / 2 - DOCK_HALF_W;
const dockX1 = (worldWidth) => worldWidth / 2 + DOCK_HALF_W;

// Montreal alone gets a wider world than the fixed CANVAS_WIDTH every
// other village's on-foot scene is confined to — real 1790s Montreal was
// a genuine small city, not a one-street dock landing, and a single
// 320px screen never had room for that. The camera (enter()/draw())
// follows the player and scrolls horizontally within this width; every
// other village keeps worldWidth === CANVAS_WIDTH, which pins the camera
// at 0 always (see its clamp in draw()) and reproduces the exact old
// non-scrolling behaviour with no special-casing needed anywhere else.
const MONTREAL_WORLD_WIDTH = 640;

// Montreal also gets room to the *north* (inland, toward Mont-Royal) —
// negative y, extending up from the old world's y=0 top edge, rather than
// touching WATER_TOP/DOCK_TOP or any existing building's y at all: the
// water stays exactly where it's always been at the world's south edge,
// and this just opens up new ground beyond the old northern boundary for
// Mont-Royal and its own approach to actually be walked into instead of
// sitting clipped against the top of a screen that could never scroll.
// worldTop is 0 (not negative) for every other village, which — like
// MONTREAL_WORLD_WIDTH above — collapses the vertical camera clamp to
// [0, 0] and reproduces the old fixed framing exactly. Pushed out again
// (from -180) to make real room for a Mont-Royal district — Fort de la
// Montagne, its farms and mill, and the rural road up to them — around
// and beyond the mountain itself, not just the mountain alone.
const MONTREAL_WORLD_TOP = -280;

// Anchor is the point where each building's front (door) sits; the
// collision box is a simplified footprint under the sprite's walls, not
// its wider overhanging roof. The cluster is generated from the same
// per-village descriptors the river view uses (villages.js villageLayout),
// mapped into this scene's fixed pixel space, so the layout you walk
// around matches the one you saw from the water.
function buildingsFor(seed) {
  return villageLayout(seed).buildings.map((b) => {
    const big = b.variant === 0;
    // Keep every building at least 20px off the vertical centre line so the
    // dock lane out of the scene is never walled off.
    const dir = b.along >= 0 ? 1 : -1;
    const anchorX = Math.round(
      Math.max(52, Math.min(CANVAS_WIDTH - 52, CANVAS_WIDTH / 2 + dir * (20 + Math.abs(b.along) * 82))),
    );
    return {
      variant: b.variant,
      mirror: b.mirror,
      anchorX,
      anchorY: Math.round(82 + b.inland * 54), // 82..136
      footHalfW: big ? 12 : 9,
      footHeight: big ? 22 : 17,
    };
  });
}

// Québec City's own on-foot layout — hand-placed, not generated from
// villageLayout() like every other village, since a real 1790s colonial
// capital needs a lot more buildings than that small procedural cluster
// ever produces, in stone rather than log (see sprites.js). Two rows
// (kind: 'stone') plus one church (kind: 'church') set back between them,
// laid out to leave the dock lane (DOCK_X0..DOCK_X1) and the repair
// shop/trader's own spot clear, same as buildingsFor()'s cluster has to.
const QUEBEC_CITY_ONFOOT_BUILDINGS = [
  // back row
  { kind: 'stone', x: 34, y: 88, variant: 0, mirror: false },
  { kind: 'stone', x: 78, y: 92, variant: 1, mirror: true },
  { kind: 'stone', x: 122, y: 86, variant: 2, mirror: false },
  { kind: 'stone', x: 198, y: 90, variant: 0, mirror: true },
  { kind: 'stone', x: 242, y: 94, variant: 1, mirror: false },
  { kind: 'stone', x: 286, y: 88, variant: 2, mirror: true },
  // front row, closer to shore
  { kind: 'stone', x: 34, y: 150, variant: 1, mirror: false },
  { kind: 'stone', x: 78, y: 154, variant: 2, mirror: true },
  { kind: 'stone', x: 222, y: 150, variant: 0, mirror: false },
  { kind: 'stone', x: 266, y: 148, variant: 1, mirror: true },
  // the church, set back behind the dock — the tallest thing in the scene,
  // same "rises over the row in front of it" effect as the river view
  { kind: 'church', x: 160, y: 112, mirror: false },
];

const TROIS_RIVIERES_ONFOOT_BUILDINGS = [
  // back row - 6 buildings
  { kind: 'stone', x: 40, y: 86, variant: 0, mirror: false },
  { kind: 'stone', x: 90, y: 90, variant: 1, mirror: true },
  { kind: 'stone', x: 140, y: 88, variant: 2, mirror: false },
  { kind: 'stone', x: 180, y: 92, variant: 0, mirror: true },
  { kind: 'stone', x: 230, y: 86, variant: 1, mirror: false },
  { kind: 'stone', x: 280, y: 90, variant: 2, mirror: true },
  // front row - 6 buildings closer to shore
  { kind: 'stone', x: 30, y: 148, variant: 1, mirror: false },
  { kind: 'stone', x: 80, y: 152, variant: 2, mirror: true },
  { kind: 'stone', x: 130, y: 150, variant: 0, mirror: false },
  { kind: 'stone', x: 190, y: 154, variant: 1, mirror: true },
  { kind: 'stone', x: 240, y: 150, variant: 2, mirror: false },
  { kind: 'stone', x: 290, y: 148, variant: 0, mirror: true },
  // Ursuline convent, set back from the waterfront
  { kind: 'church', x: 160, y: 100, mirror: false },
];

// Montréal's on-foot layout — rebuilt from an actual period source: Thomas
// Jefferys' 1738 "Plan of the Town and Fortifications of Montreal or Ville
// Marie in Canada" (dropped into the repo as montreal-1700s.jpg — not
// committed, a reference image only), which shows the exact walled town
// still standing through the 1790s (the walls came down 1804-1817) with
// every institution named and placed. West-to-east order below follows the
// map's own real layout: the Récollets' convent and the Seminary/Parish
// Church cluster toward the west end, the Market Place at the wharf
// (world centre, same spot the dock already anchors to), the Parade
// ground and the Governor's Palace east-center, the Jesuits' church and
// convent (the map's own largest garden) further east, and the Arsenal/
// canoe yard and the Fort right at the east end, by the gate. Two rows —
// back (inland, near the wall) and front (waterfront, along the real Rue
// Saint-Paul) — same abstraction as before, now populated with what was
// actually there instead of a generic repeating cluster.
const MONTREAL_ONFOOT_BUILDINGS = [
  // --- back row (inland, near the town wall) ---
  // Récollets Convent — west end, by the real Récollets Gate. Two
  // buildings; its own garden plot is drawn separately (MONTREAL_GARDEN_PLOTS).
  { kind: 'stone', x: 40, y: 74, variant: 0, mirror: false },
  { kind: 'stone', x: 90, y: 78, variant: 1, mirror: true },
  // The Vieux Séminaire de Saint-Sulpice (built 1685-94, still Montreal's
  // oldest standing building) and the Parish Church next to it — the
  // map shows both west of the Market Place, not centred on it (an
  // earlier pass here had the church facing the square head-on; the map
  // puts the real Parish Church further west than that).
  { kind: 'seminary', x: 150, y: 82, mirror: false },
  { kind: 'church', x: 230, y: 92, mirror: false },
  // The Nunnery Hospital (Hôtel-Dieu, run by the Religieuses
  // Hospitalières) — between the church and the Market Place.
  { kind: 'stone', x: 290, y: 76, variant: 2, mirror: false },
  { kind: 'stone', x: 390, y: 80, variant: 0, mirror: true },
  { kind: 'stone', x: 440, y: 74, variant: 1, mirror: false },
  // Monsieur de Vaudreuil's — the Governor General's Palace, marked C on
  // the map, near the Parade — the grandest house in town, even if the
  // sprite itself is the same stone building every other house here uses.
  { kind: 'stone', x: 490, y: 78, variant: 2, mirror: true },
  // The Jesuits' Church, Convent and Gardens — the map's own single
  // largest walled garden, east end. A second real church (not a
  // duplicate sprite mistake — Montreal genuinely had both a parish
  // church and a separate Jesuit church at once).
  { kind: 'church', x: 550, y: 92, mirror: true },
  { kind: 'stone', x: 600, y: 76, variant: 0, mirror: false },

  // --- front row (waterfront, Rue Saint-Paul) ---
  { kind: 'stone', x: 30, y: 150, variant: 1, mirror: false },
  { kind: 'stone', x: 80, y: 154, variant: 2, mirror: true },
  { kind: 'stone', x: 130, y: 152, variant: 0, mirror: false },
  { kind: 'stone', x: 180, y: 150, variant: 1, mirror: true },
  { kind: 'stone', x: 230, y: 154, variant: 2, mirror: false },
  // (gap here is the Market Place itself, MONTREAL_SQUARE, at the world's
  // own centre — same spot the map's own Market Place sits, right at
  // the wharf.)
  { kind: 'stone', x: 370, y: 152, variant: 0, mirror: true },
  { kind: 'stone', x: 420, y: 150, variant: 1, mirror: false },
  // (gap here is The Parade, MONTREAL_PARADE — the town's open drill
  // ground, drawn as packed earth rather than a building row.)
  // Monsieur de Longueuil's House (D on the map) and a small chapel
  // beside it, near the east end.
  { kind: 'stone', x: 575, y: 154, variant: 2, mirror: true },
  // The Arsenal and Yard for Canoes & Battoes, right by the east gate —
  // the gun shop keeps its real gameplay job (walk up to it for the
  // pistol, see game.js's acquirePistol / the trigger in update() below)
  // but now sits where an arsenal actually would on the map, not
  // arbitrarily next to the dock.
  { kind: 'gunshop', x: 615, y: 152, mirror: false },

  // The Mont-Royal district — north of the built-up town, in the field
  // around the mountain itself (MONTREAL_WORLD_TOP opened this ground up;
  // see its own comment). By 1790 this was genuinely rural: Sulpician
  // mission land and scattered habitant farms, not more city blocks.
  //
  // Fort de la Montagne (built 1685-94, the same years and the same
  // Sulpician builders as the Vieux Séminaire downtown — hence reusing
  // its twin-tower sprite here too, which is architecturally honest, not
  // just convenient) was a real fortified mission at the mountain's own
  // base, built to house and convert Indigenous converts; two of its
  // stone towers still stand today, preserved inside the Grand Séminaire.
  // West of the mountain, matching its real relative position.
  { kind: 'seminary', x: 60, y: 0, mirror: false },
  // One of the Sulpicians' own mills, close to their mission — real
  // seigneurial mills dotted the island (see river/islands.js's
  // Pointe-Claire windmill), and the order that built Fort de la
  // Montagne operated others near it.
  { kind: 'windmill', x: 100, y: -50, mirror: false },
  // Scattered habitant farmhouses on the mountain's lower slopes and the
  // open ground beyond it — the same log-cabin sprite (not the urban
  // stone kind) the waterfront farms in the river view itself use.
  { kind: 'cabin', x: 460, y: -30, variant: 0, mirror: false },
  { kind: 'cabin', x: 530, y: -75, variant: 1, mirror: true },
  { kind: 'cabin', x: 380, y: -115, variant: 2, mirror: false },
  { kind: 'cabin', x: 170, y: -145, variant: 0, mirror: true },
  { kind: 'cabin', x: 555, y: -165, variant: 1, mirror: false },
];

// Montréal's streets, in the scene's own (wider) world pixel space —
// grey brick, drawn on the ground under everything else (drawBrickRoad(),
// the isMontreal branch in draw()). MONTREAL_SQUARE widens the two
// streets' crossing into a real plaza at the world's own centre, the
// same spot the dock already anchors to — *The Market Place*, per the
// map's own label, right at the wharf (not Place d'Armes, which this
// same map doesn't actually label here; the church/seminary sit west of
// this square now, not facing it — see MONTREAL_ONFOOT_BUILDINGS).
// Drawn before the two road strips, so their narrower arms paint cleanly
// over its edges rather than leaving a seam.
const MONTREAL_ROAD_V = { x: 307, y: 96, w: 26, h: DOCK_TOP - 96 };
const MONTREAL_ROAD_H = { y: 104, h: 22 };
const MONTREAL_SQUARE = { x: 280, y: 96, w: 80, h: 34 };
const MONTREAL_SQUARE_CENTER = { x: MONTREAL_SQUARE.x + MONTREAL_SQUARE.w / 2, y: MONTREAL_SQUARE.y + MONTREAL_SQUARE.h / 2 };

// The Parade — the town's own open drill ground, east of the Market
// Place, near the Governor's Palace, per the map. Packed earth
// (drawDirtPath), not cobbled — a military ground, not a market square.
const MONTREAL_PARADE = { x: 450, y: 138, w: 90, h: 30 };

// The Récollets' and the Jesuits' own walled gardens — the map's two
// largest cultivated plots by far, flanking the town at opposite ends.
// Drawn as a distinct hatched-green ground texture (drawGardenPlot),
// not just more plain grass, right behind each order's own buildings.
const MONTREAL_GARDEN_PLOTS = [
  { x: 15, y: 100, w: 110, h: 30 }, // Récollets Convent Gardens, west end
  { x: 520, y: 100, w: 110, h: 30 }, // The Jesuits' Gardens, east end
];

// The rural track up to the Mont-Royal district (drawDirtPath, not the
// town's cut-stone streets) — picks up right where the brick MONTREAL_ROAD_V
// ends (its own y: 96, the north edge of the built-up town) and continues
// north into the field, then a short spur west to Fort de la Montagne.
const MONTREAL_DIRT_PATH_V = { x: 296, y: -140, w: 24, h: 236 };
const MONTREAL_DIRT_PATH_SPUR = { x: 60, y: -22, w: 250, h: 14 };

// The landward fortification wall, as a fixed backdrop strip along the very
// top of the scene — behind the back row of buildings, same "wall set back
// behind the town, not along the water" read as the river view's own
// QUEBEC_CITY_RAMPART_DEPTH. Tiled edge to edge across the fixed 320px
// scene width using the sprite's own drawn width, same tiling approach as
// villages.js's river-view wall. Montreal was itself a walled city right
// through the 1790s (the walls came down 1804-1817), so it gets the same
// backdrop as Quebec City rather than the open-forest treeline every other
// village has.
const WALL_TILE_W = 64;
const CITY_WALL_Y = 6;
const CITY_WALL_TILES = Math.ceil(CANVAS_WIDTH / WALL_TILE_W) + 1;

function buildingsForQuebecCity() {
  return QUEBEC_CITY_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'church' ? 12 : 13,
    footHeight: b.kind === 'church' ? 26 : 24,
  }));
}

function buildingsForTroisRivieres() {
  return TROIS_RIVIERES_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'church' ? 12 : 13,
    footHeight: b.kind === 'church' ? 26 : 24,
  }));
}

function buildingsForMontreal() {
  return MONTREAL_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    isGunShop: b.kind === 'gunshop',
    footHalfW: b.kind === 'seminary' ? 24 : b.kind === 'windmill' ? 8 : b.kind === 'church' || b.kind === 'gunshop' ? 12 : 13,
    footHeight: b.kind === 'seminary' ? 18 : b.kind === 'windmill' ? 14 : b.kind === 'church' ? 26 : b.kind === 'gunshop' ? 20 : 24,
  }));
}

// Purely decorative — drawn behind the buildings/player, clear of the
// walkable area and the dock — so the clearing reads as cut out of the
// same forest seen from the river, not a bare field. Positions are fixed;
// only the per-tree species is seeded, for a little colour variety.
const TREE_SPOTS = [
  { x: 36, y: 16 }, { x: 118, y: 10 }, { x: 292, y: 14 },
  { x: 12, y: 64 }, { x: 10, y: 150 },
  { x: 308, y: 58 }, { x: 312, y: 158 },
  { x: 44, y: 156 }, { x: 40, y: 96 },
  { x: 262, y: 150 }, { x: 276, y: 92 },
  { x: 196, y: 96 },
];
// Montreal's own world is MONTREAL_WORLD_WIDTH (640) wide, twice
// TREE_SPOTS' native 320 — reuse that same spot pattern for the near
// half and mirror it (x -> 640-x, so it isn't just a repeated copy) for
// the far half, rather than hand-placing a whole second set. TREE_SPOTS'
// own (312, 158) sits near the *old* 320-wide screen's right edge — fine
// framing there, but at x=312 in the new 640-wide world that's now right
// next to the dock/square at the world's centre (320) instead, and its
// mirror lands at 328, right beside it: two pines planted almost on top
// of the dock. Drop any *front-row* spot (y > 100 — the back/top framing
// trees near Mont-Royal and the church stay untouched) within
// DOCK_CLEARANCE_X of the world centre, both before and after mirroring,
// rather than special-casing that one coordinate, so the same fix holds
// if this list changes later.
const DOCK_CLEARANCE_X = 40;
function clearOfDock(spots) {
  return spots.filter((t) => t.y <= 100 || Math.abs(t.x - MONTREAL_WORLD_WIDTH / 2) >= DOCK_CLEARANCE_X);
}
// Frames the new northern edge of Montreal's own taller world
// (MONTREAL_WORLD_TOP) the same way TREE_SPOTS already frames the old
// screen's top edge — a scattered line near the true boundary, not a
// hard wall, so it reads as the clearing giving way to forest again once
// you've walked far enough past Mont-Royal.
const MONTREAL_NORTH_TREE_SPOTS = [
  { x: 30, y: -266 }, { x: 100, y: -272 }, { x: 175, y: -264 }, { x: 340, y: -270 },
  { x: 420, y: -266 }, { x: 495, y: -272 }, { x: 565, y: -264 }, { x: 615, y: -270 },
];
const MONTREAL_TREE_SPOTS = [
  ...clearOfDock([...TREE_SPOTS, ...TREE_SPOTS.map((t) => ({ x: MONTREAL_WORLD_WIDTH - t.x, y: t.y }))]),
  ...MONTREAL_NORTH_TREE_SPOTS,
];
function treesFor(seed, spots = TREE_SPOTS) {
  return spots.map((t, i) => ({
    ...t,
    variant: Math.floor(hashRange(seed, 700 + i, 0, 2.999)),
  }));
}

// The repair shop — always present, in the exact same spot *relative to
// the dock* regardless of seed or which world is active, so it's a
// landmark you can count on finding beside the dock every time you step
// ashore (see the matching fixed placement in villages.js's river view).
// A function of worldWidth (not a constant) for the same reason
// dockX0/dockX1 are: Montreal's dock sits at a different absolute
// position than every other village's. Kept clear of the dock lane and
// low/close to shore, in a different anchorY band than the procedural
// cluster above, so it never fights with a randomly-placed cabin for the
// same footprint.
function repairShopFor(worldWidth) {
  return {
    isRepairShop: true,
    mirror: false,
    anchorX: dockX0(worldWidth) - 25,
    anchorY: WATER_TOP - 20,
    footHalfW: 12,
    footHeight: 22,
  };
}

// The trader who runs the repair shop — standing just outside its door,
// clear of the shop's own footprint and the dock lane, so walking up to
// them is unambiguous. Worked out from the repair shop's own (worldWidth-
// dependent) position on enter(), same reasoning as the gunsmith below.
// Not a solid obstacle (see isWalkable) — the trade triggers from
// proximity alone, so blocking movement would just make lining up with
// them more fiddly for no benefit.
function traderPosFor(repairShop) {
  return { x: repairShop.anchorX + 19, y: repairShop.anchorY + 5 };
}
const TRADER_TRIGGER_RADIUS = 16;

// Montréal only: the gunsmith stands a little forward of the gun shop's
// door, shifted just off-centre so the forge glow (to his left) and the
// musket rack (to his right) both stay visible past him. Walking this close
// is the whole interaction — same "proximity alone, once per approach"
// trigger as the repair trader.
const GUNSMITH_OFFSET = { x: 4, y: 11 };
const GUNSMITH_TRIGGER_RADIUS = 20;

function playerStartFor(worldWidth) {
  return { x: worldWidth / 2, y: WATER_TOP - 10 };
}
const PLAYER_HALF = 4; // simple circular-ish collision radius against buildings

let patterns = null;
function ensurePatterns(ctx) {
  if (patterns) return patterns;
  patterns = {
    grass: ctx.createPattern(createGrassTile(), 'repeat'),
    water: ctx.createPattern(createWaterTile(), 'repeat'),
    sand: ctx.createPattern(createSandTile(), 'repeat'),
  };
  return patterns;
}

const cabinSprites = [0, 1, 2].map(createCabinSprite);
const stoneSprites = [0, 1, 2].map(createStoneBuildingSprite);
const churchSprite = createChurchSprite();
const rampartSprite = createRampartSprite();
const seminarySprite = createSulpicianTowersSprite();
const montRoyalSprite = createMontRoyalSprite();
const montrealWindmillSprite = createWindmillSprite();
const repairShopSprite = createRepairShopSprite();
const gunShopSprite = createGunShopSprite();
const traderSprite = createTraderSprite();
const gunsmithSprite = createGunsmithSprite();
const walkerFrames = [createWalkerSprite(false), createWalkerSprite(true)];
const parkedCanoeSprite = createCanoeSprite(1);
const treeSprites = [0, 1, 2].map(createPineTreeSprite);

// The fraction of a tree sprite's height that sits above its ground point —
// the draw pass anchors trees at `t.y - height * this`, and the tree/building
// overlap test below has to use the same number to match what's on screen.
const TREE_DRAW_ANCHOR = 0.72;

function buildingSprite(b) {
  if (b.isRepairShop) return repairShopSprite;
  if (b.isGunShop) return gunShopSprite;
  if (b.kind === 'church') return churchSprite;
  if (b.kind === 'seminary') return seminarySprite;
  if (b.kind === 'windmill') return montrealWindmillSprite;
  if (b.kind === 'stone') return stoneSprites[b.variant % stoneSprites.length];
  return cabinSprites[b.variant % cabinSprites.length];
}

// On-screen rectangle actually covered by a building's sprite — wider and
// taller than its collision footprint (buildingBox): roof overhang, full
// wall height, the works. Mirroring flips the sprite in place, so the x
// extent is unchanged. Matches the draw pass's own `top` math.
function buildingSpriteRect(b) {
  const s = buildingSprite(b);
  return {
    x0: b.anchorX - s.width / 2,
    x1: b.anchorX + s.width / 2,
    y0: b.anchorY - s.height + 6,
    y1: b.anchorY + 6,
  };
}

function treeSpriteRect(t) {
  const s = treeSprites[t.variant];
  const top = t.y - s.height * TREE_DRAW_ANCHOR;
  return { x0: t.x - s.width / 2, x1: t.x + s.width / 2, y0: top, y1: top + s.height };
}

function rectsIntersect(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// The framing treeline is one fixed set of spots (TREE_SPOTS) sized for the
// small procedural building cluster; the hand-authored towns (Montréal,
// Trois-Rivières) pack far more building into the same scene, so several of
// those spots end up sitting on top of a wall or roof. Drop any tree whose
// sprite overlaps any building's — the clearing should read as cut *around*
// the town, not have pines growing through the rooftops.
function treesClearOfBuildings(trees, buildings) {
  const boxes = buildings.map(buildingSpriteRect);
  return trees.filter((t) => {
    const tr = treeSpriteRect(t);
    return !boxes.some((box) => rectsIntersect(tr, box));
  });
}

function buildingBox(b) {
  return {
    x0: b.anchorX - b.footHalfW,
    x1: b.anchorX + b.footHalfW,
    y0: b.anchorY - b.footHeight,
    y1: b.anchorY,
  };
}

function overlapsBuilding(buildings, x, y) {
  for (const b of buildings) {
    const box = buildingBox(b);
    if (x + PLAYER_HALF > box.x0 && x - PLAYER_HALF < box.x1 && y + PLAYER_HALF > box.y0 && y - PLAYER_HALF < box.y1) {
      return true;
    }
  }
  return false;
}

// On land the player can walk anywhere within the scene margins (the
// active world's own width, not always CANVAS_WIDTH — see worldWidth);
// over the water band they're restricted to the dock's width, i.e.
// walking the plank back out to the boat rather than into the river.
function isWalkable(buildings, x, y, worldWidth, worldTop) {
  if (x < 10 || x > worldWidth - 10 || y < worldTop + 10 || y > CANVAS_HEIGHT - 4) return false;
  if (y > WATER_TOP && (x < dockX0(worldWidth) || x > dockX1(worldWidth))) return false;
  return !overlapsBuilding(buildings, x, y);
}

// A flat grey-brick strip — a placeholder street. Bricks are laid on a
// fixed screen-space grid (not relative to x/y) so where two roads cross,
// their courses line up instead of clashing.
function drawBrickRoad(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#8f9094';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#74757a';
  const bw = 12, bh = 6;
  for (let i = 0, ry = Math.floor(y / bh) * bh; ry < y + h; i++, ry += bh) {
    ctx.fillRect(x, ry, w, 1); // mortar course
    const off = (i % 2) * (bw / 2); // running-bond stagger
    for (let bx = Math.floor(x / bw) * bw + off; bx < x + w; bx += bw) {
      ctx.fillRect(bx, ry, 1, bh);
    }
  }
  ctx.restore();
}

// A worn dirt track — the rural road up to the Mont-Royal district
// (drawDirtPath's own call site), not the town's cut-stone brick streets
// (drawBrickRoad above). Plain packed earth with two faint wheel ruts,
// rather than a coursed pattern — a farm track, not a paved street.
function drawDirtPath(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#8a7050';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#79603f';
  ctx.fillRect(x + w * 0.22, y, w * 0.14, h);
  ctx.fillRect(x + w * 0.64, y, w * 0.14, h);
  ctx.restore();
}

// A walled, cultivated garden plot (Récollets/Jesuits — MONTREAL_GARDEN_PLOTS)
// — a hatched pattern of little furrow-rows on a slightly richer green than
// plain grass, plus a plain fence line, so it reads as tended ground
// rather than more lawn. Purely decorative, like drawDirtPath/drawBrickRoad
// — not solid, the player can walk straight through it.
function drawGardenPlot(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#3f6b34';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2e4f27';
  ctx.lineWidth = 1;
  for (let ry = y + 4; ry < y + h; ry += 6) {
    ctx.beginPath();
    ctx.moveTo(x + 2, ry);
    ctx.lineTo(x + w - 2, ry);
    ctx.stroke();
  }
  ctx.strokeStyle = '#5c4a30';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

// The market well at the centre of the Market Place — a plain stone-ringed
// well with a small shingled roof, the kind of modest period fixture a
// real colonial market square would have rather than a monument (the
// actual statue there today postdates 1790 by over a century). Purely
// decorative, like the treeline — not solid, so it never blocks the
// player the way a building does.
function drawMarketWell(ctx, cx, cy) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // stone ring
  ctx.fillStyle = '#6b6259';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#847a6d';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a241d';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // two posts + a small shingled roof over the well
  ctx.fillStyle = '#4a3423';
  ctx.fillRect(cx - 7, cy - 14, 2, 14);
  ctx.fillRect(cx + 5, cy - 14, 2, 14);
  ctx.fillStyle = '#5c3f2a';
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - 13);
  ctx.lineTo(cx, cy - 20);
  ctx.lineTo(cx + 9, cy - 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createVillageScene() {
  let strideTimer = 0;
  let strideFrame = 0;
  let facingLeft = false;
  let worldWidth = CANVAS_WIDTH;
  let worldTop = 0;
  let repairShop = repairShopFor(worldWidth);
  let buildings = [...buildingsFor(0), repairShop];
  let trees = treesFor(0);
  let isQuebecCity = false;
  let isTroisRivieres = false;
  let isMontreal = false;
  let wasNearTrader = false;
  let traderPos = traderPosFor(repairShop);
  let reboardZone = { x0: dockX0(worldWidth), x1: dockX1(worldWidth), y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };
  // The gunsmith who stands outside the Montréal gun shop — his scene
  // position, worked out from the gun shop building on enter(). null in
  // every other village (no gun shop, nobody to draw or range-check).
  let gunsmithPos = null;
  let wasNearGunsmith = false;
  const player = { x: worldWidth / 2, y: WATER_TOP - 10 };
  // How far the camera has scrolled — always {0, 0} when worldWidth ===
  // CANVAS_WIDTH and worldTop === 0 (every village but Montreal), which is
  // exactly what reproduces the old fixed-screen behaviour with no
  // special-casing needed in draw() beyond the two clamps below.
  const camera = { x: 0, y: 0 };

  return {
    enter(village) {
      const seed = village ? village.seed : 0;
      isQuebecCity = village && village.name === 'Quebec City';
      isTroisRivieres = village && village.name === 'Trois-Rivieres';
      isMontreal = village && village.name === 'Montreal';
      worldWidth = isMontreal ? MONTREAL_WORLD_WIDTH : CANVAS_WIDTH;
      worldTop = isMontreal ? MONTREAL_WORLD_TOP : 0;
      repairShop = repairShopFor(worldWidth);
      buildings = isQuebecCity
        ? [...buildingsForQuebecCity(), repairShop]
        : isTroisRivieres
        ? [...buildingsForTroisRivieres(), repairShop]
        : isMontreal
        ? [...buildingsForMontreal(), repairShop]
        : [...buildingsFor(seed), repairShop];
      trees = treesClearOfBuildings(treesFor(seed, isMontreal ? MONTREAL_TREE_SPOTS : TREE_SPOTS), buildings);
      traderPos = traderPosFor(repairShop);
      reboardZone = { x0: dockX0(worldWidth), x1: dockX1(worldWidth), y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };
      const gunShop = buildings.find((b) => b.isGunShop) || null;
      gunsmithPos = gunShop
        ? { x: gunShop.anchorX + GUNSMITH_OFFSET.x, y: gunShop.anchorY + GUNSMITH_OFFSET.y }
        : null;
      wasNearGunsmith = false;
      const start = playerStartFor(worldWidth);
      player.x = start.x;
      player.y = start.y;
      camera.x = 0;
      camera.y = 0;
      strideTimer = 0;
      strideFrame = 0;
      // Arriving right on top of the trigger radius (unlikely given the
      // player start is up by the dock, but not impossible on a small
      // screen) shouldn't count as "just walked up" — only an actual
      // approach during this visit should.
      wasNearTrader = false;
    },

    // Returns { reboard, tradeRequested, gunsmithMet }: reboard is true the
    // moment the player steps into the reboard zone; tradeRequested and
    // gunsmithMet are each true for one frame only, the moment the player
    // first comes within range of the repair trader / the Montréal gunsmith
    // (not held true the whole time they stand there, so game.js can treat
    // each as a single action per approach rather than repeating it every
    // frame).
    update(dt, keys) {
      let dx = 0, dy = 0;
      if (keys.left) dx -= 1;
      if (keys.right) dx += 1;
      if (keys.up) dy -= 1;
      if (keys.down) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        if (dx < 0) facingLeft = true;
        else if (dx > 0) facingLeft = false;

        const step = WALK_SPEED * dt;
        const nx = player.x + dx * step;
        const ny = player.y + dy * step;
        // Resolve each axis separately so sliding along a wall/edge works
        // instead of a diagonal move being blocked entirely by one axis.
        if (isWalkable(buildings, nx, player.y, worldWidth, worldTop)) player.x = nx;
        if (isWalkable(buildings, player.x, ny, worldWidth, worldTop)) player.y = ny;

        strideTimer += dt;
        if (strideTimer > 0.28) {
          strideTimer = 0;
          strideFrame = 1 - strideFrame;
        }
      } else {
        strideTimer = 0;
      }

      // The camera follows the player on both axes, clamped so it never
      // scrolls past the world's own edges — [0, 0] when worldWidth ===
      // CANVAS_WIDTH and worldTop === 0 (every village but Montreal),
      // which pins the camera at (0, 0) always and reproduces the old
      // fixed-screen framing exactly.
      camera.x = Math.max(0, Math.min(worldWidth - CANVAS_WIDTH, player.x - CANVAS_WIDTH / 2));
      // Max is always 0, not a worldHeight-derived value — the world's
      // south edge never moves (see MONTREAL_WORLD_TOP's own comment),
      // only the north one does, so the camera only ever scrolls upward
      // from its default framing, never downward past it.
      camera.y = Math.max(worldTop, Math.min(0, player.y - CANVAS_HEIGHT / 2));

      const reboard = (
        player.x >= reboardZone.x0 && player.x <= reboardZone.x1 &&
        player.y >= reboardZone.y0 && player.y <= reboardZone.y1
      );

      const nearTrader = Math.hypot(player.x - traderPos.x, player.y - traderPos.y) < TRADER_TRIGGER_RADIUS;
      const tradeRequested = nearTrader && !wasNearTrader;
      wasNearTrader = nearTrader;

      let gunsmithMet = false;
      if (gunsmithPos) {
        const nearGunsmith = Math.hypot(player.x - gunsmithPos.x, player.y - gunsmithPos.y) < GUNSMITH_TRIGGER_RADIUS;
        gunsmithMet = nearGunsmith && !wasNearGunsmith;
        wasNearGunsmith = nearGunsmith;
      }

      return { reboard, tradeRequested, gunsmithMet };
    },

    draw(ctx) {
      const pat = ensurePatterns(ctx);

      // Everything below is drawn in world coordinates; this translate is
      // what turns that into a scrolling view — screen (x,y) = world
      // (x,y) - camera. When worldWidth === CANVAS_WIDTH and worldTop
      // === 0 (every village but Montreal), camera stays (0, 0) always
      // (see its clamp in update()), so this translate is a no-op and
      // every coordinate below lands exactly where the old fixed-screen
      // version put it.
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      ctx.fillStyle = pat.grass;
      ctx.fillRect(camera.x, worldTop, CANVAS_WIDTH, WATER_TOP - worldTop);
      ctx.fillStyle = pat.sand;
      ctx.fillRect(camera.x, WATER_TOP - 6, CANVAS_WIDTH, 6);
      ctx.fillStyle = pat.water;
      ctx.fillRect(camera.x, WATER_TOP, CANVAS_WIDTH, CANVAS_HEIGHT - WATER_TOP);

      // Montréal's streets and Market Place — on the ground, under the
      // dock, trees, buildings and player. The square first, so the two
      // narrower road strips paint cleanly over its edges (see
      // MONTREAL_SQUARE's own comment), then the market well on top of
      // all three, right in the middle of the plaza. The horizontal
      // street spans the *whole world*, not just one screen. The Parade
      // and the two convent gardens are ground features too, drawn the
      // same pass — packed earth and hatched cultivation respectively,
      // each distinct from both the brick streets and plain grass.
      if (isMontreal) {
        drawBrickRoad(ctx, MONTREAL_SQUARE.x, MONTREAL_SQUARE.y, MONTREAL_SQUARE.w, MONTREAL_SQUARE.h);
        drawBrickRoad(ctx, 0, MONTREAL_ROAD_H.y, worldWidth, MONTREAL_ROAD_H.h);
        drawBrickRoad(ctx, MONTREAL_ROAD_V.x, MONTREAL_ROAD_V.y, MONTREAL_ROAD_V.w, MONTREAL_ROAD_V.h);
        drawMarketWell(ctx, MONTREAL_SQUARE_CENTER.x, MONTREAL_SQUARE_CENTER.y);
        drawDirtPath(ctx, MONTREAL_PARADE.x, MONTREAL_PARADE.y, MONTREAL_PARADE.w, MONTREAL_PARADE.h);
        for (const g of MONTREAL_GARDEN_PLOTS) drawGardenPlot(ctx, g.x, g.y, g.w, g.h);
        // The rural track up to the Mont-Royal district — dirt, not
        // brick, picking up where the town's own streets end.
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_V.x, MONTREAL_DIRT_PATH_V.y, MONTREAL_DIRT_PATH_V.w, MONTREAL_DIRT_PATH_V.h);
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_SPUR.x, MONTREAL_DIRT_PATH_SPUR.y, MONTREAL_DIRT_PATH_SPUR.w, MONTREAL_DIRT_PATH_SPUR.h);
      }

      // dock, planks + pilings, leading from the shore down to the canoe
      const dX0 = dockX0(worldWidth), dX1 = dockX1(worldWidth);
      ctx.fillStyle = '#3f2b1a';
      ctx.fillRect(dX0 - 1, DOCK_TOP - 1, dX1 - dX0 + 2, CANVAS_HEIGHT - DOCK_TOP + 1);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(dX0, DOCK_TOP, dX1 - dX0, CANVAS_HEIGHT - DOCK_TOP);
      ctx.strokeStyle = '#5f3b20';
      ctx.lineWidth = 1;
      for (let py = DOCK_TOP + 5; py < CANVAS_HEIGHT; py += 5) {
        ctx.beginPath();
        ctx.moveTo(dX0, py);
        ctx.lineTo(dX1, py);
        ctx.stroke();
      }

      // Mont-Royal itself — real Montreal's one unmistakable landmark,
      // the mountain (233m) the city and island are both named for (same
      // sprite already used for it in the river view's own terrain
      // scenery). Drawn big — a real hill dominating the skyline, not a
      // background detail — and *before* the treeline just below, so the
      // trees' own canopies overlap its lower slopes the way a real
      // mountain glimpsed between trees would look, rather than needing a
      // hard edge like a wall to hide its base against. Off-centre (real
      // Mont-Royal sits northwest of Old Montreal's waterfront, not dead
      // behind the church) rather than centred on the world.
      if (isMontreal) {
        const mrScale = 1.7;
        const mrW = montRoyalSprite.width * mrScale;
        const mrH = montRoyalSprite.height * mrScale;
        const mrBottom = 46;
        ctx.drawImage(montRoyalSprite, 190 - mrW / 2, mrBottom - mrH, mrW, mrH);
      }

      // Québec City and Montréal both keep the landward fortification
      // wall as their backdrop instead of the usual treeline framing
      // every other village's clearing. Montreal's own case is no longer
      // a guess: the Jefferys 1738 map (montreal-1700s.jpg, MONTREAL_ONFOOT_
      // BUILDINGS' own comment) is literally titled "Plan of the Town and
      // FORTIFICATIONS of Montreal," and shows the same stone wall (built
      // 1717-1744, down 1804-1817) still standing through the 1790s. Tiled
      // across the *active* worldWidth, not always CANVAS_WIDTH, so it
      // still spans Montreal's own wider world edge to edge. Drawn where
      // the built-up town's own back row ends — the Mont-Royal district
      // further north sits genuinely *outside* the walls, matching the
      // map's own farmland-beyond-the-fortifications. Behind everything
      // else, so it never occludes a building or the player.
      if (isQuebecCity || isMontreal) {
        const wallTiles = Math.ceil(worldWidth / WALL_TILE_W) + 1;
        for (let i = 0; i < wallTiles; i++) {
          ctx.drawImage(rampartSprite, i * WALL_TILE_W, CITY_WALL_Y);
        }
      }
      if (!isQuebecCity) {
        for (const t of trees) {
          const sprite = treeSprites[t.variant];
          ctx.drawImage(sprite, t.x - sprite.width / 2, t.y - sprite.height * TREE_DRAW_ANCHOR);
        }
      }

      // the canoe, parked at the water end of the dock
      ctx.drawImage(parkedCanoeSprite, worldWidth / 2 - parkedCanoeSprite.width / 2, CANVAS_HEIGHT - parkedCanoeSprite.height + 6);

      // buildings, painter's-algorithm by anchor Y
      const order = buildings
        .map((b) => ({ b, sprite: buildingSprite(b) }))
        .sort((a, c) => a.b.anchorY - c.b.anchorY);
      for (const { b, sprite } of order) {
        const top = b.anchorY - sprite.height + 6;
        if (b.mirror) {
          ctx.save();
          ctx.translate(b.anchorX, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, -sprite.width / 2, top);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, b.anchorX - sprite.width / 2, top);
        }
      }

      // the trader, standing outside the repair shop — drawn after the
      // building pass (traderPos.y sits below every building's anchorY,
      // i.e. nearer the camera, so this is already correct painter's-order)
      ctx.drawImage(traderSprite, traderPos.x - traderSprite.width / 2, traderPos.y - traderSprite.height + 2);

      // the gunsmith, outside the Montréal gun shop (null elsewhere) — same
      // painter's-order reasoning as the trader above
      if (gunsmithPos) {
        ctx.drawImage(gunsmithSprite, gunsmithPos.x - gunsmithSprite.width / 2, gunsmithPos.y - gunsmithSprite.height + 2);
      }

      // player, mirrored horizontally for facing rather than separate frames
      const sprite = walkerFrames[strideFrame];
      ctx.save();
      ctx.translate(player.x, player.y);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height + 2);
      ctx.restore();

      ctx.restore(); // matches the camera translate at the top of draw()
    },
  };
}
