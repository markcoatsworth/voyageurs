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

// Montreal also gets room to the *west*, past the real Récollets Gate —
// same pattern as MONTREAL_WORLD_TOP, just the other axis: negative x,
// extending left from the town's own x=0 edge, without touching
// anything about the town itself. The 1738 map draws real detail just
// outside that gate too (St. Peter's River joining the St. Lawrence, the
// General Hospital, the House of Monsieur de Callières) — genuine
// suburb, not empty space the world happened to stop at. The town's own
// west wall (MONTREAL_WALLS, below) runs along this edge with a real
// Récollets Gate, same as the Mont-Royal district's own gate to the
// north. worldLeft is 0 (not negative) for every other village,
// collapsing the horizontal-minimum camera clamp exactly the way
// worldTop/MONTREAL_WORLD_WIDTH already do for their own axes.
const MONTREAL_WORLD_LEFT = -240;

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
  // --- the western suburb, past the Récollets Gate (MONTREAL_WORLD_LEFT
  // opened this ground up; see its own comment) — real detail the map
  // draws just outside the walls there, not empty space the world
  // happened to stop at.
  // Les Frères Charron — the General Hospital, run by the Frères
  // Hospitaliers (the Charron Brothers), a real Montreal institution
  // since 1694.
  { kind: 'stone', x: -190, y: 130, variant: 0, mirror: false },
  { kind: 'stone', x: -150, y: 135, variant: 1, mirror: true },
  // The House of Monsieur de Callières — Louis-Hector de Callières,
  // Governor of Montreal (1684-99) and later Governor General of New
  // France, whose own residence the map places right by St. Peter's
  // River (MONTREAL_ST_PETER_RIVER, drawn in draw()).
  { kind: 'stone', x: -90, y: 90, variant: 2, mirror: false },
  // Maison Saint-Gabriel — the Congrégation de Notre-Dame's own farm
  // (built 1698, still standing today as a museum), named directly on
  // Belmont's 1702 côte survey ("c. la Congregation," right along the
  // Rivière St-Pierre / Ville St-Gabriel route MONTREAL_STGABRIEL_ROAD
  // now follows) — up the road from Callières' house, on the way to the
  // mountain's foot rather than down by the wharf with everything else.
  { kind: 'stone', x: -35, y: 40, variant: 1, mirror: true },

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
  // The Powder Magazine — named on the map's own legend, tucked right up
  // against the north wall, west-of-centre, clear of the Seminary's own
  // wide footprint.
  { kind: 'stone', x: 195, y: 52, variant: 1, mirror: false },
  // The Nunnery Hospital (Hôtel-Dieu, run by the Religieuses
  // Hospitalières) — between the church and the Market Place.
  { kind: 'stone', x: 290, y: 76, variant: 2, mirror: false },
  { kind: 'stone', x: 390, y: 80, variant: 0, mirror: true },
  { kind: 'stone', x: 440, y: 74, variant: 1, mirror: false },
  // Monsieur de Vaudreuil's — the Governor General's Palace, marked C on
  // the map, near the Parade — the grandest house in town, even if the
  // sprite itself is the same stone building every other house here uses.
  { kind: 'stone', x: 478, y: 78, variant: 2, mirror: true },
  // Château de Ramezay (built 1705 for Montreal's own governor, Claude de
  // Ramezay — a real, separate building from Vaudreuil's own residence
  // just west of it here, and still standing today as a museum). By the
  // 1790s it was serving as the British governors' own residence in
  // Montreal — two genuine seats of government sitting right next to
  // each other, which is exactly why it belongs beside the Palace.
  { kind: 'stone', x: 520, y: 76, variant: 0, mirror: false },
  // The Jesuits' Church, Convent and Gardens — the map's own single
  // largest walled garden, east end. A second real church (not a
  // duplicate sprite mistake — Montreal genuinely had both a parish
  // church and a separate Jesuit church at once).
  { kind: 'church', x: 562, y: 92, mirror: true },
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
  // The gun shop — right at the dock, on the opposite side from the
  // repair shop (which sits at dockX0-25; this mirrors that same offset
  // onto dockX1). Walk up to it for the pistol (game.js's acquirePistol
  // / the trigger in update() below); see the Arsenal building itself,
  // further east, for where the map would actually put an armoury.
  { kind: 'gunshop', x: 365, y: 160, mirror: false },
  // Notre-Dame-de-Bon-Secours — the real "Sailors' Chapel," rebuilt in
  // stone in 1771 after the original 1655 chapel burned, genuinely right
  // by the old port (today's Rue Saint-Paul, a short walk from the
  // harbour) — replaces what was a generic stone house at this same
  // dock-adjacent spot. (Its famous statue of the Virgin facing the
  // harbour is a later, 1890s addition — left out here as anachronistic
  // for the 1790s.)
  { kind: 'church', x: 420, y: 150, mirror: false },
  // (gap here is The Parade, MONTREAL_PARADE — the town's open drill
  // ground, drawn as packed earth rather than a building row.)
  // Monsieur de Longueuil's House, near the east end.
  { kind: 'stone', x: 575, y: 154, variant: 2, mirror: true },
  // The Arsenal building itself stays near the east gate, matching the
  // map's own "Yard for Canoes & Battoes" — but the gun shop you can
  // actually walk up to (game.js's acquirePistol / the trigger in
  // update() below) sits right at the dock instead, mirroring the
  // repair shop's own dockX0-25 offset onto the opposite side
  // (dockX1+25): gameplay convenience over strict map fidelity, same
  // trade-off the always-by-the-dock repair shop already makes.
  { kind: 'stone', x: 615, y: 152, variant: 0, mirror: false },

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

