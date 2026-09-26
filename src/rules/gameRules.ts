import { BUILDINGS, CHARMS, ENEMIES, MATERIALS, QUEST_STAGES, WEAPONS, ZONES } from '../data';
import type {
  BuildingId,
  CharmId,
  MaterialId,
  PlayerSave,
  PlayerStats,
  RecipeCost,
  SaveData,
  WeaponDefinition,
  WeaponId,
  ZoneId,
} from '../types';
import { SAVE_VERSION } from '../data';

export const STAT_ICONS = {
  maxHp: '♥',
  attack: '⚔',
  defense: '◆',
  crit: '%',
  critDamage: '×',
  moveSpeed: '↝',
  flameGain: '✦',
  potionPower: '＋',
} as const;

export function createInitialSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    player: {
      name: '小巡',
      level: 1,
      xp: 0,
      hp: 100,
      gold: 35,
      starlight: 0,
      potions: 3,
      materials: {
        cloudFluff: 0,
        lampPaper: 0,
        rainPearl: 0,
        starSand: 0,
        inkWing: 0,
        oldGear: 0,
        moonThread: 0,
      },
      inventory: ['sprigFork'],
      equippedWeapon: 'sprigFork',
      equippedCharm: null,
      route: 'warden',
    },
    world: {
      currentZone: 'harbor',
      x: ZONES.harbor.spawn.x,
      y: ZONES.harbor.spawn.y,
      questStage: 0,
      defeatCounts: {},
      defeatedBosses: [],
      buildings: {},
      discoveredZones: ['harbor'],
      tutorialSeen: false,
      endingSeen: false,
    },
    stats: {
      battlesWon: 0,
      perfectDodges: 0,
      bestCombo: 0,
      enemiesDefeated: 0,
      playSeconds: 0,
      deaths: 0,
    },
    settings: {
      sfx: 0.72,
      music: 0.45,
      reducedMotion: false,
      showTouch: true,
    },
  };
}

export function xpForNextLevel(level: number): number {
  return Math.round(90 + (level - 1) * 58 + Math.pow(level - 1, 1.7) * 4);
}

export function getPlayerStats(save: SaveData): PlayerStats {
  const level = Math.max(1, save.player.level);
  const weapon = WEAPONS.find((item) => item.id === save.player.equippedWeapon) ?? WEAPONS[0]!;
  const charm = save.player.equippedCharm
    ? CHARMS.find((item) => item.id === save.player.equippedCharm)
    : undefined;
  const route = save.player.route;
  const cottage = save.world.buildings.cottage ?? 0;
  const chart = save.world.buildings.starChart ?? 0;

  const stats: PlayerStats = {
    level,
    xp: save.player.xp,
    maxHp: 100 + (level - 1) * 16 + cottage * 35,
    hp: 0,
    attack: 14 + (level - 1) * 4 + weapon.damage,
    defense: 4 + Math.floor(level * 0.9) + (route === 'warden' ? level * 2 : 0),
    crit: 0.08 + (route === 'shadow' ? level * 0.008 : 0),
    critDamage: 1.55 + (route === 'shadow' ? level * 0.008 : 0),
    moveSpeed: 164 + (route === 'weaver' ? 7 : 0),
    flameGain: 1 + (route === 'shadow' ? 0.08 : 0) + chart * 0.15,
    potionPower: 38 + level * 3 + (route === 'warden' ? level * 2 : 0) + cottage * 5,
  };

  if (charm) {
    stats.maxHp += charm.bonus.maxHp ?? 0;
    stats.attack += charm.bonus.attack ?? 0;
    stats.defense += charm.bonus.defense ?? 0;
    stats.crit += charm.bonus.crit ?? 0;
    stats.critDamage += charm.bonus.critDamage ?? 0;
    stats.moveSpeed += charm.bonus.moveSpeed ?? 0;
    stats.flameGain += charm.bonus.flameGain ?? 0;
    stats.potionPower += charm.bonus.potionPower ?? 0;
  }

  stats.hp = Math.min(Math.max(1, save.player.hp), stats.maxHp);
  return stats;
}

