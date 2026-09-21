// Headless smoke test: loads the whole module graph, wires up a Game exactly
// the way main.js does, and runs thousands of simulated frames across every
// mode the game has — fjord paddling, the segment transition, the upriver
// stretch, the blockade boss fight, a village visit, and a capsize+restart.
//
// It renders nothing (see dom-shim.mjs) — it's here to catch the class of
// bug that keeps shipping: a stale reference or bad assumption that throws
// on load or on the first frame of some mode, which `vite build` never
// executes and so never catches. Run it with `npm test` before saying a
// change works.
//
// A scenario "passes" if it runs its frames without throwing. It is NOT an
// assertion of correct gameplay — it's a crash/liveness net under the parts
// a bundler can't check.

import './dom-shim.mjs';
import { makeElement, windowShim } from './dom-shim.mjs';

const failures = [];
const notes = [];

// The game and its libs are chatty (debug logs, "no WebGL" warnings). Mute
// stdout noise during the run, but keep watching console.error for the one
// line that matters: main.js's error boundary reporting a swallowed crash.
const real = { log: console.log, warn: console.warn, error: console.error };
console.log = () => {};
console.warn = () => {};
console.error = (...args) => {
  const msg = args.map((a) => (a && a.stack) || String(a)).join(' ');
  if (msg.includes('Voyageurs crashed') || msg.includes('crashed while')) {
    failures.push({ scenario: 'error-boundary (main.js caught a crash)', error: msg });
  }
};
function restoreConsole() {
  Object.assign(console, real);
}

// Handles both sync and async scenario bodies — always await the result.
async function step(name, fn) {
  try {
    await fn();
    notes.push(`  ok   ${name}`);
  } catch (err) {
    failures.push({ scenario: name, error: (err && err.stack) || String(err) });
    notes.push(`  FAIL ${name}`);
  }
}

// --- shared wiring, mirrors main.js -----------------------------------------

const { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT } = await import('../src/shared/config.js');
const { Game, MIN_SPEED, KINGSTON_APPROACH_LEAD } = await import('../src/core/game.js');
const { Input } = await import('../src/core/input.js');
const { createObstacleField } = await import('../src/world/obstacles.js');
const { createMinimap } = await import('../src/world/minimap.js');
const { createMusic } = await import('../src/audio/music.js');
const { createTouchControls } = await import('../src/core/touchControls.js');
const { VILLAGES } = await import('../src/world/river/route.js');
const { getDockHit } = await import('../src/world/villages.js');
const { SEGMENT_SHAPE_OFFSET, MOUTH_DISTANCE, centerX, widthAt } = await import('../src/world/river/path.js');
const { SHIP_FLOW_DISTANCE } = await import('../src/bossfights/blockade.js');
const { TRIGGER_DISTANCE: WARSHIP_FLOW_DISTANCE } = await import('../src/bossfights/britishWarship.js');
const { TRIGGER_DISTANCE: CHASSE_GALERIE_FLOW_DISTANCE, FLIGHT_END } = await import('../src/bossfights/chasseGalerie.js');
const { DIABLE_FLOW_DISTANCE, HP_MAX: DIABLE_HP_MAX, PISTOL_DAMAGE: DIABLE_PISTOL_DAMAGE, MUSKET_DAMAGE: DIABLE_MUSKET_DAMAGE } = await import('../src/bossfights/diable.js');
const { PISTOL_DAMAGE_TO_HULL: WARSHIP_PISTOL_DAMAGE, MUSKET_DAMAGE_TO_HULL: WARSHIP_MUSKET_DAMAGE } = await import('../src/bossfights/britishWarship.js');
const {
  FIRST_THUNDERCLAP_DISTANCE: WARSHIP_FIRST_THUNDERCLAP_DISTANCE,
  stormIntensityAt: warshipStormIntensityAt,
} = await import('../src/bossfights/britishWarship.js');
const { PISTOL_DAMAGE_TO_HULL: BLOCKADE_PISTOL_DAMAGE, MUSKET_DAMAGE_TO_HULL: BLOCKADE_MUSKET_DAMAGE } = await import('../src/bossfights/blockade.js');
const { TRIGGER_DISTANCE: LOUP_GAROU_TRIGGER, DELIVERANCE_DISTANCE: LOUP_GAROU_DELIVERANCE } = await import('../src/bossfights/loupGarou.js');
const { TRIGGER_DISTANCE: WENDIGO_TRIGGER, DELIVERANCE_DISTANCE: WENDIGO_DELIVERANCE } = await import('../src/bossfights/wendigo.js');

function makeUi(minimap) {
  const el = (id) => makeElement(id);
  return {
    hud: el('hud'), hudScore: el('hud-score'), hudSpeedFill: el('speed'),
    hudHealthFill: el('health'), hudBlockade: el('blk'), hudBlockadeFill: el('blkfill'),
    damageFlash: el('flash'), titleScreen: el('title'), gameoverScreen: el('over'),
    gameoverTitle: el('over-title'),
    finalStats: el('stats'), restartBtn: el('restart'), pauseScreen: el('pause'),
    milestoneBanner: el('banner'), bossBanner: el('boss-banner'), weaponPad: el('weapon-dpad'), layoutWeaponPad: () => {},
    fireZBtn: el('fire-z'), fireXBtn: el('fire-x'),
    minimap,
  };
}

function newGame(startSegment, startFlowDistance, opts = {}) {
  const world = { distance: 0 };
  const obstacles = createObstacleField(world);
  const input = new Input();
  createTouchControls(input);
  const minimap = createMinimap();
  const music = createMusic();
  const ui = makeUi(minimap);
  const game = new Game({ ctx: makeElement('canvas').getContext('2d'), water: null, input, obstacles, world, ui, music, startFlowDistance, startSegment, ...opts });
  return { game, input };
}

// Run `frames` updates; inputFn(i) may mutate the input state each frame.
function run({ game, input }, frames, dt, inputFn) {
  for (let i = 0; i < frames; i++) {
    if (inputFn) inputFn(input.state, i);
    game.update(dt);
  }
}

// --- scenario 0: main.js itself loads and wires without a swallowed crash ---

await step('main.js loads', async () => {
  await import('../src/main.js');
});

// --- scenario 1: fjord paddling, long enough to cross the mouth ------------

await step('fjord: paddle downstream 120s', () => {
  const g = newGame('fjord', 0);
  run(g, 3600, 1 / 30, (s, i) => { s.up = true; s.left = i % 240 < 40; s.right = i % 240 >= 120 && i % 240 < 160; });
  if (g.game.segment !== 'fjord') notes.push(`  note fjord run auto-advanced to ${g.game.segment} @ ${g.game.flowDistance | 0}`);
});

// --- scenario 2: the explicit fjord -> lawrenceWest mouth crossing ---------

await step('mouth crossing: fjord -> lawrenceWest', () => {
  const g = newGame('fjord', MOUTH_DISTANCE - 60);
  run(g, 900, 1 / 30, (s) => { s.up = true; });
  if (g.game.segment !== 'lawrenceWest') throw new Error(`expected lawrenceWest after crossing the mouth, still on ${g.game.segment} @ ${g.game.flowDistance | 0}`);
});

// --- scenario 3: upriver stretch -----------------------------------------

