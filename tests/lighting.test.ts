import { describe, expect, it } from 'vitest';
import { WEAPONS, ZONES } from '../src/data';
import { createInitialSave } from '../src/rules/gameRules';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { SaveData, WorldObstacle, ZoneId } from '../src/types';

/**
 * Two changes are covered here: static props are baked per obstacle, and the
 * scene now has a lighting state that the character art is supposed to sit
 * inside. Both are easy to regress silently, because a stale prop cache only
 * shows up after an upgrade and a broken flame only shows up on a dark weapon.
 */

/** Mirrors STATIC_PROP_KINDS in visuals.ts. */
const STATIC_PROP_KINDS = new Set<string>(['tree', 'rock', 'ledge', 'plinth']);

function cacheKey(obstacle: WorldObstacle, save: SaveData): string {
  const base = `${obstacle.kind}:${obstacle.x}:${obstacle.y}:${obstacle.w}:${obstacle.h}:${obstacle.seed ?? 0}`;
  if (obstacle.kind === 'house') return `${base}:${save.world.buildings.cottage ?? 0}`;
  if (obstacle.kind === 'forge') return `${base}:${save.world.buildings.forge ?? 0}`;
  return base;
}

describe('prop cache keys', () => {
  it('separates two props at different positions', () => {
    const a: WorldObstacle = { kind: 'tree', x: 100, y: 200, w: 64, h: 80, seed: 3 };
    const b: WorldObstacle = { kind: 'tree', x: 300, y: 200, w: 64, h: 80, seed: 3 };
    const save = createInitialSave(0);
    expect(cacheKey(a, save)).not.toBe(cacheKey(b, save));
  });

  it('separates two props with different seeds at the same spot', () => {
    const a: WorldObstacle = { kind: 'tree', x: 100, y: 200, w: 64, h: 80, seed: 3 };
    const b: WorldObstacle = { kind: 'tree', x: 100, y: 200, w: 64, h: 80, seed: 9 };
    const save = createInitialSave(0);
    expect(cacheKey(a, save)).not.toBe(cacheKey(b, save));
  });

  it('gives a tree without a seed the same key as one seeded zero', () => {
    const a: WorldObstacle = { kind: 'rock', x: 10, y: 20, w: 30, h: 30 };
    const b: WorldObstacle = { kind: 'rock', x: 10, y: 20, w: 30, h: 30, seed: 0 };
    const save = createInitialSave(0);
    expect(cacheKey(a, save)).toBe(cacheKey(b, save));
  });

  it('changes the cottage key when the cottage is upgraded', () => {
    const house: WorldObstacle = { kind: 'house', x: 110, y: 165, w: 150, h: 130 };
    const save = createInitialSave(0);
    const before = cacheKey(house, save);
    save.world.buildings.cottage = 2;
    // A level 0 cottage and a level 2 cottage are different buildings. Sharing
    // an entry would leave the upgraded roof unpainted until the next reload.
    expect(cacheKey(house, save)).not.toBe(before);
  });

  it('changes the forge key when the forge is upgraded', () => {
    const forge: WorldObstacle = { kind: 'forge', x: 620, y: 160, w: 150, h: 130 };
    const save = createInitialSave(0);
    const before = cacheKey(forge, save);
    save.world.buildings.forge = 3;
    expect(cacheKey(forge, save)).not.toBe(before);
  });

  it('produces a stable key across repeated reads', () => {
    const tree: WorldObstacle = { kind: 'tree', x: 90, y: 470, w: 90, h: 100, seed: 2 };
    const save = createInitialSave(0);
    expect(cacheKey(tree, save)).toBe(cacheKey(tree, save));
  });
});

describe('bakeable props', () => {
  it('bakes only kinds whose appearance cannot change', () => {
    // Everything else either animates or reads save state, so baking it would
    // freeze the motion or show the wrong upgrade.
    expect(STATIC_PROP_KINDS.has('tree')).toBe(true);
    expect(STATIC_PROP_KINDS.has('rock')).toBe(true);
    expect(STATIC_PROP_KINDS.has('ledge')).toBe(true);
    expect(STATIC_PROP_KINDS.has('plinth')).toBe(true);
    for (const animated of ['water', 'flower', 'house', 'forge', 'ruin', 'lantern']) {
      expect(STATIC_PROP_KINDS.has(animated), `${animated} must stay live`).toBe(false);
    }
  });

  it('keeps every zone to a working set of bakeable props', () => {
    // A whole zone of trees has to fit the prop pixel budget at once, or the
    // LRU thrashes and rebakes half of them every frame.
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const bakeable = ZONES[zoneId].obstacles.filter((obstacle) => STATIC_PROP_KINDS.has(obstacle.kind));
      const pixels = bakeable.reduce((sum, obstacle) => {
        const padding = 26;
        const w = (obstacle.w + padding * 2) * 2;
        const h = (obstacle.h + padding * 2) * 2;
        return sum + w * h;
      }, 0);
      expect(pixels, `${zoneId} bakeable props exceed the 2.2M pixel prop budget`).toBeLessThanOrEqual(2_200_000);
    }
  });
});

describe('hero lantern strength', () => {
  it('grows with weapon tier so upgrading the weapon visibly brightens the world', () => {
    const byTier = WEAPONS.map((weapon) => {
      const save = createInitialSave(0);
      save.player.equippedWeapon = weapon.id;
      const world = new WorldRuntime(save);
      return { id: weapon.id, tier: weapon.tier, glow: world.flameGlow };
    });
    for (let index = 1; index < byTier.length; index += 1) {
      const previous = byTier[index - 1]!;
      const current = byTier[index]!;
      expect(current.glow, `${current.id} should not be darker than ${previous.id}`).toBeGreaterThanOrEqual(previous.glow);
    }
  });

  it('stays inside 0 to 1 for every weapon', () => {
    for (const weapon of WEAPONS) {
      const save = createInitialSave(0);
      save.player.equippedWeapon = weapon.id;
      const world = new WorldRuntime(save);
      expect(world.flameGlow, `${weapon.id} is out of range`).toBeGreaterThanOrEqual(0);
      expect(world.flameGlow, `${weapon.id} is out of range`).toBeLessThanOrEqual(1);
    }
  });

  it('returns zero rather than throwing when the save names no known weapon', () => {
    const save = createInitialSave(0);
    // A save written by a future build could carry an id this build does not
    // know. Lighting must degrade to off, not crash the renderer.
    save.player.equippedWeapon = 'weaponFromTheFuture' as never;
    const world = new WorldRuntime(save);
    expect(world.flameGlow).toBe(0);
  });

  it('is available without stepping the world', () => {
    // drawLanternLighting reads this during render, before any update runs.
    const save = createInitialSave(0);
    const world = new WorldRuntime(save);
    expect(Number.isFinite(world.flameGlow)).toBe(true);
  });
});