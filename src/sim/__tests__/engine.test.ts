import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { startBattle, step, syncDerived } from '../engine';
import { buyUpgrade, deployUnit } from '../actions';
import { planWave } from '../waves';
import { DT, freshState, pin, runWave } from './helpers';

describe('battle lifecycle', () => {
  it('queues the planned wave when launched, and refuses to launch twice', () => {
    const state = freshState();
    expect(startBattle(state, cfg)).toBe(true);
    expect(state.phase).toBe('battle');
    expect(state.spawnQueue.length).toBe(planWave(cfg, 1).spawns.length);
    expect(startBattle(state, cfg)).toBe(false);
  });

  it('walks enemies on from the top over the spawn window', () => {
    const state = freshState();
    startBattle(state, cfg);
    step(state, DT, cfg);
    const first = state.units.filter((u) => u.team === 'enemy');
    expect(first.length).toBeGreaterThan(0);
    for (const u of first) expect(u.y).toBeLessThanOrEqual(cfg.field.spawnBottom);
    for (let i = 0; i < 20 * 30; i++) step(state, DT, cfg);
    expect(state.spawnQueue.length).toBe(0);
  });

  it('clears wave 1 with towers alone and advances the wave', () => {
    const state = freshState();
    const { result } = runWave(state, { deploy: null });
    expect(result.won).toBe(true);
    expect(result.wave).toBe(1);
    expect(state.wave).toBe(2);
    expect(state.bestWave).toBe(1);
    expect(state.phase).toBe('prep');
    expect(result.kills).toBeGreaterThan(0);
  });

  it('pays credits per kill and keeps them after the wave', () => {
    const state = freshState();
    const before = state.credits;
    const { result } = runWave(state, { deploy: null });
    expect(result.credits).toBeGreaterThan(0);
    expect(state.credits).toBeGreaterThan(before);
  });

  it('restores the wall and the charge pool between waves', () => {
    const state = freshState();
    state.wall.hp = 10;
    runWave(state, { deploy: 'rifleman' });
    expect(state.wall.hp).toBe(state.wall.maxHp);
    expect(state.charges.current).toBe(state.charges.max);
    expect(state.units).toHaveLength(0);
    expect(state.projectiles).toHaveLength(0);
  });

  it('loses the wave when the wall falls, without losing the wave number or credits', () => {
    const state = freshState();
    // Strip the towers and deploy nobody: the militia get to the wall unopposed.
    state.towers = [];
    const { result } = runWave(state, { deploy: null });
    expect(result.won).toBe(false);
    expect(state.wave).toBe(1);
    expect(state.bestWave).toBe(0);
    expect(state.stats.wavesLost).toBe(1);
    expect(state.credits).toBeGreaterThan(0);
    expect(state.wall.hp).toBe(state.wall.maxHp);
  });

  it('re-fights the identical wave after a loss', () => {
    const state = freshState();
    state.towers = [];
    runWave(state, { deploy: null });
    syncDerived(state, cfg);
    expect(state.wave).toBe(1);
    expect(planWave(cfg, state.wave).composition).toEqual(planWave(cfg, 1).composition);
  });
});

describe('unit behaviour', () => {
  it('sends soldiers out of the gate to meet the enemy', () => {
    const state = freshState();
    startBattle(state, cfg);
    deployUnit(state, cfg, 'rifleman');
    const soldier = state.units.find((u) => u.team === 'player')!;
    const startY = soldier.y;
    expect(startY).toBeLessThan(cfg.field.wallTop);
    expect(Math.abs(soldier.x - cfg.field.gateX)).toBeLessThanOrEqual(cfg.field.gateHalfWidth);
    for (let i = 0; i < 90; i++) step(state, DT, cfg);
    expect(state.units.find((u) => u.id === soldier.id)?.y ?? 0).toBeLessThan(startY);
  });

  it('parks soldiers at the muster point when no enemy is on the field', () => {
    const state = freshState();
    startBattle(state, cfg);
    // Nothing on the field, but reinforcements still owed, so the wave runs on.
    state.units = [];
    state.spawnQueue = [
      { kind: 'militia', x: cfg.field.gateX, at: 999, hpScale: 1, damageScale: 1, bountyScale: 1 },
    ];
    deployUnit(state, cfg, 'rifleman');
    const soldier = state.units.find((u) => u.team === 'player')!;
    for (let i = 0; i < 20 * 30; i++) step(state, DT, cfg);
    expect(state.phase).toBe('battle');
    // The muster is a loose block, so allow for the formation's row offsets.
    expect(Math.abs(soldier.y - cfg.field.musterY)).toBeLessThan(cfg.field.height * 0.1);
  });

  it('keeps enemies on the attacking side of the wall', () => {
    const state = freshState();
    state.wall.maxHp = 100000;
    state.wall.hp = 100000;
    startBattle(state, cfg);
    for (let i = 0; i < 60 * 30; i++) {
      step(state, DT, cfg);
      if (state.phase !== 'battle') break;
      for (const u of state.units) {
        expect(u.y).toBeLessThanOrEqual(cfg.field.wallTop);
        expect(u.x).toBeGreaterThanOrEqual(0);
        expect(u.x).toBeLessThanOrEqual(cfg.field.width);
      }
    }
  });

  it('lets enemies chew through an undefended wall', () => {
    const state = freshState();
    state.towers = [];
    const start = state.wall.hp;
    startBattle(state, cfg);
    for (let i = 0; i < 40 * 30 && state.phase === 'battle'; i++) step(state, DT, cfg);
    expect(state.lastResult?.won).toBe(false);
    expect(start).toBeGreaterThan(0);
  });

  it('spreads crowds out instead of stacking them in one spot', () => {
    const state = freshState();
    startBattle(state, cfg);
    for (let i = 0; i < 10 * 30; i++) step(state, DT, cfg);
    const enemies = state.units.filter((u) => u.team === 'enemy');
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const d = Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y);
        expect(d).toBeGreaterThan(1);
      }
    }
  });
});

describe('towers', () => {
  it('only shoots what is inside their range', () => {
    const state = freshState();
    startBattle(state, cfg);
    state.spawnQueue = [];
    // One enemy parked at the very top, far out of tower reach.
    step(state, DT, cfg);
    const enemy = state.units.find((u) => u.team === 'enemy');
    if (enemy) {
      enemy.y = 2;
      pin(enemy);
      state.projectiles = [];
      for (let i = 0; i < 60; i++) step(state, DT, cfg);
      expect(state.projectiles.filter((p) => p.team === 'player')).toHaveLength(0);
    }
  });

  it('kills faster once upgraded', () => {
    const slow = freshState();
    const fast = freshState();
    for (let i = 0; i < 6; i++) {
      fast.credits += 100000;
      buyUpgrade(fast, cfg, 'towers');
    }
    const a = runWave(slow, { deploy: null });
    const b = runWave(fast, { deploy: null });
    expect(b.seconds).toBeLessThan(a.seconds);
  });
});

describe('determinism', () => {
  it('produces the same battle from the same inputs', () => {
    const a = runWave(freshState(), { deploy: 'rifleman' });
    const b = runWave(freshState(), { deploy: 'rifleman' });
    expect(b.result).toEqual(a.result);
  });
});
