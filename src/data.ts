import type {
  BuildingDefinition,
  CharmDefinition,
  EnemyDefinition,
  MaterialDefinition,
  QuestStage,
  WeaponDefinition,
  ZoneDefinition,
} from './types';

export const SAVE_VERSION = 1;

/**
 * One hero swing, in seconds, from wind-up to settled.
 *
 * Lives here rather than in the renderer because both ends need it and must agree:
 * the battle runtime counts the swing down, and the renderer maps that countdown
 * onto a pose. If either side had its own copy they would drift apart and the
 * figure would freeze partway through the animation.
 *
 * Long enough to read as a motion, short enough to stay responsive. At the
 * fastest weapon the attack cooldown is a little over a third of a second, so a
 * longer swing would still be recovering when the next blow starts and a held
 * attack button would smear the three into one.
 */
export const SWING_DURATION = 0.34;

export const MATERIALS: Record<string, MaterialDefinition> = {
  cloudFluff: { id: 'cloudFluff', name: '云绒', color: '#f4ead1', description: '柔软发光，可为器物保温。' },
  lampPaper: { id: 'lampPaper', name: '灯纸', color: '#f4c95d', description: '浸过星油的暖色纸纤维。' },
  rainPearl: { id: 'rainPearl', name: '雨珠', color: '#78c9c1', description: '只在雨芽花园凝结。' },
  starSand: { id: 'starSand', name: '星砂', color: '#f1b8d2', description: '在夜空高处缓慢闪烁。' },
  inkWing: { id: 'inkWing', name: '墨羽', color: '#75659a', description: '墨点蝙蝠留下的轻盈薄片。' },
  oldGear: { id: 'oldGear', name: '旧齿轮', color: '#d4865c', description: '从暮影机械残骸中找到。' },
  moonThread: { id: 'moonThread', name: '月线', color: '#fff1bd', description: '守护者赠予的细亮丝线。' },
};

