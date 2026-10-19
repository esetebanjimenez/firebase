import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { towerPositions } from '../derive';
import { buyAbility, buyUpgrade, deployUnit, launchWave, unlockUnit } from '../actions';
import { deserialize, serialize, toSaveState } from '../persistence';
import { step, syncDerived } from '../engine';
import { DT, freshState } from './helpers';

function progressedState() {
  const state = freshState();
  state.credits = 50000;
  buyUpgrade(state, cfg, 'wall');
  buyUpgrade(state, cfg, 'towers');
  unlockUnit(state, cfg, 'shield');
  buyAbility(state, cfg, 'artillery');
  state.wave = 7;
  state.bestWave = 6;
  return state;
}

describe('round trip', () => {
  it('restores credits, levels, unlocks, abilities and the wave', () => {
    const state = progressedState();
    const env = deserialize(serialize(state, 1700000000000), cfg);
    expect(env).not.toBeNull();
    const loaded = env!.state;
    expect(loaded.credits).toBe(state.credits);
    expect(loaded.wave).toBe(7);
    expect(loaded.bestWave).toBe(6);
    expect(loaded.upgrades).toEqual(state.upgrades);
    expect(loaded.unlocked.shield).toBe(true);
    expect(loaded.abilities.artillery.level).toBe(1);
    expect(env!.savedAt).toBe(1700000000000);
  });

  it('keeps the RNG stream, so a restored run plays out the same', () => {
    const state = progressedState();
    const loaded = deserialize(serialize(state, 1), cfg)!.state;
    expect(loaded.rngState).toBe(state.rngState);
    expect(loaded.nextId).toBe(state.nextId);
    expect(loaded.seed).toBe(state.seed);
  });
});

describe('saving mid-battle', () => {
  it('stores the between-waves state instead of a frozen battlefield', () => {
    const state = progressedState();
    launchWave(state, cfg);
    deployUnit(state, cfg, 'rifleman');
    for (let i = 0; i < 60; i++) step(state, DT, cfg);
    state.wall.hp = 1;

    const saved = toSaveState(state);
    expect(saved.phase).toBe('prep');
    expect(saved.units).toHaveLength(0);
    expect(saved.projectiles).toHaveLength(0);
    expect(saved.hazards).toHaveLength(0);
    expect(saved.spawnQueue).toHaveLength(0);
    expect(saved.wall.hp).toBe(saved.wall.maxHp);
    expect(saved.charges.current).toBe(saved.charges.max);
    // The wave in progress is not credited, so you re-fight it.
    expect(saved.wave).toBe(state.wave);
  });

  it('does not mutate the live state it was given', () => {
    const state = progressedState();
    launchWave(state, cfg);
    deployUnit(state, cfg, 'rifleman');
    const unitCount = state.units.length;
    toSaveState(state);
    expect(state.phase).toBe('battle');
    expect(state.units).toHaveLength(unitCount);
  });
});

describe('rejecting bad saves', () => {
  it('rejects junk, wrong versions and missing fields', () => {
    expect(deserialize('not json', cfg)).toBeNull();
    expect(deserialize('null', cfg)).toBeNull();
    expect(deserialize('{}', cfg)).toBeNull();
    expect(deserialize(JSON.stringify({ savedAt: 1, state: {} }), cfg)).toBeNull();

    const state = progressedState();
    const stale = JSON.parse(serialize(state, 1));
    stale.state.version = cfg.version + 1;
    expect(deserialize(JSON.stringify(stale), cfg)).toBeNull();

    const broken = JSON.parse(serialize(state, 1));
    delete broken.state.upgrades;
    expect(deserialize(JSON.stringify(broken), cfg)).toBeNull();

    const noTimestamp = JSON.parse(serialize(state, 1));
    delete noTimestamp.savedAt;
    expect(deserialize(JSON.stringify(noTimestamp), cfg)).toBeNull();
  });
});

describe('saves written against different field geometry', () => {
  it('rebuilds tower emplacements from config instead of trusting the save', () => {
    const state = progressedState();
    // Coordinates from the old 192x240 field, as a save from before the
    // resolution change would carry.
    state.towers = [20, 56, 136, 172].map((x, i) => ({ id: i + 1, x, y: 211, cooldown: 0 }));

    const loaded = deserialize(serialize(state, 1), cfg)!.state;
    syncDerived(loaded, cfg);

    expect(loaded.towers.map((t) => t.x)).toEqual(towerPositions(cfg, loaded.upgrades.towers));
    for (const tower of loaded.towers) {
      expect(tower.y).toBe(cfg.field.towerY);
      // On the wall, not out in the field where the enemy walks.
      expect(tower.y).toBeGreaterThan(cfg.field.height * 0.6);
    }
  });

  it('keeps towers on the wall through a battle started from such a save', () => {
    const state = progressedState();
    state.towers = [20, 56, 136, 172].map((x, i) => ({ id: i + 1, x, y: 211, cooldown: 0 }));
    launchWave(state, cfg);
    for (let i = 0; i < 30; i++) step(state, DT, cfg);
    for (const tower of state.towers) {
      expect(tower.y).toBe(cfg.field.towerY);
    }
  });
});
