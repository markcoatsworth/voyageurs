// A pair of big Union Jacks on flagpoles just inside Upper Canada, one on
// each bank, facing each other across the river at the same point — "Can
// we put a big Union Jack flag on the south (left) river bank when crossing
// into Upper Canada?", then "add another Union Jack on the opposite river
// bank at exactly the same location along the river". They stand a few
// units into the Rideau leg, so they're on screen the moment you come onto
// it, under game.js's "ENTERING UPPER CANADA" title card (enterRideau()).
// Both fly out over the water toward each other, framing the channel like
// a gateway; the north one shows the flag's reverse, mirrored, as a real
// flag seen from behind does.
//
// The familiar Union Jack (the 1801 Union Flag, St Patrick's red saltire
// counterchanged with St Andrew's white): the flag Upper Canada flew for
// nearly all of its 1791-1841 life.
//
// Scenery only — on the bank, nothing on the water to hit. The cloth is
// drawn once into its own small canvas, then laid down a column at a time,
// each shifted by a travelling wave (bigger toward the fly end) with a light
// and dark fold shading over it, so it ripples rather than hangs flat.
// Height above the bank goes up the screen, the same pseudo-3D the churches
// and the whales use.
import { PIXELS_PER_UNIT } from '../shared/config.js';
import { centerX, widthAt, SEGMENT_SHAPE_OFFSET } from './river/path.js';

// Tuned by hand along the river, in units past the Rideau's start: +4,
// then +6 (on screen the moment you cross), then +36.5 (in view ~2s after
// the "ENTERING UPPER CANADA" card — "too far along the river now"), and
// now halfway between those last two ("halfway between where they were
// before, and where they are now"): +21.25, then on a bit ("a bit further
// along the river") to +26 — in view ~1.3s after the card for a canoe
// paddling through the crossing (~29 units in 2s; slower if you drift).
// The cloth shows ~FLAG_VISIBLE_AHEAD units ahead of the canoe.
export const FLAG_VISIBLE_AHEAD = 7;
export const UPPER_CANADA_FLAG_D = SEGMENT_SHAPE_OFFSET.rideau + 26;
const BANK_SIDES = [-1, 1]; // south (left on screen) and north (right)
const SET_BACK = 1.4; // units back from the water's edge, onto the bank

const FLAG_W = 40; // px
const FLAG_H = 20;
const POLE_H = 74; // px from the bank to the finial

const NAVY = '#012169';
const RED = '#c8102e';
const WHITE = '#ffffff';

let cloth = null;
function buildCloth() {
  const c = document.createElement('canvas');
  c.width = FLAG_W;
  c.height = FLAG_H;
  const g = c.getContext('2d');
  if (!g) return null;
  const w = FLAG_W, h = FLAG_H;
  g.fillStyle = NAVY;
  g.fillRect(0, 0, w, h);
  // A diagonal band from corner to corner, `t` thick, offset `o` across it.
  const band = (x0, y0, x1, y1, t, o = 0) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    g.beginPath();
    g.moveTo(x0 + nx * (o - t / 2), y0 + ny * (o - t / 2));
    g.lineTo(x1 + nx * (o - t / 2), y1 + ny * (o - t / 2));
    g.lineTo(x1 + nx * (o + t / 2), y1 + ny * (o + t / 2));
    g.lineTo(x0 + nx * (o + t / 2), y0 + ny * (o + t / 2));
    g.closePath();
    g.fill();
  };
  // St Andrew's white saltire...
  g.fillStyle = WHITE;
  band(0, 0, w, h, h * 0.3);
  band(0, h, w, 0, h * 0.3);
  // ...St Patrick's red one over it, narrower and counterchanged — shifted
  // off-centre, the opposite way in each arm, so the white shows wider on
  // one side of the red than the other (the bit everyone draws wrong).
  g.fillStyle = RED;
  const off = h * 0.05;
  g.save();
  g.beginPath(); g.rect(0, 0, w / 2, h / 2); g.rect(w / 2, h / 2, w / 2, h / 2); g.clip();
  band(0, 0, w, h, h * 0.1, off);
  g.restore();
  g.save();
  g.beginPath(); g.rect(w / 2, 0, w / 2, h / 2); g.rect(0, h / 2, w / 2, h / 2); g.clip();
  band(0, 0, w, h, h * 0.1, -off);
  g.restore();
  g.save();
  g.beginPath(); g.rect(0, 0, w / 2, h / 2); g.rect(w / 2, h / 2, w / 2, h / 2); g.clip();
  band(0, h, w, 0, h * 0.1, -off);
  g.restore();
  g.save();
  g.beginPath(); g.rect(w / 2, 0, w / 2, h / 2); g.rect(0, h / 2, w / 2, h / 2); g.clip();
  band(0, h, w, 0, h * 0.1, off);
  g.restore();
  // St George's cross: white fimbriation, then the red cross on it.
  g.fillStyle = WHITE;
  g.fillRect(0, h * 0.34, w, h * 0.32);
  g.fillRect(w / 2 - h * 0.16, 0, h * 0.32, h);
  g.fillStyle = RED;
  g.fillRect(0, h * 0.4, w, h * 0.2);
  g.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h);
  return c;
}

