/** Shared helpers: run battles headlessly at a fixed timestep. */

import { defaultConfig, type GameConfig } from '../config';
import { createInitialState } from '../state';
import { startBattle, step } from '../engine';
import {
  buyAbility,
  buyUpgrade,
  deployUnit,
  trackCost,
  unitLevelCost,
  unlockUnit,
  upgradeUnit,
} from '../actions';
import { castAbility } from '../abilities';
import { abilityCost } from '../derive';
import { PLAYER_UNITS, PLAYER_UNIT_ORDER } from '../roster';
import type { AbilityId, BodyClass, PlayerUnitId, SimEvent, SimState, Unit, WaveResult } from '../types';
import type { UpgradeTrack } from '../actions';

export const DT = 1 / 30;

/**
 * The seed the tests plan waves with. Real runs draw their own, so a wave is
 * only reproducible within a run; the tests pin one so they can assert exact
 * outcomes.
 */
export const SEED = defaultConfig.seed;

export function freshState(cfg: GameConfig = defaultConfig): SimState {
  return createInitialState(cfg);
}

export interface RunOptions {
  /** Keep spending charges on this kind for the whole battle. */
  readonly deploy?: PlayerUnitId | null;
  /** Give up after this many simulated seconds (a stalled battle is a bug). */
  readonly maxSec?: number;
  readonly cfg?: GameConfig;
  /** Called once per tick, for probes. */
  readonly onTick?: (state: SimState, events: SimEvent[]) => void;
}

export interface RunOutcome {
  result: WaveResult;
  seconds: number;
  events: SimEvent[];
}

/** Launch the current wave and simulate it to its end. */
export function runWave(state: SimState, opts: RunOptions = {}): RunOutcome {
  const cfg = opts.cfg ?? defaultConfig;
  const deploy = opts.deploy === undefined ? 'rifleman' : opts.deploy;
  const maxSec = opts.maxSec ?? 300;
  const events: SimEvent[] = [];

  startBattle(state, cfg, events);
  let elapsed = 0;
  while (state.phase === 'battle' && elapsed < maxSec) {
    if (deploy) {
      // Spend every charge the moment it is available.
      while (deployUnit(state, cfg, deploy, events)) {
        /* keep pushing soldiers out */
      }
    }
    const ticked = step(state, DT, cfg);
    events.push(...ticked);
    opts.onTick?.(state, ticked);
    elapsed += DT;
  }

  if (state.phase === 'battle') {
    throw new Error(`wave ${state.wave} did not resolve within ${maxSec}s`);
  }
  return { result: state.lastResult!, seconds: elapsed, events };
}

/** Buy the cheapest of the given tracks while credits allow. */
export function spendOn(
  state: SimState,
  tracks: readonly UpgradeTrack[],
  cfg: GameConfig = defaultConfig,
  rounds = 40,
): void {
  for (let i = 0; i < rounds; i++) {
    let bought = false;
    for (const track of tracks) {
      if (buyUpgrade(state, cfg, track)) bought = true;
    }
    if (!bought) return;
  }
}

/**
 * Stop a unit where it stands. Unit stat fields are readonly by design (the
 * engine never retunes a spawned unit), so tests that need a stationary
 * subject poke through the type here, in one place.
 */
export function pin(unit: Unit): void {
  (unit as { speed: number }).speed = 0;
}

// ---------------------------------------------------------------------------
// A scripted player, used by the balance tests. It is deliberately naive — it
// buys the cheapest useful thing and spends every charge the moment it has one
// — so what it reaches is a floor on what a thinking player can reach.
// ---------------------------------------------------------------------------

const TRACKS: UpgradeTrack[] = ['wall', 'towers', 'charges', 'recharge'];
const ABILITIES: AbilityId[] = ['artillery', 'barrage', 'napalm'];

/**
 * Unlock what is comfortably affordable, then buy the cheapest thing on offer —
 * a command track, or a level for one of the soldier kinds.
 */
