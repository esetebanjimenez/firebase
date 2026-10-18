import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { MAX_RANK, RANK_COLOR_COUNT, RANK_GEAR_STEPS, rankOfLevel, rankOfScale } from '../ranks';
import { waveHpScale } from '../derive';
import { launchWave, deployUnit, upgradeUnit } from '../actions';
import { step } from '../engine';
import { DT, freshState } from './helpers';

describe('the rank ladder', () => {
  it('gives every one of the first fifty levels its own look', () => {
    const seen = new Set<string>();
    for (let level = 1; level <= MAX_RANK; level++) {
      const rank = rankOfLevel(level);
      seen.add(`${rank.gear}:${rank.color}`);
    }
    expect(seen.size).toBe(MAX_RANK);
    expect(MAX_RANK).toBe(RANK_COLOR_COUNT * RANK_GEAR_STEPS);
  });

  it('cycles colour within a gear step, then earns gear and resets the colour', () => {
    expect(rankOfLevel(1)).toMatchObject({ gear: 0, color: 0 });
    expect(rankOfLevel(RANK_COLOR_COUNT)).toMatchObject({ gear: 0, color: RANK_COLOR_COUNT - 1 });
    // The next level is a new piece of kit, back at the first colour.
    expect(rankOfLevel(RANK_COLOR_COUNT + 1)).toMatchObject({ gear: 1, color: 0 });
  });

  it('clamps rather than running off the end of the ladder', () => {
    expect(rankOfLevel(0)).toMatchObject({ gear: 0, color: 0 });
    expect(rankOfLevel(9999).index).toBe(MAX_RANK - 1);
  });

  it('reads enemy strength off how far a kind has scaled', () => {
    expect(rankOfScale(1).index).toBe(0);
    const early = rankOfScale(waveHpScale(cfg, 5));
    const mid = rankOfScale(waveHpScale(cfg, 20));
    const late = rankOfScale(waveHpScale(cfg, 40));
    expect(mid.index).toBeGreaterThan(early.index);
    expect(late.index).toBeGreaterThan(mid.index);
  });

  it('never hands out a rank the gear ladder cannot draw', () => {
    for (const wave of [1, 10, 30, 60, 120, 400]) {
      const rank = rankOfScale(waveHpScale(cfg, wave));
      expect(rank.gear).toBeLessThan(RANK_GEAR_STEPS);
      expect(rank.color).toBeLessThan(RANK_COLOR_COUNT);
    }
  });
});

describe('units wear their rank', () => {
  it('puts a levelled soldier on the field in its kindʼs rank', () => {
    const state = freshState();
    state.credits = 1e9;
    for (let i = 0; i < 12; i++) upgradeUnit(state, cfg, 'rifleman');
    launchWave(state, cfg);
    deployUnit(state, cfg, 'rifleman');
    const soldier = state.units.find((u) => u.team === 'player')!;
    expect(soldier.rank).toEqual(rankOfLevel(state.unitLevels.rifleman));
    expect(soldier.rank.gear).toBe(1);
  });

  it('gives enemies of a late wave a higher rank than wave one', () => {
    const early = freshState();
    launchWave(early, cfg);
    step(early, DT, cfg);
    const firstWave = early.units.find((u) => u.team === 'enemy')!;

    const late = freshState();
    late.wave = 30;
    launchWave(late, cfg);
    step(late, DT, cfg);
    const lateWave = late.units.find((u) => u.team === 'enemy')!;

    expect(lateWave.rank.index).toBeGreaterThan(firstWave.rank.index);
  });
});
