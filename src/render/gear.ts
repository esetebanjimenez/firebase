/**
 * gear.ts — the kit a fighter is wearing, drawn on top of its body.
 *
 * Every kind has a ladder of gear: the base weapon first, then pieces earned
 * with rank. All of it is painted in the rank's colour — the whole kit, not
 * just the newest piece — so a fighter reads as one coherent loadout and the
 * colour alone tells you how far up the ladder it is.
 *
 * Drawn procedurally along the aim direction, which is why a rifle points where
 * the soldier is shooting and a shield covers the side it is facing.
 */

import { PALETTE } from './palette';
import type { Ramp } from './pixel';
import { RANK_COLOR_COUNT, type Rank } from '../sim';
import type { UnitMark } from '../sim';

/**
 * The colour ladder. Dull metals, then bright metals, then the rarity colours
 * players read without being taught. Each entry is [main, highlight] so gear
 * keeps a lit edge — obsidian in particular would vanish into the outline
 * without one.
 */
export const RANK_COLORS: readonly (readonly [string, string])[] = [
  ['#5a6168', '#868d95'], // iron — dull and dark, so step 1 has somewhere to go
  ['#b06a28', '#e0954a'], // bronze
  ['#d9be86', '#f2e0b8'], // tan
  ['#e4ebf2', '#ffffff'], // silver — bright, not grey, or it reads as iron
  ['#f2c22c', '#ffe680'], // gold
  ['#2fd07a', '#7bf5b4'], // jade — saturated, to survive an olive body under it
  ['#3f9bff', '#8cc8ff'], // azure
  ['#b06cff', '#d6aaff'], // violet
  ['#ff4a3d', '#ff9084'], // crimson
  ['#17191d', '#8f98a6'], // obsidian — near-black with a hard bright rim
];

export function rankColors(rank: Rank): readonly [string, string] {
  return RANK_COLORS[Math.max(0, Math.min(RANK_COLOR_COUNT - 1, rank.color))];
}

/** A piece of kit. The first entry of a ladder is the fighter's weapon. */
export type GearPiece =
  | 'rifle'
  | 'carbine'
  | 'machinegun'
  | 'launcher'
  | 'blade'
  | 'bow'
  | 'staff'
  | 'claws'
  | 'wheels'
  | 'nvg'
  | 'vest'
  | 'pack'
  | 'bipod'
  | 'scope'
  | 'shield'
  | 'pauldrons'
  | 'helm'
  | 'crest';

/** What each mark starts with, and what rank adds on top, in order. */
const LADDERS: Record<UnitMark, GearPiece[]> = {
  gun: ['rifle', 'nvg', 'vest', 'scope', 'pack'],
  bigGun: ['machinegun', 'bipod', 'nvg', 'vest', 'pack'],
  launcher: ['launcher', 'scope', 'nvg', 'vest', 'pack'],
  shield: ['shield', 'helm', 'pauldrons', 'vest', 'crest'],
  blade: ['blade', 'helm', 'pauldrons', 'vest', 'crest'],
  bow: ['bow', 'helm', 'vest', 'pauldrons', 'crest'],
  staff: ['staff', 'crest', 'pauldrons', 'vest', 'helm'],
  horns: ['claws', 'crest', 'pauldrons', 'helm', 'vest'],
  wheels: ['wheels', 'pauldrons', 'vest', 'helm', 'crest'],
  none: ['pauldrons', 'helm', 'vest', 'crest', 'blade'],
};

