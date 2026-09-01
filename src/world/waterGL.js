// Real shader-based water: a WebGL canvas layered *underneath* the 2D
// sprite/terrain canvas, visible only through the river-shaped hole the 2D
// layer leaves open (see terrain.js — it draws banks but not water).
//
// This exists because flat Canvas2D fills, however textured, can't do the
// thing that actually reads as "water": light. Real water shows specular
// glints that shift with waves, a fresnel-like brightening near its edges,
// and a depth gradient toward the channel center. All of that needs a
// fragment shader evaluated per-pixel — a GPU program, not a bitmap pattern.
//
// The river's shape (centerX/widthAt from world/river/path.js) is duplicated here
// in GLSL rather than shared, because there's no practical way to hand a
// JS function to the GPU — keep the two in sync if you retune the course.

import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT, AHEAD_UNITS, BEHIND_UNITS } from '../shared/config.js';
import { BRAID_PERIOD, BRAID_LENGTH, RAPIDS_PERIOD, RAPIDS_LENGTH, braidOffsetFraction } from './river/path.js';

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_worldDistance;
uniform float u_cameraWorldX;

// The braid island's x-offset (see world/river/path.js's braidOffsetFraction) is
// computed on the CPU and handed in per-cycle rather than hashed here — see
// the comment in river/hash.js for why a GPU-side hash can't be trusted to
// land on the same value as the JS/2D layer. At most two candidate cycles
// can be on screen at once (the visible d-range is far shorter than a
// BRAID_PERIOD), so two slots is enough.
uniform float u_braidCycleA;
uniform float u_braidOffsetA;
uniform float u_braidCycleB;
uniform float u_braidOffsetB;

const float CANOE_SCREEN_X = ${CANOE_SCREEN_X.toFixed(2)};
const float CANOE_SCREEN_Y = ${CANOE_SCREEN_Y.toFixed(2)};
const float PPU = ${PIXELS_PER_UNIT.toFixed(2)};
const float BRAID_PERIOD = ${BRAID_PERIOD.toFixed(2)};
const float BRAID_LENGTH = ${BRAID_LENGTH.toFixed(2)};
const float RAPIDS_PERIOD = ${RAPIDS_PERIOD.toFixed(2)};
const float RAPIDS_LENGTH = ${RAPIDS_LENGTH.toFixed(2)};

// --- river course, mirrors world/river/path.js — keep in sync by hand ---
float centerX(float d) {
  return sin(d * 0.09) * 3.0 + sin(d * 0.21 + 1.7) * 1.5;
}
float estuaryProgress(float d) {
  // 1700.0 (WIDTH_EASE_DISTANCE), not 900.0 (MOUTH_DISTANCE/where Tadoussac
  // itself sits) — see world/river/path.js's comment on why those are different.
  return clamp(d / 1700.0, 0.0, 1.0);
}
float widthAt(float d) {
  // Cubic ease-in, mirroring world/river/path.js's widthAt() — see its comment
  // for why this isn't just a linear ramp to ESTUARY_WIDTH.
  float t = estuaryProgress(d);
  float eased = t * t * t;
  float trend = 8.0 + (48.0 - 8.0) * eased;
  float ampScale = 1.0 + (2.8 - 1.0) * eased;
  float pinch = sin(d * 0.023 + 1.2) * 2.6 * ampScale;
  float wobble = (sin(d * 0.05 + 4.0) * 1.6 + sin(d * 0.12) * 0.6) * ampScale;
  return clamp(trend + pinch + wobble, 6.5, 62.0);
}

// Looks up the CPU-computed offset for whichever of the two candidate
// cycles this pixel's d actually falls in (see the u_braidCycleA/B comment
// above). Falls back to B when A doesn't match, so a single active cycle
// (the common case) works whichever slot the CPU happened to put it in.
float braidOffsetForCycle(float cycle) {
  if (abs(cycle - u_braidCycleA) < 0.5) return u_braidOffsetA;
  return u_braidOffsetB;
}

