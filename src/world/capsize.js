// Le chaviré — the canoe going over.
//
// Top-down, a roll is a width change. The hull squashes to nothing as it
// comes up onto its gunwale, then opens back out upside-down: cos() across
// the roll gives exactly that, 1 -> 0 -> -1, and swapping to the overturned
// hull sprite (sprites.js's createCapsizedCanoeSprite) at the zero crossing
// hides the swap inside the one frame where the canoe is a pixel wide. After
// that it's the hull settling and going under — the flipped scale kept, a
// slow drift and spin, shrinking and fading, with foam and the spilled kit
// left spreading on the surface.
//
// Deliberately *not* a spin-and-sink, which is the obvious thing to reach
// for. From directly overhead a sprite rotating about its own centre reads
// as the canoe pirouetting on the water, which is the one thing a capsize
// isn't. The width collapse is what says "it went over" instead of "it
// turned around"; the slow spin underneath only keeps the sunk hull from
// looking pinned to the screen.

// Phase lengths, in seconds. The roll is quick because it's a lurch, not a
// manoeuvre; the sink is long enough to read as the river taking the boat.
// Together they're how long the game-over card is held back (game.js's
// update()), which is why the total stays under a second and a half — any
// longer and a player who already knows they're dead is just waiting on an
// animation.
const ROLL_TIME = 0.42;
const SINK_TIME = 0.92;
export const TOTAL_TIME = ROLL_TIME + SINK_TIME;

// How far the hull slides, in screen pixels, in the direction it rolled —
// it was knocked over, so it shouldn't go down exactly where it was paddling.
// Small: the camera doesn't follow it, so anything larger walks the wreck
// off toward the bank for no reason.
const ROLL_SLIDE = 9;
// Radians/sec the overturned hull turns as it sinks. Slow enough to read as
// the current working on a dead hull rather than as the canoe still steering.
const SINK_SPIN = 0.55;
// What's left of the hull at the bottom of the sink, before it fades out
// entirely. Not zero — a hull that shrinks to a point reads as flying away
// from the camera, not as sinking; it should still be boat-sized when the
// water closes over it.
const SINK_SCALE_END = 0.72;

// Foam thrown up where the hull went over. Pixel-art spray: small bright
// squares, not blurred circles.
const FOAM_COUNT = 18;
const FOAM_SPEED = 46;         // px/sec at spawn
const FOAM_DRAG = 3.4;         // 1/sec — spray stops fast, it's water not debris
const FOAM_LIFE = 0.75;        // seconds
const FOAM_COLORS = ['#ffffff', '#e6f5fa', '#bcdfe9'];

// The two spreading rings left on the surface. Staggered so there's always
// one opening while the other fades, which reads as disturbed water rather
// than a single pulse.
const RING_COUNT = 2;
const RING_STAGGER = 0.3;      // seconds between them
const RING_GROW = 34;          // px/sec of radius
const RING_LIFE = 0.9;

// The kit that floats clear when the canoe goes over: the paddle and the
// paddler's tuque. Thematic rather than decorative — they're the two things
// the upright sprite draws that the overturned one can't (sprites.js), so
// seeing them come out is what accounts for where they went.
const DEBRIS_SPEED = 26;
const DEBRIS_DRAG = 1.6;

