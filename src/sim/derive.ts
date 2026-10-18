/**
 * derive.ts — every derived number in one place.
 *
 * The live engine, the UI and the tests all read stats through these pure
 * functions, so they cannot disagree about what level 7 towers hit for or what
 * the next upgrade costs.
 */

import type { AbilityConfig, GameConfig } from './config';
import { PLAYER_UNITS } from './roster';
import type { AbilityId, PlayerUnitId, SimState } from './types';

/** The standard idle-game price curve: base * growth^(level-1). */
export function geometricCost(base: number, growth: number, level: number): number {
  return Math.round(base * Math.pow(growth, Math.max(0, level - 1)));
}

// --- The wall ---------------------------------------------------------------

export function wallMaxHp(cfg: GameConfig, level: number): number {
  return Math.round(cfg.wall.baseMaxHp * Math.pow(cfg.wall.maxHpGrowth, Math.max(0, level - 1)));
}

export function wallUpgradeCost(cfg: GameConfig, level: number): number {
  return geometricCost(cfg.wall.baseCost, cfg.wall.costGrowth, level);
}

// --- Towers ----------------------------------------------------------------

export function towerDamage(cfg: GameConfig, level: number): number {
  return cfg.towers.baseDamage * Math.pow(cfg.towers.damageGrowth, Math.max(0, level - 1));
}

export function towerPeriod(cfg: GameConfig, level: number): number {
  const raw = cfg.towers.basePeriodSec - cfg.towers.periodPerLevel * Math.max(0, level - 1);
  return Math.max(cfg.towers.minPeriodSec, raw);
}

export function towerRange(cfg: GameConfig, level: number): number {
  return cfg.towers.baseRange + cfg.towers.rangePerLevel * Math.max(0, level - 1);
}

/** Damage per second of a single tower — the headline number for the UI. */
export function towerDps(cfg: GameConfig, level: number): number {
  return towerDamage(cfg, level) / towerPeriod(cfg, level);
}

export function towerUpgradeCost(cfg: GameConfig, level: number): number {
  return geometricCost(cfg.towers.baseCost, cfg.towers.costGrowth, level);
}

// --- Soldiers -------------------------------------------------------------
//
// Each kind levels on its own. A level lifts that kind's hit points, damage and
// a little of its speed, so the question is which soldiers you invest in.

export function unitHpMult(cfg: GameConfig, level: number): number {
  return Math.pow(cfg.soldiers.hpGrowth, Math.max(0, level - 1));
}

export function unitDamageMult(cfg: GameConfig, level: number): number {
  return Math.pow(cfg.soldiers.damageGrowth, Math.max(0, level - 1));
}

export function unitSpeedMult(cfg: GameConfig, level: number): number {
  const raw = 1 + cfg.soldiers.speedPerLevel * Math.max(0, level - 1);
  return Math.min(cfg.soldiers.maxSpeedMult, raw);
}

/** Credits to take a kind from `level` to the next one. */
export function unitUpgradeCost(cfg: GameConfig, id: PlayerUnitId, level: number): number {
  return geometricCost(PLAYER_UNITS[id].upgradeCost, cfg.soldiers.costGrowth, level);
}

/** A player unit's stats at its current level. */
export function playerUnitStats(
  cfg: GameConfig,
  levels: Record<PlayerUnitId, number>,
  id: PlayerUnitId,
): { hp: number; damage: number; speed: number; dps: number; level: number } {
  const def = PLAYER_UNITS[id];
  const level = Math.max(1, levels[id]);
  const hp = def.hp * unitHpMult(cfg, level);
  const damage = def.damage * unitDamageMult(cfg, level);
  const speed = def.speed * unitSpeedMult(cfg, level);
  return { hp, damage, speed, dps: damage / def.attackPeriod, level };
}

// --- Deployment charges ----------------------------------------------------

export function chargeMax(cfg: GameConfig, level: number): number {
  return cfg.charges.baseMax + cfg.charges.maxPerLevel * Math.max(0, level - 1);
}

export function rechargeSec(cfg: GameConfig, level: number): number {
  const raw = cfg.charges.baseRechargeSec * Math.pow(cfg.charges.rechargeFactor, Math.max(0, level - 1));
  return Math.max(cfg.charges.minRechargeSec, raw);
}

