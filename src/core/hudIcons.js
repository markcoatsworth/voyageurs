// The top-right control icons (#mute-btn, #pause-btn): white pixel-art
// glyphs on a 16x16 grid, built as SVG <rect>s so they stay razor-sharp at
// any size (style.css shows them at 2x, 32px) and match the rest of the
// game's chunky pixel look instead of a smooth vector icon set.
//
// Replaced word buttons ("MUSIC ON"/"PAUSE"), which were asked to become
// "horizontally aligned icons": a speaker (with a diagonal slash through
// the same speaker when the music is off), and pause/play. An even earlier
// cut used "♫"/"II" text glyphs and was dropped for leaving players
// guessing; drawn icons in the universal shapes don't have that problem —
// and each button still carries a title/aria-label for anyone who's unsure.
//
// White fill with a hard black outline baked in (the same 1px-offset
// "shadow" idiom as the HUD's text-shadow), so the icon reads over bright
// sand and dark water alike without needing a panel behind it.

const GRID = 16;

function rects(list) {
  return list.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
}

// One shape as white over its own black outline — the outline being the
// same rects nudged one cell each way (plus down-right, for the HUD's
// drop-shadow lean), a pixel-art border rather than a blurred shadow.
function layer(list) {
  const outline = [[1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dy]) => `<g transform="translate(${dx} ${dy})">${rects(list)}</g>`).join('');
  return `<g fill="#000">${outline}</g><g fill="#fff">${rects(list)}</g>`;
}

// Layers stack in order, each fully outlined — which is what lets the mute
// slash keep a black border along both edges where it crosses the white
// speaker, instead of merging into it.
function svg(...layers) {
  return `<svg viewBox="-1 -1 ${GRID + 2} ${GRID + 2}" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">`
    + layers.map(layer).join('') + '</svg>';
}

const SPEAKER = [
  [1, 6, 3, 4], // the box
  [4, 5, 1, 6], // the cone, flaring out a pixel a column
  [5, 4, 1, 8],
  [6, 3, 1, 10],
  [7, 2, 1, 12],
  [9, 6, 1, 4], // inner sound wave
  [11, 4, 1, 1], // outer sound wave
  [12, 5, 1, 6],
  [11, 11, 1, 1],
];

// The slash, top-left to bottom-right through the speaker, two cells thick
// so it still reads at phone size.
const SLASH = [];
for (let i = 0; i < 15; i++) SLASH.push([i, i, 2, 1]);

export function speakerIcon(muted) {
  return muted ? svg(SPEAKER, SLASH) : svg(SPEAKER);
}

export function pauseIcon() {
  return svg([[3, 2, 4, 12], [9, 2, 4, 12]]);
}

// A stepped right-pointing triangle: each column a little shorter than the
// last, from a 12-tall base at x=3 to the point at x=12.
export function playIcon() {
  const rects = [];
  for (let x = 3; x <= 12; x++) {
    const half = Math.round((6 * (13 - x)) / 10);
    rects.push([x, 8 - half, 1, half * 2]);
  }
  return svg(rects);
}