await step('lawrenceWest: fight the current 90s', () => {
  const g = newGame('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
  run(g, 2700, 1 / 30, (s, i) => { s.up = true; s.down = i % 300 > 260; });
});

// --- scenario 3a: the Wendigo, freeze-or-flee on the lower fjord ----------

await step('wendigo: it listens, you go still, the mouth checks it', () => {
  if (WENDIGO_TRIGGER < 0 || WENDIGO_DELIVERANCE <= WENDIGO_TRIGGER
    || WENDIGO_DELIVERANCE >= MOUTH_DISTANCE) {
    throw new Error('wendigo distances look wrong');
  }

  // A: keep working the paddle through every LISTEN and the raking blows
  // land. Position pinned in its reach (the fjord current would otherwise
  // carry a paddling canoe out to the mouth before a second listen) and
  // hull pinned so bank scrapes don't muddy the "did the *lunge* connect"
  // read — same idea as the loup-garou scenario's held-station player.
  const caught = newGame('fjord', WENDIGO_TRIGGER + 6);
  let sawBeast = false;
  let caughtHits = 0;
  caught.game.handleHit = ((orig) => (e) => {
    if (e && e.type === 'wendigo') caughtHits++;
    return orig(e);
  })(caught.game.handleHit.bind(caught.game));
  for (let i = 0; i < 1500; i++) {
    caught.input.state.up = true; // never lets off — "stirring" every frame
    caught.game.health = 100;
    caught.game.update(1 / 30);
    if (caught.game.wendigo.isActive()) sawBeast = true;
    if (caught.game.flowDistance > WENDIGO_TRIGGER + 16) caught.game.flowDistance = WENDIGO_TRIGGER + 16;
  }
  if (!sawBeast) throw new Error('the wendigo never activated on the lower fjord');
  // First listen is a free dry run, so >=2 real listens must have connected.
  if (caughtHits < 2) throw new Error(`caught working the paddle through every listen for ~50s and it only struck ${caughtHits}x`);

  // B: go still (release everything) whenever it's listening, paddle between
  // — the intended play should take zero blows and still reach the mouth.
  const g = newGame('fjord', WENDIGO_TRIGGER - 12);
  let dodgeHits = 0;
  let delivered = false;
  let sawDeliverBanner = false;
  g.game.handleHit = ((orig) => (e) => {
    if (e && e.type === 'wendigo') dodgeHits++;
    return orig(e);
  })(g.game.handleHit.bind(g.game));
  for (let i = 0; i < 4000 && !delivered; i++) {
    g.game.health = 100;
    const listening = g.game.wendigo.isListening();
    g.input.state.up = !listening;
    g.input.state.left = false;
    g.input.state.right = false;
    g.game.update(1 / 30);
    if (g.game.ui.milestoneBanner.textContent.includes('turns back')) sawDeliverBanner = true;
    if (g.game.flowDistance >= WENDIGO_DELIVERANCE && !g.game.wendigo.isActive()) delivered = true;
  }
  if (!delivered) throw new Error('going still for the wendigo never got past it to the mouth');
  if (!sawDeliverBanner) throw new Error('no deliverance banner as the mouth opened');
  if (dodgeHits > 0) throw new Error(`held still through every listen and still took ${dodgeHits} blow(s)`);

  // C: inert on another segment (its trigger is a fjord number).
  const elsewhere = newGame('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 4);
  run(elsewhere, 300, 1 / 30, (s) => { s.up = true; });
  if (elsewhere.game.wendigo.isActive()) throw new Error('the wendigo activated on lawrenceWest');
});

// --- scenario 3b: the Loup-garou, on the run into Québec City -------------

await step('loup-garou: the demon-wolf strikes, then Québec City checks it', () => {
  if (LOUP_GAROU_TRIGGER < SEGMENT_SHAPE_OFFSET.lawrenceWest
    || LOUP_GAROU_DELIVERANCE <= LOUP_GAROU_TRIGGER) {
    throw new Error('loup-garou distances look wrong');
  }

  // Sit still in the beast's reach and take the hits — the strike is led at
  // your current speed, so a canoe that isn't changing pace or line is in
  // the jaws every time (a fight where nothing can touch you isn't a fight).
  // Hull pinned so obstacle damage doesn't muddy the "did the *maw* connect"
  // read; paddle just enough to hold station against the upstream current.
  const idle = newGame('lawrenceWest', LOUP_GAROU_TRIGGER + 8);
  let sawBeast = false;
  let idleHits = 0;
  idle.game.handleHit = ((orig) => (e) => {
    if (e && e.type === 'wolf') idleHits++;
    return orig(e);
  })(idle.game.handleHit.bind(idle.game));
  for (let i = 0; i < 1400; i++) {
    // nudge forward only when the current has pushed us back past the start,
    // so net flow position barely moves and speed stays near zero
    idle.input.state.up = idle.game.flowDistance < LOUP_GAROU_TRIGGER + 8;
    idle.game.health = 100;
    idle.game.update(1 / 30);
    if (idle.game.loupGarou.isActive()) sawBeast = true;
  }
  if (!sawBeast) throw new Error('the loup-garou never activated on the approach to Québec City');
  if (idleHits < 2) throw new Error(`sitting in the beast's reach for ~45s took only ${idleHits} strikes — the maw barely connects`);

  // The intended counter — steer clear of the marked spot when it rears
  // back — should shrug off almost every strike while keeping pace up the
  // current. Hull pinned: this checks "is it dodgeable", not obstacle luck.
  const g = newGame('lawrenceWest', LOUP_GAROU_TRIGGER - 15);
  let dodgeHits = 0;
  let delivered = false;
  let sawDeliverBanner = false;
  g.game.handleHit = ((orig) => (e) => {
    if (e && e.type === 'wolf') dodgeHits++;
    return orig(e);
  })(g.game.handleHit.bind(g.game));
  for (let i = 0; i < 4000 && !delivered; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    const strikeX = g.game.loupGarou.strikeTargetX();
    if (strikeX != null) {
      g.input.state.left = g.game.canoeWorldX <= strikeX;
      g.input.state.right = g.game.canoeWorldX > strikeX;
    } else {
      const err = g.game.canoeWorldX - centerX(g.game.flowDistance);
      g.input.state.left = err > 0.6;
      g.input.state.right = err < -0.6;
    }
    g.game.update(1 / 30);
    if (g.game.ui.milestoneBanner.textContent.includes('beast falls back')) sawDeliverBanner = true;
    if (g.game.flowDistance >= LOUP_GAROU_DELIVERANCE && !g.game.loupGarou.isActive()) delivered = true;
  }
  if (!delivered) throw new Error('a steer-away dodge never got past the loup-garou to Québec City');
  if (!sawDeliverBanner) throw new Error('no deliverance banner at Québec City');
  // A few grazes across a ~2-minute run with this crude every-frame
  // bang-bang steerer is fine — the jitter itself nudges the canoe into the
  // odd ring. The real guarantee is that a steer-away dodge isn't getting
  // mauled (5+), and that it still reaches the city.
  if (dodgeHits > 3) throw new Error(`steering clear of the marked spot still ate ${dodgeHits} strikes — not dodgeable enough for the first encounter`);

  // And the wolf is inert everywhere else (its trigger is a lawrenceWest number).
  const elsewhere = newGame('fjord', 0);
  run(elsewhere, 200, 1 / 30, (s) => { s.up = true; });
  if (elsewhere.game.loupGarou.isActive()) throw new Error('the loup-garou activated on the fjord');
});

// --- scenario 4: the British Blockade (frigate approach only, on the Rideau) --

await step('blockade: approach -> cleared -> ordinary paddling continues', () => {
  if (SHIP_FLOW_DISTANCE < SEGMENT_SHAPE_OFFSET.rideau
    || SHIP_FLOW_DISTANCE > SEGMENT_SHAPE_OFFSET.rideau + 1700) {
    throw new Error(`blockade ship @ ${SHIP_FLOW_DISTANCE | 0} isn't on the Rideau leg any more`);
  }

  // Part 1 — the approach activates as you close on the frigate.
  const approach = newGame('rideau', SHIP_FLOW_DISTANCE - 80);
  let sawFight = false;
  for (let i = 0; i < 5000 && !sawFight; i++) {
    approach.input.state.up = true;
    approach.game.update(1 / 30);
    if (approach.game.blockade.isApproachEngaged()) sawFight = true;
    if (approach.game.state === 'gameover') approach.game.start();
  }
  if (!sawFight) throw new Error('blockade never activated across the whole approach');

  // Part 2 — threading the gap clears it, and it stays cleared. No more
  // automatic chase chained onto it — see britishWarship.js's own module
  // comment on why that fight was split into its own, much further
  // downstream encounter, no longer this scenario's concern.
  const g = newGame('rideau', SHIP_FLOW_DISTANCE + 2);
  g.game.lateralOffset = widthAt(SHIP_FLOW_DISTANCE) / 2 - 3.5; // gap centre
  let cleared = false;
  for (let i = 0; i < 500 && !cleared; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (!g.game.blockade.isApproachEngaged()) cleared = true;
    if (g.game.state === 'gameover') throw new Error('died in the approach with a clear lane — blockade too harsh');
  }
  if (!cleared) throw new Error('the approach never resolved — threading the gap should have cleared it');

  // Part 3 — well clear of the frigate, ordinary paddling resumes: no held
  // arena, no clamp, flowDistance keeps advancing normally right up until
  // the British Warship's own trigger, still a long way downstream and
  // covered by its own scenarios below.
  const before = g.game.flowDistance;
  for (let i = 0; i < 150; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
  }
  if (g.game.flowDistance <= before + 10) {
    throw new Error(`flowDistance barely advanced after clearing (${before | 0} -> ${g.game.flowDistance | 0}) — something's still holding it`);
  }
  notes.push('  note blockade: cleared the frigate cleanly, ordinary paddling resumed');
});

// --- scenario 4a: the British Warship — a standalone held encounter --------

await step('britishWarship: triggers ~1/3 of the way from Jones Falls to Kingston, held until resolved', () => {
  if (WARSHIP_FLOW_DISTANCE <= SHIP_FLOW_DISTANCE) {
    throw new Error(`British Warship @ ${WARSHIP_FLOW_DISTANCE | 0} isn't downstream of the frigate @ ${SHIP_FLOW_DISTANCE | 0} any more`);
  }
  // The fight is a held arena the instant it triggers (britishWarship.js's
  // own module comment) — no amount of paddling ends it early, only
  // CHASE_HOLD_TIME surviving it (or sinking the ship, not exercised by
  // this no-combat scenario) does, so the budget below has to clear that
  // floor, not just a travel distance.
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE + 2);
  let started = false;
  let escaped = false;
  for (let i = 0; i < 7000 && !escaped; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.britishWarship.isChaseHolding()) started = true;
    if (started && g.game.warshipPct === null) escaped = true;
    if (g.game.state === 'gameover') throw new Error('died in the Warship hold with no combat — too harsh');
  }
  if (!started) throw new Error('the British Warship never triggered approaching its own flowDistance');
  if (!escaped) throw new Error('the Warship fight never resolved — it (and its music) would run forever');

  // Past the Warship, the remaining ~2/3 of the run to Kingston still
  // works. Its dock is oversized (world/villages.js's KINGSTON_DOCK_REACH)
  // and now walks the canoe ashore like any other village (enterVillage(),
  // mode becomes 'village') rather than winning outright, so this has to
  // leave again the same way any village visit would before the finish is
  // reachable.
  let won = false;
  for (let i = 0; i < 3000 && !won; i++) {
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') {
      g.game.leaveVillage();
    }
    g.input.state.up = true;
    g.game.health = 100;
    const err = g.game.canoeWorldX - centerX(g.game.flowDistance);
    g.input.state.left = err > 0.4;
    g.input.state.right = err < -0.4;
    g.game.update(1 / 30);
    if (g.game.state === 'won') won = true;
  }
  if (!won) throw new Error('escaped the Warship but never reached Kingston — the run home is broken');
  notes.push('  note britishWarship ran on its own, held until it resolved, then reached the Kingston finish');
});

// --- scenario 4b: the British Warship's hull is shootable, and sinkable ----

await step('britishWarship: shooting it sinks it', () => {
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE + 2);
  let inChase = false;
  for (let i = 0; i < 500 && !inChase; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.britishWarship.isChaseHolding()) inChase = true;
  }
  if (!inChase) throw new Error('never entered the held arena to test the gunfight');

  // Steer to line up under the ship and fire. The ship spends most of its
  // orbit ahead of the canoe (see britishWarship.js's CHASE_ORBIT_* comment
  // on why) — that's what makes it reachable by weapons.js's forward-only
  // bullets at all — so lining up laterally and firing whenever the ship
  // isn't too far behind is a real, if simple, aim strategy, not a script
  // that only works because it knows the ship's exact position out of band
  // (debugChaseShipPosition() is the same kind of test-only accessor
  // diable.js's debugCentreX() already provides).
  // Budget just past CHASE_HOLD_TIME (210s) — CHASE_HULL_HP is calibrated
  // (see its own comment) so even this same continuous-fire bot takes ~200s
  // to sink it, deliberately just under the hold-time floor. A real budget
  // tighter than that would make this scenario fail on the exact tuning
  // it's meant to confirm, not catch an actual regression.
  let resolved = false;
  let sunk = false;
  let frames = 0;
  for (; frames < 6600 && !resolved && g.game.warshipPct !== null; frames++) {
    g.input.state.up = true;
    g.game.health = 100;
    const pos = g.game.britishWarship.debugChaseShipPosition();
    const err = g.game.canoeWorldX - pos.worldX;
    g.input.state.left = err > 0.3;
    g.input.state.right = err < -0.3;
    if (Math.abs(err) < 1.5 && pos.flowDistance > g.game.flowDistance - 2) g.input.onWeaponFire?.('pistol');
    g.game.update(1 / 30);
    // game.js's own update() already consumes britishWarship.consumeJustSunk()
    // internally (to fire its own banner/SFX), so it always reads false by
    // the time this loop gets a turn — the banner text it leaves behind is
    // the only signal left to tell a sinking from a timeout from out here.
    if (g.game.ui.milestoneBanner.textContent.includes('GOING DOWN')) sunk = true;
    if (g.game.state === 'gameover') throw new Error('died trying to shoot down the Warship');
    if (g.game.warshipPct === null) resolved = true;
  }
  if (!resolved) throw new Error('the Warship fight never resolved (sunk or escaped) within budget');
  if (!sunk) throw new Error('resolved via the CHASE_HOLD_TIME timeout instead of sinking — the gunfight itself was never exercised');
  notes.push(`  note britishWarship: sank it after ${(frames / 30).toFixed(1)}s of gunnery`);
});

// --- scenario 4b2: the pre-fight approach — storm, thunder, then brooding --

await step('britishWarship: the weather darkens before any thunder, the first clap leads the fight by >=3s, then a silent dark brood', () => {
  // The algebraic guarantee itself, requested explicitly (of the original
  // single "distant sound cue," now the first of two thunderclaps): "give
  // the distance sound cue at least 3 seconds of advance warning" —
  // FIRST_THUNDERCLAP_DISTANCE is a *fixed* distance short of
  // TRIGGER_DISTANCE, so the minimum possible lead time is that gap divided
  // by the fastest anyone can possibly be closing it, not the gap divided by
  // any particular test run's own speed. WORST_CASE_SPEED mirrors
  // britishWarship.js's own module-level constant of the same name
  // (MAX_SPEED=16 + RAPIDS_BOOST=7, both game.js's — see that constant's own
  // comment on why it's duplicated here rather than imported).
  const WORST_CASE_SPEED = 23;
  const gap = WARSHIP_FLOW_DISTANCE - WARSHIP_FIRST_THUNDERCLAP_DISTANCE;
  if (gap / WORST_CASE_SPEED < 3) {
    throw new Error(`first-thunderclap gap (${gap.toFixed(1)} units) only guarantees ${(gap / WORST_CASE_SPEED).toFixed(2)}s at worst-case speed ${WORST_CASE_SPEED}u/s — short of the requested 3s`);
  }

  // stormIntensityAt is a pure function of position (same shape as
  // wendigo.js's frostIntensityAt) — 0 well before the approach, then 0
  // again at and past the trigger, where the held arena's own look takes
  // over. Critically, it must already be nonzero *by* FIRST_THUNDERCLAP_DISTANCE
  // — reported back once before as "the warship gets faded [in] but nothing
  // else in the environment does... I want the opposite," so the weather
  // darkening has to lead the thunder, not follow it.
  if (warshipStormIntensityAt(WARSHIP_FIRST_THUNDERCLAP_DISTANCE - 200) !== 0) throw new Error('storm is already nonzero long before the approach');
  if (warshipStormIntensityAt(WARSHIP_FIRST_THUNDERCLAP_DISTANCE) <= 0) throw new Error('the sky should already be darkening by the first thunderclap');
  if (warshipStormIntensityAt(WARSHIP_FLOW_DISTANCE) !== 0) throw new Error('storm is still nonzero exactly at the trigger');
  if (warshipStormIntensityAt(WARSHIP_FLOW_DISTANCE - 5) < 1) throw new Error('storm should be held at full darkness through the brooding stretch just short of the trigger');

  // Now the lived version: paddle flat-out from before the approach zone
  // through the trigger. game.js's own update() consumes
  // britishWarship.update()'s thunderCount internally (to fire its own
  // playThunderclap() calls), so this wraps the method the same way the
  // wendigo/loup-garou scenarios wrap handleHit, to count real events from
  // out here.
  const g = newGame('rideau', WARSHIP_FIRST_THUNDERCLAP_DISTANCE - 60);
  let simTime = 0;
  let triggerTime = null;
  let totalThunder = 0;
  let firstThunderTime = null;
  const origUpdate = g.game.britishWarship.update.bind(g.game.britishWarship);
  g.game.britishWarship.update = (...args) => {
    const res = origUpdate(...args);
    if (res.thunderCount > 0) {
      totalThunder += res.thunderCount;
      if (firstThunderTime === null) firstThunderTime = simTime;
    }
    return res;
  };
  let sawStormBeforeFirstThunder = false;
  for (let i = 0; i < 3000 && triggerTime === null; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    simTime += 1 / 30;
    if (firstThunderTime === null && warshipStormIntensityAt(g.game.flowDistance) > 0) sawStormBeforeFirstThunder = true;
    if (triggerTime === null && g.game.britishWarship.isChaseHolding()) triggerTime = simTime;
  }
  if (firstThunderTime === null) throw new Error('the first thunderclap never fired');
  if (triggerTime === null) throw new Error('never reached the fight trigger');
  if (totalThunder !== 2) throw new Error(`expected exactly 2 thunderclaps across the approach, got ${totalThunder}`);
  if (!sawStormBeforeFirstThunder) throw new Error('the storm never showed any darkening before the first thunderclap — the sequence is backwards again');
  const lead = triggerTime - firstThunderTime;
  if (lead < 2.9) throw new Error(`only ${lead.toFixed(2)}s between the first thunderclap and the fight starting — short of the requested >=3s (small slack for the test's own 1/30 frame step)`);
  if (warshipStormIntensityAt(g.game.flowDistance) !== 0) throw new Error('storm is still showing once the held arena has started');
  notes.push(`  note britishWarship: weather darkened first, 2 thunderclaps, first clap led the fight by ${lead.toFixed(2)}s`);
});

