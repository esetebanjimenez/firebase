import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { createInitialState } from '../state';
import { deserialize, serialize } from '../persistence';
import { step } from '../engine';
import { sendNextWave } from '../actions';

describe('persistence', () => {
  it('round-trips state exactly', () => {
    const s = createInitialState(cfg, 77);
    s.supply = 42;
    s.firepowerLevel = 3;
    sendNextWave(s);
    for (let i = 0; i < 300; i++) step(s, 1 / 30, cfg);

    const raw = serialize(s, 1_700_000_000_000);
    const loaded = deserialize(raw, cfg);
    expect(loaded).not.toBeNull();
    expect(loaded!.savedAt).toBe(1_700_000_000_000);
    expect(loaded!.state).toEqual(s);
  });

  it('rejects corrupt or wrong-shaped input', () => {
    expect(deserialize('not json', cfg)).toBeNull();
    expect(deserialize('{}', cfg)).toBeNull();
    expect(deserialize(JSON.stringify({ savedAt: 1 }), cfg)).toBeNull();
    expect(deserialize(JSON.stringify({ savedAt: 1, state: { foo: 1 } }), cfg)).toBeNull();
  });

  it('rejects a save from an older model version (forces a fresh run)', () => {
    const s = createInitialState(cfg);
    (s as { version: number }).version = 1; // the old 3-ring model
    const raw = serialize(s, Date.now());
    expect(deserialize(raw, cfg)).toBeNull();
  });
});
