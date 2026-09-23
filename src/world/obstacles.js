import { centerX, widthAt, braidAt, southIslandAt } from './river/path.js';
import { dockSpanAt } from './villages.js';
import { createRockSprite, createLogSprite, createIslandSprite, createPeltSprite } from './sprites.js';
import { AHEAD_UNITS, BEHIND_UNITS, PIXELS_PER_UNIT } from '../shared/config.js';

const SPAWN_Z = -AHEAD_UNITS;
const RECYCLE_Z = BEHIND_UNITS;
const POOL_SIZE = 10;
const BASE_GAP = 5;
const GAP_VARIANCE = 5;
const GAP_SHRINK_PER_METER = 0.006;
const MIN_GAP = 2.6;
const EDGE_MARGIN = 0.6;

const ROCK = 'rock';
const LOG = 'log';
const ISLAND = 'island';
const PELT = 'pelt';

const sprites = {
  [ROCK]: createRockSprite(),
  [LOG]: createLogSprite(),
  [ISLAND]: createIslandSprite(),
  [PELT]: createPeltSprite(),
};

// An 8-point twinkle, drawn over the pelt sprite each frame (not baked into
// the static sprite, which is cached once) — the universal "valuable, pick
// this up" cue that a flat sprite alone can't give. Rocks stay matte/static
// by contrast, on purpose: only good things sparkle.
function sparkle(ctx, x, y, size, alpha, color) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? size : size * 0.32;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
// Two glints per pelt, offset in position and timing so they don't blink in
// lockstep across the whole field; raised to a power so each twinkle snaps
// on and fades rather than breathing smoothly like the bob/squash below.
const SPARKLE_SPOTS = [
  { x: -2.6, y: -4.4, freq: 3.1, size: 2.2 },
  { x: 2.4, y: 2.6, freq: 3.8, size: 1.6 },
];

// A braided-channel island (world/river/path.js) is a real geography feature, not
// a random obstacle — skip spawning the (unrelated) floating island prop
// during a braid so there's never a confusing second island stacked on it.
function pickType(hasBraid) {
  const roll = Math.random();
  if (roll < 0.35) return ROCK;
  if (roll < 0.6) return LOG;
  if (roll < 0.7 && !hasBraid) return ISLAND;
  return PELT;
}

function hitRadiusFor(type) {
  if (type === LOG) return 1.0;
  if (type === ISLAND) return 1.7;
  return 0.55;
}

// Half of each sprite's actual drawn width, in world units (its pixel width
// from sprites.js over PIXELS_PER_UNIT). Deliberately separate from
// hitRadiusFor above, which is a gameplay collision radius and doesn't
// match the art (an island hits at 1.7 but only draws 1.25 wide): the dock
// exclusion below is about what overlaps on screen, so it has to measure
// what's actually drawn.
function drawHalfWidthFor(type) {
  if (type === LOG) return 30 / 2 / PIXELS_PER_UNIT;
  if (type === ISLAND) return 40 / 2 / PIXELS_PER_UNIT;
  if (type === PELT) return 15 / 2 / PIXELS_PER_UNIT;
  return 18 / 2 / PIXELS_PER_UNIT; // rock
}

// The dock's span at this d, widened by the sprite's own half-width so the
// obstacle clears the planks entirely rather than just having its centre
// outside them. Null when there's no dock here, which is almost always.
function dockExclusionAt(type, d) {
  const span = dockSpanAt(d);
  if (!span) return null;
  const hw = drawHalfWidthFor(type);
  return { lo: span.lo - hw, hi: span.hi + hw };
}

// Picks uniformly in [lo, hi] but never inside `avoid` ({lo, hi} or null),
// splitting into lanes on either side and weighting by lane width so a
// sliver isn't as likely as an open stretch. Returns null when neither
// side leaves usable room — callers treat that as "nothing fits here."
// Same lane-splitting the braid branch below already does by hand for the
// south island; factored out so the dock exclusion can reuse it.
const MIN_LANE = 0.3;
function pickInLanes(lo, hi, avoid) {
  if (hi - lo < MIN_LANE) return null;
  if (!avoid || avoid.hi <= lo || avoid.lo >= hi) return lo + Math.random() * (hi - lo);
  const lanes = [];
  if (avoid.lo - lo >= MIN_LANE) lanes.push([lo, avoid.lo]);
  if (hi - avoid.hi >= MIN_LANE) lanes.push([avoid.hi, hi]);
  if (lanes.length === 0) return null;
  const total = lanes.reduce((sum, [a, b]) => sum + (b - a), 0);
  let r = Math.random() * total;
  for (const [a, b] of lanes) {
    if (r < b - a) return a + r;
    r -= b - a;
  }
  return lanes[0][0];
}

