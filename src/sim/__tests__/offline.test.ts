import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../config';
import { defaultConfig } from '../config';
import { createInitialState } from '../state';
import { applyOfflineProgress } from '../offline';

const cfg = defaultConfig;
const ms = (waves: number) => waves * cfg.wave.intervalSec * 1000;

describe('offline progress', () => {
  it('credits nothing for a trivially short absence', () => {
    const s = createInitialState(cfg);
    const sit = applyOfflineProgress(s, cfg, 500);
    expect(sit.wavesResolved).toBe(0);
    expect(sit.daysGained).toBe(0);
    expect(s.day).toBe(0);
  });

  it('a strong line holds: Days and Supply advance, wall stays up', () => {
    const s = createInitialState(cfg);
    s.firepowerLevel = 20; // overwhelming firepower
    s.barrier.level = 10;
    s.barrier.maxHp = 1000;
    s.barrier.hp = 1000;

    const sit = applyOfflineProgress(s, cfg, ms(10));
    expect(sit.wavesResolved).toBe(10);
    expect(sit.daysGained).toBe(10);
    expect(s.day).toBe(10);
    expect(sit.supplyEarned).toBeGreaterThan(0);
    expect(sit.wallDown).toBe(false);
  });

  it('an under-defended line stalls (fewer Days) but never loses Supply', () => {
    const s = createInitialState(cfg); // starter firepower
    const sit = applyOfflineProgress(s, cfg, ms(40));
    expect(sit.daysGained).toBeLessThan(40);
    expect(sit.supplyEarned).toBeGreaterThanOrEqual(0); // repair-only: no penalty
    expect(s.day).toBeGreaterThanOrEqual(0);
  });

  it('respects the offline wave cap', () => {
    const small: GameConfig = { ...cfg, offline: { ...cfg.offline, maxWaves: 5 } };
    const s = createInitialState(small);
    s.firepowerLevel = 30;
    const sit = applyOfflineProgress(s, small, ms(1000));
    expect(sit.wavesResolved).toBe(5);
    expect(sit.capped).toBe(true);
  });

  it('leaves the base idle and ready afterwards', () => {
    const s = createInitialState(cfg);
    s.firepowerLevel = 20;
    applyOfflineProgress(s, cfg, ms(5));
    expect(s.enemies).toHaveLength(0);
    expect(s.wave.inProgress).toBe(false);
    expect(s.wave.timerSec).toBe(cfg.wave.intervalSec);
    expect(s.fireSupport.cooldownRemaining).toBe(0);
  });

  it('shares formulas with live play: a stronger line out-holds a weaker one', () => {
    const weak = createInitialState(cfg);
    const strong = createInitialState(cfg);
    strong.firepowerLevel = 12;

    const w = applyOfflineProgress(weak, cfg, ms(20));
    const st = applyOfflineProgress(strong, cfg, ms(20));
    expect(st.daysGained).toBeGreaterThan(w.daysGained);
  });
});
