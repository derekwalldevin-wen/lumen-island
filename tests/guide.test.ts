import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data';
import { isAtGuideMarker, resolveGuide } from '../src/guide/guide';
import { createInitialSave } from '../src/rules/gameRules';
import type { SaveData, ZoneId } from '../src/types';

function at(save: SaveData, zone: ZoneId, x: number, y: number) {
  return resolveGuide(save, zone, x, y);
}

describe('onboarding guide', () => {
  it('starts by pointing the player at Luma inside the harbor', () => {
    const save = createInitialSave(0);
    const guide = at(save, 'harbor', 450, 860);
    expect(guide.stepNumber).toBe(1);
    expect(guide.needsTravel).toBe(false);
    expect(guide.target?.id).toBe('keeper-luma');
    expect(guide.target?.x).toBe(ZONES.harbor.interactables.find((item) => item.id === 'keeper-luma')?.x);
    expect(guide.marker?.kind).toBe('target');
  });

  it('routes the player to the south portal when the objective zone is elsewhere', () => {
    const save = createInitialSave(0);
    save.world.questStage = 1;
    const guide = at(save, 'harbor', 450, 860);
    expect(guide.needsTravel).toBe(true);
    expect(guide.marker?.kind).toBe('gate');
    expect(guide.marker?.label).toBe('前往云阶草坡');
    expect(guide.target).toBeNull();
  });

  it('targets a grass patch once the player reaches the cloud meadow', () => {
    const save = createInitialSave(0);
    save.world.questStage = 1;
    save.world.discoveredZones.push('cloudstep');
    const guide = at(save, 'cloudstep', 450, 1030);
    expect(guide.needsTravel).toBe(false);
    expect(guide.target?.kind).toBe('grass');
    expect(guide.step.progress).toBe('灯绒团 0 / 3');
  });

  it('sends the player back to the harbor forge after the meadow is cleared', () => {
    const save = createInitialSave(0);
    save.world.questStage = 2;
    const guide = at(save, 'cloudstep', 450, 1030);
    expect(guide.needsTravel).toBe(true);
    expect(guide.marker?.label).toBe('返回灯火港');
    const home = at(save, 'harbor', 450, 860);
    expect(home.target?.id).toBe('home-forge');
    expect(home.step.progress).toBe('工坊尚未修复');
  });

  it('surfaces the hidden rain-canopy prerequisite before the rain garden', () => {
    const save = createInitialSave(0);
    save.world.questStage = 5;
    const guide = at(save, 'harbor', 450, 860);
    expect(guide.step.detour).toBe(true);
    expect(guide.target?.id).toBe('home-build');
    expect(guide.step.progress).toBe('集雨棚待修复');
  });

  it('drops the detour once the rain canopy is repaired', () => {
    const save = createInitialSave(0);
    save.world.questStage = 5;
    save.world.buildings.forge = 1;
    save.world.buildings.rainCanopy = 1;
    const guide = at(save, 'rainbud', 510, 1150);
    expect(guide.step.detour).toBe(false);
    expect(guide.target?.kind).toBe('grass');
    expect(guide.step.progress).toBe('星砂哨兵 0 / 3');
  });

  it('surfaces the hidden star-chart prerequisite before the high platform', () => {
    const save = createInitialSave(0);
    save.world.questStage = 7;
    const guide = at(save, 'rainbud', 510, 1150);
    expect(guide.step.detour).toBe(true);
    expect(guide.step.progress).toBe('星图台待修复');
  });

  it('reports a distance to the marker and detects arrival', () => {
    const save = createInitialSave(0);
    const guide = at(save, 'harbor', 450, 455);
    expect(guide.distance).toBe(0);
    expect(isAtGuideMarker(guide, 450, 455)).toBe(true);
    const far = at(save, 'harbor', 450, 900);
    expect(far.distance).toBeGreaterThan(200);
    expect(isAtGuideMarker(far, 450, 900)).toBe(false);
  });

  it('always produces a reachable marker in every zone for every stage', () => {
    const zones = Object.keys(ZONES) as ZoneId[];
    for (let stage = 0; stage <= 9; stage += 1) {
      for (const zone of zones) {
        const save = createInitialSave(0);
        save.world.questStage = stage;
        const guide = at(save, zone, ZONES[zone].spawn.x, ZONES[zone].spawn.y);
        expect(guide.marker, `stage ${stage} in ${zone} has no marker`).not.toBeNull();
        expect(guide.step.hint.length).toBeGreaterThan(4);
      }
    }
  });

  it('shows the intro card only until the player has read it', () => {
    const save = createInitialSave(0);
    expect(at(save, 'harbor', 450, 860).introVisible).toBe(true);
    save.world.guideSeen = true;
    expect(at(save, 'harbor', 450, 860).introVisible).toBe(false);
  });
});
