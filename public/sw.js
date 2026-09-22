// Service worker — offline play. Asked for as "I'm about to go on a
// camping trip where I'll be totally offline, but I would love to get the
// game cached on my phone." Without this nothing works offline by
// construction: nginx serves index.html no-store (so deploys always land)
// and the audio no-cache (must revalidate), so an offline browser has
// nothing to open. This keeps three caches:
//
//   SHELL  — index.html + the build's hashed /assets/ files, precached at
//            install. Named per build (BUILD below), old ones deleted on
//            activate, so a new deploy swaps the whole shell atomically.
//   AUDIO  — the 26 tracks (~88 MB). Not precached at install (an install
//            has to be atomic and quick; 88 MB in it would fail on a bad
//            connection and take the shell down with it) but pulled in
//            right after, automatically: main.js posts 'cache-audio' the
//            moment the worker is ready — no button, no prompt ("I want
//            that to just happen automatically without user input") —
//            unless the browser reports Data Saver on. Each track a normal
//            play fetches is stored as a side effect too. Kept across
//            builds (versioned by hand, not by BUILD) since the files
//            themselves never change — see nginx.conf's /audio/ comment.
//   FONTS  — Google Fonts' CSS + the Press Start 2P woff, cached on the
//            first online visit, cache-first after. Opaque/CORS responses
//            both fine to store.
//
// Navigations are network-first (a deploy lands the moment you're online —
// the no-store intent is preserved) with the cached index.html as the
// offline fallback. Assets are cache-first (immutable). Audio is
// cache-first with Range support: <audio> elements ask for byte ranges
// (Safari insists), and a cached full file is sliced to answer them —
// which is also why a network Range response (206) is never stored as the
// file: only full 200s go into the cache.
//
// The three double-underscored placeholders just below are filled in by
// scripts/postbuild.mjs from what vite actually emitted (and must not be
// spelled out anywhere else in this file — postbuild replaces every
// occurrence); this file is only registered from a production build
// (main.js checks import.meta.env.PROD) so the raw template never runs
// against the dev server.

const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const AUDIO = __AUDIO__;

const SHELL_CACHE = `voyageurs-shell-${BUILD}`;
const AUDIO_CACHE = 'voyageurs-audio-v1';
const FONT_CACHE = 'voyageurs-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll is atomic — any one failure fails the install, which is what
    // we want: a half-cached shell is worse than none.
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('voyageurs-shell-') && n !== SHELL_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Answer a Range request out of a cached full response — the file is read
// fully into memory to slice (each track is a few MB; fine).
async function withRange(cached, request) {
  const range = request.headers.get('range');
  if (!range) return cached;
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return cached;
  const buf = await cached.arrayBuffer();
  const total = buf.byteLength;
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

// Full-file fetch into the audio cache, deduped so a track that's playing
// (and being range-requested repeatedly) is only pulled once.
const inflight = new Map();
function storeAudio(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    try {
      const cache = await caches.open(AUDIO_CACHE);
      if (await cache.match(url)) return true;
      const res = await fetch(url, { cache: 'no-store' }); // a full 200, never a range
      if (!res.ok || res.status !== 200) return false;
      await cache.put(url, res);
      return true;
    } catch {
      return false;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })());
    return;
  }

  if (sameOrigin && url.pathname.startsWith('/audio/')) {
    event.respondWith((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      const hit = await cache.match(url.pathname);
      if (hit) return withRange(hit, request);
      // Not stored yet: serve the network's own answer to this request
      // (range and all) and pull the full file in alongside for next time.
      storeAudio(url.pathname);
      return fetch(request);
    })());
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  if (sameOrigin) {
    // Everything else same-origin (favicon, manifest, icons): network with
    // the shell cache as the offline fallback.
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
  }
});

// Page messages: 'cache-audio' pulls every track not yet stored, reporting
// progress back to the asking client; 'audio-status' just reports the
// count. Both answer with {type:'audio-status', done, total, complete}.
async function audioStatus() {
  const cache = await caches.open(AUDIO_CACHE);
  let done = 0;
  for (const url of AUDIO) if (await cache.match(url)) done++;
  return { type: 'audio-status', done, total: AUDIO.length, complete: done === AUDIO.length };
}

self.addEventListener('message', (event) => {
  const client = event.source;
  const reply = (msg) => { try { client && client.postMessage(msg); } catch { /* client gone */ } };
  if (!event.data || typeof event.data.type !== 'string') return;
  if (event.data.type === 'audio-status') {
    event.waitUntil(audioStatus().then(reply));
  } else if (event.data.type === 'cache-audio') {
    // waitUntil keeps the worker alive for the download even if the page
    // goes away; a browser that caps that (Chrome, ~5 min) just leaves the
    // rest for the next visit, which re-posts this and skips what's
    // already stored. A few at a time: one-by-one was slow over 26 files,
    // and more than a handful just contends with the game's own audio.
    event.waitUntil((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      let done = 0;
      let failed = 0;
      const todo = [];
      for (const url of AUDIO) {
        if (await cache.match(url)) done++; else todo.push(url);
      }
      const status = () => reply({ type: 'audio-status', done, total: AUDIO.length, complete: done === AUDIO.length, failed });
      status();
      const CONCURRENCY = 3;
      let next = 0;
      const lane = async () => {
        while (next < todo.length) {
          const url = todo[next++];
          const ok = await storeAudio(url);
          if (ok) done++; else failed++;
          status();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, lane));
    })());
  }
});
