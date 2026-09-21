// Background music. Browsers block audio autoplay until a real user
// gesture, so this doesn't try to play on load — main.js starts it on the
// player's first keypress/click instead, which the game already treats as
// "the run has begun" anyway (see the immediate-launch design in game.js).
//
// Plays as a shuffled playlist that loops forever, one track after another
// (not one track on repeat). To add a song: run its source through
// scripts/normalize-audio.mjs (matches every track to one loudness so the
// shuffle doesn't jump between them), then add an entry here with its
// title and artist — those are shown in the "now playing" card (main.js),
// so they're player-facing text, not just filenames.
//
// These are early-20th-century Québécois and Acadian fiddle recordings,
// mostly 78rpm transfers from the Internet Archive and Library and
// Archives Canada; titles keep their original French.
//
// Exported for test/smoke.mjs — checking KINGSTON_PLAYLIST below never ends
// up mixed in here needs the real list, not a hardcoded guess at its
// contents.
export const PLAYLIST = [
  { src: '/audio/grande-gigue-simple.mp3', title: 'Grande Gigue Simple', artist: 'Isidore Soucy' },
  { src: '/audio/reel-du-pendu.mp3', title: 'Reel du Pendu', artist: 'Isidore Soucy' },
  { src: '/audio/reel-des-laurentides.mp3', title: 'Reel des Laurentides', artist: 'Tommy Duchesne' },
  { src: '/audio/reel-des-montagnes.mp3', title: 'Reel des Montagnes', artist: 'Tommy Duchesne' },
  { src: '/audio/valse-des-laboureurs.mp3', title: 'Valse des Laboureurs', artist: 'Tommy Duchesne' },
  { src: '/audio/le-violon-en-discorde.mp3', title: 'Le Violon en Discorde', artist: 'Jean Carignan' },
  { src: '/audio/reel-des-forets.mp3', title: 'Reel des Forêts', artist: 'Tommy Duchesne' },
  { src: '/audio/reel-canadienne.mp3', title: 'Reel Canadienne', artist: 'Jean Carignan' },
  // Same LP as the two Carignan tracks above (Songs and Dances of Quebec) —
  // full ensemble credit off that record's own ID3 tags, not just Carignan.
  { src: '/audio/le-reel-de-l-harmonica.mp3', title: 'Le Reel de l\'Harmonica', artist: 'Jean Carignan, Aldor Morin & Edgar Morin' },
  { src: '/audio/gigue-du-poteau-blanc.mp3', title: 'Gigue du Poteau Blanc', artist: 'Joseph Allard' },
  { src: '/audio/quadrille-acadien.mp3', title: 'Quadrille Acadien', artist: 'Joseph Allard' },
  { src: '/audio/quadrille-francais.mp3', title: 'Quadrille Français', artist: 'Joseph Allard' },
  { src: '/audio/avec-les-ruine-babine.mp3', title: 'Avec les Ruine-Babine', artist: 'Louis « Pitou » Boudreault' },
  { src: '/audio/les-batteux.mp3', title: 'Les Batteux', artist: 'Louis « Pitou » Boudreault' },
  // Formerly the Chasse-galerie boss cue (CHASSE_GALERIE_TRACK below) —
  // freed up when "Le Reel du Diable" took over that role. A fine tune on
  // its own merits, kept in the catalog rather than dropped.
  { src: '/audio/reel-du-gouvernement.mp3', title: 'Reel du Gouvernement', artist: 'Les Chevaliers du Folklore' },
];

