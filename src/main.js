import { CANVAS_WIDTH, CANVAS_HEIGHT } from './shared/config.js';
import { createObstacleField } from './world/obstacles.js';
import { createWaterRenderer } from './world/waterGL.js';
import { createMusic } from './audio/music.js';
import { createMinimap } from './world/minimap.js';
import { createTouchControls, isTouchPrimary } from './core/touchControls.js';
import { createDebugMenu } from './core/debugMenu.js';
import { createTitleScene } from './world/titleScene.js';
import { speakerIcon, pauseIcon, playIcon } from './core/hudIcons.js';
import { townBannerLayout } from './core/townBanner.js';
import { createSaveIndicator } from './core/saveIndicator.js';
import { Input } from './core/input.js';
import { Game, MIN_SPEED, KINGSTON_APPROACH_LEAD } from './core/game.js';
import { VILLAGES } from './world/river/route.js';
import { SEGMENT_SHAPE_OFFSET } from './world/river/path.js';
import { SHIP_FLOW_DISTANCE } from './bossfights/blockade.js';
import { TRIGGER_DISTANCE as WARSHIP_FLOW_DISTANCE, FIRST_THUNDERCLAP_DISTANCE as WARSHIP_FIRST_THUNDERCLAP_DISTANCE } from './bossfights/britishWarship.js';
import { TRIGGER_DISTANCE as CHASSE_GALERIE_FLOW_DISTANCE } from './bossfights/chasseGalerie.js';
import { DIABLE_FLOW_DISTANCE } from './bossfights/diable.js';
import { TRIGGER_DISTANCE as LOUP_GAROU_FLOW_DISTANCE, SEGMENT as LOUP_GAROU_SEGMENT } from './bossfights/loupGarou.js';
import { TRIGGER_DISTANCE as CORRIVEAU_FLOW_DISTANCE, SEGMENT as CORRIVEAU_SEGMENT } from './bossfights/corriveau.js';
import { FROST_START_DISTANCE as WENDIGO_FROST_START_DISTANCE, SEGMENT as WENDIGO_SEGMENT } from './bossfights/wendigo.js';

const app = document.getElementById('app');

// Implicit checkpoint save — asked for explicitly as "not an explicit
// [save system]... don't make it explicit on screen but make it work":
// silently remembers the furthest of this game's own ?start= waypoints
// (START_KEYWORDS further down, plus every real village dock) the player
// has actually reached. Saving is still silent, but resuming isn't
// automatic any more: the title menu (beginRun() further down) offers
// CONTINUE from it, or NEW GAME, which wipes it — asked for later as "a
// Continue Game option, so that if the user has reached a waypoint which
// is visible in the cache, they can start from that waypoint." The actual checkpoint list/save-on-progress logic lives
// further down (after START_KEYWORDS/VILLAGES are both in scope); these
// three are just the raw storage read/write/clear, kept together and
// wrapped in try/catch so private browsing, disabled storage, or a quota
// error each just mean "no save," never a crash on startup.
export const CHECKPOINT_KEY = 'voyageurs-checkpoint';
export function loadCheckpoint() {
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.flowDistance !== 'number' || typeof parsed.segment !== 'string') return null;
    // Furs ride along with the position (saveCheckpointToStorage below).
    // A save from before they did has none — that's 0, not a broken save.
    const furs = Number.isFinite(parsed.furs) && parsed.furs > 0 ? Math.floor(parsed.furs) : 0;
    return { segment: parsed.segment, flowDistance: parsed.flowDistance, furs };
  } catch {
    return null;
  }
}
// `furs` is the count in the hold at the moment the waypoint was passed —
// asked for as "if I pass a waypoint and then close my browser window, that
// previous number of furs should get restored when I hit Continue Game."
// Recorded only when a save happens (a *new*, further waypoint), never
// rewritten in between: a capsize zeroes the live count, but the save
// keeps what you had when you got there.
export function saveCheckpointToStorage(segment, flowDistance, furs = 0) {
  try {
    window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ segment, flowDistance, furs }));
  } catch {
    /* no save this time — nothing else to do about it */
  }
}
export function clearCheckpointStorage() {
  try {
    window.localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    /* nothing to clean up if storage never worked in the first place */
  }
}

// Dev/testing cheat: ?start=<village name> drops the canoe there instead of
// the put-in — e.g. ?start=tadoussac, ?start=sept-iles, ?start=quebec-city.
// Matched case-insensitively and with accents stripped (typing "iles" for
// "Îles" is the whole point of a URL you type by hand). Each village
// already knows which of the three river segments (see world/river/route.js's
// module comment) it's actually on, so starting on the Québec City stretch
// works the same way as anywhere else — no separate handling needed here.
// Unrecognized or absent falls back to the real start (the put-in, fjord).
//
// Deliberately lands a bit *before* the village's own flowDistance, not
// exactly on it: arriving at a dock normally means steering into position
// over some real distance of approach, and starting with zero of that
// runway is its own bug for the fjord's own last stop specifically —
// Tadoussac's flowDistance is also exactly where the fjord segment's hard
// ceiling sits (game.js's SEGMENT_BOUNDS), so landing precisely on it left
// no room to steer into the dock before already being jammed against it.
const START_APPROACH_BUFFER = 25;
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Hyphens and spaces are treated as the same separator on both sides of the
// comparison \u2014 some village names use a hyphen as part of the real name
// (Sept-\u00celes, Baie-Saint-Paul), others are two plain words (Qu\u00e9bec City),
// and there's no way for someone typing a URL by hand to know which is
// which. Collapsing both to one form before comparing means "quebec-city",
// "quebec city", and "quebec+city" (a literal space, once the browser
// decodes it) all match "Qu\u00e9bec City" \u2014 and "sept-iles"/"sept iles" still
// both match "Sept-\u00celes" too.
function normalizeStartName(s) {
  return stripAccents(s.toLowerCase()).replace(/[-\s]+/g, ' ').trim();
}
// Also-recognized, dev-only keywords that aren't real places — not part of
// VILLAGES, so they never show up on the minimap or anywhere in-game, they
// just give ?start= a couple more names to jump to for testing. One entry
// per boss fight (bossfights/blockade.js and bossfights/chasseGalerie.js
// today; more planned, each landing here the same way as it's built) —
// normalizeStartName() is applied to
// these keys too, so "british-blockade", "british blockade", and
// "british+blockade" all work, same as every real village name already
// does. "british-blockade" drops the canoe on the Rideau already within
// firing range of the Château Gauntlet (now on the run into Kingston — see
// bossfights/blockade.js) instead of paddling the whole leg to reach it —
// 90 units short of the ship, comfortably inside APPROACH_RANGE (190) so
// cannon fire starts immediately, but with real room left to practice
// finding the gap before the hull itself.
//
// "chasse-galerie" drops the canoe a few units *past* chasseGalerie.js's
// TRIGGER_DISTANCE so the flight is already active on the first frame — the
// canoe still lifts off gradually from there. (It used to land 10 units
// short, but on a touch device the dialled-down forward paddle can't fight
// the backward Ottawa current + rapids over that gap, so the flight never
// started.)
//
// "diable" drops the canoe a short paddle short of the Devil's arena at the
// head of the Chasse-galerie — the flight/storm are already live there, and
// game.js's armDiableCheckpoint() (called below) hands over the pistol so
// you can actually fight him. A capsize then respawns right here, not at
// Montréal.
//
// "wendigo" drops the canoe on the lower Saguenay a short calm paddle
// before the famine-spirit stirs (bossfights/wendigo.js) — the first
// encounter in the game, on the lonely reach down to Tadoussac. Placed
// off where the cold first shows (FROST_START_DISTANCE), not the fight's
// own trigger: it used to sit at TRIGGER_DISTANCE - 24, which is 34 units
// *inside* the frost fade-in — the screen was already going dark on the
// first frame. Asked for as "about 2-3 seconds before the screen goes
// dark": 21 units is ~2.6s at the BASE_SPEED (8) a cheat start carries,
// under 2s if you hold Up and accelerate from the first frame. A first
// cut used 25 units off the old, earlier fade start, which put the cheat
// 28 units *before* Petit-Saguenay's dock — "I don't want to pass a town
// dock before Wendigo" — so the fade itself moved later (wendigo.js's
// FROST_FADE_IN) and this now lands ~8 units past that dock: off the
// bottom of the screen, and clear of its hit zone. test/smoke.mjs pins
// both facts.
//
// "loup-garou" drops the canoe on the Beaupré shore a short calm paddle
// before the beast is spotted (bossfights/loupGarou.js) — the last encounter
// before Québec City.
//
// "british-warship" used to drop the canoe just past the Warship's own
// trigger (TRIGGER_DISTANCE + 10) — straight into the held arena with no
// runway at all. Moved to FIRST_THUNDERCLAP_DISTANCE instead once
// britishWarship.js grew a pre-fight approach (the sky darkening, two
// thunderclaps, a held silent "brooding" stretch, only then the ship) —
// asked for explicitly as "give me 3 seconds of lead time," and
// FIRST_THUNDERCLAP_DISTANCE is already the exact distance that constant is
// built to guarantee (see its own comment: sized off the game's worst-case
// speed, so the gap to TRIGGER_DISTANCE is always >=3s regardless of how
// fast the cheat paddles off from here) — reusing it rather than picking a
// fresh number keeps this cheat's own guarantee tied to the same one the
// real approach already promises. Named to match "british-blockade" above
// (and the in-game banner, "BRITISH WARSHIP") — it was "pursuit" at first,
// then "british-pursuit" once that was found to
// silently match nothing (every keyword here is matched verbatim), renamed
// again alongside the banner/HUD text.
//
// "rideau" drops the canoe at the head of the made-up Ottawa-to-Kingston leg
// (world/river/route.js) — past Le Diable, the storm gone, on the calm wide
// water heading for the finish.
//
// "kingston" used to just work the normal way every real village name
// does — flowDistance - START_APPROACH_BUFFER (25) — which for Kingston
// specifically landed past the British Warship's own trigger and only ~11
// units short of its dock (bossfights/britishWarship.js,
// world/villages.js's KINGSTON_DOCK_REACH), i.e. dropped in "directly in
// front of Kingston" rather than anywhere near a real approach. Given its
// own override instead, through two more rounds of tuning:
//   1. Landing just past Jones Falls put the whole Warship fight back in
//      the way of a cheat whose entire point is to skip straight to
//      Kingston — reported as "too far back, needs to be after the
//      Warship."
//   2. Re-anchored to WARSHIP_FLOW_DISTANCE + 55, comfortably past the
//      Warship — but 40 units short of the dock, and world/villages.js's
//      drawVillages() doesn't draw a village *at all* until the canoe is
//      within its render gate of its own flowDistance. Landing that far out
//      meant nothing Kingston-related rendered until ~21 more units of
//      paddling closed the gap — reported as "not showing up," no console
//      errors, because it wasn't a crash.
//   3. Re-anchored to -15, inside the render gate — but with
//      KINGSTON_DOCK_HIT_Z (7) that close, paddling Up for even a couple of
//      seconds crossed straight into the dock and onto its on-foot scene
//      (villageScene.js, untouched by any of the river-view work) before
//      there was any real look at the approach — reported as landing
//      "almost directly on the dock," and wanting to "watch the coastline."
//   4. -26 gave ~19 units of runway (a couple of seconds) — still reported
//      as wanting "much further back," aiming for "a 5-6 second entrance."
//   5. 1/3 of the way from the Warship's own trigger to Kingston (~91
//      units, ~5.3s simulated) — asked to move "back up" again, this time
//      to 1/2 of the way from Jones Falls to Kingston directly (not
//      measured off the Warship at all any more). That landed short of the
//      "KINGSTON — Fort Frontenac ahead" banner's own distance trigger
//      (game.js), so game.js's normal playKingstonTrack() wouldn't fire
//      until partway through the approach — worked around at the time by
//      forcing the track on immediately here instead of waiting for it.
//   6. That trigger itself moved further back — game.js's
//      KINGSTON_APPROACH_LEAD, 70 -> 150, "kick in [the arrival track] a
//      bit further back up the river sequence" — and this cheat repinned to
//      land at that *exact* distance rather than an independently-tuned
//      number ("update ?start=kingston to match it"), which removes the
//      need for round 5's forced-on workaround entirely: game.js's own
//      Game.update() hits this same trigger on its very first tick after
//      landing here, so the banner and the track both fire through the
//      normal path, same as reaching this point by paddling would.
// Below: KINGSTON_FLOW_DISTANCE - KINGSTON_APPROACH_LEAD, ~150 units out —
// past the Warship's own "well past the trigger" auto-resolve threshold
// (+50 past TRIGGER_DISTANCE) by ~75 units (more margin than round 5 had),
// and still well outside KINGSTON_RENDER_GATE — the point is watching the
// whole lit-up approach happen, not having Kingston already on screen at
// spawn.
//

