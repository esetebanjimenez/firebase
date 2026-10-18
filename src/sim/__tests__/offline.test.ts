import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { incomePerSec } from '../derive';
import { applyOfflineProgress } from '../offline';
import { step } from '../engine';
import { DT, freshState } from './helpers';

describe('offline progress', () => {
  it('pays nothing for no time away', () => {
    const state = freshState();
    const report = applyOfflineProgress(state, cfg, 0);
    expect(report.creditsEarned).toBe(0);
    expect(state.credits).toBe(0);
  });

  it('pays the garrison rate for the time away', () => {
    const state = freshState();
    state.bestWave = 10;
    const hour = 3600_000;
    const report = applyOfflineProgress(state, cfg, hour);
    expect(report.creditsEarned).toBeCloseTo(incomePerSec(cfg, 10) * 3600, 4);
    expect(state.credits).toBeCloseTo(report.creditsEarned, 4);
    expect(report.capped).toBe(false);
  });

  it('pays more the further the run has got', () => {
    const early = freshState();
    const late = freshState();
    late.bestWave = 25;
    const hour = 3600_000;
    expect(applyOfflineProgress(late, cfg, hour).creditsEarned).toBeGreaterThan(
      applyOfflineProgress(early, cfg, hour).creditsEarned,
    );
  });

  it('caps a long absence and says so', () => {
    const state = freshState();
    state.bestWave = 5;
    const week = 7 * 24 * 3600_000;
    const report = applyOfflineProgress(state, cfg, week);
    expect(report.capped).toBe(true);
    expect(report.secondsCredited).toBe(cfg.idle.maxOfflineSec);
    expect(report.secondsAway).toBeGreaterThan(report.secondsCredited);
  });

  it('matches what the same time would have earned live', () => {
    const offline = freshState();
    offline.bestWave = 8;
    applyOfflineProgress(offline, cfg, 60_000);

    const live = freshState();
    live.bestWave = 8;
    for (let i = 0; i < 60 / DT; i++) step(live, DT, cfg);

    expect(live.credits).toBeCloseTo(offline.credits, 2);
  });
});
