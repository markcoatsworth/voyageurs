// Vite copies everything under public/ into dist/ verbatim, which sweeps up
// public/audio/src/ — the raw .wav/.flac source transfers the tracks are
// encoded from (hundreds of MB, gitignored, never requested by the game).
// Left in, they'd ship to the nginx image and Cloud Run. Strip them from
// the build output here.

import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strip = resolve(root, 'dist/audio/src');

if (existsSync(strip)) {
  rmSync(strip, { recursive: true, force: true });
  console.log('postbuild: removed dist/audio/src (source audio, not for deploy)');
}

// Stamp dist/index.html with the build number + real build time + git SHA,
// replacing the __BUILD_STAMP__ placeholder. This is the corner badge's
// whole point: a deployed page that still shows an old stamp means a stale
// index.html is being served (browser heuristic cache, a proxy, an
// unreloaded tab) — not that the deploy didn't happen.
const indexPath = resolve(root, 'dist/index.html');
if (existsSync(indexPath)) {
  const now = new Date();
  const utc = now.toISOString().slice(0, 16).replace('T', ' ');
  // build-number.txt (repo root) — a plain incrementing counter, bumped by
  // scripts/bump-build.mjs and committed *before* the deploy that should
  // show it (see that script's own comment for why it can't just increment
  // itself here: this postbuild step runs inside the same ephemeral build
  // container the increment would be lost in). Read-only here — never
  // written back — so a build run without bumping first just repeats the
  // last committed number instead of silently drifting.
  const buildNumberPath = resolve(root, 'build-number.txt');
  const buildNumber = existsSync(buildNumberPath) ? readFileSync(buildNumberPath, 'utf8').trim() : null;
  // git SHA when available (local builds). Cloud Run's source build has no
  // .git — the timestamp alone still changes on every deploy, which is all
  // the badge needs to prove freshness. A SHA can also be passed in via the
  // BUILD_SHA env var (Docker build arg) if we ever want it there too.
  let sha = process.env.BUILD_SHA || '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
      if (execSync('git status --porcelain', { cwd: root }).toString().trim()) sha += '+';
    } catch { /* not a git checkout — time alone is fine */ }
  }
  const parts = [buildNumber ? `#${buildNumber}` : null, `${utc} UTC`, sha || null].filter(Boolean);
  const stamp = parts.join(' · ');
  const html = readFileSync(indexPath, 'utf8');
  if (html.includes('__BUILD_STAMP__')) {
    writeFileSync(indexPath, html.replace('__BUILD_STAMP__', stamp));
    console.log(`postbuild: stamped build badge — ${stamp}`);
  } else {
    console.warn('postbuild: __BUILD_STAMP__ placeholder not found in dist/index.html');
  }
}
