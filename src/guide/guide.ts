import { QUEST_STAGES, ZONES } from '../data';
import type { SaveData, ZoneId, ZoneInteractable } from '../types';

/**
 * Onboarding layer. The base quest log only says *what* to do; this module adds
 * *where* to walk and *how* to trigger it, including the prerequisites the raw
 * quest chain leaves implicit (rain canopy before the rain garden, star chart
 * before the high platform).
 *
 * Everything here is pure data so it can be unit tested without a canvas.
 */

export type GuideTargetKind = 'interact' | 'grass';

export interface GuideTarget {
  kind: GuideTargetKind;
  id: string | null;
  label: string;
  x: number;
  y: number;
  instruction: string;
  inputHint: string;
}

export interface GuideStep {
  id: string;
  title: string;
  hint: string;
  progress: string;
  zone: ZoneId;
  zoneName: string;
  inputHint: string;
  complete: boolean;
  /** True when this step is a prerequisite detour rather than the headline quest. */
  detour: boolean;
}

export interface GuideMarker {
  x: number;
  y: number;
  label: string;
  kind: 'target' | 'gate';
}

export interface GuideState {
  step: GuideStep;
  questTitle: string;
  stepNumber: number;
  stepTotal: number;
  target: GuideTarget | null;
  needsTravel: boolean;
  marker: GuideMarker | null;
  distance: number | null;
  introVisible: boolean;
}

interface Anchor {
  zone: ZoneId;
  interactableId: string | null;
  grassIndex: number | null;
  label: string;
  inputHint: string;
  instruction: string;
  progress: (save: SaveData) => string;
  complete: (save: SaveData) => boolean;
}

interface Blueprint extends Anchor {
  id: string;
  travelHint: string;
  /** When this returns an anchor, the player must clear it before the main step. */
  prerequisite?: (save: SaveData) => Anchor | null;
  prerequisiteTitle?: string;
}

const BUILD_BOARD: Anchor = {
  zone: 'harbor',
  interactableId: 'home-build',
  grassIndex: null,
  label: '岛屋建造板',
  inputHint: 'E',
  instruction: '建造板还没准备好。回到灯火港西侧的岛屋建造板，按 E 打开并修复它。',
  progress: (save) => ((save.world.buildings.forge ?? 0) > 0 ? '建造板已可用' : '建造板待修复'),
  complete: (save) => (save.world.buildings.forge ?? 0) > 0,
};

