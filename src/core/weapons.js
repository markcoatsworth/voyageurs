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

  // Rate limit, in game-time seconds between shots — per weapon, not one
  // shared clock: reported as "the middle gun [musket] looks bigger... but
  // it shoots at the same speed and I can't [see] much difference in
  // damage — it should shoot slower and hit harder." A single shared
  // cooldown also meant firing one gun reset the other's timer too, which
  // doesn't make sense for two separate weapons carried at once. Held keys
  // auto-repeat at the browser's rate (~30/s) and the touch button is
  // one-per-tap, so without this the pistol's real fire rate swung wildly
  // by input method and the Diable fight couldn't be tuned. `clock` is
  // accumulated dt, not wall time, so it behaves identically in the
  // headless smoke test. Per-hit damage lives with each fight (diable.js's
  // PISTOL_DAMAGE/MUSKET_DAMAGE and britishWarship.js's/blockade.js's own
  // *_DAMAGE_TO_HULL pairs), not here — this only governs how often each
  // gun can fire.
  const FIRE_COOLDOWN = { pistol: 0.16, musket: 0.45, blunderbuss: 0.16 };
  let clock = 0;
  let lastFireAt = { pistol: -999, musket: -999, blunderbuss: -999 };

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
      if (clock - lastFireAt[weaponName] < FIRE_COOLDOWN[weaponName]) return false;
      lastFireAt[weaponName] = clock;

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
          // The medium gun — a single heavier ball, fired slower than the
          // pistol (FIRE_COOLDOWN's own per-weapon split above) and hitting
          // harder wherever it lands (each fight's own *_DAMAGE pair) —
          // same bullet travel speed, since that's the ball flying once
          // it's left the barrel, not the weapon's own handling. Reads as
          // its own gun in draw() below via `type`.
          bullets.push({
            worldX: canoeWorldX,
            flowDistance: canoeFlowDistance,
            altitude,
            speed: BULLET_SPEED,
            createdAt: clock,
            type: 'musket',
          });
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

        // Pistol: a small yellow spark, nothing trailing it — reads as
        // light and quick. Musket: a dark lead ball behind a hot corona,
        // dragging a fading smoke trail — a bigger radius alone (the old
        // version) still read as "the same spark, slightly bigger" at a
        // glance, so the musket now gets its own silhouette, not just its
        // own size. Bullets only ever move in +flowDistance (see fire()'s
        // own comment), i.e. straight up-screen, so "behind" the ball is
        // just a fixed downward offset — no angle math needed.
        ctx.save();
        if (b.type === 'musket') {
          for (let i = 3; i >= 1; i--) {
            ctx.globalAlpha = 0.22 * i;
            ctx.fillStyle = '#5a5148';
            ctx.beginPath();
            ctx.arc(screen.x, y + i * 3.2, 3.4 - i * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.shadowColor = '#ff4400';
          ctx.shadowBlur = 10;
          ctx.fillStyle = 'rgba(255,110,30,0.55)';
          ctx.beginPath();
          ctx.arc(screen.x, y, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#2a2622';
          ctx.beginPath();
          ctx.arc(screen.x, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#6b6258';
          ctx.beginPath();
          ctx.arc(screen.x - 1.3, y - 1.3, 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#ffdd44';
          ctx.shadowColor = '#ff8800';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(screen.x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
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
      lastFireAt = { pistol: -999, musket: -999, blunderbuss: -999 };
      weapons.pistol = false;
      weapons.musket = false;
      weapons.blunderbuss = false;
    },
  };
}
