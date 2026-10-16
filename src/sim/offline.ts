/**
 * offline.ts — offline progress for "The Line".
 *
 * Reuses the live engine directly: it credits `floor(timeAway / waveInterval)`
 * waves (capped) and fast-forwards them by running `step()` headlessly at a
 * coarse fixed timestep, auto-launching each wave. Because it's the same engine,
 * live play and offline can't diverge in their rules. The player is away, so
 * nobody repairs — a wall worn down offline simply stalls Days until it
 * regenerates, exactly as the live rules say.
 */

import type { GameConfig } from './config';
import { step } from './engine';
import { sendNextWave } from './actions';
import type { SimState, Sitrep } from './types';

function resetToIdle(state: SimState, cfg: GameConfig): void {
  state.enemies = [];
  state.wave.inProgress = false;
  state.wave.toSpawn = 0;
  state.wave.spawnTimerSec = 0;
  state.wave.timerSec = cfg.wave.intervalSec;
  state.fireSupport.cooldownRemaining = 0;
}

export function applyOfflineProgress(state: SimState, cfg: GameConfig, elapsedMs: number): Sitrep {
  const empty: Sitrep = {
    daysGained: 0,
    supplyEarned: 0,
    wavesResolved: 0,
    wallDown: state.barrier.hp <= 0,
    secondsCredited: 0,
    capped: false,
  };
  if (elapsedMs <= 0) return empty;

  const elapsedSec = elapsedMs / 1000;
  const wavesAway = Math.floor(elapsedSec / cfg.wave.intervalSec);
  if (wavesAway <= 0) return empty;

  const capped = wavesAway > cfg.offline.maxWaves;
  const toResolve = Math.min(wavesAway, cfg.offline.maxWaves);
  const startDay = state.day;
  const startSupply = state.supply;
  const dt = cfg.offline.stepSec;

  for (let i = 0; i < toResolve; i++) {
    sendNextWave(state);
    step(state, dt, cfg); // launches the wave
    let guard = cfg.offline.maxStepsPerWave;
    while (state.wave.inProgress && guard-- > 0) step(state, dt, cfg);
  }

  const wallDown = state.barrier.hp <= 0;
  resetToIdle(state, cfg);

  return {
    daysGained: state.day - startDay,
    supplyEarned: state.supply - startSupply,
    wavesResolved: toResolve,
    wallDown,
    secondsCredited: toResolve * cfg.wave.intervalSec,
    capped,
  };
}
