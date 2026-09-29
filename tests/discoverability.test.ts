import { describe, expect, it } from 'vitest';
import { QUEST_STAGES } from '../src/data';
import { resolveGuide } from '../src/guide/guide';
import { createInitialSave } from '../src/rules/gameRules';
import {
  attackKeyLabels,
  BATTLE_KEY_HINTS,
  buildBattleCoachTips,
  renderKeyHints,
  WORLD_KEY_HINTS,
} from '../src/ui/hints';
import type { BattleHudState } from '../src/battle/battleRuntime';
import type { SaveData, ZoneId } from '../src/types';

/**
 * Regression cover for a reported confusion: a player had no way to learn what
 * attacking is or which key does it, because the attack key was only mentioned
 * inside panels they never opened.
 */
function battleState(overrides: Partial<BattleHudState> = {}): BattleHudState {
  return {
    heroHp: 100, heroMaxHp: 100, heroLevel: 1, flame: 0, flameStage: 0, combo: 0,
    skillCooldown: 0, dodgeCooldown: 0, enemyName: '灯绒团', enemyHp: 58, enemyMaxHp: 58,
    enemyPhase: 1, elapsed: 0, enemiesLeft: 1,
    timeToFirstHit: -1, timeToFirstDodge: -1, timeToFirstSkill: -1,
    ...overrides,
  };
}

describe('attack discoverability', () => {
  it('shows the attack key in the always-visible world key bar', () => {
    const bar = renderKeyHints(WORLD_KEY_HINTS);
    expect(bar).toContain('J');
    expect(bar).toContain('攻击');
  });

  it('shows the attack key in the battle key bar, including the spacebar alias', () => {
    const bar = renderKeyHints(BATTLE_KEY_HINTS);
    expect(bar).toContain('J');
    expect(bar).toContain('空格');
    expect(bar).toContain('攻击');
  });

  it('keeps the attack key reachable in both scenes', () => {
    expect(attackKeyLabels()).toEqual(expect.arrayContaining(['J']));
    expect(attackKeyLabels()).toContain('空格');
  });

  it('opens the first-battle coach by explaining the action, not just the key', () => {
    const tips = buildBattleCoachTips(battleState({ elapsed: 0.2 })).join('\n');
    expect(tips).toContain('攻击就是按住');
    expect(tips).toContain('血条');
    expect(tips).toContain('打空');
  });

  it('retires the opening explanation once the player has landed a hit', () => {
    const tips = buildBattleCoachTips(battleState({ elapsed: 7, timeToFirstHit: 1.2 }));
    expect(tips.join('\n')).not.toContain('攻击就是按住');
  });

  it('never leaves the player with no tip before the first hit', () => {
    for (const elapsed of [0, 1, 3, 6, 10]) {
      expect(buildBattleCoachTips(battleState({ elapsed })).length).toBeGreaterThan(0);
    }
  });

  it('nudges dodge then skill after the first hit', () => {
    const dodgeTip = buildBattleCoachTips(battleState({ elapsed: 7, timeToFirstHit: 1 })).join('');
    expect(dodgeTip).toContain('K');
    const skillTip = buildBattleCoachTips(battleState({ elapsed: 7, timeToFirstHit: 1, timeToFirstDodge: 2 })).join('');
    expect(skillTip).toContain('L');
  });

  it('names the attack key on every grass step, where combat is the main action', () => {
    const combatSteps = ['learn', 'woods', 'rain', 'stars'];
    const seen = new Set<string>();
    for (let stage = 0; stage <= 9; stage += 1) {
      const save: SaveData = createInitialSave(0);
      save.world.questStage = stage;
      // Clear the building detests so the step shown is the combat step itself.
      save.world.buildings = { forge: 1, rainCanopy: 1, starChart: 1 };
      const guide = resolveGuide(save, 'harbor', 450, 455);
      if (!combatSteps.includes(guide.step.id)) continue;
      seen.add(guide.step.id);
      const mentionsAttack = guide.step.hint.includes('J') || guide.step.inputHint.includes('J');
      expect(mentionsAttack, `step ${guide.step.id} never mentions the attack key`).toBe(true);
    }
    expect(seen.size, 'combat steps were not reachable from any quest stage').toBe(4);
  });

  it('shows the prerequisite detour instead of combat copy when a building is missing', () => {
    const save: SaveData = createInitialSave(0);
    save.world.questStage = 5;
    save.world.buildings = { forge: 1 };
    const guide = resolveGuide(save, 'harbor', 450, 455);
    expect(guide.step.detour).toBe(true);
    expect(guide.step.progress).toBe('集雨棚待修复');
    expect(guide.target?.id).toBe('home-build');
  });

  it('resolves a marker in every zone so the key bar never points nowhere', () => {
    const zones: ZoneId[] = ['harbor', 'cloudstep', 'paperwood', 'rainbud', 'starfall'];
    for (const zone of zones) {
      const save = createInitialSave(0);
      save.world.questStage = 1;
      const guide = resolveGuide(save, zone, 450, 500);
      expect(guide.marker, `no marker in ${zone}`).not.toBeNull();
    }
  });

  it('keeps a quest stage defined for every stage index the save can hold', () => {
    for (let stage = 0; stage <= 9; stage += 1) {
      expect(QUEST_STAGES[stage]).toBeDefined();
    }
  });
});
