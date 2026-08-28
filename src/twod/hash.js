// Deterministic pseudo-random in [0,1) for an integer bucket index. Scenery
// that has no gameplay state (trees, whales) is placed by hashing a bucket
// of downstream distance instead of being spawned/pooled/recycled — the
// same bucket always produces the same result, so nothing needs to be
// stored: the world regenerates itself identically every frame just by
// asking "what's here?" for whatever distance is on screen right now.
export function hash(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function hashRange(n, salt, min, max) {
  return min + hash(n + salt * 1000.7) * (max - min);
}
