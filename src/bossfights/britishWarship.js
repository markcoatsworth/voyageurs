// The British Warship — a standalone held-arena pursuit encounter on the
// run into Kingston, separate from the British Blockade's own frigate
// gauntlet (bossfights/blockade.js) much earlier on the same leg. It used
// to be a second phase chained directly onto the blockade — the chase
// started the instant you cleared the frigate's gap, with no breathing
// room between the two fights, effectively one long encounter wearing two
// names. Split out into its own trigger downstream, originally pinned to
// the real-world position Kingston Mills once held on this route before it
// was removed as a village (see route.js's own comment on that) — but that
// landed the fight crowded right up against Kingston's own dock (only ~95
// units clear). Moved again, deliberately off that real anchor this time,
// to TRIGGER_DISTANCE's own fraction-of-the-Jones-Falls-to-Kingston-span
// placement below — a real structural change, not a tuning nudge, putting
// the fight in the middle of the run-in instead of at the very end of it.
//
// It's a HELD encounter, same pattern as bossfights/diable.js's arena:
// game.js clamps flowDistance at getChaseHoldFlowDistance() while
// isChaseHolding() is true, so it resolves on CHASE_HOLD_TIME survived or
// the hull sunk, never on distance covered. It didn't start that way — it
// used to just end once you'd made CHASE_DISTANCE units of headway past
// the frigate, the same "outrun it" shape as the blockade's own
// gap-finding. Reported through several rounds as "impossible," then
// "still too difficult," and finally "stretch this to 3-4 minutes" — that
// last one is what broke the distance model for good: the nearest village
// dock capped how far a distance-gated chase could run, and the Rideau's
// own ambient current alone covered that distance in about a minute with
// zero input at all. No combination of damage/speed/HP tuning can stretch
// a distance-gated fight past what the current carries you through in
// ~60s — only actually holding position, the way Diable's arena already
// does, can.
//
// Shootable: pistol hits on the hull sink it outright, ending the fight
// instantly as an alternative to just surviving the hold-time floor — "a
// fight where I shoot with guns, instead of just dodge and evade." Wasn't
// always reachable: the ship used to only ever sit behind the canoe, and
// weapons.js's forward-only bullets could never reach it there — became
// possible once the orbit below was reworked to keep the ship out ahead.
import { centerX, widthAt } from '../world/river/path.js';
import { worldToScreen, CANVAS_HEIGHT, CANVAS_WIDTH, PIXELS_PER_UNIT } from '../shared/config.js';
import { VILLAGES } from '../world/villages.js';
import { hashRange } from '../shared/hash.js';

const KINGSTON = VILLAGES.find((v) => v.name === 'Kingston');
const JONES_FALLS = VILLAGES.find((v) => v.name === 'Jones Falls');
// ~1/3 of the way from Jones Falls to Kingston (the last open stretch of
// the Rideau — Newboro and Jones Falls are the only two real waypoints
// between Gatineau and Kingston with nothing else in between) — explicitly
// requested as "a major structural change," moving the fight off its old
// fixed offset-before-Kingston (WARSHIP_D_OFFSET, ~95 units short of the
// dock — see git history) into the middle of the run-in instead. Leaves
// real room on both sides: ~137 units of ordinary paddling past Jones
// Falls before it triggers, ~275 more from there to Kingston's own dock —
// comfortably clear of Jones Falls' own dock behind it, and of the "well
// past the trigger" auto-resolve margin (+50) ?start=kingston needs ahead
// of it (main.js's own KINGSTON_FLOW_DISTANCE - 26 lands ~229 units past
// that margin regardless of exactly where this trigger sits).
const WARSHIP_FRACTION = 1 / 3;
export const TRIGGER_DISTANCE = JONES_FALLS.flowDistance + (KINGSTON.flowDistance - JONES_FALLS.flowDistance) * WARSHIP_FRACTION;

const VISIBLE_Z_RANGE = CANVAS_HEIGHT / PIXELS_PER_UNIT + 5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Pre-fight approach, layered on top of the instant trigger above —
// requested as "environmental effects before the music comes in and the
// ship starts shooting." First pass (fog + the ship glimpsed hazily on the
// horizon + a single distant cannon) got the order backwards: reported back
// as "the warship gets faded [in] but nothing else in the environment
// does... I want the opposite" — the ship was the only thing visibly
// changing, when it should be the payoff, not part of the buildup. Redone
// as weather, not fog: the sky darkens well before anything else, two
// ominous thunderclaps mark the approach closing, then a held, silent,
// fully-dark "brooding" stretch — and only then does the ship itself
// appear, abruptly, at TRIGGER_DISTANCE (draw() no longer renders it at all
// before that point — see the chasePhase guard there). The darkness itself
// now carries straight through the fight too ("keep the weather darkness
// along for the fight," requested once the approach existed to build it up
// — see the stormIntensity() instance method's own comment for why that
// needs its own check beyond stormIntensityAt's plain distance math), and
// clears the instant the fight resolves. None of this gates or delays the
// fight itself — it still starts the instant TRIGGER_DISTANCE
// is crossed, same as ever — it's atmospheric lead-in inside the room this
// trigger's own placement already leaves (~137 units of ordinary paddling
// past Jones Falls, per the module comment above).

// The sky starts darkening this many units before TRIGGER_DISTANCE —
// comfortably before SECOND_THUNDERCLAP_DISTANCE below, so "the weather
// goes dark" reads as its own, first beat, not something that only shows up
// alongside the thunder.
const STORM_APPROACH_DISTANCE = 115;
const STORM_START_DISTANCE = TRIGGER_DISTANCE - STORM_APPROACH_DISTANCE;

// Worst-case speed a player can be moving at when crossing
// FIRST_THUNDERCLAP_DISTANCE below — MAX_SPEED (game.js, 16 units/s on
// desktop; touch is slower, never the worst case) plus rapids' own peak
// boost (RAPIDS_BOOST, 7 units/s — rapidsStrength() in path.js is a pure
// function of position with no segment exception, so a peak can coincide
// with this approach even on the calm Rideau). Duplicated here rather than
// imported from game.js — game.js already imports this module, so the
// reverse import would be circular. Keep in sync by hand if either constant
// in game.js changes.
const WORST_CASE_SPEED = 16 + 7;
// "At least 3 seconds of advance warning," regardless of player speed —
// requested explicitly (of the original single "distant sound cue," now the
// first of the two thunderclaps). A cue fired at a *fixed distance* short of
// the trigger only guarantees a minimum lead time if that distance is sized
// off the fastest anyone can possibly be closing it: lead/speed is smallest
// exactly when speed is largest. 3.25s (not a bare 3) covers the update
// loop's own one-frame dt clamp (main.js, capped at 1/20s) — the one frame
// where flowDistance can overshoot this threshold before it's caught.
const FIRST_THUNDERCLAP_LEAD = WORST_CASE_SPEED * 3.25;
export const FIRST_THUNDERCLAP_DISTANCE = TRIGGER_DISTANCE - FIRST_THUNDERCLAP_LEAD;
// The second, closer clap — after this one, nothing else sounds until the
// fight itself kicks in. That gap (this many units of held, dark silence)
// is the "few seconds of brooding" asked for; also where stormIntensityAt
// below stops ramping and just holds at full darkness, so the darkest,
// quietest moment is the one right before the fight, not partway through
// the darkening.
const SECOND_THUNDERCLAP_DISTANCE = TRIGGER_DISTANCE - 35;