// "gatineau" is the one keyword below that isn't a flowDistance/segment
// pair at all (see START_KEYWORDS' own shape) — it opens Gatineau's own
// on-foot dock scene directly (startedAtGatineau, further down), the only
// way to actually reach it from a URL. A plain river-position cheat can't:
// Gatineau sits on the lawrenceWest number line as that segment's last
// waypoint, but its dock is 63 units past the Diable arena's own hold-the-
// river clamp, which fires on position alone regardless of how the canoe
// got there — landing anywhere near the real flowDistance just gets
// clamped straight into the fight instead of reaching the village.
const RIDEAU_START = { flowDistance: SEGMENT_SHAPE_OFFSET.rideau + 3, segment: 'rideau' };
const KINGSTON_FLOW_DISTANCE = VILLAGES.find((v) => v.name === 'Kingston')?.flowDistance ?? Infinity;
// Exported for test/smoke.mjs — a regression test checks every keyword
// that targets a hand-authored village lands within that village's own
// render gate (world/villages.js's VISIBLE_Z_RANGE), not just past
// whatever boss fight happens to sit in front of it. See "kingston"'s own
// comment above for the bug this is guarding against.
// The keywords as a list first, carrying the `?start=` name alongside a
// player-facing label. START_KEYWORDS below is derived from it, and so is
// the ?debug overlay's waypoint list — so a new boss fight landing here
// turns up in both without being named twice, which is exactly the kind of
// thing that goes stale.
export const START_KEYWORD_LIST = [
  // checkpoint: false — a ?start= / ?debug jump target, but not a save
  // point (CHECKPOINT_CANDIDATES_BY_SEGMENT below). Each sits just past the
  // dock of the town before its fight (the Loup-garou's 30 past
  // Petit-Saguenay, La Corriveau's 30 past Beaupré, the Wendigo's ~19 past
  // Trois-Rivières), so passing it right after landing in that town saved
  // again — reported as a double save, and removed by request. The town
  // before each is the save for its fight. In route order; each fight's
  // segment comes from its own module.
  { name: 'loup-garou', label: 'Le Loup-garou', flowDistance: LOUP_GAROU_FLOW_DISTANCE - 30, segment: LOUP_GAROU_SEGMENT, checkpoint: false },
  { name: 'corriveau', label: 'La Corriveau', flowDistance: CORRIVEAU_FLOW_DISTANCE - 30, segment: CORRIVEAU_SEGMENT, checkpoint: false },
  { name: 'wendigo', label: 'Le Wendigo', flowDistance: WENDIGO_FROST_START_DISTANCE - 21, segment: WENDIGO_SEGMENT, checkpoint: false },
  { name: 'chasse-galerie', label: 'Chasse-galerie (take flight)', flowDistance: CHASSE_GALERIE_FLOW_DISTANCE + 3, segment: 'lawrenceWest' },
  { name: 'diable', label: 'Le Diable', flowDistance: DIABLE_FLOW_DISTANCE - 22, segment: 'lawrenceWest' },
  { name: 'rideau', label: 'Rideau leg (start)', ...RIDEAU_START },
  { name: 'british-blockade', label: 'British Blockade', flowDistance: SHIP_FLOW_DISTANCE - 90, segment: 'rideau' },
  { name: 'british-warship', label: 'British Warship', flowDistance: WARSHIP_FIRST_THUNDERCLAP_DISTANCE, segment: 'rideau' },
  // See the module comment above (six rounds of tuning) on why this one.
  { name: 'kingston', label: 'Kingston (journey\'s end)', flowDistance: KINGSTON_FLOW_DISTANCE - KINGSTON_APPROACH_LEAD, segment: 'rideau' },
];
export const START_KEYWORDS = Object.fromEntries(
  START_KEYWORD_LIST.map((k) => [normalizeStartName(k.name), { flowDistance: k.flowDistance, segment: k.segment }])
);
export function parseStartLocation() {
  const raw = new URLSearchParams(window.location.search).get('start');
  // No explicit ?start= — this is where the implicit checkpoint (this
  // file's own top comment) actually takes effect: resume there instead of
  // the put-in if one's saved. An explicit ?start= still always wins, same
  // as it always has, so a dev link never silently gets overridden by
  // whatever the browser happens to remember.
  if (!raw) return loadCheckpoint() ?? { flowDistance: 0, segment: 'fjord' };
  const wanted = normalizeStartName(raw);
  const keyword = START_KEYWORDS[wanted];
  if (keyword) return keyword;
  const match = VILLAGES.find((v) => wanted === normalizeStartName(v.name));
  if (!match) {
    if (raw.trim()) console.warn(`?start=${raw}: no matching village, starting from the put-in instead.`);
    return { flowDistance: 0, segment: 'fjord' };
  }
  const segmentStart = SEGMENT_SHAPE_OFFSET[match.segment];
  const flowDistance = Math.max(segmentStart, match.flowDistance - START_APPROACH_BUFFER);
  // saveAs: the town itself, which startCheckpointFor() makes the save —
  // the canoe starts START_APPROACH_BUFFER short of the dock, so its own
  // position would otherwise resolve to the town *before* this one.
  // (Not for a noSave town — route.js — which falls back to the last real
  // save point behind it, as a keyword start does.)
  return { flowDistance, segment: match.segment, saveAs: match.noSave ? undefined : { segment: match.segment, flowDistance: match.flowDistance } };
}

// The save a ?start= run begins with. "If I start the game in
// Petit-Saguenay, I want you to make Petit-Saguenay the current savepoint" —
// so a town start is saved as that town, the moment the run begins. Before
// this, a debug jump cleared the save and the canoe (25 units short of the
// dock) passed nothing for a couple of seconds, until the 2s check found
// "the furthest save point at or behind the canoe": the town *before*
// Petit-Saguenay. That saved (a Saving dialog for a town you'd never been
// to), and then Petit-Saguenay counted as new on arrival and saved again.
// A keyword start (a boss approach, Kingston) is saved as the last save
// point at or behind where it puts you, the way passing it would have.
export function startCheckpointFor(start) {
  if (!start) return null;
  return start.saveAs ?? furthestCheckpointReached(start.segment, start.flowDistance);
}
// Where this run begins isn't known at load any more unless the URL says
// so: a plain load puts up the title menu (New Game / Continue — see
// beginRun() below) and the choice decides it. An explicit ?start= is a
// dev cheat that has already made its choice, so it skips the menu and is
// resolved here, before the stripping further down removes it from the URL.
const hasExplicitStart = !!(new URLSearchParams(window.location.search).get('start') || '').trim();
const explicitStart = hasExplicitStart ? parseStartLocation() : null;

