import { centerX, widthAt, braidAt, rapidsStrength, MOUTH_DISTANCE } from './river/path.js';
import { worldToScreen, CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT } from './twod/config.js';
import { drawBanks, drawWaterFallback } from './twod/terrain.js';
import { drawWhales } from './twod/whales.js';
import { createCanoeSprites } from './twod/canoe.js';
import { playCapsizeHorn, playPeltChime, playDamageBoop } from './twod/sfx.js';
import { getDockHit, DOCK_HIT_Z } from './twod/villages.js';
import { createVillageScene } from './twod/villageScene.js';
import { isTouchPrimary } from './twod/touchControls.js';

// A D-pad's discrete taps are less precise than a keyboard's held keys, and
// the same world speed reads as faster filling more of a small screen — the
// same numbers that felt right on desktop consistently played as "way too
// fast" on touch. Scale forward-motion constants down for touch specifically
// rather than changing the feel for everyone.
const MOBILE_SPEED_SCALE = 0.6;
const speedScale = isTouchPrimary() ? MOBILE_SPEED_SCALE : 1;

const MIN_SPEED = 5 * speedScale;
const MAX_SPEED = 16 * speedScale;
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
const RAPIDS_BOOST = 7 * speedScale; // extra units/s the current adds at peak whitewater
const RAPIDS_STEER_PENALTY = 0.45; // up to 45% less steering authority there

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Game {
  constructor({ ctx, water, input, obstacles, world, ui, music }) {
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

    this.time = 0;
    this.flowDistance = 0;
    this.paddleSide = 1;
    this.paddleTimer = 0;
    // The camera's own persistent state — deliberately not reset on restart
    // (see the flowDistance comment below), and deliberately never exactly
    // equal to centerX(flowDistance) — see updateCamera().
    this.cameraWorldX = centerX(0);

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
    this.distance = 0;
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
    this.ui.finalStats.innerHTML =
      `FURS COLLECTED: ${this.furs}<br/>DISTANCE: ${Math.round(this.distance)}m`;
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
    this.showBanner(`Arriving at ${village.name}`);
  }

  leaveVillage() {
    this.mode = 'river';
    // Push just past the dock's own trigger zone — otherwise the instant
    // control returns to the canoe, it's still sitting in the exact spot
    // that triggered docking, and the very next frame docks it again.
    this.flowDistance = this.currentVillage.flowDistance + DOCK_HIT_Z + 0.5;
    this.world.distance = this.flowDistance;
    this.currentVillage = null;
    this.ui.hud.classList.remove('hidden');
    this.showBanner('Casting off');
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
      const reboarded = this.villageScene.update(dt, this.input.state);
      this.villageScene.draw(this.ctx);
      if (reboarded) this.leaveVillage();
      return;
    }

    const keys = this.input.state;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) this.speed = Math.max(MIN_SPEED, this.speed - ACCEL * dt);
    else this.speed = Math.max(MIN_SPEED, this.speed - DECEL_DRIFT * dt * 0.3);

    // Rapids strength at where the canoe currently is (i.e. before this
    // frame's advance) — the current adds its own push on top of whatever
    // the player is doing with the paddle, rather than replacing it, so
    // "up" still matters even mid-rapids. this.speed stays the player's own
    // paddling stat; effectiveSpeed is what actually moves the world.
    const rapids = rapidsStrength(this.flowDistance);
    const effectiveSpeed = this.speed + rapids * RAPIDS_BOOST;

    // Advance the shared river clock using this frame's effective speed —
    // the same value obstacles sample below — so the baked downstream
    // distance (d = world.distance - z) stays exactly invariant.
    this.flowDistance += effectiveSpeed * dt;
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
    this.cameraWorldX = lerp(this.cameraWorldX, centerX(this.flowDistance), CAMERA_SMOOTH);
    this.tilt = lerp(this.tilt, clamp(-this.lateralVX * 0.08, -0.5, 0.5), 0.15);

    // Docking takes priority over everything else this frame — running
    // into a dock is the one collision that isn't damage.
    const dockHit = getDockHit(this.flowDistance, this.canoeWorldX);
    if (dockHit) {
      this.enterVillage(dockHit);
      return;
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

    this.distance += effectiveSpeed * dt;
    this.rapids = rapids;
    this.effectiveSpeed = effectiveSpeed;

    if (!this.mouthAnnounced && this.distance >= MOUTH_DISTANCE) {
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
    this.ui.hudDistance.textContent = `DISTANCE: ${Math.round(this.distance)}m`;

    const healthPct = clamp((this.health / MAX_HEALTH) * 100, 0, 100);
    this.ui.hudHealthFill.style.width = `${healthPct}%`;
    this.ui.hudHealthFill.classList.toggle('warn', healthPct <= 60 && healthPct > 30);
    this.ui.hudHealthFill.classList.toggle('critical', healthPct <= 30);

    // Effective (current-boosted) speed, not just the paddle stat, so the
    // bar actually shows "the current is flying you along" during rapids.
    const speedPct = ((this.effectiveSpeed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    this.ui.hudSpeedFill.style.width = `${clamp(speedPct, 0, 100)}%`;
    this.ui.hudSpeedFill.classList.toggle('rapids', this.rapids > 0.15);

    // flowDistance (not this.distance) — it's the persistent world
    // position that never resets on restart, so the map marker holds its
    // real place on the river across a capsize+retry instead of jumping
    // back to the put-in.
    this.ui.minimap.update(this.flowDistance);
  }
}
