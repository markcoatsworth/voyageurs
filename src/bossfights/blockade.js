// The Château Gauntlet — a scripted, one-time encounter shortly after
// leaving Québec City: a Royal Navy frigate holding a lane in the channel,
// firing on the canoe as it closes the distance. No new controls at all —
// the whole fight is dodging (steering) and closing the distance (the same
// up/down speed control the whole river already uses). There's no way to
// attack it: this is deliberately the bottom of a "weapons unlock further
// upriver" arc (see the design discussion this came out of), so winning
// means surviving and getting past, not defeating the ship.
//
// Positioned relative to Québec City's own flowDistance rather than a fixed
// number, so it automatically follows if that village's position (or the
// segment's shape offset) ever changes again — one lookup at module load,
// not duplicated geography.
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, CANVAS_WIDTH, PIXELS_PER_UNIT } from '../shared/config.js';
import { VILLAGES } from '../world/villages.js';

const QUEBEC_CITY = VILLAGES.find((v) => v.name === 'Québec City');
// How far past the capital the frigate sits — far enough that casting off
// doesn't drop the player straight into cannon fire, close enough that it's
// clearly part of leaving Québec City, not a random later encounter. Needs
// to clear APPROACH_RANGE below plus real room to spare — see that
// constant's own comment for why it's much bigger than it looks like it
// should be.
const SHIP_D_OFFSET = 230;
export const SHIP_FLOW_DISTANCE = QUEBEC_CITY.flowDistance + SHIP_D_OFFSET;

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
const APPROACH_RANGE = 190;
// A single commitment, decided (and telegraphed) the moment the ship is
// first spotted, not a late swing partway through — the same steering-speed
// math above makes a *fair* late swing impossible: reacting to a switch
// close to the ship would need crossing the whole channel in whatever
// distance is left, which is an even harder version of the exact unfair
// scenario 190 was chosen to avoid. One early, readable choice instead.
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
const VOLLEY_INTERVAL_FAR = 2.3;
const VOLLEY_INTERVAL_NEAR = 0.75;
const SPLASH_WARN_TIME = 0.65; // telegraph before it's dangerous
const SPLASH_HOT_TIME = 0.3; // the actual damaging window
const SPLASH_FADE_TIME = 0.15;
const SPLASH_HIT_RADIUS = 1.3;
// Wider than the lateral hit radius on purpose: the lead distance (see the
// spawn site) is a prediction, not a guarantee, so this absorbs a
// reasonable amount of speed change between a shot firing and going hot
// without either being trivially escapable by just tapping the brake or
// unfairly precise about exactly where the canoe will be.
const SPLASH_D_TOLERANCE = 2.2;
const SPLASH_SPREAD_MIN = 3; // how wide a volley fans out early in the approach
const SPLASH_SPREAD_MAX = 9; // and how wide it fans out right before the ship

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Where the clear lane sits at a given flowDistance, and where the hull
// fills the rest of the channel — always evaluated at the ship's own
// flowDistance (SHIP_FLOW_DISTANCE), not the canoe's, so the lane doesn't
// drift as the player approaches.
function gapBounds(gapSide) {
  const half = widthAt(SHIP_FLOW_DISTANCE) / 2;
  const c = centerX(SHIP_FLOW_DISTANCE);
  const leftBank = c - half;
  const rightBank = c + half;
  if (gapSide > 0) {
    return { gapLo: rightBank - GAP_WIDTH, gapHi: rightBank, hullLo: leftBank, hullHi: rightBank - GAP_WIDTH };
  }
  return { gapLo: leftBank, gapHi: leftBank + GAP_WIDTH, hullLo: leftBank + GAP_WIDTH, hullHi: rightBank };
}