// Pure function of position, same shape as wendigo.js's frostIntensityAt:
// 0 well before the approach, ramping smoothly up to full darkness by
// SECOND_THUNDERCLAP_DISTANCE (held there through the brooding stretch),
// then snapping back to 0 past TRIGGER_DISTANCE — the held arena gets its
// own look from the hull/hazards/ship, not a lingering storm over the
// gunnery.
export function stormIntensityAt(flowDistance) {
  if (flowDistance <= STORM_START_DISTANCE || flowDistance >= TRIGGER_DISTANCE) return 0;
  if (flowDistance >= SECOND_THUNDERCLAP_DISTANCE) return 1;
  return smoothstep((flowDistance - STORM_START_DISTANCE) / (SECOND_THUNDERCLAP_DISTANCE - STORM_START_DISTANCE));
}

// A quick, bright flicker right at each thunderclap — pure function of
// position again (like the rest of this approach), decaying over a handful
// of units rather than real time so it doesn't need its own clock. Two
// independent windows, one per clap; draw() takes the max of the two.
const CLAP_FLASH_WINDOW = 5;
function clapFlashAt(flowDistance, clapDistance) {
  const t = flowDistance - clapDistance;
  if (t < 0 || t > CLAP_FLASH_WINDOW) return 0;
  return 1 - t / CLAP_FLASH_WINDOW;
}
export function stormFlashAt(flowDistance) {
  return Math.max(
    clapFlashAt(flowDistance, FIRST_THUNDERCLAP_DISTANCE),
    clapFlashAt(flowDistance, SECOND_THUNDERCLAP_DISTANCE),
  );
}

// --- the second, heavier layer of the approach ------------------------------
// Asked for once the storm above existed: "the mood to get dark in the
// seconds leading up to the fight: visuals getting darker, more weather,
// and game clearly leading into a brutal fight." stormIntensityAt alone
// plateaus at SECOND_THUNDERCLAP_DISTANCE and the brooding stretch after it
// just held that same grey — flat, when it should be the darkest, heaviest
// moment. Everything below is layered on top of it, and the rain, wind and
// music ducking in game.js all key off these same pure functions.

// Gloom: a second ramp, 0 -> 1 across the brooding stretch alone (second
// clap -> trigger), on top of stormIntensityAt's own 0 -> 1 before it. Drives
// the extra near-black wash and the vignette in game.js's render() — so the
// scene keeps getting darker right up until the ship appears, instead of
// stalling at "overcast" for the last few seconds. Snaps to 0 past
// TRIGGER_DISTANCE like stormIntensityAt; the instance method below holds
// it (lower) through the fight.
export function stormGloomAt(flowDistance) {
  if (flowDistance <= SECOND_THUNDERCLAP_DISTANCE || flowDistance >= TRIGGER_DISTANCE) return 0;
  return smoothstep((flowDistance - SECOND_THUNDERCLAP_DISTANCE) / (TRIGGER_DISTANCE - SECOND_THUNDERCLAP_DISTANCE));
}
// How much of that gloom stays on through the held arena. Full gloom
// (the wash + vignette in game.js) on top of the fight's own held storm
// buried the cannonballs' telegraphs in the dark; this keeps the "darkest
// right before" beat — it visibly lifts a little the instant the ship is
// on you — without the fight being unreadable.
const FIGHT_GLOOM = 0.4;

// Sheet lightning: irregular, silent flickers across the whole sky between
// the two scripted claps, so the storm is alive rather than two isolated
// bangs — same schedule idea as chasseGalerie.js's lightningFlash (one
// hashed window per fixed period, so it's a pure function of time and
// needs no state), gated by how far the storm has come in: nothing until
// the sky has visibly turned, then brighter as it deepens. Time here is
// this module's own clock (stormT in the instance below), not game.js's —
// this module never sees this.time.
// 2.2s, with each flash landing anywhere in the first ~1.4s of its slot,
// gives gaps of 1-3.4s between flashes — irregular enough not to read as
// a metronome. A first cut (3.6s slots, a quarter of them skipped
// outright) left a 7.5s dead gap right at the start of the schedule,
// which at full paddling speed is the *entire* build-up (the ramp from
// the sky turning to the second clap is ~80 units, under 5s flat out) —
// the smoke test's flat-out approach saw no lightning at all.
const FLICKER_PERIOD = 2.2;
const FLICKER_MIN_STORM = 0.2;
function flickerEnvelope(time) {
  const idx = Math.floor(time / FLICKER_PERIOD);
  const local = time - idx * FLICKER_PERIOD;
  const start = hashRange(idx, 5, 0.2, FLICKER_PERIOD - 0.8);
  const t = local - start;
  if (t < 0 || t > 0.45) return 0;
  const envelope = 1 - t / 0.45;
  // Two-stroke flicker — the main flash, a dip, a fainter restrike.
  const stroke = (t < 0.07 || (t > 0.14 && t < 0.2)) ? 1 : 0.3;
  return envelope * stroke;
}
export function stormFlickerAt(flowDistance, time) {
  const storm = stormIntensityAt(flowDistance);
  if (storm < FLICKER_MIN_STORM) return 0;
  const gate = (storm - FLICKER_MIN_STORM) / (1 - FLICKER_MIN_STORM);
  return flickerEnvelope(time) * gate;
}
// A distant rumble (sfx.js's playDistantRumble) accompanies each flicker
// only while the storm is still building — between STORM_START_DISTANCE
// and SECOND_THUNDERCLAP_DISTANCE. The brooding stretch after the second
// clap stays thunder-silent on purpose (that held silence, with only the
// rain/wind bed under it, is the beat the whole approach is built toward —
// see SECOND_THUNDERCLAP_DISTANCE's own comment); lightning there is
// visual only.
function rumblesAllowedAt(flowDistance) {
  return flowDistance > STORM_START_DISTANCE && flowDistance < SECOND_THUNDERCLAP_DISTANCE;
}

// Squall gusts: a lateral shove on the canoe that rises with the storm,
// gusting (two non-harmonic sines over the module's own clock, so it
// swings side to side unpredictably) rather than the Chasse-galerie's
// steady positional crosswind. Same units as that one (world units/s²,
// applied before game.js's STEER_MAX clamp); peak strength sits well
// under chasseGalerie.js's WIND_STRENGTH (3.5) — it's weather you feel in
// the paddle, not a hazard, and only during the approach: the instance
// method below zeroes it the moment the held arena starts, where lateral
// control is the dodge and the fight has already been toned down twice
// (see CHASE_CANNON_DAMAGE's own comment).
const GUST_STRENGTH = 2.2;
export function stormGustAt(flowDistance, time) {
  const storm = stormIntensityAt(flowDistance);
  if (storm <= 0) return 0;
  const gust = 0.6 * Math.sin(time * 0.9) + 0.4 * Math.sin(time * 2.3 + 1.7);
  return GUST_STRENGTH * gust * storm;
}

// Reported as "impossible," then "still too difficult" through two rounds
// of tone-down — landing shots on a moving target while also dodging its
// return fire, at anything close to the old approach frigate's own
// broadside, left no margin for the learning curve of tracking a swinging
// ship.
const CHASE_CANNON_DAMAGE = 4;
const CHASE_VOLLEY_INTERVAL = 3.2; // was 2.2, then 1.6, then 1.3 — under half the original rate now
// The chase's real win condition: survive this long, held in place, and
// it's called off — same idea as simply outrunning it used to be, just
// time-gated instead of distance-gated so it can't be resolved in under a
// minute by construction. 210s (3.5min) — the middle of a requested 3-4
// minute range. Sinking the ship (CHASE_HULL_HP below) still ends it
// immediately for a player who'd rather fight than wait it out — a
// skill-based shortcut, not a replacement for this floor.
const CHASE_HOLD_TIME = 210;