export function chargeMaxCost(cfg: GameConfig, level: number): number {
  return geometricCost(cfg.charges.maxCost, cfg.charges.maxCostGrowth, level);
}

export function rechargeCost(cfg: GameConfig, level: number): number {
  return geometricCost(cfg.charges.rechargeCost, cfg.charges.rechargeCostGrowth, level);
}

// --- Abilities -------------------------------------------------------------

export function abilityConfig(cfg: GameConfig, id: AbilityId): AbilityConfig {
  return cfg.abilities[id];
}

/** Damage of one impact (or one second of burning, for napalm). 0 when locked. */
export function abilityDamage(cfg: GameConfig, id: AbilityId, level: number): number {
  if (level <= 0) return 0;
  const a = cfg.abilities[id];
  return a.baseDamage * Math.pow(a.damageGrowth, level - 1);
}

export function abilityCooldown(cfg: GameConfig, id: AbilityId, level: number): number {
  const a = cfg.abilities[id];
  const raw = a.baseCooldownSec - a.cooldownPerLevel * Math.max(0, level - 1);
  return Math.max(a.minCooldownSec, raw);
}

/** Credits to unlock (level 0) or to buy the next level. */
export function abilityCost(cfg: GameConfig, id: AbilityId, level: number): number {
  const a = cfg.abilities[id];
  return Math.round(a.unlockCost * Math.pow(a.costGrowth, level));
}

/** Total damage a cast puts on the ground, for the UI. */
export function abilityTotalDamage(cfg: GameConfig, id: AbilityId, level: number): number {
  if (level <= 0) return 0;
  const a = cfg.abilities[id];
  const per = abilityDamage(cfg, id, level);
  return a.burnSec > 0 ? per * a.burnSec : per * a.shells;
}

// --- Enemy scaling ---------------------------------------------------------

/**
 * Two-stage growth: gentle while the player is still assembling a force, then
 * steeper from `lateFromWave` on, where their upgrade tracks start compounding.
 */
function stagedScale(wave: number, early: number, late: number, from: number): number {
  const w = Math.max(1, wave);
  if (w <= from) return Math.pow(early, w - 1);
  return Math.pow(early, from - 1) * Math.pow(late, w - from);
}

export function waveHpScale(cfg: GameConfig, wave: number): number {
  return stagedScale(wave, cfg.waves.hpScaleGrowth, cfg.waves.lateHpScaleGrowth, cfg.waves.lateFromWave);
}

export function waveDamageScale(cfg: GameConfig, wave: number): number {
  return stagedScale(
    wave,
    cfg.waves.damageScaleGrowth,
    cfg.waves.lateDamageScaleGrowth,
    cfg.waves.lateFromWave,
  );
}

export function waveBountyScale(cfg: GameConfig, wave: number): number {
  return stagedScale(
    wave,
    cfg.waves.bountyScaleGrowth,
    cfg.waves.lateBountyScaleGrowth,
    cfg.waves.lateFromWave,
  );
}

export function waveBudget(cfg: GameConfig, wave: number): number {
  const raw = cfg.waves.baseBudget * Math.pow(cfg.waves.budgetGrowth, Math.max(0, wave - 1));
  return Math.min(cfg.waves.maxBudget, raw);
}

// --- Damage ----------------------------------------------------------------

/**
 * Armor soaks flat damage, but never all of it: a fraction always lands, so
 * swarms of cheap shooters stay relevant against heavy armour (just bad at it).
 */
export function applyArmor(cfg: GameConfig, damage: number, armor: number): number {
  return Math.max(damage * cfg.sim.minDamageFraction, damage - armor);
}

// --- Idle layer ------------------------------------------------------------

/** Passive credits per second, from the furthest wave you have cleared. */
export function incomePerSec(cfg: GameConfig, bestWave: number): number {
  return cfg.idle.baseCreditsPerSec * Math.pow(cfg.idle.incomeGrowth, Math.max(0, bestWave));
}

/** Convenience: the cost of a player unit's unlock. */
export function unitUnlockCost(id: PlayerUnitId): number {
  return PLAYER_UNITS[id].unlockCost;
}

/** Total DPS of the static defense line, for the UI. */
export function totalTowerDps(cfg: GameConfig, state: SimState): number {
  return towerDps(cfg, state.upgrades.towers) * state.towers.length;
}
