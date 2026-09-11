// Small hand-drawn pixel-art sprites for the top-down view. Each is built on
// a tiny offscreen canvas at true pixel size and later blitted with
// image-smoothing off. The look we're after (closer to Stardew Valley than
// flat vector shapes) comes from three habits applied consistently:
//   1. a dark silhouette drawn slightly larger *behind* every shape, so it
//      reads as an outline instead of blending into the background;
//   2. distinct shade "chunks" (highlight / base / shadow) instead of a
//      smooth gradient or per-pixel noise — pixel art shades in bands;
//   3. a soft ground shadow or water ripple under everything, so objects
//      look like they're sitting on/in the scene rather than floating on it.

function makeSprite(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  return canvas;
}

function blob(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function groundShadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(8, 16, 8, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A pale ring on the water surface — used for anything sitting IN the
// river (rocks, logs, pelts) instead of a ground shadow, since a dark
// shadow doesn't read against water the way it does against grass.
function waterRipple(ctx, cx, cy, rx, ry) {
  ctx.strokeStyle = 'rgba(230, 245, 250, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20, 50, 65, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, rx * 0.8, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function triangle(ctx, cx, topY, botY, halfW, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx + halfW, botY);
  ctx.lineTo(cx - halfW, botY);
  ctx.closePath();
  ctx.fill();
}

// Black spruce, balsam fir, jack pine — the boreal conifers that actually
// line the Saguenay. Three tiers narrowing to a point (not round blobs) is
// what reads as "pine" rather than "generic tree" at this size.
const PINE_PALETTES = [
  { outline: '#12241a', dark: '#1c3f1a', mid: '#254d22', light: '#3a6b34', bright: '#5a9450' }, // black spruce
  { outline: '#152e26', dark: '#204a3a', mid: '#2b6047', light: '#3f8264', bright: '#63a888' }, // balsam fir
  { outline: '#1f2612', dark: '#33481c', mid: '#425c26', light: '#5c7a35', bright: '#82a052' }, // jack pine
];

export function createPineTreeSprite(variant = 0) {
  const w = 20, h = 36;
  const pal = PINE_PALETTES[variant % PINE_PALETTES.length];
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;

    groundShadow(ctx, cx, h - 3, 7, 2.2);

    // trunk sliver at the base, mostly hidden by the lowest tier
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(cx - 1.4, h - 6, 2.8, 5);

    const tiers = [
      { topY: 1, botY: 13, halfW: 5.5 },
      { topY: 9, botY: 21, halfW: 7.2 },
      { topY: 17, botY: 30, halfW: 8.8 },
    ];

    // outline silhouette, drawn larger and first
    for (const t of tiers) triangle(ctx, cx, t.topY - 1.2, t.botY + 1.2, t.halfW + 1.4, pal.outline);
    // base fill, bottom tier first so the tiers above it sit visibly on top
    for (let i = tiers.length - 1; i >= 0; i--) {
      triangle(ctx, cx, tiers[i].topY, tiers[i].botY, tiers[i].halfW, pal.mid);
    }
    // shadow wedge on one side of each tier (fixed light direction, upper-left)
    for (const t of tiers) {
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.moveTo(cx, t.topY);
      ctx.lineTo(cx + t.halfW, t.botY);
      ctx.lineTo(cx + t.halfW * 0.25, t.botY);
      ctx.closePath();
      ctx.fill();
    }
    // highlight wedge on the other side
    for (const t of tiers) {
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.moveTo(cx, t.topY);
      ctx.lineTo(cx - t.halfW * 0.55, t.botY);
      ctx.lineTo(cx - t.halfW * 0.1, t.botY);
      ctx.closePath();
      ctx.fill();
    }
    // bright tip
    blob(ctx, cx - 1, tiers[0].topY + 3, 1.7, pal.bright);
  });
}

// Filled polygon helper, points given relative to (cx, cy) — the workhorse
// for the rock's angular facets below.
function poly(ctx, cx, cy, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = cx + px, y = cy + py;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

// Hard and angular on purpose — flat polygon facets instead of a rounded
// blob, so it reads as broken stone rather than the soft lump it used to
// share with the fur pelt below. Cool, desaturated grey-blue throughout,
// deliberately no warm tones and no bright specular glint: matte and dead,
// the opposite number of the pelt's shine.
export function createRockSprite() {
  const w = 18, h = 16;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2 + 1;
    waterRipple(ctx, cx, cy + 4, 8, 3);

    poly(ctx, cx, cy, [[-8, -1], [-5, -6], [1, -8], [7, -4], [8, 2], [3, 7], [-3, 6], [-7, 3]], '#20242a'); // outline
    poly(ctx, cx, cy, [[-6.6, -1], [-4, -5], [1, -6.8], [6, -3.2], [6.6, 1.6], [2.6, 5.8], [-2.6, 5.2], [-6, 2.2]], '#5b6570'); // base facet
    poly(ctx, cx, cy, [[0, -1], [6, -3.2], [6.6, 1.6], [2.6, 5.8], [-2.6, 5.2], [-3, 1]], '#454e58'); // shadow facet, lower-right
    poly(ctx, cx, cy, [[-6.6, -1], [-4, -5], [1, -6.8], [3, -3], [-1, -1], [-4, 1]], '#7c8891'); // sunlit facet, upper-left
    poly(ctx, cx, cy, [[-4.4, -3.2], [-2.4, -4.8], [-0.6, -4], [-2, -2.2]], '#9aa4ac'); // small cold fleck, never warm

    ctx.strokeStyle = '#171a1e';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 3);
    ctx.lineTo(cx + 2, cy + 3);
    ctx.stroke();
  });
}

