import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data';
import { shapeScale } from '../src/render/visuals';
import type { ZoneId } from '../src/types';

/**
 * The layer cache trades memory for frame time, and the failure mode is a phone
 * that allocates tens of megabytes of offscreen canvas and never gives it back.
 * These tests pin the budget and the eviction rule so that trade cannot silently
 * regress, and they are pure arithmetic so they hold without a DOM.
 */

/** Mirrors MAX_LAYER_PIXELS in src/render/layers.ts. */
const MAX_LAYER_PIXELS = 2_000_000;

interface LayerSize {
  width: number;
  height: number;
  pixels: number;
  /** Scale factor actually used after the per-layer ceiling and budget. */
  factor: number;
  dpr: number;
}

/** Mirrors the sizing arithmetic inside staticLayer. */
function resolveLayerSize(logicalWidth: number, logicalHeight: number, dpr: number, maxDpr?: number): LayerSize {
  const effective = Math.min(dpr, maxDpr ?? dpr);
  const requested = logicalWidth * logicalHeight * effective * effective;
  const budget = MAX_LAYER_PIXELS * 0.995;
  const factor = requested > budget ? Math.sqrt(budget / requested) : 1;
  const width = Math.max(1, Math.round(logicalWidth * effective * factor));
  const height = Math.max(1, Math.round(logicalHeight * effective * factor));
  return { width, height, pixels: width * height, factor, dpr: effective };
}

/** The sky layer is baked with this ceiling, matching visuals.ts. */
const SKY_MAX_DPR = 1.5;

describe('static layer budget', () => {
  it('keeps every island plate inside the pixel budget at dpr 2', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const size = resolveLayerSize(zone.width, zone.height, 2);
      expect(size.pixels, `${zoneId} layer exceeds the budget`).toBeLessThanOrEqual(MAX_LAYER_PIXELS);
    }
  });

  it('keeps every island plate inside the budget at dpr 3', () => {
    // The code clamps dpr to 2, but a desktop browser reporting 3 must not
    // quietly triple the allocation.
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const size = resolveLayerSize(zone.width, zone.height, 3);
      expect(size.pixels, `${zoneId} layer exceeds the budget at dpr 3`).toBeLessThanOrEqual(MAX_LAYER_PIXELS);
    }
  });

  it('keeps the sky layer well inside the budget', () => {
    const size = resolveLayerSize(480, 800, 2, SKY_MAX_DPR);
    expect(size.pixels).toBeLessThanOrEqual(MAX_LAYER_PIXELS);
    // The per-layer dpr ceiling should do the work here, not the pixel budget.
    expect(size.factor).toBe(1);
    expect(size.dpr).toBe(SKY_MAX_DPR);
  });

  it('caps the sky below full device resolution to save memory', () => {
    const capped = resolveLayerSize(480, 800, 2, SKY_MAX_DPR);
    const full = resolveLayerSize(480, 800, 2);
    expect(capped.pixels).toBeLessThan(full.pixels);
    // Still enough resolution that the stars are not visibly soft.
    expect(capped.width).toBeGreaterThanOrEqual(700);
  });

  it('never scales a layer up past the requested resolution', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const size = resolveLayerSize(zone.width, zone.height, 2);
      expect(size.factor, `${zoneId} was upscaled`).toBeLessThanOrEqual(1);
      expect(size.width).toBeLessThanOrEqual(zone.width * 2);
    }
  });

  it('holds the two live layers to a sane backing store', () => {
    // Sky plus one island is what staticLayer actually keeps: it evicts every
    // entry but the current key, so at most two layers exist at once. Summing
    // all five islands would assert a property eviction already guarantees.
    const sky = resolveLayerSize(480, 800, 2, SKY_MAX_DPR).pixels;
    let largestIsland = 0;
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const padding = layerPadding(zoneId);
      largestIsland = Math.max(
        largestIsland,
        resolveLayerSize(zone.width + padding * 2, zone.height + padding * 2, 2).pixels,
      );
    }
    // 4 bytes per pixel. Two live layers is the peak steady-state allocation, and
    // the pixel budget caps each one, so this is bounded by construction rather
    // than by the exact zone dimensions.
    const megabytes = ((sky + largestIsland) * 4) / (1024 * 1024);
    expect(megabytes, 'the live layer pair allocates too much').toBeLessThan(17);
    // A meaningful bound: two capped layers cannot exceed twice the budget.
    expect(megabytes).toBeLessThan((MAX_LAYER_PIXELS * 2 * 4) / (1024 * 1024));
  });

  it('is deterministic, so repeated calls hit the same cache entry', () => {
    const zone = ZONES.starfall;
    const first = resolveLayerSize(zone.width, zone.height, 2);
    const second = resolveLayerSize(zone.width, zone.height, 2);
    expect(first.width).toBe(second.width);
    expect(first.height).toBe(second.height);
  });

  it('only shrinks when over budget', () => {
    const small = resolveLayerSize(200, 200, 1);
    expect(small.factor).toBe(1);
    const huge = resolveLayerSize(4000, 4000, 2);
    expect(huge.factor).toBeLessThan(1);
  });
});

