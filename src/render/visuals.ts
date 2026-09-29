import { ENEMIES, ZONES } from '../data';
import type {
  BattleEntity,
  FloatingText,
  Hazard,
  Particle,
  Projectile,
  SaveData,
  WeaponType,
  WorldObstacle,
  ZoneDefinition,
  ZoneInteractable,
} from '../types';
import { hashString, SeededRandom } from '../core/rng';
import type { WorldRuntime } from '../world/worldRuntime';

export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 800;

interface Camera {
  x: number;
  y: number;
}

export interface GuideVisual {
  /** World-space position of the objective marker. */
  x: number;
  y: number;
  label: string;
  kind: 'target' | 'gate';
  /** True once the player is close enough to trigger the action. */
  inRange: boolean;
}

interface HeroVisual {
  x: number;
  y: number;
  facing: number;
  walkPhase: number;
  flame: number;
  weaponType: WeaponType;
  scale?: number;
  moving?: boolean;
  invulnerable?: boolean;
}

interface WorldVisualOptions {
  time: number;
  camera: Camera;
  nearbyId: string | null;
  reducedMotion: boolean;
  /** Screen-space guidance marker produced by the onboarding layer. */
  guide: GuideVisual | null;
}

interface BattleVisualOptions {
  time: number;
  shake: number;
  flame: number;
  combo: number;
  reducedMotion: boolean;
  intro: number;
  weaponType: WeaponType;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type Paint = string | CanvasGradient | CanvasPattern;

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, from: string, to: string, mid?: string): CanvasGradient {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, from);
  if (mid) gradient.addColorStop(0.52, mid);
  gradient.addColorStop(1, to);
  return gradient;
}

function softLight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, alpha: number): void {
  const gradient = ctx.createRadialGradient(x - rx * 0.28, y - ry * 0.4, 0, x, y, Math.max(rx, ry));
  gradient.addColorStop(0, withAlpha(color, alpha));
  gradient.addColorStop(0.42, withAlpha(color, alpha * 0.32));
  gradient.addColorStop(1, withAlpha(color, 0));
  ellipse(ctx, x, y, rx, ry, gradient);
}

function drawCelOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 0.26): void {
  softLight(ctx, x - radius * 0.32, y - radius * 0.38, radius * 0.7, radius * 0.42, color, alpha);
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.strokeStyle = '#fff3cf';
  ctx.lineWidth = Math.max(1.2, radius * 0.06);
  ctx.beginPath();
  ctx.arc(x - radius * 0.12, y - radius * 0.12, radius * 0.72, Math.PI * 0.9, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();
}

function drawSurfaceTexture(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, seed: number, kind: 'cloth' | 'wood' | 'stone' | 'paper'): void {
  const random = new SeededRandom(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = withAlpha(color, kind === 'cloth' ? 0.22 : 0.18);
  ctx.lineWidth = kind === 'paper' ? 1 : 1.2;
  const count = kind === 'stone' ? 18 : 12;
  for (let index = 0; index < count; index += 1) {
    const px = x + random.range(0, width);
    const py = y + random.range(0, height);
    if (kind === 'cloth') {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + random.range(4, 12), py + random.range(-2, 2));
      ctx.stroke();
    } else if (kind === 'wood') {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 4, py + random.range(-2, 2), px + random.range(8, 18), py);
      ctx.stroke();
    } else if (kind === 'stone') {
      ctx.fillStyle = withAlpha(color, 0.2);
      ctx.fillRect(px, py, random.range(1, 3), random.range(1, 2));
    } else {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + random.range(-3, 3), py + random.range(3, 8));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: Paint,
  stroke?: string,
  lineWidth = 3,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: Paint,
  stroke?: string,
  lineWidth = 3,
): void {
  ellipse(ctx, x, y, radius, radius, fill, stroke, lineWidth);
}

function pathFill(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fill: Paint, stroke?: string, lineWidth = 3): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index]![0], points[index]![1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, points = 4, rotation = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const angle = (index / (points * 2)) * Math.PI * 2;
    const r = index % 2 === 0 ? radius : radius * 0.28;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: Paint, stroke?: string, lineWidth = 3): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Blends two hex colours; `amount` 0 returns `from`, 1 returns `to`. */
function mixHex(from: string, to: string, amount: number): string {
  const parse = (hex: string) => {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const t = Math.min(1, Math.max(0, amount));
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
}

function drawStarburst(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, withAlpha(color, 0.8));
  gradient.addColorStop(0.32, withAlpha(color, 0.24));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  for (let index = 0; index < 6; index += 1) {
    const angle = time * 0.4 + index * Math.PI / 3;
    star(ctx, x + Math.cos(angle) * radius * 0.48, y + Math.sin(angle) * radius * 0.48, 3.5, color, 4, angle);
  }
  ctx.restore();
}

/**
 * Two-part contact shadow: a wide soft ambient pool plus a tight dark core where
 * the body actually meets the ground. The core is what stops figures from
 * appearing to hover over the terrain.
 */
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, alpha = 0.25): void {
  ellipse(ctx, x, y + 2, rx, rx * 0.32, `rgba(10, 19, 33, ${alpha})`);
  ellipse(ctx, x, y + 2, rx * 0.58, rx * 0.17, `rgba(6, 13, 24, ${Math.min(0.5, alpha * 1.5)})`);
}

function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, spacing: number, expression: 'calm' | 'angry' | 'hurt' = 'calm'): void {
  const eyeY = y;
  const eyeRadius = expression === 'hurt' ? 3.1 : 2.9;
  const pupilOffset = expression === 'angry' ? 0.5 : 0;
  for (const side of [-1, 1]) {
    const eyeX = x + side * spacing;
    circle(ctx, eyeX, eyeY, eyeRadius, '#fff2d0');
    circle(ctx, eyeX + pupilOffset, eyeY + 0.35, expression === 'hurt' ? 1.8 : 1.65, '#1a2940');
    circle(ctx, eyeX - 0.7, eyeY - 0.9, 0.75, '#fffdf0');
  }
  if (expression === 'angry') {
    ctx.strokeStyle = '#182238';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - spacing - 4.5, eyeY - 4.5);
    ctx.lineTo(x - spacing + 3, eyeY - 1.2);
    ctx.moveTo(x + spacing + 4.5, eyeY - 4.5);
    ctx.lineTo(x + spacing - 3, eyeY - 1.2);
    ctx.stroke();
  }
  if (expression === 'hurt') {
    ctx.strokeStyle = '#7d4d49';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 6);
    ctx.lineTo(x + 4, y + 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y + 4, expression === 'angry' ? 3.2 : 4, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#7d4d49';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  circle(ctx, x - spacing - 3.2, y + 4, 2, withAlpha('#ec8e77', 0.45));
  circle(ctx, x + spacing + 3.2, y + 4, 2, withAlpha('#ec8e77', 0.45));
}

function drawWeapon(ctx: CanvasRenderingContext2D, type: WeaponType, flame: number): void {
  ctx.save();
  ctx.translate(14, -31);
  ctx.rotate(-0.3);
  ctx.strokeStyle = '#17243a';
  ctx.lineWidth = 4;
  if (type === 'branch') {
    ctx.strokeStyle = '#5d6a45';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -27);
    ctx.stroke();
    ctx.strokeStyle = '#8fcf9b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-10, -28);
    ctx.moveTo(0, -23);
    ctx.lineTo(11, -33);
    ctx.stroke();
    star(ctx, 0, -28, 6, '#f4c95d', 4, 0.2);
  } else if (type === 'blade') {
    pathFill(ctx, [[0, 18], [1, -25], [7, -33], [8, -9], [5, 18]], '#f4d88f', '#17243a', 2.5);
    ctx.fillStyle = '#fff0b8';
    ctx.fillRect(-3, -17, 3, 27);
    roundRect(ctx, -9, 12, 18, 5, 2, '#e38d66', '#17243a', 2);
  } else {
    ctx.strokeStyle = '#6a5747';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(0, -15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -22, 9, 0, Math.PI * 2);
    ctx.strokeStyle = '#72c9bd';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(0, -15);
    ctx.stroke();
    if (flame > 22) star(ctx, 0, -22, 5, '#f4c95d', 4, 0.4);
  }
  ctx.restore();
}

export function drawHero(ctx: CanvasRenderingContext2D, visual: HeroVisual): void {
  const scale = visual.scale ?? 1;
  const stride = visual.moving ? Math.sin(visual.walkPhase) * 3.2 : 0;
  const bob = visual.moving ? Math.abs(Math.cos(visual.walkPhase)) * 1.6 : Math.sin(visual.walkPhase * 0.35) * 0.7;
  const hurt = visual.invulnerable ?? false;
  const facingRight = Math.cos(visual.facing) >= -0.15;
  drawShadow(ctx, visual.x, visual.y + 3, 27 * scale, 0.3);
  softLight(ctx, visual.x, visual.y + 1, 40 * scale, 16 * scale, visual.flame > 22 ? '#f4c95d' : '#7ccabc', visual.flame > 22 ? 0.22 : 0.1);
  if (visual.flame > 22) drawStarburst(ctx, visual.x, visual.y - 26 * scale, 58 * scale, '#f4c95d', visual.walkPhase);

  ctx.save();
  ctx.translate(visual.x, visual.y + bob);
  ctx.scale(scale * (facingRight ? 1 : -1), scale);
  if (hurt && Math.floor(visual.walkPhase * 12) % 2 === 0) ctx.globalAlpha = 0.48;

  const coat = linear(ctx, -24, -34, 22, -2, '#b85f5d', '#e88967', '#ef9d6d');
  const coatLight = linear(ctx, -7, -31, 9, -6, '#ffe08e', '#f1c66d');
  const skin = linear(ctx, -14, -58, 15, -28, '#ffe0b0', '#e8a47f', '#f4c39b');
  const hair = linear(ctx, -18, -62, 15, -34, '#4a3a44', '#6e4e3c', '#8a6350');
  const boot = linear(ctx, -14, -10, 14, 4, '#1b2b42', '#3a5066');

  roundRect(ctx, -13 + stride, -9, 10, 13, 4, boot, '#0f1c2e', 3);
  roundRect(ctx, 3 - stride, -9, 10, 13, 4, boot, '#0f1c2e', 3);
  pathFill(ctx, [[-18, -31], [18, -31], [23, -5], [0, 1], [-23, -5]], coat, '#0f1c2e', 3.5);
  pathFill(ctx, [[-8, -30], [8, -30], [4, -7], [-4, -7]], coatLight, '#8d5d3c', 2);
  pathFill(ctx, [[-18, -27], [-7, -21], [-16, -8], [-23, -5]], withAlpha('#6d4151', 0.5));
  drawSurfaceTexture(ctx, -20, -29, 40, 24, '#ffe0b0', 12, 'cloth');
  roundRect(ctx, -19, -9, 38, 5, 2, '#5a4350', '#0f1c2e', 2);
  circle(ctx, 0, -6.5, 2.8, '#fff0b8', '#8d5d3c', 1.5);

  // Arms, lantern charm and weapon.
  roundRect(ctx, -27, -28, 9, 19, 4, linear(ctx, -28, -30, -18, -8, '#ffd09b', '#e79a76'), '#0f1c2e', 3);
  roundRect(ctx, 17, -29, 9, 18, 4, linear(ctx, 16, -30, 27, -9, '#ffd09b', '#e79a76'), '#0f1c2e', 3);
  drawWeapon(ctx, visual.weaponType, visual.flame);
  ctx.save();
  ctx.translate(-19, -5);
  ctx.rotate(-0.18);
  ctx.strokeStyle = '#5b4352';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 8);
  ctx.stroke();
  roundRect(ctx, -5, 7, 10, 12, 3, linear(ctx, -5, 7, 5, 19, '#fff0b8', '#e8a24e'), '#0f1c2e', 2);
  circle(ctx, 0, 13, 2.4, '#fff8d2');
  ctx.restore();

  // Head, hair and rim light.
  circle(ctx, 0, -44, 20, skin, '#0f1c2e', 3.5);
  ctx.beginPath();
  ctx.arc(0, -47, 20, Math.PI, Math.PI * 2);
  ctx.lineTo(20, -37);
  ctx.quadraticCurveTo(9, -47, 1, -39);
  ctx.quadraticCurveTo(-10, -47, -20, -38);
  ctx.closePath();
  ctx.fillStyle = hair;
  ctx.fill();
  ctx.strokeStyle = '#0f1c2e';
  ctx.lineWidth = 3;
  ctx.stroke();
  pathFill(ctx, [[-2, -66], [2, -73], [7, -65]], '#f4c95d', '#0f1c2e', 2);
  ctx.strokeStyle = withAlpha('#f7d6a1', 0.65);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-14, -49);
  ctx.quadraticCurveTo(-8, -57, -1, -53);
  ctx.moveTo(5, -55);
  ctx.quadraticCurveTo(11, -50, 15, -52);
  ctx.stroke();
  drawFace(ctx, 0, -43, 7);
  circle(ctx, -12, -37, 3.4, withAlpha('#ec8e77', 0.78));
  circle(ctx, 12, -37, 3.4, withAlpha('#ec8e77', 0.78));
  ctx.strokeStyle = withAlpha('#fff0b8', 0.48);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -44, 19, -1.9, -0.8);
  ctx.stroke();
  ctx.restore();
}

