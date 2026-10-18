/**
 * marks.ts — the weapon/trait mark drawn on top of a unit's silhouette.
 *
 * Six silhouettes carry 21 kinds, so the mark is what tells a rifleman from a
 * rocketeer and a knight from a necromancer: a barrel, a riot shield, a drawn
 * bow, a glowing staff. It is drawn procedurally along the unit's aim rather
 * than baked, which is also why it lives here instead of in the sprite sheet —
 * both the battlefield renderer and the UI's unit icons draw the same mark from
 * this one function.
 */

import { PALETTE } from './palette';
import type { Ramp } from './pixel';
import type { UnitMark } from '../sim';

export const MARK_COLORS = {
  barrel: '#23262a',
  blade: '#dfe4ea',
  bowstring: '#e8d6a8',
} as const;

export interface MarkOptions {
  /** Unit centre, in whatever space the context is already in. */
  readonly x: number;
  readonly y: number;
  readonly aim: number;
  readonly mark: UnitMark;
  readonly ramp: Ramp;
  /** Body radius, used to place wheels on the flanks. */
  readonly radius: number;
  /** Animation phase for rolling wheels; omit for a still frame. */
  readonly roll?: number;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function drawMark(ctx: CanvasRenderingContext2D, o: MarkOptions): void {
  if (o.mark === 'none') return;
  const cos = Math.cos(o.aim);
  const sin = Math.sin(o.aim);
  const { x, y, ramp } = o;

  switch (o.mark) {
    case 'gun':
    case 'bigGun':
    case 'launcher': {
      const len = o.mark === 'gun' ? 6 : 7;
      const thick = o.mark === 'gun' ? 1 : 2;
      for (let i = 2; i <= len; i++) px(ctx, x + cos * i, y + sin * i, MARK_COLORS.barrel, thick, thick);
      if (o.mark === 'launcher') px(ctx, x + cos * (len + 1), y + sin * (len + 1), PALETTE.rocket, 2, 2);
      break;
    }
    case 'blade': {
      for (let i = 3; i <= 8; i++) px(ctx, x + cos * i, y + sin * i, MARK_COLORS.blade);
      break;
    }
    case 'bow': {
      for (let o2 = -2; o2 <= 2; o2++) {
        px(ctx, x + cos * 4 - sin * o2, y + sin * 4 + cos * o2, MARK_COLORS.bowstring);
      }
      break;
    }
    case 'staff': {
      for (let i = 3; i <= 6; i++) px(ctx, x + cos * i, y + sin * i, PALETTE.dirtDark);
      px(ctx, x + cos * 7 - 0.5, y + sin * 7 - 0.5, ramp[2], 2, 2);
      break;
    }
    case 'shield': {
      for (let o2 = -3; o2 <= 3; o2++) px(ctx, x + cos * 5 - sin * o2, y + sin * 5 + cos * o2, ramp[1]);
      for (let o2 = -2; o2 <= 2; o2++) px(ctx, x + cos * 6 - sin * o2, y + sin * 6 + cos * o2, ramp[3]);
      break;
    }
    case 'horns': {
      for (const side of [-1, 1]) {
        const a = o.aim + side * 0.6;
        px(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 5, ramp[2]);
      }
      break;
    }
    case 'wheels': {
      const roll = o.roll ?? 0;
      for (const side of [-1, 1]) {
        px(
          ctx,
          x - sin * side * (o.radius + 1),
          y + cos * side * (o.radius + 1) + roll,
          PALETTE.dirtDark,
          2,
          2,
        );
      }
      break;
    }
    default:
      break;
  }
}
