import { centerX, widthAt, braidAt } from '../river/path.js';
import { createRockSprite, createLogSprite, createIslandSprite, createPeltSprite } from './sprites.js';
import { AHEAD_UNITS, BEHIND_UNITS } from './config.js';

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

// A braided-channel island (river/path.js) is a real geography feature, not
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
    if (hi - lo < 0.3) return null; // that side channel is too tight here
    return lo + Math.random() * (hi - lo);
  }

  const half = widthAt(d) / 2 - EDGE_MARGIN;
  if (type === ISLAND) {
    const clearance = half - 1.3;
    if (clearance < 0.4) return null;
    return centerX(d) + (Math.random() * 2 - 1) * clearance * 0.5;
  }
  return centerX(d) + (Math.random() * 2 - 1) * Math.max(0.1, half);
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
  if (x === null) x = centerX(d); // last-resort safe default, shouldn't normally hit
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
    update(time, dt, speed, canoeWorldX, onHit, onCollect) {
      for (const entry of pool) {
        entry.z += speed * dt;

        if (entry.active && Math.abs(entry.z) < 0.7) {
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
        const { x: sx, y: sy } = worldToScreen(entry.x, entry.z, cameraWorldX);
        const sprite = sprites[entry.type];
        if (entry.type === PELT) {
          const bob = Math.sin(time * 3 + entry.spinPhase) * 2;
          const squash = 0.6 + Math.abs(Math.cos(time * 2 + entry.spinPhase)) * 0.4;
          ctx.save();
          ctx.translate(sx, sy + bob);
          ctx.scale(squash, 1);
          ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
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
