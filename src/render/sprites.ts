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

import { WALK_CYCLE, buildBody } from './body';
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
  rock: { grid: PROP_ROCK, ramp: [PALETTE.rock, PALETTE.rockLight, PALETTE.rockLight, PALETTE.dirtDark, PALETTE.rock] },
  bush: { grid: PROP_BUSH, ramp: [PALETTE.grassLight, PALETTE.grass, PALETTE.grassLight, PALETTE.grassDark, PALETTE.grass] },
  bones: { grid: PROP_BONES, ramp: [PALETTE.bone, PALETTE.bone, PALETTE.bone, PALETTE.dirtDark, PALETTE.bone] },
  crater: { grid: PROP_CRATER, ramp: [PALETTE.dirt, PALETTE.dirtDark, PALETTE.dirt, PALETTE.dirtDark, PALETTE.dirtDark] },
};

// --- Registry --------------------------------------------------------------

export interface UnitSprites {
  /** The four poses of the walk cycle. */
  readonly frames: readonly Sprite[];
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
  const poses = WALK_CYCLE.map((pose) => buildBody(def.silhouette, def.radius, ramp, pose));
  const sprites: UnitSprites = {
    frames: poses.map((p) => p.sprite),
    flash: flatten(poses[0].sprite, PALETTE.flash),
    originX: poses[0].originX,
    originY: poses[0].originY,
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

// --- Ability icons ---------------------------------------------------------
//
// The three support abilities are the only buttons in the game that had no
// picture on them: a soldier's button shows the soldier, a gun pad shows the
// gun, and the abilities were three words in a row. Each is drawn from the
// same five-colour ramps as everything else, so they sit in the same world.

/** One shell, nose down. Shared by the artillery and the barrage. */
const SHELL: PixelGrid = [' 1 ', '121', '121', '121', '424'];

/** A starburst: white-hot centre, orange body, red spikes thrown out. */
const BURST: PixelGrid = [
  '     3     ',
  '   3 2 3   ',
  '  3 212 3  ',
  ' 3 21112 3 ',
  '  3 212 3  ',
  '   3 2 3   ',
];

const FLAME: PixelGrid = [
  '   3   ',
  '  323  ',
  ' 32223 ',
  ' 32223 ',
  '3222223',
  '3221223',
  '3221223',
  ' 32223 ',
  '  333  ',
];

const SHELL_RAMP: Ramp = [
  PALETTE.gateMetalLight,
  PALETTE.gateMetal,
  PALETTE.towerBarrel,
  PALETTE.explosionMid,
  PALETTE.explosionEdge,
];

const FIRE_RAMP: Ramp = [
  PALETTE.explosionCore,
  PALETTE.explosionMid,
  PALETTE.explosionEdge,
  PALETTE.burnDark,
  PALETTE.flash,
];

const abilityIconCache = new Map<string, UnitIconArt>();

/**
 * The button picture for a support ability: what it drops, and what that does
 * to the ground. One shell over a burst for the artillery, three shells walked
 * across for the barrage, a flame over burning ground for napalm.
 *
 * These were the only buttons in the game with no picture on them — a
 * soldier's button shows the soldier and a pad shows its gun, while fire
 * support was three words in a row.
 */
export function abilityIcon(id: 'artillery' | 'barrage' | 'napalm'): UnitIconArt {
  const cached = abilityIconCache.get(id);
  if (cached) return cached;

  const width = 15;
  const height = 15;
  const { canvas, ctx } = createLayer(width, height);
  const shell = bake(SHELL, SHELL_RAMP);

  if (id === 'napalm') {
    const flame = bake(FLAME, FIRE_RAMP);
    ctx.drawImage(flame.canvas, Math.round((width - flame.width) / 2), 1);
    // Ground still burning under it: the part that is not an explosion.
    ctx.fillStyle = PALETTE.burnDark;
    for (const [x, w] of [[1, 4], [6, 3], [10, 4]] as const) ctx.fillRect(x, 12, w, 1);
    ctx.fillStyle = PALETTE.explosionMid;
    for (const x of [2, 7, 12]) ctx.fillRect(x, 13, 1, 1);
  } else if (id === 'artillery') {
    const burst = bake(BURST, FIRE_RAMP);
    ctx.drawImage(shell.canvas, 6, 0);
    ctx.drawImage(burst.canvas, Math.round((width - burst.width) / 2), 8);
  } else {
    // Walked across the ground: three shells, each a step further on and a
    // step lower, with the first already coming down on its mark.
    ctx.drawImage(shell.canvas, 1, 0);
    ctx.drawImage(shell.canvas, 6, 2);
    ctx.drawImage(shell.canvas, 11, 4);
    ctx.fillStyle = PALETTE.explosionMid;
    ctx.fillRect(1, 11, 3, 1);
    ctx.fillRect(2, 10, 1, 1);
    ctx.fillStyle = PALETTE.explosionEdge;
    ctx.fillRect(0, 12, 5, 1);
    ctx.fillRect(7, 13, 3, 1);
    ctx.fillRect(12, 14, 3, 1);
  }

  const art: UnitIconArt = { url: canvas.toDataURL(), width, height };
  abilityIconCache.set(id, art);
  return art;
}
