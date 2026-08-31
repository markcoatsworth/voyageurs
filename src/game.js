import { centerX, widthAt, braidAt, rapidsStrength, MOUTH_DISTANCE, SEGMENT_SHAPE_OFFSET } from './river/path.js';
import { worldToScreen, CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT } from './twod/config.js';
import { drawBanks, drawWaterFallback } from './twod/terrain.js';
import { drawWhales } from './twod/whales.js';
import { createCanoeSprites } from './twod/canoe.js';
import { playCapsizeHorn, playPeltChime, playDamageBoop } from './twod/sfx.js';
import { getDockHit, dockHitZ } from './twod/villages.js';
import { createVillageScene } from './twod/villageScene.js';
import { isTouchPrimary } from './twod/touchControls.js';

// A D-pad's discrete taps are less precise than a keyboard's held keys, and
// the same world speed reads as faster filling more of a small screen — the
// same numbers that felt right on desktop consistently played as "way too
// fast" on touch. Scale forward-motion constants down for touch specifically
// rather than changing the feel for everyone.
const MOBILE_SPEED_SCALE = 0.6;
const speedScale = isTouchPrimary() ? MOBILE_SPEED_SCALE : 1;

// MIN_SPEED is really the ambient current's own speed — holding Down long
// enough now overcomes it and actually paddles upstream (negative
// effectiveSpeed, flowDistance decreasing), rather than just coasting down
// to this as a floor; letting off Up/Down drifts back toward it from
// *either* side, same as a real current eventually winning again once you
// stop fighting it. Deliberately well under BASE_SPEED so drifting forward
// reads as an actual "chill" slow speed, not just a mild step down from
// medium.
const MIN_SPEED = 2.5 * speedScale;
const MAX_SPEED = 16 * speedScale;
// Paddling against the current is harder than going with it — capped well
// under MAX_SPEED's magnitude, so upstream is a real but slow slog, not a
// second forward gear pointed the other way.
const MAX_REVERSE_SPEED = -6 * speedScale;
// lawrenceWest (toward Québec City) is the one stretch that's genuinely
// upstream in reality — see river/route.js's module comment — and this is
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
const ACCEL = 7 * speedScale;
const DECEL_DRIFT = 1.8 * speedScale;
const STEER_ACCEL = 20;
const STEER_MAX = 7;
const STEER_DAMPING = 6;
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
// The Saint Lawrence stretch (river/path.js's ESTUARY_WIDTH) is far wider
// than the screen, so lateralOffset alone — the *only* thing that used to
// move the canoe off the centerline visually, since the camera above only
// ever tracks the curve, never the player's own steering — can no longer
// just be handed straight to the canoe's screen position: a canoe camped
// out mid-crossing could steer itself yards past the edge of the canvas,
// and it'd render there, or not at all. CAMERA_DEAD_ZONE is how far the
// canoe can drift from the *tracked* centerline before the camera starts
// easing sideways to keep up, in world units — set to what a fully-loaded
// old-width channel already allowed (its max half-width was ~8.7), so nothing
// changes in the fjord, where lateralOffset never gets close to it. Past
// that, CAMERA_LATERAL_PULL — tracked as its own lerp, separate from and
// faster than CAMERA_SMOOTH above — reels the camera toward the canoe, same
// "world stays planted, the boat visibly moves" logic as the curve-tracking
// camera, just triggered by a steering choice instead of a bend in the
// river.
const CAMERA_DEAD_ZONE = 8.5;
const CAMERA_LATERAL_SMOOTH = 0.12;
// A hard backstop under the canvas's actual half-width (CANVAS_WIDTH / 2 /
// PIXELS_PER_UNIT = 10 units) so a fast or sustained steering input can't
// outrun CAMERA_LATERAL_SMOOTH's catch-up and momentarily push the canoe
// (which itself has width) off the edge of the canvas while the lerp is
// still closing the gap. The soft dead zone above handles the normal case;
// this only ever engages during unusually hard/sustained steering, and even
// then just holds the canoe at this offset instead of letting it go further.
const CAMERA_MAX_ONSCREEN_OFFSET = 9;
const RAPIDS_BOOST = 7 * speedScale; // extra units/s the current adds at peak whitewater
const RAPIDS_STEER_PENALTY = 0.45; // up to 45% less steering authority there

