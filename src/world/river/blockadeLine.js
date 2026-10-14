// Where the British Blockade's line of frigates sits (bossfights/
// blockade.js has the fight itself). Split out so river/path.js can keep
// its sandbars off every frigate's run-in — path.js can't import the fight
// (blockade.js imports path.js), and a sandbar was sitting right across the
// second frigate's gap once the line was laid down. Pure numbers off
// route.js's VILLAGES, like path.js's own dock clearances.
import { VILLAGES } from './route.js';

const KINGSTON = VILLAGES.find((v) => v.name === 'Kingston');
// How far before Kingston the frigate sits. Tuned so the gauntlet
// (APPROACH_RANGE of cannon fire) falls in the open Rideau Lake water
// *between* two riverbank towns, Smiths Falls and Newboro — a village dock
// landing inside the approach corridor would let the player walk ashore
// mid-fight — with a real stretch of clear channel left before the harbour
// narrows toward the arrival. Cannon fire starts ~21 units past Smiths
// Falls's dock; the frigate is ~158 short of Newboro's. (The smoke test
// checks both docks stay outside it.)
//
// With the line of frigates the fight runs longer than the one ship did,
// so the last frigate moved downstream to keep the whole of it between the
// same two docks: Kingston − 590 at 90 apart, − 630 at 70 (the cannon fire
// still starts ~31 past Smiths Falls's dock; the last frigate is ~88 short
// of Newboro's). SHIP_FLOW_DISTANCE is the LAST frigate — the one you're
// past when the fight is over — so everything keyed off "past the
// blockade" (game.js, main.js, the smoke test) still means past all of it.
const SHIP_D_OFFSET = 630;
export const SHIP_FLOW_DISTANCE = KINGSTON.flowDistance - SHIP_D_OFFSET;

// The line: SHIP_COUNT frigates SHIP_SPACING apart, gaps alternating banks.
// The spacing comes from the canoe's own steering, measured on this
// stretch: ~2.7 u/s sideways at full lock on desktop (half that on touch),
// against 16 u/s forward paddling and ~2.5 u/s just riding the current.
// Gap to gap across a ~39-wide channel is ~31 units sideways, ~12s — so
// a canoe flat out can't make the swing, but one that eases off the paddle
// can. That's the fight: managing pace, not just picking a side. First
// cut was 90 apart — "too much spacing between the frigates. Let's try
// maybe 70": 12s over 70 is an average under 6 u/s, still well clear of
// the ~2.5 the current alone carries you. (Touch: ~23s at 1.3 u/s, riding
// the current covers ~58 of the 70 — tighter, still makeable.)
export const SHIP_COUNT = 3;
export const SHIP_SPACING = 70;
// Cannon fire before the FIRST frigate — the same room to find its gap
// that the one ship's 190 gave, less a little since the sails now say
// where it is from the start.
export const FIRST_APPROACH = 110;
export const FIRST_SHIP_FLOW_DISTANCE = SHIP_FLOW_DISTANCE - (SHIP_COUNT - 1) * SHIP_SPACING;
export const BLOCKADE_SHIPS = Array.from({ length: SHIP_COUNT }, (_, i) => FIRST_SHIP_FLOW_DISTANCE + i * SHIP_SPACING);
// No flag islands or other hazards in this much water in front of each
// frigate (and SHIP_CLEAR_AFTER past it) — world/obstacles.js. A rock in a
// 7-wide gap you've just crossed the river to reach is a cheap death.
export const SHIP_CLEAR_BEFORE = 35;
export const SHIP_CLEAR_AFTER = 8;
export function inShipClearZone(d) {
  for (const sd of BLOCKADE_SHIPS) if (d >= sd - SHIP_CLEAR_BEFORE && d <= sd + SHIP_CLEAR_AFTER) return true;
  return false;
}
