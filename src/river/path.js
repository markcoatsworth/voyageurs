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

export const FJORD_WIDTH = 6;
export const ESTUARY_WIDTH = 15;
export const MIN_WIDTH = 5;
export const MAX_WIDTH = 17;

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
  const wobble = Math.sin(d * 0.05 + 4) * 1.8 + Math.sin(d * 0.12) * 0.7;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, trend + wobble));
}
