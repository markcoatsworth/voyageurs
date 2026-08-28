// Small repeating pattern tiles for the ground/water fills, wrapped in a
// CanvasPattern so a curved region (built as a clip path) can be filled with
// a textured surface instead of a flat color. These are hand-placed motifs
// rather than random per-pixel noise — a handful of deliberate blade tufts,
// sparkles, or block seams reads as intentional texture; uniform speckle
// reads as static.

function makeTile(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  return canvas;
}

export function createGrassTile() {
  return makeTile(16, (ctx, s) => {
    ctx.fillStyle = '#4f8f3f';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3f7a34';
    ctx.fillRect(2, 3, 3, 2);
    ctx.fillRect(10, 9, 3, 2);
    ctx.fillRect(5, 12, 2, 2);
    ctx.fillStyle = '#6bb054';
    ctx.fillRect(4, 2, 1, 2);
    ctx.fillRect(7, 3, 1, 2);
    ctx.fillRect(12, 5, 1, 2);
    ctx.fillRect(9, 11, 1, 2);
    ctx.fillRect(2, 9, 1, 2);
    ctx.fillRect(13, 13, 1, 2);
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(8, 8, 1, 1);
  });
}

export function createCliffTile() {
  return makeTile(16, (ctx, s) => {
    ctx.fillStyle = '#6b6a63';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#54534c';
    ctx.fillRect(0, 7, s, 1);
    ctx.fillRect(0, 15, s, 1);
    ctx.fillRect(7, 0, 1, 7);
    ctx.fillRect(4, 8, 1, 8);
    ctx.fillRect(12, 8, 1, 8);
    ctx.fillStyle = '#87867a';
    ctx.fillRect(1, 1, 5, 1);
    ctx.fillRect(9, 1, 6, 1);
    ctx.fillRect(1, 9, 2, 1);
    ctx.fillRect(5, 9, 6, 1);
    ctx.fillRect(13, 9, 2, 1);
    ctx.fillStyle = '#38372f';
    ctx.fillRect(3, 4, 1, 1);
    ctx.fillRect(11, 3, 1, 1);
    ctx.fillRect(9, 12, 1, 1);
  });
}

export function createSandTile() {
  return makeTile(16, (ctx, s) => {
    ctx.fillStyle = '#d8bb7a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(2, 3, 2, 2);
    ctx.fillRect(10, 10, 2, 2);
    ctx.fillRect(6, 12, 2, 1);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(6, 7, 2, 2);
    ctx.fillRect(13, 3, 1, 1);
    ctx.fillRect(3, 11, 1, 1);
  });
}

// Vertical current streaks rather than scattered sparkle — the pattern
// itself is static, but terrain.js scrolls it along the flow direction
// every frame (rate tied to the canoe's actual speed), so the streaks
// stream past continuously the way a real current does. Directional +
// moving reads as "river"; random dots just read as noise.
export function createWaterTile() {
  return makeTile(16, (ctx, s) => {
    ctx.fillStyle = '#2a6e93';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#255f80';
    ctx.fillRect(0, 0, 5, s);
    ctx.fillRect(11, 0, 5, s);

    const streaks = [
      [2, 1, 4], [2, 9, 4],
      [6, 5, 3], [6, 12, 3],
      [9, 0, 3], [9, 8, 5],
      [13, 3, 5], [13, 11, 3],
    ];
    ctx.fillStyle = '#5fa8cc';
    for (const [x, y, len] of streaks) ctx.fillRect(x, y, 1, len);
    ctx.fillStyle = '#8fcbe6';
    for (const [x, y] of streaks) ctx.fillRect(x, y, 1, 1);
  });
}
