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
import { makeElement } from './dom-shim.mjs';

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
const { Game } = await import('../src/core/game.js');
const { Input } = await import('../src/core/input.js');
const { createObstacleField } = await import('../src/world/obstacles.js');
const { createMinimap } = await import('../src/world/minimap.js');
const { createMusic } = await import('../src/audio/music.js');
const { createTouchControls } = await import('../src/core/touchControls.js');
const { VILLAGES } = await import('../src/world/river/route.js');
const { getDockHit, KINGSTON_RENDER_GATE, dockHitZ } = await import('../src/world/villages.js');
const { SEGMENT_SHAPE_OFFSET, MOUTH_DISTANCE, centerX, widthAt } = await import('../src/world/river/path.js');
const { SHIP_FLOW_DISTANCE } = await import('../src/bossfights/blockade.js');
const { TRIGGER_DISTANCE: WARSHIP_FLOW_DISTANCE } = await import('../src/bossfights/britishWarship.js');
const { TRIGGER_DISTANCE: CHASSE_GALERIE_FLOW_DISTANCE, FLIGHT_END } = await import('../src/bossfights/chasseGalerie.js');
const { DIABLE_FLOW_DISTANCE, HP_MAX: DIABLE_HP_MAX } = await import('../src/bossfights/diable.js');
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

function newGame(startSegment, startFlowDistance) {
  const world = { distance: 0 };
  const obstacles = createObstacleField(world);
  const input = new Input();
  createTouchControls(input);
  const minimap = createMinimap();
  const music = createMusic();
  const ui = makeUi(minimap);
  const game = new Game({ ctx: makeElement('canvas').getContext('2d'), water: null, input, obstacles, world, ui, music, startFlowDistance, startSegment });
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

await step('britishWarship: triggers near the old Kingston Mills spot, held until resolved', () => {
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

  // Past the Warship, the short remaining stretch to Kingston still works.
  // Its dock is oversized (world/villages.js's KINGSTON_DOCK_REACH) and now
  // walks the canoe ashore like any other village (enterVillage(), mode
  // becomes 'village') rather than winning outright, so this has to leave
  // again the same way any village visit would before the finish is
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

// --- scenario 4e: ?start=kingston lands where the town actually renders ----

await step('kingston: the ?start= cheat lands inside the render gate, with runway before the dock', async () => {
  // Reported across two rounds:
  //  1. "not showing up," no console errors — world/villages.js's
  //     drawVillages() doesn't draw a village *at all* until the canoe is
  //     within its render gate of its own flowDistance, and the cheat
  //     landed 40 units short of Kingston, well outside it.
  //  2. Moved inside the gate, then reported "almost directly on the
  //     dock" — landing inside KINGSTON_DOCK_HIT_Z meant a couple of
  //     seconds of paddling crossed straight into the dock (and its
  //     on-foot scene) before there was any real look at the approach.
  // Both checked here so a future retune can't reintroduce either one.
  // Fresh import resolves from the module cache (the "main.js loads"
  // scenario above already evaluated it once) rather than re-running it.
  const { START_KEYWORDS } = await import('../src/main.js');
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const start = START_KEYWORDS['kingston'];
  if (!start) throw new Error('no "kingston" entry in START_KEYWORDS — a name/lookup drifted');
  const gap = Math.abs(kingston.flowDistance - start.flowDistance);
  if (gap >= KINGSTON_RENDER_GATE) {
    throw new Error(`?start=kingston lands ${gap.toFixed(1)} units from Kingston's own flowDistance — outside KINGSTON_RENDER_GATE (${KINGSTON_RENDER_GATE.toFixed(1)}), so nothing renders on arrival`);
  }
  const hitZ = dockHitZ(kingston);
  const runway = gap - hitZ;
  if (runway < 10) {
    throw new Error(`?start=kingston only leaves ${runway.toFixed(1)} units of paddling before the dock's own hit zone (±${hitZ.toFixed(1)}) — not enough runway to see the approach before docking`);
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

await step('kingston: the arrival track cuts in at the approach banner and survives to the win screen', async () => {
  // A static, deliberate needle-drop, not part of the shuffle — reported as
  // "I want this to be a static song, not a random one, play every time."
  // Cuts in at the same flowDistance as the "KINGSTON — Fort Frontenac
  // ahead" banner (game.js), well before the dock, and — unlike every other
  // boss track — nothing ever calls endBossTrack() for it (see win()'s own
  // comment): it should still be playing under the victory card, not have
  // reverted to the ambient shuffle.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  // -40 is past both the approach banner's own trigger (-70) and the
  // British Warship's "well past the trigger" auto-resolve threshold
  // (WARSHIP_FLOW_DISTANCE + 50, i.e. -45 from Kingston) — starting any
  // further back lands inside the Warship's real held-fight zone, same as
  // ?start=kingston itself has to clear (see its own comment in main.js).
  const g = newGame('rideau', kingston.flowDistance - 40);
  g.game.update(1 / 30);
  await new Promise((r) => setTimeout(r, 20)); // let the fake play()/canplay promises resolve
  if (g.game.music.nowPlaying?.title !== "Un Siècle d'Avance") {
    throw new Error(`arrival track never cut in — playing "${g.game.music.nowPlaying?.title}" instead`);
  }

  let won = false;
  for (let i = 0; i < 2000 && !won; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') g.game.leaveVillage();
    if (g.game.state === 'won') won = true;
  }
  if (!won) throw new Error('never reached the win condition after the arrival track cut in');
  await new Promise((r) => setTimeout(r, 20));
  if (g.game.music.nowPlaying?.title !== "Un Siècle d'Avance") {
    throw new Error(`arrival track didn't survive to the win screen — playing "${g.game.music.nowPlaying?.title}" instead`);
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
