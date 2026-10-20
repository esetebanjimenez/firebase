/**
 * The debug export, as executable claims.
 *
 * Its whole job is to be read later, by someone who was not there — so what it
 * must not do is lose the things that cannot be reconstructed from a final
 * state: which waves cost attempts, what the player owned at the time, and
 * which tuning it was all played on.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { buildDebugReport, debugReportName } from '../debug';
import { totalUpgradeLevels } from '../derive';
import { buyUpgrade } from '../actions';
import { autoFight, freshState, shopAndWait } from './helpers';

const NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

describe('the debug export', () => {
  it('describes a fresh run without needing a wave to have been fought', () => {
    const report = buildDebugReport(freshState(), cfg, NOW);
    expect(report.run.wave).toBe(1);
    expect(report.waves).toHaveLength(0);
    expect(report.nextWave.wave).toBe(1);
    expect(report.upgrades.totalLevels).toBe(totalUpgradeLevels(freshState()));
  });

  it('survives a round trip through JSON', () => {
    const state = freshState();
    buyUpgrade(state, cfg, 'towers');
    const report = buildDebugReport(state, cfg, NOW);
    const back = JSON.parse(JSON.stringify(report));
    expect(back).toEqual(report);
    expect(back.generatedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('keeps a record of every wave fought, with its attempt number', () => {
    const state = freshState();
    for (let i = 0; i < 6; i++) {
      shopAndWait(state, cfg);
      autoFight(state, cfg);
    }
    const report = buildDebugReport(state, cfg, NOW);
    expect(report.waves.length).toBe(6);

    for (const record of report.waves) {
      expect(record.seconds).toBeGreaterThan(0);
      expect(record.threat).toBeGreaterThan(0);
      expect(record.bodies).toBeGreaterThan(0);
      expect(record.wallLeft).toBeGreaterThanOrEqual(0);
      expect(record.wallLeft).toBeLessThanOrEqual(1);
    }

    // A retried wave is the same wave with a higher attempt number, which is
    // the thing a run's shape is read from.
    const attempts = new Map<number, number>();
    for (const record of report.waves) {
      const expected = (attempts.get(record.wave) ?? 0) + 1;
      expect(record.attempt, `wave ${record.wave}`).toBe(expected);
      attempts.set(record.wave, expected);
    }
  }, 60000);

  it('prices every track so the shop can be read back', () => {
    const report = buildDebugReport(freshState(), cfg, NOW);
    for (const key of ['wall', 'towers', 'charges', 'recharge', 'intel', 'gun.mg', 'unit.rifleman']) {
      expect(report.nextCosts[key], key).toBeGreaterThan(0);
    }
  });

  it('carries the tuning it was played on, so an old report still means something', () => {
    const report = buildDebugReport(freshState(), cfg, NOW);
    expect(report.balance.costEscalation).toBe(cfg.economy.costEscalation);
    expect(report.balance.configVersion).toBe(cfg.version);
    expect(report.balance.hpPerPoint).toBe(cfg.waves.hpPerPoint);
  });

  it('names the file after the run', () => {
    const state = freshState();
    state.wave = 17;
    expect(debugReportName(state, NOW)).toBe('iron-line-w17-20260102-0304.json');
  });
});
