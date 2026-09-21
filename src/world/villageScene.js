// The on-foot village scene: a small, fixed (non-scrolling) local area with
// a few buildings and a dock back to the water. Deliberately simple for
// now — free 4-directional walking and building collision, no interaction
// yet (see the module comment in game.js for the planned shops).
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/config.js';
import { createGrassTile, createWaterTile, createSandTile } from './tiles.js';
import {
  createCabinSprite, createWalkerSprite, createCanoeSprite, createPineTreeSprite, createRepairShopSprite, createTraderSprite,
  createStoneBuildingSprite, createChurchSprite, createRampartSprite, createGunShopSprite, createGunsmithSprite,
  createSulpicianTowersSprite, createMontRoyalSprite, createWindmillSprite, createMusketShopSprite, createMusketMasterSprite,
  createRuinedFortSprite,
} from './sprites.js';
import { villageLayout, KINGSTON_GREETER_COAT, KINGSTON_GREETER_HAT } from './villages.js';
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
// (from -180, then -280) to make room past Mont-Royal's own field for
// Côte Sainte-Catherine — a real côte road that ran (and, as Chemin de
// la Côte-Sainte-Catherine, still runs today) along the mountain's own
// north side, continuing MONTREAL_DIRT_PATH_V further out rather than
// stopping dead at what used to be the tree line.
const MONTREAL_WORLD_TOP = -460;

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

// Same idea, past the real east gate this time — the map shows one
// there too (by the Arsenal), leading out along the shore to "The Fort"
// (a small redoubt, "only a Cavalier without a Parapet" per the map's
// own legend) sitting alone in the open field beyond. MONTREAL_WORLD_
// WIDTH itself stays fixed at 640 (the walled town's own interior, and
// the dock's centring point) — worldRight is the separate exploration
// boundary, mirroring worldLeft on this axis exactly the same way:
// worldRight === CANVAS_WIDTH (not worldWidth) for every other village,
// collapsing the horizontal-maximum camera clamp to reproduce the old
// fixed framing exactly.
const MONTREAL_WORLD_RIGHT = MONTREAL_WORLD_WIDTH + 240;

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

// Québec City's own on-foot layout — rebuilt from an actual period source:
// "Plan de la Ville de Québec" (dropped into the repo as
// quebec-city-1700s.jpg — not committed, a reference image only), whose own
// legend names every institution placed below (Fort St-Louis, the Récollets,
// the Jésuites, the Ursulines, the Séminaire, l'Évêché, l'Hôtel-Dieu,
// l'Intendance, the Batteries and the bastion line), same "real map, not a
// generic cluster" treatment MONTREAL_ONFOOT_BUILDINGS already gets.
//
// The one thing Montréal's flat town never needed: Québec genuinely sits on
// two levels, Haute-Ville walled on the bluff and Basse-Ville a narrow strip
// at the water's edge below it — this game has no real elevation, so the
// split is done the only way a top-down scene can: two bands (back = Haute-
// Ville, y ~50-112; front = Basse-Ville, y ~140-168) separated by
// QUEBEC_CITY_WALLS' own cliff/battery line, a real obstacle (not backdrop,
// see below) with a single gate where Côte de la Montagne — the actual road
// that has connected the two towns since the 1600s — climbs through it.
// East-to-west order below follows the map's own real layout: Fort St-Louis
// and the Récollets toward the point (Cap Diamant, west, where the citadel
// tiles below stand in for Redoute du Cap au Diamant/Cavalier du Moulin),
// the Cathedral/Séminaire/Évêché cluster around Place d'Armes at the head of
// the Côte, the Ursulines and Jésuites further east, l'Hôtel-Dieu and
// l'Intendance toward the St-Charles side (Sault-au-Matelot/St-Roch, off the
// world's own east edge — this scene stops at the walled town itself, same
// scope cut Montréal's own core town makes before its suburbs).
const QUEBEC_WORLD_WIDTH = 560;

// The cliff itself, as a real obstacle (isWalkable()'s walls check) rather
// than Québec's old backdrop-only wall — the one meaningful new gameplay
// beat this rebuild adds: you can't walk from the dock straight up into
// Haute-Ville, you have to find Côte de la Montagne. Drawn with
// drawWaterfrontWall (crenellations facing up, toward the water) rather than
// drawSideWall — the real batteries named in the legend (Vaudreuil, Dauphine,
// Royale, du Château) sit right on this cliff edge facing the river, exactly
// the read that function already has.
const QUEBEC_CITY_GATE = { x0: 255, x1: 305 };
const QUEBEC_CLIFF_Y = 120;
const QUEBEC_CLIFF_H = 12;
// The landward wall's own y-band — same numbers as CITY_WALL_Y/CITY_WALL_H
// further down (where the backdrop sprite itself is tiled and drawn;
// declared there, not here, since that's where they're actually used for
// rendering) — kept in sync by hand rather than reordering the file to
// share one declaration.
const QUEBEC_LANDWARD_Y = 6;
const QUEBEC_LANDWARD_H = 26;
const QUEBEC_CITY_WALLS = [
  {
    axis: 'h', lo: QUEBEC_CLIFF_Y, hi: QUEBEC_CLIFF_Y + QUEBEC_CLIFF_H,
    spanLo: 0, spanHi: QUEBEC_WORLD_WIDTH,
    gates: [[QUEBEC_CITY_GATE.x0, QUEBEC_CITY_GATE.x1]],
  },
  // Was backdrop-only (a rampart sprite tiled behind everything, per the
  // river-view QC layout's own long-standing treatment) — reported as
  // walkable straight through, unlike Montréal's own landward wall, which
  // has always been a real obstacle. No gate: there's no ground beyond it
  // (this scene stops at the walled town itself — see the module comment
  // on why), so a solid wall is the honest version, not a doorway to
  // nowhere.
  {
    axis: 'h', lo: QUEBEC_LANDWARD_Y, hi: QUEBEC_LANDWARD_Y + QUEBEC_LANDWARD_H,
    spanLo: 0, spanHi: QUEBEC_WORLD_WIDTH,
    gates: [],
  },
];

// Côte de la Montagne, climbing from right behind the dock/Place Royale
// through the cliff's one gate up to Place d'Armes — same brick-strip
// treatment as Montréal's own streets, just one road instead of a grid
// (Québec's Basse-Ville-to-Haute-Ville climb is the one street this scene
// actually needs).
const QUEBEC_ROAD_V = { x: QUEBEC_CITY_GATE.x0, y: 86, w: QUEBEC_CITY_GATE.x1 - QUEBEC_CITY_GATE.x0, h: DOCK_TOP - 86 };
// Place d'Armes — the square at the top of the Côte, fronted by Fort/
// Château St-Louis (the map's own "a"). Packed earth (drawDirtPath), not
// cobbled brick — this was the garrison's own parade ground, same
// distinction MONTREAL_PARADE already draws against Montréal's market square.
const QUEBEC_PLACE_DARMES = { x: 250, y: 86, w: 60, h: 26 };
// Place Royale, Basse-Ville's own square in front of the Église de la
// Basse-Ville (Notre-Dame-des-Victoires, the map's own "n") — a real
// cobbled market square down by the harbour, so brick here, not dirt.
const QUEBEC_PLACE_ROYALE = { x: 128, y: 140, w: 82, h: 26 };

// Redoute du Cap au Diamant / Cavalier du Moulin (the map's own "b"/"c") —
// the citadel's own outworks at the point, west of the Récollets, standing
// apart from the main cliff line the same way QUEBEC_CITY_CITADEL already
// reads as a distinct bastion in the river view. Decorative, like that one —
// see its own comment.
const QUEBEC_CITADEL_TILES = [
  { x: 14, y: 114 }, { x: 34, y: 105 }, { x: 54, y: 116 },
];

// Two of the map's own scattered green garden plots — the Récollets' own
// (west end, behind their convent) and the Séminaire/Cathedral precinct's
// (east of Place d'Armes) — not all of them (Montréal's own equivalent
// trims the same way; see MONTREAL_GARDEN_PLOTS' own comment).
const QUEBEC_GARDEN_PLOTS = [
  { x: 60, y: 30, w: 100, h: 34 },
  { x: 370, y: 22, w: 100, h: 38 },
];

