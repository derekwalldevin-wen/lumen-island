import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data';
import { outlineScale } from '../src/render/visuals';
import { createInitialSave } from '../src/rules/gameRules';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { ZoneId } from '../src/types';

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
