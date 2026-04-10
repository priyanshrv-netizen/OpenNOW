/**
 * OpenNOW Mobile - Input Protocol
 * Handles encoding input events for transmission to GeForce NOW servers
 * Adapted from opennow-stable/src/renderer/src/gfn/inputProtocol.ts
 * 
 * The input protocol encodes:
 * - Keyboard events (virtual keyboard for mobile)
 * - Mouse/touch events (with mobile touch adaptation)
 * - Gamepad events (physical and virtual gamepad)
 */

// Input message types
const INPUT_MESSAGE_KEYBOARD = 0x01;
const INPUT_MESSAGE_MOUSE_MOVE = 0x02;
const INPUT_MESSAGE_MOUSE_BUTTON = 0x03;
const INPUT_MESSAGE_GAMEPAD = 0x04;
const INPUT_MESSAGE_REL_MOUSE = 0x05;

// Mouse button constants
const MOUSE_BUTTON_LEFT = 0x01;
const MOUSE_BUTTON_RIGHT = 0x02;
const MOUSE_BUTTON_MIDDLE = 0x04;
const MOUSE_BUTTON_X1 = 0x05;
const MOUSE_BUTTON_X2 = 0x06;

// Keyboard modifier flags
const MODIFIER_SHIFT = 0x01;
const MODIFIER_CTRL = 0x02;
const MODIFIER_ALT = 0x04;
const MODIFIER_META = 0x08;

// Virtual key codes (Windows VK codes)
export const VK_CODES: Record<string, number> = {
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0D,
  SHIFT: 0x10,
  CTRL: 0x11,
  ALT: 0x12,
  PAUSE: 0x13,
  CAPSLOCK: 0x14,
  ESCAPE: 0x1B,
  SPACE: 0x20,
  PAGE_UP: 0x21,
  PAGE_DOWN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  INSERT: 0x2D,
  DELETE: 0x2E,
  '0': 0x30,
  '1': 0x31,
  '2': 0x32,
  '3': 0x33,
  '4': 0x34,
  '5': 0x35,
  '6': 0x36,
  '7': 0x37,
  '8': 0x38,
  '9': 0x39,
  A: 0x41,
  B: 0x42,
  C: 0x43,
  D: 0x44,
  E: 0x45,
  F: 0x46,
  G: 0x47,
  H: 0x48,
  I: 0x49,
  J: 0x4A,
  K: 0x4B,
  L: 0x4C,
  M: 0x4D,
  N: 0x4E,
  O: 0x4F,
  P: 0x50,
  Q: 0x51,
  R: 0x52,
  S: 0x53,
  T: 0x54,
  U: 0x55,
  V: 0x56,
  W: 0x57,
  X: 0x58,
  Y: 0x59,
  Z: 0x5A,
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7A,
  F12: 0x7B,
};

// Gamepad button mapping (Xbox/Standard layout)
export const GAMEPAD_BUTTONS = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  LEFT_STICK: 10,
  RIGHT_STICK: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  HOME: 16,
} as const;

// Gamepad axes
export const GAMEPAD_AXES = {
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,
} as const;

export const GAMEPAD_MAX_CONTROLLERS = 4;

/**
 * Input encoder for GeForce NOW protocol
 */
export class InputEncoder {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor(bufferSize = 1024) {
    this.buffer = new ArrayBuffer(bufferSize);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  reset(): void {
    this.offset = 0;
  }

