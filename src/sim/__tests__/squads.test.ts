/**
 * Squads, as executable claims.
 *
 * A squad is not an entity — it is a number its bodies carry. That buys a lot
 * (nothing to keep in step, nothing to clean up when a body dies) as long as
 * the three things that make four bodies read as one unit actually hold: they
 * arrive together, they fight the same enemy, and the wave that pays for them
 * pays a squad's price rather than a body's.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { deployUnit } from '../actions';
import { startBattle, step } from '../engine';
import { ENEMY_UNITS, PLAYER_UNITS, PLAYER_UNIT_ORDER } from '../roster';
import { createEnemyUnit, planWave } from '../waves';
import { DT, SEED, freshState, pin } from './helpers';
import type { SimState, Unit } from '../types';

function mine(state: SimState): Unit[] {
  return state.units.filter((u) => u.team === 'player' && u.hp > 0);
}

/** Drop an enemy on the field without waiting for its scheduled spawn. */
function placeEnemy(state: SimState, kind: keyof typeof ENEMY_UNITS, x: number, y: number): Unit {
  const unit = createEnemyUnit(state, cfg, {
    kind,
    x,
    at: 0,
    hpScale: 1,
    damageScale: 1,
    bountyScale: 1,
  });
  (unit as { y: number }).y = y;
  pin(unit);
  state.units.push(unit);
  return unit;
}

describe('a squad', () => {
  it('comes through the gate four strong for one charge', () => {
    const state = freshState();
    startBattle(state, cfg);
    const before = state.charges.current;
    expect(deployUnit(state, cfg, 'rifleman')).toBe(true);
    expect(state.charges.current).toBe(before - 1);
    expect(mine(state)).toHaveLength(PLAYER_UNITS.rifleman.squad ?? 1);
  });

  it('gives every one of your kinds the same four, so a charge is a charge', () => {
    for (const id of PLAYER_UNIT_ORDER) {
      expect(PLAYER_UNITS[id].squad, id).toBe(4);
    }
  });

  it('shares one id, and stands abreast rather than stacked', () => {
    const state = freshState();
    startBattle(state, cfg);
    deployUnit(state, cfg, 'rifleman');
    const squad = mine(state);
    const ids = new Set(squad.map((u) => u.squadId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeGreaterThan(0);
    expect(new Set(squad.map((u) => u.squadSlot)).size).toBe(squad.length);
    expect(new Set(squad.map((u) => Math.round(u.x))).size).toBe(squad.length);
  });

  it('fights what the squad is fighting, not what each body is nearest to', () => {
    const state = freshState();
    startBattle(state, cfg);
    state.spawnQueue = [];
    deployUnit(state, cfg, 'rifleman');
    // Two targets, far enough apart that the nearest one differs across the
    // squad's own frontage — which is exactly when four bodies choosing for
    // themselves walk off in different directions.
    const left = placeEnemy(state, 'militia', cfg.field.sideMargin + 10, 200);
    const right = placeEnemy(state, 'militia', cfg.field.width - cfg.field.sideMargin - 10, 200);
    for (const u of mine(state)) pin(u);
    for (let i = 0; i < 6; i++) step(state, DT, cfg);

    const targets = new Set(mine(state).map((u) => u.targetId));
    expect(targets.size).toBe(1);
    expect([left.id, right.id]).toContain([...targets][0]);
  });

  it('carries on when the body that was choosing dies', () => {
    const state = freshState();
    startBattle(state, cfg);
    state.spawnQueue = [];
    deployUnit(state, cfg, 'rifleman');
    placeEnemy(state, 'militia', cfg.field.gateX, 200);
    for (const u of mine(state)) pin(u);
    for (let i = 0; i < 6; i++) step(state, DT, cfg);

    const squad = mine(state).sort((a, b) => a.id - b.id);
    const leader = squad[0];
    leader.hp = 0;
    for (let i = 0; i < 6; i++) step(state, DT, cfg);

    const left = mine(state);
    expect(left.length).toBeGreaterThan(0);
    const targets = new Set(left.map((u) => u.targetId));
    expect(targets.size).toBe(1);
    expect([...targets][0]).not.toBeNull();
  });
});

describe('a wave of squads', () => {
  it('pays a squad price, so the field holds the same bodies it always did', () => {
    for (const wave of [12, 24, 36, 48]) {
      const plan = planWave(cfg, wave, SEED);
      expect(plan.spawns.length).toBeLessThanOrEqual(cfg.waves.maxUnits + 1);
    }
  });

  it('counts bodies in what it tells the player, not line items', () => {
    const plan = planWave(cfg, 20, SEED);
    const counted = plan.composition.reduce((n, c) => n + c.count, 0);
    expect(counted).toBe(plan.spawns.length);
  });

  it('walks a squad on together', () => {
    const plan = planWave(cfg, 20, SEED);
    const bySquad = new Map<number, number[]>();
    for (const spawn of plan.spawns) {
      if (!spawn.squadId) continue;
      const times = bySquad.get(spawn.squadId) ?? [];
      times.push(spawn.at);
      bySquad.set(spawn.squadId, times);
    }
    expect(bySquad.size).toBeGreaterThan(0);
    for (const [id, times] of bySquad) {
      expect(Math.max(...times) - Math.min(...times), `squad ${id}`).toBe(0);
    }
  });

  it('leaves alone the things that are one thing', () => {
    for (const kind of ['catapult', 'obelisk', 'bonethrower', 'necromancer'] as const) {
      expect(ENEMY_UNITS[kind].squad, kind).toBeUndefined();
    }
    for (const kind of ['champion', 'archmage', 'boneGiant'] as const) {
      expect(ENEMY_UNITS[kind].squad, kind).toBeUndefined();
    }
  });
});