// Small stones stamped along the water's edge to give the shoreline a
// defined border, the way Stardew rings its ponds with a stone lip instead
// of a flat color transition.
export function createPebbleSprite(seedVariant = 0) {
  const w = 10, h = 8;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2 + 1;
    const squash = 0.8 + (seedVariant % 3) * 0.15;
    ctx.fillStyle = 'rgba(8, 16, 8, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, h - 1.5, 4, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4943';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 4.2 * squash, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d7c72';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.4 * squash, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a3a196';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 0.8, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function createLogSprite() {
  const w = 30, h = 13;
  return makeSprite(w, h, (ctx) => {
    const cy = h / 2;
    waterRipple(ctx, w / 2, cy + 3, 13, 3);
    ctx.fillStyle = '#3a2413';
    ctx.fillRect(3, 1, w - 6, h - 2);
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(3, 2, w - 6, h - 5);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(3, 2, w - 6, 2);
    ctx.fillStyle = '#5a381f';
    for (let x = 6; x < w - 4; x += 5) ctx.fillRect(x, 5, 3, 1);
    for (const [ex, ey] of [[4, cy], [w - 4, cy]]) {
      ctx.fillStyle = '#3a2413';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 3.6, 5.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a34';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.8, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a381f';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 1.6, 2.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

export function createIslandSprite() {
  const w = 40, h = 44;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = 32;
    waterRipple(ctx, cx, cy + 9, 17, 4);
    ctx.fillStyle = '#5c4a28';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b08f52';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + 2, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16300f';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 4, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c6b35';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 4, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54874a';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy - 6.5, 3.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tree scaled down so the mound stays visible around its base.
    const tree = createPineTreeSprite(0);
    const tw = tree.width * 0.7, th = tree.height * 0.7;
    ctx.drawImage(tree, cx - tw / 2, cy - 4 - th, tw, th);
  });
}

// A stretched fur hide, not a lump: a fringe of small tufts around the edge
// (the shape cue "soft and furry", vs. the rock's hard angular facets) and a
// saturated warm gold/amber throughout — pushed deliberately far from the
// rock's cold grey so the two don't share a value range even in a dark wash.
// The animated sparkle that makes it read as "valuable, collect me" is drawn
// per-frame over this static sprite (see obstacles.js's draw()).
export function createPeltSprite() {
  const w = 15, h = 19;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2;
    waterRipple(ctx, cx, cy + 6, 6, 2);

    // Fringe: short, fine fur tufts poking out past the hide's own outline —
    // fuzzy, not spiky (a uniform ring of long sharp points reads as legs,
    // not fur). Drawn first so the hide body overlaps their bases.
    ctx.fillStyle = '#4a2c0f';
    const TUFTS = 14;
    for (let i = 0; i < TUFTS; i++) {
      const a = (i / TUFTS) * Math.PI * 2 + 0.3;
      const jitter = 0.82 + ((i * 37) % 5) * 0.08; // varies tuft length a little
      const rx = Math.cos(a) * 4.1, ry = Math.sin(a) * 6.9;
      const tx = Math.cos(a) * (5.0 * jitter), ty = Math.sin(a) * (7.6 * jitter);
      const nx = -Math.sin(a) * 0.5, ny = Math.cos(a) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + rx - nx, cy + ry - ny);
      ctx.lineTo(cx + tx, cy + ty);
      ctx.lineTo(cx + rx + nx, cy + ry + ny);
      ctx.closePath();
      ctx.fill();
    }

    poly(ctx, cx, cy, [[0, -7.6], [3.2, -4.2], [4.2, 0], [3.2, 4.2], [0, 7.6], [-3.2, 4.2], [-4.2, 0], [-3.2, -4.2]], '#5c3712'); // outline
    poly(ctx, cx, cy, [[0, -6.6], [2.6, -3.6], [3.4, 0], [2.6, 3.6], [0, 6.6], [-2.6, 3.6], [-3.4, 0], [-2.6, -3.6]], '#a3661f'); // base
    poly(ctx, cx, cy, [[-1, -5.6], [1, -5.6], [2, -1], [1.6, 3.4], [-1.2, 4], [-2.4, -1]], '#d99a3a'); // highlight sweep

    ctx.strokeStyle = '#7a4e1a';
    ctx.lineWidth = 0.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 1.3, cy - 5.6);
      ctx.lineTo(cx + i * 1.3, cy + 5.6);
      ctx.stroke();
    }
    ctx.fillStyle = '#f0c877'; // a bright worked-leather tab at the head end
    ctx.fillRect(cx - 1.6, cy - 6.8, 3.2, 2.2);
  });
}

