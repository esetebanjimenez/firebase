/**
 * sprites.ts — the game's pixel art.
 *
 * Six silhouettes carry every one of the 21 unit kinds. A kind picks a
 * silhouette for its size and bearing, and recolours it with the four-colour
 * ramp from its roster entry; what tells a knight from a zombie at this scale
 * is colour, bulk, and the procedural mark the renderer draws on top (a barrel,
 * a shield, a glowing staff). That is how 8-bit consoles got variety out of a
 * tiny art budget, and it means new kinds are data, not drawings.
 */

import { drawMark } from './marks';
import { PALETTE } from './palette';
import { bake, bakeFlat, bobbed, createLayer, type PixelGrid, type Ramp, type Sprite } from './pixel';
import { ENEMY_UNITS, PLAYER_UNITS } from '../sim';
import type { Silhouette, UnitKindId } from '../sim';

// --- Silhouettes (top-down: shoulders, head, and bearing) ------------------

const TROOPER: PixelGrid = [
  '   4444   ',
  '  441144  ',
  ' 41122114 ',
  ' 41133114 ',
  ' 41133114 ',
  ' 41122114 ',
  '  441144  ',
  '   4444   ',
  '          ',
];

const GRUNT: PixelGrid = [
  '   444   ',
  '  41114  ',
  ' 4112114 ',
  ' 4113114 ',
  ' 4112114 ',
  '  41114  ',
  '   444   ',
  '         ',
];

const ARMORED: PixelGrid = [
  '   44444   ',
  '  4411144  ',
  ' 441222144 ',
  '44113331144',
  '41123332114',
  '44113331144',
  ' 441222144 ',
  '  4411144  ',
  '   44444   ',
  '           ',
];

const CASTER: PixelGrid = [
  '    44    ',
  '   4224   ',
  '  412214  ',
  ' 41233214 ',
  ' 41233214 ',
  ' 41222214 ',
  '  411114  ',
  '   4444   ',
  '          ',
];

const BRUTE: PixelGrid = [
  '     4444     ',
  '   44111144   ',
  '  4412222144  ',
  ' 441222222144 ',
  ' 441233332144 ',
  ' 441233332144 ',
  ' 441222222144 ',
  '  4412222144  ',
  '   44111144   ',
  '     4444     ',
  '              ',
];

const ENGINE: PixelGrid = [
  ' 444444444444 ',
  ' 411111111114 ',
  ' 412222222214 ',
  ' 412133331214 ',
  ' 412133331214 ',
  ' 412222222214 ',
  ' 411111111114 ',
  ' 444444444444 ',
  '              ',
];

const SILHOUETTES: Record<Silhouette, PixelGrid> = {
  trooper: TROOPER,
  grunt: GRUNT,
  armored: ARMORED,
  caster: CASTER,
  brute: BRUTE,
  engine: ENGINE,
};

// --- Props scattered over the ground ---------------------------------------

const PROP_ROCK: PixelGrid = ['  44  ', ' 4224 ', '412214', '411114', ' 4444 '];
const PROP_BUSH: PixelGrid = [' 4 4 ', '41214', '12221', '41114', ' 444 '];
const PROP_BONES: PixelGrid = [' 1 1 ', '41114', ' 1 1 ', '  4  '];
const PROP_CRATER: PixelGrid = [' 444 ', '41114', '41114', ' 444 '];

export type PropId = 'rock' | 'bush' | 'bones' | 'crater';

const PROP_ART: Record<PropId, { grid: PixelGrid; ramp: Ramp }> = {
  rock: { grid: PROP_ROCK, ramp: [PALETTE.rock, PALETTE.rockLight, PALETTE.rockLight, PALETTE.dirtDark] },
  bush: { grid: PROP_BUSH, ramp: [PALETTE.grassLight, PALETTE.grass, PALETTE.grassLight, PALETTE.grassDark] },
  bones: { grid: PROP_BONES, ramp: [PALETTE.bone, PALETTE.bone, PALETTE.bone, PALETTE.dirtDark] },
  crater: { grid: PROP_CRATER, ramp: [PALETTE.dirt, PALETTE.dirtDark, PALETTE.dirt, PALETTE.dirtDark] },
};

// --- Registry --------------------------------------------------------------

export interface UnitSprites {
  /** Two walk frames: the body, and the body bobbed one pixel. */
  readonly frames: readonly [Sprite, Sprite];
  /** Flat white silhouette, drawn over the body on a hit. */
  readonly flash: Sprite;
  readonly grid: PixelGrid;
}

const unitCache = new Map<UnitKindId, UnitSprites>();
const propCache = new Map<PropId, Sprite>();

function defFor(kind: UnitKindId) {
  return kind in PLAYER_UNITS
    ? PLAYER_UNITS[kind as keyof typeof PLAYER_UNITS]
    : ENEMY_UNITS[kind as keyof typeof ENEMY_UNITS];
}

/** Baked art for a unit kind. Cached: each kind is drawn once per session. */
export function unitSprites(kind: UnitKindId): UnitSprites {
  const cached = unitCache.get(kind);
  if (cached) return cached;

  const def = defFor(kind);
  const grid = SILHOUETTES[def.silhouette];
  const ramp = def.colors as Ramp;
  const sprites: UnitSprites = {
    frames: [bake(grid, ramp), bake(bobbed(grid), ramp)],
    flash: bakeFlat(grid, PALETTE.flash),
    grid,
  };
  unitCache.set(kind, sprites);
  return sprites;
}

export function propSprite(id: PropId): Sprite {
  const cached = propCache.get(id);
  if (cached) return cached;
  const { grid, ramp } = PROP_ART[id];
  const sprite = bake(grid, ramp);
  propCache.set(id, sprite);
  return sprite;
}

/** The art for a kind, for UI chips and the roster screens. */
export function unitRamp(kind: UnitKindId): Ramp {
  return defFor(kind).colors as Ramp;
}

export interface UnitIconArt {
  readonly url: string;
  /** Unscaled size in sprite pixels; the caller scales by a whole number. */
  readonly width: number;
  readonly height: number;
}

const iconCache = new Map<UnitKindId, UnitIconArt>();

/**
 * A button-sized portrait of a unit kind: the very sprite that walks out of the
 * gate, weapon mark and all, facing up. Buttons made from the game's own art
 * cannot drift from the battlefield the way a separate icon set would — and
 * nothing here is anti-aliased, so it sits under the field without looking
 * imported from another game.
 *
 * Baked at 1:1 and reported with its pixel size, so the caller can scale it by
 * a whole number and keep every pixel square.
 */
export function unitIcon(kind: UnitKindId): UnitIconArt {
  const cached = iconCache.get(kind);
  if (cached) return cached;

  const def = defFor(kind);
  const body = unitSprites(kind).frames[0];
  // Just enough room: a little to the sides for a shield, more above for the
  // barrel or blade the mark extends upward.
  const width = body.width + 4;
  const height = body.height + 8;
  const centreX = width / 2;
  const centreY = height - body.height / 2 - 1;

  const { canvas, ctx } = createLayer(width, height);
  drawMark(ctx, {
    x: centreX,
    y: centreY,
    aim: -Math.PI / 2, // facing up the field, the way it leaves the gate
    mark: def.mark,
    ramp: def.colors as Ramp,
    radius: def.radius,
  });
  ctx.drawImage(body.canvas, Math.round(centreX - body.width / 2), Math.round(centreY - body.height / 2));

  const art: UnitIconArt = { url: canvas.toDataURL(), width, height };
  iconCache.set(kind, art);
  return art;
}
