// Keyboard and pointer input. Held keys give a steering vector; one-shot
// presses (confirm, pause, dash, mute, upgrade picks) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse position is kept in canvas pixels and turned
// into field coordinates by the renderer.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK_1 = 16;
export const ACTION_PICK_2 = 32;
export const ACTION_PICK_3 = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight']);
const MUTE = new Set(['KeyM']);
const PICK = { Digit1: ACTION_PICK_1, Numpad1: ACTION_PICK_1, Digit2: ACTION_PICK_2, Numpad2: ACTION_PICK_2, Digit3: ACTION_PICK_3, Numpad3: ACTION_PICK_3 };

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseSeen = false;
  let clickX = -1;
  let clickY = -1;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICK[event.code]) {
      if (!event.repeat) actions |= PICK[event.code];
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
    if (event.button === 2) {
      actions |= ACTION_DASH;
    } else {
      mouseDown = true;
      clickX = mouseX;
      clickY = mouseY;
      actions |= ACTION_CONFIRM;
    }
    event.preventDefault();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 2) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function axis(neg, pos) {
    let value = 0;
    for (const code of neg) if (keys.has(code)) value -= 1;
    for (const code of pos) if (keys.has(code)) value += 1;
    return value;
  }

  return {
    /** Normalised steering vector {x, y} from WASD / arrow keys. */
    moveVector() {
      const x = axis(LEFT, RIGHT);
      const y = axis(UP, DOWN);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** Hold-to-fire: mouse button held, or Space held. */
    firing() {
      return mouseDown || keys.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, seen: mouseSeen };
    },
    /** The last click position in canvas pixels, or null when none is queued. */
    takeClick() {
      if (clickX < 0) return null;
      const point = { x: clickX, y: clickY };
      clickX = -1;
      clickY = -1;
      return point;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
