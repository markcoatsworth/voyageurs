// Real geography for a three-way river system, meeting at Tadoussac:
//   - the Saguenay Fjord, Lac Saint-Jean (the put-in) down to Tadoussac
//   - the Saint Lawrence east of Tadoussac, hugging the North Shore
//     (Côte-Nord) out to Sept-Îles
//   - the Saint Lawrence west of Tadoussac, hugging the North Shore
//     (Charlevoix) back to Québec City
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
//   Rivière-Éternité      48°15′20″N 70°24′50″W   https://en.wikipedia.org/wiki/Rivi%C3%A8re-%C3%89ternit%C3%A9
//   L'Anse-Saint-Jean     48°14′N   70°12′W       https://en.wikipedia.org/wiki/L%27Anse-Saint-Jean,_Quebec
//   Petit-Saguenay        48°13′N   70°04′W       https://en.wikipedia.org/wiki/Petit-Saguenay
//   Tadoussac             48°09′N   69°43′W       https://en.wikipedia.org/wiki/Tadoussac
//   Les Escoumins         48°21′05″N 69°24′27″W   https://en.wikipedia.org/wiki/Les_Escoumins
//   Forestville           48°44′33″N 69°05′24″W   https://en.wikipedia.org/wiki/Forestville,_Quebec
//   Baie-Comeau           49°13′12″N 68°09′00″W   https://en.wikipedia.org/wiki/Baie-Comeau
//   Godbout               49°17′24″N 67°35′24″W   https://en.wikipedia.org/wiki/Godbout,_Quebec
//   Baie-Trinité          49°25′12″N 67°20′24″W   https://en.wikipedia.org/wiki/Baie-Trinit%C3%A9
//   Port-Cartier          50°01′48″N 66°52′12″W   https://en.wikipedia.org/wiki/Port-Cartier,_Quebec
//   Sept-Îles             50°12′00″N 66°22′48″W   https://en.wikipedia.org/wiki/Sept-%C3%8Eles,_Quebec
//   La Malbaie            47°39′N   70°09′W       https://en.wikipedia.org/wiki/La_Malbaie
//   Baie-Saint-Paul       47°26′N   70°30′W       https://en.wikipedia.org/wiki/Baie-Saint-Paul
//   Québec City           46°48′30″N 71°12′29″W   https://en.wikipedia.org/wiki/Quebec_City
import { MOUTH_DISTANCE, SEGMENT_SHAPE_OFFSET } from './path.js';

// labelPos hand-places each minimap label clear of the route line and the
// widget's edges. Unused outside minimap.js.
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
  { name: 'Lac Saint-Jean', lat: 48.4283, lon: -71.0622, label: 'Lac Saint-Jean', labelPos: { dx: -15, dy: -3, anchor: 'middle' } },
  { name: 'Sainte-Rose-du-Nord', lat: 48.3833, lon: -70.5833, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Rivière-Éternité', lat: 48.2556, lon: -70.4139, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: "L'Anse-Saint-Jean", lat: 48.2330, lon: -70.2000, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Petit-Saguenay', lat: 48.2170, lon: -70.0670, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, label: 'Tadoussac', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' } },
];
// Each Saint Lawrence segment starts from Tadoussac itself (index 0 — its
// own local d=0, same role FJORD_WAYPOINTS[0]/La Baie plays for the fjord)
// rather than sharing FJORD_WAYPOINTS' single copy of it — every segment
// needs its own independent cumulative-distance math starting from wherever
// *it* begins.
const LAWRENCE_EAST_WAYPOINTS = [
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170 },
  { name: 'Les Escoumins', lat: 48.3514, lon: -69.4075, labelPos: { dx: -1.4, dy: 0.9, anchor: 'end' } },
  { name: 'Forestville', lat: 48.7425, lon: -69.0900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Baie-Comeau', lat: 49.2200, lon: -68.1500, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Godbout', lat: 49.2900, lon: -67.5900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Baie-Trinité', lat: 49.4200, lon: -67.3400, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Port-Cartier', lat: 50.0300, lon: -66.8700, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Sept-Îles', lat: 50.2000, lon: -66.3800, label: 'Sept-Îles', labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
];
const LAWRENCE_WEST_WAYPOINTS = [
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170 },
  { name: 'La Malbaie', lat: 47.6500, lon: -70.1500, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Baie-Saint-Paul', lat: 47.4400, lon: -70.5000, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Québec City', lat: 46.8083, lon: -71.2080, label: 'Québec City', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' } },
];

// How far (game-world units) each segment takes to cross, end to end. Real
// distance isn't scaled 1:1 into these — cumulativeForLocalFlowDistance
// below reparametrizes real distance onto whatever span is picked here, so
// waypoints stay correctly spaced *relative to each other* regardless of
// the number; it only controls how long the segment takes to paddle.
export const ESTUARY_SPAN_DISTANCE = 2400; // Tadoussac -> Sept-Îles, ~400km real
export const LAWRENCE_WEST_SPAN_DISTANCE = 1300; // Tadoussac -> Québec City, ~205km real

// Equirectangular projection, longitude compressed by cos(latitude) — every
// waypoint across all three segments spans well under a degree of latitude,
// so this is accurate to well within a pixel at minimap scale. One shared
// reference point (rather than one per segment) is what lets the minimap
// plot all three segments in a single consistent picture.
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
// third copy for the new Québec City stretch is what finally made a shared
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
    side: i % 2 === 0 ? -1 : 1,
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

// Every real point across all three segments, for the minimap to draw as
// one continuous picture regardless of which segment is actually active.
export const ALL_POINTS = [
  ...SEGMENTS.fjord.points,
  ...SEGMENTS.lawrenceEast.points,
  ...SEGMENTS.lawrenceWest.points,
];

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
].map((v, i) => ({ ...v, seed: i + 1 }));