// Mirrors world/river/path.js's braidAt() — returns (centerX, halfWidth) of the
// mid-channel island at this d, with halfWidth <= 0.0 meaning "no island".
// The two private tuning constants (max island size, min safe passage)
// aren't exported from world/river/path.js, so they're hand-copied here too.
vec2 braidAt(float d) {
  float cycle = floor(d / BRAID_PERIOD);
  float spanStart = cycle * BRAID_PERIOD + (BRAID_PERIOD - BRAID_LENGTH) * 0.5;
  float t = (d - spanStart) / BRAID_LENGTH;
  if (t <= 0.0 || t >= 1.0) return vec2(0.0, -1.0);

  float shape = sin(3.14159265 * t);
  float halfWidth = 1.1 * shape; // BRAID_MAX_ISLAND_HALF
  if (halfWidth < 0.12) return vec2(0.0, -1.0);

  float half_ = widthAt(d) * 0.5;
  float maxHalfWidth = half_ - 2.6; // BRAID_MIN_SUBCHANNEL
  if (maxHalfWidth <= 0.12) return vec2(0.0, -1.0);
  halfWidth = min(halfWidth, maxHalfWidth * 0.9);

  float maxOffset = max(0.0, half_ - halfWidth - 2.6);
  float offsetFraction = braidOffsetForCycle(cycle);

  return vec2(centerX(d) + offsetFraction * maxOffset, halfWidth);
}

// Mirrors world/river/path.js's rapidsStrength() — 0 (calm) to 1 (peak whitewater).
float rapidsStrength(float d) {
  float cycle = floor(d / RAPIDS_PERIOD);
  float spanStart = cycle * RAPIDS_PERIOD + (RAPIDS_PERIOD - RAPIDS_LENGTH) * 0.5;
  float t = (d - spanStart) / RAPIDS_LENGTH;
  if (t <= 0.0 || t >= 1.0) return 0.0;
  return sin(3.14159265 * t);
}

void main() {
  // gl_FragCoord has origin bottom-left; our screen-space convention
  // (matching the 2D canvas) has row 0 at the top.
  float y = u_resolution.y - gl_FragCoord.y;
  float x = gl_FragCoord.x;

  float d = u_worldDistance - (y - CANOE_SCREEN_Y) / PPU;
  float worldX = (x - CANOE_SCREEN_X) / PPU + u_cameraWorldX;

  float cx = centerX(d);
  float halfW = widthAt(d) * 0.5;
  float leftEdge = cx - halfW;
  float rightEdge = cx + halfW;
  if (worldX < leftEdge || worldX > rightEdge) discard;

  vec2 braid = braidAt(d);
  if (braid.y > 0.0 && worldX > braid.x - braid.y && worldX < braid.x + braid.y) discard;

  float distToEdge = min(worldX - leftEdge, rightEdge - worldX);
  float distFrac = clamp(distToEdge / max(halfW, 0.001), 0.0, 1.0);

  float rapids = rapidsStrength(d);

  // Rolling body waves — a few sine terms at different spatial/temporal
  // frequencies so the surface doesn't tile obviously. Phase depends on d
  // (downstream distance), so as the world flows past, the waves visibly
  // travel with the current instead of just sitting there shimmering.
  float t = u_time;
  float wave =
      sin(worldX * 1.6 + d * 0.55) * 0.45 +
      sin(worldX * 3.1 - d * 0.9 + t * 0.6) * 0.28 +
      sin(worldX * 0.7 + d * 0.22 - t * 0.3) * 0.27;

  // Whitewater turbulence — a higher-frequency, faster-moving chop layered
  // on top of the calm-water waves, scaled by how deep into a rapids
  // stretch this pixel is so it fades in/out with the current rather than
  // switching on abruptly.
  float turbulence =
      sin(worldX * 9.0 - d * 3.5 + t * 4.0) * sin(worldX * 4.7 + d * 2.1 - t * 3.1);
  wave += turbulence * rapids * 0.7;

  // A second, higher-frequency layer drives sparkle highlights — sparse,
  // bright glints rather than a smooth gradient, the way sun on ripples
  // actually looks. Two product terms at differently-oriented, non-aligned
  // frequencies (rather than one) so the bright spots land at scattered
  // points instead of forming ridges/streaks along one diagonal. Rapids
  // speed the glint animation up and add a third, choppier term so
  // whitewater sparkles read as churning rather than gently glinting.
  float glintSpeed = 1.0 + rapids * 1.8;
  float g1 = sin(worldX * 5.3 + d * 2.3 + t * 1.3 * glintSpeed);
  float g2 = sin(worldX * 8.7 - d * 1.4 + t * 0.8 * glintSpeed);
  float g3 = sin(worldX * 2.1 + d * 3.9 - t * 1.1 * glintSpeed);
  float glintWave = g1 * g2 * 0.5 + g2 * g3 * 0.5;
  float glint = pow(max(glintWave, 0.0), mix(9.0, 4.0, rapids));

  vec3 deep = vec3(0.075, 0.24, 0.37);
  vec3 shallow = vec3(0.16, 0.42, 0.58);
  vec3 highlight = vec3(0.55, 0.82, 0.92);
  vec3 foam = vec3(0.88, 0.97, 1.0);

  // Deeper toward mid-channel, lighter toward the banks (shallows).
  vec3 color = mix(shallow, deep, distFrac);
  color = mix(color, shallow, clamp(wave * 0.5 + 0.5, 0.0, 1.0) * 0.35);
  color += highlight * glint * 1.3;

  // Foam band hugging both shorelines, width breathing slightly with the
  // waves so it doesn't read as a static ring.
  float foamWidth = 0.10 + wave * 0.02;
  float foamAmt = 1.0 - smoothstep(0.0, foamWidth, distFrac);
  color = mix(color, foam, foamAmt * 0.6);

  // Whitewater: broken, foamy patches scattered across the whole channel
  // width (not just the shoreline), density and brightness both rising
  // with rapids strength.
  float foamPatch = turbulence * 0.5 + 0.5;
  float whitewaterAmt = smoothstep(0.35, 0.85, foamPatch) * rapids;
  color = mix(color, foam, whitewaterAmt * 0.8);

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile failed: ' + info);
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link failed: ' + info);
  }
  return program;
}

