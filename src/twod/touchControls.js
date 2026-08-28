// On-screen arrow controls for touch devices, driving the exact same
// left/right/up/down booleans the keyboard does (see utils/input.js) —
// every system that reads input (river steering/paddling, village walking)
// already just consumes that shared state object, so the D-pad doesn't
// need game.js or villageScene.js to know it exists at all.
//
// Four independent buttons rather than a drag stick: a first-time player
// wasn't sure what an unlabeled circular knob was supposed to do, and
// discrete up/left/right/down arrows read unambiguously. Each button
// tracks its own pointer, so pressing two at once (e.g. up+right) works
// for diagonal movement exactly like holding two keys does.
const DIRECTIONS = [
  { id: 'dpad-up', key: 'up' },
  { id: 'dpad-down', key: 'down' },
  { id: 'dpad-left', key: 'left' },
  { id: 'dpad-right', key: 'right' },
];

export function isTouchPrimary() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function createTouchControls(input) {
  for (const { id, key } of DIRECTIONS) {
    const el = document.getElementById(id);
    if (!el) continue;

    let activePointerId = null;

    el.addEventListener('pointerdown', (e) => {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      input.state[key] = true;
      // Driven explicitly rather than relying on CSS :active — that only
      // reliably fires for real, browser-initiated pointer input (and has
      // its own long-standing quirks on tap on iOS Safari), not something
      // this can assume for every touch browser it'll run on.
      el.classList.add('pressed');
      // Best-effort — keeps the button "pressed" if the finger drifts
      // slightly off it without lifting, same reasoning as the dock/water
      // pointer handling elsewhere: this must not gate the state change
      // above, since a capture failure here is unrelated to whether the
      // press itself is valid.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
    });

    const release = (e) => {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      input.state[key] = false;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }
}
