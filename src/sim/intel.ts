/**
 * intel.ts — how much of the coming wave the player can see.
 *
 * This is a game rule, not a rendering concern, so it lives here rather than
 * in the snapshot builder: what a player knows before they commit decides what
 * they can do, and that belongs with the rest of the simulation.
 *
 * Strength is never hidden. The budget is the constant half of a wave — fixed
 * and knowable — and what varies is how it is spent, so the composition is
 * what intel sells. It sells *advance notice* of it specifically: without a
 * scrap of intel you still learn what a wave is made of when it walks on,
 * which is too late to have fitted the parapet for it.
 */

import type { WaveComposition, WavePlan } from './waves';
import type { EnemyUnitId, WaveShape } from './types';

/** Null means "not known yet", never "none". Callers have to say which. */
export interface WaveIntel {
  /** L1: the wave's character, which is what names a counter. */
  readonly shape: WaveShape | null;
  /** L2: which kinds are coming, without numbers. */
  readonly kinds: readonly EnemyUnitId[] | null;
  /** L3: how many bodies in total. */
  readonly count: number | null;
  /** L4: the exact order of battle. */
  readonly composition: readonly WaveComposition[] | null;
}

export function revealWave(plan: WavePlan, level: number): WaveIntel {
  return {
    shape: level >= 1 ? plan.shape : null,
    kinds: level >= 2 ? plan.composition.map((c) => c.kind) : null,
    count: level >= 3 ? plan.spawns.length : null,
    composition: level >= 4 ? plan.composition : null,
  };
}