  getData(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  getOffset(): number {
    return this.offset;
  }

  /**
   * Encode keyboard event
   */
  encodeKeyboard(vk: number, scancode: number, pressed: boolean, modifiers = 0): void {
    if (this.offset + 8 > this.buffer.byteLength) return;

    this.view.setUint8(this.offset, INPUT_MESSAGE_KEYBOARD);
    this.view.setUint8(this.offset + 1, pressed ? 1 : 0);
    this.view.setUint8(this.offset + 2, vk);
    this.view.setUint8(this.offset + 3, scancode);
    this.view.setUint16(this.offset + 4, modifiers, true);
    this.view.setUint16(this.offset + 6, 0, true); // Reserved
    this.offset += 8;
  }

  /**
   * Encode mouse move (absolute position)
   */
  encodeMouseMove(x: number, y: number, buttons = 0): void {
    if (this.offset + 12 > this.buffer.byteLength) return;

    this.view.setUint8(this.offset, INPUT_MESSAGE_MOUSE_MOVE);
    this.view.setUint8(this.offset + 1, buttons);
    this.view.setInt16(this.offset + 2, x, true);
    this.view.setInt16(this.offset + 4, y, true);
    this.view.setInt16(this.offset + 6, 0, true); // Wheel
    this.view.setInt16(this.offset + 8, 0, true); // Reserved
    this.offset += 12;
  }

  /**
   * Encode relative mouse move (for touch/swipe)
   */
  encodeRelativeMouse(dx: number, dy: number, buttons = 0): void {
    if (this.offset + 12 > this.buffer.byteLength) return;

    this.view.setUint8(this.offset, INPUT_MESSAGE_REL_MOUSE);
    this.view.setUint8(this.offset + 1, buttons);
    this.view.setInt16(this.offset + 2, Math.max(-32768, Math.min(32767, dx)), true);
    this.view.setInt16(this.offset + 4, Math.max(-32768, Math.min(32767, dy)), true);
    this.view.setInt16(this.offset + 6, 0, true);
    this.offset += 12;
  }

  /**
   * Encode mouse button event
   */
  encodeMouseButton(button: number, pressed: boolean, x: number, y: number): void {
    if (this.offset + 8 > this.buffer.byteLength) return;

    this.view.setUint8(this.offset, INPUT_MESSAGE_MOUSE_BUTTON);
    this.view.setUint8(this.offset + 1, button);
    this.view.setUint8(this.offset + 2, pressed ? 1 : 0);
    this.view.setUint8(this.offset + 3, 0); // Reserved
    this.view.setInt16(this.offset + 4, x, true);
    this.view.setInt16(this.offset + 6, y, true);
    this.offset += 8;
  }

  /**
   * Encode gamepad state
   */
  encodeGamepad(controllerIndex: number, buttons: number, axes: Float32Array): void {
    if (this.offset + 32 > this.buffer.byteLength) return;

    this.view.setUint8(this.offset, INPUT_MESSAGE_GAMEPAD);
    this.view.setUint8(this.offset + 1, controllerIndex);
    this.view.setUint16(this.offset + 2, buttons, true);
    
    // Encode up to 8 axes as int16 normalized values
    for (let i = 0; i < Math.min(8, axes.length); i++) {
      const value = Math.max(-1, Math.min(1, axes[i]));
      const normalized = Math.round(value * 32767);
      this.view.setInt16(this.offset + 4 + i * 2, normalized, true);
    }
    
    this.offset += 32;
  }
}

/**
 * Map touch coordinates to screen coordinates
 */
export function mapTouchToScreen(
  touchX: number,
  touchY: number,
  touchWidth: number,
  touchHeight: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: Math.round((touchX / touchWidth) * screenWidth),
    y: Math.round((touchY / touchHeight) * screenHeight),
  };
}

/**
 * Map gamepad button index to bitmask
 */
export function mapGamepadButtons(buttons: readonly boolean[]): number {
  let mask = 0;
  for (let i = 0; i < Math.min(16, buttons.length); i++) {
    if (buttons[i]) {
      mask |= 1 << i;
    }
  }
  return mask;
}

/**
 * Read gamepad axes and normalize to -1..1 range
 */
export function readGamepadAxes(gamepad: Gamepad | null): Float32Array {
  if (!gamepad) {
    return new Float32Array(4);
  }
  
  const axes = new Float32Array(Math.min(4, gamepad.axes.length));
  for (let i = 0; i < axes.length; i++) {
    axes[i] = gamepad.axes[i] || 0;
  }
  return axes;
}

/**
 * Convert float to int8 (-127 to 127)
 */
export function normalizeToInt8(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

/**
 * Convert float to int16 (-32767 to 32767)
 */
export function normalizeToInt16(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value * 32767)));
}

/**
 * Convert float to uint8 (0 to 255)
 */
export function normalizeToUint8(value: number): number {
  return Math.max(0, Math.min(255, Math.round((value + 1) * 127.5)));
}

/**
 * Mobile touch state tracker
 */
export interface TouchState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  isDragging: boolean;
  startTime: number;
}

/**
 * Touch input handler for mobile
 */
export class TouchInputHandler {
  private touches: Map<number, TouchState> = new Map();
  private lastX = 0;
  private lastY = 0;
  private encoder = new InputEncoder();
  private screenWidth = 1920;
  private screenHeight = 1080;
  private sensitivity = 1.0;
  private touchpadMode = false;
  private leftClickPending = false;

  setScreenDimensions(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = Math.max(0.1, Math.min(3.0, sensitivity));
  }

  setTouchpadMode(enabled: boolean): void {
    this.touchpadMode = enabled;
  }

  /**
   * Handle touch start
   */
  onTouchStart(identifier: number, x: number, y: number): ArrayBuffer | null {
    const touch: TouchState = {
      id: identifier,
      x,
      y,
      startX: x,
      startY: y,
      isDragging: false,
      startTime: Date.now(),
    };

    this.touches.set(identifier, touch);

    // Single tap = mouse click
    if (this.touches.size === 1) {
      this.leftClickPending = true;
    }

    this.encoder.reset();
    
    if (!this.touchpadMode) {
      // Direct touch mode - move cursor to position
      const screenPos = mapTouchToScreen(x, y, this.screenWidth, this.screenHeight, this.screenWidth, this.screenHeight);
      this.encoder.encodeMouseMove(screenPos.x, screenPos.y, 0);
      this.lastX = screenPos.x;
      this.lastY = screenPos.y;
    }

    return this.encoder.getOffset() > 0 ? this.encoder.getData() : null;
  }

