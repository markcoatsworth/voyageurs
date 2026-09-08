// Broforce-style weapons system
// Z = small (pistol), X = medium (musket), C = large (blunderbuss)

import { PIXELS_PER_UNIT } from '../shared/config.js';

export function createWeapons() {
  const bullets = [];
  const weapons = {
    pistol: false,    // Z - acquired from the Montréal gunsmith
    musket: false,    // X - not yet unlocked
    blunderbuss: false, // C - not yet unlocked
  };

  // Bullet speed and properties
  const BULLET_SPEED = 35; // world units per second
  const BULLET_LIFETIME = 2; // seconds (of game time — see `clock` below)

  // Rate limit, in game-time seconds between shots. Held keys auto-repeat at
  // the browser's rate (~30/s) and the touch button is one-per-tap, so
  // without this the pistol's real fire rate swung wildly by input method
  // and the Diable fight couldn't be tuned. `clock` is accumulated dt, not
  // wall time, so it behaves identically in the headless smoke test.
  const FIRE_COOLDOWN = 0.16;
  let clock = 0;
  let lastFireAt = -999;

  return {
    unlock(weaponName) {
      if (weapons[weaponName] !== undefined) {
        weapons[weaponName] = true;
        console.log(`[WEAPONS] Unlocked ${weaponName}!`);
      }
    },

    has(weaponName) {
      return weapons[weaponName] === true;
    },

    // Fire a weapon from the canoe's position. `altitude` (world units above
    // the water) is only ever non-zero in the Chasse-galerie flight — the
    // bullet keeps it and flies level, so shots leave the flying canoe
    // itself rather than its shadow on the water below (see draw()).
    fire(weaponName, canoeWorldX, canoeFlowDistance, altitude = 0) {
      if (!weapons[weaponName]) {
        console.log(`[WEAPONS] ${weaponName} not unlocked yet`);
        return false;
      }
      if (clock - lastFireAt < FIRE_COOLDOWN) return false;
      lastFireAt = clock;

      // Different weapons have different bullet patterns
      switch (weaponName) {
        case 'pistol':
          // Single bullet forward
          bullets.push({
            worldX: canoeWorldX,
            flowDistance: canoeFlowDistance,
            altitude,
            speed: BULLET_SPEED,
            createdAt: clock,
            type: 'pistol',
          });
          break;

        case 'musket':
          // Future: faster, single bullet
          break;

        case 'blunderbuss':
          // Future: spread shot
          break;
      }

      return true;
    },

    update(dt) {
      clock += dt;
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.flowDistance += b.speed * dt;
        if (clock - b.createdAt > BULLET_LIFETIME) {
          bullets.splice(i, 1);
        }
      }
    },

    // Draw all active bullets
    draw(ctx, worldDistance, cameraWorldX, worldToScreen) {
      for (const b of bullets) {
        const z = worldDistance - b.flowDistance;
        const screen = worldToScreen(b.worldX, z, cameraWorldX);
        // Lift the bullet by the altitude it was fired at (Chasse-galerie
        // only; 0 on the water) so it tracks the flying canoe, not its
        // shadow — same screen-space offset the canoe sprite gets in game.js.
        const y = screen.y - (b.altitude || 0) * PIXELS_PER_UNIT;

        // Draw bullet as a small yellow/orange flash
        ctx.save();
        ctx.fillStyle = '#ffdd44';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(screen.x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    // Get all bullets for collision detection
    getBullets() {
      return bullets;
    },

    // Remove a specific bullet (after it hits something)
    removeBullet(bullet) {
      const idx = bullets.indexOf(bullet);
      if (idx !== -1) bullets.splice(idx, 1);
    },

    reset() {
      bullets.length = 0;
      lastFireAt = -999;
      weapons.pistol = false;
      weapons.musket = false;
      weapons.blunderbuss = false;
    },
  };
}
