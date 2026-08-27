import * as THREE from 'three';
import { centerX, widthAt, MOUTH_DISTANCE } from './scene/riverPath.js';

const MIN_SPEED = 7;
const MAX_SPEED = 24;
const BASE_SPEED = 12;
const ACCEL = 10;
const DECEL_DRIFT = 2.5;
const STEER_ACCEL = 26;
const STEER_MAX = 9;
const STEER_DAMPING = 6;
const EDGE_MARGIN = 0.55;
const LOG_PENALTY_SPEED = 6;
const BANK_PENALTY_SPEED = 4;
const INVULN_TIME = 1.2;
const BANK_INVULN_TIME = 0.7;
const LOOKAHEAD = 9;

export class Game {
  constructor({ canoe, camera, input, river, terrain, obstacles, whales, hills, world, ui }) {
    this.canoe = canoe;
    this.camera = camera;
    this.input = input;
    this.river = river;
    this.terrain = terrain;
    this.obstacles = obstacles;
    this.whales = whales;
    this.hills = hills;
    this.world = world;
    this.ui = ui;

    this.time = 0;
    // world.distance is the persistent river "clock" driving the curve —
    // it never resets, even across a game over, so scenery never jumps.
    this.flowDistance = 0;

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
    this.canoe.rotation.set(0, 0, 0);
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
      this.speed = Math.max(MIN_SPEED - 2, this.speed - BANK_PENALTY_SPEED);
      this.invulnTimer = BANK_INVULN_TIME;
    } else {
      this.speed = Math.max(MIN_SPEED - 2, this.speed - LOG_PENALTY_SPEED);
      this.invulnTimer = INVULN_TIME;
    }
  }

  handleCollect() {
    this.furs += 1;
  }

  update(dt) {
    this.time += dt;

    if (this.state !== 'playing') {
      const flowSpeed = BASE_SPEED * 0.4;
      this.flowDistance += flowSpeed * dt;
      this.world.distance = this.flowDistance;
      this.river.update(this.time, dt, flowSpeed);
      this.terrain.update(dt, flowSpeed);
      this.whales.update(this.time, dt, flowSpeed);
      this.updateCanoeAndCamera(dt);
      return;
    }

    const keys = this.input.state;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) this.speed = Math.max(MIN_SPEED, this.speed - ACCEL * dt);
    else this.speed = Math.max(MIN_SPEED, this.speed - DECEL_DRIFT * dt * 0.3);

    // Advance the shared river clock using this frame's just-updated speed —
    // the same value handed to river/terrain/obstacles below — so the baked
    // downstream distance (d = world.distance - z) stays exactly invariant.
    this.flowDistance += this.speed * dt;
    this.world.distance = this.flowDistance;

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    this.lateralVX += steerInput * STEER_ACCEL * dt;
    this.lateralVX -= this.lateralVX * STEER_DAMPING * dt;
    this.lateralVX = THREE.MathUtils.clamp(this.lateralVX, -STEER_MAX, STEER_MAX);

    const half = widthAt(this.flowDistance) / 2 - EDGE_MARGIN;
    const proposed = this.lateralOffset + this.lateralVX * dt;
    if (proposed > half || proposed < -half) {
      this.lateralOffset = THREE.MathUtils.clamp(proposed, -half, half);
      this.lateralVX *= -0.2;
      this.handleHit({ type: 'bank' });
    } else {
      this.lateralOffset = proposed;
    }

    this.canoeWorldX = centerX(this.flowDistance) + this.lateralOffset;
    this.canoe.position.x = this.canoeWorldX;
    this.canoe.rotation.z = THREE.MathUtils.lerp(this.canoe.rotation.z, -this.lateralVX * 0.05, 0.15);
    this.canoe.rotation.y = THREE.MathUtils.lerp(this.canoe.rotation.y, -this.lateralVX * 0.04, 0.15);
    this.canoe.position.y = Math.sin(this.time * 2.2) * 0.03;

    const paddle = this.canoe.userData.paddle;
    if (paddle) {
      paddle.rotation.x = 0.3 + Math.sin(this.time * this.speed * 0.5) * 0.5;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.canoe.visible = Math.floor(this.time * 12) % 2 === 0;
    } else {
      this.canoe.visible = true;
    }

    this.distance += this.speed * dt;

    if (!this.mouthAnnounced && this.distance >= MOUTH_DISTANCE) {
      this.mouthAnnounced = true;
      this.showBanner("You've reached Tadoussac — the Saguenay opens into the Saint Lawrence");
    }

    this.river.update(this.time, dt, this.speed);
    this.terrain.update(dt, this.speed);
    this.whales.update(this.time, dt, this.speed);
    this.obstacles.update(
      this.time, dt, this.speed, this.canoeWorldX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry)
    );

    this.updateCanoeAndCamera(dt);
    this.updateHud();
  }

  updateCanoeAndCamera(dt) {
    const worldX = centerX(this.flowDistance) + this.lateralOffset;
    if (this.state !== 'playing') this.canoe.position.x = worldX;

    const aheadX = centerX(this.flowDistance + LOOKAHEAD);
    const lookX = THREE.MathUtils.lerp(worldX, aheadX, 0.4);

    const camTargetX = THREE.MathUtils.lerp(worldX, lookX, 0.3);
    const followRate = 1 - Math.pow(0.001, dt);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, camTargetX, followRate);
    this.camera.position.y = 3.4;
    this.camera.position.z = 6.5;
    this.camera.lookAt(lookX, 0.6, -10);

    if (this.hills) {
      this.hills.position.x = THREE.MathUtils.lerp(this.hills.position.x, centerX(this.flowDistance) * 0.5, followRate);
    }
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;
    this.ui.hudDistance.textContent = `DISTANCE: ${Math.round(this.distance)}m`;
    const speedPct = ((this.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    this.ui.hudSpeedFill.style.width = `${THREE.MathUtils.clamp(speedPct, 0, 100)}%`;
  }
}
