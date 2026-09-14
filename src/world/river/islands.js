// Hand-authored ("baked") river features — landmasses and stretches too
// specific to a real place to generate from a formula, unlike the rest of
// river/path.js. See the module comment there for the shared d-number-line
// model this plugs into; see this repo's memory on why (a sudden landscape
// swap at a segment jump prompted moving toward baked, not procedural,
// geography one place at a time).
//
// Doesn't import river/path.js (which will import this file to wire these
// into braidAt()/rapidsStrength()) — that would be a circular import, so
// every d value here is a plain absolute number, with a comment tying it
// back to the route.js-derived flowDistance it was measured against at
// authoring time (lawrenceWest's SEGMENT_SHAPE_OFFSET is 60000 — see
// path.js — so "local" below means d - 60000). If route.js's Montreal-area
// waypoints ever move, these need re-deriving the same way (a quick node
// script importing route.js and reading VILLAGES) rather than assumed to
// still line up.

const LAWRENCE_WEST = 60000;

// Linear-interpolates a list of { d, ...fields } keyframes at d, clamping
// to the first/last keyframe's value outside their span (not extrapolating
// past the authored shape). Returns null outside the span entirely when
// `clampOutside` is false — used for shapes that should just not exist
// past their ends (an island, a rapids stretch) rather than holding their
// edge value forever.
function interpKeyframes(keyframes, d, fields, clampOutside) {
  if (d <= keyframes[0].d) return clampOutside ? keyframes[0] : null;
  const last = keyframes[keyframes.length - 1];
  if (d >= last.d) return clampOutside ? last : null;
  for (let i = 1; i < keyframes.length; i++) {
    if (d > keyframes[i].d) continue;
    const a = keyframes[i - 1], b = keyframes[i];
    const t = (d - a.d) / (b.d - a.d);
    const out = { d };
    for (const f of fields) out[f] = a[f] + (b[f] - a[f]) * t;
    return out;
  }
  return null; // unreachable given the bounds checks above
}

// --- The Island of Montreal ---
//
// Real geography (Wikipedia's Island of Montreal / Lachine Rapids
// articles): ~50km long, croissant-shaped, running east-west between the
// Saint Lawrence (south boundary, the main channel) and the Rivière des
// Prairies (north boundary, narrower, part of the Ottawa River system).
// The two rejoin at the island's east tip near Repentigny/Pointe-aux-
// Trembles, and split at its west tip at Lac des Deux-Montagnes. Old
// Montreal/the port sit on the south shore.
//
// Mapped onto this game's already-existing real-distance-derived village
// spacing: Charlemagne (local 2041) already sits right where real
// Repentigny does — the island's east tip — so the island keyframes below
// start tapering in just before it. Montreal's own dock (local 2168, see
// river/route.js — now pinned side:-1/south to match the real Vieux-Port)
// sits inside the wide south channel this shape produces. `offset` below
// is a worldX offset from the ambient centerX(d), not absolute, so the
// island rides the channel's own wander instead of drifting off it —
// positive offset shifts it toward the north/Charlemagne (side:1) edge,
// narrowing the Rivière-des-Prairies channel there and widening the south
// one, matching reality.
const MONTREAL_ISLAND_KEYFRAMES = [
  { d: LAWRENCE_WEST + 1980, offset: 0, half: 0 },    // east tip, just before Charlemagne
  { d: LAWRENCE_WEST + 2010, offset: 3, half: 2.2 },
  { d: LAWRENCE_WEST + 2041, offset: 5, half: 3.4 },  // abeam Charlemagne/Repentigny
  { d: LAWRENCE_WEST + 2070, offset: 7, half: 4.6 },
  { d: LAWRENCE_WEST + 2110, offset: 8, half: 5.0 },  // widest, ~Mount Royal
  { d: LAWRENCE_WEST + 2140, offset: 8, half: 4.6 },
  { d: LAWRENCE_WEST + 2168, offset: 7, half: 4.0 },  // abeam Montreal's dock
  { d: LAWRENCE_WEST + 2200, offset: 6, half: 3.2 },
  { d: LAWRENCE_WEST + 2240, offset: 5, half: 2.4 },
  { d: LAWRENCE_WEST + 2280, offset: 3.5, half: 1.4 },
  { d: LAWRENCE_WEST + 2318, offset: 0, half: 0 },    // west tip, Lake of Two Mountains
];

