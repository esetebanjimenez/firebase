import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import {
  automationCost,
  buyAbility,
  buyUpgrade,
  canDeploy,
  deployUnit,
  launchWave,
  selectAbility,
  selectUnit,
  toggleAutomation,
  trackCost,
  unitLevelCost,
  unlockAutomation,
  unlockUnit,
  upgradeUnit,
} from '../actions';
import { chargeMax, wallMaxHp } from '../derive';
import { step } from '../engine';
import { PLAYER_UNITS } from '../roster';
import { DT, freshState } from './helpers';

describe('upgrades', () => {
  it('refuses what you cannot afford and leaves the level alone', () => {
    const state = freshState();
    state.credits = 0;
    expect(buyUpgrade(state, cfg, 'towers')).toBe(false);
    expect(state.upgrades.towers).toBe(0);
  });

  it('charges credits and raises the level', () => {
    const state = freshState();
    const cost = trackCost(cfg, state, 'towers');
    state.credits = cost;
    expect(buyUpgrade(state, cfg, 'towers')).toBe(true);
    expect(state.credits).toBe(0);
    expect(state.upgrades.towers).toBe(1);
    expect(trackCost(cfg, state, 'towers')).toBeGreaterThan(cost);
  });

  it('gives a wall upgrade its new HP straight away', () => {
    const state = freshState();
    state.credits = 10000;
    const beforeMax = state.wall.maxHp;
    state.wall.hp = beforeMax / 2;
    buyUpgrade(state, cfg, 'wall');
    const gain = wallMaxHp(cfg, 2) - wallMaxHp(cfg, 1);
    expect(state.wall.maxHp).toBe(wallMaxHp(cfg, 2));
    expect(state.wall.hp).toBeCloseTo(beforeMax / 2 + gain, 6);
  });

  it('hands over the extra charge when the pool grows', () => {
    const state = freshState();
    state.credits = 10000;
    const before = state.charges.current;
    buyUpgrade(state, cfg, 'charges');
    expect(state.charges.max).toBe(chargeMax(cfg, 2));
    expect(state.charges.current).toBe(before + cfg.charges.maxPerLevel);
  });
});

describe('unit unlocks', () => {
  it('starts with the rifleman only', () => {
    const state = freshState();
    expect(state.unlocked.rifleman).toBe(true);
    expect(state.unlocked.shield).toBe(false);
    expect(selectUnit(state, 'shield')).toBe(false);
    expect(state.selectedUnit).toBe('rifleman');
  });

  it('unlocks a kind for its price, at level 1, and selects it', () => {
    const state = freshState();
    state.credits = PLAYER_UNITS.shield.unlockCost;
    expect(unlockUnit(state, cfg, 'shield')).toBe(true);
    expect(state.unlocked.shield).toBe(true);
    expect(state.unitLevels.shield).toBe(1);
    expect(state.selectedUnit).toBe('shield');
    expect(unlockUnit(state, cfg, 'shield')).toBe(false);
  });
});

describe('levelling a soldier kind', () => {
  it('refuses a locked kind', () => {
    const state = freshState();
    state.credits = 1e6;
    expect(upgradeUnit(state, cfg, 'rocketeer')).toBe(false);
    expect(state.unitLevels.rocketeer).toBe(0);
  });

  it('charges credits and raises that kindʼs level only', () => {
    const state = freshState();
    const cost = unitLevelCost(cfg, state, 'rifleman');
    state.credits = cost;
    expect(upgradeUnit(state, cfg, 'rifleman')).toBe(true);
    expect(state.credits).toBe(0);
    expect(state.unitLevels.rifleman).toBe(2);
    expect(state.unitLevels.shield).toBe(0);
    expect(unitLevelCost(cfg, state, 'rifleman')).toBeGreaterThan(cost);
  });

  it('puts a tougher soldier on the field', () => {
    const base = freshState();
    launchWave(base, cfg);
    deployUnit(base, cfg, 'rifleman');
    const before = base.units.find((u) => u.team === 'player')!;

    const levelled = freshState();
    levelled.credits = 1e6;
    for (let i = 0; i < 5; i++) upgradeUnit(levelled, cfg, 'rifleman');
    launchWave(levelled, cfg);
    deployUnit(levelled, cfg, 'rifleman');
    const after = levelled.units.find((u) => u.team === 'player')!;

    expect(after.maxHp).toBeGreaterThan(before.maxHp);
    expect(after.damage).toBeGreaterThan(before.damage);
    expect(after.speed).toBeGreaterThan(before.speed);
  });

  it('leaves other kinds alone', () => {
    const state = freshState();
    state.credits = 1e6;
    unlockUnit(state, cfg, 'shield');
    for (let i = 0; i < 4; i++) upgradeUnit(state, cfg, 'rifleman');
    launchWave(state, cfg);
    deployUnit(state, cfg, 'shield');
    const shield = state.units.find((u) => u.team === 'player')!;
    expect(shield.maxHp).toBeCloseTo(PLAYER_UNITS.shield.hp, 6);
  });
});

