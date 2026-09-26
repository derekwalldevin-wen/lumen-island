import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/data';
import { BattleRuntime } from '../src/battle/battleRuntime';
import { SeededRandom } from '../src/core/rng';
import { getPlayerStats, createInitialSave } from '../src/rules/gameRules';
import { normaliseSave, SaveManager } from '../src/save/saveManager';
import { WorldRuntime } from '../src/world/worldRuntime';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

describe('save persistence', () => {
  it('normalises a valid save and fills new fields with safe defaults', () => {
    const normalised = normaliseSave({ version: 1, player: { level: 4 }, world: { questStage: 2 } }, 100);
    expect(normalised?.player.level).toBe(4);
    expect(normalised?.player.hp).toBe(100);
    expect(normalised?.world.currentZone).toBe('harbor');
    expect(normalised?.player.materials.cloudFluff).toBe(0);
  });

  it('rejects a future or malformed version', () => {
    expect(normaliseSave({ version: 99 })).toBeNull();
    expect(normaliseSave({ version: 1, player: { hp: 'not-a-number' } }, 0)?.player.hp).toBe(100);
  });

  it('recovers the previous valid save when the primary is corrupted', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    const first = createInitialSave(1);
    manager.save(first);
    const second = createInitialSave(2);
    second.player.gold = 999;
    manager.save(second);
    storage.setItem('lumen-island-quest:save:v1', '{broken');
    const loaded = manager.load();
    expect(loaded?.player.gold).toBe(35);
    expect(manager.lastLoadRecovered).toBe(true);
  });
});

describe('world runtime', () => {
  it('finds nearby exits and gates after entering a zone', () => {
    const save = createInitialSave(0);
    const world = new WorldRuntime(save);
    world.enterZone('cloudstep');
    expect(world.currentZone.id).toBe('cloudstep');
    world.setPosition(450, 1080);
    expect(world.getNearbyInteractable()?.id).toBe('cloud-return');
    world.setPosition(450, 150);
    expect(world.getNearbyInteractable()?.id).toBe('paper-gate');
  });

  it('moves both horizontally and vertically from the harbor spawn', () => {
    const save = createInitialSave(0);
    const world = new WorldRuntime(save);
    world.enterZone('harbor');
    world.setPosition(450, 860);
    const random = new SeededRandom(1);
    const startY = world.y;
    world.update({ x: 0, y: -1 }, 0.5, 100, random, false);
    expect(world.y).toBeLessThan(startY);
    const startX = world.x;
    world.update({ x: 1, y: 0 }, 0.5, 100, random, false);
    expect(world.x).toBeGreaterThan(startX);
  });

  it('keeps the hero inside the island boundary', () => {
    const save = createInitialSave(0);
    const world = new WorldRuntime(save);
    expect(world.isWalkable(450, 525)).toBe(true);
    expect(world.isWalkable(2, 2)).toBe(false);
  });
});

describe('battle runtime', () => {
  it('allows a basic attack loop to defeat a starter enemy', () => {
    const save = createInitialSave(0);
    let finished = false;
    const battle = new BattleRuntime({
      onHud: () => undefined,
      onFinish: () => { finished = true; },
      onPotion: () => true,
      onEnemyDefeated: () => undefined,
      onSound: () => undefined,
      onCombo: () => undefined,
    }, 42);
    battle.start(['cloudPuff'], getPlayerStats(save), WEAPONS[0]!, save);
    battle.hero.x = 240;
    battle.hero.y = 300;
    for (let index = 0; index < 80; index += 1) {
      battle.update(0.05, { move: { x: 0, y: 0 }, attack: true, dodge: false, skill: false, potion: false }, save);
    }
    expect(battle.enemies[0]?.dead).toBe(true);
    expect(battle.outcome).toBe('victory');
    expect(finished).toBe(true);
  });

  it('executes the starter skill and builds flame', () => {
    const save = createInitialSave(0);
    const battle = new BattleRuntime({
      onHud: () => undefined,
      onFinish: () => undefined,
      onPotion: () => true,
      onEnemyDefeated: () => undefined,
      onSound: () => undefined,
      onCombo: () => undefined,
    }, 9);
    battle.start(['cloudPuff'], getPlayerStats(save), WEAPONS[0]!, save);
    battle.hero.x = 240;
    battle.hero.y = 300;
    battle.intro = 0;
    battle.update(0.05, { move: { x: 0, y: 0 }, attack: false, dodge: false, skill: true, potion: false }, save);
    expect(battle.flame).toBeGreaterThan(0);
    expect(battle.particles.length).toBeGreaterThan(0);
  });
});

describe('seeded encounter input', () => {
  it('produces repeatable grass rolls', () => {
    const first = new SeededRandom(11);
    const second = new SeededRandom(11);
    expect([first.next(), first.next()]).toEqual([second.next(), second.next()]);
  });
});
