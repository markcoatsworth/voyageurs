// A small always-on-screen locator map, fixed outside the game canvas, that
// shows the canoe's position on the *real* Saguenay Fjord and (once past
// Tadoussac) the real Saint Lawrence estuary — not a schematic invented
// shape. The route is a set of real, named waypoints (upstream to
// downstream) connected with straight segments; it's accurate in relative
// position, bearing, and scale, not a traced coastline. Coordinates and
// their sources:
//   La Baie              48°25′42″N 71°03′44″W  https://en.wikipedia.org/wiki/La_Baie
//   Sainte-Rose-du-Nord   48°23′N   70°35′W      https://en.wikipedia.org/wiki/Sainte-Rose-du-Nord,_Quebec
//   Rivière-Éternité      48°15′20″N 70°24′50″W  https://en.wikipedia.org/wiki/Rivi%C3%A8re-%C3%89ternit%C3%A9
//   L'Anse-Saint-Jean     48°14′N   70°12′W      https://en.wikipedia.org/wiki/L%27Anse-Saint-Jean,_Quebec
//   Petit-Saguenay        48°13′N   70°04′W      https://en.wikipedia.org/wiki/Petit-Saguenay
//   Tadoussac             48°09′N   69°43′W      https://en.wikipedia.org/wiki/Tadoussac
//   Les Escoumins         48°21′05″N 69°24′27″W  https://en.wikipedia.org/wiki/Les_Escoumins
import { MOUTH_DISTANCE } from '../river/path.js';

// labelPos hand-places each label clear of the route line and the widget's
// edges — the route zigzags enough (and doubles back north near the mouth)
// that a single default offset overlaps the line or another label somewhere.
const FJORD_WAYPOINTS = [
  { name: 'La Baie', lat: 48.4283, lon: -71.0622, label: 'Put-in', labelPos: { dx: 1.4, dy: -2.4, anchor: 'start' } },
  { name: 'Sainte-Rose-du-Nord', lat: 48.3833, lon: -70.5833, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Rivière-Éternité', lat: 48.2556, lon: -70.4139, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: "L'Anse-Saint-Jean", lat: 48.2330, lon: -70.2000, labelPos: { dx: 1.4, dy: -2.2, anchor: 'start' } },
  { name: 'Petit-Saguenay', lat: 48.2170, lon: -70.0670, labelPos: { dx: -1.4, dy: 4.6, anchor: 'end' } },
  { name: 'Tadoussac', lat: 48.1500, lon: -69.7170, label: 'Tadoussac', labelPos: { dx: 1.6, dy: 3.4, anchor: 'start' } },
];
// The game world has no fixed "end" the way the fjord has Tadoussac — past
// the mouth it's open-ended estuary. This is just the real next stretch of
// coast to draw the marker continuing onto.
const ESTUARY_WAYPOINTS = [
  { name: 'Les Escoumins', lat: 48.3514, lon: -69.4075, labelPos: { dx: -1.4, dy: 0.9, anchor: 'end' } },
];
// How much further downstream (game world units) it takes to cross the
// drawn estuary stretch after the mouth, before the marker holds at its end.
const ESTUARY_SPAN_DISTANCE = 400;

const ROUTE = [...FJORD_WAYPOINTS, ...ESTUARY_WAYPOINTS];

// Equirectangular projection, longitude compressed by cos(latitude) — the
// whole route spans well under a degree of latitude, so this is accurate to
// well within a pixel at this widget's size. Reference point is the
// northwesternmost waypoint purely so every projected coordinate is >= 0;
// it doesn't affect the shape.
const LAT_REF = FJORD_WAYPOINTS[0].lat;
const LON_REF = FJORD_WAYPOINTS[0].lon;
const KM_PER_LAT = 111.0;
const KM_PER_LON = 111.0 * Math.cos((LAT_REF * Math.PI) / 180);

const points = ROUTE.map((w) => ({
  ...w,
  x: (w.lon - LON_REF) * KM_PER_LON,
  y: -(w.lat - LAT_REF) * KM_PER_LAT, // north is up
}));

// Cumulative straight-line distance (km) along the route, so a given game
// world-distance can be placed proportionally along it.
const cumulative = [0];
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
}
const fjordEndCumulative = cumulative[FJORD_WAYPOINTS.length - 1];
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