export function createCapsize() {
  // -1 means idle. Anything >= 0 is time since the hull started over.
  let t = -1;
  let dir = 1;
  let baseAngle = 0;
  let foam = [];
  let debris = [];

  function spawn() {
    foam = [];
    for (let i = 0; i < FOAM_COUNT; i++) {
      // Biased along the roll: the water goes where the hull pushed it.
      const a = Math.random() * Math.PI * 2;
      const speed = FOAM_SPEED * (0.35 + Math.random() * 0.65);
      foam.push({
        x: 0,
        y: 0,
        vx: Math.cos(a) * speed + dir * FOAM_SPEED * 0.4,
        vy: Math.sin(a) * speed * 0.6, // flattened — it's a surface, seen from above
        size: Math.random() < 0.3 ? 2 : 1,
        color: FOAM_COLORS[(Math.random() * FOAM_COLORS.length) | 0],
        life: FOAM_LIFE * (0.5 + Math.random() * 0.5),
        age: 0,
      });
    }
    debris = [
      { kind: 'paddle', x: dir * 5, y: -2, vx: dir * DEBRIS_SPEED, vy: -DEBRIS_SPEED * 0.35, angle: baseAngle, spin: dir * 2.4 },
      { kind: 'tuque', x: -dir * 3, y: 3, vx: -dir * DEBRIS_SPEED * 0.6, vy: DEBRIS_SPEED * 0.5, angle: 0, spin: -dir * 1.5 },
    ];
  }

  return {
    // `rollDir` is which way the hull goes over: +1 to starboard, -1 to
    // port. game.js hands it the canoe's own lateral motion, so a boat that
    // was already heeling into a turn carries on over that way.
    start(rollDir, angle = 0) {
      if (t >= 0) return; // already going over — a second fatal hit can't restart it
      t = 0;
      dir = rollDir < 0 ? -1 : 1;
      baseAngle = angle;
      spawn();
    },
    isActive() {
      return t >= 0;
    },
    reset() {
      t = -1;
      foam = [];
      debris = [];
    },
    // Advances the animation. Returns true on the frame it finishes, which
    // is game.js's cue to put up the game-over card.
    update(dt) {
      if (t < 0) return false;
      t += dt;
      for (const p of foam) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx -= p.vx * FOAM_DRAG * dt;
        p.vy -= p.vy * FOAM_DRAG * dt;
      }
      for (const d of debris) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vx -= d.vx * DEBRIS_DRAG * dt;
        d.vy -= d.vy * DEBRIS_DRAG * dt;
        d.angle += d.spin * dt;
      }
      return t >= TOTAL_TIME;
    },

    // 0 while rolling, then 0..1 across the sink. Exported for the smoke
    // test, which checks the phases actually happen in order rather than
    // trusting a single end-state.
    sinkFraction() {
      if (t < ROLL_TIME) return 0;
      return Math.min(1, (t - ROLL_TIME) / SINK_TIME);
    },
    // 1 upright, 0 edge-on (halfway over), -1 fully inverted. The animation's
    // whole premise in one number.
    rollScale() {
      if (t < 0) return 1;
      const p = Math.min(1, t / ROLL_TIME);
      return Math.cos(p * Math.PI);
    },

    // `sprites` is game.js's canoe sprite set: { left, right, capsized }.
    // `x`/`y` are where the canoe would have been drawn, `scale` whatever
    // the flight is already applying (a capsize can happen airborne).
    draw(ctx, x, y, sprites, scale = 1) {
      if (t < 0) return;
      const roll = this.rollScale();
      const sink = this.sinkFraction();
      // Over on its gunwale, so it's the underside showing from the zero
      // crossing on. The swap lands on the frame the hull is one pixel wide.
      const sprite = roll > 0 ? sprites.right : sprites.capsized;
      const slide = ROLL_SLIDE * Math.min(1, t / ROLL_TIME) + ROLL_SLIDE * 0.5 * sink;
      const cx = x + dir * slide;

      // Rings and foam sit on the water, so they go under the hull.
      for (let i = 0; i < RING_COUNT; i++) {
        const age = t - i * RING_STAGGER;
        if (age < 0 || age > RING_LIFE) continue;
        const r = 4 + age * RING_GROW;
        const alpha = (1 - age / RING_LIFE) * 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#dcf0f7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Flattened: a circle on the water, seen from this camera's angle.
        ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const p of foam) {
        if (p.age >= p.life) continue;
        ctx.save();
        ctx.globalAlpha = 1 - p.age / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(x + p.x), Math.round(y + p.y), p.size, p.size);
        ctx.restore();
      }

      // The hull. globalAlpha fades it under rather than sliding it down the
      // screen: down-screen is *downstream* in this projection, and a hull
      // drifting that way would read as floating off, not sinking.
      ctx.save();
      ctx.globalAlpha = 1 - sink * sink; // eased, so it lingers visible then goes
      ctx.translate(cx, y);
      ctx.rotate(baseAngle + sink * SINK_SPIN * SINK_TIME * dir);
      const shrink = 1 - (1 - SINK_SCALE_END) * sink;
      ctx.scale(scale * roll * shrink, scale * shrink);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();

      // Spilled kit floats on top of everything — it's the last thing still
      // above water once the hull has gone.
      for (const d of debris) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - sink * 0.65);
        ctx.translate(x + d.x, y + d.y);
        ctx.rotate(d.angle);
        if (d.kind === 'paddle') {
          ctx.fillStyle = '#3a2413';
          ctx.fillRect(-1, -6, 2, 12);
          ctx.fillStyle = '#8a5a34';
          ctx.fillRect(-2, -8, 4, 3);
        } else {
          ctx.fillStyle = '#b5322f'; // the sash red, so it reads as the paddler's
          ctx.fillRect(-2.5, -1.5, 5, 3);
        }
        ctx.restore();
      }
    },
  };
}
