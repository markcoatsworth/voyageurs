// The internal render resolution — kept small and blown up with
// image-rendering:pixelated (see style.css) for the chunky top-down look.
export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 220;

// 1 river "unit" (the same units riverPath.js's centerX/widthAt use) = this
// many pixels. Also doubles as the nominal tile size.
export const PIXELS_PER_UNIT = 16;

// Where the canoe sits on screen, always — the world scrolls under it.
// Placed low and centered so most of the canvas shows what's ahead.
export const CANOE_SCREEN_X = CANVAS_WIDTH / 2;
export const CANOE_SCREEN_Y = CANVAS_HEIGHT - 55;

// Half the canoe's collision hull, in world units, measured bow-to-stern
// along whatever heading it's holding (game.js's `heading`). The hull is
// treated as a bare line segment of this half-length — no beam at all — so
// that pointing straight downstream reproduces the old point-vs-radius
// collision exactly, and every bit of extra reach comes from the turn
// itself (obstacles.js's segment check, and the bank clamp in game.js).
//
// 0.7, not the drawn hull's true ~1.0 (32px of a 34px sprite over
// PIXELS_PER_UNIT): 0.7 is the longitudinal half-window the old
// |entry.z| < 0.7 collision band used, and that number was tuned against
// the obstacle field's own spacing. Keeping it means adding a real heading
// didn't quietly make every straight-ahead rock harder to thread.
export const CANOE_HALF_LENGTH = 0.7;

// How far ahead/behind of the canoe (in world units) to simulate — obstacles
// spawn/recycle across this span, scenery is drawn across it every frame.
export const AHEAD_UNITS = (CANOE_SCREEN_Y / PIXELS_PER_UNIT) + 3;
export const BEHIND_UNITS = ((CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT) + 3;

export function worldToScreen(worldX, z, cameraWorldX) {
  return {
    x: CANOE_SCREEN_X + (worldX - cameraWorldX) * PIXELS_PER_UNIT,
    y: CANOE_SCREEN_Y + z * PIXELS_PER_UNIT,
  };
}
