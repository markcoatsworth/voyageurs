import { centerX, widthAt, braidAt, rapidsStrength, MOUTH_DISTANCE, SEGMENT_SHAPE_OFFSET } from '../world/river/path.js';
import { worldToScreen, CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT } from '../shared/config.js';
import { drawBanks, drawWaterFallback, drawCurrentEffects } from '../world/terrain.js';
import { drawWhales } from '../world/whales.js';
import { createCanoeSprites } from '../world/canoe.js';
import { playCapsizeHorn, playPeltChime, playDamageBoop, playCannonBoom, playDiableRoar, playDiableDefeat } from '../audio/sfx.js';
import { getDockHit, dockHitZ, VILLAGES } from '../world/villages.js';
import { createVillageScene } from '../world/villageScene.js';
import { createBlockade } from '../bossfights/blockade.js';
import { createChasseGalerie, lightningFlash, BOSS_HOVER_HEIGHT } from '../bossfights/chasseGalerie.js';
import { createDiable, DIABLE_FLOW_DISTANCE } from '../bossfights/diable.js';
import { createWeapons } from './weapons.js';
import { isTouchPrimary } from './touchControls.js';

// A D-pad's discrete taps are less precise than a keyboard's held keys, and
// the same world speed reads as faster filling more of a small screen — the
// same numbers that felt right on desktop consistently played as "way too
// fast" on touch. Scale forward-motion constants down for touch specifically
// rather than changing the feel for everyone.
const MOBILE_SPEED_SCALE = 0.45;
const speedScale = isTouchPrimary() ? MOBILE_SPEED_SCALE : 1;
// On top of the overall touch slowdown, the forward paddle specifically is
// dialled down further for phone play: pushing "up" should *ease* the canoe
// up to speed, not launch it, and top speed sits lower. Only touches how
// "up" behaves — not the current, the brake, reverse, or steering.
const FWD_ACCEL_SCALE = isTouchPrimary() ? 0.42 : 1; // gentler ramp
const FWD_MAX_SCALE = isTouchPrimary() ? 0.78 : 1;   // lower ceiling
// And when you let go of "up", the canoe settles back to its calm drift
// speed quicker on touch — so "not pushing forward" reliably reads as slow
// rather than coasting fast for ten-plus seconds.
const DRIFT_DECEL_TOUCH_MULT = isTouchPrimary() ? 2.4 : 1;

// MIN_SPEED is really the ambient current's own speed — holding Down long
// enough now overcomes it and actually paddles upstream (negative
// effectiveSpeed, flowDistance decreasing), rather than just coasting down
// to this as a floor; letting off Up/Down drifts back toward it from
// *either* side, same as a real current eventually winning again once you
// stop fighting it. Deliberately well under BASE_SPEED so drifting forward
// reads as an actual "chill" slow speed, not just a mild step down from
// medium.
const MIN_SPEED = 2.5 * speedScale;
const MAX_SPEED = 16 * speedScale * FWD_MAX_SCALE;
// Paddling against the current is harder than going with it — capped well
// under MAX_SPEED's magnitude, so upstream is a real but slow slog, not a
// second forward gear pointed the other way.
const MAX_REVERSE_SPEED = -6 * speedScale;
// lawrenceWest (toward Québec City) is the one stretch that's genuinely
// upstream in reality — see world/river/route.js's module comment — and this is
// what actually makes it feel that way, rather than just a cosmetic label
// on another normal downstream segment: its ambient current is negative,
// not positive, so it's the same "drift back to this from either side when
// you let off" behavior every other segment already has (see MIN_SPEED
// above), just aimed backward. Stop paddling here and the river doesn't
// just slow you down to a chill drift — it actively carries you back the
// way you came, same magnitude as MIN_SPEED but flipped, so holding Up
// here is a sustained, active effort the whole way, not an occasional
// correction.
const UPRIVER_CURRENT = -MIN_SPEED;
// this.speed carries over unchanged into lawrenceWest — a player crossing
// into it mid-paddle keeps whatever forward speed they arrived with, same as
// every other segment transition. Everywhere else that's fine (the
// ambient current there is a gentle forward drift, so leftover speed just
// eases down toward it over several seconds); here it would mean a real
// current only actually asserting itself well after the player has
// noticed nothing pushed back. A strong current overpowers momentum fast,
// not gradually, so lawrenceWest gets its own much quicker decay toward
// UPRIVER_CURRENT instead of reusing DECEL_DRIFT's gentle one.
const UPRIVER_DECEL = 6 * speedScale;
const BASE_SPEED = 8 * speedScale;
const ACCEL = 7 * speedScale * FWD_ACCEL_SCALE;
// Holding "down" (back on the steer pad / Down key) is a brake, not a lazy
// back-paddle: it kills forward speed fast so the canoe visibly slows, then
// eases on into a gentle reverse if you keep holding. Much stronger than
// ACCEL so the response is immediate.
const BRAKE_DECEL = 17 * speedScale;
const DECEL_DRIFT = 1.8 * speedScale;
// Steering authority is halved for touch play: on a phone the pad is on/off,
// so any nudge was full desktop steering and the canoe swung too hard.
// Damping is unchanged, so it still settles promptly when you let go — it
// just turns at half the rate while you're pushing.
const STEER_ACCEL = 20 * (isTouchPrimary() ? 0.5 : 1);
const STEER_MAX = 7 * (isTouchPrimary() ? 0.5 : 1);
const STEER_DAMPING = 6;
// Direct lateral speed during the Diable fight (bypasses the physics above —
// see the isHolding() branch in update()). Higher on touch: the pad is on/off
// with no analog magnitude, so the only "sensitivity" knob is this number,
// and dodging fireballs on a phone needs it to really move.
const FIGHT_LATERAL_SPEED = isTouchPrimary() ? 28 : 15;
// Past this point on lawrenceWest the pistol is guaranteed (update() grants
// it if you never walked up to the Montréal gunsmith) — the Diable fight
// ahead can't be done unarmed.
const MONTREAL_FLOW_DISTANCE = VILLAGES.find((v) => v.name === 'Montreal')?.flowDistance ?? Infinity;
const EDGE_MARGIN = 0.55;
const ISLAND_HIT_MARGIN = 0.35;
const LOG_PENALTY_SPEED = 4;
const BANK_PENALTY_SPEED = 2.6;
const INVULN_TIME = 1.2;
const BANK_INVULN_TIME = 0.7;
// A health meter only means something if hits are survivable — rocks and
// islands used to end the run on the spot. They still hit hard (a bit
// under a third of the bar), but now you can shrug off a couple of bad
// breaks instead of one unlucky rock ending an otherwise good run. Logs and
// grounding chip a smaller amount off on top of their existing speed
// penalty, so every collision matters, not just the big ones.
const MAX_HEALTH = 100;
const ROCK_DAMAGE = 32;
const LOG_DAMAGE = 12;
const BANK_DAMAGE = 8;
// The Château Gauntlet (bossfights/blockade.js) — a cannon splash used to cost as
// much as a rock (30), then 16, now 12. Combined with how many volleys a
// real approach exposes you to, the higher numbers added up to the approach
// killing runs before the ship — the fight's actual climax — was ever
// reached. Kept low enough that a bad patch of luck on the way in costs
// real health without ending the run on its own.
const CANNON_DAMAGE = 12;
// The hull itself is a solid wall, not a one-off "you clipped it" penalty
// (see the isHullBlocking check in update()) — outside the gap you simply
// can't push through it at all, taking this (the single hardest hit in the
// game) on repeat every INVULN_TIME while you're pinned against it, plus a
// heavy speed penalty that keeps sapping your paddling the whole time
// you're in contact, same shape as BANK_PENALTY_SPEED just harder.
const SHIP_HULL_DAMAGE = 30;
const SHIP_HULL_PENALTY_SPEED = 6;
// A church steeple clipped mid-flight in the Chasse-galerie. A real bite —
// just under a cannon hit, ~8 clips (one INVULN_TIME apart) ends a full
// hull — so botching more than a couple of the reaching-church dodges
// genuinely threatens the run. Dialled back a hair from 15 alongside making
// the steeples easier to see; the old 5 let a careless weave shrug the
// whole gorge off.
const STEEPLE_DAMAGE = 13;
// Clipping the bank treetops mid-flight — the devil's canoe stays over the
// water. A smaller single hit than a steeple, but you take one every
// INVULN_TIME you're in the trees (plus a shove back toward the river), so a
// few seconds off the channel adds up to worse than a clean steeple clip —
// straying wide still bleeds you noticeably faster than a tight weave does.
const TREE_DAMAGE = 7;
const TREE_PUSHBACK = 26; // lateral accel back toward mid-channel, units/sec^2
// The Chasse-galerie's glide speed — slow and stately, so the flight up the
// Ottawa runs several minutes and there's plenty of time to read each
// church and slide into the next gap.
const FLIGHT_CRUISE_SPEED = 3.4;
// Diable fight: the river is locked at the arena, but up/down still do
// something — they move the canoe vertically within the arena to dodge his
// fire. Altitude (world units) is held between these; it eases back toward
// BOSS_HOVER_HEIGHT when neither is pressed so you naturally return to the
// aiming line.
const FIGHT_HOVER_MIN = -1.0;   // fully retreated — low on screen, near the bottom
const FIGHT_HOVER_MAX = 4.6;    // pressed up toward him
const FIGHT_HOVER_SPEED = 5;    // units/sec of vertical move under input
const FIGHT_HOVER_RECENTER = 1.6; // units/sec drift back to the baseline when idle
const DAMAGE_FLASH_TIME = 0.28;
// How much hull a single fur buys at the repair shop's trader — a full
// repair from empty costs ceil(100/15) = 7 furs; tryRepairTrade() below
// only ever spends as many as are actually needed to top off.
const REPAIR_HP_PER_FUR = 15;
// flowDistance (world position) deliberately never resets on restart — the
// river shouldn't jump — but the canoe always respawns dead-center. If a
// capsize happens to freeze the world with a braid island sitting right on
// that centerline, every restart would drop the canoe straight back into
// it with zero chance to react. A brief spawn grace period, using the same
// invulnerability the game already has, fixes that generally.
const SPAWN_INVULN_TIME = 1.5;
// How fast the camera catches up to the river's own bend (centerX), each
// frame, as a fraction of the remaining gap. Low on purpose: tracking the
// bend *exactly* means the camera sways every time the channel curves —
// which happens continuously just from paddling forward, no steering
// needed — and everything anchored to the world (banks included) sways
// with it. This damps that out so the world reads as planted; the canoe
// (whose screen position already includes the camera's remaining lag, see
// render()) picks up the slack, visibly drifting across a stable frame as
// it actually follows the curve — which is what makes it read as "the boat
// is turning" rather than "the world is sliding."
const CAMERA_SMOOTH = 0.025;
// The Saint Lawrence stretch (world/river/path.js's ESTUARY_WIDTH) is far wider
// than the screen, so lateralOffset alone — the *only* thing that used to
// move the canoe off the centerline visually, since the camera above only
// ever tracks the curve, never the player's own steering — can no longer
// just be handed straight to the canoe's screen position: a canoe camped
// out mid-crossing could steer itself yards past the edge of the canvas,
// and it'd render there, or not at all. CAMERA_DEAD_ZONE is how far the
// canoe can drift from the *tracked* centerline before the camera starts
// easing sideways to keep up, in world units. Past that, CAMERA_LATERAL_PULL
// — tracked as its own lerp, separate from and faster than CAMERA_SMOOTH
// above — reels the camera toward the canoe, same "world stays planted, the
// boat visibly moves" logic as the curve-tracking camera, just triggered by
// a steering choice instead of a bend in the river.
//
// This used to be 8.5 (a fully-loaded old-width channel's own max
// half-width, ~8.7 — chosen so the fjord never engaged this at all) plus a
// CAMERA_MAX_ONSCREEN_OFFSET of 9, which together meant the canoe visually
// drifted almost the entire way to the canvas edge — within about a canoe's
// width of it — before the camera did anything to help, then only barely
// caught up in what was left. Reported as needing to steer right up against
// the edge of the screen before the viewport would budge at all. Both
// numbers are shrunk a lot here instead: the camera now starts easing over
// well before the canoe gets anywhere near the edge, and never lets it
// travel more than half the canvas's half-width from center on screen — a
// deliberate, general change to how the camera feels everywhere (the fjord
// included), not just a wide-river tweak.
const CAMERA_DEAD_ZONE = 2;
const CAMERA_LATERAL_SMOOTH = 0.12;
// A hard backstop under the canvas's actual half-width (CANVAS_WIDTH / 2 /
// PIXELS_PER_UNIT = 10 units) so a fast or sustained steering input can't
// outrun CAMERA_LATERAL_SMOOTH's catch-up and momentarily push the canoe
// (which itself has width) off the edge of the canvas while the lerp is
// still closing the gap. The soft dead zone above handles the normal case;
// this only ever engages during unusually hard/sustained steering, and even
// then just holds the canoe at this offset instead of letting it go further.
const CAMERA_MAX_ONSCREEN_OFFSET = 5;
const RAPIDS_BOOST = 7 * speedScale; // extra units/s the current adds at peak whitewater
const RAPIDS_STEER_PENALTY = 0.45; // up to 45% less steering authority there