const BLUEPRINTS: Blueprint[] = [
  {
    id: 'wake',
    zone: 'harbor',
    interactableId: 'keeper-luma',
    grassIndex: null,
    label: '灯塔守望者·露玛',
    inputHint: 'E',
    instruction: '从岛的最南端出发，向北走到广场中央。露玛在那里等你，按 E 交谈，接下第一份委托。',
    travelHint: '你已在灯火港，标记就在北边的广场上。',
    progress: () => '与露玛交谈',
    complete: (save) => save.world.questStage >= 1,
  },
  {
    id: 'learn',
    zone: 'cloudstep',
    interactableId: null,
    grassIndex: 0,
    label: '发光草丛',
    inputHint: '按住 J 攻击',
    instruction: '走进草丛会自动开战。攻击就是按住 J 或 空格 挥动星枝短叉，敌人头顶的血条打空就赢。',
    travelHint: '先走到岛南端的传送点，按 E 前往云阶草坡，然后踩进发光的草丛。',
    progress: (save) => `灯绒团 ${Math.min(save.world.defeatCounts.cloudPuff ?? 0, 3)} / 3`,
    complete: (save) => (save.world.defeatCounts.cloudPuff ?? 0) >= 3,
  },
  {
    id: 'forge',
    zone: 'harbor',
    interactableId: 'home-forge',
    grassIndex: null,
    label: '巡灯工坊',
    inputHint: 'E',
    instruction: '回到灯火港，走到东北侧的巡灯工坊，按 E 打开建造板，用战利品修复工坊。',
    travelHint: '先回灯火港，工坊在岛的东北角。',
    progress: (save) => ((save.world.buildings.forge ?? 0) > 0 ? '工坊已重新冒烟' : '工坊尚未修复'),
    complete: (save) => (save.world.buildings.forge ?? 0) > 0,
  },
  {
    id: 'woods',
    zone: 'paperwood',
    interactableId: null,
    grassIndex: 0,
    label: '发光草丛',
    inputHint: '按住 J 攻击',
    instruction: '纸灯林的草丛会刷出纸鸢影。踩进去自动开战，按住 J 或 空格 挥武器打空它的血条。',
    travelHint: '云阶草坡北端有一道纸灯林之门，走过去按 E，然后踩进草丛。',
    progress: (save) => `纸鸢影 ${Math.min(save.world.defeatCounts.paperKite ?? 0, 5)} / 5`,
    complete: (save) => (save.world.defeatCounts.paperKite ?? 0) >= 5,
  },
  {
    id: 'moth',
    zone: 'paperwood',
    interactableId: 'lantern-boss',
    grassIndex: null,
    label: '吞灯蛹巢',
    inputHint: 'E',
    instruction: '走到纸灯林最深处的吞灯蛹巢，按 E 挑战守关者。战斗方式和之前一样：按住 J 攻击。',
    travelHint: '吞灯蛹巢在纸灯林北端的巢门。',
    progress: (save) => (save.world.defeatedBosses.includes('lanternMoth') ? '吞灯蛹已驱散' : '吞灯蛹仍在巢中'),
    complete: (save) => save.world.defeatedBosses.includes('lanternMoth'),
  },
  {
    id: 'rain',
    zone: 'rainbud',
    interactableId: null,
    grassIndex: 0,
    label: '发光草丛',
    inputHint: '按住 J 攻击',
    instruction: '雨芽花园的草丛里住着星砂哨兵。踩进去开战，按住 J 或 空格 攻击，打满 3 个。',
    travelHint: '雨芽花园在纸灯林东北方向，需要先修好集雨棚才会开门。',
    prerequisite: (save) => ((save.world.buildings.rainCanopy ?? 0) > 0
      ? null
      : {
        ...BUILD_BOARD,
        label: '集雨棚',
        instruction: '雨芽花园的门还锁着。先回灯火港的岛屋建造板，按 E 修复「集雨棚」，花园才会开放。',
        progress: () => '集雨棚待修复',
        complete: (inner) => (inner.world.buildings.rainCanopy ?? 0) > 0,
      }),
    prerequisiteTitle: '先修好集雨棚',
    progress: (save) => `星砂哨兵 ${Math.min(save.world.defeatCounts.starSentinel ?? 0, 3)} / 3`,
    complete: (save) => (save.world.defeatCounts.starSentinel ?? 0) >= 3,
  },
  {
    id: 'bell',
    zone: 'rainbud',
    interactableId: 'bell-boss',
    grassIndex: null,
    label: '雨幕钟塔',
    inputHint: 'E',
    instruction: '在雨幕钟塔按 E 挑战雨幕守铃者，敲响长夜里的第一声钟。',
    travelHint: '雨幕钟塔在雨芽花园的北端高塔。',
    prerequisite: (save) => ((save.world.buildings.rainCanopy ?? 0) > 0
      ? null
      : {
        ...BUILD_BOARD,
        label: '集雨棚',
        instruction: '钟塔的路线需要集雨棚。先回灯火港的岛屋建造板，按 E 修复它。',
        progress: () => '集雨棚待修复',
        complete: (inner) => (inner.world.buildings.rainCanopy ?? 0) > 0,
      }),
    prerequisiteTitle: '先修好集雨棚',
    progress: (save) => (save.world.defeatedBosses.includes('bellWarden') ? '钟塔已安静' : '钟塔仍在鸣响'),
    complete: (save) => save.world.defeatedBosses.includes('bellWarden'),
  },
  {
    id: 'stars',
    zone: 'starfall',
    interactableId: null,
    grassIndex: 0,
    label: '发光草丛',
    inputHint: '按住 J 攻击',
    instruction: '观星高台的草丛里有暮影爪牙。踩进去开战，按住 J 或 空格 攻击，清掉 4 个。',
    travelHint: '观星高台在雨芽花园东北方向的星门之后。',
    prerequisite: (save) => ((save.world.buildings.starChart ?? 0) > 0
      ? null
      : {
        ...BUILD_BOARD,
        label: '星图台',
        instruction: '观星高台还没有路。先回灯火港的岛屋建造板，按 E 修复「星图台」，高台才会开放。',
        progress: () => '星图台待修复',
        complete: (inner) => (inner.world.buildings.starChart ?? 0) > 0,
      }),
    prerequisiteTitle: '先修好星图台',
    progress: (save) => {
      const count = (save.world.defeatCounts.inkBat ?? 0) + (save.world.defeatCounts.starSentinel ?? 0);
      return `暮影爪牙 ${Math.min(count, 4)} / 4`;
    },
    complete: (save) => (save.world.defeatCounts.inkBat ?? 0) + (save.world.defeatCounts.starSentinel ?? 0) >= 4,
  },
  {
    id: 'final',
    zone: 'starfall',
    interactableId: 'final-boss',
    grassIndex: null,
    label: '无星王座',
    inputHint: 'E',
    instruction: '登上无星王座，按 E 挑战无星夜枭，把长夜的最后一声钟敲回来。',
    travelHint: '无星王座在观星高台的最北端。',
    prerequisite: (save) => ((save.world.buildings.starChart ?? 0) > 0
      ? null
      : {
        ...BUILD_BOARD,
        label: '星图台',
        instruction: '王座的路还没有点亮。先回灯火港的岛屋建造板，按 E 修复「星图台」。',
        progress: () => '星图台待修复',
        complete: (inner) => (inner.world.buildings.starChart ?? 0) > 0,
      }),
    prerequisiteTitle: '先修好星图台',
    progress: (save) => (save.world.endingSeen ? '终夜回响' : '无星夜枭仍在王座'),
    complete: (save) => save.world.endingSeen,
  },
];

