// The Château Gauntlet — the British Blockade, a scripted, one-time
// encounter on the wide Rideau Lake reaches: a Royal Navy frigate holding
// a lane in the channel, firing on the canoe as it closes the distance.
// Steering to dodge and close the distance is the whole fight — the hull
// itself is never destroyed, so finding and threading the gap is
// mandatory — but by the time this encounter comes up the player already
// has the pistol (guaranteed past Montréal, well before Gatineau/the
// Rideau), so it now shoots back: see the hull hit-test below. Landing
// hits on the hull suppresses its broadside, a real dogfight on top of the
// dodging, not a substitute for it.
//
// Used to chain straight into a second phase (a gunboat chase) the instant
// the gap was cleared — split out into its own standalone encounter,
// bossfights/britishWarship.js, triggered much further downstream. The two
// used to run back-to-back as one continuous fight with no breathing room
// between them; now there's a real stretch of ordinary paddling (Newboro,
// Jones Falls) between clearing this frigate and meeting the Warship.
//
// It used to sit just past Québec City; it was moved onto the Rideau (the
// British held the waterway — Kingston was their naval station), between
// Smiths Falls and Newboro. Briefly moved between Kars and Merrickville,
// then put back ("Put it back between Smiths Falls and Newboro where it
// was before"). Positioned relative to Kingston's own flowDistance rather
// than a fixed number, so it follows if that village's position (or the
// Rideau segment's shape offset) ever changes — one lookup at module load,
// not duplicated geography.
//
// A LINE of frigates now, not one: BLOCKADE_SHIPS, SHIP_COUNT of them
// SHIP_SPACING apart, each holding the channel with its gap at the
// opposite bank to the one before — "if you know there's a passageway on
// the right side, you can pretty much cruise right past it". One ship was
// a single decision made once; a line of them is a slalom under fire,
// and which bank the first gap is on is rolled each time the fight starts
// (then alternates), so it can't be memorised either. No early warning of
// where the next one is: a frigate (its rig and its flag) shows only once
// it's actually on screen. There used to be one — the next frigate's sails
// hanging from the top edge from SHIP_SPACING out, with a gold arrow to its
// gap — reported as "floating flags well before I reach the frigates ... I
// don't want any hints or clue about how far away the frigates are. The
// only flags I want to see are on the frigates when I can see them on the
// screen." Removed.
//
// "The River Styx" — a small fun detail, a nickname for this exact stretch
// kept here in the comments rather than shown to the player (game.js's
// banner just says "BRITISH BLOCKADE" — see its own big #boss-banner
// treatment). Nothing in the code keys off the name.
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, CANVAS_WIDTH, PIXELS_PER_UNIT, CANOE_SCREEN_Y } from '../shared/config.js';

// The line's positions live in world/river/blockadeLine.js (so path.js can
// keep sandbars off them); re-exported here, where everything else looks.
import {
  SHIP_FLOW_DISTANCE, SHIP_COUNT, SHIP_SPACING, FIRST_APPROACH, FIRST_SHIP_FLOW_DISTANCE,
  BLOCKADE_SHIPS, SHIP_CLEAR_BEFORE, SHIP_CLEAR_AFTER, inShipClearZone,
} from '../world/river/blockadeLine.js';
export {
  SHIP_FLOW_DISTANCE, SHIP_COUNT, SHIP_SPACING, FIRST_SHIP_FLOW_DISTANCE,
  BLOCKADE_SHIPS, SHIP_CLEAR_BEFORE, SHIP_CLEAR_AFTER, inShipClearZone,
};

// How far before the ship cannon fire starts, and how much room the player
// gets to relocate across the channel to find the gap. This looks huge for
// a ~40-unit-wide river, but the canoe's own steering physics (game.js's
// STEER_ACCEL/STEER_DAMPING) settle to a cruising lateral speed of only
// ~3.3 units/sec under full, continuous input — measured directly rather
// than assumed, after an early version of this fight (45 units) turned out
// to be mathematically impossible to win: even holding hard toward the gap
// the entire approach, at full paddling speed, there wasn't enough distance
// to cross the channel before reaching the ship. 190 gives roughly 10-12
// seconds at cruising speed to close a ~40-unit channel, with real margin
// left over for reacting to cannon fire along the way rather than needing
// to commit blind at frame one.
//
// Now the whole fight's span: FIRST_APPROACH before the first frigate plus
// the line itself, measured back from the LAST one (SHIP_FLOW_DISTANCE),
// so its users (game.js's rapids silence, the flag islands, the smoke
// test's dock checks) still cover all of it.
// Exported so game.js can silence the periodic rapids pattern (river/
// path.js's rapidsStrength) across this same "clear water" span — see that
// call site's own comment for why a fixed naval encounter fighting
// unrelated ambient whitewater turned out to be a real bug, not a
// difficulty feature.
export const APPROACH_RANGE = FIRST_APPROACH + (SHIP_COUNT - 1) * SHIP_SPACING;
// Each frigate's gap is fixed the moment the fight starts, never moved
// late — the same steering-speed math above makes a *fair* late swing
// impossible.
const GAP_WIDTH = 7; // world units of clear water always left open, at one bank
const SHIP_DEPTH_Z = 3.4; // hull's own extent along the flow axis
const CLEAR_MARGIN = 3; // how far past the ship counts as "in the clear"

