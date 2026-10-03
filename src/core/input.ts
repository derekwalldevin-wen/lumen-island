import type { GameCommand } from './commands';
import type { Vec2 } from '../types';

export class InputController {
  private readonly keys = new Set<string>();
  private readonly disposers: Array<() => void> = [];
  private readonly command: (command: GameCommand) => void;
  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickVector: Vec2 = { x: 0, y: 0 };
  /** Idle position of the stick, captured on the first plant and reused after. */
  private joystickHomeSet = false;
  private joystickParkTimer: ReturnType<typeof setTimeout> | null = null;
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
    const moveZone = this.root.querySelector<HTMLElement>('#touch-move-zone');
    if (!joystick) return;
    const knob = joystick.querySelector<HTMLElement>('.joystick__knob');
    const radius = 48;
    /** Where the stick rests when idle, captured from its laid-out position. */
    let homeLeft = 0;
    let homeTop = 0;

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

    const park = () => {
      joystick.style.left = '';
      joystick.style.top = '';
      joystick.style.position = '';
      joystick.classList.remove('is-planted');
    };

    const reset = () => {
      this.joystickPointer = null;
      this.joystickVector = { x: 0, y: 0 };
      if (knob) knob.style.transform = 'translate(0, 0)';
      // Held for a beat before returning, so the player can see where they
      // released instead of having the stick vanish mid-correction.
      if (this.joystickParkTimer !== null) clearTimeout(this.joystickParkTimer);
      this.joystickParkTimer = setTimeout(park, 420);
    };

    const plant = (event: PointerEvent) => {
      if (!this.enabled) return;
      event.preventDefault();
      // Capture the home position on first use: reading it during pointerdown
      // would read a stick the player has already nudged.
      if (!this.joystickHomeSet) {
        const rect = joystick.getBoundingClientRect();
        homeLeft = rect.left;
        homeTop = rect.top;
        this.joystickHomeSet = true;
      }
      // Switch to absolute placement before measuring. Leaving it `relative` made
      // left/top offsets from its static slot, which compounded on every re-plant:
      // the second tap landed 25px off and the third 90px off. And measuring
      // first, then switching, put the very first tap 44px out because absolute
      // takes the stick out of flow and moves it.
      joystick.classList.add('is-planted');
      joystick.style.position = 'absolute';
      const rect = joystick.getBoundingClientRect();
      const host = joystick.offsetParent as HTMLElement | null;
      const hostRect = host?.getBoundingClientRect();
      joystick.style.left = `${event.clientX - (hostRect ? hostRect.left : 0) - rect.width / 2}px`;
      joystick.style.top = `${event.clientY - (hostRect ? hostRect.top : 0) - rect.height / 2}px`;
      joystick.classList.remove('is-planted');
      this.joystickOrigin = { x: event.clientX, y: event.clientY };
      this.joystickPointer = event.pointerId;
      const target = moveZone ?? joystick;
      target.setPointerCapture(event.pointerId);
      if (this.joystickParkTimer !== null) {
        clearTimeout(this.joystickParkTimer);
        this.joystickParkTimer = null;
      }
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

    // The zone claims the whole quadrant; the stick itself also accepts a touch
    // so it stays usable if the zone is ever absent, such as under test.
    const surface = moveZone ?? joystick;
    surface.addEventListener('pointerdown', plant);
    surface.addEventListener('pointermove', pointermove, { passive: false });
    surface.addEventListener('pointerup', pointerup);
    surface.addEventListener('pointercancel', pointerup);
    joystick.addEventListener('pointerdown', plant);
    joystick.addEventListener('pointermove', pointermove, { passive: false });
    joystick.addEventListener('pointerup', pointerup);
    joystick.addEventListener('pointercancel', pointerup);
    this.disposers.push(() => {
      surface.removeEventListener('pointerdown', plant);
      surface.removeEventListener('pointermove', pointermove);
      surface.removeEventListener('pointerup', pointerup);
      surface.removeEventListener('pointercancel', pointerup);
      joystick.removeEventListener('pointerdown', plant);
      joystick.removeEventListener('pointermove', pointermove);
      joystick.removeEventListener('pointerup', pointerup);
      joystick.removeEventListener('pointercancel', pointerup);
      if (this.joystickParkTimer !== null) clearTimeout(this.joystickParkTimer);
    });
  }

  private consumeKey(code: string): boolean {
    if (!this.enabled || !this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }
}
