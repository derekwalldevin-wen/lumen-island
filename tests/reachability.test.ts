import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data';
import { createInitialSave } from '../src/rules/gameRules';
import { WorldRuntime } from '../src/world/worldRuntime';
import type { ZoneId } from '../src/types';

/**
 * An interactable only fires when the player stands inside its trigger radius,
 * and the player can only stand on walkable tiles. If a building's own collision
 * box covers its trigger radius, that quest beat becomes impossible to complete.
 */
function nearestWalkableDistance(zoneId: ZoneId, x: number, y: number, radius: number): number {
  const zone = ZONES[zoneId];
  const save = createInitialSave(0);
  save.world.currentZone = zoneId;
  const world = new WorldRuntime(save);
  let best = Infinity;
  for (let stepY = -radius; stepY <= radius; stepY += 6) {
    for (let stepX = -radius; stepX <= radius; stepX += 6) {
      const px = x + stepX;
      const py = y + stepY;
      if (!world.isWalkable(px, py)) continue;
      const distance = Math.hypot(px - x, py - y);
      if (distance < best) best = distance;
    }
  }
  return best;
}

describe('interactable reachability', () => {
  it('lets the player stand inside every interactable trigger radius', () => {
    const unreachable: string[] = [];
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      for (const interactable of ZONES[zoneId].interactables) {
        const distance = nearestWalkableDistance(zoneId, interactable.x, interactable.y, interactable.radius);
        if (distance > interactable.radius) {
          unreachable.push(`${zoneId}/${interactable.id} needs ${Math.round(distance)}px but radius is ${interactable.radius}px`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('keeps the exit and gate return points clear of scenery', () => {
    const problems: string[] = [];
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      for (const interactable of ZONES[zoneId].interactables) {
        if (interactable.kind !== 'exit' && interactable.kind !== 'portal' && interactable.kind !== 'gate') continue;
        const distance = nearestWalkableDistance(zoneId, interactable.x, interactable.y, interactable.radius);
        if (distance > interactable.radius) problems.push(`${zoneId}/${interactable.id}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
