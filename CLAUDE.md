# CLAUDE.md

## What this is

**Voyageurs** — a browser, top-down pixel-art canoe river-runner set on a real
route: the Saguenay Fjord to Tadoussac, then up the Saint Lawrence past Québec
City and Montréal, then the Chasse-galerie flight up the Ottawa gorge to
Gatineau. Vanilla JS + Vite, no framework. Canvas2D for sprites/terrain, a
WebGL canvas underneath for shader water. Deployed as a static `dist/` behind
nginx on Cloud Run.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — headless smoke test (`test/smoke.mjs`); **run this before claiming
  any change works**. "build passes" is not verification — `vite build` never
  executes game code.
- `npm run build` — `prebuild` runs the smoke test, `vite build`, then
  `postbuild.mjs` (strips `dist/audio/src/`, stamps the build badge in
  `dist/index.html` from `__BUILD_STAMP__`).
- Pre-commit hook (`.githooks/pre-commit`, enable with
  `git config core.hooksPath .githooks`) runs the smoke test. `--no-verify` to bypass.

## Deploy

See auto-memory. Cloud Run service `voyageurs` / project `voyageurs-506800` /
us-central1. Public URL **voyageurs-game.ca** (share that, not the run.app URL).
Confirm the project/service before any `gcloud run deploy`. Never the
`northbound` project.

## Layout

Source moved from the README's `src/twod/` to:

```
src/
  main.js              wiring, pixel-scale sizing, game loop, ?start= cheat + diable checkpoint
  shared/
    config.js          320x220 internal res, PIXELS_PER_UNIT=16, worldToScreen, camera anchor
    hash.js            deterministic "distance bucket" pseudo-randomness for stateless scenery
  core/
    game.js            (~1300 lines) game state, physics, HUD, per-frame draw, mode/segment machine
    input.js           keyboard state
    touchControls.js   on-screen steer pad; isTouchPrimary() gates the mobile speed scaling in game.js
    weapons.js         Z pistol / X musket / C blunderbuss (only pistol implemented). Fire cooldown on accumulated dt.
  world/
    terrain.js         redraws river/banks/trees every frame by sampling centerX/widthAt down the screen
    waterGL.js         GLSL water under the 2D layer; river shape is DUPLICATED in GLSL — keep in sync with path.js
    obstacles.js       the one stateful system: pooled rocks/logs/islands/pelts with collision/collection
    whales.js          stateless hash-placed belugas once the channel reads as open estuary
    sprites.js         (~1000 lines) hand-drawn pixel sprites
    villages.js        dock + buildings per waypoint; getDockHit detects the canoe touching a dock
    villageScene.js    on-foot scene at a dock; walk back onto the dock to re-board
    minimap.js         moving SVG locator map over the real three-way geography
    river/
      path.js          centerX(d)/widthAt(d)/braidAt/rapidsStrength — pure fns of downstream distance.
                       MOUTH_DISTANCE=900 (Tadoussac). SEGMENT_SHAPE_OFFSET per segment. widthAt has
                       special branches: the Ottawa gorge (post-Montreal) and rideauWidthAt (the
                       Rideau leg — checked first, its offset is past everything else).
      route.js         waypoints for 4 segments (fjord / lawrenceEast / lawrenceWest / rideau);
                       cumulative-distance model → each village's flowDistance. VILLAGES export.
                       rideau (Gatineau→Kingston) is a made-up leg — no real river there.
  bossfights/
    wendigo.js         Le Wendigo — famine-spirit on the far shore of the lower fjord, the
                       first fight in the game (fjord, TRIGGER_DISTANCE = MOUTH_DISTANCE − 170 ..
                       DELIVERANCE_DISTANCE = MOUTH_DISTANCE − 50). No projectiles, freeze-or-flee:
                       it PROWLs the bank, then stops to LISTEN (telegraphed) — release Up/Left/Right
                       (Down/brake is allowed) and go still until it moves on. First LISTEN never
                       strikes (taught dry run). You outlast it to the mouth at Tadoussac.
                       Cold-white render (frostIntensityAt). Guarded by `segment === 'fjord'`.
    loupGarou.js       Le Loup-garou — the night beast just before Québec City (lawrenceWest,
                       TRIGGER_DISTANCE = QC − 172 .. DELIVERANCE_DISTANCE = QC − 28). No projectiles:
                       it paces the near bank and lunges (telegraphed, led like the blockade shots);
                       juke away / brake to dodge. You don't kill it — you reach the city, which
                       checks it. Cold-blue night render (nightIntensityAt). MVP — one phase.
    blockade.js        "Château Gauntlet"/"the River Styx" (the latter a flavour name only, in the
                       game.js banner — no code keys off it): Royal Navy frigate holding the channel,
                       dodge-only, survive & pass. RIDEAU segment (SHIP_FLOW_DISTANCE = Kingston − 700),
                       the last fight before the finish — already the closest-to-Kingston spot the
                       fight's ~350-unit footprint can fit without overlapping a village dock; see the
                       module comment before moving it further in. Guarded by `segment === 'rideau'`.
    chasseGalerie.js   flying-canoe flight past Montréal up to Gatineau; steeple slalom + crosswind, no landing.
                       TRIGGER_DISTANCE, FLIGHT_END.
    diable.js          Le Diable — held-arena boss before Gatineau; kill him with pistol shots while dodging
                       fireballs. game.js clamps flowDistance while diable.isHolding(). DIABLE_FLOW_DISTANCE.
  audio/
    music.js           shuffled playlist (14 tracks) + reserved boss tracks (Rule Britannia, a diable reel).
                       Player-facing title/artist strings.
    sfx.js             Web Audio synthesized cues (capsize horn, pelt chime, etc.) — no asset files
```

