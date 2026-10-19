import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { startBattle, step, syncDerived } from '../engine';
import { buyUpgrade, deployUnit } from '../actions';
import { holdLineY, towerRange } from '../derive';
import { PLAYER_UNITS } from '../roster';
import { createEnemyUnit, planWave } from '../waves';
import { DT, freshState, pin, runWave } from './helpers';

/**
 * A field with no emplacements. Tower positions are rebuilt from config on
 * every sync, so a wall with no guns is a config variant — emptying
 * `state.towers` would just be undone.
 */
const noTowers = { ...cfg, field: { ...cfg.field, towerX: [] } };

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

  it('clears wave 1 by sending soldiers out, and advances the wave', () => {
    // The parapet starts empty, so wave 1 is the gate's job, not the guns'.
    const state = freshState();
    const { result } = runWave(state, { deploy: 'rifleman' });
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
    const { result } = runWave(state, { deploy: 'rifleman' });
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
    // No emplacements and nobody deployed: the militia reach the wall unopposed.
    const state = freshState(noTowers);
    const { result } = runWave(state, { deploy: null, cfg: noTowers });
    expect(result.won).toBe(false);
    expect(state.wave).toBe(1);
    expect(state.bestWave).toBe(0);
    expect(state.stats.wavesLost).toBe(1);
    expect(state.credits).toBeGreaterThan(0);
    expect(state.wall.hp).toBe(state.wall.maxHp);
  });

  it('re-fights the identical wave after a loss', () => {
    const state = freshState(noTowers);
    runWave(state, { deploy: null, cfg: noTowers });
    syncDerived(state, noTowers);
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
    // Formed up inside the towers' cover, not out in the open and not back at
    // the wall. The row offsets of the formation are the tolerance.
    const line = holdLineY(cfg);
    expect(soldier.y).toBeGreaterThan(line - 24);
    expect(soldier.y).toBeLessThan(cfg.field.wallTop - 8);
  });

  it('holds the line rather than running out to meet the enemy', () => {
    const state = freshState();
    startBattle(state, cfg);
    state.units = [];
    state.spawnQueue = [
      { kind: 'militia', x: cfg.field.gateX, at: 999, hpScale: 1, damageScale: 1, bountyScale: 1 },
    ];
    deployUnit(state, cfg, 'rifleman');
    const soldier = state.units.find((u) => u.team === 'player')!;
    const bait = createEnemyUnit(state, cfg, {
      kind: 'militia',
      x: cfg.field.gateX,
      at: 0,
      hpScale: 1,
      damageScale: 1,
      bountyScale: 1,
    });
    bait.y = 20;
    bait.hp = 1e9;
    pin(bait);
    state.units.push(bait);

    // Up to the push-out limit, the soldier stays inside the towers' cover.
    const ticks = Math.floor((cfg.support.pushOutSec * 0.8) / DT);
    for (let i = 0; i < ticks; i++) step(state, DT, cfg);
    expect(soldier.y).toBeGreaterThanOrEqual(holdLineY(cfg) - 1);
  });

  it('does not let the front creep up the field over a wave', () => {
    // The first version of the leash released on a timer that only reset on
    // contact, so every kill nudged the line forward and a wave ended with the
    // soldiers far from their guns.
    const state = freshState();
    state.wave = 9;
    state.credits = 5000;
    for (let i = 0; i < 3; i++) buyUpgrade(state, cfg, 'charges');
    startBattle(state, cfg);

    const fronts: number[] = [];
    for (let i = 0; i < 90 / DT && state.phase === 'battle'; i++) {
      while (deployUnit(state, cfg, 'rifleman')) {
        /* keep the line manned */
      }
      step(state, DT, cfg);
      const soldiers = state.units.filter((u) => u.team === 'player');
      if (i % 30 === 0 && soldiers.length > 0) fronts.push(Math.min(...soldiers.map((u) => u.y)));
    }

    expect(fronts.length).toBeGreaterThan(5);
    // Skip the opening, while the first soldiers are still walking out to the
    // line: that march is not creep.
    const formed = fronts.slice(Math.floor(fronts.length / 3));
    const early = formed.slice(0, Math.floor(formed.length / 2));
    const late = formed.slice(-Math.floor(formed.length / 2));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Lower y is further up the field: the late front must not be meaningfully
    // more advanced than the early one.
    expect(mean(late)).toBeGreaterThan(mean(early) - cfg.field.height * 0.05);
  });

  it('fights at the line rather than out in the open', () => {
    const state = freshState();
    state.wave = 9;
    state.credits = 5000;
    for (let i = 0; i < 3; i++) buyUpgrade(state, cfg, 'charges');
    startBattle(state, cfg);
    for (let i = 0; i < 40 / DT && state.phase === 'battle'; i++) {
      while (deployUnit(state, cfg, 'rifleman')) {
        /* keep the line manned */
      }
      step(state, DT, cfg);
    }
    const soldiers = state.units.filter((u) => u.team === 'player');
    if (soldiers.length > 0) {
      for (const soldier of soldiers) {
        const line = holdLineY(cfg);
        // Within a body's length of the post, on either side of it.
        expect(soldier.y).toBeGreaterThan(line - 40);
      }
    }
  });

  it('marches on siege parked in the strip the guns cannot reach', () => {
    // The whole point of the strip: siege stops inside it, shells the wall
    // from a spot no tower can answer, and the infantry has to go and deal
    // with it. (A straggler that is in nobody's range and shooting nothing is
    // not this case — enemies always end up in range of the wall or of a
    // soldier, which is what earns the march.)
    const state = freshState();
    state.credits = 5000;
    for (let i = 0; i < 3; i++) buyUpgrade(state, cfg, 'charges');
    startBattle(state, cfg);
    state.units = [];
    state.spawnQueue = [];
    for (let i = 0; i < 3; i++) deployUnit(state, cfg, 'rifleman');
    const siege = createEnemyUnit(state, cfg, {
      kind: 'catapult',
      x: cfg.field.gateX,
      at: 0,
      hpScale: 1,
      damageScale: 1,
      bountyScale: 1,
    });
    siege.y = cfg.field.spawnTop;
    state.units.push(siege);

    let shelledTheWall = false;
    let everInTowerReach = false;
    const towerReach = towerRange(cfg, state.upgrades.towers);
    for (let i = 0; i < 150 / DT && state.phase === 'battle'; i++) {
      step(state, DT, cfg);
      const live = state.units.find((u) => u.id === siege.id);
      if (!live) break;
      if (state.wall.hp < state.wall.maxHp) shelledTheWall = true;
      if (cfg.field.towerY - live.y <= towerReach) everInTowerReach = true;
    }

    // It got its shots off from safety...
    expect(shelledTheWall).toBe(true);
    expect(everInTowerReach).toBe(false);
    // ...and the infantry still went and killed it.
    expect(state.units.some((u) => u.id === siege.id)).toBe(false);
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
    const state = freshState(noTowers);
    const start = state.wall.hp;
    startBattle(state, noTowers);
    for (let i = 0; i < 40 * 30 && state.phase === 'battle'; i++) step(state, DT, noTowers);
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

describe('soldiers plant to shoot', () => {
  /**
   * Firing used to run while a soldier was still closing on its post, so
   * troops strolled across the field with rifles going off. Movement and
   * shooting are exclusive now: a target inside reach means stand and work.
   * Neighbours still shove each other apart, so the claim is about walking,
   * not about being perfectly motionless.
   */
  it('never walks on a tick it attacks', () => {
    const state = freshState();
    state.wave = 9;
    state.credits = 100_000;
    for (let i = 0; i < 5; i++) buyUpgrade(state, cfg, 'wall');
    for (let i = 0; i < 6; i++) buyUpgrade(state, cfg, 'towers');
    for (let i = 0; i < 4; i++) buyUpgrade(state, cfg, 'charges');
    startBattle(state, cfg);

    const stride = PLAYER_UNITS.rifleman.speed * DT;
    let attacks = 0;
    let walkedWhileFiring = 0;
    for (let i = 0; i < 90 / DT && state.phase === 'battle'; i++) {
      while (deployUnit(state, cfg, 'rifleman')) continue;
      const before = new Map(
        state.units
          .filter((u) => u.team === 'player')
          .map((u) => [u.id, { x: u.x, y: u.y, cooldown: u.cooldown }]),
      );
      step(state, DT, cfg);
      for (const unit of state.units) {
        if (unit.team !== 'player') continue;
        const was = before.get(unit.id);
        // Cooldown jumping up is this unit attacking on this tick.
        if (!was || unit.cooldown <= was.cooldown) continue;
        attacks += 1;
        const moved = Math.hypot(unit.x - was.x, unit.y - was.y);
        if (moved > stride * 0.5) walkedWhileFiring += 1;
      }
    }

    expect(attacks).toBeGreaterThan(20);
    expect(walkedWhileFiring).toBe(0);
  });
});
