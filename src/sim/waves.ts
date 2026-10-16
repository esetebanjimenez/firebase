/**
 * waves.ts — wave composition and spawning for "The Line".
 */

import type { GameConfig } from './config';
import { enemyAttackDps, enemyBounty, enemyHp, waveCount } from './combat';
import { nextFloat } from './rng';
import type { Enemy, SimState } from './types';

/** Begin a new wave (the one that resolves into the next Day). Mutates state. */
export function startWave(state: SimState, cfg: GameConfig): void {
  state.wave.index += 1;
  state.wave.inProgress = true;
  state.wave.toSpawn = waveCount(cfg, state.day + 1);
  state.wave.spawnTimerSec = 0;
  state.wave.timerSec = 0;
}

/** Create one infantry enemy at the far right of the lane. Mutates state (id counter). */
export function spawnInfantry(state: SimState, cfg: GameConfig): Enemy {
  const day = state.day + 1;
  const hp = enemyHp(cfg, 'infantry', day);
  const ec = cfg.enemies.infantry;
  // Deterministic per-enemy firing distance (seeded RNG → reproducible runs).
  const roll = nextFloat(state.rngState);
  state.rngState = roll.state;
  const range = Math.max(0, ec.attackRange + (roll.value - 0.5) * 2 * ec.attackRangeJitter);
  return {
    id: state.nextEnemyId++,
    type: 'infantry',
    hp,
    maxHp: hp,
    pos: 1,
    speed: ec.speed,
    bounty: enemyBounty(cfg, 'infantry', day),
    attackDps: enemyAttackDps(cfg, 'infantry', day),
    range,
    engaging: false,
  };
}
