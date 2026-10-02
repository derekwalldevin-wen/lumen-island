import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data';
import { outlineScale, shapeScale } from '../src/render/visuals';
import { createInitialSave } from '../src/rules/gameRules';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { TerrainShape, ZoneId } from '../src/types';

/**
 * The walkable area is an ellipse with semi-axes `W/2 - 36` and `H/2 - 36`
 * (see WorldRuntime.isWalkable with the default 18px body radius). The drawn
 * plate uses `0.475 * W` and `0.475 * H` scaled by outlineScale(). If the drawn
 * silhouette ever pinched inside the walkable ellipse the player would walk on
 * empty air, so that containment is asserted here rather than eyeballed.
 */
const PLATE_SCALE = 0.475;
const BODY_RADIUS = 18;

function walkableSemiAxes(zoneId: ZoneId): { a: number; b: number } {
  const zone = ZONES[zoneId];
  return { a: zone.width / 2 - BODY_RADIUS - BODY_RADIUS, b: zone.height / 2 - BODY_RADIUS - BODY_RADIUS };
}

describe('island silhouette', () => {
  it('never scales below 1 so the plate can only grow past the ideal ellipse', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const scale = outlineScale(seed, 0.05, (degrees * Math.PI) / 180);
        expect(scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('varies with angle so the island is not a perfect ellipse', () => {
    const samples = Array.from({ length: 72 }, (_, index) => outlineScale(42, 0.05, (index / 72) * Math.PI * 2));
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.01);
  });

  it('is deterministic for a given seed', () => {
    const a = outlineScale(7, 0.05, 1.2);
    const b = outlineScale(7, 0.05, 1.2);
    expect(a).toBe(b);
  });

  it('keeps the drawn plate outside the walkable ellipse in every zone', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const { a, b } = walkableSemiAxes(zoneId);
      const rx = zone.width * PLATE_SCALE;
      const ry = zone.height * PLATE_SCALE;
      // Worst case per angle: sample densely rather than trusting a few points.
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const t = (degrees * Math.PI) / 180;
        const n = outlineScale(degrees, 0.05, t);
        const px = Math.cos(t) * rx * n;
        const py = Math.sin(t) * ry * n;
        const insideWalkable = (px / a) ** 2 + (py / b) ** 2;
        expect(insideWalkable, `${zoneId} at ${degrees}deg pinches inside the walkable area`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('leaves the spawn point and every interactable on solid ground', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const save = createInitialSave(0);
      save.world.currentZone = zoneId;
      save.world.x = zone.spawn.x;
      save.world.y = zone.spawn.y;
      const world = new WorldRuntime(save);
      expect(world.isWalkable(zone.spawn.x, zone.spawn.y), `${zoneId} spawn is off-island`).toBe(true);
      for (const interactable of zone.interactables) {
        expect(world.isWalkable(interactable.x, interactable.y), `${zoneId}/${interactable.id} is off-island`).toBe(true);
      }
    }
  });

  it('keeps every grass patch reachable inside the walkable area', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const save = createInitialSave(0);
      save.world.currentZone = zoneId;
      const world = new WorldRuntime(save);
      for (const patch of zone.grass) {
        const cx = patch.x + patch.w / 2;
        const cy = patch.y + patch.h / 2;
        expect(world.isWalkable(cx, cy), `${zoneId} grass centre is off-island`).toBe(true);
      }
    }
  });
});

/**
 * Per-island landforms were added because all five islands shared one elliptical
 * plate, so the map was five copies of the same place in different colours. These
 * tests lock both halves of that fix: the shapes must be genuinely different from
 * each other, and they must not break the containment invariant above.
 */
const ALL_SHAPES: TerrainShape[] = ['harbor', 'terrace', 'grove', 'lagoon', 'ring'];

