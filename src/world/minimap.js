// A small always-on-screen locator map, fixed outside the game canvas, that
// shows the canoe's position on the *real* geography — not a schematic
// invented shape. The route (waypoints, projection, cumulative distance)
// lives in world/river/route.js, shared with the in-game villages so the two
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
import {
  SEGMENTS, ALL_POINTS, LAC_SAINT_JEAN_SHAPE,
  MONTREAL_ISLAND_MAP_SHAPE, SAINTE_HELENE_MAP_POINT, NUNS_ISLAND_MAP_POINT, LACHINE_RAPIDS_MAP_POINT,
  MONTREAL_NORTH_CHANNEL_MAP_SHAPE, MONTREAL_SOUTH_CHANNEL_MAP_SHAPE, MONT_ROYAL_MAP_POINT,
} from './river/route.js';

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
  // The Rideau leg forks off lawrenceWest at Gatineau, so — like lawrenceWest
  // vs. lawrenceEast at Tadoussac — it needs its own hue to read as a
  // separate arm right at the split. Green, clear of the blues and purple.
  rideau: { outline: '#1f5e3a', fill: '#41b06d', outlineWidth: 3.0, fillWidth: 2.0 },
};

// The Island of Montreal's own two channels get a dedicated bright sky-blue
// (not lawrenceWest's purple, and not even lawrenceEast's own blue, which
// is a muted "steel" tone close enough to the purple in darkness/saturation
// that the two can be hard to tell apart at this widget's small size and
// low contrast against the dark green background). This one's deliberately
// vivid and unambiguous — closer to a clear-sky blue than the rest of this
// map's muted "real water" palette — since being obviously, unmistakably
// blue right where the channel split is the whole point being shown
// matters more here than matching the rest of the map's restrained style.
const MONTREAL_CHANNEL_STYLE = { outline: '#1565c0', fill: '#4da6ff', outlineWidth: 3.2, fillWidth: 2.2 };

const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const toClosedPath = (pts) => `${toPath(pts)} Z`;

// riverWidthKm (route.js, every waypoint) floored so the real narrowest
// reaches — the Rideau's canal towns run as little as 0.15km — don't
// vanish to an invisible hairline at this widget's scale; the ceiling end
// (the Sept-Îles estuary, ~50km) is left alone since accurately reading as
// "this is basically open water here" is the whole point.
const MIN_RIVER_HALF_WIDTH_KM = 0.45;
// Extra half-width the outline ribbon gets over the fill ribbon, in km —
// a constant border regardless of the channel's own real width, same role
// the old fixed outlineWidth/fillWidth stroke pair played, just additive
// now that the fill itself varies.
const OUTLINE_BORDER_KM = 0.7;

function halfWidthKmAt(p) {
  return Math.max(MIN_RIVER_HALF_WIDTH_KM, (p.riverWidthKm ?? MIN_RIVER_HALF_WIDTH_KM * 2) / 2);
}

// Turns a polyline + a half-width per vertex into a single closed ribbon
// polygon (left edge forward, right edge backward) instead of the old
// fixed-stroke-width path, so the water actually reads as narrow or wide
// where the real river is. Per-vertex normals are the *averaged* direction
// of each vertex's incoming and outgoing segments (a standard cheap miter),
// not a fresh per-segment normal, so consecutive quads share an edge
// exactly instead of leaving seams/gaps at each waypoint.
function ribbonPolygon(points, halfWidths) {
  const n = points.length;
  const normals = [];
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0;
    if (i > 0) {
      const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) || 1;
      dx += (points[i].x - points[i - 1].x) / len;
      dy += (points[i].y - points[i - 1].y) / len;
    }
    if (i < n - 1) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y) || 1;
      dx += (points[i + 1].x - points[i].x) / len;
      dy += (points[i + 1].y - points[i].y) / len;
    }
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }
  const left = points.map((p, i) => ({ x: p.x + normals[i].x * halfWidths[i], y: p.y + normals[i].y * halfWidths[i] }));
  const right = points.map((p, i) => ({ x: p.x - normals[i].x * halfWidths[i], y: p.y - normals[i].y * halfWidths[i] }));
  right.reverse();
  return [...left, ...right];
}

// Splits a segment's point list into separate runs wherever a waypoint is
// flagged mapSkipRibbon (route.js — currently just Charlemagne/Montreal,
// where the minimap draws the real Island of Montreal channels instead of
// the straight chord this list would otherwise connect them with). Each
// run gets its own ribbon polygon rather than one continuous one, so the
// skipped stretch is left undrawn for the dedicated channel shapes to
// cover instead.
function splitAtSkip(points) {
  const runs = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    // Check the flag *before* deciding where this point goes — appending
    // it to the current run first and only then splitting (the original,
    // buggy order) draws the very chord this exists to suppress, one
    // point too late.
    if (points[i - 1].mapSkipRibbon) runs.push([points[i]]);
    else runs[runs.length - 1].push(points[i]);
  }
  return runs.filter((run) => run.length > 1);
}

