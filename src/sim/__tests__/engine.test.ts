import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { startBattle, step, syncDerived } from '../engine';
import { buyUpgrade, deployUnit } from '../actions';
import { coverEdgeY, holdLineY, towerRange } from '../derive';
import { createEnemyUnit, planWave } from '../waves';
import { DT, SEED, freshState, pin, runWave } from './helpers';
import type { SimState } from '../types';

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
    expect(state.spawnQueue.length).toBe(planWave(cfg, 1, SEED).spawns.length);
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
    expect(planWave(cfg, state.wave, SEED).composition).toEqual(planWave(cfg, 1, SEED).composition);
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
    // more advanced than the early one. The allowance is a twelfth of the
    // field rather than a twentieth because soldiers go out in squads now: the
    // pressure valve releases four bodies at a time, so the front moves in
    // squad-sized steps. What this still catches is a line that keeps walking
    // — and `fights at the line rather than out in the open`, below, is what
    // keeps it from living in the strip.
    expect(mean(late)).toBeGreaterThan(mean(early) - cfg.field.height * 0.085);
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
    // Measured over a fixed window rather than as time-to-resolve: a bare
    // parapet loses wave 1 and a built one clears it, so the two durations
    // are the lengths of two different outcomes, and the bare one can be the
    // shorter of them.
    const standing = (state: SimState) => {
      startBattle(state, cfg);
      for (let i = 0; i < 12 / DT; i++) step(state, DT, cfg);
      return state.units
        .filter((u) => u.team === 'enemy')
        .reduce((hp, u) => hp + u.hp, 0);
    };
    expect(standing(fast)).toBeLessThan(standing(slow));
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
   *
   * Displacement cannot make this claim, which two earlier versions of this
   * test got wrong: units shove each other apart, a hard shove moves a body
   * further in a tick than its own stride does, and a shove from behind even
   * carries a soldier toward what it is shooting at. So the measurement is the
   * walk cycle, which the engine advances only when a unit moves under its own
   * power. A firing soldier may be jostled; it may not take a step.
   */
  it('never takes a step on a tick it attacks', () => {
    const state = freshState();
    state.wave = 9;
    state.credits = 100_000;
    for (let i = 0; i < 5; i++) buyUpgrade(state, cfg, 'wall');
    for (let i = 0; i < 6; i++) buyUpgrade(state, cfg, 'towers');
    for (let i = 0; i < 4; i++) buyUpgrade(state, cfg, 'charges');
    startBattle(state, cfg);

    let attacks = 0;
    let steppedWhileFiring = 0;
    for (let i = 0; i < 90 / DT && state.phase === 'battle'; i++) {
      while (deployUnit(state, cfg, 'rifleman')) continue;
      const before = new Map(
        state.units
          .filter((u) => u.team === 'player')
          .map((u) => [u.id, { anim: u.anim, cooldown: u.cooldown }]),
      );
      step(state, DT, cfg);
      for (const unit of state.units) {
        if (unit.team !== 'player') continue;
        const was = before.get(unit.id);
        // Cooldown jumping up is this unit attacking on this tick.
        if (!was || unit.cooldown <= was.cooldown) continue;
        attacks += 1;
        if (unit.anim !== was.anim) steppedWhileFiring += 1;
      }
    }

    expect(attacks).toBeGreaterThan(20);
    expect(steppedWhileFiring).toBe(0);
  });
});

describe('soldiers charge what is on the field', () => {
  /**
   * The bug this pins: with the field cleared and the squad mustered, a late
   * spawn was simply *awaited*. An earlier rule only advanced on an enemy that
   * had already stopped, so soldiers stood watching one walk the length of the
   * map. From the outside they looked asleep.
   */
  it('goes to meet an enemy that spawns after the field has cleared', () => {
    const state = freshState();
    state.wave = 3;
    startBattle(state, cfg);
    const plan = planWave(cfg, 3, SEED);
    // Clear the field but keep the wave alive with a spawn far in the future,
    // so the squad musters instead of the battle resolving under us.
    state.spawnQueue = [{ ...plan.spawns[0], at: 999 }];
    state.units = state.units.filter((u) => u.team === 'player');
    while (deployUnit(state, cfg, 'rifleman')) continue;
    for (let i = 0; i < 6 / DT; i++) step(state, DT, cfg);

    const mustered = state.units.filter((u) => u.team === 'player');
    expect(mustered.length).toBeGreaterThan(0);
    const startY = Math.min(...mustered.map((u) => u.y));

    // One enemy walks on at the top, far from the wall and out of everyone's
    // reach — and crucially, not yet shooting at anything.
    const enemy = createEnemyUnit(state, cfg, { ...plan.spawns[0], at: 0, x: cfg.field.gateX });
    enemy.y = cfg.field.spawnTop;
    state.units.push(enemy);

    for (let i = 0; i < 2 / DT; i++) step(state, DT, cfg);

    const advanced = Math.min(...state.units.filter((u) => u.team === 'player').map((u) => u.y));
    // Up the field, toward it — not standing where they were.
    expect(advanced).toBeLessThan(startY - 20);
  });

  it('will not wander into the strip the guns cannot cover, unprompted', () => {
    const state = freshState();
    state.wave = 3;
    state.credits = 100_000;
    for (let i = 0; i < 6; i++) buyUpgrade(state, cfg, 'towers');
    startBattle(state, cfg);
    state.spawnQueue = [];
    state.units = state.units.filter((u) => u.team === 'player');
    while (deployUnit(state, cfg, 'rifleman')) continue;

    // An enemy parked in the strip, doing nothing: out of reach and unpinned,
    // so nothing releases the soldiers to go in after it. It is pinned back to
    // the top of the strip every tick, since its own AI would walk it down.
    const plan = planWave(cfg, 3, SEED);
    const enemy = createEnemyUnit(state, cfg, { ...plan.spawns[0], at: 0, x: cfg.field.gateX });
    enemy.y = 4;
    state.units.push(enemy);

    const edge = coverEdgeY(cfg, state.upgrades.towers);
    for (let i = 0; i < 20 / DT; i++) {
      step(state, DT, cfg);
      enemy.y = 4;
      for (const unit of state.units) {
        if (unit.team === 'player') expect(unit.y).toBeGreaterThan(edge - 2);
      }
    }
  });
});
