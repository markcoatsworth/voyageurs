// The on-screen steer pad — a round control marked with up/left/right/down
// arrows that behaves like a thumb-stick: rest a finger (or the mouse)
// anywhere on it and a knob follows, and the direction from the pad's
// centre to the knob decides which of the arrows are "pushed". It drives
// the exact same left/right/up/down booleans the keyboard does (see
// input.js) — every system that reads input (river steering/paddling,
// village walking) just consumes that shared state object, so nothing in
// game.js or villageScene.js needs to know this exists.
//
// Why a stick and not the four separate buttons it used to be: for a
// non-gamer, "push the way you want to go" needs no aiming, and diagonals
// (up+left to steer while paddling) come for free. The arrows stay drawn
// and light up as you push, so it still reads unambiguously as a
// directional control rather than a mystery knob.

// Fraction of the pad's radius near the centre that reads as neutral.
const DEAD_ZONE = 0.28;
// How aligned the push must be with an axis for that arrow to count, as a
// share of the (normalised) push direction — generous, so a slightly-off
// push still registers cleanly and a real diagonal lights both arrows.
const AXIS_SHARE = 0.34;
// How far (px) the knob travels from centre at a full push — kept short of
// the rim so the knob never covers the arrows (pad radius ~71, knob 24).
const KNOB_RANGE = 26;

export function isTouchPrimary() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function createTouchControls(input) {
  const pad = document.getElementById('steer-pad');
  const knob = document.getElementById('steer-knob');
  const arrows = pad && {
    up: pad.querySelector('.steer-up'),
    down: pad.querySelector('.steer-down'),
    left: pad.querySelector('.steer-left'),
    right: pad.querySelector('.steer-right'),
  };
  // Bail if the pad markup isn't there (e.g. the headless smoke test's DOM
  // shim, which has no querySelector) — there's nothing to drive anyway.
  if (!pad || !knob || !arrows || !arrows.up) return;

  let activePointerId = null;

  // nx/ny: pointer position relative to the pad centre, in units of the pad
  // radius (so the rim is magnitude ~1). ny positive = downward on screen.
  function apply(nx, ny) {
    const mag = Math.hypot(nx, ny) || 0;
    let up = false, down = false, left = false, right = false;
    if (mag > DEAD_ZONE) {
      const ux = nx / mag;
      const uy = ny / mag;
      up = -uy > AXIS_SHARE;
      down = uy > AXIS_SHARE;
      left = -ux > AXIS_SHARE;
      right = ux > AXIS_SHARE;
    }
    input.state.up = up;
    input.state.down = down;
    input.state.left = left;
    input.state.right = right;
    arrows.up.classList.toggle('active', up);
    arrows.down.classList.toggle('active', down);
    arrows.left.classList.toggle('active', left);
    arrows.right.classList.toggle('active', right);

    const k = Math.min(1, mag);
    const kx = mag > 0 ? (nx / mag) * k * KNOB_RANGE : 0;
    const ky = mag > 0 ? (ny / mag) * k * KNOB_RANGE : 0;
    knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
  }

  function readEvent(e) {
    const r = pad.getBoundingClientRect();
    const half = r.width / 2;
    return {
      nx: (e.clientX - (r.left + half)) / half,
      ny: (e.clientY - (r.top + half)) / half,
    };
  }

  pad.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    // Best-effort capture so the push keeps tracking if the finger drifts
    // off the pad without lifting — a failure here is unrelated to whether
    // the press is valid, same reasoning as the dock/water pointer handling
    // elsewhere, so it must not gate apply() below.
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const { nx, ny } = readEvent(e);
    apply(nx, ny);
    e.preventDefault();
  });

  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    const { nx, ny } = readEvent(e);
    apply(nx, ny);
    e.preventDefault();
  });

  const release = (e) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    apply(0, 0);
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
}