// Is this position the put-in — the very start of the journey, before the
// first village? Only used to decide whether this run gets the pinned
// opening track (audio/music.js's OPENING_TRACK): the put-in always opens
// on Reel des Forêts, and every other starting point — a resumed
// checkpoint, any ?start=, any ?debug jump — goes straight into the
// ordinary shuffle.
//
// A threshold rather than `=== 0`, even though parseStartLocation() hands
// back a literal 0 for the put-in today: the put-in is "the fjord before
// anything", and a future start-of-segment nudge of a unit or two
// shouldn't quietly stop counting as the beginning. Nothing else can fall
// inside it — the earliest fjord village sits at ~299, and even with
// START_APPROACH_BUFFER its ?start= lands near 274.
const PUT_IN_EPSILON = 1;
export function isPutIn(segment, flowDistance) {
  return segment === 'fjord' && flowDistance <= PUT_IN_EPSILON;
}

// ?difficulty=easy — a debug-only knob for now ("for now it's just a debug
// feature for me... we can add a UI toggle for non-gamers later"): less
// damage taken in the boss fights, more damage dealt back, nothing else
// changed (see game.js's own EASY_DAMAGE_TAKEN_SCALE/EASY_DAMAGE_GIVEN_SCALE
// comment for the actual scope and numbers). Not stripped from the URL the
// way ?start= is above — that's a one-shot spawn point, this is meant to
// stay in effect for as long as it's in the address bar, including across a
// reload. Exported (not read into a top-level const) for the same
// testability reason as parseStartLocation() above.
export function isEasyMode() {
  return new URLSearchParams(window.location.search).get('difficulty')?.toLowerCase() === 'easy';
}

