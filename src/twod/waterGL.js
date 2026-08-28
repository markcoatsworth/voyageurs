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
// The river's shape (centerX/widthAt from river/path.js) is duplicated here
// in GLSL rather than shared, because there's no practical way to hand a
// JS function to the GPU — keep the two in sync if you retune the course.

import { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from './config.js';

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_worldDistance;
uniform float u_canoeWorldX;

const float CANOE_SCREEN_X = ${CANOE_SCREEN_X.toFixed(2)};
const float CANOE_SCREEN_Y = ${CANOE_SCREEN_Y.toFixed(2)};
const float PPU = ${PIXELS_PER_UNIT.toFixed(2)};

// --- river course, mirrors river/path.js — keep in sync by hand ---
float centerX(float d) {
  return sin(d * 0.09) * 3.0 + sin(d * 0.21 + 1.7) * 1.5;
}
float estuaryProgress(float d) {
  return clamp(d / 900.0, 0.0, 1.0);
}
float widthAt(float d) {
  float trend = 6.0 + (15.0 - 6.0) * estuaryProgress(d);
  float wobble = sin(d * 0.05 + 4.0) * 1.8 + sin(d * 0.12) * 0.7;
  return clamp(trend + wobble, 5.0, 17.0);
}

void main() {
  // gl_FragCoord has origin bottom-left; our screen-space convention
  // (matching the 2D canvas) has row 0 at the top.
  float y = u_resolution.y - gl_FragCoord.y;
  float x = gl_FragCoord.x;

  float d = u_worldDistance - (y - CANOE_SCREEN_Y) / PPU;
  float worldX = (x - CANOE_SCREEN_X) / PPU + u_canoeWorldX;

  float cx = centerX(d);
  float halfW = widthAt(d) * 0.5;
  float leftEdge = cx - halfW;
  float rightEdge = cx + halfW;
  if (worldX < leftEdge || worldX > rightEdge) discard;

  float distToEdge = min(worldX - leftEdge, rightEdge - worldX);
  float distFrac = clamp(distToEdge / max(halfW, 0.001), 0.0, 1.0);

  // Rolling body waves — a few sine terms at different spatial/temporal
  // frequencies so the surface doesn't tile obviously. Phase depends on d
  // (downstream distance), so as the world flows past, the waves visibly
  // travel with the current instead of just sitting there shimmering.
  float t = u_time;
  float wave =
      sin(worldX * 1.6 + d * 0.55) * 0.45 +
      sin(worldX * 3.1 - d * 0.9 + t * 0.6) * 0.28 +
      sin(worldX * 0.7 + d * 0.22 - t * 0.3) * 0.27;

  // A second, higher-frequency layer drives sparkle highlights — sparse,
  // bright glints rather than a smooth gradient, the way sun on ripples
  // actually looks. Two product terms at differently-oriented, non-aligned
  // frequencies (rather than one) so the bright spots land at scattered
  // points instead of forming ridges/streaks along one diagonal.
  float g1 = sin(worldX * 5.3 + d * 2.3 + t * 1.3);
  float g2 = sin(worldX * 8.7 - d * 1.4 + t * 0.8);
  float g3 = sin(worldX * 2.1 + d * 3.9 - t * 1.1);
  float glintWave = g1 * g2 * 0.5 + g2 * g3 * 0.5;
  float glint = pow(max(glintWave, 0.0), 9.0);

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
    canoeWorldX: gl.getUniformLocation(program, 'u_canoeWorldX'),
  };

  return {
    ok: true,
    render(time, worldDistance, canoeWorldX) {
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
      gl.uniform1f(uniforms.canoeWorldX, canoeWorldX);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}