function drawLuma(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  drawShadow(ctx, x, y + 2, 30, 0.3);
  softLight(ctx, x, y - 10, 46, 26, '#f4c95d', 0.16);
  const bob = Math.sin(time * 1.4) * 1.5;
  ctx.save();
  ctx.translate(x, y + bob);
  const robe = linear(ctx, -22, -38, 22, 4, '#415b60', '#78918a', '#9eb3a0');
  roundRect(ctx, -19, -35, 38, 39, 10, robe, '#0f1c2e', 3.5);
  pathFill(ctx, [[-22, -34], [0, -55], [22, -34]], linear(ctx, -18, -52, 16, -30, '#f7d98d', '#c68f58'), '#0f1c2e', 3);
  circle(ctx, 0, -48, 17, linear(ctx, -12, -62, 12, -36, '#ffe0b5', '#d99d81'), '#0f1c2e', 3);
  pathFill(ctx, [[-18, -50], [-6, -69], [11, -62], [18, -47], [5, -53], [-4, -45]], linear(ctx, -16, -64, 15, -44, '#f2eddc', '#b9c2b4'), '#0f1c2e', 2.5);
  drawFace(ctx, 0, -48, 6);
  ctx.strokeStyle = '#0f1c2e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, -30);
  ctx.lineTo(28, -19);
  ctx.stroke();
  roundRect(ctx, 20, -21, 15, 20, 5, linear(ctx, 20, -21, 35, -1, '#fff0b8', '#e3a04f'), '#0f1c2e', 2.5);
  circle(ctx, 27.5, -11, 4.5, withAlpha('#fff8d2', 0.9));
  ctx.strokeStyle = withAlpha('#fff0b8', 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -48, 15, -2.2, -0.6);
  ctx.stroke();
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, obstacle: WorldObstacle): void {
  const x = obstacle.x + obstacle.w / 2;
  const y = obstacle.y + obstacle.h;
  const seed = obstacle.seed ?? hashString(`${obstacle.x}:${obstacle.y}`);
  const random = new SeededRandom(seed);
  // Per-tree personality so a grove does not read as one stamp repeated.
  const lean = random.range(-7, 7);
  const layers = 3 + (random.next() > 0.62 ? 1 : 0);
  const hueShift = random.range(-0.06, 0.06);
  const palette = [
    mixHex('#2b4b52', hueShift > 0 ? '#2f5a52' : '#27414f', Math.abs(hueShift) * 8),
    mixHex('#3f6b62', hueShift > 0 ? '#4a7a63' : '#375c60', Math.abs(hueShift) * 8),
    mixHex('#5a8a72', hueShift > 0 ? '#6b9a74' : '#4f7a70', Math.abs(hueShift) * 8),
  ];

  drawShadow(ctx, x + lean * 0.3, y - 2, obstacle.w * 0.54, 0.32);
  softLight(ctx, x, y - 40, obstacle.w * 0.8, obstacle.h * 0.8, '#b9e0c0', 0.09);

  // Trunk leans, with a root flare and two bare branches for silhouette interest.
  const trunkHeight = 44;
  pathFill(ctx, [
    [x - 9, y],
    [x - 6, y - trunkHeight],
    [x + 6, y - trunkHeight],
    [x + 9, y],
  ], linear(ctx, x - 9, y - trunkHeight, x + 9, y, '#3f4a43', '#75674f'), '#0f1c2e', 3);
  drawSurfaceTexture(ctx, x - 7, y - trunkHeight + 2, 14, trunkHeight - 4, '#d4c08d', seed, 'wood');
  ctx.strokeStyle = '#4a5148';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + lean * 0.4, y - trunkHeight + 6);
  ctx.quadraticCurveTo(x + lean * 0.7, y - trunkHeight - 8, x + lean, y - trunkHeight - 15);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x + lean * 0.3, y - trunkHeight + 15);
  ctx.quadraticCurveTo(x + lean * 0.4 - 7, y - trunkHeight + 8, x + lean * 0.4 - 11, y - trunkHeight + 3);
  ctx.stroke();

  for (let layer = 0; layer < layers; layer += 1) {
    const width = obstacle.w * (0.46 - layer * 0.055);
    const height = 28 + layer * 7;
    const centerX = x + lean * (0.5 + layer * 0.22) + random.range(-4, 4);
    const centerY = y - 48 - layer * 17;
    const base = palette[layer % palette.length]!;
    const leaf = linear(ctx, centerX - width / 2, centerY - height, centerX + width / 2, centerY + height, '#7eb28a', base, '#2c4c56');
    // Canopy shape varies per layer so the crown is lumpy, not a stacked cone.
    const jitter = (slot: number) => random.range(-width * 0.07, width * 0.07);
    pathFill(ctx, [
      [centerX - width / 2, centerY + height * 0.2],
      [centerX - width * 0.34, centerY - height * 0.28 + jitter(1)],
      [centerX - width * 0.08, centerY - height * 0.55 + jitter(2)],
      [centerX + width * 0.3, centerY - height * 0.3 + jitter(3)],
      [centerX + width / 2, centerY + height * 0.24 + jitter(4)],
      [centerX + width * 0.12, centerY + height * 0.46],
      [centerX - width * 0.22, centerY + height * 0.4],
    ], leaf, '#0f1c2e', 3);

    // Moon-side highlight on the upper-left of each canopy lobe.
    ctx.strokeStyle = withAlpha('#d8f0c0', 0.34);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(centerX - width * 0.32, centerY - height * 0.1);
    ctx.quadraticCurveTo(centerX - width * 0.2, centerY - height * 0.34, centerX - width * 0.02, centerY - height * 0.44);
    ctx.stroke();
    // A couple of leaf specks catch the light.
    if (layer > 0) {
      circle(ctx, centerX - width * 0.26, centerY - height * 0.16, 2.2, withAlpha('#c8e8a8', 0.42));
      circle(ctx, centerX + width * 0.18, centerY - height * 0.22, 1.8, withAlpha('#c8e8a8', 0.32));
    }
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: WorldObstacle, save: SaveData, time = 0): void {
  if (obstacle.kind === 'tree') {
    drawTree(ctx, obstacle);
    return;
  }
  const x = obstacle.x;
  const y = obstacle.y;
  const w = obstacle.w;
  const h = obstacle.h;
  drawShadow(ctx, x + w / 2, y + h, w * 0.5, 0.2);
  if (obstacle.kind === 'rock') {
    pathFill(ctx, [[x, y + h], [x + 8, y + 18], [x + w * 0.38, y], [x + w * 0.76, y + 12], [x + w, y + h]], linear(ctx, x, y, x + w, y + h, '#4d6471', '#8da2a5'), '#0f1c2e', 3);
    pathFill(ctx, [[x + 15, y + 18], [x + w * 0.4, y + 7], [x + w * 0.64, y + 25], [x + 30, y + 38]], withAlpha('#d5e5dc', 0.48));
    ctx.strokeStyle = withAlpha('#e9f2d8', 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 20);
    ctx.lineTo(x + w * 0.4, y + 9);
    ctx.stroke();
  } else if (obstacle.kind === 'ruin') {
    roundRect(ctx, x + 8, y + 18, w - 16, h - 18, 4, linear(ctx, x, y, x + w, y + h, '#5f6e6b', '#b3ae95'), '#0f1c2e', 3);
    roundRect(ctx, x, y, 22, 30, 4, linear(ctx, x, y, x + 24, y + 30, '#8e9482', '#d3c9a5'), '#0f1c2e', 3);
    roundRect(ctx, x + w - 28, y + 8, 28, 22, 4, linear(ctx, x + w - 28, y + 8, x + w, y + 30, '#8e9482', '#d3c9a5'), '#0f1c2e', 3);
    ctx.strokeStyle = '#4c5a5b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 35, y + 26);
    ctx.lineTo(x + 45, y + 53);
    ctx.lineTo(x + 31, y + 78);
    ctx.stroke();
  } else if (obstacle.kind === 'house') {
    const level = save.world.buildings.cottage ?? 0;
    const body = level >= 2 ? '#c78269' : level === 1 ? '#8fa18d' : '#6e827a';
    roundRect(ctx, x + 5, y + 30, w - 10, h - 30, 7, linear(ctx, x, y + 30, x + w, y + h, body, '#3c5a5a'), '#0f1c2e', 3.5);
    drawSurfaceTexture(ctx, x + 5, y + 30, w - 10, h - 30, '#e2d2ab', Math.floor(x + y), 'paper');
    // Moon-side lift on the wall, so the face is not one flat wash.
    ctx.save();
    roundRect(ctx, x + 5, y + 30, w - 10, h - 30, 7, linear(ctx, x, y + 30, x + 34, y + 66, withAlpha('#e4f0cf', 0.18), withAlpha('#e4f0cf', 0)), '#0f1c2e', 0);
    ctx.restore();
    pathFill(ctx, [[x - 4, y + 38], [x + w / 2, y - 3], [x + w + 4, y + 38]], level ? linear(ctx, x, y, x + w, y + 38, '#e88b6d', '#a64952') : linear(ctx, x, y, x + w, y + 38, '#7e8982', '#404d56'), '#0f1c2e', 3);
    // Roof overhang shadow seats the roof on the wall.
    ctx.fillStyle = 'rgba(6, 16, 28, 0.3)';
    ctx.fillRect(x + 2, y + 36, w - 4, 7);
    roundRect(ctx, x + w / 2 - 13, y + h - 35, 26, 35, 5, linear(ctx, x, y, x + 26, y + 35, '#6e5044', '#302b36'), '#0f1c2e', 2.5);
    if (level > 0) {
      // A lit window is what makes a cottage read as somebody's home.
      softLight(ctx, x + 29, y + 58, 32, 26, '#f4c95d', 0.26);
      softLight(ctx, x + 29, y + 86, 26, 12, '#e8a24e', 0.14);
      roundRect(ctx, x + 18, y + 48, 22, 20, 4, linear(ctx, x + 18, y + 48, x + 40, y + 68, '#fff0b8', '#e2a14c'), '#0f1c2e', 2.5);
      ctx.strokeStyle = withAlpha('#fff0b8', 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 58);
      ctx.lineTo(x + 38, y + 58);
      ctx.stroke();
      for (let puff = 0; puff < 3; puff += 1) {
        const rise = (time * 12 + puff * 19) % 48;
        circle(ctx, x + w - 26 + Math.sin(time * 0.6 + puff) * 6, y + 6 - rise * 0.5, 4 + rise * 0.1, withAlpha('#e6ece6', 0.2 * (1 - rise / 48)));
      }
      drawHangingLantern(ctx, x + w - 18, y + 48, 0.4, '#f2c86e', time, 1.7);
    } else {
      // Unlit: dark glass with a cool reflection, so it still has life.
      roundRect(ctx, x + 18, y + 48, 22, 20, 4, linear(ctx, x + 18, y + 48, x + 40, y + 68, '#2b3a4c', '#1b2735'), '#0f1c2e', 2.5);
      pathFill(ctx, [[x + 20, y + 66], [x + 32, y + 50], [x + 38, y + 50], [x + 26, y + 66]], withAlpha('#8fa8c4', 0.28));
    }
  } else if (obstacle.kind === 'forge') {
    const level = save.world.buildings.forge ?? 0;
    // Stone base with a warm bounce along the lit edge.
    roundRect(ctx, x + 8, y + 28, w - 16, h - 28, 7, linear(ctx, x, y + 28, x + w, y + h, level ? '#8b9c91' : '#4a5860', '#31454e'), '#0f1c2e', 3.5);
    drawSurfaceTexture(ctx, x + 8, y + 28, w - 16, h - 28, '#d8e1cd', Math.floor(x * 3 + y), 'stone');
    ctx.save();
    roundRect(ctx, x + 8, y + 28, w - 16, h - 28, 7, linear(ctx, x, y + 28, x + 30, y + 60, withAlpha('#e4f0cf', 0.16), withAlpha('#e4f0cf', 0)), '#0f1c2e', 0);
    ctx.restore();
    pathFill(ctx, [[x, y + 34], [x + w / 2, y + 4], [x + w, y + 34]], linear(ctx, x, y + 4, x + w, y + 34, '#72858b', '#2c3a45'), '#0f1c2e', 3);
    // Roof overhang shadow grounds the roof onto the wall.
    ctx.fillStyle = 'rgba(6, 16, 28, 0.3)';
    ctx.fillRect(x + 6, y + 32, w - 12, 7);
    roundRect(ctx, x + 27, y + 54, w - 54, 32, 5, level ? linear(ctx, x + 27, y + 54, x + w - 27, y + 86, '#ffe08a', '#e06e4e') : '#1b2734', '#0f1c2e', 3);
    if (level) {
      // Forge mouth glows, throws light onto the ground, and vents smoke.
      softLight(ctx, x + w / 2, y + 69, 44, 34, '#f4c95d', 0.3);
      softLight(ctx, x + w / 2, y + 96, 54, 20, '#e8a24e', 0.16);
      star(ctx, x + w / 2, y + 69, 10, '#fff0b8', 4, 0.2);
      circle(ctx, x + 24, y + 34, 5, '#f4c95d');
      for (let puff = 0; puff < 4; puff += 1) {
        const rise = (time * 15 + puff * 16) % 52;
        const drift = Math.sin(time * 0.7 + puff) * 7;
        const alpha = 0.24 * (1 - rise / 52);
        circle(ctx, x + w * 0.74 + drift, y + 12 - rise * 0.5, 5 + rise * 0.11, withAlpha('#dfe7e0', alpha));
      }
    } else {
      // Cold forge still shows a faint ember bed so it does not read as a hole.
      ctx.fillStyle = withAlpha('#3a4756', 0.6);
      ctx.fillRect(x + 31, y + 60, w - 62, 6);
    }
  } else if (obstacle.kind === 'water') {
    const radius = Math.min(26, h / 2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = linear(ctx, x, y, x + w, y + h, '#204f63', '#74bcb0');
    ctx.fillRect(x, y, w, h);
    for (let index = 0; index < 5; index += 1) {
      const waveY = y + 15 + index * 19 + Math.sin(time * 1.5 + index) * 2;
      ctx.strokeStyle = withAlpha('#e2fbeb', 0.58 - index * 0.06);
      ctx.lineWidth = index === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 8, waveY);
      ctx.bezierCurveTo(x + w * 0.28, waveY - 8, x + w * 0.62, waveY + 8, x + w - 8, waveY - 2);
      ctx.stroke();
    }
    for (let index = 0; index < 3; index += 1) {
      const lx = x + w * (0.24 + index * 0.26);
      const ly = y + h * (0.28 + (index % 2) * 0.34) + Math.sin(time * 0.9 + index) * 2;
      ellipse(ctx, lx, ly, 11, 5, withAlpha('#8acb8f', 0.72));
      circle(ctx, lx + 2, ly - 1, 2.4, '#f4c95d');
    }
    ctx.restore();
    roundRect(ctx, x, y, w, h, radius, 'rgba(15,28,46,0)', '#0f1c2e', 3.5);
    softLight(ctx, x + w * 0.28, y + 10, w * 0.32, 13, '#e0fff0', 0.2);
  } else if (obstacle.kind === 'flower') {
    for (let index = 0; index < 7; index += 1) circle(ctx, x + 10 + index * 13, y + h * 0.5, 4, index % 2 ? '#f4c95d' : '#e88d82');
  }
}

