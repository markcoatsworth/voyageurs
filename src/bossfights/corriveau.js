// La Corriveau — Marie-Josephte Corriveau, hanged at Québec in 1763 by a
// British court martial for the murder of her second husband, her body then
// hung in an iron gibbet cage at the crossroads at Pointe-Lévy for weeks as
// a warning. The legend that grew out of it (Aubert de Gaspé's Les Anciens
// Canadiens, 1863, is the classic telling) has her ghost still in the cage,
// haunting the roads at night, clinging to the backs of lone travellers and
// begging to be carried across the St. Lawrence to the witches' sabbath on
// Île d'Orléans, the feux follets — will-o'-the-wisps — dancing around her.
//
// Here she finds the canoe in the mist on the run from Beaupré into Québec
// City — across the river from Pointe-Lévy, where the cage really hung, and
// past the Île d'Orléans she's begging to be carried to. (She started out
// on Lac Saint-Pierre, between Trois-Rivières and Sorel-Tracy, and moved
// here when the first three fights were reshuffled: "We should obviously
// put La Corriveau just before Quebec City, where Le Loup-garou is now.")
// The cage hangs over the water on a chain
// that runs up out of sight, swinging, and she wants a ride. Dodge-only, like
// the Loup-garou — nothing to shoot, nothing to kill. Two things to steer
// around, both of them purely sideways dodges (the counterpart to the
// Loup-garou, whose led strike is beaten by pace as much as by line):
//
//   - the reach: the cage rattles and slides over a lane marked on the
//     water, then drops straight down it to the canoe — "clinging to the
//     backs of travellers." The lane is a whole column of the river, so
//     braking or racing doesn't help; only leaving the lane does.
//   - the feux follets: wisps she lets go of, weaving down the river at the
//     canoe, aimed where it is when they're cast. From a third of the way in.
//
// You reach the lights of Québec and she falls back into the mist.
import { centerX } from '../world/river/path.js';
import { worldToScreen, CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } from '../shared/config.js';
import { VILLAGES } from '../world/villages.js';

// Which segment's flowDistance line the distances below are on — see
// wendigo.js's SEGMENT.
export const SEGMENT = 'lawrenceWest';

const BEAUPRE = VILLAGES.find((v) => v.name === 'Beaupre');
const QUEBEC_CITY = VILLAGES.find((v) => v.name === 'Quebec City');
// lawrenceWest runs upstream with flowDistance increasing: Beaupré (~60781),
// then Québec City (~60961), ~180 units. "It should take us almost all the
// way to Quebec City and last for 2-3 minutes": the fight now spans as much
// of that as it can — starting as soon after Beaupré as the old lesson
// allows (the dark only once you're 20+ units clear of the dock, the fight
// 50+: "the sky should only go dark ... when I'm comfortably past Beaupré")
// and letting go just short of the King's Wharf, ~115 units — and it's
// paced (HAUNT_TIME below) rather than raced.
const MIST_CLEAR_OF_TOWN = 20;
const MIST_FADE_IN = 30;
// Lifts over the last stretch to the wharf, gone by QC - 3, clear of the
// dock. (45, from her first home on Lac Saint-Pierre, left the mist hanging
// over the dock itself.)
const MIST_FADE_OUT = 12;
export const TRIGGER_DISTANCE = BEAUPRE.flowDistance + MIST_CLEAR_OF_TOWN + MIST_FADE_IN;
export const DELIVERANCE_DISTANCE = QUEBEC_CITY.flowDistance - 15;
const FIGHT_LENGTH = DELIVERANCE_DISTANCE - TRIGGER_DISTANCE;

// How long the fight lasts: 2.5 minutes, the middle of the 2-3 asked for.
// Distance alone can't give that — the whole stretch from Beaupré to the
// city is ~25 seconds of ordinary upstream paddling — so while she's on
// you, she weighs the canoe down: the legend's ghost clinging to the backs
// of travellers. paceLimit() caps the canoe's speed so it can't get ahead
// of a schedule that reaches DELIVERANCE_DISTANCE at HAUNT_TIME; fall
// behind it (a hit, a pause) and you're free to paddle at full speed to
// catch back up. Escalation (wind-ups, volleys) runs on the same clock.
export const HAUNT_TIME = 150;
const PACE_SPEED = FIGHT_LENGTH / HAUNT_TIME; // ~0.77 units/s
const CATCH_UP_GAIN = 1.5; // extra speed allowed per unit behind schedule

