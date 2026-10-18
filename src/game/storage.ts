/**
 * storage.ts — the browser-facing persistence layer (localStorage + clock).
 *
 * The (de)serialization and validation live in the pure `sim/persistence.ts`;
 * this file owns only the storage API, and never throws: private mode, blocked
 * storage, quota and SSR all degrade to "no save", with the game still playable
 * in memory.
 */

import type { GameConfig, SimState } from '../sim';
import { deserialize, serialize } from '../sim';

const STORAGE_KEY = 'iron-line:save:v1';

export interface LoadedSave {
  state: SimState;
  /** Epoch ms the save was written, for offline credit. */
  savedAt: number;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function saveGame(state: SimState, now: number = Date.now()): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state, now));
  } catch {
    /* quota or blocked storage — keep playing, just unsaved */
  }
}

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
  return env ? { state: env.state, savedAt: env.savedAt } : null;
}

export function clearSave(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
