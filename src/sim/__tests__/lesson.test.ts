/**
 * The wave-6 lesson, as an executable claim: riflemen alone lose the charge,
 * the same credits spent on a Shield Bearer win it. If a later tuning pass
 * breaks either half, the lesson has stopped working and this fails.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { buyUpgrade, deployUnit, unlockUnit } from '../actions';
import { startBattle, step } from '../engine';
import { PLAYER_UNITS } from '../roster';
import { scriptedWave } from '../scripted';
import { planWave } from '../waves';
import { DT, freshState } from './helpers';
import type { PlayerUnitId, SimState } from '../types';

const LESSON_WAVE = 6;

/** A player who has reached wave 6 having spent sensibly on the basics. */
function readyForTheCharge(): SimState {
  const state = freshState();
  state.wave = LESSON_WAVE;
  state.credits = 400;
  buyUpgrade(state, cfg, 'wall');
  buyUpgrade(state, cfg, 'towers');
  for (let i = 0; i < 2; i++) buyUpgrade(state, cfg, 'charges');
  return state;
}

/** Fight the wave, spending every charge on the given mix. */
function fight(state: SimState, mix: readonly PlayerUnitId[]): boolean {
  startBattle(state, cfg);
  let next = 0;
  for (let i = 0; i < 180 / DT && state.phase === 'battle'; i++) {
    while (deployUnit(state, cfg, mix[next % mix.length])) next += 1;
    step(state, DT, cfg);
  }
  if (state.phase === 'battle') throw new Error('the lesson wave stalled');
  return state.lastResult?.won ?? false;
}

describe('wave 6, the charge', () => {
  it('is a written wave with a name and a lesson', () => {
    const plan = planWave(cfg, LESSON_WAVE);
    expect(plan.label).toBe('THE CHARGE');
    expect(plan.hint).toContain('Shield Bearer');
    expect(plan.composition.some((c) => c.kind === 'skirmisher')).toBe(true);
  });

  it('fields the same charge every time, so a loss can be studied', () => {
    expect(planWave(cfg, LESSON_WAVE).spawns).toEqual(planWave(cfg, LESSON_WAVE).spawns);
  });

  it('overruns a rifles-only defence', () => {
    expect(fight(readyForTheCharge(), ['rifleman'])).toBe(false);
  });

  it('is held by spending the same credits on a Shield Bearer', () => {
    const state = readyForTheCharge();
    expect(unlockUnit(state, cfg, 'shield')).toBe(true);
    expect(fight(state, ['shield', 'rifleman', 'rifleman'])).toBe(true);
  });

  it('puts the shield bearer in front of the riflemen it screens', () => {
    expect(PLAYER_UNITS.shield.posture).toBeLessThan(PLAYER_UNITS.rifleman.posture);
    expect(PLAYER_UNITS.rocketeer.posture).toBeGreaterThan(PLAYER_UNITS.rifleman.posture);
  });

  it('is affordable: the shield costs less than two waves of credits by then', () => {
    expect(PLAYER_UNITS.shield.unlockCost).toBeLessThanOrEqual(
      Math.round(planWave(cfg, LESSON_WAVE - 1).totalBounty * 2),
    );
  });

  it('leaves the other waves to the planner', () => {
    expect(scriptedWave(LESSON_WAVE - 1)).toBeNull();
    expect(scriptedWave(LESSON_WAVE + 1)).toBeNull();
  });
});
