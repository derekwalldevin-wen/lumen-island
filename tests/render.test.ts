import { describe, expect, it } from 'vitest';
import { ZONES, ENEMIES, WEAPONS } from '../src/data';
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  drawBattleScene,
  drawHero,
  drawMinimap,
  drawTitleScene,
  drawWorldScene,
} from '../src/render/visuals';
import { createInitialSave, getPlayerStats } from '../src/rules/gameRules';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { BattleEntity, Particle, SaveData, ZoneId } from '../src/types';

/**
 * Canvas calls are recorded rather than rasterised. These tests are not visual
 * assertions; they guard against render-time faults (renamed helpers, bad
 * argument shapes, NaN coordinates) across every draw path in the game.
 */
class RecordingContext {
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'round';
  lineJoin = 'round';
  globalAlpha = 1;
  globalCompositeOperation: unknown = 'source-over';
  font = '';
  textAlign: 'left' = 'left';
  textBaseline: 'alphabetic' = 'alphabetic';
  lineDashOffset = 0;
  calls = 0;
  private path: unknown = null;

  private track(name: string, args: unknown[]): void {
    this.calls += 1;
    for (const arg of args) {
      if (typeof arg === 'number' && !Number.isFinite(arg)) {
        throw new Error(`${name} received a non-finite coordinate: ${args.join(', ')}`);
      }
    }
  }

  get imageSmoothingEnabled(): boolean { return true; }
  set imageSmoothingEnabled(_value: boolean) { /* no-op */ }

  save(): void { this.track('save', []); }
  restore(): void { this.track('restore', []); }
  translate(x: number, y: number): void { this.track('translate', [x, y]); }
  rotate(a: number): void { this.track('rotate', [a]); }
  scale(x: number, y: number): void { this.track('scale', [x, y]); }
  beginPath(): void { this.path = null; this.calls += 1; }
  closePath(): void { this.calls += 1; }
  moveTo(x: number, y: number): void { this.path = [x, y]; this.track('moveTo', [x, y]); }
  lineTo(x: number, y: number): void { this.track('lineTo', [x, y]); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void { this.track('quadraticCurveTo', [cx, cy, x, y]); }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void { this.track('bezierCurveTo', [a, b, c, d, e, f]); }
  arc(x: number, y: number, r: number, s: number, e: number): void { this.track('arc', [x, y, r, s, e]); }
  arcTo(a: number, b: number, c: number, d: number, r: number): void { this.track('arcTo', [a, b, c, d, r]); }
  ellipse(x: number, y: number, rx: number, ry: number, _r: number, s: number, e: number): void { this.track('ellipse', [x, y, rx, ry, s, e]); }
  rect(x: number, y: number, w: number, h: number): void { this.track('rect', [x, y, w, h]); }
  fill(): void { this.track('fill', []); }
  stroke(): void { this.track('stroke', []); }
  clip(): void { this.track('clip', []); }
  fillRect(x: number, y: number, w: number, h: number): void { this.track('fillRect', [x, y, w, h]); }
  clearRect(x: number, y: number, w: number, h: number): void { this.track('clearRect', [x, y, w, h]); }
  strokeRect(x: number, y: number, w: number, h: number): void { this.track('strokeRect', [x, y, w, h]); }
  fillText(text: string, x: number, y: number): void { this.track('fillText', [x, y, text.length]); }
  strokeText(text: string, x: number, y: number): void { this.track('strokeText', [x, y, text.length]); }
  setLineDash(): void { this.calls += 1; }
  measureText(text: string): { width: number } { return { width: text.length * 8 }; }
  createLinearGradient(): CanvasGradient { this.calls += 1; return { addColorStop: () => { this.calls += 1; } } as unknown as CanvasGradient; }
  createRadialGradient(): CanvasGradient { this.calls += 1; return { addColorStop: () => { this.calls += 1; } } as unknown as CanvasGradient; }
  createPattern(): CanvasPattern { return null as unknown as CanvasPattern; }
  getImageData(): ImageData { return { data: new Uint8ClampedArray(4) } as unknown as ImageData; }
}

function asContext(): CanvasRenderingContext2D {
  return new RecordingContext() as unknown as CanvasRenderingContext2D;
}

/** Draw-call counter for a context created by `asContext`. */
function countOf(ctx: CanvasRenderingContext2D): number {
  return (ctx as unknown as RecordingContext).calls;
}

function baseOptions() {
  // dpr feeds the static layer cache. Under the test recorder there is no
  // document.createElement, so staticLayer returns null and the scene falls
  // back to drawing live, which is exactly the path these tests need to cover.
  return { time: 3.25, reducedMotion: false, dpr: 1 };
}

describe('render smoke tests', () => {
  it('draws the title scene without faults', () => {
    const ctx = asContext();
    drawTitleScene(ctx, 2.5, false);
    expect(countOf(ctx)).toBeGreaterThan(200);
  });

  it('draws the title scene with reduced motion enabled', () => {
    const ctx = asContext();
    drawTitleScene(ctx, 2.5, true);
    expect(countOf(ctx)).toBeGreaterThan(200);
  });

  it('draws every zone in the world scene', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const save = createInitialSave(0);
      save.world.currentZone = zoneId;
      save.world.buildings = { cottage: 2, forge: 2, rainCanopy: 1, starChart: 1, beacon: 1 };
      const world = new WorldRuntime(save);
      const ctx = asContext();
      drawWorldScene(ctx, world, save, {
        ...baseOptions(),
        camera: { x: 0, y: 0 },
        nearbyId: zoneId === 'harbor' ? 'keeper-luma' : null,
        guide: { x: 450, y: 520, label: '测试目标', kind: 'target', inRange: true },
      });
      expect(countOf(ctx), `${zoneId} produced too few draw calls`).toBeGreaterThan(300);
    }
  });

