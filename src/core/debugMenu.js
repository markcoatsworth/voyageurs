// The ?debug waypoint picker (main.js's isDebugMode()).
//
// A dev-only overlay listing every point in the route — the put-in, every
// boss-fight approach, every village dock — so any of them can be jumped to
// without hand-editing ?start= in the address bar. It exists because the
// implicit checkpoint is the right behaviour for playing and the wrong one
// for testing: once a run has reached Kingston, every plain reload resumes
// at Kingston, and there was no way back to the early river short of
// clearing site data by hand.
//
// Built entirely in JS with inline styles, not in index.html + style.css
// like the real screens (title/pause/game-over). Two reasons: nothing here
// should be able to affect the shipped UI's layout even by accident, and
// nothing here renders at all unless ?debug is on the URL — so the game's
// own markup and stylesheet stay clean of a tool that players never see.
//
// Knows nothing about the route, the checkpoint, or navigation: main.js
// owns all of that and passes the list in. This file is just the panel.

// 'Press Start 2P' is the game's own face (style.css) — borrowed so the
// overlay looks like it belongs to this game, but at a plain readable size
// rather than the chunky in-game scale. It's a dense list of place names;
// legibility wins over the pixel look here.
const FONT = "'Press Start 2P', monospace";
const PANEL_BG = '#0f1620';
const EDGE = '#2f4458';
const TEXT = '#d8e6ef';
const DIM = '#7d94a6';
const ACCENT = '#f0b429';

// Player-facing names for the four segments, plus the note that
// lawrenceEast isn't a live destination any more (route.js) — without it,
// seven villages in the middle of the list look like ordinary stops when
// starting at one actually puts you on a dead leg.
const SEGMENT_LABELS = {
  fjord: 'SAGUENAY FJORD',
  lawrenceEast: 'SAINT LAWRENCE (EAST) — not a live leg, see route.js',
  lawrenceWest: 'SAINT LAWRENCE (WEST) — upstream',
  rideau: 'RIDEAU — Gatineau to Kingston',
};

// Colour per waypoint kind, so the boss fights are pickable at a glance in
// a list that's mostly village docks.
const KIND_COLOR = { 'put-in': ACCENT, boss: '#e2725b', village: TEXT };

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute('style', style);
  if (text != null) node.textContent = text;
  return node;
}

