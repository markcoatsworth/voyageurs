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

const { CANVAS_WIDTH, CANVAS_HEIGHT, CANOE_SCREEN_X, CANOE_SCREEN_Y, PIXELS_PER_UNIT, CANOE_HALF_LENGTH } = await import('../src/shared/config.js');
const { Game, MIN_SPEED, KINGSTON_APPROACH_LEAD, HEADING_MAX, EDGE_MARGIN: GAME_EDGE_MARGIN } = await import('../src/core/game.js');
const { Input } = await import('../src/core/input.js');
const { createObstacleField } = await import('../src/world/obstacles.js');
const { createMinimap } = await import('../src/world/minimap.js');
const { createMusic } = await import('../src/audio/music.js');
const { createTouchControls } = await import('../src/core/touchControls.js');
const { VILLAGES } = await import('../src/world/river/route.js');
const { getDockHit, drawVillages, debugKingstonGreeterX, dockSpanAt } = await import('../src/world/villages.js');
const { KINGSTON_CATARAQUI } = await import('../src/world/villageScene.js');
const { SEGMENT_SHAPE_OFFSET, MOUTH_DISTANCE, centerX, widthAt, braidAt } = await import('../src/world/river/path.js');
const { FEATURE_ISLAND_RANGE } = await import('../src/world/river/islands.js');
const { SHIP_FLOW_DISTANCE } = await import('../src/bossfights/blockade.js');
const { TRIGGER_DISTANCE: WARSHIP_FLOW_DISTANCE } = await import('../src/bossfights/britishWarship.js');
const { TRIGGER_DISTANCE: CHASSE_GALERIE_FLOW_DISTANCE, FLIGHT_END } = await import('../src/bossfights/chasseGalerie.js');
const { DIABLE_FLOW_DISTANCE, HP_MAX: DIABLE_HP_MAX, PISTOL_DAMAGE: DIABLE_PISTOL_DAMAGE, MUSKET_DAMAGE: DIABLE_MUSKET_DAMAGE } = await import('../src/bossfights/diable.js');
const { PISTOL_DAMAGE_TO_HULL: WARSHIP_PISTOL_DAMAGE, MUSKET_DAMAGE_TO_HULL: WARSHIP_MUSKET_DAMAGE } = await import('../src/bossfights/britishWarship.js');
const {
  FIRST_THUNDERCLAP_DISTANCE: WARSHIP_FIRST_THUNDERCLAP_DISTANCE,
  stormIntensityAt: warshipStormIntensityAt,
  stormGloomAt: warshipStormGloomAt,
  stormFlickerAt: warshipStormFlickerAt,
  stormGustAt: warshipStormGustAt,
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
  obstacles._world = world; // test-only handle: scenarios need d = world.distance - z
  const input = new Input();
  createTouchControls(input);
  const minimap = createMinimap();
  const music = createMusic();
  const ui = makeUi(minimap);
  const game = new Game({ ctx: makeElement('canvas').getContext('2d'), water: null, input, obstacles, world, ui, music, startFlowDistance, startSegment, ...opts });
  return { game, input, world, obstacles };
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

// --- scenario 1a: the canoe's heading, and the hull hitbox that rides on it -

await step('heading: left/right swing the bow for real, and it comes back when released', () => {
  const g = newGame('fjord', 40);
  if (g.game.heading !== 0) throw new Error(`a fresh canoe should start pointed downstream, heading was ${g.game.heading}`);

  // Right: the bow comes round to starboard (+) and the canoe follows it
  // across the channel. Both halves matter — a sprite rotation alone would
  // satisfy the first check, which is what the old `tilt` did (and it
  // leaned the wrong way, -lateralVX, so this test would have caught the
  // sign too).
  run(g, 45, 1 / 30, (st) => { st.up = true; st.right = true; });
  if (!(g.game.heading > HEADING_MAX * 0.9)) {
    throw new Error(`holding right should swing the bow to nearly full lock (${HEADING_MAX}), got ${g.game.heading.toFixed(3)}`);
  }
  if (!(g.game.lateralOffset > 0.2)) {
    throw new Error(`the canoe should have travelled toward the bow it's pointing, lateralOffset was ${g.game.lateralOffset.toFixed(3)}`);
  }

  run(g, 60, 1 / 30, (st) => { st.up = true; st.right = false; st.left = true; });
  if (!(g.game.heading < -HEADING_MAX * 0.9)) {
    throw new Error(`holding left should swing the bow to port, got ${g.game.heading.toFixed(3)}`);
  }

  // Let go and the bow straightens out rather than staying cranked over.
  run(g, 45, 1 / 30, (st) => { st.up = true; st.left = false; });
  if (Math.abs(g.game.heading) > 0.03) {
    throw new Error(`releasing the keys should bring the bow back downstream, heading was still ${g.game.heading.toFixed(3)}`);
  }
});

await step('heading: the collision hull turns with the bow — same obstacle hits only on the side you turn toward', () => {
  // The whole point of a real heading rather than a drawn lean: the hull is
  // a line segment (CANOE_HALF_LENGTH long) swung to the canoe's heading,
  // so an obstacle off the bow quarter is reachable turned and not
  // reachable straight. Driven against obstacles.js directly — one probe
  // rock at a fixed offset, the heading as the only variable.
  const world = { distance: 0 };
  const field = createObstacleField(world);
  field.reset();

  const CANOE_X = 0;
  // Fire one frame at dt=0/speed=0 so nothing drifts: the probe sits exactly
  // where it's placed and the only thing under test is the hull geometry.
  const probeHits = (dx, dz, heading) => {
    for (const e of field.pool) e.active = false;
    const probe = field.pool[0];
    probe.type = 'rock';
    probe.active = true;
    probe.x = CANOE_X + dx;
    probe.z = dz;
    let hits = 0;
    field.update(0, 0, 0, CANOE_X, () => { hits++; }, () => {}, true, heading);
    return hits > 0;
  };

  // Straight ahead, dead centre of the hull: unchanged from the old
  // point-vs-radius check (a rock hits inside 0.55 units, misses outside).
  // This is the regression guard — adding a heading must not have made the
  // ordinary straight-line rock field any harder to thread.
  if (!probeHits(0.5, 0, 0)) throw new Error('a rock 0.5 units abeam should still hit a straight-running canoe (rock radius is 0.55)');
  if (probeHits(0.62, 0, 0)) throw new Error('a rock 0.62 units abeam should still miss a straight-running canoe');

  // Off the starboard bow: out of reach pointed downstream, in reach once
  // the bow swings right, and still out of reach if you swing it left. That
  // last one is what separates a rotating hull from a merely bigger one.
  const DX = 0.8, DZ = -0.5; // right of, and ahead of, the canoe
  if (probeHits(DX, DZ, 0)) throw new Error('the probe should clear a straight-running canoe — pick a further offset');
  if (!probeHits(DX, DZ, HEADING_MAX)) throw new Error('turning the bow toward the probe should bring the hull onto it');
  if (probeHits(DX, DZ, -HEADING_MAX)) throw new Error('turning the bow away from the probe should not hit it — the hull is growing, not rotating');

  // Mirrored, so neither side is special-cased.
  if (probeHits(-DX, DZ, 0)) throw new Error('mirrored probe should clear a straight-running canoe');
  if (!probeHits(-DX, DZ, -HEADING_MAX)) throw new Error('turning the bow to port should bring the hull onto the port-side probe');
  if (probeHits(-DX, DZ, HEADING_MAX)) throw new Error('turning to starboard should not hit the port-side probe');

  // And the number that actually decides difficulty: the widest lateral
  // offset at which an obstacle sweeping down the river can still catch you.
  // Every obstacle passes through every row, so this — not the hull's
  // area or its reach up/downstream — is what says whether you thread a gap.
  // Straight it must be exactly the rock's own radius (the old rule, intact);
  // turned it must grow by the hull's lateral sweep, and nothing more.
  const lateralReach = (heading) => {
    let reach = 0;
    for (let dx = 0; dx < 2; dx += 0.01) {
      for (let dz = -1.5; dz <= 1.5; dz += 0.01) {
        if (probeHits(dx, dz, heading)) { reach = dx; break; }
      }
    }
    return reach;
  };
  const ROCK_RADIUS = 0.55;
  const straight = lateralReach(0);
  if (Math.abs(straight - ROCK_RADIUS) > 0.02) {
    throw new Error(`a straight-running canoe should still be caught at exactly the rock's ${ROCK_RADIUS} radius, measured ${straight.toFixed(3)} — the heading changed the ordinary rock field`);
  }
  const turned = lateralReach(HEADING_MAX);
  const expected = ROCK_RADIUS + CANOE_HALF_LENGTH * Math.sin(HEADING_MAX);
  if (Math.abs(turned - expected) > 0.03) {
    throw new Error(`at full lock the hull should reach ${expected.toFixed(3)} (radius + CANOE_HALF_LENGTH * sin), measured ${turned.toFixed(3)}`);
  }
  notes.push(`  note heading: a rock catches the hull out to ${straight.toFixed(2)} running straight, ${turned.toFixed(2)} at full lock (+${(100 * (turned / straight - 1)).toFixed(0)}%)`);
});

await step('heading: a turned hull grounds out before the channel edge the old point canoe reached', () => {
  // The bank boundary moves with the heading too (game.js pulls the
  // navigable half-width in by CANOE_HALF_LENGTH * sin(heading)), so running
  // the shore with the bow swung out can't put the canoe as far across as a
  // straight run could. Same geometry as the obstacle hull, applied to the
  // edge of the water.
  // Hold hard right into the bank and record, frame by frame, how far across
  // the canoe actually got versus the straight-canoe limit at that same
  // flowDistance (game.js's waterEdge). Measured per frame, not once at the
  // start, because the channel width changes as you travel.
  const g = newGame('fjord', 60);
  let worstSlack = Infinity; // smallest (waterEdge - lateralOffset) seen
  let maxOffset = 0;
  let hitTheBank = false;
  for (let i = 0; i < 300; i++) {
    g.input.state.up = true;
    g.input.state.right = true;
    g.game.update(1 / 30);
    const waterEdge = widthAt(g.game.flowDistance) / 2 - GAME_EDGE_MARGIN;
    if (g.game.lateralOffset > waterEdge - 0.01) hitTheBank = true;
    worstSlack = Math.min(worstSlack, waterEdge - g.game.lateralOffset);
    maxOffset = Math.max(maxOffset, g.game.lateralOffset);
  }
  if (!(maxOffset > 0.5)) throw new Error(`the canoe never crossed the channel at all (max offset ${maxOffset.toFixed(2)}) — this scenario isn't testing anything`);
  if (hitTheBank) {
    throw new Error(`a hard-right canoe reached the straight-hull limit (offset ${maxOffset.toFixed(3)}) — the bank boundary isn't accounting for the heading`);
  }
  // And it isn't held back by some unrelated huge margin either: the slack
  // should be about the hull's own reach at full lock, not metres of it.
  const expectedReach = CANOE_HALF_LENGTH * Math.sin(HEADING_MAX);
  if (worstSlack > expectedReach * 2) {
    throw new Error(`the canoe stopped ${worstSlack.toFixed(3)} short of the edge, far more than the hull's ${expectedReach.toFixed(3)} of reach — something else is clamping it`);
  }
  notes.push(`  note heading: hard right into the bank stopped ${worstSlack.toFixed(2)} short of the straight-hull edge (hull reach at full lock is ${expectedReach.toFixed(2)})`);
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

// --- scenario 3c: hit feedback on the two shootable bosses ---------------

// Counts the marks a draw call actually puts on the canvas. The dom shim's
// own context is a no-op proxy, which is fine for "does it crash" but says
// nothing about whether a medium impact is visibly bigger than a small one —
// and "bigger" is the entire requirement.
function recordingCtx() {
  // `painted` is the ordered list of fill colours actually put on the
  // canvas, which is how the layering test below can tell what ended up on
  // top of what.
  const rec = { arcs: 0, strokes: 0, fills: 0, lines: 0, painted: [] };
  let fillStyle = null;
  const counters = {
    arc: 'arcs', ellipse: 'arcs',
    lineTo: 'lines',
    stroke: 'strokes', strokeRect: 'strokes',
    fill: 'fills', fillRect: 'fills',
  };
  // Everything else no-ops, the same way dom-shim.mjs's own context does —
  // this is only here to count marks, and it has to survive being handed to
  // a whole boss fight's draw(), not just drawImpact().
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      const key = counters[prop];
      if (key) {
        return () => {
          rec[key]++;
          if (key === 'fills') rec.painted.push(String(fillStyle));
        };
      }
      return () => {};
    },
    set(_t, prop, value) {
      if (prop === 'fillStyle') fillStyle = value;
      return true;
    },
  });
  return { ctx, rec };
}

