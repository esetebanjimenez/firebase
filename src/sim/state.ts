/**
 * state.ts — construct a fresh "The Line" simulation state from config.
 */

import type { GameConfig } from './config';
import { barrierMaxHp } from './combat';
import { seedState } from './rng';
import type { SimState } from './types';

export function createInitialState(cfg: GameConfig, seed: number = cfg.seed): SimState {
  const maxHp = barrierMaxHp(cfg, cfg.barrier.startLevel);
  return {
    version: cfg.version,
    seed,
    rngState: seedState(seed),
    nextEnemyId: 1,
    day: 0,
    supply: 0,
    firepowerLevel: cfg.firepower.startLevel,
    barrier: { level: cfg.barrier.startLevel, hp: maxHp, maxHp },
    fireSupport: { level: 0, cooldownRemaining: 0 },
    enemies: [],
    wave: {
      index: 0,
      timerSec: cfg.wave.intervalSec,
      inProgress: false,
      toSpawn: 0,
      spawnTimerSec: 0,
    },
    stats: { totalKills: 0, totalSupplyEarned: 0, bestDay: 0 },
  };
}