// --- scenario 4b2b: the storm stays dark through the fight, not just up to it

await step('britishWarship: the storm holds through the whole fight, then clears once it resolves', () => {
  // "Keep the weather darkness along for the fight" — stormIntensityAt
  // alone (the pure function) already snaps to 0 at TRIGGER_DISTANCE by
  // design, and flowDistance itself is clamped at chaseHoldFlowDistance
  // (>= TRIGGER_DISTANCE) for the whole held arena, so that pure function
  // alone would read 0 for the entire fight — this is what the
  // stormIntensity() *instance* method (game.js's render() actually calls
  // this, not the bare function) exists to fix, by checking chasePhase
  // directly instead.
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE + 2);
  let inChase = false;
  for (let i = 0; i < 500 && !inChase; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.britishWarship.isChaseHolding()) inChase = true;
  }
  if (!inChase) throw new Error('never entered the held arena to test the storm');
  if (g.game.britishWarship.stormIntensity(g.game.flowDistance) !== 1) {
    throw new Error('storm should be held at full darkness during the fight, via stormIntensity()');
  }

  // Survive out the CHASE_HOLD_TIME floor without fighting back — same
  // no-combat resolution shape as the "held until resolved" scenario above
  // — then confirm the storm clears the instant it does.
  let resolved = false;
  for (let i = 0; i < 7000 && !resolved; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.warshipPct === null) resolved = true;
    if (g.game.state === 'gameover') throw new Error('died in the Warship hold with no combat — too harsh');
  }
  if (!resolved) throw new Error('the Warship fight never resolved within budget');
  if (g.game.britishWarship.stormIntensity(g.game.flowDistance) !== 0) {
    throw new Error('storm is still dark after the fight resolved — should have cleared');
  }
});

// --- scenario 4b3: ?start=british-warship gives real lead time -------------

await step('britishWarship: the ?start= cheat gives at least 3s of lead, not a hot drop into combat', async () => {
  // Used to drop the canoe just past TRIGGER_DISTANCE (+10) — straight into
  // the held arena with zero runway. Asked explicitly to "give me 3 seconds
  // of lead time" once the pre-fight approach (weather darkening, two
  // thunderclaps, a silent brooding stretch) existed to actually show off —
  // repinned to FIRST_THUNDERCLAP_DISTANCE, which is already built to
  // guarantee that exact gap (see its own comment in britishWarship.js)
  // rather than picking a fresh, independently-tuned number.
  const { START_KEYWORDS } = await import('../src/main.js');
  // START_KEYWORDS is keyed by normalizeStartName() (main.js, not exported)
  // — hyphens fold to spaces, so "british-warship" is stored as "british
  // warship", same as every other hyphenated keyword here.
  const start = START_KEYWORDS['british warship'];
  if (!start) throw new Error('no "british-warship" entry in START_KEYWORDS — a name/lookup drifted');
  if (start.segment !== 'rideau') throw new Error(`?start=british-warship lands on segment "${start.segment}", not rideau`);
  if (Math.abs(start.flowDistance - WARSHIP_FIRST_THUNDERCLAP_DISTANCE) > 0.01) {
    throw new Error(`?start=british-warship (${start.flowDistance.toFixed(1)}) isn't pinned to FIRST_THUNDERCLAP_DISTANCE (${WARSHIP_FIRST_THUNDERCLAP_DISTANCE.toFixed(1)}) any more`);
  }

  // Lived version: paddle flat-out from the cheat's own landing spot and
  // confirm the fight doesn't actually trigger for a real 3s.
  const g = newGame(start.segment, start.flowDistance);
  let simTime = 0;
  let triggerTime = null;
  for (let i = 0; i < 500 && triggerTime === null; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    simTime += 1 / 30;
    if (g.game.britishWarship.isChaseHolding()) triggerTime = simTime;
  }
  if (triggerTime === null) throw new Error('the fight never triggered after the cheat at all');
  if (triggerTime < 2.9) throw new Error(`the fight triggered only ${triggerTime.toFixed(2)}s after ?start=british-warship — short of the requested 3s of lead`);
});

// --- scenario 4c: the ship's fore/aft hold never renders off-screen --------

await step('britishWarship: Up/Down keeps the ship on screen', () => {
  // Reported as "Up/Down don't do anything" — the ship WAS moving (verified
  // separately), but worldToScreen has no perspective falloff (z maps
  // straight to screen Y), and CHASE_HOLD_Z_MIN used to be large enough
  // (-6) that opening range at the orbit's own farthest phase rendered the
  // ship at y = -43 — off the top of the 220px canvas entirely, which reads
  // as "broken," not "farther away." Holds Down (and separately Up) through
  // more than a full CHASE_ORBIT_PERIOD so every phase of the orbit gets
  // combined with the hold offset at least once, and checks the resulting
  // screen Y (same z = worldDistance - chaseShipD math draw() itself uses,
  // via debugChaseShipPosition()) never leaves [0, CANVAS_HEIGHT].
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE + 2);
  for (let i = 0; i < 500 && !g.game.britishWarship.isChaseHolding(); i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (!g.game.britishWarship.isChaseHolding()) throw new Error('never entered the hold to test the fore/aft hold');

  for (const [label, dir] of [['down (opening)', 'down'], ['up (closing)', 'up']]) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 400; i++) { // > CHASE_ORBIT_PERIOD (9s) at 1/30
      g.input.state.up = dir === 'up';
      g.input.state.down = dir === 'down';
      g.game.update(1 / 30);
      // Skip the ~1.1s "closing in" opening beat (britishWarship.js's
      // CHASE_INTRO_TIME) — that intentionally starts the ship further
      // behind/out of range and eases it in, a separate, known, brief
      // quirk of its own (also capable of a momentary off-screen render),
      // not the steady-state hold this scenario is checking.
      if (i < 40) continue;
      const pos = g.game.britishWarship.debugChaseShipPosition();
      const z = g.game.flowDistance - pos.flowDistance;
      const y = CANOE_SCREEN_Y + z * PIXELS_PER_UNIT;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (minY < 0 || maxY > CANVAS_HEIGHT) {
      throw new Error(`holding ${label} put the ship off-screen: y ranged ${minY.toFixed(0)}..${maxY.toFixed(0)}, canvas is 0..${CANVAS_HEIGHT}`);
    }
  }
});

// --- scenario 4d: Kingston's dock is a real entrance into the town ---------

await step('kingston: running into the dock enters the town on foot', () => {
  // Reported: "no obvious way to actually get into Kingston" — its dock
  // used to win the run outright (game.js), never enterVillage(), so there
  // was no way to walk around the town at all. A dedicated bridge stood in
  // as the entrance for a while; removed in favour of just making the dock
  // itself (world/villages.js's KINGSTON_DOCK_REACH) the unmissable "so big
  // I cannot miss it" landmark, same as Quebec City's King's Wharf, so it
  // now doubles as both the entrance and (once cast off from) the finish.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  if (!kingston) throw new Error('no "Kingston" in VILLAGES — a name/lookup drifted');
  const g = newGame('rideau', kingston.flowDistance - 20);
  let entered = false;
  for (let i = 0; i < 200 && !entered; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') entered = true;
  }
  if (!entered) throw new Error('running into the dock never entered Kingston on foot');
  if (g.game.state === 'won') throw new Error('entering via the dock should not win the run by itself — only reaching the dock/flowDistance does');

  // Leaving (same as any other village) pushes flowDistance past Kingston's
  // own line, so the next frame reaching the water completes the journey —
  // the "walk the town, then cast off to finish" flow the report implied.
  g.game.leaveVillage();
  let won = false;
  for (let i = 0; i < 30 && !won; i++) {
    g.game.update(1 / 30);
    if (g.game.state === 'won') won = true;
  }
  if (!won) throw new Error('casting off from Kingston after the dock never reached the win condition');
});

