/**
 * state.ts — construct a fresh simulation state from config.
 */

import type { GameConfig } from './config';
import { RING_ORDER } from './config';
import { seedState } from './rng';
import type { RingId, RingState, SimState } from './types';

/** Build a brand-new run from the given config (defaults to `cfg.seed`). */
export function createInitialState(cfg: GameConfig, seed: number = cfg.seed): SimState {
  const rings = {} as Record<RingId, RingState>;
  for (const id of RING_ORDER) {
    const rc = cfg.rings[id];
    rings[id] = {
      id,
      level: rc.startLevel,
      // A ring that starts built is active; an unbuilt ring (level 0) is inert
      // (not "down" — there is nothing breached yet, it simply isn't firing).
      status: rc.startLevel > 0 ? 'active' : 'down',
    };
  }

  return {
    version: cfg.version,
    seed,
    rngState: seedState(seed),
    nextEnemyId: 1,
    day: 0,
    supply: 0,
    rings,
    enemies: [],
    wave: {
      index: 0,
      timerSec: cfg.wave.intervalSec,
      inProgress: false,
      toSpawn: 0,
      spawnTimerSec: 0,
    },
    daysHeldPaused: false,
    restoreTimerSec: 0,
    stats: { totalKills: 0, totalSupplyEarned: 0, bestDay: 0 },
  };
}