// Picks a world X for an obstacle at downstream distance d, staying clear of
// the banks. Islands bias toward mid-channel so they force a real left/right
// choice; everything else scatters across the navigable width. During a
// braid, obstacles are confined to whichever single side channel they land
// in, so they never spawn on top of the island itself.
function pickX(type, d) {
  const braid = braidAt(d);
  if (braid) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const outerEdge = centerX(d) + side * (widthAt(d) / 2 - EDGE_MARGIN);
    const islandEdge = braid.centerX + side * (braid.halfWidth + EDGE_MARGIN);
    const lo = Math.min(outerEdge, islandEdge);
    const hi = Math.max(outerEdge, islandEdge);

    // Île Sainte-Hélène/Nuns' Island (river/islands.js's southIslandAt) sit
    // nested inside this same sub-channel near Montréal, on the south side
    // — split the lane around them the same way the main braid island
    // already splits the ambient channel, rather than letting an obstacle
    // land on top of them.
    const south = southIslandAt(d);
    if (south) {
      const southLo = south.centerX - south.halfWidth - EDGE_MARGIN;
      const southHi = south.centerX + south.halfWidth + EDGE_MARGIN;
      if (southHi > lo && southLo < hi) {
        const lanes = [];
        if (southLo - lo >= 0.3) lanes.push([lo, southLo]);
        if (hi - southHi >= 0.3) lanes.push([southHi, hi]);
        if (lanes.length === 0) return null; // both sub-lanes too tight here
        const [laneLo, laneHi] = lanes[Math.floor(Math.random() * lanes.length)];
        return pickInLanes(laneLo, laneHi, dockExclusionAt(type, d));
      }
    }

    if (hi - lo < MIN_LANE) return null; // that side channel is too tight here
    return pickInLanes(lo, hi, dockExclusionAt(type, d));
  }

  const half = widthAt(d) / 2 - EDGE_MARGIN;
  const dock = dockExclusionAt(type, d);
  if (type === ISLAND) {
    const clearance = half - 1.3;
    if (clearance < 0.4) return null;
    return pickInLanes(centerX(d) - clearance * 0.5, centerX(d) + clearance * 0.5, dock);
  }
  const reach = Math.max(0.1, half);
  return pickInLanes(centerX(d) - reach, centerX(d) + reach, dock);
}

function gapFor(distance) {
  const shrink = Math.min(BASE_GAP + GAP_VARIANCE - MIN_GAP, distance * GAP_SHRINK_PER_METER);
  return Math.max(MIN_GAP, BASE_GAP + Math.random() * GAP_VARIANCE - shrink);
}

function place(world, z) {
  const d = world.distance - z;
  const hasBraid = braidAt(d) !== null;
  let type = pickType(hasBraid);
  let x = pickX(type, d);
  if (x === null) { type = ROCK; x = pickX(type, d); }
  if (x === null) {
    // Last-resort default, shouldn't normally hit — but mid-channel can
    // itself sit on a dock (Kingston's reaches 30 units out), so push clear
    // of the planks rather than parking an obstacle on them.
    x = centerX(d);
    const dock = dockExclusionAt(type, d);
    if (dock && x > dock.lo && x < dock.hi) {
      x = (x - dock.lo < dock.hi - x) ? dock.lo : dock.hi;
    }
  }
  return { type, x, z, active: true, spinPhase: Math.random() * Math.PI * 2 };
}

export function createObstacleField(world) {
  let pool = [];

  function seed() {
    const list = [];
    let z = SPAWN_Z;
    for (let i = 0; i < POOL_SIZE; i++) {
      list.push(place(world, z));
      z -= gapFor(world.distance - z);
    }
    return list;
  }

  pool = seed();

  function respawn(entry) {
    let furthest = 0;
    for (const e of pool) if (e.z < furthest) furthest = e.z;
    const newZ = furthest - gapFor(world.distance);
    const fresh = place(world, newZ);
    entry.type = fresh.type;
    entry.x = fresh.x;
    entry.z = fresh.z;
    entry.active = true;
    entry.spinPhase = fresh.spinPhase;
  }

  return {
    pool,
    // `collidable` false (Chasse-galerie flight) still advances and recycles
    // every entry so the field keeps scrolling under the canoe, but nothing
    // is hit or picked up — the canoe is in the air, not on the water.
    update(time, dt, speed, canoeWorldX, onHit, onCollect, collidable = true) {
      for (const entry of pool) {
        entry.z += speed * dt;

        if (collidable && entry.active && Math.abs(entry.z) < 0.7) {
          const dx = Math.abs(entry.x - canoeWorldX);
          if (dx < hitRadiusFor(entry.type)) {
            entry.active = false;
            if (entry.type === PELT) onCollect(entry);
            else onHit(entry);
          }
        }

        if (entry.z > RECYCLE_Z) respawn(entry);
      }
    },
    draw(ctx, time, cameraWorldX, worldToScreen) {
      for (const entry of pool) {
        // A collected pelt is gone — hide it immediately rather than letting
        // it keep bobbing in the water until it recycles offscreen. (Hit
        // rocks/logs are also inactive but stay drawn: you still paddle past
        // the rock you clipped.)
        if (entry.type === PELT && !entry.active) continue;
        const { x: sx, y: sy } = worldToScreen(entry.x, entry.z, cameraWorldX);
        const sprite = sprites[entry.type];
        if (entry.type === PELT) {
          const bob = Math.sin(time * 3 + entry.spinPhase) * 2;
          const squash = 0.6 + Math.abs(Math.cos(time * 2 + entry.spinPhase)) * 0.4;
          ctx.save();
          ctx.translate(sx, sy + bob);
          ctx.scale(squash, 1);
          ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
          for (const s of SPARKLE_SPOTS) {
            const tw = Math.pow(Math.max(0, Math.sin(time * s.freq + entry.spinPhase)), 6);
            sparkle(ctx, s.x, s.y, s.size, tw, '#fff2c4');
          }
          ctx.restore();
        } else {
          ctx.drawImage(sprite, sx - sprite.width / 2, sy - sprite.height / 2);
        }
      }
    },
    reset() {
      pool = seed();
      this.pool = pool;
    },
  };
}
