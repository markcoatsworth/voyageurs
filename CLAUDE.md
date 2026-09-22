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

Before a deploy meant to ship (not just a local check), run `npm run
bump-build` and commit the resulting `build-number.txt` + `package.json`
changes along with the rest of the change — it's what makes the on-page
build badge's version (`0.1.<build number>` — no expectation of ever
reaching a real "1.0"; the version exists to distinguish builds, not to
promise semver) advance. It has to happen as its own committed step, not
inside the build itself: `gcloud run deploy --source .` builds in an
ephemeral container, so anything incremented during that build never makes
it back to this checkout (see `scripts/bump-build.mjs`'s own comment).

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
    weather.js         stateless hashed rain streaks (drawRain) — the Warship storm's only user so far
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
    blockade.js        "Château Gauntlet"/"the River Styx" (the latter a small fun detail kept in
                       the comments only — the player-facing banner just says "BRITISH BLOCKADE",
                       shown big via #boss-banner, not the small milestone one): Royal Navy frigate
                       holding the channel, dodge-only, survive & pass — no health/hull/hold-time
                       readout, just find the gap. RIDEAU segment (SHIP_FLOW_DISTANCE = Kingston −
                       700). Used to chain straight into the Warship chase below the instant the gap
                       cleared; now ends clean, ordinary paddling after. Guarded by `segment ===
                       'rideau'`.
    britishWarship.js  The British Warship — standalone held-arena chase, split out of blockade.js
                       (used to be its second phase). TRIGGER_DISTANCE sits ~1/3 of the way from
                       Jones Falls to Kingston (WARSHIP_FRACTION) — moved off its original anchor,
                       the real-world spot Kingston Mills held before it was removed as a village
                       (route.js), once that landed the fight crowded right against Kingston's own
                       dock. Held the instant it triggers (game.js clamps flowDistance while
                       isChaseHolding()); resolves on CHASE_HOLD_TIME (210s) survived or the orbiting
                       gunboat's hull shot down — never on distance covered, since that always
                       resolved in under a minute regardless of tuning (see the module's own
                       comment). Up/Down move a virtual `_chaseHoldZ` offset (game.js) that closes or
                       opens range without touching real flowDistance — shifts the canoe's own
                       on-screen position, not the ship's, so it reads as your own movement. Guarded
                       by `segment === 'rideau'`. Pre-fight approach, layered on the instant trigger:
                       the sky darkens (stormIntensityAt, same frostIntensityAt/nightIntensityAt
                       shape — its own slate-grey squall palette, not the Devil's hellstorm or the
                       Loup-garou's night) well before anything else changes, then two thunderclaps
                       (audio/sfx.js's playThunderclap) mark the approach closing — the first
                       (FIRST_THUNDERCLAP_DISTANCE) sized off a worst-case speed (MAX_SPEED +
                       RAPIDS_BOOST, duplicated from game.js with a keep-in-sync comment — importing
                       game.js directly would be circular) so it's always >=3s ahead of the trigger
                       regardless of player speed, the second closer — then a held, silent, fully-dark
                       "brooding" stretch with no ship on screen at all (draw() renders nothing pre-fight
                       any more — an earlier fog+glimpse pass had the ship fading in as part of the
                       buildup, reported back as backwards: the environment should change first, the
                       ship should be the payoff) until it appears abruptly at TRIGGER_DISTANCE. The
                       storm itself now carries straight through the held arena too ("keep the weather
                       darkness along for the fight") — the `stormIntensity()` instance method checks
                       `chasePhase` directly rather than trusting the plain `stormIntensityAt` distance
                       math, since flowDistance is clamped at TRIGGER_DISTANCE for the whole hold and
                       that alone would read the storm as already cleared; it snaps back to 0 the
                       instant the fight resolves. A second, heavier layer sits under that storm
                       ("visuals getting darker, more weather, clearly leading into a brutal fight"):
                       stormGloomAt (a second 0→1 ramp across the brooding stretch alone → extra
                       near-black wash + vignette in game.js, held at FIGHT_GLOOM through the hold),
                       stormFlickerAt (hashed sheet lightning on the module's own stormT clock, with
                       playDistantRumble on each rising edge — only while building, never in the
                       brooding stretch, and never through thunderCount, which stays exactly 2),
                       stormGustAt (lateral shove on the canoe, approach only — windAccel() reads 0
                       in the hold), rain (world/weather.js's drawRain, count scales with the
                       storm), the water shader's u_storm (chop, dead glints, slate colour), a
                       wind/rain audio bed (sfx.js's setStormBed) and the ambient shuffle ducked to
                       silence by the second clap (music.js's setDuck via musicDuck()) so the pursuit
                       track lands at full. One banner as the sky first turns
                       (consumeJustStormArrived).
    chasseGalerie.js   flying-canoe flight past Montréal up to Gatineau; steeple slalom + crosswind, no landing.
                       TRIGGER_DISTANCE, FLIGHT_END.
    diable.js          Le Diable — held-arena boss before Gatineau; kill him with pistol shots while dodging
                       fireballs. game.js clamps flowDistance while diable.isHolding(). DIABLE_FLOW_DISTANCE.
  audio/
    music.js           shuffled playlist (PLAYLIST, 15 tracks) + reserved boss tracks, one per fight
                       that has a dedicated cue (Rule Britannia/blockade, a diable reel/diable, St.
                       Anne's Reel/wendigo) — each plays via playSpecial() the instant its fight
                       starts, replacing whatever's playing, and endBossTrack() drops back into the
                       shuffle once it resolves. KINGSTON_PLAYLIST is its own isolated track set
                       (never mixed into PLAYLIST) for the Kingston arrival/on-foot visit —
                       playSpecial() takes an optional onEnded override so, unlike every other
                       reserved track, a finished Kingston track advances to the next Kingston track
                       instead of falling back to the shuffle; loops for the rest of the run, never
                       handed to endBossTrack(). Player-facing title/artist strings; see README.md's
                       Music section for sourcing/rights notes.
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
  Diable (past Montréal, lawrenceWest), British Blockade (rideau, the frigate
  gauntlet), British Warship (rideau, further downstream near where Kingston
  Mills sat — the last fight before Kingston). The Blockade and Warship used
  to be one continuous two-phase encounter; they're separate fights now, with
  ordinary paddling (Newboro, Jones Falls) between them. Each is
  `segment ===`-gated and distance-triggered off MOUTH_DISTANCE or a
  village's flowDistance.
- **`?start=<name>`** (main.js): dev cheat, one-shot (stripped from URL after
  use). Real village names (accent/hyphen-insensitive, incl. `kingston`) plus
  keywords `wendigo`, `loup-garou`, `british-blockade`, `british-warship`,
  `chasse-galerie`, `diable`, `rideau`.
  `?start=diable` also arms a checkpoint (hands over the pistol, respawn returns
  there); `enterRideau()` clears that checkpoint and moves it to the Rideau start.
- **`?difficulty=easy`** (main.js's `isEasyMode()`, not stripped like `?start=` —
  stays in effect across a reload): debug-only for now, no UI toggle yet.
  Deliberately narrow — only less damage taken and more damage dealt in the
  boss fights, nothing else (hold times, hit windows, cannon rate all
  unchanged). `Game`'s `easyMode` constructor option sets
  `this.damageTakenScale`/`this.damageGivenScale` (0.5/2, `game.js`'s
  `EASY_DAMAGE_TAKEN_SCALE`/`EASY_DAMAGE_GIVEN_SCALE`) once at construction.
  Damage taken scales at `handleHit()`'s single choke point (its boss
  branches only — cannon/shiphull/steeple/diable/wolf/wendigo — not the
  generic river hazards). Damage given has no equivalent choke point — only
  the two shootable hit-point fights (`britishWarship.js`, `diable.js`) have
  one, each scaled inline via a `damageGivenScale` argument threaded through
  their own `update()` calls.
- **Mobile**: `isTouchPrimary()` (CSS `hover:none` + `pointer:coarse`) scales
  down forward speed/accel and halves steering authority. Lots of tuned
  constants at the top of `game.js` are touch-conditional.

## Offline / PWA

`public/sw.js` (service worker; its placeholders are filled by
`scripts/postbuild.mjs` from what vite emitted, so only the built copy is
valid) + `public/manifest.webmanifest` + `public/icons/`. Registered by
`main.js` in production builds only (never against the dev server). The
app shell is precached at install; the ~88 MB of audio is pulled right
after, automatically — `main.js` posts `cache-audio` as soon as the worker
is ready (skipped only under Data Saver; tracks also cache as played).
No button, by request; the pause screen shows a passive
"N/26 TRACKS SAVED" line. Audio cache is versioned by
hand (`voyageurs-audio-v1`) and survives deploys; the shell cache is per
build. Range requests are answered by slicing the cached file (Safari
needs this for `<audio>`).

## nginx caching (nginx.conf)

- `/` and `index.html` → `no-store` (entry point changes every deploy; some
  mobile browsers ignore `no-cache` on warm start).
- `/assets/` → immutable 1y (vite content-hashes filenames).
- `/audio/` → `no-cache` (stable URLs, ETag-backed 304s).

## Style

Match the surrounding code: dense explanatory comments that record *why* a
constant has its value (often with the bug that forced it). Keep that up when
you touch tuning numbers.