export const WEAPONS: WeaponDefinition[] = [
  {
    id: 'sprigFork', name: '星枝短叉', type: 'branch', rarity: 'plain', tier: 1, requiredLevel: 1,
    damage: 16, cooldown: 0.42, range: 74, arc: 1.35, speed: 1, price: 0,
    skillName: '藤星爆', skillDescription: '在周围引爆星芽，短暂击退暮影。',
    description: '巡岛员的第一件工具，叉尖会折出细小星光。', color: '#8fcf9b',
    recipe: { gold: 0, materials: {} },
  },
  {
    id: 'bellShoot', name: '雨铃短杖', type: 'bell', rarity: 'plain', tier: 1, requiredLevel: 1,
    damage: 13, cooldown: 0.34, range: 150, arc: 0.55, speed: 1.15, price: 80,
    skillName: '清音环', skillDescription: '发出扩散音环，击退并打断敌人蓄力。',
    description: '用空心雨铃收集声音，适合保持距离。', color: '#77c7bd',
    recipe: { gold: 80, materials: { cloudFluff: 3, rainPearl: 1 } },
  },
  {
    id: 'moonKnife', name: '月牙灯刃', type: 'blade', rarity: 'fine', tier: 2, requiredLevel: 3,
    damage: 22, cooldown: 0.34, range: 86, arc: 1.75, speed: 1.3, price: 180,
    skillName: '坠月突进', skillDescription: '向目标瞬移并斩出一道月弧。',
    description: '刃面像纸月，划过时会短暂照亮暮影。', color: '#f2d68c',
    recipe: { gold: 180, materials: { lampPaper: 4, moonThread: 1 } },
  },
  {
    id: 'rainCane', name: '雨芽曲杖', type: 'bell', rarity: 'fine', tier: 2, requiredLevel: 5,
    damage: 19, cooldown: 0.28, range: 184, arc: 0.48, speed: 1.35, price: 280,
    skillName: '回雨弦', skillDescription: '召来三道追踪雨弦，持续灼亮灯焰。',
    description: '杖顶的水芽会记住最近的目标。', color: '#72c9d0',
    recipe: { gold: 280, materials: { rainPearl: 5, lampPaper: 3 } },
  },
  {
    id: 'cometAxe', name: '彗枝重斧', type: 'branch', rarity: 'star', tier: 3, requiredLevel: 8,
    damage: 34, cooldown: 0.62, range: 98, arc: 1.9, speed: 0.82, price: 520,
    skillName: '彗星落地', skillDescription: '高举灯斧砸下，震开并眩晕周围敌人。',
    description: '斧柄缠着真正会燃烧的彗尾。', color: '#f39a65',
    recipe: { gold: 520, materials: { starSand: 6, oldGear: 3 } },
  },
  {
    id: 'paperFan', name: '百鸟纸扇', type: 'blade', rarity: 'star', tier: 3, requiredLevel: 10,
    damage: 29, cooldown: 0.31, range: 102, arc: 2.1, speed: 1.38, price: 680,
    skillName: '群鸟回旋', skillDescription: '折出纸鸟穿透敌群，并回送灯焰。',
    description: '每一次挥动都会有一只纸鸟短暂掠过。', color: '#e9908d',
    recipe: { gold: 680, materials: { lampPaper: 8, inkWing: 4, moonThread: 2 } },
  },
  {
    id: 'starRod', name: '星砂摆杖', type: 'bell', rarity: 'star', tier: 4, requiredLevel: 13,
    damage: 28, cooldown: 0.24, range: 208, arc: 0.42, speed: 1.5, price: 860,
    skillName: '星轨新星', skillDescription: '将星砂铺成环轨，沿轨道爆发多段伤害。',
    description: '杖尖的沙粒始终逆着夜风旋转。', color: '#d5a6dc',
    recipe: { gold: 860, materials: { starSand: 10, oldGear: 5, moonThread: 3 } },
  },
  {
    id: 'tideCutter', name: '暮潮剪月', type: 'blade', rarity: 'star', tier: 4, requiredLevel: 15,
    damage: 40, cooldown: 0.3, range: 112, arc: 2.3, speed: 1.5, price: 1020,
    skillName: '潮痕连闪', skillDescription: '留下三道可返回的月痕，短暂强化灯焰。',
    description: '剪开暮影，而不是斩断它。', color: '#8aa5e0',
    recipe: { gold: 1020, materials: { inkWing: 9, starSand: 7, moonThread: 4 } },
  },
  {
    id: 'dawnLantern', name: '拂晓提灯', type: 'branch', rarity: 'legend', tier: 5, requiredLevel: 17,
    damage: 43, cooldown: 0.5, range: 126, arc: 2.0, speed: 1.05, price: 1360,
    skillName: '拂晓灯潮', skillDescription: '点亮整座竞技场，持续恢复灯焰并灼烧敌人。',
    description: '据说灯芯来自第一座永不熄灭的灯塔。', color: '#f7c95d',
    recipe: { gold: 1360, materials: { starSand: 12, moonThread: 8, oldGear: 8 } },
  },
  {
    id: 'nightSong', name: '无星夜歌', type: 'bell', rarity: 'legend', tier: 5, requiredLevel: 19,
    damage: 34, cooldown: 0.2, range: 235, arc: 0.5, speed: 1.75, price: 1600,
    skillName: '终夜回响', skillDescription: '唱响终夜钟声，爆发音波并让所有敌人短暂失明。',
    description: '铃声并不响亮，却能穿过整片云海。', color: '#b9a5ef',
    recipe: { gold: 1600, materials: { inkWing: 12, starSand: 10, moonThread: 10 } },
  },
];

