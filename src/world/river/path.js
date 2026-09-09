// Defines the river's course as pure functions of "downstream distance" (d):
// how far along the river a given point is, measured from the put-in at the
// Saguenay Fjord. The course models a real place — the fjord narrows between
// cliffs upstream, then widens as it opens into the Saint Lawrence estuary
// near Tadoussac.
//
// Anything that drifts toward the camera at the current flow speed has a
// downstream distance that never changes: d = world.distance - z, and both
// world.distance and z advance at the same rate each frame, so d is fixed
// the moment a piece of geometry or an obstacle is (re)spawned. That lets
// every curved/width-varying shape be baked once at spawn time instead of
// re-evaluated every frame.

import { hashRange } from '../../shared/hash.js';

export const FJORD_WIDTH = 8;
// The real Saint Lawrence off Tadoussac dwarfs the fjord — this is what
// actually makes the estuary wider than the screen (CANVAS_WIDTH/
// PIXELS_PER_UNIT = 20 world units across at once; see game.js's camera for
// how steering across something this much wider than that stays on screen).
export const ESTUARY_WIDTH = 48;
export const MIN_WIDTH = 6.5;
// Enough headroom above ESTUARY_WIDTH for the amplified pinch/wobble below
// to swing without getting clipped flat.
export const MAX_WIDTH = 62;

// Roughly how far downstream (in meters travelled) the fjord opens out into
// the Saint Lawrence — the game's version of arriving at Tadoussac. This is
// where Tadoussac itself sits (river/route.js) and where the fjord segment
// ceilings (game.js) — not where the channel actually reaches full width;
// see WIDTH_EASE_DISTANCE below for why those are two different numbers.
export const MOUTH_DISTANCE = 900;

// How far it actually takes the channel to fully open up, vs. MOUTH_DISTANCE
// above (where Tadoussac itself sits). These used to be the same number, and
// that was the bug behind getting stuck right at Tadoussac's dock: at
// d=MOUTH_DISTANCE the old curve was *already* at full ESTUARY_WIDTH
// (~46 units), while the dock only reaches ~6 units in from the bank — a
// blind 15-20+ unit crossing, through reduced-steering-authority rapids that
// happen to sit right there, capped by a hard ceiling that (unlike every
// other wide-river dock past this point) leaves nowhere to go if you don't
// make it in time. Stretching the ease-in past Tadoussac keeps its own
// stretch of channel dockable like every other fjord village — the width
// then keeps opening up into lawrenceEast's own early stretch, reaching full
// width around the gap between Les Escoumins and Forestville instead.
const WIDTH_EASE_DISTANCE = 1700;

// centerX/widthAt/braidAt/rapidsStrength below are pure functions of one
// shared number line — fine when the whole river was one continuous line,
// not so fine now that Tadoussac is a real three-way junction (the fjord in,
// the Saint Lawrence east to Sept-Îles, the Saint Lawrence west to Québec
// City — see river/route.js's module comment). Rather than teach every one
// of these functions about "segments," each segment just gets its own slice
// of the same shared number line: game.js tracks *which* segment is active
// and adds its offset before ever calling into this file, so nothing here
// or in terrain.js/obstacles.js/whales.js/waterGL.js needs to change at
// all — they just see a d value, exactly as before.
//
// lawrenceEast's offset (MOUTH_DISTANCE) is exactly how the estuary already
// worked before segments existed — d simply kept increasing past the mouth.
// lawrenceWest's offset is an arbitrary distant point on the same periodic
// curves, picked (by scanning a few candidates) to be far from
// lawrenceEast's own range — so the two don't visually echo each other
// along their first couple thousand units — *and* to land somewhere calm
// on rapidsStrength() right at its own start, rather than dropping the
// player into near-peak whitewater the instant they commit to this branch
// at Tadoussac's dock.
//
// rideau's offset is picked the same way (scanned for a calm rapids patch
// at its start and no braid island right on the launch point) and sits well
// past lawrenceWest's whole range *and* past the Ottawa gorge trigger in
// widthAt() below — which is why widthAt() checks the rideau branch first.
// The Rideau is the made-up Ottawa-to-Kingston leg (see river/route.js): no
// real river runs that line, so it gets its own bespoke width profile
// rather than borrowing the shared estuary curve.
export const SEGMENT_SHAPE_OFFSET = {
  fjord: 0,
  lawrenceEast: MOUTH_DISTANCE,
  lawrenceWest: 60000,
  rideau: 94080,
};