// Not part of the shuffle above — this only ever plays on cue, the moment
// the Château Gauntlet (bossfights/blockade.js) is spotted, replacing whatever
// track happens to be playing. Once it ends (or the fight resolves first —
// see endBossTrack()), the normal shuffle picks back up right where it
// left off, not from scratch.
const BOSS_TRACK = { src: '/audio/rule-britannia.mp3', title: 'Rule, Britannia!', artist: 'Thomas Arne' };
// Same deal for the Diable fight at the head of the Chasse-galerie — the
// Devil is a fiddler, so his fight gets a reel. Reserved for that fight
// only; kept out of the shuffle so it never turns up on its own elsewhere.
// Not from the Great 78 Project/LAC catalog the rest of this file cites —
// supplied directly (public/audio/src/le-reel-du-paradis-et-enfer.wav,
// normalized via scripts/normalize-audio.mjs same as everything else) —
// see README.md's Music section for the same rights caveat every other
// track here carries.
// volume overrides DEFAULT_VOLUME for this fight specifically — reported
// as too quiet against the fireballs/pistol SFX during the Diable fight's
// own held-arena intensity, a boost the ambient shuffle doesn't need.
// 1.0 is the HTMLMediaElement ceiling — audio.volume can't go any higher
// than this. If it's still not loud enough at this setting, the fix has
// to move from this knob to the file itself (re-normalize the source to a
// louder integrated target than the rest of the catalog's -21 LUFS, or
// duck the fight's own SFX instead) rather than a bigger number here.
const DIABLE_TRACK = { src: '/audio/le-reel-du-paradis-et-enfer.mp3', title: 'Reel du Paradis et Enfer', artist: 'Les Chevaliers', volume: 1.0 };
// The Wendigo's cue — reserved rather than left in the shuffle. It's the one
// recording in this catalog that isn't a period Québécois source (an
// Appalachian old-time jam session — see README.md's Music section), which
// is exactly why it reads as "something's different" the moment it cuts in.
const WENDIGO_TRACK = { src: '/audio/st-annes-reel.mp3', title: "St. Anne's Reel", artist: 'Joe Dobbs & The 1937 Flood' };
// Le Loup-garou's cue, pulled out of the shuffle for the same reason as the
// others — a boss fight deserves a cut-in cue, not whatever the shuffle
// happened to already be playing. "La Reel du Terreur" ("Reel of Terror")
// was already in the catalog; its own title is the whole reason it's this
// one and not some other reshuffled track.
const LOUP_GAROU_TRACK = { src: '/audio/reel-du-terreur.mp3', title: 'La Reel du Terreur', artist: 'Jos Bouchard' };
// The Chasse-galerie flight's cue, cut in the instant the canoe lifts off
// (game.js). The original pick here was Joseph Allard's "Reel du
// Voyageur" — its own title ties straight to the legend, voyageurs flying
// home by canoe — but that recording lives only on Library and Archives
// Canada's Virtual Gramophone, which this dev environment can't reach
// (and it isn't in Internet Archive's Great 78 Project — confirmed via
// their search API, not just a missed guess). Swapped for "Reel du
// Gouvernement," a fine tune but not the right fit — flying to a pact with
// the Devil calls for something that actually says so. "Le Reel du
// Diable" was sitting unused in the regular shuffle (freed up once
// DIABLE_TRACK below got its own newer, dedicated reel) — using it here
// instead means the flight's own cue names the devil you're flying
// toward, then the fight itself cuts to a *different* track (Reel du
// Paradis et Enfer), not a repeat of the same one. Reserved like the
// other three; endBossTrack() drops it (or Le Diable's own real fight
// track, which cuts in over top of it the same way once his fight starts)
// back into the shuffle. Reel du Gouvernement moves back into the regular
// shuffle instead of sitting unused.
const CHASSE_GALERIE_TRACK = { src: '/audio/reel-du-diable.mp3', title: 'Le Reel du Diable', artist: 'Jos Bouchard' };
// Reserved for the Pursuit chase phase of the British Blockade fight
// (bossfights/blockade.js) — cuts in the instant the frigate itself is
// cleared (game.js's consumeJustCleared()), replacing BOSS_TRACK ("Rule,
// Britannia!") for the shootable gunboat chase that follows, rather than
// letting the frigate's own cue run through the whole pursuit. Supplied
// directly like DIABLE_TRACK, not sourced from an archive — see README.md's
// Music section for the same rights caveat every other directly-supplied
// track here carries.
// volume overrides DEFAULT_VOLUME — reported as too quiet during the chase
// (cannon fire/SFX competing with it) even at the normalized -21 LUFS every
// other track sits at. Same fix, same ceiling, as DIABLE_TRACK's own volume
// override right above: 1.0 is as loud as audio.volume goes. If it's still
// not enough at this setting, the fix has to move from this knob to the
// file itself (re-normalize the source to a louder integrated target) —
// see that constant's own comment.
const PURSUIT_TRACK = { src: '/audio/la-mer-de-la-folie.mp3', title: 'La Mer de la Folie', artist: 'Les Chevaliers', volume: 1.0 };
// Kingston's own arrival cues — supplied directly like DIABLE_TRACK/
// PURSUIT_TRACK above (same normalize-audio.mjs treatment, same README.md
// rights caveat), reserved rather than left in the shuffle: journey's end
// deserves deliberate needle-drops, not whatever the shuffle happens to
// already be playing. First cut in at the same flowDistance as the
// "KINGSTON — Fort Frontenac ahead" banner (game.js) — well before the
// dock, so it's already playing under the on-foot scene, the cast-off, and
// the victory card.
// volume overrides DEFAULT_VOLUME — reported as too quiet at the shuffle's
// own level, same as DIABLE_TRACK/PURSUIT_TRACK above (this file measures at
// the same -21 LUFS as the rest of the catalog — it's not mis-normalized,
// the shuffle's own default level is just genuinely quiet). Same ceiling,
// same fix: 1.0 is as loud as audio.volume goes; if that's still not enough,
// the fix has to move to the file itself (see those two tracks' own comments).
// Exported (unlike KINGSTON_TRACK_2/3 below) so main.js's ?start=kingston
// cheat can pin it as the lead-off track via primeKingstonFirstTrack() —
// see that function's own comment for why.
export const KINGSTON_TRACK = { src: '/audio/un-siecle-davance.mp3', title: "Un Siècle d'Avance", artist: 'Les Chevaliers', volume: 1.0 };
// Two more, added for the Artillery Park bandstand scene (villageScene.js)
// — "an isolated playlist exclusively for Kingston," explicitly not folded
// into the ambient shuffle above (PLAYLIST) the way an ordinary new track
// would be. Title/artist here are provisional (derived from the filenames
// — no embedded tags, unlike the archive-sourced catalog above, which ships
// with real ID3 data) — flag if these need correcting; every other title/
// artist in this file is real researched attribution, not a guess.
const KINGSTON_TRACK_2 = { src: '/audio/boutique-de-cadeaux.mp3', title: 'Boutique de Cadeaux', artist: 'Les Chevaliers', volume: 1.0 };
const KINGSTON_TRACK_3 = { src: '/audio/le-caygeon-de-bob.mp3', title: 'Le Caygeon de Bob', artist: 'Les Chevaliers', volume: 1.0 };
// Added last, deliberately ("make it last place in the Kingston playlist"),
// and here — not PLAYLIST above — deliberately too ("explicitly just for
// Kingston, I don't want to hear that song anywhere else in the game").
// Supplied directly like the rest of this set, so no archive listing to
// credit a performer from — artist genuinely unknown, not a placeholder
// guess the way KINGSTON_TRACK_2/3's own "Les Chevaliers" is.
const KINGSTON_TRACK_4 = { src: '/audio/les-rois-de-ble.mp3', title: 'Les Rois de Blé', artist: 'Unknown', volume: 1.0 };
// Unlike every other boss track, nothing ever calls endBossTrack() for this
// set (see win()'s own comment in game.js) — arriving at Kingston is the
// end of the run, not a fight that resolves back into the ambient shuffle.
// Instead, once the first one ends on its own, the next plays (see
// playKingstonTrack() below) — a closed loop of its own, never handing back
// to PLAYLIST, for as long as the run goes on.
// Exported for test/smoke.mjs — the arrival cue is shuffled among these
// now, not always KINGSTON_TRACK specifically, so a test checking "did the
// arrival cue cut in" needs the real set to check membership against
// rather than one hardcoded title.
export const KINGSTON_PLAYLIST = [KINGSTON_TRACK, KINGSTON_TRACK_2, KINGSTON_TRACK_3, KINGSTON_TRACK_4];

