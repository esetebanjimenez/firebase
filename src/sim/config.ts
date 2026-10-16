/**
 * config.ts — THE single balance/tuning file.
 *
 * Game model ("The Line"): a single defended barrier. Enemies advance from the
 * right, stop at the wall and shoot it (chipping its HP); your soldiers shoot
 * back and earn Supply per kill. Supply buys three tracks — Firepower (soldier
 * DPS), Fortify (wall max HP + regen), Fire Support (an active cooldown strike)
 * — plus instant Repair. A wave counts as a Day only if the wall still stands
 * when it's cleared; a destroyed wall just stalls progress (no penalty).
 *
 * Nothing here depends on the DOM, React, or Pixi.
 */

import type { EnemyType } from './types';

export interface EnemyConfig {
  /** Hit points at day 1. */
  readonly baseHp: number;
  readonly hpPerDay: number;
  /** Advance speed toward the wall, in normalized lane units per second (1 = full lane). */
  readonly speed: number;
  /** Supply awarded per kill at day 1. */
  readonly baseBounty: number;
  readonly bountyPerDay: number;
  /** Damage dealt to the wall per second while engaged, at day 1. */
  readonly attackDps: number;
  readonly attackDpsPerDay: number;
}

export interface GameConfig {
  readonly version: number;
  readonly seed: number;

  readonly wave: {
    readonly intervalSec: number;
    readonly baseCount: number;
    readonly countPerDay: number;
    readonly maxCount: number;
    readonly spawnSpacingSec: number;
  };

  readonly enemies: Readonly<Record<EnemyType, EnemyConfig>>;

  /** Soldier firepower track — your total damage output. Starts built (level 1). */
  readonly firepower: {
    readonly baseDps: number;
    readonly dpsPerLevel: number;
    readonly baseCost: number;
    readonly costGrowth: number;
    readonly startLevel: number;
  };

  /** The wall: max HP, passive regen, and instant repair cost. Starts built (level 1). */
  readonly barrier: {
    readonly baseMaxHp: number;
    readonly maxHpPerLevel: number;
    readonly baseRegenPerSec: number;
    readonly regenPerSecPerLevel: number;
    readonly baseCost: number;
    readonly costGrowth: number;
    readonly startLevel: number;
    /** Supply cost per HP restored by an instant Repair. */
    readonly repairCostPerHp: number;
    readonly minRepairCost: number;
  };

  /** Fire Support — an active, tappable AoE strike on cooldown. Starts locked (level 0). */
  readonly fireSupport: {
    readonly baseDamage: number;
    readonly damagePerLevel: number;
    readonly baseCooldownSec: number;
    /** Cooldown reduction per level (added; negative shortens). Clamped by minCooldownSec. */
    readonly cooldownPerLevel: number;
    readonly minCooldownSec: number;
    /** Strike hits every enemy whose lane position is within this distance of the wall. */
    readonly radius: number;
    readonly baseCost: number;
    readonly costGrowth: number;
  };

  readonly offline: {
    readonly maxWaves: number;
    /** Fixed timestep (seconds) used by the headless offline run. */
    readonly stepSec: number;
    /** Safety cap on steps per simulated wave. */
    readonly maxStepsPerWave: number;
  };
}

export const defaultConfig: GameConfig = {
  version: 2,
  seed: 1,

  wave: {
    intervalSec: 6,
    baseCount: 5,
    countPerDay: 0.7,
    maxCount: 80,
    spawnSpacingSec: 0.28,
  },

  enemies: {
    infantry: {
      baseHp: 14,
      hpPerDay: 3.3, // gentler scaling keeps the fight recoverable for longer
      speed: 0.2, // ~5s to cross the lane; a few leak to the wall from the first waves
      baseBounty: 3,
      bountyPerDay: 0.55,
      attackDps: 4.5, // a few reaching the wall is felt immediately
      attackDpsPerDay: 0.5,
    },
  },

  firepower: {
    baseDps: 11,
    dpsPerLevel: 7, // each upgrade matters more, so you can out-scale if you invest
    baseCost: 12,
    costGrowth: 1.45,
    startLevel: 1,
  },

  barrier: {
    baseMaxHp: 110,
    maxHpPerLevel: 70,
    baseRegenPerSec: 1.4, // slow enough that damage lingers within a wave
    regenPerSecPerLevel: 0.8,
    baseCost: 20,
    costGrowth: 1.5,
    startLevel: 1,
    repairCostPerHp: 0.15,
    minRepairCost: 4,
  },

  fireSupport: {
    baseDamage: 45,
    damagePerLevel: 30,
    baseCooldownSec: 20,
    cooldownPerLevel: -1.4,
    minCooldownSec: 6,
    radius: 0.55,
    baseCost: 30,
    costGrowth: 1.6,
  },

  offline: {
    maxWaves: 2000,
    stepSec: 0.2,
    maxStepsPerWave: 600,
  },
};
