// A small always-on-screen locator map, fixed outside the game canvas, that
// shows the canoe's position on the *real* geography — not a schematic
// invented shape. The route (waypoints, projection, cumulative distance)
// lives in river/route.js, shared with the in-game villages so the two
// agree on where everything is.
//
// The river is a real three-way junction at Tadoussac (the Saguenay Fjord,
// the Saint Lawrence east to Sept-Îles, the Saint Lawrence west to Québec
// City — see route.js's module comment), covering far too much ground to
// show at a legible scale all at once in a small corner widget. So this is
// a *moving* map: a fixed-size square window that stays centered on the
// canoe, panning across all three branches drawn once in absolute
// map-projection coordinates. Panning is just moving the SVG viewBox — the
// route/label markup itself never needs rebuilding, only which segment's
// cumulative-distance math update() uses to place the marker changes.
import { SEGMENTS, ALL_POINTS } from '../river/route.js';

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

// One outline+fill color pair per segment — modeled on how Google Maps
// renders water (a wide fill over a slightly wider outline, not a hairline)
// — so the three branches read as distinct arms of the same junction rather
// than blurring into one line. lawrenceWest gets its own hue (rather than
// reusing lawrenceEast's) specifically because they meet at the same point
// on screen; two arms of a fork in the same color would be hard to tell
// apart right at the junction.
const SEGMENT_STYLE = {
  fjord: { outline: '#245a78', fill: '#5fa8d9', outlineWidth: 2.6, fillWidth: 1.7 },
  lawrenceEast: { outline: '#1e4f6e', fill: '#3d84b8', outlineWidth: 3.2, fillWidth: 2.2 },
  lawrenceWest: { outline: '#3a1e6e', fill: '#7d5fd9', outlineWidth: 3.2, fillWidth: 2.2 },
};

const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

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

  // Outlines drawn first for *every* segment, then all fills on top, so no
  // segment's outline cuts across another's fill right at the Tadoussac
  // junction where all three meet.
  const segmentList = Object.values(SEGMENTS);
  for (const seg of segmentList) {
    const style = SEGMENT_STYLE[seg.id];
    svg.appendChild(svgEl('path', {
      d: toPath(seg.points), fill: 'none', stroke: style.outline, 'stroke-width': style.outlineWidth,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }
  for (const seg of segmentList) {
    const style = SEGMENT_STYLE[seg.id];
    svg.appendChild(svgEl('path', {
      d: toPath(seg.points), fill: 'none', stroke: style.fill, 'stroke-width': style.fillWidth,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // Waypoint dots, every one labeled with its real name, in absolute
  // projection coordinates — the panning viewBox brings each into view as
  // the canoe approaches it. Light fill with a dark halo on both the dots
  // and the label text, since either can land on the deep green land or
  // right on top of the blue river. Tadoussac appears at the end of the
  // fjord's own point list and again as the start of both Saint Lawrence
  // segments' — drawing it three times over is harmless (same position,
  // same label, just redundant paint).
  for (const p of ALL_POINTS) {
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
    // segmentId + flowDistance, not a single flowDistance — flowDistance
    // alone no longer says where the canoe is on the *real* map now that
    // three segments share the same underlying shape-math number line (see
    // river/path.js's SEGMENT_SHAPE_OFFSET); it takes knowing which segment
    // that number belongs to as well.
    update(segmentId, flowDistance) {
      const seg = SEGMENTS[segmentId];
      const localFlowDistance = flowDistance - seg.shapeOffset;
      const cum = seg.cumulativeForLocalFlowDistance(localFlowDistance);
      const p = seg.pointAtCumulative(cum);
      marker.setAttribute('cx', p.x.toFixed(2));
      marker.setAttribute('cy', p.y.toFixed(2));
      const half = VIEW_SIZE / 2;
      svg.setAttribute('viewBox', `${(p.x - half).toFixed(2)} ${(p.y - half).toFixed(2)} ${VIEW_SIZE} ${VIEW_SIZE}`);
    },
  };
}