export function autoShop(state: SimState, cfg: GameConfig = defaultConfig): void {
  for (let i = 0; i < 80; i++) {
    let acted = false;
    for (const id of PLAYER_UNIT_ORDER) {
      if (!state.unlocked[id] && state.credits >= PLAYER_UNITS[id].unlockCost * 1.5) {
        acted = unlockUnit(state, cfg, id) || acted;
      }
    }
    for (const id of ABILITIES) {
      if (state.abilities[id].level === 0 && state.credits >= abilityCost(cfg, id, 0) * 1.5) {
        acted = buyAbility(state, cfg, id) || acted;
      }
    }

    const cheapestTrack = [...TRACKS].sort((a, b) => trackCost(cfg, state, a) - trackCost(cfg, state, b))[0];
    const cheapestUnit = PLAYER_UNIT_ORDER.filter((id) => state.unlocked[id]).sort(
      (a, b) => unitLevelCost(cfg, state, a) - unitLevelCost(cfg, state, b),
    )[0];

    const trackPrice = trackCost(cfg, state, cheapestTrack);
    const unitPrice = cheapestUnit ? unitLevelCost(cfg, state, cheapestUnit) : Infinity;
    if (unitPrice <= trackPrice && state.credits >= unitPrice * 1.1) {
      acted = upgradeUnit(state, cfg, cheapestUnit) || acted;
    } else if (state.credits >= trackPrice * 1.1) {
      acted = buyUpgrade(state, cfg, cheapestTrack) || acted;
    }
    if (!acted) return;
  }
}

/** The heaviest unlocked kind, alternating so charges are never left idle. */
/** Which soldier answers which kind of body. */
const COUNTER: Record<BodyClass, PlayerUnitId> = {
  armored: 'rocketeer',
  swarm: 'gunner',
  elusive: 'rifleman',
};

/**
 * What the scripted player deploys next.
 *
 * It reads the field and answers what is actually on it, because the balance
 * suite is an instrument: a player who ignores the counter triangle measures a
 * game nobody plays, and every number this file reports would be a floor far
 * below what the design intends rather than a reading of it.
 *
 * It alternates a screen in front — a line of specialists with nothing to soak
 * for it dies before it fires — and otherwise brings the counter to whatever
 * class is most numerous on the field, falling back to a rifleman while the
 * field is still empty.
 */
function autoPick(state: SimState): PlayerUnitId {
  const mine = state.units.filter((u) => u.team === 'player');
  if (state.unlocked.shield && mine.length % 3 === 0) return 'shield';

  const seen: Record<BodyClass, number> = { armored: 0, swarm: 0, elusive: 0 };
  for (const u of state.units) {
    if (u.team === 'enemy' && u.hp > 0 && u.bodyClass) seen[u.bodyClass] += 1;
  }
  const worst = (Object.keys(seen) as BodyClass[]).reduce((a, b) => (seen[b] > seen[a] ? b : a));
  if (seen[worst] > 0 && state.unlocked[COUNTER[worst]]) return COUNTER[worst];
  return 'rifleman';
}

/** Fight the current wave: deploy constantly, drop abilities on crowds. */
export function autoFight(
  state: SimState,
  cfg: GameConfig = defaultConfig,
  maxSec = 400,
): { won: boolean; seconds: number } {
  startBattle(state, cfg);
  let elapsed = 0;
  while (state.phase === 'battle' && elapsed < maxSec) {
    while (deployUnit(state, cfg, autoPick(state))) {
      /* spend every charge */
    }
    for (const id of ABILITIES) {
      if (state.abilities[id].level <= 0 || state.abilities[id].cooldown > 0) continue;
      const enemies = state.units.filter((u) => u.team === 'enemy');
      if (enemies.length < 3) continue;
      const cx = enemies.reduce((a, u) => a + u.x, 0) / enemies.length;
      const cy = enemies.reduce((a, u) => a + u.y, 0) / enemies.length;
      castAbility(state, cfg, id, cx, cy);
    }
    step(state, DT, cfg);
    elapsed += DT;
  }
  if (state.phase === 'battle') throw new Error(`wave ${state.wave} stalled past ${maxSec}s`);
  return { won: state.lastResult?.won ?? false, seconds: elapsed };
}

/** Play from wave 1 until the run stalls or `waveGoal` is cleared. */
export function autoRun(
  waveGoal: number,
  cfg: GameConfig = defaultConfig,
  maxAttempts = 200,
): { state: SimState; attempts: number; stalledAt: number | null } {
  const state = freshState(cfg);
  let attempts = 0;
  let consecutiveLosses = 0;
  while (state.bestWave < waveGoal && attempts < maxAttempts) {
    autoShop(state, cfg);
    const { won } = autoFight(state, cfg);
    attempts += 1;
    consecutiveLosses = won ? 0 : consecutiveLosses + 1;
    // 12 losses in a row with no new upgrades affordable means a hard wall.
    if (consecutiveLosses >= 12) return { state, attempts, stalledAt: state.wave };
  }
  return { state, attempts, stalledAt: state.bestWave < waveGoal ? state.wave : null };
}
