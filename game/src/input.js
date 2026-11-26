// Keyboard and mouse input. Keys are read as a held set every frame; single-press
// actions (flaps, gear, pause, camera, mute, restart) are queued as one-shot actions
// the game loop consumes. Mouse drag orbits the chase camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLAPS = 4;
export const ACTION_GEAR = 8;
export const ACTION_CAMERA = 16;
export const ACTION_MUTE = 32;
export const ACTION_RESTART = 64;
export const ACTION_BRAKE = 128;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM, Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE, Escape: ACTION_PAUSE,
  KeyF: ACTION_FLAPS, KeyG: ACTION_GEAR,
  KeyC: ACTION_CAMERA, KeyM: ACTION_MUTE, KeyR: ACTION_RESTART,
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let orbitDX = 0; let orbitDY = 0;
  let dragging = false; let lastX = 0; let lastY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined) {
      actions |= action;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      held.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add('Shift');
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') held.add('Control');
    if (event.code === 'KeyB') held.add('KeyB');
    if (event.code === 'KeyW' || event.code === 'KeyS') held.add(event.code);
  }
  function onKeyUp(event) {
    held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.delete('Shift');
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') held.delete('Control');
  }
  function onPointerDown(event) {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
  }
  function onPointerMove(event) {
    if (!dragging) return;
    orbitDX += event.clientX - lastX;
    orbitDY += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
  }
  function onPointerUp() { dragging = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  return {
    /** Pitch/roll in [-1, 1], throttle 0..1, flaps target, gear toggle, brake held. */
    read(throttle, flaps, gearDown) {
      let pitch = 0; let roll = 0;
      if (held.has('ArrowUp')) pitch -= 1;
      if (held.has('ArrowDown')) pitch += 1;
      if (held.has('ArrowLeft')) roll -= 1;
      if (held.has('ArrowRight')) roll += 1;
      let thr = throttle;
      if (held.has('KeyW')) thr = Math.min(1, thr + 0.016);
      if (held.has('KeyS')) thr = Math.max(0, thr - 0.016);
      if (held.has('Shift')) thr = 1;
      if (held.has('Control')) thr = 0;
      return {
        pitch, roll, throttle: thr, flaps,
        gear: gearDown, brake: held.has('KeyB'),
      };
    },
    /** Consume the queued one-shot actions since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Mouse orbit since the last call, in pixels; resets to zero. */
    takeOrbit() {
      const dx = orbitDX; const dy = orbitDY;
      orbitDX = 0; orbitDY = 0;
      return { dx, dy };
    },
  };
}
