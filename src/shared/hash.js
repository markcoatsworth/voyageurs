// Deterministic pseudo-random in [0,1) for an integer bucket index. Scenery
// that has no gameplay state (trees, whales) is placed by hashing a bucket
// of downstream distance instead of being spawned/pooled/recycled — the
// same bucket always produces the same result, so nothing needs to be
// stored: the world regenerates itself identically every frame just by
// asking "what's here?" for whatever distance is on screen right now.
//
// This intentionally has no GLSL twin. An earlier version of the water
// shader (waterGL.js) ported this same sin()*43758.5453 trick to GLSL so the
// braid island's x-offset could be computed identically on both the JS/2D
// layer and the GPU — but the *43758.5453 multiply and floor() amplify even
// the tiny, unavoidable difference between a GPU's sin() and JS's
// double-precision Math.sin() (a few parts in a thousand) into a completely
// different fractional result. That's true at *any* input magnitude, not
// just large ones — restructuring the hash to keep its inputs small (which
// is what this file used to do, and still does, since it helps nothing) does
// not fix it. The two sides landed on different island positions, which
// showed up as a gap between the water shader's rendered edge and the 2D
// layer's island polygon. The fix: the water shader no longer hashes
// anything itself — the island's offset is computed once here, in JS, and
// handed to the shader as a plain uniform each frame (see waterGL.js).
export function hash(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function hashRange(n, salt, min, max) {
  const combined = hash(n) * 127.1 + hash(salt) * 311.7 + 74.7;
  return min + hash(combined) * (max - min);
}
