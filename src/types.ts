export type WeaponType = 'branch' | 'blade' | 'bell';
export type Rarity = 'plain' | 'fine' | 'star' | 'legend';
export type EnemyAi = 'melee' | 'shooter' | 'charger' | 'tank' | 'flanker' | 'summoner' | 'boss';
export type SceneMode = 'title' | 'world' | 'battle';
export type OverlayName = 'none' | 'title' | 'bag' | 'forge' | 'journal' | 'map' | 'build' | 'settings' | 'pause' | 'dialogue' | 'result' | 'intro' | 'guide';
export type MaterialId = 'cloudFluff' | 'lampPaper' | 'rainPearl' | 'starSand' | 'inkWing' | 'oldGear' | 'moonThread';
export type WeaponId =
  | 'sprigFork'
  | 'bellShoot'
  | 'moonKnife'
  | 'rainCane'
  | 'cometAxe'
  | 'paperFan'
  | 'starRod'
  | 'tideCutter'
  | 'dawnLantern'
  | 'nightSong';
export type CharmId = 'emberKnot' | 'cloudFeather' | 'rainBead' | 'starCompass';
export type BuildingId = 'forge' | 'cottage' | 'rainCanopy' | 'starChart' | 'beacon';
export type ZoneId = 'harbor' | 'cloudstep' | 'paperwood' | 'rainbud' | 'starfall';

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  color: string;
  description: string;
}

export interface RecipeCost {
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  type: WeaponType;
  rarity: Rarity;
  tier: number;
  requiredLevel: number;
  damage: number;
  cooldown: number;
  range: number;
  arc: number;
  speed: number;
  price: number;
  skillName: string;
  skillDescription: string;
  description: string;
  color: string;
  recipe: RecipeCost;
}

export interface CharmDefinition {
  id: CharmId;
  name: string;
  description: string;
  bonus: Partial<PlayerStats>;
  price: number;
  recipe: RecipeCost;
  color: string;
}

export interface PlayerStats {
  level: number;
  xp: number;
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  crit: number;
  critDamage: number;
  moveSpeed: number;
  flameGain: number;
  potionPower: number;
}

export interface PlayerSave {
  name: string;
  level: number;
  xp: number;
  hp: number;
  gold: number;
  starlight: number;
  potions: number;
  materials: Record<MaterialId, number>;
  inventory: string[];
  equippedWeapon: WeaponId;
  equippedCharm: CharmId | null;
  route: 'warden' | 'shadow' | 'weaver';
}

export interface WorldSave {
  currentZone: ZoneId;
  x: number;
  y: number;
  questStage: number;
  defeatCounts: Record<string, number>;
  defeatedBosses: string[];
  buildings: Partial<Record<BuildingId, number>>;
  discoveredZones: ZoneId[];
  tutorialSeen: boolean;
  guideSeen: boolean;
  tutorialBattleSeen: boolean;
  endingSeen: boolean;
}

export interface GameStats {
  battlesWon: number;
  perfectDodges: number;
  bestCombo: number;
  enemiesDefeated: number;
  playSeconds: number;
  deaths: number;
}

export interface SettingsSave {
  sfx: number;
  music: number;
  reducedMotion: boolean;
  showTouch: boolean;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  player: PlayerSave;
  world: WorldSave;
  stats: GameStats;
  settings: SettingsSave;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  ai: EnemyAi;
  level: number;
  hp: number;
  damage: number;
  defense: number;
  speed: number;
  radius: number;
  attackRange: number;
  attackCooldown: number;
  telegraph: number;
  xp: number;
  gold: number;
  size: number;
  color: string;
  accent: string;
  materials: Partial<Record<MaterialId, number>>;
  description: string;
}

export interface WorldObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  // ledge and plinth are landform features, not props: they are solid, but they
  // exist to describe the shape of the island rather than to furnish it.
  kind: 'tree' | 'rock' | 'ruin' | 'house' | 'forge' | 'lantern' | 'flower' | 'water' | 'ledge' | 'plinth';
  seed?: number;
}

export interface EncounterPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  chance: number;
}

export interface ZoneInteractable {
  id: string;
  x: number;
  y: number;
  radius: number;
  kind: 'npc' | 'gate' | 'forge' | 'boss' | 'exit' | 'build' | 'portal';
  label: string;
  target?: ZoneId;
}

export interface ZoneDefinition {
  id: ZoneId;
  name: string;
  subtitle: string;
  level: number;
  safe: boolean;
  width: number;
  height: number;
  background: string;
  ground: string;
  groundAlt: string;
  accent: string;
  haze: string;
  encounters: string[];
  bossId?: string;
  requiredStage: number;
  spawn: { x: number; y: number };
  obstacles: WorldObstacle[];
  grass: EncounterPatch[];
  interactables: ZoneInteractable[];
  ambience: string;
  /** Landform shape and signature landmark. Drives both drawing and layout. */
  terrain: ZoneTerrain;
}

/**
 * Per-island landform. Every zone shares one elliptical plate today, which is
 * why the five islands read as the same place in five colours. Each shape below
 * is a distinct silhouette, and `landmark` gives the player something they can
 * recognise without reading the HUD.
 */
export type TerrainShape = 'harbor' | 'terrace' | 'grove' | 'lagoon' | 'ring';

export interface ZoneTerrain {
  shape: TerrainShape;
  /** Drawn on the plate and highlighted by the minimap. */
  landmark: 'lighthouse' | 'stair' | 'paperGrove' | 'pond' | 'starPad';
  /** Short line describing the landform, used by the guide copy. */
  blurb: string;
}

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  description: string;
  levels: Array<{ level: number; cost: RecipeCost; benefit: string }>;
}

export interface QuestStage {
  id: string;
  title: string;
  hint: string;
  targetText: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface DamageResult {
  amount: number;
  critical: boolean;
  blocked: number;
}

export interface BattleEntity {
  id: string;
  kind: 'hero' | 'enemy';
  definitionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  speed: number;
  facing: number;
  attackTimer: number;
  telegraphTimer: number;
  attackCooldown: number;
  hitFlash: number;
  dead: boolean;
  phase?: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  friendly: boolean;
  color: string;
  kind: 'spark' | 'rain' | 'ring' | 'paper';
}

export interface Hazard {
  id: string;
  x: number;
  y: number;
  radius: number;
  delay: number;
  duration: number;
  damage: number;
  fired: boolean;
  hit: boolean;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spin: number;
  kind: 'star' | 'dust' | 'ink' | 'spark';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}
