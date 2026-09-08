// Broforce-style weapons system
// Z = small (pistol), X = medium (musket), C = large (blunderbuss)

export function createWeapons() {
  const bullets = [];
  const weapons = {
    pistol: false,    // Z - unlocked at Montreal
    musket: false,    // X - not yet unlocked
    blunderbuss: false, // C - not yet unlocked
  };

  // Bullet speed and properties
  const BULLET_SPEED = 35; // world units per second
  const BULLET_LIFETIME = 2; // seconds

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

    // Fire a weapon from the canoe's position
    fire(weaponName, canoeWorldX, canoeFlowDistance) {
      if (!weapons[weaponName]) {
        console.log(`[WEAPONS] ${weaponName} not unlocked yet`);
        return false;
      }

      const now = performance.now() / 1000;

      // Different weapons have different bullet patterns
      switch (weaponName) {
        case 'pistol':
          // Single bullet forward
          bullets.push({
            worldX: canoeWorldX,
            flowDistance: canoeFlowDistance,
            speed: BULLET_SPEED,
            createdAt: now,
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
      // Move bullets forward and remove old ones
      const now = performance.now() / 1000;

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.flowDistance += b.speed * dt;

        // Remove old bullets
        if (now - b.createdAt > BULLET_LIFETIME) {
          bullets.splice(i, 1);
        }
      }
    },

    // Draw all active bullets
    draw(ctx, worldDistance, cameraWorldX, worldToScreen) {
      for (const b of bullets) {
        const z = worldDistance - b.flowDistance;
        const screen = worldToScreen(b.worldX, z, cameraWorldX);

        // Draw bullet as a small yellow/orange flash
        ctx.save();
        ctx.fillStyle = '#ffdd44';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
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
      weapons.pistol = false;
      weapons.musket = false;
      weapons.blunderbuss = false;
    },
  };
}