// lawrenceWest (river/route.js's third segment, toward Québec City) is the
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

    // 'river' (paddling) or 'village' (on foot, ashore at a dock) — see
    // enterVillage()/leaveVillage(). Separate from this.state, which is
    // still just 'playing' | 'gameover'; a capsize can't happen mid-village
    // visit since river collision checks don't run in that mode.
    this.mode = 'river';
    this.currentVillage = null;
    // Which of river/route.js's SEGMENTS is active — see SEGMENT_FLOOR and
    // leaveVillage()'s Tadoussac branch for the junction itself. Persists
    // across restarts exactly like flowDistance below (a capsize shouldn't
    // un-choose which branch of the river you were on).
    this.segment = startSegment;

    this.time = 0;
    this.flowDistance = startFlowDistance;
    // obstacles.reset() (called from start() below) seeds its pool by
    // reading world.distance directly, before update() has ever run to set
    // it from flowDistance the normal way — without this, a non-zero
    // startFlowDistance would seed every obstacle back near the put-in
    // instead of near wherever the player actually starts.
    this.world.distance = startFlowDistance;
    this.paddleSide = 1;
    this.paddleTimer = 0;
    // The camera's own persistent state — deliberately not reset on restart
    // (see the flowDistance comment below). Tracked as two separate lerps
    // (curve-following + lateral-pull, see CAMERA_DEAD_ZONE above) that get
    // summed into cameraWorldX each frame in update(); cameraWorldX itself
    // is what render() and everything it calls actually reads.
    this.cameraCenterX = centerX(startFlowDistance);
    this.cameraLateralPull = 0;
    this.cameraWorldX = this.cameraCenterX;

    ui.restartBtn.addEventListener('click', () => this.start());

    // No title-screen gate — the canoe launches the instant the page is
    // ready; the intro caption (main.js) is a non-blocking overlay that
    // fades on its own timer instead of waiting for a click.
    this.start();
  }

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
    this.tilt = 0;
    this.paused = false;
    this.ui.pauseScreen?.classList.add('hidden');
    this.mode = 'river';
    this.currentVillage = null;
  }

  togglePause() {
    if (this.state !== 'playing') return; // nothing sensible to pause over the title/gameover screens
    this.paused = !this.paused;
    this.ui.pauseScreen.classList.toggle('hidden', !this.paused);
    if (this.paused) this.music?.stop();
    else this.music?.resume();
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
    this.ui.finalStats.innerHTML = `FURS COLLECTED: ${this.furs}`;
    this.ui.gameoverScreen.classList.remove('hidden');
    playCapsizeHorn();
    this.music?.stop();
  }

  // Ashore mechanics are intentionally minimal for now: walk around, walk
  // back onto the dock to re-board. Shops (sell furs, repair the hull) are
  // the planned next step once this loop is solid.
  enterVillage(village) {
    this.mode = 'village';
    this.currentVillage = village;
    this.villageScene.enter(village);
    this.ui.hud.classList.add('hidden');
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
      this.flowDistance = this.currentVillage.flowDistance + dockHitZ(this.currentVillage) + 0.5;
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
      const { reboard, tradeRequested } = this.villageScene.update(dt, this.input.state);
      if (tradeRequested) this.tryRepairTrade();
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
    const ambientDecel = this.segment === 'lawrenceWest' ? UPRIVER_DECEL : DECEL_DRIFT * 0.3;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) this.speed = Math.max(MAX_REVERSE_SPEED, this.speed - ACCEL * dt);
    // No input: drift back toward the current's own speed from whichever
    // side you're currently on — this is what makes upstream paddling a
    // deliberate, sustained effort rather than a one-way switch: stop
    // paddling and the river carries you forward again (or, on
    // lawrenceWest, backward — same drift, aimed the other way).
    else if (this.speed > ambientCurrent) this.speed = Math.max(ambientCurrent, this.speed - ambientDecel * dt);
    else this.speed = Math.min(ambientCurrent, this.speed + ambientDecel * dt);

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
    const effectiveSpeed = this.speed + rapids * RAPIDS_BOOST * rapidsDirection;

    // Advance the shared river clock using this frame's effective speed —
    // the same value obstacles sample below — so the baked downstream
    // distance (d = world.distance - z) stays exactly invariant. Floored
    // per SEGMENT_FLOOR's comment — no ceiling at all, on any segment.
    const floor = SEGMENT_FLOOR[this.segment] ?? 0;
    this.flowDistance = Math.max(floor, this.flowDistance + effectiveSpeed * dt);
    this.world.distance = this.flowDistance;

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    // Fighting the current: steering authority drops the harder the
    // whitewater is pushing.
    this.lateralVX += steerInput * STEER_ACCEL * (1 - rapids * RAPIDS_STEER_PENALTY) * dt;
    this.lateralVX -= this.lateralVX * STEER_DAMPING * dt;
    this.lateralVX = clamp(this.lateralVX, -STEER_MAX, STEER_MAX);

    const half = widthAt(this.flowDistance) / 2 - EDGE_MARGIN;
    const proposed = this.lateralOffset + this.lateralVX * dt;
    if (proposed > half || proposed < -half) {
      this.lateralOffset = clamp(proposed, -half, half);
      this.lateralVX *= -0.2;
      this.handleHit({ type: 'bank' });
    } else {
      this.lateralOffset = proposed;
    }

    this.canoeWorldX = centerX(this.flowDistance) + this.lateralOffset;
    this.cameraCenterX = lerp(this.cameraCenterX, centerX(this.flowDistance), CAMERA_SMOOTH);
    // Zero inside the dead zone, so on the (still much narrower) fjord this
    // never engages and the camera behaves exactly as it always did.
    const lateralExcess = this.lateralOffset - clamp(this.lateralOffset, -CAMERA_DEAD_ZONE, CAMERA_DEAD_ZONE);
    this.cameraLateralPull = lerp(this.cameraLateralPull, lateralExcess, CAMERA_LATERAL_SMOOTH);
    this.cameraWorldX = this.cameraCenterX + this.cameraLateralPull;
    // The hard backstop (see its comment above) — clamps how far the canoe's
    // final on-screen position can end up from center, independent of
    // whatever the two lerps above are still catching up on.
    const onscreenOffset = clamp(this.canoeWorldX - this.cameraWorldX, -CAMERA_MAX_ONSCREEN_OFFSET, CAMERA_MAX_ONSCREEN_OFFSET);
    this.cameraWorldX = this.canoeWorldX - onscreenOffset;
    this.tilt = lerp(this.tilt, clamp(-this.lateralVX * 0.08, -0.5, 0.5), 0.15);

    // Docking takes priority over everything else this frame — running
    // into a dock is the one collision that isn't damage. Still checked
    // first, every frame, ahead of the mouth-crossing check below (so
    // docking at Tadoussac itself, if the player happens to steer into its
    // reach on the way past, still works exactly like every other village).
    const dockHit = getDockHit(this.flowDistance, this.canoeWorldX);
    if (dockHit) {
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
    // colliding if it's actually still over the island itself.
    const braid = braidAt(this.flowDistance);
    if (braid && Math.abs(this.canoeWorldX - braid.centerX) < braid.halfWidth + ISLAND_HIT_MARGIN) {
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

    this.obstacles.update(
      this.time, dt, effectiveSpeed, this.canoeWorldX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry)
    );

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

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBanks(ctx, this.flowDistance, cameraWorldX);
    if (this.water) {
      this.water.render(this.time, this.flowDistance, cameraWorldX);
    } else {
      drawWaterFallback(ctx, this.flowDistance, cameraWorldX);
    }
    drawWhales(ctx, this.time, this.flowDistance, cameraWorldX, worldToScreen);
    this.obstacles.draw(ctx, this.time, cameraWorldX, worldToScreen);

    if (this.canoeVisible !== false) {
      const sprite = this.paddleSide > 0 ? this.canoeSprites.right : this.canoeSprites.left;
      ctx.save();
      ctx.translate(CANOE_SCREEN_X + (this.canoeWorldX - cameraWorldX) * PIXELS_PER_UNIT, CANOE_SCREEN_Y);
      ctx.rotate(this.tilt || 0);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;

    const healthPct = clamp((this.health / MAX_HEALTH) * 100, 0, 100);
    this.ui.hudHealthFill.style.width = `${healthPct}%`;
    this.ui.hudHealthFill.classList.toggle('warn', healthPct <= 60 && healthPct > 30);
    this.ui.hudHealthFill.classList.toggle('critical', healthPct <= 30);

    // Effective (current-boosted) speed, not just the paddle stat, so the
    // bar actually shows "the current is flying you along" during rapids.
    const speedPct = ((this.effectiveSpeed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    this.ui.hudSpeedFill.style.width = `${clamp(speedPct, 0, 100)}%`;
    this.ui.hudSpeedFill.classList.toggle('rapids', this.rapids > 0.15);

    // flowDistance is the persistent world position that never resets on
    // restart, so the map marker holds its real place on the river across a
    // capsize+retry instead of jumping back to the put-in; segment is
    // needed alongside it since flowDistance alone doesn't say which of the
    // three branches that number belongs to (see minimap.js's update()).
    this.ui.minimap.update(this.segment, this.flowDistance);
  }
}