export const CHARMS: CharmDefinition[] = [
  {
    id: 'emberKnot', name: '余烬绳结', description: '生命低于 35% 时提高攻击，并加快灯焰回复。',
    bonus: { attack: 7, flameGain: 0.18 }, price: 240, color: '#f08a68',
    recipe: { gold: 240, materials: { lampPaper: 4, cloudFluff: 3 } },
  },
  {
    id: 'cloudFeather', name: '云羽坠', description: '提高移动速度和普通攻击速度。',
    bonus: { moveSpeed: 26, crit: 0.04 }, price: 320, color: '#f1e6c9',
    recipe: { gold: 320, materials: { cloudFluff: 7, moonThread: 1 } },
  },
  {
    id: 'rainBead', name: '三雨珠', description: '增加生命、防御与药剂治疗。',
    bonus: { maxHp: 35, defense: 5, potionPower: 14 }, price: 420, color: '#71c7c0',
    recipe: { gold: 420, materials: { rainPearl: 6, cloudFluff: 4 } },
  },
  {
    id: 'starCompass', name: '星图罗盘', description: '显著提高暴击率和暴击伤害。',
    bonus: { crit: 0.09, critDamage: 0.22 }, price: 580, color: '#d9a9dc',
    recipe: { gold: 580, materials: { starSand: 6, moonThread: 2 } },
  },
];

export const ENEMIES: Record<string, EnemyDefinition> = {
  cloudPuff: {
    id: 'cloudPuff', name: '灯绒团', ai: 'melee', level: 1, hp: 58, damage: 10, defense: 2,
    speed: 64, radius: 22, attackRange: 48, attackCooldown: 1.2, telegraph: 0.46,
    xp: 18, gold: 9, size: 1, color: '#f3e7cf', accent: '#f5b76c',
    materials: { cloudFluff: 1 }, description: '会追逐亮光，碰撞前会鼓起身体。',
  },
  rainSprout: {
    id: 'rainSprout', name: '雨芽精', ai: 'shooter', level: 2, hp: 72, damage: 13, defense: 3,
    speed: 42, radius: 21, attackRange: 240, attackCooldown: 1.8, telegraph: 0.65,
    xp: 27, gold: 13, size: 1, color: '#83cdbd', accent: '#e6f0c8',
    materials: { rainPearl: 1 }, description: '用露珠投出短促的直线水弦。',
  },
  paperKite: {
    id: 'paperKite', name: '纸鸢影', ai: 'charger', level: 3, hp: 88, damage: 18, defense: 4,
    speed: 72, radius: 22, attackRange: 210, attackCooldown: 1.65, telegraph: 0.72,
    xp: 36, gold: 17, size: 1, color: '#dc8d8c', accent: '#fff0bd',
    materials: { lampPaper: 2 }, description: '拉出一条长直线，预警像风筝线一样发亮。',
  },
  mistCrab: {
    id: 'mistCrab', name: '雾壳蟹', ai: 'tank', level: 4, hp: 150, damage: 20, defense: 10,
    speed: 34, radius: 29, attackRange: 58, attackCooldown: 1.6, telegraph: 0.62,
    xp: 52, gold: 25, size: 1.2, color: '#8fa3b4', accent: '#d8e6dc',
    materials: { oldGear: 1, cloudFluff: 2 }, description: '厚壳会弹开轻击，缓慢挥动雾钳。',
  },
  inkBat: {
    id: 'inkBat', name: '墨点蝙蝠', ai: 'flanker', level: 6, hp: 116, damage: 21, defense: 5,
    speed: 92, radius: 20, attackRange: 54, attackCooldown: 0.95, telegraph: 0.36,
    xp: 70, gold: 31, size: 0.95, color: '#75659a', accent: '#d0c2f3',
    materials: { inkWing: 2 }, description: '沿弧线俯冲，几乎不留直线。',
  },
  starSentinel: {
    id: 'starSentinel', name: '星砂哨兵', ai: 'shooter', level: 8, hp: 168, damage: 25, defense: 9,
    speed: 48, radius: 25, attackRange: 270, attackCooldown: 1.55, telegraph: 0.72,
    xp: 96, gold: 43, size: 1.1, color: '#8f9ec2', accent: '#f1b8d2',
    materials: { starSand: 2, oldGear: 1 }, description: '交替射出追踪星砂与扩散星环。',
  },
  lanternMoth: {
    id: 'lanternMoth', name: '吞灯蛹', ai: 'boss', level: 6, hp: 920, damage: 24, defense: 8,
    speed: 46, radius: 46, attackRange: 64, attackCooldown: 1.35, telegraph: 0.82,
    xp: 320, gold: 180, size: 1.8, color: '#6b6b82', accent: '#f0a05f',
    materials: { lampPaper: 7, inkWing: 4, moonThread: 1 }, description: '第一守关者。吸走灯火后，会把光化作冲击波。',
  },
  bellWarden: {
    id: 'bellWarden', name: '雨幕守铃者', ai: 'boss', level: 11, hp: 1480, damage: 31, defense: 12,
    speed: 40, radius: 50, attackRange: 285, attackCooldown: 1.3, telegraph: 0.72,
    xp: 520, gold: 280, size: 1.9, color: '#559b9a', accent: '#d9f0d4',
    materials: { rainPearl: 9, moonThread: 3, starSand: 4 }, description: '第二守关者。让雨幕旋转，并以回声锁定玩家。',
  },
  starlessOwl: {
    id: 'starlessOwl', name: '无星夜枭', ai: 'boss', level: 18, hp: 3200, damage: 42, defense: 17,
    speed: 58, radius: 58, attackRange: 220, attackCooldown: 1.05, telegraph: 0.65,
    xp: 1200, gold: 720, size: 2.15, color: '#26324d', accent: '#d3aeea',
    materials: { starSand: 14, inkWing: 10, moonThread: 8, oldGear: 8 }, description: '最终头目。潜入无星云海，在失误间织出下一片黑暗。',
  },
};