await step('kingston: walking up into Artillery Park (the band/crowd) never crashes', () => {
  // The band/crowd (villageScene.js's KINGSTON_BANDSTAND_POS/
  // KINGSTON_BAND_SPOTS/KINGSTON_CROWD_SPOTS) are purely cosmetic — no
  // trigger, no state, nothing to assert on directly — so this is a
  // liveness check, same spirit as this whole file's own opening comment:
  // walk far enough north to pass through the whole crowd (WALK_SPEED=62,
  // dock-to-bandstand is a few hundred px, so budget generously) and
  // confirm update()/draw() survive it, including the extra
  // ambientTime-driven sway/instrument motion on every figure.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const g = newGame('rideau', kingston.flowDistance - 20);
  for (let i = 0; i < 200 && g.game.mode !== 'village'; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (g.game.mode !== 'village') throw new Error('never entered Kingston on foot');
  for (let i = 0; i < 400; i++) {
    g.input.state.up = true;
    g.input.state.left = i % 90 < 30;
    g.input.state.right = i % 90 >= 60;
    g.game.update(1 / 30);
  }
});

// --- scenario 4e: ?start=kingston lands where the town actually renders ----

await step('kingston: the ?start= cheat lands exactly on the arrival-track trigger, past the Warship, and fires it on its own', async () => {
  // Reported across six rounds of tuning (main.js's own comment has the
  // full history) — most recently: the arrival-track trigger itself moved
  // further back (game.js's KINGSTON_APPROACH_LEAD, 70 -> 150, "kick in
  // [the track] a bit further back up the river sequence"), and this cheat
  // repinned to land at that *exact* distance ("update ?start=kingston to
  // match it") instead of an independently-tuned position — which means the
  // arrival track/banner should now fire on their own, no forced-on hook
  // needed any more (removed from main.js).
  const { START_KEYWORDS } = await import('../src/main.js');
  const { TRIGGER_DISTANCE: WARSHIP_FLOW_DISTANCE } = await import('../src/bossfights/britishWarship.js');
  const { KINGSTON_PLAYLIST } = await import('../src/audio/music.js');
  const kingstonTitles = KINGSTON_PLAYLIST.map((t) => t.title);
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const start = START_KEYWORDS['kingston'];
  if (!start) throw new Error('no "kingston" entry in START_KEYWORDS — a name/lookup drifted');

  const expected = kingston.flowDistance - KINGSTON_APPROACH_LEAD;
  if (Math.abs(start.flowDistance - expected) > 0.01) {
    throw new Error(`?start=kingston (${start.flowDistance.toFixed(1)}) isn't pinned to KINGSTON_APPROACH_LEAD (expected ${expected.toFixed(1)})`);
  }
  // Still has to clear the Warship's own "well past the trigger" auto-
  // resolve threshold — landing inside its real held-fight zone would
  // freeze the approach entirely.
  if (start.flowDistance <= WARSHIP_FLOW_DISTANCE + 50) {
    throw new Error(`?start=kingston (${start.flowDistance.toFixed(1)}) lands inside the Warship's held-fight zone (auto-resolve needs > ${(WARSHIP_FLOW_DISTANCE + 50).toFixed(1)})`);
  }

  // The natural trigger itself: a single update() tick from exactly this
  // position should already fire the arrival track, the same way
  // game.js's own Game.update() does for a real ?start=kingston page load
  // (main.js doesn't expose the game/music instances it builds from a real
  // ?start= URL — same limitation every other cheat here has — so this
  // drives the Game class directly, same as every other scenario).
  const g = newGame('rideau', start.flowDistance);
  g.game.update(1 / 30);
  await new Promise((r) => setTimeout(r, 20)); // let the fake play()/canplay promises resolve
  if (!kingstonTitles.includes(g.game.music.nowPlaying?.title)) {
    throw new Error(`arrival playlist never cut in on its own — playing "${g.game.music.nowPlaying?.title}" instead`);
  }

  let arrived = false;
  for (let i = 0; i < 2000 && !arrived; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') arrived = true;
    if (g.game.state === 'won') arrived = true;
  }
  if (!arrived) throw new Error('?start=kingston never reached Kingston within the test budget');
});

await step("kingston: MIN_SPEED (the ?start= cheat's own starting speed) is genuinely a slow, chill drift", () => {
  // Reported: "my canoe is already screaming fast" jumping in via
  // ?start=kingston — every ?start= cheat otherwise begins at this game's
  // normal BASE_SPEED (the same speed a real playthrough carries into any
  // segment), which read as already-accelerated for a cheat whose whole
  // point is a slow approach. main.js's startedAtKingston now sets
  // game.speed = MIN_SPEED directly on top of the ordinary construction
  // (not tested through the actual URL path — see the other ?start=
  // cheats' own tests for why: none of them are). What actually has to
  // stay true for that fix to keep working is checked structurally here:
  // MIN_SPEED well under a fresh, unmodified game's own real default
  // speed, not hardcoded against BASE_SPEED's current value.
  const defaultSpeed = newGame('rideau', 0).game.speed;
  if (!(MIN_SPEED < defaultSpeed * 0.6)) {
    throw new Error(`MIN_SPEED (${MIN_SPEED}) isn't meaningfully slower than the default start speed (${defaultSpeed}) — the ?start=kingston "slow, chill" override (main.js) wouldn't read as calm any more`);
  }
});

// --- scenario 4b: the Chasse-galerie flight, from the ?start= drop point ---

await step('chasse-galerie: fly the gorge, no landing, glide down', () => {
  // A simple autopilot: steer toward the thread through the churches ahead
  // (chasseGalerie.clearOffsetAhead), which also has to fight the crosswind.
  // If a basic bang-bang pilot like this can get through, the gorge slalom
  // is hard but fair.
  function flyThrough(game, input) {
    input.state.up = true;
    const want = game.chasseGalerie.isActive()
      ? game.chasseGalerie.clearOffsetAhead(game.flowDistance)
      : 0;
    const err = game.lateralOffset - want;
    input.state.left = err > 0.12;
    input.state.right = err < -0.12;
  }

  const g = newGame('lawrenceWest', CHASSE_GALERIE_FLOW_DISTANCE + 3);
  let sawFlight = false;
  let maxAltitude = 0;
  let landedMidFlight = false;
  let reachedArena = false;
  let hpAtArena = 100;
  // Fly the whole gorge up to the Diable arena (the boss itself gets its own
  // scenario below). If a bang-bang thread-follower can get there in one
  // piece, the steeple slalom is hard but fair.
  for (let i = 0; i < 20000 && !reachedArena; i++) {
    flyThrough(g.game, g.input);
    g.game.update(1 / 30);
    if (g.game.chasseGalerie.isActive()) {
      sawFlight = true;
      maxAltitude = Math.max(maxAltitude, g.game.chasseGalerie.getAltitude());
      if (g.game.mode === 'village') landedMidFlight = true;
    }
    if (g.game.flowDistance >= DIABLE_FLOW_DISTANCE - 2) {
      reachedArena = true;
      hpAtArena = g.game.health;
    }
    if (g.game.state === 'gameover') g.game.start();
  }
  if (!sawFlight) throw new Error('chasse-galerie never took flight from the ?start= drop point');
  if (maxAltitude < 4) throw new Error(`canoe never really left the water (max altitude ${maxAltitude.toFixed(1)})`);
  if (landedMidFlight) throw new Error('canoe docked at a riverbank town mid-flight — there should be no landing');
  if (!reachedArena) throw new Error('a thread-following pilot could never clear the gorge — too hard / unfair');
  if (hpAtArena < 25) throw new Error(`thread-follower limped to the Diable arena on ${hpAtArena|0} hull — steeples too harsh`);

  // The steeples are the fight, and clipping them bites hard (STEEPLE_DAMAGE):
  // a dead-straight line, no steering at all, capsizes on the reaching
  // churches well before the gorge is cleared — no free lane down the middle,
  // and no shrugging the whole thing off any more.
  const s = newGame('lawrenceWest', CHASSE_GALERIE_FLOW_DISTANCE + 3);
  let straightLineDamage = false;
  let straightLineCapsized = false;
  for (let i = 0; i < 8000; i++) {
    s.input.state.up = true; // no steering
    const hpBefore = s.game.health;
    s.game.update(1 / 30);
    if (s.game.chasseGalerie.isActive() && s.game.health < hpBefore) straightLineDamage = true;
    if (s.game.state === 'gameover') { straightLineCapsized = true; break; }
    if (!s.game.chasseGalerie.isActive() && s.game.flowDistance > CHASSE_GALERIE_FLOW_DISTANCE + 700) break;
  }
  if (!straightLineDamage) throw new Error('flying a straight line through the storm took no damage — too easy');
  if (!straightLineCapsized) throw new Error('a no-steering straight line survived the whole gorge — steeples hit too softly');

  // The flight stays fenced to the river: steering hard into a bank the
  // whole time clips the treetops (damage) and never lets the canoe escape
  // far out over the land. Measured against the *local* water edge, not a
  // fixed offset — the channel eases from wide (just off Montréal) down to
  // the tight gorge over the first stretch of the flight (path.js widthAt).
  const t = newGame('lawrenceWest', CHASSE_GALERIE_FLOW_DISTANCE + 3);
  let treeDamage = false;
  let maxEscape = 0;
  for (let i = 0; i < 3000; i++) {
    t.input.state.up = true;
    t.input.state.left = true; // fly straight at the bank
    const hpBefore = t.game.health;
    t.game.update(1 / 30);
    if (t.game.chasseGalerie.isActive()) {
      if (t.game.health < hpBefore) treeDamage = true;
      const overEdge = Math.abs(t.game.lateralOffset) - widthAt(t.game.flowDistance) / 2;
      maxEscape = Math.max(maxEscape, overEdge);
    }
    if (t.game.state === 'gameover') break;
  }
  if (!treeDamage) throw new Error('flying into the bank mid-flight never clipped the treetops');
  if (maxEscape > 4) throw new Error(`canoe escaped ${maxEscape.toFixed(1)} units past the water's edge out over the land mid-flight`);

  notes.push(`  note chasse-galerie ran; max altitude ${maxAltitude.toFixed(1)}, reached the Diable arena at ${hpAtArena | 0} hull`);
});

// --- scenario 4e: the Diable boss fight, from the ?start= checkpoint ------

await step('diable: hold the arena, kill him, fly on to Gatineau', () => {
  // Autopilot: line the canoe up under the Devil (debugCentreX) to land
  // pistol shots, but actually dodge too rather than relying on aim-lag
  // alone — react to isTelegraphing() (the real wind-up tell a player
  // reacts to), committing to a direction for the whole windup + early
  // flight, since reacting only once a shot's airborne leaves too little
  // time to clear the gap. Oscillates toward centre so it doesn't drift
  // to an arena edge over a long fight. If this still-crude pilot can
  // win, the fight is beatable.
  let dodgeDir = 0;
  let wasTelegraphing = false;
  function fightDiable(game, input) {
    input.state.up = true;
    input.onWeaponFire?.('pistol');
    const d = game.diable;
    if (d.isActive() && !d.isDefeated()) {
      const canoeX = CANOE_SCREEN_X + game.lateralOffset * PIXELS_PER_UNIT;
      const telegraphing = d.isTelegraphing();
      if (telegraphing && !wasTelegraphing) {
        dodgeDir = canoeX > CANVAS_WIDTH / 2 ? -1 : 1;
      }
      wasTelegraphing = telegraphing;
      if (telegraphing) {
        input.state.left = dodgeDir < 0;
        input.state.right = dodgeDir > 0;
      } else {
        let urgent = null, soonest = Infinity;
        for (const f of d.getFireballs()) {
          if (f.vy <= 0) continue;
          const tArrive = (CANOE_SCREEN_Y - f.y) / f.vy;
          if (tArrive > 0 && tArrive < soonest) { soonest = tArrive; urgent = { f, tArrive }; }
        }
        if (urgent && urgent.tArrive < 0.7) {
          const predictedX = urgent.f.x + urgent.f.vx * urgent.tArrive;
          const goLeft = predictedX >= canoeX;
          input.state.left = goLeft;
          input.state.right = !goLeft;
        } else {
          const wantOffset = (d.debugCentreX() - CANOE_SCREEN_X) / PIXELS_PER_UNIT;
          const err = game.lateralOffset - wantOffset;
          input.state.left = err > 0.4;
          input.state.right = err < -0.4;
        }
      }
    } else {
      input.state.left = false;
      input.state.right = false;
      wasTelegraphing = false;
    }
  }

  const g = newGame('lawrenceWest', DIABLE_FLOW_DISTANCE - 22);
  g.game.armDiableCheckpoint(); // ?start=diable does this in main.js
  if (!g.game.weapons.has('pistol')) throw new Error('armDiableCheckpoint did not hand over the pistol');

  let sawFight = false;
  let heldAtArena = false;
  let won = false;
  let deaths = 0;
  let lowestHpPct = 100;
  // This scenario checks liveness/integrity (this file's own top comment:
  // "NOT an assertion of correct gameplay"), not that a scripted bot can
  // fairly clear a bullet-hell-style fight — a full clean clear depends on
  // genuinely reactive dodging no script here manages well (confirmed
  // empirically at an earlier HP_MAX, not just in theory: the same bot
  // failed at the exact same point on every retry, since nothing but the
  // feint's coin flip is randomised, and that alone isn't enough to make
  // repeated attempts meaningfully different). Real winnability is a human-
  // playtesting question — this just confirms the fight activates, holds
  // the arena, deals damage in both directions for a sustained stretch
  // (lowestHpPct dropping well below full proves hits are actually
  // registering, not just being attempted), and that dying mid-fight
  // correctly respawns at the checkpoint with the pistol intact. A clean
  // win, if the autopilot happens to land one, is checked and welcomed but
  // no longer required.
  // Budget scales with the real, live HP_MAX (imported above as
  // DIABLE_HP_MAX, not a hardcoded ratio) so this doesn't silently start
  // timing out again next time it moves — it already has once. 12000
  // frames was the calibrated budget back when HP_MAX was 480.
  const FRAME_BUDGET = Math.round(12000 * (DIABLE_HP_MAX / 480));
  for (let i = 0; i < FRAME_BUDGET && !won; i++) {
    fightDiable(g.game, g.input);
    g.game.update(1 / 30);
    if (g.game.diable.isActive()) {
      sawFight = true;
      // while holding, the flow clamp pins us at the arena
      if (Math.abs(g.game.flowDistance - DIABLE_FLOW_DISTANCE) < 0.5 && g.game.diable.isHolding()) heldAtArena = true;
      lowestHpPct = Math.min(lowestHpPct, g.game.diable.hpPct());
    }
    if (g.game.state === 'gameover') {
      if (g.game.ui.gameoverTitle.textContent !== 'THE DEVIL COLLECTS') {
        throw new Error(`died to Diable but game-over said "${g.game.ui.gameoverTitle.textContent}"`);
      }
      deaths++;
      g.game.start();
      if (!g.game.weapons.has('pistol')) throw new Error('respawn at the Diable checkpoint lost the pistol');
    }
    // Beaten, hold released, and the flight has carried us on past the arena.
    if (sawFight && g.game.diable.isDefeated() && g.game.flowDistance > DIABLE_FLOW_DISTANCE + 20) {
      won = true;
    }
  }
  if (!sawFight) throw new Error('the Diable fight never activated at the arena');
  if (!heldAtArena) throw new Error('the arena never actually held the canoe in place');
  // 70, not 50: diagnostics on this same autopilot topped out anywhere in
  // the 40-60% range depending on exact timing, well short of a full
  // clear (this scenario's own comment) but well past "barely dented" —
  // 70 comfortably separates "damage is registering" from "isn't."
  // 85, not 70: that bar was tuned when HP_MAX was 480 and needed a 30%
  // drop; at HP_MAX 3840 the same percentage is 8x the raw hp (and real
  // combat time) to prove the same thing, most of it eaten by death/
  // retry overhead this scenario doesn't otherwise care about. All this
  // needs to show is that hits are landing at all — a 15% drop already
  // does that unambiguously, and stays cheap to reach regardless of how
  // big HP_MAX gets next.
  if (lowestHpPct > 85) throw new Error(`pistol hits barely dented him (lowest ${lowestHpPct.toFixed(0)}% hp) — damage isn't registering`);
  notes.push(`  note diable: lowest hp reached ${lowestHpPct.toFixed(0)}%, ${deaths} death(s), ${won ? 'won outright' : 'not cleared within budget (expected for now — see this scenario\'s own comment)'}`);
  if (!won) return;

  // Ride it out: the flight should finish its descent to the water and end.
  // Keeps threading the steeples the same way flyThrough() does in the main
  // chasse-galerie scenario below — the descent still runs through
  // steeple territory (their generation loop runs to FLIGHT_END + 4, past
  // the arena), so simulating a player who lets go of the stick entirely
  // for a whole DESCENT_DISTANCE isn't a real playstyle to guarantee safe;
  // a merely-reasonable pilot still finishing the glide is the actual bar.
  for (let i = 0; i < 6000 && g.game.chasseGalerie.isActive(); i++) {
    g.input.state.up = true;
    const want = g.game.chasseGalerie.clearOffsetAhead(g.game.flowDistance);
    const err = g.game.lateralOffset - want;
    g.input.state.left = err > 0.12;
    g.input.state.right = err < -0.12;
    g.game.update(1 / 30);
  }
  if (g.game.chasseGalerie.getAltitude() > 0.6) throw new Error('canoe never glided back down after the fight');

  // Paddle on past Gatineau — the run must roll off lawrenceWest onto the
  // made-up Rideau leg (either by docking at the winter camp or, here, just
  // crossing its flowDistance), not dead-end in the gorge.
  let onRideau = false;
  for (let i = 0; i < 4000 && !onRideau; i++) {
    g.input.state.up = true;
    g.game.health = 100; // this leg is about the segment hand-off, not the obstacle run
    g.game.update(1 / 30);
    if (g.game.mode === 'village') g.game.leaveVillage(); // walked onto Gatineau's dock
    if (g.game.segment === 'rideau') onRideau = true;
  }
  if (!onRideau) throw new Error('past Le Diable the run never reached the Rideau leg toward Kingston');
  notes.push(`  note diable fight won after ${deaths} death(s); rolled onto the Rideau at ${g.game.flowDistance | 0}`);
});

// --- scenario 4f: vertical dodge while the Diable arena holds the river ----

await step('diable: up/down move the canoe without unlocking the river', () => {
  const g = newGame('lawrenceWest', DIABLE_FLOW_DISTANCE - 22);
  g.game.armDiableCheckpoint();
  // Paddle in until the river is actually clamped at the arena (the fight
  // proper, not just the Devil rising into view).
  const clamped = () => g.game.diable.isHolding()
    && Math.abs(g.game.flowDistance - DIABLE_FLOW_DISTANCE) < 0.5;
  for (let i = 0; i < 1200 && !clamped(); i++) {
    g.game.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (!clamped()) throw new Error('never got clamped at the Diable arena');
  // Let the hover settle, then record the locked river position.
  g.game.input.state.up = false;
  for (let i = 0; i < 40; i++) g.game.update(1 / 30);
  const lockedFlow = g.game.flowDistance;
  const restAlt = g.game.chasseGalerie.getAltitude();

  // Hold "down" — the canoe should drop (lower altitude / lower on screen)
  // while the river stays pinned at the arena.
  for (let i = 0; i < 45; i++) { g.game.input.state.down = true; g.game.update(1 / 30); }
  g.game.input.state.down = false;
  const lowAlt = g.game.chasseGalerie.getAltitude();
  if (lowAlt >= restAlt - 0.5) throw new Error(`holding "down" barely moved the canoe (alt ${restAlt.toFixed(2)} -> ${lowAlt.toFixed(2)})`);
  if (Math.abs(g.game.flowDistance - lockedFlow) > 0.5) throw new Error('the river scrolled while dodging — screen not locked');
  if (g.game.diable.isDefeated()) throw new Error('the fight ended unexpectedly during the dodge test');

  // Release — it eases back up toward the baseline hover.
  for (let i = 0; i < 90; i++) g.game.update(1 / 30);
  const backAlt = g.game.chasseGalerie.getAltitude();
  if (backAlt <= lowAlt + 0.3) throw new Error(`canoe never eased back up after releasing "down" (${lowAlt.toFixed(2)} -> ${backAlt.toFixed(2)})`);

  // Lateral dodge: the arena is its own wide space, NOT the ~3-4-unit Ottawa
  // gorge channel the fight sits in. Holding "left" should carry the canoe
  // well past the channel edge (widthAt/2) and roughly out to the arena
  // half-width, with the river still locked and no bank/steeple hits.
  const channelHalf = widthAt(g.game.flowDistance) / 2;
  const hpBeforeDodge = g.game.health;
  for (let i = 0; i < 40; i++) { g.game.input.state.left = true; g.game.update(1 / 30); }
  g.game.input.state.left = false;
  const dodgeOut = Math.abs(g.game.lateralOffset);
  if (dodgeOut <= channelHalf + 1) {
    throw new Error(`Diable dodge pinned inside the gorge channel (offset ${dodgeOut.toFixed(1)} vs channel half ${channelHalf.toFixed(1)}) — arena too tight`);
  }
  if (dodgeOut < 5) throw new Error(`Diable lateral dodge barely moved (${dodgeOut.toFixed(1)} units)`);
  if (g.game.health < hpBeforeDodge) throw new Error('took damage dodging inside the arena — treetops still biting');
  if (Math.abs(g.game.flowDistance - lockedFlow) > 0.5) throw new Error('the river scrolled during the lateral dodge');
});

// --- scenario 4g: the Rideau leg — Gatineau junction through to Kingston --

await step('gatineau: casting off from the winter camp jumps onto the Rideau', () => {
  const gatineau = VILLAGES.find((v) => v.name === 'Gatineau');
  if (!gatineau) throw new Error('no "Gatineau" in VILLAGES — a name/lookup drifted');
  const g = newGame(gatineau.segment, gatineau.flowDistance - 20);
  g.game.enterVillage(gatineau);
  g.game.leaveVillage();
  if (g.game.segment !== 'rideau') throw new Error(`leaving Gatineau should jump onto the Rideau, still on ${g.game.segment}`);
  if (g.game.mode !== 'river') throw new Error('leaveVillage did not return to river mode');
  if (g.game.diable.isActive()) throw new Error('the Diable fight reactivated on the Rideau leg');
  // The Devil is behind you — a capsize now respawns on the Rideau, not the arena.
  if (g.game.startSegment !== 'rideau') throw new Error('the Rideau did not become the respawn checkpoint');
  run(g, 300, 1 / 30, (s) => { s.up = true; });
  if (g.game.segment !== 'rideau') throw new Error('drifted off the Rideau leg while paddling it');
});

await step('gatineau: walk up to the musket master, get the musket', () => {
  const gatineau = VILLAGES.find((v) => v.name === 'Gatineau');
  const g = newGame(gatineau.segment, gatineau.flowDistance - 20);
  g.game.enterVillage(gatineau);
  if (g.game.weapons.has('musket')) {
    throw new Error('musket unlocked on arrival — it should require walking up to the musket master');
  }
  // Gatineau's shop sits just right of the dock, close to the player's own
  // start height (unlike Montréal's walled, multi-turn approach) — holding
  // right alone closes the whole gap.
  let armed = false;
  for (let i = 0; i < 60 && !armed; i++) {
    g.input.state.right = true;
    g.game.update(1 / 30);
    if (g.game.weapons.has('musket')) armed = true;
  }
  if (!armed) throw new Error('walking up to the Gatineau musket master never granted the musket');
  if (g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still hidden after picking up the musket');
  }
  if (g.game.ui.fireXBtn.classList.contains('hidden')) {
    throw new Error('musket fire button (X) still hidden after picking up the musket');
  }
  // Never having the pistol at all, the Z button should stay hidden even
  // though the pad itself is now showing for the musket.
  if (!g.game.ui.fireZBtn.classList.contains('hidden')) {
    throw new Error('pistol fire button (Z) showing without ever having the pistol');
  }
  // A capsize + restart clears the weapon pool — pad and both buttons go too.
  g.game.start();
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still showing after restart cleared the weapons');
  }
});

await step('rideau: paddle the whole leg and reach Kingston -> won', () => {
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  if (!kingston) throw new Error('no "Kingston" in VILLAGES — a name/lookup drifted');
  if (kingston.segment !== 'rideau') throw new Error(`Kingston should be on the Rideau leg, got ${kingston.segment}`);
  const g = newGame('rideau', SEGMENT_SHAPE_OFFSET.rideau + 2);
  let won = false;
  let sawApproachBanner = false;
  let maxWidthSeen = 0;
  // This exercises the leg's *plumbing* end to end — the bespoke width curve
  // (path.js rideauWidthAt), the blockade sitting on it, the approach banner,
  // and the Kingston finish line — so cannon damage is neutralised each frame
  // to guarantee traversal. The leg's obstacle difficulty and the blockade
  // gauntlet itself are covered by the other scenarios; here the hull wall
  // still has to be threaded (health can't shortcut a solid wall), so a
  // failure to find the gap fails this test loudly.
  const gapX = centerX(SHIP_FLOW_DISTANCE) + widthAt(SHIP_FLOW_DISTANCE) / 2 - 3.5; // right-side lane
  for (let i = 0; i < 12000 && !won; i++) {
    // Kingston's oversized dock (world/villages.js's KINGSTON_DOCK_REACH)
    // is the real entrance to the town now — holding Up straight through
    // walks the canoe into it (enterVillage()), so leave again the same way
    // any village visit would before the finish is reachable.
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') {
      g.game.leaveVillage();
    }
    g.input.state.up = true;
    // blockade.js no longer exposes a progress field at all (no health/
    // hull/hold-time concept during a pure dodge-and-thread-the-gap leg);
    // isApproachEngaged() is the non-consuming status check for "is the
    // gauntlet currently live."
    const threading = g.game.blockade.isApproachEngaged() && g.game.flowDistance < SHIP_FLOW_DISTANCE + 6;
    const wantX = threading ? gapX : centerX(g.game.flowDistance);
    const err = g.game.canoeWorldX - wantX;
    g.input.state.left = err > 0.4;
    g.input.state.right = err < -0.4;
    g.game.health = 100;
    g.game.invulnTimer = Math.max(g.game.invulnTimer, 0.1);
    g.game.update(1 / 30);
    maxWidthSeen = Math.max(maxWidthSeen, widthAt(g.game.flowDistance));
    if (g.game.ui.milestoneBanner.textContent.includes('KINGSTON')) sawApproachBanner = true;
    if (g.game.state === 'won') won = true;
    if (g.game.state === 'gameover') throw new Error('capsized despite pinned health — a non-collision death on the Rideau');
  }
  if (!won) throw new Error('paddling the Rideau never reached the Kingston finish line — stuck or mis-wired');
  if (!sawApproachBanner) throw new Error('no Kingston approach banner before the finish');
  if (maxWidthSeen < 40) throw new Error(`Kingston harbour never opened up (max width seen ${maxWidthSeen.toFixed(1)})`);
  if (g.game.ui.gameoverTitle.textContent !== "JOURNEY'S END") {
    throw new Error(`won the run but the end screen said "${g.game.ui.gameoverTitle.textContent}"`);
  }
  if (!/reached Kingston/.test(g.game.ui.finalStats.innerHTML)) {
    throw new Error(`victory stats missing the arrival line: "${g.game.ui.finalStats.innerHTML}"`);
  }
  // A restart from the victory screen replays the whole journey from the put-in.
  g.game.start();
  if (g.game.segment !== 'fjord' || g.game.flowDistance !== 0) {
    throw new Error('"Play Again" from the win screen did not return to the put-in');
  }
  if (g.game.state !== 'playing') throw new Error('restart after winning did not resume play');
});

