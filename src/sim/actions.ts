/**
 * actions.ts — player-initiated state transitions. All pure mutations of
 * `SimState`; the UI calls these, never pokes state directly. Each returns
 * whether it succeeded so the UI can give feedback.
 */

import type { GameConfig } from './config';
import { repairCost, upgradeCost } from './combat';
import type { RingId, SimState } from './types';

/** Can the ring be upgraded right now (ignoring cost)? False if breached (repair first). */
export function canUpgrade(state: SimState, ringId: RingId): boolean {
  const ring = state.rings[ringId];
  if (ring.level === 0) return true; // initial build
  return ring.status === 'active';
}

/** Supply cost of the next action on this ring (build/upgrade). */
export function nextUpgradeCost(cfg: GameConfig, state: SimState, ringId: RingId): number {
  return upgradeCost(cfg, ringId, state.rings[ringId].level);
}

/**
 * Build or upgrade a ring one level. Building from level 0 also brings the ring
 * online (status → active). Returns true on success.
 */
export function buyUpgrade(state: SimState, cfg: GameConfig, ringId: RingId): boolean {
  if (!canUpgrade(state, ringId)) return false;
  const ring = state.rings[ringId];
  const cost = upgradeCost(cfg, ringId, ring.level);
  if (state.supply < cost) return false;
  state.supply -= cost;
  const wasUnbuilt = ring.level === 0;
  ring.level += 1;
  if (wasUnbuilt) ring.status = 'active';
  return true;
}

/** Can this ring be repaired (it is a built ring that is currently down)? */
export function canRepair(state: SimState, ringId: RingId): boolean {
  const ring = state.rings[ringId];
  return ring.level > 0 && ring.status === 'down';
}

/** Repair a breached ring back to active. Returns true on success. */
export function repairRing(state: SimState, cfg: GameConfig, ringId: RingId): boolean {
  if (!canRepair(state, ringId)) return false;
  const cost = repairCost(cfg, ringId);
  if (state.supply < cost) return false;
  state.supply -= cost;
  state.rings[ringId].status = 'active';
  return true;
}

/**
 * Manually launch the next wave immediately (the "Send next wave" button).
 * Only meaningful when no wave is in progress and the position isn't overrun.
 * Returns true if a wave will now start on the next step.
 */
export function sendNextWave(state: SimState): boolean {
  if (state.daysHeldPaused) return false;
  if (state.wave.inProgress) return false;
  state.wave.timerSec = 0;
  return true;
}
