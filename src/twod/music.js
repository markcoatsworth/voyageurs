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
  '/audio/reel-canadienne.mp3',
];

const DEFAULT_VOLUME = 0.35;

// Console-only now — this used to also show on-screen (#audio-debug),
// surfacing exactly what the browser said was happening since this
// couldn't be tested on real device hardware from here. The on-screen
// overlay itself was distracting during normal play, so it's gone, but a
// real mobile playback issue (a startup delay) is still open, so the
// console trail stays for whoever's chasing that down next.
function debug(text) {
  console.log('[music]', text);
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
// Cached forever per URL (not just look-ahead-by-one) since there are only
// 7 tracks at a few MB each — a session that cycles through the whole
// playlist ends up with every future transition equally instant, not just
// the first one.
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

export function createMusic() {
  const audio = new Audio();
  audio.volume = DEFAULT_VOLUME;
  audio.preload = 'auto';

  // Always starts unmuted — deliberately not persisted (a muted preference
  // silently carrying across every future reload is exactly what made a
  // one-off mute click look like "the music broke" days later).
  let muted = false;

  let order = shuffled(PLAYLIST);
  let index = 0;
  // Bumped by stop() — playCurrent() is async now (it awaits prefetch()),
  // so a capsize could in principle land while a fetch is still resolving;
  // without this, the play() that fires right after would immediately
  // undo the pause stop() just made.
  let generation = 0;

  // Kick off every track's prefetch immediately — see prefetch()'s own
  // comment for why this, not audio.src/preload, is what actually gets a
  // real head start on mobile. Fire-and-forget: playCurrent() awaits
  // whichever of these promises it needs, whenever it needs it.
  for (const track of PLAYLIST) prefetch(track);

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
    const src = await prefetch(order[requestedIndex]);
    // Either index moved on (a later 'ended' fired while this fetch was
    // still in flight — the newer playCurrent() already has its own src
    // assignment) or stop() was called mid-fetch — either way, this call
    // is stale and must not touch audio.src/play() at all.
    if (index !== requestedIndex || generation !== requestedGeneration) return;
    audio.src = src;
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
      order = shuffled(PLAYLIST);
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
      generation++;
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
