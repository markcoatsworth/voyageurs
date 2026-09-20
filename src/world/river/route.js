// Real geography for a three-way river system, meeting at Tadoussac:
//   - the Saguenay Fjord, Lac Saint-Jean (the put-in) down to Tadoussac
//   - the Saint Lawrence east of Tadoussac, hugging the North Shore
//     (Côte-Nord) out to Sept-Îles
//   - the Saint Lawrence west of Tadoussac, hugging the North Shore
//     (Charlevoix) up through Quebec City, Trois-Rivières, and on to
//     Montreal — ultimately headed for the Great Lakes and beyond, real
//     geography permitting extending this segment (or adding more) past
//     what's plotted so far
// A single flowDistance number line can only ever represent two directions
// from a point (forward/backward), so each of the three above is still its
// own SEGMENT with its own local geography here and on the minimap — a real
// three-way junction is worth seeing at Tadoussac even though game.js
// doesn't actually offer a choice there any more (crossing the mouth always
// continues into lawrenceWest; lawrenceEast/Sept-Îles is real geography for
// the map to draw, not a live destination — see game.js's own comment on
// its mouth-crossing check). Every village's flowDistance below already has
// its segment's river/path.js SEGMENT_SHAPE_OFFSET baked in (see that
// file's comment), so this module's output plugs directly into
// villages.js/game.js exactly the way one flat, non-branching route used
// to — which of these numbers is currently meaningful is entirely game.js's
// own state, not anything villages.js or terrain.js/obstacles.js/whales.js
// need to know about.
//
// The one thing every segment *does* share is this file's coordinate space
// and cumulative-distance math (so the minimap can plot all three, and the
// player's position on whichever is active, in one consistent picture) and
// river/path.js's centerX/widthAt/etc (so all three look and feel like the
// same river) — see makeSegment() below.
//
// Coordinates and their sources:
//   Lac Saint-Jean        48°25′42″N 71°03′44″W  actually La Baie's coordinates —
//                                                see the comment on FJORD_WAYPOINTS[0]
//                                                for why this one's deliberately not
//                                                Lac Saint-Jean's own real position
//                                                https://en.wikipedia.org/wiki/La_Baie
//   Sainte-Rose-du-Nord   48°23′N   70°35′W       https://en.wikipedia.org/wiki/Sainte-Rose-du-Nord,_Quebec
//   Riviere-Eternite      48°15′20″N 70°24′50″W   https://en.wikipedia.org/wiki/Rivi%C3%A8re-%C3%89ternit%C3%A9
//   L'Anse-Saint-Jean     48°14′N   70°12′W       https://en.wikipedia.org/wiki/L%27Anse-Saint-Jean,_Quebec
//   Petit-Saguenay        48°13′N   70°04′W       https://en.wikipedia.org/wiki/Petit-Saguenay
//   Tadoussac             48°09′N   69°43′W       https://en.wikipedia.org/wiki/Tadoussac
//   Les Escoumins         48°21′05″N 69°24′27″W   https://en.wikipedia.org/wiki/Les_Escoumins
//   Forestville           48°44′33″N 69°05′24″W   https://en.wikipedia.org/wiki/Forestville,_Quebec
//   Baie-Comeau           49°13′12″N 68°09′00″W   https://en.wikipedia.org/wiki/Baie-Comeau
//   Godbout               49°17′24″N 67°35′24″W   https://en.wikipedia.org/wiki/Godbout,_Quebec
//   Baie-Trinite          49°25′12″N 67°20′24″W   https://en.wikipedia.org/wiki/Baie-Trinit%C3%A9
//   Port-Cartier          50°01′48″N 66°52′12″W   https://en.wikipedia.org/wiki/Port-Cartier,_Quebec
//   Sept-Îles             50°12′00″N 66°22′48″W   https://en.wikipedia.org/wiki/Sept-%C3%8Eles,_Quebec
//   La Malbaie            47°39′N   70°09′W       https://en.wikipedia.org/wiki/La_Malbaie
//   Baie-Saint-Paul       47°26′N   70°30′W       https://en.wikipedia.org/wiki/Baie-Saint-Paul
//   Beaupre               47°02′35″N 70°53′29″W   https://en.wikipedia.org/wiki/Beaupr%C3%A9,_Quebec
//   Quebec City           46°48′30″N 71°12′29″W   https://en.wikipedia.org/wiki/Quebec_City
//   Batiscan              46°30′N   72°15′W       https://en.wikipedia.org/wiki/Batiscan,_Quebec
//   Trois-Rivières        46°21′N   72°33′W       https://en.wikipedia.org/wiki/Trois-Rivi%C3%A8res
//   Sorel-Tracy           46°03′N   73°07′W       https://en.wikipedia.org/wiki/Sorel-Tracy
//   Charlemagne           45°43′N   73°29′W       https://en.wikipedia.org/wiki/Charlemagne,_Quebec
//   Montreal              45°30′01″N 73°34′02″W   https://en.wikipedia.org/wiki/Montreal
//   Ottawa River (Chasse-galerie flight path):
//   Ile-Perrot            45°23′N   73°57′W       https://en.wikipedia.org/wiki/%C3%8Ele-Perrot
//   Hudson                45°27′N   74°09′W       https://en.wikipedia.org/wiki/Hudson,_Quebec
//   Rigaud                45°29′N   74°18′W       https://en.wikipedia.org/wiki/Rigaud,_Quebec
//   Carillon              45°34′N   74°22′W       https://en.wikipedia.org/wiki/Carillon,_Quebec
//   Gatineau              45°26′N   75°42′W       https://en.wikipedia.org/wiki/Gatineau
//   The Rideau leg (Gatineau -> Kingston) — a made-up fourth segment. There
//   is no continuous river running Ottawa to Kingston; this stands in for
//   the Rideau canoe corridor (Rideau River, the Rideau Lakes, the
//   Cataraqui) that the Rideau Canal would later canalize. Real towns along
//   that line, so the minimap arm plots somewhere plausible:
//   Manotick              45°13′N   75°41′W       https://en.wikipedia.org/wiki/Manotick
//   Kars                  45°08′N   75°38′W       https://en.wikipedia.org/wiki/Kars,_Ontario
//   Merrickville          44°55′N   75°50′W       https://en.wikipedia.org/wiki/Merrickville
//   Smiths Falls          44°54′N   76°01′W       https://en.wikipedia.org/wiki/Smiths_Falls
//   Newboro               44°39′N   76°19′W       https://en.wikipedia.org/wiki/Newboro
//   Jones Falls           44°33′N   76°14′W       https://en.wikipedia.org/wiki/Jones_Falls,_Ontario
//   Kingston              44°14′N   76°29′W       https://en.wikipedia.org/wiki/Kingston,_Ontario
import { MOUTH_DISTANCE, SEGMENT_SHAPE_OFFSET, RIDEAU_SPAN_DISTANCE } from './path.js';