export function createWhaleSprite() {
  const w = 32, h = 15;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2;
    waterRipple(ctx, cx, cy + 3, 15, 4);
    ctx.fillStyle = '#8a897e';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9c7ba';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 0.5, 13, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eeece2';
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, cy - 1.4, 10.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a897e';
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 5.5);
    ctx.lineTo(cx + 3, cy - 5.5);
    ctx.lineTo(cx + 1, cy - 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2a26';
    ctx.beginPath();
    ctx.arc(cx + 9, cy - 1.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Canoe faces up-screen (toward negative local z). `paddleSide` flips the
// paddle left/right for a simple stroke animation.
export function createCanoeSprite(paddleSide = 1) {
  const w = 24, h = 34;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;

    waterRipple(ctx, cx, h - 5, 9, 3);

    // hull outline (drawn larger, behind)
    ctx.fillStyle = '#4a2f18';
    ctx.beginPath();
    ctx.moveTo(cx, 1);
    ctx.quadraticCurveTo(cx + 7.5, 9, cx + 6.8, 17);
    ctx.quadraticCurveTo(cx + 7.5, 28, cx, 33);
    ctx.quadraticCurveTo(cx - 7.5, 28, cx - 6.8, 17);
    ctx.quadraticCurveTo(cx - 7.5, 9, cx, 1);
    ctx.closePath();
    ctx.fill();

    // hull base color, inset slightly to leave the outline visible
    ctx.fillStyle = '#a3672f';
    ctx.beginPath();
    ctx.moveTo(cx, 2.6);
    ctx.quadraticCurveTo(cx + 6, 9.5, cx + 5.4, 17);
    ctx.quadraticCurveTo(cx + 6, 27, cx, 31.6);
    ctx.quadraticCurveTo(cx - 6, 27, cx - 5.4, 17);
    ctx.quadraticCurveTo(cx - 6, 9.5, cx, 2.6);
    ctx.closePath();
    ctx.fill();

    // gunwale rim highlight along one side + bow highlight
    ctx.strokeStyle = '#c98a4b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, 6);
    ctx.quadraticCurveTo(cx - 5.6, 17, cx - 4.6, 27);
    ctx.stroke();

    // deck / interior
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.ellipse(cx, h / 2, 3.6, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // paddler: hat, head, shirt, red sash
    ctx.fillStyle = '#c98a5e';
    ctx.fillRect(cx - 2, h / 2 - 9, 4, 4);
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(cx - 2.5, h / 2 - 10.5, 5, 2);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(cx - 2.6, h / 2 - 4.5, 5.2, 7.5);
    ctx.fillStyle = '#b5322f';
    ctx.fillRect(cx - 2.6, h / 2 - 1, 5.2, 2);

    // paddle: shaft + blade with outline, flips side for stroke animation
    const px = cx + paddleSide * 8;
    ctx.strokeStyle = '#3a2413';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(px, h / 2 - 10);
    ctx.lineTo(px, h / 2 + 1);
    ctx.stroke();
    ctx.strokeStyle = '#8a5a34';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, h / 2 - 10);
    ctx.lineTo(px, h / 2 + 1);
    ctx.stroke();
    ctx.fillStyle = '#3a2413';
    ctx.fillRect(px - 2.6, h / 2 - 13, 5.2, 4);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(px - 1.8, h / 2 - 12.4, 3.6, 2.8);
  });
}

// Squared-log trading-post buildings, viewed top-down: a roof rectangle
// drawn wider than the wall footprint beneath it (the standard top-down
// trick for reading as a peaked roof rather than a flat tile), with a log
// wall course, a door on the side facing the viewer, and a stone chimney.
// variant 0 is the larger "post" building; 1/2 are smaller outbuildings.
const CABIN_PALETTES = [
  { roof: '#5a3624', roofDark: '#3f2617', roofLight: '#7a4b32', wall: '#8a6a45', wallDark: '#6b4f30', wallLight: '#a5825a' },
  { roof: '#4a3a2a', roofDark: '#33281c', roofLight: '#68533c', wall: '#7d6248', wallDark: '#5f4a35', wallLight: '#977757' },
  { roof: '#5f4020', roofDark: '#432c16', roofLight: '#7f5a30', wall: '#8f7350', wallDark: '#70583c', wallLight: '#ab8c64' },
];

export function createCabinSprite(variant = 0) {
  const big = variant === 0;
  const w = big ? 34 : 26;
  const h = big ? 38 : 30;
  const pal = CABIN_PALETTES[variant % CABIN_PALETTES.length];

  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    const wallW = big ? 22 : 16;
    const wallH = big ? 20 : 15;
    const wallTop = h - wallH - 4;

    groundShadow(ctx, cx, h - 4, wallW / 2 + 2, 4);

    // log wall, outlined
    ctx.fillStyle = pal.wallDark;
    ctx.fillRect(cx - wallW / 2 - 1, wallTop - 1, wallW + 2, wallH + 2);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(cx - wallW / 2, wallTop, wallW, wallH);
    ctx.strokeStyle = pal.wallDark;
    ctx.lineWidth = 1;
    for (let ly = wallTop + 3; ly < wallTop + wallH; ly += 3.5) {
      ctx.beginPath();
      ctx.moveTo(cx - wallW / 2, ly);
      ctx.lineTo(cx + wallW / 2, ly);
      ctx.stroke();
    }
    ctx.fillStyle = pal.wallLight;
    ctx.fillRect(cx - wallW / 2, wallTop, 2, wallH);

    // door, centered on the wall facing the viewer
    ctx.fillStyle = '#241a10';
    ctx.fillRect(cx - 3, wallTop + wallH - 8, 6, 8);

    // roof — a wider peaked rectangle overlapping the top of the wall, with
    // a ridge highlight down the middle and a triangular gable peeking
    // above it
    const roofW = wallW + 8;
    const roofH = big ? 20 : 16;
    const roofTop = wallTop - roofH + 6;
    triangle(ctx, cx, roofTop - 5, roofTop + 2, roofW / 2 - 2, pal.roofDark);
    ctx.fillStyle = pal.roofDark;
    ctx.fillRect(cx - roofW / 2, roofTop, roofW, roofH);
    ctx.fillStyle = pal.roof;
    ctx.fillRect(cx - roofW / 2 + 1, roofTop + 1, roofW - 2, roofH - 2);
    ctx.fillStyle = pal.roofLight;
    ctx.fillRect(cx - 1, roofTop + 1, 2, roofH - 2);

    // stone chimney through the roof
    ctx.fillStyle = '#6b6a63';
    ctx.fillRect(cx + roofW / 2 - 7, roofTop - 2, 4, 6);
    ctx.fillStyle = '#8a887c';
    ctx.fillRect(cx + roofW / 2 - 7, roofTop - 2, 1.5, 6);
  });
}