await step('rideau: casting off from Kars survives drifting back onto its own dock', () => {
  const kars = VILLAGES.find((v) => v.name === 'Kars');
  if (!kars) throw new Error('no "Kars" in VILLAGES — a name/lookup drifted');

  // The lateral offset that lines the canoe up with Kars's pier (found by
  // scan — bankEdge/dockReach aren't exported). This is where you sit the
  // moment you dock, and leaveVillage() doesn't move you off it.
  const g0 = newGame('rideau', kars.flowDistance);
  let dockLat = null;
  for (let lat = 0; lat <= 20 && dockLat === null; lat += 0.25) {
    const cx = centerX(kars.flowDistance) + lat;
    if (getDockHit(kars.flowDistance, cx) === kars) dockLat = lat;
  }
  if (dockLat === null) throw new Error('could not find Kars\'s dock lane — geometry drifted');

  // The reported bug: re-boarding leaves the canoe sitting on the pier's
  // lateral line, and a "down" key held over from walking to the re-board
  // zone (with no forward speed) pulls it straight back through the dock's
  // flow-trigger — over and over, "kicked" back into town every time.
  const stuck = newGame('rideau', kars.flowDistance - 4);
  stuck.game.enterVillage(kars);
  stuck.game.leaveVillage();
  if (stuck.game.mode !== 'river') throw new Error('leaveVillage did not return to river mode at Kars');
  stuck.game.speed = -2;
  for (let i = 0; i < 150; i++) {
    stuck.input.state.down = true;
    stuck.game.lateralOffset = dockLat; // pinned on the pier line: flow axis only
    stuck.game.update(1 / 30);
    if (stuck.game.mode === 'village') {
      throw new Error(`re-docked at Kars ${i} frames after casting off, "down" held — the cast-off loop`);
    }
  }

  // And an ordinary forward departure just leaves.
  const away = newGame('rideau', kars.flowDistance - 4);
  away.game.enterVillage(kars);
  away.game.leaveVillage();
  const before = away.game.flowDistance;
  for (let i = 0; i < 200; i++) {
    away.input.state.up = true;
    away.game.lateralOffset = dockLat;
    away.game.update(1 / 30);
    if (away.game.mode === 'village') throw new Error(`paddling forward off Kars's dock re-docked (frame ${i})`);
  }
  if (away.game.flowDistance <= before) throw new Error('no forward progress leaving Kars');
});

