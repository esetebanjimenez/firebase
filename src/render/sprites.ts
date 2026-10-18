/**
 * sprites.ts — the sprite registry.
 *
 * Bodies come from the parametric builder (body.ts), sized by each kind's own
 * radius and coloured by its four-colour ramp; kit comes from the gear ladder
 * (gear.ts), drawn live so it can follow the unit's aim and wear its rank
 * colour. Between them, 21 kinds and 50 ranks are data rather than drawings —
 * and the same two functions draw the battlefield and the UI's icons, so they
 * cannot disagree.
 */

import { buildBody } from './body';
import { drawGear } from './gear';
import { PALETTE } from './palette';
import { bake, createLayer, type PixelGrid, type Ramp, type Sprite } from './pixel';
import { ENEMY_UNITS, PLAYER_UNITS } from '../sim';
import type { Rank, UnitKindId } from '../sim';

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
  /** Two walk frames: the body, and the body lifted a pixel. */
  readonly frames: readonly [Sprite, Sprite];
  /** Flat silhouette drawn over the body on a hit. */
  readonly flash: Sprite;
  /** Where the unit's centre sits inside the sprite. */
  readonly originX: number;
  readonly originY: number;
}

const unitCache = new Map<UnitKindId, UnitSprites>();
const propCache = new Map<PropId, Sprite>();

function defFor(kind: UnitKindId) {
  return kind in PLAYER_UNITS
    ? PLAYER_UNITS[kind as keyof typeof PLAYER_UNITS]
    : ENEMY_UNITS[kind as keyof typeof ENEMY_UNITS];
}

/** Paint every lit pixel of a sprite one colour, for the hit flash. */
function flatten(sprite: Sprite, color: string): Sprite {
  const { canvas, ctx } = createLayer(sprite.width, sprite.height);
  ctx.drawImage(sprite.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, sprite.width, sprite.height);
  ctx.globalCompositeOperation = 'source-over';
  return { canvas, width: sprite.width, height: sprite.height };
}

/**
 * Baked art for a unit kind. Bodies carry no gear: the kit is drawn live on top
 * so it can follow the unit's aim and its rank colour, which also keeps the
 * cache to one entry per kind rather than one per kind and rank.
 */
export function unitSprites(kind: UnitKindId): UnitSprites {
  const cached = unitCache.get(kind);
  if (cached) return cached;

  const def = defFor(kind);
  const ramp = def.colors as Ramp;
  const still = buildBody(def.silhouette, def.radius, ramp, 0);
  const bobbed = buildBody(def.silhouette, def.radius, ramp, 1);
  const sprites: UnitSprites = {
    frames: [still.sprite, bobbed.sprite],
    flash: flatten(still.sprite, PALETTE.flash),
    originX: still.originX,
    originY: still.originY,
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

const iconCache = new Map<string, UnitIconArt>();

/**
 * A button-sized portrait: the kind's body wearing the kit for a given rank,
 * facing up the field the way it leaves the gate. Because it is drawn from the
 * same builder and the same gear ladder as the battlefield, a button shows
 * exactly what you are about to deploy, rank colour included.
 */
export function unitIcon(kind: UnitKindId, rank: Rank): UnitIconArt {
  const key = `${kind}@${rank.gear}:${rank.color}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const def = defFor(kind);
  const body = unitSprites(kind).frames[0];
  const pad = Math.ceil(def.radius * 0.9);
  const width = body.width + pad * 2;
  const height = body.height + pad * 2;
  const { canvas, ctx } = createLayer(width, height);
  const cx = width / 2;
  const cy = height / 2;

  drawGear(ctx, {
    x: cx,
    y: cy,
    aim: -Math.PI / 2,
    mark: def.mark,
    rank,
    ramp: def.colors as Ramp,
    radius: def.radius,
  });
  ctx.drawImage(body.canvas, Math.round(cx - body.width / 2), Math.round(cy - body.height / 2));
  // Gear in front of the body (a shield, a barrel tip) is drawn twice so it is
  // not hidden by the torso: once behind for depth, once in front.
  drawGear(ctx, {
    x: cx,
    y: cy,
    aim: -Math.PI / 2,
    mark: def.mark,
    rank,
    ramp: def.colors as Ramp,
    radius: def.radius,
  });

  const art: UnitIconArt = { url: canvas.toDataURL(), width, height };
  iconCache.set(key, art);
  return art;
}
