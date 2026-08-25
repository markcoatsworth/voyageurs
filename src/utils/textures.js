import * as THREE from 'three';

// All textures are drawn on small canvases and sampled with NearestFilter so
// they stay crunchy/pixelated no matter how the 3D geometry is lit or scaled.

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finalize(canvas, { repeatX = 1, repeatY = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Simple deterministic pseudo-random so re-generating a texture looks stable.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWaterTexture() {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  const deep = '#1c4f6b';
  const mid = '#2c7096';
  const light = '#4a97bd';
  const foam = '#bfe6f2';
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin((y / size) * Math.PI * 2 + x * 0.6);
      if (wave > 0.6) ctx.fillStyle = light;
      else if (wave > 0.15) ctx.fillStyle = mid;
      else continue;
      ctx.fillRect(x, y, 1, 1);
      if (rand() > 0.93) {
        ctx.fillStyle = foam;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return finalize(canvas, { repeatX: 6, repeatY: 40 });
}

export function createRiverbankTexture() {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  const base = '#3c6b35';
  const dark = '#2e5228';
  const light = '#54874a';
  const dirt = '#6b4a30';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(42);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rand();
      if (r > 0.88) ctx.fillStyle = light;
      else if (r > 0.78) ctx.fillStyle = dark;
      else if (r > 0.75) ctx.fillStyle = dirt;
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return finalize(canvas, { repeatX: 4, repeatY: 24 });
}

export function createSandTexture() {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  const base = '#c9a86a';
  const dark = '#b08f52';
  const light = '#e0c48a';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(99);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rand();
      if (r > 0.85) ctx.fillStyle = light;
      else if (r > 0.7) ctx.fillStyle = dark;
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return finalize(canvas, { repeatX: 3, repeatY: 3 });
}

export function createBarkTexture() {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  const base = '#8a5a34';
  const dark = '#5f3b20';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    ctx.fillStyle = (y % 3 === 0) ? dark : base;
    ctx.fillRect(0, y, size, 1);
  }
  return finalize(canvas, { repeatX: 2, repeatY: 1 });
}

export function createRockTexture() {
  const size = 16;
  const { canvas, ctx } = makeCanvas(size);
  const base = '#7d7d78';
  const dark = '#5c5c58';
  const light = '#a3a39c';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(13);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rand();
      if (r > 0.85) ctx.fillStyle = light;
      else if (r > 0.7) ctx.fillStyle = dark;
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return finalize(canvas);
}

// A billboard sprite of a pixel-art pine tree, drawn with alpha so it can be
// planted on flat quads and always face the camera.
export function createTreeSpriteTexture(variant = 0) {
  const w = 24;
  const h = 40;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const trunk = '#4a3120';
  const foliageDark = '#20431f';
  const foliage = '#2e5c2a';
  const foliageLight = '#3f7a37';

  ctx.fillStyle = trunk;
  ctx.fillRect(w / 2 - 2, h - 8, 4, 8);

  const tiers = 3 + (variant % 2);
  const topY = 2;
  const bottomY = h - 8;
  const tierHeight = (bottomY - topY) / tiers;
  for (let i = 0; i < tiers; i++) {
    const y0 = topY + i * tierHeight;
    const y1 = y0 + tierHeight + 3;
    const halfWidth = 3 + i * ((w / 2 - 3) / (tiers - 0.4));
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const rowHalf = halfWidth * (1 - t * 0.15);
      const rand = mulberry32((i * 97 + Math.floor(y) * 13 + variant * 5) | 0);
      for (let x = Math.round(w / 2 - rowHalf); x <= Math.round(w / 2 + rowHalf); x++) {
        const r = rand();
        ctx.fillStyle = r > 0.85 ? foliageLight : (r < 0.15 ? foliageDark : foliage);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyGradientTexture() {
  const w = 4;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#7fb8d8');
  grad.addColorStop(0.5, '#bfe0e6');
  grad.addColorStop(1, '#f4ead2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
