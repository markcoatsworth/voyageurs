// The three numbers that lay the segments out on path.js's shared number
// line — split out of path.js so route.js can read them without importing
// path.js itself. route.js used to import them from path.js, which made
// path.js unable to import route.js back (a cycle), and path.js's braidAt()
// now needs the villages: no sandbar may sit on a dock (see
// BRAID_SUPPRESSED_CYCLES there). path.js re-exports all three, so every
// other importer is unchanged.

// Roughly how far downstream (in meters travelled) the fjord opens out into
// the Saint Lawrence — the game's version of arriving at Tadoussac. This is
// where Tadoussac itself sits (river/route.js) and where the fjord segment
// ceilings (game.js) — not where the channel actually reaches full width;
// see WIDTH_EASE_DISTANCE below for why those are two different numbers.
export const MOUTH_DISTANCE = 900;

// centerX/widthAt/braidAt/rapidsStrength below are pure functions of one
// shared number line — fine when the whole river was one continuous line,
// not so fine now that Tadoussac is a real three-way junction (the fjord in,
// the Saint Lawrence east to Sept-Îles, the Saint Lawrence west to Québec
// City — see river/route.js's module comment). Rather than teach every one
// of these functions about "segments," each segment just gets its own slice
// of the same shared number line: game.js tracks *which* segment is active
// and adds its offset before ever calling into this file, so nothing here
// or in terrain.js/obstacles.js/whales.js/waterGL.js needs to change at
// all — they just see a d value, exactly as before.
//
// lawrenceEast's offset (MOUTH_DISTANCE) is exactly how the estuary already
// worked before segments existed — d simply kept increasing past the mouth.
// lawrenceWest's offset is an arbitrary distant point on the same periodic
// curves, picked (by scanning a few candidates) to be far from
// lawrenceEast's own range — so the two don't visually echo each other
// along their first couple thousand units — *and* to land somewhere calm
// on rapidsStrength() right at its own start, rather than dropping the
// player into near-peak whitewater the instant they commit to this branch
// at Tadoussac's dock.
//
// rideau's offset is picked the same way (scanned for a calm rapids patch
// at its start and no braid island right on the launch point) and sits well
// past lawrenceWest's whole range *and* past the Ottawa gorge trigger in
// widthAt() below — which is why widthAt() checks the rideau branch first.
// The Rideau is the made-up Ottawa-to-Kingston leg (see river/route.js): no
// real river runs that line, so it gets its own bespoke width profile
// rather than borrowing the shared estuary curve.
export const SEGMENT_SHAPE_OFFSET = {
  fjord: 0,
  lawrenceEast: MOUTH_DISTANCE,
  lawrenceWest: 60000,
  rideau: 94080,
};

// How long the Rideau leg takes to paddle end to end, game-world units —
// same role LAWRENCE_WEST_SPAN_DISTANCE plays for that segment (see
// river/route.js). Shorter than the earlier legs on purpose: it's the
// journey's denouement after Le Diable, not another full act.
export const RIDEAU_SPAN_DISTANCE = 1700;
