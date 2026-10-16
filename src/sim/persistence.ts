/**
 * persistence.ts — pure (de)serialization of SimState. No storage API here;
 * `game/storage.ts` owns localStorage and the save timestamp. Keeping this pure
 * means save/load is unit-testable and the same code path works for an eventual
 * export/import save string.
 */

import type { GameConfig } from './config';
import { createInitialState } from './state';
import type { SimState } from './types';

/** The envelope actually written to storage: the sim state plus when it was saved. */
export interface SaveEnvelope {
  savedAt: number; // epoch ms
  state: SimState;
}

export function serialize(state: SimState, savedAt: number): string {
  const envelope: SaveEnvelope = { savedAt, state };
  return JSON.stringify(envelope);
}

/**
 * Parse a save string into an envelope, running migrations to the current
 * config version. Returns null if the string is unusable (corrupt / wrong
 * shape) so the caller can fall back to a fresh run.
 */
export function deserialize(raw: string, cfg: GameConfig): SaveEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const env = parsed as Partial<SaveEnvelope>;
  if (typeof env.savedAt !== 'number' || !env.state || typeof env.state !== 'object') return null;

  const migrated = migrate(env.state as SimState, cfg);
  if (!migrated) return null;
  return { savedAt: env.savedAt, state: migrated };
}

/**
 * Bring an older save up to the current version. The slice has only version 1,
 * so this validates shape and stamps the version. Future versions add cases
 * here; an unmigratable save returns null (caller starts fresh).
 */
function migrate(state: SimState, cfg: GameConfig): SimState | null {
  // Minimal structural validation — guards against hand-edited / corrupt saves.
  if (
    typeof state.day !== 'number' ||
    typeof state.supply !== 'number' ||
    !state.rings ||
    !state.wave ||
    !state.stats
  ) {
    return null;
  }

  // Backfill any ring the save predates (e.g. a future ring added to config)
  // from a fresh state so the shape is always complete.
  const fresh = createInitialState(cfg);
  for (const id of Object.keys(fresh.rings) as (keyof typeof fresh.rings)[]) {
    if (!state.rings[id]) state.rings[id] = fresh.rings[id];
  }

  state.version = cfg.version;
  return state;
}
