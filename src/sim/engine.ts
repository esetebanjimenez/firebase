/**
 * engine.ts — the authoritative per-tick simulation for "The Line".
 *
 * Each step: soldiers focus-fire the frontmost enemies (a DPS budget that can
 * mow several weak enemies), kills pay Supply, surviving enemies advance and —
 * once at the wall — chip its HP. The wall regenerates slowly. A wave becomes a
 * Day only if the wall still stands when the last enemy falls; a destroyed wall
 * just stalls Days (no penalty) until it repairs or regenerates.
 *
 * Pure w.r.t. inputs: same state + same dt sequence ⇒ same result. Offline
 * progress reuses this exact `step()` headlessly (see offline.ts).
 */

import type { GameConfig } from './config';
import { barrierMaxHp, barrierRegen, firepowerDps } from './combat';
import type { Enemy, SimEvent, SimState } from './types';
import { spawnInfantry, startWave } from './waves';

/** Recompute and apply the barrier's cached max HP for its current level. */
export function syncBarrierMax(state: SimState, cfg: GameConfig): void {
  state.barrier.maxHp = barrierMaxHp(cfg, state.barrier.level);
  if (state.barrier.hp > state.barrier.maxHp) state.barrier.hp = state.barrier.maxHp;
}

export function step(state: SimState, dt: number, cfg: GameConfig): SimEvent[] {
  const events: SimEvent[] = [];
  if (dt <= 0) return events;

  const b = state.barrier;
  const wallWasStanding = b.hp > 0;

  // --- Passive wall regen + fire-support cooldown.
  if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + barrierRegen(cfg, b.level) * dt);
  if (!wallWasStanding && b.hp > 0) events.push({ type: 'wallRepaired' });
  if (state.fireSupport.cooldownRemaining > 0) {
    state.fireSupport.cooldownRemaining = Math.max(0, state.fireSupport.cooldownRemaining - dt);
  }

  // --- Wave lifecycle.
  if (!state.wave.inProgress) {
    state.wave.timerSec -= dt;
    if (state.wave.timerSec <= 0) {
      startWave(state, cfg);
      events.push({ type: 'waveStarted', index: state.wave.index });
    }
  }

  // --- Spawn trickle.
  if (state.wave.inProgress && state.wave.toSpawn > 0) {
    state.wave.spawnTimerSec -= dt;
    let guard = cfg.wave.maxCount + 1;
    while (state.wave.spawnTimerSec <= 0 && state.wave.toSpawn > 0 && guard-- > 0) {
      const e = spawnInfantry(state, cfg);
      state.enemies.push(e);
      state.wave.toSpawn -= 1;
      state.wave.spawnTimerSec += cfg.wave.spawnSpacingSec;
      events.push({ type: 'spawn', enemyId: e.id });
    }
  }

  // --- Soldiers fire: a DPS budget spent on the frontmost enemies first.
  let budget = firepowerDps(cfg, state.firepowerLevel) * dt;
  if (budget > 0 && state.enemies.length > 0) {
    const order = [...state.enemies].sort((a, c) => a.pos - c.pos); // closest to wall first
    for (const e of order) {
      if (budget <= 0) break;
      const dmg = Math.min(budget, e.hp);
      e.hp -= dmg;
      budget -= dmg;
    }
  }

  // --- Reap the dead, pay bounty.
  if (state.enemies.length > 0) {
    const survivors: Enemy[] = [];
    for (const e of state.enemies) {
      if (e.hp <= 0) {
        state.supply += e.bounty;
        state.stats.totalKills += 1;
        state.stats.totalSupplyEarned += e.bounty;
        events.push({ type: 'kill', enemyId: e.id, pos: e.pos, bounty: e.bounty });
      } else {
        survivors.push(e);
      }
    }
    state.enemies = survivors;
  }

  // --- Survivors advance to their firing range, then hold and shoot the wall.
  let wallDamage = 0;
  for (const e of state.enemies) {
    if (!e.engaging) {
      e.pos -= e.speed * dt;
      if (e.pos <= e.range) {
        e.pos = e.range;
        e.engaging = true;
      }
    }
    if (e.engaging && b.hp > 0) wallDamage += e.attackDps * dt;
  }
  if (wallDamage > 0) {
    b.hp = Math.max(0, b.hp - wallDamage);
    if (wallWasStanding && b.hp <= 0) events.push({ type: 'wallBroken' });
  }

  // --- Wave resolution: cleared field ⇒ a Day, but only if the wall still stands.
  if (state.wave.inProgress && state.wave.toSpawn === 0 && state.enemies.length === 0) {
    const counted = b.hp > 0;
    if (counted) {
      state.day += 1;
      state.stats.bestDay = Math.max(state.stats.bestDay, state.day);
    }
    state.wave.inProgress = false;
    state.wave.timerSec = cfg.wave.intervalSec;
    events.push({ type: 'waveResolved', day: state.day, counted });
  }

  return events;
}