export interface XpResult {
  levelsGained: number;
  hpBefore: number;
  hpAfter: number;
}

export function awardXp(save: SaveData, amount: number): XpResult {
  const before = getPlayerStats(save).maxHp;
  save.player.xp += Math.max(0, Math.round(amount));
  let levelsGained = 0;
  while (save.player.xp >= xpForNextLevel(save.player.level)) {
    save.player.xp -= xpForNextLevel(save.player.level);
    save.player.level += 1;
    levelsGained += 1;
  }
  const after = getPlayerStats(save).maxHp;
  return { levelsGained, hpBefore: before, hpAfter: after };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function damageRoll(
  attack: number,
  defense: number,
  criticalChance: number,
  criticalDamage: number,
  random: number,
  multiplier = 1,
): { amount: number; critical: boolean; blocked: number } {
  const critical = random < criticalChance;
  const variance = 0.9 + random * 0.2;
  const raw = attack * multiplier * variance * (critical ? criticalDamage : 1);
  const blocked = Math.max(0, raw - defense * 0.72);
  return {
    amount: Math.max(1, Math.round(blocked)),
    critical,
    blocked: Math.round(Math.max(0, raw - blocked)),
  };
}

export function flameStage(flame: number): 0 | 1 | 2 | 3 {
  if (flame >= 78) return 3;
  if (flame >= 48) return 2;
  if (flame >= 22) return 1;
  return 0;
}

export function flameMultiplier(flame: number): number {
  return 1 + [0, 0.08, 0.16, 0.27][flameStage(flame)]!;
}

export function canAfford(save: SaveData, cost: RecipeCost): boolean {
  if (save.player.gold < cost.gold) return false;
  return (Object.entries(cost.materials) as Array<[MaterialId, number | undefined]>).every(
    ([material, amount]) => save.player.materials[material] >= (amount ?? 0),
  );
}

export function payCost(save: SaveData, cost: RecipeCost): boolean {
  if (!canAfford(save, cost)) return false;
  save.player.gold -= cost.gold;
  for (const [material, amount] of Object.entries(cost.materials) as Array<[MaterialId, number | undefined]>) {
    if (amount) save.player.materials[material] -= amount;
  }
  return true;
}

export function weaponById(id: WeaponId): WeaponDefinition {
  return WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0]!;
}

export function canCraft(save: SaveData, id: string): boolean {
  const weapon = WEAPONS.find((item) => item.id === id);
  const charm = CHARMS.find((item) => item.id === id);
  const item = weapon ?? charm;
  if (!item) return false;
  if (save.player.inventory.includes(id)) return false;
  if ('requiredLevel' in item && save.player.level < item.requiredLevel) return false;
  if ((save.world.buildings.forge ?? 0) < 1) return false;
  const forgeLevel = save.world.buildings.forge ?? 0;
  if ('requiredLevel' in item && item.requiredLevel > forgeLevel * 5 + 1) return false;
  return canAfford(save, item.recipe);
}

export function craft(save: SaveData, id: string): boolean {
  const item = WEAPONS.find((weapon) => weapon.id === id) ?? CHARMS.find((charm) => charm.id === id);
  if (!item || !canCraft(save, id)) return false;
  if (!payCost(save, item.recipe)) return false;
  save.player.inventory.push(id);
  return true;
}

export function equipItem(save: SaveData, id: string): boolean {
  if (!save.player.inventory.includes(id)) return false;
  const weapon = WEAPONS.find((item) => item.id === id);
  const charm = CHARMS.find((item) => item.id === id);
  if (weapon) save.player.equippedWeapon = weapon.id;
  if (charm) save.player.equippedCharm = charm.id;
  return true;
}

export function buildingLevel(save: SaveData, id: BuildingId): number {
  return save.world.buildings[id] ?? 0;
}

export function canBuild(save: SaveData, id: BuildingId): boolean {
  const definition = BUILDINGS.find((building) => building.id === id);
  if (!definition) return false;
  const current = buildingLevel(save, id);
  const next = definition.levels[current];
  return Boolean(next && canAfford(save, next.cost));
}

