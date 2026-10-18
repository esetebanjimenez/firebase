/**
 * offline.ts — the idle half of "idle incremental".
 *
 * Waves are player-launched, so time away does not fight them for you: it pays
 * the garrison. Credits accrue at the same rate they do while the tab is open
 * (incomePerSec, scaled by the furthest wave cleared), capped by
 * `idle.maxOfflineSec` so leaving for a week isn't a win button.
 */

import type { GameConfig } from './config';
import { incomePerSec } from './derive';
import type { IdleReport, SimState } from './types';

export function applyOfflineProgress(state: SimState, cfg: GameConfig, elapsedMs: number): IdleReport {
  const secondsAway = Math.max(0, elapsedMs / 1000);
  const secondsCredited = Math.min(secondsAway, cfg.idle.maxOfflineSec);
  const creditsEarned = incomePerSec(cfg, state.bestWave) * secondsCredited;

  state.credits += creditsEarned;
  state.stats.totalCreditsEarned += creditsEarned;

  return {
    creditsEarned,
    secondsCredited,
    secondsAway,
    capped: secondsAway > cfg.idle.maxOfflineSec,
  };
}
