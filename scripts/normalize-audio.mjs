// Two-pass EBU R128 loudness normalization + MP3 encode for the music
// tracks. The source files (public/audio/src/, gitignored) are a mix of
// archival 78rpm transfers and modern recordings at wildly different
// levels; the game plays them back-to-back on a shuffled loop, so they
// need to sit at one perceived loudness or every track change is a jump.
//
// Target is -21 LUFS integrated / -1.5 dBTP — where the catalog's recent
// additions already sit (measure with:  npm run audio:measure).
//
// ffmpeg comes from the `ffmpeg-static` package — an optionalDependency
// (not dev) so its ~80MB binary download can never fail the Docker /
// Cloud Build image, which doesn't run these scripts. If a plain
// `npm install` skipped it, `npm install ffmpeg-static` pulls it in.
//
// Usage:
//   node scripts/normalize-audio.mjs "src/Some Artist - Title.wav=title-kebab" ...
//
// Each arg is  <path under public/audio/>=<output basename>  and produces
// public/audio/<basename>.mp3. Then add "/audio/<basename>.mp3" to
// PLAYLIST in src/audio/music.js.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ffmpeg = (await import('ffmpeg-static')).default;
const AUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio');

const TARGET_I = -21;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;
const MP3_QUALITY = 2; // libmp3lame VBR, LAME's "transparent" setting; lands
                       // lower for the band-limited 78rpm transfers but leaves
                       // no encoding artifacts stacked on already-old audio

function ff(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}):\n${r.stderr}`);
  return r.stdout + r.stderr;
}

// ffmpeg writes everything — logs and the loudnorm measurement JSON — to
// stderr; grab the last {...} block out of the combined output.
function measure(input) {
  const out = ff(['-i', input, '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`, '-f', 'null', '-']);
  const json = out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function normalize(input, basename) {
  const src = join(AUDIO_DIR, input);
  if (!existsSync(src)) throw new Error(`no such file: ${src}`);
  const dest = join(AUDIO_DIR, `${basename}.mp3`);

  process.stdout.write(`  ${basename}: measuring… `);
  const m = measure(src);
  process.stdout.write(`in ${m.input_i} LUFS / ${m.input_tp} dBTP → `);

  const pass2 =
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;

  ff(['-y', '-i', src, '-af', pass2, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-q:a', String(MP3_QUALITY), dest]);

  const after = measure(dest);
  console.log(`out ${after.input_i} LUFS / ${after.input_tp} dBTP`);
  return dest;
}

const pairs = process.argv.slice(2);
if (!pairs.length) {
  console.error('usage: node scripts/normalize-audio.mjs "<path under public/audio>=<basename>" ...');
  process.exit(1);
}

console.log(`normalizing ${pairs.length} track(s) to ${TARGET_I} LUFS / ${TARGET_TP} dBTP\n`);
for (const pair of pairs) {
  const eq = pair.lastIndexOf('=');
  normalize(pair.slice(0, eq), pair.slice(eq + 1));
}
console.log('\ndone. Add the new "/audio/<basename>.mp3" paths to PLAYLIST in src/audio/music.js.');
