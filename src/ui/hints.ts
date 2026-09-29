import type { BattleHudState } from '../battle/battleRuntime';

/**
 * Key hints shown in the persistent bar at the bottom of the screen. They are
 * data rather than inline markup so they can be asserted directly: a player once
 * reported not knowing what attacking was, because the attack key only existed
 * inside panels they never opened.
 */
export interface KeyHint {
  keys: string[];
  label: string;
}

export const WORLD_KEY_HINTS: KeyHint[] = [
  { keys: ['WASD'], label: '移动' },
  { keys: ['E'], label: '互动' },
  { keys: ['J'], label: '攻击' },
  { keys: ['B'], label: '背包' },
  { keys: ['Esc'], label: '菜单' },
];

export const BATTLE_KEY_HINTS: KeyHint[] = [
  { keys: ['J', '空格'], label: '攻击' },
  { keys: ['K'], label: '闪避' },
  { keys: ['L'], label: '技能' },
  { keys: ['H'], label: '药剂' },
  { keys: ['Esc'], label: '暂停' },
];

export function renderKeyHints(hints: KeyHint[]): string {
  return hints
    .map((hint) => `${hint.keys.map((key) => `<kbd>${key}</kbd>`).join('/')} ${hint.label}`)
    .join(' <i></i>');
}

export function attackKeyLabels(): string[] {
  return [...WORLD_KEY_HINTS, ...BATTLE_KEY_HINTS]
    .filter((hint) => hint.label === '攻击')
    .flatMap((hint) => hint.keys);
}

/**
 * First-battle coaching. Opens by explaining what attacking *is*, because the key
 * alone is not enough: a new player needs to know they walk into an encounter,
 * hold the key, and the enemy empties. Each tip then retires once the player
 * performs the action.
 */
export function buildBattleCoachTips(state: BattleHudState): string[] {
  const tips: string[] = [];
  if (state.elapsed < 5) {
    tips.push('<b>攻击就是按住 <kbd>J</kbd> 或 <kbd>空格</kbd> 挥动武器</b>（手机按住「击」），冷却结束会自动接下一刀');
    tips.push('<b>暮影头顶的血条</b>是它的生命，打空就赢了；<kbd>K</kbd> 闪避能躲开它抬手时的红圈');
  }
  if (state.timeToFirstHit < 0) {
    tips.push('<b>先打一下</b>— 走进草丛就会自动开战，靠近后按住攻击键');
  } else if (state.timeToFirstDodge < 0 && state.elapsed > 6) {
    tips.push('<b>看到红光就按 K 闪避</b>— 敌人抬手蓄力时闪开可以触发「精准闪避」');
  } else if (state.timeToFirstSkill < 0 && state.timeToFirstHit >= 0) {
    tips.push('<b>按 L 放技能</b>— 星枝短叉的「藤星爆」能范围伤害并点亮灯火');
  }
  return tips;
}