function tree(x: number, y: number, seed: number) {
  return { x, y, w: 64, h: 80, kind: 'tree' as const, seed };
}

const ZONE_LIST: ZoneDefinition[] = [
  {
    id: 'harbor', name: '灯火港', subtitle: '风把纸灯吹向归途', level: 0, safe: true,
    width: 900, height: 1050, background: '#17283d', ground: '#496a68', groundAlt: '#5c7d73', accent: '#f4c95d', haze: '#d9d0b3',
    encounters: [], requiredStage: 0, spawn: { x: 450, y: 860 },
    obstacles: [
      { x: 110, y: 165, w: 150, h: 130, kind: 'house' },
      { x: 620, y: 160, w: 150, h: 130, kind: 'forge' },
      { x: 398, y: 190, w: 95, h: 95, kind: 'ruin' },
      { x: 90, y: 470, w: 90, h: 100, kind: 'tree', seed: 2 },
      { x: 700, y: 470, w: 90, h: 100, kind: 'tree', seed: 7 },
      { x: 350, y: 570, w: 190, h: 110, kind: 'water' },
    ],
    grass: [],
    interactables: [
      { id: 'keeper-luma', x: 450, y: 455, radius: 62, kind: 'npc', label: '灯塔守望者·露玛' },
      // Trigger points sit on the walkable apron in front of each building. Placed
      // on the buildings themselves they would be unreachable, because the whole
      // trigger disc falls inside the structure's own collision box.
      { id: 'home-forge', x: 690, y: 322, radius: 70, kind: 'forge', label: '巡灯工坊' },
      { id: 'home-build', x: 205, y: 322, radius: 70, kind: 'build', label: '岛屋建造板' },
      { id: 'to-cloudstep', x: 450, y: 935, radius: 76, kind: 'portal', label: '前往云阶草坡', target: 'cloudstep' },
    ],
    ambience: 'home',
    terrain: { shape: 'harbor', landmark: 'lighthouse', blurb: '归航灯塔立在南岸的礁石上，是全岛最高的灯。' },
  },
  {
    id: 'cloudstep', name: '云阶草坡', subtitle: '第一盏灯在风里摇晃', level: 1, safe: false,
    width: 900, height: 1180, background: '#253c4d', ground: '#728f79', groundAlt: '#87a184', accent: '#f1c75b', haze: '#d9dfc4',
    encounters: ['cloudPuff', 'rainSprout'], requiredStage: 0, spawn: { x: 450, y: 1030 },
    // Terraces narrow the walkable line as the ground rises, so the climb reads
    // as a climb and not as a longer corridor.
    obstacles: [tree(135, 300, 1), tree(700, 245, 3), tree(170, 760, 5), tree(715, 810, 8), { x: 390, y: 530, w: 120, h: 90, kind: 'ruin' }, // Narrow enough to leave a walkable gap on at least one side. Full-width risers
    // turned the island into a stack of corridors the player could not cross.
    { x: 300, y: 430, w: 240, h: 26, kind: 'ledge' }, { x: 340, y: 690, w: 220, h: 26, kind: 'ledge' }],
    grass: [
      { x: 70, y: 430, w: 230, h: 130, chance: 0.34 },
      { x: 575, y: 570, w: 245, h: 165, chance: 0.36 },
      { x: 265, y: 875, w: 300, h: 150, chance: 0.34 },
    ],
    interactables: [
      { id: 'cloud-return', x: 450, y: 1080, radius: 72, kind: 'exit', label: '返回灯火港', target: 'harbor' },
      { id: 'paper-gate', x: 450, y: 150, radius: 82, kind: 'gate', label: '通往纸灯林', target: 'paperwood' },
    ],
    ambience: 'meadow',
    terrain: { shape: 'terrace', landmark: 'stair', blurb: '一级级草台顺着风往上叠，越往上风越硬。' },
  },
  {
    id: 'paperwood', name: '纸灯林', subtitle: '一排纸灯同时低下头', level: 3, safe: false,
    width: 980, height: 1240, background: '#263047', ground: '#65715e', groundAlt: '#74836a', accent: '#e98e72', haze: '#c4b995',
    encounters: ['paperKite', 'cloudPuff', 'mistCrab'], bossId: 'lanternMoth', requiredStage: 2, spawn: { x: 490, y: 1110 },
    // A thicket, not a lawn. The offset rows force the player to weave, which is
    // the whole difference between this island and the meadow before it.
    obstacles: [
      tree(150, 250, 4), tree(370, 330, 9), tree(680, 270, 12), tree(805, 550, 6), tree(130, 690, 10),
      // Thicket rows. Positions are chosen around the spawn, the two travel gates
      // and the grass centres: a grove that walls off its own landmarks is a
      // grove the player cannot use.
      tree(300, 470, 31), tree(560, 560, 32), tree(860, 470, 33), tree(240, 880, 34),
      tree(600, 930, 35), tree(860, 1010, 36), tree(430, 700, 37),
      { x: 420, y: 670, w: 150, h: 90, kind: 'ruin' },
    ],
    grass: [
      { x: 80, y: 410, w: 250, h: 210, chance: 0.4 },
      { x: 620, y: 400, w: 250, h: 240, chance: 0.42 },
      { x: 280, y: 830, w: 410, h: 180, chance: 0.4 },
    ],
    interactables: [
      { id: 'paper-return', x: 490, y: 1160, radius: 72, kind: 'exit', label: '返回灯火港', target: 'harbor' },
      { id: 'lantern-boss', x: 490, y: 150, radius: 92, kind: 'boss', label: '吞灯蛹巢' },
      { id: 'rain-gate', x: 860, y: 830, radius: 82, kind: 'gate', label: '通往雨芽花园', target: 'rainbud' },
    ],
    ambience: 'wood',
    terrain: { shape: 'grove', landmark: 'paperGrove', blurb: '纸灯挂满了枝头，风一过就一起低头。' },
  },
  {
    id: 'rainbud', name: '雨芽花园', subtitle: '雨点悬在花瓣上方', level: 6, safe: false,
    width: 1020, height: 1280, background: '#203a45', ground: '#527b79', groundAlt: '#618d86', accent: '#78d0c3', haze: '#c8e0d6',
    encounters: ['inkBat', 'rainSprout', 'starSentinel'], bossId: 'bellWarden', requiredStage: 4, spawn: { x: 510, y: 1150 },
    // Four pools instead of one. The gaps between them are the only routes, so
    // the island reads as a water garden rather than a field with a pond on it.
    obstacles: [
      tree(150, 330, 13), tree(760, 280, 16),
      // Two trees in a 1020x1280 water garden left the pools marooned. These
      // sit in the gaps between pools so the routes stay walkable while the
      // island stops reading as five puddles on bare ground.
      tree(250, 560, 21), tree(860, 480, 22), tree(330, 180, 20),
      tree(620, 1150, 21), tree(230, 1030, 20), tree(880, 880, 22),
      { x: 420, y: 360, w: 160, h: 115, kind: 'water' },
      { x: 160, y: 750, w: 120, h: 100, kind: 'ruin' },
      { x: 700, y: 860, w: 120, h: 100, kind: 'ruin' },
      { x: 110, y: 730, w: 120, h: 96, kind: 'water' },
      { x: 700, y: 470, w: 132, h: 100, kind: 'water' },
      { x: 330, y: 960, w: 148, h: 92, kind: 'water' },
      { x: 790, y: 1000, w: 118, h: 88, kind: 'water' },
    ],
    grass: [
      { x: 90, y: 510, w: 270, h: 190, chance: 0.43 },
      { x: 650, y: 520, w: 260, h: 210, chance: 0.44 },
      { x: 260, y: 930, w: 500, h: 150, chance: 0.42 },
    ],
    interactables: [
      { id: 'rain-return', x: 510, y: 1195, radius: 72, kind: 'exit', label: '返回灯火港', target: 'harbor' },
      { id: 'bell-boss', x: 510, y: 155, radius: 94, kind: 'boss', label: '雨幕钟塔' },
      { id: 'star-gate', x: 925, y: 660, radius: 82, kind: 'gate', label: '通往观星高台', target: 'starfall' },
    ],
    ambience: 'rain',
    terrain: { shape: 'lagoon', landmark: 'pond', blurb: '雨点悬在半空不落，水面一直保持着涟漪。' },
  },
  {
    id: 'starfall', name: '观星高台', subtitle: '最后一颗星仍未归位', level: 13, safe: false,
    width: 1080, height: 1320, background: '#18243a', ground: '#4d596d', groundAlt: '#59667a', accent: '#d5a6e8', haze: '#b5b4c9',
    encounters: ['inkBat', 'starSentinel', 'mistCrab'], bossId: 'starlessOwl', requiredStage: 6, spawn: { x: 540, y: 1190 },
    // A ring of plinths around the throne. Unlike every other island the walk
    // goes outward first and closes at the top, so the final fight is approached
    // through a corridor rather than straight up the middle.
    obstacles: [
      tree(180, 360, 21), tree(820, 300, 22),
      // The night island had two trees in a 1080x1320 zone, so the middle of it
      // read as an empty plate with a ring on it. Spires ring the walking space
      // and leave the plinth circle and the trail through the middle clear.
      tree(140, 480, 24), tree(250, 980, 22), tree(260, 1150, 25),
      tree(330, 250, 23), tree(620, 200, 22), tree(900, 520, 24),
      tree(950, 820, 21), tree(700, 1180, 23), tree(420, 1220, 22),
      tree(790, 1120, 24),
      { x: 450, y: 430, w: 180, h: 110, kind: 'ruin' },
      { x: 190, y: 820, w: 130, h: 105, kind: 'ruin' },
      { x: 760, y: 900, w: 130, h: 105, kind: 'ruin' },
      { x: 380, y: 700, w: 40, h: 40, kind: 'plinth' },
      { x: 660, y: 700, w: 40, h: 40, kind: 'plinth' },
      { x: 380, y: 980, w: 40, h: 40, kind: 'plinth' },
      { x: 660, y: 980, w: 40, h: 40, kind: 'plinth' },
      { x: 520, y: 620, w: 40, h: 40, kind: 'plinth' },
    ],
    grass: [
      { x: 90, y: 600, w: 290, h: 200, chance: 0.46 },
      { x: 670, y: 600, w: 310, h: 220, chance: 0.46 },
      { x: 300, y: 970, w: 470, h: 140, chance: 0.45 },
    ],
    interactables: [
      { id: 'star-return', x: 540, y: 1240, radius: 72, kind: 'exit', label: '返回灯火港', target: 'harbor' },
      { id: 'final-boss', x: 540, y: 155, radius: 104, kind: 'boss', label: '无星王座' },
    ],
    ambience: 'stars',
    terrain: { shape: 'ring', landmark: 'starPad', blurb: '石台围成一圈，中央空着——那是留给最后一盏灯的位置。' },
  },
];