## Key models

- **`d` / downstream distance**: for anything drifting toward the canoe at flow
  speed, `d = world.distance - z` is invariant while it drifts, so curved shapes
  are baked once at spawn. Stateless terrain/trees/whales recompute `d` from the
  screen row + world clock every frame, nothing cached.
- **Segments**: one `flowDistance` number line can't branch, so `fjord`,
  `lawrenceEast`, `lawrenceWest`, `rideau` are separate segments each with a
  `SEGMENT_SHAPE_OFFSET` baked into `route.js` village distances. `game.js` owns
  which segment is live. lawrenceWest genuinely runs upstream — negative ambient
  current (`UPRIVER_CURRENT`), so holding Up there is a constant slog; rideau is
  a calm downstream denouement. Segment jumps happen at forced junctions:
  Tadoussac (mouth crossing → lawrenceWest) and Gatineau (`enterRideau()` on
  cast-off or on crossing `GATINEAU_FLOW_DISTANCE`).
- **Modes**: `river` / `village` (on-foot). Boss fights are states within the
  river mode, not separate modes. `state` is `playing` / `gameover` / `won`
  (`won` = reached Kingston; `win()` borrows the game-over screen). Game-over
  title varies by killer: Devil / beast / plain capsize.
- **Boss fights, in route order**: Wendigo (lower fjord, before Tadoussac),
  Loup-garou (before Québec City, lawrenceWest), Chasse-galerie steeples + Le
  Diable (past Montréal, lawrenceWest), British blockade (before Kingston,
  rideau). Each is `segment ===`-gated and distance-triggered off
  MOUTH_DISTANCE or a village's flowDistance.
- **`?start=<name>`** (main.js): dev cheat, one-shot (stripped from URL after
  use). Real village names (accent/hyphen-insensitive, incl. `kingston`) plus
  keywords `wendigo`, `loup-garou`, `british-blockade`, `chasse-galerie`,
  `diable`, `rideau`.
  `?start=diable` also arms a checkpoint (hands over the pistol, respawn returns
  there); `enterRideau()` clears that checkpoint and moves it to the Rideau start.
- **Mobile**: `isTouchPrimary()` (CSS `hover:none` + `pointer:coarse`) scales
  down forward speed/accel and halves steering authority. Lots of tuned
  constants at the top of `game.js` are touch-conditional.

## nginx caching (nginx.conf)

- `/` and `index.html` → `no-store` (entry point changes every deploy; some
  mobile browsers ignore `no-cache` on warm start).
- `/assets/` → immutable 1y (vite content-hashes filenames).
- `/audio/` → `no-cache` (stable URLs, ETag-backed 304s).

## Style

Match the surrounding code: dense explanatory comments that record *why* a
constant has its value (often with the bug that forced it). Keep that up when
you touch tuning numbers.