export function createBlockade() {
  // null until the encounter first activates — decided once, right then
  // (see the module comment on why a late swing isn't fair here), not
  // re-rolled or changed for the rest of the fight.
  let gapSide = null;
  let resolved = false;
  let volleyTimer = VOLLEY_INTERVAL_FAR;
  let hazards = [];
  let justCleared = false;
  let justSpotted = false;

  function reset() {
    gapSide = null;
    resolved = false;
    volleyTimer = VOLLEY_INTERVAL_FAR;
    hazards = [];
    justCleared = false;
    justSpotted = false;
  }

  return {
    reset,
    // A real physical wall, checked by game.js *before* it commits to
    // advancing flowDistance — see that call site's own comment. True
    // whenever (d, worldX) lands inside the hull's own depth range but
    // outside the gap; always false before the ship's been spotted at all
    // (gapSide isn't decided yet, so there's nothing to collide with).
    isHullBlocking(flowDistance, worldX) {
      if (gapSide === null) return false;
      const half = SHIP_DEPTH_Z / 2;
      if (flowDistance < SHIP_FLOW_DISTANCE - half || flowDistance > SHIP_FLOW_DISTANCE + half) return false;
      const { gapLo, gapHi } = gapBounds(gapSide);
      return worldX < gapLo || worldX > gapHi;
    },
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
    // No gapSide() accessor on purpose — which side is clear is deliberately
    // never surfaced to game.js; finding it is the point of the fight, not
    // something to hand the player in a banner.

    // onHit(entry) is only ever called with { type: 'cannon' } or
    // { type: 'shiphull' } — game.js's handleHit() gives each its own
    // damage amount, same pattern as every other hazard type. effectiveSpeed
    // is needed to lead each shot's target ahead of the canoe's current
    // position (see the spawn site's own comment) — without it, every shot
    // whiffs by construction, not because it was dodged.
    update(dt, playerFlowDistance, playerWorldX, effectiveSpeed, onHit) {
      const distToShip = SHIP_FLOW_DISTANCE - playerFlowDistance;
      // Once resolved, stays false forever (only reset() brings it back) —
      // no separate lower bound needed the way an early version had one.
      const engaged = !resolved && distToShip < APPROACH_RANGE + 5;

      if (engaged) {
        if (gapSide === null) {
          gapSide = Math.random() < 0.5 ? -1 : 1;
          justSpotted = true;
        }
        // No hull check here any more — isHullBlocking() (checked by
        // game.js before it even commits to advancing flowDistance) is
        // what actually stops the canoe outside the gap now, so distToShip
        // can only ever go negative by genuinely passing through it.
        if (distToShip <= -CLEAR_MARGIN) {
          resolved = true;
          justCleared = true;
        }
        if (distToShip > 0) {
          const progress = 1 - clamp(distToShip / APPROACH_RANGE, 0, 1);
          volleyTimer -= dt;
          if (volleyTimer <= 0) {
            const shots = progress > 0.85 ? 3 : progress > 0.5 ? 2 : 1;
            const spread = SPLASH_SPREAD_MIN + (SPLASH_SPREAD_MAX - SPLASH_SPREAD_MIN) * progress;
            for (let i = 0; i < shots; i++) {
              // Evenly-spaced lanes across the fan, not independent random
              // jitter — a 3-shot volley always genuinely covers left/
              // centre/right of where the canoe was when it fired, instead
              // of sometimes clumping together and leaving an easy gap by
              // pure chance.
  const lane = shots > 1 ? (i / (shots - 1)) * 2 - 1 : 0;
              const jitter = (Math.random() * 2 - 1) * (spread / shots) * 0.4;
              hazards.push({
                // Led ahead by how far the canoe will travel during the
                // warning window — a shot aimed at "where you are right
                // now" always misses by construction once you account for
                // your own forward speed (~16 units/sec against a ~1.4-unit
                // tolerance and a 0.65s fuse means you're already ~10 units
                // past it before it even goes hot). This is what an earlier
                // version got wrong: it looked like every shot was being
                // dodged when really none of them could ever have landed.
                d: playerFlowDistance + effectiveSpeed * SPLASH_WARN_TIME,
                x: playerWorldX + lane * spread + jitter,
                t: 0,
                hit: false,
                boomed: false,
              });
            }
            volleyTimer = VOLLEY_INTERVAL_FAR - (VOLLEY_INTERVAL_FAR - VOLLEY_INTERVAL_NEAR) * progress;
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

      if (!engaged) return { active: false, progressPct: 0, boomCount, crossCurrent: 0, gapSide: null };
      const progressPct = distToShip <= 0 ? 100 : (1 - clamp(distToShip / APPROACH_RANGE, 0, 1)) * 100;
      // Cross-current pushes you away from the gap side, getting stronger as you approach
      const progress = 1 - clamp(distToShip / APPROACH_RANGE, 0, 1);
      const crossCurrent = -gapSide * progress * 12; // negative gap side means push away from gap
      return { active: true, progressPct, boomCount, crossCurrent, gapSide };
    },

    // Rendering doesn't care whether the encounter is currently "active" by
    // update()'s gating — it just draws whatever's within visible range,
    // same as villages.js's own drawVillages(). The ship stays drawn (and
    // recedes naturally behind the canoe via the usual z depth-sort) well
    // after it's been passed.
    draw(ctx, worldDistance, cameraWorldX, time) {
      const z0 = worldDistance - SHIP_FLOW_DISTANCE;
      const distToShip = SHIP_FLOW_DISTANCE - worldDistance;

      // Cross-current flow visualization: animated streaks showing water movement
      if (gapSide !== null && distToShip > 0 && distToShip < APPROACH_RANGE) {
        const progress = 1 - clamp(distToShip / APPROACH_RANGE, 0, 1);
        drawCurrentFlow(ctx, time, gapSide, progress);
      }

      // gapSide is null until the encounter first activates (update()'s own
      // gating, at APPROACH_RANGE+5) — practically always well before the
      // ship comes within visible render range anyway, but this guards the
      // rare case (e.g. a ?start= cheat dropped right on top of it) where
      // it wouldn't be.
      if (gapSide !== null && Math.abs(z0) < VISIBLE_Z_RANGE) drawShip(ctx, cameraWorldX, z0, gapSide);
      for (const h of hazards) {
        const z = worldDistance - h.d;
        if (Math.abs(z) < VISIBLE_Z_RANGE) drawHazard(ctx, h, z, cameraWorldX);
      }

      // Fog of war: thicker when farther from ship, reveals as you approach
      if (gapSide !== null && distToShip > 0 && distToShip < APPROACH_RANGE) {
        drawFog(ctx, distToShip);
      }
    },
  };
}

function drawShip(ctx, cameraWorldX, z0, gapSide) {
  const { hullLo, hullHi } = gapBounds(gapSide);
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

  // Full-screen fog overlay with vertical gradient (thicker at top/bottom)
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, `rgba(95, 105, 115, ${opacity * 0.9})`);
  gradient.addColorStop(0.3, `rgba(85, 95, 105, ${opacity * 0.7})`);
  gradient.addColorStop(0.7, `rgba(85, 95, 105, ${opacity * 0.7})`);
  gradient.addColorStop(1, `rgba(95, 105, 115, ${opacity * 0.9})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