  /**
   * Handle touch move
   */
  onTouchMove(identifier: number, x: number, y: number): ArrayBuffer | null {
    const touch = this.touches.get(identifier);
    if (!touch) return null;

    const dx = x - touch.x;
    const dy = y - touch.y;
    
    // Mark as dragging if moved significantly
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 10) {
      touch.isDragging = true;
      this.leftClickPending = false; // Cancel click on drag
    }

    touch.x = x;
    touch.y = y;

    this.encoder.reset();

    if (this.touchpadMode) {
      // Touchpad mode - relative movement
      const relX = dx * 3 * this.sensitivity;
      const relY = dy * 3 * this.sensitivity;
      this.encoder.encodeRelativeMouse(relX, relY, 0);
    } else {
      // Direct mode - absolute position
      const screenPos = mapTouchToScreen(x, y, this.screenWidth, this.screenHeight, this.screenWidth, this.screenHeight);
      this.lastX = screenPos.x;
      this.lastY = screenPos.y;
      this.encoder.encodeMouseMove(screenPos.x, screenPos.y, 0);
    }

    return this.encoder.getData();
  }

  /**
   * Handle touch end
   */
  onTouchEnd(identifier: number): ArrayBuffer | null {
    const touch = this.touches.get(identifier);
    if (!touch) return null;

    this.touches.delete(identifier);
    this.encoder.reset();

    const duration = Date.now() - touch.startTime;
    
    // If this was a short tap without drag, emit click
    if (this.leftClickPending && duration < 300 && !touch.isDragging) {
      this.encoder.encodeMouseButton(MOUSE_BUTTON_LEFT, true, this.lastX, this.lastY);
      this.encoder.encodeMouseButton(MOUSE_BUTTON_LEFT, false, this.lastX, this.lastY);
    }

    this.leftClickPending = false;

    return this.encoder.getOffset() > 0 ? this.encoder.getData() : null;
  }

  /**
   * Handle two-finger tap (right click)
   */
  onTwoFingerTap(x: number, y: number): ArrayBuffer {
    this.encoder.reset();
    const screenPos = mapTouchToScreen(x, y, this.screenWidth, this.screenHeight, this.screenWidth, this.screenHeight);
    this.encoder.encodeMouseButton(MOUSE_BUTTON_RIGHT, true, screenPos.x, screenPos.y);
    this.encoder.encodeMouseButton(MOUSE_BUTTON_RIGHT, false, screenPos.x, screenPos.y);
    return this.encoder.getData();
  }

  clear(): void {
    this.touches.clear();
    this.leftClickPending = false;
  }
}

/**
 * Virtual gamepad input handler
 */
export class VirtualGamepadHandler {
  private encoder = new InputEncoder();
  private buttonStates: boolean[] = new Array(16).fill(false);
  private axisValues: Float32Array = new Float32Array(4);

  setButton(buttonIndex: number, pressed: boolean): ArrayBuffer {
    if (buttonIndex >= 0 && buttonIndex < 16) {
      this.buttonStates[buttonIndex] = pressed;
    }
    return this.encodeState();
  }

  setAxis(axisIndex: number, value: number): ArrayBuffer {
    if (axisIndex >= 0 && axisIndex < 4) {
      this.axisValues[axisIndex] = Math.max(-1, Math.min(1, value));
    }
    return this.encodeState();
  }

  encodeState(): ArrayBuffer {
    this.encoder.reset();
    const buttons = mapGamepadButtons(this.buttonStates);
    this.encoder.encodeGamepad(0, buttons, this.axisValues);
    return this.encoder.getData();
  }

  reset(): void {
    this.buttonStates.fill(false);
    this.axisValues.fill(0);
  }
}

// Helper to get mouse button from event
export function toMouseButton(button: number): number {
  switch (button) {
    case 0: return MOUSE_BUTTON_LEFT;
    case 1: return MOUSE_BUTTON_MIDDLE;
    case 2: return MOUSE_BUTTON_RIGHT;
    case 3: return MOUSE_BUTTON_X1;
    case 4: return MOUSE_BUTTON_X2;
    default: return button;
  }
}

// Map keyboard event to VK code
export function mapKeyCode(key: string): number | null {
  return VK_CODES[key.toUpperCase()] ?? null;
}

// Get modifiers from keyboard event
export function modifierFlags(shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): number {
  let flags = 0;
  if (shift) flags |= MODIFIER_SHIFT;
  if (ctrl) flags |= MODIFIER_CTRL;
  if (alt) flags |= MODIFIER_ALT;
  if (meta) flags |= MODIFIER_META;
  return flags;
}
