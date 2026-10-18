import { describe, expect, it } from 'vitest';
import { canCast, castAbility } from '../abilities';
import { defaultConfig as cfg } from '../config';
import { buyAbility, launchWave } from '../actions';
import { abilityCooldown, abilityDamage } from '../derive';
import { step } from '../engine';
import { DT, freshState, pin } from './helpers';

function battleWith(ability: 'artillery' | 'barrage' | 'napalm', levels = 1) {
  const state = freshState();
  state.credits = 1e9;
  for (let i = 0; i < levels; i++) buyAbility(state, cfg, ability);
  launchWave(state, cfg);
  step(state, DT, cfg); // let the first group walk on
  return state;
}

describe('casting', () => {
  it('is locked until bought', () => {
    const state = freshState();
    launchWave(state, cfg);
    expect(canCast(state, 'artillery')).toBe(false);
    expect(castAbility(state, cfg, 'artillery', 90, 60)).toBe(false);
  });

  it('cannot be cast outside a battle', () => {
    const state = freshState();
    state.credits = 1e9;
    buyAbility(state, cfg, 'artillery');
    expect(canCast(state, 'artillery')).toBe(false);
  });

  it('queues a shell, starts the cooldown, and blocks a second cast', () => {
    const state = battleWith('artillery');
    expect(castAbility(state, cfg, 'artillery', 90, 60)).toBe(true);
    expect(state.hazards).toHaveLength(1);
    expect(state.hazards[0].kind).toBe('strike');
    expect(state.abilities.artillery.cooldown).toBeCloseTo(abilityCooldown(cfg, 'artillery', 1), 6);
    expect(castAbility(state, cfg, 'artillery', 90, 60)).toBe(false);
  });

  it('keeps the aim point on the field and off the wall', () => {
    const state = battleWith('artillery');
    castAbility(state, cfg, 'artillery', -500, 5000);
    const h = state.hazards[0];
    expect(h.x).toBeGreaterThan(0);
    expect(h.x).toBeLessThan(cfg.field.width);
    expect(h.y).toBeLessThan(cfg.field.wallTop);
  });

  it('damages enemies only after the shell lands', () => {
    const state = battleWith('artillery');
    const enemy = state.units.find((u) => u.team === 'enemy')!;
    enemy.hp = 10000;
    pin(enemy);
    castAbility(state, cfg, 'artillery', enemy.x, enemy.y);
    step(state, DT, cfg);
    expect(enemy.hp).toBe(10000);
    for (let i = 0; i < Math.ceil(cfg.abilities.artillery.delaySec / DT) + 2; i++) step(state, DT, cfg);
    expect(enemy.hp).toBeLessThan(10000);
    expect(state.hazards).toHaveLength(0);
  });

  it('spreads a barrage over several shells', () => {
    const state = battleWith('barrage');
    castAbility(state, cfg, 'barrage', 90, 60);
    expect(state.hazards).toHaveLength(cfg.abilities.barrage.shells);
    const delays = state.hazards.map((h) => h.delay);
    expect(Math.max(...delays)).toBeGreaterThan(Math.min(...delays));
  });

  it('burns over time with napalm and then burns out', () => {
    const state = battleWith('napalm');
    const enemy = state.units.find((u) => u.team === 'enemy')!;
    enemy.hp = 1e6;
    pin(enemy);
    castAbility(state, cfg, 'napalm', enemy.x, enemy.y);
    const ticks = Math.ceil((cfg.abilities.napalm.delaySec + 1) / DT);
    for (let i = 0; i < ticks; i++) step(state, DT, cfg);
    const afterOneSecond = enemy.hp;
    expect(1e6 - afterOneSecond).toBeGreaterThan(abilityDamage(cfg, 'napalm', 1) * 0.5);
    for (let i = 0; i < Math.ceil(cfg.abilities.napalm.burnSec / DT) + 4; i++) step(state, DT, cfg);
    expect(state.hazards).toHaveLength(0);
  });

  it('never damages your own soldiers', () => {
    const state = battleWith('artillery');
    // A lone soldier in an empty corner, so nothing but the shell can touch him.
    const soldier = { ...state.units[0], id: 9999, team: 'player' as const, hp: 500, maxHp: 500, x: 24, y: 150 };
    state.units = [soldier];
    pin(soldier);
    castAbility(state, cfg, 'artillery', soldier.x, soldier.y);
    for (let i = 0; i < Math.ceil(cfg.abilities.artillery.delaySec / DT) + 2; i++) step(state, DT, cfg);
    expect(soldier.hp).toBe(500);
  });

  it('recovers to ready after its cooldown', () => {
    const state = battleWith('artillery');
    castAbility(state, cfg, 'artillery', 90, 60);
    const cd = abilityCooldown(cfg, 'artillery', 1);
    for (let i = 0; i < Math.ceil(cd / DT) + 2; i++) step(state, DT, cfg);
    expect(state.abilities.artillery.cooldown).toBe(0);
  });
});
