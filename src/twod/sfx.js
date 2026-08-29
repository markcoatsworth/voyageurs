// A synthesized "sad trombone" fail cue for capsizing — generated on the
// fly with the Web Audio API rather than shipped as an audio file, so there's
// no asset to license or load.
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Autoplay policies can leave a freshly-created context suspended even
  // after a prior gesture unlocked audio elsewhere on the page.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// One "wah" — a muted-brass tone (sawtooth through a low-pass filter) with
// a short attack/decay envelope, optionally sliding to a lower pitch.
function wah(c, startTime, freq, duration, glideTo) {
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, startTime);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startTime + duration);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.03);
  gain.gain.setValueAtTime(0.3, startTime + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playCapsizeHorn() {
  const c = getCtx();
  const t0 = c.currentTime;
  // "wah, wah, waaahh" — two short descending notes then a longer one that
  // bends further down, the classic sad-trombone fail cadence.
  wah(c, t0 + 0.00, 196.0, 0.22);        // G3
  wah(c, t0 + 0.24, 185.0, 0.22);        // F#3
  wah(c, t0 + 0.48, 164.8, 0.9, 116.5);  // E3 sliding down to A#2
}

// One short bell-ish "bling" note — a sine with a hint of its octave on top
// for sparkle, fast attack and a ringing exponential decay.
function ding(c, startTime, freq, duration) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  gain.connect(c.destination);

  for (const [mult, level] of [[1, 1], [2, 0.35]]) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const partial = c.createGain();
    partial.gain.value = level;
    osc.connect(partial).connect(gain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export function playPeltChime() {
  const c = getCtx();
  const t0 = c.currentTime;
  // A quick rising two-note ping — E6 then B6 — that reads as "got it!"
  ding(c, t0 + 0.00, 1318.5, 0.18);
  ding(c, t0 + 0.07, 1975.5, 0.28);
}
