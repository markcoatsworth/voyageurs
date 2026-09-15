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
// This shape comes from an actual survey, not eyeballing: real coordinates
// for the island's two tips and seven paired north-shore/south-shore towns
// along its length (Sainte-Anne-de-Bellevue west tip; Pierrefonds,
// Cartierville, Ahuntsic, Rivière-des-Prairies on the north/Rivière-des-
// Prairies side; Baie-D'Urfé, Pointe-Claire, Lachine, Verdun, Old
// Montréal, Hochelaga-Maisonneuve, Mercier on the south/St. Lawrence side;
// Pointe-aux-Trembles east tip), projected onto the island's own west-tip-
// to-east-tip axis (same equirectangular technique river/route.js uses)
// to get each point's position along that axis and its sideways offset
// from it. The real result isn't a symmetric lens: the island is genuinely
// lopsided, narrow for its first third out of the west tip, then bulging
// hard — the north/Rivière-des-Prairies shore stays close to the straight
// axis the whole way, so almost all the width variation comes from the
// south shore ballooning out toward Verdun/Old Montréal/Mount Royal,
// roughly 60-70% of the way along from the west tip — before narrowing
// again into the east tip. `offset`/`half` below are that real profile
// (normalized to its own peak, then scaled to a peak that reads well at
// this game's visual scale — not 1:1 real kilometres, which would dwarf
// everything else in the game), and `MONTREAL_WIDTH_BOOST_KEYFRAMES`
// below reuses the exact same normalized profile for the corridor's
// overall width, so the "big open water" swell and the island's own
// footprint grow and shrink in step, the way they really do.
//
// Anchored the same way as before: the west tip lines up with
// bossfights/chasseGalerie.js's TRIGGER_DISTANCE (local 2318 — matches
// real Île-Perrot, just past the actual west tip, at local 2318 too — see
// that file's comment), and Montréal's own dock (local 2168, river/
// route.js, side:-1/south for the real Vieux-Port) has to land at the
// real fraction-of-the-island's-length that downtown actually sits at
// (measured the same survey way: ~30% of the way from the east tip) —
// which is what fixes the *east* tip at local 2102, not at Charlemagne's
// own flowDistance (2041). That's not a mismatch: real Charlemagne
// (Repentigny) sits a genuine ~8-12km short of the island's actual east
// tip in this same survey, across the water from it — so the ~61-unit gap
// of plain ambient river between Charlemagne and the island's start is
// the model, not an error.
//
// `offset` is a worldX offset from the ambient centerX(d), not absolute,
// so the island rides the channel's own wander instead of drifting off
// it — positive shifts it toward the north/Charlemagne (side:1) edge,
// narrowing the Rivière-des-Prairies channel and widening the south one,
// matching reality.
const MONTREAL_ISLAND_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2102.0, offset: 0.00, half: 0.00 },   // east tip (Pointe-aux-Trembles)
  { d: LAWRENCE_WEST + 2112.8, offset: 2.48, half: 1.57 },
  { d: LAWRENCE_WEST + 2134.4, offset: 6.20, half: 3.92 },
  { d: LAWRENCE_WEST + 2156.0, offset: 9.50, half: 6.01 },
  { d: LAWRENCE_WEST + 2177.6, offset: 15.00, half: 9.50 },  // widest — abeam Verdun/Mount Royal
  { d: LAWRENCE_WEST + 2199.2, offset: 13.82, half: 8.75 },
  { d: LAWRENCE_WEST + 2220.8, offset: 13.01, half: 8.24 },
  { d: LAWRENCE_WEST + 2242.4, offset: 9.05, half: 5.73 },
  { d: LAWRENCE_WEST + 2264.0, offset: 4.85, half: 3.07 },
  { d: LAWRENCE_WEST + 2285.6, offset: 3.59, half: 2.27 },
  { d: LAWRENCE_WEST + 2307.2, offset: 1.13, half: 0.71 },
  { d: LAWRENCE_WEST + 2318.0, offset: 0.00, half: 0.00 },   // west tip (Île-Perrot/Lake of Two Mountains)
];

// Same survey, same normalized profile (see the comment above) — the real
// water off Montreal is dramatically wider than a typical reach (the
// harbour, Lake St. Louis just upstream), and the island alone was eating
// so much of the *ambient* width that even the main south channel read as
// a squeeze right at the arrival — the opposite of "reaching a grand
// metropolis." This adds extra width on top of the ambient formula, only
// across the island's own span, ramping from 0 at both tips (so it blends
// seamlessly into the normal river just outside — no seam) to nearly
// double at the same real peak the island keyframes above widen at.
const MONTREAL_WIDTH_BOOST_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2102.0, boost: 0.00 },
  { d: LAWRENCE_WEST + 2112.8, boost: 7.59 },
  { d: LAWRENCE_WEST + 2134.4, boost: 19.00 },
  { d: LAWRENCE_WEST + 2156.0, boost: 29.12 },
  { d: LAWRENCE_WEST + 2177.6, boost: 46.00 },
  { d: LAWRENCE_WEST + 2199.2, boost: 42.37 },
  { d: LAWRENCE_WEST + 2220.8, boost: 39.88 },
  { d: LAWRENCE_WEST + 2242.4, boost: 27.74 },
  { d: LAWRENCE_WEST + 2264.0, boost: 14.86 },
  { d: LAWRENCE_WEST + 2285.6, boost: 10.99 },
  { d: LAWRENCE_WEST + 2307.2, boost: 3.45 },
  { d: LAWRENCE_WEST + 2318.0, boost: 0.00 },
];

export function montrealWidthBoostAt(d) {
  const kf = interpKeyframes(MONTREAL_WIDTH_BOOST_KEYFRAMES, d, ['boost'], false);
  return kf ? kf.boost : 0;
}

export const MONTREAL_WIDTH_BOOST_RANGE = [
  MONTREAL_WIDTH_BOOST_KEYFRAMES[0].d,
  MONTREAL_WIDTH_BOOST_KEYFRAMES[MONTREAL_WIDTH_BOOST_KEYFRAMES.length - 1].d,
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
export { MONTREAL_ISLAND_KEYFRAMES, MONTREAL_ISLAND_MIN_HALF, MONTREAL_ISLAND_MIN_SUBCHANNEL, LACHINE_RAPIDS_KEYFRAMES, MONTREAL_WIDTH_BOOST_KEYFRAMES };