// ?debug — brings up the waypoint picker overlay (core/debugMenu.js) so any
// point in the route can be jumped to without hand-editing ?start= in the
// address bar, including the put-in itself. Asked for because the implicit
// checkpoint (this file's own top comment) is the right thing for playing
// and the wrong thing for testing: once you've reached Kingston, a plain
// reload always resumes at Kingston, so there was no way back to early
// gameplay short of clearing site data.
//
// Sticky in the URL for the same reason ?difficulty= is — it's a mode you
// want to stay in across the reloads that testing involves, not a one-shot
// like ?start=. Any value counts, including none: ?debug, ?debug=1 and
// ?debug=yes all turn it on, and only a literal ?debug=0/false turns it
// back off (so a stale link can be defused without editing it down).
export function isDebugMode() {
  const raw = new URLSearchParams(window.location.search).get('debug');
  if (raw === null) return false;
  const v = raw.toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

// Whether the picker opens on load: on any ?debug at all, with a value or
// without — "I want any appearance of ?debug in the url string, with a value
// or no value, to bring up the debug menu" — except straight after a jump.
//
// That exception is the reason ?debug=play used to exist: the first cut
// opened the picker on every ?debug load, so clicking a waypoint reloaded
// straight back into a full-screen overlay covering the thing you'd just
// asked to see. A jump then landed on ?debug=play, which stayed shut — but
// that made the URL mean two things, and loading a ?debug=play link (or
// reloading after a jump) quietly skipped the picker. Now the URL only
// ever means "open it", and the jump marks itself instead: onPick sets a
// one-shot sessionStorage flag (markDebugJump) that the very next load
// consumes (consumeDebugJump), so only the load a pick caused stays shut.
// Reload after that and the picker is back, like any other ?debug load.
// sessionStorage, not localStorage: per tab, so a flag left behind by a
// navigation that never happened can't leak into another tab, and NEW
// GAME's clearSavedProgress() never has to know about it.
const DEBUG_JUMP_FLAG = 'voyageurs-debug-jumped';
export function markDebugJump() {
  try { window.sessionStorage.setItem(DEBUG_JUMP_FLAG, '1'); } catch { /* storage blocked: the picker just reopens */ }
}
export function consumeDebugJump() {
  try {
    const v = window.sessionStorage.getItem(DEBUG_JUMP_FLAG);
    window.sessionStorage.removeItem(DEBUG_JUMP_FLAG);
    return v === '1';
  } catch {
    return false;
  }
}
// URLSearchParams writes an empty value as "debug="; drop the "=" so the
// address bar shows the bare ?debug you'd type by hand, both on a jump's
// URL and after stripStartParam() rewrites the bar on arrival.
function bareDebug(query) {
  return query.replace(/(^|&)debug=(?=&|$)/, '$1debug');
}
export function shouldOpenDebugMenuOnLoad({ justJumped = false } = {}) {
  return isDebugMode() && !justJumped;
}
// Captured here, before the ?start=-stripping below runs — that code used
// to wipe the entire query string (window.location.pathname with nothing
// else), not just `start`, which silently discarded `difficulty` before it
// was ever read at the Game() call site further down. Fixed in two parts:
// this early capture, and the stripping itself now only deletes `start`,
// leaving `?difficulty=` (and anything else) in the address bar — see that
// code's own comment below.
const startedEasy = isEasyMode();

// The checkpoint list itself — every position this file already treats as
// a real waypoint: START_KEYWORD_LIST's boss-fight approaches (minus the
// ones marked `checkpoint: false`) plus every real village dock (VILLAGES). Grouped and sorted per segment so
// furthestCheckpointReached() below can find "the latest one at or before
// here" with a plain scan, no search structure needed for a couple-dozen
// entries. Rebuilt once at load, not per-check — none of this moves after
// the module finishes evaluating.
const CHECKPOINT_CANDIDATES_BY_SEGMENT = {};
for (const kw of START_KEYWORD_LIST) {
  if (kw.checkpoint === false) continue;
  (CHECKPOINT_CANDIDATES_BY_SEGMENT[kw.segment] ??= []).push(kw.flowDistance);
}
for (const v of VILLAGES) {
  if (v.noSave) continue; // on the map, not a save point — route.js's noSave
  (CHECKPOINT_CANDIDATES_BY_SEGMENT[v.segment] ??= []).push(v.flowDistance);
}
for (const list of Object.values(CHECKPOINT_CANDIDATES_BY_SEGMENT)) list.sort((a, b) => a - b);

// The furthest checkpoint candidate at or before (segment, flowDistance),
// or null if the segment has none behind the current position yet (e.g.
// still short of Wendigo on a fresh fjord run). Candidates are sorted
// ascending, so the last one still <= flowDistance is the answer.
export function furthestCheckpointReached(segment, flowDistance) {
  const list = CHECKPOINT_CANDIDATES_BY_SEGMENT[segment];
  if (!list) return null;
  let best = null;
  for (const d of list) {
    if (d <= flowDistance) best = d;
    else break;
  }
  return best === null ? null : { segment, flowDistance: best };
}

// Whole-journey ordering across segments — a plain flowDistance comparison
// only means anything *within* one segment (each has its own number-line
// offset, world/river/path.js's SEGMENT_SHAPE_OFFSET), so "is a further
// along than b" needs the segment's own place in the real route first.
// lawrenceEast is real geography (the minimap) but not a live destination
// any more (route.js's own module comment) — ranked with fjord since nothing
// in normal play ever actually sits there.
const SEGMENT_RANK = { fjord: 0, lawrenceEast: 0, lawrenceWest: 1, rideau: 2 };
export function isFurtherAlong(a, b) {
  if (!b) return true;
  const ra = SEGMENT_RANK[a.segment] ?? 0;
  const rb = SEGMENT_RANK[b.segment] ?? 0;
  if (ra !== rb) return ra > rb;
  return a.flowDistance > b.flowDistance;
}

// The town a saved position belongs to, or null (a boss approach, say).
// A town has exactly one save position — its own dock, village.flowDistance
// — whether that save was made by landing there or by paddling past (the
// two are the same checkpoint candidate; see landingCheckpoint() below), so
// matching on position covers both, and covers saves made before landing
// saved anything. CONTINUE uses this to start you *inside* the town rather
// than on the river beside it: "that should always start from inside the
// town, even if my game was saved at the waypoint outside the town."
// Kingston is excluded: arriving there ends the journey and clears the save
// (loop()), so a Kingston save can't be continued into anyway.
export function villageAtCheckpoint(cp) {
  if (!cp) return null;
  return VILLAGES.find((v) => v.name !== 'Kingston' && !v.noSave && v.segment === cp.segment && Math.abs(v.flowDistance - cp.flowDistance) < 0.5) ?? null;
}

// The checkpoint landing in `village` saves — deliberately the *same*
// position passing its waypoint on the river saves (its dock, which is
// already one of CHECKPOINT_CANDIDATES_BY_SEGMENT's entries). That's what
// makes "don't save twice" fall out of the one rule both paths already
// share, isFurtherAlong(): land first, and passing the waypoint afterwards
// finds the save already there (equal, not further) and skips; pass first,
// and landing finds the same. Null for Kingston, which clears the save
// rather than making one.
export function landingCheckpoint(village) {
  if (!village || village.name === 'Kingston' || village.noSave) return null;
  return { segment: village.segment, flowDistance: village.flowDistance };
}

// Every place the ?debug overlay can drop you, in real route order. Built
// from the same two sources the checkpoint list above uses — START_KEYWORD_LIST
// and VILLAGES — plus the put-in, which is the one position that isn't in
// either (VILLAGES starts at Sainte-Rose-du-Nord, well downstream of
// flowDistance 0) and is the whole reason this exists: "start again from
// the beginning to see how recent changes affect earlier gameplay".
//
// `startParam` is what goes in ?start=, or null for the put-in, which has
// no name to pass — it's what you get from no ?start= at all once the
// checkpoint is out of the way, which is exactly what picking it does.
//
// lawrenceEast's villages are included even though route.js no longer
// treats that segment as a live destination (see SEGMENT_RANK above): the
// ?start= cheat has always accepted those names, so the overlay would be
// lying by omission if it hid them. The segment heading in the overlay says
// what they are.
export function debugWaypoints() {
  const reached = [];
  for (const k of START_KEYWORD_LIST) {
    reached.push({ label: k.label, startParam: k.name, segment: k.segment, flowDistance: k.flowDistance, kind: 'boss' });
  }
  // Villages whose name is already a keyword are skipped, not listed twice.
  // parseStartLocation() checks START_KEYWORDS *before* VILLAGES, so for
  // such a name the keyword always wins — Kingston is the live case (the
  // keyword puts you on its own tuned approach lead, the dock entry would
  // have aimed START_APPROACH_BUFFER short of the dock). Listing both gave
  // two buttons that do the same thing, one of them quietly going somewhere
  // other than where it said. Caught by the smoke test's round-trip check,
  // not by reading the code.
  const keywordNames = new Set(START_KEYWORD_LIST.map((k) => normalizeStartName(k.name)));
  for (const v of VILLAGES) {
    if (keywordNames.has(normalizeStartName(v.name))) continue;
    reached.push({ label: v.name, startParam: v.name, segment: v.segment, flowDistance: v.flowDistance, kind: 'village' });
  }
  reached.sort((a, b) => {
    const ra = SEGMENT_RANK[a.segment] ?? 0;
    const rb = SEGMENT_RANK[b.segment] ?? 0;
    return ra === rb ? a.flowDistance - b.flowDistance : ra - rb;
  });
  return [
    { label: 'The put-in — the very beginning', startParam: null, segment: 'fjord', flowDistance: 0, kind: 'put-in' },
    ...reached,
  ];
}

// The URL to load to start at `waypoint`. Keeps everything else already on
// the address bar (notably ?difficulty=) and re-asserts ?debug so the tool
// is still reachable on the other side — you're mid-testing, and losing it
// on every jump would be the obvious annoyance. As a bare ?debug: the picker
// staying shut on arrival is markDebugJump()'s job now, not the URL's (see
// shouldOpenDebugMenuOnLoad). A null
// startParam deletes ?start= rather than setting it: combined with the
// cleared checkpoint at the call site, no ?start= IS the put-in
// (parseStartLocation's own fallback). Pure and exported so a test can
// check it without a browser's navigation.
export function debugStartUrl(search, hash, pathname, waypoint) {
  const params = new URLSearchParams(search);
  params.delete('start');
  if (waypoint.startParam) params.set('start', waypoint.startParam);
  params.set('debug', '');
  const query = bareDebug(params.toString());
  return `${pathname}?${query}${hash || ''}`;
}

// In-memory mirror of whatever's actually in storage, so each check below
// is a cheap comparison instead of a JSON.parse of the storage read every
// time. Loaded once, kept current as saves happen (savedCheckpoint below).
let savedCheckpoint = loadCheckpoint();

const startedAtDiable =
  normalizeStartName(new URLSearchParams(window.location.search).get('start') || '') === normalizeStartName('diable');
// "?start=gatineau" — Gatineau's own on-foot dock, where the musket master
// stands. Not reachable through the normal river-position machinery above:
// dropping the canoe on the river at Gatineau's own flowDistance just gets
// clamped straight into the Diable fight instead (its arena sits 63 units
// upstream of the dock, and the hold-the-river clamp doesn't care how the
// canoe got there, only where it currently is). The only real way in is to
// skip the river and open the village scene directly, the way actually
// docking there does — same pattern armDiableCheckpoint() below uses for
// its own can't-express-this-as-flowDistance case.
const startedAtGatineau =
  normalizeStartName(new URLSearchParams(window.location.search).get('start') || '') === normalizeStartName('gatineau');
// Any explicit ?start= at all (village or keyword) — for the slow-start
// speed override below. (Used to be a Kingston-only check; "?start=kingston"
// needs nothing else special any more — it lands exactly on the "KINGSTON —
// Fort Frontenac ahead" banner's own distance trigger, see START_KEYWORDS'
// own comment on "kingston", and game.js's normal Game.update() fires the
// banner and the arrival track itself on the very first tick.)
const startedExplicitly = hasExplicitStart;

// A ?start= cheat is a one-shot for THIS page load. Strip it from the address
// bar now that it's been read, so a reload, a restored tab, or a home-screen
// icon that was saved mid-testing doesn't silently keep dropping the player
// at a checkpoint (a "why am I always at the Devil?" bug that looks like the
// game, not the URL). Restarts within the session still return to wherever
// this run began — Game captures startFlowDistance/startSegment in its
// constructor, before this runs.
//
// Only `start` is deleted, not the whole query string — used to blow away
// window.location.search entirely (pathname + hash, nothing else), which
// silently discarded `?difficulty=` too even though isEasyMode()'s own
// comment already claimed it "stays in effect... including across a
// reload." It never did, because this ran before that claim was ever
// tested. `difficulty` (and anything else on the URL) survives here now.
// The actual string transform is pulled out into its own pure, exported
// function so a test can check it directly — the side effect around it
// (history.replaceState, a real browser API the dom-shim doesn't provide)
// isn't something a headless test can exercise anyway.
export function stripStartParam(search) {
  const params = new URLSearchParams(search);
  params.delete('start');
  const rest = bareDebug(params.toString());
  return rest ? `?${rest}` : '';
}
if (window.location.search) {
  try {
    history.replaceState(null, '', window.location.pathname + stripStartParam(window.location.search) + window.location.hash);
  } catch {
    // Some embedded/sandboxed contexts forbid replaceState — harmless, the
    // cheat just stays in the URL there.
  }
}

// A positioned wrapper so the WebGL water layer and the 2D sprite/terrain
// layer stack exactly on top of each other and scale together. The water
// canvas sits below; the 2D canvas is cleared to transparent each frame and
// leaves a river-shaped hole (see world/terrain.js) for it to show through.
const screen = document.createElement('div');
screen.style.position = 'relative';
app.appendChild(screen);

// The town-name banner (style.css's #town-banner): "whenever I'm in a town,
// a small banner at the top of the game window showing the name of the
// town." A child of the game screen itself rather than of #ui, so "the top
// of the game window" holds wherever the screen sits — on a phone that's
// mid-viewport, nowhere near the top of the page. Driven from loop() off
// game.mode/currentVillage (syncTownBanner below) rather than from each
// of game.js's several enter/leave paths, so none of them can leave it
// stuck up or missing. Appended after the canvases, so it's on top.
const townBanner = document.createElement('div');
townBanner.id = 'town-banner';
townBanner.className = 'hidden';
townBanner.setAttribute('aria-live', 'polite');

let townBannerShows = null;
function fitTownBanner() {
  if (!townBannerShows) return;
  const panel = document.getElementById('right-panel');
  const at = townBannerLayout(townBannerShows, screen.getBoundingClientRect(), panel?.getBoundingClientRect?.());
  townBanner.style.left = `${at.left}px`;
  townBanner.style.top = `${at.top}px`;
  townBanner.style.maxWidth = `${at.room}px`;
  townBanner.style.fontSize = `${at.fontPx}px`;
}
function syncTownBanner() {
  const name = game?.mode === 'village' ? game.currentVillage?.name ?? null : null;
  if (name === townBannerShows) return;
  townBannerShows = name;
  townBanner.classList.toggle('hidden', !name);
  if (name) {
    // In its own span for style.css's vertical stretch (.town-name).
    const text = document.createElement('span');
    text.className = 'town-name';
    text.textContent = name;
    townBanner.replaceChildren(text);
    fitTownBanner();
  }
}

// <canvas> is a replaced element (like <img>) — `inset:0` alone doesn't
// stretch a replaced element's auto width/height the way it would a <div>,
// so width/height:100% has to be explicit or these stay at native 320x220.
function layerStyle(el) {
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.imageRendering = 'pixelated';
}

const waterCanvas = document.createElement('canvas');
waterCanvas.width = CANVAS_WIDTH;
waterCanvas.height = CANVAS_HEIGHT;
layerStyle(waterCanvas);
screen.appendChild(waterCanvas);

const canvas = document.createElement('canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
layerStyle(canvas);
screen.appendChild(canvas);
screen.appendChild(townBanner);

// The "Saving" canoe (core/saveIndicator.js) — bottom-right of the game
// screen, shown for five seconds on every real checkpoint write (loop()).
// Same reason as the town banner for living inside the screen rather than
// #ui: "the game window", wherever that sits.
const saveIndicator = createSaveIndicator();
screen.appendChild(saveIndicator.element);
// Bottom-right, except where something fixed sits over that corner of the
// screen: on a desktop window not much wider than the game, the MOVE keys
// cue (#touch-dpad) hangs into the screen's bottom-right corner, and on a
// wider one the BUILD badge (#build-version, index.html) can. Either would
// cover it. For each one it collides with, it steps clear by whichever is
// the shorter move — left of it, or up above it — then checks again
// against the rest. Re-run on resize and on each show (the dpad is
// positioned by resize() too).
const SAVE_INDICATOR_EDGE = 6;
// `above`: extra px to keep clear over the element's own box — the desktop
// cue's "MOVE" caption is a #steer-pad::after hung above it (style.css),
// outside the box getBoundingClientRect() reports, and the first cut of
// this sat its bottom edge right on top of the caption.
const SAVE_INDICATOR_AVOID = [{ id: 'touch-dpad', above: 20 }, { id: 'build-version', above: 0 }];
function placeSaveIndicator() {
  const el = saveIndicator.element;
  let right = SAVE_INDICATOR_EDGE;
  let bottom = SAVE_INDICATOR_EDGE;
  el.style.right = `${right}px`;
  el.style.bottom = `${bottom}px`;
  const s = screen.getBoundingClientRect();
  const obstacles = SAVE_INDICATOR_AVOID
    .map(({ id, above }) => {
      const r = document.getElementById(id)?.getBoundingClientRect?.();
      return r && r.width && r.height ? { left: r.left, right: r.right, top: r.top - above, bottom: r.bottom } : null;
    })
    .filter(Boolean);
  for (let pass = 0; pass < 3; pass++) {
    const me = el.getBoundingClientRect();
    if (!me.width) return;
    const hit = obstacles.find((o) => o.left < me.right && o.right > me.left && o.top < me.bottom && o.bottom > me.top);
    if (!hit) return;
    const toLeft = s.right - hit.left + SAVE_INDICATOR_EDGE;
    const toUp = s.bottom - hit.top + SAVE_INDICATOR_EDGE;
    if (toLeft - right <= toUp - bottom) right = toLeft;
    else bottom = toUp;
    el.style.right = `${Math.round(right)}px`;
    el.style.bottom = `${Math.round(bottom)}px`;
  }
}
function showSaving() {
  saveIndicator.show();
  placeSaveIndicator();
}
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Falls back to null (handled in game.js as a 2D-drawn water fill) if this
// browser/environment has no WebGL.
const water = createWaterRenderer(waterCanvas);

// Sits in the top-right corner below the mute/pause buttons (#right-panel
// in index.html/style.css). This doesn't reserve any space from the game
// canvas — the canvas keeps rendering at full size — it just relies on the
// same fixed-to-viewport corner positioning the buttons already use. On a
// wide/short-ish window the canvas doesn't reach the corner anyway (there's
// empty background on either side once it's scaled to an integer
// multiple), so nothing ends up under it there; on a narrow phone where the
// canvas does reach every edge, this floats over it the same way the
// buttons already do. See world/minimap.js for why it's a real,
// geographically-placed route rather than an invented shape.
const minimap = createMinimap();
document.getElementById('right-panel').appendChild(minimap.el);

// How big that empty margin needs to be judged, in px: small enough that a
// narrow/phone-width window (no margin at all) still gets a usable
// minimum, capped so a huge ultrawide monitor doesn't blow it up past a
// sensible size relative to the game view.
const MINIMAP_MIN = 110;
// On a real touch device the canvas fills the full viewport width (see
// resize()'s own comment on scale), so sidebarWidth below is always
// ~0 and the minimap always ends up sitting right at MINIMAP_MIN,
// floating over the canvas rather than beside it either way — may as
// well have that floor be a size actually worth reading on a phone.
const MOBILE_MINIMAP_MIN = 150;
const MINIMAP_MAX = 280;

const dpad = document.getElementById('touch-dpad'); // the steer pad wrapper
const weaponDpad = document.getElementById('weapon-dpad'); // the fire-button column, opposite side
const DPAD_GAP = 4; // breathing room between the canvas and the steer pad

// Keep the weapon controls (index.html #weapon-dpad) level with the move
// controls, straight across on the left edge: vertically centred on the move
// cluster, anchored left instead of right. Whichever is taller (the cluster
// is ~2.16 keys; the fire pad is one key as a row on a big touch viewport,
// ~2.8 keys as the column desktop and phones use — style.css) the two stay
// centred on each other. Called at the end of resize() and again by game.js (via
// ui.layoutWeaponPad) the moment the pistol is picked up and the pad stops
// being display:none, since resize() may not fire around then. A zero-size
// rect (still hidden) just parks it at the cluster's centre — harmless, and
// the follow-up call once it's visible fixes it.
function positionWeaponPad() {
  const r = dpad.getBoundingClientRect();
  const wr = weaponDpad.getBoundingClientRect();
  weaponDpad.style.left = '20px';
  weaponDpad.style.right = 'auto';
  weaponDpad.style.bottom = 'auto';
  // Centred on the cluster, but never past the bottom of the window: when
  // resize() has had to clamp the cluster to the lowest on-screen row (its
  // "neither margin fits" case — e.g. a 1440x900 window, 80px side margin,
  // 20px below the canvas), a fire pad taller than the cluster (the
  // two-key column, ~0.3 keys taller each end) would otherwise hang its
  // bottom key ~12px off-screen. Sliding it up to sit flush instead costs
  // nothing — the two pads are a few px off-centre from each other only in
  // exactly the window shape where the cluster is already overlapping the
  // canvas anyway.
  const centred = r.top + r.height / 2 - wr.height / 2;
  weaponDpad.style.top = `${Math.round(Math.min(centred, window.innerHeight - wr.height))}px`;
}

function resize() {
  // The canvas's own size is unaffected by the dpad — it's picked exactly
  // as before, filling as much of the actual viewport as an integer scale
  // allows. The dpad below just uses whatever margin that leaves rather
  // than shrinking the canvas to manufacture room for itself.
  const rawScale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  const flooredScale = Math.floor(rawScale);
  // An integer multiple keeps pixel-art edges crisp, but on a small/mobile
  // screen that floors all the way down to 1x, leaving most of the
  // viewport empty — better to fill the screen at a fractional scale
  // (image-rendering: pixelated still looks fine, just not perfectly even)
  // than to render a postage stamp in the corner.
  const scale = flooredScale >= 2 ? flooredScale : Math.max(rawScale, 1);
  const canvasWidth = CANVAS_WIDTH * scale;
  const canvasHeight = CANVAS_HEIGHT * scale;
  screen.style.width = `${canvasWidth}px`;
  screen.style.height = `${canvasHeight}px`;

  // #app centers the canvas in the full viewport, so each side gets an
  // equal share of whatever width is left over. The minimap fills that
  // margin (minus its own edge gaps) instead of sitting at a fixed size
  // that's lost in a much bigger sidebar on a wide window.
  const sidebarWidth = (window.innerWidth - canvasWidth) / 2;
  const minimapMin = isTouchPrimary() ? MOBILE_MINIMAP_MIN : MINIMAP_MIN;
  const size = Math.round(Math.max(minimapMin, Math.min(MINIMAP_MAX, sidebarWidth - 32)));
  minimap.el.style.width = `${size}px`;

  // Keycap size (style.css's --key) drives both the MOVE pad (#steer-pad)
  // and the FIRE cue (#weapon-dpad) on the opposite edge, so it lives on
  // :root. The inverted-T cluster is 3.32·key wide (3 caps + 2 gaps of
  // 0.16·key), ~2.16·key tall.
  //   - Touch: the pad is the real control — size the keys for a thumb,
  //     scaled a little to the viewport but held in a comfortable tap range.
  //   - Desktop: it's a "how to play" cue — fill the sidebar column beside
  //     the game, as wide as fits without running into the minimap above.
  if (isTouchPrimary()) {
    // Bigger targets — the pad is what people are actually dodging with, and
    // small keys were costing hits. Scales with the viewport's short side
    // (so portrait doesn't blow it up) and stays in a thumb-friendly band.
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const key = Math.round(Math.max(58, Math.min(80, shortSide * 0.22)));
    document.documentElement.style.setProperty('--key', `${key}px`);
  } else {
    const byWidth = (sidebarWidth - 24) / 3.32;
    const byHeight = (window.innerHeight - size - 80) / 2.4;
    const key = Math.max(30, Math.min(120, byWidth, byHeight));
    document.documentElement.style.setProperty('--key', `${Math.round(key)}px`);
  }

  // Which margin actually has room for the dpad varies a lot by window
  // shape, and picking the wrong one is exactly what went wrong before: on
  // a typical wide desktop window the strip *beside* the canvas is huge
  // (hundreds of px) while the strip *below* it is often under 40px — an
  // integer-scale canvas height rarely leaves much vertical slack once it's
  // already claimed most of the width. So check the side margin first
  // (cheap and static — that whole column never overlaps the canvas at any
  // vertical position, so no dynamic top is even needed there), and only
  // fall back to positioning below the canvas — computed from its actual
  // rendered bottom edge via getBoundingClientRect, not re-derived from the
  // centering math above — when the window is narrow enough that the side
  // margin can't fit it but a bottom margin can. Real dpad dimensions (not
  // hardcoded copies of style.css's numbers) so this can't drift out of
  // sync with the CSS.
  const screenRect = screen.getBoundingClientRect();
  const dpadRect = dpad.getBoundingClientRect();
  const rightMargin = window.innerWidth - screenRect.right;
  const bottomMargin = window.innerHeight - screenRect.bottom;

  if (rightMargin >= dpadRect.width + DPAD_GAP) {
    dpad.style.right = '20px';
    // Centre it vertically in the empty column between the minimap (which
    // sits at the top of this same margin) and the bottom of the window,
    // so the big desktop cue doesn't look stranded down in the corner.
    const minimapBottom = minimap.el.getBoundingClientRect().bottom;
    const top = minimapBottom + Math.max(
      12,
      (window.innerHeight - minimapBottom - 20 - dpadRect.height) / 2,
    );
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(top)}px`;
  } else if (bottomMargin >= dpadRect.height + DPAD_GAP) {
    // Below the canvas — but on a tall phone with a short landscape canvas
    // there's a lot of empty space down here, and a pad floating right
    // under the canvas ends up mid-screen, out of comfortable thumb reach.
    // Sit it near the bottom edge instead, never higher than just-below the
    // canvas and never off-screen.
    const nearBottom = window.innerHeight - dpadRect.height - 28;
    const justBelowCanvas = screenRect.bottom + DPAD_GAP;
    const top = Math.min(
      window.innerHeight - dpadRect.height,
      Math.max(justBelowCanvas, nearBottom),
    );
    dpad.style.right = '20px';
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(top)}px`;
  } else {
    // Neither margin fits it — a window shaped so tightly that avoiding the
    // canvas entirely isn't possible without shrinking it, which the canvas
    // never does. Clamp to the lowest fully on-screen row instead of
    // pushing the dpad off the bottom of the screen: a dpad you can still
    // see and press, overlapping the canvas slightly, beats one that's
    // technically clear of it but invisible.
    dpad.style.right = '20px';
    dpad.style.bottom = 'auto';
    dpad.style.top = `${Math.round(window.innerHeight - dpadRect.height)}px`;
  }

  positionWeaponPad();
  fitTownBanner();
  placeSaveIndicator();
}
window.addEventListener('resize', resize);
resize();

// Shared downstream-distance clock: written by Game each frame, read by
// obstacles/terrain/whales whenever they need "what's here right now?"
const world = { distance: 0 };

const obstacles = createObstacleField(world);
const input = new Input();
createTouchControls(input);

const ui = {
  hud: document.getElementById('hud'),
  hudScore: document.getElementById('hud-score'),
  hudSpeedFill: document.getElementById('hud-speed-fill'),
  hudHealthFill: document.getElementById('hud-health-fill'),
  hudBlockade: document.getElementById('hud-blockade'),
  hudBlockadeLabel: document.getElementById('hud-blockade-label'),
  hudBlockadeFill: document.getElementById('hud-blockade-fill'),
  hudDiable: document.getElementById('hud-diable'),
  hudDiableFill: document.getElementById('hud-diable-fill'),
  damageFlash: document.getElementById('damage-flash'),
  titleScreen: document.getElementById('title-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  gameoverTitle: document.getElementById('gameover-title'),
  finalStats: document.getElementById('final-stats'),
  restartBtn: document.getElementById('restart-btn'),
  pauseScreen: document.getElementById('pause-screen'),
  milestoneBanner: document.getElementById('milestone-banner'),
  bossBanner: document.getElementById('boss-banner'),
  weaponPad: weaponDpad,
  // Individual buttons inside the pad — game.js's syncWeaponControls()
  // toggles each independently so a pistol-only run doesn't show an X
  // button that does nothing (and vice versa for a musket-only respawn).
  fireZBtn: document.getElementById('fire-z'),
  fireXBtn: document.getElementById('fire-x'),
  // Called by game.js right after it un-hides the weapon pad, so the pad is
  // positioned immediately instead of waiting for the next window resize.
  layoutWeaponPad: positionWeaponPad,
  minimap,
};

// A change that breaks one system shouldn't leave the whole page frozen on
// the title with no clue why. This routes the error to the on-screen panel
// defined in index.html (window.showVoyageursError) — same UI whether the
// failure is at module load, in the Game constructor, or mid-frame. See
// loop() below for the per-frame guard and test/smoke.mjs for the test that
// catches these before they ship.
function showFatalError(err, context, { fatal = true } = {}) {
  console.error(`Voyageurs crashed while ${context}:`, err);
  const detail = (err && (err.stack || err.message)) || String(err);
  const summary = (err && err.message) || String(err);
  if (typeof window.showVoyageursError === 'function') {
    window.showVoyageursError(summary, detail, { when: context, fatal });
  } else {
    // Panel helper somehow isn't there (index.html edited?) — last resort.
    window.__voyageursErrorShown = true;
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(12,10,20,0.94);' +
      'color:#f4d79a;font:12px/1.5 monospace;padding:24px;overflow:auto';
    box.textContent = `Voyageurs error while ${context}:\n\n${detail}`;
    document.body.appendChild(box);
  }
}

// "Now playing" card (top-left, under the HUD — #now-playing in
// index.html, inside #top-left-panel). Built here
// rather than in music.js so the audio layer stays DOM-free — music.js just
// calls onTrack({ title, artist }) whenever a new track actually starts.
// Stays up for as long as that track plays (used to auto-hide after 7s —
// left up now so the song credit is always readable, not just glimpsed),
// and gets replaced in place the moment the next track starts.
const nowPlayingEl = document.getElementById('now-playing');
function showNowPlaying(track) {
  if (!track || !nowPlayingEl) return;
  nowPlayingEl.textContent = '';
  const head = document.createElement('div');
  head.className = 'np-head';
  const eq = document.createElement('div');
  eq.className = 'np-eq';
  eq.innerHTML = '<span></span><span></span><span></span><span></span>';
  const label = document.createElement('div');
  label.className = 'np-label';
  label.textContent = 'NOW PLAYING';
  head.append(eq, label);
  const title = document.createElement('div');
  title.className = 'np-title';
  title.textContent = track.title;
  const artist = document.createElement('div');
  artist.className = 'np-artist';
  artist.textContent = track.artist;
  nowPlayingEl.append(head, title, artist);

  nowPlayingEl.classList.add('show');
  syncMediaSession(track);
}

// Media Session: tell the OS what's playing (Media Session API). On a phone
// this is what gets the music treated as *media* rather than a web page
// making noise — lock-screen/notification controls with the track's own
// title and artist, and, the part that matters here, the browser is far
// more willing to keep an <audio> element going once the screen is off
// when it's registered as a media session. Belt-and-braces with the wake
// lock below: that keeps the screen on while you play; this keeps the
// music going if the screen goes off anyway (battery saver, a browser
// without wake lock, the OS overriding it) — "I don't mind about the
// screen going off, but can we preserve the audio?" The game itself is
// frozen while hidden (rAF stops), so this is a music player at that
// point, which is exactly the right thing to be. play/pause from the
// lock screen map onto music.js's own resume()/stop() — the same pair a
// capsize + restart already uses, so the track picks up where it was.
// Feature-detected: no-op anywhere without it (desktop Firefox, the smoke
// test's shim).
function syncMediaSession(track) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: 'Voyageurs' });
    navigator.mediaSession.playbackState = 'playing';
  } catch { /* metadata is a nicety — never let it break the card */ }
}
// Background music — browsers block autoplay until a real user gesture, so
// this starts on the player's first keypress or click rather than on load.
// The put-in's own tune, and only there (isPutIn() above and
// audio/music.js's OPENING_TRACK) — dealt by beginRun() via
// setOpeningPinned() once the start point is actually known.
const music = createMusic({ onTrack: showNowPlaying });
if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('play', () => { music.resume(); navigator.mediaSession.playbackState = 'playing'; });
    navigator.mediaSession.setActionHandler('pause', () => { music.stop(); navigator.mediaSession.playbackState = 'paused'; });
  } catch { /* an action the platform doesn't support — fine */ }
}

