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

// Le Diable (bossfights/diable.js). A roar when he looms up: two detuned
// low sawtooths bending downward through a lowpass, with a noise-rumble
// bed — big and subterranean, nothing like the game's other cues.
function growl(c, startTime, freq, duration) {
  for (const detune of [0, 7, -5]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq + detune, startTime);
    osc.frequency.exponentialRampToValueAtTime((freq + detune) * 0.55, startTime + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, startTime);
    filter.frequency.exponentialRampToValueAtTime(160, startTime + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.05);
    gain.gain.setValueAtTime(0.22, startTime + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(filter).connect(gain).connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export function playDiableRoar() {
  const c = getCtx();
  const t0 = c.currentTime;
  growl(c, t0, 78, 1.4);
  noiseBurst(c, t0 + 0.05, 1.1, 900);
}

// His death: the roar in reverse — a rising shriek that cuts out hard, then
// a last low collapse.
// Le Loup-garou (bossfights/loupGarou.js). A howl the moment the beast is
// spotted: two reedy voices a fifth apart that glide up, hold, then a long
// slide back down — thinner and higher than the Diable growl, more lonely
// than menacing. Same synth-it approach as everything else here.
export function playWolfHowl() {
  const c = getCtx();
  const t0 = c.currentTime;
  for (const [mult, level] of [[1, 1], [1.5, 0.55], [2.01, 0.22]]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const f = 300 * mult;
    osc.frequency.setValueAtTime(f * 0.72, t0);
    osc.frequency.linearRampToValueAtTime(f, t0 + 0.45);
    osc.frequency.setValueAtTime(f, t0 + 1.05);
    osc.frequency.exponentialRampToValueAtTime(f * 0.5, t0 + 1.95);

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 850;
    filter.Q.value = 3.5;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16 * level, t0 + 0.3);
    gain.gain.setValueAtTime(0.16 * level, t0 + 1.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);

    osc.connect(filter).connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 2.05);
  }
}

// Le Wendigo (bossfights/wendigo.js). Its tell: a long, dry, rasping
// inhale — filtered white noise swelling through a rising band, over a
// barely-there sub drone. Nothing musical, nothing brassy; it should read
// as a held breath drawn in through the trees, the cue to stop paddling.
export function playWendigoBreath() {
  const c = getCtx();
  const t0 = c.currentTime;
  const dur = 1.6;

  const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(320, t0);
  band.frequency.exponentialRampToValueAtTime(1500, t0 + dur * 0.8);

  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.16, t0 + dur * 0.75);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(band).connect(ng).connect(c.destination);
  noise.start(t0);
  noise.stop(t0 + dur + 0.02);

  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(58, t0);
  sub.frequency.linearRampToValueAtTime(46, t0 + dur);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.12, t0 + dur * 0.6);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  sub.connect(sg).connect(c.destination);
  sub.start(t0);
  sub.stop(t0 + dur + 0.02);
}

// Its lunge connecting — a short, hard shriek: a sawtooth snapping upward
// then cut, with a noise crack on top. Only when a blow actually lands.
export function playWendigoShriek() {
  const c = getCtx();
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(1650, t0 + 0.16);
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 300;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.24, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.3);
  noiseBurst(c, t0, 0.22, 3000);
}

// The British Warship (bossfights/britishWarship.js) approach: two distant
// thunderclaps mark the weather closing in, well before the fight itself —
// its own crisp playCannonBoom() cues don't start until the held arena
// actually opens fire. Deliberately built as thunder, not gunfire: a short
// bright crack (noiseBurst, reused from playCannonBoom's own crack) rolling
// into a long, low rumble made of several staggered, independently-decaying
// noise layers so it swells and fades unevenly, the way real thunder rolls
// rather than cutting cleanly like a shot. The first call is guaranteed at
// least 3s ahead of the fight's own trigger (FIRST_THUNDERCLAP_DISTANCE);
// the second is just a closer, second warning before the held, silent
// "brooding" stretch that follows it.
export function playThunderclap() {
  const c = getCtx();
  const t0 = c.currentTime;
  const jitter = 0.85 + Math.random() * 0.3; // no two claps sound identical

  noiseBurst(c, t0, 0.12 * jitter, 3200);

  const rumbleDur = 2.2 * jitter;
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * rumbleDur));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  for (const [delay, level, dur] of [[0.05, 0.4, rumbleDur], [0.35, 0.28, rumbleDur * 0.75], [0.75, 0.18, rumbleDur * 0.5]]) {
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, t0 + delay);
    filter.frequency.exponentialRampToValueAtTime(45, t0 + delay + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(level, t0 + delay + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
    noise.connect(filter).connect(gain).connect(c.destination);
    noise.start(t0 + delay);
    noise.stop(t0 + delay + dur + 0.05);
  }

  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(55, t0);
  sub.frequency.exponentialRampToValueAtTime(28, t0 + 0.5);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0.0001, t0);
  subGain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.06);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  sub.connect(subGain).connect(c.destination);
  sub.start(t0);
  sub.stop(t0 + 0.65);
}

