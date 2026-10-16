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

/** Step until an event of `type` appears (or `maxSeconds` elapses). Returns all events seen. */
function runUntil(
  state: SimState,
  type: SimEvent['type'],
  cfg: GameConfig,
  maxSeconds = 30,
): SimEvent[] {
  const events: SimEvent[] = [];
  const maxSteps = Math.round(maxSeconds / DT);
  for (let i = 0; i < maxSteps; i++) {
    const got = step(state, DT, cfg);
    events.push(...got);
    if (got.some((e) => e.type === type)) break;
  }
  return events;
}

describe('engine — start of run', () => {
  it('starts with only the outer ring live', () => {
    const s = createInitialState(defaultConfig);
    expect(s.rings.outer.status).toBe('active');
    expect(s.rings.outer.level).toBe(1);
    expect(s.rings.middle.level).toBe(0);
    expect(s.rings.inner.level).toBe(0);
    expect(s.day).toBe(0);
  });
});

describe('engine — holding waves', () => {
  it('resolves early waves into Days Held and earns Supply, outer holding alone', () => {
    const s = createInitialState(defaultConfig);
    sendNextWave(s);
    const events = run(s, 12, defaultConfig);

    expect(s.day).toBeGreaterThanOrEqual(1);
    expect(s.supply).toBeGreaterThan(0);
    expect(s.stats.totalKills).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'waveResolved')).toBe(true);
    expect(events.some((e) => e.type === 'kill')).toBe(true);
    // The outer ring alone holds the first wave or two — no full breach yet.
    expect(events.some((e) => e.type === 'fullBreach')).toBe(false);
    expect(s.rings.outer.status).toBe('active');
  });

  it('is deterministic: identical inputs produce identical state', () => {
    const a = createInitialState(defaultConfig, 123);
    const b = createInitialState(defaultConfig, 123);
    sendNextWave(a);
    sendNextWave(b);
    run(a, 50, defaultConfig);
    run(b, 50, defaultConfig);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the "Send next wave" button skips the idle timer', () => {
    const s = createInitialState(defaultConfig);
    expect(s.wave.inProgress).toBe(false);
    expect(s.wave.timerSec).toBeGreaterThan(0);
    sendNextWave(s);
    step(s, DT, defaultConfig);
    expect(s.wave.inProgress).toBe(true);
    expect(s.wave.index).toBe(1);
  });
});

describe('engine — breaches (soft failure)', () => {
  // A config where the outer ring is far too weak to stop a fast, tanky enemy.
  const weak: GameConfig = {
    ...defaultConfig,
    rings: {
      ...defaultConfig.rings,
      outer: { ...defaultConfig.rings.outer, baseDps: 0.01 },
    },
    enemies: {
      ...defaultConfig.enemies,
      infantry: { ...defaultConfig.enemies.infantry, baseHp: 50, speed: 0.6 },
    },
  };

  it('breaches the crossed ring but keeps its upgrade level, then full-breaches at the core', () => {
    const s = createInitialState(weak);
    s.supply = 100;
    s.rings.outer.level = 3; // invested level must survive the breach
    sendNextWave(s);
    const events = run(s, 10, weak);

    const breach = events.find((e) => e.type === 'breach');
    expect(breach).toBeDefined();
    expect(breach && breach.type === 'breach' && breach.ring).toBe('outer');

    // Upgrade level is never erased by a breach.
    expect(s.rings.outer.level).toBe(3);

    const full = events.find((e) => e.type === 'fullBreach');
    expect(full).toBeDefined();
    // Lost 20% of the 100 supply it held at the moment of the breach.
    expect(full && full.type === 'fullBreach' && full.supplyLost).toBe(20);
    expect(s.supply).toBe(80);
  });

  it('pauses Days Held on a full breach, then self-restores the innermost built ring', () => {
    const s = createInitialState(weak);
    s.supply = 100;
    sendNextWave(s);
    runUntil(s, 'fullBreach', weak);

    // Immediately after the full breach: overrun, frozen, field cleared.
    expect(s.daysHeldPaused).toBe(true);
    expect(s.enemies.length).toBe(0);

    const dayAtBreach = s.day;
    const restoreEvents = runUntil(s, 'ringRestored', weak);

    expect(restoreEvents.some((e) => e.type === 'ringRestored')).toBe(true);
    expect(s.daysHeldPaused).toBe(false);
    expect(s.rings.outer.status).toBe('active'); // outer is the only built ring here
    expect(s.day).toBe(dayAtBreach); // the overrun wave held no day
  });
});
