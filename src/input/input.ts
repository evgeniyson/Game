// Ввод: клавиатура/мышь и сенсорное управление (джойстик + кнопки с перетягиванием для прицела).

export type Action =
  | { type: 'ability'; slot: number; aim: { dx: number; dz: number; k: number } | null; mouse?: boolean }
  | { type: 'item'; slot: number }
  | { type: 'interact' }
  | { type: 'panel'; name: string }
  | { type: 'auto' }
  | { type: 'escape' };

export const ABILITY_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyT'];
export const ABILITY_LABELS = ['Q', 'E', 'R', 'T'];

export interface AimPreview {
  slot: number;
  dx: number;
  dz: number;
  k: number; // 0..1 — доля дальности
  cancel: boolean;
}

export class Input {
  move = { x: 0, z: 0 };
  attackHeld = false;
  mouse = { x: 0, y: 0, has: false };
  queue: Action[] = [];
  aim: AimPreview | null = null;
  hoverAbility = -1; // ПК: зажата клавиша способности (показываем индикатор)
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyBase = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  joyEl: HTMLElement;
  joyKnob: HTMLElement;
  enabled = true;
  usingTouch = false;

  constructor(private root: HTMLElement) {
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joy';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyEl.appendChild(this.joyKnob);
    root.appendChild(this.joyEl);

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.attackHeld = false;
    });
    const canvas = root.querySelector('canvas')!;
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.has = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.attackHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.attackHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Сенсорный джойстик: левая половина экрана
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.usingTouch = true;
      if (this.joyId === null && e.clientX < window.innerWidth * 0.55) {
        this.joyId = e.pointerId;
        this.joyBase = { x: e.clientX, y: e.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyEl.style.left = e.clientX + 'px';
        this.joyEl.style.top = e.clientY + 'px';
        this.joyEl.classList.add('on');
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const dx = e.clientX - this.joyBase.x,
        dy = e.clientY - this.joyBase.y;
      const max = 55;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.joyVec = { x: (dx * k) / max, y: (dy * k) / max };
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyEl.classList.remove('on');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.code;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (!down) {
      const slot = ABILITY_KEYS.indexOf(k);
      if (slot >= 0 && this.hoverAbility === slot) {
        this.hoverAbility = -1;
        this.queue.push({ type: 'ability', slot, aim: null, mouse: true });
      }
      if (k === 'Space') this.attackHeld = false;
      return;
    }
    if (e.repeat) return;
    // WASD занят движением, поэтому на ПК способности висят на Q / E / R / T
    const slot = ABILITY_KEYS.indexOf(k);
    if (slot >= 0) this.hoverAbility = slot;
    if (k.startsWith('Digit')) {
      const n = Number(k.slice(5)) - 1;
      if (n >= 0 && n < 4) this.queue.push({ type: 'item', slot: n });
    }
    if (k === 'Space') this.attackHeld = true;
    if (k === 'KeyF') this.queue.push({ type: 'interact' });
    if (k === 'KeyI' || k === 'Tab') {
      e.preventDefault();
      this.queue.push({ type: 'panel', name: 'inventory' });
    }
    if (k === 'KeyC') this.queue.push({ type: 'panel', name: 'craft' });
    if (k === 'KeyK') this.queue.push({ type: 'panel', name: 'skills' });
    if (k === 'KeyM') this.queue.push({ type: 'panel', name: 'map' });
    if (k === 'KeyG') this.queue.push({ type: 'auto' });
    if (k === 'Escape') this.queue.push({ type: 'escape' });
  }

  update() {
    let x = 0,
      z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.joyId !== null) {
      x = this.joyVec.x;
      z = this.joyVec.y;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    if (len < 0.15) {
      x = 0;
      z = 0;
    }
    this.move.x = x;
    this.move.z = z;
  }

  /** Привязка сенсорной/мышиной кнопки способности: тап — быстрый каст, перетягивание — прицел */
  bindAbilityButton(el: HTMLElement, slot: number, cancelEl: HTMLElement) {
    let id: number | null = null;
    let sx = 0,
      sy = 0;
    const MAXD = 90;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType !== 'mouse') this.usingTouch = true;
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      el.setPointerCapture(e.pointerId);
      this.aim = { slot, dx: 0, dz: 0, k: 0, cancel: false };
      cancelEl.classList.add('show');
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !this.aim) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      const len = Math.hypot(dx, dy);
      const r = cancelEl.getBoundingClientRect();
      this.aim.cancel = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (len > 12) {
        this.aim.dx = dx / len;
        this.aim.dz = dy / len;
        this.aim.k = Math.min(1, len / MAXD);
      } else this.aim.k = 0;
      cancelEl.classList.toggle('hot', this.aim.cancel);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      cancelEl.classList.remove('show', 'hot');
      const a = this.aim;
      this.aim = null;
      if (!a || a.cancel) return;
      if (a.k <= 0) this.queue.push({ type: 'ability', slot, aim: null, mouse: e.pointerType === 'mouse' });
      else this.queue.push({ type: 'ability', slot, aim: { dx: a.dx, dz: a.dz, k: a.k } });
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  bindHold(el: HTMLElement, onDown: () => void, onUp: () => void) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      onDown();
    });
    const up = () => onUp();
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  bindTap(el: HTMLElement, fn: () => void) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }
}
