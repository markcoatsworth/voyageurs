# Voyageurs

A browser-based, fully-3D pixel-art canoe river-runner set at a real place:
the Saguenay Fjord running down to its mouth at the Saint Lawrence, near
Tadoussac — one of the earliest fur-trade posts in New France. Steer a
birch-bark canoe between sheer fjord cliffs, dodge rocks and deadfall logs,
and collect fur pelts, until the walls fall away and the river opens into
beluga-whale estuary — no install required, just a browser tab.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static `dist/`
that can be hosted anywhere (GitHub Pages, Netlify, S3, etc.) with no server
component.

The canoe launches the moment the page loads — no click required. A
title caption names the place and controls, then fades on its own after a
few seconds while the run is already underway.

## Controls

- `←`/`→` or `A`/`D` — steer
- `↑`/`↓` or `W`/`S` — paddle faster / slower
- Rocks and mid-channel islands capsize you (game over); deadfall logs and
  running aground on the fjord walls just cost you speed; fur pelts add to
  your score. The river bends and narrows/widens as you go, and obstacle
  density ramps up with distance, so the required navigation gets harder
  over time.
- Reach 900m and you've made it to Tadoussac — a banner announces it, the
  cliffs give way to the wide Saint Lawrence estuary, and belugas start
  surfacing. The run keeps going after that, now in open water.

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
    sky.js              sky color, fog, distant hills (parallax with the bend)
    world.js            shared conveyor-belt constants (segment length, pool
                         span) so river/banks/obstacles recycle in lockstep
    riverPath.js        the river's course: centerX(d) / widthAt(d), pure
                         functions of downstream distance — narrow fjord
                         near the start, trending toward wide estuary by
                         MOUTH_DISTANCE (the Tadoussac milestone)
    ribbon.js           builds a curved quad-strip grid (with an optional
                         height function) following an arbitrary edge, used
                         for the water surface and the cliff/bank profile
    river.js            pooled curved water segments, scrolling flow
                         texture, wave ripple
    terrain.js           riverbank segments recycled like a conveyor belt:
                         a sand sliver at the waterline, a rising rock cliff
                         face, then a forested plateau on top with tree
                         billboards — modeled on the Saguenay's fjord walls
    canoe.js             low-poly canoe + paddler model
    obstacles.js         rocks / logs / mid-channel islands / fur pelts,
                         pooled & recycled, spawned within the current
                         channel width; density increases with distance
    whales.js            ambient beluga whales — no collision — that only
                         surface once the water opens past fjord width,
                         signalling you've reached the Saint Lawrence
  utils/
    textures.js          procedural pixel-art canvas textures, incl. the
                         banded rock-strata cliff texture
    input.js              keyboard state
```

### How the river curve works

Every drifting thing (water/bank geometry, obstacles) has a "downstream
distance" `d = world.distance - z` that's invariant for as long as it's
flowing toward the camera, because both `world.distance` and `z` advance by
the same `speed * dt` each frame. That means each piece of geometry can look
up its shape from `centerX(d)`/`widthAt(d)` once, at the moment it's
(re)spawned, instead of every frame — see the comment at the top of
`riverPath.js` for the full reasoning.

## Where to take it next

- Swap the procedural canvas textures for hand-drawn pixel-art sprite
  sheets once you have art direction locked in.
- Add river rapids/whitewater sections that force faster reflexes.
- Add a Fort/trading-post checkpoint every N meters to turn in furs for
  a score multiplier or upgrades.
- Simple audio: paddle splash, rapids ambience, a loon call.
- Mobile touch controls (drag to steer) since it's already a browser game.
