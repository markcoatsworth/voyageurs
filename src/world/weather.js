// Rain — the visible half of the British Warship storm's "more weather"
// (bossfights/britishWarship.js; game.js's render() calls this over the
// whole scene, before the HUD). Stateless like terrain.js/whales.js: every
// streak's position is a pure function of its index and the game clock,
// nothing pooled or spawned, so it costs nothing when intensity is 0 and
// can't drift out of sync with a restart.
//
// Each streak is a short diagonal line falling fast and slanting with the
// wind. Streak count scales with intensity, so the rain thickens as the
// sky darkens rather than switching on all at once; the slant is also
// intensity-scaled (a drizzle falls straight, a squall drives sideways).
// Drawn as pixel-aligned 1px lines in the canvas's own 320x220 space — at
// the integer upscale main.js picks these come out as crisp pixel-art
// streaks, not anti-aliased hairlines.
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/config.js';
import { hash } from '../shared/hash.js';

// Streaks on screen at full intensity. 320x220 is small — this reads as
// heavy rain without the streaks piling into a solid grey sheet, which
// would fight the darkness washes underneath it rather than sit on them.
const MAX_STREAKS = 150;
// Pixels per second the streaks fall at — fast enough that a streak is a
// streak, not a dot drifting down (a 60fps frame moves it ~4px).
const FALL_SPEED = 240;
// Horizontal drift at full intensity, px/s, in the same direction the
// slant leans — the rain blows across the screen, it doesn't just tilt.
const WIND_DRIFT = 90;
const STREAK_LEN_MIN = 5;
const STREAK_LEN_MAX = 10;
// Slant at full intensity, px of x per px of y.
const MAX_SLANT = 0.38;

export function drawRain(ctx, intensity, time) {
  if (intensity <= 0) return;
  const count = Math.round(MAX_STREAKS * intensity);
  if (count === 0) return;
  const slant = MAX_SLANT * intensity;
  const drift = WIND_DRIFT * intensity;
  // Wrap heights include the longest streak, so a streak fully clears the
  // bottom before reappearing at the top instead of popping mid-screen.
  const wrapH = CANVAS_HEIGHT + STREAK_LEN_MAX;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const h0 = hash(i + 1);
    const h1 = hash(i * 7 + 3);
    const h2 = hash(i * 13 + 5);
    // Per-streak fall-speed jitter — a uniform speed reads as a scrolling
    // texture, not weather.
    const speed = FALL_SPEED * (0.8 + 0.4 * h2);
    const y = ((h0 * wrapH + time * speed) % wrapH) - STREAK_LEN_MAX;
    const x = ((h1 * CANVAS_WIDTH + time * drift + y * slant) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
    const len = STREAK_LEN_MIN + (STREAK_LEN_MAX - STREAK_LEN_MIN) * h2;
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    ctx.moveTo(x0 + 0.5, y0 + 0.5);
    ctx.lineTo(x0 + Math.round(len * slant) + 0.5, y0 + Math.round(len) + 0.5);
  }
  // Two passes over the same path — a dim wide body and a brighter core —
  // would double the draw cost; one pass at a cold, semi-transparent
  // grey-white is enough at this resolution.
  ctx.strokeStyle = `rgba(196, 210, 222, ${(0.28 + 0.22 * intensity).toFixed(3)})`;
  ctx.stroke();
  ctx.restore();
}