export const ZONES = Object.fromEntries(ZONE_LIST.map((zone) => [zone.id, zone])) as Record<ZoneDefinition['id'], ZoneDefinition>;

export const BUILDINGS: BuildingDefinition[] = [
  {
    id: 'forge', name: '巡灯工坊', description: '修复锻台，解锁装备制作。', levels: [
      { level: 1, cost: { gold: 40, materials: { cloudFluff: 3 } }, benefit: '解锁基础锻造' },
      { level: 2, cost: { gold: 280, materials: { lampPaper: 6, oldGear: 2 } }, benefit: '锻造 Lv.6 装备' },
      { level: 3, cost: { gold: 760, materials: { starSand: 7, moonThread: 2 } }, benefit: '锻造 Lv.12 装备' },
    ],
  },
  {
    id: 'cottage', name: '巡岛灯屋', description: '让巡岛员有地方休息。', levels: [
      { level: 1, cost: { gold: 100, materials: { cloudFluff: 6, lampPaper: 3 } }, benefit: '最大生命 +35' },
      { level: 2, cost: { gold: 520, materials: { lampPaper: 10, oldGear: 3 } }, benefit: '最大生命 +70，药剂恢复 +10' },
    ],
  },
  {
    id: 'rainCanopy', name: '集雨棚', description: '收集雨珠并保护炉火。', levels: [
      { level: 1, cost: { gold: 320, materials: { rainPearl: 5, lampPaper: 5 } }, benefit: '战斗药剂掉落 +1' },
    ],
  },
  {
    id: 'starChart', name: '星图台', description: '把走散的星路重新缝在一起。', levels: [
      { level: 1, cost: { gold: 700, materials: { starSand: 8, moonThread: 3 } }, benefit: '灯焰获取 +15%' },
    ],
  },
  {
    id: 'beacon', name: '归航灯塔', description: '让迷失的纸灯重新找到岸。', levels: [
      { level: 1, cost: { gold: 1100, materials: { moonThread: 5, starSand: 8, oldGear: 4 } }, benefit: '全岛夜间恢复更快' },
    ],
  },
];