export interface GearOptions {
  readonly x: number;
  readonly y: number;
  readonly aim: number;
  readonly mark: UnitMark;
  readonly rank: Rank;
  readonly ramp: Ramp;
  readonly radius: number;
  readonly roll?: number;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** A thick line of pixels from one offset to another along the aim. */
function bar(
  ctx: CanvasRenderingContext2D,
  o: GearOptions,
  from: number,
  to: number,
  thickness: number,
  color: string,
  side = 0,
): void {
  const cos = Math.cos(o.aim);
  const sin = Math.sin(o.aim);
  const px0 = -sin * side;
  const py0 = cos * side;
  for (let i = from; i <= to; i += 0.5) {
    px(ctx, o.x + cos * i + px0, o.y + sin * i + py0, color, thickness, thickness);
  }
}

/** A band across the aim direction, used for shields, plates and crests. */
function band(
  ctx: CanvasRenderingContext2D,
  o: GearOptions,
  distance: number,
  half: number,
  color: string,
  thickness = 1,
): void {
  const cos = Math.cos(o.aim);
  const sin = Math.sin(o.aim);
  for (let s = -half; s <= half; s += 0.5) {
    px(ctx, o.x + cos * distance - sin * s, o.y + sin * distance + cos * s, color, thickness, thickness);
  }
}

function drawPiece(ctx: CanvasRenderingContext2D, o: GearOptions, piece: GearPiece): void {
  const [main, light] = rankColors(o.rank);
  const r = o.radius;

  switch (piece) {
    case 'rifle':
      bar(ctx, o, r * 0.3, r * 1.5, 1, main);
      px(ctx, o.x + Math.cos(o.aim) * r * 1.55, o.y + Math.sin(o.aim) * r * 1.55, light);
      break;
    case 'carbine':
      bar(ctx, o, r * 0.3, r * 1.2, 1, main);
      break;
    case 'machinegun':
      bar(ctx, o, r * 0.2, r * 1.6, 2, main);
      bar(ctx, o, r * 1.2, r * 1.6, 1, light);
      break;
    case 'launcher':
      bar(ctx, o, r * 0.1, r * 1.4, 2, main);
      // Warhead on the end.
      band(ctx, o, r * 1.5, 1.5, light, 2);
      break;
    case 'blade':
      bar(ctx, o, r * 0.5, r * 1.7, 1, light);
      band(ctx, o, r * 0.55, 1.5, main);
      break;
    case 'bow':
      band(ctx, o, r * 0.9, r * 0.7, main);
      band(ctx, o, r * 1.05, r * 0.4, light);
      break;
    case 'staff':
      bar(ctx, o, r * 0.4, r * 1.3, 1, main);
      px(ctx, o.x + Math.cos(o.aim) * r * 1.5 - 1, o.y + Math.sin(o.aim) * r * 1.5 - 1, light, 3, 3);
      break;
    case 'claws':
      for (const side of [-1, 1]) {
        const a = o.aim + side * 0.5;
        bar(ctx, { ...o, aim: a }, r * 0.8, r * 1.25, 1, light);
      }
      break;
    case 'wheels':
      for (const side of [-1, 1]) {
        band(ctx, o, 0, 0, main);
        px(
          ctx,
          o.x - Math.sin(o.aim) * side * (r + 1),
          o.y + Math.cos(o.aim) * side * (r + 1) + (o.roll ?? 0),
          main,
          3,
          3,
        );
      }
      break;
    case 'nvg': {
      // Twin tubes clear of the helmet, with lit lenses. A gear step has to be
      // as loud as a colour step or the ladder reads as colour alone.
      const cos = Math.cos(o.aim);
      const sin = Math.sin(o.aim);
      for (const side of [-1, 1]) {
        const ox = -sin * side * r * 0.22;
        const oy = cos * side * r * 0.22;
        px(ctx, o.x + cos * r * 0.42 + ox - 1, o.y + sin * r * 0.42 + oy - 1, main, 3, 3);
        px(ctx, o.x + cos * r * 0.68 + ox - 1, o.y + sin * r * 0.68 + oy - 1, light, 2, 2);
      }
      break;
    }
    case 'vest':
      // A chest rig across the torso, thick enough to read as webbing.
      band(ctx, o, -r * 0.05, r * 0.62, main, 2);
      band(ctx, o, -r * 0.3, r * 0.5, light, 2);
      break;
    case 'pack':
      band(ctx, o, -r * 0.8, r * 0.5, main, 3);
      band(ctx, o, -r * 1, r * 0.34, light, 2);
      break;
    case 'bipod':
      for (const side of [-1, 1]) {
        const a = o.aim + side * 0.75;
        bar(ctx, { ...o, aim: a }, r * 0.9, r * 1.3, 1, main);
      }
      break;
    case 'scope':
      bar(ctx, o, r * 0.55, r * 1.05, 2, main, -2);
      bar(ctx, o, r * 0.75, r * 0.95, 1, light, -2);
      break;
    case 'shield':
      band(ctx, o, r * 0.95, r * 0.8, main, 2);
      band(ctx, o, r * 0.75, r * 0.6, light);
      break;
    case 'pauldrons':
      for (const side of [-1, 1]) {
        band(ctx, { ...o, aim: o.aim + side * 1.35 }, r * 0.82, 3, main, 2);
        band(ctx, { ...o, aim: o.aim + side * 1.35 }, r * 0.62, 2, light, 2);
      }
      break;
    case 'helm':
      band(ctx, o, r * 0.42, r * 0.45, main, 2);
      band(ctx, o, r * 0.62, r * 0.3, light, 2);
      break;
    case 'crest':
      // A plume running front to back over the helmet.
      bar(ctx, o, -r * 0.45, r * 0.4, 2, main);
      bar(ctx, o, -r * 0.2, r * 0.3, 1, light);
      break;
    default:
      break;
  }
}

/**
 * Draw a fighter's whole kit: the base weapon plus every piece earned, all in
 * the rank's colour.
 */
export function drawGear(ctx: CanvasRenderingContext2D, o: GearOptions): void {
  const ladder = LADDERS[o.mark] ?? LADDERS.none;
  const pieces = Math.min(ladder.length, o.rank.gear + 1);
  // Back-to-front, so the weapon ends up on top of the webbing.
  for (let i = pieces - 1; i >= 0; i--) drawPiece(ctx, o, ladder[i]);
  void PALETTE;
}
