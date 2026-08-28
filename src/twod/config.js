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

// How far ahead/behind of the canoe (in world units) to simulate — obstacles
// spawn/recycle across this span, scenery is drawn across it every frame.
export const AHEAD_UNITS = (CANOE_SCREEN_Y / PIXELS_PER_UNIT) + 3;
export const BEHIND_UNITS = ((CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT) + 3;

export function worldToScreen(worldX, z, canoeWorldX) {
  return {
    x: CANOE_SCREEN_X + (worldX - canoeWorldX) * PIXELS_PER_UNIT,
    y: CANOE_SCREEN_Y + z * PIXELS_PER_UNIT,
  };
}
