// Background music. Browsers block audio autoplay until a real user
// gesture, so this doesn't try to play on load — main.js starts it on the
// player's first keypress/click instead, which the game already treats as
// "the run has begun" anyway (see the immediate-launch design in game.js).
//
// Plays as a shuffled playlist that loops forever, one track after another
// (not one track on repeat) — to add a song, just drop its file in
// public/audio/ and add its URL here.
const PLAYLIST = [
  '/audio/grande-gigue-simple.mp3',
  '/audio/reel-du-pendu.mp3',
  '/audio/reel-des-laurentides.mp3',
  '/audio/reel-des-montagnes.mp3',
  '/audio/valse-des-laboureurs.mp3',
  '/audio/le-violon-en-discorde.mp3',
  '/audio/reel-des-forets.mp3',
];

// Always the opening track — every time the play order is (re)built, not
// just once at the very start of the session, so it's still what leads
// after the rest of the playlist has cycled through and reshuffles too.
// Everything else about it is an ordinary PLAYLIST entry (normalized to
// the same loudness target, eligible for the shuffle like any other track
// once it's not sitting in this opening slot).
const OPENING_TRACK = '/audio/reel-des-forets.mp3';

const DEFAULT_VOLUME = 0.35;

// TEMPORARY diagnostic — this can't be tested on real iOS hardware from
// here, and two blind fix attempts (broader gesture-unlock events, then
// Web Audio routing) haven't resolved a real device report of "no music."
// Rather than guess a third time, surface exactly what the browser says is
// happening directly on-screen. Remove this + #audio-debug once actual
// music playback is confirmed working on the reporting device.
function debug(text) {
  console.log('[music]', text);
  const el = document.getElementById('audio-debug');
  if (el) el.textContent = text;
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

// OPENING_TRACK pinned to the front, everything else shuffled behind it —
// used for both the very first order and every reshuffle after, so it
// always leads.
function buildOrder() {
  return [OPENING_TRACK, ...shuffled(PLAYLIST.filter((t) => t !== OPENING_TRACK))];
}

export function createMusic() {
  const audio = new Audio();
  audio.volume = DEFAULT_VOLUME;
  audio.preload = 'auto';

  // Always starts unmuted — deliberately not persisted (a muted preference
  // silently carrying across every future reload is exactly what made a
  // one-off mute click look like "the music broke" days later).
  let muted = false;

  let order = buildOrder();
  let index = 0;

  // Set immediately, well before the first gesture that actually calls
  // start() — preload="auto" above has nothing to act on until src points
  // somewhere, so without this the browser doesn't begin fetching the
  // opening track until the exact moment the player is already waiting to
  // hear it. Assigning src doesn't play anything (no autoplay violation,
  // no gesture needed for that part) — it just gives the browser the
  // whole time between page load and that first tap to actually buffer
  // the file, instead of starting that fetch from zero right when it's
  // most noticeable.
  audio.src = order[index];
  audio.load();

  // Tried routing this through a MediaElementAudioSourceNode + AudioContext
  // (to sidestep the phone's silent switch, which <audio> elements respect
  // but Web Audio-generated sound doesn't) — reverted. That API has a long,
  // specific history of being unreliable on iOS Safari in exactly this
  // configuration (element -> WebAudio graph), to the point of sometimes
  // silently preventing playback rather than fixing anything, and it didn't
  // resolve the actual report. Back to the plain, well-supported path while
  // debug() below narrows down what's really happening on-device.
  function playCurrent() {
    audio.src = order[index];
    audio.play().then(
      () => {
        started = true;
        debug(`playing ${order[index].split('/').pop()}`);
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

  audio.addEventListener('error', () => {
    const err = audio.error;
    debug(`audio error ${err?.code ?? '?'}: ${err?.message || '(no message)'}`);
  });

  // Advance to the next track when one ends, instead of looping the same
  // one — reshuffle once the whole list has played through.
  audio.addEventListener('ended', () => {
    index++;
    if (index >= order.length) {
      order = buildOrder();
      index = 0;
    }
    playCurrent();
  });

  let started = false;

  return {
    get muted() {
      return muted;
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
    start() {
      if (started) return;
      debug('start() called');
      playCurrent();
    },
    // Pauses playback in place (capsizing) — resume() picks back up from
    // the same spot rather than restarting the track.
    stop() {
      audio.pause();
    },
    // No-ops if start() was never called (e.g. capsizing before the player
    // has interacted at all, which can't actually happen, but this keeps
    // it safe to call unconditionally from Game.start()).
    resume() {
      if (!started) return;
      audio.play().then(
        () => debug(`resumed ${order[index].split('/').pop()}`),
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
  };
}
