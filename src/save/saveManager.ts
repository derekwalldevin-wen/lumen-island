import { BUILDINGS, MATERIALS, SAVE_VERSION, WEAPONS, ZONES } from '../data';
import { createInitialSave } from '../rules/gameRules';
import type { BuildingId, SaveData, ZoneId } from '../types';

const SAVE_KEY = 'lumen-island-quest:save:v1';
const BACKUP_KEY = 'lumen-island-quest:save:v1:backup';

const VALID_ZONES = new Set<string>(Object.keys(ZONES));
const VALID_MATERIALS = new Set<string>(Object.keys(MATERIALS));
const VALID_WEAPONS = new Set<string>(WEAPONS.map((weapon) => weapon.id));
/** Building id to the number of levels it actually defines. */
const BUILDING_MAX_LEVEL = new Map<string, number>(
  BUILDINGS.map((building) => [building.id, building.levels.length]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Validated string membership.
 *
 * The loader used to cast these straight through with `as ZoneId`, which pushed
 * the burden onto every consumer: a save naming an island that no longer exists
 * reached `ZONES[zoneId].safe` and threw on the first frame after loading. A
 * save is untrusted input, so membership is checked where it is read.
 */
function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : fallback;
}

/**
 * A level within what the building actually defines.
 *
 * `building.levels[current]` is read to price the next upgrade. An out of range
 * value makes that lookup undefined and the build panel dereferences it, so the
 * level is clamped here rather than trusted.
 */
function levelOr(value: unknown, buildingId: string): number {
  const max = BUILDING_MAX_LEVEL.get(buildingId) ?? 0;
  const raw = Math.floor(numberOr(value, 0));
  if (raw < 0) return 0;
  return Math.min(raw, max);
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
    equippedWeapon: oneOf(rawPlayer.equippedWeapon, VALID_WEAPONS, base.player.equippedWeapon),
    equippedCharm: typeof rawPlayer.equippedCharm === 'string'
      ? rawPlayer.equippedCharm as SaveData['player']['equippedCharm']
      : null,
    route: (rawPlayer.route === 'shadow' || rawPlayer.route === 'weaver' || rawPlayer.route === 'warden')
      ? rawPlayer.route
      : base.player.route,
  };

  for (const material of Object.keys(base.player.materials) as Array<keyof SaveData['player']['materials']>) {
    // read from the base list, not the raw list, so a material the game dropped
    // cannot reappear in the save it just loaded.
    const stored = VALID_MATERIALS.has(material) ? rawMaterials[material] : undefined;
    player.materials[material] = Math.max(0, Math.floor(numberOr(stored, 0)));
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
  // Built up from the known building list rather than spread from the raw
  // object: a spread keeps unknown ids, and the build panel iterates its own
  // definitions, so those entries would be dead weight that round-trips forever.
  const buildings: SaveData['world']['buildings'] = { forge: 0, cottage: 0, rainCanopy: 0, starChart: 0, beacon: 0 };
  if (isRecord(rawWorld.buildings)) {
    for (const buildingId of Object.keys(buildings) as BuildingId[]) {
      if (rawWorld.buildings[buildingId] !== undefined) {
        buildings[buildingId] = levelOr(rawWorld.buildings[buildingId], buildingId);
      }
    }
  }

  const world = {
    ...base.world,
    currentZone: oneOf(rawWorld.currentZone, VALID_ZONES, 'harbor' as ZoneId),
    x: numberOr(rawWorld.x, base.world.x),
    y: numberOr(rawWorld.y, base.world.y),
    questStage: Math.min(9, Math.max(0, Math.floor(numberOr(rawWorld.questStage, 0)))),
    defeatCounts,
    defeatedBosses: [...new Set(defeatedBosses)],
    buildings,
    discoveredZones: [...new Set(discoveredZones)],
    tutorialSeen: rawWorld.tutorialSeen === true,
    guideSeen: rawWorld.guideSeen === true,
    tutorialBattleSeen: rawWorld.tutorialBattleSeen === true,
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
