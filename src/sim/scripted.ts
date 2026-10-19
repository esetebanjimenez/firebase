/**
 * scripted.ts — waves written by hand rather than generated.
 *
 * The budget planner makes good generic waves, but it cannot teach. A lesson
 * needs a specific wave at a specific moment: the first time a player meets
 * something their current army genuinely cannot answer, with a name on it and
 * a sentence explaining what went wrong if they lose.
 *
 * Everything else about a scripted wave is normal — the same per-wave scaling,
 * the same spawn scheduling — so these are compositions, not special cases.
 */

import type { EnemyUnitId } from './types';

export interface ScriptedWave {
  /** A name for the wave, shown on the launch button. */
  readonly label: string;
  /** Shown if the player loses it: what the wave was teaching. */
  readonly hint: string;
  readonly entries: readonly { readonly kind: EnemyUnitId; readonly count: number }[];
}

export const SCRIPTED_WAVES: Readonly<Record<number, ScriptedWave>> = {
  6: {
    label: 'THE CHARGE',
    hint: 'Skirmishers are fast enough to cross your riflemen’s field of fire and hit hard once they arrive. A Shield Bearer steps in front and soaks the charge while the rifles keep firing.',
    // Swept, not guessed — and re-swept after the towers gained reach, which
    // had quietly made the wave winnable with rifles alone and killed the
    // lesson. Fourteen is where rifles lose and a shield holds.
    entries: [
      { kind: 'skirmisher', count: 14 },
      { kind: 'militia', count: 4 },
    ],
  },
};

export function scriptedWave(wave: number): ScriptedWave | null {
  return SCRIPTED_WAVES[wave] ?? null;
}
