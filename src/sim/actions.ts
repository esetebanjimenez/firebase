/**
 * actions.ts — player-initiated state transitions. Pure mutations of SimState.
 * Upgrades/repair return a boolean; Fire Support returns the FX events it
 * produced (empty if it couldn't fire) so the UI can play its juice.
 */

import type { GameConfig } from './config';
import {
  barrierCost,
  barrierMaxHp,
  fireSupportCost,
  fireSupportCooldown,
  fireSupportDamage,
  firepowerCost,
  repairCost,
} from './combat';
import { syncBarrierMax } from './engine';
import type { Enemy, SimEvent, SimState } from './types';

export function firepowerUpgradeCost(cfg: GameConfig, state: SimState): number {
  return firepowerCost(cfg, state.firepowerLevel);
}
export function barrierUpgradeCost(cfg: GameConfig, state: SimState): number {
  return barrierCost(cfg, state.barrier.level);
}
export function fireSupportUpgradeCost(cfg: GameConfig, state: SimState): number {
  return fireSupportCost(cfg, state.fireSupport.level);
}
export function barrierRepairCost(cfg: GameConfig, state: SimState): number {
  return repairCost(cfg, state.barrier.hp, state.barrier.maxHp);
}

/** Upgrade soldier firepower by one level. */
export function upgradeFirepower(state: SimState, cfg: GameConfig): boolean {
  const cost = firepowerCost(cfg, state.firepowerLevel);
  if (state.supply < cost) return false;
  state.supply -= cost;
  state.firepowerLevel += 1;
  return true;
}

/** Upgrade the wall by one level (raises max HP; current HP rises by the same delta). */
export function upgradeBarrier(state: SimState, cfg: GameConfig): boolean {
  const cost = barrierCost(cfg, state.barrier.level);
  if (state.supply < cost) return false;
  state.supply -= cost;
  const before = barrierMaxHp(cfg, state.barrier.level);
  state.barrier.level += 1;
  const after = barrierMaxHp(cfg, state.barrier.level);
  state.barrier.hp += after - before; // reward feels tangible: the wall visibly gains HP
  syncBarrierMax(state, cfg);
  return true;
}

/** Unlock or upgrade Fire Support by one level. */
export function upgradeFireSupport(state: SimState, cfg: GameConfig): boolean {
  const cost = fireSupportCost(cfg, state.fireSupport.level);
  if (state.supply < cost) return false;
  state.supply -= cost;
  state.fireSupport.level += 1;
  return true;
}

/** Instantly repair the wall to full HP. */
export function repairBarrier(state: SimState, cfg: GameConfig): boolean {
  const cost = repairCost(cfg, state.barrier.hp, state.barrier.maxHp);
  if (cost <= 0) return false; // already full
  if (state.supply < cost) return false;
  state.supply -= cost;
  state.barrier.hp = state.barrier.maxHp;
  return true;
}

/**
 * Trigger Fire Support: an AoE strike on every enemy near the wall. Returns the
 * events it produced (a `fireSupport` marker plus any `kill`s) — empty if it is
 * locked or still on cooldown.
 */
export function useFireSupport(state: SimState, cfg: GameConfig): SimEvent[] {
  if (state.fireSupport.level <= 0) return [];
  if (state.fireSupport.cooldownRemaining > 0) return [];
  const damage = fireSupportDamage(cfg, state.fireSupport.level);
  const radius = cfg.fireSupport.radius;
  state.fireSupport.cooldownRemaining = fireSupportCooldown(cfg, state.fireSupport.level);

  const events: SimEvent[] = [{ type: 'fireSupport', damage }];
  const survivors: Enemy[] = [];
  for (const e of state.enemies) {
    if (e.pos <= radius) {
      e.hp -= damage;
      if (e.hp <= 0) {
        state.supply += e.bounty;
        state.stats.totalKills += 1;
        state.stats.totalSupplyEarned += e.bounty;
        events.push({ type: 'kill', enemyId: e.id, pos: e.pos, bounty: e.bounty });
        continue;
      }
    }
    survivors.push(e);
  }
  state.enemies = survivors;
  return events;
}

/** Launch the next wave immediately (skip the idle timer). */
export function sendNextWave(state: SimState): boolean {
  if (state.wave.inProgress) return false;
  state.wave.timerSec = 0;
  return true;
}

/** Whether Fire Support can be fired right now. */
export function canUseFireSupport(state: SimState): boolean {
  return state.fireSupport.level > 0 && state.fireSupport.cooldownRemaining <= 0;
}
