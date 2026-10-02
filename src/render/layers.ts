/**
 * Layered caching for the world scene.
 *
 * The world renderer used to redraw everything every frame: sky, island plate,
 * ground speckle, grass, decor. That is roughly 3000 canvas calls per frame, the
 * vast majority of them producing identical pixels. Measured at 5.8ms median per
 * frame on a 2000x1400 backing store, with p95 near 14ms.
 *
 * The split here is by whether the layer depends on `time`:
 *
 *   static  - depends only on the zone. Cached to an offscreen canvas, drawn
 *             once, then blitted. Any amount of extra detail is free at runtime.
 *   live    - animates. Drawn per frame, and kept deliberately cheap.
 *
 * The static layer is deliberately generous with detail: noise, brush strokes
 * and pebbles cost nothing once they are baked, and they are what stops the
 * ground reading as flat colour fields under the painted character art.
 */

export type StaticLayerKey = string;

interface CacheEntry {
  canvas: HTMLCanvasElement;
  /** Zone id, so a cache is never reused across islands. */
  zoneId: string;
  /** Backing resolution actually used, after the pixel budget was applied. */
  width: number;
  height: number;
  /** Effective dpr, including any per-layer ceiling. */
  dpr: number;
  /** Slack added around the logical content, needed to rebuild the blit offset. */
  padding: number;
}

const cache = new Map<StaticLayerKey, CacheEntry>();

/**
 * Hard ceiling on a cached layer's pixel count.
 *
 * A zone plate is up to 1320 units square, so baking one at dpr 2 would be a
 * 27MB canvas. Five of those is a phone-killing allocation, and the game is
 * meant to run on mid-range mobile. Capping the total pixels keeps a layer at a
 * few MB; the shortfall in sharpness is invisible on a surface this soft, and
 * the budget is spent where it shows, on the live sprites.
 */
const MAX_LAYER_PIXELS = 2_000_000;

