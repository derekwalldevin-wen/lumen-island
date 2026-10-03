import { describe, expect, it } from 'vitest';
import { BUILDINGS, SAVE_VERSION, WEAPONS, ZONES } from '../src/data';
import { createInitialSave } from '../src/rules/gameRules';
import { normaliseSave, SaveManager } from '../src/save/saveManager';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { BuildingId, MaterialId, SaveData, ZoneId } from '../src/types';

/**
 * A save file outlives the build that wrote it. Every field here can be renamed,
 * removed, or made stricter in a later build, and a returning player must not
 * lose progress or land the game in a state that throws on the first frame.
 *
 * These tests are mostly about hostile input: a save edited by hand, truncated by
 * a crash mid-write, or written by a build whose field names have since changed.
 * The failure that matters is not "the save was rejected", it is "the game
 * accepted a save it cannot use and then crashed while drawing".
 */

/** Minimal in-memory Storage, so the manager can be tested without a browser. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

function corrupt(mutate: (raw: Record<string, unknown>) => void): Record<string, unknown> {
  const save = createInitialSave(1700000000000) as unknown as Record<string, unknown>;
  mutate(save);
  return save;
}

describe('save version handling', () => {
  it('keeps SAVE_VERSION at a number the loader can compare', () => {
    expect(typeof SAVE_VERSION).toBe('number');
    expect(Number.isInteger(SAVE_VERSION)).toBe(true);
  });

  it('rejects a save from a different version rather than half-reading it', () => {
    // Returning null makes the caller start fresh, which is honest. Half-reading
    // a newer save is what silently discards progress.
    const result = normaliseSave(corrupt((raw) => { raw.version = SAVE_VERSION + 1; }));
    expect(result).toBeNull();
  });

  it('rejects a save with no version at all', () => {
    expect(normaliseSave(corrupt((raw) => { delete raw.version; }))).toBeNull();
  });

  it('round-trips a current save without losing anything', () => {
    const original = createInitialSave(1700000000000);
    original.player.gold = 4242;
    original.player.materials.lampPaper = 17;
    original.world.questStage = 5;
    original.world.buildings.forge = 2;
    original.world.discoveredZones = ['harbor', 'cloudstep'];
    original.world.x = 321;
    original.world.y = 654;
    const restored = normaliseSave(JSON.parse(JSON.stringify(original)) as unknown);
    expect(restored).not.toBeNull();
    expect(restored!.player.gold).toBe(4242);
    expect(restored!.player.materials.lampPaper).toBe(17);
    expect(restored!.world.questStage).toBe(5);
    expect(restored!.world.buildings.forge).toBe(2);
    expect(restored!.world.x).toBe(321);
    expect(restored!.world.y).toBe(654);
  });

  it('survives every field being dropped', () => {
    // Simulates a build that renamed its save shape. Nothing should be lost that
    // has a sensible default, and nothing should throw.
    const bare = { version: SAVE_VERSION };
    const result = normaliseSave(bare);
    expect(result).not.toBeNull();
    expect(result!.player.level).toBeGreaterThanOrEqual(1);
    expect(result!.world.currentZone).toBe('harbor');
  });
});

describe('hostile field values', () => {
  it('never returns a save whose zone is not a real island', () => {
    // currentZone is cast to ZoneId without a membership check in the loader.
    // A hand-edited or truncated save naming a zone that no longer exists would
    // otherwise reach ZONES[...] lookups and throw during render.
    for (const bogus of ['atlantis', '', 'HARBOR', 'harbor ', 'toString']) {
      const result = normaliseSave(corrupt((raw) => {
        (raw.world as Record<string, unknown>).currentZone = bogus;
      }));
      expect(result, `zone "${bogus}" was accepted`).not.toBeNull();
      if (!result) continue;
      const zone = ZONES[result.world.currentZone];
      expect(zone, `zone "${bogus}" resolved to nothing`).toBeDefined();
      expect(() => new WorldRuntime(result)).not.toThrow();
    }
  });

  it('never returns a save with a building level no build has', () => {
    // building.levels[current] is read for the next upgrade cost. An out of
    // range level makes `next` undefined, and the build panel dereferences it.
    for (const level of [-5, 99, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = normaliseSave(corrupt((raw) => {
        (raw.world as Record<string, unknown>).buildings = { forge: level };
      }));
      expect(result, `forge level ${level} was rejected entirely`).not.toBeNull();
      if (!result) continue;
      const current = result.world.buildings.forge ?? 0;
      const definition = BUILDINGS.find((building) => building.id === 'forge')!;
      expect(current, `forge level ${level} kept an impossible value`).toBeGreaterThanOrEqual(0);
      expect(current).toBeLessThanOrEqual(definition.levels.length);
      expect(() => definition.levels[current]).not.toThrow();
    }
  });

  it('drops building ids the game does not define', () => {
    const result = normaliseSave(corrupt((raw) => {
      (raw.world as Record<string, unknown>).buildings = { forge: 1, spaceStation: 4 };
    }));
    expect(result).not.toBeNull();
    const known = new Set<string>(BUILDINGS.map((building) => building.id as string));
    for (const id of Object.keys(result!.world.buildings)) {
      expect(known.has(id), `unknown building "${id}" survived the load`).toBe(true);
    }
    expect(result!.world.buildings.forge).toBe(1);
  });

  it('ignores materials the game does not track', () => {
    const result = normaliseSave(corrupt((raw) => {
      const player = raw.player as Record<string, unknown>;
      player.materials = { lampPaper: 3, unobtanium: 99 };
    }));
    expect(result).not.toBeNull();
    expect(result!.player.materials.lampPaper).toBe(3);
    expect(Object.keys(result!.player.materials).sort()).toEqual(
      Object.keys(createInitialSave(0).player.materials).sort(),
    );
  });

  it('never returns a save with negative or non-finite resources', () => {
    const result = normaliseSave(corrupt((raw) => {
      const player = raw.player as Record<string, unknown>;
      player.gold = -500;
      player.xp = Number.NaN;
      player.starlight = Number.NEGATIVE_INFINITY;
      player.materials = { lampPaper: -9 };
    }));
    expect(result).not.toBeNull();
    expect(result!.player.gold).toBe(0);
    expect(result!.player.xp).toBe(0);
    expect(result!.player.starlight).toBe(0);
    expect(result!.player.materials.lampPaper).toBe(0);
  });

  it('never returns a save with a non-integer quest stage outside the stage list', () => {
    for (const stage of [-3, 12, 4.7, Number.NaN]) {
      const result = normaliseSave(corrupt((raw) => {
        (raw.world as Record<string, unknown>).questStage = stage;
      }));
      expect(result).not.toBeNull();
      expect(result!.world.questStage).toBeGreaterThanOrEqual(0);
      expect(result!.world.questStage).toBeLessThanOrEqual(9);
      expect(Number.isInteger(result!.world.questStage)).toBe(true);
    }
  });

  it('rejects non-object payloads without throwing', () => {
    for (const junk of [null, undefined, 0, '', 'nope', true, [], () => {}]) {
      expect(() => normaliseSave(junk)).not.toThrow();
    }
  });

  it('rejects JSON that is not a save object', () => {
    // An array or a bare scalar is not a record, so it is rejected outright.
    // That is the correct outcome: there is nothing to salvage.
    for (const junk of ['null', '[]', '"text"', '42', 'true']) {
      expect(normaliseSave(JSON.parse(junk) as unknown), `accepted ${junk}`).toBeNull();
    }
  });

  it('ignores duplicate zone and boss entries', () => {
    const result = normaliseSave(corrupt((raw) => {
      const world = raw.world as Record<string, unknown>;
      world.discoveredZones = ['harbor', 'harbor', 'cloudstep'];
      world.defeatedBosses = ['lanternMoth', 'lanternMoth'];
    }));
    expect(result!.world.discoveredZones).toEqual(['harbor', 'cloudstep']);
    expect(result!.world.defeatedBosses).toEqual(['lanternMoth']);
  });

  it('always keeps the starting island discovered', () => {
    // Many rules assume the harbour is visited; losing it would strand progress.
    const result = normaliseSave(corrupt((raw) => {
      (raw.world as Record<string, unknown>).discoveredZones = ['cloudstep', 'starfall'];
    }));
    expect(result!.world.discoveredZones).toContain('harbor');
  });

  it('drops unknown zones from the discovered list', () => {
    const result = normaliseSave(corrupt((raw) => {
      (raw.world as Record<string, unknown>).discoveredZones = ['harbor', 'atlantis', 'cloudstep'];
    }));
    expect(result!.world.discoveredZones).toEqual(['harbor', 'cloudstep']);
  });
});

describe('save manager resilience', () => {
  it('reports no save when storage is empty', () => {
    const manager = new SaveManager(new MemoryStorage());
    expect(manager.hasSave()).toBe(false);
    expect(manager.load()).toBeNull();
    expect(manager.lastLoadRecovered).toBe(false);
  });

  it('falls back to the backup when the primary is corrupt', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    const save = createInitialSave(1700000000000);
    save.player.gold = 100;
    // First write becomes the primary, second shifts it to the backup.
    expect(manager.save(save)).toBe(true);
    save.player.gold = 200;
    expect(manager.save(save)).toBe(true);
    // Corrupt the primary only.
    for (const key of Object.keys(storage as unknown as Record<string, string>)) void key;
    storage.setItem('lumen-island-quest:save:v1', '{ this is not json');
    const loaded = manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.player.gold).toBe(100);
    expect(manager.lastLoadRecovered).toBe(true);
  });

  it('returns null rather than throwing on unparseable storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('lumen-island-quest:save:v1', 'not json at all');
    storage.setItem('lumen-island-quest:save:v1:backup', 'also not json');
    const manager = new SaveManager(storage);
    expect(() => manager.load()).not.toThrow();
    expect(manager.load()).toBeNull();
  });

  it('survives a storage that throws on every operation', () => {
    // Private browsing modes and some embedded webviews throw on access. The
    // game has to keep running, just without persistence.
    const hostile = {
      length: 0,
      clear: () => { throw new Error('denied'); },
      getItem: () => { throw new Error('denied'); },
      key: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    const manager = new SaveManager(hostile);
    expect(() => manager.load()).not.toThrow();
    expect(manager.load()).toBeNull();
    expect(manager.save(createInitialSave(0))).toBe(false);
    expect(() => manager.clear()).not.toThrow();
  });

  it('reports failure instead of pretending to save when storage is absent', () => {
    const manager = new SaveManager(null);
    expect(manager.save(createInitialSave(0))).toBe(false);
    expect(manager.hasSave()).toBe(false);
  });

  it('produces a save the loader accepts after a round trip through storage', () => {
    const manager = new SaveManager(new MemoryStorage());
    const save = createInitialSave(1700000000000);
    save.world.questStage = 4;
    save.world.buildings = { forge: 1, starChart: 1 };
    manager.save(save);
    const loaded = manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.world.questStage).toBe(4);
    expect(loaded!.world.buildings.starChart).toBe(1);
  });
});

describe('loaded saves are playable', () => {
  /**
   * The strongest check available without a browser: build the runtime objects
   * the renderer reads from a loaded save. A field the loader passes through but
   * the renderer assumes will throw here rather than on the player's screen.
   */
  const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

  it('constructs a world runtime from every loaded zone without throwing', () => {
    for (const zoneId of ZONE_IDS) {
      const save = normaliseSave(corrupt((raw) => {
        (raw.world as Record<string, unknown>).currentZone = zoneId;
      }));
      expect(save).not.toBeNull();
      expect(() => new WorldRuntime(save!)).not.toThrow();
      expect(new WorldRuntime(save!).currentZone.id).toBe(zoneId);
    }
  });

  it('places the player on walkable ground for any loaded position', () => {
    // A save from a build with different zone dimensions, or hand-edited, can
    // land the player inside a rock or off the island edge.
    for (const zoneId of ZONE_IDS) {
      for (const [x, y] of [[0, 0], [99999, 99999], [-500, -500], [NaN, NaN]]) {
        const save = normaliseSave(corrupt((raw) => {
          const world = raw.world as Record<string, unknown>;
          world.currentZone = zoneId;
          world.x = x;
          world.y = y;
        }));
        if (!save) continue;
        const world = new WorldRuntime(save);
        const zone = world.currentZone;
        expect(world.x).toBeGreaterThanOrEqual(0);
        expect(world.x).toBeLessThanOrEqual(zone.width);
        expect(world.y).toBeGreaterThanOrEqual(0);
        expect(world.y).toBeLessThanOrEqual(zone.height);
        expect(world.isWalkable(world.x, world.y), `${zoneId} left the player off-island`).toBe(true);
      }
    }
  });

  it('resolves a weapon for every equipped id a save can carry', () => {
    const ids = [...WEAPONS.map((weapon) => weapon.id), 'weaponFromTheFuture'];
    for (const id of ids) {
      const save = normaliseSave(corrupt((raw) => {
        (raw.player as Record<string, unknown>).equippedWeapon = id;
      }));
      expect(save).not.toBeNull();
      const found = WEAPONS.find((weapon) => weapon.id === save!.player.equippedWeapon);
      // The renderer falls back to the first weapon, so an unknown id is safe but
      // should not be stored as if it were valid.
      expect(found !== undefined || save!.player.equippedWeapon !== id).toBe(true);
      expect(() => WEAPONS.find((weapon) => weapon.id === save!.player.equippedWeapon) ?? WEAPONS[0]!).not.toThrow();
    }
  });

  it('keeps building levels addressable for every building id', () => {
    const ids = [...BUILDINGS.map((building) => building.id), 'spaceStation' as BuildingId];
    for (const id of ids) {
      const save = normaliseSave(corrupt((raw) => {
        (raw.world as Record<string, unknown>).buildings = { [id]: 1 };
      }));
      expect(save).not.toBeNull();
      for (const building of BUILDINGS) {
        const level = save!.world.buildings[building.id] ?? 0;
        expect(() => building.levels[level]).not.toThrow();
      }
    }
  });

  it('produces material totals the rules can spend without going negative', () => {
    const save = normaliseSave(corrupt((raw) => {
      const player = raw.player as Record<string, unknown>;
      player.materials = { lampPaper: 2, oldGear: 1, cloudFluff: 0, rainPearl: 0, starSand: 0, inkWing: 0, moonThread: 0 };
    }));
    expect(save).not.toBeNull();
    let total = 0;
    for (const material of Object.keys(save!.player.materials) as MaterialId[]) {
      const amount = save!.player.materials[material];
      expect(amount).toBeGreaterThanOrEqual(0);
      total += amount;
    }
    expect(total).toBeGreaterThanOrEqual(0);
  });
});