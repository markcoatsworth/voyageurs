// The on-foot village scene: a small, fixed (non-scrolling) local area with
// a few buildings and a dock back to the water. Deliberately simple for
// now — free 4-directional walking and building collision, no interaction
// yet (see the module comment in game.js for the planned shops).
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js';
import { createGrassTile, createWaterTile, createSandTile } from './tiles.js';
import { createCabinSprite, createWalkerSprite, createCanoeSprite, createPineTreeSprite } from './sprites.js';

const WALK_SPEED = 62; // px/sec, in this scene's own fixed pixel space

const WATER_TOP = CANVAS_HEIGHT - 40;
const DOCK_HALF_W = 20;
const DOCK_X0 = CANVAS_WIDTH / 2 - DOCK_HALF_W;
const DOCK_X1 = CANVAS_WIDTH / 2 + DOCK_HALF_W;
const DOCK_TOP = WATER_TOP - 12;

// Anchor is the point where each building's front (door) sits; the
// collision box is a simplified footprint under the sprite's walls, not
// its wider overhanging roof.
const BUILDINGS = [
  { variant: 0, anchorX: CANVAS_WIDTH / 2, anchorY: 96, footHalfW: 12, footHeight: 22 },
  { variant: 1, anchorX: CANVAS_WIDTH / 2 - 86, anchorY: 128, footHalfW: 9, footHeight: 17 },
  { variant: 2, anchorX: CANVAS_WIDTH / 2 + 90, anchorY: 120, footHalfW: 9, footHeight: 17 },
];

const REBOARD_ZONE = { x0: DOCK_X0 + 5, x1: DOCK_X1 - 5, y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };

// Purely decorative — drawn behind the buildings/player, clear of the
// walkable area and the dock — so the clearing reads as cut out of the
// same forest seen from the river, not a bare field.
const TREES = [
  { x: 36, y: 16, variant: 0 }, { x: 118, y: 10, variant: 1 }, { x: 292, y: 14, variant: 2 },
  { x: 12, y: 64, variant: 2 }, { x: 10, y: 150, variant: 0 },
  { x: 308, y: 58, variant: 1 }, { x: 312, y: 158, variant: 2 },
  { x: 44, y: 156, variant: 1 }, { x: 40, y: 96, variant: 0 },
  { x: 262, y: 150, variant: 0 }, { x: 276, y: 92, variant: 2 },
  { x: 196, y: 96, variant: 1 },
];

const PLAYER_START = { x: CANVAS_WIDTH / 2, y: WATER_TOP - 10 };
const PLAYER_HALF = 4; // simple circular-ish collision radius against buildings

let patterns = null;
function ensurePatterns(ctx) {
  if (patterns) return patterns;
  patterns = {
    grass: ctx.createPattern(createGrassTile(), 'repeat'),
    water: ctx.createPattern(createWaterTile(), 'repeat'),
    sand: ctx.createPattern(createSandTile(), 'repeat'),
  };
  return patterns;
}

const cabinSprites = BUILDINGS.map((b) => createCabinSprite(b.variant));
const walkerFrames = [createWalkerSprite(false), createWalkerSprite(true)];
const parkedCanoeSprite = createCanoeSprite(1);
const treeSprites = [0, 1, 2].map(createPineTreeSprite);

function buildingBox(b) {
  return {
    x0: b.anchorX - b.footHalfW,
    x1: b.anchorX + b.footHalfW,
    y0: b.anchorY - b.footHeight,
    y1: b.anchorY,
  };
}

function overlapsBuilding(x, y) {
  for (const b of BUILDINGS) {
    const box = buildingBox(b);
    if (x + PLAYER_HALF > box.x0 && x - PLAYER_HALF < box.x1 && y + PLAYER_HALF > box.y0 && y - PLAYER_HALF < box.y1) {
      return true;
    }
  }
  return false;
}

// On land the player can walk anywhere within the scene margins; over the
// water band they're restricted to the dock's width, i.e. walking the
// plank back out to the boat rather than into the river.
function isWalkable(x, y) {
  if (x < 10 || x > CANVAS_WIDTH - 10 || y < 10 || y > CANVAS_HEIGHT - 4) return false;
  if (y > WATER_TOP && (x < DOCK_X0 || x > DOCK_X1)) return false;
  return !overlapsBuilding(x, y);
}

