// The on-foot village scene: a small, fixed (non-scrolling) local area with
// a few buildings and a dock back to the water. Deliberately simple for
// now — free 4-directional walking and building collision, no interaction
// yet (see the module comment in game.js for the planned shops).
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js';
import { createGrassTile, createWaterTile, createSandTile } from './tiles.js';
import {
  createCabinSprite, createWalkerSprite, createCanoeSprite, createPineTreeSprite, createRepairShopSprite, createTraderSprite,
  createStoneBuildingSprite, createChurchSprite,
} from './sprites.js';
import { villageLayout } from './villages.js';
import { hashRange } from '../river/hash.js';

const WALK_SPEED = 62; // px/sec, in this scene's own fixed pixel space

const WATER_TOP = CANVAS_HEIGHT - 40;
const DOCK_HALF_W = 20;
const DOCK_X0 = CANVAS_WIDTH / 2 - DOCK_HALF_W;
const DOCK_X1 = CANVAS_WIDTH / 2 + DOCK_HALF_W;
const DOCK_TOP = WATER_TOP - 12;

// x0/x1 match the dock's own walkable width (DOCK_X0/DOCK_X1) exactly, not
// inset inside it — isWalkable() already clamps movement to that same
// range, so an inset here used to pin a player walking to either literal
// edge of the dock just outside the zone that would actually register
// their reboard, leaving them stuck right at the edge unable to leave.
const REBOARD_ZONE = { x0: DOCK_X0, x1: DOCK_X1, y0: CANVAS_HEIGHT - 14, y1: CANVAS_HEIGHT };

// Anchor is the point where each building's front (door) sits; the
// collision box is a simplified footprint under the sprite's walls, not
// its wider overhanging roof. The cluster is generated from the same
// per-village descriptors the river view uses (villages.js villageLayout),
// mapped into this scene's fixed pixel space, so the layout you walk
// around matches the one you saw from the water.
function buildingsFor(seed) {
  return villageLayout(seed).buildings.map((b) => {
    const big = b.variant === 0;
    // Keep every building at least 20px off the vertical centre line so the
    // dock lane out of the scene is never walled off.
    const dir = b.along >= 0 ? 1 : -1;
    const anchorX = Math.round(
      Math.max(52, Math.min(CANVAS_WIDTH - 52, CANVAS_WIDTH / 2 + dir * (20 + Math.abs(b.along) * 82))),
    );
    return {
      variant: b.variant,
      mirror: b.mirror,
      anchorX,
      anchorY: Math.round(82 + b.inland * 54), // 82..136
      footHalfW: big ? 12 : 9,
      footHeight: big ? 22 : 17,
    };
  });
}

// Québec City's own on-foot layout — hand-placed, not generated from
// villageLayout() like every other village, since a real 1790s colonial
// capital needs a lot more buildings than that small procedural cluster
// ever produces, in stone rather than log (see sprites.js). Two rows
// (kind: 'stone') plus one church (kind: 'church') set back between them,
// laid out to leave the dock lane (DOCK_X0..DOCK_X1) and the repair
// shop/trader's own spot clear, same as buildingsFor()'s cluster has to.
const QUEBEC_CITY_ONFOOT_BUILDINGS = [
  // back row
  { kind: 'stone', x: 34, y: 88, variant: 0, mirror: false },
  { kind: 'stone', x: 78, y: 92, variant: 1, mirror: true },
  { kind: 'stone', x: 122, y: 86, variant: 2, mirror: false },
  { kind: 'stone', x: 198, y: 90, variant: 0, mirror: true },
  { kind: 'stone', x: 242, y: 94, variant: 1, mirror: false },
  { kind: 'stone', x: 286, y: 88, variant: 2, mirror: true },
  // front row, closer to shore
  { kind: 'stone', x: 34, y: 150, variant: 1, mirror: false },
  { kind: 'stone', x: 78, y: 154, variant: 2, mirror: true },
  { kind: 'stone', x: 222, y: 150, variant: 0, mirror: false },
  { kind: 'stone', x: 266, y: 148, variant: 1, mirror: true },
  // the church, set back behind the dock — the tallest thing in the scene,
  // same "rises over the row in front of it" effect as the river view
  { kind: 'church', x: 160, y: 112, mirror: false },
];

function buildingsForQuebecCity() {
  return QUEBEC_CITY_ONFOOT_BUILDINGS.map((b) => ({
    kind: b.kind,
    variant: b.variant ?? 0,
    mirror: b.mirror,
    anchorX: b.x,
    anchorY: b.y,
    footHalfW: b.kind === 'church' ? 12 : 13,
    footHeight: b.kind === 'church' ? 26 : 24,
  }));
}

// Purely decorative — drawn behind the buildings/player, clear of the
// walkable area and the dock — so the clearing reads as cut out of the
// same forest seen from the river, not a bare field. Positions are fixed;
// only the per-tree species is seeded, for a little colour variety.
const TREE_SPOTS = [
  { x: 36, y: 16 }, { x: 118, y: 10 }, { x: 292, y: 14 },
  { x: 12, y: 64 }, { x: 10, y: 150 },
  { x: 308, y: 58 }, { x: 312, y: 158 },
  { x: 44, y: 156 }, { x: 40, y: 96 },
  { x: 262, y: 150 }, { x: 276, y: 92 },
  { x: 196, y: 96 },
];
function treesFor(seed) {
  return TREE_SPOTS.map((t, i) => ({
    ...t,
    variant: Math.floor(hashRange(seed, 700 + i, 0, 2.999)),
  }));
}