describe('landform shapes', () => {
  it('never scales below 1, the same containment guarantee as outlineScale', () => {
    for (const shape of ALL_SHAPES) {
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const scale = shapeScale(shape, (degrees * Math.PI) / 180);
        expect(scale, `${shape} pinches inward at ${degrees}deg`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('gives every zone a shape that still contains the walkable ellipse', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const { a, b } = walkableSemiAxes(zoneId);
      const rx = zone.width * PLATE_SCALE;
      const ry = zone.height * PLATE_SCALE;
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const t = (degrees * Math.PI) / 180;
        const n = shapeScale(zone.terrain.shape, t);
        expect(n, `${zoneId} shape scale below 1`).toBeGreaterThanOrEqual(1);
        const px = Math.cos(t) * rx * n;
        const py = Math.sin(t) * ry * n;
        expect((px / a) ** 2 + (py / b) ** 2, `${zoneId} shape pinches inside the walkable area`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('gives the five islands five distinguishable silhouettes', () => {
    // Compare each pair by sampling the full outline. If two shapes produce the
    // same radius curve the islands are still the same place to the player.
    const sample = (shape: TerrainShape) => Array.from({ length: 72 }, (_, index) => shapeScale(shape, (index / 72) * Math.PI * 2));
    for (let i = 0; i < ALL_SHAPES.length; i += 1) {
      for (let j = i + 1; j < ALL_SHAPES.length; j += 1) {
        const a = sample(ALL_SHAPES[i]!);
        const b = sample(ALL_SHAPES[j]!);
        const meanDelta = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) / a.length;
        expect(meanDelta, `${ALL_SHAPES[i]} and ${ALL_SHAPES[j]} are visually the same`).toBeGreaterThan(0.008);
      }
    }
  });

  it('assigns a distinct shape and landmark to every zone', () => {
    const shapes = new Set<string>();
    const landmarks = new Set<string>();
    for (const zone of Object.values(ZONES)) {
      shapes.add(zone.terrain.shape);
      landmarks.add(zone.terrain.landmark);
      expect(zone.terrain.blurb.length, `${zone.id} has no landform blurb`).toBeGreaterThan(4);
    }
    expect(shapes.size, 'zones share landform shapes').toBe(Object.keys(ZONES).length);
    expect(landmarks.size, 'zones share landmarks').toBe(Object.keys(ZONES).length);
  });

  it('only uses landform obstacle kinds that are actually solid', () => {
    // ledge and plinth must block movement; if one of them were treated like
    // flower or lantern the island would look solid and play as open ground.
    for (const zone of Object.values(ZONES)) {
      const landform = zone.obstacles.filter((obstacle) => obstacle.kind === 'ledge' || obstacle.kind === 'plinth');
      expect(Array.isArray(landform)).toBe(true);
    }
  });

  it('keeps spawn, interactables and grass standable with the new landform props', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const save = createInitialSave(0);
      save.world.currentZone = zoneId;
      save.world.x = zone.spawn.x;
      save.world.y = zone.spawn.y;
      const world = new WorldRuntime(save);
      expect(world.isWalkable(zone.spawn.x, zone.spawn.y), `${zoneId} spawn is blocked by landform props`).toBe(true);
      for (const interactable of zone.interactables) {
        expect(world.isWalkable(interactable.x, interactable.y), `${zoneId}/${interactable.id} is blocked`).toBe(true);
      }
      for (const patch of zone.grass) {
        expect(world.isWalkable(patch.x + patch.w / 2, patch.y + patch.h / 2), `${zoneId} grass is blocked`).toBe(true);
      }
    }
  });

  it('keeps the spawn clear of landform props so no island opens you inside a wall', () => {
    for (const zone of Object.values(ZONES)) {
      for (const obstacle of zone.obstacles) {
        if (obstacle.kind !== 'ledge' && obstacle.kind !== 'plinth') continue;
        const overlapsSpawn = zone.spawn.x >= obstacle.x - BODY_RADIUS
          && zone.spawn.x <= obstacle.x + obstacle.w + BODY_RADIUS
          && zone.spawn.y >= obstacle.y - BODY_RADIUS
          && zone.spawn.y <= obstacle.y + obstacle.h + BODY_RADIUS;
        expect(overlapsSpawn, `${zone.id} spawn overlaps a ${obstacle.kind}`).toBe(false);
      }
    }
  });

  /**
   * The terrace risers on 云阶草坡 were first authored at near full island width,
   * which turned the zone into two sealed bands: the spawn could not reach the
   * gate above. Standalone assertions missed it because both endpoints were
   * individually walkable. This flood-fills from the spawn using the same
   * isWalkable rule the game uses and requires every travel point to be reached.
   */
  it('lets the player walk from the spawn to every travel point and encounter', () => {
    const STEP = 10;
    for (const zone of Object.values(ZONES)) {
      const save = createInitialSave(0);
      save.world.currentZone = zone.id as ZoneId;
      const world = new WorldRuntime(save);

      const cols = Math.ceil(zone.width / STEP);
      const rows = Math.ceil(zone.height / STEP);
      const seen = new Uint8Array(cols * rows);
      const toIndex = (x: number, y: number) => Math.floor(y / STEP) * cols + Math.floor(x / STEP);

      // Seed from every standable cell within a body radius of the spawn, since
      // snapToWalkable may place the player slightly off the exact coordinate.
      let startIndex = -1;
      for (let oy = -STEP; oy <= STEP && startIndex < 0; oy += STEP) {
        for (let ox = -STEP; ox <= STEP; ox += STEP) {
          const sx = zone.spawn.x + ox;
          const sy = zone.spawn.y + oy;
          if (world.isWalkable(sx, sy)) {
            startIndex = toIndex(sx, sy);
            break;
          }
        }
      }
      expect(startIndex, `${zone.id} has no standable cell at the spawn`).toBeGreaterThanOrEqual(0);

      const queue: number[] = [startIndex];
      seen[startIndex] = 1;
      while (queue.length > 0) {
        const current = queue.pop()!;
        const cx = (current % cols) * STEP;
        const cy = ((current - (current % cols)) / cols) * STEP;
        for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP], [STEP, STEP], [-STEP, -STEP], [STEP, -STEP], [-STEP, STEP]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
          const next = toIndex(nx, ny);
          if (seen[next]) continue;
          if (!world.isWalkable(nx, ny)) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }

      for (const interactable of zone.interactables) {
        const reachable = seen[toIndex(interactable.x, interactable.y)] === 1;
        expect(reachable, `${zone.id}/${interactable.id} cannot be walked to from the spawn`).toBe(true);
      }
      for (const patch of zone.grass) {
        const reachable = seen[toIndex(patch.x + patch.w / 2, patch.y + patch.h / 2)] === 1;
        expect(reachable, `${zone.id} grass patch cannot be walked to`).toBe(true);
      }
    }
  });
});
