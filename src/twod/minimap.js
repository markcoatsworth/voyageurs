// A small always-on-screen locator map, fixed outside the game canvas, that
// shows the canoe's position on the *real* Saguenay Fjord and (once past
// Tadoussac) the real Saint Lawrence estuary — not a schematic invented
// shape. The route (waypoints, projection, cumulative distance) lives in
// river/route.js, shared with the in-game villages so the two agree on
// where everything is.
import { FJORD_WAYPOINTS, points, pointAtCumulative, cumulativeForFlowDistance } from '../river/route.js';

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
