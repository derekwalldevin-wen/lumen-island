/**
 * Runtime art library.
 *
 * Sprites are delivered as 1254x1254 white-background masters and baked down to
 * display resolution at build time (see tools/bake-sprites.md). At runtime they
 * load asynchronously and draw synchronously against whatever is ready, so a
 * missing or slow asset degrades to the procedural drawing instead of blocking
 * the frame.
 */

export type SpriteId =
  | 'hero'
  | 'luma'
  | 'cloudPuff'
  | 'rainSprout'
  | 'paperKite'
  | 'mistCrab'
  | 'inkBat'
  | 'starSentinel'
  | 'lanternMoth'
  | 'bellWarden'
  | 'starlessOwl'
  | 'sprigFork'
  | 'bellShoot'
  | 'moonKnife'
  | 'rainCane'
  | 'cometAxe'
  | 'forge'
  | 'cottage'
  | 'rainCanopy'
  | 'starChart'
  | 'lighthouse';

const SPRITE_FILES: Record<SpriteId, string> = {
  hero: 'hero',
  luma: 'luma',
  cloudPuff: 'cloudPuff',
  rainSprout: 'rainSprout',
  paperKite: 'paperKite',
  mistCrab: 'mistCrab',
  inkBat: 'inkBat',
  starSentinel: 'starSentinel',
  lanternMoth: 'lanternMoth',
  bellWarden: 'bellWarden',
  starlessOwl: 'starlessOwl',
  sprigFork: 'w-sprigFork',
  bellShoot: 'w-bellShoot',
  moonKnife: 'w-moonKnife',
  rainCane: 'w-rainCane',
  cometAxe: 'w-cometAxe',
  forge: 'b-forge',
  cottage: 'b-cottage',
  rainCanopy: 'b-rainCanopy',
  starChart: 'b-starChart',
  lighthouse: 'b-lighthouse',
};

const cache = new Map<SpriteId, HTMLImageElement>();
const pending = new Set<SpriteId>();
let basePath = 'art/';

/**
 * Inline sprites injected by the single-file offline build, which has no
 * sibling asset directory to load from. Kept out of the bundled path so a normal
 * deploy does not pay for ~350KB of base64 it would never read.
 */
type InlineMap = Partial<Record<SpriteId, string>>;

function inlineSprites(): InlineMap | null {
  if (typeof window === 'undefined') return null;
  const injected = (window as Window & { __LUMEN_INLINE_SPRITES__?: InlineMap }).__LUMEN_INLINE_SPRITES__;
  return injected ?? null;
}

/**
 * Base URL is resolved relative to the document so the game keeps working from
 * a subpath deployment and from a single-file offline build.
 */
export function setSpriteBasePath(path: string): void {
  basePath = path.endsWith('/') ? path : `${path}/`;
}

export function loadSprite(id: SpriteId): HTMLImageElement | null {
  const cached = cache.get(id);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  if (pending.has(id)) return null;
  // Guarded because the module is imported by tests running without a DOM. A
  // missing Image means there is no sprite support at all, and every call site
  // already handles null by drawing procedurally.
  if (typeof Image === 'undefined') return null;
  pending.add(id);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    pending.delete(id);
  };
  image.onerror = () => {
    pending.delete(id);
    cache.delete(id);
  };
  const inline = inlineSprites()?.[id];
  image.src = inline ?? `${basePath}${SPRITE_FILES[id]}.png`;
  cache.set(id, image);
  return null;
}

/** Warms the cache. Failure is silent: callers always have a procedural path. */
export function preloadSprites(ids: readonly SpriteId[]): void {
  for (const id of ids) loadSprite(id);
}

export interface SpriteDraw {
  image: HTMLImageElement;
  width: number;
  height: number;
}

/**
 * Returns the sprite fitted to a target box, anchored so the given fraction of
 * its height sits at `footY`. Character art is full body, and the feet are what
 * touch the ground, so anchoring by foot keeps the figure from floating or
 * sinking when the target box changes size.
 */
export function fitSprite(
  id: SpriteId,
  targetHeight: number,
  footAnchor = 1,
  maxWidth = Number.POSITIVE_INFINITY,
): SpriteDraw | null {
  const image = cache.get(id);
  if (!image || !image.complete || image.naturalWidth === 0) return null;
  const ratio = image.naturalHeight / image.naturalWidth;
  let width = targetHeight / ratio;
  if (width > maxWidth) {
    width = maxWidth;
  }
  const height = width * ratio;
  return { image, width, height: height * footAnchor };
}

/** Draws a fitted sprite centred on x with its foot line at y. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteDraw,
  x: number,
  footY: number,
  footAnchor = 1,
): void {
  const drawHeight = sprite.height / footAnchor;
  ctx.drawImage(sprite.image, x - sprite.width / 2, footY - drawHeight, sprite.width, drawHeight);
}

/** True when at least one sprite has finished decoding, used to gate tests. */
export function anySpriteReady(): boolean {
  for (const image of cache.values()) {
    if (image.complete && image.naturalWidth > 0) return true;
  }
  return false;
}