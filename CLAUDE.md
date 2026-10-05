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
    debugMenu.js       the ?debug waypoint picker overlay (dev only; built in JS with inline
                       styles, never in index.html/style.css, and not constructed at all
                       without ?debug). Pure UI — main.js owns the list, the checkpoint and
                       the navigation
    weapons.js         Z pistol / X musket / C blunderbuss (only pistol implemented). Fire cooldown on accumulated dt.
  world/
    terrain.js         redraws river/banks/trees every frame by sampling centerX/widthAt down the screen
    waterGL.js         GLSL water under the 2D layer; river shape is DUPLICATED in GLSL — keep in sync with path.js
    obstacles.js       the one stateful system: pooled rocks/logs/islands/pelts with collision/collection.
                       hullHit() tests each one against the canoe's *turned* hull (see Key models)
    whales.js          stateless hash-placed belugas once the channel reads as open estuary
    weather.js         stateless hashed rain streaks (drawRain) — the Warship storm's only user so far
    sprites.js         (~1000 lines) hand-drawn pixel sprites
    impact.js          shared bullet-hit feedback for the two shootable fights (diable.js,
                       britishWarship.js): a core flash + radial shards, plus a ring and powder
                       smoke from the medium tier up. Tiers ARE the weapons (weapons.js's own
                       "Z = small / X = medium / C = large"), via impactTierFor(bullet.type) —
                       not a damage calculation. Stateless draw; each fight keeps its own list
                       and converts to screen space (diable is already there, warship goes
                       through worldToScreen). Each fight MUST draw them last, over the boss —
                       the first cut drew the warship's above drawChaseShip and the hull painted
                       straight over every hit, which read as "no change at all". Guarded by a
                       paint-order assertion in the smoke test for both fights. Position is the
                       bullet's own, clamped onto the hull/body (the hit boxes are deliberately
                       more generous than the art they stand for)
    capsize.js         the canoe going over: a roll (width collapse 1 -> 0 -> -1, swapping to the
                       overturned hull sprite at the zero crossing), then a sink, plus foam, two
                       spreading rings and the spilled paddle/tuque. TOTAL_TIME is how long
                       game.js holds the game-over card back
    villages.js        dock + buildings per waypoint; getDockHit detects the canoe touching a dock
    villageScene.js    on-foot scene at a dock; walk back onto the dock to re-board
    minimap.js         moving SVG locator map over the real three-way geography. Village names are
                       placed together by layoutLabels() (route.js's labelPos is only the preferred
                       spot) so every name keeps LABEL_MARGIN off every other name and icon —
                       asserted by the smoke test. Press Start 2P is 1em/char, so names are huge.
                       `labelPos: { …, pin: true }` overrides the layout for one name (placed
                       verbatim, others route around it; exempt from the spacing check) — the
                       knob for hand-tuning a label. How-to in route.js's labelPos comment
    river/
      path.js          centerX(d)/widthAt(d)/braidAt/rapidsStrength — pure fns of downstream distance.
                       MOUTH_DISTANCE=900 (Tadoussac). SEGMENT_SHAPE_OFFSET per segment. widthAt has
                       special branches: the Ottawa gorge (post-Montreal) and rideauWidthAt (the
                       Rideau leg — checked first, its offset is past everything else).
      segments.js      MOUTH_DISTANCE / SEGMENT_SHAPE_OFFSET / RIDEAU_SPAN_DISTANCE, split out of path.js
                       (which re-exports them) so route.js doesn't import path.js — path.js imports
                       VILLAGES to keep sandbars (braid islands) off every dock and segment start
                       (BRAID_SUPPRESSED_CYCLES, codegen'd into the shader too). Braid islands are a
                       fixed hashed schedule, identical every run — not per-playthrough
      lawrenceWidth.js the real St. Lawrence width Tadoussac -> Montréal as eased keyframes (route.js's
                       riverWidthKm on a log scale: 48 off Tadoussac, 12 at the Québec City narrows,
                       ~37 into Lac Saint-Pierre; Montréal held at 40 so the Island of Montreal
                       keeps its shape). Replaces the estuary curve's flat ~48 for lawrenceWest in
                       widthAt(); codegen'd into the GLSL like gorge.js. Keyframe d's duplicate
                       village flowDistances (circular import otherwise) — smoke test checks them
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
                       TRIGGER_DISTANCE = Beaupré + 60, night from Beaupré + 30 .. DELIVERANCE = QC − 28). No projectiles:
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
    music.js           shuffled playlist (PLAYLIST, 15 tracks). Slot 0 is pinned to OPENING_TRACK
                       (Reel des Forêts) only when createMusic() is passed
                       pinOpeningTrack (openingOrder()), which main.js sets from
                       isPutIn(startSegment, startFlowDistance) — so the put-in always opens on
                       it and every other start (resumed checkpoint, any ?start=, any ?debug
                       jump) gets a plain shuffle. Defaults to off. Even when pinned it's only
                       the first cycle, and the track stays in the shuffle and can recur,
                       unlike a reserved cue; + reserved boss tracks, one per fight
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
  river mode, not separate modes. `state` is `playing` / `gameover` — there
  is no `won`: Kingston is the end by simply not letting you leave
  (`leaveVillage()` is a silent no-op there; on the water the canoe is held
  at `KINGSTON_FLOW_DISTANCE`), no victory card. `journeyComplete` marks the
  arrival for main.js's checkpoint clearing. Game-over title varies by
  killer: Devil / beast / plain capsize.
