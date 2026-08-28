// A virtual joystick for touch devices that drives the exact same
// left/right/up/down booleans the keyboard does (see utils/input.js) —
// every system that reads input (river steering/paddling, village walking)
// already just consumes that shared state object, so the stick doesn't
// need game.js or villageScene.js to know it exists at all.
//
// It's intentionally digital, not analog: the knob's offset only decides
// which of the four booleans are true past a deadzone, mirroring a key
// being either down or up rather than introducing a proportional speed the
// rest of the game was never tuned for.
const DEADZONE = 0.35;

export function createTouchControls(input) {
  const base = document.getElementById('touch-joystick');
  const knob = document.getElementById('touch-joystick-knob');
  if (!base || !knob) return;

  let activePointerId = null;
  let centerX = 0;
  let centerY = 0;
  let radius = 1;

  function clearDirections() {
    input.state.left = false;
    input.state.right = false;
    input.state.up = false;
    input.state.down = false;
  }

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function resetKnob() {
    knob.style.transform = '';
  }

  function updateFromPoint(clientX, clientY) {
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    setKnob(dx, dy);

    const nx = dx / radius;
    const ny = dy / radius;
    input.state.left = nx < -DEADZONE;
    input.state.right = nx > DEADZONE;
    input.state.up = ny < -DEADZONE;
    input.state.down = ny > DEADZONE;
  }

  base.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    const rect = base.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    radius = rect.width / 2;
    updateFromPoint(e.clientX, e.clientY);
    // Capture is best-effort (keeps tracking the drag if the finger slides
    // off the base) — it must not gate the position setup above, or a
    // failure here would leave centerX/centerY stuck at their initial 0,0
    // and every subsequent move computed from the wrong origin.
    try {
      base.setPointerCapture(e.pointerId);
    } catch {
      // ignore — worst case the drag stops tracking if the finger leaves
      // the base's bounds, which is still a reasonable fallback
    }
    e.preventDefault();
  });

  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    updateFromPoint(e.clientX, e.clientY);
    e.preventDefault();
  });

  function release(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    resetKnob();
    clearDirections();
  }

  base.addEventListener('pointerup', release);
  base.addEventListener('pointercancel', release);
}
