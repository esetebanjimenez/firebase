/**
 * storage.ts — the DOM-facing persistence layer (localStorage + timestamp).
 *
 * All the actual (de)serialization/migration lives in the pure
 * `sim/persistence.ts`; this file only owns the browser storage API and is
 * careful to never throw (private mode, blocked storage, quota, SSR).
 */

import type { GameConfig, SimState } from '../sim';
import { deserialize, serialize } from '../sim';

const STORAGE_KEY = 'firebase-idle:save:v1';

export interface LoadedSave {
  state: SimState;
  /** Epoch ms when the save was written (used to compute offline progress). */
  savedAt: number;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/** Persist the current state with a fresh timestamp. Silently no-ops on failure. */
export function saveGame(state: SimState, now: number = Date.now()): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state, now));
  } catch {
    /* quota exceeded / blocked — ignore, the game stays playable in-memory */
  }
}

/** Load the saved game, or null if none / unusable. */
export function loadGame(cfg: GameConfig): LoadedSave | null {
  if (!hasStorage()) return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const env = deserialize(raw, cfg);
  if (!env) return null;
  return { state: env.state, savedAt: env.savedAt };
}

/** Remove the save (used by a hard reset). */
export function clearSave(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