- **Dying**: hull at 0 calls `beginCapsize()`, not `gameOver()`. That starts
  `world/capsize.js`'s roll-and-sink (`TOTAL_TIME`, ~1.4s) and sounds the
  capsize horn on the impact rather than on the card. `update()` then runs a
  frozen-river branch that only advances the animation and redraws — no
  input, physics, obstacles or boss, so nothing can hit a hull that's
  already lost and the water can't scroll out from under the wreck — and
  calls `gameOver()` on the frame it finishes. `state` stays `playing` for
  the whole roll, so anything keying off `state === 'gameover'` sees it ~41
  frames later than it used to. The boss-kill titles survive the delay
  because the fights are frozen too: their `isActive()` still reads true
  when `gameOver()` finally asks.
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
- **`?debug`** (main.js's `isDebugMode()`): brings up `core/debugMenu.js`'s
  waypoint picker — the put-in plus every boss approach and village dock, in
  route order — so any point can be jumped to without hand-editing `?start=`.
  Backquote toggles, Esc closes (and is intercepted before the pause
  handler). Sticky in the URL like `?difficulty=`, off only with an explicit
  `?debug=0/false/off/no`. Two on-states, via
  `shouldOpenDebugMenuOnLoad()`: a bare `?debug`/`?debug=1` opens the picker
  on load (the "I want to choose" form, and what you type by hand), while
  **`?debug=play`** is debug mode with the picker shut — which is what a
  jump navigates to, because the first cut opened it on every `?debug` load
  and so a pick reloaded straight back into a full-screen overlay covering
  the thing you'd just asked to see. `onPick` also hides it immediately,
  before navigating, since a browser can take a moment over that and a
  blocked navigation never gets there at all. Picking a waypoint **clears
  the saved checkpoint** and reloads with `?start=<name>&debug=play`; the put-in has no
  `?start=` of its own, so it's "no `?start=` plus a cleared checkpoint" —
  which is the whole reason the feature exists, since the implicit
  checkpoint otherwise makes every reload resume at the furthest point
  reached. `debugWaypoints()` and `debugStartUrl()` are pure and exported
  for the smoke test, which round-trips every offered waypoint back through
  `parseStartLocation()`. `START_KEYWORD_LIST` is the single source the
  `?start=` keyword map and this list are both built from. Villages whose
  name is already a keyword are dropped from the list (keywords win in
  `parseStartLocation()`, so Kingston was two buttons with one destination).
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
- **Heading / the canoe's hull**: left/right swing a real `heading`
  (`game.js`, ±`HEADING_MAX` = 0.6 rad ≈ 34°) and the hull's own thrust
  (`STEER_THRUST`, derived from `STEER_ACCEL` so the commanded force is
  unchanged — only its source moved) is the only thing pushing the canoe
  sideways in normal play: it goes where the bow points. The same angle
  rotates the collision boundary — a `CANOE_HALF_LENGTH` (`shared/config.js`,
  0.7) line through the canoe, tested as a slanted lane by `obstacles.js`'s
  `hullHit()`, and subtracted from the navigable half-width at the bank
  clamp. Pointed straight downstream `hullHit()` is bit-identical to the old
  point-vs-box check it replaced (verified over a grid — see its comment, and
  the note about why the obvious capsule version is wrong); at full lock the
  lateral reach grows by `CANOE_HALF_LENGTH * sin(heading)`, ~0.4 units,
  +72% on a rock. So a hard turn is a real cost, not a free dodge. The two
  held fights (Diable, Warship chase) assign `lateralVX` directly and take
  only `FIGHT_HEADING` for the look. Replaced `tilt`, which rotated the
  sprite alone — and leaned it the wrong way.
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