function cumulativeForFlowDistance(flowDistance) {
  if (flowDistance <= MOUTH_DISTANCE) {
    return (flowDistance / MOUTH_DISTANCE) * fjordEndCumulative;
  }
  const frac = Math.min(1, (flowDistance - MOUTH_DISTANCE) / ESTUARY_SPAN_DISTANCE);
  return fjordEndCumulative + frac * (totalCumulative - fjordEndCumulative);
}

const PAD = 6; // km of margin around the route inside the SVG viewBox
const xs = points.map((p) => p.x);
const ys = points.map((p) => p.y);
const minX = Math.min(...xs) - PAD;
const minY = Math.min(...ys) - PAD;
const viewW = Math.max(...xs) - minX + PAD;
const viewH = Math.max(...ys) - minY + PAD;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function createMinimap() {
  const wrap = document.createElement('div');
  wrap.id = 'minimap';

  const title = document.createElement('div');
  title.id = 'minimap-title';
  title.textContent = 'YOUR ROUTE';
  wrap.appendChild(title);

  // width/height are set in CSS (#minimap svg), not here — SVG's own
  // width/height attributes don't accept "auto" the way CSS does.
  const svg = svgEl('svg', {
    viewBox: `0 0 ${viewW.toFixed(2)} ${viewH.toFixed(2)}`,
  });

  const toSvg = (p) => ({ x: p.x - minX, y: p.y - minY });

  // The route itself, fjord and estuary as one continuous line (a subtly
  // different color past Tadoussac reads as "you've left the fjord").
  const fjordPts = points.slice(0, FJORD_WAYPOINTS.length).map(toSvg);
  const estuaryPts = points.slice(FJORD_WAYPOINTS.length - 1).map(toSvg);
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  svg.appendChild(svgEl('path', {
    d: toPath(fjordPts),
    fill: 'none',
    stroke: '#4fa8d8',
    'stroke-width': 1.1,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  }));
  svg.appendChild(svgEl('path', {
    d: toPath(estuaryPts),
    fill: 'none',
    stroke: '#2a6f8f',
    'stroke-width': 1.1,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    'stroke-dasharray': '1.6,1.2',
  }));

  // Waypoint dots, every one labeled with its real name.
  for (const p of points) {
    const sp = toSvg(p);
    svg.appendChild(svgEl('circle', { cx: sp.x, cy: sp.y, r: 0.7, fill: '#f4ead2' }));
    const label = p.label || p.name;
    const pos = p.labelPos || { dx: 1.4, dy: -2.2, anchor: 'start' };
    const text = svgEl('text', {
      x: sp.x + pos.dx,
      y: sp.y + pos.dy,
      fill: p.label ? '#ffd23f' : '#f4ead2',
      'font-size': 2.9,
      'font-weight': p.label ? 700 : 400,
      'text-anchor': pos.anchor,
    });
    text.textContent = label;
    svg.appendChild(text);
  }

  const marker = svgEl('circle', { r: 1.3, fill: '#ffd23f', stroke: '#1a1208', 'stroke-width': 0.4 });
  marker.id = 'minimap-marker';
  svg.appendChild(marker);

  wrap.appendChild(svg);

  return {
    el: wrap,
    update(flowDistance) {
      const p = toSvg(pointAtCumulative(cumulativeForFlowDistance(flowDistance)));
      marker.setAttribute('cx', p.x.toFixed(2));
      marker.setAttribute('cy', p.y.toFixed(2));
    },
  };
}