// Circling pursuit: reported as "floats next to me instead of engaging" —
// an early version just held a straight trailing distance directly behind
// on the river centerline, with CHASE_VOLLEY_INTERVAL above never actually
// read anywhere, so nothing fired. Worse, it was structurally invisible:
// CANOE_SCREEN_Y sits only 55px above the bottom of a 220px canvas (a
// deliberate choice so most of the canvas shows what's ahead), which is
// worldToScreen's flat, no-perspective scale means only ~3.4 world units
// of "behind the canoe" ever render at all — the old fixed 4-unit trailing
// gap was screen y = CANOE_SCREEN_Y + 4*16 = 229, already past
// CANVAS_HEIGHT. There's roughly 10 units of room *ahead* by the same
// math, though. Since the escape/win check is entirely about the player's
// own flowDistance against a fixed line — this ship's position never
// factors in — there's nothing stopping it from swinging out ahead as
// part of circling the canoe, and that's exactly what actually keeps it on
// screen: it orbits from a few units behind to well out in front, so
// "chasing from behind" becomes a real naval pass, cutting across the bow
// to bring its guns to bear, rather than a boat that's mathematically
// present but never actually visible.
// Reported again once the ship *was* reliably visible: "too chaotic... a
// random mess that screams all over the interface" — not "I can't see it"
// any more but "I can't track or aim at it." Root cause was the full circle
// itself: half of every lap swung the ship into the "behind" half of the
// orbit (down toward CHASE_ANCHOR_LEAD - RADIUS_Z, i.e. as close as 2 units
// behind — see the still-accurate history above on how little screen room
// that leaves), so twice a lap it shrank toward the bottom edge and swelled
// back out, on top of cutting side to side the whole time — a target that's
// simultaneously changing range, side, and size doesn't read as "a ship to
// shoot," it reads as noise. Fixed by keeping the forward offset one-signed:
// orbitForward in update() below now runs 0..RADIUS_Z (a bob, not a swing),
// so the ship only ever moves *further* ahead of CHASE_ANCHOR_LEAD and back,
// never behind — always on screen, always closing/receding in one
// predictable rhythm. Slowed and tightened further since (3.4s -> 5.2s ->
// the current value; 6.5 -> 5.5 -> the current radius) — reported as "slow
// down the speed of that boat" even after the first slowdown — a gentle,
// easy-to-predict bob rather than a boat that's constantly on the move.
const CHASE_ORBIT_PERIOD = 9;
const CHASE_ORBIT_RADIUS_X = 3;
const CHASE_ORBIT_RADIUS_Z = 4;
// Where the orbit's forward bob starts from, relative to the player — the
// ship's actual lead ranges CHASE_ANCHOR_LEAD..CHASE_ANCHOR_LEAD+RADIUS_Z
// (3 to 8 units ahead), always in front, never behind.
const CHASE_ANCHOR_LEAD = 3;
// The ship's position is computed directly from the player's own current
// flowDistance every frame (see update()) rather than tracked through a
// persistent, independently-accumulating "chase speed" — a first version
// tried that (a fixed CHASE_SHIP_SPEED racing the player's own speed, then
// later a smoothed/exponential version of the same idea), and both have
// the same failure mode: how fast the ship reaches a well-composed
// on-screen position ends up depending on the *difference* between its
// speed and the player's, which is small (or, for a smoothed tracker
// chasing a steadily-moving target, a fixed non-zero lag) precisely when
// the player is paddling hard the whole fight — reproducing "floats next
// to me" for the entire chase regardless of the orbit math being correct
// in isolation. Deriving position directly from the player's *current*
// flowDistance has no such lag by construction — only CHASE_INTRO_TIME
// below, a fixed real-time easing for the opening beat, is time-based.
const CHASE_INTRO_TIME = 1.1; // seconds the "closing in" opening beat takes
const CHASE_INTRO_EXTRA_GAP = 10; // how much further behind it starts, easing to 0
const CHASE_BANK_MARGIN = 3; // keep the hull's own half-width clear of the bank while orbiting
const MUZZLE_FLASH_LIFETIME = 0.3;
const SPARK_LIFETIME = 0.35;

// The ship's own hull dimensions — module-level (not local to
// drawChaseShip) so update()'s hit-test below and the drawing use exactly
// the same hull, not two independently-guessed sizes. Reported as "too
// big" alongside wide/janky proportions fixed earlier; shrunk further on
// top of that fix, keeping the same ~2.3:1 length:beam ratio.
const CHASE_SHIP_BEAM = 2.2;
const CHASE_SHIP_LENGTH_HALF = 2.5;
// Split by weapon — reported as "can't see much difference in damage"
// between the pistol and the musket (weapons.js's own fire-rate split,
// same report). Musket fires roughly a third as often (weapons.js's
// FIRE_COOLDOWN) for roughly 2.25x the damage per hit — a slower, heavier
// gun, not just a reskinned pistol.
export const PISTOL_DAMAGE_TO_HULL = 8;
export const MUSKET_DAMAGE_TO_HULL = 18;

// Went through several passes before this one: 64, then 40, both from
// before the held-arena redesign — solving the wrong problem back then,
// since the old distance-gated escape capped the whole encounter under a
// minute regardless of this number. Then 200, right after the redesign —
// reported as "way too easy... went down in just a handful of shots,"
// which tracks: a scripted continuous-fire test bot (same aim strategy as
// this file's own smoke-test scenario, just left running instead of
// stopping at first resolution) sank 200 HP in under 5 seconds. Then 3400
// (~203s for that bot, just under CHASE_HOLD_TIME above) — landed there
// against the pre-split combined file; splitting the fight out to its own
// module and its own, much further downstream trigger shifted the same
// bot's real hit rate slightly (a different stretch of river, a fresh
// orbit each run) — close enough that 3400 sometimes ran past the 210s
// floor before sinking instead of comfortably under it. Recalibrated
// against the same bot again rather than guessed: 3000 sinks in ~189s,
// consistently, with real margin back under the floor — a real human,
// slower and less consistent than a scripted bot, still lands squarely in
// the requested 3-4 minutes either way.
const CHASE_HULL_HP = 3000;
// Wider than a stationary hull's own tolerance would be, because the
// target itself is moving every frame here, not just the bullet crossing a
// fixed band. Loosened further (2.2 -> 3) in the same "impossible"
// tone-down pass as CHASE_HULL_HP — a near-miss on a swinging target
// should still land.
const CHASE_HULL_D_TOLERANCE = 3;

