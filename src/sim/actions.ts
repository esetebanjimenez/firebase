/**
 * actions.ts — everything the player can do, as pure mutations of SimState.
 *
 * Each action checks its own preconditions (credits, charges, phase) and
 * returns a boolean, so the UI layer never has to duplicate the rules. Upgrades
 * are deliberately legal mid-battle too: buying a wall level while a ram is
 * chewing on it is a real decision, not a bug.
 */

import type { GameConfig } from './config';
import {
  abilityCost,
  chargeMaxCost,
  rechargeCost,
  towerUpgradeCost,
  unitUpgradeCost,
  wallMaxHp,
  wallUpgradeCost,
} from './derive';
import { startBattle, syncDerived } from './engine';
import { PLAYER_UNITS } from './roster';
import { createPlayerUnit } from './waves';
import type { AbilityId, AutomationState, PlayerUnitId, SimEvent, SimState } from './types';

/** The command-level credit sinks. Soldiers level per kind, not here. */
export type UpgradeTrack = 'wall' | 'towers' | 'charges' | 'recharge';

export type AutomationId = keyof AutomationState;

/** Credits for the next level of a track. */
export function trackCost(cfg: GameConfig, state: SimState, track: UpgradeTrack): number {
  const level = state.upgrades[track];
  switch (track) {
    case 'wall':
      return wallUpgradeCost(cfg, level);
    case 'towers':
      return towerUpgradeCost(cfg, level);
    case 'charges':
      return chargeMaxCost(cfg, level);
    case 'recharge':
      return rechargeCost(cfg, level);
  }
}

/** Buy one level of a track. */
export function buyUpgrade(state: SimState, cfg: GameConfig, track: UpgradeTrack): boolean {
  const cost = trackCost(cfg, state, track);
  if (state.credits < cost) return false;
  state.credits -= cost;

  if (track === 'wall') {
    // The wall visibly gains the new HP straight away, mid-battle included.
    const before = wallMaxHp(cfg, state.upgrades.wall);
    state.upgrades.wall += 1;
    state.wall.level = state.upgrades.wall;
    const after = wallMaxHp(cfg, state.upgrades.wall);
    state.wall.hp += after - before;
  } else {
    state.upgrades[track] += 1;
  }

  // A bigger charge pool hands you the new charges immediately.
  if (track === 'charges') state.charges.current += cfg.charges.maxPerLevel;

  syncDerived(state, cfg);
  return true;
}

/** Permanently unlock a soldier kind for deployment. It starts at level 1. */
export function unlockUnit(state: SimState, cfg: GameConfig, id: PlayerUnitId): boolean {
  void cfg;
  if (state.unlocked[id]) return false;
  const cost = PLAYER_UNITS[id].unlockCost;
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.unlocked[id] = true;
  state.unitLevels[id] = Math.max(1, state.unitLevels[id]);
  state.selectedUnit = id;
  return true;
}

/** Credits to take a soldier kind to its next level. */
export function unitLevelCost(cfg: GameConfig, state: SimState, id: PlayerUnitId): number {
  return unitUpgradeCost(cfg, id, Math.max(1, state.unitLevels[id]));
}

/**
 * Level up one soldier kind: more hit points, more damage, a little more speed
 * — for that kind alone. Locked kinds have to be unlocked first.
 */
export function upgradeUnit(state: SimState, cfg: GameConfig, id: PlayerUnitId): boolean {
  if (!state.unlocked[id]) return false;
  const cost = unitLevelCost(cfg, state, id);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.unitLevels[id] = Math.max(1, state.unitLevels[id]) + 1;
  return true;
}

/** Unlock (level 0 → 1) or upgrade a fire-support ability. */
export function buyAbility(state: SimState, cfg: GameConfig, id: AbilityId): boolean {
  const level = state.abilities[id].level;
  const cost = abilityCost(cfg, id, level);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.abilities[id].level += 1;
  if (level === 0) {
    state.selectedAbility = id;
    state.abilities[id].cooldown = 0;
  }
  return true;
}

export function automationCost(cfg: GameConfig, id: AutomationId): number {
  return id === 'autoDeploy' ? cfg.idle.autoDeployCost : cfg.idle.autoLaunchCost;
}

export function unlockAutomation(state: SimState, cfg: GameConfig, id: AutomationId): boolean {
  if (state.automation[id].unlocked) return false;
  const cost = automationCost(cfg, id);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.automation[id].unlocked = true;
  state.automation[id].enabled = true;
  return true;
}

export function toggleAutomation(state: SimState, id: AutomationId, enabled?: boolean): boolean {
  if (!state.automation[id].unlocked) return false;
  state.automation[id].enabled = enabled ?? !state.automation[id].enabled;
  return true;
}

/** Charges needed to deploy one of a kind. */
export function chargeCost(id: PlayerUnitId): number {
  return PLAYER_UNITS[id].chargeCost;
}

/** Can a charge be spent on this kind right now? */
export function canDeploy(state: SimState, cfg: GameConfig, id: PlayerUnitId = state.selectedUnit): boolean {
  return (
    state.phase === 'battle' &&
    state.unlocked[id] &&
    state.charges.current >= chargeCost(id) &&
    state.units.length < cfg.sim.maxUnits
  );
}

/** Spend charges to push a soldier out of the gate. */
export function deployUnit(
  state: SimState,
  cfg: GameConfig,
  id: PlayerUnitId = state.selectedUnit,
  events?: SimEvent[],
): boolean {
  if (!canDeploy(state, cfg, id)) return false;
  state.charges.current -= chargeCost(id);
  const unit = createPlayerUnit(state, cfg, id);
  state.units.push(unit);
  events?.push({ type: 'spawn', team: 'player', kind: unit.kind, x: unit.x, y: unit.y });
  return true;
}

export function selectUnit(state: SimState, id: PlayerUnitId): boolean {
  if (!state.unlocked[id]) return false;
  state.selectedUnit = id;
  return true;
}

export function selectAbility(state: SimState, id: AbilityId | null): boolean {
  if (id !== null && state.abilities[id].level <= 0) return false;
  state.selectedAbility = id;
  return true;
}

/** Launch the wave the player has been preparing for. */
export function launchWave(state: SimState, cfg: GameConfig, events?: SimEvent[]): boolean {
  return startBattle(state, cfg, events);
}

/** Dismiss the after-action report. */
export function clearResult(state: SimState): void {
  state.lastResult = null;
}
