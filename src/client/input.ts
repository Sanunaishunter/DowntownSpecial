import { Btn } from '../shared/constants';

const KEYMAP: Record<string, number> = {
  ArrowUp: Btn.Up,
  KeyW: Btn.Up,
  ArrowDown: Btn.Down,
  KeyS: Btn.Down,
  ArrowLeft: Btn.Left,
  KeyA: Btn.Left,
  ArrowRight: Btn.Right,
  KeyD: Btn.Right,
  KeyJ: Btn.A,
  KeyZ: Btn.A,
  KeyK: Btn.B,
  KeyX: Btn.B,
  Space: Btn.A | Btn.B,
  Digit1: Btn.S1,
  Digit2: Btn.S2,
  Digit3: Btn.S3,
  Digit4: Btn.S4,
  Digit5: Btn.S5,
  Digit6: Btn.S6,
};

export class Input {
  private keys = new Set<string>();
  private touch = 0;
  private prev = 0;
  private pressedAcc = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!(e.code in KEYMAP)) return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.update();
    });
    window.addEventListener('keyup', (e) => {
      if (!(e.code in KEYMAP)) return;
      this.keys.delete(e.code);
      this.update();
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  private current() {
    let m = this.touch;
    for (const k of this.keys) m |= KEYMAP[k];
    return m;
  }

  private update() {
    const now = this.current();
    this.pressedAcc |= now & ~this.prev;
    this.prev = now;
  }

  setTouch(mask: number) {
    this.touch = mask;
    this.update();
  }

  clear() {
    this.keys.clear();
    this.touch = 0;
    this.update();
  }

  take() {
    const p = this.pressedAcc;
    this.pressedAcc = 0;
    return { held: this.prev, pressed: p };
  }
}

export interface TouchApi {
  bind(el: HTMLElement, bits: number): void;
}

export function setupTouch(input: Input): TouchApi {
  const dpad = document.getElementById('dpad')!;
  const knob = document.getElementById('knob')!;
  let dirMask = 0;
  const active = new Map<string, number>();
  const apply = () => {
    let b = 0;
    for (const v of active.values()) b |= v;
    input.setTouch(dirMask | b);
  };

  const dirFrom = (e: PointerEvent) => {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.14;
    let m = 0;
    if (dx > dead) m |= Btn.Right;
    else if (dx < -dead) m |= Btn.Left;
    if (dy > dead) m |= Btn.Down;
    else if (dy < -dead) m |= Btn.Up;
    const lim = r.width * 0.28;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, lim / len);
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    return m;
  };
  let dpadPointer = -1;
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dpadPointer = e.pointerId;
    dpad.setPointerCapture(e.pointerId);
    dirMask = dirFrom(e);
    apply();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dpadPointer) return;
    dirMask = dirFrom(e);
    apply();
  });
  const dpadEnd = (e: PointerEvent) => {
    if (e.pointerId !== dpadPointer) return;
    dpadPointer = -1;
    dirMask = 0;
    knob.style.transform = '';
    apply();
  };
  dpad.addEventListener('pointerup', dpadEnd);
  dpad.addEventListener('pointercancel', dpadEnd);

  const bindBtn = (el: HTMLElement, bits: number) => {
    const id = el.id || `btn${bits}`;
    let pid = -1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('on');
      active.set(id, bits);
      apply();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      el.classList.remove('on');
      active.delete(id);
      apply();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  bindBtn(document.getElementById('tb-a')!, Btn.A);
  bindBtn(document.getElementById('tb-b')!, Btn.B);
  bindBtn(document.getElementById('tb-j')!, Btn.A | Btn.B);
  return { bind: bindBtn };
}
