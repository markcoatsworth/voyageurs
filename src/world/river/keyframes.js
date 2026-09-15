// Shared by every "baked" river-geography module (islands.js, gorge.js) —
// see islands.js's module comment for why baked keyframes exist at all.

// Linear-interpolates a list of { d, ...fields } keyframes at d, clamping
// to the first/last keyframe's value outside their span (not extrapolating
// past the authored shape). Returns null outside the span entirely when
// `clampOutside` is false — used for shapes that should just not exist
// past their ends (an island, a rapids stretch) rather than holding their
// edge value forever.
export function interpKeyframes(keyframes, d, fields, clampOutside) {
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
