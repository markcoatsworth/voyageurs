# Voyageurs

A browser-based, fully-3D pixel-art canoe river-runner. Steer a birch-bark
canoe down an endless river, dodge rocks and deadfall logs, and collect fur
pelts — no install required, just a browser tab.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static `dist/`
that can be hosted anywhere (GitHub Pages, Netlify, S3, etc.) with no server
component.

## Controls

- `←`/`→` or `A`/`D` — steer
- `↑`/`↓` or `W`/`S` — paddle faster / slower
- Rocks capsize you (game over); deadfall logs just slow you down; fur pelts
  add to your score.

## How the pixel-art look works

This is real 3D geometry (Three.js), not sprites pretending to be 3D. The
chunky look comes from rendering at a tiny internal resolution
(`src/scene/pixelation.js`, ~180px tall) and letting the browser scale the
canvas up with `image-rendering: pixelated` (`src/style.css`). All materials
use flat shading and small hand-drawn `<canvas>`-generated textures sampled
with nearest-neighbor filtering (`src/utils/textures.js`), so both the 3D
meshes and their surfaces read as pixel art. Trees are camera-facing
billboard sprites for cheap, always-readable foliage.

## Project layout

```
src/
  main.js              scene/renderer setup, wires everything together
  game.js              game state, input handling, camera follow, HUD
  scene/
    pixelation.js       low-res render + upscale trick
    sky.js              sky color, fog, distant hills
    river.js            water plane, scrolling flow texture, wave ripple
    terrain.js           riverbank segments + tree billboards, recycled
                         like a conveyor belt for an endless feel
    canoe.js             low-poly canoe + paddler model
    obstacles.js         rocks / logs / fur pelts, pooled & recycled
  utils/
    textures.js          procedural pixel-art canvas textures
    input.js              keyboard state
```

## Where to take it next

- Swap the procedural canvas textures for hand-drawn pixel-art sprite
  sheets once you have art direction locked in.
- Add river rapids/whitewater sections that force faster reflexes.
- Add a Fort/trading-post checkpoint every N meters to turn in furs for
  a score multiplier or upgrades.
- Simple audio: paddle splash, rapids ambience, a loon call.
- Mobile touch controls (drag to steer) since it's already a browser game.
