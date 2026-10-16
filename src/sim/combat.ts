/**
 * combat.ts — the single source of truth for derived numbers.
 *
 * The live engine and offline progress both call these pure functions, so they
 * can't disagree about soldier DPS, enemy stats, wall HP, costs, or fire-support
 * strength.
 */

import type { GameConfig } from './config';
import type { EnemyType, SimState } from './types';

/** Total soldier damage-per-second at a given firepower level. */
export function firepowerDps(cfg: GameConfig, level: number): number {
  if (level <= 0) return 0;
  return cfg.firepower.baseDps + cfg.firepower.dpsPerLevel * (level - 1);
}

/** Supply cost to take firepower from `level` to `level + 1`. */
export function firepowerCost(cfg: GameConfig, level: number): number {
  return Math.round(cfg.firepower.baseCost * Math.pow(cfg.firepower.costGrowth, Math.max(0, level - 1)));
}

/** Wall max HP at a given barrier level. */
export function barrierMaxHp(cfg: GameConfig, level: number): number {
  return cfg.barrier.baseMaxHp + cfg.barrier.maxHpPerLevel * Math.max(0, level - 1);
}

/** Wall passive regen per second at a given barrier level. */
export function barrierRegen(cfg: GameConfig, level: number): number {
  return cfg.barrier.baseRegenPerSec + cfg.barrier.regenPerSecPerLevel * Math.max(0, level - 1);
}

/** Supply cost to take the barrier from `level` to `level + 1`. */
export function barrierCost(cfg: GameConfig, level: number): number {
  return Math.round(cfg.barrier.baseCost * Math.pow(cfg.barrier.costGrowth, Math.max(0, level - 1)));
}

/** Supply cost to instantly repair the wall to full, given current/max HP. */
export function repairCost(cfg: GameConfig, hp: number, maxHp: number): number {
  const missing = Math.max(0, maxHp - hp);
  if (missing <= 0) return 0;
  return Math.max(cfg.barrier.minRepairCost, Math.ceil(missing * cfg.barrier.repairCostPerHp));
}

/** Fire Support strike damage at a given level (0 = locked). */
export function fireSupportDamage(cfg: GameConfig, level: number): number {
  if (level <= 0) return 0;
  return cfg.fireSupport.baseDamage + cfg.fireSupport.damagePerLevel * (level - 1);
}

/** Fire Support cooldown (seconds) at a given level. */
export function fireSupportCooldown(cfg: GameConfig, level: number): number {
  const raw = cfg.fireSupport.baseCooldownSec + cfg.fireSupport.cooldownPerLevel * Math.max(0, level - 1);
  return Math.max(cfg.fireSupport.minCooldownSec, raw);
}

/** Supply cost to unlock/upgrade Fire Support from `level` to `level + 1`. */
export function fireSupportCost(cfg: GameConfig, level: number): number {
  return Math.round(cfg.fireSupport.baseCost * Math.pow(cfg.fireSupport.costGrowth, level));
}

export function enemyHp(cfg: GameConfig, type: EnemyType, day: number): number {
  const ec = cfg.enemies[type];
  return ec.baseHp + ec.hpPerDay * Math.max(0, day - 1);
}

export function enemyBounty(cfg: GameConfig, type: EnemyType, day: number): number {
  const ec = cfg.enemies[type];
  return ec.baseBounty + ec.bountyPerDay * Math.max(0, day - 1);
}

export function enemyAttackDps(cfg: GameConfig, type: EnemyType, day: number): number {
  const ec = cfg.enemies[type];
  return ec.attackDps + ec.attackDpsPerDay * Math.max(0, day - 1);
}

export function waveCount(cfg: GameConfig, day: number): number {
  const w = cfg.wave;
  const n = Math.floor(w.baseCount + w.countPerDay * Math.max(0, day - 1));
  return Math.min(n, w.maxCount);
}

/** Convenience: is the wall currently standing? */
export function wallStanding(state: SimState): boolean {
  return state.barrier.hp > 0;
}
