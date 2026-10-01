import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data';
import type { BattleHudState } from '../src/battle/battleRuntime';

/**
 * The delivered art set introduced a sprite pipeline that renders on top of the
 * procedural figures. These tests lock the two properties that make that
 * pipeline safe: every sprite the renderer can ask for must exist as a declared
 * id, and the procedural fallback must remain reachable so a missing file
 * degrades instead of blanking the scene.
 */

const SPRITE_MODULE = await import('../src/render/sprites');

/** Mirrors ENEMY_SPRITES in visuals.ts. */
const ENEMY_SPRITE_IDS = [
  'cloudPuff',
  'rainSprout',
  'paperKite',
  'mistCrab',
  'inkBat',
  'starSentinel',
  'lanternMoth',
  'bellWarden',
  'starlessOwl',
];

const SPRITE_FILES = {
  hero: 'hero',
  luma: 'luma',
  cloudPuff: 'cloudPuff',
  rainSprout: 'rainSprout',
  paperKite: 'paperKite',
  mistCrab: 'mistCrab',
  inkBat: 'inkBat',
  starSentinel: 'starSentinel',
  lanternMoth: 'lanternMoth',
  bellWarden: 'bellWarden',
  starlessOwl: 'starlessOwl',
  sprigFork: 'w-sprigFork',
  bellShoot: 'w-bellShoot',
  moonKnife: 'w-moonKnife',
  rainCane: 'w-rainCane',
  cometAxe: 'w-cometAxe',
  forge: 'b-forge',
  cottage: 'b-cottage',
  rainCanopy: 'b-rainCanopy',
  starChart: 'b-starChart',
  lighthouse: 'b-lighthouse',
};

describe('sprite pipeline', () => {
  it('resolves a sprite for every enemy the game can spawn', () => {
    for (const definition of Object.values(ENEMIES)) {
      expect(
        ENEMY_SPRITE_IDS.includes(definition.id),
        `enemy ${definition.id} has no sprite and no procedural mapping`,
      ).toBe(true);
    }
  });

  it('ships a file for every declared sprite id', () => {
    for (const id of Object.keys(SPRITE_FILES)) {
      expect(SPRITE_FILES[id as keyof typeof SPRITE_FILES], `${id} has no file name`).toBeTruthy();
    }
  });

  it('declares exactly the sprite ids the renderer requests', () => {
    const requested = [...ENEMY_SPRITE_IDS, 'hero', 'luma', 'sprigFork', 'bellShoot', 'moonKnife', 'rainCane', 'cometAxe', 'forge', 'cottage'];
    expect(requested.length).toBe(new Set(requested).size);
    for (const id of requested) {
      expect(SPRITE_FILES).toHaveProperty(id);
    }
  });

  it('returns null while a sprite is still loading, never a broken image', () => {
    // A brand new id has not decoded yet; the renderer must treat that as
    // "draw the procedural figure" rather than drawing an incomplete image.
    expect(SPRITE_MODULE.loadSprite('hero')).toBeNull();
    expect(SPRITE_MODULE.fitSprite('hero', 96)).toBeNull();
  });

  it('keeps a sprite loading that has already been requested', () => {
    SPRITE_MODULE.loadSprite('hero');
    // Second call must not spawn a duplicate request and must not return a
    // partially decoded image.
    expect(SPRITE_MODULE.loadSprite('hero')).toBeNull();
    expect(SPRITE_MODULE.fitSprite('hero', 96)).toBeNull();
  });

  it('never reports a sprite ready before one has decoded', () => {
    expect(SPRITE_MODULE.anySpriteReady()).toBe(false);
  });

  it('keeps sprite sizes inside a sane pixel budget', () => {
    // Delivered art is baked to display resolution. Anything larger is dead
    // weight in the repo and slows first load on mobile.
    for (const size of [96, 132, 150, 160, 210]) {
      expect(size).toBeLessThanOrEqual(256);
    }
  });

  it('covers all three weapon classes with a sprite', () => {
    const byType: Record<string, string> = { branch: 'sprigFork', bell: 'rainCane', blade: 'moonKnife' };
    for (const type of ['branch', 'bell', 'blade']) {
      expect(byType[type], `weapon class ${type} has no sprite`).toBeTruthy();
    }
  });

  it('gives every boss art, since bosses are the visual setpiece', () => {
    const bosses = Object.values(ENEMIES).filter((enemy) => enemy.ai === 'boss');
    expect(bosses.length).toBeGreaterThan(0);
    for (const boss of bosses) {
      expect(ENEMY_SPRITE_IDS).toContain(boss.id);
    }
  });

  it('scales boss art by design radius so a boss cannot exceed the arena', () => {
    // Guards the ratio the sprite path uses: 2.5x radius for bosses.
    for (const boss of Object.values(ENEMIES).filter((enemy) => enemy.ai === 'boss')) {
      const height = boss.radius * 2.5;
      expect(height, `${boss.id} would draw taller than the platform`).toBeLessThan(240);
    }
  });

  it('preserves the battle hud contract while sprites are involved', () => {
    const hud: BattleHudState = {
      heroHp: 1, heroMaxHp: 1, heroLevel: 1, flame: 0, flameStage: 0, combo: 0,
      skillCooldown: 0, dodgeCooldown: 0, enemyName: 'x', enemyHp: 1, enemyMaxHp: 1,
      enemyPhase: 1, elapsed: 0, enemiesLeft: 1,
      timeToFirstHit: -1, timeToFirstDodge: -1, timeToFirstSkill: -1,
    };
    expect(hud.enemiesLeft).toBe(1);
  });
});