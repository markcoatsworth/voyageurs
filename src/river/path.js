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

import { hashRange } from './hash.js';

export const FJORD_WIDTH = 8;
export const ESTUARY_WIDTH = 17;
export const MIN_WIDTH = 6.5;
export const MAX_WIDTH = 18.5;

// Roughly how far downstream (in meters travelled) the fjord opens out into
// the Saint Lawrence — the game's version of arriving at Tadoussac.
export const MOUTH_DISTANCE = 900;

// Past this width the water reads as open estuary rather than fjord —
// used to decide when belugas start showing up.
export const ESTUARY_WIDTH_THRESHOLD = 11.5;

export function centerX(d) {
  return Math.sin(d * 0.09) * 3 + Math.sin(d * 0.21 + 1.7) * 1.5;
}

export function estuaryProgress(d) {
  return Math.min(1, Math.max(0, d) / MOUTH_DISTANCE);
}

export function widthAt(d) {
  const trend = FJORD_WIDTH + (ESTUARY_WIDTH - FJORD_WIDTH) * estuaryProgress(d);
  // A slow, wide-swinging term for real wide-pool/narrow-rapids stretches,
  // layered under the finer wobble — this is what makes the width change
  // read as deliberate rather than a faint texture on top of the trend.
  const pinch = Math.sin(d * 0.023 + 1.2) * 2.6;
  const wobble = Math.sin(d * 0.05 + 4) * 1.6 + Math.sin(d * 0.12) * 0.6;
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
