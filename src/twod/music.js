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
];

const DEFAULT_VOLUME = 0.35;

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

  function playCurrent() {
    audio.src = order[index];
    // play() returns a rejected promise if the browser still refuses (e.g.
    // the gesture didn't count) — that's fine, just stay silent rather than
    // throwing into the game loop over background music.
    audio.play().catch(() => {});
  }

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
    start() {
      if (started) return;
      started = true;
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
      audio.play().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      audio.muted = muted;
      return muted;
    },
  };
}
