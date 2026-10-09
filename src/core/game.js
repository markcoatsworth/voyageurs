import { centerX, widthAt, braidAt, rapidsStrength, MOUTH_DISTANCE, SEGMENT_SHAPE_OFFSET } from '../world/river/path.js';
import { FEATURE_ISLAND_RANGE } from '../world/river/islands.js';
import { worldToScreen, CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_UNIT, CANOE_HALF_LENGTH } from '../shared/config.js';
import { drawBanks, drawWaterFallback, drawCurrentEffects } from '../world/terrain.js';
import { drawWhales } from '../world/whales.js';
import { drawRain } from '../world/weather.js';
import { createCanoeSprites } from '../world/canoe.js';
import { createCapsize } from '../world/capsize.js';
import { playCapsizeHorn, playPeltChime, playRepairTrade, playWeaponAcquired, playDamageBoop, playCannonBoom, playDiableRoar, playDiableDefeat, playWolfHowl, playChainRattle, playCorriveauWail, playWendigoBreath, playWendigoShriek, playThunderclap, playDistantRumble, setStormBed } from '../audio/sfx.js';
import { getDockHit, dockHitZ, VILLAGES } from '../world/villages.js';
import { createVillageScene } from '../world/villageScene.js';
import {
  createBlockade,
  SHIP_FLOW_DISTANCE as BLOCKADE_SHIP_FLOW_DISTANCE,
  APPROACH_RANGE as BLOCKADE_APPROACH_RANGE,
} from '../bossfights/blockade.js';
import { createBritishWarship, TRIGGER_DISTANCE as WARSHIP_FLOW_DISTANCE } from '../bossfights/britishWarship.js';
import { createChasseGalerie, lightningFlash, BOSS_HOVER_HEIGHT } from '../bossfights/chasseGalerie.js';
import { createDiable, DIABLE_FLOW_DISTANCE } from '../bossfights/diable.js';
// Each of the first three fights names its own segment (SEGMENT) — its
// distances are numbers on that segment's flowDistance line, so every guard
// below is on the fight's own constant rather than a segment named here.
import { createLoupGarou, SEGMENT as LOUP_GAROU_SEGMENT } from '../bossfights/loupGarou.js';
import { createCorriveau, SEGMENT as CORRIVEAU_SEGMENT } from '../bossfights/corriveau.js';
import { createWendigo, SEGMENT as WENDIGO_SEGMENT } from '../bossfights/wendigo.js';
import { createWeapons } from './weapons.js';
import { isTouchPrimary } from './touchControls.js';

// A D-pad's discrete taps are less precise than a keyboard's held keys, and
// the same world speed reads as faster filling more of a small screen — the
// same numbers that felt right on desktop consistently played as "way too
// fast" on touch. Scale forward-motion constants down for touch specifically
// rather than changing the feel for everyone.
const MOBILE_SPEED_SCALE = 0.45;
const speedScale = isTouchPrimary() ? MOBILE_SPEED_SCALE : 1;
// On top of the overall touch slowdown, the forward paddle specifically is
// dialled down further for phone play: pushing "up" should *ease* the canoe
// up to speed, not launch it, and top speed sits lower. Only touches how
// "up" behaves — not the current, the brake, reverse, or steering.
const FWD_ACCEL_SCALE = isTouchPrimary() ? 0.42 : 1; // gentler ramp
const FWD_MAX_SCALE = isTouchPrimary() ? 0.78 : 1;   // lower ceiling
// And when you let go of "up", the canoe settles back to its calm drift
// speed quicker on touch — so "not pushing forward" reliably reads as slow
// rather than coasting fast for ten-plus seconds.
const DRIFT_DECEL_TOUCH_MULT = isTouchPrimary() ? 2.4 : 1;

// MIN_SPEED is really the ambient current's own speed — holding Down long
// enough now overcomes it and actually paddles upstream (negative
// effectiveSpeed, flowDistance decreasing), rather than just coasting down
// to this as a floor; letting off Up/Down drifts back toward it from
// *either* side, same as a real current eventually winning again once you
// stop fighting it. Deliberately well under BASE_SPEED so drifting forward
// reads as an actual "chill" slow speed, not just a mild step down from
// medium.
export const MIN_SPEED = 2.5 * speedScale;
const MAX_SPEED = 16 * speedScale * FWD_MAX_SCALE;
// Paddling against the current is harder than going with it — capped well
// under MAX_SPEED's magnitude, so upstream is a real but slow slog, not a
// second forward gear pointed the other way.
const MAX_REVERSE_SPEED = -6 * speedScale;
// lawrenceWest (toward Québec City) is the one stretch that's genuinely
// upstream in reality — see world/river/route.js's module comment — and this is
// what actually makes it feel that way, rather than just a cosmetic label
// on another normal downstream segment: its ambient current is negative,
// not positive, so it's the same "drift back to this from either side when
// you let off" behavior every other segment already has (see MIN_SPEED
// above), just aimed backward. Stop paddling here and the river doesn't
// just slow you down to a chill drift — it actively carries you back the
// way you came, same magnitude as MIN_SPEED but flipped, so holding Up
// here is a sustained, active effort the whole way, not an occasional
// correction.
// 1.6x MIN_SPEED (was exactly MIN_SPEED): "the river should push back
// harder" — let go and you're carried back at ~4 units/s, not a 2.5 drift.
const UPRIVER_CURRENT = -1.6 * MIN_SPEED;
// this.speed carries over unchanged into lawrenceWest — a player crossing
// into it mid-paddle keeps whatever forward speed they arrived with, same as
// every other segment transition. Everywhere else that's fine (the
// ambient current there is a gentle forward drift, so leftover speed just
// eases down toward it over several seconds); here it would mean a real
// current only actually asserting itself well after the player has
// noticed nothing pushed back. A strong current overpowers momentum fast,
// not gradually, so lawrenceWest gets its own much quicker decay toward
// UPRIVER_CURRENT instead of reusing DECEL_DRIFT's gentle one.
const UPRIVER_DECEL = 6 * speedScale;
// The current also works against you while you *are* paddling. Before this
// only the no-paddle drift knew the leg ran upstream: holding Up still
// climbed at full ACCEL to full MAX_SPEED, so a few seconds in it handled
// exactly like running the Saguenay downstream — reported as "once I build
// up just a bit of speed, it behaves like the downstream portion of the
// Saguenay. The river should push back harder and it should take a lot
// longer to build up speed." So upriver the paddle tops out at
// UPRIVER_MAX_SPEED and gets there at ACCEL * UPRIVER_ACCEL_SCALE: 0 to
// full in ~3.4s (vs ~2.3s to a much higher top speed downstream), more
// from a standing start against the drift. Both scale off the ordinary
// values so touch keeps the same proportions. RAPIDS_UPRIVER_PUSH/DRAG
// below are fractions of UPRIVER_MAX_SPEED for the same reason — sized off
// MAX_SPEED they'd now stall the canoe outright in peak whitewater.
const UPRIVER_MAX_SPEED = 0.6 * MAX_SPEED;
const UPRIVER_ACCEL_SCALE = 0.4;
const BASE_SPEED = 8 * speedScale;
const ACCEL = 7 * speedScale * FWD_ACCEL_SCALE;
// Holding "down" (back on the steer pad / Down key) is a brake, not a lazy
// back-paddle: it kills forward speed fast so the canoe visibly slows, then
// eases on into a gentle reverse if you keep holding. Much stronger than
// ACCEL so the response is immediate.
const BRAKE_DECEL = 17 * speedScale;
const DECEL_DRIFT = 1.8 * speedScale;
// Steering authority is halved for touch play: on a phone the pad is on/off,
// so any nudge was full desktop steering and the canoe swung too hard.
// Damping is unchanged, so it still settles promptly when you let go — it
// just turns at half the rate while you're pushing.
const STEER_ACCEL = 20 * (isTouchPrimary() ? 0.5 : 1);
const STEER_MAX = 7 * (isTouchPrimary() ? 0.5 : 1);
const STEER_DAMPING = 6;

// --- Heading -------------------------------------------------------------
// The canoe holds a real heading, and that heading is what moves it: left/
// right swing the bow, and the hull's own thrust (STEER_THRUST below) is the
// only thing pushing you sideways. Before this the canoe crabbed downstream
// bolt upright and `tilt` leaned the sprite over decoratively — and leaned it
// the wrong way at that (it was -lateralVX, so going right tipped the bow
// left, a motorcycle's banking lean rather than a turn). The same angle now
// rotates the collision hull too, in obstacles.js's hullHit() and in the bank
// clamp in update(), so a turned canoe is genuinely a wider target: the
// turn is a mechanic, not a decoration.
//
// 0.6 rad ≈ 34°, at full lock. Big enough to read instantly on a 24px-wide
// sprite at 16px/unit, and it buys ~0.4 units of extra hull reach to either
// side (CANOE_HALF_LENGTH * sin) — a real cost to holding a hard turn
// through a rock field. Deliberately well short of broadside: the canoe
// should never look like it's lost the current.
// Exported for test/smoke.mjs, which asserts the bow actually reaches
// (nearly) full lock rather than re-hardcoding the angle.
export const HEADING_MAX = 0.6;
// How fast the bow swings toward that target, in 1/s. Stiff on purpose
// (τ ≈ 0.08s): it sits in series with the lateral ramp below, so any slower
// and the total input-to-dodge lag grows past what the telegraphed fights
// (blockade shots, the Loup-garou's lunge) had their windows tuned against
// back when steering drove lateral velocity directly.
const HEADING_RESPONSE = 12;
// Lateral thrust per unit of sin(heading). Derived from STEER_ACCEL, not
// tuned on its own: at full lock sin(HEADING_MAX) * STEER_THRUST is exactly
// the old steerInput * STEER_ACCEL, so the force the player commands is
// unchanged and only its *source* moved to the heading. Keeps the touch
// halving baked into STEER_ACCEL coming along for free, too.
const STEER_THRUST = STEER_ACCEL / Math.sin(HEADING_MAX);
// Heading held in the two arcade-dodge fights (Diable's arena, the Warship
// chase), which assign lateralVX directly and bypass the thrust model
// entirely. Without a heading of its own the canoe would dodge dead straight
// in exactly the two fights where it's most on display. Short of HEADING_MAX
// because those dodges are near-instant and full lock on every tap read as
// twitchy.
const FIGHT_HEADING = 0.35;
// How much of the heading the bank keeps when you scrape it: striking the
// shore knocks the bow back downstream, the same way the bounce already
// bleeds lateral velocity. Without this, holding the turn that put you there
// pinned the hull against the bank with its reach stuck at maximum.
const BANK_HEADING_KICK = 0.3;
// Ceiling on the *drawn* angle only (see the draw below). Flight multiplies
// the heading up to 2.5x for a banked look, which at full lock would be
// ~1.5 rad — broadside. 0.9 rad (~52°) is as far over as the canoe reads as
// banking rather than capsizing.
const MAX_DRAWN_BANK = 0.9;
// Direct lateral speed during the British Warship's held chase (bypasses
// the physics above — see the isChaseHolding() branch in update()).
// Reported as "the boss is too much faster than me." The gunboat's own
// lateral orbit (britishWarship.js's CHASE_ORBIT_RADIUS_X/PERIOD) peaks at
// radius*(2π/period) ≈ 2.1 units/sec; the ramped STEER_ACCEL/STEER_DAMPING
// physics below always lag a beat behind a target that's continuously
// reversing direction, same failure the Diable fight had before it got a
// direct speed of its own. Set well past that 2.1 peak so out-tracking the
// ship is a given, not a fight of its own on top of the actual fight.
const CHASE_LATERAL_SPEED = isTouchPrimary() ? 8 : 4.5;
// Same treatment for the Diable fight (its own isHolding() branch). Desktop
// wants more than the chase does — his fireballs are aimed and arrive fast,
// where the gunboat's threat is a slow orbit to out-track — so it keeps its
// own, higher number there.
//
// Touch has been through three values, and the arithmetic is worth writing
// down because eyeballing it got it wrong twice. It started at 28 (448
// px/s), on the reasoning that a pad with no analog magnitude needs a big
// number — reported as "too sensitive. I jump all over the place and
// cannot control the boat." It was then pinned to CHASE_LATERAL_SPEED (8)
// on the ask to "tone down the controls to the same sensitivity as the
// British Warship fight," which is right for that fight (a slow orbit to
// out-track) and wrong for this one, where the threat is aimed volleys you
// must physically clear. That produced "it works great on a big screen,
// but I'm getting absolutely slaughtered on a small mobile screen."
//
// What has to be possible, in the worst case (diable.js: telegraph at its
// ramped floor, the spread tiers, FIREBALL_R + CANOE_HIT_R = 11px lethal
// radius): leaving a 3-shot spread needs 28 + 11 = 39px of lateral travel
// inside the telegraph window, and the near-death 4-shot tier needs
// 30 + 11 = 41px (its own comment notes it leaves no lane to thread).
//   desktop 15 u/s = 240 px/s x 0.22s = 53px  -> clears both
//   touch    8 u/s = 128 px/s x 0.22s = 28px  -> clears NEITHER
// At 8 the only survivable line was threading the ~6px lane between shots,
// which at 128 px/s is ~47ms of timing precision with a thumb. It wasn't
// difficulty; it was arithmetic.
//
// 14 u/s (224 px/s) restores the dodge — 49px at the ramped floor, and
// 78px with diable.js's touch telegraph floor alongside it — while staying
// well under the 28 that was unmanageable. Desktop keeps its own 15
// untouched: "it works great on a big screen." (The vertical dodge needs
// nothing here: FIGHT_HOVER_SPEED and CHASE_HOLD_Z_SPEED are both 5.)
const FIGHT_LATERAL_SPEED = isTouchPrimary() ? 14 : 15;
// The Diable fight sits at the head of the Ottawa gorge, where the river
// itself is only ~6-10 units across (path.js's Ottawa branch) — far too
// tight to dodge aimed hellfire in. The held fight gets its own lateral
// arena instead: this half-width, decoupled from the channel, with the
// camera pinned dead-centre so the dodge maps straight to the screen (see
// the isHolding() branches in update()). ~7 units = ~112px each way, so the
// canoe can slip clear of the Devil's reach without leaving the screen.
const DIABLE_ARENA_HALF = 7;
// Past this point on lawrenceWest the pistol is guaranteed (update() grants
// it if you never walked up to the Montréal gunsmith) — the Diable fight
// ahead can't be done unarmed.
const MONTREAL_FLOW_DISTANCE = VILLAGES.find((v) => v.name === 'Montreal')?.flowDistance ?? Infinity;
// Gatineau is the last lawrenceWest waypoint and the junction onto the
// made-up Rideau leg (world/river/route.js) — crossing its flowDistance, or
// casting off from its dock, drops the canoe onto that segment (see
// enterRideau()), the same way crossing MOUTH_DISTANCE does at Tadoussac.
const GATINEAU_FLOW_DISTANCE = VILLAGES.find((v) => v.name === 'Gatineau')?.flowDistance ?? Infinity;
// Kingston is the end of the whole journey — reaching it (by dock or by
// simply crossing its flowDistance on the Rideau) wins the run.
const KINGSTON_FLOW_DISTANCE = VILLAGES.find((v) => v.name === 'Kingston')?.flowDistance ?? Infinity;

