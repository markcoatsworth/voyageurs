// A small always-on-screen locator map, fixed outside the game canvas, that
// shows the canoe's position on the *real* Saguenay Fjord and (once past
// Tadoussac) the real Saint Lawrence North Shore — not a schematic invented
// shape. The route (waypoints, projection, cumulative distance) lives in
// river/route.js, shared with the in-game villages so the two agree on
// where everything is.
//
// The route now runs the fjord plus ~400km of Côte-Nord coastline out to
// Sept-Îles — far too much ground to show at a legible scale all at once in
// a small corner widget. So unlike the old design (the whole route drawn
// once, a marker crawling along it), this is a *moving* map: a fixed-size
// square window that stays centered on the canoe, panning across a route
// drawn once in absolute map-projection coordinates. Panning is just moving
// the SVG viewBox — the route/label markup itself never needs rebuilding.
import { FJORD_WAYPOINTS, points, pointAtCumulative, cumulativeForFlowDistance } from '../river/route.js';

// Width/height of the visible window, in the same km-equivalent units as
// the projected route points. Picked against the real gaps between
// waypoints (10-87km along the Côte-Nord stretch) so at least one
// neighbouring stop is usually in view, without zooming out so far the
// fjord's tightly-spaced villages all blur together at the start.
const VIEW_SIZE = 90;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function createMinimap() {
  const wrap = document.createElement('div');
  wrap.id = 'minimap';

  // width/height are set in CSS (#minimap svg), not here — SVG's own
  // width/height attributes don't accept "auto"/percentages the way CSS
  // does. The viewBox itself is set per-frame in update() below, since it's
  // what pans; this initial value just avoids a blank flash before the
  // first update() call.
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`,
  });

  // The route itself, drawn as a proper river ribbon (a wide fill over a
  // slightly wider outline) rather than a hairline — modeled on how Google
  // Maps renders water, which is what gives the deep-green-land/blue-water
  // look its texture instead of just being a flat color swap. The estuary
  // segment is drawn a little wider and a shade deeper, both because the
  // real Saint Lawrence dwarfs the fjord and so the difference reads as
  // "you've left the fjord" without needing a dash pattern (rivers on a
  // real map are never dashed).
  const fjordPts = points.slice(0, FJORD_WAYPOINTS.length);
  const estuaryPts = points.slice(FJORD_WAYPOINTS.length - 1);
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Outlines drawn first for *both* segments, then both fills on top, so
  // the fjord's outline doesn't cut across the wider estuary fill right at
  // the Tadoussac join.
  svg.appendChild(svgEl('path', { d: toPath(fjordPts), fill: 'none', stroke: '#245a78', 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('path', { d: toPath(estuaryPts), fill: 'none', stroke: '#1e4f6e', 'stroke-width': 3.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('path', { d: toPath(fjordPts), fill: 'none', stroke: '#5fa8d9', 'stroke-width': 1.7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('path', { d: toPath(estuaryPts), fill: 'none', stroke: '#3d84b8', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // Waypoint dots, every one labeled with its real name, in absolute
  // projection coordinates — the panning viewBox brings each into view as
  // the canoe approaches it. Light fill with a dark halo on both the dots
  // and the label text, since either can land on the deep green land or
  // right on top of the blue river.
  for (const p of points) {
    svg.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: 0.9, fill: '#f4ead2', stroke: '#16240f', 'stroke-width': 0.4,
    }));
    const label = p.label || p.name;
    const pos = p.labelPos || { dx: 1.4, dy: -2.2, anchor: 'start' };
    const text = svgEl('text', {
      x: p.x + pos.dx,
      y: p.y + pos.dy,
      fill: p.label ? '#ffd23f' : '#f4ead2',
      stroke: p.label ? '#1a1208' : '#16240f',
      'stroke-width': 0.6,
      'paint-order': 'stroke',
      'font-size': 3.6,
      'font-weight': p.label ? 700 : 400,
      'text-anchor': pos.anchor,
    });
    text.textContent = label;
    svg.appendChild(text);
  }

  const marker = svgEl('circle', { r: 3.2, fill: '#ffd23f', stroke: '#1a1208', 'stroke-width': 0.8 });
  marker.id = 'minimap-marker';
  svg.appendChild(marker);

  wrap.appendChild(svg);

  return {
    el: wrap,
    update(flowDistance) {
      const p = pointAtCumulative(cumulativeForFlowDistance(flowDistance));
      marker.setAttribute('cx', p.x.toFixed(2));
      marker.setAttribute('cy', p.y.toFixed(2));
      const half = VIEW_SIZE / 2;
      svg.setAttribute('viewBox', `${(p.x - half).toFixed(2)} ${(p.y - half).toFixed(2)} ${VIEW_SIZE} ${VIEW_SIZE}`);
    },
  };
}
