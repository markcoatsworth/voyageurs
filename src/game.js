import * as THREE from 'three';
import { RIVER_HALF_WIDTH } from './scene/river.js';

const MIN_SPEED = 7;
const MAX_SPEED = 24;
const BASE_SPEED = 12;
const ACCEL = 10;
const DECEL_DRIFT = 2.5;
const STEER_ACCEL = 26;
const STEER_MAX = 9;
const STEER_DAMPING = 6;
const PLAY_HALF_WIDTH = RIVER_HALF_WIDTH - 0.5;
const LOG_PENALTY_SPEED = 6;
const INVULN_TIME = 1.2;

export class Game {
  constructor({ canoe, camera, input, river, terrain, obstacles, ui }) {
    this.canoe = canoe;
    this.camera = camera;
    this.input = input;
    this.river = river;
    this.terrain = terrain;
    this.obstacles = obstacles;
    this.ui = ui;

    this.state = 'title';
    this.time = 0;
    this.reset();

    ui.startBtn.addEventListener('click', () => this.start());
    ui.restartBtn.addEventListener('click', () => this.start());
  }

  reset() {
    this.canoeX = 0;
    this.canoeVX = 0;
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.furs = 0;
    this.invulnTimer = 0;
    this.canoe.position.set(0, 0, 0);
    this.canoe.rotation.set(0, 0, 0);
  }

  start() {
    this.reset();
    this.obstacles.reset();
    this.state = 'playing';
    this.ui.titleScreen.classList.add('hidden');
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
    if (entry.type === 'rock') {
      this.gameOver();
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
      // Idle ambience: keep water/scenery alive behind the title screen.
      this.river.update(this.time, dt, BASE_SPEED * 0.4);
      this.terrain.update(dt, BASE_SPEED * 0.4);
      this.updateCamera(dt);
      return;
    }

    const keys = this.input.state;

    if (keys.up) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (keys.down) this.speed = Math.max(MIN_SPEED, this.speed - ACCEL * dt);
    else this.speed = Math.max(MIN_SPEED, this.speed - DECEL_DRIFT * dt * 0.3);

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    this.canoeVX += steerInput * STEER_ACCEL * dt;
    this.canoeVX -= this.canoeVX * STEER_DAMPING * dt;
    this.canoeVX = THREE.MathUtils.clamp(this.canoeVX, -STEER_MAX, STEER_MAX);

    this.canoeX += this.canoeVX * dt;
    const limit = PLAY_HALF_WIDTH;
    if (this.canoeX > limit) { this.canoeX = limit; this.canoeVX = 0; }
    if (this.canoeX < -limit) { this.canoeX = -limit; this.canoeVX = 0; }

    this.canoe.position.x = this.canoeX;
    this.canoe.rotation.z = THREE.MathUtils.lerp(this.canoe.rotation.z, -this.canoeVX * 0.05, 0.15);
    this.canoe.rotation.y = THREE.MathUtils.lerp(this.canoe.rotation.y, -this.canoeVX * 0.04, 0.15);
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

    this.river.update(this.time, dt, this.speed);
    this.terrain.update(dt, this.speed);
    this.obstacles.update(
      this.time, dt, this.speed, this.canoeX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry)
    );

    this.updateCamera(dt);
    this.updateHud();
  }

  updateCamera(dt) {
    const targetX = THREE.MathUtils.lerp(this.camera.position.x, this.canoeX * 0.7, 1 - Math.pow(0.001, dt));
    this.camera.position.x = targetX;
    this.camera.position.y = 3.4;
    this.camera.position.z = 6.5;
    this.camera.lookAt(this.canoeX * 0.5, 0.6, -10);
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;
    this.ui.hudDistance.textContent = `DISTANCE: ${Math.round(this.distance)}m`;
    const speedPct = ((this.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    this.ui.hudSpeedFill.style.width = `${THREE.MathUtils.clamp(speedPct, 0, 100)}%`;
  }
}
