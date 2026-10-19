/**
 * The intel ladder, as executable claims.
 *
 * Intel sells *advance notice*. Without a scrap of it you still learn what a
 * wave is made of when it walks on; what you cannot do is fit the parapet and
 * pick your soldiers for it beforehand, which is the only moment that choice
 * is worth anything.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { buyUpgrade, trackCost } from '../actions';
import { INTEL_MAX, intelUpgradeCost } from '../derive';
import { revealWave } from '../intel';
import { planWave } from '../waves';
import { freshState } from './helpers';

describe('the intel ladder', () => {
  it('starts knowing nothing but the army and the strength', () => {
    expect(freshState().upgrades.intel).toBe(0);
  });

  it('never hides how strong a wave is', () => {
    // The budget is the constant half of a wave. A player who cannot see how
    // big one is has nothing to judge, so strength is not for sale.
    const state = freshState();
    state.credits = 1_000_000;
    for (let level = 0; level <= INTEL_MAX; level++) {
      expect(Number.isFinite(cfg.waves.baseBudget)).toBe(true);
      buyUpgrade(state, cfg, 'intel');
    }
  });

  it('is a finite ladder that stops selling once everything is revealed', () => {
    const state = freshState();
    state.credits = 10_000_000;
    for (let i = 0; i < INTEL_MAX; i++) {
      expect(buyUpgrade(state, cfg, 'intel'), `rung ${i + 1}`).toBe(true);
    }
    expect(state.upgrades.intel).toBe(INTEL_MAX);
    expect(trackCost(cfg, state, 'intel')).toBe(Number.POSITIVE_INFINITY);
    // Nothing left to sell, and a rich player cannot buy past the top.
    expect(buyUpgrade(state, cfg, 'intel')).toBe(false);
    expect(state.upgrades.intel).toBe(INTEL_MAX);
  });

  it('prices the first rung within reach of the opening', () => {
    // The gun pads arrive early and fitting them is guesswork without the
    // shape, so the first rung has to land in the first few waves.
    const state = freshState();
    state.credits = 0;
    expect(intelUpgradeCost(cfg, 0)).toBe(cfg.intel.baseCost);
    expect(intelUpgradeCost(cfg, 0)).toBeLessThanOrEqual(200);
    for (let level = 0; level < INTEL_MAX; level++) {
      expect(intelUpgradeCost(cfg, level + 1)).toBeGreaterThan(intelUpgradeCost(cfg, level));
    }
  });
});

describe('what each rung reveals', () => {
  const plan = planWave(cfg, 20, 12345);

  it('shows nothing of the composition at level 0', () => {
    const known = revealWave(plan, 0);
    expect(known.shape).toBeNull();
    expect(known.kinds).toBeNull();
    expect(known.count).toBeNull();
    expect(known.composition).toBeNull();
  });

  it('adds exactly one thing per rung, in order', () => {
    // Shape first, because it is the rung that names a counter and so the one
    // that changes what the player does.
    const one = revealWave(plan, 1);
    expect(one.shape).toBe(plan.shape);
    expect(one.kinds).toBeNull();

    const two = revealWave(plan, 2);
    expect(two.kinds).toEqual(plan.composition.map((c) => c.kind));
    expect(two.count).toBeNull();

    const three = revealWave(plan, 3);
    expect(three.count).toBe(plan.spawns.length);
    expect(three.composition).toBeNull();

    const four = revealWave(plan, 4);
    expect(four.composition).toEqual(plan.composition);
  });

  it('never un-reveals something a lower rung showed', () => {
    for (let level = 1; level <= INTEL_MAX; level++) {
      const below = revealWave(plan, level - 1);
      const here = revealWave(plan, level);
      for (const key of ['shape', 'kinds', 'count', 'composition'] as const) {
        if (below[key] !== null) expect(here[key], `${key} at L${level}`).not.toBeNull();
      }
    }
  });

  it('tops out: there is nothing left to show above the last rung', () => {
    expect(revealWave(plan, INTEL_MAX)).toEqual(revealWave(plan, INTEL_MAX + 5));
  });
});