// music.js's own debug() calls, on-screen instead of console-only — behind
// ?musicdebug=1, never shown otherwise. console.log alone is invisible on a
// phone with no devtools attached, which is exactly the situation every
// past mobile-only audio bug here has had to be diagnosed blind from (see
// debug()'s own comment) — this exists so the *next* one doesn't have to be.
if (new URLSearchParams(window.location.search).get('musicdebug') === '1') {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:38vh;overflow-y:auto;' +
    'z-index:2147483646;background:rgba(8,8,14,0.9);color:#8fe08f;' +
    'font:10px/1.4 monospace;padding:6px 8px;white-space:pre-wrap;pointer-events:none';
  document.body.appendChild(panel);
  window.addEventListener('voyageurs-music-debug', (e) => {
    const line = document.createElement('div');
    line.textContent = `${new Date().toISOString().slice(11, 19)}  ${e.detail}`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  });
}

// The title menu (index.html #title-screen). Asked for as "instead of just
// saying VOYAGEURS, I want to see a menu": NEW GAME always, CONTINUE only
// when there's a saved checkpoint to go back to — and nothing, not the
// canoe and not the music, starts until one of them is picked. Replaces
// the old intro, which was a caption fading out over a run that had
// already launched underneath it. The checkpoint itself is still the
// implicit one (this file's top comment) — saved silently as you go, this
// is just the one place it's now surfaced.
//
// An explicit ?start= skips the menu: it's a dev cheat (or a ?debug jump)
// that has already said where to go, and a menu in the way of every jump
// would be the obvious annoyance.
let game = null;
// The painted dusk-on-the-fjord backdrop behind the menu
// (world/titleScene.js) — null with an explicit ?start=, which never shows
// the menu. Failing to build it is never allowed to take the menu down
// with it: a black backdrop is the old look, not a broken game.
let titleScene = null;