export interface StaticLayerOptions {
  zoneId: string;
  dpr: number;
  /** Logical size of the layer, in world units. */
  scale: number;
  /** Logical width and height, when they differ from a single `scale`. */
  width?: number;
  height?: number;
  /**
   * Slack around the logical content, in world units. The island plate is drawn
   * from the zone ellipse scaled by shapeScale, which can exceed 1, so the drawn
   * silhouette reaches outside the zone rectangle. A layer sized exactly to the
   * zone would clip those edges away.
   */
  padding?: number;
  /**
   * Ceiling on this layer's own resolution, for backdrops that do not need to
   * hold up under magnification. The sky is a soft gradient with small stars, so
   * baking it at dpr 1.5 instead of 2 saves about 3MB for no visible change.
   */
  maxDpr?: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * Returns the cached static layer for a zone, rendering it on first use or after
 * the zone or device pixel ratio changes. A canvas of zero size is possible
 * before layout settles, so a failed render is simply not cached and the caller
 * draws live instead.
 */
/**
 * A resolved layer, ready to blit. `padding` is the slack that was added around
 * the logical content, so the caller can place the canvas so that zone
 * coordinates land where they were authored.
 */
export interface StaticLayer {
  canvas: HTMLCanvasElement;
  padding: number;
}

export function staticLayer(key: StaticLayerKey, options: StaticLayerOptions): StaticLayer | null {
  // Guarded for non-DOM environments: the render smoke tests call the scene
  // directly, and they must exercise the live fallback path, not throw.
  if (typeof document === 'undefined') return null;
  // Content is authored in zone coordinates; the canvas carries `padding` of
  // slack on every side so a silhouette drawn outside the zone is not clipped.
  const padding = options.padding ?? 0;
  const logicalWidth = (options.width ?? options.scale) + padding * 2;
  const logicalHeight = (options.height ?? options.scale) + padding * 2;
  // Clamp the backing resolution to the pixel budget, and round to a small
  // integer factor of the requested dpr so repeated calls agree on the size and
  // the cache actually hits.
  const dpr = Math.min(options.dpr, options.maxDpr ?? options.dpr);
  const requested = logicalWidth * logicalHeight * dpr * dpr;
  // Headroom for the rounding below. Solving exactly for the budget and then
  // rounding each axis up can land a few hundred pixels over the line, which is
  // precisely the kind of off-by-a-hair that a test should never have to allow.
  const budget = MAX_LAYER_PIXELS * 0.995;
  const factor = requested > budget ? Math.sqrt(budget / requested) : 1;
  const scale = dpr * factor;
  const width = Math.max(1, Math.round(logicalWidth * scale));
  const height = Math.max(1, Math.round(logicalHeight * scale));
  const existing = cache.get(key);
  if (existing && existing.zoneId === options.zoneId && existing.width === width && existing.height === height) {
    return { canvas: existing.canvas, padding: existing.padding };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  // Authored in zone coordinates, so shift by the padding.
  ctx.translate(padding, padding);
  try {
    options.draw(ctx);
  } catch {
    return null;
  }
  cache.set(key, { canvas, zoneId: options.zoneId, width, height, dpr, padding });
  // Two layers are live at once (sky and island). Anything older is dead weight,
  // so drop all but the current key rather than growing with the zone count.
  if (cache.size > 2) {
    for (const stale of Array.from(cache.keys())) {
      if (stale !== key) cache.delete(stale);
    }
  }
  return { canvas, padding };
}

/**
 * Drops cached layers. Called when leaving a zone so the next island does not
 * pay to hold two full backing stores, and available for memory pressure.
 */
export function clearStaticLayers(): void {
  cache.clear();
}

/** Test seam: how many layers are currently held. */
export function staticLayerCount(): number {
  return cache.size;
}

/**
 * Soft elliptical mottling for baked ground surfaces.
 *
 * An earlier version painted a coarse value-noise grid with fillRect. At the
 * alphas needed to be subtle the per-cell fills stacked into a visible square
 * lattice over the whole island, which read worse than the flat colour it was
 * meant to replace. Overlapping discs have no grid alignment, so they blend into
 * an uneven wash instead.
 */
export function paintGroundMottle(
  ctx: CanvasRenderingContext2D,
  /** Receives a ready-to-use fill style, so callers need no alpha plumbing. */
  draw: (x: number, y: number, rx: number, ry: number, fill: string) => void,
  bounds: { x: number; y: number; width: number; height: number },
  random: () => number,
  options: { count: number; minRadius: number; maxRadius: number; colors: string[]; minAlpha: number; maxAlpha: number },
): void {
  const { count, minRadius, maxRadius, colors, minAlpha, maxAlpha } = options;
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const x = bounds.x + random() * bounds.width;
    const y = bounds.y + random() * bounds.height;
    const radius = minRadius + random() * (maxRadius - minRadius);
    const alpha = minAlpha + random() * (maxAlpha - minAlpha);
    const color = colors[Math.floor(random() * colors.length)] ?? colors[0]!;
    draw(x, y, radius, radius * (0.45 + random() * 0.4), hexToRgba(color, alpha));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Minimal #rgb/#rrggbb to rgba() conversion; the palette here is all literal hex. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/**
 * Short directional strokes following a light direction. Sells a hand painted
 * surface at a fraction of the cost of an illustration, because the whole thing
 * is baked once.
 */
export function paintBrushStrokes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  random: () => number,
  options: { count: number; angle: number; spread: number; color: string; alpha: number; minLength: number; maxLength: number },
): void {
  const { count, angle, spread, color, alpha, minLength, maxLength } = options;
  ctx.save();
  ctx.lineCap = 'round';
  for (let index = 0; index < count; index += 1) {
    const sx = x + random() * width;
    const sy = y + random() * height;
    const theta = angle + (random() - 0.5) * spread;
    const length = minLength + random() * (maxLength - minLength);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
    ctx.lineWidth = 1 + random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(theta) * length, sy + Math.sin(theta) * length);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}