// The repair shop — always present, in the exact same spot regardless of
// seed, so it's a landmark you can count on finding beside the dock every
// time you step ashore (see the matching fixed placement in villages.js's
// river view). Kept clear of the dock lane and low/close to shore, in a
// different anchorY band than the procedural cluster above, so it never
// fights with a randomly-placed cabin for the same footprint.
const REPAIR_SHOP = {
  isRepairShop: true,
  mirror: false,
  anchorX: DOCK_X0 - 25,
  anchorY: WATER_TOP - 20,
  footHalfW: 12,
  footHeight: 22,
};

// The trader who runs the repair shop — standing just outside its door,
// clear of the shop's own footprint and the dock lane, so walking up to
// them is unambiguous. Fixed alongside REPAIR_SHOP for the same reason:
// always in the same spot, not part of the seeded layout. Not a solid
// obstacle (see isWalkable) — the trade triggers from proximity alone, so
// blocking movement would just make lining up with them more fiddly for
// no benefit.
const TRADER_POS = { x: REPAIR_SHOP.anchorX + 19, y: REPAIR_SHOP.anchorY + 5 };
const TRADER_TRIGGER_RADIUS = 16;

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

const cabinSprites = [0, 1, 2].map(createCabinSprite);
const stoneSprites = [0, 1, 2].map(createStoneBuildingSprite);
const churchSprite = createChurchSprite();
const repairShopSprite = createRepairShopSprite();
const traderSprite = createTraderSprite();
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

function overlapsBuilding(buildings, x, y) {
  for (const b of buildings) {
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
function isWalkable(buildings, x, y) {
  if (x < 10 || x > CANVAS_WIDTH - 10 || y < 10 || y > CANVAS_HEIGHT - 4) return false;
  if (y > WATER_TOP && (x < DOCK_X0 || x > DOCK_X1)) return false;
  return !overlapsBuilding(buildings, x, y);
}

export function createVillageScene() {
  let strideTimer = 0;
  let strideFrame = 0;
  let facingLeft = false;
  let buildings = [...buildingsFor(0), REPAIR_SHOP];
  let trees = treesFor(0);
  let wasNearTrader = false;
  const player = { x: PLAYER_START.x, y: PLAYER_START.y };

  return {
    enter(village) {
      const seed = village ? village.seed : 0;
      buildings = village && village.name === 'Québec City'
        ? [...buildingsForQuebecCity(), REPAIR_SHOP]
        : [...buildingsFor(seed), REPAIR_SHOP];
      trees = treesFor(seed);
      player.x = PLAYER_START.x;
      player.y = PLAYER_START.y;
      strideTimer = 0;
      strideFrame = 0;
      // Arriving right on top of the trigger radius (unlikely given
      // PLAYER_START is up by the dock, but not impossible on a small
      // screen) shouldn't count as "just walked up" — only an actual
      // approach during this visit should.
      wasNearTrader = false;
    },

    // Returns { reboard, tradeRequested }: reboard is true the moment the
    // player steps into the reboard zone; tradeRequested is true for one
    // frame, the moment the player comes within range of the trader (not
    // held true the whole time they stand there, so game.js can treat it
    // as a single trade action per approach rather than repeating it every
    // frame).
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
        if (isWalkable(buildings, nx, player.y)) player.x = nx;
        if (isWalkable(buildings, player.x, ny)) player.y = ny;

        strideTimer += dt;
        if (strideTimer > 0.28) {
          strideTimer = 0;
          strideFrame = 1 - strideFrame;
        }
      } else {
        strideTimer = 0;
      }

      const reboard = (
        player.x >= REBOARD_ZONE.x0 && player.x <= REBOARD_ZONE.x1 &&
        player.y >= REBOARD_ZONE.y0 && player.y <= REBOARD_ZONE.y1
      );

      const nearTrader = Math.hypot(player.x - TRADER_POS.x, player.y - TRADER_POS.y) < TRADER_TRIGGER_RADIUS;
      const tradeRequested = nearTrader && !wasNearTrader;
      wasNearTrader = nearTrader;

      return { reboard, tradeRequested };
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
      for (const t of trees) {
        const sprite = treeSprites[t.variant];
        ctx.drawImage(sprite, t.x - sprite.width / 2, t.y - sprite.height * 0.72);
      }

      // the canoe, parked at the water end of the dock
      ctx.drawImage(parkedCanoeSprite, CANVAS_WIDTH / 2 - parkedCanoeSprite.width / 2, CANVAS_HEIGHT - parkedCanoeSprite.height + 6);

      // buildings, painter's-algorithm by anchor Y
      const order = buildings
        .map((b) => {
          let sprite;
          if (b.isRepairShop) sprite = repairShopSprite;
          else if (b.kind === 'church') sprite = churchSprite;
          else if (b.kind === 'stone') sprite = stoneSprites[b.variant % stoneSprites.length];
          else sprite = cabinSprites[b.variant % cabinSprites.length];
          return { b, sprite };
        })
        .sort((a, c) => a.b.anchorY - c.b.anchorY);
      for (const { b, sprite } of order) {
        const top = b.anchorY - sprite.height + 6;
        if (b.mirror) {
          ctx.save();
          ctx.translate(b.anchorX, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, -sprite.width / 2, top);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, b.anchorX - sprite.width / 2, top);
        }
      }

      // the trader, standing outside the repair shop — drawn after the
      // building pass (TRADER_POS.y sits below every building's anchorY,
      // i.e. nearer the camera, so this is already correct painter's-order)
      ctx.drawImage(traderSprite, TRADER_POS.x - traderSprite.width / 2, TRADER_POS.y - traderSprite.height + 2);

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
