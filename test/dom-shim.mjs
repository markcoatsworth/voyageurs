// Just enough of a browser (DOM, canvas 2D, WebGL-absent, Audio, rAF) for
// the game's modules to load and run in plain node. Importing this module
// installs the globals as a side effect — list it as the FIRST import in a
// test file, before anything under src/.
//
// This is deliberately dumb: every canvas/context method is a no-op, every
// element is the same shape. The point isn't to render anything, it's to
// let real game logic — module load, `new Game()`, `game.update()` — run
// end to end so a broken reference throws here instead of in a browser.

const noop = () => {};

function ctxProxy() {
  return new Proxy(
    { canvas: { width: 320, height: 220 } },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'measureText') return () => ({ width: 8 });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
          return () => ({ addColorStop: noop });
        if (prop === 'createPattern') return () => ({});
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
}

function makeElement(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: [],
    dataset: {},
    width: 320,
    height: 220,
    style: new Proxy({}, {
      get: (_t, p) =>
        (p === 'setProperty' || p === 'removeProperty' ? noop
          : p === 'getPropertyValue' ? () => ''
          : ''),
      set: () => true,
    }),
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, force) {
        const on = force === undefined ? !this._s.has(c) : force;
        on ? this._s.add(c) : this._s.delete(c);
        return on;
      },
      contains(c) { return this._s.has(c); },
    },
    textContent: '',
    innerHTML: '',
    appendChild(child) { el.children.push(child); return child; },
    append(...kids) { el.children.push(...kids); },
    prepend(...kids) { el.children.unshift(...kids); },
    replaceChildren(...kids) { el.children = kids; },
    insertBefore(child) { el.children.push(child); return child; },
    removeChild(child) {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      return child;
    },
    remove: noop,
    cloneNode: () => makeElement(tag),
    setAttribute: noop,
    getAttribute: () => null,
    removeAttribute: noop,
    hasAttribute: () => false,
    setAttributeNS: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent(evt) {
      (listeners[evt.type] || []).forEach((f) => f(evt));
      return true;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 320, bottom: 220, width: 320, height: 220 }),
    getContext: (kind) => (kind === '2d' ? ctxProxy() : null),
    focus: noop,
    click: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return el;
}

const byId = new Map();

const documentShim = {
  getElementById(id) {
    if (!byId.has(id)) byId.set(id, makeElement('div'));
    return byId.get(id);
  },
  createElement: (tag) => makeElement(tag),
  createElementNS: (_ns, tag) => makeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  body: makeElement('body'),
  documentElement: makeElement('html'),
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve(), add: noop },
};

// One fully chainable fake node stands in for every Web Audio node and
// AudioParam: any method call returns the node again (so
// `osc.connect(filter).connect(gain).connect(ctx.destination)` works), and
// any property is itself another such node. sfx.js/music.js build real
// graphs against this; nothing is heard, nothing throws.
const audioNode = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === 'then') return undefined; // must not look like a thenable
    if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
    return audioNode; // callable AND further-drillable — osc.frequency.setValueAtTime(...)
  },
  set() { return true; },
  apply() { return audioNode; },
  construct() { return audioNode; },
});

// A real function (not an arrow) so `new AudioContext()` works.
function audioCtxShim() {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'currentTime') return 0;
        if (prop === 'sampleRate') return 44100;
        if (prop === 'state') return 'running';
        if (prop === 'destination') return audioNode;
        if (prop === 'decodeAudioData') return () => Promise.reject(new Error('no audio in shim'));
        if (prop === 'resume' || prop === 'suspend' || prop === 'close') return () => Promise.resolve();
        return () => audioNode;
      },
    }
  );
}

// A real (if in-memory, non-persistent) Storage implementation, not a
// no-op — code that round-trips a checkpoint through localStorage needs
// getItem() to actually return what setItem() wrote, in the same node
// process, the same way a real browser's Storage does across reloads of
// the same origin. Exposed on windowShim (main.js reads window.localStorage,
// matching every other browser global it touches) and shared by every test
// in a run unless a test clears it — same lifetime a real tab's storage has
// within one session.
function makeLocalStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

const windowShim = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  location: { search: '', href: 'http://localhost/' },
  addEventListener: noop,
  removeEventListener: noop,
  requestAnimationFrame: noop,
  cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  AudioContext: audioCtxShim,
  webkitAudioContext: audioCtxShim,
  localStorage: makeLocalStorage(),
};

function install() {
  globalThis.window = windowShim;
  globalThis.document = documentShim;
  globalThis.requestAnimationFrame = noop;
  globalThis.cancelAnimationFrame = noop;
  globalThis.AudioContext = audioCtxShim;
  globalThis.webkitAudioContext = audioCtxShim;
  globalThis.matchMedia = windowShim.matchMedia;
  globalThis.getComputedStyle = windowShim.getComputedStyle;
  globalThis.Image = function () { return makeElement('img'); };
  globalThis.Audio = function () {
    const listeners = {};
    return {
      play: () => Promise.resolve(),
      pause: noop,
      // A real element fires readiness events asynchronously after a
      // source change; queued the same way here so code that waits for
      // 'canplay' rather than calling play() immediately (music.js's
      // playSpecial) still runs end to end in this shim instead of
      // depending entirely on its own fallback timer.
      load() {
        queueMicrotask(() => (listeners.canplay || []).forEach((fn) => fn()));
      },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
      // Not part of the real HTMLMediaElement API surface — a test-only
      // hook so a test can simulate a track finishing on its own (e.g.
      // music.js's Kingston playlist advancing from one track to the next)
      // without a real timer or an actual audio file playing out.
      dispatchEvent(evt) { (listeners[evt.type] || []).forEach((fn) => fn(evt)); },
      canPlayType: () => '',
      volume: 1,
      currentTime: 0,
      loop: false,
    };
  };
  globalThis.HTMLElement = function () {};
  try { globalThis.navigator = windowShim.navigator = { maxTouchPoints: 0, userAgent: 'node-smoke' }; } catch { /* read-only in some node builds — fine */ }
}

install();

export { makeElement, byId, windowShim };