// A first pass at this was cleared with barely a scratch — shots spawned
// close to the canoe's own position with a small spread, so a player who
// was already moving at all (even just ambient drift, not a real dodge)
// had usually cleared the zone by the time it went hot, and one shot at a
// time never demanded reading more than one danger zone. Reworked to fire
// real volleys that fan out across a genuine width of the channel — so
// there's more than one thing to track and a safe gap has to be found, not
// just "don't stand still" — escalating in count and spread as the ship
// gets closer, on top of firing faster.
//
// That version then turned out to overshoot the other way — reported as
// dying to cannon fire during the approach, before ever reaching the ship
// at all. Slower volleys and a later multi-shot escalation (see the shots
// calculation below) than that first pass, plus less damage per hit (see
// CANNON_DAMAGE in game.js) — still a real, escalating fight, just not one
// that can end the run before its actual climax.
// The guns step up each time a frigate is passed — VOLLEY_STAGES[n] is
// the fire while n frigates are behind you: shots a volley, and seconds
// between volleys. "I was hoping to make the frequency change each time we
// pass a frigate" — it used to ramp smoothly with distance through the
// whole fight (to 4 shots every 1.0s), with no step you could feel at a
// frigate. Tops out at 3 shots every 1.2s ("let's try 3 shots at 1.2s for
// now").
const VOLLEY_STAGES = [
  { shots: 1, every: 2.2 },
  { shots: 2, every: 1.6 },
  { shots: 3, every: 1.2 },
];
const VOLLEY_INTERVAL_FAR = VOLLEY_STAGES[0].every;
// A volley ripples: its shots go out RIPPLE_GAP apart, each aimed as it
// fires (see the volley site) — the second RIPPLE_FLANK further the way the
// canoe is moving, the third RIPPLE_FLANK the other way. 2.2 apart with a
// 1.3 hit radius leaves no water between neighbouring rings: the way out
// of a 3-shot ripple is a big move (~3.5+ sideways), a late reversal, or a
// change of pace.
const RIPPLE_GAP = 0.22;
const RIPPLE_FLANK = 2.2;
const VOLLEY_JITTER = 0.4;
// How much each gap between volleys varies, either way.
const VOLLEY_BEAT_JITTER = 0.2;
// Telegraph before it's dangerous. 0.65 when the fan of shots straddled
// the canoe; now every volley puts a shot right on it, and from a
// standstill the canoe swings its bow and gets only ~1.2 units sideways in
// 0.65s — inside the 1.3 hit radius, so a dead-on shot couldn't be
// sidestepped at all. 0.9 gets you ~1.8: out of the ring and into the safe
// water beside it.
const SPLASH_WARN_TIME = 0.9;
const SPLASH_HOT_TIME = 0.3; // the actual damaging window
const SPLASH_FADE_TIME = 0.15;
const SPLASH_HIT_RADIUS = 1.3;
// Wider than the lateral hit radius on purpose: the lead distance (see the
// spawn site) is a prediction, not a guarantee, so this absorbs a
// reasonable amount of speed change between a shot firing and going hot
// without either being trivially escapable by just tapping the brake or
// unfairly precise about exactly where the canoe will be.
const SPLASH_D_TOLERANCE = 2.2;

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 5;
const CROSS_CURRENT_RANGE = 40;
const CROSS_CURRENT_MAX = 4;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Where the clear lane sits at a given flowDistance, and where the hull
// fills the rest of the channel — always evaluated at the ship's own
// flowDistance (SHIP_FLOW_DISTANCE), not the canoe's, so the lane doesn't
// drift as the player approaches.
function gapBounds(gapSide, shipD = SHIP_FLOW_DISTANCE) {
  const half = widthAt(shipD) / 2;
  const c = centerX(shipD);
  const leftBank = c - half;
  const rightBank = c + half;
  if (gapSide > 0) {
    return { gapLo: rightBank - GAP_WIDTH, gapHi: rightBank, hullLo: leftBank, hullHi: rightBank - GAP_WIDTH };
  }
  return { gapLo: leftBank, gapHi: leftBank + GAP_WIDTH, hullLo: leftBank + GAP_WIDTH, hullHi: rightBank };
}

