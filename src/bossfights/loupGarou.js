// Le Loup-garou — the night beast on the Beaupré shore, the encounter just
// before Québec City. A man who skipped his Easter confession seven years
// running is cursed to run the roads as a wolf until someone draws his
// blood; here he paces the canoe from the water and lunges. There are no
// projectiles and nothing to shoot back with (the pistol isn't unlocked
// yet) — the whole fight is reading the crouch, then braking to let the
// lunge overshoot or steering out of its path, while holding a line up the
// current. You don't beat him: you outlast him to the lights of Québec
// City, which he can't pass.
//
// MVP. One phase: pace + telegraphed lunges, escalating mildly over the
// stretch, then deliverance at the capital. The cross-bank swim, the
// moon/mist rhythm, the cling-and-shake on a hit, the narrows climax and
// the "crashes into holy ground" freeing beat all come later — see the
// design notes this came out of.
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';
import { VILLAGES } from '../world/villages.js';

const QUEBEC_CITY = VILLAGES.find((v) => v.name === 'Quebec City');
// The beast is spotted here (howl + nightfall already well underway) and
// falls back here (the city in view). Anchored to Québec City's own
// flowDistance so it follows if the capital ever moves. Deliverance sits a
// short paddle short of the King's Wharf, leaving calm water to steer onto
// the dock and go ashore for repairs.
export const TRIGGER_DISTANCE = QUEBEC_CITY.flowDistance - 172; // a few units past Beaupré
export const DELIVERANCE_DISTANCE = QUEBEC_CITY.flowDistance - 28;
// Deliberately a short fight — this is early in the game and shouldn't be
// punishing yet. ~145 units / ~13s vs. the blockade's ~340.
const FIGHT_LENGTH = DELIVERANCE_DISTANCE - TRIGGER_DISTANCE;

// The cold blue nightfall fades in over this many units before the trigger
// and back out after deliverance — same shape as chasseGalerie's
// stormIntensityAt, gentler in game.js's render (this isn't the Devil).
const NIGHT_FADE_IN = 55;
const NIGHT_FADE_OUT = 45;

// The beast paces this far to one side of the channel centre — not out on
// the dry bank (the river here is 40+ units wide; it would be off-screen),
// but wading the shallows near you, close enough to be a real threat and
// always visible. It "switches sides" by swimming through the centre.
const PACE_OFFSET = 5.5;
const LEAD = 3.2; // how far up-current it lopes ahead of the canoe

// Lunge cadence and reach, eased from the start of the stretch to the end.
// Short fight, so the leaps come fairly often — ~6-8 over the stretch — but
// each is generously telegraphed and the brake counter shuts it down cold.
const FIRST_LUNGE_DELAY = 1.2;
const LUNGE_INTERVAL_FAR = 2.3;
const LUNGE_INTERVAL_NEAR = 1.6;
const TELEGRAPH_FAR = 0.85; // the crouch — your window to read it and react
const TELEGRAPH_NEAR = 0.62;
const HOT_TIME = 0.26;   // the actually-dangerous window as it lands
const FADE_TIME = 0.28;  // scrambling back to the shallows after
const HIT_DX = 1.8;      // lateral hit half-width — juke to clear it
// Along-current half-depth. Kept tight on purpose: the leap is aimed where
// a constant-speed canoe *will* be, so holding your speed lands you in it,
// but a tap of the brake drops you well short and clear. That's the whole
// counter — braking, not out-paddling.
const HIT_DZ = 1.6;

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 6;
const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// Pure function of position, independent of the fight's state latch (so it
// also covers the tail after deliverance) — the cold-blue night that
// creeps in over the approach and lifts as the city comes into view.
export function nightIntensityAt(flowDistance) {
  if (flowDistance <= TRIGGER_DISTANCE - NIGHT_FADE_IN
    || flowDistance >= DELIVERANCE_DISTANCE + NIGHT_FADE_OUT) return 0;
  const up = (flowDistance - (TRIGGER_DISTANCE - NIGHT_FADE_IN)) / NIGHT_FADE_IN;
  const down = (DELIVERANCE_DISTANCE + NIGHT_FADE_OUT - flowDistance) / NIGHT_FADE_OUT;
  return smoothstep(Math.min(up, down));
}

