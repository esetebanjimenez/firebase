/**
 * persistence.ts — pure (de)serialization of SimState. No storage API here.
 *
 * Only the between-waves state is ever written: a save taken mid-battle is
 * stored as if the player were back in prep (field cleared, wall full, charges
 * full). Progress lives in credits, levels, unlocks and the wave number, so
 * nothing worth keeping is lost, and saves stay small and version-stable.
 */

import type { GameConfig } from './config';
import type { SimState } from './types';

export interface SaveEnvelope {
  savedAt: number;
  state: SimState;
}

/** A battle-free copy of the state, safe to persist. */
export function toSaveState(state: SimState): SimState {
  return {
    ...state,
    phase: 'prep',
    units: [],
    projectiles: [],
    hazards: [],
    spawnQueue: [],
    battleTime: 0,
    battleCredits: 0,
    battleKills: 0,
    battleUnitsLost: 0,
    wall: { ...state.wall, hp: state.wall.maxHp },
    charges: { ...state.charges, current: state.charges.max },
    towers: state.towers.map((t) => ({ ...t, cooldown: 0 })),
    lastResult: null,
  };
}

export function serialize(state: SimState, savedAt: number): string {
  return JSON.stringify({ savedAt, state: toSaveState(state) } satisfies SaveEnvelope);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Parse a save, validating shape and version. Anything older, foreign or
 * malformed is rejected so the caller can start a clean run rather than crash
 * on a half-migrated state.
 */
export function deserialize(raw: string, cfg: GameConfig): SaveEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const savedAt = parsed.savedAt;
  const candidate = parsed.state;
  if (typeof savedAt !== 'number' || !isRecord(candidate)) return null;
  if (candidate.version !== cfg.version) return null;

  const required = ['credits', 'wave', 'bestWave', 'nextId', 'rngState'] as const;
  for (const key of required) {
    if (typeof candidate[key] !== 'number') return null;
  }
  for (const key of ['wall', 'upgrades', 'unlocked', 'abilities', 'automation', 'charges', 'stats'] as const) {
    if (!isRecord(candidate[key])) return null;
  }
  if (!Array.isArray(candidate.towers)) return null;

  return { savedAt, state: candidate as unknown as SimState };
}
