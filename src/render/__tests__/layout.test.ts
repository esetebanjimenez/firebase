/**
 * The snapping rule, checked against the scales real devices actually produce
 * (measured in Chromium at the field's 384x480).
 */

import { describe, expect, it } from 'vitest';
import { fieldLayout } from '../layout';

const W = 384;
const H = 480;

/** Canvas size in device pixels for a given pane size and DPR. */
function canvas(cssW: number, cssH: number, dpr: number): [number, number] {
  return [Math.floor(cssW * dpr), Math.floor(cssH * dpr)];
}

describe('field layout', () => {
  it('snaps a phone at DPR 2 up to a whole 2x', () => {
    const layout = fieldLayout(...canvas(388, 475, 2), W, H);
    expect(layout.snapped).toBe(true);
    expect(layout.scale).toBe(2);
  });

  it('snaps a phone at DPR 3 down to a whole 3x', () => {
    const layout = fieldLayout(...canvas(410, 522, 3), W, H);
    expect(layout.snapped).toBe(true);
    expect(layout.scale).toBe(3);
  });

  it('stays fractional when snapping would cost too much picture', () => {
    // A small phone fits 1.65x: 1x throws away 40%, 2x crops 21%. Neither is
    // worth trading for crispness, so this one keeps the fractional scale.
    const layout = fieldLayout(...canvas(358, 397, 2), W, H);
    expect(layout.snapped).toBe(false);
    expect(layout.scale).toBeGreaterThan(1.6);
    expect(layout.scale).toBeLessThan(1.7);
  });

  it('stays fractional below 1x, where there is no integer to snap to', () => {
    const layout = fieldLayout(...canvas(458, 445, 1), W, H);
    expect(layout.snapped).toBe(false);
    expect(layout.scale).toBeLessThan(1);
  });

  it('never overflows the canvas by more than a sliver', () => {
    for (let cssW = 240; cssW <= 1400; cssW += 7) {
      for (const dpr of [1, 2, 3]) {
        const [cw, ch] = canvas(cssW, cssW * 1.6, dpr);
        const layout = fieldLayout(cw, ch, W, H);
        expect(layout.width / Math.min(cw, (ch * W) / H)).toBeLessThanOrEqual(1.031);
      }
    }
  });

  it('centres the field on whole device pixels', () => {
    const layout = fieldLayout(...canvas(390, 500, 2), W, H);
    expect(Number.isInteger(layout.offsetX)).toBe(true);
    expect(Number.isInteger(layout.offsetY)).toBe(true);
  });

  it('keeps a snapped scale an exact multiple, so every pixel is square', () => {
    for (const [cssW, cssH, dpr] of [
      [388, 475, 2],
      [410, 522, 3],
      [768, 960, 1],
    ] as const) {
      const layout = fieldLayout(...canvas(cssW, cssH, dpr), W, H);
      if (!layout.snapped) continue;
      expect(layout.width % W).toBe(0);
      expect(layout.height % H).toBe(0);
    }
  });

  it('degrades safely on a canvas with no size yet', () => {
    const layout = fieldLayout(0, 0, W, H);
    expect(Number.isFinite(layout.scale)).toBe(true);
    expect(layout.scale).toBeGreaterThan(0);
  });
});