// The one building every village guarantees right beside its dock (see
// villages.js) — where the canoe eventually gets repaired. Built from
// the same log-cabin construction as createCabinSprite, but a warm rust
// roof (every ordinary cabin uses browns) and a crossed-paddles sign over
// the door are the two cues that mark it as different at a glance, from
// across the water, before it does anything yet.
const REPAIR_SHOP_PALETTE = { roof: '#8a3a2a', roofDark: '#5f2418', roofLight: '#b0563a', wall: '#8a6a45', wallDark: '#6b4f30', wallLight: '#a5825a' };

export function createRepairShopSprite() {
  const w = 34, h = 38;
  const pal = REPAIR_SHOP_PALETTE;

  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    const wallW = 22;
    const wallH = 20;
    const wallTop = h - wallH - 4;

    groundShadow(ctx, cx, h - 4, wallW / 2 + 2, 4);

    ctx.fillStyle = pal.wallDark;
    ctx.fillRect(cx - wallW / 2 - 1, wallTop - 1, wallW + 2, wallH + 2);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(cx - wallW / 2, wallTop, wallW, wallH);
    ctx.strokeStyle = pal.wallDark;
    ctx.lineWidth = 1;
    for (let ly = wallTop + 3; ly < wallTop + wallH; ly += 3.5) {
      ctx.beginPath();
      ctx.moveTo(cx - wallW / 2, ly);
      ctx.lineTo(cx + wallW / 2, ly);
      ctx.stroke();
    }
    ctx.fillStyle = pal.wallLight;
    ctx.fillRect(cx - wallW / 2, wallTop, 2, wallH);

    ctx.fillStyle = '#241a10';
    ctx.fillRect(cx - 3, wallTop + wallH - 8, 6, 8);

    // sign board over the door: crossed paddles, the universal "canoe
    // business happens here" mark
    ctx.fillStyle = '#3f2b1a';
    ctx.fillRect(cx - 6, wallTop + 5, 12, 7);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(cx - 5, wallTop + 6, 10, 5);
    ctx.strokeStyle = '#5a3d24';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 4, wallTop + 6.5);
    ctx.lineTo(cx + 4, wallTop + 10.5);
    ctx.moveTo(cx + 4, wallTop + 6.5);
    ctx.lineTo(cx - 4, wallTop + 10.5);
    ctx.stroke();

    const roofW = wallW + 8;
    const roofH = 20;
    const roofTop = wallTop - roofH + 6;
    triangle(ctx, cx, roofTop - 5, roofTop + 2, roofW / 2 - 2, pal.roofDark);
    ctx.fillStyle = pal.roofDark;
    ctx.fillRect(cx - roofW / 2, roofTop, roofW, roofH);
    ctx.fillStyle = pal.roof;
    ctx.fillRect(cx - roofW / 2 + 1, roofTop + 1, roofW - 2, roofH - 2);
    ctx.fillStyle = pal.roofLight;
    ctx.fillRect(cx - 1, roofTop + 1, 2, roofH - 2);

    ctx.fillStyle = '#6b6a63';
    ctx.fillRect(cx + roofW / 2 - 7, roofTop - 2, 4, 6);
    ctx.fillStyle = '#8a887c';
    ctx.fillRect(cx + roofW / 2 - 7, roofTop - 2, 1.5, 6);
  });
}