function drawGate(ctx: CanvasRenderingContext2D, interactable: ZoneInteractable, time: number): void {
  drawShadow(ctx, interactable.x, interactable.y + 10, 60, 0.26);
  const color = interactable.kind === 'boss' ? '#d56f68' : '#f2c86e';
  softLight(ctx, interactable.x, interactable.y - 40, 76, 72, color, interactable.kind === 'boss' ? 0.2 : 0.13);
  roundRect(ctx, interactable.x - 42, interactable.y - 78, 17, 88, 5, linear(ctx, interactable.x - 42, interactable.y - 78, interactable.x - 25, interactable.y + 10, '#8ea092', '#3c5350'), '#0f1c2e', 3.5);
  roundRect(ctx, interactable.x + 25, interactable.y - 78, 17, 88, 5, linear(ctx, interactable.x + 25, interactable.y - 78, interactable.x + 42, interactable.y + 10, '#8ea092', '#3c5350'), '#0f1c2e', 3.5);
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(interactable.x - 33, interactable.y - 69);
  ctx.lineTo(interactable.x + 33, interactable.y - 69);
  ctx.stroke();
  ctx.setLineDash([]);
  star(ctx, interactable.x, interactable.y - 82, 11 + Math.sin(time * 2) * 1.5, color, 4, time * 0.3);
  star(ctx, interactable.x, interactable.y - 82, 5, '#fff0b8', 4, -time * 0.5);
}

function drawPortal(ctx: CanvasRenderingContext2D, interactable: ZoneInteractable, time: number): void {
  const y = interactable.y;
  softLight(ctx, interactable.x, y - 12, 76, 34, '#8fdfd2', 0.2);
  ellipse(ctx, interactable.x, y, 52, 18, 'rgba(16, 31, 49, 0.5)');
  for (let ring = 0; ring < 4; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(interactable.x, y - ring * 4, 38 - ring * 5, 11 - ring * 2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(ring === 0 ? '#f4c95d' : ring === 3 ? '#b5f0dc' : '#8fdfd2', 0.82 - ring * 0.14);
    ctx.lineWidth = ring === 0 ? 4 : 2;
    ctx.stroke();
  }
  for (let index = 0; index < 7; index += 1) {
    const angle = time * 0.7 + index * (Math.PI * 2 / 7);
    star(ctx, interactable.x + Math.cos(angle) * 32, y - 14 + Math.sin(angle) * 11, 3.5 + (index % 2), '#fff0b8', 4, angle);
  }
}

function drawWorldLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, active: boolean): void {
  ctx.save();
  ctx.font = active ? '800 15px "Microsoft YaHei", sans-serif' : '700 13px "Microsoft YaHei", sans-serif';
  const width = ctx.measureText(text).width + 30;
  const fill = active ? linear(ctx, x - width / 2, y - 30, x + width / 2, y, '#fff0b8', '#e8a64f') : linear(ctx, x - width / 2, y - 30, x + width / 2, y, '#2c4760', '#17283f');
  roundRect(ctx, x - width / 2, y - 30, width, 30, 8, fill, '#0f1c2e', 2.5);
  ctx.fillStyle = active ? '#17243a' : '#fff1c1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 15);
  ctx.restore();
}

function drawGrass(ctx: CanvasRenderingContext2D, zone: ZoneDefinition, time: number): void {
  for (const patch of zone.grass) {
    const cx = patch.x + patch.w * 0.5;
    const cy = patch.y + patch.h * 0.5;
    const seed = hashString(`${zone.id}:${patch.x}:${patch.y}`);
    const random = new SeededRandom(seed);

    ctx.save();
    // Soft mound of taller grass instead of a hard rectangle, so an encounter
    // patch reads as terrain rather than a selection box.
    organicOutline(ctx, cx, cy, patch.w * 0.52, patch.h * 0.54, seed, 0.07, 40);
    const bed = ctx.createRadialGradient(cx, cy + patch.h * 0.18, 2, cx, cy, patch.w * 0.56);
    bed.addColorStop(0, withAlpha(zone.groundAlt, 0.6));
    bed.addColorStop(0.6, withAlpha('#3d6350', 0.48));
    bed.addColorStop(1, withAlpha('#2c4a42', 0));
    ctx.fillStyle = bed;
    ctx.fill();

    // Warm light pooling in the middle hints that something lives here.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, patch.w * 0.5);
    glow.addColorStop(0, withAlpha(zone.accent, 0.15));
    glow.addColorStop(1, withAlpha(zone.accent, 0));
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.clip();
    for (let index = 0; index < 46; index += 1) {
      const x = patch.x + random.range(2, patch.w - 2);
      const y = patch.y + random.range(4, patch.h - 2);
      // Blades near the centre stand taller, which fakes a little volume.
      const centreBias = 1 - Math.min(1, Math.hypot(x - cx, y - cy) / (patch.w * 0.5));
      const height = 9 + centreBias * 9;
      const sway = Math.sin(time * (1.2 + (index % 4) * 0.08) + x * 0.03) * (index % 5 === 0 ? 5 : 3);
      ctx.strokeStyle = index % 3 === 0
        ? withAlpha('#f6d98a', 0.72)
        : index % 4 === 0
          ? withAlpha(zone.accent, 0.5)
          : index % 5 === 0 ? '#547a63' : '#3f6656';
      ctx.lineWidth = index % 6 === 0 ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway, y - height * 0.55, x + sway * 1.5, y - height);
      ctx.stroke();
      if (index % 9 === 0) {
        circle(ctx, x + sway * 1.3, y - height, 2.4, index % 2 ? '#f4c95d' : '#ef9a86');
      }
    }
    ctx.restore();
  }
}

