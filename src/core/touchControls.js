// The on-screen steer pad — four direction keys laid out in an inverted-T
// (↑ on top, ← ↓ → across the bottom), the same shape the desktop "how to
// play" cue already uses. On a touch device each key is a real tap-and-hold
// button: press it and its direction latches on, lift and it latches off —
// exactly like a keyboard key, and with none of a thumb-stick's "drag far
// enough past a threshold" lag. It drives the same left/right/up/down
// booleans the keyboard does (input.js), so nothing downstream knows or
// cares which one moved the canoe.
//
// It used to be a round analog-ish thumb-stick. For the Diable fight's
// fast lateral dodging that wasn't responsive enough on a phone — a stick
// needs a deliberate push-and-hold, where the fight wants instant taps —
// so it's discrete buttons now.

export function isTouchPrimary() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

const DIRS = ['up', 'down', 'left', 'right'];

export function createTouchControls(input) {
  const pad = document.getElementById('steer-pad');
  const arrows = pad && {
    up: pad.querySelector('.steer-up'),
    down: pad.querySelector('.steer-down'),
    left: pad.querySelector('.steer-left'),
    right: pad.querySelector('.steer-right'),
  };
  // Bail if the markup isn't there (the headless smoke test's DOM shim has
  // no real querySelector) — nothing to wire up anyway.
  if (!pad || !arrows || !arrows.up) return;

  // A leftover from the thumb-stick days; discrete buttons don't use it, and
  // CSS hides it, but clear any stale inline transform just in case.
  const knob = document.getElementById('steer-knob');
  if (knob) knob.style.transform = '';

  // Reference-counted per direction so two pointers on the same key (or a
  // key held by touch while the same arrow is also lit by the keyboard)
  // can't turn each other off — the direction is "on" while anything holds
  // it. pointerId -> direction records which key a given finger pressed, so
  // a pointerup anywhere on the page releases the right one even if the
  // finger slid off the key first.
  const counts = { up: 0, down: 0, left: 0, right: 0 };
  const heldBy = new Map();

  function sync(dir) {
    const on = counts[dir] > 0;
    input.state[dir] = on;
    arrows[dir].classList.toggle('active', on);
  }

  function press(pointerId, dir) {
    if (heldBy.has(pointerId)) return; // already counted (e.g. a stray repeat)
    heldBy.set(pointerId, dir);
    counts[dir] += 1;
    sync(dir);
  }

  function release(pointerId) {
    const dir = heldBy.get(pointerId);
    if (dir === undefined) return;
    heldBy.delete(pointerId);
    counts[dir] = Math.max(0, counts[dir] - 1);
    sync(dir);
  }

  for (const dir of DIRS) {
    arrows[dir].addEventListener('pointerdown', (e) => {
      press(e.pointerId, dir);
      // Best-effort: keeps move/up routed here if the finger drifts off the
      // key without lifting. A failure is harmless — the document-level
      // pointerup below still catches the release.
      try {
        arrows[dir].setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
    });
  }

  // Release on lift/cancel wherever it happens — captured to this key or not.
  document.addEventListener('pointerup', (e) => release(e.pointerId));
  document.addEventListener('pointercancel', (e) => release(e.pointerId));
  // A window blur (app switch, notification) can eat the pointerup entirely;
  // drop everything so a direction doesn't stick on.
  window.addEventListener('blur', () => {
    for (const id of [...heldBy.keys()]) release(id);
  });
}