// A real grid, not just one crossing — the map shows several parallel
// streets, not a single cross. MONTREAL_ROAD_H2 is the waterfront street
// itself (Rue Saint-Paul, real name), running past the front row the
// same way MONTREAL_ROAD_H already runs past the back row; two more
// cross streets connect the two, dropped into real gaps between existing
// buildings (west of the Seminary, and between the Parish Church and
// the Nunnery Hospital) rather than cutting through any of them.
const MONTREAL_ROAD_H2 = { y: 142, h: 16 };
const MONTREAL_ROAD_V2 = { x: 106, y: MONTREAL_ROAD_H.y, w: 16, h: MONTREAL_ROAD_H2.y + MONTREAL_ROAD_H2.h - MONTREAL_ROAD_H.y };
const MONTREAL_ROAD_V3 = { x: 250, y: MONTREAL_ROAD_H.y, w: 20, h: MONTREAL_ROAD_H2.y + MONTREAL_ROAD_H2.h - MONTREAL_ROAD_H.y };

// The Parade — the town's own open drill ground, east of the Market
// Place, near the Governor's Palace, per the map. Packed earth
// (drawDirtPath), not cobbled — a military ground, not a market square.
const MONTREAL_PARADE = { x: 450, y: 138, w: 90, h: 30 };

// The Récollets' and the Jesuits' own walled gardens flank the town
// itself at opposite ends; Monsieur Lignères' Gardens (its own separate
// inset on the map, a real formal garden — the tree symbols the map
// draws scattered through its own rows are exactly why a few of
// MONTREAL_DISTRICT_TREE_SPOTS land inside this one, not an oversight)
// sits out past the walls, in the Mont-Royal district's own field. All
// three get the same distinct hatched-green ground texture
// (drawGardenPlot), not just more plain grass.
const MONTREAL_GARDEN_PLOTS = [
  { x: 15, y: 100, w: 110, h: 30 }, // Récollets Convent Gardens, west end (town)
  { x: 520, y: 100, w: 110, h: 30 }, // The Jesuits' Gardens, east end (town)
  { x: 190, y: -250, w: 140, h: 38 }, // Monsieur Lignères' Gardens, north field
];

