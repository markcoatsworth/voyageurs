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

// A short, dull downward blip for a glancing hit — a triangle wave through
// a low-pass filter reads as duller/rounder than the horn's brassy
// sawtooth, and two quick descending notes (rather than the horn's drawn-
// out three) keep it a small "aw, hit something" cue rather than a
// dramatic one. Reserved for hits that don't sink the canoe — gameOver()
// plays the capsize horn instead, and playing both on the same fatal hit
// would just be noise on top of noise.
function boop(c, startTime, freq, duration) {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.26, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playDamageBoop() {
  const c = getCtx();
  const t0 = c.currentTime;
  // "boop, oop" — a falling minor third, A3 down to F3.
  boop(c, t0 + 0.00, 220.0, 0.11);
  boop(c, t0 + 0.09, 174.6, 0.16);
}

// A cannon impact — the Château Gauntlet's (bossfights/blockade.js) own cue, one
// per cannonball landing, hit or miss. Two layers, same "synthesize it,
// don't ship a sample" approach as everything else here: a low sine
// "thump" sliding down in pitch for the body of the explosion, and a burst
// of white noise swept from bright down to dull through a lowpass filter
// for the crack/rumble on top. jitter varies the pitch and timing a little
// so several in quick succession (a multi-shot volley) don't sound like the
// exact same sample triggered three times.
function noiseBurst(c, startTime, duration, startFreq) {
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(startFreq, startTime);
  filter.frequency.exponentialRampToValueAtTime(90, startTime + duration);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.45, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter).connect(gain).connect(c.destination);
  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

function thump(c, startTime, duration, startFreq, endFreq) {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.7, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain).connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playCannonBoom() {
  const c = getCtx();
  const t0 = c.currentTime;
  const jitter = 0.9 + Math.random() * 0.2; // 0.9-1.1x, pitch + duration
  thump(c, t0, 0.32 * jitter, 130 * jitter, 38 * jitter);
  noiseBurst(c, t0, 0.42 * jitter, 2200);
}
