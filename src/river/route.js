// Shared geography for the river's real waypoints — the Saguenay Fjord from
// La Baie down to Tadoussac, then into the Saint Lawrence estuary. Used by
// both the minimap (drawing the route + marker) and the village system
// (placing villages at the exact same real-world points along the actual
// playable river), so "you're at Tadoussac" means the same thing on the
// minimap and in the game world. Coordinates and their sources:
//   La Baie              48°25′42″N 71°03′44″W  https://en.wikipedia.org/wiki/La_Baie
//   Sainte-Rose-du-Nord   48°23′N   70°35′W      https://en.wikipedia.org/wiki/Sainte-Rose-du-Nord,_Quebec
//   Rivière-Éternité      48°15′20″N 70°24′50″W  https://en.wikipedia.org/wiki/Rivi%C3%A8re-%C3%89ternit%C3%A9
//   L'Anse-Saint-Jean     48°14′N   70°12′W      https://en.wikipedia.org/wiki/L%27Anse-Saint-Jean,_Quebec
//   Petit-Saguenay        48°13′N   70°04′W      https://en.wikipedia.org/wiki/Petit-Saguenay
//   Tadoussac             48°09′N   69°43′W      https://en.wikipedia.org/wiki/Tadoussac
//   Les Escoumins         48°21′05″N 69°24′27″W  https://en.wikipedia.org/wiki/Les_Escoumins
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
// the mouth it's open-ended estuary. This is just the real next stretch of
// coast to place a village/draw the marker continuing onto.
export const ESTUARY_WAYPOINTS = [
  { name: 'Les Escoumins', lat: 48.3514, lon: -69.4075, labelPos: { dx: -1.4, dy: 0.9, anchor: 'end' } },
];
// How much further downstream (game world units) it takes to cross the
// drawn estuary stretch after the mouth, before the minimap marker holds at
// its end.
export const ESTUARY_SPAN_DISTANCE = 400;

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
