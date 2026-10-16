/**
 * sprites.ts — placeholder art as a swappable factory.
 *
 * Everything the battlefield draws is created here as simple colored shapes
 * (PixiJS `Graphics`). To move to pixel art later, replace the bodies of these
 * factories with `Sprite`s built from textures — the renderer only ever asks
 * this module for a display object, so nothing else has to change.
 */

import { Container, Graphics } from 'pixi.js';
import type { EnemyType, RingId } from '../sim';

/** Fixed, information-carrying palette (friendly cool hues vs. hostile warm). */
export const COLORS = {
  background: 0x1a1712,
  field: 0x271f14,
  fieldEdge: 0x3a2f1d,
  base: 0xd9c08a,
  baseCore: 0x8a6d3a,
  ringActive: {
    outer: 0x5fb0e6,
    middle: 0x5fe0a0,
    inner: 0x9f8cff,
  } as Record<RingId, number>,
  ringDown: 0xb3433a,
  infantry: 0xe5533c,
  infantryDark: 0xa83525,
  explosion: 0xffd25c,
  supplyText: 0x8fe8b0,
  breachText: 0xff7a5c,
} as const;

/** A single enemy unit view. Recognizable by silhouette alone (design goal). */
export function createUnitView(type: EnemyType): Container {
  const c = new Container();
  const g = new Graphics();
  if (type === 'infantry') {
    // Small chunky trooper: boots, body, helmet dot. Reads as a tiny figure.
    g.roundRect(-5, -3, 10, 8, 2).fill(COLORS.infantry);
    g.rect(-5, 3, 10, 2).fill(COLORS.infantryDark);
    g.circle(0, -6, 3).fill(COLORS.infantry);
  }
  c.addChild(g);
  return c;
}

/** The firebase at the center. */
export function createBaseView(radiusPx: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, radiusPx).fill(COLORS.base);
  g.circle(0, 0, radiusPx * 0.55).fill(COLORS.baseCore);
  // four little sandbag nubs for flavor
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.rect(Math.cos(a) * radiusPx - 2, Math.sin(a) * radiusPx - 2, 4, 4).fill(COLORS.base);
  }
  c.addChild(g);
  return c;
}

/** A one-shot explosion graphic; the renderer animates its scale/alpha. */
export function createExplosionView(): Graphics {
  const g = new Graphics();
  g.circle(0, 0, 10).fill(COLORS.explosion);
  return g;
}
