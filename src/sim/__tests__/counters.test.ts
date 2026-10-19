/**
 * The counter triangle, as executable claims: that it is a triangle at all,
 * that the multiplier reaches real damage, and that a wave's shape is a shape
 * rather than noise with a label on it.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { counterMultiplier } from '../derive';
import { ENEMY_UNITS, PLAYER_UNITS, PLAYER_UNIT_ORDER } from '../roster';
import { randomSeed } from '../rng';
import { SHAPES, createEnemyUnit, createPlayerUnit, planWave, shapeFor } from '../waves';
import { step } from '../engine';
import { DT, freshState, pin } from './helpers';
import type { BodyClass, DamageClass, EnemyUnitId, PlayerUnitId, WaveShape } from '../types';

const DAMAGE: DamageClass[] = ['kinetic', 'explosive', 'sustained'];
const BODIES: BodyClass[] = ['armored', 'swarm', 'elusive'];

describe('the counter triangle', () => {
  it('is a cycle: every class counters one thing and is countered by one thing', () => {
    const strong = DAMAGE.map((d) => cfg.counters.matchups[d].strong);
    const weak = DAMAGE.map((d) => cfg.counters.matchups[d].weak);
    // Each body class is answered by exactly one weapon, and punishes exactly
    // one. Anything else is a hierarchy wearing a triangle's clothes.
    expect(new Set(strong).size).toBe(BODIES.length);
    expect(new Set(weak).size).toBe(BODIES.length);
    for (const d of DAMAGE) {
      expect(cfg.counters.matchups[d].strong).not.toBe(cfg.counters.matchups[d].weak);
    }
  });

  it('is worth bringing the right weapon, and costly to bring the wrong one', () => {
    for (const d of DAMAGE) {
      const m = cfg.counters.matchups[d];
      expect(counterMultiplier(cfg, d, m.strong)).toBeGreaterThan(1);
      expect(counterMultiplier(cfg, d, m.weak)).toBeLessThan(1);
      const neutral = BODIES.find((b) => b !== m.strong && b !== m.weak)!;
      expect(counterMultiplier(cfg, d, neutral)).toBe(1);
    }
  });

  it('leaves your own soldiers out of it', () => {
    // Enemies answer your line with reach and numbers, not with the triangle.
    for (const d of DAMAGE) expect(counterMultiplier(cfg, d, null)).toBe(1);
  });

  it('gives every soldier and every enemy an identity', () => {
    for (const id of PLAYER_UNIT_ORDER) {
      expect(DAMAGE, id).toContain(PLAYER_UNITS[id].damageClass);
    }
    for (const id of Object.keys(ENEMY_UNITS) as EnemyUnitId[]) {
      expect(BODIES, id).toContain(ENEMY_UNITS[id].bodyClass);
    }
  });

  it('covers every body class in every army, so the triangle always applies', () => {
    for (const faction of ['kingdom', 'arcane', 'undead'] as const) {
      const classes = new Set(
        (Object.keys(ENEMY_UNITS) as EnemyUnitId[])
          .filter((id) => ENEMY_UNITS[id].faction === faction)
          .map((id) => ENEMY_UNITS[id].bodyClass),
      );
      expect(classes.size, faction).toBe(BODIES.length);
    }
  });
});

describe('wave shapes', () => {
  it('holds off until the counters are plausibly affordable', () => {
    for (let wave = 1; wave < cfg.waves.shapeFromWave; wave++) {
      // A pure armoured column is a dice roll, not a tactical problem, while
      // the explosive answer is still hundreds of credits away.
      expect(shapeFor(cfg, wave, randomSeed()), `wave ${wave}`).toBe('mixed');
    }
  });

  it('actually biases what a wave is made of', () => {
    // Averaged over runs: a column fields more armour than a horde does, and a
    // horde more bodies of its own class. Per wave it is a tendency; across
    // runs it has to be visible or the label is a lie.
    const share: Record<WaveShape, { armored: number; swarm: number; n: number }> = {
      column: { armored: 0, swarm: 0, n: 0 },
      horde: { armored: 0, swarm: 0, n: 0 },
      skirmish: { armored: 0, swarm: 0, n: 0 },
      mixed: { armored: 0, swarm: 0, n: 0 },
    };
    for (let run = 0; run < 12; run++) {
      const seed = randomSeed();
      for (let wave = cfg.waves.shapeFromWave; wave <= 45; wave++) {
        const plan = planWave(cfg, wave, seed);
        const total = plan.classMix.armored + plan.classMix.swarm + plan.classMix.elusive;
        if (total === 0) continue;
        const bucket = share[plan.shape];
        bucket.armored += plan.classMix.armored / total;
        bucket.swarm += plan.classMix.swarm / total;
        bucket.n += 1;
      }
    }
    const armouredIn = (s: WaveShape) => share[s].armored / share[s].n;
    const swarmIn = (s: WaveShape) => share[s].swarm / share[s].n;
    expect(armouredIn('column')).toBeGreaterThan(armouredIn('horde'));
    expect(armouredIn('column')).toBeGreaterThan(armouredIn('mixed'));
    expect(swarmIn('horde')).toBeGreaterThan(swarmIn('column'));
  });

  it('names a counter for every shape', () => {
    for (const shape of Object.keys(SHAPES) as WaveShape[]) {
      expect(SHAPES[shape].label.length).toBeGreaterThan(0);
      expect(SHAPES[shape].counter.length).toBeGreaterThan(0);
    }
  });

  it('keeps written waves out of the roll', () => {
    // Wave 6 teaches a specific thing; a rolled shape would undo it.
    expect(planWave(cfg, 6, randomSeed()).shape).toBe('mixed');
  });
});

describe('the multiplier reaches real damage', () => {
  /**
   * The triangle is applied at the one function every point of damage passes
   * through, and before armour — armour is flat subtraction, so applying it
   * first would let a heavy's plating eat the bonus that is meant to beat it.
   * Measured through the live engine rather than against the lookup, so a path
   * that skipped the multiplier would still fail this.
   */
  function damageOver(kind: PlayerUnitId, against: EnemyUnitId, seconds = 20): number {
    const state = freshState();
    state.phase = 'battle';
    const soldier = createPlayerUnit(state, cfg, kind);
    const foe = createEnemyUnit(state, cfg, { at: 0, kind: against, x: soldier.x, hpScale: 1, damageScale: 1, bountyScale: 1 });
    pin(soldier);
    pin(foe);
    state.units.push(soldier, foe);

    // A target that cannot die, so this measures output rather than overkill,
    // and a soldier that cannot die, so it measures output rather than a duel.
    const pool = 1e9;
    foe.hp = pool;
    for (let i = 0; i < seconds / DT; i++) {
      soldier.hp = soldier.maxHp;
      foe.y = soldier.y - 6;
      if (foe.hp < pool / 2) foe.hp = pool;
      step(state, DT, cfg);
    }
    return pool - foe.hp;
  }

  it('hurts what a weapon counters more than what punishes it', () => {
    // Normalised against the same weapon, so only the matchup differs.
    expect(damageOver('rocketeer', 'knight')).toBeGreaterThan(damageOver('rocketeer', 'zombie'));
    expect(damageOver('gunner', 'zombie')).toBeGreaterThan(damageOver('gunner', 'archer'));
    expect(damageOver('rifleman', 'archer')).toBeGreaterThan(damageOver('rifleman', 'knight'));
  });
});

