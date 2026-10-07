// The town-name banner's sizing and placement (main.js's #town-banner) —
// pure functions of the banner text and two rects, split out of main.js so
// they can be exercised (smoke test, or a page) without main.js's own
// side effects of building a whole game.

// One line, always — "never more than a single line, even on a mobile
// device." white-space:nowrap guarantees the line; this guarantees it
// *fits*: Press Start 2P is a monospace face whose glyphs are each exactly
// 1em wide (minimap.js leans on the same fact), so the widest a name can
// be is just its length in ems, and the font size that fits a given width
// is width / length. Capped at TOWN_BANNER_MAX_PX so a short name on a big
// screen doesn't swell into the obstructive thing this was asked not to
// be — 12px, up from a first cut's 10 ("slightly larger text"), with the
// side padding up from 10px to 22px over three rounds. The longest real
// name today (Sainte-Rose-du-Nord, 19) needs 276px at the full 12px: that
// fits a 390px phone's game screen, and on a 320px one it trims to 10px —
// the fit is the guarantee for that and for whatever name comes next.
export const TOWN_BANNER_MAX_PX = 12;
const TOWN_BANNER_MAX_FRACTION = 0.8; // of the game screen's width, at most
export const TOWN_BANNER_CHROME_PX = 2 * (22 + 2); // style.css: 22px side padding + 2px border, each side
// No letter-spacing (style.css) — 0.1em of it read as stretched next to the
// NOW PLAYING card's song title, the same face with none.
export const TOWN_BANNER_LETTER_SPACING_EM = 0;
export const TOWN_BANNER_HEIGHT_PX = 43; // its rendered height at the cap (14+13 padding, 12 text, 2+2 border)
// The gap between the game screen's top edge and the banner's — "a slight
// margin between the top of the box and the top of the game window".
// Also the gap it keeps below the minimap when it has to drop under it.
export const TOWN_BANNER_GAP_PX = 6;
export function townBannerFontPx(name, roomPx) {
  const ems = name.length * (1 + TOWN_BANNER_LETTER_SPACING_EM);
  // 2px of slack for sub-pixel rounding, and whole pixels only: at a
  // fractional size the browser rounds each glyph's advance up to a whole
  // pixel (10.6px came out 11px a glyph, ~8px wider over a long name), so
  // the 1em-per-glyph model only holds at integer sizes. Caught clipping
  // Sainte-Rose-du-Nord on a 320px phone. A pixel font wants whole-pixel
  // sizes anyway.
  const room = roomPx - TOWN_BANNER_CHROME_PX - 2;
  return Math.max(5, Math.min(TOWN_BANNER_MAX_PX, Math.floor(room / Math.max(1, ems))));
}

// Where on the game screen the banner goes and how big, for `name`:
// { left (its centre), top, room, fontPx }, px relative to the screen's own
// top-left. Normally: centred, TOWN_BANNER_GAP_PX below the top edge, up
// to 80% of the width.
//
// On a short phone, though — first seen on a 375x667 iPhone SE-sized
// screen — the top-right minimap (#right-panel, in #ui) hangs down *over*
// the top of the game screen, and a centred banner went straight under it,
// the name half hidden. So when the minimap reaches into the banner's
// strip, the banner stays up top in the clear stretch to the minimap's
// left *if the name fits there at full size*; if it would have to shrink
// at all, it drops down to sit just under the minimap
// instead, with the full width back. (The first rule only dropped below an
// 8px floor, which left Sainte-Rose-du-Nord squeezed in beside the minimap
// at 8px on a 375px phone when dropping gave it the full 12.)
// Still the top of the game window, just a little further down. Pure, so
// the smoke test can drive it with made-up rects.
export function townBannerLayout(name, screenRect, minimapRect) {
  const full = Math.min(screenRect.width * TOWN_BANNER_MAX_FRACTION, screenRect.width - 8);
  const centred = { left: screenRect.width / 2, top: TOWN_BANNER_GAP_PX, room: full, fontPx: townBannerFontPx(name, full) };
  const stripBottom = screenRect.top + TOWN_BANNER_GAP_PX + TOWN_BANNER_HEIGHT_PX;
  const overlaps = minimapRect && minimapRect.bottom > screenRect.top && minimapRect.top < stripBottom
    && minimapRect.left < screenRect.right && minimapRect.right > screenRect.left;
  if (!overlaps) return centred;
  const right = Math.min(screenRect.right, minimapRect.left - 6);
  const room = Math.min(right - screenRect.left - 8, full);
  const fontPx = townBannerFontPx(name, room);
  if (room > 0 && fontPx === TOWN_BANNER_MAX_PX) {
    return { left: (screenRect.left + right) / 2 - screenRect.left, top: TOWN_BANNER_GAP_PX, room, fontPx };
  }
  return { ...centred, top: Math.round(minimapRect.bottom - screenRect.top + TOWN_BANNER_GAP_PX) };
}

