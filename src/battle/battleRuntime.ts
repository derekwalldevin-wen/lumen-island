import { ENEMIES } from '../data';
import { SeededRandom } from '../core/rng';
import { damageRoll, flameMultiplier, flameStage } from '../rules/gameRules';
import type {
  BattleEntity,
  EnemyDefinition,
  FloatingText,
  Hazard,
  Particle,
  PlayerStats,
  Projectile,
  SaveData,
  Vec2,
  WeaponDefinition,
} from '../types';

export interface BattleInput {
  move: Vec2;
  attack: boolean;
  dodge: boolean;
  skill: boolean;
  potion: boolean;
}

export interface BattleHudState {
  heroHp: number;
  heroMaxHp: number;
  heroLevel: number;
  flame: number;
  flameStage: number;
  combo: number;
  skillCooldown: number;
  dodgeCooldown: number;
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  enemyPhase: number;
  elapsed: number;
  enemiesLeft: number;
}

export interface BattleResult {
  victory: boolean;
  enemyIds: string[];
  elapsed: number;
  maxCombo: number;
}

export interface BattleHooks {
  onHud: (hud: BattleHudState) => void;
  onFinish: (result: BattleResult) => void;
  onPotion: () => boolean;
  onEnemyDefeated: (id: string) => void;
  onSound: (name: 'attack' | 'hit' | 'hurt' | 'dodge' | 'perfect' | 'skill' | 'potion' | 'boss' | 'victory' | 'defeat') => void;
  onCombo: (combo: number) => void;
}