// A far-off rumble — playThunderclap's roll without its crack or sub-thump,
// at a fraction of the level. Rides the sheet-lightning flickers during the
// Warship storm's build-up (britishWarship.js's rumbleCount): lightning a
// long way off, heard late and low, so the two real claps above still land
// as the loud, close beats they're meant to be. Longer and slower than the
// clap's own roll — distance smears thunder out.
export function playDistantRumble() {
  const c = getCtx();
  const t0 = c.currentTime;
  const jitter = 0.85 + Math.random() * 0.3;
  const rumbleDur = 3.0 * jitter;
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * rumbleDur));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  for (const [delay, level, dur] of [[0.3, 0.13, rumbleDur], [0.9, 0.09, rumbleDur * 0.7]]) {
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, t0 + delay);
    filter.frequency.exponentialRampToValueAtTime(40, t0 + delay + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(level, t0 + delay + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
    noise.connect(filter).connect(gain).connect(c.destination);
    noise.start(t0 + delay);
    noise.stop(t0 + delay + dur + 0.05);
  }
}

// The storm's continuous bed — wind and rain under the Warship approach
// and fight (britishWarship.js's stormBedLevel drives it, game.js calls
// this every frame). Two looping noise layers built once and left running
// at silence: a slow-swelling low band (wind — a lowpass whose cutoff
// wanders up and down on an LFO, so it moans rather than hums) and a
// steady hiss band (rain — bandpass up high). Level 0..1 sets both gains
// with a short setTargetAtTime slew, never a hard step, so the bed fades
// in and out with the storm's own ramp instead of clicking on. Nothing is
// created until the first non-zero level (so a run that never reaches the
// Rideau never allocates it), and the graph is left connected at zero gain
// rather than torn down and rebuilt each time — the storm comes and goes
// exactly once per run, and a restart just drives it back to 0.
let stormBed = null;
let stormBedLevelWas = 0;
function makeStormBed(c) {
  const seconds = 4;
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const wind = c.createBufferSource();
  wind.buffer = buffer;
  wind.loop = true;
  const windFilter = c.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 320;
  windFilter.Q.value = 1.4;
  // The moan: an LFO sweeping the wind's cutoff between ~180 and ~460 Hz
  // every few seconds.
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.17;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(windFilter.frequency);
  const windGain = c.createGain();
  windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(c.destination);

  const rain = c.createBufferSource();
  rain.buffer = buffer;
  rain.loop = true;
  rain.playbackRate.value = 1.31; // decorrelate it from the wind's copy of the same buffer
  const rainFilter = c.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 3800;
  rainFilter.Q.value = 0.6;
  const rainGain = c.createGain();
  rainGain.gain.value = 0;
  rain.connect(rainFilter).connect(rainGain).connect(c.destination);

  const t0 = c.currentTime;
  wind.start(t0);
  rain.start(t0);
  lfo.start(t0);
  return { windGain, rainGain };
}
// Peak gains: the wind carries the bed, the rain sits under it — a hiss
// that's noticed once the wind drops out rather than a wall of static.
const STORM_BED_WIND_GAIN = 0.22;
const STORM_BED_RAIN_GAIN = 0.07;
export function setStormBed(level) {
  const l = Math.max(0, Math.min(1, level || 0));
  if (l === stormBedLevelWas) return;
  if (!stormBed) {
    if (l === 0) return;
    stormBed = makeStormBed(getCtx());
  }
  const c = getCtx();
  // Rain arrives later than the wind (squared), so the first thing heard
  // is the wind picking up, and the rain only really comes on once the
  // sky is well dark — the same order the visuals use.
  stormBed.windGain.gain.setTargetAtTime(STORM_BED_WIND_GAIN * l, c.currentTime, 0.25);
  stormBed.rainGain.gain.setTargetAtTime(STORM_BED_RAIN_GAIN * l * l, c.currentTime, 0.25);
  stormBedLevelWas = l;
}

export function playDiableDefeat() {
  const c = getCtx();
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.5);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.6);
  growl(c, t0 + 0.5, 120, 1.2);
  noiseBurst(c, t0 + 0.5, 0.9, 1600);
}
