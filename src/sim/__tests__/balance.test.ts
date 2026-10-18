/**
 * Balance tests. These guard the shape of the difficulty curve, not exact
 * numbers: that wave 1 is winnable with nothing, that progress is possible
 * without perfect play, that no wave can stall forever, and that the late game
 * does not collapse into a formality.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { planWave } from '../waves';
import { autoFight, autoRun, autoShop, freshState, runWave } from './helpers';

describe('the opening', () => {
  it('is winnable with the starting towers and nothing else', () => {
    const state = freshState();
    for (let wave = 1; wave <= 3; wave++) {
      const { result } = runWave(state, { deploy: null });
      expect(result.won).toBe(true);
    }
    expect(state.bestWave).toBe(3);
  });

  it('pays enough for a first upgrade inside two waves', () => {
    const state = freshState();
    runWave(state, { deploy: null });
    runWave(state, { deploy: null });
    expect(state.credits).toBeGreaterThanOrEqual(cfg.wall.baseCost);
  });

  it('cannot be beaten by ignoring the gate forever', () => {
    // Towers alone must run out of road well before the late game.
    const state = freshState();
    let cleared = 0;
    for (let i = 0; i < 25; i++) {
      autoShop(state);
      const { result } = runWave(state, { deploy: null });
      if (result.won) cleared = state.bestWave;
      else break;
    }
    expect(cleared).toBeLessThan(25);
  });
});

describe('progression', () => {
  it('reaches wave 20 with naive play', () => {
    const { state, stalledAt } = autoRun(20);
    expect(stalledAt).toBeNull();
    expect(state.bestWave).toBeGreaterThanOrEqual(20);
  }, 60000);

  it('keeps asking for more than a handful of attempts per wave', () => {
    const { attempts, state } = autoRun(20);
    expect(attempts).toBeGreaterThanOrEqual(state.bestWave);
    expect(attempts).toBeLessThan(state.bestWave * 4);
  }, 60000);

  it('still takes real time to clear a wave deep into a run', () => {
    const { state } = autoRun(30);
    autoShop(state);
    const { won, seconds } = autoFight(state);
    expect(won).toBe(true);
    // A wave that melts in a couple of seconds is not a wave any more.
    expect(seconds).toBeGreaterThan(8);
  }, 120000);
});

describe('no wave can stall', () => {
  it('resolves every early wave within a sane time', () => {
    const state = freshState();
    for (let i = 0; i < 12; i++) {
      autoShop(state);
      // autoFight throws if a wave runs past its time limit.
      autoFight(state, cfg, 300);
    }
    expect(state.bestWave).toBeGreaterThan(0);
  }, 60000);

  it('always plans at least one enemy per wave', () => {
    for (let wave = 1; wave <= 120; wave++) {
      expect(planWave(cfg, wave).spawns.length).toBeGreaterThan(0);
    }
  });
});

describe('threat curve', () => {
  it('grows every ten waves', () => {
    for (let wave = 1; wave + 10 <= 60; wave += 10) {
      expect(planWave(cfg, wave + 10).totalHp).toBeGreaterThan(planWave(cfg, wave).totalHp);
    }
  });

  it('pays out more as it gets harder', () => {
    expect(planWave(cfg, 30).totalBounty).toBeGreaterThan(planWave(cfg, 10).totalBounty);
  });
});
