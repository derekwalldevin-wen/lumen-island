import type { GameCommand } from './commands';
import type { Vec2 } from '../types';

export class InputController {
  private readonly keys = new Set<string>();
  private readonly disposers: Array<() => void> = [];
  private readonly command: (command: GameCommand) => void;
  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickVector: Vec2 = { x: 0, y: 0 };
  private enabled = false;
  private attackHeld = false;

  constructor(
    private readonly root: HTMLElement,
    command: (command: GameCommand) => void,
  ) {
    this.command = command;
    this.bindKeyboard();
    this.bindJoystick();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.joystickVector = { x: 0, y: 0 };
      this.attackHeld = false;
    }
  }

  setAttackHeld(pressed: boolean): void {
    this.attackHeld = pressed;
  }

  getMovement(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    x += this.joystickVector.x;
    y += this.joystickVector.y;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  consumeDodge(): boolean {
    return this.consumeKey('KeyK');
  }

  consumeSkill(): boolean {
    return this.consumeKey('KeyL');
  }

  consumePotion(): boolean {
    return this.consumeKey('KeyH');
  }

  consumeInteract(): boolean {
    return this.consumeKey('KeyE') || this.consumeKey('Enter');
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
  }

  private bindKeyboard(): void {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.repeat && ['KeyJ', 'KeyK', 'KeyL', 'KeyH', 'KeyE', 'Enter', 'Escape', 'KeyB'].includes(event.code)) return;
      this.keys.add(event.code);
      if (!this.enabled) return;
      if (event.code === 'KeyJ' || event.code === 'Space') {
        this.attackHeld = true;
        this.command({ type: 'attack', pressed: true });
      } else if (event.code === 'KeyK') {
        this.command({ type: 'dodge' });
      } else if (event.code === 'KeyL') {
        this.command({ type: 'skill' });
      } else if (event.code === 'KeyH') {
        this.command({ type: 'potion' });
      } else if (event.code === 'KeyE' || event.code === 'Enter') {
        this.command({ type: 'interact' });
      } else if (event.code === 'KeyB') {
        this.command({ type: 'open-panel', panel: 'bag' });
      } else if (event.code === 'Escape') {
        this.command({ type: 'pause' });
      }
    };

    const keyup = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
      if ((event.code === 'KeyJ' || event.code === 'Space') && this.enabled) {
        this.attackHeld = false;
        this.command({ type: 'attack', pressed: false });
      }
    };

    const blur = () => {
      this.keys.clear();
      this.joystickVector = { x: 0, y: 0 };
      this.attackHeld = false;
    };

    window.addEventListener('keydown', keydown, { passive: false });
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    this.disposers.push(() => window.removeEventListener('keydown', keydown));
    this.disposers.push(() => window.removeEventListener('keyup', keyup));
    this.disposers.push(() => window.removeEventListener('blur', blur));
  }

  private bindJoystick(): void {
    const joystick = this.root.querySelector<HTMLElement>('#joystick');
    if (!joystick) return;
    const knob = joystick.querySelector<HTMLElement>('.joystick__knob');
    const radius = 48;

    const update = (event: PointerEvent) => {
      const dx = event.clientX - this.joystickOrigin.x;
      const dy = event.clientY - this.joystickOrigin.y;
      const length = Math.hypot(dx, dy);
      const normalized = Math.min(1, length / radius);
      const angle = Math.atan2(dy, dx);
      const x = Math.cos(angle) * normalized;
      const y = Math.sin(angle) * normalized;
      this.joystickVector = { x, y };
      if (knob) knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    };

    const reset = () => {
      this.joystickPointer = null;
      this.joystickVector = { x: 0, y: 0 };
      if (knob) knob.style.transform = 'translate(0, 0)';
    };

    const pointerdown = (event: PointerEvent) => {
      if (!this.enabled) return;
      event.preventDefault();
      const rect = joystick.getBoundingClientRect();
      this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.joystickPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      update(event);
    };
    const pointermove = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      update(event);
    };
    const pointerup = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      reset();
    };

    joystick.addEventListener('pointerdown', pointerdown);
    joystick.addEventListener('pointermove', pointermove, { passive: false });
    joystick.addEventListener('pointerup', pointerup);
    joystick.addEventListener('pointercancel', pointerup);
    this.disposers.push(() => joystick.removeEventListener('pointerdown', pointerdown));
    this.disposers.push(() => joystick.removeEventListener('pointermove', pointermove));
    this.disposers.push(() => joystick.removeEventListener('pointerup', pointerup));
    this.disposers.push(() => joystick.removeEventListener('pointercancel', pointerup));
  }

  private consumeKey(code: string): boolean {
    if (!this.enabled || !this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }
}