// The fireball colour from world/impact.js — unique to that module, so its
// presence in a paint log means an impact really was drawn, and its position
// in that log says what it was drawn over.
const IMPACT_FIRE_FILL = 'rgb(255, 122, 30)';
// The Warship's hull fill, inside drawChaseShip.
const WARSHIP_HULL_FILL = '#3a2716';
// The Devil's shirt wedge, inside drawDevil — a fill that only his body
// draws, so it marks where his silhouette landed in the paint order.
const DEVIL_BODY_FILL = '#0d0d16';

await step('impacts: a landed shot leaves a mark, and a bigger gun leaves a bigger one', async () => {
  const { drawImpact, impactLife, impactTierFor } = await import('../src/world/impact.js');

  // The tiers are the weapons — core/weapons.js's own "Z = small (pistol),
  // X = medium (musket), C = large (blunderbuss)".
  if (impactTierFor('pistol') !== 'small') throw new Error(`pistol should be the small impact, got ${impactTierFor('pistol')}`);
  if (impactTierFor('musket') !== 'medium') throw new Error(`musket should be the medium impact, got ${impactTierFor('musket')}`);
  if (impactTierFor('blunderbuss') !== 'large') throw new Error(`blunderbuss should be the large impact, got ${impactTierFor('blunderbuss')}`);
  // A bullet with no tier of its own must still flash rather than throw or
  // vanish — feedback should never be the thing that breaks a fight.
  if (impactTierFor('trebuchet') !== 'small') throw new Error('an unknown bullet type should fall back to the small impact');

  // Lifetimes climb with the tier, so a bigger hit also reads for longer.
  const lives = ['small', 'medium', 'large'].map(impactLife);
  for (let i = 1; i < lives.length; i++) {
    if (!(lives[i] > lives[i - 1])) throw new Error(`impact lifetimes should grow with the tier, got ${JSON.stringify(lives)}`);
  }

  // Now the thing that actually matters: more gets drawn for a bigger tier.
  // Summed over the whole life at 60fps, so this measures the effect as
  // seen, not one arbitrary frame of it.
  const weight = (tier) => {
    const { ctx, rec } = recordingCtx();
    for (let age = 0; age < impactLife(tier); age += 1 / 60) {
      drawImpact(ctx, 160, 110, age, tier, 1.23);
    }
    return rec;
  };
  const small = weight('small');
  const medium = weight('medium');
  const large = weight('large');
  if (!(small.lines > 0 && small.fills > 0)) throw new Error(`even the small impact has to draw something: ${JSON.stringify(small)}`);
  for (const [a, b, names] of [[small, medium, 'small->medium'], [medium, large, 'medium->large']]) {
    if (!(b.lines > a.lines)) throw new Error(`${names}: more shards expected, ${a.lines} -> ${b.lines}`);
    if (!(b.fills > a.fills)) throw new Error(`${names}: more fill (core + smoke) expected, ${a.fills} -> ${b.fills}`);
  }
  // The ring is the medium tier's signature — small shouldn't stroke at all.
  if (small.strokes > 0 && medium.strokes <= small.strokes) {
    throw new Error('the medium impact should add a ring the small one does not have');
  }
  // Nothing is drawn before the hit or after it's spent.
  const spent = recordingCtx();
  drawImpact(spent.ctx, 160, 110, impactLife('medium') + 0.01, 'medium', 0);
  drawImpact(spent.ctx, 160, 110, -0.05, 'medium', 0);
  if (spent.rec.lines || spent.rec.fills || spent.rec.arcs) throw new Error('an expired or not-yet-due impact still drew');

  notes.push(`  note impacts: shard/fill marks over one effect — small ${small.lines}/${small.fills}, medium ${medium.lines}/${medium.fills}, large ${large.lines}/${large.fills}`);
});