// The Wendigo's cold, as a multiply tint over the whole 2D frame at full
// frost (see render()'s frost pass) — what pure white becomes. A cold
// slate-blue, dark enough that the fjord's greens and the sand go to deep
// blue-black, light enough that rocks and the banks still separate from
// the water: at [96, 118, 148] a mid green like the banks' (80,130,60)
// lands around (30,60,35) — dark, still readable. Lower it for darker.
const FROST_TINT = [96, 118, 148];
// How far short of Kingston the "KINGSTON — Fort Frontenac ahead" banner and
// the arrival track (KINGSTON_TRACK, audio/music.js) cut in — was 70, moved
// further back ("a bit further back up the river sequence," requested
// explicitly) so "Un Siècle d'Avance" has real room to play under a longer
// stretch of the approach, not just the last moment before the dock.
// Exported so main.js can pin ?start=kingston to this exact distance
// instead of an independently-tuned number — see that keyword's own
// comment for why matching it matters (main.js's game loop then hits this
// same trigger on the very first frame, no forced-on cheat needed).
export const KINGSTON_APPROACH_LEAD = 150;
// Exported for test/smoke.mjs: checking that a turned hull grounds out
// *before* the straight-canoe limit needs that limit, waterEdge, and this
// is the half of it the test can't get from widthAt().
export const EDGE_MARGIN = 0.55;
const ISLAND_HIT_MARGIN = 0.35;
// How far ahead a cast-off checks for islands (castOffClearOfIslands). The
// canoe launches at rest — upriver it can take seconds to build way — so the
// island has to be clear for a good stretch, not just at the launch point.
const CAST_OFF_ISLAND_LOOKAHEAD = 15;
const LOG_PENALTY_SPEED = 4;
const BANK_PENALTY_SPEED = 2.6;
const INVULN_TIME = 1.2;
const BANK_INVULN_TIME = 0.7;
// A health meter only means something if hits are survivable — rocks and
// islands used to end the run on the spot. They still hit hard (a bit
// under a third of the bar), but now you can shrug off a couple of bad
// breaks instead of one unlucky rock ending an otherwise good run. Logs and
// grounding chip a smaller amount off on top of their existing speed
// penalty, so every collision matters, not just the big ones.
const MAX_HEALTH = 100;
const ROCK_DAMAGE = 32;
const LOG_DAMAGE = 12;
const BANK_DAMAGE = 8;
// The Château Gauntlet (bossfights/blockade.js) — a cannon splash used to cost as
// much as a rock (30), then 16, now 12. Combined with how many volleys a
// real approach exposes you to, the higher numbers added up to the approach
// killing runs before the ship — the fight's actual climax — was ever
// reached. Kept low enough that a bad patch of luck on the way in costs
// real health without ending the run on its own.
const CANNON_DAMAGE = 12;
// The hull itself is a solid wall, not a one-off "you clipped it" penalty
// (see the isHullBlocking check in update()) — outside the gap you simply
// can't push through it at all, taking this (the single hardest hit in the
// game) on repeat every INVULN_TIME while you're pinned against it, plus a
// heavy speed penalty that keeps sapping your paddling the whole time
// you're in contact, same shape as BANK_PENALTY_SPEED just harder.
const SHIP_HULL_DAMAGE = 30;
const SHIP_HULL_PENALTY_SPEED = 6;
// A church steeple clipped mid-flight in the Chasse-galerie. A real bite —
// just under a cannon hit, ~8 clips (one INVULN_TIME apart) ends a full
// hull — so botching more than a couple of the reaching-church dodges
// genuinely threatens the run. Dialled back a hair from 15 alongside making
// the steeples easier to see; the old 5 let a careless weave shrug the
// whole gorge off.
const STEEPLE_DAMAGE = 13;
// Clipping the bank treetops mid-flight — the devil's canoe stays over the
// water. A smaller single hit than a steeple, but you take one every
// INVULN_TIME you're in the trees (plus a shove back toward the river), so a
// few seconds off the channel adds up to worse than a clean steeple clip —
// straying wide still bleeds you noticeably faster than a tight weave does.
const TREE_DAMAGE = 7;
const TREE_PUSHBACK = 26; // lateral accel back toward mid-channel, units/sec^2
// Le Loup-garou's lunge (bossfights/loupGarou.js). Deliberately light — this
// is the first encounter, well before the pistol, and shouldn't be
// punishing. ~6 clean hits to sink, so a player who eats three or four and
// still makes Tadoussac can trade furs for repairs and carry on. Nudged up
// from 13 once the fight read as a touch too easy — still not brutal. (It
// was the second fight when that was tuned; it's the first again since the
// reshuffle, which is what "light" was always aimed at.)
const WOLF_DAMAGE = 16;
// La Corriveau (bossfights/corriveau.js). The reach — the cage dropping onto
// the canoe — and a feu follet, a glancing burn about half that. Was 16/8,
// matching the Loup-garou's lunge, while hers was a ~25s fight; at 2.5
// minutes (HAUNT_TIME) a player who dodged well still took ~110 hull from
// the sheer number of attacks. Each attack plays exactly as it did — the
// part reported as "balanced nicely" — it just costs less, so the long
// fight stays survivable for someone reading it.
const CORRIVEAU_DAMAGE = 10;
const FEU_FOLLET_DAMAGE = 5;
// How fast her weight bleeds the canoe's speed down to her pace limit,
// units/s² — about two seconds from full upstream paddle to her pace.
const CORRIVEAU_DRAG_DECEL = 4.5;
// Le Wendigo's raking blow (bossfights/wendigo.js) when it catches you still
// working the paddle as it listens. Tuned as the very first encounter (it's
// the third since the reshuffle, left as it was) and a freeze-or-flee beat —
// lighter than the loup-garou, and the first listen never strikes at all.
// The blow also stops the canoe dead (handleHit), which is most of its
// sting upstream. ~8 clean hits to sink; a player who reads the tell
// eats one or two at most. Nudged 11 -> 12 with the cadence, to put it a
// little more on the attack.
const WENDIGO_DAMAGE = 12;
// The Chasse-galerie's glide speed — slow and stately, so the flight up the
// Ottawa runs several minutes and there's plenty of time to read each
// church and slide into the next gap.
const FLIGHT_CRUISE_SPEED = 3.4;
// Diable fight: the river is locked at the arena, but up/down still do
// something — they move the canoe vertically within the arena to dodge his
// fire. Altitude (world units) is held between these; it eases back toward
// BOSS_HOVER_HEIGHT when neither is pressed so you naturally return to the
// aiming line.
const FIGHT_HOVER_MIN = -1.0;   // fully retreated — low on screen, near the bottom
const FIGHT_HOVER_MAX = 4.6;    // pressed up toward him
const FIGHT_HOVER_SPEED = 5;    // units/sec of vertical move under input
const FIGHT_HOVER_RECENTER = 1.6; // units/sec drift back to the baseline when idle

// British Warship chase: same "held arena, but up/down still does something"
// shape as Diable's hover above, just along the flow axis (fore/aft toward
// or away from the gunboat) instead of vertical — reported as the chase
// being pure left/right, with Up/Down completely dead the whole hold
// (game.js clamps flowDistance to getChaseHoldFlowDistance() every frame,
// discarding whatever effectiveSpeed would otherwise have done). This is a
// virtual offset only, subtracted from the real (pinned) flowDistance when
// calling britishWarship.update() — see that call site's own comment on
// why subtracting (not adding) is what actually closes the gap. The canoe
// sprite's own screen position gets the same shift (see canoeScreenY in
// draw()) so it reads as your own movement; the real world/terrain never
// advances, so the screen stays exactly as static as it already was apart
// from that.
// No nonzero baseline the way Diable's BOSS_HOVER_HEIGHT is — the natural
// rest position here is just "wherever the hold started," i.e. zero — but
// deliberately NOT a symmetric range either. Closing in (CHASE_HOLD_Z_MAX)
// is capped well under CHASE_ANCHOR_LEAD (britishWarship.js, =3, the
// orbit's own minimum lead) so this offset can never push the gunboat's
// real hit-test position level with or behind the canoe: britishWarship.js's
// own CHASE_ORBIT_PERIOD comment already documents "never behind" as a
// deliberate fix (an autonomous swing behind read as unreadable chaos), and
// weapons.js's
// bullets are forward-only regardless — a max any higher broke exactly
// this, caught by the smoke test's continuous-fire scenario (which holds Up
// the whole fight) timing out instead of ever sinking the ship. Opening the
// range (CHASE_HOLD_Z_MIN) was first given a much larger, unconstrained
// number on the reasoning that there's no such gameplay ceiling on that
// side — true for the hit-test, but it missed a *screen* one: reported as
// "Up/Down don't do anything," and worldToScreen's own flat (no
// perspective) scale means z maps straight to screen Y with nothing to
// stop it running off the top of the 220px canvas. At the old -6, the
// worst point in the ship's own orbit rendered at screen y = -43 — off the
// canvas entirely, not just subtle — which reads as "broken" long before a
// player gets anywhere near noticing the *other* direction's smaller,
// legitimate 2-unit shift. -2 keeps the ship on screen (y ≥ 21px from the
// top) across the whole orbit, any hold position.
const CHASE_HOLD_Z_MIN = -2;   // opened range, farther from the gunboat — was -6, see above
const CHASE_HOLD_Z_MAX = 2;    // closed range — capped, see above
const CHASE_HOLD_Z_SPEED = 5;  // units/sec of fore/aft move under input — matches FIGHT_HOVER_SPEED
const CHASE_HOLD_Z_RECENTER = 1.6; // units/sec drift back to centre when idle

// Flying the canoe straight into Diable's own body (not his fire) — costs
// furs instead of hull health, the first hazard in the game that docks the
// score rather than health. A real deterrent against ramming through him
// for position, without turning "got too close" into a death the way a
// fireball hit already is.
const DIABLE_TOUCH_FUR_PENALTY = 2;
const DAMAGE_FLASH_TIME = 0.28;
// How much hull a single fur buys at the repair shop's trader — a full
// repair from empty costs ceil(100/15) = 7 furs; tryRepairTrade() below
// only ever spends as many as are actually needed to top off.
const REPAIR_HP_PER_FUR = 15;
// flowDistance (world position) deliberately never resets on restart — the
// river shouldn't jump — but the canoe always respawns dead-center. If a
// capsize happens to freeze the world with a braid island sitting right on
// that centerline, every restart would drop the canoe straight back into
// it with zero chance to react. A brief spawn grace period, using the same
// invulnerability the game already has, fixes that generally.
const SPAWN_INVULN_TIME = 1.5;
// How fast the camera catches up to the river's own bend (centerX), each
// frame, as a fraction of the remaining gap. Low on purpose: tracking the
// bend *exactly* means the camera sways every time the channel curves —
// which happens continuously just from paddling forward, no steering
// needed — and everything anchored to the world (banks included) sways
// with it. This damps that out so the world reads as planted; the canoe
// (whose screen position already includes the camera's remaining lag, see
// render()) picks up the slack, visibly drifting across a stable frame as
// it actually follows the curve — which is what makes it read as "the boat
// is turning" rather than "the world is sliding."
const CAMERA_SMOOTH = 0.025;
// The Saint Lawrence stretch (world/river/path.js's ESTUARY_WIDTH) is far wider
// than the screen, so lateralOffset alone — the *only* thing that used to
// move the canoe off the centerline visually, since the camera above only
// ever tracks the curve, never the player's own steering — can no longer
// just be handed straight to the canoe's screen position: a canoe camped
// out mid-crossing could steer itself yards past the edge of the canvas,
// and it'd render there, or not at all. CAMERA_DEAD_ZONE is how far the
// canoe can drift from the *tracked* centerline before the camera starts
// easing sideways to keep up, in world units. Past that, CAMERA_LATERAL_PULL
// — tracked as its own lerp, separate from and faster than CAMERA_SMOOTH
// above — reels the camera toward the canoe, same "world stays planted, the
// boat visibly moves" logic as the curve-tracking camera, just triggered by
// a steering choice instead of a bend in the river.
//
// This used to be 8.5 (a fully-loaded old-width channel's own max
// half-width, ~8.7 — chosen so the fjord never engaged this at all) plus a
// CAMERA_MAX_ONSCREEN_OFFSET of 9, which together meant the canoe visually
// drifted almost the entire way to the canvas edge — within about a canoe's
// width of it — before the camera did anything to help, then only barely
// caught up in what was left. Reported as needing to steer right up against
// the edge of the screen before the viewport would budge at all. Both
// numbers are shrunk a lot here instead: the camera now starts easing over
// well before the canoe gets anywhere near the edge, and never lets it
// travel more than half the canvas's half-width from center on screen — a
// deliberate, general change to how the camera feels everywhere (the fjord
// included), not just a wide-river tweak.
const CAMERA_DEAD_ZONE = 2;
const CAMERA_LATERAL_SMOOTH = 0.12;
// A hard backstop under the canvas's actual half-width (CANVAS_WIDTH / 2 /
// PIXELS_PER_UNIT = 10 units) so a fast or sustained steering input can't
// outrun CAMERA_LATERAL_SMOOTH's catch-up and momentarily push the canoe
// (which itself has width) off the edge of the canvas while the lerp is
// still closing the gap. The soft dead zone above handles the normal case;
// this only ever engages during unusually hard/sustained steering, and even
// then just holds the canoe at this offset instead of letting it go further.
const CAMERA_MAX_ONSCREEN_OFFSET = 5;
const RAPIDS_BOOST = 7 * speedScale; // extra units/s the current adds at peak whitewater
// Upriver (lawrenceWest) the whitewater pushes *against* you, and harder
// than RAPIDS_BOOST pushes you along downstream. It used to be RAPIDS_BOOST
// with the sign flipped, which at full paddle still left ~56% of your
// normal headway through peak whitewater — barely a dent — while the
// streaks racing down the screen and the speed bar's boost glow (see
// updateHud) said "flying along": reported as "when I hit the whitewater
// sections, I suddenly get propelled forward quickly ... it should be even
// tougher to paddle upriver in the white water." A fraction of MAX_SPEED,
// not a fixed number, so it bites the same on touch (whose MAX_SPEED is
// scaled down further than RAPIDS_BOOST is): full paddle through peak
// whitewater keeps ~30% of top speed — a real grind, never a stall — and
// letting go there gets you carried back fast.
const RAPIDS_UPRIVER_PUSH = 0.7 * UPRIVER_MAX_SPEED;
// ...and it works on the canoe's own momentum (this.speed), not as a term
// added to it. The first cut added -RAPIDS_UPRIVER_PUSH to effectiveSpeed
// while this.speed sat at MAX_SPEED the whole way through, so the moment
// the rapids faded the full speed came straight back — ~5 to 16 units/s in
// about half a second, reported as "once I come out of the whitewater ...
// my canoe gets shot forward really quickly ... it should take me a few
// seconds just to get back to regular speed." Now the whitewater lowers
// the paddling ceiling to MAX_SPEED - rapids * RAPIDS_UPRIVER_PUSH and
// bleeds anything above it off at this rate (fast, so hitting whitewater
// still bites at once; a fraction of MAX_SPEED for the same touch-parity
// reason as above), and lowers the no-paddle drift target by the same
// amount. 1.5 * MAX_SPEED/s, not slower: at 0.9 the bleed lagged the
// ceiling as the rapids built, so the canoe only grazed the intended low
// point on its way through.
const RAPIDS_UPRIVER_DRAG = 1.5 * UPRIVER_MAX_SPEED;
// Winded after upriver whitewater: on its own, ordinary ACCEL took you from
// the rapids' low point back to full speed in ~1.5s — still more snap than
// "a few seconds just to get back to regular speed." So the paddle's
// acceleration is cut by WINDED_ACCEL_CUT while you're in it and for a
// moment after, easing back to normal over WINDED_RECOVERY_TIME seconds.
// Tied to having just been in whitewater, not to lawrenceWest as a whole,
// so ordinary upstream paddling (reported as already feeling right) keeps
// its usual response.
const WINDED_ACCEL_CUT = 0.6;
const WINDED_RECOVERY_TIME = 3;
const RAPIDS_STEER_PENALTY = 0.45; // up to 45% less steering authority there

// lawrenceWest (world/river/route.js's third segment, toward Québec City) is the
// only one with a real floor: its numbering (SEGMENT_SHAPE_OFFSET) sits far
// away on purpose, so paddling back past its own start would just be
// paddling into an unrelated stretch of the shape functions' number line —
// not an actual place. fjord and lawrenceEast, by contrast, are *not*
// separately bounded — they share one open range (see update()'s
// re-derivation of this.segment right after the position update below).
// An earlier version of this also ceilinged the fjord at Tadoussac, forcing
// a dock-or-else stop right at the junction; that's exactly what caused a
// string of stuck-at-Tadoussac bugs (nowhere to go if you weren't already
// lined up with the dock, worst of all right where main.js's ?start= cheat
// can drop you with zero approach). Paddling through is completely fine —
// crossing MOUTH_DISTANCE always continues into lawrenceWest now (see the
// crossing check further down in update()); lawrenceEast still exists as
// real geography (route.js, the minimap) but is no longer a live gameplay
// destination — see route.js's own module comment for why.
const SEGMENT_FLOOR = {
  fjord: 0,
  lawrenceWest: SEGMENT_SHAPE_OFFSET.lawrenceWest,
  // Same reasoning as lawrenceWest — the Rideau leg's numbering (see
  // SEGMENT_SHAPE_OFFSET) sits off on its own, and there's nothing behind
  // its start but an unrelated stretch of the shape functions' number line.
  rideau: SEGMENT_SHAPE_OFFSET.rideau,
};