// Named institutions from the map's own legend, plus ordinary infill —
// merchant houses, residences — filling the real gaps between them. A
// walled 1790s capital had far more of the latter than named landmarks;
// the first pass here only placed the named ones and read as too empty
// for a real capital. Same mix Montréal's own on-foot layout already
// uses (named buildings from Jefferys' map plus generic infill), just
// catching Québec City's own count up toward it (19 -> 26).
const QUEBEC_CITY_ONFOOT_BUILDINGS = [
  // --- Haute-Ville back row (further from Place d'Armes/the Côte) ---
  // Les Récollets ("d") — west end, near the citadel point.
  { kind: 'stone', x: 100, y: 62, variant: 0, mirror: false },
  { kind: 'stone', x: 140, y: 58, variant: 1, mirror: true },
  // Ordinary infill, back row — the real gap between the Récollets and the
  // Ursulines was never actually empty ground.
  { kind: 'stone', x: 200, y: 66, variant: 2, mirror: false },
  { kind: 'stone', x: 245, y: 58, variant: 0, mirror: true },
  { kind: 'stone', x: 290, y: 68, variant: 1, mirror: false },
  { kind: 'stone', x: 335, y: 60, variant: 2, mirror: true },
  { kind: 'stone', x: 385, y: 66, variant: 0, mirror: false },
  // Les Ursulines ("f") — east of the Séminaire cluster.
  { kind: 'stone', x: 440, y: 64, variant: 2, mirror: false },
  { kind: 'stone', x: 478, y: 60, variant: 0, mirror: true },
  // Les Jésuites et dépendances ("e") — east end of Haute-Ville.
  { kind: 'stone', x: 520, y: 64, variant: 1, mirror: false },

  // --- Haute-Ville front row (facing Place d'Armes/the Côte) ---
  // Fort/Château St-Louis ("a") — the Governor's own residence, right at
  // the head of the Côte, west of Place d'Armes.
  { kind: 'stone', x: 140, y: 104, variant: 2, mirror: false },
  { kind: 'stone', x: 180, y: 108, variant: 0, mirror: true },
  // L'Évêché ("h") — the Bishop's Palace, flanking the square's west side.
  { kind: 'stone', x: 220, y: 112, variant: 1, mirror: true },
  // (Place d'Armes itself, QUEBEC_PLACE_DARMES, fills the ground right here
  // — a real parade square stays open, not infilled.)
  // La Paroisse avec le Séminaire et dépendances ("g") — the Cathedral
  // (Notre-Dame de Québec) east of the square, the Séminaire itself right
  // beside it (twin-tower sprite reused honestly, same institution type
  // as Montréal's own Vieux Séminaire).
  { kind: 'church', x: 340, y: 108, mirror: false },
  { kind: 'seminary', x: 395, y: 100, mirror: false },
  // L'Hôtel-Dieu ("i") — toward the St-Charles/east side.
  { kind: 'stone', x: 450, y: 108, variant: 0, mirror: false },

  // --- Basse-Ville, the narrow waterfront strip below the cliff ---
  // Église de la Basse-Ville / Notre-Dame-des-Victoires ("n") — Place
  // Royale, west of the Côte.
  { kind: 'church', x: 160, y: 150, mirror: false },
  { kind: 'stone', x: 70, y: 162, variant: 1, mirror: false },
  { kind: 'stone', x: 105, y: 166, variant: 2, mirror: true },
  { kind: 'stone', x: 200, y: 158, variant: 0, mirror: false },
  // Ordinary infill along the waterfront, squeezed into the real gap
  // between that last building and the Côte's own road corridor
  // (x 255-305, QUEBEC_CITY_GATE — has to stay clear, it's the one way up
  // to Haute-Ville) — Basse-Ville was a packed strip, not a scattering of
  // buildings with open ground between them.
  { kind: 'stone', x: 234, y: 158, variant: 0, mirror: false },
  // Le Sault au Matelot ("l") — the waterfront row continuing east, past
  // the Côte, toward the St-Charles.
  { kind: 'stone', x: 355, y: 164, variant: 1, mirror: true },
  { kind: 'stone', x: 400, y: 158, variant: 2, mirror: false },
  { kind: 'stone', x: 435, y: 160, variant: 1, mirror: false },
  // L'Intendance ("m") — the Intendant's Palace, furthest east, nearest
  // the real St-Charles-side site.
  { kind: 'stone', x: 470, y: 160, variant: 0, mirror: true },
  { kind: 'stone', x: 505, y: 164, variant: 1, mirror: false },
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

// Tadoussac's on-foot layout — same real geography as villages.js's own
// TADOUSSAC_BUILDINGS/TADOUSSAC_CHAPEL (see their comment for the sourcing:
// the real site's own point/cove shape, buildings updated to 1790 from the
// ~1600 map's own "l'abitation du Capitaine Chauvin" post), just mapped
// onto this fixed on-foot screen instead of the flowing river band. West
// end is the point (the trading post), east end the cove (the dwelling
// cluster), the chapel set back and central between them — not a big town,
// so seven buildings total, not Trois-Rivières' thirteen.
const TADOUSSAC_ONFOOT_BUILDINGS = [
  // The King's Posts trading post and its own outbuilding, on the point.
  { kind: 'stone', x: 36, y: 90, variant: 2, mirror: false },
  { kind: 'stone', x: 74, y: 150, variant: 0, mirror: true },
  // The 1747 chapel, set back and central.
  { kind: 'church', x: 165, y: 96, mirror: false },
  // A small cluster of trader/fisher dwellings, by the cove.
  { kind: 'stone', x: 200, y: 86, variant: 1, mirror: false },
  { kind: 'stone', x: 235, y: 152, variant: 2, mirror: true },
  { kind: 'stone', x: 270, y: 88, variant: 0, mirror: false },
  { kind: 'stone', x: 300, y: 150, variant: 1, mirror: true },
];
// The map itself draws a thin track tracing the shore from the small
// house cluster (near its own "D") around the point to the habitation
// (its own "C") — a real coastal path connecting the two clusters, not
// invented. Packed earth (drawDirtPath), not cobbled — this is a fur-trade
// post's own worn track, not a paved street.
const TADOUSSAC_PATH = { x: 25, y: 116, w: 285, h: 12 };
// The chapel's own spur, running all the way down to the dock — not just
// out to the through-path above (which it also crosses on the way down,
// same as any real track crossing another) — so stepping off the canoe
// puts you on a real, walkable line straight up to the church door, the
// most direct route a landing party would actually take.
const TADOUSSAC_CHAPEL_SPUR = { x: 159, y: 96, w: 12, h: DOCK_TOP - 96 };

// Kingston's on-foot layout — mapped onto this fixed screen the same way
// Trois-Rivières' own is (buildingsForTroisRivieres' comment): no walls or
// scrolling world, just a denser two-row spread than the plain procedural
// villages get, matching the "bigger built-up city" the river view
// (world/villages.js's KINGSTON_BANDS) already gives it — 14 buildings,
// same count as Québec City's own on-foot layout. St. George's (see
// KINGSTON_CHURCH's own comment in villages.js) set back and central,
// same convention every other hand-authored town's church uses; Fort
// Frontenac's ruins (createRuinedFortSprite — unused anywhere else in the
// game, a good fit for a fur-trade post that had already fallen out of
// use by the 1790s, unlike the river view's still-standing KINGSTON_FORT
// corner) standing apart at the town's own western edge, same "small
// cluster apart from the main spread" treatment the river view gives it.
// Kingston's own street grid — the actual layout traced off the survey
// (kingston-1700s.jpg, dropped into the repo root; see world/villages.js's
// own comment on it), not invented: the map shows a genuine rectangular
// grid on the point (numbered cross streets running the letters of
// "KINGSTON"/"TOWN" down the middle, per that map's own labels), a Market
// square, and the old fort's own corner standing apart at the grid's
// western edge — the same shape Montréal's own on-foot grid uses
// (MONTREAL_ROAD_V/V2/V3/V4 + MONTREAL_ROAD_H/H2 + MONTREAL_SQUARE below),
// reused here rather than the single-street treatment Québec City's on-foot
// scene gets, since the real map genuinely shows a multi-street grid, not
// one road up from a gate.
const KINGSTON_ROAD_H1 = { y: 68, h: 16 };  // back avenue, inland edge of the grid
const KINGSTON_ROAD_H2 = { y: 126, h: 16 }; // front avenue, nearest the harbour
const KINGSTON_MAIN_ROAD_V = { x: 153, y: KINGSTON_ROAD_H1.y, w: 14, h: DOCK_TOP - KINGSTON_ROAD_H1.y }; // straight off the dock, up through the whole grid — the town's own spine, same role QUEBEC_ROAD_V plays off its gate
const KINGSTON_CROSS_ROAD_W = { x: 76, y: KINGSTON_ROAD_H1.y, w: 14, h: KINGSTON_ROAD_H2.y + KINGSTON_ROAD_H2.h - KINGSTON_ROAD_H1.y };
const KINGSTON_CROSS_ROAD_E = { x: 226, y: KINGSTON_ROAD_H1.y, w: 14, h: KINGSTON_ROAD_H2.y + KINGSTON_ROAD_H2.h - KINGSTON_ROAD_H1.y };
// Market Square — between the two avenues, straddling the main road the
// same way a real market square sits astride the street leading up from
// the wharf. The well (drawMarketWell, already used for Montréal's own
// square) sits west of the road through it; St. George's faces the square
// from its own east side, same "set back, central" convention the church
// gets everywhere else (villages.js's KINGSTON_CHURCH comment).
const KINGSTON_MARKET_SQUARE = { x: 110, y: 90, w: 100, h: 30 };
const KINGSTON_MARKET_WELL_CENTER = { x: 135, y: 105 };

const KINGSTON_ONFOOT_BUILDINGS = [
  // Upper Kingston, back row — north of the back avenue, one building per
  // block the cross streets/main road divide the grid into.
  { kind: 'stone', x: 45, y: 62, variant: 1, mirror: false },
  { kind: 'stone', x: 121, y: 60, variant: 2, mirror: true },
  { kind: 'stone', x: 196, y: 60, variant: 0, mirror: false },
  { kind: 'stone', x: 265, y: 62, variant: 1, mirror: true },
  // St. George's, facing the Market Square from its own east side.
  { kind: 'church', x: 185, y: 110, mirror: false },
  // The town proper, south of the front avenue — closest to the harbour.
  { kind: 'stone', x: 50, y: 155, variant: 2, mirror: true },
  { kind: 'stone', x: 121, y: 155, variant: 0, mirror: false },
  { kind: 'stone', x: 196, y: 152, variant: 1, mirror: true },
  { kind: 'stone', x: 265, y: 155, variant: 2, mirror: false },
  // Fort Frontenac's ruins, standing apart at the grid's own western edge,
  // west of the whole street pattern — same "small cluster apart from the
  // main spread" treatment the river view gives it.
  { kind: 'ruinedfort', x: 25, y: 105, mirror: false },
];

// North of the grid — the real survey (kingston-1700s.jpg) labels this
// ground "Artillery Park," a military drill/ordnance yard, not a leisure
// park in the modern sense (public parks as a concept are mostly a later
// 19th-century thing — no real evidence one stood here at this game's own
// setting). Asked directly whether a real park would've existed, with "if
// not, make one up" as the fallback: kept the real name and the real
// ground rather than inventing a new site, and reimagined it as the
// walkable green space asked for — "somewhere to park and just listen to
// the music" — with KINGSTON_CANNON_POS below as the one nod to what it
// actually was, not a pretence that it was always a park. Main Street
// (KINGSTON_MAIN_ROAD_V) continues north through it as KINGSTON_PARK_PATH,
// same road, same width, just carried past where the grid itself ends.
// -170 originally; pushed further north (now -260) once the bandstand below
// needed real headroom — the camera's own north clamp (this file's
// update(), camera.y = Math.max(worldTop, ...)) means nothing drawn above
// worldTop can ever actually be seen, since the viewport's topmost visible
// world-y is worldTop itself the moment the player gets anywhere near this
// end of the park. The bandstand's canopy/pennant reach roughly
// D/2 + roofRise + 10 above its own anchor (drawBandstand's own math, which
// scales with W) — with KINGSTON_BANDSTAND_POS.y = -158 that's comfortably
// under half of the 260px here even after the stage widened (48 -> 150,
// its own comment) and its support posts were later removed (this
// function's own comment) — more clearance than strictly needed at this
// point, but nothing wrong with the extra grass; not worth re-tuning down
// every time the stage's own numbers move.
const KINGSTON_WORLD_TOP = -260;
const KINGSTON_PARK_PATH = { x: KINGSTON_MAIN_ROAD_V.x, y: KINGSTON_WORLD_TOP, w: KINGSTON_MAIN_ROAD_V.w, h: KINGSTON_ROAD_H1.y - KINGSTON_WORLD_TOP };
const KINGSTON_CANNON_POS = { x: 110, y: -90 };
// Four of these originally sat inside where the bandstand's footprint is
// now (x 85-235, roughly y -175..-140) — fine when the stage was only 48
// wide, not once it widened to 150 (drawBandstand's own comment). Reported
// back as "trees overlapping with the stage"; those four pushed out to
// the sides, clear of the stage's own x-range either way, rather than
// behind it (behind would sit inside the canopy's own footprint too, at
// this stage's height — see KINGSTON_WORLD_TOP's own comment on how tall
// that is).
const KINGSTON_PARK_TREE_SPOTS = [
  { x: 40, y: -150 }, { x: 55, y: -165 }, { x: 258, y: -160 }, { x: 270, y: -140 },
  { x: 45, y: -90 }, { x: 260, y: -85 },
  { x: 35, y: -30 }, { x: 280, y: -35 },
  { x: 65, y: -135 }, { x: 255, y: -140 },
];

// A 5-piece band on a bandstand, with a crowd watching — asked for
// explicitly for "the big open area north" (Artillery Park, above), purely
// cosmetic ("nothing interactive"). The bandstand sits at the north end,
// astride KINGSTON_PARK_PATH's own line (Main Street carried all the way up
// through the park) — the path reads as leading straight to it, a natural
// town-square arrangement, not an accident of matching x coordinates.
const KINGSTON_BANDSTAND_POS = { x: 160, y: -158 };
// Offsets from KINGSTON_BANDSTAND_POS, not absolute — five distinct
// instruments (drawBandMember's own switch) rather than five copies of one
// figure, spread across the now-much-wider stage (drawBandstand's own W —
// widened, "a lot wider," so all five read as clearly separate performers
// instead of a cramped cluster). The middle one, whiteHat: true, is the
// dock greeter (villages.js's KINGSTON_GREETER_COAT/HAT, imported above) —
// asked for explicitly as "the guy with the white hat... right in the
// middle" — same recognizable figure, fronting the band now rather than
// waving from the dock.
const KINGSTON_BAND_SPOTS = [
  { dx: -55, dy: 3, instrument: 'fiddle' },
  { dx: -27, dy: -2, instrument: 'drum' },
  { dx: 0, dy: 2, instrument: 'concertina', whiteHat: true },
  { dx: 27, dy: -2, instrument: 'fife' },
  { dx: 55, dy: 3, instrument: 'bass' },
];
// The audience — loose rows facing the stage, absolute world positions
// (unlike the band spots above, since there's no single anchor these are
// offset from). Left open around x=140-180 near the front rows, the same
// line KINGSTON_PARK_PATH runs up — reads as a natural aisle up to the
// stage rather than a crowd standing shoulder to shoulder across the path.
// Checked against KINGSTON_PARK_TREE_SPOTS above for overlap.
//
// Front row used to sit only ~5px clear of the stage's own front edge
// (KINGSTON_BANDSTAND_POS.y + D/2, drawBandstand) — reported back as
// wanting them "further back" and "more spread out" once the crowd figures
// themselves grew to CROWD_SCALE (drawCrowdFigure's own comment). Now a
// real ~30px clear of the stage, rows ~28px apart (was ~16-18px, tight
// enough that CROWD_SCALE-sized figures in adjacent rows nearly touched),
// and each row's own points spread further apart too, not just the rows
// as a whole.
const KINGSTON_CROWD_SPOTS = [
  { x: 70, y: -118 }, { x: 110, y: -115 }, { x: 143, y: -117 }, { x: 178, y: -117 }, { x: 210, y: -115 }, { x: 250, y: -118 },
  { x: 55, y: -90 }, { x: 95, y: -87 }, { x: 132, y: -90 }, { x: 190, y: -89 }, { x: 228, y: -88 }, { x: 265, y: -91 },
  { x: 40, y: -60 }, { x: 85, y: -56 }, { x: 148, y: -58 }, { x: 172, y: -58 }, { x: 215, y: -55 }, { x: 260, y: -60 },
  // A fourth row, further back still — asked for explicitly ("more NPC
  // audience members in the empty space between the city and the existing
  // audience"): the back row above (-55..-60) left the whole stretch down
  // to the road grid (KINGSTON_ROAD_H1.y = 68) open and empty. This doesn't
  // fill all the way to the road — still leaves real clear ground before
  // the streets start — just extends the crowd a further row south into
  // what was empty lawn. Clear of the two roadside trees at (35,-30)/(280,-35).
  { x: 50, y: -28 }, { x: 95, y: -22 }, { x: 140, y: -25 }, { x: 180, y: -25 }, { x: 225, y: -22 }, { x: 270, y: -28 },
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

  // --- past the east gate (MONTREAL_WORLD_RIGHT opened this ground up;
  // see its own comment) ---
  // "The Fort" — the map's own label for it, with its own legend entry:
  // "only a Cavalier without a Parapet," i.e. a raised gun platform on
  // its own, not a proper bastioned fort — a minor outwork standing
  // alone in the open field beyond the gate, not another building
  // cluster. The stone sprite is a simplification (no bespoke redoubt
  // sprite exists), same pragmatic reuse as Fort de la Montagne's own
  // seminary-sprite stand-in above.
  { kind: 'stone', x: 760, y: 95, variant: 2, mirror: false },

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
// A fourth cross street, east end — the map shows the grid continuing
// past the Market Place too, not stopping there; dropped into the real
// gap between Château de Ramezay and the Jesuit complex (the map's own
// division between the governors' block and the Jesuits' separately
// walled property).
const MONTREAL_ROAD_V4 = { x: 536, y: MONTREAL_ROAD_H.y, w: 14, h: MONTREAL_ROAD_H2.y + MONTREAL_ROAD_H2.h - MONTREAL_ROAD_H.y };

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
  // The Jesuits' Gardens — moved up from y: 100 (which read more like a
  // second market-level plot) to sit right behind the back row, against
  // the wall itself, matching where the map actually draws it: a real
  // wedge running east from the Jesuit Church along the wall's own
  // angle, narrowing toward the tip — simplified here to a rectangle,
  // like every other garden plot in this file, rather than a tapered
  // shape drawGardenPlot doesn't support.
  { x: 545, y: 44, w: 85, h: 28 },
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
  // Côte Sainte-Catherine — past Mont-Royal itself and Lignères' Gardens
  // (MONTREAL_GARDEN_PLOTS' own north field entry ends at y: -212, clear
  // of this ground), flanking the same road (MONTREAL_DIRT_PATH_V,
  // extended) continuing north as a real côte in its own right rather
  // than the road just petering out at the old tree line.
  { x: 40, y: -430, w: 51, h: 174, tone: 0 },
  { x: 91, y: -430, w: 51, h: 174, tone: 1 },
  { x: 142, y: -430, w: 51, h: 174, tone: 2 },
  { x: 193, y: -430, w: 51, h: 174, tone: 0 },
  { x: 244, y: -430, w: 52, h: 174, tone: 1 },
  { x: 320, y: -430, w: 56, h: 174, tone: 2 },
  { x: 376, y: -430, w: 56, h: 174, tone: 0 },
  { x: 432, y: -430, w: 56, h: 174, tone: 1 },
  { x: 488, y: -430, w: 56, h: 174, tone: 2 },
  { x: 544, y: -430, w: 56, h: 174, tone: 0 },
];

// The rural track up to the Mont-Royal district (drawDirtPath, not the
// town's cut-stone streets) — picks up right where the brick MONTREAL_ROAD_V
// ends (its own y: 96, the north edge of the built-up town) and continues
// north into the field, then a short spur west to Fort de la Montagne.
// Extended again (top from -140 to -430) to carry on past the mountain
// as Côte Sainte-Catherine (MONTREAL_COTE_STE_CATHERINE_STRIPS, below) —
// one continuous road, not two, the same way the real one is.
const MONTREAL_DIRT_PATH_V = { x: 296, y: -430, w: 24, h: 526 };
const MONTREAL_DIRT_PATH_SPUR = { x: 60, y: -22, w: 250, h: 14 };
// A wayside calvaire (drawCalvaire) along Côte Sainte-Catherine, right
// on the road's own shoulder — a real, common roadside feature of
// Catholic farm parishes in this period, not a claim that this specific
// cross ever stood here.
const MONTREAL_CALVAIRE = { x: 284, y: -350 };
// Same idea, west out past the Récollets Gate toward the General
// Hospital and the Callières house — picks up at the west end of the
// front row (x: 15, roughly the Récollets buildings' own street
// frontage) and runs out to the world's own western edge.
const MONTREAL_DIRT_PATH_WEST = { x: MONTREAL_WORLD_LEFT, y: 148, w: 15 - MONTREAL_WORLD_LEFT, h: 14 };
// Same idea, east out past the east gate toward "The Fort" — picks up
// right where the wall's own gate opens (x: 648, the east wall's own
// outer face — MONTREAL_WALLS' own east segment, defined further down)
// and runs out to the world's own eastern edge.
const MONTREAL_DIRT_PATH_EAST = { x: 648, y: 100, w: MONTREAL_WORLD_RIGHT - 648, h: 14 };

// Le Passage de Longueuil — a real, long-documented canoe/ferry crossing
// from Montreal's own east end to Longueuil on the south shore, running
// for centuries before any bridge existed. A short stub of planking at
// the shore (not a full dock reaching into the water like the main one
// — this isn't a second reboard point, just a landmark) plus a moored
// canoe and a waiting ferryman. Kept short deliberately: DOCK_TOP to
// WATER_TOP only, so it never enters the y > WATER_TOP band isWalkable()
// otherwise restricts to the main dock's own width.
const MONTREAL_FERRY_LANDING = { x: 700, w: 26 };

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
// The real Water Gate, south wall, by the Parade — a second, genuinely
// distinct opening from the Market/St Mary's Gate cluster at the dock
// (MONTREAL_ONFOOT_BUILDINGS' own Parade comment), not just the one
// dock gate standing in for everything any more. Decorative/walkable
// only — the dock (MONTREAL_WALLS' own south segment, still the sole
// reboard point) stays the only functional water crossing.
const MONTREAL_WATER_GATE = { x0: 470, x1: 500 };

// gates is a list of [lo, hi] openings along the wall's own span — empty
// means solid, one entry a single gate, more than one a real multi-gate
// wall like the waterfront's below. wallSegments() (near drawSideWall)
// turns this into the solid stretches actually drawn/collided.
const MONTREAL_WALLS = [
  // North wall — unchanged: the one A Gate, where the district road
  // crosses (MONTREAL_WALL_GATE).
  {
    axis: 'h', lo: CITY_WALL_Y, hi: CITY_WALL_Y + CITY_WALL_H,
    spanLo: 0, spanHi: MONTREAL_WORLD_WIDTH,
    gates: [[MONTREAL_WALL_GATE.x0, MONTREAL_WALL_GATE.x1]],
  },
  // West wall — the Récollets Gate, right where the western suburb's
  // own street (MONTREAL_DIRT_PATH_WEST, y: 148-162) crosses in from
  // Maison Saint-Gabriel and the General Hospital.
  {
    axis: 'v', lo: -CITY_WALL_SIDE_W, hi: 0,
    spanLo: CITY_WALL_Y + CITY_WALL_H, spanHi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    gates: [[145, 167]],
  },
  // East wall — the real gate here (by the Arsenal) leads out to "The
  // Fort" (MONTREAL_EAST_FORT, below), same idea as the west's Récollets
  // Gate leading to the suburb. worldRight (MONTREAL_WORLD_RIGHT) is
  // what actually makes this ground reachable — without it the margin
  // check alone would've stopped the player right at the wall anyway.
  {
    axis: 'v', lo: 628, hi: 628 + CITY_WALL_SIDE_W,
    spanLo: CITY_WALL_Y + CITY_WALL_H, spanHi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    gates: [[96, 120]],
  },
  // South/waterfront wall — two real, distinct gates: the dock's own
  // width stands in for the Market/St Mary's Gate cluster by the wharf
  // (the only water-facing passage gameplay needs), and MONTREAL_WATER_
  // GATE, further east by the Parade, is the map's own separate Water
  // Gate — walkable, not another reboard point.
  {
    axis: 'h', lo: MONTREAL_WATERFRONT_WALL_Y, hi: MONTREAL_WATERFRONT_WALL_Y + MONTREAL_WATERFRONT_WALL_H,
    spanLo: 0, spanHi: MONTREAL_WORLD_WIDTH,
    gates: [
      [dockX0(MONTREAL_WORLD_WIDTH), dockX1(MONTREAL_WORLD_WIDTH)],
      [MONTREAL_WATER_GATE.x0, MONTREAL_WATER_GATE.x1],
    ],
  },
];

// Turns a wall's span + gates into the solid stretches actually drawn
// and collided — the gap-free complement of the gate list, sorted so
// unordered/overlapping gate entries still resolve sensibly.
function wallSegments(w) {
  const gates = [...w.gates].sort((a, b) => a[0] - b[0]);
  const segments = [];
  let cursor = w.spanLo;
  for (const [gLo, gHi] of gates) {
    if (gLo > cursor) segments.push([cursor, gLo]);
    cursor = Math.max(cursor, gHi);
  }
  if (cursor < w.spanHi) segments.push([cursor, w.spanHi]);
  return segments;
}

function buildingsForQuebecCity() {
  return QUEBEC_CITY_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'seminary' ? 24 : b.kind === 'church' ? 12 : 13,
    footHeight: b.kind === 'seminary' ? 18 : b.kind === 'church' ? 26 : 24,
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

function buildingsForTadoussac() {
  return TADOUSSAC_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'church' ? 12 : 13,
    footHeight: b.kind === 'church' ? 26 : 24,
  }));
}

