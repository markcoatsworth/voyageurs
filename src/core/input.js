const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

const WEAPON_KEYS = {
  KeyZ: 'pistol',
  KeyX: 'musket',
  KeyC: 'blunderbuss',
};

export class Input {
  constructor() {
    this.state = { left: false, right: false, up: false, down: false };
    this.onWeaponFire = null; // Callback for weapon firing

    // Get arrow elements for visual feedback
    this.arrows = {
      up: document.querySelector('.steer-up'),
      down: document.querySelector('.steer-down'),
      left: document.querySelector('.steer-left'),
      right: document.querySelector('.steer-right'),
    };

    // On-screen keycap per weapon key, lit while the key is held so a
    // keypress and a tap of the button look the same (see style.css's
    // .weapon-key.active). Only the pistol's Z button exists so far.
    this.weaponKeyEls = {
      KeyZ: document.getElementById('fire-z'),
    };

    this._onKeyDown = (e) => {
      const key = KEY_MAP[e.code];
      if (key) {
        this.state[key] = true;
        // Light up the arrow
        if (this.arrows[key]) this.arrows[key].classList.add('active');
        e.preventDefault();
      }

      // Handle weapon keys
      const weapon = WEAPON_KEYS[e.code];
      if (weapon) {
        if (this.onWeaponFire) this.onWeaponFire(weapon);
        if (this.weaponKeyEls[e.code]) this.weaponKeyEls[e.code].classList.add('active');
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      const key = KEY_MAP[e.code];
      if (key) {
        this.state[key] = false;
        // Turn off the arrow
        if (this.arrows[key]) this.arrows[key].classList.remove('active');
        e.preventDefault();
      }
      if (this.weaponKeyEls[e.code]) {
        this.weaponKeyEls[e.code].classList.remove('active');
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