// The gun shop at Montréal — where the voyageur picks up a pistol before
// pushing on past the city. Deliberately nothing like the repair shop's
// warm little timber shed: a squat coursed-stone armoury under a broad
// blue-slate roof, with a forge chimney smoking up the left side and its
// fire-mouth glowing at the base, a rack of muskets leaning by the
// iron-banded door, and a musket branded on an iron plaque above it. Taller
// and wider than the repair shop, and the only building in any village that
// glows — so it reads as its own thing at a glance.
export function createGunShopSprite() {
  const w = 40, h = 44;
  const wall = '#6f6a62', wallDark = '#46423b', wallLight = '#8c867c';
  const roof = '#3a4250', roofDark = '#232934', roofLight = '#545d6e';
  const iron = '#3a3a40', wood = '#6a4a2c', woodDark = '#3f2b1a';

  return makeSprite(w, h, (ctx) => {
    // Stone block left-of-centre, a tall forge chimney off its left end, a
    // lean-to porch with a musket rack off its right end — a three-part
    // silhouette nothing like the repair shop's plain gable box.
    const cx = 15;
    const wallW = 22, wallH = 22;
    const wallTop = h - wallH - 3;
    const wallBot = wallTop + wallH;
    const blockL = cx - wallW / 2, blockR = cx + wallW / 2;

    groundShadow(ctx, w / 2, h - 3, w / 2 - 2, 4);

    // --- forge chimney off the left end ---
    const chX = 1, chW = 7;
    ctx.fillStyle = wallDark;
    ctx.fillRect(chX - 1, 4, chW + 2, wallBot - 4);
    ctx.fillStyle = wall;
    ctx.fillRect(chX, 4, chW, wallBot - 4);
    ctx.fillStyle = wallLight;
    ctx.fillRect(chX, 4, 1.3, wallBot - 4);
    ctx.fillStyle = wallDark;
    ctx.fillRect(chX - 1.5, 2, chW + 3, 2.4); // cap
    ctx.strokeStyle = wallDark;
    ctx.lineWidth = 0.7;
    for (let ly = 8; ly < wallBot; ly += 4) {
      ctx.beginPath(); ctx.moveTo(chX, ly); ctx.lineTo(chX + chW, ly); ctx.stroke();
    }
    // smoke drifting off the top
    for (const [dx, dy, r, a] of [[1, -1, 2.1, 0.5], [3, -4, 2.7, 0.34], [1, -8, 3.2, 0.2]]) {
      ctx.fillStyle = `rgba(202,205,210,${a})`;
      ctx.beginPath(); ctx.arc(chX + chW / 2 + dx, 3 + dy, r, 0, Math.PI * 2); ctx.fill();
    }

    // --- coursed-stone main block ---
    ctx.fillStyle = wallDark;
    ctx.fillRect(blockL - 1, wallTop - 1, wallW + 2, wallH + 2);
    ctx.fillStyle = wall;
    ctx.fillRect(blockL, wallTop, wallW, wallH);
    ctx.strokeStyle = wallDark;
    ctx.lineWidth = 0.8;
    let row = 0;
    for (let ly = wallTop + 4; ly < wallBot; ly += 4, row++) {
      ctx.beginPath(); ctx.moveTo(blockL, ly); ctx.lineTo(blockR, ly); ctx.stroke();
      const j = row % 2 ? 3 : 0;
      for (let lx = blockL + 3 + j; lx < blockR; lx += 6) {
        ctx.beginPath(); ctx.moveTo(lx, ly - 4); ctx.lineTo(lx, ly); ctx.stroke();
      }
    }
    ctx.fillStyle = wallLight;
    ctx.fillRect(blockL, wallTop, 1.4, wallH);

    // --- forge fire-mouth at the chimney base — the one light in any village ---
    const fx = chX + chW / 2 + 1, fy = wallBot - 6;
    const halo = ctx.createRadialGradient(fx, fy, 1, fx, fy, 12);
    halo.addColorStop(0, 'rgba(255,178,82,0.9)');
    halo.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(fx - 13, fy - 13, 26, 19);
    ctx.fillStyle = '#180d06';
    ctx.fillRect(fx - 3.5, fy - 5, 7, 9);
    ctx.fillStyle = '#ff7a1e';
    ctx.fillRect(fx - 2.6, fy - 1.5, 5.2, 5.5);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(fx - 1.3, fy + 0.8, 2.6, 3.2);

    // heavy iron-banded door
    ctx.fillStyle = '#1c130b';
    ctx.fillRect(cx - 4, wallBot - 11, 8, 11);
    ctx.fillStyle = iron;
    ctx.fillRect(cx - 4, wallBot - 8, 8, 1);
    ctx.fillRect(cx - 4, wallBot - 4, 8, 1);
    ctx.fillStyle = '#5c5c62';
    ctx.fillRect(cx + 2, wallBot - 6, 1.4, 1.4); // ring handle

    // barred window left of the door
    ctx.fillStyle = '#1c130b';
    ctx.fillRect(cx - 10, wallBot - 10, 5, 5);
    ctx.strokeStyle = iron;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 7.5, wallBot - 10); ctx.lineTo(cx - 7.5, wallBot - 5);
    ctx.moveTo(cx - 10, wallBot - 7.5); ctx.lineTo(cx - 5, wallBot - 7.5);
    ctx.stroke();

    // --- lean-to porch off the right end, sheltering a musket rack ---
    const ltR = w - 1;
    ctx.fillStyle = woodDark; // corner post
    ctx.fillRect(ltR - 2, wallTop + 4, 2, wallH - 4);
    ctx.fillStyle = wood; // rack rail the muskets lean on
    ctx.fillRect(blockR, wallTop + 12, ltR - blockR, 1.6);
    for (let i = 0; i < 4; i++) {
      const bx = blockR + 1.5 + i * 2.7;
      ctx.strokeStyle = i % 2 ? '#9a9aa2' : '#82828c';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx, wallBot - 1);
      ctx.lineTo(bx + 2.2, wallTop + 6);
      ctx.stroke();
      ctx.strokeStyle = wood; // wooden stock at the foot
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, wallBot - 1);
      ctx.lineTo(bx + 1, wallBot - 4.5);
      ctx.stroke();
    }

    // --- roofs: broad blue-slate gable over the block, shed over the lean-to ---
    // shed first, so the main roof's eave overlaps its top edge
    ctx.fillStyle = roofDark;
    ctx.beginPath();
    ctx.moveTo(blockR - 1, wallTop - 1);
    ctx.lineTo(ltR + 1, wallTop + 5);
    ctx.lineTo(ltR + 1, wallTop + 8);
    ctx.lineTo(blockR - 1, wallTop + 2);
    ctx.closePath(); ctx.fill();

    const roofL = blockL - 9, roofR = blockR + 3;
    const apex = cx - 2, roofPeak = wallTop - 12;
    ctx.fillStyle = roofDark;
    ctx.beginPath();
    ctx.moveTo(apex, roofPeak - 2);
    ctx.lineTo(roofR, wallTop + 3);
    ctx.lineTo(roofL, wallTop + 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(apex, roofPeak);
    ctx.lineTo(roofR - 2, wallTop + 2);
    ctx.lineTo(roofL + 2, wallTop + 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofLight;
    ctx.fillRect(apex - 1, roofPeak, 2, wallTop + 2 - roofPeak);
    ctx.fillStyle = roofDark;
    ctx.fillRect(roofL, wallTop + 2, roofR - roofL, 1.3);
  });
}