// The open field flanking Mont-Royal used to read as forest (dense
// scattered pine — see the old MONTREAL_DISTRICT_TREE_SPOTS, trimmed
// below). Checking the actual Jefferys map: the ground immediately north
// of the walls isn't wilderness at all, it's a dense quilt of small
// cultivated fields (the French seigneurial "côte" strip-lot system),
// right up to the map's own drawn edge — true forest only begins further
// out than the map bothers to show. drawFarmStrip gives that same
// patchwork read; each habitant farmhouse (the cabin sprites already
// scattered through here) effectively sits on its own strip. Kept clear
// of Fort de la Montagne, the windmill, both dirt paths, and Lignères'
// own walled garden (MONTREAL_GARDEN_PLOTS) rather than overlapping them.
const MONTREAL_FARM_STRIPS = [
  // west field, flanking the fort/windmill
  { x: 8, y: -235, w: 26, h: 225, tone: 1 },
  { x: 36, y: -235, w: 72, h: 160, tone: 2 },
  // east field, behind the farmhouses lining the mountain's own east side
  { x: 335, y: -235, w: 50, h: 225, tone: 0 },
  { x: 385, y: -235, w: 50, h: 225, tone: 1 },
  { x: 435, y: -235, w: 50, h: 225, tone: 2 },
  { x: 485, y: -235, w: 50, h: 225, tone: 0 },
  { x: 535, y: -235, w: 50, h: 225, tone: 1 },
  { x: 585, y: -235, w: 45, h: 225, tone: 2 },
  // The district's own west field, continuing past the fort/windmill to
  // the world's edge — real habitant farm lots (see
  // MONTREAL_STGABRIEL_ROAD's own comment for the actual documented route
  // that connects this ground to the west suburb), same strip-lot pattern
  // as everything else here.
  { x: -40, y: -235, w: 48, h: 225, tone: 1 },
  { x: -88, y: -235, w: 48, h: 225, tone: 2 },
  { x: -136, y: -235, w: 48, h: 225, tone: 0 },
  { x: -184, y: -235, w: 48, h: 225, tone: 1 },
  { x: -232, y: -235, w: 40, h: 225, tone: 2 },
];

// The rural track up to the Mont-Royal district (drawDirtPath, not the
// town's cut-stone streets) — picks up right where the brick MONTREAL_ROAD_V
// ends (its own y: 96, the north edge of the built-up town) and continues
// north into the field, then a short spur west to Fort de la Montagne.
const MONTREAL_DIRT_PATH_V = { x: 296, y: -140, w: 24, h: 236 };
const MONTREAL_DIRT_PATH_SPUR = { x: 60, y: -22, w: 250, h: 14 };
// Same idea, west out past the Récollets Gate toward the General
// Hospital and the Callières house — picks up at the west end of the
// front row (x: 15, roughly the Récollets buildings' own street
// frontage) and runs out to the world's own western edge.
const MONTREAL_DIRT_PATH_WEST = { x: MONTREAL_WORLD_LEFT, y: 148, w: 15 - MONTREAL_WORLD_LEFT, h: 14 };

// The road up to the district's west field was originally a guess (a
// fork off the fort's own spur) made before a real source was in hand.
// Belmont's own 1702 survey (the "divisée par costes" map, BAnQ) turned
// up instead: its own habitant-by-habitant côte list runs "Depuis la
// Riviere St Pierre ... jusques a la Ville a St Gabriel et jusques au
// pied de la Montagne" -- from St. Peter's River (MONTREAL_ST_PETER_RIVER,
// already in the west suburb) through the Congrégation de Notre-Dame's
// farm at Ville Saint-Gabriel, to the foot of the mountain. That's a
// real road running south-to-north along the world's own west edge, not
// one forking off the fort in the north -- so this replaces the fort
// spur/connector outright rather than sitting beside it. A single
// straight track stands in for the whole real route (Verdun, Fort Rémy
// and La Présentation, further south still, sit beyond this world's own
// edge). Bottom end meets MONTREAL_DIRT_PATH_WEST (y: 148); top end
// reaches the west field's own farm strips.
const MONTREAL_STGABRIEL_ROAD = { x: -65, y: -235, w: 14, h: 148 + 14 - -235 };

// St. Peter's River — real, shown joining the St. Lawrence just west of
// the walls on the map, right where the General Hospital and the
// Callières house sit. A short diagonal reach of the same water pattern
// the main river/dock use, not a full winding river — this is a
// decorative suburb, not a second navigable channel.
const MONTREAL_ST_PETER_RIVER = [
  { x: -240, y: 170, w: 46, h: 18 },
  { x: -205, y: 158, w: 46, h: 18 },
  { x: -170, y: 172, w: 46, h: 14 },
  { x: -140, y: WATER_TOP - 8, w: 60, h: 16 },
];