// A failsafe only for someone genuinely stuck once the time is up — never a
// way out. The Loup-garou's version (let go after 10s of no headway) would
// be an exit here: stop paddling, drift back on the current, wait, free.
const OVERTIME_GRACE = 20;
const STALL_TIME_LIMIT = 10;
const STALL_PROGRESS_EPS = 0.05;

// The cage hangs from a pivot above the top of the screen and swings.
// Screen-space, like the Loup-garou — the reach and the wisps are what land
// on real spots on the water.
const PIVOT_Y = -34;
const HOVER_CHAIN = 84;      // chain length at rest: the cage's top ~50px down
const CAGE_H = 56;           // hook to ankle band, px
const SWAY_PX = 34;
const SWAY_PERIOD = 7.4;
const SWING_RAD = 0.16;      // the pendulum's own swing either side
const SWING_PERIOD = 3.1;

// The reach: cadence and wind-up, eased from the start of the stretch to
// the end (a touch slower than the Loup-garou's to start — the lane is
// a new read — and a touch faster by the end, since she's later in the run).
//
// Gaps lengthened 2.7/1.7 -> 3.8/2.6 when the fight went from ~25s to 2.5
// minutes: the per-attack read is what was "balanced nicely", but six times
// the exposure at the old rate added up to far more hull than a fight
// with no pistol and no repairs should cost (game.js's CORRIVEAU_DAMAGE
// came down for the same reason).
const FIRST_REACH_DELAY = 1.4;
const REACH_INTERVAL_FAR = 3.8;
const REACH_INTERVAL_NEAR = 2.6;
// Longer than the Loup-garou's (1.2 -> 0.9): every bit of the dodge has to
// be sideways, and sideways is slow wherever the river is fighting you —
// whitewater caps how far the bow will come round (game.js's
// RAPIDS_STEER_PENALTY), and a canoe on full lock there was measured
// covering well under a unit a second, and a canoe already sliding the
// wrong way spends the first part of any wind-up just stopping. First cut
// was 1.3 -> 0.95 with a 1.7 lane, which a canoe caught in rough water
// couldn't clear at all.
const WINDUP_FAR = 1.7;
const WINDUP_NEAR = 1.3;
const HOT_TIME = 0.32;
const RECOVER_TIME = 0.5;    // hauled back up the chain, slower than it fell
// Lane half-width, world units — narrower than the Loup-garou's maw (2.0):
// the lane can't be dodged by pace at all, so the whole wind-up goes into a
// sideways move and the distance to clear has to fit that alone. 1.25
// leaves the cage itself (~20px across, so ~0.6 units either side of the
// lane's centre) plainly inside the marked column.
export const REACH_HALF_WIDTH = 1.25;

// The feux follets.
const VOLLEY_START = 0.3;    // fraction of the fight before the first volley
// 3.6/2.5 before the 2.5-minute pacing. A first stretch to 4.6/3.2 (with
// volleys of up to three) still threw ~50 wisps over the fight, and a
// dodging run took ten of them — 80 hull from the wisps alone, a sinking
// on top of the odd reach. Volleys top out at two now (see update()).
const VOLLEY_INTERVAL_FAR = 5.5;
const VOLLEY_INTERVAL_NEAR = 4.0;
// How fast a wisp closes on the canoe, units/s, *relative to the canoe* —
// they ride the mist up the lake with you rather than sitting in the world,
// so a fast canoe can't run into them blind, nor can braking dodge them: it's
// a sideways read, the same as the reach. From the cage (~7 units ahead)
// that's a bit over two seconds to see each one coming.
const WISP_CLOSE_SPEED = 3.2;
// Weave and spread together decide whether a volley has readable gaps:
// first cut was 0.8 / 2.3, where the weave closed the gaps between a late
// three-wisp volley often enough that sidestepping one wisp carried the
// canoe into its neighbour.
const WISP_WEAVE = 0.5;      // units either side of its line
const WISP_SPREAD = 2.8;     // units between wisps in one volley
const WISP_HIT_DZ = 0.55;
const WISP_HIT_DX = 0.55;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// Pure function of position (so it also covers the tail after deliverance):
// the mist that rolls in over the river below Québec and lifts at the city.
export function mistIntensityAt(flowDistance) {
  if (flowDistance <= TRIGGER_DISTANCE - MIST_FADE_IN
    || flowDistance >= DELIVERANCE_DISTANCE + MIST_FADE_OUT) return 0;
  const up = (flowDistance - (TRIGGER_DISTANCE - MIST_FADE_IN)) / MIST_FADE_IN;
  const down = (DELIVERANCE_DISTANCE + MIST_FADE_OUT - flowDistance) / MIST_FADE_OUT;
  return smoothstep(Math.min(up, down));
}