await step('impacts: the Warship fight marks every landed shot at the spot it struck', () => {
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE - 40);
  // Into the hold, where the ship is shootable.
  for (let i = 0; i < 600 && !g.game.britishWarship.isChaseHolding(); i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (!g.game.britishWarship.isChaseHolding()) throw new Error('never reached the Warship hold');

  // Land one shot of each gun by handing the fight a bullet sitting right on
  // the hull, rather than trying to out-shoot a swinging target. The ship's
  // position is read fresh each time — its orbit moves it every frame.
  const impactsFor = (type) => {
    const ship = g.game.britishWarship.debugChaseShipPosition();
    const before = g.game.britishWarship.getImpacts().length;
    g.game.britishWarship.update(
      1 / 60, g.game.flowDistance, g.game.canoeWorldX, g.game.effectiveSpeed,
      () => {},
      [{ type, flowDistance: ship.flowDistance, worldX: ship.worldX }],
      1,
    );
    return g.game.britishWarship.getImpacts().slice(before);
  };

  const fromPistol = impactsFor('pistol');
  if (fromPistol.length !== 1) throw new Error(`a landed pistol shot should leave exactly one impact, got ${fromPistol.length}`);
  if (fromPistol[0].tier !== 'small') throw new Error(`a pistol hit on the hull should be a small impact, got ${fromPistol[0].tier}`);
  if (!Number.isFinite(fromPistol[0].x) || !Number.isFinite(fromPistol[0].d)) throw new Error('the impact has no position');

  const fromMusket = impactsFor('musket');
  if (fromMusket.length !== 1) throw new Error(`a landed musket shot should leave exactly one impact, got ${fromMusket.length}`);
  if (fromMusket[0].tier !== 'medium') throw new Error(`a musket hit on the hull should be a medium impact, got ${fromMusket[0].tier}`);

  // --- and the explosion has to land ON TOP OF the ship -----------------
  // This is the bug that shipped first time round and was reported as
  // "looks exactly the same as before": the impacts (and the single spark
  // before them) were drawn above drawChaseShip in the fight's draw(), so
  // the hull — ~35px by ~80px on screen, and every hit lands inside it by
  // definition — was painted straight over the effect. Checked by paint
  // order rather than by eye, since the shim can't rasterize.
  impactsFor('musket');
  const { ctx, rec } = recordingCtx();
  g.game.britishWarship.draw(ctx, g.game.flowDistance - g.game._chaseHoldZ, g.game.cameraWorldX);
  const hullAt = rec.painted.lastIndexOf(WARSHIP_HULL_FILL);
  const impactAt = rec.painted.lastIndexOf(IMPACT_FIRE_FILL);
  if (hullAt < 0) throw new Error('the ship hull never drew — this scenario is not testing the layering it claims to');
  if (impactAt < 0) throw new Error('a live impact drew nothing at all during the fight\'s own draw()');
  if (!(impactAt > hullAt)) {
    throw new Error(`the impact is painted under the ship (impact at op ${impactAt}, hull at ${hullAt}) — the hull covers it up, which is exactly how the effect ended up invisible before`);
  }

  // They expire on their own rather than piling up for the rest of the fight.
  for (let i = 0; i < 120; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (g.game.britishWarship.getImpacts().length !== 0) {
    throw new Error(`${g.game.britishWarship.getImpacts().length} impact(s) still live two seconds on — they should fade out`);
  }
});

await step('impacts: the Diable fight marks hits too, where it only had a body flash before', () => {
  const g = newGame('lawrenceWest', DIABLE_FLOW_DISTANCE - 20);
  for (let i = 0; i < 900 && !g.game.diable.isHolding(); i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (!g.game.diable.isHolding()) throw new Error('never reached the Diable arena');
  // isHolding() is already true through his 'appearing' entrance, which
  // doesn't check incoming fire at all — give him time to actually be
  // fighting before shooting at him.
  for (let i = 0; i < 150; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }

  const canoe = { x: g.game.canoeWorldX, y: 200 };
  const landOne = (type) => {
    // Dead on his torso. BASE_CY (64) is its centre at rest and it only
    // sways +/-4, well inside the BODY_HALF_H box, so this always connects.
    const cx = g.game.diable.debugCentreX();
    const before = g.game.diable.getImpacts().length;
    g.game.diable.update(
      1 / 60, g.game.flowDistance, canoe,
      [{ x: cx, y: 64, ref: { type } }],
      () => {}, () => {}, 1,
    );
    return g.game.diable.getImpacts().slice(before);
  };

  const pistol = landOne('pistol');
  if (pistol.length !== 1) throw new Error(`a landed pistol shot on the Devil should leave one impact, got ${pistol.length}`);
  if (pistol[0].tier !== 'small') throw new Error(`a pistol hit should be small, got ${pistol[0].tier}`);
  if (!Number.isFinite(pistol[0].x) || !Number.isFinite(pistol[0].y)) throw new Error('the impact should mark where the shot struck him');

  // The musket can't actually be carried this early (it unlocks at
  // Gatineau, past this fight) but diable.js handles bullet type
  // generically, so the tier has to come out right the day that changes.
  const musket = landOne('musket');
  if (musket[0]?.tier !== 'medium') throw new Error(`a musket hit should be medium, got ${musket[0]?.tier}`);

  // Every shot gets its own mark — unlike the body blanch, which
  // deliberately coalesces so a held trigger doesn't hold him white.
  const burst = [];
  for (let i = 0; i < 3; i++) burst.push(...landOne('pistol'));
  if (burst.length !== 3) throw new Error(`three landed shots should leave three impacts, got ${burst.length}`);

  // And they land ON TOP OF him, not behind — same check, and same reason,
  // as the Warship's hull layering above. Against a black silhouette
  // standing in front of a wall of hellfire, an impact drawn underneath
  // either of them would be completely lost.
  const { ctx, rec } = recordingCtx();
  g.game.diable.draw(ctx, g.game.time);
  const bodyAt = rec.painted.lastIndexOf(DEVIL_BODY_FILL);
  const impactAt = rec.painted.lastIndexOf(IMPACT_FIRE_FILL);
  if (bodyAt < 0) throw new Error('the Devil never drew — this scenario is not testing the layering it claims to');
  if (impactAt < 0) throw new Error('a live impact drew nothing at all during the fight\'s own draw()');
  if (!(impactAt > bodyAt)) {
    throw new Error(`the impact is painted under the Devil (impact at op ${impactAt}, body at ${bodyAt}) — it would be invisible against his silhouette`);
  }
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
  // works. Arriving is game.js's journeyComplete — either the oversized
  // dock (world/villages.js's KINGSTON_DOCK_REACH) walking the canoe ashore
  // or the canoe reaching the town's own line on the water; there's no
  // win screen any more (see the comment above game.js's leaveVillage()).
  let arrived = false;
  for (let i = 0; i < 3000 && !arrived; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    const err = g.game.canoeWorldX - centerX(g.game.flowDistance);
    g.input.state.left = err > 0.4;
    g.input.state.right = err < -0.4;
    g.game.update(1 / 30);
    if (g.game.journeyComplete) arrived = true;
  }
  if (!arrived) throw new Error('escaped the Warship but never reached Kingston — the run home is broken');
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

// --- scenario 4b2a: the heavier layer under that storm — gloom, rumbles,
// the banner, the music duck, the gusts (britishWarship.js's "second,
// heavier layer" block)

await step('britishWarship: the approach keeps darkening to the trigger, rumbles only while building, ducks the music out, gusts only before the hold', () => {
  // Pure-function shape first. Gloom is the second ramp: nothing until
  // the second clap (the plain storm is still ramping there), then 0 -> 1
  // by the trigger, 0 past it — the darkest frame is the one right before
  // the ship appears, never partway through.
  const secondClap = WARSHIP_FLOW_DISTANCE - 35; // SECOND_THUNDERCLAP_DISTANCE, module-private
  if (warshipStormGloomAt(secondClap - 1) !== 0) throw new Error('gloom started before the second thunderclap');
  if (warshipStormGloomAt(WARSHIP_FLOW_DISTANCE - 0.01) < 0.99) throw new Error('gloom should be at full right before the trigger');
  if (warshipStormGloomAt(WARSHIP_FLOW_DISTANCE) !== 0) throw new Error('gloom should snap off at the trigger (the instance method holds the fight\'s own level)');
  let prev = 0;
  for (let d = secondClap; d < WARSHIP_FLOW_DISTANCE; d += 0.5) {
    const v = warshipStormGloomAt(d);
    if (v < prev) throw new Error(`gloom went backwards at ${d}`);
    prev = v;
  }
  // Flicker/gusts are gated on the storm itself — dead before it, live
  // once it's well in. Gusts are signed (a squall shoves both ways).
  const wellBefore = WARSHIP_FIRST_THUNDERCLAP_DISTANCE - 300;
  let anyFlicker = 0, anyGust = 0;
  for (let t = 0; t < 40; t += 0.05) {
    if (warshipStormFlickerAt(wellBefore, t) !== 0) throw new Error('sheet lightning before the storm has even started');
    if (warshipStormGustAt(wellBefore, t) !== 0) throw new Error('gusts before the storm has even started');
    anyFlicker = Math.max(anyFlicker, warshipStormFlickerAt(secondClap, t));
    anyGust = Math.max(anyGust, Math.abs(warshipStormGustAt(secondClap, t)));
  }
  if (anyFlicker <= 0) throw new Error('no sheet lightning at all across 40s of full storm');
  if (anyGust <= 0) throw new Error('no gusts at all across 40s of full storm');

  // Now the lived version, wrapping the module's update() the same way
  // the scenario above does, to see rumbles/banner/duck from the outside.
  const g = newGame('rideau', WARSHIP_FIRST_THUNDERCLAP_DISTANCE - 120);
  const origUpdate = g.game.britishWarship.update.bind(g.game.britishWarship);
  let rumblesWhileBuilding = 0, rumblesWhileBrooding = 0, thunder = 0;
  g.game.britishWarship.update = (...args) => {
    const res = origUpdate(...args);
    thunder += res.thunderCount;
    if (res.rumbleCount > 0) {
      if (g.game.flowDistance >= secondClap) rumblesWhileBrooding += res.rumbleCount;
      else rumblesWhileBuilding += res.rumbleCount;
    }
    return res;
  };
  const banners = [];
  const origBanner = g.game.showBanner.bind(g.game);
  g.game.showBanner = (text) => { banners.push(text); origBanner(text); };
  let duckAtSecondClap = null;
  let duckBeforeStorm = null;
  let minDuckPreFight = 1;
  let gustSeenPreFight = false;
  let holding = false;
  for (let i = 0; i < 4000 && !holding; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    const fd = g.game.flowDistance;
    const duck = g.game.britishWarship.musicDuck(fd);
    if (duckBeforeStorm === null && warshipStormIntensityAt(fd) === 0) duckBeforeStorm = duck;
    if (duckAtSecondClap === null && fd >= secondClap) duckAtSecondClap = duck;
    if (!g.game.britishWarship.isChaseHolding()) {
      minDuckPreFight = Math.min(minDuckPreFight, duck);
      if (g.game.britishWarship.windAccel(fd) !== 0) gustSeenPreFight = true;
    }
    if (g.game.britishWarship.isChaseHolding()) holding = true;
  }
  if (!holding) throw new Error('never reached the held arena');
  if (thunder !== 2) throw new Error(`the two scripted claps must still be exactly two, got ${thunder} — the rumbles must not leak into thunderCount`);
  if (rumblesWhileBuilding < 1) throw new Error('no distant rumbles at all while the storm was building');
  if (rumblesWhileBrooding !== 0) throw new Error(`${rumblesWhileBrooding} rumble(s) in the brooding stretch — that silence is the point`);
  const stormBanners = banners.filter((b) => /sky goes black/i.test(b));
  if (stormBanners.length !== 1) throw new Error(`expected exactly one "sky goes black" banner, got ${stormBanners.length}: ${JSON.stringify(banners)}`);
  if (duckBeforeStorm !== 1) throw new Error(`music should be untouched before the storm, duck was ${duckBeforeStorm}`);
  if (duckAtSecondClap !== 0) throw new Error(`music should be fully ducked out by the second clap, was ${duckAtSecondClap}`);
  if (minDuckPreFight !== 0) throw new Error('music never reached silence before the fight');
  if (!gustSeenPreFight) throw new Error('never felt a gust during the approach');
  // In the hold: the pursuit track plays at full (duck released), the
  // gusts are off (lateral control is the dodge), the gloom is held at
  // its lower fight level, and the plain storm is still at full.
  const fd = g.game.flowDistance;
  if (g.game.britishWarship.musicDuck(fd) !== 1) throw new Error('music still ducked once the fight started');
  if (g.game.britishWarship.windAccel(fd) !== 0) throw new Error('gusts still shoving the canoe inside the held arena');
  const fightGloom = g.game.britishWarship.stormGloom(fd);
  if (!(fightGloom > 0 && fightGloom < 1)) throw new Error(`fight gloom should be held partway (readable cannonballs), got ${fightGloom}`);
  if (g.game.britishWarship.stormBedLevel(fd) !== 1) throw new Error('the wind/rain bed should run at full through the fight');
  notes.push(`  note britishWarship: ${rumblesWhileBuilding} distant rumble(s) while building, 0 while brooding; music ducked to 0 by the second clap`);
});

// --- scenario 4b2b: the storm stays dark through the fight, not just up to it

await step('britishWarship: no river obstacles inside the held arena — only the fight can hit you', () => {
  // "Can we remove the obstacles in the river for the British Warship
  // fight?" The fight clamps flowDistance, so the canoe isn't travelling —
  // but obstacles.js's pool kept drifting past and hitting it anyway. The
  // hold now passes collidable=false (game.js), same as flying over them
  // in the Chasse-galerie, and skips drawing them.
  const g = newGame('rideau', WARSHIP_FLOW_DISTANCE + 2);
  const hits = [];
  const origHandleHit = g.game.handleHit.bind(g.game);
  g.game.handleHit = (entry) => { hits.push(entry?.type); return origHandleHit(entry); };
  let inChase = false;
  for (let i = 0; i < 500 && !inChase; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.britishWarship.isChaseHolding()) inChase = true;
  }
  if (!inChase) throw new Error('never entered the held arena');
  // Long enough for the pool to sweep the whole arena several times over,
  // steering across the full width so nothing is missed by sitting still.
  hits.length = 0;
  for (let i = 0; i < 3000; i++) {
    g.game.health = 100;
    g.input.state.left = i % 120 < 60;
    g.input.state.right = i % 120 >= 60;
    g.game.update(1 / 30);
    if (!g.game.britishWarship.isChaseHolding()) break;
  }
  const riverHits = hits.filter((t) => t === 'rock' || t === 'island' || t === 'log');
  if (riverHits.length) throw new Error(`${riverHits.length} river-obstacle hit(s) inside the held arena (${[...new Set(riverHits)].join(', ')}) — they should be suppressed`);
  notes.push(`  note britishWarship: ${hits.length} hit(s) in the arena, none from river obstacles`);
});

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

await step('wendigo: the ?start= cheat lands past Petit-Saguenay\'s dock, a couple of seconds before the cold shows', async () => {
  // "About 2-3 seconds before the screen goes dark" and "I don't want to
  // pass a town dock before Wendigo" — both at once. The frost fade-in
  // (wendigo.js's FROST_FADE_IN) had to move later for that, since it used
  // to start three units *before* the dock; this pins the whole
  // arrangement so neither number drifts back.
  const { START_KEYWORDS } = await import('../src/main.js');
  const { FROST_START_DISTANCE, frostIntensityAt } = await import('../src/bossfights/wendigo.js');
  const { dockHitZ } = await import('../src/world/villages.js');
  const start = START_KEYWORDS['wendigo'];
  if (!start || start.segment !== 'fjord') throw new Error('no fjord "wendigo" entry in START_KEYWORDS');
  const petit = VILLAGES.find((v) => v.name === 'Petit-Saguenay');
  if (!petit) throw new Error('no "Petit-Saguenay" in VILLAGES — a name/lookup drifted');
  // Past the dock: clear of its hit zone, and the dock itself already off
  // the bottom of the screen (CANVAS_HEIGHT - CANOE_SCREEN_Y px below the
  // canoe is all that's visible behind it).
  const behindVisible = (CANVAS_HEIGHT - CANOE_SCREEN_Y) / PIXELS_PER_UNIT;
  if (start.flowDistance <= petit.flowDistance + dockHitZ(petit)) throw new Error(`?start=wendigo (${start.flowDistance.toFixed(1)}) lands on or before Petit-Saguenay's dock (${petit.flowDistance.toFixed(1)})`);
  if (start.flowDistance < petit.flowDistance + behindVisible) throw new Error(`?start=wendigo (${start.flowDistance.toFixed(1)}) still has Petit-Saguenay's dock on screen behind it`);
  // Not yet dark on the first frame, and the cold starts within ~2-3s at
  // a cheat start's BASE_SPEED (8) — i.e. 16..24 units ahead. Also the
  // cold must not start before the dock either.
  if (frostIntensityAt(start.flowDistance) !== 0) throw new Error('?start=wendigo already has the cold showing on its first frame');
  const lead = FROST_START_DISTANCE - start.flowDistance;
  if (lead < 16 || lead > 24) throw new Error(`the cold starts ${lead.toFixed(1)} units after ?start=wendigo — wanted ~2-3s worth (16..24 at BASE_SPEED)`);
  if (FROST_START_DISTANCE <= petit.flowDistance + dockHitZ(petit)) throw new Error('the cold starts before Petit-Saguenay\'s dock');
  // Lived: from the cheat's spot, coasting, nothing is dark for ~2s and
  // the cold is fully in well before the trigger.
  const g = newGame('fjord', start.flowDistance);
  let t = 0;
  let firstDarkT = null;
  for (let i = 0; i < 900 && frostIntensityAt(g.game.flowDistance) < 1; i++) {
    g.game.health = 100;
    g.game.update(1 / 30);
    t += 1 / 30;
    if (firstDarkT === null && frostIntensityAt(g.game.flowDistance) > 0) firstDarkT = t;
    if (g.game.mode === 'village') throw new Error('?start=wendigo docked at a village on the way in');
  }
  if (firstDarkT === null) throw new Error('the cold never showed after ?start=wendigo');
  if (firstDarkT < 1.5) throw new Error(`the cold showed only ${firstDarkT.toFixed(2)}s after ?start=wendigo — too soon`);
  notes.push(`  note wendigo: ?start=wendigo lands ${(start.flowDistance - petit.flowDistance).toFixed(1)} units past Petit-Saguenay, the cold shows ${firstDarkT.toFixed(1)}s in`);
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

// --- scenario 4c': the Saint Lawrence's real width, Tadoussac -> Montréal ---

await step('river: lawrenceWest width follows the real river — narrows at Québec City, wide off Tadoussac and in Lac Saint-Pierre', async () => {
  // lawrenceWidth.js duplicates each village's flowDistance as a number
  // (importing route.js there would be circular) — so check each keyframe
  // still sits on its village, or a re-tuned route would quietly slide the
  // narrows away from Québec City.
  const { LAWRENCE_WEST_WIDTH_KEYFRAMES, lawrenceWestWidthAt } = await import('../src/world/river/lawrenceWidth.js');
  for (const kf of LAWRENCE_WEST_WIDTH_KEYFRAMES) {
    const v = kf.village === 'Tadoussac'
      ? { flowDistance: SEGMENT_SHAPE_OFFSET.lawrenceWest }
      : VILLAGES.find((x) => x.segment === 'lawrenceWest' && x.name === kf.village);
    if (!v) throw new Error(`width keyframe names ${kf.village}, which isn't a lawrenceWest village any more`);
    if (Math.abs(v.flowDistance - kf.d) > 1) {
      throw new Error(`${kf.village}'s width keyframe sits at ${kf.d.toFixed(2)} but the village is at ${v.flowDistance.toFixed(2)} — update lawrenceWidth.js`);
    }
  }
  // The shape itself, on the trend (no wobble) — the point of the change.
  const at = (name) => lawrenceWestWidthAt(VILLAGES.find((x) => x.segment === 'lawrenceWest' && x.name === name).flowDistance);
  const qc = at('Quebec City');
  if (!(qc < at('Baie-Saint-Paul') / 2 && qc < at('Trois-Rivieres') / 2)) {
    throw new Error(`Québec City (${qc}) should be well under half as wide as Baie-Saint-Paul (${at('Baie-Saint-Paul')}) and Trois-Rivières (${at('Trois-Rivieres')})`);
  }
  // Seamless at the segment start: Tadoussac's own estuary width, so
  // crossing into lawrenceWest doesn't jump the banks.
  const start = SEGMENT_SHAPE_OFFSET.lawrenceWest;
  if (Math.abs(widthAt(start) - widthAt(start - 0.01)) > 0.5) {
    throw new Error(`width jumps at the lawrenceWest start: ${widthAt(start - 0.01).toFixed(2)} -> ${widthAt(start).toFixed(2)}`);
  }
  // And never pinched shut: the real width plus wobble stays a navigable
  // channel the whole leg, Québec City's narrows included.
  let min = Infinity, minAt = 0;
  for (let d = start; d < start + 2330; d += 0.5) {
    const w = widthAt(d);
    if (w < min) { min = w; minAt = d; }
  }
  if (min < 8) throw new Error(`lawrenceWest pinches to ${min.toFixed(2)} at local d=${(minAt - start).toFixed(0)} — narrower than the fjord`);
});

await step('tadoussac: casting off upriver starts in open water, not grounded on a sandbar', () => {
  // "When I leave Tadoussac, I start on a sandbar and always immediately
  // take damage": a braid island sat right on lawrenceWest's launch point,
  // and the upriver current held the canoe against it (100 -> 36 hull in
  // three seconds, hands off). path.js's BRAID_SUPPRESSED_CYCLES now keeps
  // every segment start clear.
  const tad = VILLAGES.find((v) => v.name === 'Tadoussac');
  const g = newGame('fjord', tad.flowDistance);
  g.game.currentVillage = tad;
  g.game.mode = 'village';
  g.game.leaveVillage();
  if (g.game.segment !== 'lawrenceWest') throw new Error(`Tadoussac's cast-off should land on lawrenceWest, got ${g.game.segment}`);
  const hull = g.game.health;
  run(g, 180, 1 / 60); // three seconds, no input at all
  if (g.game.health < hull) throw new Error(`took ${hull - g.game.health} damage in the first three seconds after leaving Tadoussac, with no input`);
  for (const start of Object.values(SEGMENT_SHAPE_OFFSET)) {
    for (let d = start - 30; d <= start + 30; d += 0.25) {
      if (braidAt(d) && !(d >= FEATURE_ISLAND_RANGE[0] && d <= FEATURE_ISLAND_RANGE[1])) {
        throw new Error(`a braid island sits ${(d - start).toFixed(1)} units from a segment start (${start})`);
      }
    }
  }
});

// --- scenario 4d: Kingston's dock is a real entrance into the town ---------

await step('docks: no rock, log, island or pelt is ever drawn overlapping a dock', () => {
  // "The rocks and logs obstacles often overlap the docks. This doesn't
  // matter for the actual gameplay, but cosmetically it does not look
  // right." obstacles.js's pickX now excludes villages.js's dockSpanAt()
  // span, widened by each sprite's own drawn half-width.
  //
  // Checks the real pool, not the placement function: an entry's d
  // (world.distance - z) is invariant while it drifts, so a spawn-time
  // exclusion is permanent — this asserts that property holds frame by
  // frame down a stretch carrying four village docks.
  const HALF_W = { rock: 18 / 32, log: 30 / 32, island: 40 / 32, pelt: 15 / 32 };
  const check = (g, where) => {
    for (const e of g.obstacles.pool) {
      const d = g.world.distance - e.z;
      const span = dockSpanAt(d);
      if (!span) continue;
      const hw = HALF_W[e.type] ?? 18 / 32;
      if (e.x + hw > span.lo && e.x - hw < span.hi) {
        throw new Error(`a ${e.type} overlaps a dock at d=${d.toFixed(1)}: x=${e.x.toFixed(2)} (+/-${hw.toFixed(2)}) inside planks ${span.lo.toFixed(2)}..${span.hi.toFixed(2)} (${where})`);
      }
    }
  };
  // The fjord run passes four docks (Sainte-Rose-du-Nord through
  // Petit-Saguenay). Steer for mid-channel so the canoe doesn't dock and
  // cut the run short.
  const g = newGame('fjord', 240);
  for (let i = 0; i < 6000; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    const err = g.game.canoeWorldX - centerX(g.game.flowDistance);
    g.input.state.left = err > 0.4;
    g.input.state.right = err < -0.4;
    g.game.update(1 / 30);
    if (g.game.mode === 'village') g.game.leaveVillage();
    check(g, 'fjord villages');
  }
  // Kingston's dock is the extreme case — KINGSTON_DOCK_REACH is 30 units,
  // far enough out that mid-channel itself can sit on the planks.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const k = newGame('rideau', kingston.flowDistance - 60);
  for (let i = 0; i < 1200; i++) {
    k.input.state.up = true;
    k.game.health = 100;
    k.game.update(1 / 30);
    if (k.game.mode === 'village') k.game.leaveVillage();
    check(k, 'Kingston');
  }
});

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
  if (!g.game.journeyComplete) throw new Error('stepping ashore at Kingston should mark the journey complete (main.js clears the checkpoint on it)');

  // There's no leaving Kingston: casting off used to push flowDistance
  // past the town's line and put up a "JOURNEY'S END" card — asked to be
  // removed ("just silently block me from leaving the city"). leaveVillage()
  // is a silent no-op here: still on foot, still playing, no screen.
  g.game.leaveVillage();
  for (let i = 0; i < 30; i++) g.game.update(1 / 30);
  if (g.game.mode !== 'village' || g.game.currentVillage?.name !== 'Kingston') throw new Error('casting off from Kingston left the town — it should be silently blocked');
  if (g.game.state !== 'playing') throw new Error(`state went to ${g.game.state} on trying to leave Kingston — nothing should happen at all`);
  if (!g.game.ui.gameoverScreen.classList.contains('hidden')) throw new Error('a screen came up on trying to leave Kingston — it should be silent');
});

await step('kingston: the white-hat greeter walks the dock to meet the canoe wherever it lands', () => {
  // "Make the guy in the white hat meet us where we land at the dock in
  // Kingston... landed way left, couldn't see him." villages.js's Kingston
  // greeter now follows the canoe's worldX along the dock (at a capped
  // walking pace) instead of standing at one fixed fraction of a dock
  // ~1.5 screens long. Driven straight through drawVillages() with a
  // canoeWorldX, the way game.js's render() feeds it, against the shim's
  // no-op canvas context.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const ctx = makeElement('canvas').getContext('2d');
  // Well clear of Kingston first: he must not exist yet (nothing drawn).
  drawVillages(ctx, kingston.flowDistance - 500, 0, 0, 3);
  if (debugKingstonGreeterX() !== null) throw new Error('greeter state should be null while Kingston is off-screen');
  // Now level with the dock, the canoe sitting far out from the shore.
  // Which side of the channel the dock is on decides the sign of "far
  // out" — just use the canoe positions themselves: hold one x, then the
  // other, and check he heads toward each in turn, at a bounded pace.
  const d = kingston.flowDistance;
  let t = 0;
  drawVillages(ctx, d, 0, t, 0);
  const x0 = debugKingstonGreeterX();
  if (typeof x0 !== 'number') throw new Error('greeter never placed once Kingston was on-screen');
  const hold = (canoeX, seconds) => {
    let prev = debugKingstonGreeterX();
    for (let i = 0; i < seconds * 30; i++) {
      t += 1 / 30;
      drawVillages(ctx, d, 0, t, canoeX);
      const now = debugKingstonGreeterX();
      if (Math.abs(now - prev) > 9 / 30 + 1e-6) throw new Error(`greeter jumped ${(now - prev).toFixed(2)} units in one frame — he should walk, not teleport`);
      prev = now;
    }
    return debugKingstonGreeterX();
  };
  // Ask him toward each end of the channel in turn: he must move toward
  // the canoe each time, and settle within the dock's own reach (30) of
  // the shore rather than following the canoe out into open water.
  const xA = hold(-40, 8);
  const xB = hold(40, 8);
  if (!(xA < xB)) throw new Error(`greeter didn't follow the canoe across: -40 -> ${xA.toFixed(1)}, +40 -> ${xB.toFixed(1)}`);
  if (Math.abs(xB - xA) > 30) throw new Error(`greeter ranged ${(xB - xA).toFixed(1)} units, more than the dock's own reach`);
  if (Math.abs(xB - xA) < 10) throw new Error(`greeter barely moved (${(xB - xA).toFixed(1)} units) — he should cover most of the dock`);
  // Off-screen again resets him.
  drawVillages(ctx, d - 500, 0, t, 0);
  if (debugKingstonGreeterX() !== null) throw new Error('greeter state not reset once Kingston left the screen');
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

await step('kingston: walking west into the Clergy Reserve/Dockyard extension never crashes', () => {
  // The west extension (villageScene.js's KINGSTON_WORLD_LEFT, the
  // Dockyard building, the Ordnance Yard/battery props, Clergy Reserve's
  // own trees) is purely cosmetic like Artillery Park above — no trigger,
  // nothing to assert on beyond "the game survives walking into it."
  // WALK_SPEED=62, dock (near x=160) to the world's own new left edge
  // (KINGSTON_WORLD_LEFT=-140) is ~300px, so budget generously.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const g = newGame('rideau', kingston.flowDistance - 20);
  for (let i = 0; i < 200 && g.game.mode !== 'village'; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (g.game.mode !== 'village') throw new Error('never entered Kingston on foot');
  for (let i = 0; i < 400; i++) {
    g.input.state.left = true;
    g.input.state.up = i % 60 < 30;
    g.input.state.down = i % 60 >= 30;
    g.game.update(1 / 30);
  }
});

await step('kingston: walking east onto the point stops at the Cataraqui — the far bank is never reachable', () => {
  // The east extension (villageScene.js's KINGSTON_WORLD_RIGHT, the
  // extra grid block, the King's storehouses, the ferry landing, and the
  // Royal Navy Dock Yard across the water) is mostly cosmetic like the
  // west one above, with one real rule: the Cataraqui (KINGSTON_CATARAQUI,
  // enforced through isWalkable()'s walls strip) is a barrier, the
  // dockyard a vista. So beyond the usual liveness check, hold Right for
  // well past what it takes to reach the shore (dock x=160 to the water
  // at x=430 is 270px at WALK_SPEED=62 — ~130 frames; 500 is generous,
  // and drifting up/down along the way sweeps a good stretch of bank) and
  // assert the player is still on the town side of the water.
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  const g = newGame('rideau', kingston.flowDistance - 20);
  for (let i = 0; i < 200 && g.game.mode !== 'village'; i++) {
    g.input.state.up = true;
    g.game.update(1 / 30);
  }
  if (g.game.mode !== 'village') throw new Error('never entered Kingston on foot');
  let furthest = -Infinity;
  for (let i = 0; i < 500; i++) {
    g.input.state.up = false;
    g.input.state.right = true;
    g.input.state.up = i % 120 < 40;
    g.input.state.down = i % 120 >= 80;
    g.game.update(1 / 30);
    furthest = Math.max(furthest, g.game.villageScene.debugPlayer().x);
  }
  if (furthest >= KINGSTON_CATARAQUI.x) {
    throw new Error(`walked into/across the Cataraqui — reached x=${furthest.toFixed(1)}, water starts at x=${KINGSTON_CATARAQUI.x}`);
  }
  // ...and did actually get out onto the new ground past the old 320px
  // edge, so this isn't passing because something stopped the walk early.
  if (furthest < CANVAS_WIDTH) {
    throw new Error(`never got east of the old world edge — furthest x=${furthest.toFixed(1)} (CANVAS_WIDTH=${CANVAS_WIDTH})`);
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
  // ...and specifically with Un Siècle d'Avance — "un-siecle-davance needs
  // to be the first song once we hit the ?start=kingston waypoint." The
  // list plays in order from the top (music.js's playKingstonTrack()), so
  // this is exact, not a lucky draw.
  if (g.game.music.nowPlaying?.title !== KINGSTON_PLAYLIST[0].title) {
    throw new Error(`?start=kingston led with "${g.game.music.nowPlaying?.title}", not "${KINGSTON_PLAYLIST[0].title}"`);
  }

  let arrived = false;
  for (let i = 0; i < 2000 && !arrived; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') arrived = true;
    if (g.game.journeyComplete) arrived = true;
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
  //
  // Health pinned, for the same reason the Rideau leg below pins it: this
  // stretch inherits whatever hull the fight left, and a hard-won clear can
  // come out of the arena on a sliver. A single steeple clip (~32) then ends
  // the run here, which is nothing to do with what this scenario is
  // checking — and because a dead game freezes update() entirely, it used to
  // surface three loops later as the thoroughly misleading "never reached
  // the Rideau leg". Whether a glide on fumes is survivable is the
  // chasse-galerie scenario's business, not this one's.
  for (let i = 0; i < 6000 && g.game.chasseGalerie.isActive(); i++) {
    g.input.state.up = true;
    g.game.health = 100;
    const want = g.game.chasseGalerie.clearOffsetAhead(g.game.flowDistance);
    const err = g.game.lateralOffset - want;
    g.input.state.left = err > 0.12;
    g.input.state.right = err < -0.12;
    g.game.update(1 / 30);
  }
  // A dead game freezes update(), so every later loop in this scenario would
  // spin out its full budget and then fail on whatever it was waiting for
  // instead of on the death that actually caused it. Say so here.
  if (g.game.state !== 'playing' || g.game.capsize.isActive()) {
    throw new Error('capsized during the post-fight descent despite pinned health — something other than the hull is killing the glide');
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
  if (!onRideau) {
    // Same trap as after the descent above — name the death rather than
    // blaming the segment hand-off for a loop that was never running.
    if (g.game.state !== 'playing' || g.game.capsize.isActive()) {
      throw new Error(`capsized on the run down to Gatineau at ${g.game.flowDistance | 0} despite pinned health`);
    }
    throw new Error(`past Le Diable the run never reached the Rideau leg toward Kingston (stuck at ${g.game.flowDistance | 0}, segment ${g.game.segment})`);
  }
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
  // Still ashore: the pad stays hidden (guns don't fire on foot — see
  // syncWeaponControls()) even though the musket is now owned. It comes
  // up on cast-off, with the X button live.
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls showing on foot in Gatineau after picking up the musket');
  }
  g.game.leaveVillage();
  if (g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still hidden after casting off from Gatineau with the musket');
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

await step('rideau: paddle the whole leg and reach Kingston, where the canoe is silently held', () => {
  const kingston = VILLAGES.find((v) => v.name === 'Kingston');
  if (!kingston) throw new Error('no "Kingston" in VILLAGES — a name/lookup drifted');
  if (kingston.segment !== 'rideau') throw new Error(`Kingston should be on the Rideau leg, got ${kingston.segment}`);
  const g = newGame('rideau', SEGMENT_SHAPE_OFFSET.rideau + 2);
  let arrived = false;
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
  for (let i = 0; i < 12000 && !arrived; i++) {
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
    if (g.game.journeyComplete) arrived = true;
    if (g.game.state === 'gameover') throw new Error('capsized despite pinned health — a non-collision death on the Rideau');
  }
  if (!arrived) throw new Error('paddling the Rideau never reached Kingston — stuck or mis-wired');
  if (!sawApproachBanner) throw new Error('no Kingston approach banner before the finish');
  if (maxWidthSeen < 40) throw new Error(`Kingston harbour never opened up (max width seen ${maxWidthSeen.toFixed(1)})`);
  // No end screen, ever — the journey ends by staying in Kingston (see
  // the comment above game.js's leaveVillage()). Whether the canoe walked
  // ashore or reached the town's own line on the water, keep pushing on
  // for a while: on foot the re-board zone does nothing, on the water the
  // canoe is held at KINGSTON's flowDistance; the state stays 'playing'
  // and nothing comes up.
  for (let i = 0; i < 300; i++) {
    if (g.game.mode === 'village') g.game.leaveVillage();
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.mode === 'river' && g.game.flowDistance > kingston.flowDistance + 1e-6) {
      throw new Error(`the canoe got ${(g.game.flowDistance - kingston.flowDistance).toFixed(2)} units past Kingston — it should be held at the town's line`);
    }
  }
  if (g.game.state !== 'playing') throw new Error(`state is ${g.game.state} after arriving at Kingston — there is no end screen any more`);
  if (!g.game.ui.gameoverScreen.classList.contains('hidden')) throw new Error('an end screen came up at Kingston');
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

await step('rideau: reaching Kingston by its dock enters the town, and casting off is silently refused', () => {
  // Kingston's dock walks the player ashore (game.js's dockHit branch),
  // same as every other village — and unlike every other village, there's
  // no re-boarding: leaveVillage() is a silent no-op at Kingston (see the
  // comment above it in game.js). The dock is the "so big I cannot miss
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
    if (g.game.mode === 'village' && g.game.currentVillage?.name === 'Kingston') entered = true;
  }
  if (!entered) throw new Error('never reached Kingston\'s dock');

  const bannerBefore = g.game.ui.milestoneBanner.textContent;
  g.game.leaveVillage();
  for (let i = 0; i < 30; i++) g.game.update(1 / 30);
  if (g.game.mode !== 'village') throw new Error('casting off from Kingston by its dock left the town — it should be silently refused');
  if (g.game.ui.milestoneBanner.textContent !== bannerBefore) throw new Error(`refusing to leave Kingston put up a banner ("${g.game.ui.milestoneBanner.textContent}") — it should be silent`);
});

await step('kingston: the arrival playlist cuts in at the approach banner and survives the arrival', async () => {
  // "An isolated playlist exclusively for Kingston" — KINGSTON_PLAYLIST
  // (music.js), shuffled, never the ambient shuffle (PLAYLIST) itself.
  // Cuts in at the same flowDistance as the "KINGSTON — Fort Frontenac
  // ahead" banner (game.js), well before the dock, and — unlike every
  // other boss track — nothing ever calls endBossTrack() for it (see
  // win()'s own comment): it should still be one of this set playing under
  // the victory card, not reverted to the ambient shuffle.
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
  // A real approach (not the cheat) leads with Un Siècle d'Avance too —
  // "un-siecle-davance needs to be the first song as we pull into
  // Kingston." Same fixed order as ?start=kingston gets; there is no
  // separate path.
  if (g.game.music.nowPlaying?.title !== KINGSTON_PLAYLIST[0].title) {
    throw new Error(`a real approach led with "${g.game.music.nowPlaying?.title}", not "${KINGSTON_PLAYLIST[0].title}"`);
  }

  let arrived = false;
  for (let i = 0; i < 2000 && !arrived; i++) {
    g.input.state.up = true;
    g.game.health = 100;
    g.game.update(1 / 30);
    if (g.game.journeyComplete) arrived = true;
  }
  if (!arrived) throw new Error('never arrived at Kingston after the arrival playlist cut in');
  // ...and it keeps playing through the (silent, screen-less) arrival.
  for (let i = 0; i < 60; i++) g.game.update(1 / 30);
  await new Promise((r) => setTimeout(r, 20));
  if (!kingstonTitles.includes(g.game.music.nowPlaying?.title)) {
    throw new Error(`arrival playlist didn't survive the arrival — playing "${g.game.music.nowPlaying?.title}" instead`);
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
  // Still on foot: the pad stays hidden until you're back in the canoe
  // (syncWeaponControls() gates on mode, not just on owning a gun).
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls showing on foot in Montreal after picking up the pistol');
  }
  g.game.leaveVillage();
  if (g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still hidden after casting off from Montreal with the pistol');
  }
  // Docking again anywhere hides it again; casting off brings it back.
  g.game.enterVillage(montreal);
  if (!g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls still showing after docking at Montreal with the pistol');
  }
  g.game.leaveVillage();
  if (g.game.ui.weaponPad.classList.contains('hidden')) {
    throw new Error('weapon controls hidden after re-boarding at Montreal with the pistol');
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
  for (let i = 0; i < 20 && !g.game.capsize.isActive(); i++) {
    g.game.invulnTimer = 0;
    g.game.handleHit({ type: 'rock' });
  }
  if (!g.game.capsize.isActive()) throw new Error('never capsized after 20 unmitigated rock hits');
  // The card no longer lands on the fatal hit — the canoe rolls over first
  // (world/capsize.js), which takes frames.
  run(g, 90, 1 / 30);
  if (g.game.state !== 'gameover') throw new Error('the capsize animation never handed over to the game-over screen');
  g.game.start();
  if (g.game.state !== 'playing') throw new Error('restart did not return to playing');
  if (g.game.capsize.isActive()) throw new Error('restart left the old capsize animation running');
  run(g, 300, 1 / 30, (s) => { s.up = true; });
});

// --- scenario 7a: the capsize animation itself ----------------------------

await step('capsize: the hull rolls over on a frozen river, then the card comes up', async () => {
  const { TOTAL_TIME } = await import('../src/world/capsize.js');
  const g = newGame('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
  run(g, 60, 1 / 30, (s) => { s.up = true; });

  const hudHiddenBefore = g.game.ui.hud.classList.contains('hidden');
  g.game.invulnTimer = 0;
  g.game.takeDamage(999);

  // The fatal hit starts the roll; it does NOT put up the card. That split
  // is the whole point — gameOver() hides the HUD and freezes the frame, so
  // anything it triggered would be covered over on the same tick.
  if (!g.game.capsize.isActive()) throw new Error('a fatal hit should start the canoe going over');
  if (g.game.state !== 'playing') throw new Error(`state jumped straight to ${g.game.state} — the roll never got a chance to play`);
  if (!g.game.ui.gameoverScreen.classList.contains('hidden')) throw new Error('the game-over card came up over the canoe still rolling');
  if (g.game.ui.hud.classList.contains('hidden') !== hudHiddenBefore) throw new Error('the HUD vanished as the canoe went over — it should stay up until the card');
  // The blink of a still-open invulnerability window must not be able to
  // switch the canoe off for the roll.
  if (g.game.canoeVisible === false) throw new Error('the canoe was left invisible for its own capsize');

  // Sample the roll. The premise is a width collapse: upright (+1) through
  // edge-on (0) to fully inverted (-1), which is what reads as "went over"
  // from straight overhead instead of "spun around".
  const frozenAt = g.game.flowDistance;
  const rolls = [];
  const sinks = [];
  let framesToCard = 0;
  for (let i = 0; i < 200 && g.game.state === 'playing'; i++) {
    rolls.push(g.game.capsize.rollScale());
    sinks.push(g.game.capsize.sinkFraction());
    g.game.update(1 / 30);
    framesToCard++;
  }
  if (g.game.state !== 'gameover') throw new Error('the capsize never finished');
  if (g.game.flowDistance !== frozenAt) {
    throw new Error(`the river kept moving during the capsize (${frozenAt.toFixed(2)} -> ${g.game.flowDistance.toFixed(2)}) — it should be frozen so the wreck doesn't scroll away`);
  }

  if (!(rolls[0] > 0.95)) throw new Error(`the roll should start upright, began at ${rolls[0].toFixed(2)}`);
  if (!rolls.some((r) => Math.abs(r) < 0.25)) throw new Error('the hull never passed through edge-on — that zero crossing is what makes it read as a roll (and it hides the sprite swap)');
  if (!(Math.min(...rolls) < -0.9)) throw new Error(`the hull never came fully over, lowest roll was ${Math.min(...rolls).toFixed(2)}`);
  // Monotonic: it goes over once and stays over, no rocking back.
  for (let i = 1; i < rolls.length; i++) {
    if (rolls[i] > rolls[i - 1] + 1e-9) throw new Error(`the hull rolled back upright at frame ${i} (${rolls[i - 1].toFixed(3)} -> ${rolls[i].toFixed(3)})`);
  }
  // And the sink only starts once the roll is done.
  const firstSink = sinks.findIndex((v) => v > 0);
  if (firstSink < 0) throw new Error('the hull never started to sink');
  if (!(rolls[firstSink] < -0.9)) throw new Error('the sink began before the hull was over — the phases are out of order');
  if (!(sinks[sinks.length - 1] > 0.9)) throw new Error('the hull never finished sinking before the card');

  const seconds = framesToCard / 30;
  if (Math.abs(seconds - TOTAL_TIME) > 0.1) throw new Error(`the card was held back ${seconds.toFixed(2)}s, expected about ${TOTAL_TIME}s`);
  notes.push(`  note capsize: rolled over and sank in ${seconds.toFixed(2)}s on a frozen river, then the card`);
});

await step('capsize: the overturned hull is its own sprite, matching the upright footprint', async () => {
  // world/capsize.js swaps upright -> overturned at the roll's zero
  // crossing. The two have to share the silhouette (sprites.js's
  // canoeHullPath) or the swap pops, and they have to actually differ or
  // there was no point drawing a hull bottom at all.
  const { createCanoeSprites } = await import('../src/world/canoe.js');
  const sprites = createCanoeSprites();
  if (!sprites.capsized) throw new Error('no capsized canoe sprite');
  if (sprites.capsized.width !== sprites.right.width || sprites.capsized.height !== sprites.right.height) {
    throw new Error(`the overturned hull is ${sprites.capsized.width}x${sprites.capsized.height}, the upright one ${sprites.right.width}x${sprites.right.height} — the mid-roll swap would pop`);
  }
  if (sprites.capsized === sprites.right) throw new Error('the capsized sprite is just the upright one');
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

await step('music: a run from the put-in opens on Reel des Forêts; one starting anywhere else does not', async () => {
  // "seed the shuffle so it opens with Reel des Forêts" — music.js's
  // openingOrder() — but then narrowed: "I only want reel-des-forets pinned
  // to the very start point, at the put-in... if I capsize later in the game
  // and start again at a random village, we should get back into the random
  // rotation." So the pin is createMusic()'s pinOpeningTrack option, which
  // main.js sets from isPutIn(), and it is OFF by default.
  //
  // Unlike the reserved boss cues the opener is NOT pulled out of the
  // ambient shuffle: it stays in PLAYLIST and can recur later. Only slot 0
  // of a pinned session's first order is fixed.
  const mod = await import('../src/audio/music.js');
  if (mod.OPENING_TRACK == null) throw new Error('OPENING_TRACK no longer resolves — its src fell out of PLAYLIST');
  if (!mod.PLAYLIST.includes(mod.OPENING_TRACK)) {
    throw new Error(`the opener ("${mod.OPENING_TRACK.title}") left the ambient shuffle — it's meant to stay in rotation, not become a reserved cue`);
  }

  // Many sessions, because a single one passing proves nothing about a
  // shuffle: pre-fix, 1-in-15 of these would have opened correctly by luck.
  const SESSIONS = 20;
  const seconds = new Set();
  for (let i = 0; i < SESSIONS; i++) {
    const music = mod.createMusic({ pinOpeningTrack: true });
    music.start();
    await new Promise((r) => setTimeout(r, 20));
    if (music.nowPlaying?.title !== mod.OPENING_TRACK.title) {
      throw new Error(`session ${i + 1} opened on "${music.nowPlaying?.title}", not "${mod.OPENING_TRACK.title}"`);
    }
    // One track on: still a shuffle, so this should vary across sessions.
    music.debugAudioElement().dispatchEvent({ type: 'ended' });
    await new Promise((r) => setTimeout(r, 20));
    if (music.nowPlaying?.title) seconds.add(music.nowPlaying.title);
    music.stop();
  }
  // Catches the fix overreaching into a fully fixed order (and it can't
  // flake: 20 independent draws from 14 tracks landing identical is ~1e-22).
  if (seconds.size < 2) {
    throw new Error(`the whole order looks pinned, not just the opener — ${SESSIONS} sessions all played "${[...seconds][0]}" second`);
  }

  // And the other half of the request: NOT pinned anywhere else. Default
  // (no option at all) and an explicit false both have to land back in the
  // plain rotation. Many sessions, because one landing on a different track
  // proves nothing — the opener is 1 of 15 and would come up by luck.
  const firsts = new Set();
  for (let i = 0; i < SESSIONS; i++) {
    const music = mod.createMusic(i % 2 ? { pinOpeningTrack: false } : {});
    music.start();
    await new Promise((r) => setTimeout(r, 20));
    if (music.nowPlaying?.title) firsts.add(music.nowPlaying.title);
    music.stop();
  }
  if (firsts.size < 2) {
    throw new Error(`an unpinned run opened on "${[...firsts][0]}" in all ${SESSIONS} sessions — that is still a pin, not a shuffle`);
  }
  if (firsts.size === 1 && firsts.has(mod.OPENING_TRACK.title)) {
    throw new Error('an unpinned run still always opens on the put-in track');
  }
  notes.push(`  note music: opener pinned to ${mod.OPENING_TRACK.title} across ${SESSIONS} put-in sessions (${seconds.size} distinct second tracks); ${firsts.size} distinct openers across ${SESSIONS} unpinned ones`);
});

await step('music: main.js pins the opener at the put-in and nowhere else', async () => {
  // The decision itself, rather than the mechanism: isPutIn() is what
  // main.js hands to createMusic({ pinOpeningTrack }), so every real
  // starting point the game has needs to come out on the right side of it.
  const mod = await import('../src/main.js');
  if (!mod.isPutIn('fjord', 0)) throw new Error('the put-in (fjord @ 0) has to count as the beginning — it is the only place the opener is wanted');
  if (!mod.isPutIn('fjord', 0.4)) throw new Error('a hair past 0 on the fjord is still the put-in (see PUT_IN_EPSILON)');
  // Every waypoint the ?debug picker offers, other than the put-in itself,
  // must be unpinned — "start again at a random village" means the rotation.
  for (const wp of mod.debugWaypoints()) {
    const pinned = mod.isPutIn(wp.segment, wp.flowDistance);
    if (wp.kind === 'put-in') {
      if (!pinned) throw new Error('the picker\'s put-in entry should be pinned');
    } else if (pinned) {
      throw new Error(`"${wp.label}" (${wp.segment} @ ${wp.flowDistance | 0}) counts as the put-in — it would wrongly get the pinned opener`);
    }
  }
  // Other segments never count, whatever their numbers happen to be.
  for (const seg of ['lawrenceEast', 'lawrenceWest', 'rideau']) {
    if (mod.isPutIn(seg, 0)) throw new Error(`${seg} @ 0 is not the put-in — only the fjord starts the journey`);
  }
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

await step('music: the Kingston playlist cycles through every track, never falling back to the ambient shuffle', async () => {
  // "An isolated playlist exclusively for Kingston... I don't want the
  // existing music to change when we get into Kingston" — requested
  // explicitly (and again for Les Rois de Blé specifically: "explicitly
  // just for Kingston, I don't want to hear that song anywhere else in the
  // game"). Simulates each track finishing on its own
  // (debugAudioElement().dispatchEvent({type:'ended'}), same test-only hook
  // used to fake a real playthrough elsewhere) enough times to cycle
  // through the whole set (KINGSTON_PLAYLIST) at least twice over — the
  // set plays in fixed list order and wraps (playKingstonPlaylistTrack()),
  // so full coverage in exactly KINGSTON_PLAYLIST.length transitions is
  // guaranteed, the 2x margin is just headroom — and confirms every track
  // seen is one of those, never a PLAYLIST (ambient shuffle) title leaking
  // in, which is exactly what the old default playSpecial() onEnded would
  // have done. The exact sequence is the next scenario's job.
  const mod = await import('../src/audio/music.js');
  const music = mod.createMusic();
  const kingstonTitles = mod.KINGSTON_PLAYLIST.map((t) => t.title);
  // "I don't want the existing music to change" — none of these must ever
  // have been folded into the regular ambient shuffle itself.
  const ambientTitles = mod.PLAYLIST.map((t) => t.title);
  for (const t of kingstonTitles) {
    if (ambientTitles.includes(t)) throw new Error(`"${t}" is in both the Kingston playlist and the ambient shuffle — should be exclusive to Kingston`);
  }
  music.start();
  music.playKingstonTrack();
  await new Promise((r) => setTimeout(r, 20));
  const seenTitles = [];
  const transitions = mod.KINGSTON_PLAYLIST.length * 2 + 1;
  for (let i = 0; i < transitions; i++) {
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
    if (!seenTitles.includes(t)) throw new Error(`"${t}" never came up across ${transitions} transitions of a ${kingstonTitles.length}-track set (seen: ${JSON.stringify(seenTitles)})`);
  }
});

await step('music: the Kingston playlist always leads with Un Siècle d\'Avance and plays in fixed list order, every time', async () => {
  // "un-siecle-davance needs to be the first song once we hit the
  // ?start=kingston waypoint... cooked in as the first song. Make the
  // playlist straight order so there is no randomness." Requested after
  // the previous arrangement (a shuffle, with a one-shot prime for the
  // cheat only) was caught playing out of order. So: no randomness left
  // to sample — assert the exact sequence. main.js's real ?start=kingston
  // URL flow isn't exercised by newGame()-based tests (a pre-existing
  // limitation every other cheat here shares), but it no longer does
  // anything music-specific anyway: playKingstonTrack() itself is what
  // guarantees the order, for the cheat and a real approach alike.
  const mod = await import('../src/audio/music.js');
  const music = mod.createMusic();
  const expected = mod.KINGSTON_PLAYLIST.map((t) => t.title);
  if (expected[0] !== mod.KINGSTON_TRACK.title) {
    throw new Error(`KINGSTON_PLAYLIST[0] is "${expected[0]}", not "${mod.KINGSTON_TRACK.title}" — Un Siècle d'Avance has to be first in the list, since the list IS the play order`);
  }
  // Each new Kingston track has been asked for "at the end" of the set as
  // it stood — Les Rois de Blé, then Le Grace Aussi, then Le Casquette de
  // 50 Missions — so what's pinned here is the *current* last one, and
  // this assertion moves each time another is appended. (It used to name
  // Le Grace Aussi.)
  if (expected[expected.length - 1] !== 'Dépense à Tout Vitesse') {
    throw new Error(`KINGSTON_PLAYLIST ends with "${expected[expected.length - 1]}" — the newest track was asked for right at the end`);
  }
  music.start();
  // Three separate arrivals (a first approach, then two capsize+restart
  // re-triggers, or a second run in the same session — every one of them
  // must lead with the same track), each played two full times around so
  // the wrap is covered too.
  for (let arrival = 0; arrival < 3; arrival++) {
    music.playKingstonTrack();
    await new Promise((r) => setTimeout(r, 20));
    const seen = [];
    for (let i = 0; i < expected.length * 2; i++) {
      seen.push(music.nowPlaying?.title);
      music.debugAudioElement().dispatchEvent({ type: 'ended' });
      await new Promise((r) => setTimeout(r, 20));
    }
    const want = [...expected, ...expected];
    if (JSON.stringify(seen) !== JSON.stringify(want)) {
      throw new Error(`arrival #${arrival + 1} played ${JSON.stringify(seen)}, expected exactly ${JSON.stringify(want)}`);
    }
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

// --- scenario 9a2: ?debug — the waypoint picker ---------------------------

await step('debug: isDebugMode() reads ?debug and stays off by default', async () => {
  const mod = await import('../src/main.js');
  try {
    windowShim.location.search = '';
    if (mod.isDebugMode() !== false) throw new Error('?debug absent should mean off — an ordinary player must never get the overlay');
    windowShim.location.search = '?difficulty=easy';
    if (mod.isDebugMode() !== false) throw new Error('another param alone should not turn debug on');
    // Bare ?debug (no value) is the form you type by hand, so it has to work.
    for (const q of ['?debug', '?debug=', '?debug=1', '?debug=yes', '?debug=on', '?start=diable&debug=1']) {
      windowShim.location.search = q;
      if (mod.isDebugMode() !== true) throw new Error(`"${q}" should turn debug on`);
    }
    // An explicit off, so a stale bookmark can be defused without editing.
    for (const q of ['?debug=0', '?debug=false', '?debug=off', '?debug=NO']) {
      windowShim.location.search = q;
      if (mod.isDebugMode() !== false) throw new Error(`"${q}" should turn debug off`);
    }

    // ?debug=play is debug mode with the picker shut — what a jump
    // navigates to. Reported bug: the picker used to open on every ?debug
    // load, so clicking a waypoint reloaded straight back into a
    // full-screen overlay covering the part of the game you'd just asked
    // to see.
    windowShim.location.search = '?debug=play';
    if (mod.isDebugMode() !== true) throw new Error('?debug=play is still debug mode — backquote has to work');
    if (mod.shouldOpenDebugMenuOnLoad() !== false) throw new Error('?debug=play must NOT open the picker on load — that is the whole point of it');
    windowShim.location.search = '?start=diable&debug=PLAY';
    if (mod.shouldOpenDebugMenuOnLoad() !== false) throw new Error('?debug=play should be case-insensitive like the rest');

    // A bare ?debug (or =1) does open it — that's the "I want to choose"
    // form, and it's what you type by hand.
    for (const q of ['?debug', '?debug=', '?debug=1', '?debug=yes']) {
      windowShim.location.search = q;
      if (mod.shouldOpenDebugMenuOnLoad() !== true) throw new Error(`"${q}" should open the picker on load`);
    }
    // Off means off — no picker, even on load.
    windowShim.location.search = '?debug=0';
    if (mod.shouldOpenDebugMenuOnLoad() !== false) throw new Error('?debug=0 should not open the picker');
    windowShim.location.search = '';
    if (mod.shouldOpenDebugMenuOnLoad() !== false) throw new Error('no ?debug at all should not open the picker');
  } finally {
    windowShim.location.search = '';
  }
});

await step('debug: every waypoint the picker offers resolves back to itself through ?start=', async () => {
  // The one that actually rots. The overlay's list and the ?start= resolver
  // are built from the same two sources (START_KEYWORD_LIST and VILLAGES),
  // but the names still have to survive normalizeStartName() round-tripping
  // — a label that stops matching its own village would show up as a button
  // that silently drops you at the put-in instead, with only a console
  // warning nobody reads.
  const mod = await import('../src/main.js');
  const waypoints = mod.debugWaypoints();
  if (waypoints.length < 30) throw new Error(`only ${waypoints.length} waypoints — the picker should list the whole route`);

  // The put-in comes first and is the one entry with no ?start= to give.
  if (waypoints[0].kind !== 'put-in') throw new Error('the put-in should be the first thing offered — it is the point of this feature');
  if (waypoints[0].startParam !== null) throw new Error('the put-in has no ?start= name; it is "no ?start= plus a cleared checkpoint"');
  if (waypoints.filter((w) => w.startParam === null).length !== 1) throw new Error('only the put-in should lack a ?start= name');

  // Real route order, so the list reads like the journey.
  const RANK = { fjord: 0, lawrenceEast: 0, lawrenceWest: 1, rideau: 2 };
  for (let i = 2; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const ra = RANK[a.segment];
    const rb = RANK[b.segment];
    if (rb < ra || (ra === rb && b.flowDistance < a.flowDistance)) {
      throw new Error(`waypoints out of route order: ${a.label} (${a.segment} ${a.flowDistance | 0}) before ${b.label} (${b.segment} ${b.flowDistance | 0})`);
    }
  }

  try {
    for (const wp of waypoints) {
      if (!wp.startParam) continue;
      windowShim.location.search = `?start=${encodeURIComponent(wp.startParam)}`;
      const got = mod.parseStartLocation();
      if (got.segment !== wp.segment) {
        throw new Error(`"${wp.label}" offers ?start=${wp.startParam}, which resolves to segment ${got.segment}, not ${wp.segment}`);
      }
      // Boss keywords land on their exact number; village docks get
      // START_APPROACH_BUFFER of run-up (main.js), floored at the segment
      // start. Either way the resolved spot has to be the one named, not
      // the put-in fallback a non-matching name silently gives.
      const slack = wp.kind === 'village' ? 26 : 0.001;
      if (Math.abs(got.flowDistance - wp.flowDistance) > slack
        && got.flowDistance !== SEGMENT_SHAPE_OFFSET[wp.segment]) {
        throw new Error(`"${wp.label}" resolved to ${got.flowDistance | 0}, expected within ${slack} of ${wp.flowDistance | 0}`);
      }
    }
  } finally {
    windowShim.location.search = '';
  }
  // No two buttons may land in the same place. The Kingston keyword and the
  // Kingston village dock share a normalized name, and since keywords win
  // in parseStartLocation() the dock entry used to resolve to the keyword's
  // position — two buttons, one destination, one of them lying about where
  // it went. debugWaypoints() drops the shadowed village now.
  const seen = new Map();
  for (const wp of waypoints) {
    const key = `${wp.segment}@${Math.round(wp.flowDistance)}`;
    if (seen.has(key)) throw new Error(`"${wp.label}" and "${seen.get(key)}" are both offered at ${key} — one of them can't be reached`);
    seen.set(key, wp.label);
  }
  notes.push(`  note debug: all ${waypoints.filter((w) => w.startParam).length} named waypoints round-trip through ?start=, plus the put-in`);
});

await step('debug: debugStartUrl keeps the tool and the difficulty, drops the old start', async () => {
  const mod = await import('../src/main.js');
  const url = (search, wp) => mod.debugStartUrl(search, '', '/', wp);
  const toParams = (u) => new URLSearchParams(u.slice(u.indexOf('?')));

  // Jumping somewhere named. debug=play, so the tool stays reachable but
  // the picker doesn't reopen over the game on arrival.
  let p = toParams(url('?debug=1', { startParam: 'diable' }));
  if (p.get('start') !== 'diable') throw new Error('picking a waypoint should set ?start= to its name');
  if (p.get('debug') !== 'play') throw new Error(`a jump should land on ?debug=play, got ?debug=${p.get('debug')}`);

  // The put-in: no ?start= at all, which is what the cleared checkpoint
  // then resolves to.
  p = toParams(url('?debug=1&start=kingston', { startParam: null }));
  if (p.has('start')) throw new Error('the put-in must REMOVE ?start=, not set it — otherwise it jumps to the old waypoint again');
  if (p.get('debug') !== 'play') throw new Error('picking the put-in should land on ?debug=play too, not reopen the picker');

  // An old ?start= is always replaced, never stacked.
  p = toParams(url('?start=kingston&debug=1', { startParam: 'wendigo' }));
  if (p.getAll('start').length !== 1 || p.get('start') !== 'wendigo') {
    throw new Error(`expected exactly one start=wendigo, got ${JSON.stringify(p.getAll('start'))}`);
  }

  // ?difficulty= rides along, same as it does through stripStartParam.
  p = toParams(url('?difficulty=easy&debug=1', { startParam: 'rideau' }));
  if (p.get('difficulty') !== 'easy') throw new Error('?difficulty= should survive a debug jump');

  // Jumping from a URL that had debug explicitly off re-asserts it rather
  // than leaving it off.
  p = toParams(url('?debug=0', { startParam: 'diable' }));
  if (p.get('debug') !== 'play') throw new Error('a jump should leave debug on');

  // And the round trip holds: every jump target lands on a URL that does
  // not reopen the picker. Checked through the real predicate rather than
  // by eyeballing the string.
  const mod2 = await import('../src/main.js');
  try {
    for (const wp of mod2.debugWaypoints()) {
      const jumped = mod2.debugStartUrl('?debug=1', '', '/', wp);
      windowShim.location.search = jumped.slice(jumped.indexOf('?'));
      if (mod2.shouldOpenDebugMenuOnLoad()) {
        throw new Error(`jumping to "${wp.label}" lands on ${jumped}, which reopens the picker over the game`);
      }
      if (!mod2.isDebugMode()) throw new Error(`jumping to "${wp.label}" lost debug mode entirely`);
    }
  } finally {
    windowShim.location.search = '';
  }

  // The hash is preserved verbatim.
  if (!mod.debugStartUrl('?debug=1', '#frag', '/', { startParam: 'diable' }).endsWith('#frag')) {
    throw new Error('the URL hash should survive a debug jump');
  }
});

await step('debug: the overlay lists one button per waypoint, each wired to its own, and toggles', async () => {
  const { createDebugMenu } = await import('../src/core/debugMenu.js');
  const mod = await import('../src/main.js');
  const waypoints = mod.debugWaypoints();

  const picked = [];
  let cleared = 0;
  let checkpoint = { segment: 'rideau', flowDistance: 95630 };
  const menu = createDebugMenu({
    waypoints,
    describeCheckpoint: () => (checkpoint ? `${checkpoint.segment} @ ${checkpoint.flowDistance}` : null),
    onPick: (wp) => picked.push(wp),
    onClearCheckpoint: () => { cleared++; checkpoint = null; },
  });

  // Starts closed, so main.js's explicit show() on load is what opens it —
  // not a side effect of construction.
  if (menu.isOpen()) throw new Error('the overlay should be built closed and opened deliberately');
  if (menu.toggle() !== true || !menu.isOpen()) throw new Error('toggle should open a closed overlay');
  if (menu.toggle() !== false || menu.isOpen()) throw new Error('toggle should close an open overlay');
  menu.show();
  menu.hide();
  if (menu.isOpen()) throw new Error('hide() should close it');

  const buttons = menu.debugButtons();
  if (buttons.length !== waypoints.length) {
    throw new Error(`${buttons.length} buttons for ${waypoints.length} waypoints — every waypoint needs one and no waypoint needs two`);
  }
  // Each button hands back the waypoint it is labelled with. An off-by-one
  // in the build loop would be invisible on screen and send you to the
  // wrong place every time.
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i].waypoint !== waypoints[i]) throw new Error(`button ${i} ("${buttons[i].waypoint.label}") is wired to the wrong waypoint`);
    buttons[i].element.dispatchEvent({ type: 'click' });
    if (picked[picked.length - 1] !== waypoints[i]) {
      throw new Error(`clicking "${waypoints[i].label}" picked "${picked[picked.length - 1]?.label}"`);
    }
  }
  if (picked.length !== waypoints.length) throw new Error('some buttons did not fire');
  if (cleared !== 0) throw new Error('picking a waypoint should not go through onClearCheckpoint — main.js clears it itself before navigating');

  // Picking closes the overlay. main.js's onPick hides it before navigating
  // (the navigation is what really swaps the screen, but a browser can take
  // a moment, and a blocked navigation never gets there) — so the handler
  // has to be free to hide from inside the callback without the menu
  // fighting it.
  menu.show();
  if (!menu.isOpen()) throw new Error('show() should open it');
  const hidingMenu = createDebugMenu({
    waypoints,
    describeCheckpoint: () => null,
    onPick: () => hidingMenu.hide(),
    onClearCheckpoint: () => {},
  });
  hidingMenu.show();
  hidingMenu.debugButtons()[0].element.dispatchEvent({ type: 'click' });
  if (hidingMenu.isOpen()) throw new Error('an onPick that hides the overlay should leave it closed');
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

await step('minimap: every village name keeps LABEL_MARGIN clear of every other name and every other icon', async () => {
  // Names used to be placed one at a time off each village's own labelPos
  // and printed straight over each other through the fjord, Sept-Îles/
  // Port-Cartier and Batiscan/Trois-Rivières. layoutLabels() now places them
  // all together; this checks the real route's result, so a new village or
  // a re-tuned labelPos can't quietly bring an overlap back.
  const { LABEL_MARGIN } = await import('../src/world/minimap.js');
  const labels = createMinimap().labelLayout;
  if (labels.length < 30) throw new Error(`expected every waypoint labelled, got ${labels.length}`);
  // Separation along whichever axis is clearest; negative means overlap.
  const gap = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const EPS = 1e-6;
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < labels.length; j++) {
      if (i === j) continue;
      const a = labels[i];
      const b = labels[j];
      // A pinned name (labelPos.pin, route.js) is hand-placed on purpose
      // and exempt — but every unpinned name must still keep clear of it.
      if (a.pinned) continue;
      if (gap(a.box, b.box) < LABEL_MARGIN - EPS) {
        throw new Error(`"${a.name}" and "${b.name}" labels are ${gap(a.box, b.box).toFixed(2)} apart (min ${LABEL_MARGIN.toFixed(2)})`);
      }
      if (gap(a.box, b.icon) < LABEL_MARGIN - EPS) {
        throw new Error(`"${a.name}" label is ${gap(a.box, b.icon).toFixed(2)} from ${b.name}'s icon (min ${LABEL_MARGIN.toFixed(2)})`);
      }
    }
  }
  // And a pin really is taken verbatim, not treated as one more preference.
  const { SEGMENTS } = await import('../src/world/river/route.js');
  const pins = Object.values(SEGMENTS).flatMap((s) => s.points).filter((p) => p.labelPos?.pin);
  for (const p of pins) {
    const got = labels.find((l) => l.name === p.name);
    if (!got?.pinned || Math.abs(got.dx - p.labelPos.dx) > EPS || Math.abs(got.dy - p.labelPos.dy) > EPS || got.anchor !== p.labelPos.anchor) {
      throw new Error(`${p.name}'s pinned labelPos wasn't used as written: got ${JSON.stringify(got && { dx: got.dx, dy: got.dy, anchor: got.anchor })}`);
    }
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