// Dogfight: pistol hits on the hull suppress the broadside. Only reachable
// once close enough that a bullet's own BULLET_LIFETIME (weapons.js, 2s at
// 35 u/s = 70 units) can actually cross the remaining distance to the ship —
// so this only comes alive in roughly the final third of the approach, real
// close-quarters gunnery rather than pop-shots from first sighting.
const SHIP_HULL_HP = 120;
// Split by weapon — reported as "can't see much difference in damage"
// between the pistol and the musket (weapons.js's own fire-rate split,
// same report). 15 solid pistol hits silences the guns; the musket, fired
// roughly a third as often for roughly 2.25x the damage, gets there in
// fewer, heavier hits instead.
export const PISTOL_DAMAGE_TO_HULL = 8;
export const MUSKET_DAMAGE_TO_HULL = 18;
// Extra world-units of slack on top of the hull's own depth (SHIP_DEPTH_Z)
// so a bullet advancing in discrete dt-sized steps can't tunnel through the
// band between two frames without ever landing inside it.
const HULL_HIT_D_TOLERANCE = 1.5;
// Your shots only tell on a frigate while the canoe is within this far of
// it. A bullet carries ~70 units (weapons.js: 35 u/s for 2s), so a held
// trigger used to silence a frigate long before you were anywhere near it
// — "I can just unload a volley of gunfire from far away and disable it
// long before I get anywhere close to it". 25: a little before it comes
// on screen (~10 ahead), not from the far end of the reach.
const HULL_GUN_RANGE = 25;
const SPARK_LIFETIME = 0.35;

// Which bank frigate i leaves open: alternating, from the first ship's.
function gapSideOf(firstGapSide, i) {
  return i % 2 === 0 ? firstGapSide : -firstGapSide;
}

