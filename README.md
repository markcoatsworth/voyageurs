# Voyageurs

A browser-based, top-down pixel-art canoe river-runner set at a real place:
the Saguenay Fjord running down to its mouth at the Saint Lawrence, near
Tadoussac — one of the earliest fur-trade posts in New France. Steer a
birch-bark canoe between sheer fjord cliffs, dodge rocks and deadfall logs,
and collect fur pelts, until the walls fall away and the river opens into
beluga-whale estuary — no install required, just a browser tab.

## Music

Five traditional Quebecois fiddle/reel recordings play as a shuffled
playlist (`src/twod/music.js`) — reshuffled each time it cycles through, so
it's not the same running order every session:

- "Grande Gigue Simple" and "Reel du Pendu," performed by Isidore Soucy
  (Starr Records, 1931), sourced from Internet Archive's Great 78 Project
  ([1](https://archive.org/details/78_grande-gigue-simple_isidore-soucy_gbia0016274b),
  [2](https://archive.org/details/78_reel-du-pendu_isidore-soucy_gbia0016274a)).
- "Reel des Laurentides," "Reel des Montagnes," and "Valse des Laboureurs,"
  performed by Tommy Duchesne, sourced from Library and Archives Canada's
  [Virtual Gramophone](https://www.bac-lac.gc.ca/eng/discover/films-videos-sound-recordings/virtual-gramophone/Pages/introduction.aspx)
  collection of historical 78rpm recordings.

**Rights note:** none of these five recordings are confirmed public domain.
Under the Music Modernization Act, US sound recordings first published
1923–1946 enter the public domain 100 years after publication — for the
1931 Soucy recordings, that's 2032, not now, and they're also hosted under
Internet Archive's Great 78 Project, the subject of ongoing, unresolved
litigation from major record labels over exactly this kind of use. The
Duchesne recordings' copyright status hasn't been separately researched —
they're the same era of Quebec 78rpm recording as the Soucy tracks, so
there's no reason to assume they're any more settled. All five are included
as a deliberate, informed choice for casual/personal use, not because the
rights are clean — swap the `public/audio/*.mp3` files for something with
airtight licensing before this ships anywhere beyond that.

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
- Run into a dock and you'll go ashore at that village instead of taking
  damage — see "Villages" below.

## History

This started as a full 3D (Three.js) build with a third-person camera
behind the canoe. A 2D top-down reimagining — closer to a Stardew
Valley/Final Fantasy overworld, same river-course math, different camera
and art style entirely — replaced it as the main line; the original 3D
version is still there in git history (see the `feature/top-down` merge
and what it replaced) if it's ever worth revisiting.

## How the pixel art works

Everything is drawn on tiny `<canvas>` elements at true pixel size — hand
positioned shapes for sprites (`src/twod/sprites.js`: canoe, rocks, logs,
islands, pelts, whales, trees), small repeating noise tiles for ground/water
(`src/twod/tiles.js`). The main game canvas itself renders at a small
internal resolution (`src/twod/config.js`, 320×220) and is scaled up by an
integer factor with `image-rendering: pixelated` (`src/main.js` +
`src/style.css`), so it stays crisp at any window size instead of blurring.

The river/banks are *not* a tilemap or stored geometry — every frame,
`src/twod/terrain.js` walks down the screen in 4px steps, asks
`centerX(d)`/`widthAt(d)` (see below) where the river's edges are at that
row, and fills the resulting curved region with a clipped pattern. Nothing
about the ground is stored between frames; it's recomputed fresh every time,
which is a big part of why this version has no mesh-pooling/recycling code
at all — Canvas2D redraws everything anyway, so "regenerate it from distance
every frame" is simpler than "build it once and manage its lifetime."

Trees and whales use the same idea one step further: instead of being
spawned/tracked objects, `src/twod/hash.js` derives a deterministic
pseudo-random value from a "distance bucket," so asking "is there a tree
near distance 340?" always gives the same answer without storing anything.
Obstacles (rocks/logs/islands/pelts) are the one thing that *is* stateful
(`src/twod/obstacles.js`, a small pool of plain objects, ported from the 3D
version's mesh pool) — they need real identity so a collected pelt stays
collected and a hit rock doesn't retrigger every frame.

## Project layout

```
src/
  main.js              canvas setup, pixel-scale sizing, game loop
  game.js              game state, input handling, HUD, draws each frame
  river/
    path.js            the river's course: centerX(d) / widthAt(d), pure
                        functions of downstream distance — narrow fjord
                        near the start, trending toward wide estuary by
                        MOUTH_DISTANCE (the Tadoussac milestone). Shared
                        with the 3D version's math; tuned here for a much
                        smaller visible window (see note below)
    route.js           the real Saguenay waypoints (La Baie to Tadoussac to
                        Les Escoumins) and the cumulative-distance model
                        that maps each one to an exact flowDistance — the
                        single source of truth shared by both the minimap
                        and the in-game villages, so "at Tadoussac" means
                        the same point in both
  twod/
    config.js           screen resolution, world-to-pixel scale, the fixed
                         screen position the canoe always occupies
    hash.js              deterministic "distance bucket" pseudo-randomness
                         for stateless scenery placement
    tiles.js              small repeating noise-pattern tiles: water,
                         grass, rocky riverbank, sand
    sprites.js            hand-drawn pixel-art sprites for every discrete
                         object (canoe, rocks, logs, islands, pelts,
                         whales, trees)
    terrain.js            draws the river/banks/trees fresh every frame by
                         sampling centerX/widthAt down the screen and
                         filling clipped, curved regions with tile patterns
    obstacles.js          the one stateful system: a small pool of rocks/
                         logs/islands/pelts with collision + collection,
                         ported from the 3D version's mesh pool
    whales.js             stateless, hash-placed beluga sightings once the
                         channel reads as open estuary
    canoe.js              the two paddle-stroke sprite frames
    villages.js            a village (dock + 3 log buildings) at each real
                         waypoint from river/route.js; draws them into the
                         river view and detects when the canoe touches a
                         dock — see "Villages" below
    villageScene.js         the small on-foot scene entered at a dock:
                         fixed local area, free 4-directional walking,
                         building collision, walk back onto the dock to
                         re-board
  utils/
    input.js              keyboard state
```

### How the river curve works

Every drifting or placed thing has a "downstream distance" `d` that, for
gameplay-stateful objects, is invariant for as long as it's drifting toward
the canoe (`d = world.distance - z`, and both terms advance at the same
`speed * dt` each frame) — see the comment at the top of `river/path.js` for
the full reasoning. For the stateless terrain/tree/whale drawing, `d` is
just recomputed directly from the current screen row and the world clock,
every frame, with nothing cached at all.

**Note on tuning:** the 3D version's camera sees a huge stretch of river at
once via perspective (things far away are tiny but still visible near the
horizon), so a curve with a very long period reads as a lazy bend. This
top-down camera is orthographic and only shows ~15-20 world units at a
time, so `centerX`/`widthAt` in this branch use a much shorter period —
otherwise the river looks perfectly straight in any single view. If you
port more math from the 3D branch, expect to retune frequencies, not just
copy constants.

### Villages

Every real waypoint along the route (except the put-in) is a small village
on the bank — a dock plus 3 log buildings, placed at the exact flowDistance
`river/route.js` computes for that real place. Run the canoe into a dock
(instead of taking damage like every other collision) and `game.js` swaps
into `mode = 'village'`: the river freezes, `villageScene.js` takes over
with a small fixed on-foot area, and you walk around with free 4-directional
movement and simple building collision. Walk back onto the dock to re-board
— `mode` returns to `'river'` and the world picks back up exactly where it
left off (the canoe is nudged just past the dock's own trigger zone first,
so stepping off the boat doesn't instantly dock it again).

This first pass is deliberately just the mechanic: arrive, walk around,
leave. The buildings don't do anything yet — turning them into actual shops
(sell furs, repair the hull) is the planned next step, once this loop
itself felt solid.

## Where to take it next

- Swap the procedural sprites for hand-drawn/higher-color-count pixel art
  once you have art direction locked in — the current sprites are
  intentionally simple placeholders.
- Add river rapids/whitewater sections that force faster reflexes.
- Add a Fort/trading-post checkpoint every N meters to turn in furs for
  a score multiplier or upgrades.
- Simple audio: paddle splash, rapids ambience, a loon call.
- Touch controls (drag to steer) — this version is even lighter-weight
  than the 3D one (no WebGL required at all), so it's a strong candidate
  for a mobile-friendly pass.
