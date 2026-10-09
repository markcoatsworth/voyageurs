import { centerX, widthAt, braidAt, southIslandAt, MOUTH_DISTANCE } from './river/path.js';
import { dockSpanAt, VILLAGES } from './villages.js';
import { FEATURE_ISLAND_RANGE } from './river/islands.js';
import { createRockSprite, createLogSprite, createIslandSprite, createPeltSprite } from './sprites.js';
import { AHEAD_UNITS, BEHIND_UNITS, PIXELS_PER_UNIT, CANOE_HALF_LENGTH } from '../shared/config.js';

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

// Does this obstacle touch the canoe's hull?
//
// The hull is a CANOE_HALF_LENGTH line through the canoe, swung to its
// heading (game.js's `heading`). `hullZHalf` is how far that line still
// reaches up/downstream once turned, and `hullTan` is how far it slides
// sideways per unit of z — together they say which lateral lane the hull
// occupies at the obstacle's own row. The obstacle is the circle
// hitRadiusFor() has always described, so: is its centre within its radius
// of the hull's lane at that row?
//
// This replaced a point-vs-box test (|z| < 0.7 && |dx| < radius) when the
// canoe got a real heading, and pointed straight downstream the two are
// *identical* — cos(0) leaves the band at exactly CANOE_HALF_LENGTH and
// tan(0) puts the lane dead centre. That was the point: the heading is a new
// mechanic, not a difficulty change to the ordinary rock field.
//
// (The obvious implementation — closest point on the hull segment compared
// against the radius, i.e. a capsule — was written first and is wrong here.
// It dilates the hull by the radius in *every* direction, up/downstream
// included, so it collides out to CANOE_HALF_LENGTH + radius in z. For an
// island, whose 1.7 is a deliberately generous lateral gameplay number that
// doesn't match its 1.25-wide art, that meant getting clipped 2.4 units
// after clearing it. Checked against the old rule over a 6x6-unit grid at
// heading 0, the capsule hit on 22,676 extra cells for an island and 2,377
// for a rock; the lane test adds none.)
//
// Turned, the lane slants across the channel and the canoe genuinely
// presents a wider target: the widest |dx| that can still hit goes from the
// obstacle's own radius to radius + CANOE_HALF_LENGTH * sin(heading) — about
// 0.4 units of extra reach to either side at full lock (game.js's
// HEADING_MAX). Holding a hard turn through a rock field really does clip
// what a straight run would have threaded.
function hullHit(entry, canoeWorldX, hullZHalf, hullTan) {
  const dz = entry.z;
  if (dz <= -hullZHalf || dz >= hullZHalf) return false;
  // Where the hull crosses this obstacle's row. Negative dz is upstream,
  // which is where the bow is, so a starboard heading (+) puts the bow out
  // at +x up there — hence the sign.
  const gap = entry.x - canoeWorldX + dz * hullTan;
  const r = hitRadiusFor(entry.type);
  return gap > -r && gap < r;
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

// No hazards around the Island of Montreal. Casting off from Montréal's
// north pier put the canoe in a channel only ~7 units wide between the
// island and the bank, and a rock there was waiting within seconds —
// reported as "when I cast off from Montreal on the right shore ... I
// immediately take a whole bunch of damage ... remove the logs and rocks
// from this section of river so that I can get away from the city". From a
// little before the island's east tip to just past Île-Perrot (the island's
// west tip is ~12 units short of it, and the Chasse-galerie lifts off right
// around there), every rock, log and small island is spawned hidden and
// inert; pelts still come through at their usual rate, since they're
// pickups, not hazards. The channels themselves were widened at the same
// time (river/lawrenceWidth.js).
export const HAZARD_FREE_RANGE = [FEATURE_ISLAND_RANGE[0] - 20, FEATURE_ISLAND_RANGE[1] + 20];
function hazardFreeAt(d) {
  return d >= HAZARD_FREE_RANGE[0] && d <= HAZARD_FREE_RANGE[1];
}

// Lighter debris from Petit-Saguenay's dock down to the mouth at Tadoussac —
// the Loup-garou's stretch, the first boss fight in the game: "There is too
// much debris in the water for the Loup Garou fight ... I don't want it to
// be too difficult, reduce the amount of rocks and logs in the water between
// Petit-Saguenay and Tadoussac." Only LIGHT_HAZARD_KEEP of the rocks, logs
// and small islands that would spawn here are real; the rest are spawned
// hidden and inert the same way HAZARD_FREE_RANGE does it, so the spacing
// between pickups is untouched and pelts come through at their usual rate.
// Measured in the smoke test against the stretch just above Petit-Saguenay:
// 0.25 comes out at roughly a third as much debris as that stretch, not a
// quarter, because spawns get denser the further down the river you are
// (gapFor's GAP_SHRINK_PER_METER) — a first cut at 0.35 only halved it.
// The mid-river sandbars (braidAt, a fixed part of the river's shape) are
// not debris and aren't touched.
const PETIT_SAGUENAY_D = VILLAGES.find((v) => v.name === 'Petit-Saguenay').flowDistance;
export const LIGHT_HAZARD_RANGE = [PETIT_SAGUENAY_D, MOUTH_DISTANCE];
export const LIGHT_HAZARD_KEEP = 0.25;
// The share of would-be hazards actually spawned at d — exported for the
// smoke test.
export function hazardKeepFractionAt(d) {
  if (hazardFreeAt(d)) return 0;
  if (d >= LIGHT_HAZARD_RANGE[0] && d <= LIGHT_HAZARD_RANGE[1]) return LIGHT_HAZARD_KEEP;
  return 1;
}

function place(world, z) {
  const d = world.distance - z;
  const hasBraid = braidAt(d) !== null;
  let type = pickType(hasBraid);
  if (type !== PELT && Math.random() >= hazardKeepFractionAt(d)) {
    return { type, x: centerX(d), z, active: false, hidden: true, spinPhase: 0 };
  }
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
  return { type, x, z, active: true, hidden: false, spinPhase: Math.random() * Math.PI * 2 };
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
    entry.active = fresh.active;
    entry.hidden = fresh.hidden;
    entry.spinPhase = fresh.spinPhase;
  }

  return {
    pool,
    // `collidable` false (Chasse-galerie flight) still advances and recycles
    // every entry so the field keeps scrolling under the canoe, but nothing
    // is hit or picked up — the canoe is in the air, not on the water.
    update(time, dt, speed, canoeWorldX, onHit, onCollect, collidable = true, canoeHeading = 0) {
      // The canoe's hull, swung to whatever heading it's holding (see hullHit
      // below). Hoisted out of the pool loop — one cos/tan per frame, not one
      // per obstacle.
      const hullZHalf = CANOE_HALF_LENGTH * Math.cos(canoeHeading);
      const hullTan = Math.tan(canoeHeading);
      for (const entry of pool) {
        entry.z += speed * dt;

        if (collidable && entry.active && hullHit(entry, canoeWorldX, hullZHalf, hullTan)) {
          entry.active = false;
          if (entry.type === PELT) onCollect(entry);
          else onHit(entry);
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
        if (entry.hidden) continue; // see HAZARD_FREE_RANGE
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