export function createBlockade() {
  // null until the encounter first activates — rolled once, right then,
  // and the rest of the line alternates from it; never changed after.
  let firstGapSide = null;
  // Test-only: pin the next roll (smoke test bots need a known layout).
  let forcedFirstGapSide = null;
  let resolved = false;
  let volleyTimer = VOLLEY_INTERVAL_FAR;
  let hazards = [];
  let justCleared = false;
  let justSpotted = false;
  // Frigates behind the canoe so far (0..SHIP_COUNT), and a one-shot for
  // game.js's "one down" banner.
  let passed = 0;
  let justPassed = false;
  // Rippling volleys' queued shots ({wait, off}), and the canoe's measured
  // sideways velocity the shots lead.
  let ripple = [];
  let lastX = null;
  let aimVX = 0;

  // Dogfight: hull HP the pistol chips away at, per frigate, and the
  // resulting hit sparks (drawn, not gameplay-relevant beyond feedback).
  let hullHP = BLOCKADE_SHIPS.map(() => SHIP_HULL_HP);
  let silenced = BLOCKADE_SHIPS.map(() => false);
  let justGunsSilenced = false;
  let sparks = [];

  function reset() {
    firstGapSide = null;
    resolved = false;
    volleyTimer = VOLLEY_INTERVAL_FAR;
    hazards = [];
    justCleared = false;
    justSpotted = false;
    passed = 0;
    justPassed = false;
    ripple = [];
    lastX = null;
    aimVX = 0;
    hullHP = BLOCKADE_SHIPS.map(() => SHIP_HULL_HP);
    silenced = BLOCKADE_SHIPS.map(() => false);
    justGunsSilenced = false;
    sparks = [];
  }

  // The frigate nearest a flowDistance — the one whose hull a canoe there
  // could be touching.
  function nearestShip(d) {
    let best = 0;
    for (let i = 1; i < BLOCKADE_SHIPS.length; i++) {
      if (Math.abs(BLOCKADE_SHIPS[i] - d) < Math.abs(BLOCKADE_SHIPS[best] - d)) best = i;
    }
    return best;
  }

  return {
    reset,
    // A real physical wall, checked by game.js *before* it commits to
    // advancing flowDistance — see that call site's own comment. True
    // whenever (d, worldX) lands inside a frigate's own depth range but
    // outside its gap; always false before the fight's started (no gaps
    // decided yet, so there's nothing to collide with).
    isHullBlocking(flowDistance, worldX) {
      if (firstGapSide === null) return false;
      const i = nearestShip(flowDistance);
      const shipD = BLOCKADE_SHIPS[i];
      const half = SHIP_DEPTH_Z / 2;
      if (flowDistance < shipD - half || flowDistance > shipD + half) return false;
      const { gapLo, gapHi } = gapBounds(gapSideOf(firstGapSide, i), shipD);
      return worldX < gapLo || worldX > gapHi;
    },
    // The flowDistance of the frigate nearest d — game.js's "retreating
    // from the hull" check measures against this one, not a fixed ship.
    nearestShipD(d) {
      return BLOCKADE_SHIPS[nearestShip(d)];
    },
    // True only during the live approach — spotted, not yet cleared. A
    // non-consuming, repeatable status check (unlike consumeJustSpotted()/
    // consumeJustCleared() below, already drained every frame by game.js's
    // own update() for its banner logic, so a second reader like the smoke
    // test can't also use them without racing that internal consumption)
    // for anything that needs to know "is the gauntlet currently live."
    isApproachEngaged() {
      return firstGapSide !== null && !resolved;
    },
    // Test-only: the gap side of each frigate (null before the fight), and
    // a way to fix the roll. Never read by game.js — see below.
    debugGapSides() {
      return firstGapSide === null ? null : BLOCKADE_SHIPS.map((_, i) => gapSideOf(firstGapSide, i));
    },
    debugForceFirstGapSide(side) {
      forcedFirstGapSide = side;
    },
    // Test-only: the cannon shots in the air ({d, x, t}), for the smoke
    // test's pilot to sidestep the warning rings the way a player does.
    debugHazards() {
      return hazards;
    },
    // Test-only: which VOLLEY_STAGES entry is firing (frigates passed).
    debugStage() { return Math.min(passed, VOLLEY_STAGES.length - 1); },
    // Consumed once by game.js so each event fires exactly one banner, not
    // one every frame the condition happens to still be true.
    consumeJustSpotted() {
      const v = justSpotted;
      justSpotted = false;
      return v;
    },
    consumeJustCleared() {
      const v = justCleared;
      justCleared = false;
      return v;
    },
    consumeJustGunsSilenced() {
      const v = justGunsSilenced;
      justGunsSilenced = false;
      return v;
    },
    // How many frigates are still ahead, the frame one is passed (not the
    // last — that's consumeJustCleared()); null otherwise.
    consumeJustPassedShip() {
      if (!justPassed) return null;
      justPassed = false;
      return SHIP_COUNT - passed;
    },
    // No gapSide() accessor for game.js on purpose — which side is clear
    // is never put in a banner or signalled ahead of time.

    // onHit(entry) is only ever called with { type: 'cannon' } or
    // { type: 'shiphull' } — game.js's handleHit() gives each its own
    // damage amount. effectiveSpeed is needed to lead each shot's target
    // ahead of the canoe's current position (see the spawn site's own
    // comment) — without it, every shot whiffs by construction, not
    // because it was dodged. `bullets` is the player's live pistol shots
    // (weapons.js's getBullets(), world-space {worldX, flowDistance}) —
    // checked against the hulls below. Returns hitBullets: [ref] (shots
    // that struck a hull this frame) alongside the usual fields, same
    // contract as bossfights/diable.js's update(), for game.js to remove
    // from the weapon pool.
    update(dt, playerFlowDistance, playerWorldX, effectiveSpeed, onHit, bullets = []) {
      const hitBullets = [];
      const distToShip = SHIP_FLOW_DISTANCE - playerFlowDistance;

      // If the player starts well past the whole approach (e.g. a ?start=
      // cheat further downstream), auto-resolve it as if they'd already
      // cleared it — stops the hull-blocking wall activating from a
      // downstream spawn.
      const wellPastBlockade = playerFlowDistance > SHIP_FLOW_DISTANCE + CLEAR_MARGIN + 50;
      if (wellPastBlockade && !resolved) {
        resolved = true;
        // Silent cleanup — no "cleared!" banner for a fight that never
        // happened (you started downstream of it).
        console.log('[BLOCKADE] Auto-resolved (started past blockade)');
      }

      // Once resolved, stays false forever (only reset() brings it back) —
      // no separate lower bound needed the way an early version had one.
      const engaged = !resolved && distToShip < APPROACH_RANGE + 5;

      if (engaged) {
        if (firstGapSide === null) {
          firstGapSide = forcedFirstGapSide ?? (Math.random() < 0.5 ? -1 : 1);
          // A ?start= dropped part-way down the line counts the frigates
          // already behind it as passed, quietly.
          while (passed < SHIP_COUNT - 1 && playerFlowDistance > BLOCKADE_SHIPS[passed] + CLEAR_MARGIN) passed++;
          justSpotted = true;
        }
        // No hull check here any more — isHullBlocking() (checked by
        // game.js before it even commits to advancing flowDistance) is
        // what actually stops the canoe outside the gap now, so the canoe
        // can only ever get past a frigate by genuinely threading its gap.
        if (passed < SHIP_COUNT - 1 && playerFlowDistance >= BLOCKADE_SHIPS[passed] + CLEAR_MARGIN) {
          passed++;
          justPassed = true;
          // The new, faster pace starts now, not after the old, slower
          // count-down has run out.
          volleyTimer = Math.min(volleyTimer, VOLLEY_STAGES[Math.min(passed, VOLLEY_STAGES.length - 1)].every);
          // The last frigate's shots stay live — they're already in the
          // air. Only clearing the whole line wipes them.
        }
        if (distToShip <= -CLEAR_MARGIN) {
          passed = SHIP_COUNT;
          resolved = true;
          justCleared = true;
          // Clear ALL cannonballs - no cannon fire once past the frigate
          hazards = [];
          console.log('[BLOCKADE] Cleared. Player:', playerFlowDistance);
        }

        // Dogfight: pistol shots that land on a hull (not through its gap
        // — that's open water, nothing to hit) chip away at that frigate's
        // hullHP. Firing into the hull means *not* sitting in the safe
        // lane, so suppressing the guns is a real trade against staying
        // dodged — not a free action on top of threading the gap.
        const half = SHIP_DEPTH_Z / 2 + HULL_HIT_D_TOLERANCE;
        for (let i = 0; i < SHIP_COUNT; i++) {
          if (silenced[i]) continue;
          const shipD = BLOCKADE_SHIPS[i];
          // Out of range — shots fly past/over without telling (HULL_GUN_RANGE).
          if (shipD - playerFlowDistance > HULL_GUN_RANGE) continue;
          const { hullLo, hullHi } = gapBounds(gapSideOf(firstGapSide, i), shipD);
          for (const b of bullets) {
            if (hitBullets.includes(b)) continue;
            if (Math.abs(b.flowDistance - shipD) < half && b.worldX > hullLo && b.worldX < hullHi) {
              hitBullets.push(b);
              hullHP[i] -= b.type === 'musket' ? MUSKET_DAMAGE_TO_HULL : PISTOL_DAMAGE_TO_HULL;
              sparks.push({ x: b.worldX, d: shipD, t: 0 });
              if (hullHP[i] <= 0) {
                hullHP[i] = 0;
                silenced[i] = true;
                justGunsSilenced = true;
              }
            }
          }
        }

        // The guns firing are the next frigate's: silence it and there's
        // quiet until you're past it, then the one after opens up.
        const firing = passed < SHIP_COUNT && !silenced[passed];
        // The canoe's own sideways velocity, smoothed — what the shots lead.
        // It used to aim each volley at where the canoe was when it fired,
        // so anything already moving sideways (crossing to the next gap,
        // most of this fight) left it behind for free.
        if (lastX !== null && dt > 0) {
          aimVX += ((playerWorldX - lastX) / dt - aimVX) * Math.min(1, dt / 0.15);
        }
        lastX = playerWorldX;
        // Queued shots of a rippling volley, each aimed the moment it fires:
        // where the canoe will be when it lands (forward by its speed,
        // sideways by aimVX), plus its flank offset.
        for (const r of ripple) r.wait -= dt;
        for (const r of ripple.filter((q) => q.wait <= 0)) {
          if (distToShip <= 0 || !firing) continue;
          const c = centerX(playerFlowDistance);
          const reach = widthAt(playerFlowDistance) / 2 - 0.5;
          hazards.push({
            d: playerFlowDistance + effectiveSpeed * SPLASH_WARN_TIME,
            x: clamp(playerWorldX + aimVX * SPLASH_WARN_TIME + r.off + (Math.random() * 2 - 1) * VOLLEY_JITTER, c - reach, c + reach),
            t: 0,
            hit: false,
            boomed: false,
          });
        }
        ripple = ripple.filter((q) => q.wait > 0);
        if (distToShip > 0 && firing) {
          // Steps up each time a frigate is passed (VOLLEY_STAGES), never
          // back down — `passed` only ever counts up.
          const stage = VOLLEY_STAGES[Math.min(passed, VOLLEY_STAGES.length - 1)];
          volleyTimer -= dt;
          if (volleyTimer <= 0) {
            // A ripple, not a single slam: the volley's shots go out
            // RIPPLE_GAP apart (queued in `ripple`, fired below), each aimed
            // as it fires. First where you're heading; then, if there's a
            // second, where you'd be carrying on that way; a third, where
            // you'd be if you reversed. One sidestep per volley no longer
            // clears it — "it's still too easy to dodge the cannon fire".
            const side = Math.abs(aimVX) > 0.5 ? Math.sign(aimVX) : (Math.random() < 0.5 ? -1 : 1);
            for (let i = 0; i < stage.shots; i++) {
              ripple.push({ wait: i * RIPPLE_GAP, off: i === 0 ? 0 : (i === 1 ? side : -side) * RIPPLE_FLANK });
            }
            // Off the beat: each gap between volleys varies, so there's no
            // rhythm to dodge to.
            volleyTimer = stage.every * (1 + (Math.random() * 2 - 1) * VOLLEY_BEAT_JITTER);
          }
        }
      }

      // Ticks and expires every hazard unconditionally, regardless of
      // `engaged` — a shot fired right before crossing (or right before
      // resolving) must still finish its own lifecycle and get cleaned up,
      // not freeze mid-telegraph forever the moment the fight itself ends.
      // boomCount is every hazard *newly* turning hot this frame — every
      // impact gets its sound, hit or miss, not just the ones that actually
      // land on the canoe (a real broadside sounds like cannon fire whether
      // or not any particular shot connects).
      let boomCount = 0;
      for (const h of hazards) {
        h.t += dt;
        const hot = h.t >= SPLASH_WARN_TIME && h.t < SPLASH_WARN_TIME + SPLASH_HOT_TIME;
        if (hot && !h.boomed) {
          h.boomed = true;
          boomCount++;
        }
        if (hot && !h.hit) {
          if (Math.abs(playerFlowDistance - h.d) < SPLASH_D_TOLERANCE && Math.abs(playerWorldX - h.x) < SPLASH_HIT_RADIUS) {
            h.hit = true;
            onHit({ type: 'cannon' });
          }
        }
      }
      hazards = hazards.filter((h) => h.t < SPLASH_WARN_TIME + SPLASH_HOT_TIME + SPLASH_FADE_TIME);

      // Hit sparks: pure visual feedback for a landed shot, ticked the same
      // unconditional way as hazards above.
      for (const s of sparks) s.t += dt;
      sparks = sparks.filter((s) => s.t < SPARK_LIFETIME);

      if (!engaged) return { active: false, boomCount, crossCurrent: 0, hitBullets };
      // Cross-current pushes you away from the NEXT frigate's gap, over the
      // last CROSS_CURRENT_RANGE before it. It used to run across the whole
      // approach at up to 5.5; with a line of ships that would fight every
      // crossing from one gap to the next the whole way, which on touch
      // (half the steering) left almost nothing to cross with. Now it's a
      // last-stretch shove you hold your line against once you're lined up.
      let crossCurrent = 0;
      if (passed < SHIP_COUNT) {
        const toNext = BLOCKADE_SHIPS[passed] - playerFlowDistance;
        if (toNext > 0 && toNext < CROSS_CURRENT_RANGE) {
          crossCurrent = -gapSideOf(firstGapSide, passed) * (1 - toNext / CROSS_CURRENT_RANGE) * CROSS_CURRENT_MAX;
        }
      }
      return { active: true, boomCount, crossCurrent, hitBullets };
    },

    // Rendering doesn't care whether the encounter is currently "active" by
    // update()'s gating — it just draws whatever's within visible range,
    // same as villages.js's own drawVillages(). Ships stay drawn (and
    // recede naturally behind the canoe via the usual z depth-sort) well
    // after they've been passed.
    draw(ctx, worldDistance, cameraWorldX, time) {
      const distToShip = SHIP_FLOW_DISTANCE - worldDistance;
      const live = firstGapSide !== null && distToShip > 0 && distToShip < APPROACH_RANGE;

      // Cross-current flow visualization: animated streaks, while it pushes.
      if (live && passed < SHIP_COUNT) {
        const toNext = BLOCKADE_SHIPS[passed] - worldDistance;
        if (toNext > 0 && toNext < CROSS_CURRENT_RANGE) {
          drawCurrentFlow(ctx, time, gapSideOf(firstGapSide, passed), 1 - toNext / CROSS_CURRENT_RANGE);
        }
      }

      // firstGapSide is null until the encounter first activates (update()'s
      // own gating, at APPROACH_RANGE+5) — practically always well before a
      // ship comes within visible render range anyway, but this guards the
      // rare case (e.g. a ?start= cheat dropped right on top of one) where
      // it wouldn't be.
      if (firstGapSide !== null) {
        for (let i = 0; i < SHIP_COUNT; i++) {
          const z0 = worldDistance - BLOCKADE_SHIPS[i];
          if (Math.abs(z0) < VISIBLE_Z_RANGE) drawShip(ctx, cameraWorldX, z0, gapSideOf(firstGapSide, i), BLOCKADE_SHIPS[i]);
        }
      }

      // Fog of war: thicker when farther from the line, reveals as you approach
      if (live) drawFog(ctx, distToShip);

      // Hazards (cannon shots)
      for (const h of hazards) {
        const z = worldDistance - h.d;
        if (Math.abs(z) < VISIBLE_Z_RANGE) drawHazard(ctx, h, z, cameraWorldX);
      }

      // Hull hit sparks - a landed pistol shot
      for (const s of sparks) {
        const z = worldDistance - s.d;
        if (Math.abs(z) < VISIBLE_Z_RANGE) drawSpark(ctx, s, z, cameraWorldX);
      }
    },
  };
}

