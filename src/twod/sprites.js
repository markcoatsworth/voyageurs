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

export function createRockSprite() {
  const w = 18, h = 16;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2 + 1;
    waterRipple(ctx, cx, cy + 4, 8, 3);
    ctx.fillStyle = '#33322d';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7.6, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6c6b62';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6.6, 4.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54534b';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + 1.6, 4.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9c9a8c';
    ctx.beginPath();
    ctx.ellipse(cx - 2.2, cy - 1.8, 2.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#403f38';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 2);
    ctx.lineTo(cx + 1.5, cy + 1.5);
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

export function createPeltSprite() {
  const w = 13, h = 17;
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2, cy = h / 2;
    waterRipple(ctx, cx, cy + 5, 6, 2);
    ctx.fillStyle = '#4a2f18';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5.6, 7.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a4e2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 4.6, 6.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a06a3a';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 1, 2.8, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3a20';
    ctx.lineWidth = 0.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i, cy - 5);
      ctx.lineTo(cx + i, cy + 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#c68f5c';
    ctx.fillRect(cx - 2, cy - 4, 1, 3);
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