// Player-facing name for a saved checkpoint, for the CONTINUE button. Every
// checkpoint is a START_KEYWORD_LIST position or a VILLAGES dock (the same
// two sources CHECKPOINT_CANDIDATES_BY_SEGMENT is built from), so an exact
// match is expected; anything else (an old save from before a waypoint
// moved) just gets no subtitle. Not debugWaypoints(): that drops villages
// whose name is also a keyword, and Kingston's *dock* is still a candidate.
export function checkpointLabel(cp) {
  if (!cp) return null;
  const at = (w) => w.segment === cp.segment && Math.abs(w.flowDistance - cp.flowDistance) < 0.5;
  const named = START_KEYWORD_LIST.find(at) ?? VILLAGES.find(at);
  return named ? (named.label ?? named.name) : null;
}

// New Game "removes everything from the cache": every voyageurs-* key in
// localStorage, not just the checkpoint, so anything saved later is
// covered without having to remember this. Deliberately NOT the service
// worker's offline audio cache — that's ~88 MB of music, not progress, and
// wiping it would just make the next run re-download it all.
export function clearSavedProgress() {
  clearCheckpointStorage();
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('voyageurs-')) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* storage unavailable — nothing saved to clear */
  }
  savedCheckpoint = null;
}

// Build the Game at `start` ({ segment, flowDistance }) and get it going.
// Called once: by the menu, or straight away for an explicit ?start=.
// Exported so the smoke test can drive the real startup path without a
// click.
// `intoVillage`: open inside that town's on-foot scene, the way docking there
// does (CONTINUE from a town save — see villageAtCheckpoint()).
export function beginRun(start, { fromMenu = false, intoVillage = null } = {}) {
  if (game) return game;
  ui.titleScreen.classList.add('hidden');
  document.body.classList.remove('at-title');
  titleScene?.dismiss();
  music.setOpeningPinned(isPutIn(start.segment, start.flowDistance));
  try {
    game = new Game({ ctx, water, input, obstacles, world, ui, music, startFlowDistance: start.flowDistance, startSegment: start.segment, easyMode: startedEasy, startFurs: start.furs ?? 0 });
    // ?start=diable is a checkpoint, not just a spawn point — hand over the
    // pistol and mark it so a capsize respawns at the fight.
    if (startedAtDiable) game.armDiableCheckpoint();
    // ?start=gatineau — open its on-foot scene directly, the same call the
    // real dock-touch path uses (see startedAtGatineau's own comment).
    if (startedAtGatineau) {
      const gatineau = VILLAGES.find((v) => v.name === 'Gatineau' && v.segment === 'lawrenceWest');
      if (gatineau) game.enterVillage(gatineau);
    }
    // CONTINUE from a town save — same call, same reason.
    if (intoVillage) game.enterVillage(intoVillage);
    // Every ?start= cheat begins from a calm drift, not cruising speed. Set
    // before game.js's first tick runs: a cheat otherwise begins at the same
    // BASE_SPEED a normal playthrough carries into any segment — first
    // reported for Kingston alone ("already screaming fast" for a cheat
    // whose whole point is a slow, chill approach), then for all of them:
    // "my canoe is already flying out of the gate when the game kicks in."
    // MIN_SPEED is this game's own "actual chill slow speed, not just a mild
    // step down from medium" (see its own comment, game.js) — holding Up
    // still accelerates normally from there, same as a real approach, just
    // starting from a drift instead of already at cruising speed. Harmless
    // for the cheats that open a village scene directly (gatineau) — the
    // speed only matters once you're back on the water.
    // (?start=kingston used to need a second touch here too — priming Un
    // Siècle d'Avance as the lead track. Gone: the Kingston playlist now
    // always plays in fixed order from that track, cheat or not — see
    // music.js's KINGSTON_TRACK/playKingstonTrack(); the arrival banner and
    // track fire on their own the instant the update loop first ticks.)
    if (startedExplicitly) {
      game.speed = MIN_SPEED;
    }

    // Lets the index.html error handler word later crashes as "running the
    // game" rather than "loading the game".
    window.__voyageursReady = true;
  } catch (err) {
    showFatalError(err, 'starting up');
  }
  // The menu click is the user gesture browsers want before audio — start
  // the music on it directly. (The window listeners below would catch a
  // mouse click too, but a keyboard Enter's keydown has already gone by
  // before we get here.) Not for an explicit ?start= at load: there's no
  // gesture yet, and the first real one gets it through those listeners.
  if (fromMenu) music.start();
  return game;
}