// The gunsmith — stands outside the Montréal gun shop; walk up to them and
// the pistol is yours (villageScene.js / game.js's acquirePistol). Same
// small build as the repair-shop trader, but read at a glance as military
// rather than tradesman: a deep-blue regimental coat with a buff waistcoat,
// a black tricorne, and a musket held upright at his side, barrel past the
// hat.
export function createGunsmithSprite() {
  const w = 16, h = 26;
  return makeSprite(w, h, (ctx) => {
    const cx = 7;
    groundShadow(ctx, cx, h - 1, 4.5, 2);

    // musket held upright at the side — steel barrel over a wooden stock
    ctx.fillStyle = '#4a3220';
    ctx.fillRect(cx + 5, 13, 2.4, 11);
    ctx.fillStyle = '#70707a';
    ctx.fillRect(cx + 5.6, 1, 1.4, 13);
    ctx.fillStyle = '#9a9aa2';
    ctx.fillRect(cx + 5.6, 1, 0.6, 13);

    // legs — dark breeches into boots
    ctx.fillStyle = '#2a2a2f';
    ctx.fillRect(cx - 3, 18, 2.6, 6);
    ctx.fillRect(cx + 0.5, 18, 2.6, 6);

    // long regimental coat
    ctx.fillStyle = '#1f2a4a';
    ctx.fillRect(cx - 5, 7, 10, 13);
    ctx.fillStyle = '#30427a';
    ctx.fillRect(cx - 4, 8, 8, 11);
    // buff waistcoat down the front + collar
    ctx.fillStyle = '#cbba8a';
    ctx.fillRect(cx - 1.3, 8, 2.6, 11);
    ctx.fillRect(cx - 4, 8, 8, 1.4);
    // brass buttons
    ctx.fillStyle = '#d8c98f';
    ctx.fillRect(cx - 3, 10.5, 1, 1);
    ctx.fillRect(cx - 3, 13.5, 1, 1);
    ctx.fillRect(cx - 3, 16.5, 1, 1);

    // head + black tricorne
    ctx.fillStyle = '#c98a5e';
    ctx.fillRect(cx - 3, 3, 6, 5);
    ctx.fillStyle = '#1b1610';
    ctx.fillRect(cx - 5, 2.2, 10, 1.8);
    triangle(ctx, cx, -0.3, 3.4, 4.4, '#231c15');
  });
}

// Québec City's own building set (villages.js/villageScene.js special-
// case it by name) — meant to read as a real 1790s colonial town at a
// glance, not a bigger version of the fur-trade villages' log cabins.
// Built-form cues specific to that: cut *stone* walls (a grid of block
// joints, not a log cabin's horizontal courses), steep tin/slate roofs
// with a dormer window (a "lucarne" — near-universal on Quebec City
// rooflines then and now), small shuttered windows, and tall chimneys
// (a real winter, not a fur-trade-post afterthought).
const STONE_PALETTES = [
  { roof: '#3f4650', roofDark: '#282e36', roofLight: '#5c6570', wall: '#8f8a80', wallDark: '#6d685f', wallLight: '#aca79c', trim: '#e8dfc8' },
  { roof: '#4a4038', roofDark: '#302921', roofLight: '#6b5f52', wall: '#9a8f7c', wallDark: '#786e5d', wallLight: '#b7ac97', trim: '#eee3cc' },
  { roof: '#38424a', roofDark: '#242b31', roofLight: '#535e68', wall: '#87877e', wallDark: '#67675f', wallLight: '#a3a399', trim: '#e4dcc4' },
];

export function createStoneBuildingSprite(variant = 0) {
  const w = 38, h = 52;
  const pal = STONE_PALETTES[variant % STONE_PALETTES.length];

  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    const wallW = 26;
    const wallH = 28;
    const wallTop = h - wallH - 4;

    groundShadow(ctx, cx, h - 4, wallW / 2 + 2, 4);

    // stone wall: outlined, then a block-joint grid (horizontal courses
    // *and* vertical joints, offset row to row like real coursed masonry —
    // what actually distinguishes "stone" from the cabin's log lines)
    ctx.fillStyle = pal.wallDark;
    ctx.fillRect(cx - wallW / 2 - 1, wallTop - 1, wallW + 2, wallH + 2);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(cx - wallW / 2, wallTop, wallW, wallH);
    ctx.strokeStyle = pal.wallDark;
    ctx.lineWidth = 0.8;
    let row = 0;
    for (let ly = wallTop + 4; ly < wallTop + wallH; ly += 4, row++) {
      ctx.beginPath();
      ctx.moveTo(cx - wallW / 2, ly);
      ctx.lineTo(cx + wallW / 2, ly);
      ctx.stroke();
      const jitter = row % 2 === 0 ? 0 : 3;
      for (let lx = cx - wallW / 2 + 3 + jitter; lx < cx + wallW / 2; lx += 6) {
        ctx.beginPath();
        ctx.moveTo(lx, ly - 4);
        ctx.lineTo(lx, ly);
        ctx.stroke();
      }
    }
    ctx.fillStyle = pal.wallLight;
    ctx.fillRect(cx - wallW / 2, wallTop, 1.5, wallH);

    // small shuttered windows either side of the door
    for (const wx of [cx - 8, cx + 8]) {
      ctx.fillStyle = '#241a10';
      ctx.fillRect(wx - 2.5, wallTop + 5, 5, 5);
      ctx.strokeStyle = pal.trim;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(wx - 2.5, wallTop + 5, 5, 5);
      ctx.beginPath();
      ctx.moveTo(wx, wallTop + 5); ctx.lineTo(wx, wallTop + 10);
      ctx.moveTo(wx - 2.5, wallTop + 7.5); ctx.lineTo(wx + 2.5, wallTop + 7.5);
      ctx.stroke();
    }

    // door, centered
    ctx.fillStyle = '#241a10';
    ctx.fillRect(cx - 3, wallTop + wallH - 9, 6, 9);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(cx - 3, wallTop + wallH - 9, 6, 1.4);

    // steep roof — taller pitch than the cabins', reading as tin/slate
    const roofW = wallW + 6;
    const roofH = 22;
    const roofTop = wallTop - roofH + 5;
    triangle(ctx, cx, roofTop - 8, roofTop + 2, roofW / 2 - 1, pal.roofDark);
    ctx.fillStyle = pal.roofDark;
    ctx.fillRect(cx - roofW / 2, roofTop, roofW, roofH);
    ctx.fillStyle = pal.roof;
    ctx.fillRect(cx - roofW / 2 + 1, roofTop + 1, roofW - 2, roofH - 2);
    ctx.fillStyle = pal.roofLight;
    ctx.fillRect(cx - 1, roofTop + 1, 2, roofH - 2);

    // dormer window (a "lucarne") breaking the roofline — the single most
    // recognizable Quebec City rooftop detail
    const dormerX = cx + (variant % 2 === 0 ? -7 : 7);
    ctx.fillStyle = pal.roofDark;
    triangle(ctx, dormerX, roofTop + 3, roofTop + 9, 5, pal.roofDark);
    ctx.fillStyle = pal.wall;
    ctx.fillRect(dormerX - 4, roofTop + 8, 8, 6);
    ctx.fillStyle = '#241a10';
    ctx.fillRect(dormerX - 2, roofTop + 9.5, 4, 3.5);

    // two chimneys — a real Quebec winter, not the cabin's single stack
    for (const cxo of [-1, 1]) {
      const chx = cx + cxo * (roofW / 2 - 5);
      ctx.fillStyle = pal.wallDark;
      ctx.fillRect(chx - 2, roofTop - 4, 4, 7);
      ctx.fillStyle = pal.wallLight;
      ctx.fillRect(chx - 2, roofTop - 4, 1.3, 7);
    }
  });
}