function drawRibbon(svg, points, style, widthBoost = 1) {
  const outlineHalf = points.map((p) => halfWidthKmAt(p) * widthBoost + OUTLINE_BORDER_KM);
  svg.appendChild(svgEl('path', { d: toClosedPath(ribbonPolygon(points, outlineHalf)), fill: style.outline }));
}
function fillRibbon(svg, points, style, widthBoost = 1) {
  const fillHalf = points.map((p) => halfWidthKmAt(p) * widthBoost);
  svg.appendChild(svgEl('path', { d: toClosedPath(ribbonPolygon(points, fillHalf)), fill: style.fill }));
}

// Turns a closed loop of points into a smooth, rounded outline instead of a
// hard-edged polygon — quadratic curves through each edge's midpoint, using
// the original points as control points, a standard cheap way to round off
// a shape defined by only a handful of points (see LAC_SAINT_JEAN_SHAPE's
// own comment for why it's loose rather than a surveyed coastline).
function smoothClosedPath(pts) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[pts.length - 1], pts[0]);
  let d = `M${start.x.toFixed(2)},${start.y.toFixed(2)} `;
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    const m = mid(curr, next);
    d += `Q${curr.x.toFixed(2)},${curr.y.toFixed(2)} ${m.x.toFixed(2)},${m.y.toFixed(2)} `;
  }
  return d + 'Z';
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

  // A soft "developed area" tint for the Island of Montreal's interior
  // (drawn further down, clipped to MONTREAL_ISLAND_MAP_SHAPE) — a warm
  // radial fade centered between Old Montreal's dock and Mont-Royal,
  // fading to fully transparent (so the plain island green shows through)
  // a few km out, rather than a hard-edged patch. Defs go in one block up
  // front since SVG only resolves url(#id) references, not element order.
  const defs = svgEl('defs', {});
  const developedGradient = svgEl('radialGradient', { id: 'montreal-developed' });
  developedGradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#7d7a4a' }));
  developedGradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#7d7a4a', 'stop-opacity': 0 }));
  defs.appendChild(developedGradient);
  const islandClip = svgEl('clipPath', { id: 'montreal-island-clip' });
  islandClip.appendChild(svgEl('path', { d: smoothClosedPath(MONTREAL_ISLAND_MAP_SHAPE) }));
  defs.appendChild(islandClip);
  svg.appendChild(defs);

  // Lac Saint-Jean, drawn first so the fjord's own outline/fill paint over
  // its edge right where the river leaves it — reads as the route flowing
  // out of the lake rather than the lake sitting on top of the route. A
  // plain single outline+fill (not the double-stroke river treatment
  // below) since a lake this size doesn't need it to read as water.
  svg.appendChild(svgEl('path', {
    d: smoothClosedPath(LAC_SAINT_JEAN_SHAPE), fill: '#5fa8d9', stroke: '#245a78', 'stroke-width': 1.4,
  }));

  // Outlines drawn first for *every* segment, then all fills on top, so no
  // segment's outline cuts across another's fill right at the Tadoussac
  // junction where all three meet. Each is now a variable-width ribbon
  // polygon (ribbonPolygon), not a fixed-stroke-width path, so the water
  // actually widens/narrows to match the real river (route.js's
  // riverWidthKm) instead of reading as a uniform line regardless of
  // whether it's the Rideau's canal towns or the Sept-Îles estuary.
  // splitAtSkip breaks each segment's own polyline at mapSkipRibbon
  // waypoints, leaving the Island of Montreal's stretch for the two
  // dedicated channel shapes just below instead.
  const segmentList = Object.values(SEGMENTS);
  const segmentRuns = segmentList.map((seg) => ({ style: SEGMENT_STYLE[seg.id], runs: splitAtSkip(seg.points) }));
  for (const { style, runs } of segmentRuns) for (const run of runs) drawRibbon(svg, run, style);
  for (const { style, runs } of segmentRuns) for (const run of runs) fillRibbon(svg, run, style);

  // Real land, painted the same deep green as the widget's own background
  // (#minimap in style.css) so it reads as a hole cut into the water
  // rather than a rendering gap — the same visual language Google Maps-
  // style terrain tiles use for islands. Drawn *before* the Montreal
  // channels below, not after: the island's real shape is genuinely huge
  // next to its own real channels (a ~50km landmass split by 1-4km-wide
  // water), so painting it first and letting the channels paint over its
  // edges is what actually gets a map that reads as "blue water, with an
  // island in it" instead of "a green landmass with a thin blue trace
  // around it" — accurate real proportions were making a legible picture
  // impossible, not just an unblue one.
  // A touch lighter/warmer than the widget's own background (not an exact
  // match) plus a warm tan coastline — gives the island real visual
  // weight of its own rather than just a thin ring.
  const MINIMAP_LAND_COLOR = '#3a5c2e';
  const MINIMAP_COASTLINE = '#d8c9a0';
  svg.appendChild(svgEl('path', {
    d: smoothClosedPath(MONTREAL_ISLAND_MAP_SHAPE), fill: MINIMAP_LAND_COLOR, stroke: MINIMAP_COASTLINE, 'stroke-width': 1.1,
  }));

  // The developed-area tint itself — centered between Old Montreal's real
  // dock coordinate and Mont-Royal (both real, both close together, so
  // one soft patch covers the actual historic core rather than the whole
  // island) instead of leaving the interior flat, undifferentiated green.
  const montrealDockPoint = SEGMENTS.lawrenceWest.points.find((p) => p.name === 'Montreal');
  const developedCenter = {
    x: (montrealDockPoint.x + MONT_ROYAL_MAP_POINT.x) / 2,
    y: (montrealDockPoint.y + MONT_ROYAL_MAP_POINT.y) / 2,
  };
  svg.appendChild(svgEl('circle', {
    cx: developedCenter.x, cy: developedCenter.y, r: 6.5,
    fill: 'url(#montreal-developed)', 'clip-path': 'url(#montreal-island-clip)',
  }));

  // The Island of Montreal's own two real channels — MONTREAL_CHANNEL_STYLE
  // (a dedicated bright blue; see that constant's comment), drawn hugging
  // the island's real shorelines instead of the straight chords the plain
  // waypoint list would give (see mapSkipRibbon's comment on those two
  // waypoints), and at MONTREAL_CHANNEL_WIDTH_BOOST× their real width so
  // they read as the dominant color here rather than a thin trace around
  // a big green interior (see the island's own comment just above).
  //
  // Charlemagne and Ile-Perrot (real towns, real coordinates) don't sit
  // exactly at the island's real east/west tips — Charlemagne is ~8km
  // from the true east tip, Ile-Perrot ~3km from the true west tip — so
  // without a connector there's a real, unfilled gap between where
  // splitAtSkip cut the ordinary ribbon off and where these channel
  // shapes start, which read as a confusing patch of plain background
  // rather than water. Bridge both gaps with short two-point ribbons
  // (the channel shapes' own first/last points already carry the tip
  // coordinates, so no new export is needed for those).
  const MONTREAL_CHANNEL_WIDTH_BOOST = 2.4;
  const lawrenceWestPoints = SEGMENTS.lawrenceWest.points;
  const charlemagnePoint = lawrenceWestPoints.find((p) => p.name === 'Charlemagne');
  const ilePerrotPoint = lawrenceWestPoints.find((p) => p.name === 'Ile-Perrot');
  const eastTipPoint = MONTREAL_NORTH_CHANNEL_MAP_SHAPE[MONTREAL_NORTH_CHANNEL_MAP_SHAPE.length - 1];
  const westTipPoint = MONTREAL_NORTH_CHANNEL_MAP_SHAPE[0];
  const montrealConnectors = [
    [charlemagnePoint, eastTipPoint],
    [westTipPoint, ilePerrotPoint],
  ];
  const montrealPieces = [MONTREAL_NORTH_CHANNEL_MAP_SHAPE, MONTREAL_SOUTH_CHANNEL_MAP_SHAPE, ...montrealConnectors];
  for (const piece of montrealPieces) drawRibbon(svg, piece, MONTREAL_CHANNEL_STYLE, MONTREAL_CHANNEL_WIDTH_BOOST);
  for (const piece of montrealPieces) fillRibbon(svg, piece, MONTREAL_CHANNEL_STYLE, MONTREAL_CHANNEL_WIDTH_BOOST);
  const SOUTH_ISLAND_MARKER_RADIUS = 0.9;
  for (const p of [SAINTE_HELENE_MAP_POINT, NUNS_ISLAND_MAP_POINT]) {
    svg.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: SOUTH_ISLAND_MARKER_RADIUS, fill: MINIMAP_LAND_COLOR, stroke: MINIMAP_COASTLINE, 'stroke-width': 0.6,
    }));
  }

  // The Lachine Rapids — a rough stretch of water, not land, so a bit of
  // whitewater texture (a small cluster of pale chevrons) over the ribbon
  // rather than a hole cut into it.
  const rapids = svgEl('g', { stroke: '#eaf6ff', 'stroke-width': 0.3, 'stroke-linecap': 'round', fill: 'none', opacity: 0.85 });
  const RAPIDS_CHEVRONS = [{ dx: -1.1, dy: -0.6 }, { dx: 0, dy: 0.3 }, { dx: 1.1, dy: -0.4 }];
  for (const c of RAPIDS_CHEVRONS) {
    const cx = LACHINE_RAPIDS_MAP_POINT.x + c.dx, cy = LACHINE_RAPIDS_MAP_POINT.y + c.dy;
    rapids.appendChild(svgEl('path', { d: `M${(cx - 0.5).toFixed(2)},${(cy - 0.35).toFixed(2)} L${cx.toFixed(2)},${(cy + 0.35).toFixed(2)} L${(cx + 0.5).toFixed(2)},${(cy - 0.35).toFixed(2)}` }));
  }
  svg.appendChild(rapids);

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
    // world/river/path.js's SEGMENT_SHAPE_OFFSET); it takes knowing which segment
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
