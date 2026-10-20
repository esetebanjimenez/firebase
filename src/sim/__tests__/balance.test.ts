/**
 * Balance tests. These guard the shape of the difficulty curve, not exact
 * numbers: that wave 1 is winnable with nothing, that progress is possible
 * without perfect play, that no wave can stall forever, and that the late game
 * does not collapse into a formality.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { openingThreatMult, towerUpgradeCost, waveBudget, waveHpScale } from '../derive';
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

  /**
   * The curve has to cost the player something. It did not: measured, a
   * scripted player cleared eighty waves at 1.00 attempts per wave — never a
   * single loss — because eleven upgrade tracks each carry their own cost
   * curve, so one wave's bounty funds eight to twenty-seven power steps while
   * the enemy gets one wave of scaling.
   *
   * This asserts the fix rather than the numbers behind it: deep into a run
   * the player must be losing waves sometimes. A future change that flattens
   * the curve again should fail here rather than quietly ship.
   */
  it('makes the player lose waves, not just walk through them', () => {
    const { attempts, state } = autoRun(40, undefined, 240);
    expect(state.bestWave).toBeGreaterThanOrEqual(40);
    expect(attempts).toBeGreaterThan(state.bestWave * 1.15);
  }, 120000);

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
  /**
   * A budget buys very different amounts of beef depending on what it is spent
   * on, so the roll used to decide a wave's difficulty as much as the curve
   * did: an armoured column came in at nearly twice a mixed force's hit points
   * on the same budget. The composition is still rolled; what it adds up to is
   * not.
   */
  it('holds a wave to the curve, whatever the dice rolled', () => {
    for (const seed of [1, 7, 23, 101]) {
      for (let wave = 8; wave <= 60; wave++) {
        const plan = planWave(cfg, wave, seed);
        if (plan.boss || plan.label) continue;
        const target =
          waveBudget(cfg, wave) *
          cfg.waves.hpPerPoint *
          cfg.waves.shapeThreat[plan.shape] *
          openingThreatMult(cfg, wave) *
          waveHpScale(cfg, wave);
        expect(plan.totalHp / target, `seed ${seed} wave ${wave}`).toBeCloseTo(1, 2);
      }
    }
  });

  /**
   * No cliffs. On the escalating price curve a level deep in a run is worth
   * several waves of income, so a wave that lands at twice its neighbour is
   * not a spike the player out-levels next wave — it is a stop.
   */
  it('never jumps by more than half again from one wave to the next', () => {
    // Against the curve, not against the raw total: a wave's shape is a
    // deliberate step up or down in threat (`shapeThreat`), so a column
    // followed by a horde is supposed to differ, and a boss wave spends less
    // of its budget on rank and file because the boss is the wave. Both are
    // design; what must not jump is where the curve itself goes.
    const onCurve = (wave: number, seed: number) => {
      const plan = planWave(cfg, wave, seed);
      if (plan.boss || plan.label) return null;
      return plan.totalHp / cfg.waves.shapeThreat[plan.shape];
    };
    for (const seed of [1, 7, 23, 101]) {
      for (let wave = 8; wave < 60; wave++) {
        const here = onCurve(wave, seed);
        const next = onCurve(wave + 1, seed);
        if (here === null || next === null) continue;
        expect(next / here, `seed ${seed} wave ${wave} to ${wave + 1}`).toBeLessThan(1.5);
      }
    }
  });

  it('grows every ten waves', () => {
    for (let wave = 1; wave + 10 <= 60; wave += 10) {
      expect(planWave(cfg, wave + 10, SEED).totalHp).toBeGreaterThan(planWave(cfg, wave, SEED).totalHp);
    }
  });

  it('pays out more as it gets harder', () => {
    expect(planWave(cfg, 30, SEED).totalBounty).toBeGreaterThan(planWave(cfg, 10, SEED).totalBounty);
  });
});