function drawShip(ctx, cameraWorldX, z0, gapSide, shipD) {
  const { hullLo, hullHi } = gapBounds(gapSide, shipD);
  const top = worldToScreen(hullLo, z0 - SHIP_DEPTH_Z / 2, cameraWorldX);
  const bot = worldToScreen(hullHi, z0 + SHIP_DEPTH_Z / 2, cameraWorldX);
  const left = Math.min(top.x, bot.x);
  const right = Math.max(top.x, bot.x);
  const y0 = Math.min(top.y, bot.y);
  const y1 = Math.max(top.y, bot.y);
  const midY = (y0 + y1) / 2;
  const hullH = y1 - y0;

  // Hull: dark outline, then the actual planked hull colour, waterline
  // stripe along the bottom.
  ctx.fillStyle = '#1c140c';
  ctx.fillRect(left - 1, y0 - 1, right - left + 2, hullH + 2);
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(left, y0, right - left, hullH);
  ctx.fillStyle = '#2c1f14';
  ctx.fillRect(left, y1 - hullH * 0.28, right - left, hullH * 0.28);

  // Gunports: evenly spaced dark squares along the hull, the one detail
  // that reads "warship" rather than "cargo barge" at this size.
  const portY = midY - hullH * 0.05;
  const portSize = Math.max(3, hullH * 0.22);
  const portSpacing = 15;
  const portCount = Math.max(1, Math.floor((right - left - portSpacing) / portSpacing));
  const portsWidth = portCount * portSpacing;
  const portStart = left + (right - left - portsWidth) / 2 + portSpacing / 2;
  ctx.fillStyle = '#0c0805';
  for (let i = 0; i < portCount; i++) {
    ctx.fillRect(portStart + i * portSpacing - portSize / 2, portY - portSize / 2, portSize, portSize);
  }

  // Masts + furled sails, plus a small red ensign at the stern (the end
  // away from the gap, so it reads as "the far end" regardless of which
  // side the lane is currently on).
  drawRig(ctx, left, right, y0, hullH);
  const sternX = gapSide > 0 ? left + 6 : right - 6;
  const flagX = sternX - 4;
  const flagY = y0 - hullH * 1.9;

  // Union Jack: blue field
  ctx.fillStyle = '#012169';
  ctx.fillRect(flagX, flagY, 8, 5);

  // White diagonal crosses (saltire)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(flagX, flagY);
  ctx.lineTo(flagX + 8, flagY + 5);
  ctx.moveTo(flagX + 8, flagY);
  ctx.lineTo(flagX, flagY + 5);
  ctx.stroke();

  // Red diagonal crosses (St. Patrick's saltire)
  ctx.strokeStyle = '#C8102E';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(flagX, flagY);
  ctx.lineTo(flagX + 8, flagY + 5);
  ctx.moveTo(flagX + 8, flagY);
  ctx.lineTo(flagX, flagY + 5);
  ctx.stroke();

  // White cross (St. George's cross background)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(flagX + 3, flagY, 2, 5); // vertical
  ctx.fillRect(flagX, flagY + 2, 8, 1); // horizontal

  // Red cross (St. George's cross)
  ctx.fillStyle = '#C8102E';
  ctx.fillRect(flagX + 3.5, flagY, 1, 5); // vertical
  ctx.fillRect(flagX, flagY + 2, 8, 1); // horizontal
}