// A flag's spot on its bank (-1 south/left, 1 north/right): world x of
// the pole's foot.
export function upperCanadaFlagX(side = -1) {
  const d = UPPER_CANADA_FLAG_D;
  return centerX(d) + side * (widthAt(d) / 2 + SET_BACK);
}

export function drawUpperCanadaFlag(ctx, worldDistance, cameraWorldX, time, worldToScreen) {
  const z = worldDistance - UPPER_CANADA_FLAG_D;
  // Off the bottom of the screen (with the whole pole) or not yet in range.
  if (z > (POLE_H + 40) / PIXELS_PER_UNIT || z < -20) return;
  if (!cloth) cloth = buildCloth();
  for (const side of BANK_SIDES) {
    const { x, y } = worldToScreen(upperCanadaFlagX(side), z, cameraWorldX);
    drawFlagpole(ctx, Math.round(x), Math.round(y), -side, time);
  }
}

// One pole and flag, foot at screen (px, base). `fly` is the direction the
// cloth streams out from the pole: +1 to the right, -1 to the left (shown
// mirrored — its reverse side).
function drawFlagpole(ctx, px, base, fly, time) {
  const top = base - POLE_H;
  ctx.save();
  // A little cairn of stones at the foot, and the pole's shadow on the grass.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(fly > 0 ? px + 1 : px - 15, base, 14, 2);
  ctx.fillStyle = '#8a8679';
  ctx.fillRect(px - 4, base - 3, 9, 4);
  ctx.fillStyle = '#a9a495';
  ctx.fillRect(px - 3, base - 4, 6, 2);
  // The pole: dark timber with a lit edge, a gilt ball on top.
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(px - 1, top, 2, POLE_H);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(px - 1, top, 1, POLE_H);
  ctx.fillStyle = '#e0b84a';
  ctx.fillRect(px - 2, top - 3, 4, 3);

  // The cloth, streaming out from the pole a column at a time on a
  // travelling wave.
  if (cloth) {
    const fy = top + 2;
    for (let i = 0; i < FLAG_W; i++) {
      const f = i / FLAG_W; // 0 at the hoist, 1 at the fly
      const phase = time * 5.2 - i * 0.32;
      const dy = Math.round(Math.sin(phase) * (0.6 + f * 2.6));
      const cx = fly > 0 ? px + 1 + i : px - 2 - i;
      ctx.drawImage(cloth, i, 0, 1, FLAG_H, cx, fy + dy, 1, FLAG_H);
      // Fold shading: light on the crests, dark in the troughs.
      const shade = Math.cos(phase);
      ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${0.12 * shade * f})` : `rgba(0,0,0,${-0.2 * shade * (0.3 + f)})`;
      ctx.fillRect(cx, fy + dy, 1, FLAG_H);
    }
  }
  ctx.restore();
}