// The landward fortification wall, as a fixed backdrop strip along the very
// top of the scene — behind the back row of buildings, same "wall set back
// behind the town, not along the water" read as the river view's own
// QUEBEC_CITY_RAMPART_DEPTH. Tiled edge to edge across whichever world is
// active (worldWidth, not always CANVAS_WIDTH — see draw()), same tiling
// approach as villages.js's river-view wall.
const WALL_TILE_W = 64;
const CITY_WALL_Y = 6;
const CITY_WALL_H = 26; // the rampart sprite's own drawn height

// Montreal's wall is a real, solid obstacle (isWalkable() checks this),
// not just a backdrop like Quebec City's — you can't just stroll through
// a fortification. MONTREAL_WALL_GATE is the one break in the north
// wall: two whole tiles (256-384, the pair straddling x=320) left
// undrawn in the tiling loop below *and* excluded from the collision
// band, so the visual gap and the walkable gap are pixel-for-pixel the
// same gate — right where MONTREAL_DIRT_PATH_V actually crosses the
// wall on its way up to the Mont-Royal district.
const MONTREAL_WALL_GATE = { x0: 256, x1: 384 };

// The wall used to be just this one north band — the Jefferys map
// actually shows a full perimeter (west, east and a waterfront wall
// too, not only the landward north side), so this is now one of four
// segments in MONTREAL_WALLS, below.
const CITY_WALL_SIDE_W = 20; // west/east wall thickness (x-direction)
// The waterfront wall is shallower than the landward rampart — the map's
// own legend says the whole fortification's parapet was "only about a
// foot thick of Masonry" to begin with, and there's genuinely little
// room here: the front-row buildings' own feet reach down to y=165,
// WATER_TOP is 180, so this fits the real gap without moving anything.
const MONTREAL_WATERFRONT_WALL_Y = 166;
const MONTREAL_WATERFRONT_WALL_H = 13;