// How long the Rideau leg takes to paddle end to end, game-world units —
// same role LAWRENCE_WEST_SPAN_DISTANCE plays for that segment (see
// river/route.js). Shorter than the earlier legs on purpose: it's the
// journey's denouement after Le Diable, not another full act.
export const RIDEAU_SPAN_DISTANCE = 1700;
const RIDEAU_OFFSET = SEGMENT_SHAPE_OFFSET.rideau;

// Past this width the water reads as open estuary rather than fjord — used
// to decide when belugas start showing up. Corresponds to roughly the last
// fifth of the approach to Tadoussac, once the cubic ease-in below has
// actually started opening the channel up — not a fixed fraction of the old,
// much narrower ESTUARY_WIDTH, which would now trigger the moment the fjord
// starts easing open at all, long before the water actually looks estuarial.
export const ESTUARY_WIDTH_THRESHOLD = 30;

// How much more the pinch/wobble terms below swing in the estuary than in
// the fjord, ramped by the same estuaryProgress() as the trend width itself.
// Without this, the +/-5ish unit variation that reads as a real "wide pool
// vs. narrow rapids" texture against a 17-unit fjord mouth would barely
// register against a 48-unit river — the big Saint Lawrence stretch would
// look like a flat, characterless pipe instead of a real river.
const ESTUARY_AMP_SCALE = 2.8;

export function centerX(d) {
  return Math.sin(d * 0.09) * 3 + Math.sin(d * 0.21 + 1.7) * 1.5;
}

export function estuaryProgress(d) {
  return Math.min(1, Math.max(0, d) / WIDTH_EASE_DISTANCE);
}

// The Rideau's width, purely as a function of position along the leg: a
// plain river leaving the Ottawa, swelling into the broad Rideau Lake
// reaches through the middle, pinching down through the Cataraqui narrows,
// then flaring wide open into Kingston harbour on Lake Ontario for the
// arrival. Nothing here models a real channel — it's shaped for the ride.
function rideauWidthAt(d) {
  const frac = Math.min(1, Math.max(0, (d - RIDEAU_OFFSET) / RIDEAU_SPAN_DISTANCE));
  // The last sixth of the leg is the harbour opening up; everything before
  // it is river -> lakes -> narrows.
  const HARBOUR_FROM = 0.84;
  let trend;
  if (frac < HARBOUR_FROM) {
    // A half-sine bell: ~12-unit river at each end, ~42-unit open lake in
    // the middle.
    const p = frac / HARBOUR_FROM;
    trend = 12 + 30 * Math.sin(Math.PI * p);
  } else {
    // Smooth flare from the narrows out to a touch wider than the estuary —
    // the widest water in the game, so Kingston reads as arriving on a lake.
    const p = (frac - HARBOUR_FROM) / (1 - HARBOUR_FROM);
    const eased = p * p * (3 - 2 * p);
    trend = 12 + (ESTUARY_WIDTH + 6 - 12) * eased;
  }
  const wobble = Math.sin(d * 0.05 + 4) * 1.6 + Math.sin(d * 0.13) * 0.8;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, trend + wobble));
}

export function widthAt(d) {
  // The Rideau leg (river/route.js) — its own profile, checked first because
  // its shape offset sits past the Ottawa gorge trigger just below and would
  // otherwise be swallowed by it.
  if (d >= RIDEAU_OFFSET) return rideauWidthAt(d);

  // Ottawa River (Chasse-galerie section) — a tight gorge, so the big church
  // steeples cutting in from the banks leave only a narrow thread to fly.
  // Starts just before Montreal on lawrenceWest (offset ~2150 past that
  // segment's shape offset — Montreal's own flowDistance).
  const OTTAWA_FLOW = SEGMENT_SHAPE_OFFSET.lawrenceWest + 2150;
  if (d > OTTAWA_FLOW) {
    const ottawaWidth = 8 + Math.sin(d * 0.09) * 1.4 + Math.sin(d * 0.037 + 2) * 0.9;
    return Math.max(6.2, ottawaWidth); // ~6-10.5 units wide (vs 20-44 normally)
  }

  // Cubic ease-in, not the raw linear progress — the fjord should stay
  // close to its own width for most of the approach and only really open up
  // right near the mouth ("until the walls fall away and the Saint Lawrence
  // opens wide," per the intro caption), not visibly turn into a kilometre-
  // wide river a third of the way down what's supposed to read as a narrow
  // fjord. A linear ramp all the way to a target this much bigger than the
  // old ESTUARY_WIDTH would do exactly that.
  const t = estuaryProgress(d);
  const eased = t * t * t;
  const trend = FJORD_WIDTH + (ESTUARY_WIDTH - FJORD_WIDTH) * eased;
  // A slow, wide-swinging term for real wide-pool/narrow-rapids stretches,
  // layered under the finer wobble — this is what makes the width change
  // read as deliberate rather than a faint texture on top of the trend.
  const ampScale = 1 + (ESTUARY_AMP_SCALE - 1) * eased;
  const pinch = Math.sin(d * 0.023 + 1.2) * 2.6 * ampScale;
  const wobble = (Math.sin(d * 0.05 + 4) * 1.6 + Math.sin(d * 0.12) * 0.6) * ampScale;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, trend + pinch + wobble));
}