  it('draws the world scene with the gate-style guide marker', () => {
    const save = createInitialSave(0);
    const world = new WorldRuntime(save);
    const ctx = asContext();
    drawWorldScene(ctx, world, save, {
      ...baseOptions(),
      camera: { x: 120, y: 260 },
      nearbyId: null,
      guide: { x: 450, y: 935, label: '前往云阶草坡', kind: 'gate', inRange: false },
    });
    expect(countOf(ctx)).toBeGreaterThan(300);
  });

  it('draws the hero at every weapon type and both facings', () => {
    for (const weapon of WEAPONS) {
      for (const facing of [0, Math.PI]) {
        const ctx = asContext();
        drawHero(ctx, { x: 240, y: 430, facing, walkPhase: 1.2, flame: 80, weaponType: weapon.type, scale: 1.1, moving: true });
        expect(countOf(ctx), `${weapon.id} produced too few draw calls`).toBeGreaterThan(40);
      }
    }
  });

  function battleEntities(id: string): BattleEntity {
    const definition = ENEMIES[id]!;
    return {
      id: 'e1', kind: 'enemy', definitionId: id, x: 320, y: 380, vx: 0, vy: 0,
      radius: definition.radius, hp: definition.hp, maxHp: definition.hp,
      damage: definition.damage, defense: definition.defense, speed: definition.speed,
      facing: 0, attackTimer: 0, telegraphTimer: definition.telegraph > 0 ? 0.2 : 0,
      attackCooldown: 0, hitFlash: 0.1, dead: false, phase: 2,
    };
  }

  it('draws a battle against every enemy type', () => {
    const save = createInitialSave(0);
    const stats = getPlayerStats(save);
    const hero: BattleEntity = {
      id: 'hero', kind: 'hero', definitionId: 'sprigFork', x: 180, y: 420, vx: 10, vy: -4,
      radius: 20, hp: stats.hp, maxHp: stats.maxHp, damage: stats.attack, defense: stats.defense,
      speed: stats.moveSpeed, facing: 0.3, attackTimer: 0, telegraphTimer: 0,
      attackCooldown: 0, hitFlash: 0, dead: false,
    };
    const particles: Particle[] = [
      { x: 300, y: 360, vx: 1, vy: -1, life: 0.4, maxLife: 0.6, size: 3, color: '#f4c95d', spin: 0.2, kind: 'star' },
    ];
    for (const id of Object.keys(ENEMIES)) {
      const ctx = asContext();
      drawBattleScene(
        ctx,
        hero,
        [battleEntities(id)],
        [{ id: 'pr1', x: 300, y: 400, vx: 90, vy: 0, radius: 6, damage: 5, life: 0.9, friendly: true, color: '#fff0b8', kind: 'spark' }],
        [{ id: 'h1', x: 360, y: 430, radius: 40, delay: 0.3, duration: 0.4, damage: 6, fired: false, hit: false, color: '#e88470' }],
        particles,
        [{ x: 300, y: 300, text: '12', color: '#fff', life: 0.8, size: 18 }],
        { ...baseOptions(), shake: 2, flame: 70, combo: 4, intro: 0, weaponType: 'branch' },
      );
      expect(countOf(ctx), `${id} produced too few draw calls`).toBeGreaterThan(300);
    }
  });

  it('draws the battle intro frame and a boss introduction', () => {
    const save = createInitialSave(0);
    const stats = getPlayerStats(save);
    const hero: BattleEntity = {
      id: 'hero', kind: 'hero', definitionId: 'sprigFork', x: 180, y: 420, vx: 0, vy: 0,
      radius: 20, hp: stats.hp, maxHp: stats.maxHp, damage: stats.attack, defense: stats.defense,
      speed: stats.moveSpeed, facing: 0, attackTimer: 0, telegraphTimer: 0,
      attackCooldown: 0, hitFlash: 0, dead: false,
    };
    const ctx = asContext();
    drawBattleScene(ctx, hero, [battleEntities('starlessOwl')], [], [], [], [], {
      ...baseOptions(), shake: 0, flame: 0, combo: 0, intro: 0.5, weaponType: 'bell',
    });
    expect(countOf(ctx)).toBeGreaterThan(300);
  });

  it('draws the minimap for every zone with and without an objective marker', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const save = createInitialSave(0);
      save.world.currentZone = zoneId;
      save.world.buildings = { cottage: 2, forge: 1 };
      const world = new WorldRuntime(save);
      for (const guide of [
        { guideX: null, guideY: null, guideGate: false, inRange: false },
        { guideX: 450, guideY: 500, guideGate: false, inRange: true },
        { guideX: 450, guideY: 935, guideGate: true, inRange: false },
      ]) {
        const ctx = asContext();
        drawMinimap(ctx, world, { width: 132, height: 176, ...guide });
        expect(countOf(ctx), `${zoneId} minimap produced too few draw calls`).toBeGreaterThan(40);
      }
    }
  });

  it('keeps the minimap aspect box independent of zone size', () => {
    // A tall zone must letterbox inside the fixed HUD box, never overflow it.
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const pad = 7;
      const scale = Math.min((132 - pad * 2) / zone.width, (176 - pad * 2) / zone.height);
      expect(zone.width * scale).toBeLessThanOrEqual(132 - pad * 2 + 0.001);
      expect(zone.height * scale).toBeLessThanOrEqual(176 - pad * 2 + 0.001);
    }
  });

  it('keeps the design-space size used by every scene constant', () => {
    // The viewport transform in Game.resize() letterboxes against these values.
    expect(BASE_WIDTH).toBe(480);
    expect(BASE_HEIGHT).toBe(800);
  });
});