export function createDebugMenu({ waypoints, describeCheckpoint, onPick, onClearCheckpoint }) {
  const root = el('div', `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(4, 8, 12, 0.93);
    font-family: ${FONT}; color: ${TEXT};
    display: none; overflow-y: auto;
    padding: 16px; box-sizing: border-box;
    -webkit-font-smoothing: none;
  `);
  // Clicking the backdrop closes, same as any modal. Stopped from inside
  // the panel below so a mis-aimed click on padding doesn't dismiss it.
  root.addEventListener('click', () => hide());

  const panel = el('div', `
    max-width: 760px; margin: 0 auto;
    background: ${PANEL_BG}; border: 2px solid ${EDGE};
    padding: 14px 16px 18px;
  `);
  panel.addEventListener('click', (e) => e.stopPropagation());
  root.appendChild(panel);

  panel.appendChild(el('div', `font-size: 13px; color: ${ACCENT}; margin-bottom: 8px;`, 'DEBUG — START FROM'));
  panel.appendChild(el('div', `font-size: 8px; line-height: 1.7; color: ${DIM}; margin-bottom: 4px;`,
    'Pick a waypoint and this closes, the saved checkpoint is cleared, and the run reloads there — so it really starts from that point instead of resuming wherever you last got to.'));
  panel.appendChild(el('div', `font-size: 8px; line-height: 1.7; color: ${DIM}; margin-bottom: 12px;`,
    'Backquote (`) brings this back any time. Esc closes it. A jump lands on ?debug=play, which keeps the key working without reopening this over the game; ?debug on its own opens it, ?debug=0 turns it off.'));

  // Live checkpoint readout — the thing you're usually here to get rid of,
  // so it's worth seeing before and after.
  const checkpointLine = el('div', `font-size: 8px; line-height: 1.7; color: ${TEXT}; margin-bottom: 12px;`);
  panel.appendChild(checkpointLine);

  const list = el('div');
  panel.appendChild(list);

  const buttons = [];
  let lastSegment = null;
  for (const wp of waypoints) {
    if (wp.kind !== 'put-in' && wp.segment !== lastSegment) {
      lastSegment = wp.segment;
      list.appendChild(el('div', `
        font-size: 8px; color: ${DIM}; margin: 14px 0 6px;
        border-bottom: 1px solid ${EDGE}; padding-bottom: 4px;
      `, SEGMENT_LABELS[wp.segment] || wp.segment.toUpperCase()));
    }

    const btn = el('button', `
      display: block; width: 100%; text-align: left;
      font-family: ${FONT}; font-size: 9px; line-height: 1.5;
      color: ${KIND_COLOR[wp.kind] || TEXT};
      background: #16202c; border: 1px solid ${EDGE};
      padding: 7px 9px; margin: 3px 0; cursor: pointer;
    `);
    btn.appendChild(el('span', null, wp.label));
    // The raw numbers, because when a jump lands somewhere unexpected the
    // first question is always "what distance did it actually ask for".
    btn.appendChild(el('span', `color: ${DIM}; font-size: 7px; float: right;`,
      wp.startParam ? `?start=${wp.startParam}` : 'no ?start='));
    btn.addEventListener('mouseenter', () => { btn.style.background = '#223246'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#16202c'; });
    btn.addEventListener('click', () => onPick(wp));
    buttons.push({ waypoint: wp, element: btn });
    list.appendChild(btn);
  }

  const footer = el('div', `margin-top: 16px; border-top: 1px solid ${EDGE}; padding-top: 12px;`);
  panel.appendChild(footer);

  const closeBtn = el('button', `
    font-family: ${FONT}; font-size: 9px; color: #0f1620;
    background: ${ACCENT}; border: none; padding: 9px 12px; cursor: pointer;
    margin-right: 8px;
  `, 'CLOSE — KEEP PLAYING');
  closeBtn.addEventListener('click', () => hide());
  footer.appendChild(closeBtn);

  const clearBtn = el('button', `
    font-family: ${FONT}; font-size: 9px; color: ${TEXT};
    background: #16202c; border: 1px solid ${EDGE}; padding: 9px 12px; cursor: pointer;
  `, 'CLEAR SAVED CHECKPOINT');
  // Clears without reloading — for when you want the *next* plain reload to
  // start from the put-in, rather than jumping somewhere right now.
  clearBtn.addEventListener('click', () => {
    onClearCheckpoint();
    refresh();
  });
  footer.appendChild(clearBtn);

  function refresh() {
    checkpointLine.textContent = `Saved checkpoint: ${describeCheckpoint() || 'none — a plain reload starts at the put-in'}`;
  }

  // Open state is its own flag rather than being read back off
  // root.style.display. Reading an inline style back to decide what to do
  // next means the DOM is the state, which is both one indirection too many
  // and untestable headlessly (test/dom-shim.mjs's style object returns ''
  // for every property, so isOpen() was always true there).
  let open = false;
  function show() {
    refresh();
    open = true;
    root.style.display = 'block';
  }
  function hide() {
    open = false;
    root.style.display = 'none';
  }

  return {
    element: root,
    show,
    hide,
    isOpen() { return open; },
    toggle() {
      if (open) hide(); else show();
      return open;
    },
    // Exported for the smoke test: the picker is a list of buttons and the
    // thing worth checking is that each one is wired to the waypoint it
    // names, which needs a handle on the buttons themselves.
    debugButtons() { return buttons; },
  };
}