// Reported as quiet on the whole, relative to other applications running
// at the same time — not a single track's own mix, the shuffle's own
// baseline level. 1.0 is the HTMLMediaElement ceiling (audio.volume can't
// go any higher — see DIABLE_TRACK's own comment), so there's real room
// left between this and that before the same "the fix has to move to the
// file itself" limit applies. Was 0.35.
const DEFAULT_VOLUME = 0.7;

// Playback state, fetch timing, play() rejections. Kept from earlier
// on-device troubleshooting of a mobile startup delay. (Separate from the
// player-facing "now playing" card, which shows just the title and artist
// of the current track — see onTrack / emitTrack below.)
//
// console.log alone was useless for exactly the class of bug this exists
// to catch: a mobile-only playback issue, on a phone with no devtools
// attached — every past mobile investigation here started from a guess,
// not a log. Also dispatched as a DOM event so main.js can render it
// on-screen (behind ?musicdebug=1) for a phone with no attached devtools.
function debug(text) {
  console.log('[music]', text);
  // test/smoke.mjs runs this module against a minimal window stub with no
  // real DOM event machinery — guarded the same way emitTrack already
  // guards its own onTrack callback, so a missing/incomplete window can
  // never turn a diagnostic into a crash.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('voyageurs-music-debug', { detail: text }));
  }
}

// Real fix for the multi-second gap before music starts: mobile browsers
// generally refuse to let an <audio> element fetch any network data ahead
// of a real user gesture, no matter how early src is assigned or what
// preload says (that's a restriction on the *element*, there specifically
// to stop a page silently burning someone's mobile data) — so the actual
// network fetch of a multi-megabyte file was always starting from zero at
// the exact moment start() ran, right when the delay is most noticeable.
// A plain fetch() has no such restriction; it's just an ordinary network
// request, allowed to run any time. So every track gets fetched into memory
// as soon as this module loads and turned into a local blob: URL — by the
// time a real gesture calls start(), audio.src can point straight at
// already-downloaded local data with no network fetch left to do at all.
// Cached forever per URL (not just look-ahead-by-one) since it's only a
// dozen-odd tracks at a few MB each — a session that cycles through the
// whole playlist ends up with every future transition equally instant, not
// just the first one.
const blobCache = new Map();
function prefetch(url) {
  if (blobCache.has(url)) return blobCache.get(url);
  const promise = fetch(url)
    .then((r) => r.blob())
    .then((blob) => URL.createObjectURL(blob))
    .catch((e) => {
      debug(`prefetch failed for ${url.split('/').pop()}: ${e.message}`);
      return url; // falls back to fetching it the normal (slower) way
    });
  blobCache.set(url, promise);
  return promise;
}

