/**
 * config.ts — THE single balance/tuning file.
 *
 * Every cost, rate, and stat the game uses lives here so you can tune the whole
 * game from one place. Nothing in here depends on the DOM, React, or Pixi.
 *
 * The simulation core (`engine.ts`, `offline.ts`, `combat.ts`, `waves.ts`,
 * `actions.ts`) reads from a `GameConfig`. The default export `defaultConfig`
 * is what the live game uses; tests can build their own config to probe edge
 * cases.
 */

import type { EnemyType, RingId } from './types';

/** Tunables for one defensive ring and its upgrade track. */
export interface RingConfig {
  /** Human label for UI. */
  readonly name: string;
  /** Short weapon description for UI flavor. */
  readonly weapon: string;
  /**
   * The ring's annular band on the normalized battlefield radius.
   * radius 1.0 = outer edge where enemies spawn, 0.0 = the core.
   * `outer` is the far edge of the band, `inner` is the near edge.
   * A ring fires on enemies whose radius is within [inner, outer].
   * An enemy that crosses below `inner` while the ring is active breaches it.
   */
  readonly band: { readonly outer: number; readonly inner: number };
  /** Damage-per-second at level 1. */
  readonly baseDps: number;
  /** Added DPS per upgrade level beyond level 1. */
  readonly dpsPerLevel: number;
  /** Supply cost of the FIRST build/upgrade (going from level L to L+1 at L=0 start). */
  readonly baseCost: number;
  /**
   * Geometric cost growth per level: cost(L→L+1) = baseCost * costGrowth^L.
   * costGrowth = 1 means flat cost.
   */
  readonly costGrowth: number;
  /** Supply cost to repair this ring after a breach. */
  readonly repairCost: number;
  /** Level the ring starts a fresh run at. 0 = not yet built (does not fire). */
  readonly startLevel: number;
}

/** Tunables for one enemy type. */
export interface EnemyConfig {
  /** Hit points at day 1. */
  readonly baseHp: number;
  /** Added HP per day (linear scaling). */
  readonly hpPerDay: number;
  /** Inward travel speed in normalized-radius units per second. */
  readonly speed: number;
  /** Supply awarded per kill at day 1. */
  readonly baseBounty: number;
  /** Added bounty per day. */
  readonly bountyPerDay: number;
}

export interface GameConfig {
  readonly version: number;
  /** Default RNG seed for a fresh run. */
  readonly seed: number;

  readonly wave: {
    /** Seconds between the end of one wave and the auto-start of the next (idle progress). */
    readonly intervalSec: number;
    /** Infantry count in the day-1 wave. */
    readonly baseCount: number;
    /** Added infantry per day. */
    readonly countPerDay: number;
    /** Hard ceiling on spawn count so late waves stay performant. */
    readonly maxCount: number;
    /** Seconds between individual enemy spawns within a wave. */
    readonly spawnSpacingSec: number;
  };

  readonly rings: Readonly<Record<RingId, RingConfig>>;
  readonly enemies: Readonly<Record<EnemyType, EnemyConfig>>;

  /**
   * Weapon effectiveness multiplier keyed by [ringId][enemyType]. Multiplies a
   * ring's DPS against that enemy. Defaults to 1.0 everywhere for the slice
   * (infantry only). This is the hook for later counter-matching
   * (armor→ATGM, drone→AD) with no engine change — just fill in the matrix.
   */
  readonly effectiveness: Readonly<Record<RingId, Readonly<Record<EnemyType, number>>>>;

  readonly breach: {
    /** Fraction of current Supply lost on a FULL breach (all rings down). 0.2 = 20%. */
    readonly fullBreachSupplyLossPct: number;
    /** Seconds after a full breach before the inner ring self-restores and play resumes. */
    readonly innerRestoreSec: number;
  };

  readonly offline: {
    /** Max waves credited for one absence, keeps SITREP and math bounded. */
    readonly maxWaves: number;
  };
}

/** Ordered outer→inner. Used anywhere ring traversal order matters. */
export const RING_ORDER: readonly RingId[] = ['outer', 'middle', 'inner'];

export const defaultConfig: GameConfig = {
  version: 1,
  seed: 1,

  wave: {
    intervalSec: 6,
    baseCount: 4,
    countPerDay: 0.6,
    maxCount: 60,
    spawnSpacingSec: 0.35,
  },

  rings: {
    outer: {
      name: 'Wire & Mines',
      weapon: 'Minefield',
      band: { outer: 1.0, inner: 0.64 },
      baseDps: 10,
      dpsPerLevel: 4,
      // Notional level 0→1 build cost. Never charged because the ring starts at
      // level 1 (startLevel), but it anchors the geometric upgrade curve so
      // upgrading the outer ring (level 1→2→…) costs supply like the others.
      baseCost: 8,
      costGrowth: 1.6,
      repairCost: 15,
      startLevel: 1,
    },
    middle: {
      name: 'Trenches & MGs',
      weapon: 'Machine guns',
      band: { outer: 0.64, inner: 0.32 },
      baseDps: 10,
      dpsPerLevel: 7,
      baseCost: 15, // affordable within the first wave or two (design tuning note)
      costGrowth: 1.55,
      repairCost: 25,
      startLevel: 0,
    },
    inner: {
      name: 'Bunkers & Mortars',
      weapon: 'Mortars',
      band: { outer: 0.32, inner: 0.0 },
      baseDps: 16,
      dpsPerLevel: 11,
      baseCost: 60,
      costGrowth: 1.5,
      repairCost: 40,
      startLevel: 0,
    },
  },

  enemies: {
    infantry: {
      baseHp: 10,
      hpPerDay: 3.5,
      speed: 0.08, // ~12.5s to cross the whole field unopposed
      baseBounty: 3,
      bountyPerDay: 0.5,
    },
  },

  effectiveness: {
    outer: { infantry: 1.0 },
    middle: { infantry: 1.0 },
    inner: { infantry: 1.0 },
  },

  breach: {
    fullBreachSupplyLossPct: 0.2,
    innerRestoreSec: 3,
  },

  offline: {
    maxWaves: 2000,
  },
};
