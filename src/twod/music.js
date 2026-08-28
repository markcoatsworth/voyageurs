// Background music. Browsers block audio autoplay until a real user
// gesture, so this doesn't try to play on load — main.js starts it on the
// player's first keypress/click instead, which the game already treats as
// "the run has begun" anyway (see the immediate-launch design in game.js).
const TRACK_URL = '/audio/grande-gigue-simple.mp3';
const DEFAULT_VOLUME = 0.35;
const MUTE_STORAGE_KEY = 'voyageurs-music-muted';

export function createMusic() {
  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.volume = DEFAULT_VOLUME;
  audio.preload = 'auto';

  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    // localStorage can throw in some private-browsing contexts — fall back
    // to unmuted for this session rather than breaking playback entirely.
  }
  audio.muted = muted;

  let started = false;

  return {
    get muted() {
      return muted;
    },
    start() {
      if (started) return;
      started = true;
      // play() returns a rejected promise if the browser still refuses
      // (e.g. gesture didn't count) — that's fine, just stay silent rather
      // than throwing into the game loop over background music.
      audio.play().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      audio.muted = muted;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
      } catch {
        // ignore — worst case the preference doesn't persist across visits
      }
      return muted;
    },
  };
}