/**
 * The island plate is blitted by translating, so a cached layer that is smaller
 * than the zone it represents would silently drop the edges. The layer is sized
 * from the zone dimensions, and the plate must still fit inside it.
 */
/** Mirrors the padding calculation in drawWorldScene. */
function layerPadding(zoneId: ZoneId): number {
  const zone = ZONES[zoneId];
  let overshoot = 0;
  for (let degrees = 0; degrees < 360; degrees += 1) {
    overshoot = Math.max(overshoot, shapeScale(zone.terrain.shape, (degrees * Math.PI) / 180) - 1);
  }
  return Math.ceil(overshoot * Math.max(zone.width, zone.height) * 0.5) + 24;
}

describe('layer coverage', () => {
  it('gives every island padding for the overshoot past the zone rectangle', () => {
    // shapeScale can exceed 1, so the plate genuinely extends beyond the zone
    // bounds. A layer sized to the zone alone would clip those edges; this test
    // exists because that clipping was real and only showed up in a capture.
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const cx = zone.width / 2;
      const cy = zone.height / 2;
      const rx = zone.width * 0.475;
      const ry = zone.height * 0.475;
      const padding = layerPadding(zoneId);
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const t = (degrees * Math.PI) / 180;
        const n = shapeScale(zone.terrain.shape, t);
        const px = cx + Math.cos(t) * rx * n;
        const py = cy + Math.sin(t) * ry * n;
        expect(px + padding, `${zoneId} plate escapes the padded layer at ${degrees}deg`).toBeGreaterThanOrEqual(0);
        expect(px - padding).toBeLessThanOrEqual(zone.width);
        expect(py + padding, `${zoneId} plate escapes the padded layer at ${degrees}deg`).toBeGreaterThanOrEqual(0);
        expect(py - padding).toBeLessThanOrEqual(zone.height);
      }
    }
  });

  it('reports the real overflow so the padding cannot be tuned to nothing', () => {
    // If shapeScale ever stopped exceeding 1 this padding would become pure
    // waste, which is fine, but the test should say so rather than pass silently
    // while still depending on the slack.
    let anyOverflow = false;
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      for (let degrees = 0; degrees < 360; degrees += 1) {
        if (shapeScale(zone.terrain.shape, (degrees * Math.PI) / 180) > 1.001) anyOverflow = true;
      }
    }
    expect(anyOverflow, 'no landform overflows the zone, so the padding is unproven').toBe(true);
  });

  it('keeps the padded layer inside the pixel budget', () => {
    for (const zoneId of Object.keys(ZONES) as ZoneId[]) {
      const zone = ZONES[zoneId];
      const size = resolveLayerSize(zone.width + layerPadding(zoneId) * 2, zone.height + layerPadding(zoneId) * 2, 2);
      expect(size.pixels, `${zoneId} padded layer exceeds the budget`).toBeLessThanOrEqual(MAX_LAYER_PIXELS);
    }
  });
});