export const QUEST_STAGES: QuestStage[] = [
  { id: 'wake', title: '点亮第一盏灯', hint: '与港中央的露玛交谈。', targetText: '前往灯塔守望者身旁' },
  { id: 'learn', title: '风中试锋', hint: '在云阶草坡击败 3 个灯绒团。', targetText: '灯绒团 0 / 3' },
  { id: 'forge', title: '让工坊重新冒烟', hint: '返回灯火港并修复巡灯工坊。', targetText: '修复巡灯工坊' },
  { id: 'woods', title: '林中的低头纸灯', hint: '击败 5 个纸鸢影，寻找吞灯蛹。', targetText: '纸鸢影 0 / 5' },
  { id: 'moth', title: '夺回纸灯林', hint: '进入纸灯林深处挑战吞灯蛹。', targetText: '前往吞灯蛹巢' },
  { id: 'rain', title: '雨不会自己发光', hint: '在雨芽花园击败 3 个星砂哨兵。', targetText: '星砂哨兵 0 / 3' },
  { id: 'bell', title: '敲响雨幕钟塔', hint: '修复集雨棚后挑战雨幕守铃者。', targetText: '挑战雨幕守铃者' },
  { id: 'stars', title: '找回最后一颗星', hint: '在观星高台击败暮影爪牙。', targetText: '清理观星高台 4 个暮影爪牙' },
  { id: 'final', title: '终夜回响', hint: '登上无星王座，结束长夜。', targetText: '挑战无星夜枭' },
  { id: 'done', title: '灯火归航', hint: '岛群已经恢复光明。继续探索与锻造吧。', targetText: '自由探索' },
];

export const ROUTES = {
  warden: { name: '守灯', description: '稳定生命、防御与药剂回复' },
  shadow: { name: '逐影', description: '强化攻击、暴击与灯焰获取' },
  weaver: { name: '织光', description: '强化范围、速度与经验获取' },
} as const;
