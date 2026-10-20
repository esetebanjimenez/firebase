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
  /**
   * What this wave weighs, against what the curve says a wave of its number
   * should. A lesson has to be a wave you cannot brute-force — that is the
   * whole point of writing it by hand — and its composition alone cannot do
   * that, because every wave's hit points are held to the curve: adding
   * skirmishers to wave 6 only spreads the same hit points over more of them.
   */
  readonly threat?: number;
  readonly entries: readonly { readonly kind: EnemyUnitId; readonly count: number }[];
}

export const SCRIPTED_WAVES: Readonly<Record<number, ScriptedWave>> = {
  6: {
    label: 'THE CHARGE',
    hint: 'Skirmishers are fast enough to cross your riflemen’s field of fire and hit hard once they arrive. A Shield Bearer steps in front and soaks the charge while the rifles keep firing.',
    // Swept, not guessed, and re-swept every time the guns or the soldiers
    // changed — this is the most sensitive wave in the game, and three times
    // a change elsewhere has quietly killed the lesson.
    //
    // Counts alone stopped being able to carry it once squads arrived. A
    // charge buys four riflemen now, so the rifles-only defence is four times
    // as thick, and piling on skirmishers does not answer that on its own:
    // the wave's hit points are held to the curve either way, so more of them
    // is only thinner ones. Hence the weight, swept together with the counts.
    //
    // The pair below is the one that both teaches and reads right: thirteen
    // bodies at twice the curve made each skirmisher a three-hundred-hit-point
    // brick, which is not what a charge of light infantry looks like. Twenty
    // and twelve at 1.2 spreads the same lesson over thirty-two bodies at
    // seventy-odd each, and the sweep is clean on all eight seeds both ways —
    // rifles alone lose every one, rifles with a Shield Bearer in front win
    // every one.
    threat: 1.2,
    entries: [
      { kind: 'skirmisher', count: 20 },
      { kind: 'militia', count: 12 },
    ],
  },
};

export function scriptedWave(wave: number): ScriptedWave | null {
  return SCRIPTED_WAVES[wave] ?? null;
}
