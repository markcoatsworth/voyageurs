// Vite copies everything under public/ into dist/ verbatim, which sweeps up
// public/audio/src/ — the raw .wav/.flac source transfers the tracks are
// encoded from (hundreds of MB, gitignored, never requested by the game).
// Left in, they'd ship to the nginx image and Cloud Run. Strip them from
// the build output here.

import { rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strip = resolve(root, 'dist/audio/src');

if (existsSync(strip)) {
  rmSync(strip, { recursive: true, force: true });
  console.log('postbuild: removed dist/audio/src (source audio, not for deploy)');
}

// Stamp dist/index.html with the version + real build time + git SHA,
// replacing the __BUILD_STAMP__ placeholder. This is the corner badge's
// whole point: a deployed page that still shows an old stamp means a stale
// index.html is being served (browser heuristic cache, a proxy, an
// unreloaded tab) — not that the deploy didn't happen.
const indexPath = resolve(root, 'dist/index.html');
if (existsSync(indexPath)) {
  const now = new Date();
  const utc = now.toISOString().slice(0, 16).replace('T', ' ');
  // package.json's own "version" — kept as 0.1.<build number> by
  // scripts/bump-build.mjs, which also increments build-number.txt and
  // must run (and get committed) *before* the deploy that should show the
  // new number (see that script's own comment: this postbuild step runs
  // inside the same ephemeral build container an increment made here would
  // be lost in). Read-only here — never written back — so a build run
  // without bumping first just repeats the last committed version instead
  // of silently drifting. Deliberately a low major.minor (0.1.x): this is
  // a hobby project with no real expectation of reaching "1.0", so the
  // version exists to distinguish builds, not to promise semver meaning.
  const pkgPath = resolve(root, 'package.json');
  let version = null;
  try {
    version = JSON.parse(readFileSync(pkgPath, 'utf8')).version || null;
  } catch { /* package.json missing/unreadable — badge just omits the version */ }
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
  const parts = [version ? `v${version}` : null, `${utc} UTC`, sha || null].filter(Boolean);
  const stamp = parts.join(' · ');
  const html = readFileSync(indexPath, 'utf8');
  if (html.includes('__BUILD_STAMP__')) {
    writeFileSync(indexPath, html.replace('__BUILD_STAMP__', stamp));
    console.log(`postbuild: stamped build badge — ${stamp}`);
  } else {
    console.warn('postbuild: __BUILD_STAMP__ placeholder not found in dist/index.html');
  }
}

// Fill in the service worker (public/sw.js — copied verbatim into dist/ by
// vite like everything else under public/) with what this build actually
// emitted: the hashed /assets/ files to precache, the audio list it pulls
// in on its own after install, and a build id that names the shell cache
// so each deploy replaces the last one's cleanly. Only ever read in a
// production build — main.js registers /sw.js under import.meta.env.PROD
// alone — so the unfilled template never runs against the dev server.
const swPath = resolve(root, 'dist/sw.js');
if (existsSync(swPath)) {
  const list = (dir, filter) => {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs).filter(filter).sort();
  };
  const assets = list('dist/assets', () => true).map((f) => `/assets/${f}`);
  const audio = list('dist/audio', (f) => f.endsWith('.mp3')).map((f) => `/audio/${f}`);
  const icons = list('dist/icons', () => true).map((f) => `/icons/${f}`);
  const precache = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', ...icons, ...assets];
  let build = String(Date.now());
  try {
    const v = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
    if (v) build = `${v}-${build}`;
  } catch { /* timestamp alone still changes per build */ }
  const sw = readFileSync(swPath, 'utf8')
    .replaceAll('__BUILD__', build)
    .replaceAll('__PRECACHE__', JSON.stringify(precache))
    .replaceAll('__AUDIO__', JSON.stringify(audio));
  if (sw.includes('__PRECACHE__') || sw.includes('__AUDIO__')) {
    console.warn('postbuild: sw.js placeholders not all replaced');
  }
  writeFileSync(swPath, sw);
  console.log(`postbuild: filled sw.js — ${precache.length} shell files, ${audio.length} audio tracks, build ${build}`);
}