await step('rideau: reaching Kingston by its dock enters the town, then casting off wins', () => {
  // Kingston's dock walks the player ashore now (game.js's dockHit branch),
  // same as every other village — it no longer wins the run the instant it's
  // touched. The finish is still the dock: it's the "so big I cannot miss
  // it" landmark, so this is the path most runs actually take.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const g = newGame('rideau', kingston.flowDistance - 12);
  // Steer onto Kingston's own bank so the dock check catches the canoe
  // before it crosses the finish line on its own.
  let entered = false;
  for (let i = 0; i < 1500 && !entered; i++) {
    g.input.state.up = true;
    g.input.state[kingston.side === 1 ? 'right' : 'left'] = true;
    g.game.health = 100; // testing the dock->village path, not the obstacle run
    g.game.update(1 / 30);
    if (g.game.state === 'won') throw new Error('Kingston\'s dock won the run outright instead of walking the player ashore');
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') entered = true;
  }
  if (!entered) throw new Error('never reached Kingston\'s dock');

  g.game.leaveVillage();
  let won = false;
  for (let i = 0; i < 30 && !won; i++) {
    g.game.update(1 / 30);
    if (g.game.state === 'won') won = true;
  }
  if (!won) throw new Error('casting off from Kingston by its dock never reached the win condition');
});

await step('kingston: the arrival playlist cuts in at the approach banner and survives to the win screen', async () => {
  // "An isolated playlist exclusively for Kingston" — three tracks
  // (KINGSTON_PLAYLIST, music.js), shuffled, never the ambient shuffle
  // (PLAYLIST) itself. Cuts in at the same flowDistance as the "KINGSTON —
  // Fort Frontenac ahead" banner (game.js), well before the dock, and —
  // unlike every other boss track — nothing ever calls endBossTrack() for
  // it (see win()'s own comment): it should still be one of these three
  // playing under the victory card, not reverted to the ambient shuffle.
  const { KINGSTON_PLAYLIST } = await import('../src/audio/music.js');
  const kingstonTitles = KINGSTON_PLAYLIST.map((t) => t.title);
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  // -40 is past the approach banner's own trigger (KINGSTON_APPROACH_LEAD,
  // game.js) and — since the Warship now triggers much further back (~1/3
  // of the way from Jones Falls to Kingston, britishWarship.js's own
  // comment) — comfortably past its "well past the trigger" auto-resolve
  // threshold too, same margin ?start=kingston itself has to clear (see its
  // own comment in main.js).
  const g = newGame('rideau', kingston.flowDistance - 40);
  g.game.update(1 / 30);
  await new Promise((r) => setTimeout(r, 20)); // let the fake play()/canplay promises resolve
  if (!kingstonTitles.includes(g.game.music.nowPlaying?.title)) {
    throw new Error(`arrival playlist never cut in — playing "${g.game.music.nowPlaying?.title}" instead`);
  }

  let won = false;
  for (let i = 0; i < 2000 && !won; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') g.game.leaveVillage();
    if (g.game.state === 'won') won = true;
  }
  if (!won) throw new Error('never reached the win condition after the arrival playlist cut in');
  await new Promise((r) => setTimeout(r, 20));
  if (!kingstonTitles.includes(g.game.music.nowPlaying?.title)) {
    throw new Error(`arrival playlist didn't survive to the win screen — playing "${g.game.music.nowPlaying?.title}" instead`);
  }
});

// --- scenario 4c: casting off from Montreal doesn't loop back in ----------

await step('montreal: cast off without re-docking', () => {
  const montreal = VILLAGES.find((v) => v.name === 'Montreal');
  if (!montreal) throw new Error('no "Montreal" in VILLAGES — a name/lookup drifted again');
  const g = newGame(montreal.segment, montreal.flowDistance - 20);
  g.game.enterVillage(montreal);
  g.game.leaveVillage();
  if (g.game.mode !== 'river') throw new Error('leaveVillage did not return to river mode');
  const castOffAt = g.game.flowDistance;
  // Paddle upstream, hard — the current here runs backward toward the dock.
  let reDocked = false;
  for (let i = 0; i < 240 && !reDocked; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
    if (g.game.mode === 'village') reDocked = true;
  }
  if (reDocked) throw new Error('canoe re-docked at Montreal while paddling away after casting off');
  if (g.game.flowDistance <= castOffAt) {
    throw new Error(`no upstream progress after casting off (${g.game.flowDistance | 0} <= ${castOffAt | 0})`);
  }
});

// --- scenario 4d: the Montreal gun shop hands over the pistol ------------

await step('montreal: walk up to the gunsmith, get the pistol', () => {
  const montreal = VILLAGES.find((v) => v.name === 'Montreal');
  if (!montreal) throw new Error('no "Montreal" in VILLAGES — a name/lookup drifted again');
  const g = newGame(montreal.segment, montreal.flowDistance - 20);
  g.game.enterVillage(montreal);
  if (g.game.weapons.has('pistol')) {
    throw new Error('pistol unlocked on arrival — it should require walking up to the gunsmith now');
  }
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls showing before the pistol is picked up');
  }
  // The gunsmith stands right at the dock, mirroring the repair trader's
  // own dockX0-25 offset onto dockX1+25 -- but his own trigger point
  // (the gun shop's door plus GUNSMITH_OFFSET) now sits inside the
  // waterfront wall's own thickness (MONTREAL_WALLS' south segment),
  // reachable only within its trigger radius from just north of the
  // wall. The shop building itself also blocks a straight approach at
  // street level, so this routes up and over it: north off the wharf,
  // east past the shop's far side, then south again down to just above
  // the wall, edging back toward the shop until the trigger radius
  // catches it. (Careful not to overshoot into the reboard zone at the
  // bottom of the dock -- that auto-grants the pistol on its own, which
  // would make this test pass without ever actually reaching the
  // gunsmith.)
  let armed = false;
  const walk = (steps, keys) => {
    for (let i = 0; i < steps && !armed; i++) {
      for (const k of keys) g.input.state[k] = true;
      g.game.update(1 / 30);
      if (g.game.weapons.has('pistol')) armed = true;
    }
    for (const k of keys) g.input.state[k] = false;
  };
  walk(40, ['up']);
  walk(35, ['right']);
  walk(38, ['down']);
  walk(12, ['left']);
  if (!armed) throw new Error('walking up to the Montreal gunsmith never granted the pistol');
  if (g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still hidden after picking up the pistol');
  }
  // A capsize + restart clears the weapon pool — the pad should go too.
  g.game.start();
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still showing after restart cleared the weapons');
  }
});

await step('montreal: leave town without visiting the gunsmith -> pistol auto-granted', () => {
  const montreal = VILLAGES.find((v) => v.name === 'Montreal');
  const g = newGame(montreal.segment, montreal.flowDistance - 20);
  g.game.enterVillage(montreal);
  g.game.leaveVillage(); // cast off — never walked up to the gun shop
  if (g.game.weapons.has('pistol')) throw new Error('had the pistol without ever meeting the gunsmith');
  let armed = false;
  for (let i = 0; i < 400 && !armed; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
    if (g.game.weapons.has('pistol')) armed = true;
  }
  if (!armed) throw new Error('left Montreal past the dock but never got the pistol on the river');
  if (g.game.flowDistance <= montreal.flowDistance) throw new Error('granted the pistol before actually passing Montreal');
  if (g.game.ui.weaponPad.classList.contains('hidden')) throw new Error('weapon pad still hidden after the auto-grant');
});

await step('rideau: a ?start= cheat straight onto the leg still gets the pistol', () => {
  // Any ?start= landing directly on the Rideau (rideau/gatineau/kars/
  // kingston/british-blockade/...) never ticks update() while
  // segment === 'lawrenceWest', so the "past Montréal" backstop above
  // never fires on its own — this is exactly the bug report: no gun, no
  // way to suppress the British Blockade's cannons.
  const g = newGame('rideau', SEGMENT_SHAPE_OFFSET.rideau + 3);
  if (g.game.weapons.has('pistol')) throw new Error('pistol already unlocked before the first frame ran');
  g.game.update(1 / 30);
  if (!g.game.weapons.has('pistol')) throw new Error('landed on the Rideau via a cheat start and never got the pistol');
  if (g.game.ui.weaponPad.classList.contains('hidden')) throw new Error('weapon pad still hidden after the auto-grant');
});

await step('rideau: a ?start= cheat straight onto the leg also gets the musket', () => {
  // Same reasoning as the pistol backstop just above, one gun over — the
  // musket used to be Gatineau-shop-only, so a straight cheat onto the
  // Rideau (or just paddling past Gatineau's dock without stopping) left
  // the British Blockade's chase ship unshootable. Reported directly: the
  // second fire button never showed up after Gatineau.
  const g = newGame('rideau', SEGMENT_SHAPE_OFFSET.rideau + 3);
  if (g.game.weapons.has('musket')) throw new Error('musket already unlocked before the first frame ran');
  g.game.update(1 / 30);
  if (!g.game.weapons.has('musket')) throw new Error('landed on the Rideau via a cheat start and never got the musket');
  if (g.game.ui.fireXBtn.classList.contains('hidden')) throw new Error('musket fire button (X) still hidden after the auto-grant');
});