function drawGroundTexture(ctx: CanvasRenderingContext2D, zone: ZoneDefinition): void {
  const random = new SeededRandom(hashString(zone.id));
  for (let index = 0; index < 190; index += 1) {
    const x = random.range(40, zone.width - 40);
    const y = random.range(50, zone.height - 40);
    const radius = random.range(0.8, 2.4);
    circle(ctx, x, y, radius, index % 4 === 0 ? withAlpha(zone.accent, 0.24) : withAlpha('#f6efd4', 0.11));
    if (index % 17 === 0) {
      ctx.strokeStyle = withAlpha('#f6efd4', 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y - 1);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = withAlpha('#f5edcf', 0.08);
  ctx.lineWidth = 2;
  for (let x = 90; x < zone.width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.quadraticCurveTo(x + 35, zone.height * 0.45, x - 15, zone.height - 30);
    ctx.stroke();
  }
}

function drawScatterDecor(ctx: CanvasRenderingContext2D, zone: ZoneDefinition, time: number): void {
  const random = new SeededRandom(hashString(`decor:${zone.id}`));

  // Low, rounded stones and flower clumps sit on the ground plane. They give
  // the eye something to measure the island against, which flat colour cannot.
  for (let index = 0; index < 26; index += 1) {
    const x = random.range(50, zone.width - 50);
    const y = random.range(60, zone.height - 45);
    const size = random.range(4, 9);
    if (index % 3 === 0) {
      // Flower clump: a few blossoms on short stems.
      const tint = index % 6 === 0 ? '#f4c95d' : index % 6 === 3 ? '#e98a7e' : '#c6a9e4';
      for (let bloom = 0; bloom < 3; bloom += 1) {
        const bx = x + random.range(-size, size);
        const by = y + random.range(-3, 3);
        const sway = Math.sin(time * 1.1 + index + bloom) * 1.2;
        ctx.strokeStyle = withAlpha('#4c7a5f', 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sway, by - 4, bx + sway * 1.4, by - 7);
        ctx.stroke();
        circle(ctx, bx + sway * 1.4, by - 7, 2.1, tint);
        circle(ctx, bx + sway * 1.4, by - 7, 0.9, '#fff6dc');
      }
    } else {
      // Stone: a lit cap over a shadowed base, with a contact shadow.
      ellipse(ctx, x, y + 1.5, size * 1.15, size * 0.4, 'rgba(9, 19, 32, 0.26)');
      ellipse(ctx, x, y, size, size * 0.66, linear(ctx, x - size, y - size * 0.6, x + size, y + size * 0.5, '#8d9a94', '#4d5c60'));
      ellipse(ctx, x - size * 0.28, y - size * 0.22, size * 0.5, size * 0.28, withAlpha('#dfe8dc', 0.5));
    }
  }

  for (let index = 0; index < 52; index += 1) {
    const x = random.range(35, zone.width - 35);
    const y = random.range(45, zone.height - 35);
    const type = index % 9;
    if (type === 0) {
      const sway = Math.sin(time * 1.1 + index) * 2;
      ctx.strokeStyle = withAlpha('#31594f', 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway, y - 8, x + sway * 1.4, y - 13);
      ctx.moveTo(x + 1, y - 1);
      ctx.quadraticCurveTo(x - 4, y - 7, x - 5, y - 11);
      ctx.stroke();
    } else if (type === 1) {
      const sway = Math.sin(time * 0.9 + index) * 2;
      circle(ctx, x + sway, y - 8, 3, index % 2 ? '#f4c95d' : '#e98a7e');
      circle(ctx, x + sway, y - 9, 1.2, '#fff0b8');
    } else if (type === 2) {
      ellipse(ctx, x, y, 5, 2.5, withAlpha('#d9d0ae', 0.45));
      ellipse(ctx, x - 1, y - 1, 2, 1, withAlpha('#fff0cf', 0.42));
    } else if (type === 3) {
      ctx.strokeStyle = withAlpha(zone.accent, 0.45);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 5 + Math.sin(time + index) * 0.6, 0.2, Math.PI * 0.9);
      ctx.stroke();
    } else if (type === 4) {
      const glow = 0.08 + (Math.sin(time * 1.6 + index) + 1) * 0.03;
      softLight(ctx, x, y - 4, 15, 10, zone.accent, glow);
      circle(ctx, x, y - 4, 1.6, withAlpha('#fff0b8', 0.7));
    } else if (type === 5) {
      roundRect(ctx, x - 1.5, y - 5, 3, 7, 1.5, withAlpha('#e6d2a0', 0.72));
      circle(ctx, x, y - 6, 3.2, withAlpha(zone.accent, 0.8));
      circle(ctx, x - 0.8, y - 6.8, 1, withAlpha('#fff0b8', 0.8));
    }
  }
}

/**
 * Builds a smooth, non-circular closed outline. Perfect ellipses make a floating
 * island read as a flat disc; two low harmonics give it an organic silhouette
 * while staying cheap enough to redraw every frame.
 */
/**
 * Radial scale for the organic outline. The result is always >= 1, so the drawn
 * plate is never smaller than the collision ellipse in `WorldRuntime.isWalkable`
 * and the player can never walk off the visible edge. Symmetric wobble would let
 * the silhouette pinch inward past the walkable radius at the island's poles.
 */
export function outlineScale(seed: number, wobble: number, t: number): number {
  const random = new SeededRandom(seed);
  const phaseA = random.range(0, Math.PI * 2);
  const phaseB = random.range(0, Math.PI * 2);
  return 1
    + (0.5 + 0.5 * Math.sin(t * 3 + phaseA)) * wobble * 0.62
    + (0.5 + 0.5 * Math.sin(t * 5 + phaseB)) * wobble * 0.38;
}

function organicOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  wobble = 0.03,
  points = 64,
): void {
  ctx.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const t = (index / points) * Math.PI * 2;
    const n = outlineScale(seed, wobble, t);
    const px = cx + Math.cos(t) * rx * n;
    const py = cy + Math.sin(t) * ry * n;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Samples the same outline so lit/shadow strokes follow the real silhouette. */
function outlinePoint(cx: number, cy: number, rx: number, ry: number, seed: number, wobble: number, t: number): [number, number] {
  const n = outlineScale(seed, wobble, t);
  return [cx + Math.cos(t) * rx * n, cy + Math.sin(t) * ry * n];
}

/**
 * Floating island mass: drop shadow, exposed rock rim, top plate with internal
 * value variation, then a moon-side rim light so the landform has an edge.
 */
function drawIslandTerrain(ctx: CanvasRenderingContext2D, zone: ZoneDefinition): void {
  const cx = zone.width / 2;
  const cy = zone.height / 2;
  const rx = zone.width * 0.475;
  const ry = zone.height * 0.475;
  const seed = hashString(`island:${zone.id}`);
  const wobble = 0.05;
  const random = new SeededRandom(seed);

  // Soft cast shadow on the void below.
  ctx.save();
  organicOutline(ctx, cx + 6, cy + 58, rx * 1.04, ry * 1.02, seed, wobble);
  ctx.fillStyle = 'rgba(5, 13, 24, 0.5)';
  ctx.fill();
  ctx.restore();

  // Exposed rock underside peeking out below the grass line.
  ctx.save();
  organicOutline(ctx, cx, cy + 30, rx * 0.99, ry * 0.985, seed, wobble);
  ctx.fillStyle = linear(ctx, cx, cy - ry * 0.2, cx, cy + ry, '#2b4351', '#101f31');
  ctx.fill();
  // Vertical striations read as strata in the cliff.
  for (let index = 0; index < 26; index += 1) {
    const t = Math.PI + (index / 25) * Math.PI;
    const [px, py] = outlinePoint(cx, cy + 30, rx * 0.99, ry * 0.985, seed, wobble, t);
    const length = 14 + (index % 4) * 9;
    ctx.strokeStyle = withAlpha(index % 2 ? '#486778' : '#0c1826', 0.34);
    ctx.lineWidth = 2 + (index % 3);
    ctx.beginPath();
    ctx.moveTo(px * 0.995 + cx * 0.005, py * 0.99);
    ctx.lineTo(px * 0.95 + cx * 0.05, py * 0.99 + length);
    ctx.stroke();
  }
  ctx.restore();

  // Top plate with internal value patches clipped to the silhouette.
  ctx.save();
  organicOutline(ctx, cx, cy, rx, ry, seed, wobble);
  ctx.fillStyle = linear(ctx, cx - rx, cy - ry, cx + rx, cy + ry, zone.groundAlt, zone.ground);
  ctx.fill();
  ctx.clip();

  // Broad tonal drifts keep the plate from reading as one flat wash. They are
  // deliberately large and low-frequency: small speckles do not read as
  // terrain at this camera distance, only as noise.
  for (let index = 0; index < 11; index += 1) {
    const px = cx + random.range(-rx * 0.85, rx * 0.85);
    const py = cy + random.range(-ry * 0.85, ry * 0.85);
    const pr = random.range(rx * 0.28, rx * 0.62);
    const warm = index % 3 === 0;
    ellipse(ctx, px, py, pr, pr * 0.72, withAlpha(warm ? zone.haze : zone.ground, warm ? 0.13 : 0.3));
  }
  // A worn dirt apron along the walking line, so the path is not the only
  // sign of use on the island.
  ctx.save();
  ctx.strokeStyle = withAlpha('#b6a077', 0.16);
  ctx.lineWidth = 62;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.12, cy + ry * 0.86);
  ctx.bezierCurveTo(cx - rx * 0.3, cy + ry * 0.3, cx + rx * 0.26, cy - ry * 0.1, cx + rx * 0.1, cy - ry * 0.82);
  ctx.stroke();
  ctx.restore();

  // Moonlight falls from the upper left, so lift that side and cool the rest.
  const light = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.6, cy + ry);
  light.addColorStop(0, withAlpha(zone.haze, 0.26));
  light.addColorStop(0.42, withAlpha(zone.haze, 0.04));
  light.addColorStop(1, 'rgba(8, 20, 34, 0.3)');
  ctx.fillStyle = light;
  ctx.fillRect(cx - rx * 1.1, cy - ry * 1.1, rx * 2.2, ry * 2.2);
  ctx.restore();

  // Rim light along the moon-facing arc, then a dark contour everywhere else.
  ctx.save();
  ctx.lineCap = 'round';
  for (let index = 0; index <= 30; index += 1) {
    const t = Math.PI * 0.86 + (index / 30) * Math.PI * 1.28;
    const [ax, ay] = outlinePoint(cx, cy, rx, ry, seed, wobble, t);
    const [bx, by] = outlinePoint(cx, cy, rx, ry, seed, wobble, t + 0.05);
    const strength = 1 - Math.abs(t - Math.PI * 1.5) / (Math.PI * 0.72);
    ctx.strokeStyle = withAlpha('#f6efcf', 0.1 + Math.max(0, strength) * 0.52);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(9, 19, 32, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  organicOutline(ctx, cx, cy, rx, ry, seed, wobble);
  ctx.stroke();
  ctx.restore();
}

function drawIslandFringe(ctx: CanvasRenderingContext2D, zone: ZoneDefinition, time: number): void {
  const random = new SeededRandom(hashString(`fringe:${zone.id}`));
  for (let index = 0; index < 24; index += 1) {
    const x = zone.width * 0.1 + random.range(0, zone.width * 0.8);
    const y = zone.height * 0.5 + Math.sqrt(Math.max(0, 1 - Math.pow((x - zone.width / 2) / (zone.width * 0.45), 2))) * zone.height * 0.44;
    const sway = Math.sin(time * 0.7 + index) * 2;
    ctx.strokeStyle = withAlpha('#294c4e', 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.quadraticCurveTo(x + sway, y + 17, x - 1, y + 25);
    ctx.stroke();
    ellipse(ctx, x - 2 + sway * 0.4, y + 16, 4, 2, withAlpha('#5b8b6e', 0.75));
  }
}

function drawHangingLantern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, time: number, phase: number): void {
  const sway = Math.sin(time * 1.2 + phase) * 0.06;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  softLight(ctx, 0, 17 * size, 42 * size, 34 * size, color, 0.2);
  ctx.strokeStyle = '#4a4a43';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 10 * size);
  ctx.stroke();
  roundRect(ctx, -10 * size, 9 * size, 20 * size, 25 * size, 5 * size, linear(ctx, -10 * size, 9 * size, 10 * size, 34 * size, '#fff0b8', color), '#0f1c2e', 2.5);
  pathFill(ctx, [[-12 * size, 10 * size], [12 * size, 10 * size], [8 * size, 4 * size], [-8 * size, 4 * size]], '#e6b262', '#0f1c2e', 2);
  circle(ctx, 0, 21 * size, 3.2 * size, '#fff8d2');
  star(ctx, 0, 21 * size, 6 * size, withAlpha('#fff0b8', 0.5), 4, time * 0.2 + phase);
  ctx.restore();
}