describe('shapes differ in what they field, not how hard they hit', () => {
  /**
   * A point of budget buys far more hit points as armour than as skirmishers,
   * so at a flat budget a column carried 121% of a mixed wave's threat and a
   * horde 60%. That made the shape a difficulty label rather than a tactical
   * one: a horde was a breather whatever you brought, and a column was
   * dangerous whatever you brought.
   *
   * Threat is scaled per shape rather than the budget, because the field caps
   * how many bodies a wave can hold — buying more of them moved the threat
   * from 60% to only 64%.
   */
  it('keeps every shape within reach of a mixed wave', () => {
    const totals: Record<string, { hp: number; n: number }> = {};
    for (let seed = 1; seed <= 25; seed++) {
      for (let wave = 12; wave <= 40; wave++) {
        const plan = planWave(cfg, wave, seed);
        const bucket = (totals[plan.shape] ??= { hp: 0, n: 0 });
        // Normalised by wave so different waves can be pooled.
        bucket.hp += plan.totalHp / Math.pow(1.2, wave);
        bucket.n += 1;
      }
    }
    const mixed = totals.mixed.hp / totals.mixed.n;
    for (const shape of ['column', 'horde', 'skirmish'] as WaveShape[]) {
      const relative = totals[shape].hp / totals[shape].n / mixed;
      expect(relative, `${shape} vs mixed`).toBeGreaterThan(0.8);
      expect(relative, `${shape} vs mixed`).toBeLessThan(1.25);
    }
  });
});
