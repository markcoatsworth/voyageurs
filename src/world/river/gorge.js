// The Ottawa River gorge the Chasse-galerie flies through (bossfights/
// chasseGalerie.js) — baked, not the sine-wave gorgeWidthAt()/centerX()
// this used to blend into (see path.js's widthAt()/centerX() for where
// this plugs in). Per this repo's "no procedural landscape" direction
// ([[no-procedural-landscape]]): the player asked for the gorge itself to
// be fixed, not formula-generated, and for the flight to get
// progressively harder toward Le Diable — a baked shape gives direct,
// deliberate control over exactly that, which a live sine formula can't
// (there's no clean way to make `sin(d * k)` "narrow toward one specific
// point" without just... baking a narrowing curve, at which point it's
// this).
//
// Spans from OTTAWA_EASE_START + OTTAWA_EASE_LEN (path.js — where the
// blend out of the ambient river finishes, so these keyframes never fight
// that blend) to just past Gatineau's own dock (route.js), covering the
// whole flight from full-gorge to landing. `width` narrows steadily
// toward DIABLE_FLOW_DISTANCE (bossfights/diable.js) — physically
// tightening the thread you have to hold, the same lever as the steeples
// getting denser (chasseGalerie.js's STEEPLES) — then opens back up after
// the fight for the glide into Gatineau. `centerX` bends a few times for
// visual interest; deliberately mild so steeple positions (authored
// against this same fixed centerline) stay easy to reason about.
import { interpKeyframes } from './keyframes.js';

const GORGE_WIDTH_KEYFRAMES = [
  { d: 62370, width: 10.5 },  // gorge fully engaged (OTTAWA_EASE finishes here)
  { d: 62450, width: 9.5 },
  { d: 62550, width: 8.6 },
  { d: 62650, width: 7.8 },
  { d: 62750, width: 7.0 },
  { d: 62850, width: 6.5 },
  { d: 62950, width: 6.2 },
  { d: 62972, width: 6.2 },   // Diable arena — the tightest the thread gets
  { d: 62990, width: 7.5 },   // relief begins right after the fight
  { d: 63035, width: 11.0 },  // Gatineau's dock — wide open again
];

const GORGE_CENTERX_KEYFRAMES = [
  { d: 62370, centerX: 0 },
  { d: 62450, centerX: 1.5 },
  { d: 62550, centerX: -1.0 },
  { d: 62650, centerX: 2.0 },
  { d: 62750, centerX: -1.5 },
  { d: 62850, centerX: 0.5 },
  { d: 62950, centerX: -2.0 },
  { d: 62972, centerX: -1.0 },
  { d: 63035, centerX: 0 },
];

export const GORGE_RANGE = [
  GORGE_WIDTH_KEYFRAMES[0].d,
  GORGE_WIDTH_KEYFRAMES[GORGE_WIDTH_KEYFRAMES.length - 1].d,
];

// clampOutside: true — past either end this just holds the nearest
// keyframe's value rather than vanishing, since (unlike an island) there's
// always a river here; callers still gate on GORGE_RANGE themselves so the
// ambient/blend formulas run outside it.
export function gorgeWidthAt(d) {
  return interpKeyframes(GORGE_WIDTH_KEYFRAMES, d, ['width'], true).width;
}

export function gorgeCenterXAt(d) {
  return interpKeyframes(GORGE_CENTERX_KEYFRAMES, d, ['centerX'], true).centerX;
}

export { GORGE_WIDTH_KEYFRAMES, GORGE_CENTERX_KEYFRAMES };
