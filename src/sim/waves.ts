/**
 * waves.ts — wave composition and spawning.
 *
 * The slice spawns infantry only. Composition (count, HP, speed, bounty) is
 * derived from config + the current day via `combat.ts`, so wave difficulty and
 * offline estimates stay in lockstep.
 */

import type { GameConfig } from './config';
import { enemyBounty, enemyHp, waveCount } from './combat';
import type { Enemy, SimState } from './types';

/**
 * Begin a new wave: set the in-progress bookkeeping. Does not spawn enemies
 * immediately — they trickle in on `spawnSpacingSec` so the battlefield reads
 * clearly. Mutates `state`.
 */
export function startWave(state: SimState, cfg: GameConfig): void {
  state.wave.index += 1;
  state.wave.inProgress = true;
  state.wave.toSpawn = waveCount(cfg, state.day + 1); // the wave we're about to fight is for the *next* day
  state.wave.spawnTimerSec = 0; // spawn the first one right away
  state.wave.timerSec = 0;
}

/** Create one infantry enemy for the current day. Mutates `state` (id counter). */
export function spawnInfantry(state: SimState, cfg: GameConfig): Enemy {
  const day = state.day + 1; // enemies belong to the wave resolving into the next day
  const hp = enemyHp(cfg, 'infantry', day);
  const enemy: Enemy = {
    id: state.nextEnemyId++,
    type: 'infantry',
    hp,
    maxHp: hp,
    radius: 1.0,
    speed: cfg.enemies.infantry.speed,
    bounty: enemyBounty(cfg, 'infantry', day),
  };
  return enemy;
}
