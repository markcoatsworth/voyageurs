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

const { CANVAS_WIDTH, CANVAS_HEIGHT } = await import('../src/shared/config.js');
const { Game } = await import('../src/core/game.js');
const { Input } = await import('../src/core/input.js');
const { createObstacleField } = await import('../src/world/obstacles.js');
const { createMinimap } = await import('../src/world/minimap.js');
const { createMusic } = await import('../src/audio/music.js');
const { createTouchControls } = await import('../src/core/touchControls.js');
const { VILLAGES } = await import('../src/world/river/route.js');
const { SEGMENT_SHAPE_OFFSET, MOUTH_DISTANCE } = await import('../src/world/river/path.js');
const { SHIP_FLOW_DISTANCE } = await import('../src/bossfights/blockade.js');
const { TRIGGER_DISTANCE: CHASSE_GALERIE_FLOW_DISTANCE } = await import('../src/bossfights/chasseGalerie.js');

function makeUi(minimap) {
  const el = (id) => makeElement(id);
  return {
    hud: el('hud'), hudScore: el('hud-score'), hudSpeedFill: el('speed'),
    hudHealthFill: el('health'), hudBlockade: el('blk'), hudBlockadeFill: el('blkfill'),
    damageFlash: el('flash'), titleScreen: el('title'), gameoverScreen: el('over'),
    finalStats: el('stats'), restartBtn: el('restart'), pauseScreen: el('pause'),
    milestoneBanner: el('banner'), minimap,
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

// --- scenario 4: the blockade boss fight, start to escape ------------------

await step('blockade: approach -> pursuit -> escape', () => {
  const g = newGame('lawrenceWest', SHIP_FLOW_DISTANCE - 80);
  let sawFight = false;
  for (let i = 0; i < 6000; i++) {
    g.input.state.up = true;
    g.input.state.left = i % 180 < 90;
    g.input.state.right = i % 180 >= 90;
    g.game.update(1 / 30);
    if (g.game.blockadePct !== null) sawFight = true;
    if (g.game.state === 'gameover') { g.game.start(); }
  }
  if (!sawFight) throw new Error('blockade never activated across the whole approach');
  notes.push(`  note blockade ran; ended segment ${g.game.segment} @ ${g.game.flowDistance | 0}`);
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

  const g = newGame('lawrenceWest', CHASSE_GALERIE_FLOW_DISTANCE - 10);
  let sawFlight = false;
  let maxAltitude = 0;
  let landedMidFlight = false;
  let completed = false;
  for (let i = 0; i < 12000 && !completed; i++) {
    flyThrough(g.game, g.input);
    g.game.update(1 / 30);
    if (g.game.chasseGalerie.isActive()) {
      sawFlight = true;
      maxAltitude = Math.max(maxAltitude, g.game.chasseGalerie.getAltitude());
      if (g.game.mode === 'village') landedMidFlight = true;
    }
    // Flew the whole storm and came back down onto the water past the towns.
    if (sawFlight && !g.game.chasseGalerie.isActive()
      && g.game.flowDistance > CHASSE_GALERIE_FLOW_DISTANCE + 700) {
      completed = true;
    }
    if (g.game.state === 'gameover') g.game.start();
  }
  if (!sawFlight) throw new Error('chasse-galerie never took flight from the ?start= drop point');
  if (maxAltitude < 4) throw new Error(`canoe never really left the water (max altitude ${maxAltitude.toFixed(1)})`);
  if (landedMidFlight) throw new Error('canoe docked at a riverbank town mid-flight — there should be no landing');
  if (!completed) throw new Error('a thread-following pilot could never clear the gorge — too hard / unfair');
  if (g.game.chasseGalerie.getAltitude() > 0.5) throw new Error('canoe never glided back down onto the water');

  // The steeples are the fight now: flying a dead-straight line (no steering
  // at all) plows into a church within seconds — no free lane down the middle.
  const s = newGame('lawrenceWest', CHASSE_GALERIE_FLOW_DISTANCE - 10);
  let straightLineDamage = false;
  for (let i = 0; i < 2400 && !straightLineDamage; i++) {
    s.input.state.up = true; // no steering
    const hpBefore = s.game.health;
    s.game.update(1 / 30);
    if (s.game.chasseGalerie.isActive() && s.game.health < hpBefore) straightLineDamage = true;
    if (s.game.state === 'gameover') break;
  }
  if (!straightLineDamage) throw new Error('flying a straight line through the storm took no damage — too easy');

  notes.push(`  note chasse-galerie ran; max altitude ${maxAltitude.toFixed(1)}, completed the storm`);
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

await step('village: enter+tick each of the 19 villages', () => {
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
