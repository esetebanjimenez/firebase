/**
 * types.ts — the simulation data model for "The Line".
 *
 * Shaped so later systems (new enemy types, abilities, prestige) extend without
 * rewrites: `EnemyType` is a string union, upgrade tracks are plain levels, and
 * `version` enables save migrations.
 */

export type EnemyType = 'infantry';

export interface Enemy {
  readonly id: number;
  readonly type: EnemyType;
  hp: number;
  readonly maxHp: number;
  /** Lane position: 1 = far-right spawn, 0 = at the wall. Decreases as it advances. */
  pos: number;
  /** Advance speed in lane units/sec. */
  readonly speed: number;
  /** Supply awarded on death. */
  readonly bounty: number;
  /** Damage dealt to the wall per second once engaged. */
  readonly attackDps: number;
  /** True once the enemy has reached the wall and is attacking it. */
  engaging: boolean;
}

export interface BarrierState {
  level: number;
  /** Current hit points. 0 = destroyed (stalls Days until repaired/regenerated). */
  hp: number;
  /** Derived from level; cached for convenience and UI. */
  maxHp: number;
}

export interface FireSupportState {
  /** 0 = not yet unlocked. */
  level: number;
  /** Seconds until it can be used again. */
  cooldownRemaining: number;
}

export interface WaveState {
  index: number;
  timerSec: number;
  inProgress: boolean;
  toSpawn: number;
  spawnTimerSec: number;
}

export interface SimStats {
  totalKills: number;
  totalSupplyEarned: number;
  bestDay: number;
}

export interface SimState {
  version: number;
  readonly seed: number;
  rngState: number;
  nextEnemyId: number;

  day: number;
  supply: number;

  /** Soldier firepower upgrade level (total DPS derived from it). */
  firepowerLevel: number;
  barrier: BarrierState;
  fireSupport: FireSupportState;

  enemies: Enemy[];
  wave: WaveState;

  stats: SimStats;
}

/** Discrete, renderable things that happened during a `step()`. */
export type SimEvent =
  | { type: 'spawn'; enemyId: number }
  | { type: 'kill'; enemyId: number; pos: number; bounty: number }
  | { type: 'wallBroken' }
  | { type: 'wallRepaired' }
  | { type: 'fireSupport'; damage: number }
  | { type: 'waveStarted'; index: number }
  | { type: 'waveResolved'; day: number; counted: boolean };

/** Summary shown on return from an absence. */
export interface Sitrep {
  daysGained: number;
  supplyEarned: number;
  wavesResolved: number;
  /** True if the wall was down at the end of the absence (needs attention). */
  wallDown: boolean;
  secondsCredited: number;
  capped: boolean;
}
