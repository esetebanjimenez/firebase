/**
 * combat.ts — the single source of truth for all derived numbers.
 *
 * Both the live engine (`engine.ts`, per-frame) and offline progress
 * (`offline.ts`, closed-form) call these functions, so the two can never
 * disagree about how strong a ring is, how tough an enemy is, or what an
 * upgrade costs. All functions are pure: config + inputs → number.
 */

import type { GameConfig, RingConfig } from './config';
import { RING_ORDER } from './config';
import type { EnemyType, RingId, RingState, SimState } from './types';

/** Effective DPS of a ring at a given level against a given enemy type. Level 0 = not built = 0. */
export function ringDps(
  cfg: GameConfig,
  ringId: RingId,
  level: number,
  enemy: EnemyType = 'infantry',
): number {
  if (level <= 0) return 0;
  const rc = cfg.rings[ringId];
  const raw = rc.baseDps + rc.dpsPerLevel * (level - 1);
  const mult = cfg.effectiveness[ringId][enemy];
  return raw * mult;
}

/** Supply cost to take a ring from `currentLevel` to `currentLevel + 1`. */
export function upgradeCost(cfg: GameConfig, ringId: RingId, currentLevel: number): number {
  const rc = cfg.rings[ringId];
  return Math.round(rc.baseCost * Math.pow(rc.costGrowth, currentLevel));
}

/** Supply cost to repair a breached ring. */
export function repairCost(cfg: GameConfig, ringId: RingId): number {
  return cfg.rings[ringId].repairCost;
}

/** Enemy hit points on a given day. */
export function enemyHp(cfg: GameConfig, type: EnemyType, day: number): number {
  const ec = cfg.enemies[type];
  return ec.baseHp + ec.hpPerDay * Math.max(0, day - 1);
}

/** Supply awarded for killing an enemy on a given day. */
export function enemyBounty(cfg: GameConfig, type: EnemyType, day: number): number {
  const ec = cfg.enemies[type];
  return ec.baseBounty + ec.bountyPerDay * Math.max(0, day - 1);
}

/** Number of infantry in the wave for a given day, clamped to the max. */
export function waveCount(cfg: GameConfig, day: number): number {
  const w = cfg.wave;
  const n = Math.floor(w.baseCount + w.countPerDay * Math.max(0, day - 1));
  return Math.min(n, w.maxCount);
}

/**
 * Total DPS of the currently-active rings against an enemy type. Used by the
 * closed-form offline resolver to estimate a wave's outcome.
 */
export function activeDps(cfg: GameConfig, rings: Record<RingId, RingState>, enemy: EnemyType = 'infantry'): number {
  let sum = 0;
  for (const id of RING_ORDER) {
    const r = rings[id];
    if (r.status === 'active') sum += ringDps(cfg, id, r.level, enemy);
  }
  return sum;
}

/**
 * The time (seconds) an enemy spends inside one ring's firing band while
 * travelling inward at `speed`. Used to estimate how much damage a single ring
 * can apply before the enemy passes through it.
 */
export function bandTransitSec(rc: RingConfig, speed: number): number {
  return (rc.band.outer - rc.band.inner) / speed;
}

/** The ordered list of rings that are currently active, outer → inner. */
export function activeRings(state: SimState): RingId[] {
  return RING_ORDER.filter((id) => state.rings[id].status === 'active');
}