export function createCorriveau() {
  let phase = 'idle'; // 'idle' | 'haunting' | 'delivered'
  let active = false;
  let spotted = false;
  let justSpotted = false;
  let justDelivered = false;
  let justReached = false; // a wind-up began this frame (game.js rattles the chains)

  let clock = 0;
  let swayPx = 0;
  let reach = null;          // { t, windup, laneOff, laneX, hit }
  let reachTimer = FIRST_REACH_DELAY;
  let volleyTimer = 0;
  // Wisp lines are offsets from the river's centreline (like the reach's
  // lane), resolved against `mid` — the centreline at the canoe — each frame.
  let wisps = [];            // { rel, x0, aim, t, arrive, seed, hit }
  let mid = 0;
  let retreatT = 0;
  let bestD = 0;
  let stallClock = 0;
  // Where the cage hangs right now, for casting wisps from it: screen x of
  // its centre and y of its foot. Updated in update(), read by draw().
  let cage = { x: CANVAS_WIDTH / 2, y: PIVOT_Y + HOVER_CHAIN + CAGE_H, swing: 0 };

  function reset() {
    phase = 'idle';
    active = false;
    spotted = false;
    justSpotted = false;
    justDelivered = false;
    justReached = false;
    clock = 0;
    swayPx = 0;
    reach = null;
    reachTimer = FIRST_REACH_DELAY;
    volleyTimer = 0;
    wisps = [];
    retreatT = 0;
    bestD = 0;
    stallClock = 0;
  }

  // 0..1 through the drop: 0 hanging, 1 at the water. Snaps down over the
  // first part of the hot window, then is hauled back up.
  function dropAmount() {
    if (!reach || reach.t < reach.windup) return 0;
    const a = (reach.t - reach.windup) / (HOT_TIME + RECOVER_TIME);
    return a < 0.22 ? smoothstep(a / 0.22) : clamp(1 - (a - 0.22) / 0.78, 0, 1);
  }
  function windupAmount() {
    if (!reach) return 0;
    return reach.t < reach.windup ? reach.t / reach.windup : 1;
  }

  return {
    reset,
    isActive() { return active; },
    // The most speed the canoe may have right now (null when she isn't on
    // it): PACE_SPEED on schedule, more the further behind it — see
    // HAUNT_TIME. game.js applies it before advancing the canoe.
    paceLimit(playerFlowDistance) {
      if (!active) return null;
      const scheduled = TRIGGER_DISTANCE + FIGHT_LENGTH * clamp(clock / HAUNT_TIME, 0, 1);
      return PACE_SPEED + Math.max(0, scheduled - playerFlowDistance) * CATCH_UP_GAIN;
    },
    isReaching() { return !!reach; },
    // World X of the marked lane while a reach is coming (null otherwise).
    reachLaneX() { return reach ? reach.laneX : null; },
    // The live wisps as { rel, x } — rel is units ahead of the canoe. For
    // the smoke test's dodge bot; a dodge assist could use it too.
    // aimX is the spot the wisp is homing on (the canoe's line when it was
    // cast) — readable on screen from the way it curves in, so fair to give
    // a bot.
    wispPositions() { return wisps.filter((w) => !w.hit).map((w) => ({ rel: w.rel, x: mid + wispX(w), aimX: mid + w.aim })); },
    mistIntensity(flowDistance) { return mistIntensityAt(flowDistance); },
    consumeJustSpotted() { const v = justSpotted; justSpotted = false; return v; },
    consumeJustDelivered() { const v = justDelivered; justDelivered = false; return v; },
    consumeJustReached() { const v = justReached; justReached = false; return v; },

    // onHit(entry) gets { type: 'corriveau' } for the reach and
    // { type: 'feu-follet' } for a wisp; game.js's handleHit prices them.
    update(dt, playerFlowDistance, playerWorldX, cameraWorldX, onHit) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE
        && playerFlowDistance < DELIVERANCE_DISTANCE;

      if (phase === 'idle' && inRange) {
        phase = 'haunting';
        active = true;
        spotted = true;
        justSpotted = true;
        clock = 0;
        reachTimer = FIRST_REACH_DELAY;
        bestD = playerFlowDistance;
        stallClock = 0;
      }
      if (spotted) clock += dt;
      mid = centerX(playerFlowDistance);

      if (phase === 'haunting') {
        if (playerFlowDistance > bestD + STALL_PROGRESS_EPS) {
          bestD = playerFlowDistance;
          stallClock = 0;
        } else {
          stallClock += dt;
        }
        const stuck = clock > HAUNT_TIME + OVERTIME_GRACE && stallClock > STALL_TIME_LIMIT;
        if (playerFlowDistance >= DELIVERANCE_DISTANCE || stuck) {
          phase = 'delivered';
          justDelivered = true;
          active = false;
          reach = null;
          wisps = [];
        }
      }

      // On the clock, not distance — the pacing keeps the two in step anyway.
      const progress = clamp(clock / HAUNT_TIME, 0, 1);

      // Where the cage hangs: drifting over the lake at rest, sliding over
      // the marked lane through a wind-up and holding there for the drop.
      swayPx = Math.sin(clock * TAU / SWAY_PERIOD) * SWAY_PX
        + Math.sin(clock * 0.71 + 0.9) * SWAY_PX * 0.3;
      const restX = clamp(CANVAS_WIDTH / 2 + swayPx, 40, CANVAS_WIDTH - 40);
      let x = restX;
      if (reach) {
        const laneScreenX = clamp(CANOE_SCREEN_X + (reach.laneX - cameraWorldX) * PIXELS_PER_UNIT, 16, CANVAS_WIDTH - 16);
        const w = smoothstep(Math.min(1, reach.t / (reach.windup * 0.7)));
        const back = reach.t > reach.windup + HOT_TIME ? smoothstep((reach.t - reach.windup - HOT_TIME) / RECOVER_TIME) : 0;
        x = lerp(restX, laneScreenX, w * (1 - back));
      }
      const drop = dropAmount();
      const swing = Math.sin(clock * TAU / SWING_PERIOD) * SWING_RAD * (1 - drop) * (1 - windupAmount() * 0.7);
      const chain = lerp(HOVER_CHAIN, CANOE_SCREEN_Y + 6 - CAGE_H - PIVOT_Y, drop);
      cage = { x: x + Math.sin(swing) * chain, y: PIVOT_Y + Math.cos(swing) * chain + CAGE_H, swing, chain, pivotX: x };

      if (phase === 'haunting' && !reach) {
        reachTimer -= dt;
        if (reachTimer <= 0) {
          const windup = lerp(WINDUP_FAR, WINDUP_NEAR, progress);
          reach = {
            t: 0,
            windup,
            // Locked when the wind-up starts: on the canoe, pulled a fifth
            // toward mid-channel (as the Loup-garou does) so hugging a bank
            // isn't a hiding place. Locked as an offset from the river's
            // centreline, not a world X — a canoe left alone rides the
            // current round the bends, and the river's centreline
            // wanders 3+ units over one wind-up, so a world-fixed lane slid
            // off anyone who simply held their line and they "dodged"
            // without touching a key. It never follows the canoe's own
            // steering after that.
            laneOff: 0.8 * (playerWorldX - centerX(playerFlowDistance)),
            laneX: playerWorldX,
            hit: false,
          };
          justReached = true;
          reachTimer = lerp(REACH_INTERVAL_FAR, REACH_INTERVAL_NEAR, progress);
        }
      }
      if (reach) {
        reach.t += dt;
        reach.laneX = centerX(playerFlowDistance) + reach.laneOff;
        if (reach.t >= reach.windup && reach.t < reach.windup + HOT_TIME && !reach.hit
          && Math.abs(playerWorldX - reach.laneX) < REACH_HALF_WIDTH) {
          reach.hit = true;
          onHit({ type: 'corriveau' });
        }
        if (reach.t >= reach.windup + HOT_TIME + RECOVER_TIME) reach = null;
      }

      // Volleys of feux follets, cast from wherever the cage is hanging —
      // never mid-reach, so the two reads don't land on the same beat.
      if (phase === 'haunting' && progress >= VOLLEY_START) {
        volleyTimer -= dt;
        if (volleyTimer <= 0 && !reach) {
          const n = progress < 0.65 ? 1 : 2;
          const rel = Math.max(3, (CANOE_SCREEN_Y - cage.y) / PIXELS_PER_UNIT);
          const fromX = cameraWorldX + (cage.x - CANOE_SCREEN_X) / PIXELS_PER_UNIT;
          for (let i = 0; i < n; i++) {
            wisps.push({
              rel,
              x0: fromX - mid,
              aim: playerWorldX - mid + (i - (n - 1) / 2) * WISP_SPREAD,
              t: 0,
              arrive: rel / WISP_CLOSE_SPEED,
              seed: Math.random() * TAU,
              hit: false,
            });
          }
          volleyTimer = lerp(VOLLEY_INTERVAL_FAR, VOLLEY_INTERVAL_NEAR, progress);
        }
      }
      for (const w of wisps) {
        w.t += dt;
        w.rel -= WISP_CLOSE_SPEED * dt;
        if (!w.hit && phase === 'haunting'
          && Math.abs(w.rel) < WISP_HIT_DZ && Math.abs(playerWorldX - mid - wispX(w)) < WISP_HIT_DX) {
          w.hit = true;
          onHit({ type: 'feu-follet' });
        }
      }
      wisps = wisps.filter((w) => w.rel > -4 && !(w.hit && w.t > w.arrive + 0.4));

      if (phase === 'delivered') retreatT = Math.min(1, retreatT + dt / 2.2);
      return { active, spotted };
    },

    draw(ctx, worldDistance, cameraWorldX) {
      if (!spotted) return;
      if (!active && (phase !== 'delivered' || retreatT >= 1)) return;
      const alpha = phase === 'delivered' ? 1 - retreatT : 1;
      const w = windupAmount();
      const drop = dropAmount();

      ctx.save();
      ctx.globalAlpha = alpha;

      // The marked lane: a pale column down the water where she'll drop,
      // brightening through the wind-up, with the spot she's reaching for
      // ringed at the canoe's row.
      if (reach && reach.t < reach.windup + HOT_TIME) {
        const p = worldToScreen(reach.laneX, 0, cameraWorldX);
        const half = REACH_HALF_WIDTH * PIXELS_PER_UNIT;
        const top = cage.y - 4;
        ctx.fillStyle = `rgba(150, 230, 190, ${0.05 + w * 0.13})`;
        ctx.fillRect(p.x - half, top, half * 2, CANVAS_HEIGHT - top);
        ctx.fillStyle = `rgba(170, 245, 205, ${0.2 + w * 0.45})`;
        for (let y = Math.ceil(top / 6) * 6; y < CANVAS_HEIGHT; y += 6) {
          ctx.fillRect(Math.round(p.x - half), y, 1, 3);
          ctx.fillRect(Math.round(p.x + half) - 1, y, 1, 3);
        }
        ctx.strokeStyle = `rgba(190, 255, 215, ${0.3 + w * 0.5})`;
        ctx.lineWidth = 1 + w;
        ctx.beginPath();
        ctx.ellipse(p.x, CANOE_SCREEN_Y, half * (1.6 - w * 0.6), half * 0.35, 0, 0, TAU);
        ctx.stroke();
      }

      // The feux follets — little cold flames, blue at the edge, white core.
      for (const wp of wisps) {
        if (wp.hit) continue;
        const sp = worldToScreen(mid + wispX(wp), -wp.rel, cameraWorldX);
        const sy = CANOE_SCREEN_Y - wp.rel * PIXELS_PER_UNIT;
        const fl = 0.75 + 0.25 * Math.sin(clock * 17 + wp.seed * 5);
        const g = ctx.createRadialGradient(sp.x, sy, 0, sp.x, sy, 9 * fl);
        g.addColorStop(0, 'rgba(230, 255, 245, 0.95)');
        g.addColorStop(0.3, 'rgba(120, 220, 255, 0.6)');
        g.addColorStop(1, 'rgba(60, 140, 220, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(sp.x - 10, sy - 10, 20, 20);
        ctx.fillStyle = '#f2fffa';
        ctx.fillRect(Math.round(sp.x) - 1, Math.round(sy) - 2, 2, 3);
        // A little flame lick trailing up the river behind it.
        ctx.fillStyle = 'rgba(140, 230, 255, 0.55)';
        ctx.fillRect(Math.round(sp.x + Math.sin(clock * 9 + wp.seed) * 1.5), Math.round(sy) - 5, 1, 3);
      }

      const rattle = reach && reach.t < reach.windup ? (Math.random() - 0.5) * 2.4 * w : 0;
      drawGibbet(ctx, {
        pivotX: cage.pivotX ?? cage.x,
        x: cage.x + rattle,
        top: cage.y - CAGE_H - retreatT * 40,
        swing: cage.swing,
        reachOut: Math.max(w, drop),
        glow: 0.35 + 0.65 * Math.max(w, drop),
        clock,
      });
      ctx.restore();
    },
  };
}

