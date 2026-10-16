import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import {
  barrierCost,
  barrierMaxHp,
  enemyAttackDps,
  enemyBounty,
  enemyHp,
  fireSupportCooldown,
  fireSupportCost,
  fireSupportDamage,
  firepowerCost,
  firepowerDps,
  repairCost,
  waveCount,
} from '../combat';

describe('combat formulas', () => {
  it('firepower DPS scales with level (0 = none)', () => {
    expect(firepowerDps(cfg, 0)).toBe(0);
    expect(firepowerDps(cfg, 1)).toBe(cfg.firepower.baseDps);
    expect(firepowerDps(cfg, 2)).toBe(cfg.firepower.baseDps + cfg.firepower.dpsPerLevel);
  });

  it('firepower cost grows geometrically', () => {
    expect(firepowerCost(cfg, 1)).toBe(cfg.firepower.baseCost);
    expect(firepowerCost(cfg, 2)).toBeGreaterThan(firepowerCost(cfg, 1));
  });

  it('barrier max HP scales with level', () => {
    expect(barrierMaxHp(cfg, 1)).toBe(cfg.barrier.baseMaxHp);
    expect(barrierMaxHp(cfg, 2)).toBe(cfg.barrier.baseMaxHp + cfg.barrier.maxHpPerLevel);
    expect(barrierCost(cfg, 2)).toBeGreaterThan(barrierCost(cfg, 1));
  });

  it('repair cost is zero at full and floored at the minimum otherwise', () => {
    expect(repairCost(cfg, 100, 100)).toBe(0);
    expect(repairCost(cfg, 99, 100)).toBe(cfg.barrier.minRepairCost); // tiny gap -> min
    expect(repairCost(cfg, 0, 1000)).toBeGreaterThan(repairCost(cfg, 500, 1000));
  });

  it('enemy stats scale with day (day 1 = base)', () => {
    expect(enemyHp(cfg, 'infantry', 1)).toBe(cfg.enemies.infantry.baseHp);
    expect(enemyHp(cfg, 'infantry', 5)).toBeGreaterThan(enemyHp(cfg, 'infantry', 1));
    expect(enemyBounty(cfg, 'infantry', 1)).toBe(cfg.enemies.infantry.baseBounty);
    expect(enemyAttackDps(cfg, 'infantry', 1)).toBe(cfg.enemies.infantry.attackDps);
    expect(enemyAttackDps(cfg, 'infantry', 3)).toBeGreaterThan(enemyAttackDps(cfg, 'infantry', 1));
  });

  it('wave count scales and is capped', () => {
    expect(waveCount(cfg, 1)).toBe(cfg.wave.baseCount);
    expect(waveCount(cfg, 100000)).toBe(cfg.wave.maxCount);
  });

  it('fire support: locked at level 0, stronger and faster with levels', () => {
    expect(fireSupportDamage(cfg, 0)).toBe(0);
    expect(fireSupportDamage(cfg, 2)).toBeGreaterThan(fireSupportDamage(cfg, 1));
    expect(fireSupportCooldown(cfg, 2)).toBeLessThan(fireSupportCooldown(cfg, 1));
    expect(fireSupportCooldown(cfg, 999)).toBeGreaterThanOrEqual(cfg.fireSupport.minCooldownSec);
    expect(fireSupportCost(cfg, 1)).toBeGreaterThan(fireSupportCost(cfg, 0));
  });
});
