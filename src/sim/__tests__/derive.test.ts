import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import {
  abilityCooldown,
  abilityCost,
  abilityDamage,
  applyArmor,
  chargeMax,
  levelCost,
  incomePerSec,
  playerUnitStats,
  rechargeSec,
  towerCount,
  towerDps,
  towerPositions,
  towerUpgradeCost,
  unitUpgradeCost,
  towerPeriod,
  wallMaxHp,
  waveBudget,
  waveHpScale,
} from '../derive';
import { PLAYER_UNITS } from '../roster';
import { createInitialState } from '../state';
import { freshState } from './helpers';

describe('cost curves', () => {
  it('charges the base price for the first level and grows geometrically', () => {
    expect(levelCost(100, 1.5, 1, 1)).toBe(100);
    expect(levelCost(100, 1.5, 1, 2)).toBe(150);
    expect(levelCost(100, 1.5, 1, 3)).toBe(225);
  });

  it('grows the growth itself when levels escalate', () => {
    // Step L to L+1 costs growth * escalation^(L-1) times the step before it.
    expect(levelCost(100, 1.5, 1.2, 1)).toBe(100);
    expect(levelCost(100, 1.5, 1.2, 2)).toBe(150);
    expect(levelCost(100, 1.5, 1.2, 3)).toBe(270);
    expect(levelCost(100, 1.5, 1.2, 4)).toBe(583);
    // And the ratio between consecutive levels keeps climbing.
    const ratio = (l: number) => levelCost(100, 1.5, 1.2, l + 1) / levelCost(100, 1.5, 1.2, l);
    expect(ratio(5)).toBeGreaterThan(ratio(2));
  });

  it('prices an ability unlock at its base cost and each level above it', () => {
    expect(abilityCost(cfg, 'artillery', 0)).toBe(cfg.abilities.artillery.unlockCost);
    expect(abilityCost(cfg, 'artillery', 1)).toBeGreaterThan(abilityCost(cfg, 'artillery', 0));
  });
});

describe('derived stats', () => {
  it('scales wall HP, tower output and charges with level', () => {
    expect(wallMaxHp(cfg, 1)).toBe(cfg.wall.baseMaxHp);
    expect(wallMaxHp(cfg, 3)).toBe(Math.round(cfg.wall.baseMaxHp * cfg.wall.maxHpGrowth ** 2));
    expect(wallMaxHp(cfg, 8)).toBeGreaterThan(wallMaxHp(cfg, 7));
    expect(towerDps(cfg, 5)).toBeGreaterThan(towerDps(cfg, 1));
    expect(chargeMax(cfg, 4)).toBe(cfg.charges.baseMax + 3 * cfg.charges.maxPerLevel);
  });

  it('floors tower fire period and charge recharge at their minimums', () => {
    expect(towerPeriod(cfg, 999)).toBe(cfg.towers.minPeriodSec);
    expect(rechargeSec(cfg, 999)).toBe(cfg.charges.minRechargeSec);
  });

  it('floors ability cooldowns and raises damage per level', () => {
    expect(abilityCooldown(cfg, 'napalm', 999)).toBe(cfg.abilities.napalm.minCooldownSec);
    expect(abilityDamage(cfg, 'napalm', 0)).toBe(0);
    expect(abilityDamage(cfg, 'napalm', 2)).toBeGreaterThan(abilityDamage(cfg, 'napalm', 1));
  });

  it('lifts hp, damage and speed as a kind levels', () => {
    const state = createInitialState(cfg);
    const base = playerUnitStats(cfg, state.unitLevels, 'rifleman');
    const upgraded = playerUnitStats(cfg, { ...state.unitLevels, rifleman: 5 }, 'rifleman');
    expect(upgraded.hp).toBeGreaterThan(base.hp);
    expect(upgraded.damage).toBeGreaterThan(base.damage);
    expect(upgraded.speed).toBeGreaterThan(base.speed);
    expect(upgraded.dps).toBeCloseTo(upgraded.damage / 0.7, 5);
    expect(upgraded.speed).toBeLessThanOrEqual(base.speed * cfg.soldiers.maxSpeedMult + 1e-9);
  });

  it('levels each kind independently', () => {
    const state = createInitialState(cfg);
    const levels = { ...state.unitLevels, rifleman: 6, shield: 1 };
    const rifle = playerUnitStats(cfg, levels, 'rifleman');
    const shield = playerUnitStats(cfg, levels, 'shield');
    expect(rifle.level).toBe(6);
    expect(shield.level).toBe(1);
    expect(rifle.damage).toBeGreaterThan(PLAYER_UNITS.rifleman.damage);
    expect(shield.damage).toBeCloseTo(PLAYER_UNITS.shield.damage, 6);
  });

  it('prices a kindʼs next level above its last', () => {
    expect(unitUpgradeCost(cfg, 'rifleman', 1)).toBe(PLAYER_UNITS.rifleman.upgradeCost);
    expect(unitUpgradeCost(cfg, 'rifleman', 4)).toBeGreaterThan(unitUpgradeCost(cfg, 'rifleman', 3));
    // Heavier kinds cost more to improve than riflemen do.
    expect(unitUpgradeCost(cfg, 'rocketeer', 1)).toBeGreaterThan(unitUpgradeCost(cfg, 'rifleman', 1));
  });
});

