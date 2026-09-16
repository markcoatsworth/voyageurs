// Increments build-number.txt by one and writes it back. Run this — and
// commit the result — before a deploy you want the on-page build badge
// (index.html's __BUILD_STAMP__, stamped by postbuild.mjs) to show as a new
// build number.
//
// Deliberately NOT run automatically as part of `npm run build`'s own
// prebuild/postbuild steps: `gcloud run deploy --source .` uploads the
// *local* working directory as the build context and builds inside an
// ephemeral Cloud Build container — anything that container increments and
// writes to its own copy of build-number.txt never makes it back to this
// checkout or to git, so the count would silently reset every deploy
// instead of accumulating. Bumping it here, as a distinct step whose
// result gets committed before the deploy, is what makes it actually
// persist.
// Also keeps package.json's own "version" field as 0.1.<build number> — a
// deliberately low, honest major.minor (see this repo's own commit history/
// the conversation that introduced this: a solo hobby project with no
// expectation of ever reaching a "1.0" release, versioned by build count
// rather than by any real semver meaning) — so package.json's version and
// the on-page badge (postbuild.mjs reads package.json, not this file,
// for the version string) never drift apart.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'build-number.txt');

const current = existsSync(path) ? parseInt(readFileSync(path, 'utf8').trim(), 10) || 0 : 0;
const next = current + 1;
writeFileSync(path, `${next}\n`);

const pkgPath = resolve(root, 'package.json');
const pkgText = readFileSync(pkgPath, 'utf8');
const nextVersion = `0.1.${next}`;
const updated = pkgText.replace(/"version":\s*"[^"]*"/, `"version": "${nextVersion}"`);
writeFileSync(pkgPath, updated);

console.log(`build-number.txt: ${current} -> ${next}`);
console.log(`package.json version -> ${nextVersion}`);
