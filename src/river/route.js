// Shared geography for the river's real waypoints — the Saguenay Fjord from
// La Baie down to Tadoussac, then the Saint Lawrence's North Shore (Côte-
// Nord) all the way out to Sept-Îles. Used by both the minimap (drawing the
// route + marker) and the village system (placing villages at the exact
// same real-world points along the actual playable river), so "you're at
// Tadoussac" means the same thing on the minimap and in the game world.
// Coordinates and their sources:
//   La Baie              48°25′42″N 71°03′44″W  https://en.wikipedia.org/wiki/La_Baie
//   Sainte-Rose-du-Nord   48°23′N   70°35′W      https://en.wikipedia.org/wiki/Sainte-Rose-du-Nord,_Quebec
//   Rivière-Éternité      48°15′20″N 70°24′50″W  https://en.wikipedia.org/wiki/Rivi%C3%A8re-%C3%89ternit%C3%A9
//   L'Anse-Saint-Jean     48°14′N   70°12′W      https://en.wikipedia.org/wiki/L%27Anse-Saint-Jean,_Quebec
//   Petit-Saguenay        48°13′N   70°04′W      https://en.wikipedia.org/wiki/Petit-Saguenay
//   Tadoussac             48°09′N   69°43′W      https://en.wikipedia.org/wiki/Tadoussac
//   Les Escoumins         48°21′05″N 69°24′27″W  https://en.wikipedia.org/wiki/Les_Escoumins
//   Forestville           48°44′33″N 69°05′24″W  https://en.wikipedia.org/wiki/Forestville,_Quebec
//   Baie-Comeau           49°13′12″N 68°09′00″W  https://en.wikipedia.org/wiki/Baie-Comeau
//   Godbout               49°17′24″N 67°35′24″W  https://en.wikipedia.org/wiki/Godbout,_Quebec
//   Baie-Trinité          49°25′12″N 67°20′24″W  https://en.wikipedia.org/wiki/Baie-Trinit%C3%A9
//   Port-Cartier          50°01′48″N 66°52′12″W  https://en.wikipedia.org/wiki/Port-Cartier,_Quebec
//   Sept-Îles             50°12′00″N 66°22′48″W  https://en.wikipedia.org/wiki/Sept-%C3%8Eles,_Quebec
import { MOUTH_DISTANCE } from './path.js';

