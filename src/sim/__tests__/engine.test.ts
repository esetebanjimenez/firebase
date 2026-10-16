import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../config';
import { defaultConfig } from '../config';
import { createInitialState } from '../state';
import { step } from '../engine';
import { sendNextWave } from '../actions';
import type { SimEvent, SimState } from '../types';

const DT = 1 / 30;

function run(state: SimState, seconds: number, cfg: GameConfig): SimEvent[] {
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) events.push(...step(state, DT, cfg));
  return events;
}
function runUntil(state: SimState, type: SimEvent['type'], cfg: GameConfig, maxSeconds = 30): SimEvent[] {
  const events: SimEvent[] = [];
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    const got = step(state, DT, cfg);
    events.push(...got);
    if (got.some((e) => e.type === type)) break;
  }
  return events;
}

describe('engine — start of run', () => {
  it('starts with soldiers, a full wall, and fire support locked', () => {
    const s = createInitialState(defaultConfig);
    expect(s.firepowerLevel).toBe(1);
    expect(s.barrier.hp).toBe(s.barrier.maxHp);
    expect(s.barrier.hp).toBeGreaterThan(0);
    expect(s.fireSupport.level).toBe(0);
    expect(s.day).toBe(0);
  });
});

describe('engine — holding the line', () => {
  it('clears early waves into Days Held and Supply with the wall intact', () => {
    const s = createInitialState(defaultConfig);
    sendNextWave(s);
    const events = run(s, 30, defaultConfig);
    expect(s.day).toBeGreaterThanOrEqual(1);
    expect(s.supply).toBeGreaterThan(0);
    expect(s.stats.totalKills).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'waveResolved' && e.counted)).toBe(true);
    expect(s.barrier.hp).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'wallBroken')).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const a = createInitialState(defaultConfig, 123);
    const b = createInitialState(defaultConfig, 123);
    sendNextWave(a);
    sendNextWave(b);
    run(a, 45, defaultConfig);
    run(b, 45, defaultConfig);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('"send next wave" skips the idle timer', () => {
    const s = createInitialState(defaultConfig);
    expect(s.wave.inProgress).toBe(false);
    sendNextWave(s);
    step(s, DT, defaultConfig);
    expect(s.wave.inProgress).toBe(true);
    expect(s.wave.index).toBe(1);
  });
});

describe('engine — wall under pressure', () => {
  // Feeble soldiers + fast, hard-hitting enemies: the wall cannot hold.
  const weak: GameConfig = {
    ...defaultConfig,
    firepower: { ...defaultConfig.firepower, baseDps: 0.2 },
    barrier: { ...defaultConfig.barrier, baseMaxHp: 30, baseRegenPerSec: 0 },
    enemies: {
      ...defaultConfig.enemies,
      infantry: { ...defaultConfig.enemies.infantry, speed: 0.8, attackDps: 12 },
    },
  };

  it('breaks the wall and does not count that wave as a Day (no penalty)', () => {
    const s = createInitialState(weak);
    const supplyBefore = s.supply;
    sendNextWave(s);
    const events = runUntil(s, 'wallBroken', weak);
    expect(events.some((e) => e.type === 'wallBroken')).toBe(true);
    expect(s.barrier.hp).toBe(0);
    expect(s.day).toBe(0); // stalled, not advanced
    expect(s.supply).toBeGreaterThanOrEqual(supplyBefore); // repair-only: never loses supply
  });

  it('regenerates a broken wall back to standing (wallRepaired)', () => {
    const s = createInitialState(defaultConfig);
    s.barrier.hp = 0; // pretend it was just broken
    const events = run(s, 1, defaultConfig);
    expect(events.some((e) => e.type === 'wallRepaired')).toBe(true);
    expect(s.barrier.hp).toBeGreaterThan(0);
  });
});
