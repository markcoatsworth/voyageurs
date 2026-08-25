const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

export class Input {
  constructor() {
    this.state = { left: false, right: false, up: false, down: false };
    this._onKeyDown = (e) => {
      const key = KEY_MAP[e.code];
      if (key) {
        this.state[key] = true;
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      const key = KEY_MAP[e.code];
      if (key) {
        this.state[key] = false;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