/** Quest stage -> blueprint index. Stage 9 (free roam) keeps the final marker visible. */
const STAGE_TO_BLUEPRINT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8];

export function guideStepCount(): number {
  return BLUEPRINTS.length;
}

export function resolveGuide(save: SaveData, currentZone: ZoneId, playerX: number, playerY: number): GuideState {
  const stage = Math.min(Math.max(0, save.world.questStage), STAGE_TO_BLUEPRINT.length - 1);
  const blueprint = BLUEPRINTS[STAGE_TO_BLUEPRINT[stage] ?? 0]!;
  const quest = QUEST_STAGES[Math.min(stage, QUEST_STAGES.length - 1)]!;

  const detour = blueprint.prerequisite?.(save) ?? null;
  const anchor: Anchor = detour ?? blueprint;
  const sameZone = anchor.zone === currentZone;
  const target = sameZone ? buildTarget(anchor) : null;

  let marker: GuideMarker | null = null;
  let needsTravel = false;
  if (target) {
    marker = { x: target.x, y: target.y, label: target.label, kind: 'target' };
  } else {
    needsTravel = true;
    const gate = findGateToward(currentZone, anchor.zone);
    if (gate) marker = { x: gate.x, y: gate.y, label: gate.label, kind: 'gate' };
  }

  const step: GuideStep = {
    id: blueprint.id,
    title: blueprint.prerequisiteTitle ?? quest.title,
    hint: needsTravel ? blueprint.travelHint : anchor.instruction,
    progress: anchor.progress(save),
    zone: anchor.zone,
    zoneName: ZONES[anchor.zone].name,
    inputHint: anchor.inputHint,
    complete: anchor.complete(save),
    detour: Boolean(detour),
  };

  return {
    step,
    questTitle: quest.title,
    stepNumber: Math.min(stage, BLUEPRINTS.length - 1) + 1,
    stepTotal: BLUEPRINTS.length,
    target,
    needsTravel,
    marker,
    distance: marker ? Math.round(Math.hypot(marker.x - playerX, marker.y - playerY)) : null,
    introVisible: !save.world.guideSeen,
  };
}

function findInteractable(zone: ZoneId, id: string): ZoneInteractable | null {
  return ZONES[zone].interactables.find((item) => item.id === id) ?? null;
}

function buildTarget(anchor: Anchor): GuideTarget | null {
  if (anchor.interactableId) {
    const interactable = findInteractable(anchor.zone, anchor.interactableId);
    if (!interactable) return null;
    return {
      kind: 'interact',
      id: interactable.id,
      label: anchor.label,
      x: interactable.x,
      y: interactable.y,
      instruction: anchor.instruction,
      inputHint: anchor.inputHint,
    };
  }
  if (anchor.grassIndex !== null) {
    const patch = ZONES[anchor.zone].grass[anchor.grassIndex];
    if (!patch) return null;
    return {
      kind: 'grass',
      id: null,
      label: anchor.label,
      x: patch.x + patch.w / 2,
      y: patch.y + patch.h / 2,
      instruction: anchor.instruction,
      inputHint: anchor.inputHint,
    };
  }
  return null;
}

/**
 * Finds the portal/exit in `from` that moves the player toward `to`.
 * Zones form a chain (harbor -> cloudstep -> paperwood -> rainbud -> starfall),
 * so a destination several hops away is reached by first walking to the gate for
 * the next zone on the shortest path. Breadth-first search keeps that honest
 * instead of hard-coding a "go home first" rule.
 */
function findGateToward(from: ZoneId, to: ZoneId): { x: number; y: number; label: string } | null {
  if (from === to) return null;
  const direct = ZONES[from].interactables.find((item) => item.target === to);
  if (direct) return { x: direct.x, y: direct.y, label: direct.label };

  const queue: ZoneId[] = [from];
  const visited = new Set<ZoneId>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const item of ZONES[current].interactables) {
      const next = item.target;
      if (!next || visited.has(next)) continue;
      // The first hop out of `from` is what the player must walk to right now.
      if (current === from) return { x: item.x, y: item.y, label: item.label };
      visited.add(next);
      queue.push(next);
    }
  }
  return null;
}

/** True when the player stands close enough to the marker to actually trigger it. */
export function isAtGuideMarker(state: GuideState, playerX: number, playerY: number): boolean {
  const marker = state.marker;
  if (!marker) return false;
  const reach = marker.kind === 'gate' ? 96 : state.target?.kind === 'grass' ? 130 : 84;
  return Math.hypot(marker.x - playerX, marker.y - playerY) <= reach;
}