// The one landmark every version of Old Québec actually has — a parish
// church, spire and all. Deliberately much taller than anything else in
// the town (see QUEBEC_CITY_BUILDINGS in villages.js) so it reads as the
// skyline's obvious focal point from a distance, the way a real steeple
// does over a river approach.
export function createChurchSprite() {
  // h was 92 — too short for its own spire+finial math (wallTop/towerTop/
  // spireTopY all derive from h), which put the spire's tip and the whole
  // finial/cross above y=0: silently clipped off the top of the canvas,
  // the real reason the cross wasn't visible at all rather than just faint.
  // 124 gives the cross a few pixels of headroom above the canvas edge.
  const w = 34, h = 124;
  const wallColor = '#c9c2ac', wallDark = '#a89f86', wallLight = '#e4ddc4';
  const roofColor = '#5c6570', roofDark = '#3f4650';

  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    const wallW = 24;
    const wallH = 30;
    const wallTop = h - wallH - 4;

    groundShadow(ctx, cx, h - 4, wallW / 2 + 3, 4);

    // nave (the body of the church)
    ctx.fillStyle = wallDark;
    ctx.fillRect(cx - wallW / 2 - 1, wallTop - 1, wallW + 2, wallH + 2);
    ctx.fillStyle = wallColor;
    ctx.fillRect(cx - wallW / 2, wallTop, wallW, wallH);
    ctx.fillStyle = wallLight;
    ctx.fillRect(cx - wallW / 2, wallTop, 1.5, wallH);

    // arched entrance
    ctx.fillStyle = '#241a10';
    ctx.beginPath();
    ctx.moveTo(cx - 4, wallTop + wallH);
    ctx.lineTo(cx - 4, wallTop + wallH - 9);
    ctx.arc(cx, wallTop + wallH - 9, 4, Math.PI, 0);
    ctx.lineTo(cx + 4, wallTop + wallH);
    ctx.closePath();
    ctx.fill();

    // rose window above the door
    ctx.fillStyle = wallDark;
    ctx.beginPath();
    ctx.arc(cx, wallTop + 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8ab0c4';
    ctx.beginPath();
    ctx.arc(cx, wallTop + 9, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = wallDark;
    ctx.lineWidth = 0.8;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(cx, wallTop + 9);
      ctx.lineTo(cx + Math.cos(a) * 3.6, wallTop + 9 + Math.sin(a) * 3.6);
      ctx.stroke();
    }

    // low nave roof behind the tower
    ctx.fillStyle = roofDark;
    triangle(ctx, cx, wallTop - 10, wallTop + 2, wallW / 2 + 2, roofDark);

    // the tower + spire — this is what actually needs to read from a
    // distance, so it gets the most contrast and the tallest silhouette
    const towerW = 14;
    const towerH = 34;
    const towerTop = wallTop - 10 - towerH;
    ctx.fillStyle = wallDark;
    ctx.fillRect(cx - towerW / 2 - 1, towerTop - 1, towerW + 2, towerH + 2);
    ctx.fillStyle = wallColor;
    ctx.fillRect(cx - towerW / 2, towerTop, towerW, towerH);
    ctx.fillStyle = wallLight;
    ctx.fillRect(cx - towerW / 2, towerTop, 1.3, towerH);
    // louvred belfry opening
    ctx.fillStyle = '#241a10';
    ctx.fillRect(cx - 3, towerTop + 6, 6, 10);
    ctx.strokeStyle = wallDark;
    ctx.lineWidth = 0.7;
    for (let ly = towerTop + 8; ly < towerTop + 15; ly += 2.5) {
      ctx.beginPath();
      ctx.moveTo(cx - 3, ly);
      ctx.lineTo(cx + 3, ly);
      ctx.stroke();
    }

    const spireBaseY = towerTop;
    const spireTopY = spireBaseY - 26;
    ctx.fillStyle = roofDark;
    triangle(ctx, cx, spireTopY, spireBaseY, towerW / 2 + 2, roofDark);
    ctx.fillStyle = roofColor;
    triangle(ctx, cx - 1, spireTopY + 1, spireBaseY - 1, towerW / 2 - 1, roofColor);

    // Finial + cross at the very top — the highest point of the whole town,
    // and deliberately the highest-contrast thing on the whole sprite: a
    // gilded gold cross with a dark outline behind it, not a thin stroke,
    // so it actually reads as a cross rather than disappearing against the
    // sky at this pixel scale.
    const crossX = cx;
    const crossTopY = spireTopY - 13;
    const crossBarY = spireTopY - 9;
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(crossX, spireTopY + 1);
    ctx.lineTo(crossX, crossTopY);
    ctx.moveTo(crossX - 4, crossBarY);
    ctx.lineTo(crossX + 4, crossBarY);
    ctx.stroke();
    ctx.strokeStyle = '#f0c93d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(crossX, spireTopY + 1);
    ctx.lineTo(crossX, crossTopY);
    ctx.moveTo(crossX - 4, crossBarY);
    ctx.lineTo(crossX + 4, crossBarY);
    ctx.stroke();
  });
}

