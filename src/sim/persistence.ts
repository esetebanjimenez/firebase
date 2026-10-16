/**
 * persistence.ts — pure (de)serialization of SimState. No storage API here.
 */

import type { GameConfig } from './config';
import type { SimState } from './types';

export interface SaveEnvelope {
  savedAt: number;
  state: SimState;
}

export function serialize(state: SimState, savedAt: number): string {
  return JSON.stringify({ savedAt, state } satisfies SaveEnvelope);
}

/**
 * Parse a save, validating shape and version. The model changed in version 2
 * (3-ring → single barrier), so any older/foreign save is rejected and the
 * caller starts a fresh run.
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

  const s = env.state as SimState;
  if (
    s.version !== cfg.version ||
    typeof s.day !== 'number' ||
    typeof s.supply !== 'number' ||
    typeof s.firepowerLevel !== 'number' ||
    !s.barrier ||
    !s.fireSupport ||
    !s.wave ||
    !s.stats
  ) {
    return null;
  }
  return { savedAt: env.savedAt, state: s };
}
