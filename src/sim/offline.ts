/**
 * offline.ts — calculated offline progress.
 *
 * The doc is explicit: offline progress is *calculated, not simulated* (browsers
 * suspend background tabs), using a "holds or falls back" model rather than
 * replaying waves. This resolver credits `floor(timeAway / waveInterval)` waves,
 * capped by `config.offline.maxWaves`, and resolves each wave in closed form
 * using the SAME `combat.ts` formulas the live engine uses (ring DPS, enemy HP,
 * wave size, bounties). That shared formula layer is the single source of truth,
 * so live play and offline progress can't drift apart.
 *
 * Per-wave resolution: enemies flow through the rings outer → inner. Each active
 * ring deals `dps × occupancy` damage to the stream (occupancy ≈ how long the
 * stream sits in its band); whatever it can't kill passes through and breaches
 * that ring. If enemies reach the core it's a full breach (supply penalty, all
 * rings down, innermost built ring self-restores) and that wave holds no day.
 * Breached rings stay down for the rest of the absence, so a long under-defended
 * absence naturally falls back to a sustainable line — exactly the soft-failure
 * the design calls for.
 */

import type { GameConfig } from './config';
import { RING_ORDER } from './config';
import { bandTransitSec, enemyBounty, enemyHp, ringDps, waveCount } from './combat';
import { innermostBuiltRing } from './engine';
import type { RingId, SimState, Sitrep } from './types';

/** Reset the transient (live-only) fields to a clean "next wave incoming" state. */
function resetToIdle(state: SimState, cfg: GameConfig): void {
  state.enemies = [];
  state.daysHeldPaused = false;
  state.restoreTimerSec = 0;
  state.wave.inProgress = false;
  state.wave.toSpawn = 0;
  state.wave.spawnTimerSec = 0;
  state.wave.timerSec = cfg.wave.intervalSec;
}

/** Resolve a single wave in place against the current ring state. Returns supply gained + whether it held. */
function resolveWave(state: SimState, cfg: GameConfig): { held: boolean; supplyGained: number } {
  const day = state.day + 1;
  const n = waveCount(cfg, day);
  const hp = enemyHp(cfg, 'infantry', day);
  const bounty = enemyBounty(cfg, 'infantry', day);
  const speed = cfg.enemies.infantry.speed;
  const spacing = cfg.wave.spawnSpacingSec;

  let survivors = n;
  let supplyGained = 0;

  for (const id of RING_ORDER) {
    const ring = state.rings[id];
    if (survivors <= 0) break;
    if (ring.status !== 'active' || ring.level <= 0) continue; // inert ring: pass, no breach

    const dps = ringDps(cfg, id, ring.level, 'infantry');
    const occupancySec = Math.max(0, survivors - 1) * spacing + bandTransitSec(cfg.rings[id], speed);
    const damage = dps * occupancySec;
    const kills = Math.min(survivors, Math.floor(damage / hp));
    survivors -= kills;
    supplyGained += kills * bounty;

    if (survivors > 0) {
      // Live enemies got through this ring → it breaches and stays down.
      ring.status = 'down';
    }
  }

  // Bank the kills regardless of the wave's final outcome.
  state.supply += supplyGained;
  state.stats.totalKills += n - survivors;
  state.stats.totalSupplyEarned += supplyGained;

  if (survivors > 0) {
    // Full breach: the position is overrun this wave.
    const supplyLost = Math.floor(state.supply * cfg.breach.fullBreachSupplyLossPct);
    state.supply -= supplyLost;
    supplyGained -= supplyLost;
    for (const r of RING_ORDER) state.rings[r].status = 'down';
    state.rings[innermostBuiltRing(state)].status = 'active';
    return { held: false, supplyGained };
  }

  state.day += 1;
  state.stats.bestDay = Math.max(state.stats.bestDay, state.day);
  return { held: true, supplyGained };
}

/**
 * Apply offline progress for an absence of `elapsedMs`. Mutates `state` in place
 * and returns a SITREP summary for the return screen.
 */
export function applyOfflineProgress(state: SimState, cfg: GameConfig, elapsedMs: number): Sitrep {
  const empty: Sitrep = {
    daysGained: 0,
    supplyEarned: 0,
    ringsFallen: [],
    wavesResolved: 0,
    secondsCredited: 0,
    capped: false,
  };
  if (elapsedMs <= 0) return empty;

  const elapsedSec = elapsedMs / 1000;
  const wavesAway = Math.floor(elapsedSec / cfg.wave.intervalSec);
  if (wavesAway <= 0) return empty;

  const capped = wavesAway > cfg.offline.maxWaves;
  const wavesToResolve = Math.min(wavesAway, cfg.offline.maxWaves);

  const startDay = state.day;
  const startSupply = state.supply;

  for (let i = 0; i < wavesToResolve; i++) {
    resolveWave(state, cfg);
  }

  resetToIdle(state, cfg);

  const ringsFallen: RingId[] = RING_ORDER.filter(
    (id) => state.rings[id].level > 0 && state.rings[id].status === 'down',
  );

  return {
    daysGained: state.day - startDay,
    supplyEarned: state.supply - startSupply,
    ringsFallen,
    wavesResolved: wavesToResolve,
    secondsCredited: wavesToResolve * cfg.wave.intervalSec,
    capped,
  };
}
