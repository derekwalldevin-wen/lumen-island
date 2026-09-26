import { describe, expect, it } from 'vitest';
import { WEAPONS, ZONES } from '../src/data';
import { SeededRandom } from '../src/core/rng';
import {
  awardXp,
  build,
  canBuild,
  canCraft,
  craft,
  createInitialSave,
  damageRoll,
  equipItem,
  flameMultiplier,
  flameStage,
  getPlayerStats,
  getQuestText,
  isZoneUnlocked,
  xpForNextLevel,
} from '../src/rules/gameRules';

describe('progression rules', () => {
  it('starts with the starter weapon and correct level-one stats', () => {
    const save = createInitialSave(0);
    const stats = getPlayerStats(save);
    expect(save.player.equippedWeapon).toBe('sprigFork');
    expect(stats.maxHp).toBe(100);
    expect(stats.attack).toBe(30);
    expect(stats.defense).toBe(6);
  });

  it('levels up while carrying excess XP', () => {
    const save = createInitialSave(0);
    save.player.xp = xpForNextLevel(1) - 5;
    const result = awardXp(save, 40);
    expect(result.levelsGained).toBe(1);
    expect(save.player.level).toBe(2);
    expect(save.player.xp).toBe(35);
  });
});

describe('combat rules', () => {
  it('always deals at least one damage', () => {
    const result = damageRoll(2, 999, 0, 1.5, 0.5);
    expect(result.amount).toBe(1);
  });

  it('supports three deterministic flame stages', () => {
    expect(flameStage(0)).toBe(0);
    expect(flameStage(22)).toBe(1);
    expect(flameStage(48)).toBe(2);
    expect(flameStage(78)).toBe(3);
    expect(flameMultiplier(78)).toBeGreaterThan(flameMultiplier(0));
  });
});

describe('crafting and building', () => {
  it('cannot craft before the forge is repaired', () => {
    const save = createInitialSave(0);
    expect(canCraft(save, 'bellShoot')).toBe(false);
  });

  it('builds the forge then crafts an affordable weapon', () => {
    const save = createInitialSave(0);
    save.player.gold = 200;
    save.player.materials.cloudFluff = 6;
    save.player.materials.rainPearl = 2;
    expect(canBuild(save, 'forge')).toBe(true);
    expect(build(save, 'forge')).toBe(true);
    expect(canCraft(save, 'bellShoot')).toBe(true);
    expect(craft(save, 'bellShoot')).toBe(true);
    expect(save.player.inventory).toContain('bellShoot');
    expect(equipItem(save, 'bellShoot')).toBe(true);
    expect(save.player.equippedWeapon).toBe('bellShoot');
  });

  it('keeps all ten weapon definitions buildable in progression order', () => {
    const orderedIds = [...WEAPONS].sort((a, b) => a.requiredLevel - b.requiredLevel).map((item) => item.id);
    expect(orderedIds).toHaveLength(10);
    expect(new Set(orderedIds).size).toBe(10);
  });
});

describe('quest and zone rules', () => {
  it('tracks encounter progress in the quest tracker', () => {
    const save = createInitialSave(0);
    save.world.questStage = 1;
    save.world.defeatCounts.cloudPuff = 2;
    expect(getQuestText(save).progress).toBe('灯绒团 2 / 3');
  });

  it('gates later regions behind story and construction', () => {
    const save = createInitialSave(0);
    expect(isZoneUnlocked(save, 'cloudstep')).toBe(true);
    expect(isZoneUnlocked(save, 'paperwood')).toBe(false);
    save.world.questStage = 3;
    save.world.buildings.forge = 1;
    expect(isZoneUnlocked(save, 'paperwood')).toBe(true);
    expect(isZoneUnlocked(save, 'rainbud')).toBe(false);
  });

  it('defines all zones with reachable spawns and returns', () => {
    for (const zone of Object.values(ZONES)) {
      expect(zone.spawn.x).toBeGreaterThan(0);
      expect(zone.spawn.x).toBeLessThan(zone.width);
      expect(zone.spawn.y).toBeGreaterThan(0);
      expect(zone.spawn.y).toBeLessThan(zone.height);
      if (zone.safe) {
        expect(zone.interactables.some((item) => item.kind === 'portal')).toBe(true);
      } else {
        expect(zone.interactables.some((item) => item.kind === 'exit')).toBe(true);
      }
    }
  });
});

describe('seeded random', () => {
  it('replays the same sequence for the same seed', () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});
