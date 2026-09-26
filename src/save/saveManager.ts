import { SAVE_VERSION } from '../data';
import { createInitialSave } from '../rules/gameRules';
import type { SaveData } from '../types';

const SAVE_KEY = 'lumen-island-quest:save:v1';
const BACKUP_KEY = 'lumen-island-quest:save:v1:backup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function normaliseSave(value: unknown, now = Date.now()): SaveData | null {
  if (!isRecord(value)) return null;
  const version = numberOr(value.version, 0);
  if (version !== SAVE_VERSION) return null;

  const base = createInitialSave(now);
  const rawPlayer = isRecord(value.player) ? value.player : {};
  const rawWorld = isRecord(value.world) ? value.world : {};
  const rawStats = isRecord(value.stats) ? value.stats : {};
  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const rawMaterials = isRecord(rawPlayer.materials) ? rawPlayer.materials : {};

  const player = {
    ...base.player,
    name: stringOr(rawPlayer.name, base.player.name),
    level: Math.max(1, Math.floor(numberOr(rawPlayer.level, 1))),
    xp: Math.max(0, numberOr(rawPlayer.xp, 0)),
    hp: Math.max(1, numberOr(rawPlayer.hp, base.player.hp)),
    gold: Math.max(0, numberOr(rawPlayer.gold, base.player.gold)),
    starlight: Math.max(0, numberOr(rawPlayer.starlight, 0)),
    potions: Math.max(0, Math.floor(numberOr(rawPlayer.potions, base.player.potions))),
    materials: { ...base.player.materials },
    inventory: Array.isArray(rawPlayer.inventory)
      ? rawPlayer.inventory.filter((item): item is string => typeof item === 'string')
      : base.player.inventory,
    equippedWeapon: stringOr(rawPlayer.equippedWeapon, base.player.equippedWeapon) as SaveData['player']['equippedWeapon'],
    equippedCharm: typeof rawPlayer.equippedCharm === 'string'
      ? rawPlayer.equippedCharm as SaveData['player']['equippedCharm']
      : null,
    route: (rawPlayer.route === 'shadow' || rawPlayer.route === 'weaver' || rawPlayer.route === 'warden')
      ? rawPlayer.route
      : base.player.route,
  };

  for (const material of Object.keys(base.player.materials) as Array<keyof SaveData['player']['materials']>) {
    player.materials[material] = Math.max(0, Math.floor(numberOr(rawMaterials[material], 0)));
  }

  const discoveredZones = Array.isArray(rawWorld.discoveredZones)
    ? rawWorld.discoveredZones.filter((zone): zone is SaveData['world']['currentZone'] => (
        zone === 'harbor' || zone === 'cloudstep' || zone === 'paperwood' || zone === 'rainbud' || zone === 'starfall'
      ))
    : base.world.discoveredZones;
  if (!discoveredZones.includes('harbor')) discoveredZones.unshift('harbor');

  const defeatedBosses = Array.isArray(rawWorld.defeatedBosses)
    ? rawWorld.defeatedBosses.filter((boss): boss is string => typeof boss === 'string')
    : [];
  const defeatCounts = isRecord(rawWorld.defeatCounts)
    ? Object.fromEntries(Object.entries(rawWorld.defeatCounts).map(([id, count]) => [id, Math.max(0, Math.floor(numberOr(count, 0)))]))
    : {};
  const buildings = isRecord(rawWorld.buildings)
    ? { ...(rawWorld.buildings as SaveData['world']['buildings']) }
    : {};

  const world = {
    ...base.world,
    currentZone: stringOr(rawWorld.currentZone, 'harbor') as SaveData['world']['currentZone'],
    x: numberOr(rawWorld.x, base.world.x),
    y: numberOr(rawWorld.y, base.world.y),
    questStage: Math.min(9, Math.max(0, Math.floor(numberOr(rawWorld.questStage, 0)))),
    defeatCounts,
    defeatedBosses: [...new Set(defeatedBosses)],
    buildings,
    discoveredZones: [...new Set(discoveredZones)],
    tutorialSeen: rawWorld.tutorialSeen === true,
    endingSeen: rawWorld.endingSeen === true,
  };

  return {
    version: SAVE_VERSION,
    createdAt: numberOr(value.createdAt, now),
    updatedAt: numberOr(value.updatedAt, now),
    player,
    world,
    stats: {
      battlesWon: Math.max(0, Math.floor(numberOr(rawStats.battlesWon, 0))),
      perfectDodges: Math.max(0, Math.floor(numberOr(rawStats.perfectDodges, 0))),
      bestCombo: Math.max(0, Math.floor(numberOr(rawStats.bestCombo, 0))),
      enemiesDefeated: Math.max(0, Math.floor(numberOr(rawStats.enemiesDefeated, 0))),
      playSeconds: Math.max(0, numberOr(rawStats.playSeconds, 0)),
      deaths: Math.max(0, Math.floor(numberOr(rawStats.deaths, 0))),
    },
    settings: {
      sfx: Math.min(1, Math.max(0, numberOr(rawSettings.sfx, base.settings.sfx))),
      music: Math.min(1, Math.max(0, numberOr(rawSettings.music, base.settings.music))),
      reducedMotion: rawSettings.reducedMotion === true,
      showTouch: rawSettings.showTouch !== false,
    },
  };
}

export class SaveManager {
  private storage: Storage | null;

  lastLoadRecovered = false;

  constructor(storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.storage = storage;
  }

  hasSave(): boolean {
    return Boolean(this.read(this.saveKey) ?? this.read(this.backupKey));
  }

  load(): SaveData | null {
    this.lastLoadRecovered = false;
    const primary = this.parse(this.read(this.saveKey));
    if (primary) return primary;

    const backup = this.parse(this.read(this.backupKey));
    if (backup) {
      this.lastLoadRecovered = true;
      return backup;
    }
    return null;
  }

  save(data: SaveData): boolean {
    if (!this.storage) return false;
    const payload = JSON.stringify({ ...data, updatedAt: Date.now() });
    try {
      const current = this.read(this.saveKey);
      if (current) this.storage.setItem(this.backupKey, current);
      this.storage.setItem(this.saveKey, payload);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.saveKey);
      this.storage?.removeItem(this.backupKey);
    } catch {
      // Storage cleanup is best-effort.
    }
  }

  private get saveKey(): string {
    return SAVE_KEY;
  }

  private get backupKey(): string {
    return BACKUP_KEY;
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private parse(raw: string | null): SaveData | null {
    if (!raw) return null;
    try {
      return normaliseSave(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
}
