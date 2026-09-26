import type { BuildingId, ZoneId } from '../types';

export type UiPanel = 'bag' | 'forge' | 'journal' | 'map' | 'build' | 'settings' | 'pause';

export type GameCommand =
  | { type: 'new-game' }
  | { type: 'continue-game' }
  | { type: 'open-panel'; panel: UiPanel }
  | { type: 'close-panel' }
  | { type: 'pause' }
  | { type: 'interact' }
  | { type: 'travel'; zone: ZoneId }
  | { type: 'start-random-battle' }
  | { type: 'attack'; pressed: boolean }
  | { type: 'dodge' }
  | { type: 'skill' }
  | { type: 'potion' }
  | { type: 'craft'; id: string }
  | { type: 'equip'; id: string }
  | { type: 'build'; id: BuildingId }
  | { type: 'choose-route'; route: 'warden' | 'shadow' | 'weaver' }
  | { type: 'dialogue-continue' }
  | { type: 'result-continue' }
  | { type: 'setting-sfx'; value: number }
  | { type: 'setting-music'; value: number }
  | { type: 'setting-reduced-motion'; value: boolean }
  | { type: 'setting-touch'; value: boolean }
  | { type: 'clear-save' };
