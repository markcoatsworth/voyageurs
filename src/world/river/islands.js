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

import { interpKeyframes } from './keyframes.js';

const LAWRENCE_WEST = 60000;

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
// everything else in the game — see the scale-choice comment below).
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
// offset/half peak at 8/6 (not the ~15/9.5 an earlier pass used) — that
// earlier pass also added a width *boost* on top of the ambient channel
// (nearly doubling it, up to ~88 units at the peak) to keep the south
// channel feeling open. That was a mistake independent of the shape
// itself: CANOE_SCREEN_X/PIXELS_PER_UNIT (shared/config.js) only show
// CANVAS_WIDTH/PIXELS_PER_UNIT = 20 world units across the screen at once,
// and the camera's default tracking (game.js's cameraCenterX) follows the
// *ambient* centerX(d), which knows nothing about the island's offset —
// so widening the corridor to ~88 units while offsetting the island ~15
// units off that centerline pushed most of the split outside the default
// view entirely; a player going straight without deliberately steering
// toward it would plausibly never see it. Scaled back down to fit inside
// the *existing* ambient width (no boost at all now — see widthAt() in
// path.js, which no longer touches Montreal specially), so the whole
// south-channel/island/north-channel cross-section stays close to a
// normal stretch's width elsewhere in the game.
const MONTREAL_ISLAND_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2102.0, offset: 0.00, half: 0.00 },   // east tip (Pointe-aux-Trembles)
  { d: LAWRENCE_WEST + 2112.8, offset: 1.32, half: 0.99 },
  { d: LAWRENCE_WEST + 2134.4, offset: 3.30, half: 2.48 },
  { d: LAWRENCE_WEST + 2156.0, offset: 5.06, half: 3.80 },
  { d: LAWRENCE_WEST + 2177.6, offset: 8.00, half: 6.00 },   // widest — abeam Verdun/Mount Royal
  { d: LAWRENCE_WEST + 2199.2, offset: 7.37, half: 5.53 },
  { d: LAWRENCE_WEST + 2220.8, offset: 6.94, half: 5.20 },
  { d: LAWRENCE_WEST + 2242.4, offset: 4.82, half: 3.62 },
  { d: LAWRENCE_WEST + 2264.0, offset: 2.58, half: 1.94 },
  { d: LAWRENCE_WEST + 2285.6, offset: 1.91, half: 1.43 },
  { d: LAWRENCE_WEST + 2307.2, offset: 0.60, half: 0.45 },
  { d: LAWRENCE_WEST + 2318.0, offset: 0.00, half: 0.00 },   // west tip (Île-Perrot/Lake of Two Mountains)
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