// Fisher-Yates — used once at startup so the play order isn't the same
// every session, and again each time the shuffled order is exhausted so it
// doesn't just repeat the same cycle forever.
function shuffled(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createMusic({ onTrack } = {}) {
  const audio = new Audio();
  audio.volume = DEFAULT_VOLUME;
  audio.preload = 'auto';

  // Always starts unmuted — deliberately not persisted (a muted preference
  // silently carrying across every future reload is exactly what made a
  // one-off mute click look like "the music broke" days later).
  let muted = false;

  let order = shuffled(PLAYLIST);
  let index = 0;
  // Kingston's own shuffle order/index — entirely separate from
  // order/index above, the same way KINGSTON_PLAYLIST is entirely separate
  // from PLAYLIST. This initial value only matters until the first real
  // playKingstonTrack() call, which always overwrites it (with a fresh
  // shuffle, or — if primed — the pinned order below) before anything
  // actually plays, so it's declared shuffled here too rather than left as
  // a stray fixed order that nothing downstream would ever actually use.
  let kingstonOrder = shuffled(KINGSTON_PLAYLIST);
  let kingstonIndex = 0;
  // Set by primeKingstonFirstTrack() (below), consumed by the next
  // playKingstonTrack() call — see that function's own comment.
  let kingstonPrimed = false;
  // Bumped by stop() and playSpecial() — playCurrent() is async (it awaits
  // prefetch()), so a capsize, or a boss track cutting in, could in
  // principle land while a fetch is still resolving; without this, the
  // play() that fires right after would immediately undo whatever just
  // took over.
  let generation = 0;

  // Attaches a *fresh*, one-shot 'ended' listener for the specific commit
  // that just happened (playCurrent()/playSpecial() each call this right
  // after assigning audio.src), rather than one permanent listener that
  // has to infer from shared mutable state (the old `special` flag) what
  // "ended" means right now. That inference broke: a shuffle track's own
  // 'ended' event can be queued by the browser's media pipeline slightly
  // before a same-frame playSpecial() call reassigns audio.src out from
  // under it — by the time the old, single 'ended' handler ran, `special`
  // already read true (set by the newer playSpecial()), so it treated a
  // stale shuffle-track-ended event as "the special track ended on its
  // own" and called playCurrent(), reassigning audio.src right back to
  // the shuffle — while the special track's own still-pending play()
  // attempt (waiting on 'canplay') went on to resolve and update the "now
  // playing" card regardless, since nothing about *that* closure was
  // invalidated. Reported as exactly that: correct title, wrong audio.
  // Gating on `generation` here closes it the same way playSpecial's own
  // 'canplay'/retry logic already does: a listener attached for an older
  // generation silently no-ops once something newer has taken over,
  // instead of acting on stale information.
  function attachEndedHandler(requestedGeneration, onEnded) {
    audio.addEventListener('ended', () => {
      if (generation !== requestedGeneration) return;
      onEnded();
    }, { once: true });
  }

  // Kick off every shuffle track's prefetch immediately — see prefetch()'s
  // own comment for why this, not audio.src/preload, is what actually gets
  // a real head start on mobile. Fire-and-forget: playCurrent() awaits
  // whichever of these promises it needs, whenever it needs it.
  //
  // Boss tracks are deliberately NOT prefetched here any more — playSpecial()
  // below streams them straight from their own URL instead of going through
  // the blob cache at all. This used to prefetch+blob them the same as the
  // shuffle, racing that against a timeout; reported on mobile as a boss
  // track sometimes never cutting in at all, on a plain desktop retest of
  // the exact same build. Root cause was never pinned down for certain
  // (competing theories: a queued-behind-the-whole-shuffle prefetch on a
  // slow connection, or a blob: URL playback quirk specific to a mobile
  // browser engine — both are real, documented classes of mobile/desktop
  // divergence for this exact API surface). Rather than keep guessing and
  // shipping unverified fixes, this removes the shared mechanism entirely
  // for the four tracks that actually need to be reliable: plain streaming
  // playback is the same, boring, standard path every <audio> tag on the
  // web uses by default — it loses the zero-latency blob swap (a boss cue
  // now buffers for a moment before playing, same as any other freshly-
  // loaded audio element), but it isn't subject to either failure mode
  // above. The regular shuffle keeps the blob-prefetch optimization; it
  // isn't the one that's been breaking.
  for (const track of PLAYLIST) prefetch(track.src);

  // The track (from PLAYLIST / BOSS_TRACK) that's actually playing right
  // now, or null before the first successful play(). onTrack — passed by
  // main.js — fires with it every time a new track starts, driving the
  // "now playing" card.
  let current = null;
  function emitTrack(track) {
    current = track;
    try {
      onTrack?.(track);
    } catch (e) {
      debug(`onTrack handler threw: ${e.message}`);
    }
  }

  // True while a boss track is loaded instead of the shuffle — read by
  // playSpecial()'s own attached 'ended' handler (resume the shuffle in
  // place, don't advance it, once the boss track finishes on its own) and
  // by endBossTrack() (cut it short early if the fight resolves before
  // the track does).
  let special = false;

  // The still-unresolved play() attempt for whichever special track is
  // currently committing, or null once it's actually confirmed playing (or
  // superseded). Real bug this fixes: a ?start= cheat can land the canoe
  // already inside a trigger's own distance window (Kingston's own
  // approach banner among them) before the very first real user gesture —
  // so playSpecial()'s own play() attempt gets rejected by the browser's
  // autoplay policy, its one internal setTimeout retry (400ms later) often
  // lands before a gesture too, and it then gives up for good. For every
  // *other* boss track that self-heals: the fight eventually resolves,
  // endBossTrack() forces special back to false and restarts the shuffle
  // regardless. Kingston's own arrival track (KINGSTON_TRACK) deliberately
  // has no such resolution — nothing ever calls endBossTrack() for it (see
  // its own comment) — so a failed attempt left `special` stuck true
  // forever, which made start()'s own `if (started || special) return;`
  // guard silently swallow every later gesture too: not just the arrival
  // track failing, but total silence for the rest of the run. Reported
  // exactly that way. Retrying this on every one of main.js's permanent
  // gesture listeners (the same ones that already retry the ordinary
  // start() path until one works) closes it the same way, instead of
  // giving up after one fixed-delay attempt.
  let pendingSpecialAttempt = null;

  // Tried routing this through a MediaElementAudioSourceNode + AudioContext
  // (to sidestep the phone's silent switch, which <audio> elements respect
  // but Web Audio-generated sound doesn't) — reverted. That API has a long,
  // specific history of being unreliable on iOS Safari in exactly this
  // configuration (element -> WebAudio graph), to the point of sometimes
  // silently preventing playback rather than fixing anything, and it didn't
  // resolve the actual report. Back to the plain, well-supported path while
  // debug() below narrows down what's really happening on-device.
  async function playCurrent() {
    const requestedIndex = index;
    const requestedGeneration = generation;
    const track = order[requestedIndex];
    const src = await prefetch(track.src);
    // Either index moved on (a later 'ended' fired while this fetch was
    // still in flight — the newer playCurrent() already has its own src
    // assignment) or stop() was called mid-fetch — either way, this call
    // is stale and must not touch audio.src/play() at all.
    if (index !== requestedIndex || generation !== requestedGeneration) return;
    audio.src = src;
    // Always the shuffle's own level — undoes whatever a special track
    // (e.g. DIABLE_TRACK's own volume) left it at.
    audio.volume = DEFAULT_VOLUME;
    attachEndedHandler(requestedGeneration, () => {
      index++;
      if (index >= order.length) {
        order = shuffled(PLAYLIST);
        index = 0;
      }
      playCurrent();
    });
    audio.play().then(
      () => {
        started = true;
        debug(`playing ${track.title}`);
        emitTrack(track);
      },
      (e) => {
        // Benign and expected whenever stop()'s pause() lands while a
        // play() from this same track is still pending — not a real
        // failure, and showing it would look like "the bug" to whoever's
        // reading this diagnostic mid-test.
        if (e.name === 'AbortError') return;
        debug(`play() rejected: ${e.name}: ${e.message}`);
        // started deliberately stays false here — see start()'s comment.
      }
    );
  }

  // How long playSpecial() waits for the browser's own 'canplay' signal
  // before giving up on it and calling play() anyway — a rare last resort,
  // not the normal path (see playSpecial's own comment for why the normal
  // path is event-driven, not timer-driven). 'canplay' should fire within
  // milliseconds for a same-origin file under any real network condition,
  // so this only matters if a browser genuinely never fires it.
  const CANPLAY_FALLBACK_MS = 2000;

  // Same idea as playCurrent() above, but for a specific one-off track
  // instead of wherever the shuffle currently points — see BOSS_TRACK's own
  // comment. Deliberately NOT going through prefetch()/the blob cache (see
  // that call site's own comment for why) — audio.src is assigned straight
  // to the track's own URL and the browser streams it natively, the same
  // ordinary path every <audio> tag takes by default.
  //
  // play() is deliberately NOT called immediately after the src swap —
  // reported on mobile as exactly the failure that reordering predicts:
  // the "now playing" card updated correctly (the play() promise resolved)
  // but the audio actually heard kept playing the *previous* track for a
  // while. The DOM-level API resolving successfully only means playback
  // was accepted; it doesn't mean the underlying native media pipeline
  // (which on mobile is frequently a separate, slower-to-reconfigure OS
  // decoder, not something purely inside the JS engine) has actually
  // finished tearing down the old resource and switched to the new one —
  // a desktop browser's own pipeline is fast enough that this race is
  // essentially never visible, which is exactly why it never showed up in
  // any desktop testing. Waiting for 'canplay' — the browser's own signal
  // that the *new* resource is actually decoded and ready — closes that
  // race by construction instead of hoping the timing works out.
  // How often (ms) fadeOutThenCommit below steps audio.volume down — real
  // wall-clock delay, not tied to the game loop (music.js has no access to
  // it), so it costs real time in anything that drives this repeatedly
  // fast (a scripted respawn loop, say) — but only the *last* fade actually
  // requested ever survives to really run: every earlier one's own next
  // step immediately finds `generation` has moved on and stops there,
  // costing one cheap timer firing each, not a full chain.
  const FADE_STEP_MS = 50;

  // onEnded (default: drop back into the ambient shuffle) is overridable —
  // the Kingston playlist below is the one caller that needs something
  // else: the *next* Kingston track, not PLAYLIST, once the current one
  // finishes on its own. Everything else (fights, chases) still wants the
  // default.
  function playSpecial(track, fadeOutMs = 0, onEnded) {
    special = true;
    generation++;
    const requestedGeneration = generation;
    const finishedNaturally = onEnded ?? (() => {
      special = false;
      pendingSpecialAttempt = null;
      playCurrent();
    });

    // The actual commit — pause, swap src, wait for canplay, play — same
    // as before fadeOutMs existed, just pulled into its own function so it
    // can run either immediately or after the fade-out below finishes.
    const commit = () => {
      if (generation !== requestedGeneration) return;
      debug(`playSpecial: ${track.title}`);
      audio.pause();
      audio.src = track.src;
      // track.volume overrides the shuffle's own DEFAULT_VOLUME — see
      // DIABLE_TRACK's own comment for why that one needs it; every other
      // special track just falls back to the same level the shuffle uses.
      // Set here (after any fade-out above already dragged audio.volume
      // toward 0) so the new track always starts at its own real level,
      // not wherever the old one's fade happened to leave the element.
      audio.volume = track.volume ?? DEFAULT_VOLUME;
      // If this track plays out to its own natural end without the fight
      // resolving first (endBossTrack() cutting it short), finishedNaturally
      // above decides what happens next — see attachEndedHandler's own
      // comment for why this has to be freshly attached per commit, not one
      // shared listener.
      attachEndedHandler(requestedGeneration, finishedNaturally);

      let retried = false;
      const attempt = () => {
        if (generation !== requestedGeneration) return;
        audio.play().then(
          () => {
            started = true;
            pendingSpecialAttempt = null;
            debug(`playing special track ${track.title}`);
            if (generation === requestedGeneration) emitTrack(track);
          },
          (e) => {
            if (e.name === 'AbortError') return;
            debug(`special play() rejected: ${e.name}: ${e.message}`);
            if (!retried && generation === requestedGeneration) {
              retried = true;
              setTimeout(attempt, 400);
            }
            // pendingSpecialAttempt stays set (see its own comment) — even
            // once the scheduled retry above is also exhausted, a later
            // real gesture through start() gets another shot at this exact
            // attempt, not just the one fixed-delay retry.
          }
        );
      };
      // See pendingSpecialAttempt's own comment — cleared on success above,
      // overwritten by whichever playSpecial() commits next, otherwise left
      // for start() to retry on the player's next real gesture.
      pendingSpecialAttempt = attempt;
      let ready = false;
      const onReady = () => {
        if (ready) return;
        ready = true;
        attempt();
      };
      audio.addEventListener('canplay', onReady, { once: true });
      setTimeout(onReady, CANPLAY_FALLBACK_MS);
      audio.load();
    };

    // Easing into a fight instead of a hard cut — reported for the Diable
    // cue specifically (see playDiableTrack's own comment for why just
    // that one). Ramps whatever's audibly playing right now down to
    // silence over fadeOutMs, *then* commits to the new track — a beat of
    // the old music trailing off before the new one lands, not two tracks
    // overlapping (that's a proper crossfade, a bigger feature this isn't
    // trying to be). Skipped entirely if nothing's actually playing to
    // fade (audio.paused) — there's nothing to ease out of.
    if (fadeOutMs > 0 && !audio.paused) {
      const startVolume = audio.volume;
      const startedAt = Date.now();
      const step = () => {
        if (generation !== requestedGeneration) return; // superseded mid-fade
        const t = Math.min(1, (Date.now() - startedAt) / fadeOutMs);
        audio.volume = startVolume * (1 - t);
        if (t < 1) setTimeout(step, FADE_STEP_MS);
        else commit();
      };
      step();
    } else {
      commit();
    }
  }

  // Plays kingstonOrder[kingstonIndex] via playSpecial(), with a custom
  // onEnded that advances to the next Kingston track instead of the
  // default (drop back into PLAYLIST) — reshuffling KINGSTON_PLAYLIST once
  // exhausted, the same way playCurrent()'s own 'ended' handler reshuffles
  // PLAYLIST. Recurses through playSpecial's onEnded callback rather than a
  // loop, so it's driven entirely by real 'ended' events, one track at a
  // time — never hands back to the ambient shuffle.
  function playKingstonPlaylistTrack() {
    const track = kingstonOrder[kingstonIndex];
    playSpecial(track, 0, () => {
      kingstonIndex++;
      if (kingstonIndex >= kingstonOrder.length) {
        kingstonOrder = shuffled(KINGSTON_PLAYLIST);
        kingstonIndex = 0;
      }
      playKingstonPlaylistTrack();
    });
  }

  audio.addEventListener('error', () => {
    const err = audio.error;
    debug(`audio error ${err?.code ?? '?'}: ${err?.message || '(no message)'}`);
  });

  let started = false;

  return {
    get muted() {
      return muted;
    },
    // The track playing right now ({ src, title, artist }), or null before
    // playback has started — main.js reads this to re-show the card on a
    // manual cue (e.g. unmuting).
    get nowPlaying() {
      return current;
    },
    // Test-only, same convention as bossfights/britishWarship.js's
    // debugChaseShipPosition()/diable.js's debugCentreX() — lets a test
    // simulate a track ending on its own (audio.dispatchEvent({type:
    // 'ended'}), dom-shim.mjs's own test hook) without a real audio file
    // playing out. Not used by any real caller.
    debugAudioElement() {
      return audio;
    },
    // Real bug this fixes: `started` used to be set true *before* knowing
    // whether play() actually succeeded, right when start() was first
    // called — so the very first gesture on the page (which might not even
    // be a deliberate one — a stray touch, whatever opened the tab) could
    // permanently "use up" the only attempt. If that one attempt failed for
    // any reason, every later gesture — including deliberately tapping
    // mute — became a no-op forever, because the code believed it had
    // already started. Now `started` only flips true on actual success
    // (see playCurrent()'s .then above), so main.js can safely call this on
    // every qualifying gesture and it keeps retrying until one works.
    //
    // Second real bug this fixes: `started` only flips true once a
    // playCurrent()/playSpecial() attempt's own audio.play() promise
    // *resolves* — which, for a special track, is genuinely async (it waits
    // on 'canplay' or the ~2s CANPLAY_FALLBACK_MS timeout in playSpecial()
    // below). A ?start= cheat that drops straight into a boss fight can hit
    // consumeJustSpotted()/consumeJustCleared() (game.js) before the
    // player's very first keydown/click has fired at all, so `started` is
    // still false when playBossTrack()/playPursuitTrack() commit — and if
    // the player's actual first gesture (pressing a movement key, which
    // they do almost immediately) lands in that still-pending window,
    // main.js's own gesture listeners call start() again. Without the
    // `special` check, that saw `started` still false and called
    // playCurrent() — which passed its own generation check clean (nothing
    // else had bumped generation since the boss track's commit) and
    // clobbered the correctly-playing special track with a random shuffle
    // pick a second or two in. Reported exactly that way: "La Mer de la
    // Folie" started right, then a random track took over almost
    // immediately. `special` (set synchronously the instant playSpecial()
    // is called, well before any of this async settling) is the correct
    // signal for "something has already been commanded, don't re-bootstrap".
    //
    // pendingSpecialAttempt's own comment covers the other half: if that
    // command's own play() attempt is still unresolved (or has already
    // failed and exhausted its one internal retry — a real, reported case
    // for Kingston's own arrival track, see that comment), retry *it*
    // instead of falling through to the ordinary shuffle bootstrap below —
    // this is what actually recovers a special track a browser initially
    // refused to autoplay, on the player's next real gesture.
    start() {
      if (pendingSpecialAttempt) {
        pendingSpecialAttempt();
        return;
      }
      if (started || special) return;
      debug('start() called');
      playCurrent();
    },
    // Pauses playback in place (capsizing) — resume() picks back up from
    // the same spot rather than restarting the track.
    stop() {
      generation++;
      audio.pause();
    },
    // No-ops if start() was never called (e.g. capsizing before the player
    // has interacted at all, which can't actually happen, but this keeps
    // it safe to call unconditionally from Game.start()).
    resume() {
      if (!started) return;
      audio.play().then(
        () => {
          debug(`resumed ${order[index].title}`);
          // Re-show the card after a capsize+restart, as a small "here's
          // where you were" cue when the world snaps back.
          emitTrack(order[index]);
        },
        (e) => {
          if (e.name === 'AbortError') return;
          debug(`resume play() rejected: ${e.name}: ${e.message}`);
        }
      );
    },
    toggleMute() {
      muted = !muted;
      audio.muted = muted;
      return muted;
    },
    // Cuts in immediately, replacing whatever's currently playing — see
    // BOSS_TRACK's own comment. Safe to call even before start() (e.g. a
    // ?start= cheat landing right at the fight) since playSpecial sets
    // `started` itself.
    playBossTrack() {
      playSpecial(BOSS_TRACK);
    },
    // The Diable fight's reel — requested as an easing-in rather than the
    // other boss tracks' hard cut: 2.5s of whatever's already playing
    // trailing off before his own reel lands, dread building instead of a
    // sudden jump-cut. endBossTrack() (no fade — the fight resolving is
    // its own sudden beat) drops back into the shuffle same as the others.
    playDiableTrack() {
      playSpecial(DIABLE_TRACK, 2500);
    },
    // The Wendigo's cue — same cut-in-now behaviour; endBossTrack() drops it
    // back into the shuffle same as the other two.
    playWendigoTrack() {
      playSpecial(WENDIGO_TRACK);
    },
    // Le Loup-garou's cue — same cut-in-now behaviour; endBossTrack() drops
    // it back into the shuffle same as every other fight.
    playLoupGarouTrack() {
      playSpecial(LOUP_GAROU_TRACK);
    },
    // The Chasse-galerie flight's cue — same cut-in-now behaviour. Le
    // Diable's own track (playDiableTrack) cuts in over top of this one
    // the same way once his fight starts mid-flight; endBossTrack() then
    // drops back into the shuffle for the rest of the glide to Gatineau,
    // same as it does after every other fight.
    playChasseGalerieTrack() {
      playSpecial(CHASSE_GALERIE_TRACK);
    },
    // The Pursuit chase's own cue — cut in once the frigate is cleared (see
    // PURSUIT_TRACK's own comment); endBossTrack() drops it back into the
    // shuffle the same as every other boss track once the chase resolves.
    playPursuitTrack() {
      playSpecial(PURSUIT_TRACK);
    },
    // Pins `track` as the lead-off track the *next* time playKingstonTrack()
    // is called, without giving up the shuffle for the other two — used by
    // main.js's ?start=kingston cheat ("make sure [Un Siècle d'Avance] is
    // the first song in the playlist from ?start=kingston") so a quick dev
    // visit always leads with the same familiar arrival cue, while a real
    // playthrough (which never calls this) still gets a genuinely random
    // lead track like any other call to playKingstonTrack() always has.
    // Consumed (kingstonPrimed reset) the moment playKingstonTrack() reads
    // it, so it only affects the very next call, not every future one.
    primeKingstonFirstTrack(track) {
      kingstonOrder = [track, ...shuffled(KINGSTON_PLAYLIST.filter((t) => t !== track))];
      kingstonIndex = 0;
      kingstonPrimed = true;
    },
    // Kingston's arrival cue — same cut-in-now behaviour as the other
    // trigger-fired tracks, but now a small closed playlist of its own
    // (KINGSTON_PLAYLIST) rather than one track — "an isolated playlist
    // exclusively for Kingston," never mixed into PLAYLIST above. Reshuffled
    // fresh on every call (kingstonOrder/kingstonIndex reset here) unless
    // primeKingstonFirstTrack() just pinned a specific lead-off track — so a
    // capsize+restart mid-approach, or a second ordinary run in the same
    // session, doesn't always replay the same first pick. Deliberately
    // never handed to endBossTrack() by any caller (see KINGSTON_PLAYLIST's
    // own comment) — once it starts, this loops through the whole set
    // for the rest of the run rather than ever resolving back into the
    // ambient shuffle.
    playKingstonTrack() {
      if (!kingstonPrimed) {
        kingstonOrder = shuffled(KINGSTON_PLAYLIST);
        kingstonIndex = 0;
      }
      kingstonPrimed = false;
      playKingstonPlaylistTrack();
    },
    // Cuts the boss track short and drops back into the normal shuffle —
    // called the moment the fight resolves, rather than waiting out the
    // rest of a ~2.5-minute track after a ~15-second fight. A no-op if the
    // boss track isn't what's currently playing (e.g. game.js's start()
    // calls this unconditionally on every restart, boss fight or not, to
    // guarantee a restart never leaves it playing).
    endBossTrack() {
      if (!special) return; // shuffle's already back — nothing to cut short
      debug('endBossTrack — dropping the boss track back into the shuffle');
      special = false;
      pendingSpecialAttempt = null;
      generation++;
      playCurrent();
    },
  };
}