describe('armor', () => {
  it('soaks flat damage but always lets a fraction through', () => {
    expect(applyArmor(cfg, 100, 20)).toBe(80);
    expect(applyArmor(cfg, 10, 999)).toBeCloseTo(10 * cfg.sim.minDamageFraction, 6);
  });
});

describe('wave scaling', () => {
  it('grows enemy HP and the wave budget with the wave number', () => {
    expect(waveHpScale(cfg, 1)).toBe(1);
    expect(waveHpScale(cfg, 10)).toBeGreaterThan(waveHpScale(cfg, 5));
    expect(waveBudget(cfg, 1)).toBe(cfg.waves.baseBudget);
    expect(waveBudget(cfg, 20)).toBeGreaterThan(waveBudget(cfg, 10));
  });

  it('caps the wave budget', () => {
    expect(waveBudget(cfg, 500)).toBe(cfg.waves.maxBudget);
  });
});

describe('idle income', () => {
  it('pays more the further you have pushed', () => {
    expect(incomePerSec(cfg, 0)).toBeCloseTo(cfg.idle.baseCreditsPerSec, 6);
    expect(incomePerSec(cfg, 10)).toBeCloseTo(cfg.idle.baseCreditsPerSec * cfg.idle.incomeGrowth ** 10, 6);
    expect(incomePerSec(cfg, 20)).toBeGreaterThan(incomePerSec(cfg, 5));
  });
});

describe('the parapet fills up', () => {
  it('starts empty, so wave 1 is the gate\'s job', () => {
    expect(towerCount(cfg, 0)).toBe(0);
    expect(towerPositions(cfg, 0)).toEqual([]);
    expect(freshState().towers).toHaveLength(0);
  });

  it('adds a gun every few levels, and never more than the wall holds', () => {
    let previous = 0;
    for (let level = 0; level <= 40; level++) {
      const count = towerCount(cfg, level);
      expect(count).toBeGreaterThanOrEqual(previous);
      expect(count - previous).toBeLessThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(cfg.field.towerX.length);
      previous = count;
    }
    expect(towerCount(cfg, 40)).toBe(cfg.field.towerX.length);
  });

  it('builds the gate pair before the flanks', () => {
    const gate = cfg.field.gateX;
    const nearest = (xs: number[]) => Math.min(...xs.map((x) => Math.abs(x - gate)));
    // The first guns up are closer to the gate than the last ones.
    expect(nearest(towerPositions(cfg, 2))).toBeLessThan(
      Math.max(...towerPositions(cfg, 99).map((x) => Math.abs(x - gate))),
    );
  });

  it('prices the first gun at the base cost, then compounds', () => {
    expect(towerUpgradeCost(cfg, 0)).toBe(cfg.towers.baseCost);
    for (let level = 0; level < 10; level++) {
      expect(towerUpgradeCost(cfg, level + 1)).toBeGreaterThan(towerUpgradeCost(cfg, level));
    }
  });
});