export function build(save: SaveData, id: BuildingId): boolean {
  const definition = BUILDINGS.find((building) => building.id === id);
  if (!definition) return false;
  const current = buildingLevel(save, id);
  const next = definition.levels[current];
  if (!next || !canBuild(save, id)) return false;
  if (!payCost(save, next.cost)) return false;
  save.world.buildings[id] = next.level;
  return true;
}

export function getQuestText(save: SaveData): { stage: number; title: string; hint: string; target: string; progress: string } {
  const stage = Math.min(save.world.questStage, QUEST_STAGES.length - 1);
  const quest = QUEST_STAGES[stage]!;
  let progress = quest.targetText;

  if (quest.id === 'learn') {
    const count = save.world.defeatCounts.cloudPuff ?? 0;
    progress = `灯绒团 ${Math.min(count, 3)} / 3`;
  } else if (quest.id === 'woods') {
    const count = save.world.defeatCounts.paperKite ?? 0;
    progress = `纸鸢影 ${Math.min(count, 5)} / 5`;
  } else if (quest.id === 'rain') {
    const count = save.world.defeatCounts.starSentinel ?? 0;
    progress = `星砂哨兵 ${Math.min(count, 3)} / 3`;
  } else if (quest.id === 'stars') {
    const count = save.world.defeatCounts.inkBat + (save.world.defeatCounts.starSentinel ?? 0);
    progress = `暮影爪牙 ${Math.min(count, 4)} / 4`;
  }

  return { stage, title: quest.title, hint: quest.hint, target: quest.targetText, progress };
}

export function advanceQuest(save: SaveData): boolean {
  if (save.world.questStage >= QUEST_STAGES.length - 1) return false;
  save.world.questStage += 1;
  return true;
}

export function isZoneUnlocked(save: SaveData, zoneId: ZoneId): boolean {
  const zone = ZONES[zoneId];
  if (zone.safe) return true;
  if (save.world.questStage < zone.requiredStage) return false;
  if (zoneId === 'cloudstep') return true;
  if (zoneId === 'paperwood') return Boolean(save.world.buildings.forge);
  if (zoneId === 'rainbud') return save.world.defeatedBosses.includes('lanternMoth') && Boolean(save.world.buildings.rainCanopy);
  if (zoneId === 'starfall') return save.world.defeatedBosses.includes('bellWarden') && Boolean(save.world.buildings.starChart);
  return false;
}

export function canInteractWith(save: SaveData, interactableId: string): boolean {
  const stage = save.world.questStage;
  if (interactableId === 'keeper-luma') return stage === 0;
  if (interactableId === 'home-forge') return stage === 2;
  if (interactableId === 'lantern-boss') return stage === 4;
  if (interactableId === 'bell-boss') return stage === 6;
  if (interactableId === 'final-boss') return stage === 8;
  if (interactableId === 'paper-gate') return stage >= 3 && isZoneUnlocked(save, 'paperwood');
  if (interactableId === 'rain-gate') return stage >= 5 && isZoneUnlocked(save, 'rainbud');
  if (interactableId === 'star-gate') return stage >= 7 && isZoneUnlocked(save, 'starfall');
  return true;
}

export function inventoryCount(save: SaveData, id: string): number {
  return save.player.inventory.filter((item) => item === id).length;
}

export function describeMaterialAmount(cost: RecipeCost): string {
  const parts = [`${cost.gold} 铜币`];
  for (const [id, amount] of Object.entries(cost.materials) as Array<[MaterialId, number | undefined]>) {
    if (amount) parts.push(`${MATERIALS[id]?.name ?? id} × ${amount}`);
  }
  return parts.join(' · ');
}

export function enemyLabel(id: string): string {
  return ENEMIES[id]?.name ?? id;
}

export function charmLabel(id: CharmId): string {
  return CHARMS.find((charm) => charm.id === id)?.name ?? id;
}