const continueBtn = document.getElementById('continue-btn');
const newGameBtn = document.getElementById('new-game-btn');
const titleMenuBtns = [continueBtn, newGameBtn];
if (explicitStart) {
  // The town (or the last save point) this run starts at becomes the save
  // straight away, silently — see startCheckpointFor(). The 2s check and
  // the dock landing then see it already stored and stay quiet there.
  const startCp = startCheckpointFor(explicitStart);
  if (startCp) {
    saveCheckpointToStorage(startCp.segment, startCp.flowDistance, 0);
    savedCheckpoint = { segment: startCp.segment, flowDistance: startCp.flowDistance, furs: 0 };
  }
  beginRun(explicitStart);
} else {
  // Hides the in-game chrome (style.css's body.at-title) while the menu is
  // up — a MUSIC ON button with no music and a steer pad with no canoe,
  // floating around an empty screen, read as broken rather than waiting.
  document.body.classList.add('at-title');
  try {
    titleScene = createTitleScene();
    document.body.insertBefore(titleScene.element, document.getElementById('ui'));
  } catch (err) {
    console.warn('title backdrop failed to build — carrying on without it', err);
    titleScene = null;
  }
  const label = checkpointLabel(savedCheckpoint);
  if (savedCheckpoint) {
    continueBtn.classList.remove('hidden');
    const sub = document.getElementById('continue-where');
    // Where, and what's in the hold — "LA MALBAIE · 12 FURS", one line.
    // Each part is its own unbreakable span (style.css's #continue-where
    // span), so on a phone too narrow for a long town name plus furs the
    // line can only break at the dot, never mid-name. (A two-line version
    // was tried and turned down: "I still want to see 'Le Wendigo' and
    // '6 Furs' on the same line.")
    const furs = savedCheckpoint.furs || 0;
    const parts = [label && label.toUpperCase(), furs > 0 && `${furs} FUR${furs === 1 ? '' : 'S'}`].filter(Boolean);
    const nodes = [];
    parts.forEach((text, i) => {
      if (i) nodes.push(document.createTextNode(' · '));
      const part = document.createElement('span');
      part.textContent = text;
      nodes.push(part);
    });
    sub?.replaceChildren(...nodes);
  }
  continueBtn.addEventListener('click', () => {
    if (savedCheckpoint) beginRun(savedCheckpoint, { fromMenu: true, intoVillage: villageAtCheckpoint(savedCheckpoint) });
  });
  newGameBtn.addEventListener('click', () => {
    clearSavedProgress();
    beginRun({ segment: 'fjord', flowDistance: 0 }, { fromMenu: true });
  });
  // Up/Down (or W/S) move between the two, Enter/Space press the focused
  // one (a <button>'s own behaviour). CONTINUE gets the focus when it's
  // there — picking up where you left off is the common case.
  (savedCheckpoint ? continueBtn : newGameBtn).focus?.();
  window.addEventListener('keydown', (e) => {
    if (game || ui.titleScreen.classList.contains('hidden')) return;
    const dir = e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : e.code === 'ArrowUp' || e.code === 'KeyW' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const shown = titleMenuBtns.filter((b) => !b.classList.contains('hidden'));
    const at = shown.indexOf(document.activeElement);
    shown[(at + dir + shown.length) % shown.length].focus?.();
  });
}

const muteBtn = document.getElementById('mute-btn');
// Icons, not words (core/hudIcons.js): the speaker, with a slash through
// the same speaker while the music's off. The label moves to title +
// aria-label, which is where a screen reader and a hovering mouse look.
function syncMuteBtn(muted) {
  muteBtn.classList.toggle('muted', muted);
  muteBtn.innerHTML = speakerIcon(muted);
  const label = muted ? 'Turn the music back on' : 'Turn the music off';
  muteBtn.title = label;
  muteBtn.setAttribute('aria-label', label);
  muteBtn.setAttribute('aria-pressed', String(muted));
}
syncMuteBtn(music.muted);
muteBtn.addEventListener('click', () => {
  const muted = music.toggleMute();
  syncMuteBtn(muted);
  // Unmuting is a natural "wait, what is this?" moment — flash the card
  // back up for the track that's currently going.
  if (!muted) showNowPlaying(music.nowPlaying);
});
// Mobile browsers are picky about exactly which gesture type counts as
// "real" user activation for unlocking audio, and (confirmed on a real
// device) the very first attempt can fail for reasons outside this code's
// control — so these deliberately stay attached rather than {once: true}.
// music.start() only actually retries play() until one succeeds (see its
// own comment); once that happens every later call here is an instant
// no-op, so leaving these listeners running permanently costs nothing.
for (const evt of ['pointerdown', 'touchend', 'keydown', 'click']) {
  window.addEventListener(evt, () => {
    // Not over the title menu — the music waits for New Game/Continue
    // (beginRun() starts it on that same gesture).
    if (!game) return;
    music.start();
    // Retry the screen wake lock on a real gesture too (defined further
    // down; hoisted) — for a browser that wants activation before
    // granting one, or after a refusal.
    syncWakeLock();
  });
}

// Offline play — the service worker (public/sw.js, filled in by
// scripts/postbuild.mjs). Asked for as "I'm about to go on a camping trip
// where I'll be totally offline, but I would love to get the game cached
// on my phone." The worker keeps the app shell on its own the moment it
// installs; the music (~88 MB, 26 tracks) it pulls in on request — and
// that request is made here, automatically, as soon as the worker is
// ready: a first cut put a SAVE FOR OFFLINE button on the pause screen
// for it, rejected — "I want that to just happen automatically without
// user input." The one gate is the browser's own Data Saver signal
// (navigator.connection.saveData, Chrome/Android): with that on, 88 MB
// unasked is the wrong call and the cache fills only as tracks actually
// get played (sw.js does that regardless). The pause screen shows a
// passive "N/26 TRACKS SAVED" line from the worker's progress replies,
// so it's possible to tell when it's safe to lose signal. Production
// builds only: the template's placeholders are only filled by postbuild,
// and a worker caching the dev server's module graph would make every
// edit look like it hadn't taken.
const offlineStatus = document.getElementById('offline-status');
function showOfflineStatus(s) {
  if (!offlineStatus) return;
  offlineStatus.classList.remove('hidden');
  if (s.complete) {
    offlineStatus.textContent = `READY TO PLAY OFFLINE — ${s.total} TRACKS SAVED`;
  } else if (s.failed) {
    offlineStatus.textContent = `SAVING FOR OFFLINE: ${s.done}/${s.total} TRACKS (${s.failed} FAILED — WILL RETRY NEXT VISIT)`;
  } else if (s.skipped) {
    offlineStatus.textContent = `OFFLINE MUSIC NOT SAVED — DATA SAVER IS ON (${s.done}/${s.total} TRACKS)`;
  } else {
    offlineStatus.textContent = `SAVING FOR OFFLINE: ${s.done}/${s.total} TRACKS`;
  }
}
// import.meta.env is vite's — absent under plain node (the smoke test
// loads this file), hence the try.
let isProdBuild = false;
try { isProdBuild = !!import.meta.env.PROD; } catch { /* not vite: dev-ish, no worker */ }
if (isProdBuild && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && offlineStatus) {
  const saveData = !!navigator.connection?.saveData;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'audio-status') showOfflineStatus({ ...e.data, skipped: saveData && !e.data.complete });
  });
  navigator.serviceWorker.register('/sw.js').then(async (reg) => {
    // The worker that's actually controlling this page, once there is one
    // (first ever load: the fresh install claims the page on activate).
    const worker = (await navigator.serviceWorker.ready).active;
    worker?.postMessage({ type: saveData ? 'audio-status' : 'cache-audio' });
    // A new build's worker takes over on the next load (skipWaiting +
    // clients.claim in sw.js) — nothing to prompt about here, the badge
    // already shows which build is running.
    reg.update?.();
  }).catch((e) => {
    console.warn('service worker registration failed', e);
  });
}

// Escape has no touch equivalent, hence a visible button — shown for every
// input type, not just touch, since a tappable/clickable pause control is
// a reasonable thing to want on desktop too. The icon flips from pause to
// play while paused, so it's obvious the same button gets you back.
const pauseBtn = document.getElementById('pause-btn');
let pauseBtnShows = null;
// Also called from loop(): game.js can unpause on its own (reset() on a
// restart clears `paused`), and the word button used to keep saying
// RESUME over a running game when that happened. Only touches the DOM on
// an actual change.
function syncPauseBtn() {
  const paused = !!game?.paused;
  if (paused === pauseBtnShows) return;
  pauseBtnShows = paused;
  pauseBtn.innerHTML = paused ? playIcon() : pauseIcon();
  const label = paused ? 'Resume the game' : 'Pause the game';
  pauseBtn.title = label;
  pauseBtn.setAttribute('aria-label', label);
}
syncPauseBtn();
function togglePause() {
  game?.togglePause();
  syncPauseBtn();
}