// What this.speed drifts back toward with no Up/Down input (see
// UPRIVER_CURRENT's comment) — MIN_SPEED everywhere except the one
// genuinely-upstream stretch. Letting go completely on lawrenceWest and
// never paddling again just settles the canoe at this segment's own floor
// above, same as drifting backward anywhere else eventually hits a wall —
// there's nowhere further back to go than where this branch started.
const AMBIENT_CURRENT = {
  lawrenceWest: UPRIVER_CURRENT,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ?difficulty=easy (main.js's isEasyMode(), read once at construction below)
// — a debug-only knob for now, no UI control yet (a title-screen toggle for
// non-gamers is planned separately). Deliberately narrow scope, requested
// explicitly as "the only things we need to adjust are reducing damage
// taken and increasing damage given. Everything else can stay the same" —
// not a broader difficulty system that also loosens hit windows, hold
// times, or cannon rate.
//
// Damage TAKEN is scaled at the single choke point every boss hit already
// flows through, handleHit() below — only its boss-fight branches (cannon,
// shiphull, steeple, diable, wolf, wendigo), not the general river hazards
// (rock/island/bank/tree/log) a difficulty knob aimed at "boss fights" was
// never asked to touch.
//
// Damage GIVEN has no equivalent single choke point — only the two
// shootable, hit-point fights (the British Warship, Le Diable) have a
// "damage given" number at all, and each applies it inline in its own
// module rather than through a shared function — so this.damageGivenScale
// is threaded through as an extra argument to each one's own update() call
// (see those call sites below) instead.
// Started at 0.5/2 (half taken, double given) — reported back as "still
// not very easy" after actually trying it, so dialed further: quarter
// damage taken, quadruple damage dealt. Debug-only knob, easy to keep
// dialing from here if it's still not enough.
const EASY_DAMAGE_TAKEN_SCALE = 0.25;
const EASY_DAMAGE_GIVEN_SCALE = 4;

// Le Diable's fireballs hit for less on touch. Reported from a phone: "I
// don't even last 10 seconds." The arithmetic backs that up exactly — his
// CONTACT_DAMAGE is 30 against MAX_HEALTH 100, so the 4th hit kills, and
// INVULN_TIME (1.2s) means four hits can't take longer than ~3.6s. That's
// survivable on a keyboard, where the dodge is precise; on a steer pad it
// isn't, and the fight's difficulty was tuned entirely against desktop
// play (see diable.js's own history of tightening FIREBALL_SPEED/
// TELEGRAPH/SPREAD_GAP after "cleared it without taking a single hit").
// 0.5 puts it at 7 hits instead of 4 — ~8.4s of nothing but hits taken,
// and realistically much longer, without making a landed hit meaningless
// the way a token 0.8 would. Deliberately its own constant rather than
// folding into damageTakenScale (?difficulty=easy), which is a separate,
// deliberately debug-only knob that scales every boss: this is the one
// fight, on the one input type, and it applies whether or not easy mode
// is on. Nothing else about the fight changes — his hp, fireball speed,
// telegraph and cadence are all untouched, so it's the same fight, just
// survivable with a thumb.
const DIABLE_TOUCH_DAMAGE_SCALE = isTouchPrimary() ? 0.5 : 1;

export class Game {
  // startFlowDistance/startSegment: where the river clock begins instead of
  // the put-in (fjord, 0) — see main.js's ?start= URL cheat. Threaded
  // through the same constructor state that flowDistance/segment/the
  // camera normally start from, so there's no special-cased "cheat mode":
  // everything downstream (village arrival banners, mouthAnnounced, the
  // camera's own curve tracking) behaves exactly as if the player had
  // actually paddled here from 0.
  //
  // startFurs: the fur count to open with — a CONTINUE from the title menu
  // restores the count saved with its checkpoint (main.js). The first start
  // only: a capsize still resets furs to 0, same as it always has.
  constructor({ ctx, water, input, obstacles, world, ui, music, startFlowDistance = 0, startSegment = 'fjord', easyMode = false, startFurs = 0 }) {
    this.ctx = ctx;
    this.water = water; // null falls back to a 2D-drawn water fill
    this.input = input;
    this.obstacles = obstacles;
    this.world = world;
    this.ui = ui;
    this.music = music;
    this.canoeSprites = createCanoeSprites();
    // The going-over animation. Holds its own clock, so it survives being
    // asked to draw on a frozen river (see update()).
    this.capsize = createCapsize();
    this.villageScene = createVillageScene();
    this.blockade = createBlockade();
    this.britishWarship = createBritishWarship();
    this.warshipPct = null; // null hides the HUD bar; set by update() while the fight is active
    this.chasseGalerie = createChasseGalerie();
    this.diable = createDiable();
    this.diablePct = null; // null hides the HUD bar; his HP% while the fight runs
    this.loupGarou = createLoupGarou(); // the night beast on the lower fjord, before Tadoussac
    this.corriveau = createCorriveau(); // the gibbet ghost on the run into Québec City
    this.wendigo = createWendigo(); // the famine-spirit on Lac Saint-Pierre, before Sorel-Tracy
    // Set once the Devil looms up (or by ?start=diable): a capsize then
    // respawns just before the fight with the pistol, not all the way back
    // at Montréal — see start() and update()'s consumeJustAppeared branch.
    this._diableCheckpoint = false;
    // True from the moment the frigate is spotted (Rule Britannia cued)
    // until the British Blockade approach is over (threaded the gap, or
    // just retreated back out of range) — drops the boss track back to
    // the shuffle exactly once. Separate from the Warship's own flag below
    // now that the two are independent encounters, not one continuous fight.
    this._bossTrackCued = false;
    // Same idea, for the British Warship fight further downstream.
    this._warshipTrackCued = false;
    // Canoe altitude while the Diable fight holds the river locked — driven
    // by up/down for a vertical dodge, eased back to BOSS_HOVER_HEIGHT idle.
    this._bossHoverAlt = BOSS_HOVER_HEIGHT;
    // Fore/aft offset while the British Warship chase holds flowDistance —
    // see CHASE_HOLD_Z_* above. Zero is the rest position (unlike
    // _bossHoverAlt's nonzero baseline).
    this._chaseHoldZ = 0;
    this.weapons = createWeapons();

    // Set up weapon firing callback
    input.onWeaponFire = (weaponName) => {
      if (this.mode === 'river' && this.state === 'playing') {
        // getAltitude() is 0 except mid-Chasse-galerie flight, where it lifts
        // the shot to leave the flying canoe instead of its shadow.
        this.weapons.fire(weaponName, this.canoeWorldX, this.flowDistance, this.chasseGalerie.getAltitude());
      }
    };

    // 'river' (paddling) or 'village' (on foot, ashore at a dock) — see
    // enterVillage()/leaveVillage(). Separate from this.state, which is
    // still just 'playing' | 'gameover'; a capsize can't happen mid-village
    // visit since river collision checks don't run in that mode.
    this.mode = 'river';
    this.currentVillage = null;
    // Which of world/river/route.js's SEGMENTS is active — see SEGMENT_FLOOR and
    // leaveVillage()'s Tadoussac branch for the junction itself.
    this.segment = startSegment;
    // Remembered so reset() can snap back to it — see that method's own
    // comment for why a capsize returns here instead of continuing from
    // wherever it happened.
    this.startFlowDistance = startFlowDistance;
    this.startSegment = startSegment;
    // See EASY_DAMAGE_TAKEN_SCALE/EASY_DAMAGE_GIVEN_SCALE's own comment
    // above. Computed once here, not read fresh from the URL elsewhere —
    // main.js reads it once at construction, same as startSegment/
    // startFlowDistance, rather than every boss module reaching for the URL
    // independently.
    this.easyMode = !!easyMode;
    this.damageTakenScale = this.easyMode ? EASY_DAMAGE_TAKEN_SCALE : 1;
    this.damageGivenScale = this.easyMode ? EASY_DAMAGE_GIVEN_SCALE : 1;
    // Confirms ?difficulty=easy actually landed — asked for explicitly
    // after a real bug (main.js's ?start= URL-stripping was wiping
    // ?difficulty= before it was ever read) made it look like the flag
    // silently did nothing.
    if (this.easyMode) {
      console.log(`[GAME] Easy mode active — damageTakenScale=${this.damageTakenScale}, damageGivenScale=${this.damageGivenScale}`);
    }

    this.time = 0;
    this.paddleSide = 1;
    this.paddleTimer = 0;

    ui.restartBtn.addEventListener('click', () => this.start());

    // No title-screen gate — the canoe launches the instant the page is
    // ready; the intro caption (main.js) is a non-blocking overlay that
    // fades on its own timer instead of waiting for a click.
    this.start();
    this.furs = Math.max(0, Math.floor(startFurs) || 0);
  }

  // A capsize used to leave flowDistance/segment/the camera exactly where
  // they were and just refill health — "the river shouldn't jump back to
  // the put-in." Reported as the opposite of what's wanted: dying should
  // send you back to wherever *this run* actually began (the put-in, or
  // wherever a ?start= cheat placed you), not restart you in place at the
  // spot that just killed you. So every restart now snaps flowDistance,
  // segment, and the camera back to startFlowDistance/startSegment
  // (captured once in the constructor), same as the very first launch.
  reset() {
    this.lateralOffset = 0;
    this.lateralVX = 0;
    this.speed = BASE_SPEED;
    this.effectiveSpeed = BASE_SPEED;
    this.rapids = 0;
    this.winded = 0; // see WINDED_ACCEL_CUT
    this.furs = 0;
    this.health = MAX_HEALTH;
    this.invulnTimer = SPAWN_INVULN_TIME;
    this.mouthAnnounced = false;
    this.troisRivieresAnnounced = false;
    this.kingstonAnnounced = false;
    this.journeyComplete = false; // see the comment above leaveVillage()
    this.heading = 0;
    this.capsize.reset();
    this.paused = false;
    this.ui.pauseScreen?.classList.add('hidden');
    this.mode = 'river';
    this.currentVillage = null;
    this.blockadeCrossCurrent = 0;
    this._bossTrackCued = false;
    // A capsize mid-storm restarts back at Jones Falls (or wherever this
    // run began) under clear skies — the weather bed and the music duck
    // both have to let go here, since neither is a pure function of
    // position the way the visuals are; they're driven by update() and
    // would otherwise just hold their last level until the next frame
    // that happens to run on the Rideau.
    setStormBed(0);
    this.music?.setDuck(1);
    this._castOffGrace = 0;
    this._castOffGraceVillage = null;
    this._steepleGraceUntil = -Infinity;

    this.segment = this.startSegment;
    this.flowDistance = this.startFlowDistance;
    // obstacles.reset() (called right after this from start()) seeds its
    // pool by reading world.distance directly, before update() has ever run
    // to set it from flowDistance the normal way — without this, a non-zero
    // startFlowDistance would seed every obstacle near the death spot
    // instead of back at the actual start.
    this.world.distance = this.startFlowDistance;
    this.cameraCenterX = centerX(this.startFlowDistance);
    this.cameraLateralPull = 0;
    this.cameraWorldX = this.cameraCenterX;
  }

  togglePause() {
    if (this.state !== 'playing') return; // nothing sensible to pause over the title/gameover screens
    this.paused = !this.paused;
    this.ui.pauseScreen.classList.toggle('hidden', !this.paused);
  }

  showBanner(text) {
    clearTimeout(this._bannerTimeout);
    const el = this.ui.milestoneBanner;
    el.textContent = text;
    el.classList.add('show');
    this._bannerTimeout = setTimeout(() => el.classList.remove('show'), 4200);
  }

  // The big, one-off dramatic title card (#boss-banner) — separate from the
  // small milestone banner above so a set-piece moment can get real fanfare
  // without every ordinary callout suddenly demanding the same. Shorter
  // hold than the milestone banner (it's a beat, not something to read at
  // length) and gameplay keeps running right underneath it.
  showBossBanner(text) {
    clearTimeout(this._bossBannerTimeout);
    const el = this.ui.bossBanner;
    el.textContent = text;
    el.classList.add('show');
    this._bossBannerTimeout = setTimeout(() => el.classList.remove('show'), 2400);
  }

  start() {
    this.reset();
    this.obstacles.reset();
    this.blockade.reset();
    this.britishWarship.reset();
    this.warshipPct = null;
    this.loupGarou.reset();
    this.corriveau.reset();
    this.wendigo.reset();
    this.chasseGalerie.reset();
    this.diable.reset();
    this.diablePct = null;
    this._bossHoverAlt = BOSS_HOVER_HEIGHT;
    this._chaseHoldZ = 0;
    this.weapons.reset();
    // Respawning at the Diable checkpoint means the pistol is a given — you
    // can't fight him bare-handed, and ?start=diable / a capsize mid-fight
    // both land here.
    if (this._diableCheckpoint) this.weapons.unlock('pistol');
    this.syncWeaponControls(); // weapons.reset() just cleared the pool — hide the pad
    // The "thread the steeples" intro only makes sense on a full flight from
    // Montréal — never when a run starts (or respawns) at the Devil's door.
    this._chasseGalerieBannerShown = this._diableCheckpoint;
    // Restart now always returns to the run's actual start (see reset()'s
    // own comment) — if the boss track was playing when the capsize
    // happened, leaving it running would be paired with a scene nowhere
    // near the frigate. Unconditional and harmless if it wasn't playing.
    this.music?.endBossTrack();
    this.state = 'playing';
    clearTimeout(this._bannerTimeout);
    this.ui.milestoneBanner.classList.remove('show');
    clearTimeout(this._bossBannerTimeout);
    this.ui.bossBanner.classList.remove('show');
    clearTimeout(this._damageFlashTimeout);
    this.ui.damageFlash.classList.remove('show');
    this.ui.gameoverScreen.classList.add('hidden');
    // win() borrows the game-over screen with a triumphant title and its own
    // button label — put both back for an ordinary run.
    if (this.ui.gameoverTitle) this.ui.gameoverTitle.textContent = 'CAPSIZED';
    if (this.ui.restartBtn) this.ui.restartBtn.textContent = 'Try Again';
    this.ui.hud.classList.remove('hidden');
    // No-ops if music hasn't been started yet (e.g. the very first launch,
    // before any keypress/click) — see music.resume()'s own guard.
    this.music?.resume();
  }

  gameOver() {
    this.state = 'gameover';
    this.ui.hud.classList.add('hidden');
    this.ui.hudDiable?.classList.add('hidden');
    this.ui.finalStats.innerHTML = '';
    // Losing to the Devil is losing your soul, not just the canoe; the beast
    // drags you under.
    const byDiable = !!this.diable?.isActive();
    const byWolf = !byDiable && !!this.loupGarou?.isActive();
    // She wanted a ride to the sabbath on Île d'Orléans, and now she has one.
    const byCorriveau = !byDiable && !byWolf && !!this.corriveau?.isActive();
    // Losing on the ice to the Wendigo isn't drowning — it's being caught.
    const byWendigo = !byDiable && !byWolf && !byCorriveau && !!this.wendigo?.isActive();
    if (this.ui.gameoverTitle) {
      this.ui.gameoverTitle.textContent =
        byDiable ? 'THE DEVIL COLLECTS'
          : byWolf ? 'THE BEAST TAKES YOU'
            : byCorriveau ? 'CARRIED TO THE SABBATH'
            : byWendigo ? 'THE WENDIGO TAKES YOU'
              : 'CAPSIZED';
    }
    this.ui.gameoverScreen.classList.remove('hidden');
    // No horn here any more — beginCapsize() sounds it as the canoe goes
    // over, which is a second and a half earlier and on the right beat.
    this.music?.stop();
  }

  // Called by main.js for ?start=diable: hand over the pistol and mark the
  // checkpoint so a capsize keeps it and respawns at the fight.
  armDiableCheckpoint() {
    this._diableCheckpoint = true;
    this.weapons.unlock('pistol');
    this.syncWeaponControls();
    // Dropped straight into the Devil's approach — the steeple-threading
    // intro doesn't apply. Suppress it and set the scene instead.
    this._chasseGalerieBannerShown = true;
    this.showBanner('YOUR DEBT TO THE DEVIL COMES DUE');
  }

  // Ashore mechanics are intentionally minimal for now: walk around, walk
  // back onto the dock to re-board. Shops (sell furs, repair the hull) are
  // the planned next step once this loop is solid.
  enterVillage(village) {
    this.mode = 'village';
    this.currentVillage = village;
    this.villageScene.enter(village);
    this.ui.hud.classList.add('hidden');
    this.syncWeaponControls(); // ashore: the fire console goes with the HUD
    // Stepping ashore at Kingston is arriving — see the comment above
    // leaveVillage(); there's no leaving again.
    if (village.name === 'Kingston') this.journeyComplete = true;

    // Update respawn point to this village - if you capsize later, you'll
    // restart here instead of all the way back at the original put-in
    this.startFlowDistance = village.flowDistance;
    this.startSegment = village.segment;

    // The pistol comes from the Montréal gunsmith (walk up to him — see
    // acquirePistol(), fired from the villageScene trigger in update()'s
    // village branch), or automatically the moment you pass Montréal on the
    // river if you never went into town (the MONTREAL_FLOW_DISTANCE check in
    // update()). Either way it's a given before the Diable fight.

    // No "Arriving at <town>" banner any more — removed by request once the
    // town-name banner (main.js's #town-banner) took over saying where you
    // are, for as long as you're ashore rather than for a few seconds on
    // arrival. That included Tadoussac's own longer "the Saguenay meets the
    // Saint Lawrence" version.
  }

  // Resets everything that's meaningless carried over from one segment into
  // another — the camera's own curve-tracking state (centerX(d) can jump to
  // an unrelated value between segments, see SEGMENT_SHAPE_OFFSET) and the
  // obstacle pool (it seeds itself from world.distance — see the
  // constructor's comment on startFlowDistance — so without a reset here
  // it'd stay full of obstacles positioned for the segment you just left).
  enterSegment(segmentId, flowDistance) {
    this.segment = segmentId;
    this.flowDistance = flowDistance;
    this.world.distance = flowDistance;
    this.lateralOffset = 0;
    this.lateralVX = 0;
    this.cameraCenterX = centerX(flowDistance);
    this.cameraLateralPull = 0;
    this.cameraWorldX = this.cameraCenterX;
    this.obstacles.reset();
  }

  // Gatineau (the winter camp, end of the Chasse-galerie) is the junction
  // onto the made-up Rideau leg toward Kingston — see world/river/route.js.
  // Like Tadoussac -> lawrenceWest, this is a real segment jump onto a
  // disjoint slice of the shape-math number line, not a resume-in-place, so
  // both cast-off and the "just paddled past it" catch in update() route
  // through here. Also becomes the run's checkpoint: the Devil is behind
  // you now, so a capsize on the Rideau respawns at its start, not back at
  // the Diable arena.
  enterRideau() {
    this._diableCheckpoint = false;
    this.diable.reset();
    this.diablePct = null;
    this.blockade.reset(); // the blockade lives on this leg now — start it fresh
    this.britishWarship.reset();
    this.warshipPct = null;
    this.chasseGalerie.reset();
    this._chasseGalerieBannerShown = true; // no flight on the Rideau
    const start = SEGMENT_SHAPE_OFFSET.rideau + 0.5;
    this.startSegment = 'rideau';
    this.startFlowDistance = start;
    this.mode = 'river';
    this.currentVillage = null;
    this.enterSegment('rideau', start);
    this.music?.endBossTrack();
    this.showBanner('The storm breaks — the Rideau, and Kingston beyond');
  }

  // Reaching Kingston, whether by touching its dock or just crossing its
  // flowDistance on the Rideau: the run is won. Borrows the game-over screen
  // (a frozen update loop, the same restart button) with a triumphant title
  // and stats, and points a restart back at the very put-in rather than the
  // Rideau checkpoint — "Play Again" means the whole journey.
  // Kingston is where the journey ends — and it ends by simply staying
  // there, not with a card. There used to be a win(): crossing
  // KINGSTON_FLOW_DISTANCE (on the river, or the moment you cast off from
  // Kingston's own dock, which pushed you past it) set state = 'won' and
  // borrowed the game-over screen as a "JOURNEY'S END" victory card with a
  // Play Again button. Asked to drop it: "Remove the 'JOURNEY'S END' dialog
  // in Kingston. Just silently block me from leaving the city." So now:
  // on foot, leaveVillage() below is a silent no-op at Kingston (the
  // re-board zone on the dock just doesn't work — no banner, no sound,
  // nothing); on the river, update() holds flowDistance at
  // KINGSTON_FLOW_DISTANCE the same way the boss holds do, so the harbour
  // is as far as the canoe goes. The Kingston playlist keeps playing under
  // both. journeyComplete is the one thing that still marks the arrival —
  // main.js clears the saved checkpoint on it, so a reload after arriving
  // starts a fresh run rather than dropping back into a town you can't
  // leave.

  // A world X near `x` that's clear of every island (braidAt — the Island of
  // Montreal included) over the next CAST_OFF_ISLAND_LOOKAHEAD units from d,
  // pushed out on whichever side of the island x already sits, then kept
  // inside the banks. Clearance is the collision margin plus the hull's own
  // half-length and a little water, so a canoe that sits still there doesn't
  // scrape the island as it drifts. Used by leaveVillage().
  castOffClearOfIslands(x, d) {
    const pad = ISLAND_HIT_MARGIN + CANOE_HALF_LENGTH + 0.5;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let dd = d; dd <= d + CAST_OFF_ISLAND_LOOKAHEAD; dd += 0.5) {
        const island = braidAt(dd);
        if (!island) continue;
        const reach = island.halfWidth + pad;
        if (Math.abs(x - island.centerX) < reach) {
          x = island.centerX + (x >= island.centerX ? 1 : -1) * reach;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const edge = widthAt(d) / 2 - EDGE_MARGIN - CANOE_HALF_LENGTH;
    return clamp(x, centerX(d) - edge, centerX(d) + edge);
  }

  leaveVillage() {
    if (this.currentVillage.name === 'Kingston') return; // see the comment above — the end of the line
    this.mode = 'river';
    this.syncWeaponControls(); // back in the canoe: the fire console returns
    if (this.currentVillage.name === 'Tadoussac') {
      // Always continues upriver toward Québec City — no choice any more,
      // just a real segment jump (fjord and lawrenceWest don't share a
      // number line the way fjord and lawrenceEast do, so this can't just
      // resume in place like every other village's cast-off below).
      this.enterSegment('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
      this.showBanner('Paddling upriver toward Québec City — fight the current');
    } else if (this.currentVillage.name === 'Gatineau') {
      this.enterRideau();
    } else {
      // Re-boarding drops the canoe right where it triggered the dock. Two
      // things then push it straight back in: on lawrenceWest the current
      // itself runs backward (upriver, toward the dock), and everywhere a
      // "down" key still held from walking down to the re-board zone reverses
      // the canoe for a beat. So on *every* cast-off: put real separation
      // between the canoe and the dock, and ignore that one dock for a few
      // seconds (see update()'s getDockHit check) — long enough to paddle
      // clear or let go of the key — instead of an instant loop back into
      // the same village.
      const past = dockHitZ(this.currentVillage);
      if (this.segment === 'lawrenceWest') {
        this.flowDistance = this.currentVillage.flowDistance + past + 6;
        this.speed = Math.max(this.speed, BASE_SPEED); // forward momentum vs. the backward current
      } else {
        this.flowDistance = this.currentVillage.flowDistance + past + 3;
      }
      // ...and off any island. The cast-off keeps the canoe's own lateral
      // position from the dock, which is fine against a riverbank but not
      // against Montréal's piers: they're built on the Island of Montreal
      // itself, and the island bulges outward just upstream of the city, so
      // docking at the island end of the north pier and casting off put the
      // canoe several units inside the island's hit zone — 64-96 hull lost
      // grinding along it with no way to be clear of it in time. Reported as
      // "when I cast off from Montreal on the right shore, I start on the
      // sandbar and immediately take a whole bunch of damage." Scan the
      // stretch just ahead and step the canoe out on whichever side of the
      // island it already is.
      this.lateralOffset = this.castOffClearOfIslands(
        centerX(this.flowDistance) + this.lateralOffset, this.flowDistance,
      ) - centerX(this.flowDistance);
      this.canoeWorldX = centerX(this.flowDistance) + this.lateralOffset;
      this.lateralVX = 0;
      this._castOffGraceVillage = this.currentVillage;
      this._castOffGrace = 3;
      this.world.distance = this.flowDistance;
      // Re-seed the obstacle field, same reason enterSegment() does (see
      // its own comment): the line above moves world.distance
      // discontinuously, and every pooled obstacle's downstream distance is
      // d = world.distance - z — invariant only while the river advances
      // smoothly. A jump slides the whole field relative to the world, and
      // since this particular jump is measured from a village's own
      // flowDistance, what it slides obstacles onto is that village's dock:
      // the "rocks and logs overlap the docks" report, at the exact moment
      // the dock fills the screen. Invisible here — the player is arriving
      // from the on-foot scene, so there's no previous river frame to
      // compare against.
      this.obstacles.reset();
      this.showBanner('Casting off');
    }
    this.currentVillage = null;
    this.ui.hud.classList.remove('hidden');
  }

  handleHit(entry) {
    if (this.invulnTimer > 0) return;
    if (entry.type === 'rock' || entry.type === 'island') {
      this.takeDamage(ROCK_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'bank') {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - BANK_PENALTY_SPEED);
      this.takeDamage(BANK_DAMAGE);
      this.invulnTimer = BANK_INVULN_TIME;
    } else if (entry.type === 'cannon') {
      // entry.damage overrides for the Pursuit chase phase's own, lighter
      // cannon (bossfights/blockade.js's CHASE_CANNON_DAMAGE) — the approach
      // frigate's broadside still hits for the full CANNON_DAMAGE below.
      this.takeDamage((entry.damage ?? CANNON_DAMAGE) * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'shiphull') {
      this.takeDamage(SHIP_HULL_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'steeple') {
      this.takeDamage(STEEPLE_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'diable') {
      // DIABLE_TOUCH_DAMAGE_SCALE is 1 on desktop — see its own comment.
      this.takeDamage((entry.damage ?? 18) * this.damageTakenScale * DIABLE_TOUCH_DAMAGE_SCALE);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'diable-touch') {
      // No hull damage — see DIABLE_TOUCH_FUR_PENALTY's own comment.
      // invulnTimer still gates it the same as every other hazard, so
      // holding the canoe inside him is one penalty, not one per frame.
      this.furs = Math.max(0, this.furs - DIABLE_TOUCH_FUR_PENALTY);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'wolf') {
      // A lunge that connects knocks the canoe back a beat, then it springs off.
      this.speed = Math.max(MAX_REVERSE_SPEED, this.speed - 3.5);
      this.takeDamage(WOLF_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'corriveau') {
      // Hull damage only — no knock back the way the Loup-garou's lunge
      // has. Her dodge is purely sideways, and lateral authority is weakest
      // when the canoe is slow and fighting the water, so a slowdown on
      // every hit snowballed into the next one landing too.
      this.takeDamage(CORRIVEAU_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'feu-follet') {
      this.takeDamage(FEU_FOLLET_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'wendigo') {
      // Caught still working the paddle as it listened — a cold raking blow
      // out of the trees that stops the canoe dead and bleeds some hull.
      // Meant to teach the freeze, not to end the run. Used to take 3 off
      // your speed, which on the fjord's downstream current hardly
      // registered; up Lac Saint-Pierre a player who ignored every listen
      // still paddled clear before it could listen twice more. Dead in the
      // water, the next listen catches them too.
      this.speed = Math.min(this.speed, 0);
      this.takeDamage(WENDIGO_DAMAGE * this.damageTakenScale);
      this.invulnTimer = INVULN_TIME;
    } else if (entry.type === 'tree') {
      this.takeDamage(TREE_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    } else {
      this.speed = Math.max(MIN_SPEED - 1, this.speed - LOG_PENALTY_SPEED);
      this.takeDamage(LOG_DAMAGE);
      this.invulnTimer = INVULN_TIME;
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    clearTimeout(this._damageFlashTimeout);
    this.ui.damageFlash.classList.add('show');
    this._damageFlashTimeout = setTimeout(
      () => this.ui.damageFlash.classList.remove('show'),
      DAMAGE_FLASH_TIME * 1000
    );
    // The capsize horn (gameOver, below) already covers the fatal hit —
    // playing this too would just stack a second cue on top of it.
    if (this.health > 0) playDamageBoop();
    if (this.health <= 0) this.beginCapsize();
  }

  // The hull is gone: roll it over, then put up the card. Splitting this out
  // of gameOver() is what lets the capsize be seen at all — gameOver() hides
  // the HUD and freezes the frame, so anything it triggered would have been
  // drawn over by the game-over screen on the same tick.
  beginCapsize() {
    if (this.capsize.isActive()) return; // already going over
    // It goes over the way it was already heeling. lateralVX first (the
    // canoe's actual sideways motion), falling back to the heading for a
    // boat that was turning but hadn't started moving yet, and to starboard
    // for a dead-straight capsize so the roll is never a no-op.
    const lean = this.lateralVX || this.heading || 1;
    this.capsize.start(Math.sign(lean), this.heading);
    // The invulnerability blink (update(), below) toggles canoeVisible every
    // 42ms, and render() skips the canoe entirely when it's false. A fatal
    // hit almost always lands with an invuln window already open from the
    // hit before it, so without this the whole capsize could play out on a
    // canoe that was switched off mid-blink — invisible roll, invisible
    // hull, foam appearing over nothing. The frozen update below never
    // reaches the blink again, so setting it true once here is enough.
    this.canoeVisible = true;
    // The horn belongs on the impact, not on the card a second and a half
    // later — it's the cue that tells you the hull is lost, and it wants to
    // land while the boat is actually going over.
    playCapsizeHorn();
  }

  handleCollect() {
    this.furs += 1;
    playPeltChime();
  }

  // Triggered by villageScene.js the moment the player walks up to the
  // trader outside the repair shop (see TRADER_POS there) — spends just
  // enough furs to close the gap to a full hull, or as many as the player
  // has if that's not enough, rather than always spending everything.
  tryRepairTrade() {
    if (this.health >= MAX_HEALTH) {
      this.showBanner('Hull is already sound');
      return;
    }
    if (this.furs <= 0) {
      this.showBanner('No furs to trade');
      return;
    }
    const missing = MAX_HEALTH - this.health;
    const needed = Math.ceil(missing / REPAIR_HP_PER_FUR);
    const spend = Math.min(this.furs, needed);
    this.furs -= spend;
    this.health = Math.min(MAX_HEALTH, this.health + spend * REPAIR_HP_PER_FUR);
    playRepairTrade();
    this.showBanner(`Traded ${spend} fur${spend === 1 ? '' : 's'} for repairs`);
  }

  // The gun shop at Montréal — walk up to the gunsmith standing outside and
  // the pistol is yours, free (villageScene.js fires gunsmithMet once per
  // approach). The small gun; see acquireMusket() below for the medium one,
  // and core/weapons.js's own header comment for where the large one will
  // eventually slot in. No-op once you have it.
  acquirePistol() {
    if (this.weapons.has('pistol')) return;
    this.weapons.unlock('pistol');
    this.syncWeaponControls();
    playWeaponAcquired();
    this.showBanner('PISTOL ACQUIRED — Press Z to Fire!');
  }

  // Gatineau's own musket shop — walk up to the musket master standing
  // outside and the medium gun is yours early (villageScene.js fires
  // musketMasterMet the same one-per-approach way gunsmithMet already
  // works for the pistol). Cosmetic now, not the only way in: the
  // guaranteed-musket check further down in update() grants it regardless
  // once you're on the Rideau, so skipping the shop just means picking it
  // up a bit later rather than not having it for the Blockade fight. No-op
  // once you have it either way.
  acquireMusket() {
    if (this.weapons.has('musket')) return;
    this.weapons.unlock('musket');
    this.syncWeaponControls();
    playWeaponAcquired();
    this.showBanner('MUSKET ACQUIRED — Press X to Fire!');
  }

  // Show the on-screen weapon controls (index.html #weapon-dpad, opposite
  // the move controls) exactly when you actually have a gun AND are in the
  // canoe — so it's up once you've cast off with a first weapon, gone
  // ashore in a village (guns don't fire on foot: the onWeaponFire callback
  // in the constructor already ignores anything but river mode, and a lit
  // Z/X console over a town you can't shoot in read as a broken control —
  // "a solid limit between open water and the cities", asked for
  // directly), and gone again after a capsize+restart (start() below
  // clears the weapon pool). So picking a gun up at the Montréal gunsmith
  // or the Gatineau musket master doesn't show it on the spot — it shows
  // the moment you walk back onto the dock (leaveVillage() re-syncs).
  // Each weapon's own button inside the pad is separately toggled so a
  // pistol-only run doesn't show an X button that does nothing.
  // layoutWeaponPad re-pins the pad the moment it stops being
  // display:none, since resize() may not fire then.
  syncWeaponControls() {
    const hasPistol = this.weapons.has('pistol');
    const hasMusket = this.weapons.has('musket');
    const armed = hasPistol || hasMusket;
    const shown = armed && this.mode === 'river';
    this.ui.weaponPad?.classList.toggle('hidden', !shown);
    this.ui.fireZBtn?.classList.toggle('hidden', !hasPistol);
    this.ui.fireXBtn?.classList.toggle('hidden', !hasMusket);
    if (shown) this.ui.layoutWeaponPad?.();
  }

  // Le Diable — feeds the boss this frame's canoe position and pistol shots
  // (both converted to screen space, since he's a screen-space entity at the
  // top of the channel), applies his fireball hits, drains spent bullets,
  // and fires the appear/defeat one-shots (banner + music + the flight's
  // altitude hold + arming the checkpoint).
  updateDiable(dt) {
    const alt = this.chasseGalerie.getAltitude();
    const canoeScreen = {
      x: CANOE_SCREEN_X + (this.canoeWorldX - this.cameraWorldX) * PIXELS_PER_UNIT,
      y: CANOE_SCREEN_Y - alt * PIXELS_PER_UNIT,
    };
    const bulletScreens = this.weapons.getBullets().map((b) => {
      const p = worldToScreen(b.worldX, this.flowDistance - b.flowDistance, this.cameraWorldX);
      return { x: p.x, y: p.y - (b.altitude || 0) * PIXELS_PER_UNIT, ref: b };
    });

    const res = this.diable.update(
      dt, this.flowDistance, canoeScreen, bulletScreens,
      (dmg) => this.handleHit({ type: 'diable', damage: dmg }),
      () => this.handleHit({ type: 'diable-touch' }),
      this.damageGivenScale,
    );
    for (const ref of res.hitBullets) this.weapons.removeBullet(ref);

    this.diablePct = this.diable.isActive() ? this.diable.hpPct() : null;

    if (this.diable.consumeJustAppeared()) {
      this.showBanner('LE DIABLE — break the pact!');
      this.chasseGalerie.setHeldAloft(true);
      playDiableRoar();
      this.music?.start();
      this.music?.playDiableTrack();
      // From here on a capsize is the Devil taking your soul — respawn at
      // the fight with the pistol, not back at Montréal.
      this._diableCheckpoint = true;
      this.startFlowDistance = DIABLE_FLOW_DISTANCE - 6;
      this.startSegment = 'lawrenceWest';
    }
    if (this.diable.consumeJustDefeated()) {
      this.showBanner('THE PACT IS BROKEN — Gatineau ahead');
      this.chasseGalerie.setHeldAloft(false);
      playDiableDefeat();
      this.music?.endBossTrack();
      // A beat of invulnerability right after the win, same scale as
      // respawning (SPAWN_INVULN_TIME) — covers bank scrapes etc. in the
      // first instant back in control.
      this.invulnTimer = Math.max(this.invulnTimer, SPAWN_INVULN_TIME);
      // Steeples specifically get a *distance*-based grace instead of a
      // timed one: the arena's hold releases here and steeple collision
      // (suspended for the whole fight, see the flight.hit check below)
      // resumes on the very next frame otherwise, so a canoe that limped
      // through Diable's fire at low hull could fly straight into whichever
      // steeple happens to sit closest to the arena and capsize moments
      // after already winning. Steeples are now a fixed list
      // (chasseGalerie.js's STEEPLE_DEFS, not generated), so this is
      // checkable exactly rather than guessed: the largest gap between any
      // two consecutive ones is 26 units. 30 clears past the worst case
      // with margin, not just a typical one — verified against the crude
      // "chase Diable, don't dodge" test pilot, who reaches the fight
      // already down to ~10 hull from his fire alone and has no margin for
      // bad luck right after.
      this._steepleGraceUntil = this.flowDistance + 30;
    }
  }

  update(dt) {
    if (this.paused) return; // hard freeze, same as gameover below — see togglePause()

    this.time += dt;

    if (this.state !== 'playing') {
      // Game over: a hard freeze. The last frame drawn — the end of the
      // capsize animation below — stays on screen under the card. Nothing
      // here advances the river clock or redraws.
      return;
    }

    // Going over (world/capsize.js). The river is frozen for the duration:
    // no input, no physics, no obstacles, no boss — nothing that could land
    // a second hit on a hull that's already lost, or scroll the water out
    // from under the wreck. The world holds exactly where it was, the way it
    // always did at a capsize; what's new is that the canoe is animated on
    // top of it instead of the last live frame simply sitting there until
    // the card appeared. render() picks the overturned draw path off
    // isActive(), and the HUD stays up (gameOver() is what hides it) so the
    // empty hull bar is visible as the boat rolls.
    if (this.capsize.isActive()) {
      const done = this.capsize.update(dt);
      this.render();
      this.updateHud();
      if (done) this.gameOver();
      return;
    }

    if (this.mode === 'village') {
      const { reboard, tradeRequested, gunsmithMet, musketMasterMet } = this.villageScene.update(dt, this.input.state);
      if (tradeRequested) this.tryRepairTrade();
      if (gunsmithMet) this.acquirePistol();
      if (musketMasterMet) this.acquireMusket();
      this.villageScene.draw(this.ctx);
      if (reboard) this.leaveVillage();
      return;
    }

    const keys = this.input.state;

    // Which speed this.speed drifts back toward with no input, and how fast
    // — MIN_SPEED/a gentle decay everywhere except lawrenceWest, where the
    // target is negative and the decay is much quicker (see
    // UPRIVER_CURRENT/UPRIVER_DECEL/AMBIENT_CURRENT's comments).
    // Upriver whitewater acts on the canoe's own speed, not as a push added
    // on top of it (see RAPIDS_UPRIVER_DRAG). Read up front because it moves
    // both the no-paddle drift target here and the paddling ceiling below.
    // Calm water under La Corriveau too (corriveauCalm): her fight is all
    // sideways dodging, paced at well under a unit a second (HAUNT_TIME), and
    // whitewater caps how far the bow comes round (RAPIDS_STEER_PENALTY).
    // A patch of rapids two-thirds of the way to Québec City, crossed in ~2s
    // at an ordinary pace, held the canoe for ~40s at hers — a dodging run
    // took 22 hits, nearly all of them in there.
    const corriveauCalm = this.segment === CORRIVEAU_SEGMENT && this.corriveau.isActive();
    const upriverRapids = this.segment === 'lawrenceWest' && !this.chasseGalerie.isActive() && !corriveauCalm
      ? rapidsStrength(this.flowDistance)
      : 0;
    const ambientCurrent = (AMBIENT_CURRENT[this.segment] ?? MIN_SPEED) - upriverRapids * RAPIDS_UPRIVER_PUSH;
    // See WINDED_ACCEL_CUT: full while in the whitewater, easing off after.
    this.winded = upriverRapids > 0.1 ? 1 : Math.max(0, (this.winded ?? 0) - dt / WINDED_RECOVERY_TIME);
    // Upriver the paddle is slower to build and tops out lower (see
    // UPRIVER_MAX_SPEED); everywhere else, the ordinary values.
    const upriver = this.segment === 'lawrenceWest';
    const topSpeed = upriver ? UPRIVER_MAX_SPEED : MAX_SPEED;
    const paddleAccel = ACCEL * (upriver ? UPRIVER_ACCEL_SCALE : 1) * (1 - WINDED_ACCEL_CUT * this.winded);
    const ambientDecel = this.segment === 'lawrenceWest'
      ? UPRIVER_DECEL
      : DECEL_DRIFT * 0.3 * DRIFT_DECEL_TOUCH_MULT;

    if (keys.up) {
      // Above the top speed (crossing into lawrenceWest still carrying the
      // fjord's pace) the current wins the canoe back down at its own
      // ambientDecel rate rather than snapping it to the lower ceiling.
      if (this.speed <= topSpeed) this.speed = Math.min(topSpeed, this.speed + paddleAccel * dt);
      else this.speed = Math.max(topSpeed, this.speed - ambientDecel * dt);
    }
    else if (keys.down) {
      // Brake hard toward a stop; only past ~0 does it slow to the gentler
      // ACCEL rate, so holding on still backs you up but the first thing
      // that happens is an obvious slow-down.
      const rate = this.speed > 0 ? BRAKE_DECEL : ACCEL;
      this.speed = Math.max(MAX_REVERSE_SPEED, this.speed - rate * dt);
    }
    // No input: drift back toward the current's own speed from whichever
    // side you're currently on — this is what makes upstream paddling a
    // deliberate, sustained effort rather than a one-way switch: stop
    // paddling and the river carries you forward again (or, on
    // lawrenceWest, backward — same drift, aimed the other way).
    // EXCEPT when flying (Chasse-galerie) - no current in the sky!
    else if (!this.chasseGalerie.isActive()) {
      // While the Wendigo listens the water goes glass-still under its cold:
      // a canoe left alone glides to a stop instead of being carried back
      // down the lake. Without this its freeze-or-flee was unwinnable once
      // it moved up onto lawrenceWest — obeying a listen meant ~4s drifting
      // backward on the upriver current, more ground than the paddle
      // between listens could win back (measured: net *negative* progress
      // per cycle, the stall failsafe the only way out). Down still backs
      // you up if you want it to; this only stops the current doing it.
      const stillWater = this.segment === WENDIGO_SEGMENT && this.wendigo.isListening();
      const target = stillWater ? Math.max(0, ambientCurrent) : ambientCurrent;
      if (this.speed > target) this.speed = Math.max(target, this.speed - ambientDecel * dt);
      else this.speed = Math.min(target, this.speed + ambientDecel * dt);
    }
    // Upriver whitewater caps how fast you can paddle: anything above the
    // ceiling bleeds off at RAPIDS_UPRIVER_DRAG, and once you're clear the
    // only way back up is ACCEL — so leaving the rapids is a climb back to
    // speed, not a surge.
    if (upriverRapids > 0) {
      const ceiling = topSpeed - upriverRapids * RAPIDS_UPRIVER_PUSH;
      if (this.speed > ceiling) this.speed = Math.max(ceiling, this.speed - RAPIDS_UPRIVER_DRAG * dt);
    }
    // La Corriveau's weight on the canoe: while she's on it, it can't get
    // ahead of her 2.5-minute schedule up to Québec City (corriveau.js's
    // HAUNT_TIME / paceLimit). Bled down to the limit at
    // CORRIVEAU_DRAG_DECEL rather than snapped, so it reads as the canoe
    // dragging, not hitting a wall.
    if (this.segment === CORRIVEAU_SEGMENT) {
      const limit = this.corriveau.paceLimit(this.flowDistance);
      if (limit !== null && this.speed > limit) {
        this.speed = Math.max(limit, this.speed - CORRIVEAU_DRAG_DECEL * dt);
      }
    }

    // Rapids strength at where the canoe currently is (i.e. before this
    // frame's advance) — the current adds its own push on top of whatever
    // the player is doing with the paddle, rather than replacing it, so
    // "up" still matters even mid-rapids. this.speed stays the player's own
    // paddling stat; effectiveSpeed is what actually moves the world.
    // Rapids push *with* the current, so on lawrenceWest — where the
    // current itself runs backward — hitting whitewater means fighting a
    // stronger current, not getting a boost: same magnitude, flipped sign.
    //
    // Silenced across the blockade's own "clear water" span (blockade.js's
    // own comment on APPROACH_RANGE/CHASE_DISTANCE explicitly describes
    // this stretch that way) — river/path.js's rapids are a periodic
    // pattern with no knowledge of what's placed on top of them, and this
    // particular encounter happens to land inside one of those periodic
    // stretches by pure coincidence. Found chasing a report that backing
    // away from the hull "wasn't cooking in": retreat speed was real (the
    // retreating fix above), but decayed toward zero as the rapids grew
    // stronger the further upstream (away from the ship) the canoe got —
    // at peak strength, RAPIDS_BOOST alone very nearly equals
    // MAX_REVERSE_SPEED, so paddling backward here could stall out
    // asymptotically rather than actually clearing the hull, no matter how
    // long Down was held. A boss encounter fighting unrelated ambient
    // whitewater on top of cannon fire and a solid hull was never the
    // intent (this segment's own AMBIENT_CURRENT/UPRIVER_CURRENT design is
    // about lawrenceWest, not the calm Rideau denouement rideau is meant
    // to be) — silencing it here fixes the actual reported bug at its
    // second, less obvious cause, rather than only its first.
    // The British Warship fight (bossfights/britishWarship.js) needs no
    // equivalent silencing — it's a point-triggered held arena now, not an
    // approach run-up, so there's no dodge-and-thread stretch for ambient
    // whitewater to interfere with the way there was here.
    const nearBlockade = this.segment === 'rideau'
      && this.flowDistance > BLOCKADE_SHIP_FLOW_DISTANCE - BLOCKADE_APPROACH_RANGE
      && this.flowDistance < BLOCKADE_SHIP_FLOW_DISTANCE + 50;
    const rapids = nearBlockade || corriveauCalm ? 0 : rapidsStrength(this.flowDistance);
    // Downstream the whitewater is a boost added on top of your paddling.
    // Upriver it's already in this.speed (see upriverRapids above), so
    // nothing is added here — an additive term is exactly what snapped back
    // to full speed the instant the rapids faded.
    const rapidsPush = this.segment === 'lawrenceWest' ? 0 : RAPIDS_BOOST;

    // Chasse-galerie: once airborne the canoe holds a slow, steady glide,
    // fully independent of the river current below (which on this upstream
    // stretch runs backward and would otherwise stall the whole flight at
    // this cruise speed). Paddling only nudges the glide a little either
    // way; the flight is about threading the steeples, not speed. The
    // take-off still reads as gradual because the altitude/tilt ramp up
    // visually (see liftFraction()).
    const flying = this.chasseGalerie.isActive();
    let effectiveSpeed;
    if (flying) {
      const paddle = keys.up ? 1.5 : keys.down ? -1.5 : 0;
      effectiveSpeed = FLIGHT_CRUISE_SPEED + paddle;
    } else {
      effectiveSpeed = this.speed + rapids * rapidsPush;
    }

    // Advance the shared river clock using this frame's effective speed —
    // the same value obstacles sample below — so the baked downstream
    // distance (d = world.distance - z) stays exactly invariant. Floored
    // per SEGMENT_FLOOR's comment — no ceiling at all, on any segment.
    const floor = SEGMENT_FLOOR[this.segment] ?? 0;
    let proposedFlowDistance = Math.max(floor, this.flowDistance + effectiveSpeed * dt);

    // The frigate's hull is a genuine solid wall, not just a one-off "you
    // clipped it" penalty — outside the gap, forward progress is simply
    // held here, same shape as the bank clamp just below but on the flow
    // axis instead of the lateral one. Using last frame's lateralOffset for
    // the world-X check (this frame's isn't computed until just below) is a
    // one-frame-stale approximation, same tradeoff the bank check already
    // makes implicitly — lateralOffset can't move far in one frame.
    //
    // retreating guards against a real soft-lock this used to have: once
    // pinned against the hull, isHullBlocking() doesn't know or care which
    // way you're trying to go — it just says "still inside the hull's own
    // z-depth, still on the wrong side of the gap," true whether you're
    // pushing further in OR backing straight out the way you came. Without
    // this check, "held in place" fired on the backward attempt too, every
    // single frame, silently undoing the escape bounce below and any
    // manual reversing on top of it — flowDistance could never actually
    // move, so "back away, then come around the other side" simply didn't
    // work no matter how long Down was held. Comparing distance-from-the-
    // ship before and after lets retreat through even while still
    // nominally "inside" the blocked zone; only closing the distance (or
    // holding it) still gets stopped.
    if (this.segment === 'rideau') {
      const tentativeWorldX = centerX(proposedFlowDistance) + this.lateralOffset;
      const retreating = Math.abs(proposedFlowDistance - BLOCKADE_SHIP_FLOW_DISTANCE)
        > Math.abs(this.flowDistance - BLOCKADE_SHIP_FLOW_DISTANCE);
      if (!retreating && this.blockade.isHullBlocking(proposedFlowDistance, tentativeWorldX)) {
        proposedFlowDistance = this.flowDistance; // held in place, not pushed through
        // Bounce off the hull: strong backward push so you can escape
        this.speed = -8 * speedScale;
        this.handleHit({ type: 'shiphull' });
      }
      // The British Warship's own held arena, same pattern as Diable's
      // below — once triggered, forward progress is clamped at the point
      // it began until it resolves (sunk or CHASE_HOLD_TIME survived — see
      // britishWarship.js's own opening comment for why a plain "paddle
      // past it" resolution couldn't be stretched past about a minute no
      // matter how the fight itself was tuned).
      if (this.britishWarship.isChaseHolding()) {
        proposedFlowDistance = this.britishWarship.getChaseHoldFlowDistance();
      }
    }

    // Diable's held arena: forward progress is clamped at the fight until
    // he's beaten. The clamp lands one frame before diable.update() below
    // flips the fight on; that's fine — a single frame of overshoot at
    // cruise speed is well under a tenth of a unit.
    if (this.segment === 'lawrenceWest' && !this.diable.isDefeated()
      && proposedFlowDistance >= DIABLE_FLOW_DISTANCE) {
      proposedFlowDistance = DIABLE_FLOW_DISTANCE;
    }

    this.flowDistance = proposedFlowDistance;
    this.world.distance = this.flowDistance;

    // Guaranteed pistol past Montréal — whether or not you stopped in town
    // and walked up to the gunsmith. acquirePistol() no-ops if you already
    // have it, so this just backstops the case where you sailed on by.
    // Also unconditional on the Rideau: there's no path onto that segment
    // (normal play or any ?start= cheat — rideau/gatineau/kars/kingston/
    // british-blockade/...) that doesn't already imply "past Montréal," but
    // a cheat drops straight there without ever ticking update() while
    // segment === 'lawrenceWest', so the check above alone would never fire
    // and the British Blockade (which assumes the pistol is a given) would
    // be unwinnable — no gun, no way to suppress its guns.
    if (((this.segment === 'lawrenceWest' && this.flowDistance > MONTREAL_FLOW_DISTANCE)
      || this.segment === 'rideau') && !this.weapons.has('pistol')) {
      this.acquirePistol();
    }

    // Guaranteed musket on the Rideau — same reasoning as the pistol
    // fallback just above, one gun over. Visiting Gatineau's musket master
    // is cosmetic now, not load-bearing: the British Blockade's chase ship
    // is shootable (bossfights/blockade.js), and a player who paddled
    // straight past the dock shouldn't be locked out of that just for
    // skipping a shop. this.segment === 'rideau' alone is sufficient (unlike
    // the pistol's own two-part condition) — there's no way onto this
    // segment, normal play or any ?start= cheat, that isn't already past
    // Gatineau.
    if (this.segment === 'rideau' && !this.weapons.has('musket')) {
      this.acquireMusket();
    }

    let steerInput = 0;
    if (keys.left) steerInput -= 1;
    if (keys.right) steerInput += 1;

    // Swing the bow first — the heading is integrated in every mode, including
    // the two held fights below that drive lateralVX directly, because the
    // canoe should still visibly come about when you dodge. In normal play
    // this is also the *only* thing the steer keys touch: the lateral thrust
    // underneath comes off the heading, not off the key.
    //
    // Fighting the current: whitewater limits how far over you can hold the
    // bow, rather than scaling the sideways force directly the way it used
    // to. Same net authority (sin is near-linear across this range, so the
    // thrust still drops by about RAPIDS_STEER_PENALTY), and it's visible —
    // the rapids straighten you out instead of invisibly sapping a number.
    // Not in the air (Chasse-galerie), where the river below can't touch the
    // canoe at all, only the steeples can.
    const steerRapids = flying ? 0 : rapids;
    const headingTarget = this.diable.isHolding() || this.britishWarship.isChaseHolding()
      ? steerInput * FIGHT_HEADING
      : steerInput * HEADING_MAX * (1 - steerRapids * RAPIDS_STEER_PENALTY);
    // Exponential approach, scaled by dt so the swing rate doesn't depend on
    // framerate. Capped at 1 so a long frame (a tab coming back, the smoke
    // test's own coarse steps) snaps to the target instead of overshooting
    // past it and ringing.
    this.heading += (headingTarget - this.heading) * Math.min(1, HEADING_RESPONSE * dt);

    // Diable fight: direct lateral control for instant dodging, matching the
    // vertical responsiveness. No accel ramp, no damping, and — critically —
    // NOT run through the STEER_MAX clamp below, which is halved on touch
    // and was quietly throttling this to a crawl. Releasing the key snaps
    // the canoe to a dead stop, same as the up/down dodge.
    if (this.diable.isHolding()) {
      this.lateralVX = steerInput * FIGHT_LATERAL_SPEED;
    } else if (this.britishWarship.isChaseHolding()) {
      this.lateralVX = steerInput * CHASE_LATERAL_SPEED;
    } else {
      // You go where the bow points. The sideways force is the hull's own
      // thrust resolved through the heading — press a key and nothing moves
      // laterally until the bow has actually come round.
      this.lateralVX += Math.sin(this.heading) * STEER_THRUST * dt;
      this.lateralVX -= this.lateralVX * STEER_DAMPING * dt;

      // Cross-current from blockade fight: pushes you away from the gap,
      // getting stronger as you approach the ship. Applied before velocity
      // clamping so the current is a real force to fight, not just a nudge.
      if (this.blockadeCrossCurrent) {
        this.lateralVX += this.blockadeCrossCurrent * dt;
      }

      // Chasse-galerie storm crosswind: shoves the canoe toward the banks the
      // whole flight, so holding a centre line is an active fight. Same "real
      // force, applied before the clamp" treatment as the blockade current.
      if (flying && !this.diable.isActive()) {
        this.lateralVX += this.chasseGalerie.windAccel(this.flowDistance, this.time) * dt;
      }

      // The Warship squall's gusts (britishWarship.js's stormGustAt) — the
      // same treatment, on the approach only: its windAccel() reads 0 the
      // instant the hold starts, and that branch above never reaches here
      // anyway. Segment-guarded like every other Warship call.
      if (this.segment === 'rideau') {
        this.lateralVX += this.britishWarship.windAccel(this.flowDistance) * dt;
      }

      this.lateralVX = clamp(this.lateralVX, -STEER_MAX, STEER_MAX);
    }

    // The navigable water: the canoe (flying or not) is held to this.
    const waterEdge = widthAt(this.flowDistance) / 2 - EDGE_MARGIN;
    // How far the hull reaches across the channel beyond the canoe's own
    // centre: zero pointed straight downstream, CANOE_HALF_LENGTH * sin at
    // full lock. Every boundary below is pulled in by it, so running the
    // shore with the bow swung out grounds you early — the same geometry
    // obstacles.js's hullHit() uses, applied to the edge of the water. This
    // is the difference between a turn and a lean: the boundary moves.
    const hullReach = CANOE_HALF_LENGTH * Math.abs(Math.sin(this.heading));
    // In the air the hard clamp sits a hair past the water so there's no
    // invisible wall at the edge — but that shallow strip is the bank
    // treetops (see below), not free sky. The held Diable fight ignores the
    // channel entirely and uses its own wide arena (DIABLE_ARENA_HALF).
    const channelHalf = this.diable.isHolding()
      ? DIABLE_ARENA_HALF
      : waterEdge + (flying ? this.chasseGalerie.lateralMargin() : 0);
    // Never past 0 — a pathologically narrow channel shouldn't invert the
    // clamp and fling the canoe to the far bank.
    const half = Math.max(0, channelHalf - hullReach);
    const proposed = this.lateralOffset + this.lateralVX * dt;
    if (proposed > half || proposed < -half) {
      this.lateralOffset = clamp(proposed, -half, half);
      this.lateralVX *= -0.2;
      this.heading *= BANK_HEADING_KICK;
      if (!flying) this.handleHit({ type: 'bank' });
    } else {
      this.lateralOffset = proposed;
    }

    // Chasse-galerie: the devil's canoe belongs over the river. Stray past
    // the water's edge into the bank treetops and you clip them — a hit
    // every INVULN_TIME you're in there, plus a shove back toward the
    // channel — so the flight stays fenced to the water even though you're
    // airborne.
    if (flying && !this.diable.isHolding() && Math.abs(this.lateralOffset) + hullReach > waterEdge) {
      this.lateralVX -= Math.sign(this.lateralOffset) * TREE_PUSHBACK * dt;
      // Outside the held fight, the treetops still fence and bite (dodging
      // Diable's fire while he's holding is challenge enough — the arena is
      // its own wide space, not the gorge channel). Also covered by
      // _steepleGraceUntil (same distance window consumeJustDefeated() sets
      // for steeples, below) — DIABLE_ARENA_HALF (7 units) is wider than
      // this channel's own waterEdge (~2.55 here), so the arena's own dodge
      // room routinely leaves the canoe well outside waterEdge right as the
      // fight ends; isActive() alone only covers the fixed 2.4s 'dying'
      // animation, not however long it actually takes to drift back inside
      // waterEdge afterward. Missing this exact protection was a genuine
      // gap in an otherwise-deliberate "don't punish a hard-fought win"
      // design (the steeple grace's own comment already describes this
      // scenario) — folded in here rather than left as a hazard type the
      // grace period happened to not cover.
      if (!this.diable.isActive() && this.flowDistance > (this._steepleGraceUntil ?? -Infinity)) {
        this.handleHit({ type: 'tree' });
      }
    }

    this.canoeWorldX = centerX(this.flowDistance) + this.lateralOffset;
    // A baked feature island (river/islands.js — currently just the Island
    // of Montreal) sits offset from the ambient centerX, and the camera
    // otherwise has no idea it exists: paddling straight with zero
    // steering input keeps the canoe exactly on centerX, and
    // CAMERA_MAX_ONSCREEN_OFFSET (5 world units, well under the island's
    // own offset) would then hold the camera there too — pushing much of
    // a wide island and its far channel outside the visible ~20-unit-wide
    // window without the player ever choosing to look away from it. Nudge
    // the camera's own baseline halfway toward the island's centre while
    // inside its span, so the split is visible by default rather than only
    // when deliberately steered into view. Scoped to FEATURE_ISLAND_RANGE
    // specifically (not just "does braidAt return something") so this
    // doesn't also nudge the camera for every small procedural braid
    // island elsewhere in the game, which was never a visibility problem.
    let islandBias = 0;
    if (this.flowDistance >= FEATURE_ISLAND_RANGE[0] && this.flowDistance <= FEATURE_ISLAND_RANGE[1]) {
      const islandHere = braidAt(this.flowDistance);
      if (islandHere) islandBias = (islandHere.centerX - centerX(this.flowDistance)) * 0.5;
    }
    this.cameraCenterX = lerp(this.cameraCenterX, centerX(this.flowDistance) + islandBias, CAMERA_SMOOTH);
    // Zero inside the dead zone; positive/negative beyond it, so any real
    // steering swings the camera into motion well before the canoe visually
    // nears the edge of the canvas (see CAMERA_DEAD_ZONE's own comment).
    const lateralExcess = this.lateralOffset - clamp(this.lateralOffset, -CAMERA_DEAD_ZONE, CAMERA_DEAD_ZONE);
    this.cameraLateralPull = lerp(this.cameraLateralPull, lateralExcess, CAMERA_LATERAL_SMOOTH);
    if (this.diable.isHolding()) {
      // Arena fight: pin the camera to the channel centre so the dodge maps
      // one-to-one to screen position — none of the follow lag or the
      // on-screen-offset backstop below, both of which would drag the canoe
      // back toward centre and fight the player's input.
      this.cameraWorldX = this.cameraCenterX;
    } else {
      this.cameraWorldX = this.cameraCenterX + this.cameraLateralPull;
      // The hard backstop (see its comment above) — clamps how far the canoe's
      // final on-screen position can end up from center, independent of
      // whatever the two lerps above are still catching up on.
      const onscreenOffset = clamp(this.canoeWorldX - this.cameraWorldX, -CAMERA_MAX_ONSCREEN_OFFSET, CAMERA_MAX_ONSCREEN_OFFSET);
      this.cameraWorldX = this.canoeWorldX - onscreenOffset;
    }

    // Diable fight: the river is locked, but up/down move the canoe
    // vertically within the arena so you can back off from the Devil (down
    // the screen) or press up toward him to dodge his fire. Feeds the held
    // hover altitude the flight update below eases toward.
    if (this.diable.isHolding()) {
      if (keys.down) this._bossHoverAlt -= FIGHT_HOVER_SPEED * dt;
      else if (keys.up) this._bossHoverAlt += FIGHT_HOVER_SPEED * dt;
      else {
        const back = BOSS_HOVER_HEIGHT - this._bossHoverAlt;
        this._bossHoverAlt += Math.sign(back) * Math.min(Math.abs(back), FIGHT_HOVER_RECENTER * dt);
      }
      this._bossHoverAlt = clamp(this._bossHoverAlt, FIGHT_HOVER_MIN, FIGHT_HOVER_MAX);
      this.chasseGalerie.setHeldAlt(this._bossHoverAlt);
    }

    // British Warship chase: the pursuit holds flowDistance (see the clamp
    // above), but up/down still move the canoe fore/aft within that
    // standoff — press up to close on the gunboat (easier shots, cannon
    // fire tightens up too), pull back on down to open range. Recenters to
    // 0 when neither is held, same idle behaviour as Diable's hover.
    if (this.britishWarship.isChaseHolding()) {
      if (keys.up) this._chaseHoldZ += CHASE_HOLD_Z_SPEED * dt;
      else if (keys.down) this._chaseHoldZ -= CHASE_HOLD_Z_SPEED * dt;
      else {
        this._chaseHoldZ -= Math.sign(this._chaseHoldZ) * Math.min(Math.abs(this._chaseHoldZ), CHASE_HOLD_Z_RECENTER * dt);
      }
      this._chaseHoldZ = clamp(this._chaseHoldZ, CHASE_HOLD_Z_MIN, CHASE_HOLD_Z_MAX);
    } else {
      this._chaseHoldZ = 0; // always centred outside the hold, so a fresh chase starts clean
    }

    // Chasse-galerie: tick the flight here — before the dock / braid-island /
    // obstacle checks below — so those all see this frame's airborne state
    // and nothing on the water can touch the canoe the instant it lifts off.
    if (this.segment === 'lawrenceWest') {
      const flight = this.chasseGalerie.update(this.flowDistance, this.canoeWorldX, dt);
      // The flight's own hazards (steeples, crosswind) are suspended for the
      // Diable fight — he's the whole challenge there.
      if (flight.hit && !this.diable.isActive() && this.flowDistance > (this._steepleGraceUntil ?? -Infinity)) {
        this.handleHit({ type: 'steeple' });
      }
      if (flight.active && flight.altitude > 0.1 && !this._chasseGalerieBannerShown) {
        this.showBanner('LA CHASSE-GALERIE — thread the steeples!');
        this._chasseGalerieBannerShown = true;
        this.music?.start(); // safe even if ?start=chasse-galerie drops in before a gesture
        this.music?.playChasseGalerieTrack();
      }
    }
    const airborne = this.chasseGalerie.isActive();

    // Update weapons (bullets fly forward)
    this.weapons.update(dt);

    // Le Diable — the held-arena boss just before Gatineau. Ticked here so it
    // sees this frame's canoe position (for aiming/collision) and the flow
    // clamp above is already in place.
    if (this.segment === 'lawrenceWest') {
      this.updateDiable(dt);
    }

    // Docking takes priority over everything else this frame — running
    // into a dock is the one collision that isn't damage. Still checked
    // first, every frame, ahead of the mouth-crossing check below (so
    // docking at Tadoussac itself, if the player happens to steer into its
    // reach on the way past, still works exactly like every other village).
    if (this._castOffGrace > 0) this._castOffGrace -= dt;
    const dockHit = getDockHit(this.flowDistance, this.canoeWorldX);
    // Suppressed when: (a) it's the dock just cast off from and the grace
    // window is still open (see leaveVillage()'s lawrenceWest branch), or
    // (b) the canoe is airborne in the Chasse-galerie — there's no landing
    // anywhere along the flight, the riverbank towns are steeples now, not
    // docks. Every other dock still triggers normally.
    const suppressed =
      (this._castOffGrace > 0 && dockHit === this._castOffGraceVillage) ||
      this.chasseGalerie.isActive();
    if (dockHit && !suppressed) {
      // Kingston's dock walks the player ashore exactly like every other
      // village now (it used to win the run outright here, before a
      // separate bridge stood in as the actual walk-around entrance — see
      // world/villages.js's own comment on KINGSTON_DOCK_REACH). The win
      // still happens below, once leaveVillage() pushes flowDistance past
      // Kingston's own line on cast-off.
      this.enterVillage(dockHit);
      return;
    }

    // Gatineau is the junction onto the Rideau (world/river/route.js). Same
    // shape as the mouth crossing just below: if the canoe reaches Gatineau's
    // flowDistance without steering into its dock, it rolls straight on onto
    // the Rideau leg toward Kingston.
    if (this.segment === 'lawrenceWest' && this.flowDistance >= GATINEAU_FLOW_DISTANCE) {
      this.enterRideau();
      return;
    }

    // Journey's end — Kingston on the Rideau. An approach banner first (the
    // harbour is already opening up around you by now — see path.js's
    // rideauWidthAt), then the canoe is simply held at the town's own line
    // a short stretch later (see the comment above leaveVillage()).
    if (this.segment === 'rideau') {
      if (!this.kingstonAnnounced && this.flowDistance >= KINGSTON_FLOW_DISTANCE - KINGSTON_APPROACH_LEAD) {
        this.kingstonAnnounced = true;
        this.showBanner('KINGSTON — Fort Frontenac ahead');
        // Journey's end gets its own deliberate cue, not whatever the
        // shuffle happens to be playing — same trigger point as the banner
        // above, so it's already running under the approach, the dock, and
        // the victory card (see KINGSTON_TRACK's own comment, audio/music.js).
        this.music?.start(); // safe even if ?start=kingston drops in before a gesture
        this.music?.playKingstonTrack();
      }
      if (this.flowDistance >= KINGSTON_FLOW_DISTANCE) {
        // Held, silently — the ambient current keeps trying to carry the
        // canoe on past every frame and this just puts it back. The dock
        // check further down still runs, so drifting sideways onto the
        // planks from here still walks you ashore.
        this.flowDistance = KINGSTON_FLOW_DISTANCE;
        this.journeyComplete = true;
      }
    }

    // Crossing the mouth always continues upriver toward Québec City now —
    // no fork, no choice, no lean or dock-based branch selection. There
    // used to be one (lean toward Tadoussac's own bank to peel off west,
    // otherwise default east toward Sept-Îles); this game is a one-way trip
    // now, and lawrenceEast survives only as real geography for the minimap
    // to draw (see route.js's module comment) — a fun three-way junction to
    // look at, not a live gameplay destination.
    if (this.segment === 'fjord' && this.flowDistance >= MOUTH_DISTANCE) {
      if (!this.mouthAnnounced) this.mouthAnnounced = true;
      this.enterSegment('lawrenceWest', SEGMENT_SHAPE_OFFSET.lawrenceWest + 0.5);
      this.showBanner('Paddling upriver toward Québec City — fight the current');
    } else if (this.segment === 'lawrenceEast' && this.flowDistance < MOUTH_DISTANCE) {
      // Only reachable via main.js's ?start= cheat now (e.g. ?start=sept-
      // iles) — normal play never sets segment to lawrenceEast any more.
      // Kept so paddling backward from a cheat-started position still
      // relabels correctly instead of leaving the minimap's local-distance
      // math clamped at 0, stuck on Tadoussac's own point.
      this.segment = 'fjord';
    }

    // Braided-channel islands sit mid-water, not at a fixed edge, so unlike
    // the bank they can't be handled with a position clamp — the canoe must
    // be free to pass through that X range in either side channel, and only
    // colliding if it's actually still over the island itself. Skipped while
    // airborne in the Chasse-galerie — same as rocks and deadfall below, the
    // only hazard up there is the steeples.
    const braid = braidAt(this.flowDistance);
    if (!airborne
      && braid && Math.abs(this.canoeWorldX - braid.centerX) < braid.halfWidth + ISLAND_HIT_MARGIN) {
      this.handleHit({ type: 'island' });
    }

    this.paddleTimer += dt * this.speed;
    if (this.paddleTimer > 2.2) {
      this.paddleTimer = 0;
      this.paddleSide *= -1;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      this.canoeVisible = Math.floor(this.time * 12) % 2 === 0;
    } else {
      this.canoeVisible = true;
    }

    this.rapids = rapids;
    this.effectiveSpeed = effectiveSpeed;

    // Fallback for a run that starts already in lawrenceEast — only
    // reachable via main.js's ?start= cheat now (e.g. ?start=sept-iles),
    // since normal play never branches there any more. The mouth-crossing
    // check above already handles a *live* crossing from the fjord, but a
    // run that begins in lawrenceEast never passes through that at all.
    // Deliberately not "segment !== lawrenceWest" here: a run starting in
    // lawrenceWest (e.g. ?start=quebec-city) never actually reached
    // Tadoussac either, just a numeric coincidence of SEGMENT_SHAPE_OFFSET
    // putting it past MOUTH_DISTANCE too.
    if (this.segment === 'lawrenceEast' && !this.mouthAnnounced) {
      this.mouthAnnounced = true;
      this.showBanner("You've reached Tadoussac — the Saguenay opens into the Saint Lawrence");
    }

    // Airborne in the Chasse-galerie (`airborne`), nothing on the water below
    // interacts with the canoe — rocks and deadfall can't hit it, fur pelts
    // can't be collected. The field still advances so it's coherent again on
    // landing. Only the steeples matter up there.
    //
    // Same treatment inside the British Warship's held arena, asked for
    // directly: "can we remove the obstacles in the river for the British
    // Warship fight?" They made no sense there in the first place — the
    // fight clamps flowDistance, so the canoe isn't actually travelling,
    // yet obstacles.js's pool kept drifting past and hitting it: scenery
    // sliding by and doing damage in a fight that's meant to be you, the
    // gunboat and its cannonballs. This is also the one genuinely
    // procedural thing on the water (the pool is placed with Math.random,
    // so it differs run to run, unlike the hash-placed trees/whales, which
    // are the same every time) — see the reply that came with this request
    // about wanting a static landscape.
    const warshipHeld = this.segment === 'rideau' && this.britishWarship.isChaseHolding();
    this.obstacles.update(
      this.time, dt, effectiveSpeed, this.canoeWorldX,
      (entry) => this.handleHit(entry),
      (entry) => this.handleCollect(entry),
      !airborne && !warshipHeld,
      this.heading,
    );

    // Le Loup-garou — the night beast over the lower fjord, the first fight,
    // on the run down to Tadoussac. Guarded on its own segment, same
    // reasoning as the blockade below: TRIGGER_DISTANCE is a number on that
    // segment's own line.
    if (this.segment === LOUP_GAROU_SEGMENT) {
      this.loupGarou.update(dt, this.flowDistance, this.canoeWorldX, effectiveSpeed, (entry) => this.handleHit(entry));
      if (this.loupGarou.consumeJustSpotted()) {
        // The big title card (#boss-banner) — the game's first boss fight
        // earns real fanfare, the treatment the Wendigo had when it was
        // first (the Loup-garou used to get the small milestone banner).
        this.showBossBanner('LOUP-GAROU');
        playWolfHowl();
        this.music?.start(); // safe even if ?start=loup-garou drops in before a gesture
        this.music?.playLoupGarouTrack();
      }
      if (this.loupGarou.consumeJustDelivered()) {
        this.showBanner('The mouth opens ahead — the beast falls back');
        this.music?.endBossTrack();
      }
    }

    // La Corriveau — the hanged woman in her gibbet cage, in the mist on
    // the run from Beaupré into Québec City. Takes the camera so the wisps
    // she casts leave from where the cage is actually drawn.
    if (this.segment === CORRIVEAU_SEGMENT) {
      this.corriveau.update(dt, this.flowDistance, this.canoeWorldX, this.cameraWorldX, (entry) => this.handleHit(entry));
      if (this.corriveau.consumeJustSpotted()) {
        this.showBossBanner('LA CORRIVEAU');
        // Says why the canoe is suddenly crawling (paceLimit above).
        this.showBanner('She clings to the canoe — it drags under her weight');
        playCorriveauWail();
        this.music?.start(); // safe even if ?start=corriveau drops in before a gesture
        this.music?.playCorriveauTrack();
      }
      if (this.corriveau.consumeJustReached()) playChainRattle();
      if (this.corriveau.consumeJustDelivered()) {
        this.showBanner('The lights of Québec City — La Corriveau sinks back into the mist');
        this.music?.endBossTrack();
      }
    }

    // Le Wendigo — the famine-spirit on the far shore of Lac Saint-Pierre,
    // on the lonely reach up to Sorel-Tracy. Guarded on its own segment
    // (same reasoning as the loup-garou / blockade). Down (brake) is a legal
    // way to go still; it's Up/Left/Right — actively working the canoe —
    // that it hears.
    if (this.segment === WENDIGO_SEGMENT) {
      const s = this.input.state;
      const stirring = !!(s.up || s.left || s.right);
      this.wendigo.update(dt, this.flowDistance, stirring, (entry) => this.handleHit(entry));
      // No "hold still" prompts — the tell is the telegraph (it rears, the
      // eyes flare, the drawn breath) and the first listen never strikes.
      if (this.wendigo.consumeJustSpotted()) {
        // The big title card (#boss-banner), not the small milestone one —
        // same treatment the British Blockade gets.
        this.showBossBanner('WENDIGO');
        playWendigoBreath();
        this.music?.start(); // safe even if ?start=wendigo drops in before a gesture
        this.music?.playWendigoTrack();
      }
      if (this.wendigo.consumeJustListening()) playWendigoBreath();
      if (this.wendigo.consumeJustLunged()) playWendigoShriek();
      if (this.wendigo.consumeJustDelivered()) {
        this.showBanner('The cold lifts — the Wendigo turns back into the bush');
        this.music?.endBossTrack();
      }
    }

    // Only meaningful on the Rideau — SHIP_FLOW_DISTANCE/TRIGGER_DISTANCE
    // are numbers on that segment's own line (see bossfights/blockade.js
    // and bossfights/britishWarship.js), and could coincidentally fall in
    // range of an unrelated flowDistance on another segment otherwise.
    if (this.segment === 'rideau') {
      // The British Blockade — the frigate approach. Pistol shots feed in
      // the same way Diable's do (updateDiable above) — the hull can be
      // shot at now that the player is guaranteed to already have the
      // pistol by this point in the run (see blockade.js's own module
      // comment). hitBullets are removed from the pool below, same
      // contract as diable.update()'s res.hitBullets.
      const blockade = this.blockade.update(
        dt, this.flowDistance, this.canoeWorldX, effectiveSpeed,
        (entry) => this.handleHit(entry), this.weapons.getBullets(),
      );
      for (const ref of blockade.hitBullets) this.weapons.removeBullet(ref);
      this.blockadeCrossCurrent = blockade.crossCurrent || 0;
      // One boom per impact, hit or miss — a volley landing several shots
      // at once fires this the same number of times in the same frame.
      for (let i = 0; i < blockade.boomCount; i++) playCannonBoom();
      if (this.blockade.consumeJustSpotted()) {
        // The big title card (#boss-banner), not the small milestone one —
        // this fight earns more fanfare. Still deliberately doesn't say
        // which side is clear; finding the gap is the point, not something
        // to hand the player in a banner.
        this.showBossBanner('BRITISH BLOCKADE');
        this.music?.start(); // Ensure music system is initialized
        this.music?.playBossTrack();
        this._bossTrackCued = true;
      }
      if (this.blockade.consumeJustGunsSilenced()) {
        this.showBanner('GUNS SILENCED — find the gap!');
      }
      if (this.blockade.consumeJustCleared()) {
        // Past the frigate — back to the regular shuffle. The British
        // Warship, now a separate encounter much further downstream (see
        // bossfights/britishWarship.js), gets its own cue when it actually
        // starts, not this one carrying through the ordinary paddling
        // between the two fights.
        this.music?.endBossTrack();
      }
      // Catch-all: the instant the approach is no longer active at all —
      // cleared, or abandoned back out of range — make sure the boss
      // track isn't still going. endBossTrack() is a no-op if the shuffle's
      // already back, so the _bossTrackCued flag keeps this to one real call.
      if (this._bossTrackCued && !blockade.active) {
        this.music?.endBossTrack();
        this._bossTrackCued = false;
      }

      // The British Warship — a standalone encounter much further
      // downstream (bossfights/britishWarship.js), no longer chained to
      // the blockade above. this._chaseHoldZ (0 outside its own hold) is
      // the fore/aft offset from CHASE_HOLD_Z_* above. Subtracted, not
      // added: britishWarship.js pins the gunboat CHASE_ANCHOR_LEAD..
      // +RADIUS_Z units *ahead* of whatever playerFlowDistance it's given,
      // so shrinking that argument is what actually closes the gap to the
      // ship — passing this.flowDistance unchanged (screen stays static;
      // this._chaseHoldZ never touches the real world) would leave the gap
      // untouched, since the ship's own position is defined purely
      // relative to this same argument. The real weapons.js pistol bullets
      // never see this shift (they live in real flowDistance, spawned
      // before the hold started), which is exactly what makes it land
      // right: draw() gets the same shifted reference (see that call
      // site's own comment), so the ship/hazards render at whatever this
      // virtual distance implies relative to the *real* canoe position —
      // the same relationship a live bullet is actually flying through.
      const warship = this.britishWarship.update(
        dt, this.flowDistance - this._chaseHoldZ, this.canoeWorldX, effectiveSpeed,
        (entry) => this.handleHit(entry), this.weapons.getBullets(),
        this.damageGivenScale,
      );
      for (const ref of warship.hitBullets) this.weapons.removeBullet(ref);
      // Only up once the fight is actually live — a real hull-HP readout
      // (see that field's own comment in britishWarship.js), full when it
      // starts, draining toward 0 as it sinks.
      this.warshipPct = warship.active ? warship.progressPct : null;
      for (let i = 0; i < warship.boomCount; i++) playCannonBoom();
      // The two thunderclaps — the first guaranteed at least 3s ahead of
      // the fight's own trigger regardless of speed
      // (FIRST_THUNDERCLAP_DISTANCE), the second closer, after which
      // nothing else sounds until the fight itself kicks in. No banner:
      // this is heard, not announced.
      for (let i = 0; i < warship.thunderCount; i++) playThunderclap();
      // The heavier build-up layered under those two claps — see
      // britishWarship.js's "second, heavier layer" block. Distant rumbles
      // ride the sheet-lightning flickers while the storm is still coming
      // in (never in the brooding stretch, by construction there); the
      // wind/rain bed and the ambient music's duck both follow the storm's
      // own ramp every frame (each no-ops on an unchanged level), so by the
      // second clap the shuffle is gone and only the weather is left under
      // the dark — then playPursuitTrack() below lands at full, with the
      // duck already released by musicDuck()'s own chasePhase check.
      for (let i = 0; i < warship.rumbleCount; i++) playDistantRumble();
      setStormBed(this.britishWarship.stormBedLevel(this.flowDistance));
      this.music?.setDuck(this.britishWarship.musicDuck(this.flowDistance));
      if (this.britishWarship.consumeJustStormArrived()) {
        // The one announced beat of the approach — the claps and the
        // brooding stay heard-not-announced (see thunderCount above). This
        // is the "game clearly leading into" the fight: name the threat
        // while the sky is only just starting to turn.
        this.showBanner('The sky goes black — the Royal Navy hunts these waters');
      }
      if (this.britishWarship.consumeJustStartedChase()) {
        // The big title card, same treatment as BRITISH BLOCKADE above —
        // this fight is triggered instantly on crossing TRIGGER_DISTANCE,
        // so the banner and the held arena both start on the same frame.
        this.showBossBanner('BRITISH WARSHIP');
        this.music?.start(); // safe even if ?start=british-warship drops in before a gesture
        this.music?.playPursuitTrack();
        this._warshipTrackCued = true;
        console.log('[GAME] Warship hold started. Canoe visible:', this.canoeVisible, 'Position:', this.flowDistance);
      }
      if (this.britishWarship.consumeJustSunk()) {
        console.log('[GAME] Warship sunk, ending boss track');
        playCannonBoom(); // an extra boom on top of the hit sparks — the kill shot should land harder than a regular one
        this.music?.endBossTrack();
        const nextVillage = VILLAGES.find(v => v.segment === this.segment && v.flowDistance > this.flowDistance);
        const villageName = nextVillage ? nextVillage.name : 'Safe Waters';
        this.showBanner(`SHE'S GOING DOWN! — ${villageName} Ahead`);
      }
      if (this.britishWarship.consumeJustEscaped()) {
        console.log('[GAME] Warship escaped, ending boss track');
        this.music?.endBossTrack();
        const nextVillage = VILLAGES.find(v => v.segment === this.segment && v.flowDistance > this.flowDistance);
        const villageName = nextVillage ? nextVillage.name : 'Safe Waters';
        this.showBanner(`${villageName} Ahead — Safe Waters`);
      }
      if (this._warshipTrackCued && !warship.active) {
        this.music?.endBossTrack();
        this._warshipTrackCued = false;
      }
    } else {
      this.blockadeCrossCurrent = 0;
      this.warshipPct = null;
      // Off the Rideau the storm can't be in play — both no-op unless the
      // segment just changed out from under a live storm (a mid-approach
      // restart to an earlier put-in, say).
      setStormBed(0);
      this.music?.setDuck(1);
    }

    this.render();
    this.updateHud();
  }

  render() {
    const ctx = this.ctx;
    // The camera never tracks the player's steering, and only smoothly (not
    // exactly) tracks the river's own bend — see CAMERA_SMOOTH's comment.
    // Everything in the world (banks, water, obstacles, whales) renders
    // relative to this alone, so the world holds still under both steering
    // and the channel's continuous curving. The canoe is the thing that
    // visibly moves: its screen offset is (canoeWorldX - cameraWorldX),
    // which is lateralOffset plus however far the camera is currently
    // lagging behind the true curve. Every object's position *relative to
    // the canoe* is unchanged by any of this — it's purely a change of
    // render origin, not of any actual world position or collision math.
    const cameraWorldX = this.cameraWorldX;
    const isFlying = this.chasseGalerie.isActive();
    // 0..1 — how far the canoe is off the water, and how fully the hellstorm
    // look has crept in. Both ramp gradually over the climb up the Ottawa
    // (see chasseGalerie.js), so the shift into the Chasse-galerie is a slow
    // darkening rather than a snap.
    const lift = this.chasseGalerie.liftFraction();
    // The Diable fight sits at full storm regardless of where along the fade
    // curve its flowDistance happens to land — his darkness, held.
    const storm = this.diable.isActive() ? 1 : this.chasseGalerie.stormIntensityAt(this.flowDistance);
    // Cold-blue nightfall for the Loup-garou's stretch of the lower fjord —
    // its own thing, gentler than the Devil's hellstorm (this is early). Only
    // ever non-zero on its own segment; a pure function of position.
    const night = this.segment === LOUP_GAROU_SEGMENT
      ? this.loupGarou.nightIntensity(this.flowDistance) : 0;
    // La Corriveau's mist below Québec City — a dim, grey-green night with
    // fog lying on the water, not the Loup-garou's clear moonlit black. Its
    // own stretch, never overlapping the night above or the frost below.
    const mist = this.segment === CORRIVEAU_SEGMENT
      ? this.corriveau.mistIntensity(this.flowDistance) : 0;
    // Bloodless cold for the Wendigo's reach of Lac Saint-Pierre — the far
    // end of the palette from the hellstorm. Only ever non-zero on its own
    // segment; a pure function of position, plus an extra glare while it
    // listens.
    const frost = this.segment === WENDIGO_SEGMENT
      ? this.wendigo.frostIntensity(this.flowDistance) : 0;
    // The weather closing in ahead of the British Warship, and staying
    // through the fight itself — only ever non-zero on the Rideau. Held at
    // full darkness for the whole held arena (britishWarship.js's
    // stormIntensity(), not just its own stormIntensityAt), clearing again
    // the instant the fight resolves.
    const warshipStorm = this.segment === 'rideau'
      ? this.britishWarship.stormIntensity(this.flowDistance) : 0;
    // A quick flicker right at each of the two thunderclaps (draw() below).
    const warshipFlash = warshipStorm > 0
      ? this.britishWarship.stormFlash(this.flowDistance) : 0;
    // The heavier layer under the same storm (britishWarship.js's "second,
    // heavier layer" block): gloom is the extra darkening across the
    // brooding stretch, held lower through the fight; flicker is the
    // irregular sheet lightning between the claps.
    const warshipGloom = warshipStorm > 0
      ? this.britishWarship.stormGloom(this.flowDistance) : 0;
    const warshipFlicker = warshipStorm > 0
      ? this.britishWarship.stormFlicker(this.flowDistance) : 0;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Night sky for the Loup-garou stretch — a deep cold blue-black with a
    // scatter of faint stars. No moon: the beast is a ghost and casts its
    // own pale light (see loupGarou.draw).
    if (night > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      g.addColorStop(0, '#04060e');
      g.addColorStop(0.55, '#080e1a');
      g.addColorStop(1, '#101a2c');
      ctx.save();
      ctx.globalAlpha = 0.84 * night;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (let i = 0; i < 46; i++) {
        const sx = (i * 79.7 + 13) % CANVAS_WIDTH;
        const sy = (i * 43.3 + 7) % (CANVAS_HEIGHT * 0.72);
        const tw = 0.4 + 0.6 * ((Math.sin(this.time * 0.7 + i * 2.3) + 1) / 2);
        ctx.globalAlpha = night * (i % 7 ? 0.4 : 0.75) * tw;
        ctx.fillStyle = i % 7 ? '#9fb2ce' : '#dfe8f5';
        ctx.fillRect(sx, sy, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
      }
      ctx.restore();
    }

    // Hellstorm sky, faded in by `storm` — all but pure black overhead with
    // the faintest dead-violet cast, sinking to a low, smothered smear of
    // dried-blood red right at the horizon, like something is burning a long
    // way off and the smoke has swallowed most of it. The Devil isn't here
    // yet, but this is his weather.
    if (storm > 0) {
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#020105');
      gradient.addColorStop(0.44, '#08040a');
      gradient.addColorStop(0.74, '#170509');
      gradient.addColorStop(0.9, '#28080a');
      gradient.addColorStop(1, '#431009');
      ctx.save();
      ctx.globalAlpha = storm;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Storm sky for the British Warship's approach — a rolling slate-grey
    // squall, not the Devil's dead-violet/blood-red (storm above) or the
    // Loup-garou's cold night-blue (night above): this one should read as
    // real weather closing in over open water, not a supernatural wrongness.
    // Faded in by warshipStorm well before anything else in the approach
    // changes — asked for explicitly after the first pass got the order
    // backwards (see britishWarship.js's own module comment): the weather
    // has to be the first thing that visibly shifts, not the ship.
    if (warshipStorm > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      g.addColorStop(0, '#0c1013');
      g.addColorStop(0.5, '#1a2126');
      g.addColorStop(1, '#2c363c');
      ctx.save();
      ctx.globalAlpha = 0.82 * warshipStorm;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // While flying the Chasse-galerie there are no docks or town buildings
    // below — the riverbank parishes read as steeples only (drawn later).
    drawBanks(ctx, this.flowDistance, cameraWorldX, { hideVillages: isFlying, time: this.time, canoeWorldX: this.canoeWorldX });
    if (this.water) {
      // warshipStorm reaches the water itself (chop, dead glints, slate
      // colour — waterGL.js's u_storm); 0 everywhere but the Rideau. frost
      // likewise (u_frost — the water sinking to ink under the Wendigo's
      // cold, since the 2D frost pass below can't reach this layer); 0
      // everywhere but the lower fjord.
      this.water.render(this.time, this.flowDistance, cameraWorldX, warshipStorm, frost);
    } else {
      drawWaterFallback(ctx, this.flowDistance, cameraWorldX);
    }

    // Drown the ground in gloom as the storm creeps in — a heavy black wash
    // with a low, dull red heat bleeding through it, so the land and river
    // below read as scorched country glimpsed through smoke. Enough black
    // that the banks are shapes in the dark, not scenery.
    if (storm > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8 * storm;
      ctx.fillStyle = '#050203';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 0.13 * storm;
      ctx.fillStyle = '#420d06';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Loup-garou night — drown the scene to near-black so the whole frame is
    // the moon and a silhouette (see the reference art). The moon (drawn
    // below, behind the beast) is what lifts it back out.
    if (night > 0) {
      ctx.save();
      ctx.globalAlpha = 0.86 * night;
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 0.28 * night; // a cold blue cast over it
      ctx.fillStyle = '#0a1836';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Airborne in the Chasse-galerie, the river below is just backdrop —
    // don't draw the rocks, logs, pelts, whitewater or whales the canoe is
    // flying over. (They still can't touch it either — see obstacles.update
    // below.) Only the steeples on the banks matter up there.
    //
    // The Warship's held arena hides the obstacle pool the same way (see
    // its own comment at that update() call) — but only the pool: the
    // whitewater and the water itself stay, so it's still plainly the
    // river, just without rocks and logs sliding past a canoe that the
    // fight is holding in place.
    const warshipHeldDraw = this.segment === 'rideau' && this.britishWarship.isChaseHolding();
    if (!isFlying) {
      drawCurrentEffects(ctx, this.time, this.flowDistance, this.rapids);
      // Belugas are a Tadoussac-estuary sight — the wide Rideau Lake reaches
      // and Kingston harbour are inland fresh water, so no whales there even
      // where the channel opens past the beluga width threshold.
      if (this.segment !== 'rideau') {
        drawWhales(ctx, this.time, this.flowDistance, cameraWorldX, worldToScreen);
      }
      if (!warshipHeldDraw) this.obstacles.draw(ctx, this.time, cameraWorldX, worldToScreen);
    }

    // La Corriveau's mist: the land and sky sink into a dim grey-green night,
    // then fog banks drift across the water over the rocks and logs, so the
    // lake reads as murky and close — and her ghost-light (drawn later, on
    // top of all of it) is the brightest thing on screen.
    if (mist > 0) {
      ctx.save();
      ctx.globalAlpha = 0.62 * mist;
      ctx.fillStyle = '#060c0a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 0.2 * mist;
      ctx.fillStyle = '#2c4a3c';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Fog banks: big soft ellipses drifting slowly down the lake and
      // across it, each a radial gradient so there's no edge to read. (A
      // first cut stacked translucent rectangles, which came out as hard
      // horizontal stripes — scanlines, not mist.)
      for (let i = 0; i < 5; i++) {
        const span = CANVAS_HEIGHT + 120;
        const y = ((i * 67 + this.time * 4) % span) - 60;
        const x = CANVAS_WIDTH / 2 + Math.sin(this.time * 0.09 + i * 2.4) * 130;
        const rx = 120 + (i % 3) * 40;
        const fog = ctx.createRadialGradient(x, y, 0, x, y, rx);
        fog.addColorStop(0, 'rgba(176, 200, 188, 0.3)');
        fog.addColorStop(0.6, 'rgba(176, 200, 188, 0.12)');
        fog.addColorStop(1, 'rgba(176, 200, 188, 0)');
        ctx.globalAlpha = mist;
        ctx.fillStyle = fog;
        ctx.save(); // flatten into a bank about its own centre
        ctx.translate(x, y);
        ctx.scale(1, 0.35);
        ctx.translate(-x, -y);
        ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
        ctx.restore();
      }
      ctx.restore();
    }

    // Loup-garou night: a final wash over the obstacles/whales too, so
    // nothing on the water stays lit — the frame is the dark and the ghost.
    if (night > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55 * night;
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // British Warship storm: a final dark wash over the obstacles/water too
    // (same idea as the Loup-garou night's own final wash above), so the
    // whole scene reads as gone dark, not just the sky overhead — then a
    // quick, bright, cold flash right at each thunderclap (warshipFlash),
    // over the top of the dark, the way real lightning briefly cuts through
    // an overcast sky rather than lifting it.
    if (warshipStorm > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 * warshipStorm;
      ctx.fillStyle = '#0c1013';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
    // Gloom: the last stretch before the ship keeps getting darker on top
    // of the storm's own plateau — a near-black wash plus a vignette
    // closing in from the edges, so the frame narrows down to the canoe
    // and the water right around it. Asked for as "visuals getting darker
    // in the seconds leading up to the fight" once the plain storm above
    // existed: that one had hit its ceiling by the second clap and just
    // sat there for the brooding stretch. The vignette's a radial gradient
    // (transparent centre, black rim) rebuilt each frame — cheap at 320x220.
    if (warshipGloom > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 * warshipGloom;
      ctx.fillStyle = '#04060a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const vg = ctx.createRadialGradient(
        CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_HEIGHT * 0.22,
        CANOE_SCREEN_X, CANOE_SCREEN_Y, CANVAS_HEIGHT * 0.95,
      );
      vg.addColorStop(0, 'rgba(2, 3, 6, 0)');
      vg.addColorStop(1, 'rgba(2, 3, 6, 1)');
      ctx.globalAlpha = 0.75 * warshipGloom;
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
    // Rain over everything below the HUD, thickening with the storm —
    // world/weather.js. Drawn after the washes so the streaks stay
    // visible on top of the dark rather than being buried under it.
    drawRain(ctx, warshipStorm, this.time);
    // Lightning: the two scripted claps' own bright flashes (warshipFlash)
    // and the irregular, quieter sheet-lightning between them
    // (warshipFlicker) — the max of the two, one fill, so a clap landing
    // mid-flicker doesn't double up into a white-out.
    const lightning = Math.max(warshipFlash * 0.55, warshipFlicker * 0.32);
    if (lightning > 0) {
      ctx.save();
      ctx.globalAlpha = lightning;
      ctx.fillStyle = '#dce8ee';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Same segment guards as the update() calls above. The blockade (the
    // frigate approach) never sees the chase-hold shift — it's a separate,
    // temporally non-overlapping fight now, and _chaseHoldZ is always 0
    // outside the Warship's own hold anyway. The Warship's own draw() does
    // get flowDistance - _chaseHoldZ, matching the shifted argument
    // update() already passes britishWarship.update() — without it here
    // too, the ship (and its hazards) would render against the OLD fixed
    // reference while the canoe sprite (see canoeScreenY above) now
    // visibly moves, decoupling the two: the ship would appear to
    // jump/drift independently of the gap actually closing rather than the
    // canoe visibly approaching it.
    if (this.segment === 'rideau') {
      this.blockade.draw(ctx, this.flowDistance, cameraWorldX, this.time);
      this.britishWarship.draw(ctx, this.flowDistance - this._chaseHoldZ, cameraWorldX);
    }
    if (this.segment === LOUP_GAROU_SEGMENT) {
      // The moon for the Loup-garou night — hung high and mostly off the top
      // of the frame (the far distance up-river reads as the horizon/sky), so
      // it's a light in the sky, not a disc sitting on the river. Its glow
      // washes down over the dark water; the beast's ears and wings cut into
      // its lower edge.
      if (night > 0) {
        const mx = CANVAS_WIDTH * 0.5;
        const my = 2;
        ctx.save();
        ctx.globalAlpha = night;
        const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 150);
        glow.addColorStop(0, 'rgba(198, 214, 238, 0.5)');
        glow.addColorStop(0.35, 'rgba(120, 150, 194, 0.22)');
        glow.addColorStop(1, 'rgba(120, 150, 194, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#e4e9f2';
        ctx.beginPath();
        ctx.arc(mx, my, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(148, 166, 196, 0.3)'; // craters on the visible lower arc
        for (const [dx, dy, r] of [[-20, 34, 10], [18, 42, 12], [-6, 52, 7], [30, 26, 6], [-34, 40, 5]]) {
          ctx.beginPath();
          ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(6, 8, 14, 0.9)'; // a couple of bats
        for (let i = 0; i < 3; i++) {
          const bx = mx - 84 + ((this.time * 14 + i * 110) % 220);
          const by = 30 + Math.sin(this.time * 1.4 + i * 2) * 12 + i * 8;
          const bs = 3 + (i % 2);
          ctx.beginPath();
          ctx.moveTo(bx - bs * 2, by);
          ctx.quadraticCurveTo(bx - bs, by - bs, bx, by);
          ctx.quadraticCurveTo(bx + bs, by - bs, bx + bs * 2, by);
          ctx.quadraticCurveTo(bx + bs, by + bs * 0.6, bx, by + bs * 0.3);
          ctx.quadraticCurveTo(bx - bs, by + bs * 0.6, bx - bs * 2, by);
          ctx.fill();
        }
        ctx.restore();
      }
      this.loupGarou.draw(ctx, this.flowDistance, cameraWorldX, this.time);
    }
    if (this.segment === CORRIVEAU_SEGMENT) this.corriveau.draw(ctx, this.flowDistance, cameraWorldX);
    // Draw the Chasse-galerie churches cutting into the gorge
    if (this.segment === 'lawrenceWest') this.chasseGalerie.drawStorm(ctx, this.flowDistance, cameraWorldX);

    // The Wendigo's cold over Lac Saint-Pierre. Asked for as "actually
    // darker on the color palette, not just dimmer" — the first cut was
    // the opposite, a pale bleaching wash (#e3eff5 at low alpha) plus an
    // icy rim, which read as haze, and an alpha wash to black would only
    // have flattened everything toward one grey. So this is a MULTIPLY
    // blend with a cold slate-blue (FROST_TINT): every colour is scaled by
    // it, so white becomes dark steel, the greens go deep blue-green, the
    // blacks stay black — the palette itself shifts dark and cold while
    // the contrast between things survives. Faded in by lerping the tint
    // from white (multiply by white is a no-op) as frost rises.
    //
    // Masked to the 2D layer's own opaque pixels, via an offscreen copy:
    // the river is a transparent hole in this canvas showing the WebGL
    // water underneath, and a multiply over a transparent backdrop just
    // paints the tint colour there opaque (per the compositing spec —
    // source shows through where the backdrop has no alpha), which would
    // hide the water entirely. The water darkens on its own layer instead
    // (waterGL.js's u_frost). The mask costs three full-canvas draws at
    // 320x220 — nothing. (drawWaterFallback's 2D water, when there's no
    // WebGL, is opaque here and simply gets multiplied like the land.)
    //
    // Then the Wendigo itself, drawn *after* the darkening so it stays its
    // own bloodless white against the dark shore, and the listen glare —
    // the icy rim that bites in while it listens, the telegraph — kept,
    // now the one bright thing in the frame, so "something is different
    // NOW" reads even harder against a dark world than it did against a
    // pale one.
    if (frost > 0) {
      const glare = this.wendigo.listenGlare();
      const layer = this._frostLayer ||= (typeof document !== 'undefined' ? document.createElement('canvas') : null);
      if (layer && ctx.canvas) {
        layer.width = CANVAS_WIDTH;
        layer.height = CANVAS_HEIGHT;
        const off = layer.getContext('2d');
        off.imageSmoothingEnabled = false;
        off.globalCompositeOperation = 'source-over';
        off.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        off.drawImage(ctx.canvas, 0, 0);
        off.globalCompositeOperation = 'multiply';
        const t = frost;
        const r = Math.round(255 + (FROST_TINT[0] - 255) * t);
        const g = Math.round(255 + (FROST_TINT[1] - 255) * t);
        const b = Math.round(255 + (FROST_TINT[2] - 255) * t);
        off.fillStyle = `rgb(${r}, ${g}, ${b})`;
        off.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Keep only where the frame was opaque — the hole stays a hole.
        off.globalCompositeOperation = 'destination-in';
        off.drawImage(ctx.canvas, 0, 0);
        off.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
      this.wendigo.draw(ctx);
      if (glare > 0) {
        ctx.save();
        const v = ctx.createRadialGradient(
          CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.56, 40,
          CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.56, CANVAS_WIDTH * 0.74);
        v.addColorStop(0, 'rgba(214, 236, 245, 0)');
        v.addColorStop(0.6, `rgba(202, 230, 242, ${(0.2 * glare * frost).toFixed(3)})`);
        v.addColorStop(1, `rgba(228, 241, 248, ${(0.6 * glare * frost).toFixed(3)})`);
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
    }

    if (this.canoeVisible !== false) {
      const sprite = this.paddleSide > 0 ? this.canoeSprites.right : this.canoeSprites.left;
      const canoeScreenX = CANOE_SCREEN_X + (this.canoeWorldX - cameraWorldX) * PIXELS_PER_UNIT;

      // Flying effects (Chasse-galerie) — everything scales with `lift`, so
      // the canoe rises, tilts and lights its trail gradually on take-off.
      const altitude = this.chasseGalerie.getAltitude();

      // Bobbing grows in as the canoe leaves the water
      const bob = Math.sin(this.time * 2) * 3 * lift;
      // British Warship chase: reported as "I still can't move up or down" —
      // the previous fix (britishWarship.js's isChaseHolding()) moved the
      // *ship* in response to Up/Down, which is real (verified separately) but
      // never reads as "my own movement," the same way left/right already
      // does by moving the canoe itself. This term does that instead — same
      // sign convention as altitude above (subtracting moves the canoe up-
      // screen, toward the ship, on closing) — and _chaseHoldZ is 0 outside
      // the hold, so it's a no-op everywhere else.
      const canoeScreenY = CANOE_SCREEN_Y - altitude * PIXELS_PER_UNIT + bob - this._chaseHoldZ * PIXELS_PER_UNIT;

      if (lift > 0.05) {
        // Shadow on the water below, deepening as the canoe climbs
        ctx.save();
        ctx.globalAlpha = 0.3 * lift;
        ctx.fillStyle = '#000';
        ctx.translate(canoeScreenX, CANOE_SCREEN_Y);
        ctx.rotate(this.heading || 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, sprite.width / 2, sprite.height / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Hellfire trail — the flame the canoe is riding on
        for (let i = 0; i < 6; i++) {
          const trailX = canoeScreenX + (Math.random() - 0.5) * sprite.width;
          const trailY = canoeScreenY + sprite.height / 2 + i * 8;
          const sparkleSize = 1 + Math.random() * 2.5;
          const sparkleAlpha = (0.5 - i * 0.08) * lift;

          ctx.save();
          ctx.globalAlpha = sparkleAlpha * (0.5 + Math.sin(this.time * 8 + i) * 0.5);
          ctx.fillStyle = i % 3 === 0 ? '#ffca5a' : '#ff5a1e';
          ctx.fillRect(trailX - sparkleSize / 2, trailY - sparkleSize / 2, sparkleSize, sparkleSize);
          ctx.restore();
        }

        // Wind streaks, dragged dark-red across the storm
        for (let i = 0; i < 8; i++) {
          const lineY = Math.random() * CANVAS_HEIGHT;
          const lineLength = 20 + Math.random() * 30;
          const lineX = CANVAS_WIDTH - (this.time * 200 + i * 40) % CANVAS_WIDTH;

          ctx.save();
          ctx.globalAlpha = 0.18 * lift;
          ctx.strokeStyle = '#7a1c12';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineX, lineY);
          ctx.lineTo(lineX - lineLength, lineY);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Grows a little as it climbs toward the camera, but never looms
      const scale = 1 + 0.5 * lift;

      if (this.capsize.isActive()) {
        // Going over: capsize.js owns the canoe draw entirely — the roll,
        // the overturned hull, the foam and the spilled kit. It takes the
        // same `scale` so a capsize in the air (a steeple clip on the
        // Chasse-galerie, the Devil's fire) rolls at the size the flight was
        // already drawing the canoe at, with the hellfire trail above still
        // running underneath it. The heading goes in too, so the hull starts
        // over from the attitude it was actually holding.
        this.capsize.draw(ctx, canoeScreenX, canoeScreenY, this.canoeSprites, scale);
      } else {
        // Draw canoe with flying effects
        ctx.save();
        ctx.translate(canoeScreenX, canoeScreenY);

        // The drawn angle is the real heading — the same one the collision
        // hull is built on, so what you see is what the river is testing
        // against. In flight it's amplified into a proper bank, and the nose
        // lifts. Clamped because HEADING_MAX * the full-lift multiplier would
        // lay the canoe nearly broadside; MAX_DRAWN_BANK keeps it a bank, not
        // a barrel roll, without touching the physical heading underneath.
        const bankingMultiplier = 1 + 1.5 * lift;
        const noseUpAngle = 0.15 * lift;
        ctx.rotate(clamp((this.heading || 0) * bankingMultiplier, -MAX_DRAWN_BANK, MAX_DRAWN_BANK) + noseUpAngle);
        ctx.scale(scale, scale);

        ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        ctx.restore();
      }
    }

    // Draw bullets
    // Same reasoning as blockade.draw() above — bullets are spawned at the
    // real, frozen this.flowDistance and travel in real flowDistance space
    // regardless of _chaseHoldZ, so rendering them against the same shifted
    // reference keeps them visually leaving from the canoe's own (now
    // possibly offset) screen position and landing on the ship's, instead
    // of drifting off both.
    this.weapons.draw(ctx, this.flowDistance - this._chaseHoldZ, cameraWorldX, worldToScreen);

    // Storm mood, over everything — all of it faded in by `storm`.
    if (storm > 0) {
      // A few dim cinders drifting up out of the dark — sparse and
      // blood-coloured, the last of a fire rather than a warm shower of sparks.
      ctx.save();
      for (let i = 0; i < 13; i++) {
        const seed = i * 47.3;
        const rise = 14 + (i % 5) * 6;
        const y = CANVAS_HEIGHT + 16 - ((this.time * rise + seed * 6.1) % (CANVAS_HEIGHT + 40));
        const x = (seed * 13.7 + Math.sin(this.time * 0.6 + seed) * 22) % CANVAS_WIDTH;
        const flick = 0.35 + Math.sin(this.time * 8 + seed) * 0.45;
        if (flick <= 0.08) continue;
        const s = 1 + (i % 3);
        ctx.globalAlpha = Math.min(1, flick) * 0.42 * storm;
        ctx.fillStyle = i % 4 === 0 ? '#a8481a' : '#7a1e0e';
        ctx.fillRect(x, y, s, s);
      }
      ctx.restore();

      // A heavy black vignette, breathing slightly, crushed in tight so only
      // the middle of the channel is ever really lit and the churches lunge
      // out of the dark with almost no warning.
      const pulse = (0.78 + Math.sin(this.time * 1.15) * 0.09) * storm;
      const vg = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.24,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.92,
      );
      vg.addColorStop(0, 'rgba(1,0,1,0)');
      vg.addColorStop(0.5, `rgba(4,0,2,${(pulse * 0.62).toFixed(3)})`);
      vg.addColorStop(1, `rgba(0,0,0,${pulse.toFixed(3)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Lightning — no relief. A dim, dead-coloured flicker, the wrong
      // colour for lightning, that barely lifts the gloom before it's gone.
      const lf = lightningFlash(this.time);
      if (lf > 0) {
        ctx.save();
        ctx.globalAlpha = lf * 0.28 * storm;
        ctx.fillStyle = '#6f6076';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
    }

    // Le Diable, over the storm mood so his hellfire rim and eyes stay crisp
    // against the black. His fireballs are drawn here too (inside diable.js).
    if (this.segment === 'lawrenceWest') this.diable.draw(ctx, this.time);
  }

  updateHud() {
    this.ui.hudScore.textContent = `FURS: ${this.furs}`;

    const healthPct = clamp((this.health / MAX_HEALTH) * 100, 0, 100);
    this.ui.hudHealthFill.style.width = `${healthPct}%`;
    this.ui.hudHealthFill.classList.toggle('warn', healthPct <= 60 && healthPct > 30);
    this.ui.hudHealthFill.classList.toggle('critical', healthPct <= 30);

    // Effective (current-boosted) speed, not just the paddle stat, so the
    // bar shows "the current is flying you along" during rapids. Measured
    // from a dead stop (0), not from MIN_SPEED — so just drifting still
    // shows a little fill, and braking visibly drains it to empty instead
    // of it already sitting at zero the moment you stop paddling hard.
    const speedPct = clamp((this.effectiveSpeed / MAX_SPEED) * 100, 0, 100);
    // While actively braking, hold the bar at a short red nub so pushing
    // back always reads as a real action — even pinned against the put-in
    // where there's no forward motion left to visibly lose.
    const braking = this.input.state.down && this.mode === 'river';
    this.ui.hudSpeedFill.style.width = `${braking ? Math.max(6, speedPct) : speedPct}%`;
    // The pale "rapids" glow means the current is carrying you — wrong
    // upriver, where whitewater is the current fighting you (see
    // RAPIDS_UPRIVER_PUSH). There the bar goes amber instead: a struggle,
    // not a boost.
    const inRapids = this.rapids > 0.15 && !braking;
    const upriver = this.segment === 'lawrenceWest';
    this.ui.hudSpeedFill.classList.toggle('rapids', inRapids && !upriver);
    this.ui.hudSpeedFill.classList.toggle('against', inRapids && upriver);
    this.ui.hudSpeedFill.classList.toggle('braking', braking);

    // flowDistance is the persistent world position that never resets on
    // restart, so the map marker holds its real place on the river across a
    // capsize+retry instead of jumping back to the put-in; segment is
    // needed alongside it since flowDistance alone doesn't say which of the
    // three branches that number belongs to (see minimap.js's update()).
    this.ui.minimap.update(this.segment, this.flowDistance);

    // Le Diable's health bar — only up while the fight runs.
    if (this.diablePct != null) {
      this.ui.hudDiable?.classList.remove('hidden');
      if (this.ui.hudDiableFill) this.ui.hudDiableFill.style.width = `${clamp(this.diablePct, 0, 100)}%`;
    } else {
      this.ui.hudDiable?.classList.add('hidden');
    }

    // The British Warship's own health bar — the British Blockade (the
    // frigate approach, a separate encounter now) shows no bar at all;
    // this only ever appears once the Warship fight actually starts.
    // progressPct is the ship's own hull HP (britishWarship.js's own
    // comment on that field) — full when it starts, draining as it's
    // damaged, empty exactly as it sinks.
    if (this.warshipPct != null) {
      this.ui.hudBlockade?.classList.remove('hidden');
      if (this.ui.hudBlockadeFill) this.ui.hudBlockadeFill.style.width = `${clamp(this.warshipPct, 0, 100)}%`;
      if (this.ui.hudBlockadeLabel) this.ui.hudBlockadeLabel.textContent = 'BRITISH WARSHIP';
    } else {
      this.ui.hudBlockade?.classList.add('hidden');
    }
  }
}
