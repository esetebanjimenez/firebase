/**
 * The economy, as executable claims.
 *
 * The question here is not whether the player can afford things, but whether
 * affording them gets harder. A straight geometric price curve against income
 * that compounds per wave buys a constant number of levels a wave — and
 * because a wave's takings grow with its bounty *and* its head-count while a
 * level's price grows with neither, it bought an accelerating number: measured
 * on the old curve, one level a wave at wave 3, nineteen a wave at wave 20,
 * 411 levels owned by wave 30. At that rate a purchase is not a decision.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { levelCost } from '../derive';
import { PLAYER_UNIT_ORDER, TOWER_WEAPON_ORDER } from '../roster';
import { autoFight, freshState, shopAndWait } from './helpers';
import type { SimState } from '../types';

/** Every level the player owns, across every track. */
function totalLevels(s: SimState): number {
  const u = s.upgrades;
  return (
    u.wall +
    u.towers +
    u.charges +
    u.recharge +
    u.intel +
    TOWER_WEAPON_ORDER.reduce((n, w) => n + u.weapons[w], 0) +
    PLAYER_UNIT_ORDER.reduce((n, id) => n + s.unitLevels[id], 0) +
    (['artillery', 'barrage', 'napalm'] as const).reduce((n, a) => n + s.abilities[a].level, 0)
  );
}

describe('the price curve', () => {
  it('charges more for each step up than for the step before it', () => {
    const price = (level: number) => levelCost(100, 1.13, cfg.economy.costEscalation, level);
    let previous = 0;
    for (let level = 2; level <= 30; level++) {
      const ratio = price(level) / price(level - 1);
      expect(ratio, `level ${level}`).toBeGreaterThan(previous);
      previous = ratio;
    }
  });

  it('leaves the opening alone and bites with depth', () => {
    const esc = cfg.economy.costEscalation;
    const flat = (level: number) => levelCost(100, 1.13, 1, level);
    // The first two levels are priced exactly as a flat curve would price
    // them: the opening teaches, and it cannot do that through a price wall.
    expect(levelCost(100, 1.13, esc, 1)).toBe(flat(1));
    expect(levelCost(100, 1.13, esc, 2)).toBe(flat(2));
    // By level 20 it is charging several times what the flat curve would.
    expect(levelCost(100, 1.13, esc, 20) / flat(20)).toBeGreaterThan(5);
  });
});

describe('a run', () => {
  /**
   * The headline claim. Played straight through, a run's purchasing has to
   * *slow*: the levels bought over the third ten waves must come to fewer than
   * those bought over the second ten. The first ten are not in the comparison —
   * a run starts with nothing to earn from, so the opening is the one stretch
   * where buying speeds up.
   */
  it('buys fewer levels per wave the further it gets', () => {
    const state = freshState();
    const owned = new Map<number, number>();
    let attempts = 0;
    while (state.bestWave < 30 && attempts < 300) {
      if (!owned.has(state.wave)) owned.set(state.wave, totalLevels(state));
      shopAndWait(state, cfg);
      autoFight(state, cfg);
      attempts += 1;
    }
    expect(state.bestWave).toBeGreaterThanOrEqual(30);
    const at = (wave: number) => owned.get(wave) ?? 0;
    const second = at(21) - at(11);
    const third = totalLevels(state) - at(21);
    expect(second).toBeGreaterThan(0);
    expect(third).toBeLessThan(second);
  }, 180000);

  it('does not hand over a level a wave on every track', () => {
    // Fifteen tracks, thirty waves: the old curve bought 411 levels by here,
    // which is more than one level on every track every wave.
    const { state } = (() => {
      const s = freshState();
      let attempts = 0;
      while (s.bestWave < 30 && attempts < 300) {
        shopAndWait(s, cfg);
        autoFight(s, cfg);
        attempts += 1;
      }
      return { state: s };
    })();
    expect(totalLevels(state)).toBeLessThan(300);
  }, 180000);
});
