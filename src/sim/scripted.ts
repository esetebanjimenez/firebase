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
    // Swept, not guessed, and re-swept every time the guns or the soldiers
    // changed — this is the most sensitive wave in the game, and three times
    // a change elsewhere has quietly killed the lesson. The counts are bodies:
    // they were five and four when a charge bought one rifleman, and squads
    // made that defence four times as thick, so rifles alone started winning
    // it on every seed. At thirteen and eight the sweep is clean again —
    // rifles alone lose all eight seeds, rifles with a Shield Bearer in front
    // win all eight.
    entries: [
      { kind: 'skirmisher', count: 13 },
      { kind: 'militia', count: 8 },
    ],
  },
};

export function scriptedWave(wave: number): ScriptedWave | null {
  return SCRIPTED_WAVES[wave] ?? null;
}
