/**
 * ranks.ts — the visible rank ladder, shared by both armies.
 *
 * A rank is two numbers: how many pieces of gear a fighter carries, and which
 * colour that gear is painted. Gear climbs slowly and colour cycles fast, so
 * ten colours over five pieces of gear give fifty ranks that are all visibly
 * different — which means the first fifty levels of a soldier each change what
 * you see, instead of a number changing in a menu.
 *
 * Enemies read on the same ladder. A silver skeleton and a silver rifleman are
 * telling you the same thing, which is the point: difficulty you can see
 * beats a wave counter you have to remember.
 */

/** Colour steps, in order. Metals first, then the ladder every player knows. */
export const RANK_COLOR_COUNT = 10;

/** Gear pieces a fighter can accumulate before the colour resets. */
export const RANK_GEAR_STEPS = 5;

export const MAX_RANK = RANK_COLOR_COUNT * RANK_GEAR_STEPS;

export interface Rank {
  /** 0-based: how many gear pieces beyond the base weapon. */
  readonly gear: number;
  /** 0-based index into the colour ladder. */
  readonly color: number;
  /** 0-based overall rank, for comparisons and UI. */
  readonly index: number;
}

/**
 * Map a 1-based level to a rank. Level 1 is bare kit in the first colour; each
 * level advances the colour, and every tenth level earns another piece of gear
 * and resets the colour — so the new piece arrives unmistakably plain, then
 * climbs with the rest.
 */
export function rankOfLevel(level: number): Rank {
  const index = Math.max(0, Math.min(MAX_RANK - 1, Math.round(level) - 1));
  return {
    gear: Math.floor(index / RANK_COLOR_COUNT),
    color: index % RANK_COLOR_COUNT,
    index,
  };
}

/**
 * The rank an enemy wears, from how far its kind has scaled past its debut.
 * A militia that first appeared on wave 1 and is being fielded on wave 30 has
 * grown enormously; this is what puts that growth on the sprite.
 */
export function rankOfScale(hpScale: number): Rank {
  // Each rank step is worth roughly a third again as much, which is the same
  // shape as the per-wave growth curve without tracking waves here.
  const step = Math.log(Math.max(1, hpScale)) / Math.log(1.32);
  return rankOfLevel(Math.floor(step) + 1);
}

/** Names, for tooltips and the roster. */
export const RANK_COLOR_NAMES = [
  'Iron',
  'Bronze',
  'Tan',
  'Silver',
  'Gold',
  'Jade',
  'Azure',
  'Violet',
  'Crimson',
  'Obsidian',
] as const;

export function rankName(rank: Rank): string {
  const color = RANK_COLOR_NAMES[rank.color] ?? RANK_COLOR_NAMES[0];
  return rank.gear > 0 ? `${color} ${'★'.repeat(rank.gear)}` : color;
}