function buildingsForKingston() {
  return KINGSTON_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'church' ? 12 : b.kind === 'ruinedfort' ? 20 : 13,
    footHeight: b.kind === 'church' ? 26 : b.kind === 'ruinedfort' ? 18 : 24,
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
// you've walked far enough past Mont-Royal. Pushed out again to the
// world's new edge (from y ~ -270) now that Côte Sainte-Catherine
// (MONTREAL_COTE_STE_CATHERINE_STRIPS, below) occupies the ground this
// line used to frame.
const MONTREAL_NORTH_TREE_SPOTS = [
  { x: -220, y: -448 }, { x: -140, y: -442 }, { x: -60, y: -450 },
  { x: 30, y: -444 }, { x: 100, y: -450 }, { x: 175, y: -442 }, { x: 340, y: -448 },
  { x: 420, y: -444 }, { x: 495, y: -450 }, { x: 565, y: -442 }, { x: 615, y: -448 },
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
// Scattered along Côte Sainte-Catherine (MONTREAL_COTE_STE_CATHERINE_
// STRIPS, below), clear of its own farm strips and the calvaire
// (MONTREAL_CALVAIRE) — the same hedgerow/windbreak read as the trees
// flanking Mont-Royal itself, not a second forest belt.
const MONTREAL_STE_CATHERINE_TREE_SPOTS = [
  { x: 60, y: -270 }, { x: 20, y: -340 }, { x: 60, y: -400 },
  { x: 260, y: -280 }, { x: 260, y: -400 },
  { x: 360, y: -270 }, { x: 360, y: -400 },
  { x: 560, y: -280 }, { x: 600, y: -370 },
];
// The open field past the east gate, around "The Fort" — scattered,
// clear of the fort's own footprint and the path leading to it, same
// "clearing, not a lawn" read as the rest of Montreal's own countryside.
const MONTREAL_EAST_TREE_SPOTS = [
  { x: 660, y: 40 }, { x: 690, y: 100 }, { x: 720, y: 30 },
  { x: 800, y: 35 }, { x: 830, y: 90 }, { x: 800, y: 110 }, { x: 850, y: 55 },
];
const MONTREAL_TREE_SPOTS = [
  ...clearOfDock([...TREE_SPOTS, ...TREE_SPOTS.map((t) => ({ x: MONTREAL_WORLD_WIDTH - t.x, y: t.y }))]),
  ...MONTREAL_NORTH_TREE_SPOTS,
  ...MONTREAL_DISTRICT_TREE_SPOTS,
  ...MONTREAL_STE_CATHERINE_TREE_SPOTS,
  ...MONTREAL_EAST_TREE_SPOTS,
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

// Gatineau only: the musket shop, mirrored off the repair shop's own
// placement (repairShopFor above) but on the opposite side of the dock —
// same "close to shore, different anchorY band than the procedural
// cabins" reasoning, so it never fights the seeded layout for a footprint
// either, and never collides with the repair shop since they're on
// opposite sides of the dock lane.
function musketShopFor(worldWidth) {
  return {
    isMusketShop: true,
    mirror: true,
    anchorX: dockX1(worldWidth) + 27,
    anchorY: WATER_TOP - 20,
    footHalfW: 13,
    footHeight: 22,
  };
}

// The musket master standing outside it — same "proximity alone" trigger
// as the Montréal gunsmith, offset toward the musket rack/pelts side of
// the shop rather than copying GUNSMITH_OFFSET's exact numbers (this
// building's door and details sit at different local coordinates).
const MUSKET_MASTER_OFFSET = { x: -3, y: 11 };
const MUSKET_MASTER_TRIGGER_RADIUS = 20;

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
const ruinedFortSprite = createRuinedFortSprite();
const seminarySprite = createSulpicianTowersSprite();
const montRoyalSprite = createMontRoyalSprite();
const montrealWindmillSprite = createWindmillSprite();
const repairShopSprite = createRepairShopSprite();
const gunShopSprite = createGunShopSprite();
const traderSprite = createTraderSprite();
const gunsmithSprite = createGunsmithSprite();
const musketShopSprite = createMusketShopSprite();
const musketMasterSprite = createMusketMasterSprite();
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
  if (b.isMusketShop) return musketShopSprite;
  if (b.kind === 'church') return churchSprite;
  if (b.kind === 'seminary') return seminarySprite;
  if (b.kind === 'windmill') return montrealWindmillSprite;
  if (b.kind === 'ruinedfort') return ruinedFortSprite;
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
// active world's own right/left extent, not always CANVAS_WIDTH/0 — see
// worldRight/worldLeft); over the water band they're restricted to the
// dock's width, i.e. walking the plank back out to the boat rather than
// into the river. dockX0/X1 still key off worldWidth specifically (the
// walled town's own fixed interior/dock-centring width), not worldRight
// (the separate, further-out exploration boundary). walls (null
// everywhere but Montreal — see MONTREAL_WALLS) is the full perimeter:
// each strip blocks its own band except at its own gate.
function isWalkable(buildings, x, y, worldWidth, worldTop, walls, worldLeft, worldRight) {
  if (x < worldLeft + 10 || x > worldRight - 10 || y < worldTop + 10 || y > CANVAS_HEIGHT - 4) return false;
  if (y > WATER_TOP && (x < dockX0(worldWidth) || x > dockX1(worldWidth))) return false;
  if (walls) {
    for (const w of walls) {
      const along = w.axis === 'h' ? x : y;
      const across = w.axis === 'h' ? y : x;
      if (across < w.lo || across > w.hi || along < w.spanLo || along > w.spanHi) continue;
      const inGate = w.gates.some(([lo, hi]) => along >= lo && along <= hi);
      if (!inGate) return false;
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

// An old field gun on its carriage — the one nod to Artillery Park's real
// name and real use (KINGSTON_WORLD_TOP's own comment) inside what's
// otherwise an invented green space, so the ground reads as repurposed,
// not as if a park had always stood there. Purely decorative, like the
// market well above — not solid, never blocks the player.
function drawCannon(ctx, cx, cy) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // wheels
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.arc(cx - 6, cy, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, cy, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5c4530';
  ctx.beginPath();
  ctx.arc(cx - 6, cy, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, cy, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // carriage
  ctx.fillStyle = '#4a3420';
  ctx.fillRect(cx - 7, cy - 6, 14, 5);
  // barrel, angled toward the town/water — the direction a real emplaced
  // gun here would have actually faced
  ctx.save();
  ctx.translate(cx, cy - 6);
  ctx.rotate(-0.4);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-2.2, -14, 4.4, 14);
  ctx.fillStyle = '#454545';
  ctx.fillRect(-2.2, -14, 1.6, 14);
  ctx.restore();
  ctx.restore();
}

// A wayside calvaire — a plain wooden roadside cross on a small stone
// base, the kind that genuinely marked farm roads like Côte Sainte-
// Catherine (MONTREAL_CALVAIRE's own comment) in Catholic New France,
// not a landmark specific to this one road. Purely decorative, like the
// market well above — not solid, never blocks the player.
function drawCalvaire(ctx, cx, cy) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 6, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // low stone cairn base
  ctx.fillStyle = '#6b6259';
  ctx.fillRect(cx - 5, cy - 5, 10, 6);
  ctx.fillStyle = '#847a6d';
  ctx.fillRect(cx - 5, cy - 6, 10, 2);
  // the cross itself
  ctx.fillStyle = '#4a3423';
  ctx.fillRect(cx - 1.5, cy - 30, 3, 25);
  ctx.fillRect(cx - 8, cy - 24, 16, 3);
  ctx.restore();
}

// The bandstand at KINGSTON_BANDSTAND_POS — a raised wooden deck, bunting
// along the front edge, a peaked, two-tone canopy resting on it with a
// small pennant on top (no support posts — see the canopy's own comment
// below). Purely decorative, like the cannon/calvaire above — not solid,
// never blocks the player. W is a lot wider than the first pass (48 -> 150,
// "I want the stage to be a lot wider... I want to see 5 band members
// playing on stage") — every other measurement below is derived from W
// rather than hardcoded, so it scales with it instead of drifting out of
// proportion (thin stretched bunting) the way a fixed bunting-count would.
function drawBandstand(ctx, cx, cy) {
  const W = 150, D = 22;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + D / 2 + 3, W / 2 + 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // riser — the deck's own height, shown as a dark band below its front edge
  ctx.fillStyle = '#33261a';
  ctx.fillRect(cx - W / 2, cy - D / 2 + 4, W, 9);

  // bunting swags along the front edge — the one unmistakable "bandstand"
  // cue at this scale, alternating triangles hung off the deck. Sized off
  // W (roughly one every 11px) rather than a fixed count, so they stay a
  // consistent size regardless of how wide the stage is.
  const buntColors = ['#9c3f34', '#e8dcc4'];
  const buntCount = Math.max(8, Math.round(W / 11));
  for (let i = 0; i < buntCount; i++) {
    const bw = W / buntCount;
    const bx = cx - W / 2 + bw * (i + 0.5);
    ctx.fillStyle = buntColors[i % 2];
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, cy + D / 2);
    ctx.lineTo(bx + bw / 2, cy + D / 2);
    ctx.lineTo(bx, cy + D / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }

  // deck
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(cx - W / 2, cy - D / 2, W, D);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  const plankCount = Math.max(5, Math.round(W / 15));
  for (let i = 1; i < plankCount; i++) {
    const px = cx - W / 2 + (W / plankCount) * i;
    ctx.beginPath();
    ctx.moveTo(px, cy - D / 2);
    ctx.lineTo(px, cy + D / 2);
    ctx.stroke();
  }

  // canopy — a shallow peaked roof, split into a dark/lit half for a cheap
  // sense of form (same trick as drawCannon's shaded barrel edge above).
  // Rise scales with W too — a wide roof this shallow would otherwise look
  // almost flat and stretched rather than genuinely peaked. Sits directly
  // on the deck's own top edge — no support posts any more ("remove the
  // pillars from the stage," requested explicitly after the wide-stage
  // pass added several along the front/back edges).
  const roofRise = 10 + W / 12;
  const roofBaseY = cy - D / 2;
  const roofPeakY = roofBaseY - roofRise;
  ctx.fillStyle = '#7a2622';
  ctx.beginPath();
  ctx.moveTo(cx - W / 2 - 4, roofBaseY);
  ctx.lineTo(cx, roofPeakY);
  ctx.lineTo(cx, roofBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9c3f34';
  ctx.beginPath();
  ctx.moveTo(cx, roofBaseY);
  ctx.lineTo(cx, roofPeakY);
  ctx.lineTo(cx + W / 2 + 4, roofBaseY);
  ctx.closePath();
  ctx.fill();

  // pennant on top
  ctx.strokeStyle = '#2b2018';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, roofPeakY);
  ctx.lineTo(cx, roofPeakY - 10);
  ctx.stroke();
  ctx.fillStyle = '#9c3f34';
  ctx.beginPath();
  ctx.moveTo(cx, roofPeakY - 10);
  ctx.lineTo(cx + 8, roofPeakY - 7);
  ctx.lineTo(cx, roofPeakY - 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// One musician, front-facing (toward the crowd/camera) — same base
// proportions as villages.js's drawDockGreeter but simpler (no facing
// mirror needed; they never move off the stage), plus an instrument-
// specific prop and a small time-driven "playing" motion so the band reads
// as performing, not just standing there holding things.
const BAND_COATS = ['#2f3a52', '#4a2f2f', '#2f4a3a', '#4a3f2f', '#3a2f4a'];
// Same idea as CROWD_SCALE above, sized against createGunsmithSprite()
// instead (16x26, effective height ~24px) — asked for explicitly ("the same
// size sprites as the gunsmith") after the band read as too small next to
// the now-CROWD_SCALE-sized audience. This figure's own undrawn height
// (feet to top of hat brim, ~13.2px) times this lands right around 24px.
const BAND_SCALE = 1.8;
function drawBandMember(ctx, x, y, time, seed, instrument, whiteHat = false) {
  // The middle band member is the dock greeter (KINGSTON_BAND_SPOTS' own
  // comment) — same coat colour as villages.js draws him in, plus the
  // crown block below that turns the plain brim into his top hat, same
  // shape drawDockGreeter uses for opts.topHat.
  const coat = whiteHat ? KINGSTON_GREETER_COAT : BAND_COATS[seed % BAND_COATS.length];
  const phase = seed * 1.7;
  const play = Math.sin(time * 6 + phase); // -1..1, generic "mid-note" motion
  const bob = Math.sin(time * 2.2 + phase) * 0.3;
  const fx = Math.round(x);
  const fy = Math.round(y + bob);

  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(BAND_SCALE, BAND_SCALE);
  ctx.translate(-fx, -fy);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(fx, fy + 1, 3.4, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#241f1a'; // legs
  ctx.fillRect(fx - 1.8, fy - 3.6, 1.4, 3.6);
  ctx.fillRect(fx + 0.4, fy - 3.6, 1.4, 3.6);

  ctx.fillStyle = coat; // coat
  ctx.fillRect(fx - 2.2, fy - 9.2, 4.4, 5.8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(fx - 2.2, fy - 9.2, 1.1, 5.8);

  ctx.fillStyle = '#e2b688'; // head
  ctx.fillRect(fx - 1.5, fy - 12.4, 3, 3);
  ctx.fillStyle = whiteHat ? KINGSTON_GREETER_HAT : '#241f1a'; // hat brim
  ctx.fillRect(fx - 2, fy - 13.2, 4, 1.4);
  if (whiteHat) { // top hat crown — same shape as drawDockGreeter's opts.topHat
    ctx.fillRect(fx - 1.5, fy - 16.2, 3, 3);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(fx - 1.5, fy - 16.2, 1.1, 3);
  }

  ctx.strokeStyle = coat;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  if (instrument === 'fiddle') {
    // bow arm sawing back and forth across the strings
    const bx = fx + 2.6 + play * 1.6;
    const by = fy - 8 - Math.abs(play) * 0.6;
    ctx.beginPath();
    ctx.moveTo(fx + 1.6, fy - 7.6);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = '#c9a45c';
    ctx.beginPath();
    ctx.moveTo(fx - 2.4, fy - 9.6);
    ctx.lineTo(fx + 2.4, fy - 8.4);
    ctx.stroke();
  } else if (instrument === 'drum') {
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(fx - 2.2, fy - 6.6, 4.4, 2.8);
    ctx.strokeStyle = '#241f1a';
    ctx.lineWidth = 0.9;
    const sx = fx + play * 1.6;
    ctx.beginPath();
    ctx.moveTo(fx, fy - 7.4);
    ctx.lineTo(sx, fy - 9.4);
    ctx.stroke();
  } else if (instrument === 'concertina') {
    // the bellows stretching in and out
    ctx.fillStyle = '#5c3a24';
    const sq = 2 + Math.abs(play) * 0.8;
    ctx.fillRect(fx - sq / 2, fy - 8.4, sq, 3.2);
  } else if (instrument === 'fife') {
    ctx.strokeStyle = '#c9a45c';
    ctx.beginPath();
    ctx.moveTo(fx - 0.4, fy - 11.6);
    ctx.lineTo(fx + 3.4, fy - 10.6);
    ctx.stroke();
  } else {
    // standing bass, a big rounded shape beside the figure — the one
    // instrument not actually held, so no arm/prop motion for this one
    ctx.fillStyle = '#5c3a24';
    ctx.beginPath();
    ctx.ellipse(fx + 3, fy - 6, 2.2, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// One onlooker in the crowd, seen from behind (facing the stage, away from
// the usual top-down viewpoint) — deliberately simpler than
// drawBandMember: no face, no instrument, no arm, just a back/coat/head
// silhouette with a slight idle sway, cheap enough to draw a couple dozen
// of without it reading as identical figures copy-pasted (seed varies the
// coat colour/phase, same idea as villages.js's GREETER_COATS).
const CROWD_COATS = ['#5a4a3a', '#3a4a5a', '#4a5a3a', '#5a3a4a', '#3a3a3a', '#6a5a3a', '#3a5a5a'];
// Scales the whole hand-drawn figure up about its own feet (same
// translate/scale/translate trick villages.js's drawDockGreeter uses) to
// roughly match createTraderSprite()'s own size (sprites.js, 14x22, drawn
// with its bottom ~2px above its own anchor point — repairShopFor's "boat
// repair guy") — asked for explicitly ("the same size sprites as the boat
// repair guy") after the crowd's first pass read as noticeably smaller.
// 1.7x: this figure's own undrawn height (feet to top of head, ~11.6px) times
// this lands right around the trader sprite's ~20px effective height.
const CROWD_SCALE = 1.7;
function drawCrowdFigure(ctx, x, y, time, seed) {
  const coat = CROWD_COATS[seed % CROWD_COATS.length];
  const phase = seed * 2.3;
  const bob = Math.sin(time * 1.6 + phase) * 0.25;
  const fx = Math.round(x);
  const fy = Math.round(y + bob);

  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(CROWD_SCALE, CROWD_SCALE);
  ctx.translate(-fx, -fy);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(fx, fy + 1, 3, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#241f1a'; // legs
  ctx.fillRect(fx - 1.6, fy - 3.2, 1.3, 3.2);
  ctx.fillRect(fx + 0.3, fy - 3.2, 1.3, 3.2);

  ctx.fillStyle = coat; // coat back
  ctx.fillRect(fx - 2, fy - 8.6, 4, 5.4);

  ctx.fillStyle = '#c9a06a'; // back of the head/neck
  ctx.fillRect(fx - 1.4, fy - 11.6, 2.8, 3);

  if (seed % 3 !== 0) { // not everyone wears a hat
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(fx - 1.8, fy - 12.2, 3.6, 1.3);
  }
  ctx.restore();
}

export function createVillageScene() {
  let strideTimer = 0;
  let strideFrame = 0;
  // A free-running clock (never reset, unlike strideTimer) purely for
  // decorative idle motion — Kingston's band/crowd today, drawBandMember/
  // drawCrowdFigure's own sway and "playing" motion. Harmless in every
  // other village since nothing reads it there.
  let ambientTime = 0;
  let facingLeft = false;
  let worldWidth = CANVAS_WIDTH;
  let worldTop = 0;
  let worldLeft = 0;
  let worldRight = CANVAS_WIDTH;
  let walls = null;
  let repairShop = repairShopFor(worldWidth);
  let buildings = [...buildingsFor(0), repairShop];
  let trees = treesFor(0);
  let isQuebecCity = false;
  let isTroisRivieres = false;
  let isMontreal = false;
  let isTadoussac = false;
  let isKingston = false;
  let wasNearTrader = false;
  let traderPos = traderPosFor(repairShop);
  let reboardZone = { x0: dockX0(worldWidth), x1: dockX1(worldWidth), y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };
  // The gunsmith who stands outside the Montréal gun shop — his scene
  // position, worked out from the gun shop building on enter(). null in
  // every other village (no gun shop, nobody to draw or range-check).
  let gunsmithPos = null;
  let wasNearGunsmith = false;
  // The musket master outside Gatineau's own shop — same idea as
  // gunsmithPos, null everywhere but Gatineau.
  let musketMasterPos = null;
  let wasNearMusketMaster = false;
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
      isTadoussac = village && village.name === 'Tadoussac';
      isKingston = village && village.name === 'Kingston';
      const isGatineau = village && village.name === 'Gatineau';
      worldWidth = isMontreal ? MONTREAL_WORLD_WIDTH : isQuebecCity ? QUEBEC_WORLD_WIDTH : CANVAS_WIDTH;
      worldTop = isMontreal ? MONTREAL_WORLD_TOP : isKingston ? KINGSTON_WORLD_TOP : 0;
      worldLeft = isMontreal ? MONTREAL_WORLD_LEFT : 0;
      // worldRight tracks worldWidth (not always CANVAS_WIDTH) so Québec's
      // own wider world is actually walkable edge to edge — every other
      // village still has worldWidth === CANVAS_WIDTH, so this changes
      // nothing for them.
      worldRight = isMontreal ? MONTREAL_WORLD_RIGHT : worldWidth;
      walls = isMontreal ? MONTREAL_WALLS : isQuebecCity ? QUEBEC_CITY_WALLS : null;
      repairShop = repairShopFor(worldWidth);
      buildings = isQuebecCity
        ? [...buildingsForQuebecCity(), repairShop]
        : isTroisRivieres
        ? [...buildingsForTroisRivieres(), repairShop]
        : isMontreal
        ? [...buildingsForMontreal(), repairShop]
        : isTadoussac
        ? [...buildingsForTadoussac(), repairShop]
        : isKingston
        ? [...buildingsForKingston(), repairShop]
        : [...buildingsFor(seed), repairShop];
      // Gatineau's own musket shop is layered on top of whichever branch
      // above ran (the plain procedural one, same as every other ordinary
      // village) rather than replacing it with a bespoke layout the way
      // Montréal/Québec City/Trois-Rivières/Tadoussac get — it's one extra
      // fixed building, not a whole rebuilt town.
      if (isGatineau) buildings = [...buildings, musketShopFor(worldWidth)];
      const treeSpots = isMontreal
        ? MONTREAL_TREE_SPOTS
        : isKingston
        ? [...TREE_SPOTS, ...KINGSTON_PARK_TREE_SPOTS]
        : TREE_SPOTS;
      trees = treesClearOfBuildings(treesFor(seed, treeSpots), buildings);
      traderPos = traderPosFor(repairShop);
      reboardZone = { x0: dockX0(worldWidth), x1: dockX1(worldWidth), y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };
      const gunShop = buildings.find((b) => b.isGunShop) || null;
      gunsmithPos = gunShop
        ? { x: gunShop.anchorX + GUNSMITH_OFFSET.x, y: gunShop.anchorY + GUNSMITH_OFFSET.y }
        : null;
      wasNearGunsmith = false;
      const musketShop = buildings.find((b) => b.isMusketShop) || null;
      musketMasterPos = musketShop
        ? { x: musketShop.anchorX + MUSKET_MASTER_OFFSET.x, y: musketShop.anchorY + MUSKET_MASTER_OFFSET.y }
        : null;
      wasNearMusketMaster = false;
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

    // Returns { reboard, tradeRequested, gunsmithMet, musketMasterMet }:
    // reboard is true the moment the player steps into the reboard zone;
    // the other three are each true for one frame only, the moment the
    // player first comes within range of the repair trader / the Montréal
    // gunsmith / Gatineau's musket master (not held true the whole time
    // they stand there, so game.js can treat each as a single action per
    // approach rather than repeating it every frame).
    update(dt, keys) {
      ambientTime += dt;
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
        if (isWalkable(buildings, nx, player.y, worldWidth, worldTop, walls, worldLeft, worldRight)) player.x = nx;
        if (isWalkable(buildings, player.x, ny, worldWidth, worldTop, walls, worldLeft, worldRight)) player.y = ny;

        strideTimer += dt;
        if (strideTimer > 0.28) {
          strideTimer = 0;
          strideFrame = 1 - strideFrame;
        }
      } else {
        strideTimer = 0;
      }

      // The camera follows the player on both axes, clamped so it never
      // scrolls past the world's own edges — [0, 0] when worldRight ===
      // CANVAS_WIDTH, worldTop === 0, and worldLeft === 0 (every village
      // but Montreal), which pins the camera at (0, 0) always and
      // reproduces the old fixed-screen framing exactly.
      camera.x = Math.max(worldLeft, Math.min(worldRight - CANVAS_WIDTH, player.x - CANVAS_WIDTH / 2));
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

      let musketMasterMet = false;
      if (musketMasterPos) {
        const nearMusketMaster = Math.hypot(player.x - musketMasterPos.x, player.y - musketMasterPos.y) < MUSKET_MASTER_TRIGGER_RADIUS;
        musketMasterMet = nearMusketMaster && !wasNearMusketMaster;
        wasNearMusketMaster = nearMusketMaster;
      }

      return { reboard, tradeRequested, gunsmithMet, musketMasterMet };
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
        drawBrickRoad(ctx, MONTREAL_ROAD_V4.x, MONTREAL_ROAD_V4.y, MONTREAL_ROAD_V4.w, MONTREAL_ROAD_V4.h);
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
        drawCalvaire(ctx, MONTREAL_CALVAIRE.x, MONTREAL_CALVAIRE.y);
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
        // Same, east out past the east gate toward "The Fort".
        drawDirtPath(ctx, MONTREAL_DIRT_PATH_EAST.x, MONTREAL_DIRT_PATH_EAST.y, MONTREAL_DIRT_PATH_EAST.w, MONTREAL_DIRT_PATH_EAST.h);
      }

      // Québec City's own streets — Place Royale (cobbled, by the harbour),
      // Côte de la Montagne climbing up through the cliff's one gate, and
      // Place d'Armes (packed earth — a parade ground, not a market) at the
      // top, plus the two garden plots. Same ground-layer pass as
      // Montréal's own streets, drawn before the dock/buildings/player.
      if (isQuebecCity) {
        drawBrickRoad(ctx, QUEBEC_PLACE_ROYALE.x, QUEBEC_PLACE_ROYALE.y, QUEBEC_PLACE_ROYALE.w, QUEBEC_PLACE_ROYALE.h);
        drawBrickRoad(ctx, QUEBEC_ROAD_V.x, QUEBEC_ROAD_V.y, QUEBEC_ROAD_V.w, QUEBEC_ROAD_V.h);
        drawDirtPath(ctx, QUEBEC_PLACE_DARMES.x, QUEBEC_PLACE_DARMES.y, QUEBEC_PLACE_DARMES.w, QUEBEC_PLACE_DARMES.h);
        for (const g of QUEBEC_GARDEN_PLOTS) drawGardenPlot(ctx, g.x, g.y, g.w, g.h);
      }

      // Tadoussac's own track (TADOUSSAC_PATH's own comment — traced from
      // the map itself, not invented), connecting the trading post to the
      // dwelling cluster, with a short spur up to the chapel door.
      if (isTadoussac) {
        drawDirtPath(ctx, TADOUSSAC_PATH.x, TADOUSSAC_PATH.y, TADOUSSAC_PATH.w, TADOUSSAC_PATH.h);
        drawDirtPath(ctx, TADOUSSAC_CHAPEL_SPUR.x, TADOUSSAC_CHAPEL_SPUR.y, TADOUSSAC_CHAPEL_SPUR.w, TADOUSSAC_CHAPEL_SPUR.h);
      }

      // Kingston's own street grid, traced off the survey (see
      // KINGSTON_ROAD_H1's own comment) — two avenues running the width of
      // the grid, the main road straight off the dock crossing both, two
      // cross streets flanking it, and the Market Square (with its own
      // well, same prop Montréal's own square uses) straddling the main
      // road between the avenues.
      if (isKingston) {
        drawBrickRoad(ctx, 0, KINGSTON_ROAD_H1.y, worldWidth, KINGSTON_ROAD_H1.h);
        drawBrickRoad(ctx, 0, KINGSTON_ROAD_H2.y, worldWidth, KINGSTON_ROAD_H2.h);
        drawBrickRoad(ctx, KINGSTON_MAIN_ROAD_V.x, KINGSTON_MAIN_ROAD_V.y, KINGSTON_MAIN_ROAD_V.w, KINGSTON_MAIN_ROAD_V.h);
        drawBrickRoad(ctx, KINGSTON_CROSS_ROAD_W.x, KINGSTON_CROSS_ROAD_W.y, KINGSTON_CROSS_ROAD_W.w, KINGSTON_CROSS_ROAD_W.h);
        drawBrickRoad(ctx, KINGSTON_CROSS_ROAD_E.x, KINGSTON_CROSS_ROAD_E.y, KINGSTON_CROSS_ROAD_E.w, KINGSTON_CROSS_ROAD_E.h);
        drawBrickRoad(ctx, KINGSTON_MARKET_SQUARE.x, KINGSTON_MARKET_SQUARE.y, KINGSTON_MARKET_SQUARE.w, KINGSTON_MARKET_SQUARE.h);
        drawMarketWell(ctx, KINGSTON_MARKET_WELL_CENTER.x, KINGSTON_MARKET_WELL_CENTER.y);
        // Artillery Park, north of the grid (KINGSTON_WORLD_TOP's own
        // comment) — packed earth, not brick, the same distinction Québec
        // City's own Place d'Armes draws against its cobbled Place Royale:
        // a quieter, less formal ground than the paved town streets.
        drawDirtPath(ctx, KINGSTON_PARK_PATH.x, KINGSTON_PARK_PATH.y, KINGSTON_PARK_PATH.w, KINGSTON_PARK_PATH.h);
        drawCannon(ctx, KINGSTON_CANNON_POS.x, KINGSTON_CANNON_POS.y);
        // The bandstand itself, same fixed-before-everything pass as the
        // cannon/market well above — deliberately NOT in the y-sorted
        // drawOrder below with the band members/crowd/player. It used to be
        // sorted by a single point near its own front edge, but the
        // structure spans a much taller range (deck up through the roof)
        // than any single y can represent, so the band members standing ON
        // the deck (their own sort-y, up near the roof end of that range)
        // kept losing the sort to the stage and rendering underneath it —
        // reported as "I can't see the band on the stage." Drawing the
        // whole structure first/always-behind, the same way the cannon
        // already is, fixes that outright: nothing drawn afterwards (band,
        // crowd, player) can ever be occluded by it.
        drawBandstand(ctx, KINGSTON_BANDSTAND_POS.x, KINGSTON_BANDSTAND_POS.y);
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

      // Le Passage de Longueuil (MONTREAL_FERRY_LANDING's own comment) —
      // a short stub of planking at the shore, east of the wall, plus a
      // moored canoe. Not a second reboard point, so it stops at
      // WATER_TOP rather than reaching CANVAS_HEIGHT the way the real
      // dock above does.
      if (isMontreal) {
        const fX0 = MONTREAL_FERRY_LANDING.x, fX1 = fX0 + MONTREAL_FERRY_LANDING.w;
        ctx.fillStyle = '#3f2b1a';
        ctx.fillRect(fX0 - 1, DOCK_TOP - 1, fX1 - fX0 + 2, WATER_TOP - DOCK_TOP + 1);
        ctx.fillStyle = '#8a5a34';
        ctx.fillRect(fX0, DOCK_TOP, fX1 - fX0, WATER_TOP - DOCK_TOP);
        ctx.strokeStyle = '#5f3b20';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fX0, DOCK_TOP + 6);
        ctx.lineTo(fX1, DOCK_TOP + 6);
        ctx.stroke();
        ctx.save();
        ctx.translate((fX0 + fX1) / 2, WATER_TOP + 4);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(parkedCanoeSprite, -parkedCanoeSprite.width / 2, -parkedCanoeSprite.height / 2);
        ctx.restore();
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
        for (const [s0, s1] of wallSegments(west)) drawSideWall(ctx, west.lo, s0, west.hi - west.lo, s1 - s0, 'w');
        for (const [s0, s1] of wallSegments(east)) drawSideWall(ctx, east.lo, s0, east.hi - east.lo, s1 - s0, 'e');
        for (const [s0, s1] of wallSegments(south)) drawWaterfrontWall(ctx, s0, south.lo, s1 - s0, south.hi - south.lo);
      }
      // The cliff itself, standing in for the four riverfront batteries
      // (Vaudreuil/Dauphine/Royale/du Château) — a real obstacle
      // (QUEBEC_CITY_WALLS, checked by isWalkable() above), same
      // waterfront-wall styling as Montréal's own south wall since both
      // read as "battlements facing the river."
      if (isQuebecCity) {
        const [cliff] = QUEBEC_CITY_WALLS;
        for (const [s0, s1] of wallSegments(cliff)) drawWaterfrontWall(ctx, s0, cliff.lo, s1 - s0, cliff.hi - cliff.lo);
        // Redoute du Cap au Diamant / Cavalier du Moulin — decorative
        // outworks at the point (QUEBEC_CITADEL_TILES' own comment).
        for (const t of QUEBEC_CITADEL_TILES) ctx.drawImage(rampartSprite, t.x, t.y);
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
        ...(musketMasterPos ? [{
          y: musketMasterPos.y,
          draw: (c) => c.drawImage(musketMasterSprite, musketMasterPos.x - musketMasterSprite.width / 2, musketMasterPos.y - musketMasterSprite.height + 2),
        }] : []),
        // The ferryman waiting at Le Passage de Longueuil — purely
        // decorative (no trigger, unlike the trader/gunsmith), reusing
        // the trader's own sprite rather than a bespoke one.
        ...(isMontreal ? [{
          y: WATER_TOP - 4,
          draw: (c) => c.drawImage(traderSprite, MONTREAL_FERRY_LANDING.x + MONTREAL_FERRY_LANDING.w + 6 - traderSprite.width / 2, WATER_TOP - 4 - traderSprite.height + 2),
        }] : []),
        // The band and its crowd in Artillery Park — purely cosmetic
        // ("nothing interactive"), sorted into this same pass so the player
        // correctly walks in front of/behind them depending on position,
        // same reasoning as every other entry here. The bandstand structure
        // itself is NOT here any more — see its own drawBandstand() call
        // above, in the fixed always-behind pass with the cannon/market
        // well, and that call's own comment for why.
        ...(isKingston ? [
          ...KINGSTON_BAND_SPOTS.map((b, i) => ({
            y: KINGSTON_BANDSTAND_POS.y + b.dy,
            draw: (c) => drawBandMember(c, KINGSTON_BANDSTAND_POS.x + b.dx, KINGSTON_BANDSTAND_POS.y + b.dy, ambientTime, i, b.instrument, b.whiteHat),
          })),
          ...KINGSTON_CROWD_SPOTS.map((p, i) => ({
            y: p.y,
            draw: (c) => drawCrowdFigure(c, p.x, p.y, ambientTime, i),
          })),
        ] : []),
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
