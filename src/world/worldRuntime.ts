import { WEAPONS, ZONES } from '../data';
import { SeededRandom } from '../core/rng';
import type { SaveData, Vec2, WorldObstacle, ZoneDefinition, ZoneInteractable } from '../types';

export interface WorldUpdateEvents {
  moved: boolean;
  stepped: boolean;
  enteredGrass: boolean;
  blocked: boolean;
  nearby: ZoneInteractable | null;
}

export class WorldRuntime {
  x: number;
  y: number;
  facing = -Math.PI / 2;
  walkPhase = 0;
  velocity: Vec2 = { x: 0, y: 0 };
  encounterCooldown = 0;
  currentZone: ZoneDefinition;
  private distanceSinceStep = 0;

  constructor(readonly save: SaveData) {
    this.currentZone = ZONES[save.world.currentZone] ?? ZONES.harbor;
    this.x = save.world.x;
    this.y = save.world.y;
  }

  /**
   * Strength of the hero's lantern, 0 to 1.
   *
   * Derived from the equipped weapon rather than tracked separately: the flame
   * level is the single piece of state that already means "how much light does
   * this character carry", and duplicating it here would let the two drift.
   */
  get flameGlow(): number {
    const weapon = WEAPONS.find((entry) => entry.id === this.save.player.equippedWeapon);
    if (!weapon) return 0;
    const flame = weapon.id === 'sprigFork' ? 26 : weapon.tier * 22 + 8;
    return Math.max(0, Math.min(1, (flame - 20) / 60));
  }

  update(move: Vec2, delta: number, speed: number, random: SeededRandom, canEncounter: boolean): WorldUpdateEvents {
    const beforeX = this.x;
    const beforeY = this.y;
    const length = Math.hypot(move.x, move.y);
    this.encounterCooldown = Math.max(0, this.encounterCooldown - delta);

    if (length > 0.08) {
      const normalizedX = move.x / Math.max(1, length);
      const normalizedY = move.y / Math.max(1, length);
      const scale = Math.min(1, length);
      const vx = normalizedX * speed * scale;
      const vy = normalizedY * speed * scale;
      this.velocity = { x: vx, y: vy };

      const movedX = this.tryMove(vx * delta, 0);
      const movedY = this.tryMove(0, vy * delta);
      if (Math.abs(movedX) > 0.01 || Math.abs(movedY) > 0.01) {
        this.facing = Math.atan2(vy, vx);
        this.walkPhase += delta * 9;
      }
    } else {
      this.velocity = { x: 0, y: 0 };
    }

    const movedDistance = Math.hypot(this.x - beforeX, this.y - beforeY);
    const moved = movedDistance > 0.01;
    this.distanceSinceStep += movedDistance;
    let stepped = false;
    if (this.distanceSinceStep > 34) {
      this.distanceSinceStep = 0;
      stepped = true;
    }

    let enteredGrass = false;
    if (canEncounter && !this.currentZone.safe && this.encounterCooldown <= 0 && this.inGrass()) {
      const patch = this.currentZone.grass.find((item) => (
        this.x >= item.x && this.x <= item.x + item.w && this.y >= item.y && this.y <= item.y + item.h
      ));
      if (patch && random.chance(patch.chance * delta * 0.68)) {
        this.encounterCooldown = 1.8;
        enteredGrass = true;
      }
    }

    this.persist();
    return {
      moved,
      stepped,
      enteredGrass,
      blocked: movedDistance < speed * delta * 0.2 && length > 0.1,
      nearby: this.getNearbyInteractable(),
    };
  }

  enterZone(zoneId: SaveData['world']['currentZone']): void {
    const zone = ZONES[zoneId];
    this.currentZone = zone;
    this.x = zone.spawn.x;
    this.y = zone.spawn.y;
    this.velocity = { x: 0, y: 0 };
    this.encounterCooldown = 1.2;
    this.distanceSinceStep = 0;
    this.persist();
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.velocity = { x: 0, y: 0 };
    this.encounterCooldown = 1.5;
    this.snapToWalkable();
    this.persist();
  }

  getNearbyInteractable(): ZoneInteractable | null {
    let nearest: ZoneInteractable | null = null;
    let nearestDistance = Infinity;
    for (const interactable of this.currentZone.interactables) {
      const distance = Math.hypot(this.x - interactable.x, this.y - interactable.y);
      if (distance <= interactable.radius && distance < nearestDistance) {
        nearest = interactable;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  isWalkable(x: number, y: number, radius = 18): boolean {
    const normalizedX = (x - this.currentZone.width / 2) / (this.currentZone.width / 2 - radius - 18);
    const normalizedY = (y - this.currentZone.height / 2) / (this.currentZone.height / 2 - radius - 18);
    if (normalizedX * normalizedX + normalizedY * normalizedY > 1) return false;
    return !this.currentZone.obstacles.some((obstacle) => this.intersectsObstacle(x, y, radius, obstacle));
  }

  private tryMove(dx: number, dy: number): number {
    let moved = 0;
    if (Math.abs(dx) > 0.0001) {
      const targetX = this.x + dx;
      if (this.isWalkable(targetX, this.y)) {
        this.x = targetX;
        moved += dx;
      }
    }
    if (Math.abs(dy) > 0.0001) {
      const targetY = this.y + dy;
      if (this.isWalkable(this.x, targetY)) {
        this.y = targetY;
        moved += dy;
      }
    }
    return moved;
  }

  private snapToWalkable(): void {
    if (this.isWalkable(this.x, this.y)) return;
    const random = new SeededRandom(Math.floor(this.x * 31 + this.y * 17));
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = random.range(this.currentZone.width * 0.2, this.currentZone.width * 0.8);
      const y = random.range(this.currentZone.height * 0.12, this.currentZone.height * 0.9);
      if (this.isWalkable(x, y)) {
        this.x = x;
        this.y = y;
        return;
      }
    }
    this.x = this.currentZone.spawn.x;
    this.y = this.currentZone.spawn.y;
  }

  private inGrass(): boolean {
    return this.currentZone.grass.some((patch) => (
      this.x >= patch.x && this.x <= patch.x + patch.w && this.y >= patch.y && this.y <= patch.y + patch.h
    ));
  }

  private intersectsObstacle(x: number, y: number, radius: number, obstacle: WorldObstacle): boolean {
    if (obstacle.kind === 'flower' || obstacle.kind === 'lantern') return false;
    const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.w));
    const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.h));
    return Math.hypot(x - nearestX, y - nearestY) < radius;
  }

  private persist(): void {
    this.save.world.currentZone = this.currentZone.id;
    this.save.world.x = this.x;
    this.save.world.y = this.y;
  }
}