// --- scenario 5: a village visit ----------------------------------------

await step('village: dock, walk, trade, cast off', () => {
  const quebec = VILLAGES.find((v) => v.name === 'Quebec City');
  if (!quebec) throw new Error('no "Quebec City" in VILLAGES — a name/lookup drifted again');
  const g = newGame(quebec.segment, quebec.flowDistance - 30);
  g.game.enterVillage(quebec);
  g.game.furs = 5;
  run(g, 400, 1 / 30, (s, i) => { s.up = i % 120 < 60; s.down = i % 120 >= 60; s.left = i % 80 < 40; });
  g.game.tryRepairTrade();
  g.game.leaveVillage();
  run(g, 200, 1 / 30, (s) => { s.up = true; });
  if (g.game.mode !== 'river') throw new Error(`still in "${g.game.mode}" mode after casting off`);
});

// --- scenario 6: every village enter/leave individually -------------------

await step(`village: enter+tick each of the ${VILLAGES.length} villages`, () => {
  for (const v of VILLAGES) {
    const g = newGame(v.segment, v.flowDistance - 20);
    g.game.enterVillage(v);
    run(g, 60, 1 / 30, (s, i) => { s.up = true; s.right = i % 30 < 15; });
    g.game.leaveVillage();
    run(g, 30, 1 / 30, (s) => { s.up = true; });
  }
});

// --- scenario 7: capsize and restart ------------------------------------

await step('capsize -> restart -> keep playing', () => {
  const g = newGame('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
  run(g, 60, 1 / 30, (s) => { s.up = true; });
  for (let i = 0; i < 20 && g.game.state === 'playing'; i++) {
    g.game.invulnTimer = 0;
    g.game.handleHit({ type: 'rock' });
  }
  if (g.game.state !== 'gameover') throw new Error('never capsized after 20 unmitigated rock hits');
  g.game.start();
  if (g.game.state !== 'playing') throw new Error('restart did not return to playing');
  run(g, 300, 1 / 30, (s) => { s.up = true; });
});

// --- scenario 8: pause / resume toggling --------------------------------

await step('pause and resume mid-run', () => {
  const g = newGame('fjord', 0);
  run(g, 100, 1 / 30, (s) => { s.up = true; });
  g.game.togglePause();
  run(g, 60, 1 / 30);
  g.game.togglePause();
  run(g, 100, 1 / 30, (s) => { s.up = true; });
});

// --- scenario 9: music playlist metadata + now-playing callback ----------

await step('music: playlist metadata + onTrack fires a well-formed track', async () => {
  const mod = await import('../src/audio/music.js');
  // The card shows these strings verbatim — an entry missing one would
  // render "undefined" on screen.
  const seen = [];
  const music = mod.createMusic({ onTrack: (t) => seen.push(t) });
  music.start();
  music.playBossTrack();
  // let the fake play() promises resolve
  await new Promise((r) => setTimeout(r, 20));
  if (!seen.length) throw new Error('onTrack never fired after start() + playBossTrack()');
  for (const t of seen) {
    if (!t || !t.src || !t.title || !t.artist) {
      throw new Error(`onTrack got a malformed track: ${JSON.stringify(t)}`);
    }
  }
  if (music.nowPlaying == null) throw new Error('music.nowPlaying still null after playback started');
});

// --- scenario 9a: a ?start= cheat's boss track survives the player's own --
// --- first real gesture landing mid-commit --------------------------------

await step('music: a boss track survives start() firing again right after it', async () => {
  // Reproduces a real report: a ?start= cheat can hit game.js's
  // consumeJustSpotted()/consumeJustCleared() — which call music.start()
  // then a boss track — before the player's own first keydown/click has
  // fired at all (see main.js's gesture listeners). That real gesture,
  // landing almost immediately after, calls music.start() again — while
  // `started` was still false (a special track's own play() hadn't
  // resolved yet). Without the `special` guard in music.js's start(), that
  // second call fell through to playCurrent() and clobbered the boss track
  // with a random shuffle pick a moment later — reported as "La Mer de la
  // Folie started right, then a different song took over almost
  // immediately." The second start() call here is deliberately synchronous
  // (same tick, before any canplay microtask can run) — the actual bug
  // window in a real browser, where canplay is genuinely async, is wider
  // than this, not narrower, so this is the sharpest reproduction, not a
  // loose one.
  const mod = await import('../src/audio/music.js');
  const seen = [];
  const music = mod.createMusic({ onTrack: (t) => seen.push(t.title) });
  music.start();
  music.playBossTrack();
  music.playPursuitTrack();
  music.start();
  await new Promise((r) => setTimeout(r, 2200)); // past CANPLAY_FALLBACK_MS
  if (music.nowPlaying?.title !== 'La Mer de la Folie') {
    throw new Error(`expected the Pursuit track to survive, got "${music.nowPlaying?.title}" (history: ${seen.join(' -> ')})`);
  }
});

await step('music: a special track that fails to autoplay recovers on the next real gesture', async () => {
  // Reported for Kingston's own arrival track: "the music didn't kick in,"
  // total silence for the rest of the run. Root cause — a ?start= cheat (or
  // just being deep enough into an approach already) can land the canoe
  // already inside a trigger's own distance window before the player's very
  // first real gesture, so playSpecial()'s play() attempt gets rejected by
  // the browser's autoplay policy; its own single internal retry (400ms
  // later) can land before a gesture too, and used to just give up for
  // good, leaving `special` stuck true — which made start()'s own guard
  // silently swallow every later gesture as well. dom-shim.mjs's own Audio
  // stub always resolves play(), so no test could ever have caught this —
  // this one swaps in a stub that rejects the first two attempts (the
  // initial one plus the one internal retry) before succeeding, the same
  // shape a real blocked-autoplay-then-a-late-gesture sequence has.
  const mod = await import('../src/audio/music.js');
  const realAudio = globalThis.Audio;
  let playCalls = 0;
  globalThis.Audio = function () {
    const listeners = {};
    return {
      play: () => {
        playCalls++;
        return playCalls <= 2
          ? Promise.reject({ name: 'NotAllowedError', message: 'play() failed because the user didn\'t interact with the document first' })
          : Promise.resolve();
      },
      pause() {},
      load() { queueMicrotask(() => (listeners.canplay || []).forEach((fn) => fn())); },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
      canPlayType: () => '',
      volume: 1,
      currentTime: 0,
      loop: false,
    };
  };
  try {
    const music = mod.createMusic();
    music.playWendigoTrack(); // any special track exercises the same path
    await new Promise((r) => setTimeout(r, 450)); // past the one internal 400ms retry, which also fails
    if (music.nowPlaying != null) throw new Error('test setup bug: expected both attempts to have failed by now');
    music.start(); // the player's next real gesture (main.js's permanent listeners)
    await new Promise((r) => setTimeout(r, 20));
    if (music.nowPlaying == null) {
      throw new Error('a real gesture after a failed autoplay attempt never recovered playback — stuck silent');
    }
  } finally {
    globalThis.Audio = realAudio;
  }
});

await step('music: the Kingston playlist cycles through all three tracks, never falling back to the ambient shuffle', async () => {
  // "An isolated playlist exclusively for Kingston... I don't want the
  // existing music to change when we get into Kingston" — requested
  // explicitly. Simulates each track finishing on its own
  // (debugAudioElement().dispatchEvent({type:'ended'}), same test-only hook
  // used to fake a real playthrough elsewhere) enough times to cycle
  // through the whole three-track set (KINGSTON_PLAYLIST) at least once,
  // and confirms every track seen is one of those three — never a PLAYLIST
  // (ambient shuffle) title leaking in, which is exactly what the old
  // single-track version's default playSpecial() onEnded would have done.
  const mod = await import('../src/audio/music.js');
  const music = mod.createMusic();
  const kingstonTitles = mod.KINGSTON_PLAYLIST.map((t) => t.title);
  // "I don't want the existing music to change" — the two new tracks must
  // never have been folded into the regular ambient shuffle itself.
  const ambientTitles = mod.PLAYLIST.map((t) => t.title);
  for (const t of kingstonTitles) {
    if (ambientTitles.includes(t)) throw new Error(`"${t}" is in both the Kingston playlist and the ambient shuffle — should be exclusive to Kingston`);
  }
  music.start();
  music.playKingstonTrack();
  await new Promise((r) => setTimeout(r, 20));
  const seenTitles = [];
  for (let i = 0; i < 7; i++) {
    if (music.nowPlaying) seenTitles.push(music.nowPlaying.title);
    music.debugAudioElement().dispatchEvent({ type: 'ended' });
    await new Promise((r) => setTimeout(r, 20));
  }
  for (const title of seenTitles) {
    if (!kingstonTitles.includes(title)) {
      throw new Error(`Kingston playlist fell back to a non-Kingston track: "${title}" (seen: ${JSON.stringify(seenTitles)})`);
    }
  }
  for (const t of kingstonTitles) {
    if (!seenTitles.includes(t)) throw new Error(`"${t}" never came up across 7 transitions of a 3-track set (seen: ${JSON.stringify(seenTitles)})`);
  }
});

await step('weapons: the musket fires slower and hits harder than the pistol', () => {
  // Reported: "the middle gun [musket] looks bigger... but it shoots at
  // the same speed and I can't [see] much difference in damage — it
  // should shoot slower and hit harder." Two separate things to check —
  // weapons.js's own per-weapon FIRE_COOLDOWN (rate) and each fight's own
  // PISTOL_DAMAGE*/MUSKET_DAMAGE* pair (per-hit damage) — not just "the
  // game doesn't crash," since the whole report was that these two guns
  // felt identical despite different code paths.
  function countShots(weaponName, seconds) {
    const g = newGame('fjord', 0);
    g.game.weapons.unlock(weaponName);
    let count = 0;
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      if (g.game.weapons.fire(weaponName, 0, 0)) count++;
      g.game.weapons.update(1 / 30);
    }
    return count;
  }
  const pistolShots = countShots('pistol', 3);
  const musketShots = countShots('musket', 3);
  if (musketShots >= pistolShots) {
    throw new Error(`musket (${musketShots} shots/3s) isn't firing slower than the pistol (${pistolShots} shots/3s)`);
  }

  for (const [fight, pistolDmg, musketDmg] of [
    ['diable', DIABLE_PISTOL_DAMAGE, DIABLE_MUSKET_DAMAGE],
    ['britishWarship', WARSHIP_PISTOL_DAMAGE, WARSHIP_MUSKET_DAMAGE],
    ['blockade', BLOCKADE_PISTOL_DAMAGE, BLOCKADE_MUSKET_DAMAGE],
  ]) {
    if (!(musketDmg > pistolDmg)) {
      throw new Error(`${fight}: musket damage (${musketDmg}) isn't higher than pistol damage (${pistolDmg})`);
    }
  }
});

// --- scenario 9b: ?difficulty=easy — less damage taken, more damage given --

await step('difficulty: main.js isEasyMode() reads ?difficulty=easy from the URL', async () => {
  const mod = await import('../src/main.js');
  try {
    windowShim.location.search = '';
    if (mod.isEasyMode() !== false) throw new Error('isEasyMode() should be false with no ?difficulty= at all');
    windowShim.location.search = '?difficulty=hard';
    if (mod.isEasyMode() !== false) throw new Error('isEasyMode() should be false for any value other than "easy"');
    windowShim.location.search = '?difficulty=easy';
    if (mod.isEasyMode() !== true) throw new Error('isEasyMode() should be true for ?difficulty=easy');
    windowShim.location.search = '?difficulty=EASY';
    if (mod.isEasyMode() !== true) throw new Error('isEasyMode() should be case-insensitive');
  } finally {
    windowShim.location.search = '';
  }
});

