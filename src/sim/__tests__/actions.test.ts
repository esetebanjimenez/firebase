import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { createInitialState } from '../state';
import {
  buyUpgrade,
  canRepair,
  canUpgrade,
  nextUpgradeCost,
  repairRing,
  sendNextWave,
} from '../actions';

describe('actions — buyUpgrade', () => {
  it('builds an unbuilt ring, brings it online, and deducts supply', () => {
    const s = createInitialState(cfg);
    s.supply = 100;
    const cost = nextUpgradeCost(cfg, s, 'middle');
    expect(buyUpgrade(s, cfg, 'middle')).toBe(true);
    expect(s.rings.middle.level).toBe(1);
    expect(s.rings.middle.status).toBe('active');
    expect(s.supply).toBe(100 - cost);
  });

  it('fails when supply is insufficient and changes nothing', () => {
    const s = createInitialState(cfg);
    s.supply = 0;
    expect(buyUpgrade(s, cfg, 'middle')).toBe(false);
    expect(s.rings.middle.level).toBe(0);
    expect(s.supply).toBe(0);
  });

  it('refuses to upgrade a breached ring (must repair first)', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    s.rings.outer.status = 'down'; // breached
    expect(canUpgrade(s, 'outer')).toBe(false);
    expect(buyUpgrade(s, cfg, 'outer')).toBe(false);
    expect(s.rings.outer.level).toBe(1);
  });
});

describe('actions — repairRing', () => {
  it('repairs a breached, built ring back to active', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    s.rings.outer.status = 'down';
    expect(canRepair(s, 'outer')).toBe(true);
    const before = s.supply;
    expect(repairRing(s, cfg, 'outer')).toBe(true);
    expect(s.rings.outer.status).toBe('active');
    expect(s.supply).toBe(before - cfg.rings.outer.repairCost);
  });

  it('does not repair an unbuilt ring or an already-active ring', () => {
    const s = createInitialState(cfg);
    s.supply = 1000;
    expect(canRepair(s, 'middle')).toBe(false); // level 0
    expect(repairRing(s, cfg, 'middle')).toBe(false);
    expect(canRepair(s, 'outer')).toBe(false); // active
    expect(repairRing(s, cfg, 'outer')).toBe(false);
  });
});

describe('actions — sendNextWave', () => {
  it('only launches when idle and not overrun', () => {
    const s = createInitialState(cfg);
    expect(sendNextWave(s)).toBe(true);
    expect(s.wave.timerSec).toBe(0);

    s.wave.inProgress = true;
    expect(sendNextWave(s)).toBe(false);

    s.wave.inProgress = false;
    s.daysHeldPaused = true;
    expect(sendNextWave(s)).toBe(false);
  });
});