// A stretch of the city's fortifications — Québec was (and still is) the
// only walled city left in North America, and by the 1790s those walls
// were exactly what a river approach would actually show first. Simple by
// design: a long coursed-stone curtain wall with crenellations, meant to
// repeat edge-to-edge along the town's river frontage rather than stand
// alone the way a building does.
export function createRampartSprite() {
  const w = 64, h = 26;
  const stone = '#767066', stoneDark = '#54504a', stoneLight = '#96907f';

  return makeSprite(w, h, (ctx) => {
    groundShadow(ctx, w / 2, h - 2, w / 2 - 2, 3);

    const wallTop = 10;
    ctx.fillStyle = stoneDark;
    ctx.fillRect(0, wallTop - 1, w, h - wallTop - 1);
    ctx.fillStyle = stone;
    ctx.fillRect(0, wallTop, w, h - wallTop - 3);
    ctx.strokeStyle = stoneDark;
    ctx.lineWidth = 0.8;
    let row = 0;
    for (let ly = wallTop + 4; ly < h - 3; ly += 4, row++) {
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(w, ly);
      ctx.stroke();
      const jitter = row % 2 === 0 ? 0 : 4;
      for (let lx = 3 + jitter; lx < w; lx += 8) {
        ctx.beginPath();
        ctx.moveTo(lx, ly - 4);
        ctx.lineTo(lx, ly);
        ctx.stroke();
      }
    }
    ctx.fillStyle = stoneLight;
    ctx.fillRect(0, wallTop, w, 1.2);

    // crenellations along the top edge
    ctx.fillStyle = stoneDark;
    for (let x = 2; x < w - 4; x += 10) {
      ctx.fillRect(x, wallTop - 5, 6, 6);
    }
    ctx.fillStyle = stone;
    for (let x = 2; x < w - 4; x += 10) {
      ctx.fillRect(x, wallTop - 5, 5, 5);
    }
  });
}

// The player's own figure, walking around a village on foot — same tan
// skin / cream shirt / red sash palette as the canoe's paddler, so it
// reads as the same voyageur. A single sprite; game.js mirrors it
// horizontally for left/right facing rather than drawing separate frames.
export function createWalkerSprite(strideLeft = false) {
  const w = 14, h = 20;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    groundShadow(ctx, cx, h - 3, 4, 2);

    // legs, alternating stride
    ctx.fillStyle = '#3f2b1a';
    const strideOffset = strideLeft ? 1 : -1;
    ctx.fillRect(cx - 3, h - 8 + Math.max(0, strideOffset), 2.4, 6 - Math.max(0, strideOffset));
    ctx.fillRect(cx + 1, h - 8 + Math.max(0, -strideOffset), 2.4, 6 - Math.max(0, -strideOffset));

    // torso, outlined
    ctx.fillStyle = '#c9bb98';
    ctx.fillRect(cx - 5, 6, 10, 10);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(cx - 4, 7, 8, 8);
    ctx.fillStyle = '#b5322f';
    ctx.fillRect(cx - 4, 10, 8, 2.6);

    // head
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(cx - 3.5, 0.5, 7, 6.5);
    ctx.fillStyle = '#c98a5e';
    ctx.fillRect(cx - 3, 2, 6, 5);
  });
}

// The repair shop's keeper — standing outside the door, same build as the
// player's walker but a leather apron and a brimmed hat in place of the
// cream shirt/bare head, so a glance tells you this is someone to trade
// with, not the player's own figure. Always this one static pose; it never
// moves, so there's no stride animation to draw. A couple pixels taller
// than the walker sprite to leave headroom for the hat.
export function createTraderSprite() {
  const w = 14, h = 22;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    groundShadow(ctx, cx, h - 1, 4, 2);

    // legs, standing still
    ctx.fillStyle = '#3f2b1a';
    ctx.fillRect(cx - 3, 16, 2.4, 5);
    ctx.fillRect(cx + 1, 16, 2.4, 5);

    // torso: a grey work shirt with a leather apron over it
    ctx.fillStyle = '#5a6570';
    ctx.fillRect(cx - 5, 6, 10, 10);
    ctx.fillStyle = '#727f8c';
    ctx.fillRect(cx - 4, 7, 8, 8);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(cx - 3.5, 9, 7, 7);
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(cx - 3.5, 9, 7, 1.4);

    // head, with a brimmed hat instead of the player's bare head
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(cx - 3.5, 3.5, 7, 5.5);
    ctx.fillStyle = '#c98a5e';
    ctx.fillRect(cx - 3, 5, 6, 4);
    ctx.fillStyle = '#3f2b1a';
    ctx.fillRect(cx - 5, 2, 10, 1.6);
    ctx.fillRect(cx - 3, 0, 6, 2);
  });
}