// labelPos hand-places each minimap label clear of the route line and the
// widget's edges — the route zigzags enough (and doubles back north near
// the mouth) that a single default offset overlaps the line or another
// label somewhere. Unused outside minimap.js.
export const FJORD_WAYPOINTS = [
  { name: 'La Baie', lat: 48.4283, lon: -71.0622, label: 'Put-in', labelPos: { dx: 1.4, dy: -2.4, anchor: 'start' } },
  { name: 'Sainte-Rose-du-Nord', lat: 48.3833, lon: -70.5833, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Rivière-Éternité', lat: 48.2556, lon: -70.4139, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: "L'Anse-Saint-Jean", lat: 48.2330, lon: -70.2000, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Petit-Saguenay', lat: 48.2170, lon: -70.0670, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, label: 'Tadoussac', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' } },
];
// The game world has no fixed "end" the way the fjord has Tadoussac — past
// the mouth it's the open Saint Lawrence, hugging the North Shore all the
// way out to Sept-Îles. These are real Côte-Nord towns strung along that
// coast (roughly Route 138), each placed by its real lat/lon same as the
// fjord waypoints above, just spaced much further apart in reality — see
// ESTUARY_SPAN_DISTANCE below for how that maps onto game-world distance.
export const ESTUARY_WAYPOINTS = [
  { name: 'Les Escoumins', lat: 48.3514, lon: -69.4075, labelPos: { dx: -1.4, dy: 0.9, anchor: 'end' } },
  { name: 'Forestville', lat: 48.7425, lon: -69.0900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Baie-Comeau', lat: 49.2200, lon: -68.1500, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Godbout', lat: 49.2900, lon: -67.5900, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Baie-Trinité', lat: 49.4200, lon: -67.3400, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Port-Cartier', lat: 50.0300, lon: -66.8700, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Sept-Îles', lat: 50.2000, lon: -66.3800, label: 'Sept-Îles', labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
];
// How much further downstream (game world units) it takes to cross the
// whole drawn Côte-Nord stretch after the mouth, before the minimap marker
// holds at its end. The real coastline this now covers (Tadoussac to
// Sept-Îles, ~400km) is roughly 7x the length of the whole fjord run, but
// this deliberately isn't scaled up 1:1 with that — cumulativeForFlowDistance
// below reparametrizes real distance onto this fixed span, so waypoints stay
// correctly spaced *relative to each other* regardless of what this number
// is; it only controls how long the stretch takes to paddle. 2400 (~2.7x
// the fjord's 900) makes it the clearly bigger part of the journey without
// turning a play session into an hour of open water. Tune freely.
export const ESTUARY_SPAN_DISTANCE = 2400;

export const ROUTE = [...FJORD_WAYPOINTS, ...ESTUARY_WAYPOINTS];

// Equirectangular projection, longitude compressed by cos(latitude) — the
// whole route spans well under a degree of latitude, so this is accurate to
// well within a pixel at minimap scale. Reference point is the
// northwesternmost waypoint purely so every projected coordinate is >= 0;
// it doesn't affect the shape.
const LAT_REF = FJORD_WAYPOINTS[0].lat;
const LON_REF = FJORD_WAYPOINTS[0].lon;
const KM_PER_LAT = 111.0;
const KM_PER_LON = 111.0 * Math.cos((LAT_REF * Math.PI) / 180);

export const points = ROUTE.map((w) => ({
  ...w,
  x: (w.lon - LON_REF) * KM_PER_LON,
  y: -(w.lat - LAT_REF) * KM_PER_LAT, // north is up
}));

// Cumulative straight-line distance (km) along the route.
export const cumulative = [0];
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
}
export const fjordEndCumulative = cumulative[FJORD_WAYPOINTS.length - 1];
export const totalCumulative = cumulative[cumulative.length - 1];

export function pointAtCumulative(target) {
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

export function cumulativeForFlowDistance(flowDistance) {
  if (flowDistance <= MOUTH_DISTANCE) {
    return (flowDistance / MOUTH_DISTANCE) * fjordEndCumulative;
  }
  const frac = Math.min(1, (flowDistance - MOUTH_DISTANCE) / ESTUARY_SPAN_DISTANCE);
  return fjordEndCumulative + frac * (totalCumulative - fjordEndCumulative);
}

// The inverse of cumulativeForFlowDistance — how far downstream (game world
// units) a canoe has to travel to reach a given point along the real route.
function flowDistanceForCumulative(cum) {
  if (cum <= fjordEndCumulative) {
    return (cum / fjordEndCumulative) * MOUTH_DISTANCE;
  }
  const frac = (cum - fjordEndCumulative) / (totalCumulative - fjordEndCumulative);
  return MOUTH_DISTANCE + frac * ESTUARY_SPAN_DISTANCE;
}

// Every named stop except the put-in (you start there, you don't arrive at
// it) as an in-game village, each tagged with the exact flowDistance a
// canoe reaches it. `side` (-1 left, +1 right) has no real-world meaning —
// the game's river isn't a literal trace of the real one — it's just
// alternated for visual variety.
export const VILLAGES = ROUTE.slice(1).map((w, i) => ({
  name: w.label || w.name,
  flowDistance: flowDistanceForCumulative(cumulative[i + 1]),
  side: i % 2 === 0 ? -1 : 1,
  // Stable per-village number: seeds the procedural building/dock layout
  // (twod/villages.js villageLayout) so every village is laid out
  // differently but a given one looks identical every time it's drawn or
  // walked around.
  seed: i + 1,
}));