// --- braided channels: short stretches where the river splits around a
// small mid-channel island, then rejoins. ---
//
// Islands are scheduled on a fixed period rather than randomly, but each
// cycle can bail out (no island that cycle) if the channel isn't wide
// enough there to fit two safe passages plus the island — so islands
// naturally show up more often as the river widens toward the estuary,
// without ever forcing an unfair, too-narrow squeeze.
export const BRAID_PERIOD = 110; // world units between candidate islands
export const BRAID_LENGTH = 16; // world units an island's taper spans
const BRAID_MAX_ISLAND_HALF = 1.1; // half-width at the island's widest point
const BRAID_MIN_SUBCHANNEL = 2.6; // narrowest a safe side passage may be

// The island's x-offset within its safe range, per cycle. Split out from
// braidAt() so the water shader can ask for this exact same value (computed
// here, in JS) instead of trying to reproduce the hash in GLSL — see the
// comment in hash.js for why that doesn't work.
export function braidOffsetFraction(cycle) {
  return hashRange(cycle, 401, -0.85, 0.85);
}

// Returns null where there's no island, or { centerX, halfWidth } (both in
// the same world-X units as centerX(d)) describing the island's shape at
// this exact d. halfWidth tapers from 0 up to BRAID_MAX_ISLAND_HALF and
// back to 0 across the span, so the split opens and closes smoothly.
//
// Both the island's size and its offset from the channel centerline are
// recomputed fresh from the *local* width/centerX at this exact d (not a
// single snapshot from the span's midpoint) — the channel can meander and
// its width can wobble noticeably over a BRAID_LENGTH-unit span, and if the
// island's geometry didn't track that, the safe-passage guarantee would
// only actually hold at the span's center, not across the whole thing.
export function braidAt(d) {
  const cycle = Math.floor(d / BRAID_PERIOD);
  const spanStart = cycle * BRAID_PERIOD + (BRAID_PERIOD - BRAID_LENGTH) / 2;
  const t = (d - spanStart) / BRAID_LENGTH;
  if (t <= 0 || t >= 1) return null;

  const shape = Math.sin(Math.PI * t); // 0 -> 1 -> 0, a lens/eye taper
  let halfWidth = BRAID_MAX_ISLAND_HALF * shape;
  if (halfWidth < 0.12) return null; // too thin at the very tip to matter

  const half = widthAt(d) / 2;
  const maxHalfWidth = half - BRAID_MIN_SUBCHANNEL;
  if (maxHalfWidth <= 0.12) return null; // too narrow right here for any island
  halfWidth = Math.min(halfWidth, maxHalfWidth * 0.9);

  const maxOffset = Math.max(0, half - halfWidth - BRAID_MIN_SUBCHANNEL);
  const offsetFraction = braidOffsetFraction(cycle);

  return {
    centerX: centerX(d) + offsetFraction * maxOffset,
    halfWidth,
  };
}

// --- rapids: short stretches where the current pushes the canoe forward
// faster than paddling alone would, with matching whitewater rendering in
// the water shader. Scheduled on its own period rather than tied directly
// to the width pinch above — the two land close together often enough
// (both are slow oscillations over similar scales) to read as "the water's
// fast where it's narrow," without literally being the same calculation.
export const RAPIDS_PERIOD = 85; // world units between candidate rapids
export const RAPIDS_LENGTH = 22; // world units a rapids stretch spans

// Returns 0 (calm) to 1 (peak whitewater) at this exact d, tapering
// smoothly in and out across the span so the current builds and eases
// rather than switching on like a wall.
export function rapidsStrength(d) {
  const cycle = Math.floor(d / RAPIDS_PERIOD);
  const spanStart = cycle * RAPIDS_PERIOD + (RAPIDS_PERIOD - RAPIDS_LENGTH) / 2;
  const t = (d - spanStart) / RAPIDS_LENGTH;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t);
}
