// The Saint Lawrence's real width, Tadoussac -> Montréal (the lawrenceWest
// segment), as a baked keyframe table — the same "authored, not formula"
// treatment as gorge.js, and plugged into path.js's widthAt() the same way.
//
// Before this, the whole leg sat on the shared estuary curve's flat top:
// ~48 units (plus wobble) from Tadoussac all the way to Île-Perrot. The
// minimap already drew the real thing — route.js's riverWidthKm on every
// waypoint, 20km off Tadoussac down to ~1km at Québec City — so the two
// disagreed in exactly the place the real river is most famous for
// changing: reported as "the minimap narrows between Québec City and
// Trois-Rivières, the game window doesn't."
//
// The widths are those riverWidthKm figures compressed onto a log scale,
// not scaled linearly: 12 + 8.33 * log2(km), which pins 1km to 12 units
// and Tadoussac's 20km to the 48 the estuary already was (so the segment
// still starts exactly as wide as the fjord mouth it leaves). A true 20:1
// ratio would make Québec City a 2.4-unit ditch; 4:1 still reads as the
// river closing right down to the narrows — at 12 units both banks are on
// screen at once (CANVAS_WIDTH/PIXELS_PER_UNIT = 20) — and opening back up
// past them, with Lac Saint-Pierre beyond Trois-Rivières a second wide
// stretch, which is the shape the map shows.
//
// Two deliberate exceptions, both from Charlemagne on:
//   - Montréal and Île-Perrot are held at 40, not their 2.5km/4km (~23/29).
//     The Island of Montreal (islands.js) is authored to fit inside the
//     ambient channel and *shrinks* to fit anything narrower — it needs
//     ~33 units to keep its full shape (2 * (offset 8 + half 6 + the 2.6
//     sub-channel floor)). The real width across both channels and the
//     island is far more than 2.5km anyway; that figure is one channel.
//   - Charlemagne (1km — really the Rivière des Prairies mouth) is 34, the
//     ramp up to that, since the island's east tip is only ~60 units on.
// Past Île-Perrot nothing here matters: widthAt() eases into the Ottawa
// gorge (gorge.js) from OTTAWA_EASE_START, right at Île-Perrot's dock.
//
// d values are each village's real flowDistance (route.js), duplicated as
// numbers rather than imported: route.js imports path.js, and path.js
// imports this, so reading VILLAGES here would be a circular import. The
// smoke test checks each keyframe still sits on its village, so a re-tuned
// route can't silently slide the narrows away from Québec City.
//
// Between keyframes the width eases (smoothstep), not straight lines: the
// leg's widths go down and back up, and a linear blend would put a hard
// corner in both banks at every village where the trend reverses — most
// visibly right at the Québec City narrows.

const LAWRENCE_WEST = 60000; // path.js's SEGMENT_SHAPE_OFFSET.lawrenceWest (circular import otherwise)

export const LAWRENCE_WEST_WIDTH_KEYFRAMES = [
  { d: LAWRENCE_WEST + 0, width: 48, village: 'Tadoussac' }, // 20km
  { d: LAWRENCE_WEST + 340.27, width: 46, village: 'La Malbaie' }, // 17km
  { d: LAWRENCE_WEST + 511.32, width: 42, village: 'Baie-Saint-Paul' }, // 12km
  { d: LAWRENCE_WEST + 781.43, width: 29, village: 'Beaupre' }, // 4km
  { d: LAWRENCE_WEST + 960.85, width: 12, village: 'Quebec City' }, // 1km — the narrows
  { d: LAWRENCE_WEST + 1391.97, width: 25, village: 'Batiscan' }, // 3km
  { d: LAWRENCE_WEST + 1533.91, width: 37, village: 'Trois-Rivieres' }, // 8km — into Lac Saint-Pierre
  { d: LAWRENCE_WEST + 1807.85, width: 25, village: 'Sorel-Tracy' }, // 3km
  { d: LAWRENCE_WEST + 2042.83, width: 34, village: 'Charlemagne' }, // see above
  // The Island of Montreal stretch (islands.js's MONTREAL_ISLAND_KEYFRAMES,
  // 2102..2318) runs at 64, not 40. At 40 the island — offset 8 north,
  // half-width 6 at its widest — left the north (Rivière-des-Prairies)
  // channel only ~7 units wide, and Montréal's north pier filled most of
  // it: casting off there landed on the island's shoulder and onto a rock
  // within seconds, reported as "when I cast off from Montreal on the right
  // shore, I start on the sandbar and immediately take a whole bunch of
  // damage ... make the channels on either side of the island much wider."
  // The island keeps its authored shape (featureIslandAt only shrinks it
  // when the channel is too narrow), so all of the extra width goes into
  // the two channels: north ~7 -> ~18, south ~23 -> ~34. Unlabelled points
  // (no village) bracket the island so the widening is held across all of
  // it, not just at the city.
  { d: LAWRENCE_WEST + 2095, width: 60 }, // just before the island's east tip
  { d: LAWRENCE_WEST + 2169.32, width: 64, village: 'Montreal' },
  { d: LAWRENCE_WEST + 2300, width: 60 }, // the island's west tip tapering out
  { d: LAWRENCE_WEST + 2329.68, width: 40, village: 'Ile-Perrot' }, // see above
];

// The trend width at d, holding the end values outside the table.
export function lawrenceWestWidthAt(d) {
  const kfs = LAWRENCE_WEST_WIDTH_KEYFRAMES;
  if (d <= kfs[0].d) return kfs[0].width;
  for (let i = 1; i < kfs.length; i++) {
    if (d > kfs[i].d) continue;
    const a = kfs[i - 1], b = kfs[i];
    const t = (d - a.d) / (b.d - a.d);
    return a.width + (b.width - a.width) * t * t * (3 - 2 * t);
  }
  return kfs[kfs.length - 1].width;
}