// --- the ?debug waypoint picker (core/debugMenu.js) ----------------------
// Only built when ?debug is on the URL: no overlay element, no listener,
// nothing in the DOM for an ordinary player.
const debugMenu = isDebugMode() ? createDebugMenu({
  waypoints: debugWaypoints(),
  describeCheckpoint: () => (savedCheckpoint
    ? `${savedCheckpoint.segment} @ ${Math.round(savedCheckpoint.flowDistance)}`
    : null),
  onPick: (wp) => {
    // Down it goes straight away. The navigation below is what really
    // replaces the screen, but a browser can take a moment over it (and a
    // blocked navigation never gets there at all), and leaving a
    // full-screen overlay sitting over the game in the meantime is the
    // thing this was reported for.
    debugMenu.hide();
    // Clearing first is what makes the picker mean what it says. ?start=
    // already beats the checkpoint for a named waypoint, but the put-in has
    // no ?start= to give (debugStartUrl's own comment) — without the clear,
    // "the very beginning" would just resume at the saved checkpoint again,
    // which is the exact problem this is here to solve. Clearing for every
    // waypoint, not only the put-in, keeps it predictable: wherever you
    // jump to is now where you are, and progress re-saves from there.
    clearCheckpointStorage();
    savedCheckpoint = null;
    markDebugJump(); // the load this causes keeps the picker shut
    try {
      window.location.assign(debugStartUrl(window.location.search, window.location.hash, window.location.pathname, wp));
    } catch {
      // Sandboxed contexts can forbid navigation — leave the overlay up
      // rather than dying silently with no idea why nothing happened.
      console.warn('?debug: navigation blocked, cannot jump to', wp.label);
    }
  },
  onClearCheckpoint: () => {
    clearCheckpointStorage();
    savedCheckpoint = null;
  },
}) : null;
if (debugMenu) {
  document.body.appendChild(debugMenu.element);
  // Open on any ?debug (you're here to choose a starting point), except the
  // load a jump just caused — that one has already made its choice and
  // wants the game on screen. Backquote either way.
  if (shouldOpenDebugMenuOnLoad({ justJumped: consumeDebugJump() })) debugMenu.show();
}

window.addEventListener('keydown', (e) => {
  // Backquote toggles the picker. Deliberately a key the game itself never
  // reads (core/input.js is arrows/WASD plus Z/X/C) so this can't shadow a
  // control, and it's where a debug console lives in most things.
  if (debugMenu && e.code === 'Backquote') {
    e.preventDefault();
    debugMenu.toggle();
    return;
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    // Esc closes the picker if it's up, rather than pausing behind it —
    // otherwise dismissing the overlay silently left the game paused.
    if (debugMenu?.isOpen()) {
      debugMenu.hide();
      return;
    }
    togglePause();
  }
});

pauseBtn.addEventListener('click', togglePause);

// The on-screen fire button (index.html #fire-z). Drives the exact same
// path the Z key does — input.onWeaponFire, wired by game.js, which ignores
// the shot unless you're actually paddling the river. One press = one shot.
// The lit state mirrors input.js's keycap feedback so tap and keypress look
// the same. Kept clear of whether the pad is currently shown — game.js
// handles that; a press on a display:none button can't reach here anyway.
const fireBtn = document.getElementById('fire-z');
fireBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onWeaponFire?.('pistol');
  fireBtn.classList.add('active');
});
const clearFireBtn = () => fireBtn.classList.remove('active');
for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  fireBtn.addEventListener(evt, clearFireBtn);
}

// The musket's own on-screen fire button (index.html #fire-x) — same
// wiring as #fire-z above, one weapon name over.
const fireMusketBtn = document.getElementById('fire-x');
fireMusketBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onWeaponFire?.('musket');
  fireMusketBtn.classList.add('active');
});
const clearFireMusketBtn = () => fireMusketBtn.classList.remove('active');
for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  fireMusketBtn.addEventListener(evt, clearFireMusketBtn);
}

let lastTime = performance.now();
let loopBroken = false;
// Throttle for the implicit checkpoint check (this file's own top
// comment) — real progress doesn't need checking 60x a second, and a
// couple-dozen-entry scan every frame is wasted work for no benefit. Tied
// to accumulated dt, not wall time, so it naturally pauses along with
// everything else while the tab is backgrounded (rAF itself throttles
// then) rather than firing a burst of saves on return.
const CHECKPOINT_CHECK_INTERVAL = 2;
let checkpointCheckTimer = 0;
// The town loop() last saw you land in — see its landing check.
let landedIn = null;

// The one place a checkpoint is written, for both ways a save happens
// (passing a waypoint, landing in a town): only if it's further along than
// what's already saved — which is also what stops the same town saving
// twice (landingCheckpoint()'s comment) — with the furs in the hold right
// now, and the SAVING canoe to say so.
//
// Compared against what's actually in storage, read fresh every time, not
// an in-memory copy: "I want you to check what's in the browser cache, and
// if it's the same save point, I don't want you to save again." The same
// save point (or one behind it) is never written twice and never shows the
// SAVING canoe.
export function isNewSave(cp, stored = loadCheckpoint()) {
  return !!cp && isFurtherAlong(cp, stored);
}
function recordCheckpoint(cp) {
  if (!game || !isNewSave(cp)) return false;
  const furs = game.furs;
  saveCheckpointToStorage(cp.segment, cp.flowDistance, furs);
  savedCheckpoint = { segment: cp.segment, flowDistance: cp.flowDistance, furs };
  showSaving();
  return true;
}
// Screen Wake Lock: keep the phone's screen awake while a run is actually
// live. Reported as "it goes to sleep pretty quickly" on a phone —
// paddling is long stretches of small taps on the steer pad, or none at
// all while drifting, and a phone's idle timer doesn't care that a game is
// running. Held while there's a game in the 'playing' state that isn't
// paused (never over the title, the pause screen or a game-over — those
// can sleep), and only while the page is visible: the platform drops the
// lock itself the moment the tab is hidden or the screen does go off, so
// visibilitychange re-requests it on the way back. Feature-detected;
// request() can also be refused outright (low-battery mode, some policies)
// and that's just silently no lock — the Media Session registration above
// is what carries the music through a screen-off in that case. Not tied
// to a user gesture on purpose: the game launches straight into play, so
// this has to work from the loop itself, and current Chrome/Safari allow
// that for a visible document — the gesture listeners below also poke it
// for any browser that wants activation first.
let wakeLock = null;
let wakeLockWanted = false;
function syncWakeLock() {
  if (typeof navigator === 'undefined' || !navigator.wakeLock || typeof document === 'undefined') return;
  const want = wakeLockWanted && document.visibilityState === 'visible';
  if (want && !wakeLock) {
    const req = navigator.wakeLock.request('screen');
    // Mark it held immediately so a burst of frames doesn't fire a stack
    // of requests; the real sentinel replaces the placeholder on resolve.
    wakeLock = req;
    req.then(
      (sentinel) => {
        wakeLock = sentinel;
        sentinel.addEventListener('release', () => { if (wakeLock === sentinel) wakeLock = null; });
        // The want may have flipped while the request was in flight.
        if (!(wakeLockWanted && document.visibilityState === 'visible')) sentinel.release().catch(() => {});
      },
      () => { wakeLock = null; }, // refused — nothing to hold
    );
  } else if (!want && wakeLock && typeof wakeLock.release === 'function') {
    const held = wakeLock;
    wakeLock = null;
    held.release().catch(() => {});
  }
}
function setWakeLockWanted(want) {
  if (want === wakeLockWanted) return;
  wakeLockWanted = want;
  syncWakeLock();
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', syncWakeLock);
}

function loop(now) {
  // rAF's timestamp can occasionally predate the performance.now() call
  // above (most noticeably on the very first frame), so clamp dt to
  // non-negative — a negative dt would tick every timer in the game
  // backwards for a frame.
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 1 / 20));
  lastTime = now;
  setWakeLockWanted(!!game && !loopBroken && game.state === 'playing' && !game.paused);
  syncPauseBtn();
  syncTownBanner();
  if (game && !loopBroken) {
    try {
      game.update(dt);
    } catch (err) {
      // Stop calling update rather than re-throwing the same error 60x a
      // second — the last frame it managed to draw stays on screen under
      // the error overlay.
      loopBroken = true;
      showFatalError(err, 'running the game');
    }
    // Landing in a town saves there and then, not on the next throttled
    // check below — asked for as "if I land in a town, I want the game to
    // get saved there, inside the town." Once per landing (landedIn tracks
    // it, cleared on casting off), and through the same recordCheckpoint()
    // as passing by, so the two can never both save the same town.
    if (game.mode === 'village') {
      if (game.currentVillage !== landedIn) {
        landedIn = game.currentVillage;
        if (!game.journeyComplete) recordCheckpoint(landingCheckpoint(landedIn));
      }
    } else {
      landedIn = null;
    }
    checkpointCheckTimer += dt;
    if (checkpointCheckTimer >= CHECKPOINT_CHECK_INTERVAL) {
      checkpointCheckTimer = 0;
      // Reaching Kingston is the end of the run — clear the save so a
      // completed journey doesn't leave a returning player stuck reloading
      // at the very end forever. There's no win screen or Play Again any
      // more (game.js's journeyComplete — Kingston just silently won't let
      // you leave), so this is now the only thing that makes a reload after
      // arriving start a fresh run.
      if (game.journeyComplete) {
        if (savedCheckpoint) {
          clearCheckpointStorage();
          savedCheckpoint = null;
        }
      } else {
        recordCheckpoint(furthestCheckpointReached(game.segment, game.flowDistance));
      }
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