// Each wall is a strip along one axis (axis: 'h' varies over x at a
// fixed y-band; 'v' varies over y at a fixed x-band) with an optional
// gate — a gap in the *other* axis's range where isWalkable() (and the
// matching draw() segment) leaves it open. gateLo/gateHi === null means
// solid, no gate at all.
const MONTREAL_WALLS = [
  // North wall — unchanged: the one A Gate, where the district road
  // crosses (MONTREAL_WALL_GATE).
  {
    axis: 'h', lo: CITY_WALL_Y, hi: CITY_WALL_Y + CITY_WALL_H,
    spanLo: 0, spanHi: MONTREAL_WORLD_WIDTH,
    gateLo: MONTREAL_WALL_GATE.x0, gateHi: MONTREAL_WALL_GATE.x1,
  },
  // West wall — the Récollets Gate, right where the western suburb's
  // own street (MONTREAL_DIRT_PATH_WEST, y: 148-162) crosses in from
  // Maison Saint-Gabriel and the General Hospital.
  {
    axis: 'v', lo: -CITY_WALL_SIDE_W, hi: 0,
    spanLo: CITY_WALL_Y + CITY_WALL_H, spanHi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    gateLo: 145, gateHi: 167,
  },
  // East wall — the map shows a real gate here too, leading to a road
  // further along the north shore, but that ground is outside this
  // world's own edge (the margin check already stops the player past
  // x: 630) and isn't built yet. Left solid rather than opening a gate
  // onto nothing; a real spot to pick up from later.
  {
    axis: 'v', lo: 628, hi: 628 + CITY_WALL_SIDE_W,
    spanLo: CITY_WALL_Y + CITY_WALL_H, spanHi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    gateLo: null, gateHi: null,
  },
  // South/waterfront wall — the map shows a small cluster of gates
  // right by the wharf (Market Gate, St Mary's Gate, Water Gate); one
  // wide gate at the dock's own width stands in for all of them, since
  // the dock is the only water-facing passage gameplay actually needs.
  {
    axis: 'h', lo: MONTREAL_WATERFRONT_WALL_Y, hi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    spanLo: 0, spanHi: MONTREAL_WORLD_WIDTH,
    gateLo: dockX0(MONTREAL_WORLD_WIDTH), gateHi: dockX1(MONTREAL_WORLD_WIDTH),
  },
];

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
  { x: -220, y: -270 }, { x: -140, y: -264 }, { x: -60, y: -272 },
  { x: 30, y: -266 }, { x: 100, y: -272 }, { x: 175, y: -264 }, { x: 340, y: -270 },
  { x: 420, y: -266 }, { x: 495, y: -272 }, { x: 565, y: -264 }, { x: 615, y: -270 },
];
// Trees directly flanking Mont-Royal's own sprite (east and west edges,
// roughly x 105-275) — the mountain's own wooded base, not the open
// field beyond it. The field itself used to be filled with two more
// clusters of "forest" trees here, but the actual Jefferys map shows
// that ground under cultivation (MONTREAL_FARM_STRIPS, above), not
// forest — those two clusters are gone, not replaced.
const MONTREAL_DISTRICT_TREE_SPOTS = [
  { x: 60, y: -170 }, { x: 40, y: -230 },
  { x: 285, y: -30 }, { x: 330, y: -35 }, { x: 285, y: -105 }, { x: 335, y: -115 },
  { x: 280, y: -185 }, { x: 330, y: -195 }, { x: 285, y: -235 },
];
const MONTREAL_TREE_SPOTS = [
  ...clearOfDock([...TREE_SPOTS, ...TREE_SPOTS.map((t) => ({ x: MONTREAL_WORLD_WIDTH - t.x, y: t.y }))]),
  ...MONTREAL_NORTH_TREE_SPOTS,
  ...MONTREAL_DISTRICT_TREE_SPOTS,
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
// walls (null everywhere but Montreal — see MONTREAL_WALLS) is the full
// perimeter: each strip blocks its own band except at its own gate.
function isWalkable(buildings, x, y, worldWidth, worldTop, walls, worldLeft) {
  if (x < worldLeft + 10 || x > worldWidth - 10 || y < worldTop + 10 || y > CANVAS_HEIGHT - 4) return false;
  if (y > WATER_TOP && (x < dockX0(worldWidth) || x > dockX1(worldWidth))) return false;
  if (walls) {
    for (const w of walls) {
      if (w.axis === 'h') {
        if (y >= w.lo && y <= w.hi && x >= w.spanLo && x <= w.spanHi && (w.gateLo == null || x < w.gateLo || x > w.gateHi)) return false;
      } else if (x >= w.lo && x <= w.hi && y >= w.spanLo && y <= w.spanHi && (w.gateLo == null || y < w.gateLo || y > w.gateHi)) {
        return false;
      }
    }
  }
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

// The west and east stretches of the town wall (MONTREAL_WALLS) — same
// coursed-stone read as the north wall's rampartSprite tiles, but drawn
// directly rather than a rotated sprite, so the crenellations sit
// cleanly along whichever long edge actually faces outward. outward:
// 'w' puts them on the strip's own left edge (the real west wall,
// facing the suburb); 'e' puts them on the right edge (the east wall).
function drawSideWall(ctx, x, y, w, h, outward) {
  const stone = '#767066', stoneDark = '#54504a', stoneLight = '#96907f';
  ctx.save();
  ctx.fillStyle = stoneDark;
  ctx.fillRect(x, y, w, h);
  const faceX = outward === 'w' ? x + 4 : x;
  const faceW = w - 4;
  ctx.fillStyle = stone;
  ctx.fillRect(faceX, y, faceW, h);
  ctx.strokeStyle = stoneDark;
  ctx.lineWidth = 0.8;
  for (let lx = Math.ceil(faceX / 4) * 4; lx < faceX + faceW; lx += 4) {
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    ctx.stroke();
  }
  for (let ly = Math.ceil(y / 8) * 8; ly < y + h; ly += 8) {
    ctx.beginPath();
    ctx.moveTo(faceX, ly);
    ctx.lineTo(faceX + faceW, ly);
    ctx.stroke();
  }
  ctx.fillStyle = stoneLight;
  ctx.fillRect(faceX, y, 1.2, h);
  // crenellations along the outward edge
  const crenX = outward === 'w' ? x : x + w - 6;
  ctx.fillStyle = stoneDark;
  for (let cy = Math.ceil(y / 10) * 10; cy < y + h - 4; cy += 10) ctx.fillRect(crenX, cy, 6, 6);
  ctx.fillStyle = stone;
  for (let cy = Math.ceil(y / 10) * 10; cy < y + h - 4; cy += 10) ctx.fillRect(crenX, cy, 5, 5);
  ctx.restore();
}

// The south/waterfront wall (MONTREAL_WALLS) — screen-space-aligned
// coursing like drawBrickRoad, rather than WALL_TILE_W tiles, so it can
// stop exactly at the dock's own gate width (40px, narrower than one
// 64px tile) without leaving a wider gap than the real opening. Battle-
// ments face up (toward the water), matching the north wall's own
// crenellations facing out toward the fields.
function drawWaterfrontWall(ctx, x, y, w, h) {
  const stone = '#767066', stoneDark = '#54504a', stoneLight = '#96907f';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = stoneDark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = stone;
  ctx.fillRect(x, y + 3, w, h - 3);
  ctx.strokeStyle = stoneDark;
  ctx.lineWidth = 0.8;
  for (let ly = Math.ceil((y + 3) / 4) * 4; ly < y + h; ly += 4) {
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
  }
  for (let lx = Math.ceil(x / 8) * 8; lx < x + w; lx += 8) {
    ctx.beginPath();
    ctx.moveTo(lx, y + 3);
    ctx.lineTo(lx, y + h);
    ctx.stroke();
  }
  ctx.fillStyle = stoneLight;
  ctx.fillRect(x, y + 3, w, 1.2);
  ctx.fillStyle = stoneDark;
  for (let cx = Math.ceil(x / 10) * 10; cx < x + w - 4; cx += 10) ctx.fillRect(cx, y, 6, 5);
  ctx.fillStyle = stone;
  for (let cx = Math.ceil(x / 10) * 10; cx < x + w - 4; cx += 10) ctx.fillRect(cx, y, 5, 4);
  ctx.restore();
}

// A cultivated farm strip — one lot of the seigneurial "côte" system the
// Jefferys map shows blanketing the ground north of the walls: dozens of
// narrow, hedge-divided fields in different crops/colours, not the empty
// forest a first pass here assumed (see MONTREAL_FARM_STRIPS' own
// comment). Three tones cycle across adjacent strips for the same
// patchwork read the map itself has; furrow lines run across the strip's
// width (perpendicular to its long north-south axis, like real plough
// rows), and only the long edges get a fence line, so neighbouring strips
// read as one continuous quilt rather than boxed-off garden plots.
const FARM_STRIP_TONES = [
  { fill: '#7c9c52', furrow: '#688a41' }, // hay/pasture
  { fill: '#b99c4c', furrow: '#9c8038' }, // wheat stubble
  { fill: '#5f7a40', furrow: '#4c6530' }, // root crop, freshly turned
];
function drawFarmStrip(ctx, x, y, w, h, tone) {
  const { fill, furrow } = FARM_STRIP_TONES[tone % FARM_STRIP_TONES.length];
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = furrow;
  ctx.lineWidth = 1;
  for (let ry = y + 4; ry < y + h; ry += 5) {
    ctx.beginPath();
    ctx.moveTo(x + 1, ry);
    ctx.lineTo(x + w - 1, ry);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a3a22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y);
  ctx.lineTo(x + 0.5, y + h);
  ctx.moveTo(x + w - 0.5, y);
  ctx.lineTo(x + w - 0.5, y + h);
  ctx.stroke();
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
  let worldLeft = 0;
  let walls = null;
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
      worldLeft = isMontreal ? MONTREAL_WORLD_LEFT : 0;
      walls = isMontreal ? MONTREAL_WALLS : null;
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
        if (isWalkable(buildings, nx, player.y, worldWidth, worldTop, walls, worldLeft)) player.x = nx;
        if (isWalkable(buildings, player.x, ny, worldWidth, worldTop, walls, worldLeft)) player.y = ny;

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
      // CANVAS_WIDTH, worldTop === 0, and worldLeft === 0 (every village
      // but Montreal), which pins the camera at (0, 0) always and
      // reproduces the old fixed-screen framing exactly.
      camera.x = Math.max(worldLeft, Math.min(worldWidth - CANVAS_WIDTH, player.x - CANVAS_WIDTH / 2));
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
        drawBrickRoad(ctx, 0, MONTREAL_ROAD_H2.y, worldWidth, MONTREAL_ROAD_H2.h);
        drawBrickRoad(ctx, MONTREAL_ROAD_V.x, MONTREAL_ROAD_V.y, MONTREAL_ROAD_V.w, MONTREAL_ROAD_V.h);
        drawBrickRoad(ctx, MONTREAL_ROAD_V2.x, MONTREAL_ROAD_V2.y, MONTREAL_ROAD_V2.w, MONTREAL_ROAD_V2.h);
        drawBrickRoad(ctx, MONTREAL_ROAD_V3.x, MONTREAL_ROAD_V3.y, MONTREAL_ROAD_V3.w, MONTREAL_ROAD_V3.h);
        drawMarketWell(ctx, MONTREAL_SQUARE_CENTER.x, MONTREAL_SQUARE_CENTER.y);
        drawDirtPath(ctx, MONTREAL_PARADE.x, MONTREAL_PARADE.y, MONTREAL_PARADE.w, MONTREAL_PARADE.h);
        for (const g of MONTREAL_GARDEN_PLOTS) drawGardenPlot(ctx, g.x, g.y, g.w, g.h);
        // The cultivated fields flanking Mont-Royal itself — see
        // MONTREAL_FARM_STRIPS' own comment.
        for (const f of MONTREAL_FARM_STRIPS) drawFarmStrip(ctx, f.x, f.y, f.w, f.h, f.tone);
        // The rural track up to the Mont-Royal district — dirt, not
        // brick, picking up where the town's own streets end.
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_V.x, MONTREAL_DIRT_PATH_V.y, MONTREAL_DIRT_PATH_V.w, MONTREAL_DIRT_PATH_V.h);
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_SPUR.x, MONTREAL_DIRT_PATH_SPUR.y, MONTREAL_DIRT_PATH_SPUR.w, MONTREAL_DIRT_PATH_SPUR.h);
        // The real Rivière St-Pierre / Ville St-Gabriel route up to the
        // mountain's foot (see its own comment) — runs down the world's
        // west edge to meet MONTREAL_DIRT_PATH_WEST below.
        drawDirtPath(ctx, MONTREAL_STGABRIEL_ROAD.x, MONTREAL_STGABRIEL_ROAD.y, MONTREAL_STGABRIEL_ROAD.w, MONTREAL_STGABRIEL_ROAD.h);
        // Same, west out past the Récollets Gate toward the western
        // suburb, and St. Peter's River itself alongside it — plain
        // water fill, same pattern the main river uses.
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_WEST.x, MONTREAL_DIRT_PATH_WEST.y, MONTREAL_DIRT_PATH_WEST.w, MONTREAL_DIRT_PATH_WEST.h);
        ctx.fillStyle = pat.water;
        for (const r of MONTREAL_ST_PETER_RIVER) ctx.fillRect(r.x, r.y, r.w, r.h);
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
      // behind the church) rather than centred on the world. Its base
      // (mrBottom) sits north of the north wall (MONTREAL_WALLS, drawn
      // next) rather than overlapping it — the mountain is genuinely
      // outside the walled town, not something the fortifications cut
      // across.
      if (isMontreal) {
        const mrScale = 1.7;
        const mrW = montRoyalSprite.width * mrScale;
        const mrH = montRoyalSprite.height * mrScale;
        const mrBottom = CITY_WALL_Y - 20;
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
      //
      // Montreal's wall is a real obstacle (isWalkable()'s walls check),
      // not just backdrop like Quebec City's — so the one gate
      // (MONTREAL_WALL_GATE, where MONTREAL_DIRT_PATH_V actually crosses
      // it) skips both tiles it falls under here too, leaving a real gap
      // in the stonework exactly where the collision gap is, rather than
      // an invisible hole in a solid-looking wall.
      if (isQuebecCity || isMontreal) {
        const wallTiles = Math.ceil(worldWidth / WALL_TILE_W) + 1;
        for (let i = 0; i < wallTiles; i++) {
          const tileX = i * WALL_TILE_W;
          if (isMontreal && tileX < MONTREAL_WALL_GATE.x1 && tileX + WALL_TILE_W > MONTREAL_WALL_GATE.x0) continue;
          ctx.drawImage(rampartSprite, tileX, CITY_WALL_Y);
        }
      }
      // The rest of the perimeter — west, east and the waterfront wall
      // (MONTREAL_WALLS[1..3]) — same "real obstacle, matching gap"
      // approach as the north wall above, just drawn directly rather
      // than tiled (drawSideWall/drawWaterfrontWall, above) so each
      // gate's visual gap can match its own exact collision width.
      if (isMontreal) {
        const [, west, east, south] = MONTREAL_WALLS;
        drawSideWall(ctx, west.lo, west.spanLo, west.hi - west.lo, west.gateLo - west.spanLo, 'w');
        drawSideWall(ctx, west.lo, west.gateHi, west.hi - west.lo, west.spanHi - west.gateHi, 'w');
        drawSideWall(ctx, east.lo, east.spanLo, east.hi - east.lo, east.spanHi - east.spanLo, 'e');
        drawWaterfrontWall(ctx, 0, south.lo, south.gateLo, south.hi - south.lo);
        drawWaterfrontWall(ctx, south.gateHi, south.lo, worldWidth - south.gateHi, south.hi - south.lo);
      }
      if (!isQuebecCity) {
        for (const t of trees) {
          const sprite = treeSprites[t.variant];
          ctx.drawImage(sprite, t.x - sprite.width / 2, t.y - sprite.height * TREE_DRAW_ANCHOR);
        }
      }

      // the canoe, parked at the water end of the dock
      ctx.drawImage(parkedCanoeSprite, worldWidth / 2 - parkedCanoeSprite.width / 2, CANVAS_HEIGHT - parkedCanoeSprite.height + 6);

      // Everything that stands on the ground — buildings, the trader,
      // the gunsmith, and the player — drawn together in one painter's-
      // algorithm pass, sorted by each one's own Y position (not
      // buildings-then-player as two fixed passes, which is what used to
      // let the player walk "in front of" a building they were actually
      // standing north of/behind — e.g. Montréal's own tall churches).
      // The trader/gunsmith's fixed spots happen to always sort after
      // every building anyway (they stand out front of their own shops,
      // south of every building's anchorY), so this reproduces their old
      // always-drawn-last behaviour exactly; the player is the one whose
      // Y genuinely changes every frame and actually needs sorting.
      const walkerSprite = walkerFrames[strideFrame];
      const drawOrder = [
        ...buildings.map((b) => ({
          y: b.anchorY,
          draw: (c) => {
            const sprite = buildingSprite(b);
            const top = b.anchorY - sprite.height + 6;
            if (b.mirror) {
              c.save();
              c.translate(b.anchorX, 0);
              c.scale(-1, 1);
              c.drawImage(sprite, -sprite.width / 2, top);
              c.restore();
            } else {
              c.drawImage(sprite, b.anchorX - sprite.width / 2, top);
            }
          },
        })),
        {
          y: traderPos.y,
          draw: (c) => c.drawImage(traderSprite, traderPos.x - traderSprite.width / 2, traderPos.y - traderSprite.height + 2),
        },
        ...(gunsmithPos ? [{
          y: gunsmithPos.y,
          draw: (c) => c.drawImage(gunsmithSprite, gunsmithPos.x - gunsmithSprite.width / 2, gunsmithPos.y - gunsmithSprite.height + 2),
        }] : []),
        {
          y: player.y,
          draw: (c) => {
            c.save();
            c.translate(player.x, player.y);
            if (facingLeft) c.scale(-1, 1);
            c.drawImage(walkerSprite, -walkerSprite.width / 2, -walkerSprite.height + 2);
            c.restore();
          },
        },
      ];
      drawOrder.sort((a, b) => a.y - b.y);
      for (const item of drawOrder) item.draw(ctx);

      ctx.restore(); // matches the camera translate at the top of draw()
    },
  };
}