export function createBritishWarship() {
  let started = false; // the encounter has been triggered at all — see wellPast below for the one way this can become true without a real fight happening
  let resolved = false;

  // Held arena — see the module's own opening comment.
  let chasePhase = false;
  let chaseIntroT = 0; // seconds since the hold started, for the opening "closing in" ease
  let chaseOrbitAngle = 0;
  let chaseShipD = 0; // the ship's actual, orbit-adjusted flowDistance this frame — what draw() and firing both use
  let chaseShipWorldX = 0; // ditto, lateral position
  let chaseEscaped = false;
  let justStartedChase = false;
  let chaseHoldFlowDistance = 0;
  let chaseHoldT = 0;
  let volleyTimer = CHASE_VOLLEY_INTERVAL;
  let hazards = [];
  let sparks = [];
  let muzzleFlashes = [];
  let chaseHullHP = CHASE_HULL_HP;
  let chaseSunk = false;
  let justSunk = false;
  let clap1Fired = false; // latches once FIRST_THUNDERCLAP_DISTANCE is crossed — never resets on its own
  let clap2Fired = false; // ditto, SECOND_THUNDERCLAP_DISTANCE
  let stormT = 0; // this module's own clock for the flicker/gust schedules — advanced every update()
  let flickerWas = 0; // last frame's flicker level, for rising-edge rumble detection
  let stormArrived = false; // latches on crossing STORM_START_DISTANCE (the "sky goes black" banner)
  let justStormArrived = false;

  function reset() {
    started = false;
    resolved = false;
    clap1Fired = false;
    clap2Fired = false;
    stormT = 0;
    flickerWas = 0;
    stormArrived = false;
    justStormArrived = false;
    chasePhase = false;
    chaseIntroT = 0;
    chaseOrbitAngle = 0;
    chaseShipD = 0;
    chaseShipWorldX = 0;
    chaseEscaped = false;
    justStartedChase = false;
    chaseHoldFlowDistance = 0;
    chaseHoldT = 0;
    volleyTimer = CHASE_VOLLEY_INTERVAL;
    hazards = [];
    sparks = [];
    muzzleFlashes = [];
    chaseHullHP = CHASE_HULL_HP;
    chaseSunk = false;
    justSunk = false;
  }

  return {
    reset,
    // Held arena, same contract as diable.js's isHolding(): true while the
    // fight is live and unresolved, so game.js clamps flowDistance at
    // getChaseHoldFlowDistance() every frame this holds.
    isChaseHolding() {
      return chasePhase;
    },
    getChaseHoldFlowDistance() {
      return chaseHoldFlowDistance;
    },
    consumeJustStartedChase() {
      const v = justStartedChase;
      justStartedChase = false;
      return v;
    },
    consumeJustEscaped() {
      const v = chaseEscaped && !chasePhase; // only true for one frame
      if (v) chaseEscaped = false;
      return v;
    },
    consumeJustSunk() {
      const v = justSunk;
      justSunk = false;
      return v;
    },
    // Same wrapper convention as wendigo.js's frostIntensity /
    // loupGarou.js's nightIntensity — game.js's render() calls these rather
    // than reaching for the module-level stormIntensityAt/stormFlashAt
    // directly. stormIntensity in particular isn't a plain pass-through:
    // held at full darkness for the whole fight — requested explicitly
    // ("keep the weather darkness along for the fight") after the first cut
    // (stormIntensityAt alone, which snaps to 0 at TRIGGER_DISTANCE) meant
    // the storm vanished the instant combat started. flowDistance itself is
    // clamped at chaseHoldFlowDistance (>= TRIGGER_DISTANCE) for the whole
    // hold, so stormIntensityAt(flowDistance) alone always reads 0 through
    // it regardless — chasePhase is checked directly here instead. Clears
    // again the instant the fight resolves: flowDistance moves forward past
    // TRIGGER_DISTANCE the very next frame, where stormIntensityAt already
    // returns 0 by construction, so no separate fade-out is needed.
    stormIntensity(flowDistance) {
      return chasePhase ? 1 : stormIntensityAt(flowDistance);
    },
    stormFlash(flowDistance) {
      return stormFlashAt(flowDistance);
    },
    // The heavier layer (see stormGloomAt and friends above), same
    // chasePhase treatment as stormIntensity(): the pure functions all
    // read 0 through the hold (flowDistance is clamped at/after
    // TRIGGER_DISTANCE), so the fight's own held levels are set here.
    stormGloom(flowDistance) {
      return chasePhase ? FIGHT_GLOOM : stormGloomAt(flowDistance);
    },
    // Flicker keeps going through the fight (the storm is still overhead),
    // scaled down so a flash never masks a cannonball's telegraph.
    stormFlicker(flowDistance) {
      return chasePhase ? flickerEnvelope(stormT) * 0.5 : stormFlickerAt(flowDistance, stormT);
    },
    // How much of the wind/rain audio bed (sfx.js's setStormBed) to run —
    // the storm's own level, held at full through the fight like the
    // darkness.
    stormBedLevel(flowDistance) {
      return chasePhase ? 1 : stormIntensityAt(flowDistance);
    },
    // Ambient music ducks out as the storm comes in — gone entirely by the
    // second clap, so the brooding stretch is nothing but rain and wind
    // before the pursuit track lands at full at the trigger ("game clearly
    // leading into a brutal fight"). 1 = untouched. Through the hold the
    // boss track itself is playing, at full.
    musicDuck(flowDistance) {
      return chasePhase ? 1 : 1 - stormIntensityAt(flowDistance);
    },
    windAccel(flowDistance) {
      return chasePhase ? 0 : stormGustAt(flowDistance, stormT);
    },
    consumeJustStormArrived() {
      const v = justStormArrived;
      justStormArrived = false;
      return v;
    },
    // Same convention as diable.js's debugCentreX() — test/autopilot support
    // for aiming at a moving target, not used by game.js's own rendering.
    debugChaseShipPosition() {
      return { worldX: chaseShipWorldX, flowDistance: chaseShipD };
    },

    // onHit(entry) is only ever called with { type: 'cannon' } — game.js's
    // handleHit() gives it its own damage amount via entry.damage, same
    // pattern as every other hazard type. effectiveSpeed is needed to lead
    // each shot's target ahead of the canoe's current position — without
    // it, every shot whiffs by construction, not because it was dodged.
    // `bullets` is the player's live pistol shots (weapons.js's
    // getBullets(), world-space {worldX, flowDistance}) — checked against
    // the hull below. Returns hitBullets: [ref] (shots that struck the
    // hull this frame), same contract as bossfights/diable.js's update(),
    // for game.js to remove from the weapon pool. damageGivenScale (default
    // 1) is game.js's this.damageGivenScale — the ?difficulty=easy knob's
    // "more damage dealt" half (see game.js's own EASY_DAMAGE_GIVEN_SCALE
    // comment); applied to the hull hit below, nowhere else in this file.
    update(dt, playerFlowDistance, playerWorldX, effectiveSpeed, onHit, bullets = [], damageGivenScale = 1) {
      const hitBullets = [];

      // If the player starts well past the trigger (e.g. ?start=kingston),
      // auto-resolve it as if the fight never happened — no banner, no
      // hold, nothing to clean up.
      const wellPast = !started && !resolved && playerFlowDistance > TRIGGER_DISTANCE + 50;
      if (wellPast) {
        started = true;
        resolved = true;
        console.log('[WARSHIP] Auto-resolved (started past it)');
      }

      // The two thunderclaps (see FIRST_THUNDERCLAP_DISTANCE's own comment)
      // — gated on !resolved, not !started: both distances always sit
      // before TRIGGER_DISTANCE, so in the ordinary case these fire first
      // and started/resolved are still both false. The wellPast branch
      // above sets resolved before this runs, in the same tick — that's
      // what keeps a cheat/checkpoint spawn well past the fight from ever
      // hearing thunder for an encounter it already skipped. Counted rather
      // than flagged (thunderCount below, same idiom as boomCount) so
      // game.js can just loop playThunderclap() the same way it already
      // loops playCannonBoom() for hazards.
      let thunderCount = 0;
      // The storm's own clock only runs once the approach has begun — it
      // seeds the flicker/gust schedules, and there's nothing to schedule
      // before then.
      if (playerFlowDistance > STORM_START_DISTANCE) stormT += dt;
      // "The sky goes black" — one banner as the weather first turns
      // (game.js shows it), same !resolved gating as the claps so a spawn
      // past the fight never announces a storm it skipped.
      if (!stormArrived && !resolved && playerFlowDistance >= STORM_START_DISTANCE) {
        stormArrived = true;
        justStormArrived = true;
      }
      // Distant rumbles ride the sheet-lightning flickers' rising edges
      // (see rumblesAllowedAt for where they're allowed) — counted like
      // thunderCount but kept separate from it, since the two scripted
      // claps are their own, louder, exactly-twice beat.
      let rumbleCount = 0;
      if (!resolved && !chasePhase) {
        const flicker = stormFlickerAt(playerFlowDistance, stormT);
        if (flicker > 0 && flickerWas === 0 && rumblesAllowedAt(playerFlowDistance)) rumbleCount++;
        flickerWas = flicker;
      }
      if (!clap1Fired && !resolved && playerFlowDistance >= FIRST_THUNDERCLAP_DISTANCE) {
        clap1Fired = true;
        thunderCount++;
      }
      if (!clap2Fired && !resolved && playerFlowDistance >= SECOND_THUNDERCLAP_DISTANCE) {
        clap2Fired = true;
        thunderCount++;
      }

      if (!started && !resolved && playerFlowDistance >= TRIGGER_DISTANCE) {
        started = true;
        resolved = true; // the approach itself is instantaneous — see the module comment
        chasePhase = true;
        chaseIntroT = 0;
        chaseOrbitAngle = 0;
        justStartedChase = true;
        // Held arena starts here — game.js clamps flowDistance at this
        // exact point (wherever the player happened to cross the trigger)
        // for the rest of the fight. See the module's own opening comment.
        chaseHoldFlowDistance = playerFlowDistance;
        chaseHoldT = 0;
        volleyTimer = CHASE_VOLLEY_INTERVAL;
        hazards = [];
        console.log('[WARSHIP] Started. Player:', playerFlowDistance);
      }

      // Ticks and expires every hazard unconditionally, regardless of
      // whether the hold is still live — a shot fired right before the
      // fight resolves must still finish its own lifecycle and get cleaned
      // up, not freeze mid-telegraph forever.
      let boomCount = 0;
      for (const h of hazards) {
        h.t += dt;
        const hot = h.t >= 0.65 && h.t < 0.65 + 0.3;
        if (hot && !h.boomed) {
          h.boomed = true;
          boomCount++;
        }
        if (hot && !h.hit) {
          if (Math.abs(playerFlowDistance - h.d) < 2.2 && Math.abs(playerWorldX - h.x) < 1.3) {
            h.hit = true;
            onHit({ type: 'cannon', damage: CHASE_CANNON_DAMAGE });
          }
        }
      }
      hazards = hazards.filter((h) => h.t < 0.65 + 0.3 + 0.15);

      // Hit sparks: pure visual feedback for a landed shot, ticked the same
      // unconditional way as hazards above.
      for (const s of sparks) s.t += dt;
      sparks = sparks.filter((s) => s.t < SPARK_LIFETIME);

      if (chasePhase) {
        // Position is a direct function of the player's *current*
        // flowDistance plus the orbit offset — not a tracked/accumulated
        // value — so there's no convergence to wait on and no dependence
        // on the player's own speed (see CHASE_INTRO_* comment above for
        // why that matters). Only the opening beat eases in over fixed
        // real time, via chaseIntroT, independent of anything else.
        chaseIntroT = Math.min(chaseIntroT + dt, CHASE_INTRO_TIME);
        const introFrac = 1 - chaseIntroT / CHASE_INTRO_TIME; // 1 -> 0 over CHASE_INTRO_TIME
        const introExtraGap = introFrac * CHASE_INTRO_EXTRA_GAP;

        chaseOrbitAngle += dt * (2 * Math.PI / CHASE_ORBIT_PERIOD);
        const orbitLateral = Math.sin(chaseOrbitAngle) * CHASE_ORBIT_RADIUS_X;
        // 0..RADIUS_Z, never negative — see CHASE_ORBIT_PERIOD's own comment
        // on why the ship never swings behind the canoe.
        const orbitForward = (1 - Math.cos(chaseOrbitAngle)) * 0.5 * CHASE_ORBIT_RADIUS_Z;
        chaseShipD = playerFlowDistance + CHASE_ANCHOR_LEAD + orbitForward - introExtraGap;
        const half = widthAt(chaseShipD) / 2 - CHASE_BANK_MARGIN;
        const c = centerX(chaseShipD);
        chaseShipWorldX = clamp(playerWorldX + orbitLateral, c - half, c + half);

        // Shootable: the orbit swings this ship out ahead of the canoe, so
        // a bullet's flowDistance can land near chaseShipD. Chasing this
        // against `bullets` even while sinking is harmless (chaseHullHP is
        // already clamped to 0 by then) so no extra guard is needed to
        // stop hits piling up past zero. Lateral tolerance (the "+ 1.6"
        // below) widened in the "impossible" tone-down pass — a shot
        // that's close but not dead-center on a swinging target should
        // still connect.
        for (const b of bullets) {
          if (Math.abs(b.flowDistance - chaseShipD) < CHASE_HULL_D_TOLERANCE
            && Math.abs(b.worldX - chaseShipWorldX) < CHASE_SHIP_BEAM / 2 + 1.6) {
            hitBullets.push(b);
            if (chaseHullHP > 0) {
              chaseHullHP -= (b.type === 'musket' ? MUSKET_DAMAGE_TO_HULL : PISTOL_DAMAGE_TO_HULL) * damageGivenScale;
              sparks.push({ x: b.worldX, d: chaseShipD, t: 0 });
              if (chaseHullHP <= 0) {
                chaseHullHP = 0;
                // A small burst on top of the usual single spark — the kill
                // shot should read as more than just another hit.
                for (let i = 0; i < 5; i++) {
                  sparks.push({ x: chaseShipWorldX + (Math.random() * 2 - 1) * CHASE_SHIP_BEAM, d: chaseShipD, t: -i * 0.05 });
                }
              }
            }
          }
        }

        if (chaseHullHP <= 0) {
          chasePhase = false;
          chaseSunk = true;
          justSunk = true;
          // A shot already in flight from a volley fired moments earlier
          // shouldn't still land after the ship that fired it is gone.
          hazards = [];
          console.log('[WARSHIP] Sunk!');
        } else {
          // Bow cannon: a real volley, led the same way splash hazards
          // elsewhere in the game are — tagged with the ship's current
          // position so drawHazard can render the shot as actually coming
          // from the hull, not materializing out of nowhere.
          volleyTimer -= dt;
          if (volleyTimer <= 0) {
            volleyTimer = CHASE_VOLLEY_INTERVAL;
            muzzleFlashes.push({ x: chaseShipWorldX, d: chaseShipD, t: 0 });
            hazards.push({
              d: playerFlowDistance + effectiveSpeed * 0.65 + (Math.random() * 2 - 1) * 1.2,
              x: playerWorldX + (Math.random() * 2 - 1) * 3.5,
              t: 0,
              hit: false,
              boomed: false,
              fromX: chaseShipWorldX,
              fromD: chaseShipD,
            });
          }

          // Time survived, held in place, not distance made good. Sinking
          // the ship above is a separate, immediate way to end the fight;
          // this is the floor everyone gets regardless of how the gunnery
          // goes.
          chaseHoldT += dt;
          if (chaseHoldT >= CHASE_HOLD_TIME) {
            chasePhase = false;
            chaseEscaped = true;
            console.log('[WARSHIP] Escaped!');
          }
        }

        for (const f of muzzleFlashes) f.t += dt;
        muzzleFlashes = muzzleFlashes.filter((f) => f.t < MUZZLE_FLASH_LIFETIME);

        // A genuine health bar: full when the hold starts, draining toward
        // 0 exactly as the hull sinks. CHASE_HOLD_TIME above is still the
        // floor everyone gets regardless of gunnery; it just isn't what
        // this bar shows.
        const chaseHullPct = clamp((chaseHullHP / CHASE_HULL_HP) * 100, 0, 100);
        return { active: true, progressPct: chaseHullPct, boomCount, chaseShipDistance: chaseShipD, hitBullets, thunderCount, rumbleCount };
      }

      return { active: false, progressPct: 0, boomCount, hitBullets, thunderCount, rumbleCount };
    },

    // Rendering doesn't care whether the encounter is currently "active" by
    // update()'s gating — it just draws whatever's within visible range,
    // same as villages.js's own drawVillages().
    draw(ctx, worldDistance, cameraWorldX) {
      // Deliberately no ship rendering at all before chasePhase below — the
      // whole point of the redone approach (see this file's own module
      // comment) is that the ship is the payoff, not part of the buildup.
      // It appears abruptly the instant the fight starts, not faded in
      // ahead of time.

      // Hazards (cannon shots) — carry fromX/fromD (the firing ship's
      // position at spawn) so they render as a tracer shot from the hull,
      // not a shell materializing out of nowhere.
      for (const h of hazards) {
        const z = worldDistance - h.d;
        const zFrom = worldDistance - h.fromD;
        if (Math.abs(z) < VISIBLE_Z_RANGE || Math.abs(zFrom) < VISIBLE_Z_RANGE) {
          drawHazard(ctx, h, z, cameraWorldX, zFrom);
        }
      }

      // Hull hit sparks — a landed pistol shot
      for (const s of sparks) {
        const z = worldDistance - s.d;
        if (Math.abs(z) < VISIBLE_Z_RANGE) drawSpark(ctx, s, z, cameraWorldX);
      }

      if (chasePhase) {
        const chaseZ = worldDistance - chaseShipD;
        if (Math.abs(chaseZ) < VISIBLE_Z_RANGE) {
          try {
            ctx.save();
            drawChaseShip(ctx, cameraWorldX, chaseZ, chaseShipWorldX);
            ctx.restore();
          } catch (e) {
            console.error('[WARSHIP] Error drawing chase ship:', e);
            ctx.restore(); // try to restore even if there was an error
          }
        }

        // Muzzle flash: a bright burst at the gunport the instant a volley
        // fires, so the shot visibly comes from the ship, not just from a
        // hazard appearing near the player a moment later.
        for (const f of muzzleFlashes) {
          const fz = worldDistance - f.d;
          if (Math.abs(fz) < VISIBLE_Z_RANGE) drawMuzzleFlash(ctx, f, fz, cameraWorldX);
        }
      }
    },
  };
}