// The masts and furled sails over a hull spanning left..right with its
// deck at y0 (drawShip's).
function drawRig(ctx, left, right, y0, hullH) {
  const mastXs = [left + (right - left) * 0.32, left + (right - left) * 0.62];
  for (const mx of mastXs) {
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, y0);
    ctx.lineTo(mx, y0 - hullH * 1.6);
    ctx.stroke();
    ctx.fillStyle = '#cfc6ae';
    ctx.fillRect(mx - hullH * 0.55, y0 - hullH * 1.25, hullH * 1.1, hullH * 0.5);
    ctx.fillStyle = '#a89f86';
    ctx.fillRect(mx - hullH * 0.55, y0 - hullH * 0.85, hullH * 1.1, hullH * 0.12);
  }
}

// A landed pistol shot on the hull: a quick bright burst that fades over
// SPARK_LIFETIME, no lingering mark — reads as gunfire striking wood, not a
// persistent hole (there's no scarring the hull sprite for real).
function drawSpark(ctx, s, z, cameraWorldX) {
  const p = worldToScreen(s.x, z, cameraWorldX);
  const k = clamp(1 - s.t / SPARK_LIFETIME, 0, 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = '#fff4c2';
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2 + (1 - k) * 3, 0, Math.PI * 2);
  ctx.fill();
  const spokes = 4;
  ctx.strokeStyle = `rgba(255, 200, 110, ${k * 0.8})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI * 2 + s.t * 6;
    const len = 3 + (1 - k) * 6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHazard(ctx, h, z, cameraWorldX) {
  const p = worldToScreen(h.x, z, cameraWorldX);
  const warnProgress = clamp(h.t / SPLASH_WARN_TIME, 0, 1);
  const hot = h.t >= SPLASH_WARN_TIME && h.t < SPLASH_WARN_TIME + SPLASH_HOT_TIME;
  const fading = h.t >= SPLASH_WARN_TIME + SPLASH_HOT_TIME;

  if (hot) {
    // The impact itself: a bright, opaque foam burst — this is the frame
    // that actually reads as "dangerous right now."
    ctx.fillStyle = 'rgba(235, 245, 250, 0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, SPLASH_HIT_RADIUS * PIXELS_PER_UNIT * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 150, 160, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, SPLASH_HIT_RADIUS * PIXELS_PER_UNIT, 0, Math.PI * 2);
    ctx.stroke();
  } else if (fading) {
    const fadeT = clamp((h.t - SPLASH_WARN_TIME - SPLASH_HOT_TIME) / SPLASH_FADE_TIME, 0, 1);
    ctx.strokeStyle = `rgba(220, 235, 240, ${0.6 * (1 - fadeT)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, SPLASH_HIT_RADIUS * PIXELS_PER_UNIT * (1 + fadeT * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Warning telegraph. This used to be a ring that grew from 30% up to
    // the real hit radius, which is exactly backwards for "helping the
    // player avoid it": it understated the true danger area for most of
    // the warning window and only showed its actual size right at the end
    // — reported as shots feeling random/patternless, which tracks, since
    // the one honest piece of information (how big is this really going to
    // be) was being hidden until it was almost too late to use it. Now the
    // true hit-radius outline is drawn at full size from the very first
    // frame — "will I be in that circle" is answerable immediately — while
    // a shrinking shadow (the standard "something's about to land here"
    // game-visual language) contracts down onto it as a countdown, and a
    // center mark pulses faster as impact nears for a clear last-second cue.
    const hitPx = SPLASH_HIT_RADIUS * PIXELS_PER_UNIT;

    const shadowR = hitPx * (2.6 - warnProgress * 1.6); // 2.6x down to 1x
    ctx.fillStyle = `rgba(10, 12, 10, ${0.16 + warnProgress * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, shadowR, shadowR * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(230, 70, 60, ${0.4 + warnProgress * 0.5})`;
    ctx.lineWidth = 1.5 + warnProgress * 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, hitPx, 0, Math.PI * 2);
    ctx.stroke();

    const pulseHz = 5 + warnProgress * 10; // pulses faster as impact nears
    const pulse = 0.5 + 0.5 * Math.sin(h.t * pulseHz * Math.PI * 2);
    ctx.fillStyle = `rgba(255, 210, 90, ${0.5 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // The actual moving threat — a cannonball visibly falling toward the
    // target, meeting it exactly at impact. The ring/shadow/pulse above
    // mark *where*; this is the *something's coming*, which a purely
    // static telegraph never conveyed.
    const fallPx = 60 * (1 - warnProgress);
    const ballY = p.y - fallPx;
    const ballR = 2 + warnProgress * 2;
    ctx.fillStyle = 'rgba(28, 24, 18, 0.9)';
    ctx.beginPath();
    ctx.arc(p.x, ballY, ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(95, 85, 68, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x - ballR * 0.3, ballY - ballR * 0.3, ballR * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCurrentFlow(ctx, time, gapSide, progress) {
  // Animated water flow streaks showing the cross-current pushing away from gap
  // Flow direction: negative gapSide (if gap is on right, current pushes left)
  const flowDirection = -gapSide;
  const flowSpeed = progress * 80; // pixels per second, stronger as you get closer

  // Number of streaks increases with progress
  const streakCount = Math.floor(8 + progress * 12);
  const streakSpacing = CANVAS_HEIGHT / streakCount;

  ctx.save();
  ctx.globalAlpha = 0.3 + progress * 0.3; // more visible as current gets stronger

  for (let i = 0; i < streakCount; i++) {
    const y = i * streakSpacing + ((time * 20) % streakSpacing);
    // Animate streaks moving sideways based on flow direction
    const offset = (time * flowSpeed) % CANVAS_WIDTH;
    const x = flowDirection > 0 ? offset : CANVAS_WIDTH - offset;

    // Draw diagonal streak (foam/current line)
    ctx.strokeStyle = 'rgba(200, 220, 235, 0.6)';
    ctx.lineWidth = 1 + progress * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - flowDirection * 25, y + 8);
    ctx.stroke();

    // Add some variation with shorter streaks
    if (i % 2 === 0) {
      const x2 = flowDirection > 0 ? offset + CANVAS_WIDTH * 0.3 : CANVAS_WIDTH - offset - CANVAS_WIDTH * 0.3;
      ctx.strokeStyle = 'rgba(180, 200, 215, 0.4)';
      ctx.lineWidth = 0.8 + progress;
      ctx.beginPath();
      ctx.moveTo(x2, y + 4);
      ctx.lineTo(x2 - flowDirection * 15, y + 10);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawFog(ctx, distToShip) {
  // Fog opacity: thick when far (0.75), clears as you approach (0.0)
  const progress = 1 - clamp(distToShip / APPROACH_RANGE, 0, 1);
  const maxOpacity = 0.75;
  const opacity = maxOpacity * (1 - progress * progress); // quadratic falloff feels more natural

  if (opacity < 0.05) return; // skip if basically invisible

  // Full-screen fog overlay with vertical gradient (thicker at top/bottom).
  // Tinted a shade sickly-green rather than plain grey — "the River Styx"
  // is only ever a name in a banner, so this is the one actual pixel of it.
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, `rgba(88, 102, 92, ${opacity * 0.9})`);
  gradient.addColorStop(0.3, `rgba(78, 92, 82, ${opacity * 0.7})`);
  gradient.addColorStop(0.7, `rgba(78, 92, 82, ${opacity * 0.7})`);
  gradient.addColorStop(1, `rgba(88, 102, 92, ${opacity * 0.9})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