export function createLoupGarou() {
  let phase = 'idle';        // 'idle' | 'stalking' | 'delivered'
  let active = false;        // spotted, and not yet fully gone
  let spotted = false;
  let justSpotted = false;
  let justDelivered = false;

  let side = -1;             // which side of centre the beast paces (-1 / +1)
  let beastX = 0;            // current lateral world-X (render + lunge arc)
  let beastFlow = 0;         // current flowDistance (render + lunge arc)
  let lungeTimer = FIRST_LUNGE_DELAY;
  let lunge = null;          // { t, telegraph, targetD, targetX, hit }
  let retreatT = 0;          // 0..1 once delivered, the beast bolting up-shore
  let fightClock = 0;        // real seconds since the beast was spotted

  function reset() {
    phase = 'idle';
    active = false;
    spotted = false;
    justSpotted = false;
    justDelivered = false;
    side = -1;
    beastX = 0;
    beastFlow = 0;
    lungeTimer = FIRST_LUNGE_DELAY;
    lunge = null;
    retreatT = 0;
    fightClock = 0;
  }

  return {
    reset,

    isActive() { return active; },
    // True from the crouch through the recovery — a player reads this as "it's
    // committing, dodge now". Juking away from the beast is the clean counter
    // (it keeps you moving up the current); braking works too but stalls you.
    isLunging() { return !!lunge; },
    // Which side of the channel centre the beast is on right now (-1 / +1) —
    // it's right there on screen, so unlike the blockade's hidden gap this is
    // fair to surface (a dodge assist could use it later).
    beastSide() { return side; },
    nightIntensity(flowDistance) { return nightIntensityAt(flowDistance); },

    consumeJustSpotted() { const v = justSpotted; justSpotted = false; return v; },
    consumeJustDelivered() { const v = justDelivered; justDelivered = false; return v; },

    // onHit(entry) is only ever called with { type: 'wolf' } — game.js's
    // handleHit gives it its own (gentle, early-game) damage amount.
    // effectiveSpeed leads each lunge ahead of the canoe's current position,
    // same reasoning as the blockade's shots: a leap aimed at "where you
    // are now" misses by construction once your own forward speed is
    // accounted for.
    update(dt, playerFlowDistance, playerWorldX, effectiveSpeed, onHit) {
      const inRange = playerFlowDistance >= TRIGGER_DISTANCE
        && playerFlowDistance < DELIVERANCE_DISTANCE;

      if (phase === 'idle' && inRange) {
        phase = 'stalking';
        active = true;
        spotted = true;
        justSpotted = true;
        side = playerWorldX <= centerX(playerFlowDistance) ? -1 : 1;
        beastFlow = playerFlowDistance + LEAD;
        beastX = centerX(beastFlow) + side * PACE_OFFSET;
        lungeTimer = FIRST_LUNGE_DELAY;
      }

      if (phase === 'stalking') {
        fightClock += dt;
        // Deliverance is normally reaching the city; the clock is a failsafe
        // for a player who brakes on every crouch and stalls against the
        // upstream current — the beast can't hound them forever.
        if (playerFlowDistance >= DELIVERANCE_DISTANCE || fightClock > 40) {
          phase = 'delivered';
          justDelivered = true;
          active = false; // the fight is over the instant the city checks it
          lunge = null;   // whatever it was winding up, the bell calls it off
        }
      }

      const progress = clamp((playerFlowDistance - TRIGGER_DISTANCE) / FIGHT_LENGTH, 0, 1);

      // It follows the bank you hug — hugging a shore puts it right on top of
      // you; a loose centre line keeps it a channel-width off. Only re-picks
      // between lunges (not mid-leap).
      if (phase === 'stalking' && !lunge) {
        const lat = playerWorldX - centerX(playerFlowDistance);
        if (Math.abs(lat) > 3) side = Math.sign(lat);

        lungeTimer -= dt;
        if (lungeTimer <= 0) {
          const telegraph = lerp(TELEGRAPH_FAR, TELEGRAPH_NEAR, progress);
          lunge = {
            t: 0,
            telegraph,
            targetD: playerFlowDistance + effectiveSpeed * telegraph,
            // aimed a little past you toward mid-channel, so a dead-centre
            // line isn't a free ride and hugging the far shore isn't either
            targetX: playerWorldX - side * 1.4,
            hit: false,
          };
          lungeTimer = lerp(LUNGE_INTERVAL_FAR, LUNGE_INTERVAL_NEAR, progress);
        }
      }

      // --- position the beast (render + lunge arc) ---
      const homeFlow = playerFlowDistance + LEAD
        + (phase === 'delivered' ? retreatT * 60 : 0); // bolts up-shore once freed
      const paceHalf = Math.min(PACE_OFFSET, widthAt(homeFlow) / 2 - 1);
      const homeX = centerX(homeFlow) + side * paceHalf;

      if (lunge) {
        lunge.t += dt;
        if (lunge.t < lunge.telegraph) {
          beastX += (homeX - beastX) * Math.min(1, dt * 6); // coil, barely moving
          beastFlow = homeFlow;
        } else {
          const air = clamp((lunge.t - lunge.telegraph) / (HOT_TIME + FADE_TIME), 0, 1);
          const arc = Math.sin(Math.PI * air); // out to the target, then back
          beastX = lerp(homeX, lunge.targetX, arc);
          beastFlow = lerp(homeFlow, lunge.targetD, arc);

          if (lunge.t >= lunge.telegraph && lunge.t < lunge.telegraph + HOT_TIME && !lunge.hit) {
            if (Math.abs(playerFlowDistance - lunge.targetD) < HIT_DZ
              && Math.abs(playerWorldX - lunge.targetX) < HIT_DX) {
              lunge.hit = true;
              onHit({ type: 'wolf' });
            }
          }
          if (lunge.t >= lunge.telegraph + HOT_TIME + FADE_TIME) lunge = null;
        }
      } else {
        beastX += (homeX - beastX) * Math.min(1, dt * 3); // lope / swim toward the line
        beastFlow = homeFlow;
      }

      if (phase === 'delivered') retreatT = Math.min(1, retreatT + dt / 1.4);

      return { active, spotted };
    },

    // Rendering, like the blockade's, doesn't care about the update() gate —
    // it draws whatever's in visible range: the beast while the fight is
    // live, and the beast bolting up-shore over the short retreat after.
    draw(ctx, worldDistance, cameraWorldX, time) {
      if (!spotted) return;
      if (!active && (phase !== 'delivered' || retreatT >= 1)) return;

      const z = worldDistance - beastFlow;
      if (Math.abs(z) > VISIBLE_Z_RANGE) return;
      const p = worldToScreen(beastX, z, cameraWorldX);

      const telegraphing = lunge && lunge.t < lunge.telegraph;
      const airborne = lunge && lunge.t >= lunge.telegraph;

      // The landing telegraph — the blockade's visual language: a red hit
      // ring at true size from the first frame (so "will I be in it" is
      // answerable immediately) with a shadow shrinking onto it as a
      // countdown.
      if (telegraphing) {
        const warn = clamp(lunge.t / lunge.telegraph, 0, 1);
        const tp = worldToScreen(lunge.targetX, worldDistance - lunge.targetD, cameraWorldX);
        const hitPx = HIT_DX * PIXELS_PER_UNIT;

        const shadowR = hitPx * (2.4 - warn * 1.4);
        ctx.fillStyle = `rgba(8, 10, 16, ${0.18 + warn * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(tp.x, tp.y, shadowR, shadowR * 0.55, 0, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = `rgba(210, 60, 55, ${0.35 + warn * 0.5})`;
        ctx.lineWidth = 1.5 + warn * 1.5;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, hitPx, 0, TAU);
        ctx.stroke();
      }

      const retreatAlpha = phase === 'delivered' ? 1 - retreatT : 1;
      ctx.save();
      ctx.globalAlpha = clamp(retreatAlpha, 0, 1);
      drawBeast(ctx, p.x, p.y, side, telegraphing, airborne, time);
      ctx.restore();
    },
  };
}

// A low dark quadruped facing in toward the channel (`side` is which shore
// it's on, so it faces `-side`). `crouch` flattens it — the coil before a
// leap; `stretch` elongates it — mid-air. Two amber eyes and a faint cold
// rim so it reads against the night wash game.js lays down.
function drawBeast(ctx, cx, cy, side, crouch, stretch, time) {
  const face = -Math.sign(side || -1);           // +1 faces right, -1 faces left
  const len = 13 + (stretch ? 9 : 0);
  const h = crouch ? 5 : 7;
  const left = cx - len / 2;
  const top = cy - h;
  const headX = cx + face * (len / 2);            // nose end
  const gait = crouch ? 0 : Math.sin(time * 16);

  // cold rim behind the whole shape
  ctx.fillStyle = 'rgba(150, 165, 190, 0.22)';
  ctx.fillRect(left - 1.5, top - 3, len + 3, h + 6);

  // legs
  ctx.fillStyle = '#0c0d12';
  for (let i = 0; i < 4; i++) {
    const lx = left + len * (0.15 + i * 0.23);
    const drop = crouch ? 2 : 3 + Math.sin(time * 16 + i * 2.3) * 1.4;
    ctx.fillRect(lx - 0.8, top + h - 1, 1.6, drop);
  }

  // body
  ctx.fillStyle = '#15161d';
  ctx.fillRect(left, top, len, h);
  ctx.fillStyle = '#0b0c11';
  ctx.fillRect(left, top + h * 0.55, len, h * 0.45);

  // head + ears-back + snout at the nose end
  ctx.fillStyle = '#15161d';
  ctx.fillRect(headX - 2.5, top - 1 + gait * 0.3, 5, h * 0.8 + 1);
  ctx.fillStyle = '#0b0c11';
  ctx.fillRect(headX - 2.2, top - 2.5, 1.6, 2);
  ctx.fillRect(headX + 0.6, top - 2.5, 1.6, 2);
  ctx.fillRect(headX + face * 2.5, top + 1, 2.5, 2);

  // eyes — amber, faint bloom
  ctx.fillStyle = 'rgba(255, 190, 70, 0.35)';
  ctx.beginPath();
  ctx.arc(headX + face * 0.5, top + 1, 3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd257';
  ctx.fillRect(headX + face * 0.5 - 1.6, top + 0.3, 1.3, 1.3);
  ctx.fillRect(headX + face * 0.5 + 0.5, top + 0.3, 1.3, 1.3);
}
