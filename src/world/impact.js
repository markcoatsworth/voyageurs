// Bullet impacts — the flash where a shot actually lands on a boss.
//
// Both shootable fights (bossfights/diable.js, bossfights/britishWarship.js)
// draw these, so the feedback is the same visual language in each: land a
// hit and you see it hit, in the place it hit, at a size that tells you what
// you hit it with. Before this the Warship had a single fixed spark and the
// Diable fight had nothing at all but a brief white blanch over his whole
// figure, which read as "something happened somewhere" rather than "that
// shot connected, there."
//
// The size tiers are the weapons, not a damage calculation: core/weapons.js
// has said "Z = small (pistol), X = medium (musket), C = large
// (blunderbuss)" since it was written, and that's the vocabulary the player
// already has for their own guns. A pistol crack pops; a musket thumps.
// Scaling on damage-dealt instead would have put a Warship pistol hit (8 of
// 3000 hull) and a Diable musket hit (9 of 2160) in the same tier despite
// being different guns, which is exactly backwards from how it reads in the
// hand.
//
// Drawn in screen pixels, so each fight converts from whatever space it
// tracks the hit in (the Diable fight is already in screen space; the
// Warship's hits are world x + flowDistance, run through worldToScreen) and
// the look stays identical either way.

import { hash } from '../shared/hash.js';

// Warm muzzle palette, deliberately the same one the Warship's own muzzle
// flashes and the old single spark used — a hit landing should look like it
// belongs to the same gunfight as the shot that caused it.
const CORE_HOT = '#fff9e0';
const CORE_WARM = '#fff4c2';
// The fireball under the core. This layer is what makes the effect read as
// a small explosion rather than a spark, which is what it was asked for.
const FIRE_OUTER = '255, 122, 30';
const FIRE_INNER = '255, 186, 64';
const SHARD = '255, 200, 110';
const GLOW = '#ffb347';
const SMOKE = '60, 52, 44';

// One entry per weapon. `life` is how long the whole effect lasts in
// seconds; everything else is a screen-pixel radius or length at the game's
// 320x220 internal resolution.
//
// Sized up substantially from the first pass, which was built as a spark:
// at a 2.6px core the pistol hit was too small to read as an explosion at
// all, and the gap to the musket's 4.2px wasn't a gap you could see in
// motion. Now the small tier is a genuine (small) blast and the medium is
// close to double it on every axis — radius, shard count, shard length,
// smoke and lifetime all step together, so "bigger gun" is legible from
// the size, the spread and how long it hangs around, not from one of those
// alone.
//
// Both tiers get the fireball, the ring and smoke. An earlier cut withheld
// the ring and smoke from the small tier to differentiate it, which made
// the pistol hit a different *kind* of effect instead of a smaller one —
// the request is a small explosion and a larger explosion, so the two
// differ by scale only.
const TIERS = {
  small: { life: 0.30, core: 4, fire: 7.5, shards: 6, shardLen: 9, ring: 11, smoke: 2, glow: 9 },
  medium: { life: 0.46, core: 7, fire: 13.5, shards: 11, shardLen: 17, ring: 23, smoke: 4, glow: 15 },
  // Nothing fires this yet — weapons.js's blunderbuss is still a stub — but
  // the tier exists so the fights' generic `b.type` handling has somewhere
  // to land the day it does, rather than silently falling back to `small`.
  large: { life: 0.60, core: 10, fire: 19, shards: 14, shardLen: 25, ring: 33, smoke: 6, glow: 21 },
};

const BY_WEAPON = { pistol: 'small', musket: 'medium', blunderbuss: 'large' };

// Unknown types fall back to `small` rather than throwing: a bullet is
// feedback, and a missing tier should never be the thing that breaks a
// boss fight mid-shot.
export function impactTierFor(bulletType) {
  return BY_WEAPON[bulletType] || 'small';
}

export function impactLife(tier) {
  return (TIERS[tier] || TIERS.small).life;
}

// `age` is seconds since the hit, `seed` any number that's stable for this
// particular impact — the shard directions come off it, so passing something
// that changes per frame would make the shards spin instead of fly.
export function drawImpact(ctx, x, y, age, tier, seed = 0) {
  const t = TIERS[tier] || TIERS.small;
  if (age < 0 || age >= t.life) return;
  // 1 at the instant of the hit, 0 as it dies.
  const k = 1 - age / t.life;
  // Separately: 0 -> 1 across the life, for things that grow outward.
  const grow = 1 - k;

  ctx.save();

  // The expanding shock ring. Outermost and faintest, and a big part of
  // what makes a musket hit read as bigger than a pistol one before you've
  // even registered the core, since its radius is where the tiers differ
  // most.
  if (t.ring > 0) {
    ctx.globalAlpha = k * k * 0.55;
    ctx.strokeStyle = CORE_WARM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 2 + grow * t.ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The fireball: a hot blob that punches out to full size almost at once
  // and then burns down through orange to nothing. Drawn under the shards
  // and the core so they read as sitting inside it. Two stacked circles
  // rather than a gradient — gradients are the one thing that doesn't
  // survive this game's 320x220-and-upscale pipeline looking deliberate.
  const fireK = Math.min(1, k * 1.35);
  const fireR = t.fire * (0.45 + grow * 0.55);
  ctx.globalAlpha = fireK * 0.75;
  ctx.fillStyle = `rgb(${FIRE_OUTER})`;
  ctx.beginPath();
  ctx.arc(x, y, fireR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fireK * 0.9;
  ctx.fillStyle = `rgb(${FIRE_INNER})`;
  ctx.beginPath();
  ctx.arc(x, y, fireR * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Shards thrown out from the point of impact. Evenly spaced around the
  // circle and then offset by the seed, so every hit looks different without
  // any of them clumping to one side the way pure random angles do at these
  // small counts.
  ctx.globalAlpha = k;
  ctx.strokeStyle = `rgba(${SHARD}, ${(k * 0.9).toFixed(3)})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < t.shards; i++) {
    const a = (i / t.shards) * Math.PI * 2 + seed;
    // 0.6..1 of the nominal length, stable per shard.
    const lenScale = 0.6 + hash(i + seed * 7.3) * 0.4;
    const inner = 1 + grow * t.shardLen * 0.35;
    const outer = inner + t.shardLen * lenScale * (0.4 + grow * 0.6);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x + ca * inner, y + sa * inner);
    ctx.lineTo(x + ca * outer, y + sa * outer);
    ctx.stroke();
  }

  // The core: a hard bright blob that snaps to full size immediately and
  // then collapses. Snap-on rather than grow-in because a hit is an event —
  // anything that eases in reads as a light turning on.
  const coreR = t.core * (0.55 + k * 0.45);
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.shadowColor = GLOW;
  ctx.shadowBlur = t.glow;
  ctx.fillStyle = k > 0.55 ? CORE_HOT : CORE_WARM;
  ctx.beginPath();
  ctx.arc(x, y, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Powder smoke, drifting up-screen and spreading as it goes. Outlives
  // the bright part of the blast, so there's a beat of "that just happened"
  // after the flash is gone.
  for (let i = 0; i < t.smoke; i++) {
    const a = hash(i * 3.1 + seed) * Math.PI * 2;
    const drift = grow * (3 + i * 2);
    ctx.globalAlpha = k * 0.4;
    ctx.fillStyle = `rgba(${SMOKE}, ${(k * 0.45).toFixed(3)})`;
    const px = x + Math.cos(a) * drift;
    const py = y + Math.sin(a) * drift * 0.5 - grow * 4;
    const r = 1 + grow * 2 + i * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
