// Vite copies everything under public/ into dist/ verbatim, which sweeps up
// public/audio/src/ — the raw .wav/.flac source transfers the tracks are
// encoded from (hundreds of MB, gitignored, never requested by the game).
// Left in, they'd ship to the nginx image and Cloud Run. Strip them from
// the build output here.

import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strip = resolve(root, 'dist/audio/src');

if (existsSync(strip)) {
  rmSync(strip, { recursive: true, force: true });
  console.log('postbuild: removed dist/audio/src (source audio, not for deploy)');
}