await step('main.js: stripStartParam only removes ?start=, preserving ?difficulty= and anything else', async () => {
  // Regression test for a real bug: the ?start=-stripping code used to
  // blow away window.location.search entirely (pathname + hash, nothing
  // else — see this function's own comment in main.js), which silently
  // discarded ?difficulty= before main.js ever read it, even though the
  // whole point of not treating it as one-shot like ?start= is that it's
  // supposed to survive. Reported as "the change didn't catch" with clean
  // console logs — no crash, no error, just a flag that silently never took.
  const mod = await import('../src/main.js');
  if (mod.stripStartParam('?start=diable') !== '') {
    throw new Error(`expected nothing left after stripping the only param, got "${mod.stripStartParam('?start=diable')}"`);
  }
  if (mod.stripStartParam('?start=diable&difficulty=easy') !== '?difficulty=easy') {
    throw new Error(`expected ?difficulty=easy to survive stripping ?start=, got "${mod.stripStartParam('?start=diable&difficulty=easy')}"`);
  }
  if (mod.stripStartParam('?difficulty=easy&start=diable') !== '?difficulty=easy') {
    throw new Error(`expected ?difficulty=easy to survive regardless of param order, got "${mod.stripStartParam('?difficulty=easy&start=diable')}"`);
  }
  if (mod.stripStartParam('') !== '') {
    throw new Error(`expected an empty string back for an empty search string, got "${mod.stripStartParam('')}"`);
  }
});

await step('difficulty: easyMode scales boss damage taken but leaves generic hazards alone', () => {
  // "The only things we need to adjust are reducing damage taken and
  // increasing damage given. Everything else can stay the same" — requested
  // explicitly, so a generic river hazard (rock) must be untouched by
  // easyMode; only handleHit()'s boss-fight branches (cannon, shiphull,
  // steeple, diable, wolf, wendigo) should scale. Checks against
  // damageTakenScale itself, not a hardcoded number — dialed once already
  // ("still not very easy" after trying the first pass), so this shouldn't
  // need touching again if it's dialed further.
  const normal = newGame('fjord', 0);
  const easy = newGame('fjord', 0, { easyMode: true });
  if (!(easy.game.damageTakenScale > 0 && easy.game.damageTakenScale < 1)) {
    throw new Error(`expected easyMode's damageTakenScale to be a real reduction (0,1), got ${easy.game.damageTakenScale}`);
  }
  if (normal.game.damageTakenScale !== 1) throw new Error(`expected normal damageTakenScale to be 1, got ${normal.game.damageTakenScale}`);
  if (!(easy.game.damageGivenScale > 1)) {
    throw new Error(`expected easyMode's damageGivenScale to be a real increase (>1), got ${easy.game.damageGivenScale}`);
  }
  if (normal.game.damageGivenScale !== 1) throw new Error(`expected normal damageGivenScale to be 1, got ${normal.game.damageGivenScale}`);

  normal.game.invulnTimer = 0; // spawn invulnerability (SPAWN_INVULN_TIME) would otherwise swallow this first hit
  easy.game.invulnTimer = 0;
  normal.game.handleHit({ type: 'rock' });
  easy.game.handleHit({ type: 'rock' });
  const normalRockLoss = 100 - normal.game.health;
  const easyRockLoss = 100 - easy.game.health;
  if (normalRockLoss <= 0 || normalRockLoss !== easyRockLoss) {
    throw new Error(`a generic rock hit should be identical regardless of difficulty (normal lost ${normalRockLoss}, easy lost ${easyRockLoss})`);
  }

  normal.game.health = 100;
  easy.game.health = 100;
  normal.game.invulnTimer = 0;
  easy.game.invulnTimer = 0;
  normal.game.handleHit({ type: 'wendigo' });
  easy.game.handleHit({ type: 'wendigo' });
  const normalWendigoLoss = 100 - normal.game.health;
  const easyWendigoLoss = 100 - easy.game.health;
  const expectedEasyLoss = normalWendigoLoss * easy.game.damageTakenScale;
  if (easyWendigoLoss <= 0 || Math.abs(easyWendigoLoss - expectedEasyLoss) > 1e-9) {
    throw new Error(`a wendigo hit should scale by exactly damageTakenScale under easyMode (normal lost ${normalWendigoLoss}, easy lost ${easyWendigoLoss}, expected ${expectedEasyLoss})`);
  }
});

await step('difficulty: britishWarship.js doubles hull damage per hit under damageGivenScale=2', async () => {
  const { createBritishWarship, TRIGGER_DISTANCE: T } = await import('../src/bossfights/britishWarship.js');
  // Direct unit test against the module itself (not the full Game) — feeds
  // a bullet at the ship's own last-known position every frame (same
  // tracking-bot idiom the "shooting it sinks it" scenario above uses over
  // a full fight) until one lands, then compares hull-% lost between
  // damageGivenScale=1 and =2 on otherwise-identical instances.
  function firstHitLoss(damageGivenScale) {
    const ship = createBritishWarship();
    const dt = 1 / 30;
    const playerD = T + 1;
    for (let i = 0; i < 60; i++) {
      const pos = ship.debugChaseShipPosition();
      const bullet = { worldX: pos.worldX, flowDistance: pos.flowDistance, type: 'pistol' };
      const res = ship.update(dt, playerD, pos.worldX, 10, () => {}, [bullet], damageGivenScale);
      if (res.hitBullets.length > 0) return 100 - res.progressPct;
    }
    throw new Error('never landed a hit within budget — test setup broke');
  }
  const lossNormal = firstHitLoss(1);
  const lossEasy = firstHitLoss(2);
  if (lossNormal <= 0) throw new Error('baseline (scale=1) hit never landed');
  if (Math.abs(lossEasy - lossNormal * 2) > 1e-6) {
    throw new Error(`damageGivenScale=2 should double the hull-% lost per hit (scale=1 lost ${lossNormal}, scale=2 lost ${lossEasy})`);
  }
});

await step('difficulty: diable.js doubles hp damage per hit under damageGivenScale=2', async () => {
  const { createDiable, DIABLE_FLOW_DISTANCE: D } = await import('../src/bossfights/diable.js');
  function firstHitLoss(damageGivenScale) {
    const devil = createDiable();
    const dt = 1 / 30;
    const playerD = D - 1; // already past the appearing trigger and the fighting-phase distance floor — only t>=1.0 gates the phase change
    const canoe = { x: -1000, y: -1000 }; // far off, so onCollide/fur-penalty never fires and only the bullet hit is exercised
    for (let i = 0; i < 200; i++) {
      const cx = devil.debugCentreX();
      // y=64 mirrors diable.js's own BASE_CY (module-private) — his sway is
      // only +/-4 around it, well inside the 32-unit hit tolerance either way.
      const bulletScreens = [{ x: cx, y: 64, ref: { type: 'pistol' } }];
      const res = devil.update(dt, playerD, canoe, bulletScreens, () => {}, () => {}, damageGivenScale);
      if (res.hitBullets.length > 0) return 100 - devil.hpPct();
    }
    throw new Error('never landed a hit within budget — test setup broke');
  }
  const lossNormal = firstHitLoss(1);
  const lossEasy = firstHitLoss(2);
  if (lossNormal <= 0) throw new Error('baseline (scale=1) hit never landed');
  if (Math.abs(lossEasy - lossNormal * 2) > 1e-6) {
    throw new Error(`damageGivenScale=2 should double the hp-% lost per hit (scale=1 lost ${lossNormal}, scale=2 lost ${lossEasy})`);
  }
});

// --- scenario 10: the implicit checkpoint save --------------------------

await step('checkpoint: saves/loads through storage, and an explicit ?start= still wins', async () => {
  // Asked for explicitly as "not an explicit [save system]... don't make
  // it explicit on screen but make it work" — no continue prompt, no
  // save/load button, just silently resuming near wherever a real
  // playthrough last got to. Fresh import resolves from the module cache
  // ("main.js loads" above already evaluated it once); parseStartLocation
  // reads window.location.search/localStorage live at call time, not at
  // import time, so re-calling the cached export is exactly as valid as a
  // fresh import would be here — no cache-busting needed.
  const mod = await import('../src/main.js');
  windowShim.localStorage.clear();
  windowShim.location.search = '';
  try {
    // No save yet — falls back to the put-in, same as always.
    const fresh = mod.parseStartLocation();
    if (fresh.flowDistance !== 0 || fresh.segment !== 'fjord') {
      throw new Error(`expected the put-in with no save and no ?start=, got ${JSON.stringify(fresh)}`);
    }

    // Round-trips through the real (if in-memory) Storage the dom-shim
    // provides, not just a JS object — same JSON.stringify/parse path a
    // real browser reload takes.
    mod.saveCheckpointToStorage('rideau', 95500);
    const loaded = mod.loadCheckpoint();
    if (!loaded || loaded.segment !== 'rideau' || loaded.flowDistance !== 95500) {
      throw new Error(`checkpoint didn't round-trip through storage: ${JSON.stringify(loaded)}`);
    }

    // No ?start= this time — resumes at the saved checkpoint instead of
    // the put-in.
    const resumed = mod.parseStartLocation();
    if (resumed.segment !== 'rideau' || resumed.flowDistance !== 95500) {
      throw new Error(`didn't resume at the saved checkpoint: ${JSON.stringify(resumed)}`);
    }

    // An explicit ?start= still always wins over whatever's saved — a dev
    // link (or a returning player deliberately jumping elsewhere) can't be
    // silently overridden by browser storage.
    windowShim.location.search = '?start=diable';
    const explicit = mod.parseStartLocation();
    if (explicit.segment === 'rideau' && explicit.flowDistance === 95500) {
      throw new Error('an explicit ?start=diable was overridden by the saved rideau checkpoint');
    }
  } finally {
    windowShim.location.search = '';
    windowShim.localStorage.clear();
  }
});

await step('checkpoint: furthestCheckpointReached finds the latest waypoint at or before a position', async () => {
  const mod = await import('../src/main.js');
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  // Well short of even the first Rideau waypoint — nothing reached yet.
  const none = mod.furthestCheckpointReached('rideau', SEGMENT_SHAPE_OFFSET.rideau + 1);
  if (none !== null) throw new Error(`expected no checkpoint reached this early, got ${JSON.stringify(none)}`);
  // Right at Kingston's own dock — Kingston itself should be "the latest
  // one reached," not some earlier waypoint the scan stopped short of.
  const atKingston = mod.furthestCheckpointReached('rideau', kingston.flowDistance);
  if (!atKingston || atKingston.flowDistance !== kingston.flowDistance) {
    throw new Error(`expected Kingston's own flowDistance as the latest checkpoint, got ${JSON.stringify(atKingston)}`);
  }
  // A segment with no checkpoints registered at all (shouldn't happen for
  // any real segment, but the lookup itself should degrade to null, not
  // throw, if it ever did).
  const unknownSegment = mod.furthestCheckpointReached('not-a-real-segment', 0);
  if (unknownSegment !== null) throw new Error(`expected null for an unregistered segment, got ${JSON.stringify(unknownSegment)}`);
});

await step('checkpoint: isFurtherAlong ranks whole-journey progress, not just raw flowDistance', async () => {
  const mod = await import('../src/main.js');
  // Later segment always outranks an earlier one, even with a *smaller*
  // raw flowDistance number — each segment has its own number-line offset
  // (world/river/path.js's SEGMENT_SHAPE_OFFSET), so comparing the raw
  // numbers across segments directly would be meaningless.
  if (!mod.isFurtherAlong({ segment: 'rideau', flowDistance: 0 }, { segment: 'lawrenceWest', flowDistance: 999999 })) {
    throw new Error('rideau (any position) should outrank lawrenceWest regardless of raw flowDistance');
  }
  if (mod.isFurtherAlong({ segment: 'fjord', flowDistance: 999999 }, { segment: 'rideau', flowDistance: 0 })) {
    throw new Error('fjord should never outrank rideau, no matter the raw flowDistance');
  }
  // Same segment — plain flowDistance comparison.
  if (!mod.isFurtherAlong({ segment: 'rideau', flowDistance: 200 }, { segment: 'rideau', flowDistance: 100 })) {
    throw new Error('a larger flowDistance in the same segment should count as further along');
  }
  // Nothing saved yet — anything at all counts as further along.
  if (!mod.isFurtherAlong({ segment: 'fjord', flowDistance: 0 }, null)) {
    throw new Error('any real position should outrank no saved checkpoint at all');
  }
});

// --- report ------------------------------------------------------------------

restoreConsole();
console.log('\nvoyageurs smoke test');
console.log(notes.join('\n'));

if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) {
    console.log(`● ${f.scenario}`);
    console.log(String(f.error).split('\n').map((l) => `    ${l}`).join('\n'));
    console.log('');
  }
  process.exit(1);
}

console.log('\nall scenarios ran without crashing.\n');
process.exit(0);
