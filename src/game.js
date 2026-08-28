import { centerX, widthAt, MOUTH_DISTANCE } from './river/path.js';
import { worldToScreen, CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_WIDTH, CANVAS_HEIGHT } from './twod/config.js';
import { drawBanks, drawWaterFallback } from './twod/terrain.js';
import { drawWhales } from './twod/whales.js';
import { createCanoeSprites } from './twod/canoe.js';

const MIN_SPEED = 5;
const MAX_SPEED = 16;
const BASE_SPEED = 8;
const ACCEL = 7;
const DECEL_DRIFT = 1.8;
const STEER_ACCEL = 20;
const STEER_MAX = 7;
const STEER_DAMPING = 6;
const EDGE_MARGIN = 0.55;
const LOG_PENALTY_SPEED = 4;
const BANK_PENALTY_SPEED = 2.6;
const INVULN_TIME = 1.2;
const BANK_INVULN_TIME = 0.7;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Game {
  constructor({ ctx, water, input, obstacles, world, ui }) {
    this.ctx = ctx;
    this.water = water; // null falls back to a 2D-drawn water fill
    this.input = input;
    this.obstacles = obstacles;
    this.world = world;
    this.ui = ui;
    this.canoeSprites = createCanoeSprites();

    this.time = 0;
    this.flowDistance = 0;
    this.paddleSide = 1;
    this.paddleTimer = 0;

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
    this.distance = 0;
    this.furs = 0;
    this.invulnTimer = 0;
    this.mouthAnnounced = false;
    this.tilt = 0;
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
    this.ui.gameoverScreen.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  gameOver() {
    this.state = 'gameover';
    this.ui.hud.classList.add('hidden');
    this.ui.finalStats.innerHTML =
      `FURS COLLECTED: ${this.furs}<br/>DISTANCE: ${Math.round(this.distance)}m`;
    this.ui.gameoverScreen.classList.remove('hidden');
  }

  handleHit(entry) {
    if (this.invulnTimer > 0) return;
    if (entry.type === 'rock' || entry.type === 'island') {
      this.gameOver();
    } else if (entry.type === 'bank') {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - BANK_PENALTY_SPEED);
      this.invulnTimer = BANK_INVULN_TIME;
    } else {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - LOG_PENALTY_SPEED);
      this.invulnTimer = INVULN_TIME;
    }
  }

  handleCollect() {
    this.furs += 1;
  }

  update(dt) {
    this.time += dt;

    if (this.state !== 'playing') {
      // Capsizing is a hard freeze — the last frame drawn before gameOver()
      // fired (still inside the 'playing' branch below) stays on screen
      // untouched. Nothing here advances the river clock or redraws, so the
      // canoe and whatever it hit stop exactly where they were.
      return;
    }

    const keys = this.input.state;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) this.speed = Math.max(MIN_SPEED, this.speed - ACCEL * dt);
    else this.speed = Math.max(MIN_SPEED, this.speed - DECEL_DRIFT * dt * 0.3);

    // Advance the shared river clock using this frame's just-updated speed —
    // the same value obstacles/terrain sample below — so the baked
    // downstream distance (d = world.distance - z) stays exactly invariant.
    this.flowDistance += this.speed * dt;
    this.world.distance = this.flowDistance;

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    this.lateralVX += steerInput * STEER_ACCEL * dt;
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
    this.tilt = lerp(this.tilt, clamp(-this.lateralVX * 0.08, -0.5, 0.5), 0.15);

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

    this.distance += this.speed * dt;

    if (!this.mouthAnnounced && this.distance >= MOUTH_DISTANCE) {
      this.mouthAnnounced = true;
      this.showBanner("You've reached Tadoussac — the Saguenay opens into the Saint Lawrence");
    }

    this.obstacles.update(
      this.time, dt, this.speed, this.canoeWorldX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry)
    );

    this.render(this.speed);
    this.updateHud();
  }

  render(flowSpeed) {
    const ctx = this.ctx;
    const canoeWorldX = this.canoeWorldX ?? centerX(this.flowDistance);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBanks(ctx, this.flowDistance, canoeWorldX);
    if (this.water) {
      this.water.render(this.time, this.flowDistance, canoeWorldX);
    } else {
      drawWaterFallback(ctx, this.flowDistance, canoeWorldX);
    }
    drawWhales(ctx, this.time, this.flowDistance, canoeWorldX, worldToScreen);
    this.obstacles.draw(ctx, this.time, canoeWorldX, worldToScreen);

    if (this.canoeVisible !== false) {
      const sprite = this.paddleSide > 0 ? this.canoeSprites.right : this.canoeSprites.left;
      ctx.save();
      ctx.translate(CANOE_SCREEN_X, CANOE_SCREEN_Y);
      ctx.rotate(this.tilt || 0);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;
    this.ui.hudDistance.textContent = `DISTANCE: ${Math.round(this.distance)}m`;
    const speedPct = ((this.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    this.ui.hudSpeedFill.style.width = `${clamp(speedPct, 0, 100)}%`;
  }
}