function drawChaseShip(ctx, cameraWorldX, z0, shipWorldX) {
  // Royal Navy gunboat - clear ship silhouette with pointed bow. A nimble
  // single-chase cutter, not a ship-of-the-line.
  // worldToScreen has no perspective falloff (flat PIXELS_PER_UNIT scale),
  // so these world units are screen pixels directly. shipWorldX is the
  // orbit-adjusted position update() computed this frame, not the river
  // centerline.
  //
  // BEAM (across) vs LENGTH_HALF (along direction of travel): a first pass
  // used a 5-unit beam against only a 3-unit (1.5 each way) length, i.e. a
  // hull *wider than it is long* — backwards for any boat, and exactly what
  // read as "too wide, doesn't look like a real boat." A real ship's length
  // is a multiple of its beam, never the other way around. Every dimension
  // below is deliberately built off BEAM (width axis, left/right.x) or
  // LENGTH_PX (length axis, top/bottom.y) separately — a few of the old
  // sail/yard measurements mistakenly scaled off the *length* axis, which
  // is harmless when both axes happen to be similar (the old, wrong
  // proportions) but blows up into oversized sails the instant the length
  // axis actually gets longer than the beam, as it must for the hull shape
  // itself to be fixed. Module-level (CHASE_SHIP_BEAM/CHASE_SHIP_LENGTH_HALF
  // above) so update()'s hit-test uses this exact same hull, not a second,
  // independently-guessed size.
  const BEAM = CHASE_SHIP_BEAM;
  const LENGTH_HALF = CHASE_SHIP_LENGTH_HALF;
  const left = worldToScreen(shipWorldX - BEAM / 2, z0 - LENGTH_HALF, cameraWorldX);
  const right = worldToScreen(shipWorldX + BEAM / 2, z0 + LENGTH_HALF, cameraWorldX);
  const top = Math.min(left.y, right.y);
  const bottom = Math.max(left.y, right.y);
  const lenPx = bottom - top; // along the hull's length (bow-to-stern axis)
  const beamPx = right.x - left.x; // across the hull's beam (side-to-side axis)
  const shipCenterX = (left.x + right.x) / 2;

  // Wake: two curved, fading foam streaks trailing from the stern, drawn
  // first so the hull covers their near end — the cheapest cue that this
  // thing is actually underway and fast, not sitting still. A pair of
  // straight uniform lines read as thin spindly legs stuck on the bottom
  // of the hull rather than water — curving them outward (a real wake
  // widens as it falls behind) and fading them out with alpha instead of
  // a flat stroke reads as spreading foam instead.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(shipCenterX + side * beamPx * 0.18, bottom - 2);
    ctx.quadraticCurveTo(
      shipCenterX + side * beamPx * 0.35, bottom + lenPx * 0.18,
      shipCenterX + side * beamPx * 0.7, bottom + lenPx * 0.32,
    );
    ctx.strokeStyle = 'rgba(220, 235, 240, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // HULL SHAPE - pointed bow, flat-ish transom stern. The taper is entirely
  // in beamPx-relative fractions so the outline scales correctly regardless
  // of hull size, and — critically — the gunport stripe below is placed
  // well clear of the taper zones at both ends so it can never overflow
  // past the hull's actual (narrower, at that height) silhouette the way a
  // flat full-beam rectangle did when it was placed too close to the stern
  // taper: it showed ochre color sticking out past the hull outline there.
  ctx.fillStyle = '#3a2716';
  ctx.strokeStyle = '#0d0805';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(shipCenterX, top - beamPx * 0.3); // pointed bow
  ctx.lineTo(right.x, top + lenPx * 0.22); // full beam reached
  ctx.lineTo(right.x - beamPx * 0.06, bottom - lenPx * 0.08); // start narrowing to the transom
  ctx.lineTo(shipCenterX + beamPx * 0.42, bottom); // stern corner — a flat transom, not a second point
  ctx.lineTo(shipCenterX - beamPx * 0.42, bottom); // stern corner
  ctx.lineTo(left.x + beamPx * 0.06, bottom - lenPx * 0.08);
  ctx.lineTo(left.x, top + lenPx * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Deck - lighter wood showing ship interior, inset from the hull outline
  // by beamPx-relative margins (an absolute pixel inset looked fine at a
  // much wider old beam but oversized now that beamPx is genuinely
  // ship-sized).
  ctx.fillStyle = '#4a3520';
  ctx.beginPath();
  ctx.moveTo(shipCenterX, top - beamPx * 0.1);
  ctx.lineTo(right.x - beamPx * 0.15, top + lenPx * 0.26);
  ctx.lineTo(right.x - beamPx * 0.2, bottom - lenPx * 0.16);
  ctx.lineTo(shipCenterX + beamPx * 0.2, bottom - lenPx * 0.03);
  ctx.lineTo(shipCenterX - beamPx * 0.2, bottom - lenPx * 0.03);
  ctx.lineTo(left.x + beamPx * 0.2, bottom - lenPx * 0.16);
  ctx.lineTo(left.x + beamPx * 0.15, top + lenPx * 0.26);
  ctx.closePath();
  ctx.fill();

  // Everything from here down was redone together off a rasterized look
  // at the sprite (three points reported at once: "the flag should be
  // closer to the mast," "the sail looks like a big white block instead
  // of an obvious sail," "there should be obvious cannons on the sprite,
  // 3 per side"). What it replaced: three masts standing side by side
  // *across* the bow, each with a sail 1.6 beams wide — they overlapped
  // into one ~2.7-beam white slab ahead of the hull; the flag on its own
  // pole half a hull-length ahead of the bow, attached to nothing; and a
  // "Nelson chequer" gunport stripe running across the deck (a side-view
  // detail on a top-down sprite) that the deck fill, drawn after it,
  // mostly buried anyway.
  //
  // The hull's full-beam midsection — between the bow taper ending at
  // top + 0.22·len and the stern taper starting at bottom − 0.08·len (the
  // hull-shape comment above). Everything along the sides is placed
  // inside this so it never overflows the taper zones.
  const fullBeamTop = top + lenPx * 0.22;
  const fullBeamBottom = bottom - lenPx * 0.08;
  // The side's actual x at a given y inside that zone: the hull outline
  // narrows by 0.06·beam over the zone's length, so this tracks it
  // exactly rather than assuming a straight vertical side.
  const sideInsetAt = (y) => beamPx * 0.06 * clamp((y - fullBeamTop) / (fullBeamBottom - fullBeamTop), 0, 1);

  // Gun deck rails — a thin ochre strip along each side (the one bit of the
  // old chequer that reads from above: the painted gunwale), with a black
  // gunport notched into it at each cannon.
  const railTop = top + lenPx * 0.28;
  const railBottom = bottom - lenPx * 0.1;
  const RAIL_W = 3;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#b98a3e';
    ctx.beginPath();
    for (const [y, inner] of [[railTop, 1], [railBottom, 1], [railBottom, 1 + RAIL_W], [railTop, 1 + RAIL_W]]) {
      const edge = side < 0 ? left.x + sideInsetAt(y) : right.x - sideInsetAt(y);
      const x = edge - side * inner;
      if (y === railTop && inner === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Cannons — three per side, small but unmistakable: a carriage block on
  // the deck, an iron barrel running out through the gunport and past the
  // hull's edge, a black gunport square where it crosses the rail. Placed
  // in the gaps *behind* each sail band below (a sail bulges forward of
  // its yard), so the sails, drawn later, never cover them. Three shades
  // down the barrel (light top edge, iron body, dark underside) is what
  // makes a 3px-thick line read as a round gun rather than a stick, and
  // the muzzle cap at the end is what makes it read as pointing outward.
  // Spaced to leave the flag (on the mainmast, 0.49, below) clear of the
  // starboard guns either side of it — a first spacing had the flag's
  // lower edge sitting right on the middle gun.
  const CANNON_FRACTIONS = [0.36, 0.57, 0.76];
  const BARREL_OUT = 5; // px of barrel past the hull's edge
  const CARRIAGE_W = 6;
  const CARRIAGE_H = 5;
  for (const side of [-1, 1]) {
    for (const f of CANNON_FRACTIONS) {
      const y = Math.round(top + lenPx * f);
      const edge = Math.round(side < 0 ? left.x + sideInsetAt(y) : right.x - sideInsetAt(y));
      const railInner = edge - side * (1 + RAIL_W); // the rail's inboard face
      // Gunport: a black notch in the rail, a hair taller than the barrel.
      ctx.fillStyle = '#0c0805';
      ctx.fillRect(Math.min(edge - side * 1, railInner), y - 2, RAIL_W, 5);
      // Carriage — a red-brown block on the deck just inboard of the rail,
      // outlined in black so it separates from the deck (a first cut in a
      // brown one shade off the deck's own all but vanished), wider than
      // the barrel so it reads as a mount.
      const carriageX = side < 0 ? railInner + 1 : railInner - 1 - CARRIAGE_W;
      ctx.fillStyle = '#0a0705';
      ctx.fillRect(carriageX - 1, y - 3, CARRIAGE_W + 2, CARRIAGE_H + 2);
      ctx.fillStyle = '#6e3a24';
      ctx.fillRect(carriageX, y - 2, CARRIAGE_W, CARRIAGE_H);
      // Barrel, three 1px rows from the middle of the carriage out past
      // the hull's edge — light top edge, iron body, dark underside is what
      // makes 3px read as a round gun rather than a stick.
      const inboardEnd = carriageX + CARRIAGE_W / 2;
      const x0 = side < 0 ? edge - BARREL_OUT : inboardEnd;
      const barrelLen = side < 0 ? inboardEnd - x0 : edge + BARREL_OUT - inboardEnd;
      ctx.fillStyle = '#8a8e96';
      ctx.fillRect(x0, y - 1, barrelLen, 1);
      ctx.fillStyle = '#2e3138';
      ctx.fillRect(x0, y, barrelLen, 1);
      ctx.fillStyle = '#121418';
      ctx.fillRect(x0, y + 1, barrelLen, 1);
      // Breech — the fat rear end of the gun, sitting on the carriage: a
      // taller dark block at the inboard end, the shape that says "cannon"
      // more than anything else about it.
      ctx.fillStyle = '#1c1e23';
      const breechX = side < 0 ? inboardEnd - 1 : inboardEnd - 2;
      ctx.fillRect(breechX, y - 2, 3, 5);
      // Muzzle cap — one column, a touch taller, right at the outboard end.
      ctx.fillStyle = '#0a0b0e';
      const muzzleX = side < 0 ? edge - BARREL_OUT : edge + BARREL_OUT - 1;
      ctx.fillRect(muzzleX, y - 2, 1, 4);
    }
  }

  // Three masts along the hull's length (fore, main, mizzen — bow to
  // stern), each a mast-head dot with a yard across it and a square sail
  // bellied *forward* of the yard, the way a sail set before a following
  // wind looks from straight above: a curved band, not a rectangle. Yard
  // half-widths and bulges are sized off beamPx/lenPx respectively (see
  // the function's opening comment for why mixing those axes up matters);
  // the main is the biggest, fore next, mizzen smallest, and all three
  // stay inside the gun rails so the cannons' outboard barrels are never
  // covered. Sails are the last big shapes drawn, so they layer over the
  // deck and carriages (on a real deck they'd be far overhead).
  const masts = [
    { f: 0.30, hw: beamPx * 0.38, bulge: lenPx * 0.10 },
    { f: 0.49, hw: beamPx * 0.42, bulge: lenPx * 0.125 },
    { f: 0.68, hw: beamPx * 0.34, bulge: lenPx * 0.09 },
  ];
  for (const m of masts) {
    const mx = shipCenterX;
    const my = top + lenPx * m.f;
    // Sail — the full belly first, then a darker crescent back near the
    // yard so the curve reads as a billow with depth, then the leading
    // edge outlined so it stays a sail against the pale deck highlights
    // and the storm's own flashes.
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.moveTo(mx - m.hw, my);
    ctx.quadraticCurveTo(mx, my - 2 * m.bulge, mx + m.hw, my);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cdc3ad';
    ctx.beginPath();
    ctx.moveTo(mx - m.hw, my);
    ctx.quadraticCurveTo(mx, my - 0.8 * m.bulge, mx + m.hw, my);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a89d86';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx - m.hw, my);
    ctx.quadraticCurveTo(mx, my - 2 * m.bulge, mx + m.hw, my);
    ctx.stroke();
    // Yard — runs a little past the sail's own width, as a real yard does.
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - m.hw - 2.5, my);
    ctx.lineTo(mx + m.hw + 2.5, my);
    ctx.stroke();
    // Mast head — the pole seen end-on.
    ctx.fillStyle = '#1a100a';
    ctx.beginPath();
    ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bowsprit — the front pole, jutting ahead of the bow.
  ctx.fillStyle = '#0a0805';
  ctx.fillRect(shipCenterX - beamPx * 0.05, top - beamPx * 0.45, beamPx * 0.1, beamPx * 0.3);

  // Union Jack, flown from the mainmast: hung right off the mast head
  // (three px clear of it, a halyard drawn across the gap), streaming to
  // starboard. Still deliberately bigger than a strict scale-model would
  // call for — the clearest single "this is the British warship" cue on a
  // hull this small — just no longer floating on its own pole half a
  // hull-length ahead of the bow. Every stripe below is a flagW/flagH-
  // relative fraction rather than an absolute pixel count, so it keeps its
  // proportions if this size ever changes again.
  const mainMast = masts[1];
  // 16x10 (was 22x14 on the old bow pole) — the biggest that fits between
  // the starboard guns either side of the mainmast (CANNON_FRACTIONS
  // above) without lying across one of them; hung a couple of px forward
  // of centre on the mast head for the same reason.
  const flagW = 16;
  const flagH = 10;
  const flagX = shipCenterX + 4;
  const flagY = top + lenPx * mainMast.f - flagH / 2 - 1;

  // Halyard — mast head to the flag's hoist.
  ctx.fillStyle = '#1a100a';
  ctx.fillRect(shipCenterX, top + lenPx * mainMast.f - 1, flagX - shipCenterX, 2);

  // Union Jack
  ctx.fillStyle = '#012169';
  ctx.fillRect(flagX, flagY, flagW, flagH);

  // White diagonals
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = flagW * 0.2;
  ctx.beginPath();
  ctx.moveTo(flagX, flagY);
  ctx.lineTo(flagX + flagW, flagY + flagH);
  ctx.moveTo(flagX + flagW, flagY);
  ctx.lineTo(flagX, flagY + flagH);
  ctx.stroke();

  // Red diagonals
  ctx.strokeStyle = '#C8102E';
  ctx.lineWidth = flagW * 0.12;
  ctx.beginPath();
  ctx.moveTo(flagX, flagY);
  ctx.lineTo(flagX + flagW, flagY + flagH);
  ctx.moveTo(flagX + flagW, flagY);
  ctx.lineTo(flagX, flagY + flagH);
  ctx.stroke();

  // White cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(flagX + flagW / 2 - flagW * 0.125, flagY, flagW * 0.25, flagH);
  ctx.fillRect(flagX, flagY + flagH / 2 - flagH * 0.125, flagW, flagH * 0.25);

  // Red cross
  ctx.fillStyle = '#C8102E';
  ctx.fillRect(flagX + flagW / 2 - flagW * 0.0625, flagY, flagW * 0.125, flagH);
  ctx.fillRect(flagX, flagY + flagH / 2 - flagH * 0.0625, flagW, flagH * 0.125);
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

// The instant a volley fires: a bright burst plus a puff of smoke at the
// gunport, so the shot visibly originates from the ship itself rather than
// the hazard just appearing near the player a moment later — the thing
// actually missing from an early report that the chase "wasn't engaging in
// combat."
function drawMuzzleFlash(ctx, f, z, cameraWorldX) {
  const p = worldToScreen(f.x, z, cameraWorldX);
  const k = clamp(1 - f.t / MUZZLE_FLASH_LIFETIME, 0, 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = '#fff2b0';
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5 + (1 - k) * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(120, 120, 115, ${k * 0.5})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 4, 4 + (1 - k) * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHazard(ctx, h, z, cameraWorldX, zFrom) {
  const p = worldToScreen(h.x, z, cameraWorldX);
  const warnProgress = clamp(h.t / 0.65, 0, 1);
  const hot = h.t >= 0.65 && h.t < 0.65 + 0.3;

  // A tracer arcing from the ship's own position at spawn to the impact
  // point — reads as a shot from a ship visibly maneuvering right there in
  // frame, not lobbed from off-screen. Drawn across the whole warning
  // window so its motion itself is part of the telegraph.
  if (!hot && h.t < 0.65) {
    const from = worldToScreen(h.fromX, zFrom, cameraWorldX);
    const k = clamp(h.t / 0.65, 0, 1);
    const bx = from.x + (p.x - from.x) * k;
    const by = from.y + (p.y - from.y) * k;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 210, 120, ${0.25 + k * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40, 34, 26, 0.9)';
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const fading = h.t >= 0.65 + 0.3;

  if (hot) {
    // The impact itself: a bright, opaque foam burst — this is the frame
    // that actually reads as "dangerous right now."
    ctx.fillStyle = 'rgba(235, 245, 250, 0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3 * PIXELS_PER_UNIT * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 150, 160, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3 * PIXELS_PER_UNIT, 0, Math.PI * 2);
    ctx.stroke();
  } else if (fading) {
    const fadeT = clamp((h.t - 0.65 - 0.3) / 0.15, 0, 1);
    ctx.strokeStyle = `rgba(220, 235, 240, ${0.6 * (1 - fadeT)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3 * PIXELS_PER_UNIT * (1 + fadeT * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Warning telegraph — the true hit-radius outline drawn at full size
    // from the very first frame ("will I be in that circle" is answerable
    // immediately), a shrinking shadow contracting down onto it as a
    // countdown, and a center mark pulsing faster as impact nears.
    const hitPx = 1.3 * PIXELS_PER_UNIT;

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
    // The falling-cannonball threat used by the approach frigate's own
    // hazards is skipped here — the tracer drawn above already shows the
    // shot approaching from the ship's actual position; a second, unrelated
    // ball falling straight down from the sky on top of it would just
    // confuse the two into looking like separate threats.
  }
}

// test/debug support — the sprite drawn on its own, off-screen, so it can be
// rasterized and looked at without a browser (a software canvas — see the
// job tmp rastercanvas). Same convention as debugChaseShipPosition().
export { drawChaseShip as debugDrawChaseShip };