function drawZoneProps(ctx: CanvasRenderingContext2D, zone: ZoneDefinition, time: number): void {
  if (zone.id === 'harbor') {
    ctx.strokeStyle = withAlpha('#3d4a45', 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, 190);
    ctx.quadraticCurveTo(450, 260, 830, 165);
    ctx.stroke();
    for (let index = 0; index < 8; index += 1) {
      const t = index / 7;
      const x = 70 + t * 760;
      const y = 190 + Math.sin(t * Math.PI) * 44 - t * 25;
      drawHangingLantern(ctx, x, y, 0.72, index % 2 ? '#f2c86e' : '#e88470', time, index);
    }
    // Notice board and stacked supplies near the forge.
    roundRect(ctx, 300, 292, 78, 58, 5, linear(ctx, 300, 292, 378, 350, '#9a774f', '#5e4b3c'), '#0f1c2e', 3);
    roundRect(ctx, 312, 304, 54, 32, 3, '#e7d5a4', '#0f1c2e', 2);
    ctx.strokeStyle = withAlpha('#7c5e47', 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(322, 314);
    ctx.lineTo(354, 314);
    ctx.moveTo(322, 322);
    ctx.lineTo(348, 322);
    ctx.stroke();
    for (let index = 0; index < 3; index += 1) {
      const x = 620 + (index % 2) * 34;
      const y = 318 + Math.floor(index / 2) * 32;
      roundRect(ctx, x, y, 28, 26, 4, linear(ctx, x, y, x + 28, y + 26, '#c39a63', '#6d5342'), '#0f1c2e', 2.5);
      ctx.strokeStyle = withAlpha('#f0d29a', 0.5);
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 6);
      ctx.lineTo(x + 24, y + 20);
      ctx.stroke();
    }
  } else if (zone.id === 'cloudstep') {
    for (const [x, y, flip] of [[180, 320, 1], [730, 610, -1]] as Array<[number, number, number]>) {
      ctx.strokeStyle = '#6b5b47';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 70);
      ctx.stroke();
      pathFill(ctx, [[x, y + 4], [x + 58 * flip, y + 16], [x, y + 28]], '#d5a55e', '#0f1c2e', 3);
      ctx.strokeStyle = withAlpha('#fff0b8', 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 5 * flip, y + 12);
      ctx.lineTo(x + 48 * flip, y + 16);
      ctx.stroke();
    }
    for (let index = 0; index < 7; index += 1) {
      const x = 260 + index * 52;
      const y = 620 + Math.sin(index) * 14;
      circle(ctx, x, y, 3, index % 2 ? '#f4c95d' : '#e98a7e');
      circle(ctx, x, y, 1, '#fff0b8');
    }
  } else if (zone.id === 'paperwood') {
    for (let index = 0; index < 5; index += 1) {
      const x = 120 + index * 190;
      const y = 300 + Math.sin(index * 1.4) * 26;
      ctx.strokeStyle = '#4c5a4c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 74);
      ctx.stroke();
      pathFill(ctx, [[x, y + 6], [x + 28, y + 16], [x + 22, y + 48], [x - 4, y + 38]], index % 2 ? '#e88470' : '#7ccabc', '#0f1c2e', 2.5);
    }
  } else if (zone.id === 'rainbud') {
    for (let index = 0; index < 8; index += 1) {
      const x = 130 + (index % 4) * 220;
      const y = 480 + Math.floor(index / 4) * 250;
      softLight(ctx, x, y, 34, 22, '#8fe6cf', 0.16);
      roundRect(ctx, x - 4, y, 8, 18, 4, '#5c9c7d', '#0f1c2e', 2);
      ellipse(ctx, x, y - 3, 14, 9, index % 2 ? '#b6f0d6' : '#8fe6cf', '#0f1c2e', 2);
      circle(ctx, x - 4, y - 6, 2, '#fff0b8');
    }
  } else if (zone.id === 'starfall') {
    for (let index = 0; index < 4; index += 1) {
      const x = 150 + index * 250;
      const y = 300 + (index % 2) * 170;
      roundRect(ctx, x - 9, y, 18, 78, 5, linear(ctx, x - 9, y, x + 9, y + 78, '#65748f', '#2b3c5a'), '#0f1c2e', 3);
      star(ctx, x, y - 8, 10 + Math.sin(time * 1.3 + index) * 2, index % 2 ? '#d3aeea' : '#f4c95d', 4, time * 0.2 + index);
      softLight(ctx, x, y - 8, 30, 24, index % 2 ? '#d3aeea' : '#f4c95d', 0.16);
    }
  }
}