// labelPos hand-places each minimap label clear of the route line and the
// widget's edges. Unused outside minimap.js.
// Every fjord/St. Lawrence/Ottawa River village below has its `side` pinned
// to its *real* bank now (1 = north/Route-172-side of the Saguenay, or north
// shore of the St. Lawrence/Ottawa; -1 = south/Route-170-side, or south
// shore) — verified against real geography, not left to makeSegment()'s
// alternating default (see its own comment). That default used to be all
// most of these had, which is exactly why roughly half of them were on the
// wrong bank: an "i % 2" alternation has no idea which side a real town is
// actually on, it just happened to agree with reality as often as a coin
// flip would.
// riverWidthKm on every waypoint below (all four lists) is the channel's
// approximate real width at that point, in km — well-known/order-of-
// magnitude geography (the Saguenay Fjord runs 1-4km wide most of its
// length; the St. Lawrence estuary opens to tens of km past Tadoussac;
// Quebec City famously sits where the river narrows to about 1km, the
// origin of the name; Lac Saint-Pierre widens the river past Trois-
// Rivières; the Rideau corridor alternates narrow river/canal reaches with
// genuine lake crossings), not a surveyed figure the way the Island of
// Montreal's own shape below is — same "approximate but real, not invented"
// standard as this file's other estimates (e.g. LAC_SAINT_JEAN_SHAPE's own
// comment). minimap.js turns this into a variable-width ribbon instead of
// the old fixed-width stroke, so the river actually reads as narrow or wide
// where it really is.
const FJORD_WAYPOINTS = [
  // Really La Baie's own coordinates, kept as-is rather than moved to Lac
  // Saint-Jean's actual location — this point is index 0 of makeSegment()'s
  // cumulative real-distance math, which every other fjord waypoint's
  // spacing along the 0-900 flowDistance range is a fraction of; moving it
  // would reflow all of that pacing for a purely cosmetic rename. Labeled
  // as the lake instead (a reasonable liberty: the Saguenay really does
  // begin there, just a bit further upstream than this exact point), with
  // LAC_SAINT_JEAN_SHAPE below drawn as an offset from this same anchor so
  // the lake the player launches onto reads as sitting right where they
  // start, without touching the real-distance math at all.
  { name: 'Lac Saint-Jean', lat: 48.4283, lon: -71.0622, label: 'Lac Saint-Jean', labelPos: { dx: -15, dy: -3, anchor: 'middle' }, riverWidthKm: 4 },
  // North shore (Route 172) — the name says so, and so does the map.
  // side flipped to -1 (was 1): reported in-game as rendering on the wrong
  // bank. This stretch's `side` is hand-set per waypoint against the
  // stylized fjord curve (path.js), not derived from true compass bearing,
  // so which signed offset actually reads as "north" on screen isn't
  // something to re-derive from the lat/lon alone — going with the
  // in-game report over the sign that seemed right on paper.
  { name: 'Sainte-Rose-du-Nord', lat: 48.3833, lon: -70.5833, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: -1, riverWidthKm: 2 },
  // South shore (Route 170) — in Fjord-du-Saguenay National Park's Baie
  // Éternité sector, a real wide bay off the main channel.
  { name: 'Riviere-Eternite', lat: 48.2556, lon: -70.4139, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: -1, riverWidthKm: 2.5 },
  // 48.2330/-70.2000 (still visible below in git history) was Wikipedia's
  // *municipality* centroid — the inland village core up the Rivière
  // Saint-Jean valley, not on the Saguenay itself. A canoe on the fjord
  // wouldn't pass that point at all; it'd pass the mouth of Saint-Jean Bay,
  // where the Rivière Saint-Jean actually opens into the Saguenay's south
  // shore — 48.24139/-70.19805, confirmed against the river's own Wikipedia
  // entry ("Saint-Jean River (Saguenay River tributary)"). Real waypoint
  // coordinates should be the point on the navigable fjord itself, not a
  // settlement's administrative centre, whenever the two diverge.
  { name: "L'Anse-Saint-Jean", lat: 48.2414, lon: -70.1981, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: -1, riverWidthKm: 2 }, // south shore, Route 170
  { name: 'Petit-Saguenay', lat: 48.2170, lon: -70.0670, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: -1, riverWidthKm: 2.2 }, // south shore, Route 170
  // North shore — reached via Route 172, not the Route 170/ferry side.
  // Still the fjord's own mouth here, just short of the dramatically wider
  // St. Lawrence it opens into (see the two Saint Lawrence lists' own
  // Tadoussac entries, each ~20km).
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, label: 'Tadoussac', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' }, side: 1, riverWidthKm: 2.5 },
];
// Each Saint Lawrence segment starts from Tadoussac itself (index 0 — its
// own local d=0, same role FJORD_WAYPOINTS[0]/La Baie plays for the fjord)
// rather than sharing FJORD_WAYPOINTS' single copy of it — every segment
// needs its own independent cumulative-distance math starting from wherever
// *it* begins.
// Every stop on this arm is a genuine Côte-Nord (North Shore) municipality —
// the St. Lawrence is far too wide out here for a facing south-shore town to
// exist opposite any of them, so unlike the other two Saint Lawrence arms
// this one doesn't actually alternate in reality: all side: 1. (Moot for
// gameplay today — lawrenceEast isn't a live destination, see the module
// comment — but fixed anyway since it's still real geography rendered by
// villages.js the moment anyone does reach it, e.g. via ?start=sept-iles.)
const LAWRENCE_EAST_WAYPOINTS = [
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, riverWidthKm: 20 },
  // The estuary keeps widening the whole way out to Sept-Îles, where it's
  // barely distinguishable from the open Gulf any more.
  { name: 'Les Escoumins', lat: 48.3514, lon: -69.4075, labelPos: { dx: -1.4, dy: 0.9, anchor: 'end' }, side: 1, riverWidthKm: 24 },
  { name: 'Forestville', lat: 48.7425, lon: -69.0900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 28 },
  { name: 'Baie-Comeau', lat: 49.2200, lon: -68.1500, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: 1, riverWidthKm: 33 },
  { name: 'Godbout', lat: 49.2900, lon: -67.5900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 38 },
  { name: 'Baie-Trinite', lat: 49.4200, lon: -67.3400, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: 1, riverWidthKm: 42 },
  { name: 'Port-Cartier', lat: 50.0300, lon: -66.8700, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 46 },
  { name: 'Sept-Îles', lat: 50.2000, lon: -66.3800, label: 'Sept-Îles', labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: 1, riverWidthKm: 50 },
];
const LAWRENCE_WEST_WAYPOINTS = [
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, riverWidthKm: 20 },
  // North shore (side: 1) — real La Malbaie sits on the Charlevoix coast,
  // the river's north bank, not the alternating pattern's south. The
  // estuary is still tens of km wide out here, narrowing steadily as it
  // approaches Quebec City.
  // 47.6500/-70.1500 (Wikipedia's municipality coordinate, still visible in
  // git history) is measured at the mouth of the *Malbaie River* — a real
  // point, but set back from the St. Lawrence itself across the wide
  // estuary here, which put the minimap dot out in open water instead of on
  // the north shore. Pointe-au-Pic, the actual point of land on the St.
  // Lawrence (site of the real 19th-century steamer wharf — used here just
  // for the coordinate, not claiming that wharf existed in this game's
  // 1790 setting), is the real waterfront point a river traveller would
  // actually pass.
  { name: 'La Malbaie', lat: 47.6228, lon: -70.1408, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 17 },
  { name: 'Baie-Saint-Paul', lat: 47.4400, lon: -70.5000, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: 1, riverWidthKm: 12 }, // Charlevoix, north shore
  // A short hop downriver of Quebec City itself — mainly here to give
  // testers (and anyone who capsizes right at the capital) a closer
  // ?start= point than doubling all the way back to Baie-Saint-Paul.
  // North shore (Côte-de-Beaupré) — Île d'Orléans splits the channel here,
  // and the river is visibly narrowing toward the city.
  { name: 'Beaupre', lat: 47.0431, lon: -70.8914, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 4 },
  // Pinned to the right/north bank (side: 1) rather than left to the
  // alternating pattern — real Quebec City sits on the river's north
  // shore, and its dock/fortifications are hand-authored to that side.
  // "Kebec" is Algonquian for "where the river narrows" — the St. Lawrence
  // pinches to about 1km wide here, its narrowest point downstream of
  // Montreal, which is exactly why the city (and its fortifications) sit
  // right here.
  { name: 'Quebec City', lat: 46.8083, lon: -71.2080, label: 'Quebec City', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' }, side: 1, riverWidthKm: 1 },
  // Historic trading post between Quebec City and Trois-Rivières — a
  // checkpoint on the upriver slog toward Montréal. North shore (Mauricie).
  { name: 'Batiscan', lat: 46.5000, lon: -72.2500, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: 1, riverWidthKm: 3 },
  // Sits right at Lac Saint-Pierre, the real lake-like widening of the St.
  // Lawrence between Trois-Rivières and Sorel — a genuine ~10km-wide reach.
  { name: 'Trois-Rivieres', lat: 46.3500, lon: -72.5500, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 8 },
  // Port at the confluence of the Richelieu and St. Lawrence rivers,
  // strategic location between Trois-Rivières and Montreal. South shore —
  // real Sorel-Tracy sits opposite the north-shore towns above it. Past
  // Lac Saint-Pierre's outlet, the channel has narrowed back to a normal
  // river width.
  { name: 'Sorel-Tracy', lat: 46.0500, lon: -73.1167, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: -1, riverWidthKm: 3 },
  // Charlemagne — real Repentigny's spot, on the Rivière des Prairies side
  // just upriver from Montreal, right where that channel rejoins the St.
  // Lawrence at the Island of Montreal's east tip (river/islands.js) — the
  // narrower north channel the baked island splits off, not Montreal's own
  // south-shore/main-channel side. Gives players a close starting point
  // for testing the final destination. The Rivière des Prairies itself is
  // the narrower of the island's two channels (see islands.js), hence the
  // narrow figure here vs. Montreal's own south-channel entry below.
  // mapSkipRibbon: the minimap draws MONTREAL_NORTH_CHANNEL_MAP_SHAPE /
  // MONTREAL_SOUTH_CHANNEL_MAP_SHAPE (below) hugging the island's real
  // shorelines instead of the straight Charlemagne->Montreal->Ile-Perrot
  // chords this waypoint list would otherwise draw — a direct chord
  // between two towns on *opposite shores* of a ~50km island cuts right
  // across the landmass, which doesn't happen in reality. Doesn't touch
  // flowDistance/villages/cumulative math at all (see makeSegment(): only
  // name/segment/flowDistance/side get copied into `villages`), so the
  // canoe marker still interpolates straight through this stretch same as
  // ever — a real but minor simplification, the same "not the same as
  // gameplay's own model" gap this segment already has near Montreal (see
  // river/islands.js's module comment on why the baked split only starts
  // right at the island, not back at Charlemagne).
  { name: 'Charlemagne', lat: 45.7167, lon: -73.4833, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 1, mapSkipRibbon: true },
  // Final destination — New France's commercial heart and the great inland
  // port. The river continues past Montreal too (ultimately toward the Great
  // Lakes), but this marks the end of the current journey. South shore
  // (side: -1) — corrected from an earlier north-shore placeholder that
  // predated the Island of Montreal split (see river/islands.js): real
  // Vieux-Port/Old Montreal faces the St. Lawrence's main channel on the
  // island's south side, not the narrower Rivière des Prairies to the
  // north (that's the Charlemagne/side:1 side, matching real Repentigny —
  // right where the Prairies rejoins the St. Lawrence at the island's east
  // tip). MONTREAL_ISLAND_MAP_SHAPE below draws the island itself as real
  // land between this channel and Charlemagne's.
  { name: 'Montreal', lat: 45.5017, lon: -73.5673, label: 'Montreal', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' }, side: -1, riverWidthKm: 2.5, mapSkipRibbon: true }, // see Charlemagne's mapSkipRibbon comment above

  // The Ottawa River — Chasse-galerie flight path toward Gatineau. Real
  // Île-Perrot/Hudson/Rigaud all sit on the south side of Lake of Two
  // Mountains/the Ottawa (Montérégie/Vaudreuil-Soulanges), a genuine
  // lake-sized widening of the river; Carillon and Gatineau are both on
  // the north shore, same side as Montréal, past a real historic narrows
  // (Long-Sault/Carillon, canalized and dammed today).
  { name: 'Ile-Perrot', lat: 45.3800, lon: -73.9500, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: -1, riverWidthKm: 4 },
  { name: 'Hudson', lat: 45.4500, lon: -74.1500, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: -1, riverWidthKm: 6 },
  { name: 'Rigaud', lat: 45.4800, lon: -74.3000, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, side: -1, riverWidthKm: 5 },
  { name: 'Carillon', lat: 45.5600, lon: -74.3700, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, side: 1, riverWidthKm: 1 },
  { name: 'Gatineau', lat: 45.4300, lon: -75.7000, label: 'Gatineau', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' }, side: 1, riverWidthKm: 1.5 },
];

// The Rideau leg — Gatineau south to Kingston (see the module comment: a
// made-up segment standing in for the Rideau canoe corridor). Same pattern
// as the two Saint Lawrence lists: index 0 is its own start (Gatineau, local
// d=0, you leave from there rather than arrive at it) with its own
// cumulative-distance math. Kingston is the end of the whole game.
//
// Unlike the Saguenay/St. Lawrence lists above, `side` here is deliberately
// left on makeSegment()'s alternating default rather than pinned to real
// geography — there isn't a reliable "real bank" to pin most of these to in
// the first place: Manotick sits on Long Island, split by both branches of
// the Rideau; Newboro/Jones Falls are lake reaches and lock stations, not
// two-bank river towns. Layered onto a genuinely invented
// channel (no continuous river actually runs Gatineau to Kingston), forcing
// a "correct" side per town would be presenting a guess as researched fact.
// Kingston is the one exception — its own real shore (north, on Lake
// Ontario) is well documented, hence its explicit pin below.
const RIDEAU_WAYPOINTS = [
  // Same real place as lawrenceWest's own Gatineau entry above — same
  // width figure for consistency.
  { name: 'Gatineau', lat: 45.4300, lon: -75.7000, riverWidthKm: 1.5 },
  // Manotick sits on Long Island, splitting the real Rideau River into two
  // narrow channels — a modest river, not a lake reach.
  { name: 'Manotick', lat: 45.2250, lon: -75.6830, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, riverWidthKm: 0.3 },
  { name: 'Kars', lat: 45.1280, lon: -75.6390, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, riverWidthKm: 0.6 },
  // Merrickville and Smiths Falls are both small heritage canal towns on a
  // genuinely narrow stretch of the real Rideau.
  { name: 'Merrickville', lat: 44.9150, lon: -75.8380, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, riverWidthKm: 0.15 },
  { name: 'Smiths Falls', lat: 44.9000, lon: -76.0210, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, riverWidthKm: 0.2 },
  // Newboro and Jones Falls both sit on real lake reaches of the Rideau
  // Lakes system (Upper Rideau Lake; the Sand/Whitefish Lakes chain) —
  // genuinely wide compared to the canal towns on either side of them.
  { name: 'Newboro', lat: 44.6470, lon: -76.3100, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' }, riverWidthKm: 2 },
  { name: 'Jones Falls', lat: 44.5450, lon: -76.2380, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' }, riverWidthKm: 1.5 },
  // Journey's end — Fort Frontenac / Cataraqui, the gateway to the Great
  // Lakes. game.js declares the run won on reaching it. Kingston's harbour
  // opens right onto Lake Ontario, hence the wide figure here.
  { name: 'Kingston', lat: 44.2310, lon: -76.4860, label: 'Kingston', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' }, side: 1, riverWidthKm: 3 },
];

// How far (game-world units) each segment takes to cross, end to end. Real
// distance isn't scaled 1:1 into these — cumulativeForLocalFlowDistance
// below reparametrizes real distance onto whatever span is picked here, so
// waypoints stay correctly spaced *relative to each other* regardless of
// the number; it only controls how long the segment takes to paddle.
export const ESTUARY_SPAN_DISTANCE = 2400; // Tadoussac -> Sept-Îles, ~400km real
// Tadoussac -> Montreal, ~435km real. Scaled up from the old Tadoussac ->
// Quebec City-only span (1300) by the same real-distance ratio (435 / 186.4
// km) so Quebec City's own flowDistance — and everything already tuned
// around it (its dock, the boss fight, etc.) — doesn't move at all; the
// added length is purely the new Quebec City -> Trois-Rivières -> Montreal
// stretch extending the journey to its natural conclusion at New France's
// commercial capital.
export const LAWRENCE_WEST_SPAN_DISTANCE = 3035;

// Equirectangular projection, longitude compressed by cos(latitude) at one
// shared reference point (rather than one per segment) — that's what lets
// the minimap plot every segment in a single consistent picture. The three
// original arms all sit within a degree or so of LAT_REF, where this is
// accurate to well within a pixel; the made-up Rideau leg runs ~4° further
// south, so its longitudes are compressed a few percent too hard — a slight
// east-west squash of that one arm on a decorative widget, not a real
// problem.
const LAT_REF = FJORD_WAYPOINTS[0].lat;
const LON_REF = FJORD_WAYPOINTS[0].lon;
const KM_PER_LAT = 111.0;
const KM_PER_LON = 111.0 * Math.cos((LAT_REF * Math.PI) / 180);

function project(w) {
  return { ...w, x: (w.lon - LON_REF) * KM_PER_LON, y: -(w.lat - LAT_REF) * KM_PER_LAT };
}

// Builds one segment's worth of shared machinery — projection, cumulative
// real distance, and local-flowDistance <-> real-position conversion — from
// just its waypoint list, how long it takes to paddle end to end, and its
// river/path.js shape offset. Every segment uses the exact same math (this
// used to be hand-duplicated once for the fjord and once for the estuary; a
// third copy for the new Quebec City stretch is what finally made a shared
// factory worth it).
function makeSegment(id, waypoints, spanDistance) {
  const shapeOffset = SEGMENT_SHAPE_OFFSET[id];
  const points = waypoints.map(project);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalCumulative = cumulative[cumulative.length - 1];

  function pointAtCumulative(target) {
    const c = Math.max(0, Math.min(totalCumulative, target));
    for (let i = 1; i < points.length; i++) {
      if (c <= cumulative[i] || i === points.length - 1) {
        const segLen = cumulative[i] - cumulative[i - 1];
        const t = segLen > 0 ? (c - cumulative[i - 1]) / segLen : 0;
        const a = points[i - 1], b = points[i];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return points[points.length - 1];
  }

  // local, i.e. relative to this segment's own start (0) — never the
  // game-wide flowDistance number game.js actually steers with, which also
  // has shapeOffset added (see VILLAGES below and game.js's segment state).
  function cumulativeForLocalFlowDistance(localFlowDistance) {
    const frac = Math.min(1, Math.max(0, localFlowDistance) / spanDistance);
    return frac * totalCumulative;
  }

  function localFlowDistanceForCumulative(cum) {
    return Math.min(1, Math.max(0, cum) / totalCumulative) * spanDistance;
  }

  // Every named stop except this segment's own start (you begin there, you
  // don't arrive at it) as an in-game village. flowDistance already has
  // this segment's shapeOffset baked in, so it's directly comparable
  // against game.js's own flowDistance whenever this segment is active,
  // exactly like the old single-line VILLAGES list used to be.
  const villages = waypoints.slice(1).map((w, i) => ({
    name: w.label || w.name,
    segment: id,
    flowDistance: shapeOffset + localFlowDistanceForCumulative(cumulative[i + 1]),
    // A waypoint can pin its own side to its real bank (every fjord/
    // lawrenceEast/lawrenceWest waypoint now does — see their own list
    // comments) instead of taking whatever this alternating fallback lands
    // on. The fallback only actually matters for the Rideau any more (its
    // waypoints are deliberately left unpinned — see RIDEAU_WAYPOINTS'
    // comment on why a real bank can't be honestly assigned there) — it's
    // not a substitute for research, just cosmetic variety for a stop no
    // one's pinned. Also why inserting a new stop earlier in an unpinned
    // list would silently flip every later village's bank.
    side: w.side ?? (i % 2 === 0 ? -1 : 1),
  }));

  return {
    id, waypoints, points, spanDistance, shapeOffset,
    pointAtCumulative, cumulativeForLocalFlowDistance, villages,
  };
}

export const SEGMENTS = {
  fjord: makeSegment('fjord', FJORD_WAYPOINTS, MOUTH_DISTANCE),
  lawrenceEast: makeSegment('lawrenceEast', LAWRENCE_EAST_WAYPOINTS, ESTUARY_SPAN_DISTANCE),
  lawrenceWest: makeSegment('lawrenceWest', LAWRENCE_WEST_WAYPOINTS, LAWRENCE_WEST_SPAN_DISTANCE),
  rideau: makeSegment('rideau', RIDEAU_WAYPOINTS, RIDEAU_SPAN_DISTANCE),
};

// A decorative lake shape for the minimap only — never touched by any
// gameplay math, unlike every other point in this file. Offsets (km) from
// the put-in itself rather than an independent lat/lon, both so it's
// guaranteed to sit right where the player launches regardless of that
// point's own real coordinates (see the comment on FJORD_WAYPOINTS[0]), and
// because it's a loose, roughly-lake-shaped blob for the map to look
// pretty with, not a surveyed coastline. Real Lac Saint-Jean is genuinely
// upstream/west of here, hence the shape trending that direction — closed
// loop, first/last point identical, smoothed into a curve by minimap.js
// rather than drawn as a hard-edged polygon.
const LAKE_ANCHOR = SEGMENTS.fjord.points[0];
const LAKE_OFFSETS = [
  { dx: 3, dy: 3 },
  { dx: -5, dy: 12 },
  { dx: -20, dy: 17 },
  { dx: -38, dy: 11 },
  { dx: -47, dy: -3 },
  { dx: -41, dy: -19 },
  { dx: -24, dy: -25 },
  { dx: -8, dy: -16 },
  { dx: 3, dy: 3 },
];
export const LAC_SAINT_JEAN_SHAPE = LAKE_OFFSETS.map((o) => ({ x: LAKE_ANCHOR.x + o.dx, y: LAKE_ANCHOR.y + o.dy }));

// Real geography for the minimap only (never touched by gameplay math) —
// the Island of Montreal itself, drawn as an actual landmass rather than
// (as river/path.js's/islands.js's gameplay model does) a fixed-width
// channel split, since at this map's scale (see VIEW_SIZE in minimap.js)
// the island is a very real, very visible ~50km-long feature, not
// something a channel-width trick could convey. Same raw survey points
// river/islands.js's own module comment describes (the west/east tips
// plus paired north-shore/south-shore towns along its length), projected
// through this file's own project()/LAT_REF rather than the island's
// private survey axis, since the minimap needs everything in one shared
// coordinate space.
const MONTREAL_WEST_TIP = { lat: 45.4039, lon: -73.9525 }; // Sainte-Anne-de-Bellevue
const MONTREAL_EAST_TIP = { lat: 45.6423, lon: -73.5053 }; // Pointe-aux-Trembles
const MONTREAL_NORTH_SHORE = [
  { lat: 45.4667, lon: -73.8833 }, // Pierrefonds
  { lat: 45.5317, lon: -73.7089 }, // Cartierville
  { lat: 45.5547, lon: -73.6711 }, // Ahuntsic
  { lat: 45.6589, lon: -73.5208 }, // Riviere-des-Prairies
];
const MONTREAL_SOUTH_SHORE = [
  { lat: 45.4170, lon: -73.9170 }, // Baie-D'Urfe
  { lat: 45.4500, lon: -73.8170 }, // Pointe-Claire
  { lat: 45.4331, lon: -73.6808 }, // Lachine
  { lat: 45.4639, lon: -73.5639 }, // Verdun
  { lat: 45.5017, lon: -73.5673 }, // Old Montreal
  { lat: 45.5530, lon: -73.5420 }, // Hochelaga-Maisonneuve
  { lat: 45.5958, lon: -73.5163 }, // Mercier
];
// Around the loop once: west tip -> north shore west-to-east -> east tip
// -> south shore east-to-west -> back to the west tip.
export const MONTREAL_ISLAND_MAP_SHAPE = [
  MONTREAL_WEST_TIP,
  ...MONTREAL_NORTH_SHORE,
  MONTREAL_EAST_TIP,
  ...[...MONTREAL_SOUTH_SHORE].reverse(),
].map(project);

// The island's two real channels, drawn on the minimap in place of the
// straight Charlemagne->Montreal->Ile-Perrot chords (see mapSkipRibbon on
// those waypoints above) — the real Rivière des Prairies (narrow, north
// of the island) and the real St. Lawrence main channel (wider, narrows
// hard at the Lachine Rapids, opens into Lake St. Louis at the west tip).
// Both run the island's full real length, tip to tip, hugging the same
// shore-town sequences MONTREAL_ISLAND_MAP_SHAPE's own boundary uses.
// riverWidthKm figures are the same kind of researched estimate as the
// main route's (this file's earlier comment on that), chosen to agree
// with the villages already pinned nearby (Charlemagne=1km, Montreal=2.5km,
// Ile-Perrot=4km above) at the point each channel passes closest to them.
export const MONTREAL_NORTH_CHANNEL_MAP_SHAPE = [
  { ...MONTREAL_WEST_TIP, riverWidthKm: 1.5 }, // opens into Lake of Two Mountains
  { ...MONTREAL_NORTH_SHORE[0], riverWidthKm: 1.0 }, // Pierrefonds
  { ...MONTREAL_NORTH_SHORE[1], riverWidthKm: 0.7 }, // Cartierville
  { ...MONTREAL_NORTH_SHORE[2], riverWidthKm: 0.6 }, // Ahuntsic
  { ...MONTREAL_NORTH_SHORE[3], riverWidthKm: 0.8 }, // Riviere-des-Prairies
  { ...MONTREAL_EAST_TIP, riverWidthKm: 1.2 }, // confluence with the south channel
].map(project);
export const MONTREAL_SOUTH_CHANNEL_MAP_SHAPE = [
  { ...MONTREAL_WEST_TIP, riverWidthKm: 4.5 }, // opens into Lake St. Louis
  { ...MONTREAL_SOUTH_SHORE[0], riverWidthKm: 3.5 }, // Baie-D'Urfe
  { ...MONTREAL_SOUTH_SHORE[1], riverWidthKm: 3.0 }, // Pointe-Claire
  { ...MONTREAL_SOUTH_SHORE[2], riverWidthKm: 1.3 }, // Lachine — the rapids narrows
  { ...MONTREAL_SOUTH_SHORE[3], riverWidthKm: 2.0 }, // Verdun
  { ...MONTREAL_SOUTH_SHORE[4], riverWidthKm: 2.5 }, // Old Montreal
  { ...MONTREAL_SOUTH_SHORE[5], riverWidthKm: 2.2 }, // Hochelaga-Maisonneuve
  { ...MONTREAL_SOUTH_SHORE[6], riverWidthKm: 1.8 }, // Mercier
  { ...MONTREAL_EAST_TIP, riverWidthKm: 1.5 }, // confluence with the north channel
].map(project);

// Île Sainte-Hélène and Nuns' Island (river/islands.js's southIslandAt) —
// both real, both tiny at this map's scale (each well under 1km across,
// vs. the main island's ~50km), so drawn as small fixed markers in
// minimap.js rather than surveyed polygons like the main island above.
export const SAINTE_HELENE_MAP_POINT = project({ lat: 45.51778, lon: -73.53389 });
export const NUNS_ISLAND_MAP_POINT = project({ lat: 45.46111, lon: -73.54333 });

// The Lachine Rapids — real, famous, right at the real Lachine village's
// own coordinates (the same point as MONTREAL_SOUTH_SHORE's Lachine entry
// above). minimap.js draws a bit of whitewater texture here rather than a
// shape, since it's a rough stretch of the channel, not land.
export const LACHINE_RAPIDS_MAP_POINT = project({ lat: 45.4331, lon: -73.6808 });

// Mont-Royal (233m, the island's real central landmark — see
// terrain.js's own MONT_ROYAL_D for its in-game counterpart) — real
// coordinates, same survey this file's other Montreal-area points use.
// minimap.js uses this (together with the Old Montreal/dock point above)
// to shade a "developed" patch into the island's interior instead of
// leaving it flat green.
export const MONT_ROYAL_MAP_POINT = project({ lat: 45.5045, lon: -73.5878 });

// Flat, cross-segment village list — villages.js/game.js iterate this
// exactly like the old non-branching route's single VILLAGES array, since
// every entry's flowDistance already lives in a disjoint numeric range per
// segment (see river/path.js's SEGMENT_SHAPE_OFFSET) and carries which
// segment it's actually on. `seed` is assigned globally across all three so
// no two villages anywhere share a procedural layout.
export const VILLAGES = [
  ...SEGMENTS.fjord.villages,
  ...SEGMENTS.lawrenceEast.villages,
  ...SEGMENTS.lawrenceWest.villages,
  ...SEGMENTS.rideau.villages,
].map((v, i) => ({ ...v, seed: i + 1 }));
