// Villages along the river, one at each real waypoint from world/river/route.js
// (except the put-in). Each has a small dock sticking out into the channel
// — run the canoe into one and game.js sends the player ashore instead of
// taking damage — plus a handful of log buildings on the bank behind it.
import { CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, braidAt } from './river/path.js';
import { hashRange } from '../shared/hash.js';
import { VILLAGES } from './river/route.js';
import {
  createCabinSprite, createPineTreeSprite, createRepairShopSprite,
  createStoneBuildingSprite, createChurchSprite, createRampartSprite, createIslandSprite,
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
//
// That reasoning held when it was written but stopped being true as the
// game's own geography grew: a lot of real stretches (lawrenceEast/West
// routinely run 40-57 units wide; several Rideau reaches do too — see
// GENERIC_DOCK_REACH_FRACTION's own comment) are far wider than "half of
// DOCK_LENGTH=6" was ever calibrated against. Reported as "cannot find the
// dock" on Newboro specifically, but the same fixed 6-unit reach applied
// to every ordinary village regardless of the real channel width there —
// on the wider stretches a dock this small read as a barely-there sliver,
// nowhere near reaching the "correct half of the river" the comment above
// assumed. These three stay as the floor for narrow rivers (where they
// already worked); genericDockReach()/genericDockWidthZ()/
// genericDockHitZ() below now scale up from here with the real channel
// width for everything wider.
const DOCK_LENGTH = 6; // world units the dock reaches from shore into the channel
const DOCK_WIDTH_Z = 2.2; // dock's own extent along the river's flow axis
const DOCK_HIT_Z = 1.3; // how close (in flowDistance) counts as "touching" the dock
// Half the channel's own width, similar in spirit to Quebec City's dock
// reaching "~72% of the full channel width" (see QUEBEC_CITY_DOCK_REACH's
// own comment) — not pushed that far here, and deliberately NOT split the
// difference either: a first pass at 0.5 reached the hit zone (dockReach,
// via hitsDock()'s worldX bounds) past centerX on several real stretches,
// which is a *different* problem than visibility — it meant simply holding
// a roughly-centred course auto-docked at every village passed on the
// correct side, with no need to actually steer toward the bank at all.
// Caught by three unrelated smoke-test failures (the fjord/lawrenceWest
// mouth crossing snagging on Tadoussac's own dock — its flowDistance sits
// exactly at MOUTH_DISTANCE — and a loup-garou dodge run snagging on
// Beaupré's), not by anything Rideau/Kingston-specific, so this wasn't a
// narrow edge case. GENERIC_DOCK_WIDTH_Z_FRACTION below is the one that
// actually addresses "hard to find" without that risk — it's pure
// rendering size (the drawn rectangle's extent along the shore/flow axis,
// see dockWidthZ()), never checked by hitsDock() at all, so it can scale
// generously with zero effect on where the hit zone actually is. REACH and
// HIT_Z stay modest — enough to meaningfully close the gap on wide rivers
// without turning "paddle roughly down the middle" into "dock everywhere."
const GENERIC_DOCK_REACH_FRACTION = 0.22;
const GENERIC_DOCK_WIDTH_Z_FRACTION = 0.24;
const GENERIC_DOCK_HIT_Z_FRACTION = 0.06;

// Quebec City's dock isn't a village pier at all — it's the King's Wharf, a
// working port for the capital, and it's drawn to match: a genuinely huge
// stone quay reaching deep across the channel (well past the centerline,
// per an explicit request to make it "so big I cannot miss" after a more
// modest oversizing still wasn't visible/findable enough), wide along the
// shore to match, easy to spot from the moment Quebec City comes into view.
const QUEBEC_CITY_DOCK_REACH = 32; // ~72% of the full ~44-unit channel width, vs. ~6 everywhere else
const QUEBEC_CITY_DOCK_WIDTH_Z = 12; // vs. 2.2 everywhere else
const QUEBEC_CITY_DOCK_HIT_Z = 7; // vs. 1.3 everywhere else

// Montreal's dock — the great inland port, commercial heart of New France.
// Sits in the south (main) channel now that the Island of Montreal splits
// the river here (river/islands.js) — that channel is ~22-30 units across
// this span (deliberately kept close to a normal stretch's width — see
// islands.js's MONTREAL_ISLAND_KEYFRAMES comment on why it's *not* boosted
// wider than that), so 16 units still reaches much further than the
// default DOCK_LENGTH (6) without crowding the channel.
const MONTREAL_DOCK_REACH = 16;
const MONTREAL_DOCK_WIDTH_Z = 14; // wider along the shore
const MONTREAL_DOCK_HIT_Z = 8; // generous hit zone

// A second, smaller pier on the island's *north* edge, facing the
// Rivière des Prairies — real Montreal's harbour has wharves on both
// sides of the island, not just the St. Lawrence one. Sized down from the
// main dock to fit the narrower north channel (~7-27 units across this
// span, ~11 right at Montreal's own flowDistance — see river/islands.js)
// and to read as the secondary crossing it is.
const MONTREAL_NORTH_DOCK_REACH = 6;
const MONTREAL_NORTH_DOCK_WIDTH_Z = 8;
const MONTREAL_NORTH_DOCK_HIT_Z = 5;

// Kingston's dock is the journey's end, not a village pier to pass through
// — it used to be marked by a separate bridge structure upstream (removed;
// see git history), but a bridge is still just a landmark you have to
// separately notice and then still find the dock past it. Simpler to make
// the dock itself the unmissable "you've arrived" moment, same oversizing
// as Quebec City's King's Wharf (QUEBEC_CITY_DOCK_REACH above) rather than
// inventing a second one-off.
const KINGSTON_DOCK_REACH = 30; // ~ Quebec City's own reach, channel here is a similar width
const KINGSTON_DOCK_WIDTH_Z = 12;
const KINGSTON_DOCK_HIT_Z = 7;

// A synthetic village-like object for that second pier: same flowDistance/
// seed/name as the real Montreal (so every island-geometry helper above —
// bankEdge/reachSign/inlandSign/shoreEdgeAt/clampToIsland — treats it as
// "Montreal, on the island" exactly like the real one), just the opposite
// side. Only dockReach/dockWidthZ/dockHitZ below branch on `side` too, to
// give it its own smaller footprint.
function montrealNorthTwin(v) {
  return { ...v, side: -v.side };
}

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

// Trois-Rivieres — founded 1634, by 1790 a 156-year-old established town
// and seat of regional government. Second in importance only to Quebec City
// and Montréal. Gets its own hand-authored layout showing ~12 stone buildings
// spread along the waterfront at the confluence of three river mouths.
const TROIS_RIVIERES_SPAN = 14; // half-width along riverbank
function buildTroisRivieresBuildings() {
  const buildings = [];
  // Main waterfront row - government buildings, trading posts, residences
  for (let i = 0; i < 12; i++) {
    const t = (i / 11) * 2 - 1; // -1 to 1 spread
    const dOffset = t * TROIS_RIVIERES_SPAN + Math.sin(i * 1.9) * 1.2;
    const depth = 1.5 + ((Math.sin(i * 1.3) + 1) / 2) * 2.5; // 1.5-4 units deep
    buildings.push({ dOffset, depth, variant: i % 3, mirror: i % 2 === 1 });
  }
  return buildings;
}
const TROIS_RIVIERES_BUILDINGS = buildTroisRivieresBuildings();
// Ursuline convent (built 1697) - set back from waterfront
const TROIS_RIVIERES_CONVENT = { dOffset: 2, depth: 5.2 };

// Tadoussac — not a big town (villageLayout()'s usual 3-5 buildings would
// undersell it), but a real, continuously-worked fur-trade post since 1600
// and the three-way junction the whole river forks at, so it earns a hand-
// authored spread too, just a modest one: two real landmarks plus a small
// handful of ordinary dwellings, not Trois-Rivières' full waterfront row.
// Shaped after "Plan de la Ville de Quebec"'s own 1600-era depiction of the
// harbour (tadoussac-1970s.jpg, gitignored — a reference image only, and
// despite the filename actually a ~1600 chart centred on "l'abitation du
// Capitaine Chauvin de l'an 1600," the original trading post) — real
// geography (a point at one end, a sheltered cove at the other) carried
// forward, real buildings updated to what would actually be standing in
// this game's 1790: the original 1600 post is long gone, but Tadoussac
// never stopped trading — it became a King's Posts (Domaine du Roi) post
// in 1720, under British leaseholders since the Conquest (Dunn, Gray &
// Murray held the lease 1762-86; the North West Company's own lease doesn't
// start until 1802, so no NWC branding here). "trading post" is kept
// generic rather than naming a specific 1790 leaseholder that hasn't been
// independently confirmed for that exact year.
const TADOUSSAC_SPAN = 9; // half-width along riverbank — modest, not Trois-Rivières' 14
const TADOUSSAC_BUILDINGS = [
  // The King's Posts trading post, on the point — the dominant structure,
  // same real site the 1600 map centres on.
  { dOffset: -7, depth: 2.0, variant: 2, mirror: false },
  { dOffset: -5, depth: 3.2, variant: 0, mirror: true }, // its own warehouse/outbuilding
  // A small cluster of trader/fisher dwellings near the cove (the map's own
  // small-house grouping), the other end of the span from the post.
  { dOffset: 2.5, depth: 1.8, variant: 1, mirror: false },
  { dOffset: 4.5, depth: 2.6, variant: 2, mirror: true },
  { dOffset: 6.5, depth: 1.6, variant: 0, mirror: false },
  { dOffset: 8.0, depth: 2.8, variant: 1, mirror: true },
];
// The Tadoussac Chapel — built 1747 by the Jesuits, the oldest wooden
// church in North America and still standing today, so unambiguously
// present by 1790. Set back and central, between the post and the
// dwellings, the same "rises over the row in front of it" skyline read
// every other village's church gets.
const TADOUSSAC_CHAPEL = { dOffset: -1.5, depth: 5.5 };

// Quebec City — a real 1790s colonial capital, not another fur-trade
// village, so it gets its own hand-authored layout instead of
// villageLayout()'s small random cluster — shaped after an actual 1790
// map of the city (Lower Town hugging the waterfront, Upper Town set back
// on the bluff behind it, the fortification wall further back still, and a
// fortified point at one end standing in for Cape Diamond's citadel) rather
// than a single undifferentiated row. Real Quebec City's walls ran along
// the *landward* side, guarding the plains approach — the riverfront itself
// was open, unwalled Lower Town — so the wall here sits behind the whole
// town, not along the water's edge. Functionally still just scenery for now
// (see the module comment) — the dock/repair shop below works exactly the
// same as every other village; only what's drawn behind it changes.
const stoneSprites = [0, 1, 2].map(createStoneBuildingSprite);
const churchSprite = createChurchSprite();
const rampartSprite = createRampartSprite();
const islandSprite = createIslandSprite();

// Montreal — New France's great commercial capital and inland port, larger
// and more prosperous than Quebec City by 1790. Founded 1642, sits at the
// confluence of the St. Lawrence and Ottawa rivers (the gateway to the Great
// Lakes fur trade). Three bands: waterfront warehouses and merchant buildings,
// middle commercial district, and upper residential quarter — 18 buildings
// total showing its status as the colony's economic heart.
const MONTREAL_SPAN = 28; // even wider spread than Quebec City
const MONTREAL_BANDS = [
  { count: 7, depthMin: 1.6, depthMax: 2.8, salt: 0 },    // waterfront warehouses/trading posts
  { count: 6, depthMin: 3.8, depthMax: 5.4, salt: 100 },  // commercial district
  { count: 5, depthMin: 6.2, depthMax: 8.0, salt: 200 },  // upper residential quarter
];
function buildMontrealBuildings() {
  const buildings = [];
  for (const band of MONTREAL_BANDS) {
    for (let i = 0; i < band.count; i++) {
      const t = band.count > 1 ? (i / (band.count - 1)) * 2 - 1 : 0;
      const salted = i + band.salt;
      const dOffset = t * MONTREAL_SPAN + Math.sin(salted * 2.1) * 1.9;
      const depth = band.depthMin + ((Math.sin(salted * 1.8) + 1) / 2) * (band.depthMax - band.depthMin);
      buildings.push({ dOffset, depth, variant: salted % stoneSprites.length, mirror: i % 2 === 1 });
    }
  }
  return buildings;
}
const MONTREAL_BUILDINGS = buildMontrealBuildings();
// The old Notre-Dame church (built 1672-1683) - the city's spiritual
// center, set back above the commercial district. Not the present-day
// Notre-Dame Basilica, which is a ~1820s replacement — this game is set
// in 1790, when the older stone church was still the one standing.
const MONTREAL_CHURCH = { dOffset: 4, depth: 8.8 };

const QUEBEC_CITY_SPAN = 24; // half-width of the town along the riverbank, world units
const QUEBEC_CITY_RAMPART_SPACING = 4.2; // ≈ the rampart sprite's own drawn width, so segments tile edge to edge
const QUEBEC_CITY_RAMPART_DEPTH = 9.5; // set back behind every building — a skyline backdrop, not a waterfront wall

// Positions are given directly in world units (dOffset along the river,
// depth inland from the bank) rather than villageLayout()'s -1..1
// normalized scheme — that scheme assumes a small handful of buildings
// jittered within a few units of the dock, nowhere near the spread a real
// town needs. The sine-based depth/offset variation is deliberate, fixed
// texture (every load looks the same, matching how villageLayout() is
// itself seeded/deterministic), not true randomness. Two bands, each
// spanning the full riverfront independently, are what give the skyline its
// two-tier read (Lower Town close in front of Upper Town) instead of one
// flat row of buildings at a single depth.
const QUEBEC_CITY_BANDS = [
  { count: 7, depthMin: 1.8, depthMax: 3.2, salt: 0 }, // Lower Town, right at the water
  { count: 7, depthMin: 4.8, depthMax: 6.8, salt: 100 }, // Upper Town, back on the bluff
];
function buildQuebecCityBuildings() {
  const buildings = [];
  for (const band of QUEBEC_CITY_BANDS) {
    for (let i = 0; i < band.count; i++) {
      const t = band.count > 1 ? (i / (band.count - 1)) * 2 - 1 : 0;
      const salted = i + band.salt;
      const dOffset = t * QUEBEC_CITY_SPAN + Math.sin(salted * 2.4) * 1.7;
      const depth = band.depthMin + ((Math.sin(salted * 1.7) + 1) / 2) * (band.depthMax - band.depthMin);
      buildings.push({ dOffset, depth, variant: salted % stoneSprites.length, mirror: i % 2 === 0 });
    }
  }
  return buildings;
}
const QUEBEC_CITY_BUILDINGS = buildQuebecCityBuildings();

// The church sits deeper than Upper Town's own row, but still well in front
// of the wall behind it — this game has no real elevation, so "set back and
// much taller" is what stands in for "up on the bluff, visible over the
// rooftops."
const QUEBEC_CITY_CHURCH = { dOffset: -3, depth: 7.6 };

function buildQuebecCityRamparts() {
  const ramparts = [];
  for (let d = -QUEBEC_CITY_SPAN - 2; d <= QUEBEC_CITY_SPAN + 2; d += QUEBEC_CITY_RAMPART_SPACING) {
    ramparts.push({ dOffset: d, depth: QUEBEC_CITY_RAMPART_DEPTH });
  }
  return ramparts;
}
const QUEBEC_CITY_RAMPARTS = buildQuebecCityRamparts();

// Cape Diamond's fortified point, at the upstream end of town — a small
// cluster of wall jutting out much closer to the water than the main wall
// behind it, reading as a distinct bastion rather than another stretch of
// the same backdrop. The 1790 map's whole western tip is exactly this: a
// citadel standing apart from the long landward curtain wall.
function buildQuebecCityCitadel() {
  const tip = -QUEBEC_CITY_SPAN;
  return [
    { dOffset: tip - 1.4, depth: 1.6 },
    { dOffset: tip, depth: 2.4 },
    { dOffset: tip + 1.4, depth: 1.8 },
  ];
}
const QUEBEC_CITY_CITADEL = buildQuebecCityCitadel();

// Kingston — journey's end, built on the site of Fort Frontenac (1673,
// rebuilt in stone by 1695), the key French fur-trade/military post
// controlling the western approach and La Salle's own base. Had no
// hand-authored content at all before this — still rendering as a
// generic small-village dot despite being the actual win condition.
// Reported as needing to be "enormous and obnoxious like the ones from
// Montreal and Quebec City" (their own oversized landmarks: Quebec's
// ramparts + giant King's Wharf, Montreal's fortification walls) — this
// gives it the same skyline-of-buildings treatment, plus a landmark:
// KINGSTON_FORT (below, period-correct — a modest stone-walled post, not
// a dramatic star fort like the later 1832 Fort Henry). Kingston's own
// dock (see KINGSTON_DOCK_REACH below) gets the same "so big I cannot
// miss it" oversizing as Quebec City's King's Wharf — it's the actual
// entrance to the town, and used to be a separate bridge structure
// upstream of it; that's gone now, replaced by just making the dock
// itself unmissable instead of adding a second landmark to find.
//
// Rebuilt again against an actual 1820s-30s defence survey of Kingston
// harbour dropped into the repo root (kingston-1700s.jpg — the filename's
// off, the map itself shows Martello towers and a star-fort footprint at
// Point Henry, decades past 1700, but it's still the earliest real layout
// on hand and by far the most detailed source used for any town in this
// game). Two things came out of reading it: KINGSTON_CHURCH (the town
// itself was already right — grid streets on a point, the old fort's
// corner at the tip nearest the harbour mouth), and the real headline —
// the far shore. The survey shows the harbour Kingston sits on isn't a
// plain open bay: it's flanked by a second, heavily fortified shore —
// Navy Bay's Royal Naval Dockyard behind Point Frederick, and Point
// Henry's works guarding the bay mouth a little further out toward Lake
// Ontario, with small fortified islands (Cedar Island among them) further
// out still. KINGSTON_NAVY_BAY/KINGSTON_POINT_HENRY/KINGSTON_CEDAR_ISLAND
// below put all of that on the opposite bank from the town (`-v.side` in
// drawOneVillage) — before this the far shore at Kingston was just empty
// water, the one hand-authored harbour in the game with real geography on
// only one side of it.
// Reported: still reads as "a little village" next to Montreal/Quebec City
// despite KINGSTON_FORT and the new far shore — because it was still a
// single 9-building band at one shallow depth (1.8-3.8), the same flat-row
// treatment villageLayout() gives an ordinary unnamed stop, just with more
// buildings in it. Montreal/Quebec City's own "big city" read never came
// from a wall (Montreal doesn't have one in this game either — see
// MONTREAL_BANDS) — it's the multi-band skyline: several rows tiled at
// increasing depth so the town has real visual depth (a waterfront, then a
// town behind it, then a quarter behind that) instead of one strip of
// buildings between the dock and the treeline. KINGSTON_BANDS below is the
// same three-tier shape as MONTREAL_BANDS, same total building count (18,
// vs. Quebec City's 14) — Kingston was the garrison town and the gateway
// to the upper Great Lakes, no less built-up than either.
const KINGSTON_SPAN = 24; // was 20 — bumped to Quebec City's own span for a comparably wide spread
const KINGSTON_BANDS = [
  { count: 7, depthMin: 1.8, depthMax: 3.2, salt: 0 },   // the waterfront — wharves, warehouses, merchants' row
  { count: 6, depthMin: 4.4, depthMax: 6.2, salt: 100 }, // the town proper — shops, inns, the courthouse block
  { count: 5, depthMin: 7.2, depthMax: 9.0, salt: 200 }, // upper Kingston, back from the harbour
];
function buildKingstonBuildings() {
  const buildings = [];
  for (const band of KINGSTON_BANDS) {
    for (let i = 0; i < band.count; i++) {
      const t = band.count > 1 ? (i / (band.count - 1)) * 2 - 1 : 0;
      const salted = i + band.salt;
      const dOffset = t * KINGSTON_SPAN + Math.sin(salted * 2.2) * 1.8;
      const depth = band.depthMin + ((Math.sin(salted * 1.6) + 1) / 2) * (band.depthMax - band.depthMin);
      buildings.push({ dOffset, depth, variant: salted % stoneSprites.length, mirror: i % 2 === 0 });
    }
  }
  return buildings;
}
const KINGSTON_BUILDINGS = buildKingstonBuildings();

// Fort Frontenac's own corner, at the upstream tip of town — same "small
// cluster standing apart from the main spread" treatment as Quebec City's
// own citadel corner (QUEBEC_CITY_CITADEL above), just a smaller pool of
// segments to match a real fur-trade post rather than a walled capital.
function buildKingstonFort() {
  const tip = -KINGSTON_SPAN - 1;
  return [
    { dOffset: tip - 1.2, depth: 2.0 },
    { dOffset: tip, depth: 2.8 },
    { dOffset: tip + 1.2, depth: 2.2 },
  ];
}
const KINGSTON_FORT = buildKingstonFort();

// St. George's — the town's own Anglican church (built 1825, now St.
// George's Cathedral), set back deeper than KINGSTON_BANDS' own deepest
// row (9.0) so it reads as rising over the whole town, the same "set back
// and much taller stands in for up on the bluff" convention QUEBEC_CITY_
// CHURCH/MONTREAL_CHURCH use (both just above, both deeper than their own
// bands' max for the same reason) — this game has no real elevation.
const KINGSTON_CHURCH = { dOffset: 1, depth: 9.8 };

// An 1820s-30s defence survey of Kingston harbour (the source for this
// whole buildout — see the module's own comment, and see path.js's
// rideauWidthAt on why the channel already flares out to its widest in the
// game right here) shows the town on its own point, and — across the
// water it flares open onto — a second, thoroughly built-up shore: Point
// Frederick's Royal Naval Dockyard closing off Navy Bay to its west, and
// Point Henry's fortification guarding the bay's mouth a little further
// out toward the open lake. Nothing rendered over there before this — the
// far bank at Kingston was just empty water, wrong for the one harbour in
// the game with real landmarks on both shores. Placed with `-v.side`
// (drawOneVillage) rather than a second VILLAGES entry the way Montreal's
// north pier gets one (montrealNorthTwin) — these aren't dockable, just
// backdrop, so they don't need hit-testing or their own dock geometry.
const KINGSTON_NAVY_BAY = [
  { dOffset: -5, depth: 2.2 },
  { dOffset: -2.5, depth: 3.0 },
  { dOffset: 0.5, depth: 2.4 },
];
// A little further out than Navy Bay (see KINGSTON_NAVY_BAY's own comment)
// — reads as sitting further toward the open lake, same relative
// positioning the real point has past Navy Bay's mouth. Same rampart
// cluster treatment as Fort Frontenac/Québec's citadel (KINGSTON_FORT,
// QUEBEC_CITY_CITADEL) since it's the same kind of landmark: a small
// fortified point standing apart from the built-up shore behind it.
const KINGSTON_POINT_HENRY = [
  { dOffset: 9, depth: 2.0 },
  { dOffset: 11, depth: 2.8 },
  { dOffset: 13, depth: 2.2 },
];
// Cedar Island — one of several small islands the survey marks with their
// own little Martello towers out past Point Henry; just the island itself
// here (createIslandSprite(), the same sprite obstacles.js pools as a mid-
// channel hazard elsewhere) since it's scenery, not something to collide
// with this far off the real channel. Furthest out of the three, and
// pushed back with `depth` rather than `dOffset` to read as "far away" —
// a dOffset much past Point Henry's own would land past
// VISIBLE_Z_RANGE (world/villages.js's own visibility gate) for the whole
// approach, since nothing here ever sees d values past Kingston's own
// flowDistance from up close (the run ends there).
const KINGSTON_CEDAR_ISLAND = { dOffset: 15, depth: 9 };

// The near shoreline at d, on the given side. `isMontreal` is a real
// exception, not just another `side`-pinned mainland town: it sits ON the
// Island of Montreal (river/islands.js), so its shore is the *island's*
// edge, not the ambient outer bank — using the outer bank (as every other
// village correctly does) put its dock and buildings on the mainland
// riverbank across the channel from the island it created, which is wrong
// regardless of which side that island splits toward. Every other village
// (including Charlemagne, whose flowDistance also falls inside the
// island's span but which is a real mainland town near its east tip)
// keeps using the true outer bank.
function shoreEdgeAt(d, side, isMontreal) {
  if (isMontreal) {
    const island = braidAt(d);
    if (island) return island.centerX + side * island.halfWidth;
  }
  return centerX(d) + side * widthAt(d) / 2;
}

function bankEdge(v) {
  return shoreEdgeAt(v.flowDistance, v.side, v.name === 'Montreal');
}

// Montreal's real east-side taper (river/islands.js) narrows fast enough
// that the island isn't uniformly wide across MONTREAL_SPAN's whole
// footprint — a deep building placed the same distance inland everywhere
// would clear the island's far edge into open water near that taper.
// Rather than hand-tune every building's depth against the exact shape,
// clamp each one's worldX to the island's own two edges (minus a small
// margin) at its own d — same "authored shape, clamped against live
// geometry so it can't be pushed off the map" pattern islands.js's
// featureIslandAt() already uses for the island shape itself.
const ISLAND_EDGE_MARGIN = 0.5;
function clampToIsland(worldX, d) {
  const island = braidAt(d);
  if (!island) return worldX;
  const lo = island.centerX - island.halfWidth + ISLAND_EDGE_MARGIN;
  const hi = island.centerX + island.halfWidth - ISLAND_EDGE_MARGIN;
  if (lo >= hi) return island.centerX; // degenerate (right at a taper tip)
  return Math.max(lo, Math.min(hi, worldX));
}

function toScreen(worldX, z, cameraWorldX) {
  return {
    x: CANOE_SCREEN_X + (worldX - cameraWorldX) * PIXELS_PER_UNIT,
    y: CANOE_SCREEN_Y + z * PIXELS_PER_UNIT,
  };
}

// Kingston's far shore (KINGSTON_NAVY_BAY -> KINGSTON_CEDAR_ISLAND, dOffset
// -5..15) needs its own clearing on the *opposite* bank from the town's own
// (below) — every other hand-authored village only ever builds on its own
// side, so isNearVillage() below never had to clear both banks at once
// before Kingston got a far shore too.
const KINGSTON_FAR_SHORE_HALF_D = 17;

// Used by terrain.js to keep the forest scatter from covering a village.
export function isNearVillage(d, side) {
  for (const v of VILLAGES) {
    // Quebec City, Trois-Rivieres, and Montreal have larger clearings to cover
    // their hand-authored spreads - the wilderness forest showing up between
    // buildings would defeat "established town."
    let halfD = CLEARING_HALF_D;
    let matchSide = v.side;
    if (v.name === 'Quebec City') halfD = QUEBEC_CITY_SPAN + 4;
    else if (v.name === 'Trois-Rivieres') halfD = TROIS_RIVIERES_SPAN + 2;
    else if (v.name === 'Montreal') halfD = MONTREAL_SPAN + 4;
    else if (v.name === 'Tadoussac') halfD = TADOUSSAC_SPAN + 2;
    else if (v.name === 'Kingston' && side === v.side) halfD = KINGSTON_SPAN + 3; // covers KINGSTON_FORT's tip too
    else if (v.name === 'Kingston' && side === -v.side) { halfD = KINGSTON_FAR_SHORE_HALF_D; matchSide = side; }
    if (matchSide === side && Math.abs(d - v.flowDistance) < halfD) return true;
  }
  return false;
}

// Which lateral direction "into open water, away from shore" points, as a
// sign to multiply dockReach(v) by. For every ordinary outer-bank village
// this is -side (the shore sits at the side's own extreme, so open water —
// and the rest of the channel — is toward the opposite side). Montreal is
// the opposite: its "shore" is the island's edge facing side, but the
// island's own bulk continues in that same side direction (see
// river/islands.js's offset, which leans the island toward the north to
// make the south channel the wide one) — so the water on Montreal's south
// side is further south still, i.e. reach must go *with* side, not against
// it, or the dock would point back into the island instead of the channel.
function reachSign(v) {
  return v.name === 'Montreal' ? v.side : -v.side;
}

// The opposite direction from reachSign(v) — "inland, away from the
// water" instead of "out into it." Buildings/church/repair-shop placement
// all measure depth from the shore in this direction; for Montreal that's
// -side (toward the island's own bulk/Mont-Royal), same flip as reachSign
// and for the same reason (see its comment) — everywhere else it's just
// +side, same as using v.side directly, which is what every non-Montreal
// call site below still does.
function inlandSign(v) {
  return -reachSign(v);
}

function dockReach(v) {
  if (v.name === 'Quebec City') return QUEBEC_CITY_DOCK_REACH;
  if (v.name === 'Montreal') return v.side < 0 ? MONTREAL_DOCK_REACH : MONTREAL_NORTH_DOCK_REACH;
  if (v.name === 'Kingston') return KINGSTON_DOCK_REACH;
  return Math.max(DOCK_LENGTH * villageLayout(v.seed).dock.lengthScale, widthAt(v.flowDistance) * GENERIC_DOCK_REACH_FRACTION);
}

function dockWidthZ(v) {
  if (v.name === 'Quebec City') return QUEBEC_CITY_DOCK_WIDTH_Z;
  if (v.name === 'Montreal') return v.side < 0 ? MONTREAL_DOCK_WIDTH_Z : MONTREAL_NORTH_DOCK_WIDTH_Z;
  if (v.name === 'Kingston') return KINGSTON_DOCK_WIDTH_Z;
  return Math.max(DOCK_WIDTH_Z, widthAt(v.flowDistance) * GENERIC_DOCK_WIDTH_Z_FRACTION);
}

// Exported so game.js can push the canoe back out past the dock's own
// (village-specific) trigger zone when casting off.
// Montreal's two piers are told apart by `v.side < 0` (real Montreal's own
// side, see river/route.js — south/main channel) vs. everything else
// (the synthetic north twin, see montrealNorthTwin() above) — not by name,
// since both share the name 'Montreal' so the rest of the island-geometry
// helpers treat the twin as "on the island" too.
export function dockHitZ(v) {
  if (v.name === 'Quebec City') return QUEBEC_CITY_DOCK_HIT_Z;
  if (v.name === 'Montreal') return v.side < 0 ? MONTREAL_DOCK_HIT_Z : MONTREAL_NORTH_DOCK_HIT_Z;
  if (v.name === 'Kingston') return KINGSTON_DOCK_HIT_Z;
  return Math.max(DOCK_HIT_Z, widthAt(v.flowDistance) * GENERIC_DOCK_HIT_Z_FRACTION);
}

// Returns the village whose dock the canoe is currently touching, or null.
function hitsDock(v, flowDistance, canoeWorldX) {
  if (Math.abs(flowDistance - v.flowDistance) > dockHitZ(v)) return false;
  const edge = bankEdge(v);
  const inner = edge + reachSign(v) * dockReach(v);
  const lo = Math.min(edge, inner);
  const hi = Math.max(edge, inner);
  return canoeWorldX >= lo && canoeWorldX <= hi;
}

export function getDockHit(flowDistance, canoeWorldX) {
  for (const v of VILLAGES) {
    if (hitsDock(v, flowDistance, canoeWorldX)) return v;
    // Montreal's second pier (montrealNorthTwin(), see drawOneVillage) is
    // real geometry a canoe can actually touch, not just decoration — but
    // it isn't its own VILLAGES entry (see that function's comment), so it
    // needs its own check here. Returns the real `v`, not the synthetic
    // twin, so every "which village is this" check elsewhere in the game
    // (docking banners, the pistol grant, cast-off) keeps working unchanged
    // regardless of which of the two piers the canoe actually used.
    if (v.name === 'Montreal' && hitsDock(montrealNorthTwin(v), flowDistance, canoeWorldX)) return v;
  }
  return null;
}

// Exported so anything placing a village outside the normal "arrive by
// continuous paddling" flow (main.js's ?start= cheats) can check it lands
// within this — a village draws nothing at all, not even its dock, until
// the canoe is within this many units of its own flowDistance. Missed once
// (?start=kingston landed 40 units out, so nothing rendered for the first
// ~21 units of paddling — read as "the town isn't there" instead of "keep
// going"); see test/smoke.mjs's own regression test for it.
export const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 5;

export function drawVillages(ctx, worldDistance, cameraWorldX, time = 0) {
  VILLAGES.forEach((v, i) => {
    const z = worldDistance - v.flowDistance;
    if (Math.abs(z) > VISIBLE_Z_RANGE) return;
    drawOneVillage(ctx, v, i, worldDistance, cameraWorldX, time);
  });
}

// A little figure at the foot of each dock, waving the canoe in — drawn
// straight with ctx (not a sprite) so the raised arm actually moves. Coat
// colour and wave timing vary off the village seed so they don't all wave in
// lockstep.
const GREETER_COATS = ['#9c3f34', '#3f6f8a', '#b98a3c', '#4f8a52', '#8a6f3a', '#7a5a8a'];
function drawDockGreeter(ctx, feetX, feetY, time, seed) {
  const coat = GREETER_COATS[seed % GREETER_COATS.length];
  const phase = (seed % 9) * 0.8;
  const wave = Math.sin(time * 7 + phase);            // -1..1, the arm swing
  const x = Math.round(feetX);
  const y = Math.round(feetY + Math.sin(time * 3.4 + phase) * 0.4); // slight bob

  ctx.save();
  // Scale the whole figure up about its feet — the base shape below is drawn
  // at ~14px tall, this brings it to a readable dock-hand size.
  const SCALE = 1.7;
  ctx.translate(x, y);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-x, -y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 4, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2b2620';                          // legs
  ctx.fillRect(x - 2, y - 4, 1.6, 4);
  ctx.fillRect(x + 0.5, y - 4, 1.6, 4);

  ctx.fillStyle = coat;                               // coat + slack arm
  ctx.fillRect(x - 2.4, y - 10, 4.8, 6.4);
  ctx.fillRect(x - 3.4, y - 9.4, 1.4, 4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';              // shaded side, a little form
  ctx.fillRect(x - 2.4, y - 10, 1.2, 6.4);

  ctx.fillStyle = '#e2b688';                          // head
  ctx.fillRect(x - 1.6, y - 13.4, 3.2, 3.2);
  ctx.fillStyle = '#241d16';                          // hat
  ctx.fillRect(x - 2.4, y - 14.4, 4.8, 1.9);

  const hx = x + 3.2 + wave * 2;                       // raised waving arm
  const hy = y - 12 - Math.abs(wave) * 1.6;
  ctx.strokeStyle = coat;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 1.8, y - 8.8);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = '#e2b688';                          // hand
  ctx.fillRect(hx - 1, hy - 1, 2, 2);
  ctx.restore();
}

// Draws just the wooden pier itself (deck, planks, pilings) for a village-
// like object `v` — {flowDistance, side, seed, name}. Factored out of
// drawOneVillage() so Montreal can have a second one drawn against a
// synthetic "north twin" (see MONTREAL_NORTH_TWIN below) without a whole
// second building cluster/greeter — real Montreal's harbour has piers on
// both the St. Lawrence and Rivière-des-Prairies sides of the island.
function drawDockStructure(ctx, v, worldDistance, cameraWorldX) {
  const layout = villageLayout(v.seed);
  const edge = bankEdge(v);
  const inner = edge + reachSign(v) * dockReach(v);
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
  // pilings at the outer (water) end — i.e. wherever `inner` (the end
  // reaching into the channel, vs. `edge` at the shore) landed on screen.
  // Compared directly rather than inferred from v.side: Montreal's
  // reachSign() flip (see its comment) means inner can land on either
  // side of edge depending on the village, unlike every other village
  // where side alone always predicted it.
  ctx.fillStyle = '#3f2b1a';
  const pilingX = toScreen(inner, z0, cameraWorldX).x < toScreen(edge, z0, cameraWorldX).x ? left : right;
  ctx.fillRect(pilingX - 1, top - 1, 2, bottom - top + 2);
}

function drawOneVillage(ctx, v, vIndex, worldDistance, cameraWorldX, time = 0) {
  const layout = villageLayout(v.seed);
  const edge = bankEdge(v);
  const inner = edge + reachSign(v) * dockReach(v);
  const z0 = worldDistance - v.flowDistance;

  drawDockStructure(ctx, v, worldDistance, cameraWorldX);
  if (v.name === 'Montreal') drawDockStructure(ctx, montrealNorthTwin(v), worldDistance, cameraWorldX);

  const isQuebecCity = v.name === 'Quebec City';
  const isTroisRivieres = v.name === 'Trois-Rivieres';
  const isMontreal = v.name === 'Montreal';
  const isTadoussac = v.name === 'Tadoussac';
  const isKingston = v.name === 'Kingston';

  // Buildings and their surrounding trees, merged into one painter's-
  // algorithm pass (sorted so the nearer thing — larger z — draws last, on
  // top) so a tree in front of a cabin actually overlaps it correctly
  // instead of every building drawing over every tree regardless of depth.
  let scenery;
  if (isQuebecCity) {
    scenery = QUEBEC_CITY_BUILDINGS.map((b) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
      return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
    });
  } else if (isTroisRivieres) {
    scenery = TROIS_RIVIERES_BUILDINGS.map((b) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
      return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
    });
  } else if (isMontreal) {
    scenery = MONTREAL_BUILDINGS.map((b) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = clampToIsland(shoreEdgeAt(d, v.side, true) + inlandSign(v) * (BUILDING_SHORE_OFFSET + b.depth), d);
      return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
    });
  } else if (isTadoussac) {
    scenery = TADOUSSAC_BUILDINGS.map((b) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
      return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
    });
  } else if (isKingston) {
    scenery = KINGSTON_BUILDINGS.map((b) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
      return { z, worldX, sprite: stoneSprites[b.variant], mirror: b.mirror, anchor: 0.85 };
    });
  } else {
    scenery = layout.buildings.map((b) => {
      // along (-1..1) spreads buildings ~±3.4 units along the flow axis;
      // inland (0..1) sets depth from the bank between 1.4 and 4.2 units.
      const d = v.flowDistance + b.along * 3.4;
      const depth = 1.4 + b.inland * 2.8;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + depth);
      return { z, worldX, sprite: cabinSprites[b.variant % cabinSprites.length], mirror: b.mirror, anchor: 0.85 };
    });
  }

  // The repair shop — always present, always right at the shoreline beside
  // the dock, regardless of the seed above. Same fixed look and position
  // every time (no mirroring/jitter) — a landmark you can count on is the
  // whole point.
  {
    const d = v.flowDistance + REPAIR_SHOP_D_OFFSET;
    const z = worldDistance - d;
    const worldX = clampToIsland(shoreEdgeAt(d, v.side, isMontreal) + inlandSign(v) * (BUILDING_SHORE_OFFSET + REPAIR_SHOP_DEPTH), d);
    scenery.push({ z, worldX, sprite: repairShopSprite, mirror: false, anchor: 0.85 });
  }

  if (isQuebecCity) {
    // The church — set back deeper than Upper Town's own row so it reads as
    // rising over the whole town (see QUEBEC_CITY_CHURCH's own comment) —
    // and the fortification wall as a backdrop further back still, plus
    // Cape Diamond's citadel standing apart from it at the upstream end,
    // instead of the usual pine-tree treeline. Québec's walls, not a
    // wilderness edge, are what a real 1790s approach would actually show.
    {
      const d = v.flowDistance + QUEBEC_CITY_CHURCH.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + QUEBEC_CITY_CHURCH.depth);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
    [...QUEBEC_CITY_RAMPARTS, ...QUEBEC_CITY_CITADEL].forEach((r) => {
      const d = v.flowDistance + r.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + r.depth);
      scenery.push({ z, worldX, sprite: rampartSprite, mirror: false, anchor: 0.95 });
    });
  } else if (isTroisRivieres) {
    // Ursuline convent (built 1697) - prominent religious building marking
    // this as an established town with institutions, not just a trading post.
    {
      const d = v.flowDistance + TROIS_RIVIERES_CONVENT.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + TROIS_RIVIERES_CONVENT.depth);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
  } else if (isMontreal) {
    // The old Notre-Dame church (see MONTREAL_CHURCH's own comment) - the
    // spiritual heart of New France's commercial capital, rising above the
    // merchant district and warehouses below.
    {
      const d = v.flowDistance + MONTREAL_CHURCH.dOffset;
      const z = worldDistance - d;
      const worldX = clampToIsland(shoreEdgeAt(d, v.side, true) + inlandSign(v) * (BUILDING_SHORE_OFFSET + MONTREAL_CHURCH.depth), d);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
  } else if (isTadoussac) {
    // The Tadoussac Chapel (see TADOUSSAC_CHAPEL's own comment) - a real
    // 1747 landmark set back between the trading post and the dwellings.
    {
      const d = v.flowDistance + TADOUSSAC_CHAPEL.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + TADOUSSAC_CHAPEL.depth);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
  } else if (isKingston) {
    // Fort Frontenac's corner (see KINGSTON_FORT's own comment) — the
    // period-correct landmark here, standing apart from the main spread
    // the same way Quebec City's own citadel does.
    KINGSTON_FORT.forEach((r) => {
      const d = v.flowDistance + r.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + r.depth);
      scenery.push({ z, worldX, sprite: rampartSprite, mirror: false, anchor: 0.95 });
    });
    // St. George's, set back into the grid (see KINGSTON_CHURCH's own
    // comment).
    {
      const d = v.flowDistance + KINGSTON_CHURCH.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) + v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + KINGSTON_CHURCH.depth);
      scenery.push({ z, worldX, sprite: churchSprite, mirror: false, anchor: 0.85 });
    }
    // The far shore — Navy Bay's dockyard, Point Henry's fort, and Cedar
    // Island out past both (see KINGSTON_NAVY_BAY's own comment on why
    // these use `-v.side` instead of a second dockable VILLAGES entry).
    KINGSTON_NAVY_BAY.forEach((b, i) => {
      const d = v.flowDistance + b.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) - v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + b.depth);
      scenery.push({ z, worldX, sprite: stoneSprites[i % stoneSprites.length], mirror: i % 2 === 0, anchor: 0.85 });
    });
    KINGSTON_POINT_HENRY.forEach((r) => {
      const d = v.flowDistance + r.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) - v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + r.depth);
      scenery.push({ z, worldX, sprite: rampartSprite, mirror: false, anchor: 0.95 });
    });
    {
      const d = v.flowDistance + KINGSTON_CEDAR_ISLAND.dOffset;
      const z = worldDistance - d;
      const worldX = centerX(d) - v.side * (widthAt(d) / 2 + BUILDING_SHORE_OFFSET + KINGSTON_CEDAR_ISLAND.depth);
      scenery.push({ z, worldX, sprite: islandSprite, mirror: false, anchor: 0.85 });
    }
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

  // The dock greeter — stands a short way out on the planks (clear of where
  // the canoe ties up at the outer end) and waves you in. Drawn last so the
  // buildings behind never paint over it; the dock sticks out toward the
  // viewer, so it reads as being in front of the whole village anyway.
  {
    const gWorldX = edge + reachSign(v) * dockReach(v) * 0.32;
    const g = toScreen(gWorldX, z0, cameraWorldX);
    drawDockGreeter(ctx, g.x, g.y, time, v.seed);
  }
}