function drawSky(ctx: CanvasRenderingContext2D, zone: ZoneDefinition, time: number, reducedMotion: boolean): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  gradient.addColorStop(0, zone.background);
  gradient.addColorStop(0.38, withAlpha(zone.haze, 0.34));
  gradient.addColorStop(0.72, withAlpha(zone.accent, 0.12));
  gradient.addColorStop(1, zone.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  // A soft moon and halo keep the sky from reading as a flat fill.
  const moonX = 372;
  const moonY = 132;
  const halo = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 110);
  halo.addColorStop(0, withAlpha('#fff3ca', 0.34));
  halo.addColorStop(0.24, withAlpha(zone.accent, 0.12));
  halo.addColorStop(1, withAlpha(zone.accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - 120, moonY - 120, 240, 240);
  circle(ctx, moonX, moonY, 27, linear(ctx, moonX - 24, moonY - 24, moonX + 24, moonY + 24, '#fff6d7', '#d7c39c'), withAlpha('#fff6d7', 0.6), 2);
  circle(ctx, moonX - 8, moonY - 6, 5, withAlpha('#c6b892', 0.22));
  circle(ctx, moonX + 9, moonY + 8, 3, withAlpha('#c6b892', 0.2));

  const random = new SeededRandom(hashString(`sky:${zone.id}`));
  for (let index = 0; index < 48; index += 1) {
    const x = random.range(0, BASE_WIDTH);
    const y = random.range(0, BASE_HEIGHT);
    const drift = reducedMotion ? 0 : Math.sin(time * 0.08 + index) * 8;
    const size = random.range(0.8, 2.8);
    const isStar = index % 6 === 0;
    circle(ctx, x + drift, y, isStar ? size * 1.7 : size, withAlpha(isStar ? zone.accent : '#fff2c7', random.range(0.2, 0.72)));
    if (isStar) star(ctx, x + drift, y, size * 1.5, withAlpha(zone.accent, 0.32), 4, time * 0.15 + index);
  }

  for (let layer = 0; layer < 3; layer += 1) {
    const y = 100 + layer * 290 + (reducedMotion ? 0 : Math.sin(time * 0.06 + layer) * 9);
    const cloudColor = layer === 0 ? '#f0e5d2' : layer === 1 ? '#c8d6d1' : '#9ab8bd';
    for (let index = 0; index < 4; index += 1) {
      const x = 30 + index * 145 + (reducedMotion ? 0 : Math.sin(time * 0.04 + index * 1.7) * 16);
      const alpha = 0.045 + layer * 0.025;
      softLight(ctx, x + 54, y, 120, 40, cloudColor, alpha);
      ellipse(ctx, x, y, 92, 22, withAlpha(cloudColor, alpha));
      ellipse(ctx, x + 45, y - 9, 68, 28, withAlpha(cloudColor, alpha * 0.86));
    }
  }

  if (zone.ambience === 'rain') {
    ctx.strokeStyle = 'rgba(196, 242, 235, 0.3)';
    ctx.lineWidth = 1.3;
    const offset = reducedMotion ? 0 : (time * 95) % 44;
    for (let x = -20; x < BASE_WIDTH + 30; x += 27) {
      for (let y = -60; y < BASE_HEIGHT + 60; y += 44) {
        const yy = (y + offset) % (BASE_HEIGHT + 80);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x - 5, yy + 13);
        ctx.stroke();
      }
    }
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, strength = 0.34): void {
  const gradient = ctx.createRadialGradient(BASE_WIDTH / 2, BASE_HEIGHT / 2, 180, BASE_WIDTH / 2, BASE_HEIGHT / 2, 570);
  gradient.addColorStop(0, 'rgba(10, 18, 31, 0)');
  gradient.addColorStop(1, `rgba(10, 18, 31, ${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
}

export function drawWorldScene(
  ctx: CanvasRenderingContext2D,
  world: WorldRuntime,
  save: SaveData,
  options: WorldVisualOptions,
): void {
  const zone = world.currentZone;
  drawSky(ctx, zone, options.time, options.reducedMotion);
  ctx.save();
  ctx.translate(-options.camera.x, -options.camera.y);

  drawIslandTerrain(ctx, zone);
  drawGroundTexture(ctx, zone);
  drawGrass(ctx, zone, options.time);
  drawScatterDecor(ctx, zone, options.time);
  drawIslandFringe(ctx, zone, options.time);
  drawZoneProps(ctx, zone, options.time);

  // Soft pools of light around interactable locations add depth to the playfield.
  for (const interactable of zone.interactables) {
    const color = interactable.kind === 'boss' ? '#e88470' : interactable.kind === 'portal' || interactable.kind === 'exit' ? '#7ccabc' : '#f4c95d';
    softLight(ctx, interactable.x, interactable.y + 2, interactable.kind === 'npc' ? 72 : 58, interactable.kind === 'npc' ? 34 : 24, color, interactable.kind === 'boss' ? 0.18 : 0.1);
  }

  // Curving paper path.
  ctx.strokeStyle = linear(ctx, zone.width * 0.45, zone.height, zone.width * 0.5, 60, withAlpha('#c4b487', 0.08), withAlpha('#fff0c2', 0.3));
  ctx.lineWidth = 32;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(zone.width * 0.46, zone.height - 70);
  ctx.bezierCurveTo(zone.width * 0.27, zone.height * 0.72, zone.width * 0.7, zone.height * 0.5, zone.width * 0.52, zone.height * 0.25);
  ctx.bezierCurveTo(zone.width * 0.44, zone.height * 0.15, zone.width * 0.53, 120, zone.width * 0.5, 85);
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#fff0c2', 0.18);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Onboarding marker sits beneath characters so it never hides the objective itself.
  if (options.guide) drawGuideGroundRing(ctx, options.guide, options.time, options.reducedMotion);

  const drawables: Array<{ y: number; draw: () => void }> = [];
  for (const obstacle of zone.obstacles) {
    drawables.push({ y: obstacle.y + obstacle.h, draw: () => drawObstacle(ctx, obstacle, save, options.time) });
  }
  for (const interactable of zone.interactables) {
    drawables.push({
      y: interactable.y + 12,
      draw: () => {
        if (interactable.kind === 'npc') drawLuma(ctx, interactable.x, interactable.y, options.time);
        if (interactable.kind === 'gate' || interactable.kind === 'boss') drawGate(ctx, interactable, options.time);
        if (interactable.kind === 'portal' || interactable.kind === 'exit') drawPortal(ctx, interactable, options.time);
        if (interactable.kind === 'forge') {
          const active = options.nearbyId === interactable.id;
          drawWorldLabel(ctx, interactable.x, interactable.y - 90, interactable.label, active);
        }
        if (interactable.kind === 'build') {
          roundRect(ctx, interactable.x - 24, interactable.y - 42, 48, 48, 8, '#d8b66b', '#17243a', 3);
          pathFill(ctx, [[interactable.x - 27, interactable.y - 38], [interactable.x, interactable.y - 56], [interactable.x + 27, interactable.y - 38]], '#e98c6c', '#17243a', 3);
          star(ctx, interactable.x, interactable.y - 24, 8, '#fff0b8', 4, 0.2);
        }
        if (options.nearbyId === interactable.id && interactable.kind !== 'forge' && interactable.kind !== 'build') {
          drawWorldLabel(ctx, interactable.x, interactable.y - 95, interactable.label, true);
        }
      },
    });
  }
  drawables.push({
    y: world.y,
    draw: () => drawHero(ctx, {
      x: world.x,
      y: world.y,
      facing: world.facing,
      walkPhase: world.walkPhase,
      flame: 0,
      weaponType: 'branch',
      scale: 1.12,
      moving: Math.hypot(world.velocity.x, world.velocity.y) > 2,
    }),
  });
  drawables.sort((a, b) => a.y - b.y);
  for (const drawable of drawables) drawable.draw();

  // Foreground motes drift between the camera and the island.
  const moteRandom = new SeededRandom(hashString(`motes:${zone.id}`));
  for (let index = 0; index < 14; index += 1) {
    const x = moteRandom.range(20, zone.width - 20);
    const y = moteRandom.range(40, zone.height - 40) + Math.sin(options.time * 0.7 + index) * 5;
    const alpha = 0.12 + (Math.sin(options.time * 1.4 + index) + 1) * 0.08;
    circle(ctx, x, y, index % 3 === 0 ? 2.2 : 1.3, withAlpha(zone.accent, alpha));
  }

  if (options.guide) drawGuideBeacon(ctx, options.guide, options.time, options.reducedMotion);

  ctx.restore();
  drawVignette(ctx, zone.safe ? 0.25 : 0.38);
}

/**
 * Compact orientation map for the world HUD. The zones are far larger than the
 * viewport, so without this a player has no spatial sense of where the objective
 * is relative to them, only a distance in pixels.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  world: WorldRuntime,
  options: { width: number; height: number; guideX: number | null; guideY: number | null; guideGate: boolean; inRange: boolean },
): void {
  const zone = world.currentZone;
  const { width, height } = options;
  const pad = 7;
  const scale = Math.min((width - pad * 2) / zone.width, (height - pad * 2) / zone.height);
  const offsetX = (width - zone.width * scale) / 2;
  const offsetY = (height - zone.height * scale) / 2;
  const toMap = (x: number, y: number): [number, number] => [offsetX + x * scale, offsetY + y * scale];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(11, 20, 34, 0.86)';
  ctx.fillRect(0, 0, width, height);

  // Island plate, using the same silhouette family as the world render.
  const cx = offsetX + zone.width * scale * 0.5;
  const cy = offsetY + zone.height * scale * 0.5;
  organicOutline(ctx, cx, cy, zone.width * 0.475 * scale, zone.height * 0.475 * scale, hashString(`island:${zone.id}`), 0.05, 40);
  ctx.fillStyle = withAlpha(zone.ground, 0.5);
  ctx.fill();
  ctx.strokeStyle = withAlpha(zone.haze, 0.32);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  organicOutline(ctx, cx, cy, zone.width * 0.475 * scale, zone.height * 0.475 * scale, hashString(`island:${zone.id}`), 0.05, 40);
  ctx.clip();

  // Encounter grass reads as a hazard zone rather than decoration.
  for (const patch of zone.grass) {
    const [gx, gy] = toMap(patch.x + patch.w / 2, patch.y + patch.h / 2);
    ellipse(ctx, gx, gy, patch.w * 0.5 * scale, patch.h * 0.5 * scale, withAlpha('#f4c95d', 0.22));
  }
  // Buildings give the map landmarks to navigate by.
  for (const obstacle of zone.obstacles) {
    if (obstacle.kind !== 'house' && obstacle.kind !== 'forge') continue;
    const built = obstacle.kind === 'house'
      ? (world.save.world.buildings.cottage ?? 0) > 0
      : (world.save.world.buildings.forge ?? 0) > 0;
    if (!built) continue;
    const [bx, by] = toMap(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
    roundRect(ctx, bx - 2.5, by - 2.5, 5, 5, 1, withAlpha('#f4c95d', 0.8));
  }
  ctx.restore();

  // Interactables: gates and portals get a distinct ring so travel points read.
  for (const interactable of zone.interactables) {
    const [ix, iy] = toMap(interactable.x, interactable.y);
    const isTravel = interactable.kind === 'portal' || interactable.kind === 'exit' || interactable.kind === 'gate';
    circle(ctx, ix, iy, isTravel ? 2.6 : 2, withAlpha(isTravel ? '#7ccabc' : '#e88470', 0.9));
  }

  // Objective marker.
  if (options.guideX !== null && options.guideY !== null) {
    const [gx, gy] = toMap(options.guideX, options.guideY);
    const color = options.guideGate ? '#7ccabc' : options.inRange ? '#fff0b8' : '#f4c95d';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(gx, gy, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    star(ctx, gx, gy, 3, color, 4, 0.4);
  }

  // Player last so it always reads on top.
  const [px, py] = toMap(world.x, world.y);
  circle(ctx, px, py, 3.4, '#fff6dc', '#17243a', 1.4);
  circle(ctx, px, py, 1.2, '#e88470');

  ctx.strokeStyle = withAlpha(zone.haze, 0.22);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

/** Pulsing ring on the ground that marks the current objective. */
function drawGuideGroundRing(ctx: CanvasRenderingContext2D, guide: GuideVisual, time: number, reducedMotion: boolean): void {
  const color = guide.kind === 'gate' ? '#7ccabc' : guide.inRange ? '#fff0b8' : '#f4c95d';
  const pulse = reducedMotion ? 0.5 : (Math.sin(time * 2.6) + 1) / 2;
  const base = guide.kind === 'gate' ? 40 : 52;

  ctx.save();
  ctx.setLineDash([13, 11]);
  ctx.lineDashOffset = reducedMotion ? 0 : -time * 26;
  ellipse(ctx, guide.x, guide.y + 6, base + pulse * 8, (base + pulse * 8) * 0.42, withAlpha(color, 0.06), withAlpha(color, guide.inRange ? 0.85 : 0.55), 3);
  ctx.setLineDash([]);
  ellipse(ctx, guide.x, guide.y + 6, base * 0.6, base * 0.6 * 0.42, withAlpha(color, 0.08), withAlpha(color, 0.3), 2);
  ctx.restore();
}

/** Floating chevron + label that hovers over the objective. */
function drawGuideBeacon(ctx: CanvasRenderingContext2D, guide: GuideVisual, time: number, reducedMotion: boolean): void {
  const color = guide.kind === 'gate' ? '#7ccabc' : guide.inRange ? '#fff0b8' : '#f4c95d';
  const bob = reducedMotion ? 0 : Math.sin(time * 3) * 6;
  const topY = guide.y - 104 + bob;

  ctx.save();
  softLight(ctx, guide.x, guide.y - 40, 44, 60, color, 0.16);

  // Hanging thread from the marker down to the ground ring.
  ctx.strokeStyle = withAlpha(color, 0.32);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(guide.x, topY + 14);
  ctx.lineTo(guide.x, guide.y - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // Chevron stack pointing down at the objective.
  for (let index = 0; index < 3; index += 1) {
    const offset = index * 11 + (reducedMotion ? 0 : (Math.sin(time * 3 - index * 0.6) + 1) * 4);
    ctx.strokeStyle = withAlpha(color, 0.9 - index * 0.24);
    ctx.lineWidth = 4 - index * 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(guide.x - 12, topY + 6 + offset);
    ctx.lineTo(guide.x, topY + 16 + offset);
    ctx.lineTo(guide.x + 12, topY + 6 + offset);
    ctx.stroke();
  }

  circle(ctx, guide.x, topY - 2, 5, withAlpha(color, 0.95));
  star(ctx, guide.x, topY - 2, 11, withAlpha(color, 0.4), 4, reducedMotion ? 0 : time * 1.2);
  drawWorldLabel(ctx, guide.x, topY - 22, guide.label, guide.inRange);
  ctx.restore();
}

export function drawTitleScene(ctx: CanvasRenderingContext2D, time: number, reducedMotion: boolean): void {
  const zone = ZONES.harbor;
  drawSky(ctx, zone, time, reducedMotion);

  // Distant sibling islands add parallax depth behind the stage.
  const far = new SeededRandom(31337);
  for (let index = 0; index < 4; index += 1) {
    const x = 40 + index * 132 + (reducedMotion ? 0 : Math.sin(time * 0.05 + index) * 7);
    const y = 214 + (index % 2) * 46;
    const rx = far.range(26, 46);
    ellipse(ctx, x, y + 12, rx, rx * 0.62, 'rgba(7, 18, 32, 0.42)');
    ellipse(ctx, x, y, rx * 0.92, rx * 0.5, withAlpha('#4a6a72', 0.5));
    ellipse(ctx, x, y - rx * 0.16, rx * 0.5, rx * 0.22, withAlpha(zone.groundAlt, 0.42));
    if (index % 2 === 0) {
      softLight(ctx, x, y - 6, 22, 14, '#f4c95d', 0.16);
      drawHangingLantern(ctx, x, y - 22, 0.3, '#f2c86e', time, index);
    }
  }

  ctx.save();
  const camera = { x: 210, y: 80 };
  ctx.translate(-camera.x, -camera.y);
  // The stage is a bespoke crop, so the shared terrain helper is pointed at the
  // same centre/radii the old flat disc used.
  drawTitleIsland(ctx, zone);
  drawGroundTexture(ctx, zone);
  for (const obstacle of zone.obstacles) drawObstacle(ctx, obstacle, { world: { buildings: { cottage: 1, forge: 1 } } } as SaveData, time);
  drawLuma(ctx, 310, 455, time);
  drawHero(ctx, { x: 430, y: 500, facing: -0.5, walkPhase: time * 0.6, flame: 72, weaponType: 'branch', scale: 1.2, moving: false });

  // Paper lantern garland strung across the harbour.
  ctx.strokeStyle = withAlpha('#6b6455', 0.75);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(60, 196);
  ctx.quadraticCurveTo(450, 268, 852, 172);
  ctx.stroke();
  for (let index = 0; index < 7; index += 1) {
    const x = 90 + index * 115;
    const t = (x - 60) / 792;
    const y = 196 + Math.sin(t * Math.PI) * 50 - t * 24;
    drawHangingLantern(ctx, x, y, 0.72, index % 2 ? '#f2c86e' : '#e88470', time, index);
  }
  ctx.restore();
  drawVignette(ctx, 0.42);
}

/** Title-screen island: same layered language as the playable zones. */
function drawTitleIsland(ctx: CanvasRenderingContext2D, zone: ZoneDefinition): void {
  const cx = 450;
  const cy = 555;
  const rx = 405;
  const ry = 405;
  const seed = hashString('island:title');
  const wobble = 0.05;
  const random = new SeededRandom(seed);

  organicOutline(ctx, cx + 4, cy + 46, rx * 1.03, ry * 1.02, seed, wobble);
  ctx.fillStyle = 'rgba(5, 13, 24, 0.5)';
  ctx.fill();

  organicOutline(ctx, cx, cy + 24, rx * 0.99, ry * 0.985, seed, wobble);
  ctx.fillStyle = linear(ctx, cx, cy - ry * 0.2, cx, cy + ry, '#2b4351', '#101f31');
  ctx.fill();
  for (let index = 0; index < 24; index += 1) {
    const t = Math.PI + (index / 23) * Math.PI;
    const [px, py] = outlinePoint(cx, cy + 24, rx * 0.99, ry * 0.985, seed, wobble, t);
    ctx.strokeStyle = withAlpha(index % 2 ? '#486778' : '#0c1826', 0.32);
    ctx.lineWidth = 2 + (index % 3);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px * 0.96 + cx * 0.04, py + 13 + (index % 4) * 8);
    ctx.stroke();
  }

  ctx.save();
  organicOutline(ctx, cx, cy, rx, ry, seed, wobble);
  ctx.fillStyle = linear(ctx, cx - rx, cy - ry, cx + rx, cy + ry, zone.groundAlt, zone.ground);
  ctx.fill();
  ctx.clip();
  for (let index = 0; index < 6; index += 1) {
    const px = cx + random.range(-rx * 0.8, rx * 0.8);
    const py = cy + random.range(-ry * 0.8, ry * 0.8);
    const pr = random.range(rx * 0.26, rx * 0.5);
    ellipse(ctx, px, py, pr, pr * 0.78, withAlpha(index % 2 ? zone.groundAlt : zone.ground, 0.24));
  }
  const light = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.6, cy + ry);
  light.addColorStop(0, withAlpha(zone.haze, 0.2));
  light.addColorStop(0.46, withAlpha(zone.haze, 0.05));
  light.addColorStop(1, 'rgba(8, 20, 34, 0.24)');
  ctx.fillStyle = light;
  ctx.fillRect(cx - rx * 1.1, cy - ry * 1.1, rx * 2.2, ry * 2.2);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  for (let index = 0; index <= 30; index += 1) {
    const t = Math.PI * 0.86 + (index / 30) * Math.PI * 1.28;
    const [ax, ay] = outlinePoint(cx, cy, rx, ry, seed, wobble, t);
    const [bx, by] = outlinePoint(cx, cy, rx, ry, seed, wobble, t + 0.05);
    const strength = 1 - Math.abs(t - Math.PI * 1.5) / (Math.PI * 0.72);
    ctx.strokeStyle = withAlpha('#f6efcf', 0.1 + Math.max(0, strength) * 0.5);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(9, 19, 32, 0.46)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  organicOutline(ctx, cx, cy, rx, ry, seed, wobble);
  ctx.stroke();
  ctx.restore();
}

function drawMonsterBody(ctx: CanvasRenderingContext2D, entity: BattleEntity, time: number): void {
  const definitionSize = entity.radius;
  const bob = Math.sin(time * 2.5 + entity.x * 0.03) * 3;
  drawShadow(ctx, entity.x, entity.y + entity.radius * 0.42, entity.radius * 1.05, 0.3);
  ctx.save();
  ctx.translate(entity.x, entity.y + bob);
  if (entity.hitFlash > 0) ctx.globalAlpha = 0.68 + Math.sin(time * 50) * 0.22;
  const id = entity.definitionId;
  const s = entity.radius;
  if (id === 'cloudPuff') {
    for (let index = 0; index < 7; index += 1) {
      const angle = index * Math.PI * 2 / 7;
      circle(ctx, Math.cos(angle) * s * 0.5, Math.sin(angle) * s * 0.35 - s * 0.15, s * 0.48, index % 2 ? '#f3e7cf' : '#fff3d9');
    }
    circle(ctx, 0, -s * 0.12, s * 0.66, '#f3e7cf');
    drawFace(ctx, 0, -s * 0.16, s * 0.22);
    pathFill(ctx, [[-s * 0.48, -s * 0.45], [-s * 0.25, -s * 0.78], [-s * 0.08, -s * 0.45]], '#f2b96e', '#17243a', 2);
    pathFill(ctx, [[s * 0.48, -s * 0.45], [s * 0.25, -s * 0.78], [s * 0.08, -s * 0.45]], '#f2b96e', '#17243a', 2);
  } else if (id === 'rainSprout') {
    roundRect(ctx, -s * 0.28, -s * 0.05, s * 0.56, s * 0.78, s * 0.2, '#5c9c7d', '#17243a', 3);
    circle(ctx, 0, -s * 0.35, s * 0.55, '#83cdbd', '#17243a');
    drawFace(ctx, 0, -s * 0.38, s * 0.2, 'angry');
    pathFill(ctx, [[-s * 0.45, -s * 0.5], [-s * 0.6, -s * 0.95], [-s * 0.1, -s * 0.65]], '#d8efbe', '#17243a', 2);
    pathFill(ctx, [[s * 0.45, -s * 0.5], [s * 0.6, -s * 0.95], [s * 0.1, -s * 0.65]], '#d8efbe', '#17243a', 2);
    pathFill(ctx, [[0, -s * 0.78], [s * 0.16, -s * 0.58], [0, -s * 0.48], [-s * 0.16, -s * 0.58]], '#d8f5ef', '#17243a', 1.5);
  } else if (id === 'paperKite') {
    const flutter = Math.sin(time * 4 + entity.x) * 4;
    pathFill(ctx, [[0, -s * 1.25], [s * 0.82, flutter], [0, s], [-s * 0.82, flutter]], '#d9787b', '#17243a', 3);
    pathFill(ctx, [[0, -s * 1.1], [0, s * 0.82], [-s * 0.58, flutter]], '#f1a17e');
    drawFace(ctx, 0, -s * 0.08, s * 0.2, 'angry');
    ctx.strokeStyle = '#f0dfb0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.quadraticCurveTo(s * 0.3, s * 1.5, -s * 0.15, s * 1.8);
    ctx.stroke();
  } else if (id === 'mistCrab') {
    ellipse(ctx, 0, -s * 0.18, s * 0.9, s * 0.66, '#7f95a2', '#17243a');
    for (let index = -2; index <= 2; index += 1) {
      roundRect(ctx, index * s * 0.28 - 5, -s * 0.45 - (index % 2) * 5, 10, 14, 4, '#b6c2bd', '#17243a', 2);
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        ctx.strokeStyle = '#43545d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(side * s * 0.55, s * 0.15 + index * 6);
        ctx.lineTo(side * s * 1.1, s * 0.02 + index * 9);
        ctx.stroke();
      }
    }
    drawFace(ctx, 0, -s * 0.04, s * 0.24, 'angry');
  } else if (id === 'inkBat') {
    const flap = Math.sin(time * 8 + entity.x) * s * 0.36;
    pathFill(ctx, [[-s * 0.2, -s * 0.15], [-s * 1.15, -s * 0.6 - flap], [-s * 1.0, s * 0.45], [-s * 0.25, s * 0.25]], '#5d537a', '#17243a', 3);
    pathFill(ctx, [[s * 0.2, -s * 0.15], [s * 1.15, -s * 0.6 - flap], [s * 1.0, s * 0.45], [s * 0.25, s * 0.25]], '#5d537a', '#17243a', 3);
    circle(ctx, 0, -s * 0.1, s * 0.55, '#78699a', '#17243a');
    pathFill(ctx, [[-s * 0.38, -s * 0.45], [-s * 0.28, -s * 0.85], [0, -s * 0.55]], '#78699a', '#17243a', 2);
    pathFill(ctx, [[s * 0.38, -s * 0.45], [s * 0.28, -s * 0.85], [0, -s * 0.55]], '#78699a', '#17243a', 2);
    drawFace(ctx, 0, -s * 0.1, s * 0.2, 'angry');
  } else if (id === 'starSentinel') {
    ctx.rotate(Math.sin(time) * 0.08);
    pathFill(ctx, [[0, -s], [s * 0.8, -s * 0.35], [s * 0.58, s * 0.78], [0, s * 1.1], [-s * 0.58, s * 0.78], [-s * 0.8, -s * 0.35]], '#6d7899', '#17243a', 3);
    circle(ctx, 0, 0, s * 0.55, '#d7d7c6', '#17243a');
    star(ctx, 0, 0, s * 0.35, '#e8a4cf', 5, time * 0.2);
    drawFace(ctx, 0, 0, s * 0.25, 'angry');
  } else if (id === 'lanternMoth') {
    const wing = Math.sin(time * 3) * 8;
    pathFill(ctx, [[-s * 0.2, -s * 0.4], [-s * 1.1, -s * 0.85 - wing], [-s * 0.92, s * 0.58], [-s * 0.15, s * 0.45]], '#5f5b72', '#17243a', 4);
    pathFill(ctx, [[s * 0.2, -s * 0.4], [s * 1.1, -s * 0.85 - wing], [s * 0.92, s * 0.58], [s * 0.15, s * 0.45]], '#5f5b72', '#17243a', 4);
    roundRect(ctx, -s * 0.48, -s * 0.45, s * 0.96, s * 1.4, s * 0.48, '#747080', '#17243a', 4);
    circle(ctx, 0, -s * 0.55, s * 0.38, '#efac68', '#17243a');
    for (let index = -1; index <= 1; index += 1) roundRect(ctx, index * 20 - 6, -s * 0.2, 12, s * 0.8, 5, '#3a3948', '#17243a', 2);
    drawFace(ctx, 0, -s * 0.58, s * 0.15, 'angry');
  } else if (id === 'bellWarden') {
    circle(ctx, 0, -s * 0.2, s * 0.7, '#579a99', '#17243a');
    pathFill(ctx, [[-s * 0.55, -s * 0.62], [0, -s * 1.2], [s * 0.55, -s * 0.62]], '#d8ead6', '#17243a', 3);
    roundRect(ctx, -s * 0.52, -s * 0.12, s * 1.04, s * 0.8, s * 0.25, '#8fc0a5', '#17243a', 3);
    ctx.strokeStyle = '#264a55';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.15);
    ctx.quadraticCurveTo(0, s * 0.48, s * 0.5, -s * 0.15);
    ctx.stroke();
    drawFace(ctx, 0, -s * 0.28, s * 0.22, 'angry');
    for (const side of [-1, 1]) circle(ctx, side * s * 0.95, -s * 0.1 + Math.sin(time * 2) * 5, s * 0.15, '#d5f0e9', '#17243a');
  } else if (id === 'starlessOwl') {
    const wing = Math.sin(time * 3.2) * s * 0.3;
    pathFill(ctx, [[-s * 0.25, -s * 0.3], [-s * 1.25, -s * 0.55 - wing], [-s * 0.95, s * 0.85], [-s * 0.1, s * 0.4]], '#29344f', '#111b2d', 4);
    pathFill(ctx, [[s * 0.25, -s * 0.3], [s * 1.25, -s * 0.55 - wing], [s * 0.95, s * 0.85], [s * 0.1, s * 0.4]], '#29344f', '#111b2d', 4);
    ellipse(ctx, 0, -s * 0.15, s * 0.72, s * 0.95, '#33415e', '#111b2d');
    circle(ctx, 0, -s * 0.45, s * 0.55, '#425271');
    for (const side of [-1, 1]) {
      circle(ctx, side * s * 0.22, -s * 0.48, s * 0.23, '#e5d1a0');
      circle(ctx, side * s * 0.22, -s * 0.48, s * 0.1, '#171e31');
    }
    pathFill(ctx, [[-s * 0.12, -s * 0.28], [s * 0.12, -s * 0.28], [0, -s * 0.02]], '#e3a357');
    star(ctx, 0, s * 0.32, s * 0.18, '#d3aeea', 4, time * 0.2);
  } else {
    ellipse(ctx, 0, 0, s, s, '#687488', '#17243a');
    drawFace(ctx, 0, 0, s * 0.25, 'angry');
  }
  ctx.restore();
}

function drawMonsterDetails(ctx: CanvasRenderingContext2D, entity: BattleEntity, time: number): void {
  const x = entity.x;
  const y = entity.y;
  const s = entity.radius;
  const accent = ENEMIES[entity.definitionId]?.accent ?? '#fff0b8';
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (entity.definitionId === 'cloudPuff') {
    ctx.strokeStyle = withAlpha('#fff8e1', 0.62);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.58, y - s * 0.05);
    ctx.quadraticCurveTo(x + s * 0.98, y - s * 0.38, x + s * 0.78, y - s * 0.72);
    ctx.stroke();
    star(ctx, x - s * 0.9, y - s * 0.9 + Math.sin(time * 2 + entity.x) * 3, 3.5, withAlpha(accent, 0.72), 4, time * 0.4);
  } else if (entity.definitionId === 'rainSprout') {
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 1.4 + index * Math.PI * 2 / 3;
      circle(ctx, x + Math.cos(angle) * s * 0.9, y - s * 0.32 + Math.sin(angle) * s * 0.35, 2.6, withAlpha('#d9fff1', 0.75));
    }
    ctx.strokeStyle = withAlpha('#e7ffe2', 0.58);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4, y - s * 0.56);
    ctx.lineTo(x - s * 0.12, y - s * 0.86);
    ctx.stroke();
  } else if (entity.definitionId === 'paperKite') {
    ctx.strokeStyle = withAlpha('#fff0b8', 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.05);
    ctx.lineTo(x - s * 0.4, y + s * 0.12);
    ctx.moveTo(x, y - s * 1.05);
    ctx.lineTo(x + s * 0.4, y + s * 0.12);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(accent, 0.85);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.08, y + s * 0.82);
    ctx.quadraticCurveTo(x + s * 0.45, y + s * 1.45, x - s * 0.08, y + s * 1.85);
    ctx.stroke();
  } else if (entity.definitionId === 'mistCrab') {
    ctx.strokeStyle = withAlpha('#e0f3e7', 0.48);
    ctx.lineWidth = 1.4;
    for (let index = -1; index <= 1; index += 1) {
      ctx.beginPath();
      ctx.arc(x + index * s * 0.3, y - s * 0.16, s * 0.34, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    for (let index = 0; index < 3; index += 1) circle(ctx, x - s * 0.75 + index * s * 0.2, y - s * 0.7 - Math.sin(time * 2 + index) * 3, 2.2, withAlpha('#d9fff1', 0.6));
  } else if (entity.definitionId === 'inkBat') {
    ctx.strokeStyle = withAlpha('#c9b8f2', 0.42);
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.2, y - s * 0.15);
      ctx.lineTo(x + side * s * 0.92, y - s * 0.42 - Math.sin(time * 8) * s * 0.2);
      ctx.lineTo(x + side * s * 0.7, y + s * 0.32);
      ctx.stroke();
    }
  } else if (entity.definitionId === 'starSentinel') {
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.15, s * 0.35, time * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    star(ctx, x + Math.cos(time) * s * 1.15, y + Math.sin(time) * s * 0.35, 3, '#fff0b8', 4, time);
  } else if (entity.definitionId === 'lanternMoth') {
    ctx.strokeStyle = withAlpha('#f6c98d', 0.5);
    ctx.lineWidth = 1.5;
    for (let index = -1; index <= 1; index += 1) {
      ctx.beginPath();
      ctx.moveTo(x + index * s * 0.32, y - s * 0.5);
      ctx.lineTo(x + index * s * 0.32, y + s * 0.7);
      ctx.stroke();
    }
    star(ctx, x, y - s * 0.55, 8 + Math.sin(time * 3) * 2, withAlpha('#ffcf85', 0.55), 4, -time * 0.5);
  } else if (entity.definitionId === 'bellWarden') {
    ctx.strokeStyle = withAlpha('#d9fff1', 0.54);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.2, s * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 3; index += 1) circle(ctx, x + Math.cos(time * 1.5 + index * 2) * s * 1.15, y + Math.sin(time * 1.5 + index * 2) * s * 0.45, 2.4, withAlpha('#d9fff1', 0.65));
  } else if (entity.definitionId === 'starlessOwl') {
    ctx.strokeStyle = withAlpha('#d3aeea', 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.2, s * 1.18, 0, Math.PI * 2);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.42, y - s * 0.76);
      ctx.lineTo(x + side * s * 0.24, y - s * 0.48);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHealthBar(ctx: CanvasRenderingContext2D, entity: BattleEntity): void {
  if (entity.hp >= entity.maxHp) return;
  const width = Math.max(44, entity.radius * 1.85);
  const x = entity.x - width / 2;
  const y = entity.y - entity.radius - 28;
  roundRect(ctx, x - 2, y - 2, width + 4, 10, 5, 'rgba(7, 16, 28, 0.8)', '#f4c95d', 1.5);
  const ratio = Math.max(0, entity.hp / entity.maxHp);
  roundRect(ctx, x, y, width * ratio, 6, 3, linear(ctx, x, y, x + width, y, '#ffb38a', '#e56f6b'), '#fff0b8', 0.8);
  ctx.fillStyle = withAlpha('#fff0b8', 0.34);
  ctx.fillRect(x + 2, y + 1, Math.max(0, width * ratio - 4), 1.5);
}

function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, time: number): void {
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  if (projectile.kind === 'ring') {
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, projectile.radius, projectile.radius * 0.7, time * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (projectile.kind === 'paper') {
    ctx.rotate(time * 5);
    pathFill(ctx, [[0, -projectile.radius], [projectile.radius, 0], [0, projectile.radius], [-projectile.radius, 0]], projectile.color, '#17243a', 2);
  } else {
    circle(ctx, 0, 0, projectile.radius, withAlpha(projectile.color, 0.35));
    star(ctx, 0, 0, projectile.radius, projectile.color, 4, time * 5);
  }
  ctx.restore();
}

function drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard): void {
  const progress = Math.min(1, Math.max(0, (hazard.duration - hazard.delay) / Math.max(0.001, hazard.duration)));
  ctx.save();
  ctx.fillStyle = withAlpha(hazard.color, hazard.fired ? 0.28 : 0.13);
  ctx.strokeStyle = withAlpha(hazard.color, 0.9);
  ctx.lineWidth = hazard.fired ? 3 : 2;
  if (!hazard.fired) ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.ellipse(hazard.x, hazard.y, hazard.radius, hazard.radius * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  if (!hazard.fired && progress > 0) {
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.radius - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = '#fff0b8';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const particle of particles) {
    const alpha = Math.min(1, particle.life / particle.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.life * particle.spin);
    if (particle.kind === 'star') star(ctx, 0, 0, particle.size, particle.color, 4, 0);
    else if (particle.kind === 'ink') circle(ctx, 0, 0, particle.size, particle.color);
    else {
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.5);
    }
    ctx.restore();
  }
}

export function drawBattleScene(
  ctx: CanvasRenderingContext2D,
  hero: BattleEntity,
  enemies: BattleEntity[],
  projectiles: Projectile[],
  hazards: Hazard[],
  particles: Particle[],
  texts: FloatingText[],
  options: BattleVisualOptions,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  gradient.addColorStop(0, '#0d1a2d');
  gradient.addColorStop(0.42, options.intro > 0 ? '#101a2c' : '#263a4c');
  gradient.addColorStop(0.78, options.intro > 0 ? '#162239' : '#3e5560');
  gradient.addColorStop(1, '#101c30');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  softLight(ctx, 240, 300, 330, 380, options.flame > 50 ? '#f4c95d' : '#7ccabc', options.intro > 0 ? 0.05 : 0.12);

  const shakeX = options.reducedMotion ? 0 : Math.sin(options.time * 91) * options.shake;
  const shakeY = options.reducedMotion ? 0 : Math.cos(options.time * 73) * options.shake * 0.55;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const random = new SeededRandom(707);
  for (let index = 0; index < 62; index += 1) {
    const x = random.range(10, BASE_WIDTH - 10);
    const y = random.range(10, BASE_HEIGHT - 10);
    const size = random.range(0.7, 2.3);
    circle(ctx, x, y, size, withAlpha(index % 7 === 0 ? '#f4c95d' : '#fff0b8', 0.12 + (index % 4) * 0.05));
    if (index % 11 === 0) star(ctx, x, y, size * 1.8, withAlpha('#f4c95d', 0.25), 4, options.time * 0.1 + index);
  }

  // Layered arena with a warm inner light and a cool outer rim.
  ctx.save();
  ctx.translate(240, 430);
  softLight(ctx, 0, -8, 230, 210, options.flame > 50 ? '#f4c95d' : '#b8e6c0', options.intro > 0 ? 0.08 : 0.16);
  ellipse(ctx, 0, 46, 232, 216, 'rgba(3, 9, 19, 0.55)');

  const platform = (offsetX: number, offsetY: number, scale: number) => {
    ctx.beginPath();
    const points = 20;
    for (let index = 0; index < points; index += 1) {
      const angle = index / points * Math.PI * 2;
      const radiusX = (202 + Math.sin(index * 2.3) * 7) * scale;
      const radiusY = (198 + Math.cos(index * 1.8) * 7) * scale;
      const x = Math.cos(angle) * radiusX + offsetX;
      const y = Math.sin(angle) * radiusY + offsetY;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Platform body, then a lit top face so the disc reads as a raised stone.
  platform(0, 18, 1);
  ctx.fillStyle = linear(ctx, 0, -180, 0, 220, '#33485a', '#101d2c');
  ctx.fill();
  platform(0, 0, 1);
  ctx.fillStyle = options.intro > 0 ? '#222c40' : linear(ctx, -210, -230, 210, 210, '#93a08d', '#2c4356');
  ctx.fill();
  ctx.strokeStyle = '#0b1727';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#f4d79a', 0.7);
  ctx.lineWidth = 3;
  ctx.stroke();

  // Arena floor: worn stone with a lantern circle burned into it.
  ctx.save();
  ellipse(ctx, 0, 2, 178, 174, options.intro > 0 ? '#2a3448' : linear(ctx, -180, -190, 180, 180, '#a3ad8c', '#3f5a5c'));
  ctx.clip();
  const floorSeed = 4242;
  const floorRandom = new SeededRandom(floorSeed);
  for (let index = 0; index < 40; index += 1) {
    const px = floorRandom.range(-180, 180);
    const py = floorRandom.range(-176, 176);
    ellipse(ctx, px, py, floorRandom.range(16, 46), floorRandom.range(10, 30), withAlpha(index % 2 ? '#9db098' : '#3f5a5e', 0.14));
  }
  for (let index = 0; index < 14; index += 1) {
    const angle = floorRandom.range(0, Math.PI * 2);
    const radius = floorRandom.range(50, 150);
    ctx.strokeStyle = withAlpha('#2c4450', 0.28);
    ctx.lineWidth = floorRandom.range(1, 2.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.94);
    ctx.lineTo(Math.cos(angle) * radius + floorRandom.range(-30, 30), Math.sin(angle) * radius * 0.94 + floorRandom.range(-24, 24));
    ctx.stroke();
  }
  // Concentric lantern rings anchor the eye at centre stage.
  ctx.strokeStyle = withAlpha('#ffe0a0', options.intro > 0 ? 0.12 : 0.4);
  ctx.lineWidth = 2.4;
  for (const ring of [70, 118, 158]) {
    ctx.beginPath();
    ctx.ellipse(0, 2, ring, ring * 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Embers drifting off the lantern circle, so the stage feels lit from within.
  if (options.intro <= 0) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2 + options.time * 0.22;
      const radius = 92 + (index % 3) * 24;
      const lift = (options.time * 9 + index * 11) % 40;
      star(
        ctx,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.8 - lift * 0.4,
        2.4,
        withAlpha('#ffd98a', 0.42 * (1 - lift / 40)),
        4,
        angle,
      );
    }
  }
  // Moon-side falloff across the floor.
  const floorLight = ctx.createLinearGradient(-180, -180, 150, 180);
  floorLight.addColorStop(0, withAlpha('#e4f0cf', 0.16));
  floorLight.addColorStop(0.5, 'rgba(8, 20, 34, 0)');
  floorLight.addColorStop(1, 'rgba(6, 16, 28, 0.32)');
  ctx.fillStyle = floorLight;
  ctx.fillRect(-190, -190, 380, 380);
  ctx.restore();

  ctx.strokeStyle = withAlpha('#e4f0cf', 0.24);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 2, 158, 154, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let index = 0; index < 34; index += 1) {
    const angle = index / 34 * Math.PI * 2;
    const radius = 120 + (index % 3) * 15;
    star(ctx, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.78, 2 + (index % 2), withAlpha(options.flame > 50 ? '#f4c95d' : '#d8e5d3', 0.42), 4, angle + options.time * 0.05);
  }
  ctx.restore();

  const sorted = enemies.filter((enemy) => !enemy.dead).map((entity) => ({ entity, y: entity.y }));
  sorted.push({ entity: hero, y: hero.y });
  sorted.sort((a, b) => a.y - b.y);
  for (const entry of sorted) {
    if (entry.entity.kind === 'hero') {
      drawHero(ctx, {
        x: entry.entity.x,
        y: entry.entity.y,
        facing: entry.entity.facing,
        walkPhase: options.time * 9,
        flame: options.flame,
        weaponType: options.weaponType,
        scale: 1.08,
        moving: Math.hypot(entry.entity.vx, entry.entity.vy) > 5,
        invulnerable: options.intro > 0,
      });
    } else {
      if (entry.entity.telegraphTimer > 0) {
        const telegraphRadius = entry.entity.radius * 2.3;
        ctx.save();
        ctx.strokeStyle = withAlpha('#ff9679', 0.78);
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(entry.entity.x, entry.entity.y, telegraphRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      drawMonsterBody(ctx, entry.entity, options.time);
      drawMonsterDetails(ctx, entry.entity, options.time);
      const accent = ENEMIES[entry.entity.definitionId]?.accent ?? '#fff0b8';
      drawCelOverlay(ctx, entry.entity.x, entry.entity.y - entry.entity.radius * 0.08, entry.entity.radius * 0.82, accent, entry.entity.phase === 2 ? 0.34 : 0.24);
    }
    drawHealthBar(ctx, entry.entity);
  }

  for (const hazard of hazards) drawHazard(ctx, hazard);
  for (const projectile of projectiles) drawProjectile(ctx, projectile, options.time);
  drawParticles(ctx, particles);
  for (const text of texts) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, text.life * 1.8);
    ctx.font = `800 ${text.size}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#17243a';
    ctx.strokeText(text.text, text.x, text.y);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
    ctx.restore();
  }

  if (options.combo >= 2 && options.intro <= 0) {
    ctx.save();
    ctx.font = '900 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#17243a';
    ctx.strokeText(`${options.combo} 连`, 384, 165);
    ctx.fillStyle = '#f4c95d';
    ctx.fillText(`${options.combo} 连`, 384, 165);
    ctx.restore();
  }
  ctx.restore();

  if (options.intro > 0) {
    const alpha = Math.min(0.72, options.intro);
    ctx.fillStyle = `rgba(8, 14, 25, ${alpha})`;
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  }
  drawVignette(ctx, 0.48);
}