const ARENA = { left: 46, right: 434, top: 124, bottom: 732 };

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDelta(a: number, b: number): number {
  let difference = a - b;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return Math.abs(difference);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class BattleRuntime {
  readonly random: SeededRandom;
  hero!: BattleEntity;
  enemies: BattleEntity[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  flame = 0;
  combo = 0;
  maxCombo = 0;
  intro = 0.8;
  elapsed = 0;
  outcome: 'victory' | 'defeat' | null = null;
  private finishTimer = 0;
  private finishSent = false;
  private idCounter = 0;
  private stats!: PlayerStats;
  private weapon!: WeaponDefinition;
  private readonly hooks: BattleHooks;
  private readonly enemyIds: string[] = [];
  private heroInvulnerable = 0;
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private skillCooldown = 0;
  private attackTimer = 0;
  private comboStep = 0;
  private dodgeDirection: Vec2 = { x: 0, y: -1 };
  private pendingHits = 0;

  constructor(hooks: BattleHooks, seed = Date.now()) {
    this.hooks = hooks;
    this.random = new SeededRandom(seed);
  }

  start(enemyIds: string[], stats: PlayerStats, weapon: WeaponDefinition, save: SaveData): void {
    this.stats = stats;
    this.weapon = weapon;
    this.enemyIds.length = 0;
    this.enemyIds.push(...enemyIds);
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.particles = [];
    this.texts = [];
    this.flame = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.elapsed = 0;
    this.intro = 0.8;
    this.outcome = null;
    this.finishTimer = 0;
    this.finishSent = false;
    this.heroInvulnerable = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.skillCooldown = 0;
    this.attackTimer = 0;
    this.comboStep = 0;
    this.pendingHits = 0;

    this.hero = {
      id: this.nextId('hero'),
      kind: 'hero',
      definitionId: 'hero',
      x: 240,
      y: 600,
      vx: 0,
      vy: 0,
      radius: 20,
      hp: clamp(save.player.hp, 1, stats.maxHp),
      maxHp: stats.maxHp,
      damage: stats.attack,
      defense: stats.defense,
      speed: stats.moveSpeed,
      facing: -Math.PI / 2,
      attackTimer: 0,
      telegraphTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
      dead: false,
    };

    const count = enemyIds.length;
    const slots = count === 1
      ? [{ x: 240, y: 245 }]
      : count === 2
        ? [{ x: 165, y: 270 }, { x: 315, y: 270 }]
        : [{ x: 115, y: 245 }, { x: 240, y: 190 }, { x: 365, y: 245 }];
    enemyIds.forEach((enemyId, index) => {
      const definition = ENEMIES[enemyId];
      if (!definition) return;
      const levelScale = 1 + Math.max(0, definition.level - stats.level) * 0.025;
      const slot = slots[index] ?? { x: 180 + index * 75, y: 250 };
      this.enemies.push({
        id: this.nextId(enemyId),
        kind: 'enemy',
        definitionId: enemyId,
        x: slot.x,
        y: slot.y,
        vx: 0,
        vy: 0,
        radius: definition.radius,
        hp: Math.round(definition.hp * levelScale),
        maxHp: Math.round(definition.hp * levelScale),
        damage: definition.damage,
        defense: definition.defense,
        speed: definition.speed,
        facing: Math.PI / 2,
        attackTimer: this.random.range(0.5, 1.45),
        telegraphTimer: 0,
        attackCooldown: definition.attackCooldown,
        hitFlash: 0,
        dead: false,
        phase: 1,
      });
    });

    this.hooks.onHud(this.getHudState());
  }

  update(delta: number, input: BattleInput, save: SaveData): void {
    const safeDelta = Math.min(delta, 0.05);
    this.elapsed += safeDelta;
    this.updateEffects(safeDelta);
    if (this.outcome) {
      this.finishTimer -= safeDelta;
      if (this.finishTimer <= 0 && !this.finishSent) {
        this.finishSent = true;
        this.hooks.onFinish({
          victory: this.outcome === 'victory',
          enemyIds: [...this.enemyIds],
          elapsed: this.elapsed,
          maxCombo: this.maxCombo,
        });
      }
      this.hooks.onHud(this.getHudState());
      return;
    }

    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - safeDelta);
      this.hooks.onHud(this.getHudState());
      return;
    }

    this.attackTimer = Math.max(0, this.attackTimer - safeDelta);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - safeDelta);
    this.skillCooldown = Math.max(0, this.skillCooldown - safeDelta);
    this.heroInvulnerable = Math.max(0, this.heroInvulnerable - safeDelta);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - safeDelta);
    save.player.hp = this.hero.hp;

    if (input.dodge && this.dodgeCooldown <= 0) this.performDodge(input.move);
    if (input.skill && this.skillCooldown <= 0) this.performSkill();
    if (input.potion && this.hero.hp < this.hero.maxHp && this.hooks.onPotion()) {
      const potion = this.stats.potionPower;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + potion);
      this.flame = Math.min(100, this.flame + 12);
      this.addParticles(this.hero.x, this.hero.y - 24, '#8de0cc', 14, 'spark');
      this.hooks.onSound('potion');
    }

    this.updateHeroMovement(input.move, safeDelta);
    if (input.attack && this.attackTimer <= 0) this.performAttack();
    this.updateEnemies(safeDelta);
    this.separateEnemies();
    this.updateProjectiles(safeDelta);
    this.updateHazards(safeDelta);
    this.updateEffects(safeDelta);

    if (this.hero.hp <= 0 && !this.hero.dead) {
      this.hero.dead = true;
      this.triggerOutcome('defeat');
      this.hooks.onSound('defeat');
    } else if (this.enemies.every((enemy) => enemy.dead) && this.enemies.length > 0 && !this.outcome) {
      this.triggerOutcome('victory');
      this.hooks.onSound('victory');
    }
    this.hooks.onHud(this.getHudState());
  }

  getHudState(): BattleHudState {
    const target = this.enemies.find((enemy) => !enemy.dead) ?? this.enemies[this.enemies.length - 1];
    return {
      heroHp: Math.max(0, Math.ceil(this.hero.hp)),
      heroMaxHp: this.hero.maxHp,
      heroLevel: this.stats?.level ?? 1,
      flame: Math.round(this.flame),
      flameStage: flameStage(this.flame),
      combo: this.combo,
      skillCooldown: this.skillCooldown,
      dodgeCooldown: this.dodgeCooldown,
      enemyName: target ? ENEMIES[target.definitionId]?.name ?? '暮影' : '暮影散去',
      enemyHp: target ? Math.max(0, Math.ceil(target.hp)) : 0,
      enemyMaxHp: target?.maxHp ?? 0,
      enemyPhase: target?.phase ?? 1,
      elapsed: this.elapsed,
      enemiesLeft: this.enemies.filter((enemy) => !enemy.dead).length,
    };
  }

  private updateHeroMovement(move: Vec2, delta: number): void {
    if (this.dodgeTimer > 0) {
      this.hero.vx = this.dodgeDirection.x * 520;
      this.hero.vy = this.dodgeDirection.y * 520;
    } else {
      const length = Math.hypot(move.x, move.y);
      const scale = length > 1 ? 1 / length : 1;
      this.hero.vx = move.x * scale * this.stats.moveSpeed;
      this.hero.vy = move.y * scale * this.stats.moveSpeed;
      if (length > 0.08) this.hero.facing = Math.atan2(this.hero.vy, this.hero.vx);
    }
    this.hero.x = clamp(this.hero.x + this.hero.vx * delta, ARENA.left, ARENA.right);
    this.hero.y = clamp(this.hero.y + this.hero.vy * delta, ARENA.top, ARENA.bottom);
  }

  private performDodge(move: Vec2): void {
    const moveLength = Math.hypot(move.x, move.y);
    if (moveLength > 0.1) {
      this.dodgeDirection = { x: move.x / moveLength, y: move.y / moveLength };
      this.hero.facing = Math.atan2(this.dodgeDirection.y, this.dodgeDirection.x);
    } else {
      this.dodgeDirection = { x: Math.cos(this.hero.facing), y: Math.sin(this.hero.facing) };
    }
    this.dodgeTimer = 0.28;
    this.dodgeCooldown = 0.82;
    this.heroInvulnerable = 0.34;
    this.flame = Math.min(100, this.flame + 4 * this.stats.flameGain);
    this.addParticles(this.hero.x, this.hero.y - 20, '#9ce3d7', 10, 'star');
    this.hooks.onSound('dodge');
    const perfect = this.enemies.some((enemy) => (
      !enemy.dead
      && enemy.telegraphTimer > 0
      && distance(this.hero, enemy) < (ENEMIES[enemy.definitionId]?.attackRange ?? 80) + enemy.radius + 48
    ));
    if (perfect) {
      this.flame = Math.min(100, this.flame + 17 * this.stats.flameGain);
      this.combo = Math.min(99, this.combo + 1);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.hooks.onCombo(this.combo);
      this.hooks.onSound('perfect');
      this.addText(this.hero.x, this.hero.y - 70, '精准闪避', '#f4c95d', 18);
    }
  }

  private performAttack(): void {
    this.attackTimer = this.weapon.cooldown / Math.max(0.8, this.weapon.speed);
    const target = this.nearestEnemy(330);
    if (target) this.hero.facing = Math.atan2(target.y - this.hero.y, target.x - this.hero.x);
    this.hooks.onSound('attack');
    if (this.weapon.type === 'bell') {
      const angle = this.hero.facing;
      this.projectiles.push({
        id: this.nextId('projectile'),
        x: this.hero.x + Math.cos(angle) * 26,
        y: this.hero.y - 18 + Math.sin(angle) * 26,
        vx: Math.cos(angle) * 370,
        vy: Math.sin(angle) * 370,
        radius: 9,
        damage: this.stats.attack * 0.9,
        life: 1.1,
        friendly: true,
        color: this.weapon.color,
        kind: 'spark',
      });
      this.addParticles(this.hero.x + Math.cos(angle) * 28, this.hero.y - 18 + Math.sin(angle) * 28, this.weapon.color, 5, 'spark');
    } else {
      this.pendingHits = 0;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const enemyDistance = distance(this.hero, enemy);
        const angle = Math.atan2(enemy.y - this.hero.y, enemy.x - this.hero.x);
        if (enemyDistance <= this.weapon.range + enemy.radius && angleDelta(angle, this.hero.facing) <= this.weapon.arc / 2) {
          this.pendingHits += 1;
          this.hitEnemy(enemy, this.stats.attack, 1);
        }
      }
      this.comboStep = (this.comboStep + 1) % 3;
      this.flame = Math.max(0, this.flame - (this.pendingHits > 0 ? 0 : 2.5));
      if (this.pendingHits === 0) this.combo = 0;
      this.addSlash(this.hero.facing, this.comboStep);
    }
  }

  private performSkill(): void {
    const target = this.nearestEnemy(400);
    if (this.weapon.type === 'branch') {
      this.skillCooldown = 4.2;
      this.hooks.onSound('skill');
      this.addParticles(this.hero.x, this.hero.y - 20, '#b5e58c', 22, 'star');
      for (const enemy of this.enemies) {
        if (!enemy.dead && distance(this.hero, enemy) < 178 + enemy.radius) {
          this.hitEnemy(enemy, this.stats.attack * 2.15, 1.4);
          enemy.vx += (enemy.x - this.hero.x) * 2.1;
          enemy.vy += (enemy.y - this.hero.y) * 2.1;
        }
      }
      this.flame = Math.min(100, this.flame + 22 * this.stats.flameGain);
      this.addText(this.hero.x, this.hero.y - 78, '藤星爆', '#b5e58c', 19);
    } else if (this.weapon.type === 'blade') {
      this.skillCooldown = 3.7;
      this.hooks.onSound('skill');
      this.heroInvulnerable = 0.65;
      if (target) {
        const direction = Math.atan2(target.y - this.hero.y, target.x - this.hero.x);
        const dash = Math.min(210, distance(this.hero, target) - 24);
        this.hero.x = clamp(this.hero.x + Math.cos(direction) * dash, ARENA.left, ARENA.right);
        this.hero.y = clamp(this.hero.y + Math.sin(direction) * dash, ARENA.top, ARENA.bottom);
        this.hero.facing = direction;
        for (const enemy of this.enemies) {
          if (!enemy.dead && distance(this.hero, enemy) < 112 + enemy.radius) this.hitEnemy(enemy, this.stats.attack * 2.4, 1.5);
        }
        this.addParticles(this.hero.x, this.hero.y - 20, '#f8d48e', 26, 'star');
        this.addText(this.hero.x, this.hero.y - 78, '坠月突进', '#f4c95d', 19);
      } else {
        this.heroInvulnerable = 0;
        this.skillCooldown = 0;
      }
      this.flame = Math.min(100, this.flame + 20 * this.stats.flameGain);
    } else {
      this.skillCooldown = 4.6;
      this.hooks.onSound('skill');
      const baseAngle = this.hero.facing;
      for (let index = 0; index < 8; index += 1) {
        const angle = baseAngle + index * Math.PI / 4;
        this.projectiles.push({
          id: this.nextId('ring'),
          x: this.hero.x,
          y: this.hero.y - 16,
          vx: Math.cos(angle) * 250,
          vy: Math.sin(angle) * 250,
          radius: 14,
          damage: this.stats.attack * 0.78,
          life: 0.78,
          friendly: true,
          color: this.weapon.color,
          kind: 'ring',
        });
      }
      this.addParticles(this.hero.x, this.hero.y - 18, this.weapon.color, 24, 'spark');
      this.flame = Math.min(100, this.flame + 24 * this.stats.flameGain);
      this.addText(this.hero.x, this.hero.y - 78, '清音环', '#86d8c9', 19);
    }
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      enemy.attackTimer -= delta;
      const definition = ENEMIES[enemy.definitionId]!;
      const targetDistance = distance(enemy, this.hero);
      if (enemy.phase === 1 && enemy.hp <= enemy.maxHp * 0.5) {
        enemy.phase = 2;
        this.addText(enemy.x, enemy.y - enemy.radius - 30, '暮影翻涌', '#e68b7b', 20);
        this.addParticles(enemy.x, enemy.y - enemy.radius / 2, '#9b7bc0', 20, 'ink');
      }

      if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer -= delta;
        enemy.facing = Math.atan2(this.hero.y - enemy.y, this.hero.x - enemy.x);
        if (enemy.telegraphTimer <= 0) this.executeEnemyAttack(enemy, definition);
        continue;
      }

      if (enemy.attackTimer <= 0 && targetDistance < definition.attackRange + enemy.radius) {
        enemy.telegraphTimer = definition.telegraph / (enemy.phase === 2 ? 1.22 : 1);
        enemy.attackTimer = definition.attackCooldown / (enemy.phase === 2 ? 1.24 : 1);
        if (definition.ai === 'boss' || definition.ai === 'charger') this.addText(enemy.x, enemy.y - enemy.radius - 24, '!', '#ff9a78', 25);
        continue;
      }

      let directionX = 0;
      let directionY = 0;
      if (definition.ai === 'shooter') {
        directionX = targetDistance < 170 ? -1 : targetDistance > 235 ? 1 : 0;
        directionY = Math.sin(this.elapsed * 0.8 + enemy.x) * 0.35;
      } else if (definition.ai === 'charger' || definition.ai === 'flanker') {
        directionX = 1;
        directionY = definition.ai === 'flanker' ? Math.sin(this.elapsed * 2.1 + enemy.y * 0.04) * 0.8 : 0;
      } else if (definition.ai === 'boss') {
        directionX = targetDistance > 190 ? 1 : targetDistance < 130 ? -0.4 : 0;
        directionY = Math.sin(this.elapsed * 0.65 + enemy.x) * 0.32;
      } else {
        directionX = 1;
      }
      const desiredAngle = Math.atan2(this.hero.y - enemy.y, this.hero.x - enemy.x);
      const desiredSpeed = definition.speed * (enemy.phase === 2 ? 1.18 : 1);
      if (directionX === 0 && directionY === 0) {
        enemy.vx = Math.cos(desiredAngle) * desiredSpeed * 0.35;
        enemy.vy = Math.sin(desiredAngle) * desiredSpeed * 0.35;
      } else {
        const angle = directionX < 0 ? desiredAngle + Math.PI : desiredAngle;
        const length = Math.hypot(directionX, directionY) || 1;
        enemy.vx = Math.cos(angle) * (directionX < 0 ? 1 : 1) * desiredSpeed * Math.abs(directionX) / length + directionY * desiredSpeed * 0.4;
        enemy.vy = Math.sin(angle) * desiredSpeed * Math.abs(directionX) / length - directionX * desiredSpeed * 0.4;
      }
      enemy.x = clamp(enemy.x + enemy.vx * delta, ARENA.left + enemy.radius, ARENA.right - enemy.radius);
      enemy.y = clamp(enemy.y + enemy.vy * delta, ARENA.top + enemy.radius, ARENA.bottom - enemy.radius);
    }
  }

  private executeEnemyAttack(enemy: BattleEntity, definition: EnemyDefinition): void {
    const targetDistance = distance(enemy, this.hero);
    const angle = Math.atan2(this.hero.y - enemy.y, this.hero.x - enemy.x);
    if (definition.ai === 'shooter' || definition.ai === 'boss' || definition.ai === 'flanker') {
      const count = enemy.phase === 2 ? 3 : 1;
      for (let index = 0; index < count; index += 1) {
        const spread = (index - (count - 1) / 2) * 0.22;
        this.projectiles.push({
          id: this.nextId('enemy-projectile'),
          x: enemy.x,
          y: enemy.y - 12,
          vx: Math.cos(angle + spread) * (enemy.phase === 2 ? 245 : 190),
          vy: Math.sin(angle + spread) * (enemy.phase === 2 ? 245 : 190),
          radius: enemy.phase === 2 ? 12 : 9,
          damage: enemy.damage,
          life: 3.2,
          friendly: false,
          color: definition.accent,
          kind: definition.ai === 'flanker' ? 'paper' : 'spark',
        });
      }
    }
    if (definition.ai === 'boss') {
      const radius = enemy.definitionId === 'lanternMoth' ? 74 : enemy.definitionId === 'bellWarden' ? 96 : 112;
      this.hazards.push({
        id: this.nextId('hazard'),
        x: this.hero.x,
        y: this.hero.y,
        radius,
        delay: 0.52 / (enemy.phase === 2 ? 1.25 : 1),
        duration: 0.36,
        damage: enemy.damage * 0.8,
        fired: false,
        hit: false,
        color: definition.accent,
      });
      if (enemy.definitionId === 'starlessOwl') {
        for (let index = 0; index < 4; index += 1) {
          const hazardAngle = index * Math.PI / 2 + this.elapsed * 0.2;
          this.hazards.push({
            id: this.nextId('hazard'),
            x: enemy.x + Math.cos(hazardAngle) * 110,
            y: enemy.y + Math.sin(hazardAngle) * 110,
            radius: 48,
            delay: 0.85,
            duration: 0.3,
            damage: enemy.damage * 0.55,
            fired: false,
            hit: false,
            color: '#b49ad8',
          });
        }
      }
    }
    if ((definition.ai === 'melee' || definition.ai === 'tank' || definition.ai === 'charger') && targetDistance < definition.attackRange + enemy.radius + 24) {
      this.hurtHero(enemy.damage, enemy.x, enemy.y);
    }
    if (definition.ai === 'charger' && targetDistance < 240) {
      this.hazards.push({
        id: this.nextId('hazard'),
        x: this.hero.x,
        y: this.hero.y,
        radius: 48,
        delay: 0.26,
        duration: 0.3,
        damage: enemy.damage * 0.65,
        fired: false,
        hit: false,
        color: definition.accent,
      });
    }
  }

  private updateProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]!;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      if (projectile.life <= 0 || projectile.x < 20 || projectile.x > 460 || projectile.y < 90 || projectile.y > 770) {
        this.projectiles.splice(index, 1);
        continue;
      }
      if (projectile.friendly) {
        for (const enemy of this.enemies) {
          if (enemy.dead || distance(projectile, enemy) > projectile.radius + enemy.radius) continue;
          this.hitEnemy(enemy, projectile.damage, 1);
          projectile.life = 0;
          break;
        }
      } else if (distance(projectile, this.hero) < projectile.radius + this.hero.radius) {
        this.hurtHero(projectile.damage, projectile.x, projectile.y);
        projectile.life = 0;
      }
      if (projectile.life <= 0) this.projectiles.splice(index, 1);
    }
  }

  private updateHazards(delta: number): void {
    for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
      const hazard = this.hazards[index]!;
      hazard.delay -= delta;
      if (hazard.delay <= 0) {
        hazard.fired = true;
        if (!hazard.hit && distance(hazard, this.hero) < hazard.radius + this.hero.radius * 0.5) {
          hazard.hit = true;
          this.hurtHero(hazard.damage, hazard.x, hazard.y);
        }
      }
      if (hazard.fired) {
        hazard.duration -= delta;
        if (hazard.duration <= 0) this.hazards.splice(index, 1);
      }
    }
  }

  private hurtHero(amount: number, sourceX: number, sourceY: number): void {
    if (this.heroInvulnerable > 0 || this.dodgeTimer > 0 || this.outcome) return;
    const result = damageRoll(amount, this.stats.defense, 0, 1, this.random.next());
    this.hero.hp = Math.max(0, this.hero.hp - result.amount);
    this.hero.hitFlash = 0.2;
    this.hero.vx = (this.hero.x - sourceX) * 4.5;
    this.hero.vy = (this.hero.y - sourceY) * 4.5;
    this.combo = 0;
    this.flame = Math.max(0, this.flame - 9);
    this.addText(this.hero.x, this.hero.y - 65, `-${result.amount}`, '#ff9b81', 20);
    this.addParticles(this.hero.x, this.hero.y - 24, '#e97874', 10, 'ink');
    this.hooks.onSound('hurt');
  }

  private hitEnemy(enemy: BattleEntity, baseDamage: number, multiplier: number): void {
    if (enemy.dead) return;
    const result = damageRoll(baseDamage * multiplier * flameMultiplier(this.flame), enemy.defense, this.stats.crit, this.stats.critDamage, this.random.next());
    enemy.hp = Math.max(0, enemy.hp - result.amount);
    enemy.hitFlash = 0.16;
    this.combo = Math.min(99, this.combo + 1);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.flame = Math.min(100, this.flame + 4.5 * this.stats.flameGain);
    this.hooks.onCombo(this.combo);
    this.addText(enemy.x, enemy.y - enemy.radius - 15, result.critical ? `暴击 ${result.amount}` : `${result.amount}`, result.critical ? '#f4c95d' : '#fff0ba', result.critical ? 22 : 17);
    this.addParticles(enemy.x, enemy.y - enemy.radius * 0.3, result.critical ? '#f4c95d' : '#f0a080', result.critical ? 14 : 8, 'star');
    this.hooks.onSound('hit');
    if (enemy.hp <= 0) {
      enemy.dead = true;
      this.addParticles(enemy.x, enemy.y - enemy.radius * 0.2, ENEMIES[enemy.definitionId]?.accent ?? '#f4c95d', 24, 'star');
      this.hooks.onEnemyDefeated(enemy.definitionId);
    }
  }

  private nearestEnemy(maxDistance = Infinity): BattleEntity | null {
    let nearest: BattleEntity | null = null;
    let nearestDistance = maxDistance;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const current = distance(this.hero, enemy);
      if (current < nearestDistance) {
        nearest = enemy;
        nearestDistance = current;
      }
    }
    return nearest;
  }

  private separateEnemies(): void {
    for (let first = 0; first < this.enemies.length; first += 1) {
      const a = this.enemies[first]!;
      if (a.dead) continue;
      for (let second = first + 1; second < this.enemies.length; second += 1) {
        const b = this.enemies[second]!;
        if (b.dead) continue;
        const current = distance(a, b);
        const minimum = (a.radius + b.radius) * 0.82;
        if (current > 0 && current < minimum) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const push = (minimum - current) / 2;
          a.x -= Math.cos(angle) * push;
          a.y -= Math.sin(angle) * push;
          b.x += Math.cos(angle) * push;
          b.y += Math.sin(angle) * push;
        }
      }
    }
  }

  private updateEffects(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      if (particle.life <= 0) this.particles.splice(index, 1);
    }
    for (let index = this.texts.length - 1; index >= 0; index -= 1) {
      const text = this.texts[index]!;
      text.life -= delta;
      text.y -= delta * 24;
      if (text.life <= 0) this.texts.splice(index, 1);
    }
  }

  private addParticles(x: number, y: number, color: string, count: number, kind: Particle['kind']): void {
    for (let index = 0; index < count; index += 1) {
      const angle = this.random.range(0, Math.PI * 2);
      const speed = this.random.range(35, 150);
      const life = this.random.range(0.28, 0.72);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: this.random.range(2, 6),
        color,
        spin: this.random.range(-4, 4),
        kind,
      });
    }
  }

  private addSlash(angle: number, step: number): void {
    const spread = (step - 1) * 0.34;
    const color = this.weapon.color;
    for (let index = 0; index < 6; index += 1) {
      const offset = (index / 5 - 0.5) * this.weapon.range * 0.72;
      this.particles.push({
        x: this.hero.x + Math.cos(angle + spread) * (28 + offset),
        y: this.hero.y - 18 + Math.sin(angle + spread) * (28 + offset),
        vx: Math.cos(angle + spread) * 16,
        vy: Math.sin(angle + spread) * 16,
        life: 0.22,
        maxLife: 0.22,
        size: 2.4 + (index % 2) * 1.4,
        color,
        spin: 0,
        kind: 'spark',
      });
    }
  }

  private addText(x: number, y: number, text: string, color: string, size: number): void {
    this.texts.push({ x, y, text, color, life: 0.9, size });
  }

  private triggerOutcome(outcome: 'victory' | 'defeat'): void {
    this.outcome = outcome;
    this.finishTimer = outcome === 'victory' ? 0.7 : 0.9;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }
}
