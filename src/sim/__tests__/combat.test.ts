import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import {
  enemyBounty,
  enemyHp,
  ringDps,
  upgradeCost,
  waveCount,
} from '../combat';

describe('combat formulas', () => {
  it('ringDps is 0 for an unbuilt ring and scales with level', () => {
    expect(ringDps(cfg, 'middle', 0)).toBe(0);
    const l1 = ringDps(cfg, 'middle', 1);
    const l2 = ringDps(cfg, 'middle', 2);
    expect(l1).toBe(cfg.rings.middle.baseDps);
    expect(l2).toBe(cfg.rings.middle.baseDps + cfg.rings.middle.dpsPerLevel);
    expect(l2).toBeGreaterThan(l1);
  });

  it('ringDps applies the effectiveness multiplier', () => {
    const custom = {
      ...cfg,
      effectiveness: { ...cfg.effectiveness, middle: { infantry: 0.5 } },
    };
    expect(ringDps(custom, 'middle', 1, 'infantry')).toBe(cfg.rings.middle.baseDps * 0.5);
  });

  it('upgradeCost grows geometrically', () => {
    const c0 = upgradeCost(cfg, 'middle', 0);
    const c1 = upgradeCost(cfg, 'middle', 1);
    const c2 = upgradeCost(cfg, 'middle', 2);
    expect(c0).toBe(cfg.rings.middle.baseCost);
    expect(c1).toBeGreaterThan(c0);
    expect(c2).toBeGreaterThan(c1);
    expect(c1).toBe(Math.round(cfg.rings.middle.baseCost * cfg.rings.middle.costGrowth));
  });

  it('the pre-built outer ring still costs supply to upgrade (not free)', () => {
    // Regression: baseCost must anchor the curve even though level 0→1 is never charged.
    expect(upgradeCost(cfg, 'outer', 1)).toBeGreaterThan(0);
    expect(upgradeCost(cfg, 'outer', 2)).toBeGreaterThan(upgradeCost(cfg, 'outer', 1));
  });

  it('enemy HP and bounty scale with day (day 1 = base)', () => {
    expect(enemyHp(cfg, 'infantry', 1)).toBe(cfg.enemies.infantry.baseHp);
    expect(enemyHp(cfg, 'infantry', 2)).toBe(cfg.enemies.infantry.baseHp + cfg.enemies.infantry.hpPerDay);
    expect(enemyBounty(cfg, 'infantry', 1)).toBe(cfg.enemies.infantry.baseBounty);
    expect(enemyHp(cfg, 'infantry', 10)).toBeGreaterThan(enemyHp(cfg, 'infantry', 1));
  });

  it('wave count scales with day and respects the cap', () => {
    expect(waveCount(cfg, 1)).toBe(cfg.wave.baseCount);
    expect(waveCount(cfg, 50)).toBeLessThanOrEqual(cfg.wave.maxCount);
    expect(waveCount(cfg, 100000)).toBe(cfg.wave.maxCount);
  });

  it('design tuning: the first trench is affordable within ~1-2 waves', () => {
    // Day-1 wave fully killed yields baseCount * baseBounty supply.
    const firstWaveSupply = cfg.wave.baseCount * cfg.enemies.infantry.baseBounty;
    const trenchCost = upgradeCost(cfg, 'middle', 0);
    expect(trenchCost).toBeLessThanOrEqual(firstWaveSupply * 2);
  });
});