const MONTREAL_ISLAND_MIN_HALF = 0.12; // below this, treat as "no island" (matches path.js's braidAt taper cutoff)
const MONTREAL_ISLAND_MIN_SUBCHANNEL = 2.6; // narrowest either side may be clamped to (matches braidAt's BRAID_MIN_SUBCHANNEL)

// Same {centerX, halfWidth} contract as path.js's (procedural) braidAt() —
// every consumer of that function picks this up for free once braidAt()
// checks here first. centerX(d)/widthAt(d) are passed in rather than
// imported, to keep this module free of any river/path.js import (see the
// module comment). The authored offset/half are clamped against the live
// ambient width so a hand-typed keyframe can never pinch a sub-channel
// shut or push the island through a bank, however narrow the ambient river
// gets at some d the shape wasn't explicitly checked against — the shape
// itself stays authored, this is just a hard safety bound, same role
// MAX_WIDTH/MIN_WIDTH play elsewhere in this file.
export function featureIslandAt(d, ambientCenterX, ambientWidth) {
  const kf = interpKeyframes(MONTREAL_ISLAND_KEYFRAMES, d, ['offset', 'half'], false);
  if (!kf || kf.half < MONTREAL_ISLAND_MIN_HALF) return null;

  const half = ambientWidth / 2;
  let offset = kf.offset;
  let halfWidth = kf.half;
  const maxOffset = Math.max(0, half - halfWidth - MONTREAL_ISLAND_MIN_SUBCHANNEL);
  if (Math.abs(offset) > maxOffset) offset = Math.sign(offset) * maxOffset;
  const maxHalfWidth = Math.max(0, half - Math.abs(offset) - MONTREAL_ISLAND_MIN_SUBCHANNEL);
  if (halfWidth > maxHalfWidth) halfWidth = maxHalfWidth;
  if (halfWidth < MONTREAL_ISLAND_MIN_HALF) return null;

  return { centerX: ambientCenterX + offset, halfWidth };
}

// The overall span any feature island in this module could occupy — lets
// path.js's braidAt() cheaply skip the procedural small-island formula
// entirely when nowhere near one, without evaluating featureIslandAt().
export const FEATURE_ISLAND_RANGE = [
  MONTREAL_ISLAND_KEYFRAMES[0].d,
  MONTREAL_ISLAND_KEYFRAMES[MONTREAL_ISLAND_KEYFRAMES.length - 1].d,
];

// --- The Lachine Rapids ---
//
// A real, famous barrier: fur-trade canoes had to portage around these,
// just upriver/west of Old Montreal, before the Saint Lawrence opens into
// Lake St. Louis. Baked as a sustained rapidsStrength() override (see
// river/path.js) rather than the ambient periodic rapids — a fixed place,
// not a repeating pattern. Positioned in the stretch bossfights/
// chasseGalerie.js's TRIGGER_DISTANCE was pushed out to make room for (see
// its own comment) — roughly Montreal+20 to Montreal+130, easing down
// over the last stretch into the calm of Lake St. Louis before liftoff.
const LACHINE_RAPIDS_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2188, v: 0 },   // just past the dock
  { d: LAWRENCE_WEST + 2208, v: 1 },   // ramps up fast — no warning, like the real thing
  { d: LAWRENCE_WEST + 2260, v: 1 },   // sustained peak whitewater
  { d: LAWRENCE_WEST + 2300, v: 0 },   // opens into Lake St. Louis
];

export function lachineRapidsAt(d) {
  const kf = interpKeyframes(LACHINE_RAPIDS_KEYFRAMES, d, ['v'], false);
  return kf ? kf.v : null; // null = "not in this stretch, use the ambient periodic rapids"
}

export const LACHINE_RAPIDS_RANGE = [
  LACHINE_RAPIDS_KEYFRAMES[0].d,
  LACHINE_RAPIDS_KEYFRAMES[LACHINE_RAPIDS_KEYFRAMES.length - 1].d,
];

// Raw keyframe tables + clamp constants, exported so waterGL.js can
// generate its GLSL mirror straight from these numbers (a small JS
// codegen step at module-eval time) instead of hand-retyping them —
// the shape stays authored in exactly one place.
export { MONTREAL_ISLAND_KEYFRAMES, MONTREAL_ISLAND_MIN_HALF, MONTREAL_ISLAND_MIN_SUBCHANNEL, LACHINE_RAPIDS_KEYFRAMES };
