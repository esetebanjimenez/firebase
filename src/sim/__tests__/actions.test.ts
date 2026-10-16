import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { createInitialState } from '../state';
import {
  barrierRepairCost,
  canUseFireSupport,
  repairBarrier,
  sendNextWave,
  upgradeBarrier,
  upgradeFireSupport,
  upgradeFirepower,
  useFireSupport,
} from '../actions';
import { spawnInfantry } from '../waves';

describe('actions — upgrades', () => {
  it('upgradeFirepower deducts supply and raises the level', () => {
    const s = createInitialState(cfg);
    s.supply = 100;
    const before = s.supply;
    expect(upgradeFirepower(s, cfg)).toBe(true);
    expect(s.firepowerLevel).toBe(2);
    expect(s.supply).toBeLessThan(before);
  });

  it('upgradeFirepower fails without enough supply', () => {
    const s = createInitialState(cfg);
    s.supply = 0;
    expect(upgradeFirepower(s, cfg)).toBe(false);
    expect(s.firepowerLevel).toBe(1);
  });

  it('upgradeBarrier raises max HP and current HP', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    const maxBefore = s.barrier.maxHp;
    const hpBefore = s.barrier.hp;
    expect(upgradeBarrier(s, cfg)).toBe(true);
    expect(s.barrier.maxHp).toBeGreaterThan(maxBefore);
    expect(s.barrier.hp).toBeGreaterThan(hpBefore);
  });

  it('upgradeFireSupport unlocks it from level 0', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    expect(s.fireSupport.level).toBe(0);
    expect(canUseFireSupport(s)).toBe(false);
    expect(upgradeFireSupport(s, cfg)).toBe(true);
    expect(s.fireSupport.level).toBe(1);
    expect(canUseFireSupport(s)).toBe(true); // cooldown starts at 0
  });
});

describe('actions — repair', () => {
  it('repairs a damaged wall to full and costs supply', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    s.barrier.hp = 10;
    const cost = barrierRepairCost(cfg, s);
    expect(cost).toBeGreaterThan(0);
    expect(repairBarrier(s, cfg)).toBe(true);
    expect(s.barrier.hp).toBe(s.barrier.maxHp);
    expect(s.supply).toBe(1000 - cost);
  });

  it('does nothing when the wall is already full', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    expect(repairBarrier(s, cfg)).toBe(false);
    expect(s.supply).toBe(1000);
  });
});

describe('actions — fire support', () => {
  it('is inert while locked or on cooldown, and strikes enemies near the wall', () => {
    const s = createInitialState(cfg);
    expect(useFireSupport(s, cfg)).toEqual([]); // locked

    s.supply = 1000;
    upgradeFireSupport(s, cfg); // level 1
    // two enemies close to the wall, one far away
    const near1 = spawnInfantry(s, cfg);
    near1.pos = 0.1;
    near1.hp = 1;
    const near2 = spawnInfantry(s, cfg);
    near2.pos = 0.2;
    near2.hp = 1;
    const far = spawnInfantry(s, cfg);
    far.pos = 0.95;
    far.hp = 1;
    s.enemies = [near1, near2, far];

    const events = useFireSupport(s, cfg);
    expect(events.some((e) => e.type === 'fireSupport')).toBe(true);
    expect(events.filter((e) => e.type === 'kill')).toHaveLength(2); // only the two near the wall
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].id).toBe(far.id);
    expect(s.fireSupport.cooldownRemaining).toBeGreaterThan(0);

    // on cooldown now
    expect(useFireSupport(s, cfg)).toEqual([]);
  });
});

describe('actions — sendNextWave', () => {
  it('only launches when idle', () => {
    const s = createInitialState(cfg);
    expect(sendNextWave(s)).toBe(true);
    s.wave.inProgress = true;
    expect(sendNextWave(s)).toBe(false);
  });
});
