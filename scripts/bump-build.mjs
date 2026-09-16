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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'build-number.txt');

const current = existsSync(path) ? parseInt(readFileSync(path, 'utf8').trim(), 10) || 0 : 0;
const next = current + 1;
writeFileSync(path, `${next}\n`);
console.log(`build-number.txt: ${current} -> ${next}`);