export function createVillageScene() {
  let strideTimer = 0;
  let strideFrame = 0;
  let facingLeft = false;
  const player = { x: PLAYER_START.x, y: PLAYER_START.y };

  return {
    enter() {
      player.x = PLAYER_START.x;
      player.y = PLAYER_START.y;
      strideTimer = 0;
      strideFrame = 0;
    },

    // Returns true the moment the player steps into the reboard zone.
    update(dt, keys) {
      let dx = 0, dy = 0;
      if (keys.left) dx -= 1;
      if (keys.right) dx += 1;
      if (keys.up) dy -= 1;
      if (keys.down) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        if (dx < 0) facingLeft = true;
        else if (dx > 0) facingLeft = false;

        const step = WALK_SPEED * dt;
        const nx = player.x + dx * step;
        const ny = player.y + dy * step;
        // Resolve each axis separately so sliding along a wall/edge works
        // instead of a diagonal move being blocked entirely by one axis.
        if (isWalkable(nx, player.y)) player.x = nx;
        if (isWalkable(player.x, ny)) player.y = ny;

        strideTimer += dt;
        if (strideTimer > 0.28) {
          strideTimer = 0;
          strideFrame = 1 - strideFrame;
        }
      } else {
        strideTimer = 0;
      }

      return (
        player.x >= REBOARD_ZONE.x0 && player.x <= REBOARD_ZONE.x1 &&
        player.y >= REBOARD_ZONE.y0 && player.y <= REBOARD_ZONE.y1
      );
    },

    draw(ctx) {
      const pat = ensurePatterns(ctx);

      ctx.fillStyle = pat.grass;
      ctx.fillRect(0, 0, CANVAS_WIDTH, WATER_TOP);
      ctx.fillStyle = pat.sand;
      ctx.fillRect(0, WATER_TOP - 6, CANVAS_WIDTH, 6);
      ctx.fillStyle = pat.water;
      ctx.fillRect(0, WATER_TOP, CANVAS_WIDTH, CANVAS_HEIGHT - WATER_TOP);

      // dock, planks + pilings, leading from the shore down to the canoe
      ctx.fillStyle = '#3f2b1a';
      ctx.fillRect(DOCK_X0 - 1, DOCK_TOP - 1, DOCK_X1 - DOCK_X0 + 2, CANVAS_HEIGHT - DOCK_TOP + 1);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(DOCK_X0, DOCK_TOP, DOCK_X1 - DOCK_X0, CANVAS_HEIGHT - DOCK_TOP);
      ctx.strokeStyle = '#5f3b20';
      ctx.lineWidth = 1;
      for (let py = DOCK_TOP + 5; py < CANVAS_HEIGHT; py += 5) {
        ctx.beginPath();
        ctx.moveTo(DOCK_X0, py);
        ctx.lineTo(DOCK_X1, py);
        ctx.stroke();
      }

      // treeline framing the clearing — behind everything else, so it never
      // occludes a building or the player
      for (const t of TREES) {
        const sprite = treeSprites[t.variant];
        ctx.drawImage(sprite, t.x - sprite.width / 2, t.y - sprite.height * 0.72);
      }

      // the canoe, parked at the water end of the dock
      ctx.drawImage(parkedCanoeSprite, CANVAS_WIDTH / 2 - parkedCanoeSprite.width / 2, CANVAS_HEIGHT - parkedCanoeSprite.height + 6);

      // buildings, painter's-algorithm by anchor Y
      const order = BUILDINGS.map((b, i) => ({ b, sprite: cabinSprites[i] })).sort((a, c) => a.b.anchorY - c.b.anchorY);
      for (const { b, sprite } of order) {
        ctx.drawImage(sprite, b.anchorX - sprite.width / 2, b.anchorY - sprite.height + 6);
      }

      // player, mirrored horizontally for facing rather than separate frames
      const sprite = walkerFrames[strideFrame];
      ctx.save();
      ctx.translate(player.x, player.y);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height + 2);
      ctx.restore();
    },
  };
}