// A wisp's lateral position, as an offset from the centreline: from the
// cage toward its aim, arriving on it when it reaches the canoe's row,
// weaving either side on the way.
function wispX(w) {
  const k = smoothstep(Math.min(1, w.t / w.arrive));
  return lerp(w.x0, w.aim, k) + Math.sin(w.t * 2.7 + w.seed) * WISP_WEAVE * k;
}

const IRON = '#1a1817';
const IRON_HI = '#7a5236'; // rust catching the ghost-light

// Half-width of the cage's body at `y` px below its hook — the gibbet was
// forged to the body: a round head cage, a neck, broad at the shoulders,
// in at the waist, out at the hips, then a cage round each leg. One
// profile drives the dark backing, the ghost and the iron, so they agree.
const CAGE_PROFILE = [
  [0, 0], [2, 5], [7, 7], [12, 5], [14, 3], [16, 10], [22, 9], [30, 7], [36, 9], [40, 9], [54, 7], [56, 6],
];
function cageHalfWidth(y) {
  for (let i = 1; i < CAGE_PROFILE.length; i++) {
    const [y1, w1] = CAGE_PROFILE[i];
    if (y <= y1) {
      const [y0, w0] = CAGE_PROFILE[i - 1];
      return lerp(w0, w1, (y - y0) / (y1 - y0));
    }
  }
  return 0;
}
const LEGS_FROM = 40; // below this the cage splits into two legs