// Returns null if WebGL isn't available — callers should fall back to a
// simpler 2D-drawn water fill in that case.
export function createWaterRenderer(canvas) {
  let gl;
  try {
    // preserveDrawingBuffer: the capsize freeze (game.js) stops calling
    // render() entirely once game-over hits — without this, WebGL's default
    // implicit clear-after-composite would make the water vanish on the
    // very next frame instead of staying on the last drawn frame.
    const opts = { alpha: true, antialias: false, preserveDrawingBuffer: true };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  let program;
  try {
    program = createProgram(gl, VERT_SRC, FRAG_SRC);
  } catch (err) {
    console.warn('Water shader failed to compile, falling back to 2D water fill.', err);
    return null;
  }

  const posLoc = gl.getAttribLocation(program, 'a_pos');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    worldDistance: gl.getUniformLocation(program, 'u_worldDistance'),
    cameraWorldX: gl.getUniformLocation(program, 'u_cameraWorldX'),
    braidCycleA: gl.getUniformLocation(program, 'u_braidCycleA'),
    braidOffsetA: gl.getUniformLocation(program, 'u_braidOffsetA'),
    braidCycleB: gl.getUniformLocation(program, 'u_braidCycleB'),
    braidOffsetB: gl.getUniformLocation(program, 'u_braidOffsetB'),
  };

  return {
    ok: true,
    render(time, worldDistance, cameraWorldX) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.worldDistance, worldDistance);
      gl.uniform1f(uniforms.cameraWorldX, cameraWorldX);

      // The visible d-range spans at most two BRAID_PERIOD cycles (usually
      // just one) — compute both candidates' island offsets here on the CPU
      // and hand them in, rather than hashing on the GPU (see the uniform
      // declarations in FRAG_SRC for why).
      const dLo = worldDistance - BEHIND_UNITS;
      const dHi = worldDistance + AHEAD_UNITS;
      const cycleA = Math.floor(dLo / BRAID_PERIOD);
      const cycleB = Math.floor(dHi / BRAID_PERIOD);
      gl.uniform1f(uniforms.braidCycleA, cycleA);
      gl.uniform1f(uniforms.braidOffsetA, braidOffsetFraction(cycleA));
      gl.uniform1f(uniforms.braidCycleB, cycleB);
      gl.uniform1f(uniforms.braidOffsetB, braidOffsetFraction(cycleB));

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}