// lawrenceWest (world/river/route.js's third segment, toward Québec City) is the
// only one with a real floor: its numbering (SEGMENT_SHAPE_OFFSET) sits far
// away on purpose, so paddling back past its own start would just be
// paddling into an unrelated stretch of the shape functions' number line —
// not an actual place. fjord and lawrenceEast, by contrast, are *not*
// separately bounded — they share one open range (see update()'s
// re-derivation of this.segment right after the position update below).
// An earlier version of this also ceilinged the fjord at Tadoussac, forcing
// a dock-or-else stop right at the junction; that's exactly what caused a
// string of stuck-at-Tadoussac bugs (nowhere to go if you weren't already
// lined up with the dock, worst of all right where main.js's ?start= cheat
// can drop you with zero approach). Paddling through is completely fine —
// crossing MOUTH_DISTANCE always continues into lawrenceWest now (see the
// crossing check further down in update()); lawrenceEast still exists as
// real geography (route.js, the minimap) but is no longer a live gameplay
// destination — see route.js's own module comment for why.
const SEGMENT_FLOOR = {
  fjord: 0,
  lawrenceWest: SEGMENT_SHAPE_OFFSET.lawrenceWest,
};

// What this.speed drifts back toward with no Up/Down input (see
// UPRIVER_CURRENT's comment) — MIN_SPEED everywhere except the one
// genuinely-upstream stretch. Letting go completely on lawrenceWest and
// never paddling again just settles the canoe at this segment's own floor
// above, same as drifting backward anywhere else eventually hits a wall —
// there's nowhere further back to go than where this branch started.
const AMBIENT_CURRENT = {
  lawrenceWest: UPRIVER_CURRENT,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Game {
  // startFlowDistance/startSegment: where the river clock begins instead of
  // the put-in (fjord, 0) — see main.js's ?start= URL cheat. Threaded
  // through the same constructor state that flowDistance/segment/the
  // camera normally start from, so there's no special-cased "cheat mode":
  // everything downstream (village arrival banners, mouthAnnounced, the
  // camera's own curve tracking) behaves exactly as if the player had
  // actually paddled here from 0.
  constructor({ ctx, water, input, obstacles, world, ui, music, startFlowDistance = 0, startSegment = 'fjord' }) {
    this.ctx = ctx;
    this.water = water; // null falls back to a 2D-drawn water fill
    this.input = input;
    this.obstacles = obstacles;
    this.world = world;
    this.ui = ui;
    this.music = music;
    this.canoeSprites = createCanoeSprites();
    this.villageScene = createVillageScene();
    this.blockade = createBlockade();
    this.blockadePct = null; // null hides the HUD bar; set by update() while the fight is active
    this.chasseGalerie = createChasseGalerie();
    this.diable = createDiable();
    this.diablePct = null; // null hides the HUD bar; his HP% while the fight runs
    // Set once the Devil looms up (or by ?start=diable): a capsize then
    // respawns just before the fight with the pistol, not all the way back
    // at Montréal — see start() and update()'s consumeJustAppeared branch.
    this._diableCheckpoint = false;
    // True from the moment the frigate is spotted (Rule Britannia cued) until
    // the whole blockade encounter is over — approach *and* pursuit. Any way
    // that ends (thread the gap, escape the chase, or just retreat back out
    // of range) drops the boss track back to the shuffle exactly once.
    this._bossTrackCued = false;
    // Canoe altitude while the Diable fight holds the river locked — driven
    // by up/down for a vertical dodge, eased back to BOSS_HOVER_HEIGHT idle.
    this._bossHoverAlt = BOSS_HOVER_HEIGHT;
    this.weapons = createWeapons();

    // Set up weapon firing callback
    input.onWeaponFire = (weaponName) => {
      if (this.mode === 'river' && this.state === 'playing') {
        // getAltitude() is 0 except mid-Chasse-galerie flight, where it lifts
        // the shot to leave the flying canoe instead of its shadow.
        this.weapons.fire(weaponName, this.canoeWorldX, this.flowDistance, this.chasseGalerie.getAltitude());
      }
    };

    // 'river' (paddling) or 'village' (on foot, ashore at a dock) — see
    // enterVillage()/leaveVillage(). Separate from this.state, which is
    // still just 'playing' | 'gameover'; a capsize can't happen mid-village
    // visit since river collision checks don't run in that mode.
    this.mode = 'river';
    this.currentVillage = null;
    // Which of world/river/route.js's SEGMENTS is active — see SEGMENT_FLOOR and
    // leaveVillage()'s Tadoussac branch for the junction itself.
    this.segment = startSegment;
    // Remembered so reset() can snap back to it — see that method's own
    // comment for why a capsize returns here instead of continuing from
    // wherever it happened.
    this.startFlowDistance = startFlowDistance;
    this.startSegment = startSegment;

    this.time = 0;
    this.paddleSide = 1;
    this.paddleTimer = 0;

    ui.restartBtn.addEventListener('click', () => this.start());

    // No title-screen gate — the canoe launches the instant the page is
    // ready; the intro caption (main.js) is a non-blocking overlay that
    // fades on its own timer instead of waiting for a click.
    this.start();
  }

  // A capsize used to leave flowDistance/segment/the camera exactly where
  // they were and just refill health — "the river shouldn't jump back to
  // the put-in." Reported as the opposite of what's wanted: dying should
  // send you back to wherever *this run* actually began (the put-in, or
  // wherever a ?start= cheat placed you), not restart you in place at the
  // spot that just killed you. So every restart now snaps flowDistance,
  // segment, and the camera back to startFlowDistance/startSegment
  // (captured once in the constructor), same as the very first launch.
  reset() {
    this.lateralOffset = 0;
    this.lateralVX = 0;
    this.speed = BASE_SPEED;
    this.effectiveSpeed = BASE_SPEED;
    this.rapids = 0;
    this.furs = 0;
    this.health = MAX_HEALTH;
    this.invulnTimer = SPAWN_INVULN_TIME;
    this.mouthAnnounced = false;
    this.troisRivieresAnnounced = false;
    this.tilt = 0;
    this.paused = false;
    this.ui.pauseScreen?.classList.add('hidden');
    this.mode = 'river';
    this.currentVillage = null;
    this.blockadeCrossCurrent = 0;
    this._bossTrackCued = false;
    this._castOffGrace = 0;
    this._castOffGraceVillage = null;

    this.segment = this.startSegment;
    this.flowDistance = this.startFlowDistance;
    // obstacles.reset() (called right after this from start()) seeds its
    // pool by reading world.distance directly, before update() has ever run
    // to set it from flowDistance the normal way — without this, a non-zero
    // startFlowDistance would seed every obstacle near the death spot
    // instead of back at the actual start.
    this.world.distance = this.startFlowDistance;
    this.cameraCenterX = centerX(this.startFlowDistance);
    this.cameraLateralPull = 0;
    this.cameraWorldX = this.cameraCenterX;
  }

  togglePause() {
    if (this.state !== 'playing') return; // nothing sensible to pause over the title/gameover screens
    this.paused = !this.paused;
    this.ui.pauseScreen.classList.toggle('hidden', !this.paused);
  }

  showBanner(text) {
    clearTimeout(this._bannerTimeout);
    const el = this.ui.milestoneBanner;
    el.textContent = text;
    el.classList.add('show');
    this._bannerTimeout = setTimeout(() => el.classList.remove('show'), 4200);
  }

  start() {
    this.reset();
    this.obstacles.reset();
    this.blockade.reset();
    this.blockadePct = null;
    this.chasseGalerie.reset();
    this.diable.reset();
    this.diablePct = null;
    this._bossHoverAlt = BOSS_HOVER_HEIGHT;
    this.weapons.reset();
    // Respawning at the Diable checkpoint means the pistol is a given — you
    // can't fight him bare-handed, and ?start=diable / a capsize mid-fight
    // both land here.
    if (this._diableCheckpoint) this.weapons.unlock('pistol');
    this.syncWeaponControls(); // weapons.reset() just cleared the pool — hide the pad
    // The "thread the steeples" intro only makes sense on a full flight from
    // Montréal — never when a run starts (or respawns) at the Devil's door.
    this._chasseGalerieBannerShown = this._diableCheckpoint;
    // Restart now always returns to the run's actual start (see reset()'s
    // own comment) — if the boss track was playing when the capsize
    // happened, leaving it running would be paired with a scene nowhere
    // near the frigate. Unconditional and harmless if it wasn't playing.
    this.music?.endBossTrack();
    this.state = 'playing';
    clearTimeout(this._bannerTimeout);
    this.ui.milestoneBanner.classList.remove('show');
    clearTimeout(this._damageFlashTimeout);
    this.ui.damageFlash.classList.remove('show');
    this.ui.gameoverScreen.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    // No-ops if music hasn't been started yet (e.g. the very first launch,
    // before any keypress/click) — see music.resume()'s own guard.
    this.music?.resume();
  }

  gameOver() {
    this.state = 'gameover';
    this.ui.hud.classList.add('hidden');
    this.ui.hudDiable?.classList.add('hidden');
    this.ui.finalStats.innerHTML = '';
    // Losing to the Devil is losing your soul, not just the canoe.
    const byDiable = !!this.diable?.isActive();
    if (this.ui.gameoverTitle) {
      this.ui.gameoverTitle.textContent = byDiable ? 'THE DEVIL COLLECTS' : 'CAPSIZED';
    }
    this.ui.gameoverScreen.classList.remove('hidden');
    playCapsizeHorn();
    this.music?.stop();
  }

  // Called by main.js for ?start=diable: hand over the pistol and mark the
  // checkpoint so a capsize keeps it and respawns at the fight.
  armDiableCheckpoint() {
    this._diableCheckpoint = true;
    this.weapons.unlock('pistol');
    this.syncWeaponControls();
    // Dropped straight into the Devil's approach — the steeple-threading
    // intro doesn't apply. Suppress it and set the scene instead.
    this._chasseGalerieBannerShown = true;
    this.showBanner('YOUR DEBT TO THE DEVIL COMES DUE');
  }

  // Ashore mechanics are intentionally minimal for now: walk around, walk
  // back onto the dock to re-board. Shops (sell furs, repair the hull) are
  // the planned next step once this loop is solid.
  enterVillage(village) {
    this.mode = 'village';
    this.currentVillage = village;
    this.villageScene.enter(village);
    this.ui.hud.classList.add('hidden');

    // Update respawn point to this village - if you capsize later, you'll
    // restart here instead of all the way back at the original put-in
    this.startFlowDistance = village.flowDistance;
    this.startSegment = village.segment;

    // The pistol comes from the Montréal gunsmith (walk up to him — see
    // acquirePistol(), fired from the villageScene trigger in update()'s
    // village branch), or automatically the moment you pass Montréal on the
    // river if you never went into town (the MONTREAL_FLOW_DISTANCE check in
    // update()). Either way it's a given before the Diable fight.

    // Tadoussac is the one place in the game where casting off isn't just
    // resuming the same segment — leaving here jumps into lawrenceWest's
    // entirely different numbering (see leaveVillage()) — so it gets its
    // own arrival banner, though there's no choice to spell out any more:
    // every departure from here continues the same way, upriver.
    if (village.name === 'Tadoussac') {
      this.showBanner('Arriving at Tadoussac — the Saguenay meets the Saint Lawrence');
    } else {
      this.showBanner(`Arriving at ${village.name}`);
    }
  }

  // Resets everything that's meaningless carried over from one segment into
  // another — the camera's own curve-tracking state (centerX(d) can jump to
  // an unrelated value between segments, see SEGMENT_SHAPE_OFFSET) and the
  // obstacle pool (it seeds itself from world.distance — see the
  // constructor's comment on startFlowDistance — so without a reset here
  // it'd stay full of obstacles positioned for the segment you just left).
  enterSegment(segmentId, flowDistance) {
    this.segment = segmentId;
    this.flowDistance = flowDistance;
    this.world.distance = flowDistance;
    this.lateralOffset = 0;
    this.lateralVX = 0;
    this.cameraCenterX = centerX(flowDistance);
    this.cameraLateralPull = 0;
    this.cameraWorldX = this.cameraCenterX;
    this.obstacles.reset();
  }

  leaveVillage() {
    this.mode = 'river';
    if (this.currentVillage.name === 'Tadoussac') {
      // Always continues upriver toward Québec City — no choice any more,
      // just a real segment jump (fjord and lawrenceWest don't share a
      // number line the way fjord and lawrenceEast do, so this can't just
      // resume in place like every other village's cast-off below).
      this.enterSegment('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
      this.showBanner('Paddling upriver toward Québec City — fight the current');
    } else {
      // Push just past the dock's own trigger zone — otherwise the instant
      // control returns to the canoe, it's still sitting in the exact spot
      // that triggered docking, and the very next frame docks it again.
      const clearance = dockHitZ(this.currentVillage) + 0.5;
      if (this.segment === 'lawrenceWest') {
        // The current here runs *backward* (upriver, toward the dock), so a
        // half-unit nudge is dragged straight back into the trigger zone
        // before the player can react — worst at Montreal and Québec City,
        // whose docks reach most of the way across the channel, so steering
        // clear laterally doesn't help either. Give the canoe real upstream
        // separation plus forward momentum, and ignore this one dock for a
        // few seconds (see update()'s getDockHit check) so casting off isn't
        // an instant loop back into the same village.
        this.flowDistance = this.currentVillage.flowDistance + dockHitZ(this.currentVillage) + 6;
        this.speed = Math.max(this.speed, BASE_SPEED);
        this._castOffGraceVillage = this.currentVillage;
        this._castOffGrace = 3;
      } else {
        this.flowDistance = this.currentVillage.flowDistance + clearance;
      }
      this.world.distance = this.flowDistance;
      this.showBanner('Casting off');
    }
    this.currentVillage = null;
    this.ui.hud.classList.remove('hidden');
  }

  handleHit(entry) {
    if (this.invulnTimer > 0) return;
    if (entry.type === 'rock' || entry.type === 'island') {
      this.takeDamage(ROCK_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'bank') {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - BANK_PENALTY_SPEED);
      this.takeDamage(BANK_DAMAGE);
      this.invulnTimer = BANK_INVULN_TIME;
    } else if (entry.type === 'cannon') {
      this.takeDamage(CANNON_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'shiphull') {
      this.takeDamage(SHIP_HULL_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'steeple') {
      this.takeDamage(STEEPLE_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'diable') {
      this.takeDamage(entry.damage ?? 18);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'tree') {
      this.takeDamage(TREE_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - LOG_PENALTY_SPEED);
      this.takeDamage(LOG_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    clearTimeout(this._damageFlashTimeout);
    this.ui.damageFlash.classList.add('show');
    this._damageFlashTimeout = setTimeout(
      () => this.ui.damageFlash.classList.remove('show'),
      DAMAGE_FLASH_TIME * 1000
    );
    // The capsize horn (gameOver, below) already covers the fatal hit —
    // playing this too would just stack a second cue on top of it.
    if (this.health > 0) playDamageBoop();
    if (this.health <= 0) this.gameOver();
  }

  handleCollect() {
    this.furs += 1;
    playPeltChime();
  }

  // Triggered by villageScene.js the moment the player walks up to the
  // trader outside the repair shop (see TRADER_POS there) — spends just
  // enough furs to close the gap to a full hull, or as many as the player
  // has if that's not enough, rather than always spending everything.
  tryRepairTrade() {
    if (this.health >= MAX_HEALTH) {
      this.showBanner('Hull is already sound');
      return;
    }
    if (this.furs <= 0) {
      this.showBanner('No furs to trade');
      return;
    }
    const missing = MAX_HEALTH - this.health;
    const needed = Math.ceil(missing / REPAIR_HP_PER_FUR);
    const spend = Math.min(this.furs, needed);
    this.furs -= spend;
    this.health = Math.min(MAX_HEALTH, this.health + spend * REPAIR_HP_PER_FUR);
    this.showBanner(`Traded ${spend} fur${spend === 1 ? '' : 's'} for repairs`);
  }

  // The gun shop at Montréal — walk up to the gunsmith standing outside and
  // the pistol is yours, free (villageScene.js fires gunsmithMet once per
  // approach). One gun for now; this is where the eventual small/medium/large
  // weapon choices will live (see core/weapons.js). No-op once you have it.
  acquirePistol() {
    if (this.weapons.has('pistol')) return;
    this.weapons.unlock('pistol');
    this.syncWeaponControls();
    playPeltChime();
    this.showBanner('PISTOL ACQUIRED — Press Z to Fire!');
  }

  // Show the on-screen weapon controls (index.html #weapon-dpad, opposite
  // the move controls) exactly when you actually have a gun — so it's up
  // after picking the pistol up, and gone again after a capsize+restart
  // (start() below clears the weapon pool). layoutWeaponPad re-pins it the
  // moment it stops being display:none, since resize() may not fire then.
  syncWeaponControls() {
    const armed = this.weapons.has('pistol');
    this.ui.weaponPad?.classList.toggle('hidden', !armed);
    if (armed) this.ui.layoutWeaponPad?.();
  }

  // Le Diable — feeds the boss this frame's canoe position and pistol shots
  // (both converted to screen space, since he's a screen-space entity at the
  // top of the channel), applies his fireball hits, drains spent bullets,
  // and fires the appear/defeat one-shots (banner + music + the flight's
  // altitude hold + arming the checkpoint).
  updateDiable(dt) {
    const alt = this.chasseGalerie.getAltitude();
    const canoeScreen = {
      x: CANOE_SCREEN_X + (this.canoeWorldX - this.cameraWorldX) * PIXELS_PER_UNIT,
      y: CANOE_SCREEN_Y - alt * PIXELS_PER_UNIT,
    };
    const bulletScreens = this.weapons.getBullets().map((b) => {
      const p = worldToScreen(b.worldX, this.flowDistance - b.flowDistance, this.cameraWorldX);
      return { x: p.x, y: p.y - (b.altitude || 0) * PIXELS_PER_UNIT, ref: b };
    });

    const res = this.diable.update(
      dt, this.flowDistance, canoeScreen, bulletScreens,
      (dmg) => this.handleHit({ type: 'diable', damage: dmg }),
    );
    for (const ref of res.hitBullets) this.weapons.removeBullet(ref);

    this.diablePct = this.diable.isActive() ? this.diable.hpPct() : null;

    if (this.diable.consumeJustAppeared()) {
      this.showBanner('LE DIABLE — break the pact!');
      this.chasseGalerie.setHeldAloft(true);
      playDiableRoar();
      this.music?.start();
      this.music?.playDiableTrack();
      // From here on a capsize is the Devil taking your soul — respawn at
      // the fight with the pistol, not back at Montréal.
      this._diableCheckpoint = true;
      this.startFlowDistance = DIABLE_FLOW_DISTANCE - 6;
      this.startSegment = 'lawrenceWest';
    }
    if (this.diable.consumeJustDefeated()) {
      this.showBanner('THE PACT IS BROKEN — Gatineau ahead');
      this.chasseGalerie.setHeldAloft(false);
      playDiableDefeat();
      this.music?.endBossTrack();
    }
  }

  update(dt) {
    if (this.paused) return; // hard freeze, same as gameover below — see togglePause()

    this.time += dt;

    if (this.state !== 'playing') {
      // Capsizing is a hard freeze — the last frame drawn before gameOver()
      // fired (still inside the 'playing' branch below) stays on screen
      // untouched. Nothing here advances the river clock or redraws, so the
      // canoe and whatever it hit stop exactly where they were.
      return;
    }

    if (this.mode === 'village') {
      const { reboard, tradeRequested, gunsmithMet } = this.villageScene.update(dt, this.input.state);
      if (tradeRequested) this.tryRepairTrade();
      if (gunsmithMet) this.acquirePistol();
      this.villageScene.draw(this.ctx);
      if (reboard) this.leaveVillage();
      return;
    }

    const keys = this.input.state;

    // Which speed this.speed drifts back toward with no input, and how fast
    // — MIN_SPEED/a gentle decay everywhere except lawrenceWest, where the
    // target is negative and the decay is much quicker (see
    // UPRIVER_CURRENT/UPRIVER_DECEL/AMBIENT_CURRENT's comments).
    const ambientCurrent = AMBIENT_CURRENT[this.segment] ?? MIN_SPEED;
    const ambientDecel = this.segment === 'lawrenceWest'
      ? UPRIVER_DECEL
      : DECEL_DRIFT * 0.3 * DRIFT_DECEL_TOUCH_MULT;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) {
      // Brake hard toward a stop; only past ~0 does it slow to the gentler
      // ACCEL rate, so holding on still backs you up but the first thing
      // that happens is an obvious slow-down.
      const rate = this.speed > 0 ? BRAKE_DECEL : ACCEL;
      this.speed = Math.max(MAX_REVERSE_SPEED, this.speed - rate * dt);
    }
    // No input: drift back toward the current's own speed from whichever
    // side you're currently on — this is what makes upstream paddling a
    // deliberate, sustained effort rather than a one-way switch: stop
    // paddling and the river carries you forward again (or, on
    // lawrenceWest, backward — same drift, aimed the other way).
    // EXCEPT when flying (Chasse-galerie) - no current in the sky!
    else if (!this.chasseGalerie.isActive()) {
      if (this.speed > ambientCurrent) this.speed = Math.max(ambientCurrent, this.speed - ambientDecel * dt);
      else this.speed = Math.min(ambientCurrent, this.speed + ambientDecel * dt);
    }

    // Rapids strength at where the canoe currently is (i.e. before this
    // frame's advance) — the current adds its own push on top of whatever
    // the player is doing with the paddle, rather than replacing it, so
    // "up" still matters even mid-rapids. this.speed stays the player's own
    // paddling stat; effectiveSpeed is what actually moves the world.
    // Rapids push *with* the current, so on lawrenceWest — where the
    // current itself runs backward — hitting whitewater means fighting a
    // stronger current, not getting a boost: same magnitude, flipped sign.
    const rapids = rapidsStrength(this.flowDistance);
    const rapidsDirection = this.segment === 'lawrenceWest' ? -1 : 1;

    // Chasse-galerie: once airborne the canoe holds a slow, steady glide,
    // fully independent of the river current below (which on this upstream
    // stretch runs backward and would otherwise stall the whole flight at
    // this cruise speed). Paddling only nudges the glide a little either
    // way; the flight is about threading the steeples, not speed. The
    // take-off still reads as gradual because the altitude/tilt ramp up
    // visually (see liftFraction()).
    const flying = this.chasseGalerie.isActive();
    let effectiveSpeed;
    if (flying) {
      const paddle = keys.up ? 1.5 : keys.down ? -1.5 : 0;
      effectiveSpeed = FLIGHT_CRUISE_SPEED + paddle;
    } else {
      effectiveSpeed = this.speed + rapids * RAPIDS_BOOST * rapidsDirection;
    }

    // Advance the shared river clock using this frame's effective speed —
    // the same value obstacles sample below — so the baked downstream
    // distance (d = world.distance - z) stays exactly invariant. Floored
    // per SEGMENT_FLOOR's comment — no ceiling at all, on any segment.
    const floor = SEGMENT_FLOOR[this.segment] ?? 0;
    let proposedFlowDistance = Math.max(floor, this.flowDistance + effectiveSpeed * dt);

    // The frigate's hull is a genuine solid wall, not just a one-off "you
    // clipped it" penalty — outside the gap, forward progress is simply
    // held here, same shape as the bank clamp just below but on the flow
    // axis instead of the lateral one. Using last frame's lateralOffset for
    // the world-X check (this frame's isn't computed until just below) is a
    // one-frame-stale approximation, same tradeoff the bank check already
    // makes implicitly — lateralOffset can't move far in one frame.
    if (this.segment === 'lawrenceWest') {
      const tentativeWorldX = centerX(proposedFlowDistance) + this.lateralOffset;
      if (this.blockade.isHullBlocking(proposedFlowDistance, tentativeWorldX)) {
        proposedFlowDistance = this.flowDistance; // held in place, not pushed through
        // Bounce off the hull: strong backward push so you can escape
        this.speed = -8 * speedScale;
        this.handleHit({ type: 'shiphull' });
      }
    }

    // Diable's held arena: forward progress is clamped at the fight until
    // he's beaten. The clamp lands one frame before diable.update() below
    // flips the fight on; that's fine — a single frame of overshoot at
    // cruise speed is well under a tenth of a unit.
    if (this.segment === 'lawrenceWest' && !this.diable.isDefeated()
      && proposedFlowDistance >= DIABLE_FLOW_DISTANCE) {
      proposedFlowDistance = DIABLE_FLOW_DISTANCE;
    }

    this.flowDistance = proposedFlowDistance;
    this.world.distance = this.flowDistance;

    // Guaranteed pistol past Montréal — whether or not you stopped in town
    // and walked up to the gunsmith. acquirePistol() no-ops if you already
    // have it, so this just backstops the case where you sailed on by.
    if (this.segment === 'lawrenceWest' && this.flowDistance > MONTREAL_FLOW_DISTANCE
      && !this.weapons.has('pistol')) {
      this.acquirePistol();
    }

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    // Diable fight: direct lateral control for instant dodging, matching the
    // vertical responsiveness. No accel ramp, no damping, and — critically —
    // NOT run through the STEER_MAX clamp below, which is halved on touch
    // and was quietly throttling this to a crawl. Releasing the key snaps
    // the canoe to a dead stop, same as the up/down dodge.
    if (this.diable.isHolding()) {
      this.lateralVX = steerInput * FIGHT_LATERAL_SPEED;
    } else {
      // Fighting the current: steering authority drops the harder the
      // whitewater is pushing — but not in the air (Chasse-galerie), where the
      // river below can't touch the canoe at all, only the steeples can.
      const steerRapids = flying ? 0 : rapids;
      this.lateralVX += steerInput * STEER_ACCEL * (1 - steerRapids * RAPIDS_STEER_PENALTY) * dt;
      this.lateralVX -= this.lateralVX * STEER_DAMPING * dt;

      // Cross-current from blockade fight: pushes you away from the gap,
      // getting stronger as you approach the ship. Applied before velocity
      // clamping so the current is a real force to fight, not just a nudge.
      if (this.blockadeCrossCurrent) {
        this.lateralVX += this.blockadeCrossCurrent * dt;
      }

      // Chasse-galerie storm crosswind: shoves the canoe toward the banks the
      // whole flight, so holding a centre line is an active fight. Same "real
      // force, applied before the clamp" treatment as the blockade current.
      if (flying && !this.diable.isActive()) {
        this.lateralVX += this.chasseGalerie.windAccel(this.flowDistance, this.time) * dt;
      }

      this.lateralVX = clamp(this.lateralVX, -STEER_MAX, STEER_MAX);
    }

    // The navigable water: the canoe (flying or not) is held to this.
    const waterEdge = widthAt(this.flowDistance) / 2 - EDGE_MARGIN;
    // In the air the hard clamp sits a hair past the water so there's no
    // invisible wall at the edge — but that shallow strip is the bank
    // treetops (see below), not free sky.
    const half = waterEdge + (flying ? this.chasseGalerie.lateralMargin() : 0);
    const proposed = this.lateralOffset + this.lateralVX * dt;
    if (proposed > half || proposed < -half) {
      this.lateralOffset = clamp(proposed, -half, half);
      this.lateralVX *= -0.2;
      if (!flying) this.handleHit({ type: 'bank' });
    } else {
      this.lateralOffset = proposed;
    }

    // Chasse-galerie: the devil's canoe belongs over the river. Stray past
    // the water's edge into the bank treetops and you clip them — a hit
    // every INVULN_TIME you're in there, plus a shove back toward the
    // channel — so the flight stays fenced to the water even though you're
    // airborne.
    if (flying && Math.abs(this.lateralOffset) > waterEdge) {
      this.lateralVX -= Math.sign(this.lateralOffset) * TREE_PUSHBACK * dt;
      // During the Diable fight the treetops still fence you into the channel
      // (the pushback), but they don't bite — dodging his fire is enough.
      if (!this.diable.isActive()) this.handleHit({ type: 'tree' });
    }

    this.canoeWorldX = centerX(this.flowDistance) + this.lateralOffset;
    this.cameraCenterX = lerp(this.cameraCenterX, centerX(this.flowDistance), CAMERA_SMOOTH);
    // Zero inside the dead zone; positive/negative beyond it, so any real
    // steering swings the camera into motion well before the canoe visually
    // nears the edge of the canvas (see CAMERA_DEAD_ZONE's own comment).
    const lateralExcess = this.lateralOffset - clamp(this.lateralOffset, -CAMERA_DEAD_ZONE, CAMERA_DEAD_ZONE);
    this.cameraLateralPull = lerp(this.cameraLateralPull, lateralExcess, CAMERA_LATERAL_SMOOTH);
    this.cameraWorldX = this.cameraCenterX + this.cameraLateralPull;
    // The hard backstop (see its comment above) — clamps how far the canoe's
    // final on-screen position can end up from center, independent of
    // whatever the two lerps above are still catching up on.
    const onscreenOffset = clamp(this.canoeWorldX - this.cameraWorldX, -CAMERA_MAX_ONSCREEN_OFFSET, CAMERA_MAX_ONSCREEN_OFFSET);
    this.cameraWorldX = this.canoeWorldX - onscreenOffset;
    this.tilt = lerp(this.tilt, clamp(-this.lateralVX * 0.08, -0.5, 0.5), 0.15);

    // Diable fight: the river is locked, but up/down move the canoe
    // vertically within the arena so you can back off from the Devil (down
    // the screen) or press up toward him to dodge his fire. Feeds the held
    // hover altitude the flight update below eases toward.
    if (this.diable.isHolding()) {
      if (keys.down) this._bossHoverAlt -= FIGHT_HOVER_SPEED * dt;
      else if (keys.up) this._bossHoverAlt += FIGHT_HOVER_SPEED * dt;
      else {
        const back = BOSS_HOVER_HEIGHT - this._bossHoverAlt;
        this._bossHoverAlt += Math.sign(back) * Math.min(Math.abs(back), FIGHT_HOVER_RECENTER * dt);
      }
      this._bossHoverAlt = clamp(this._bossHoverAlt, FIGHT_HOVER_MIN, FIGHT_HOVER_MAX);
      this.chasseGalerie.setHeldAlt(this._bossHoverAlt);
    }

    // Chasse-galerie: tick the flight here — before the dock / braid-island /
    // obstacle checks below — so those all see this frame's airborne state
    // and nothing on the water can touch the canoe the instant it lifts off.
    if (this.segment === 'lawrenceWest') {
      const flight = this.chasseGalerie.update(this.flowDistance, this.canoeWorldX, dt);
      // The flight's own hazards (steeples, crosswind) are suspended for the
      // Diable fight — he's the whole challenge there.
      if (flight.hit && !this.diable.isActive()) this.handleHit({ type: 'steeple' });
      if (flight.active && flight.altitude > 0.1 && !this._chasseGalerieBannerShown) {
        this.showBanner('LA CHASSE-GALERIE — thread the steeples!');
        this._chasseGalerieBannerShown = true;
      }
    }
    const airborne = this.chasseGalerie.isActive();

    // Update weapons (bullets fly forward)
    this.weapons.update(dt);

    // Le Diable — the held-arena boss just before Gatineau. Ticked here so it
    // sees this frame's canoe position (for aiming/collision) and the flow
    // clamp above is already in place.
    if (this.segment === 'lawrenceWest') {
      this.updateDiable(dt);
    }

    // Docking takes priority over everything else this frame — running
    // into a dock is the one collision that isn't damage. Still checked
    // first, every frame, ahead of the mouth-crossing check below (so
    // docking at Tadoussac itself, if the player happens to steer into its
    // reach on the way past, still works exactly like every other village).
    if (this._castOffGrace > 0) this._castOffGrace -= dt;
    const dockHit = getDockHit(this.flowDistance, this.canoeWorldX);
    // Suppressed when: (a) it's the dock just cast off from and the grace
    // window is still open (see leaveVillage()'s lawrenceWest branch), or
    // (b) the canoe is airborne in the Chasse-galerie — there's no landing
    // anywhere along the flight, the riverbank towns are steeples now, not
    // docks. Every other dock still triggers normally.
    const suppressed =
      (this._castOffGrace > 0 && dockHit === this._castOffGraceVillage) ||
      this.chasseGalerie.isActive();
    if (dockHit && !suppressed) {
      this.enterVillage(dockHit);
      return;
    }

    // Crossing the mouth always continues upriver toward Québec City now —
    // no fork, no choice, no lean or dock-based branch selection. There
    // used to be one (lean toward Tadoussac's own bank to peel off west,
    // otherwise default east toward Sept-Îles); this game is a one-way trip
    // now, and lawrenceEast survives only as real geography for the minimap
    // to draw (see route.js's module comment) — a fun three-way junction to
    // look at, not a live gameplay destination.
    if (this.segment === 'fjord' && this.flowDistance >= MOUTH_DISTANCE) {
      if (!this.mouthAnnounced) this.mouthAnnounced = true;
      this.enterSegment('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
      this.showBanner('Paddling upriver toward Québec City — fight the current');
    } else if (this.segment === 'lawrenceEast' && this.flowDistance < MOUTH_DISTANCE) {
      // Only reachable via main.js's ?start= cheat now (e.g. ?start=sept-
      // iles) — normal play never sets segment to lawrenceEast any more.
      // Kept so paddling backward from a cheat-started position still
      // relabels correctly instead of leaving the minimap's local-distance
      // math clamped at 0, stuck on Tadoussac's own point.
      this.segment = 'fjord';
    }

    // Braided-channel islands sit mid-water, not at a fixed edge, so unlike
    // the bank they can't be handled with a position clamp — the canoe must
    // be free to pass through that X range in either side channel, and only
    // colliding if it's actually still over the island itself. Skipped while
    // airborne in the Chasse-galerie — same as rocks and deadfall below, the
    // only hazard up there is the steeples.
    const braid = braidAt(this.flowDistance);
    if (!airborne
      && braid && Math.abs(this.canoeWorldX - braid.centerX) < braid.halfWidth + ISLAND_HIT_MARGIN) {
      this.handleHit({ type: 'island' });
    }

    this.paddleTimer += dt * this.speed;
    if (this.paddleTimer > 2.2) {
      this.paddleTimer = 0;
      this.paddleSide *= -1;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.canoeVisible = Math.floor(this.time * 12) % 2 === 0;
    } else {
      this.canoeVisible = true;
    }

    this.rapids = rapids;
    this.effectiveSpeed = effectiveSpeed;

    // Fallback for a run that starts already in lawrenceEast — only
    // reachable via main.js's ?start= cheat now (e.g. ?start=sept-iles),
    // since normal play never branches there any more. The mouth-crossing
    // check above already handles a *live* crossing from the fjord, but a
    // run that begins in lawrenceEast never passes through that at all.
    // Deliberately not "segment !== lawrenceWest" here: a run starting in
    // lawrenceWest (e.g. ?start=quebec-city) never actually reached
    // Tadoussac either, just a numeric coincidence of SEGMENT_SHAPE_OFFSET
    // putting it past MOUTH_DISTANCE too.
    if (this.segment === 'lawrenceEast' && !this.mouthAnnounced) {
      this.mouthAnnounced = true;
      this.showBanner("You've reached Tadoussac — the Saguenay opens into the Saint Lawrence");
    }

    // Airborne in the Chasse-galerie (`airborne`), nothing on the water below
    // interacts with the canoe — rocks and deadfall can't hit it, fur pelts
    // can't be collected. The field still advances so it's coherent again on
    // landing. Only the steeples matter up there.
    this.obstacles.update(
      this.time, dt, effectiveSpeed, this.canoeWorldX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry),
      !airborne,
    );

    // Only meaningful on lawrenceWest — SHIP_FLOW_DISTANCE is a number on
    // that segment's own line, and could coincidentally fall in range of an
    // unrelated flowDistance on the fjord or lawrenceEast otherwise.
    if (this.segment === 'lawrenceWest') {
      const blockade = this.blockade.update(dt, this.flowDistance, this.canoeWorldX, effectiveSpeed, (entry) => this.handleHit(entry));
      this.blockadePct = blockade.active ? blockade.progressPct : null;
      this.blockadeCrossCurrent = blockade.crossCurrent || 0;
      // One boom per impact, hit or miss — a volley landing several shots
      // at once fires this the same number of times in the same frame.
      for (let i = 0; i < blockade.boomCount; i++) playCannonBoom();
      if (this.blockade.consumeJustSpotted()) {
        // Deliberately doesn't say which side is clear — finding the gap is
        // the point, not something to hand the player in a banner.
        this.showBanner('BRITISH BLOCKADE');
        this.music?.start(); // Ensure music system is initialized
        this.music?.playBossTrack();
        this._bossTrackCued = true;
      }
      if (this.blockade.consumeJustCleared()) {
        // Past the frigate itself — drop Rule Britannia back to the normal
        // shuffle here rather than blaring it through the whole pursuit. The
        // chase is a footnote now, not the boss.
        this.music?.endBossTrack();
      }
      // Catch-all: the instant the encounter is no longer active at all —
      // approach abandoned, chase escaped, whatever — make sure the boss
      // track isn't still going. endBossTrack() is a no-op if the shuffle's
      // already back, so the _bossTrackCued flag keeps this to one real call.
      if (this._bossTrackCued && !blockade.active) {
        this.music?.endBossTrack();
        this._bossTrackCued = false;
      }
      if (this.blockade.consumeJustStartedChase()) {
        this.showBanner('PURSUIT');
        console.log('[GAME] Chase phase started. Canoe visible:', this.canoeVisible, 'Position:', this.flowDistance);
        // Music already playing from blockade - don't restart
      }
      if (this.blockade.consumeJustEscaped()) {
        console.log('[GAME] Blockade escaped, ending boss track');
        this.music?.endBossTrack();
        // Find the next village ahead on the current segment
        const nextVillage = VILLAGES.find(v => v.segment === this.segment && v.flowDistance > this.flowDistance);
        const villageName = nextVillage ? nextVillage.name : 'Safe Waters';
        this.showBanner(`${villageName} Ahead — Safe Waters`);
      }
    } else {
      this.blockadePct = null;
      this.blockadeCrossCurrent = 0;
    }

    this.render();
    this.updateHud();
  }

  render() {
    const ctx = this.ctx;
    // The camera never tracks the player's steering, and only smoothly (not
    // exactly) tracks the river's own bend — see CAMERA_SMOOTH's comment.
    // Everything in the world (banks, water, obstacles, whales) renders
    // relative to this alone, so the world holds still under both steering
    // and the channel's continuous curving. The canoe is the thing that
    // visibly moves: its screen offset is (canoeWorldX - cameraWorldX),
    // which is lateralOffset plus however far the camera is currently
    // lagging behind the true curve. Every object's position *relative to
    // the canoe* is unchanged by any of this — it's purely a change of
    // render origin, not of any actual world position or collision math.
    const cameraWorldX = this.cameraWorldX;
    const isFlying = this.chasseGalerie.isActive();
    // 0..1 — how far the canoe is off the water, and how fully the hellstorm
    // look has crept in. Both ramp gradually over the climb up the Ottawa
    // (see chasseGalerie.js), so the shift into the Chasse-galerie is a slow
    // darkening rather than a snap.
    const lift = this.chasseGalerie.liftFraction();
    // The Diable fight sits at full storm regardless of where along the fade
    // curve its flowDistance happens to land — his darkness, held.
    const storm = this.diable.isActive() ? 1 : this.chasseGalerie.stormIntensityAt(this.flowDistance);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Hellstorm sky, faded in by `storm` — all but pure black overhead with
    // the faintest dead-violet cast, sinking to a low, smothered smear of
    // dried-blood red right at the horizon, like something is burning a long
    // way off and the smoke has swallowed most of it. The Devil isn't here
    // yet, but this is his weather.
    if (storm > 0) {
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#020105');
      gradient.addColorStop(0.44, '#08040a');
      gradient.addColorStop(0.74, '#170509');
      gradient.addColorStop(0.9, '#28080a');
      gradient.addColorStop(1, '#431009');
      ctx.save();
      ctx.globalAlpha = storm;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // While flying the Chasse-galerie there are no docks or town buildings
    // below — the riverbank parishes read as steeples only (drawn later).
    drawBanks(ctx, this.flowDistance, cameraWorldX, { hideVillages: isFlying });
    if (this.water) {
      this.water.render(this.time, this.flowDistance, cameraWorldX);
    } else {
      drawWaterFallback(ctx, this.flowDistance, cameraWorldX);
    }

    // Drown the ground in gloom as the storm creeps in — a heavy black wash
    // with a low, dull red heat bleeding through it, so the land and river
    // below read as scorched country glimpsed through smoke. Enough black
    // that the banks are shapes in the dark, not scenery.
    if (storm > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8 * storm;
      ctx.fillStyle = '#050203';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 0.13 * storm;
      ctx.fillStyle = '#420d06';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Airborne in the Chasse-galerie, the river below is just backdrop —
    // don't draw the rocks, logs, pelts, whitewater or whales the canoe is
    // flying over. (They still can't touch it either — see obstacles.update
    // below.) Only the steeples on the banks matter up there.
    if (!isFlying) {
      drawCurrentEffects(ctx, this.time, this.flowDistance, this.rapids);
      drawWhales(ctx, this.time, this.flowDistance, cameraWorldX, worldToScreen);
      this.obstacles.draw(ctx, this.time, cameraWorldX, worldToScreen);
    }
    // Same lawrenceWest-only guard as the update() call above.
    if (this.segment === 'lawrenceWest') this.blockade.draw(ctx, this.flowDistance, cameraWorldX, this.time);
    // Draw the Chasse-galerie churches cutting into the gorge
    if (this.segment === 'lawrenceWest') this.chasseGalerie.drawStorm(ctx, this.flowDistance, cameraWorldX);

    if (this.canoeVisible !== false) {
      const sprite = this.paddleSide > 0 ? this.canoeSprites.right : this.canoeSprites.left;
      const canoeScreenX = CANOE_SCREEN_X + (this.canoeWorldX - cameraWorldX) * PIXELS_PER_UNIT;

      // Debug: log if canoe is rendering off-screen during lawrenceWest
      if (this.segment === 'lawrenceWest' && this.blockadePct !== null) {
        console.log('[RENDER] Canoe screen pos:', canoeScreenX.toFixed(1), 'World pos:', this.canoeWorldX.toFixed(1), 'Camera:', cameraWorldX.toFixed(1));
      }

      // Flying effects (Chasse-galerie) — everything scales with `lift`, so
      // the canoe rises, tilts and lights its trail gradually on take-off.
      const altitude = this.chasseGalerie.getAltitude();

      // Bobbing grows in as the canoe leaves the water
      const bob = Math.sin(this.time * 2) * 3 * lift;
      const canoeScreenY = CANOE_SCREEN_Y - altitude * PIXELS_PER_UNIT + bob;

      if (lift > 0.05) {
        // Shadow on the water below, deepening as the canoe climbs
        ctx.save();
        ctx.globalAlpha = 0.3 * lift;
        ctx.fillStyle = '#000';
        ctx.translate(canoeScreenX, CANOE_SCREEN_Y);
        ctx.rotate(this.tilt || 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, sprite.width / 2, sprite.height / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Hellfire trail — the flame the canoe is riding on
        for (let i = 0; i < 6; i++) {
          const trailX = canoeScreenX + (Math.random() - 0.5) * sprite.width;
          const trailY = canoeScreenY + sprite.height / 2 + i * 8;
          const sparkleSize = 1 + Math.random() * 2.5;
          const sparkleAlpha = (0.5 - i * 0.08) * lift;

          ctx.save();
          ctx.globalAlpha = sparkleAlpha * (0.5 + Math.sin(this.time * 8 + i) * 0.5);
          ctx.fillStyle = i % 3 === 0 ? '#ffca5a' : '#ff5a1e';
          ctx.fillRect(trailX - sparkleSize / 2, trailY - sparkleSize / 2, sparkleSize, sparkleSize);
          ctx.restore();
        }

        // Wind streaks, dragged dark-red across the storm
        for (let i = 0; i < 8; i++) {
          const lineY = Math.random() * CANVAS_HEIGHT;
          const lineLength = 20 + Math.random() * 30;
          const lineX = CANVAS_WIDTH - (this.time * 200 + i * 40) % CANVAS_WIDTH;

          ctx.save();
          ctx.globalAlpha = 0.18 * lift;
          ctx.strokeStyle = '#7a1c12';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineX, lineY);
          ctx.lineTo(lineX - lineLength, lineY);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw canoe with flying effects
      ctx.save();
      ctx.translate(canoeScreenX, canoeScreenY);

      // Banking tilt and nose-up pitch ease in with `lift`
      const bankingMultiplier = 1 + 1.5 * lift;
      const noseUpAngle = 0.15 * lift;
      ctx.rotate((this.tilt || 0) * bankingMultiplier + noseUpAngle);

      // Grows a little as it climbs toward the camera, but never looms
      const scale = 1 + 0.5 * lift;
      ctx.scale(scale, scale);

      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    } else if (this.segment === 'lawrenceWest' && this.blockadePct !== null) {
      console.log('[RENDER] Canoe NOT visible! canoeVisible:', this.canoeVisible);
    }

    // Draw bullets
    this.weapons.draw(ctx, this.flowDistance, cameraWorldX, worldToScreen);

    // Storm mood, over everything — all of it faded in by `storm`.
    if (storm > 0) {
      // A few dim cinders drifting up out of the dark — sparse and
      // blood-coloured, the last of a fire rather than a warm shower of sparks.
      ctx.save();
      for (let i = 0; i < 13; i++) {
        const seed = i * 47.3;
        const rise = 14 + (i % 5) * 6;
        const y = CANVAS_HEIGHT + 16 - ((this.time * rise + seed * 6.1) % (CANVAS_HEIGHT + 40));
        const x = (seed * 13.7 + Math.sin(this.time * 0.6 + seed) * 22) % CANVAS_WIDTH;
        const flick = 0.35 + Math.sin(this.time * 8 + seed) * 0.45;
        if (flick <= 0.08) continue;
        const s = 1 + (i % 3);
        ctx.globalAlpha = Math.min(1, flick) * 0.42 * storm;
        ctx.fillStyle = i % 4 === 0 ? '#a8481a' : '#7a1e0e';
        ctx.fillRect(x, y, s, s);
      }
      ctx.restore();

      // A heavy black vignette, breathing slightly, crushed in tight so only
      // the middle of the channel is ever really lit and the churches lunge
      // out of the dark with almost no warning.
      const pulse = (0.78 + Math.sin(this.time * 1.15) * 0.09) * storm;
      const vg = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.24,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.92,
      );
      vg.addColorStop(0, 'rgba(1,0,1,0)');
      vg.addColorStop(0.5, `rgba(4,0,2,${(pulse * 0.62).toFixed(3)})`);
      vg.addColorStop(1, `rgba(0,0,0,${pulse.toFixed(3)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Lightning — no relief. A dim, dead-coloured flicker, the wrong
      // colour for lightning, that barely lifts the gloom before it's gone.
      const lf = lightningFlash(this.time);
      if (lf > 0) {
        ctx.save();
        ctx.globalAlpha = lf * 0.28 * storm;
        ctx.fillStyle = '#6f6076';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
    }

    // Le Diable, over the storm mood so his hellfire rim and eyes stay crisp
    // against the black. His fireballs are drawn here too (inside diable.js).
    if (this.segment === 'lawrenceWest') this.diable.draw(ctx, this.time);
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;

    const healthPct = clamp((this.health / MAX_HEALTH) * 100, 0, 100);
    this.ui.hudHealthFill.style.width = `${healthPct}%`;
    this.ui.hudHealthFill.classList.toggle('warn', healthPct <= 60 && healthPct > 30);
    this.ui.hudHealthFill.classList.toggle('critical', healthPct <= 30);

    // Effective (current-boosted) speed, not just the paddle stat, so the
    // bar shows "the current is flying you along" during rapids. Measured
    // from a dead stop (0), not from MIN_SPEED — so just drifting still
    // shows a little fill, and braking visibly drains it to empty instead
    // of it already sitting at zero the moment you stop paddling hard.
    const speedPct = clamp((this.effectiveSpeed / MAX_SPEED) * 100, 0, 100);
    // While actively braking, hold the bar at a short red nub so pushing
    // back always reads as a real action — even pinned against the put-in
    // where there's no forward motion left to visibly lose.
    const braking = this.input.state.down && this.mode === 'river';
    this.ui.hudSpeedFill.style.width = `${braking ? Math.max(6, speedPct) : speedPct}%`;
    this.ui.hudSpeedFill.classList.toggle('rapids', this.rapids > 0.15 && !braking);
    this.ui.hudSpeedFill.classList.toggle('braking', braking);

    // flowDistance is the persistent world position that never resets on
    // restart, so the map marker holds its real place on the river across a
    // capsize+retry instead of jumping back to the put-in; segment is
    // needed alongside it since flowDistance alone doesn't say which of the
    // three branches that number belongs to (see minimap.js's update()).
    this.ui.minimap.update(this.segment, this.flowDistance);

    // Le Diable's health bar — only up while the fight runs.
    if (this.diablePct != null) {
      this.ui.hudDiable?.classList.remove('hidden');
      if (this.ui.hudDiableFill) this.ui.hudDiableFill.style.width = `${clamp(this.diablePct, 0, 100)}%`;
    } else {
      this.ui.hudDiable?.classList.add('hidden');
    }
  }
}