// The gibbet cage: body-shaped iron straps hung from a chain, the pale ghost
// inside. The silhouette is the whole point: you should know it's a hanged
// woman in a cage from the shape alone — so the inside is backed dark, and
// the iron is drawn as separate bars over it, with the ghost glowing through
// the gaps rather than filling them. On a reach, two bony arms come out
// through the bars toward the canoe — begging for a ride.
function drawGibbet(ctx, p) {
  const { pivotX, x, top, swing, reachOut, glow, clock } = p;
  const cx = Math.round(x);
  const ty = Math.round(top);
  const H = 56;

  // Ghost-light around the cage.
  const g = ctx.createRadialGradient(cx, ty + 26, 2, cx, ty + 26, 50);
  g.addColorStop(0, `rgba(150, 240, 190, ${0.34 * glow})`);
  g.addColorStop(1, 'rgba(150, 240, 190, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 52, ty - 26, 104, 108);

  // The chain, from the hook back up to the pivot off the top of the
  // screen: alternating links, leaning with the swing.
  ctx.fillStyle = IRON;
  for (let ly = ty - 6, i = 0; ly > -6; ly -= 4, i++) {
    const lx = lerp(pivotX, cx, (ly - PIVOT_Y) / (ty - PIVOT_Y));
    if (i % 2) ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 3);
    else ctx.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 5);
  }
  ctx.fillStyle = IRON_HI;
  ctx.fillRect(cx - 1, ty - 3, 3, 2); // the ring at the crown

  // A row at a time down the body: the dark inside of the cage, then the
  // ghost glowing in it — the legs split in two below LEGS_FROM.
  const sway = (y) => Math.round(-swing * 10 * (y / H)); // the ghost hangs a little behind the swing
  for (let y = 1; y < H; y++) {
    const hw = Math.round(cageHalfWidth(y));
    if (hw <= 0) continue;
    const row = ty + y;
    ctx.fillStyle = 'rgba(8, 14, 12, 0.72)';
    if (y < LEGS_FROM) ctx.fillRect(cx - hw, row, hw * 2 + 1, 1);
    else {
      ctx.fillRect(cx - hw, row, hw - 1, 1);
      ctx.fillRect(cx + 2, row, hw - 1, 1);
    }
    // The ghost: narrower than the cage, brightest at the face, fading
    // down the shroud.
    const gw = y < 13 ? hw - 2 : Math.max(1, hw - 4);
    const a = y < 13 ? 0.9 : 0.72 - 0.3 * (y / H);
    ctx.fillStyle = `rgba(214, 242, 228, ${a})`;
    const sx = cx + sway(y);
    if (y < LEGS_FROM) ctx.fillRect(sx - gw, row, gw * 2 + 1, 1);
    else if (y < H - 3) {
      ctx.fillRect(sx - hw + 2, row, Math.max(1, hw - 4), 1);
      ctx.fillRect(sx + 3, row, Math.max(1, hw - 4), 1);
    }
  }
  // The face: hollow eyes and a mouth that opens as she begs.
  const fx = cx + sway(6);
  ctx.fillStyle = '#0b100d';
  ctx.fillRect(fx - 3, ty + 5, 2, 2);
  ctx.fillRect(fx + 2, ty + 5, 2, 2);
  ctx.fillRect(fx, ty + 9, 1, reachOut > 0.4 ? 3 : 1);
  if (glow > 0.6) {
    ctx.fillStyle = `rgba(170, 255, 210, ${glow - 0.4})`;
    ctx.fillRect(fx - 3, ty + 5, 1, 1);
    ctx.fillRect(fx + 3, ty + 5, 1, 1);
  }
  // Hair, long and lank, down past the shoulders and trailing the swing.
  ctx.fillStyle = 'rgba(36, 44, 40, 0.95)';
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const hx = fx + s * (5 + k);
      for (let y = 2; y < 18 - k * 4; y++) ctx.fillRect(hx + Math.round(-swing * 8 * (y / 18) + Math.sin(clock * 2 + y * 0.4 + s) * 0.6), ty + y, 1, 1);
    }
  }
  ctx.fillRect(fx - 4, ty + 1, 9, 2);

  // Arms out through the bars, reaching down toward the canoe.
  if (reachOut > 0.05) {
    ctx.fillStyle = 'rgba(226, 246, 234, 0.95)';
    for (const s of [-1, 1]) {
      const sx = cx + s * 8, sy = ty + 18;
      const hx = cx + s * (10 + 8 * reachOut), hy = sy + 6 + 18 * reachOut;
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        ctx.fillRect(Math.round(lerp(sx, hx, i / steps)), Math.round(lerp(sy, hy, i / steps)), 1, 2);
      }
      for (let f = -1; f <= 1; f++) ctx.fillRect(Math.round(hx + f * 1.5), Math.round(hy + 2), 1, 3); // fingers
    }
  }

  // The iron, over the top. Horizontal bands at the crown, brow, jaw,
  // shoulders, ribs, waist, hips, knees and ankles…
  ctx.fillStyle = IRON;
  for (const y of [1, 7, 12, 16, 23, 30, 37]) {
    const hw = Math.round(cageHalfWidth(y));
    ctx.fillRect(cx - hw, ty + y, hw * 2 + 1, y === 16 || y === 37 ? 2 : 1);
  }
  for (const y of [47, 54]) {
    const hw = Math.round(cageHalfWidth(y));
    ctx.fillRect(cx - hw, ty + y, hw - 1, 2);
    ctx.fillRect(cx + 2, ty + y, hw - 1, 2);
  }
  // …and the vertical straps following the profile: the outer edge each
  // side, two more across the body, one over the crown and down the face,
  // and the inner edge of each leg.
  for (let y = 0; y < H; y++) {
    const hw = cageHalfWidth(y);
    const row = ty + y;
    ctx.fillRect(Math.round(cx - hw), row, 1, 1);
    ctx.fillRect(Math.round(cx + hw), row, 1, 1);
    if (y < 14) ctx.fillRect(cx, row, 1, 1);
    else if (y < LEGS_FROM) {
      ctx.fillRect(Math.round(cx - hw * 0.45), row, 1, 1);
      ctx.fillRect(Math.round(cx + hw * 0.45), row, 1, 1);
    } else {
      ctx.fillRect(cx - 2, row, 1, 1);
      ctx.fillRect(cx + 2, row, 1, 1);
    }
  }
  // Rust picking up the ghost-light down the near edges.
  ctx.fillStyle = IRON_HI;
  for (let y = 15; y < 38; y += 1) if (y % 3) ctx.fillRect(Math.round(cx - cageHalfWidth(y)) + 1, ty + y, 1, 1);
  ctx.fillRect(cx - 4, ty + 7, 3, 1);
  ctx.fillRect(cx - 8, ty + 16, 5, 1);
}
