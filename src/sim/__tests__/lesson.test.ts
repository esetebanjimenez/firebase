/**
 * The wave-6 lesson, as an executable claim: riflemen alone lose the charge,
 * the same credits spent on a Shield Bearer win it. If a later tuning pass
 * breaks either half, the lesson has stopped working and this fails.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg, type GameConfig } from '../config';
import { buyUpgrade, deployUnit, unlockUnit } from '../actions';
import { startBattle, step } from '../engine';
import { PLAYER_UNITS } from '../roster';
import { scriptedWave } from '../scripted';
import { planWave } from '../waves';
import { DT, SEED, freshState } from './helpers';
import type { PlayerUnitId, SimState } from '../types';

const LESSON_WAVE = 6;

/** A player who has reached wave 6 having spent sensibly on the basics. */
function readyForTheCharge(config: GameConfig = cfg): SimState {
  const state = freshState(config);
  state.wave = LESSON_WAVE;
  state.credits = 400;
  buyUpgrade(state, config, 'wall');
  buyUpgrade(state, config, 'towers');
  for (let i = 0; i < 2; i++) buyUpgrade(state, config, 'charges');
  return state;
}

/** Fight the wave, spending every charge on the given mix. */
function fight(state: SimState, mix: readonly PlayerUnitId[], config: GameConfig = cfg): boolean {
  startBattle(state, config);
  let next = 0;
  for (let i = 0; i < 180 / DT && state.phase === 'battle'; i++) {
    while (deployUnit(state, config, mix[next % mix.length])) next += 1;
    step(state, DT, config);
  }
  if (state.phase === 'battle') throw new Error('the lesson wave stalled');
  return state.lastResult?.won ?? false;
}

describe('wave 6, the charge', () => {
  it('is a written wave with a name and a lesson', () => {
    const plan = planWave(cfg, LESSON_WAVE, SEED);
    expect(plan.label).toBe('THE CHARGE');
    expect(plan.hint).toContain('Shield Bearer');
    expect(plan.composition.some((c) => c.kind === 'skirmisher')).toBe(true);
  });

  it('fields the same charge every time, so a loss can be studied', () => {
    expect(planWave(cfg, LESSON_WAVE, SEED).spawns).toEqual(planWave(cfg, LESSON_WAVE, SEED).spawns);
  });

  it('overruns a rifles-only defence', () => {
    expect(fight(readyForTheCharge(), ['rifleman'])).toBe(false);
  });

  it('is held by spending the same credits on a Shield Bearer', () => {
    const state = readyForTheCharge();
    expect(unlockUnit(state, cfg, 'shield')).toBe(true);
    expect(fight(state, ['shield', 'rifleman', 'rifleman'])).toBe(true);
  });

  /**
   * The lesson has twice been broken by a tuning pass elsewhere, and once it
   * survived only on the default seed — a wave that teaches on seed 1 and not
   * on seed 5 is luck, not design. So the claim is made across seeds.
   */
  it('teaches the same thing whatever the seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const config: GameConfig = { ...cfg, seed };
      expect(fight(readyForTheCharge(config), ['rifleman'], config), `seed ${seed}, rifles only`).toBe(
        false,
      );
      const withShield = readyForTheCharge(config);
      unlockUnit(withShield, config, 'shield');
      expect(
        fight(withShield, ['shield', 'rifleman', 'rifleman'], config),
        `seed ${seed}, with a shield`,
      ).toBe(true);
    }
  });

  it('puts the shield bearer in front of the riflemen it screens', () => {
    expect(PLAYER_UNITS.shield.posture).toBeLessThan(PLAYER_UNITS.rifleman.posture);
    expect(PLAYER_UNITS.rocketeer.posture).toBeGreaterThan(PLAYER_UNITS.rifleman.posture);
  });

  it('is affordable: the shield costs less than two waves of credits by then', () => {
    expect(PLAYER_UNITS.shield.unlockCost).toBeLessThanOrEqual(
      Math.round(planWave(cfg, LESSON_WAVE - 1, SEED).totalBounty * 2),
    );
  });

  it('leaves the other waves to the planner', () => {
    expect(scriptedWave(LESSON_WAVE - 1)).toBeNull();
    expect(scriptedWave(LESSON_WAVE + 1)).toBeNull();
  });
});