describe('deployment charges', () => {
  it('only deploys during a battle', () => {
    const state = freshState();
    expect(canDeploy(state, cfg)).toBe(false);
    expect(deployUnit(state, cfg)).toBe(false);
    launchWave(state, cfg);
    expect(deployUnit(state, cfg)).toBe(true);
  });

  it('spends charges and runs the pool dry', () => {
    const state = freshState();
    launchWave(state, cfg);
    const max = state.charges.max;
    for (let i = 0; i < max; i++) expect(deployUnit(state, cfg, 'rifleman')).toBe(true);
    expect(state.charges.current).toBe(0);
    expect(deployUnit(state, cfg, 'rifleman')).toBe(false);
    expect(state.units.filter((u) => u.team === 'player')).toHaveLength(max);
  });

  it('charges heavier kinds more than one charge', () => {
    const state = freshState();
    state.credits = 100000;
    unlockUnit(state, cfg, 'gunner');
    launchWave(state, cfg);
    state.charges.current = 2;
    expect(deployUnit(state, cfg, 'gunner')).toBe(true);
    expect(state.charges.current).toBe(0);
  });

  it('recharges one charge at a time', () => {
    const state = freshState();
    launchWave(state, cfg);
    state.charges.current = 0;
    state.charges.rechargeIn = cfg.charges.baseRechargeSec;
    for (let i = 0; i < Math.ceil(cfg.charges.baseRechargeSec / DT) + 2; i++) step(state, DT, cfg);
    expect(state.charges.current).toBe(1);
  });
});

describe('abilities', () => {
  it('unlocks for the base price, then costs more per level', () => {
    const state = freshState();
    state.credits = cfg.abilities.artillery.unlockCost;
    expect(buyAbility(state, cfg, 'artillery')).toBe(true);
    expect(state.abilities.artillery.level).toBe(1);
    expect(state.selectedAbility).toBe('artillery');
    expect(buyAbility(state, cfg, 'artillery')).toBe(false);
  });

  it('cannot be selected while locked', () => {
    const state = freshState();
    expect(selectAbility(state, 'napalm')).toBe(false);
    expect(selectAbility(state, null)).toBe(true);
  });
});

describe('automation', () => {
  it('needs buying before it can be toggled', () => {
    const state = freshState();
    expect(toggleAutomation(state, 'autoDeploy')).toBe(false);
    state.credits = automationCost(cfg, 'autoDeploy');
    expect(unlockAutomation(state, cfg, 'autoDeploy')).toBe(true);
    expect(state.automation.autoDeploy.enabled).toBe(true);
    expect(toggleAutomation(state, 'autoDeploy', false)).toBe(true);
    expect(state.automation.autoDeploy.enabled).toBe(false);
  });

  it('auto-launches the next wave after the prep delay', () => {
    const state = freshState();
    state.credits = automationCost(cfg, 'autoLaunch');
    unlockAutomation(state, cfg, 'autoLaunch');
    for (let i = 0; i < Math.ceil(cfg.idle.autoLaunchDelaySec / DT) + 2; i++) step(state, DT, cfg);
    expect(state.phase).toBe('battle');
  });

  it('auto-deploys soldiers while a battle runs', () => {
    const state = freshState();
    state.credits = automationCost(cfg, 'autoDeploy');
    unlockAutomation(state, cfg, 'autoDeploy');
    launchWave(state, cfg);
    step(state, DT, cfg);
    expect(state.units.some((u) => u.team === 'player')).toBe(true);
    expect(state.charges.current).toBe(0);
  });
});
