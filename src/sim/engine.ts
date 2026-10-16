/**
 * engine.ts — the authoritative, per-tick live simulation.
 *
 * `step(state, dtSeconds, cfg)` advances the world by `dt` seconds and returns
 * the discrete events that happened (for the renderer's juice). It is pure with
 * respect to its inputs: same state + same dt sequence + same seed ⇒ same
 * result. Determinism is achieved by driving it from a fixed-timestep
 * accumulator (see `game/useGameLoop.ts`) and by carrying RNG state in
 * `SimState`.
 *
 * Firing model (live): each active ring focus-fires the frontmost enemy in its
 * band (the one closest to breaching), applying `ringDps * dt` damage. Enemies
 * march inward; when a live enemy crosses an active ring's inner boundary that
 * ring breaches (drops). Reaching the core is a full breach.
 *
 * Offline progress uses a closed-form resolver (`offline.ts`) built from the
 * same `combat.ts` formulas — see the doc's "calculated, not simulated" note.
 */

import type { GameConfig } from './config';
import { RING_ORDER } from './config';
import { ringDps } from './combat';
import type { Enemy, RingId, SimEvent, SimState } from './types';
import { spawnInfantry, startWave } from './waves';

/** Find the innermost ring that has been built (level > 0). Outer always qualifies. */
export function innermostBuiltRing(state: SimState): RingId {
  for (let i = RING_ORDER.length - 1; i >= 0; i--) {
    const id = RING_ORDER[i];
    if (state.rings[id].level > 0) return id;
  }
  return 'outer';
}

/** Apply a full breach: overrun the position, penalize, pause, schedule restore. Mutates state. */
function applyFullBreach(state: SimState, cfg: GameConfig, events: SimEvent[]): void {
  const supplyLost = Math.floor(state.supply * cfg.breach.fullBreachSupplyLossPct);
  state.supply -= supplyLost;
  // The position is overrun: clear the field and this wave, freeze Days Held.
  state.enemies = [];
  state.wave.inProgress = false;
  state.wave.toSpawn = 0;
  for (const id of RING_ORDER) state.rings[id].status = 'down';
  state.daysHeldPaused = true;
  state.restoreTimerSec = cfg.breach.innerRestoreSec;
  events.push({ type: 'fullBreach', supplyLost });
}

/**
 * Advance the simulation by `dt` seconds.
 * `dt` should be small and fixed (the loop feeds 1/30s steps); large values are
 * still handled but accuracy degrades, which is why offline uses a separate
 * closed-form path instead of one giant step.
 */
export function step(state: SimState, dt: number, cfg: GameConfig): SimEvent[] {
  const events: SimEvent[] = [];
  if (dt <= 0) return events;

  // --- Full-breach recovery: nothing else happens while the position is overrun.
  if (state.daysHeldPaused) {
    state.restoreTimerSec -= dt;
    if (state.restoreTimerSec <= 0) {
      const restore = innermostBuiltRing(state);
      state.rings[restore].status = 'active';
      state.daysHeldPaused = false;
      state.restoreTimerSec = 0;
      state.wave.inProgress = false;
      state.wave.timerSec = cfg.wave.intervalSec;
      events.push({ type: 'ringRestored', ring: restore });
    }
    return events;
  }

  // --- 1. Wave lifecycle: count down to the next wave, then start it.
  if (!state.wave.inProgress) {
    state.wave.timerSec -= dt;
    if (state.wave.timerSec <= 0) {
      startWave(state, cfg);
      events.push({ type: 'waveStarted', index: state.wave.index });
    }
  }

  // --- 2. Spawn trickle.
  if (state.wave.inProgress && state.wave.toSpawn > 0) {
    state.wave.spawnTimerSec -= dt;
    // guard against runaway loops on absurd dt
    let guard = cfg.wave.maxCount + 1;
    while (state.wave.spawnTimerSec <= 0 && state.wave.toSpawn > 0 && guard-- > 0) {
      const enemy = spawnInfantry(state, cfg);
      state.enemies.push(enemy);
      state.wave.toSpawn -= 1;
      state.wave.spawnTimerSec += cfg.wave.spawnSpacingSec;
      events.push({ type: 'spawn', enemyId: enemy.id });
    }
  }

  // --- 3. Firing: each active ring focus-fires the frontmost enemy in its band.
  for (const id of RING_ORDER) {
    const ring = state.rings[id];
    if (ring.status !== 'active' || ring.level <= 0) continue;
    const band = cfg.rings[id].band;
    let target: Enemy | null = null;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (e.radius <= band.outer && e.radius > band.inner) {
        if (target === null || e.radius < target.radius) target = e;
      }
    }
    if (target) {
      target.hp -= ringDps(cfg, id, ring.level, target.type) * dt;
    }
  }

  // --- 4. Reap the dead, award bounty.
  if (state.enemies.length > 0) {
    const survivors: Enemy[] = [];
    for (const e of state.enemies) {
      if (e.hp <= 0) {
        state.supply += e.bounty;
        state.stats.totalKills += 1;
        state.stats.totalSupplyEarned += e.bounty;
        events.push({ type: 'kill', enemyId: e.id, radius: e.radius, bounty: e.bounty });
      } else {
        survivors.push(e);
      }
    }
    state.enemies = survivors;
  }

  // --- 5. Movement + breach detection.
  let fullBreach = false;
  for (const e of state.enemies) {
    const prev = e.radius;
    e.radius -= e.speed * dt;
    // Did this enemy cross below an active ring's inner boundary?
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      if (ring.status !== 'active' || ring.level <= 0) continue;
      const inner = cfg.rings[id].band.inner;
      if (prev > inner && e.radius <= inner) {
        ring.status = 'down';
        events.push({ type: 'breach', ring: id, radius: e.radius });
      }
    }
    if (e.radius <= 0) fullBreach = true;
  }

  if (fullBreach) {
    applyFullBreach(state, cfg, events);
    return events;
  }

  // --- 6. Wave resolution: all spawned and all cleared ⇒ one day held.
  if (state.wave.inProgress && state.wave.toSpawn === 0 && state.enemies.length === 0) {
    state.day += 1;
    state.stats.bestDay = Math.max(state.stats.bestDay, state.day);
    state.wave.inProgress = false;
    state.wave.timerSec = cfg.wave.intervalSec;
    events.push({ type: 'waveResolved', day: state.day });
  }

  return events;
}
