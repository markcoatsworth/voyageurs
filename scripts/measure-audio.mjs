// Prints the integrated loudness (LUFS) and true peak (dBTP) of every
// track in public/audio/, so you can see at a glance whether the catalog
// is level. New tracks should land near -21 LUFS — see
// scripts/normalize-audio.mjs.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ffmpeg = (await import('ffmpeg-static')).default;
const AUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio');

function measure(file) {
  const r = spawnSync(
    ffmpeg,
    ['-hide_banner', '-i', join(AUDIO_DIR, file), '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const out = r.stdout + r.stderr;
  const m = JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
  return { i: parseFloat(m.input_i), tp: parseFloat(m.input_tp) };
}

const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.mp3')).sort();
let min = Infinity;
let max = -Infinity;
for (const f of files) {
  const { i, tp } = measure(f);
  min = Math.min(min, i);
  max = Math.max(max, i);
  console.log(`${f.padEnd(32)}  ${i.toFixed(2).padStart(7)} LUFS   ${tp.toFixed(2).padStart(7)} dBTP`);
}
console.log(`\nspread: ${(max - min).toFixed(1)} LU  (${min.toFixed(1)} … ${max.toFixed(1)})`);
