/**
 * Balance tests. These guard the shape of the difficulty curve, not exact
 * numbers: that wave 1 is winnable with nothing, that progress is possible
 * without perfect play, that no wave can stall forever, and that the late game
 * does not collapse into a formality.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { towerUpgradeCost } from '../derive';
import { planWave } from '../waves';
import { SEED, autoFight, autoRun, autoShop, freshState, runWave } from './helpers';

describe('the opening', () => {
  /**
   * The parapet starts empty on purpose. Four guns from wave 1 cleared the
   * early waves on their own, so the gate — the thing the whole game is about
   * — was optional exactly where it should be teaching you to use it.
   */
  it('cannot be won by standing still', () => {
    const state = freshState();
    const { result } = runWave(state, { deploy: null });
    expect(result.won).toBe(false);
    expect(state.towers).toHaveLength(0);
  });

  it('is winnable from wave 1 by sending soldiers out', () => {
    const state = freshState();
    for (let wave = 1; wave <= 3; wave++) {
      const { result } = runWave(state, { deploy: 'rifleman' });
      expect(result.won, `wave ${wave}`).toBe(true);
    }
    expect(state.bestWave).toBe(3);
  });

  it('pays enough for a first upgrade inside two waves', () => {
    const state = freshState();
    runWave(state, { deploy: 'rifleman' });
    runWave(state, { deploy: 'rifleman' });
    expect(state.credits).toBeGreaterThanOrEqual(towerUpgradeCost(cfg, 1));
  });

  it('cannot be beaten by ignoring the gate forever', () => {
    // Guns alone must run out of road well before the late game.
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
    // Losing the first attempt at a fresh wave is the curve working, not a
    // failure — the attempts-per-wave test above expects exactly that. What
    // has to stay true is that the fight itself is a fight: a wave that melts
    // in a couple of seconds is not a wave any more.
    let longest = 0;
    let cleared = false;
    for (let attempt = 0; attempt < 4 && !cleared; attempt++) {
      autoShop(state);
      const { won, seconds } = autoFight(state);
      longest = Math.max(longest, seconds);
      cleared = won;
    }
    expect(cleared).toBe(true);
    expect(longest).toBeGreaterThan(8);
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
      expect(planWave(cfg, wave, SEED).spawns.length).toBeGreaterThan(0);
    }
  });
});

describe('threat curve', () => {
  it('grows every ten waves', () => {
    for (let wave = 1; wave + 10 <= 60; wave += 10) {
      expect(planWave(cfg, wave + 10, SEED).totalHp).toBeGreaterThan(planWave(cfg, wave, SEED).totalHp);
    }
  });

  it('pays out more as it gets harder', () => {
    expect(planWave(cfg, 30, SEED).totalBounty).toBeGreaterThan(planWave(cfg, 10, SEED).totalBounty);
  });
});
