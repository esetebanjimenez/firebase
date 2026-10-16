/**
 * types.ts — the simulation data model.
 *
 * Shaped so the deferred systems (armor/drones, FOBs, prestige, commanders)
 * can be added later without rewriting the engine:
 *   - `EnemyType` / `RingId` are string unions — extend the union + config.
 *   - Per-type stats live in config, not in code branches.
 *   - Supply is a single top-level field (future: shared pool across FOBs).
 *   - `version` enables save migrations.
 */

/** The three defensive rings, outer → inner. */
export type RingId = 'outer' | 'middle' | 'inner';

/**
 * Enemy types. The slice ships `infantry` only; the union is the extension
 * point for `armor`, `drone`, etc.
 */
export type EnemyType = 'infantry';

export type RingStatus = 'active' | 'down';

export interface RingState {
  readonly id: RingId;
  /** Upgrade level. 0 = not built (does not fire). Kept across breaches. */
  level: number;
  /** `active` = firing; `down` = breached, needs repair (or self-restore). */
  status: RingStatus;
}

export interface Enemy {
  readonly id: number;
  readonly type: EnemyType;
  hp: number;
  readonly maxHp: number;
  /** Normalized distance from the core. 1.0 = spawn edge, 0.0 = core. Decreases over time. */
  radius: number;
  /** Inward speed in radius-units/sec. */
  readonly speed: number;
  /** Supply awarded when this enemy dies. */
  readonly bounty: number;
}

export interface WaveState {
  /** 1-based index of the current/most-recent wave. */
  index: number;
  /** Seconds remaining until the next wave auto-spawns (only counts down between waves). */
  timerSec: number;
  /** True while a wave is spawning or enemies remain alive. */
  inProgress: boolean;
  /** Enemies still to be spawned in the in-progress wave. */
  toSpawn: number;
  /** Seconds until the next individual spawn within the in-progress wave. */
  spawnTimerSec: number;
}

export interface SimStats {
  totalKills: number;
  totalSupplyEarned: number;
  /** Highest Days Held reached this run. */
  bestDay: number;
}

/**
 * The complete, serializable simulation state. Everything needed to resume a
 * run (and to reproduce it deterministically) lives here.
 */
export interface SimState {
  version: number;
  /** Seed the run was created with (for reference/debug). */
  readonly seed: number;
  /** Current RNG internal state — carried in state so save/load is reproducible. */
  rngState: number;
  /** Monotonic id source for spawned enemies. */
  nextEnemyId: number;

  /** Days Held — the main progress counter. One resolved wave = one day. */
  day: number;
  supply: number;

  rings: Record<RingId, RingState>;
  enemies: Enemy[];
  wave: WaveState;

  /** True after a full breach; Days Held is frozen until the inner ring self-restores. */
  daysHeldPaused: boolean;
  /** Countdown until the inner ring self-restores after a full breach (0 when not pending). */
  restoreTimerSec: number;

  stats: SimStats;
}

/** Discrete, renderable things that happened during a `step()` — for juice/FX. */
export type SimEvent =
  | { type: 'kill'; enemyId: number; radius: number; bounty: number }
  | { type: 'breach'; ring: RingId; radius: number }
  | { type: 'fullBreach'; supplyLost: number }
  | { type: 'ringRestored'; ring: RingId }
  | { type: 'waveResolved'; day: number }
  | { type: 'waveStarted'; index: number }
  | { type: 'spawn'; enemyId: number };

/** Summary shown on return from an absence. */
export interface Sitrep {
  /** Days Held gained while away. */
  daysGained: number;
  /** Supply earned while away. */
  supplyEarned: number;
  /** Rings that ended the absence in a `down` state and need repair. */
  ringsFallen: RingId[];
  /** Number of waves resolved during the absence. */
  wavesResolved: number;
  /** Real seconds credited (may be less than elapsed if capped). */
  secondsCredited: number;
  /** True if the absence was long enough to hit the offline wave cap. */
  capped: boolean;
}
