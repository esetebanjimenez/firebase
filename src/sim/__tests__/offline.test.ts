import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../config';
import { defaultConfig } from '../config';
import { createInitialState } from '../state';
import { applyOfflineProgress } from '../offline';

const cfg = defaultConfig;
const ms = (waves: number) => waves * cfg.wave.intervalSec * 1000;

describe('offline progress', () => {
  it('credits zero for a trivially short absence', () => {
    const s = createInitialState(cfg);
    const sit = applyOfflineProgress(s, cfg, 500); // half a wave interval
    expect(sit.wavesResolved).toBe(0);
    expect(sit.daysGained).toBe(0);
    expect(s.day).toBe(0);
  });

  it('holds and advances Days Held + Supply for a well-defended base', () => {
    const s = createInitialState(cfg);
    // A heavily fortified outer ring solos the early waves with nothing getting
    // through, so no ring breaches.
    s.rings.outer.level = 50;

    const sit = applyOfflineProgress(s, cfg, ms(10));
    expect(sit.wavesResolved).toBe(10);
    expect(sit.daysGained).toBe(10);
    expect(s.day).toBe(10);
    expect(sit.supplyEarned).toBeGreaterThan(0);
    expect(sit.ringsFallen).toHaveLength(0);
    expect(sit.capped).toBe(false);
  });

  it('falls back (rings down) when under-defended, without ending the run', () => {
    const s = createInitialState(cfg); // only outer, level 1
    const sit = applyOfflineProgress(s, cfg, ms(30));
    // The weak outer-only base cannot hold rising waves forever → it falls back.
    expect(sit.daysGained).toBeLessThan(30);
    expect(s.day).toBeGreaterThanOrEqual(0);
    // Run never ends: at least one built ring remains active afterwards.
    const anyActive = Object.values(s.rings).some((r) => r.level > 0 && r.status === 'active');
    expect(anyActive).toBe(true);
  });

  it('respects the offline wave cap', () => {
    const small: GameConfig = { ...cfg, offline: { maxWaves: 5 } };
    const s = createInitialState(small);
    s.rings.outer.level = 50; // hold everything so capping is the only limiter
    const sit = applyOfflineProgress(s, small, ms(1000));
    expect(sit.wavesResolved).toBe(5);
    expect(sit.capped).toBe(true);
  });

  it('leaves the base in a clean "next wave incoming" state', () => {
    const s = createInitialState(cfg);
    s.rings.outer.level = 50;
    applyOfflineProgress(s, cfg, ms(5));
    expect(s.enemies).toHaveLength(0);
    expect(s.wave.inProgress).toBe(false);
    expect(s.daysHeldPaused).toBe(false);
    expect(s.wave.timerSec).toBe(cfg.wave.intervalSec);
  });

  it('uses the same formulas as live: a stronger base out-holds a weaker one', () => {
    // Both live and offline derive strength/HP/counts from combat.ts, so more
    // ring strength must mean at least as many days held offline.
    const weak = createInitialState(cfg); // outer level 1
    const strong = createInitialState(cfg);
    strong.rings.outer.level = 8;

    const weakSit = applyOfflineProgress(weak, cfg, ms(20));
    const strongSit = applyOfflineProgress(strong, cfg, ms(20));

    expect(strongSit.daysGained).toBeGreaterThan(weakSit.daysGained);
  });
});