// --- Île Sainte-Hélène and Nuns' Island (Île des Sœurs) ---
//
// Two real islands sitting *inside* the south (main) channel the Island
// of Montreal's own split creates, near downtown — not a hand-wave, both
// genuinely existed by 1790. Île Sainte-Hélène (surveyed position: local
// ~2152): named by Champlain in 1611, part of the Le Moyne (Longueuil)
// barony from 1665, developed by the family in the early 1700s as a
// country estate — manor house, mills on the Sainte-Marie current, cider
// press, gardens. Nuns' Island (surveyed position: local ~2174): the
// Congrégation de Notre-Dame's farm since 1706, sole owners from 1769 (an
// auction win) — by 1790 the *whole* island was theirs, worked as
// farmland for their Montreal schools and orphanages.
//
// Same {centerX, halfWidth} shape contract as featureIslandAt() above,
// but a second, independent split *nested inside* the south sub-channel
// that one already carves out — river/path.js's braidAt() only ever
// returns one island, so this is a separate function consumers check
// alongside it, not folded into it.
//
// Both real positions sit close to Montréal's own dock (local 2168,
// route.js) and its DOCK_WIDTH_Z footprint (village.js — roughly local
// 2161-2175) — reaching MONTREAL_DOCK_REACH (16 units) out from the main
// island's own south edge into this same channel. Rather than model a
// dock-avoidance lane (the south channel is consistently 21-24 units wide
// across this whole stretch — comfortably enough for both a real
// secondary island *and* the dock's reach, verified by sampling — but
// getting that exactly right at every d the dock's footprint spans is
// more moving parts than the payoff is worth), each island's own span is
// just kept clear of the dock's d-range entirely: Sainte-Hélène tapers
// out by local 2160, Nuns' Island doesn't start until 2178. That's why
// Nuns' Island's peak sits at local ~2198 rather than its literal
// surveyed ~2174 — the same kind of small, documented nudge already made
// for Pointe-aux-Trembles/Fort Senneville's landmarks (terrain.js) when
// the literal coordinate didn't leave room for what has to stand there.
//
// `offset` is measured the same way as the main island's — from the
// *ambient* centerX(d), not from the main island's own south edge —
// which keeps this independent of the main island's exact shape (no
// import of braidAt()/featureIslandAt() needed here, avoiding another
// circular-import risk) at the cost of not dynamically tracking the main
// island's south edge; safe in practice because both spans were chosen,
// and verified, to sit well clear of it (minimum ~10 units of clearance
// to the main island at every sampled d — see the authoring notes this
// comment is condensed from).
const SAINTE_HELENE_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2118, offset: 0, half: 0 },
  { d: LAWRENCE_WEST + 2130, offset: -10, half: 1.8 },
  { d: LAWRENCE_WEST + 2140, offset: -13, half: 2.7 },
  { d: LAWRENCE_WEST + 2145, offset: -14, half: 3.0 },  // peak, abeam the real island
  { d: LAWRENCE_WEST + 2150, offset: -13, half: 2.7 },
  { d: LAWRENCE_WEST + 2158, offset: -6, half: 0.8 },
  { d: LAWRENCE_WEST + 2160, offset: 0, half: 0 },       // clear of the dock's d-range (~2161-2175)
];
const NUNS_ISLAND_KEYFRAMES = [
  { d: LAWRENCE_WEST + 2178, offset: 0, half: 0 },       // clear of the dock's d-range
  { d: LAWRENCE_WEST + 2188, offset: -9, half: 1.6 },
  { d: LAWRENCE_WEST + 2195, offset: -12, half: 2.6 },
  { d: LAWRENCE_WEST + 2200, offset: -12, half: 2.8 },  // peak
  { d: LAWRENCE_WEST + 2208, offset: -11, half: 2.3 },
  { d: LAWRENCE_WEST + 2216, offset: -5, half: 0.8 },
  { d: LAWRENCE_WEST + 2222, offset: 0, half: 0 },
];

const SOUTH_ISLAND_MIN_HALF = 0.12;
// Only clamps against running past the true south bank (a self-contained
// check using just the ambient width, same as this file's other clamps) —
// doesn't also clamp against the main island's own south edge, per the
// module comment above on why that's safe here without needing it live.
function clampSouthIsland(kf, ambientCenterX, ambientWidth) {
  if (!kf || kf.half < SOUTH_ISLAND_MIN_HALF) return null;
  const half = ambientWidth / 2;
  let offset = kf.offset;
  let halfWidth = kf.half;
  const maxAbsOffset = Math.max(0, half - MONTREAL_ISLAND_MIN_SUBCHANNEL);
  if (-offset > maxAbsOffset) offset = -maxAbsOffset; // these islands only ever sit south (negative offset)
  const maxHalfWidth = Math.max(0, half - Math.abs(offset) - MONTREAL_ISLAND_MIN_SUBCHANNEL);
  if (halfWidth > maxHalfWidth) halfWidth = maxHalfWidth;
  if (halfWidth < SOUTH_ISLAND_MIN_HALF) return null;
  return { centerX: ambientCenterX + offset, halfWidth };
}

// The two spans never overlap (2118-2160 and 2178-2222), so checking both
// and returning whichever matches (if either) is unambiguous.
export function southIslandAt(d, ambientCenterX, ambientWidth) {
  const heleneKf = interpKeyframes(SAINTE_HELENE_KEYFRAMES, d, ['offset', 'half'], false);
  if (heleneKf) return clampSouthIsland(heleneKf, ambientCenterX, ambientWidth);
  const nunsKf = interpKeyframes(NUNS_ISLAND_KEYFRAMES, d, ['offset', 'half'], false);
  if (nunsKf) return clampSouthIsland(nunsKf, ambientCenterX, ambientWidth);
  return null;
}

export const SOUTH_ISLAND_RANGE = [
  SAINTE_HELENE_KEYFRAMES[0].d,
  NUNS_ISLAND_KEYFRAMES[NUNS_ISLAND_KEYFRAMES.length - 1].d,
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
export {
  MONTREAL_ISLAND_KEYFRAMES, MONTREAL_ISLAND_MIN_HALF, MONTREAL_ISLAND_MIN_SUBCHANNEL, LACHINE_RAPIDS_KEYFRAMES,
  SAINTE_HELENE_KEYFRAMES, NUNS_ISLAND_KEYFRAMES, SOUTH_ISLAND_MIN_HALF,
};
