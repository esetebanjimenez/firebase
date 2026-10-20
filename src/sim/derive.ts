/**
 * derive.ts — every derived number in one place.
 *
 * The live engine, the UI and the tests all read stats through these pure
 * functions, so they cannot disagree about what level 7 towers hit for or what
 * the next upgrade costs.
 */

import type { AbilityConfig, GameConfig } from './config';
import { PLAYER_UNITS, TOWER_WEAPONS } from './roster';
import type {
  AbilityId,
  BodyClass,
  DamageClass,
  PlayerUnitId,
  SimState,
  TowerWeaponId,
} from './types';

/**
 * What the next level of a track costs.
 *
 * Not the flat geometric curve (`base * growth^(level-1)`) an idle game
 * usually prices with: the growth rate itself grows. Step L to L+1 costs
 * `growth * escalation^(L-1)` times the step before it, so the exponent is
 * quadratic in the level and a wave's compounding takings buy levels on a
 * square-root curve rather than a straight line. Pass `escalation` 1 for the
 * plain geometric curve.
 */
export function levelCost(base: number, growth: number, escalation: number, level: number): number {
  const n = Math.max(0, level - 1);
  return Math.round(base * Math.pow(growth, n) * Math.pow(escalation, (n * (n - 1)) / 2));
}

// --- The wall ---------------------------------------------------------------

export function wallMaxHp(cfg: GameConfig, level: number): number {
  return Math.round(cfg.wall.baseMaxHp * Math.pow(cfg.wall.maxHpGrowth, Math.max(0, level - 1)));
}

export function wallUpgradeCost(cfg: GameConfig, level: number): number {
  return levelCost(cfg.wall.baseCost, cfg.wall.costGrowth, cfg.economy.costEscalation, level);
}

// --- Towers ----------------------------------------------------------------

/**
 * How many emplacements stand on the parapet at this tower level. Level 0 is
 * an empty wall: the guns are something you build, not something you start
 * with, so the early waves are the soldiers' job.
 */
export function towerCount(cfg: GameConfig, level: number): number {
  const built = Math.ceil(Math.max(0, level) / cfg.towers.emplacementEvery);
  return Math.min(cfg.field.towerX.length, built);
}

/** Where the guns bought so far stand, in the order they are built. */
export function towerPositions(cfg: GameConfig, level: number): number[] {
  return cfg.field.towerBuildOrder.slice(0, towerCount(cfg, level)).map((i) => cfg.field.towerX[i]);
}

/** What one shot from this gun does, at its own track's level. */
export function weaponDamage(weapon: TowerWeaponId, level: number): number {
  const def = TOWER_WEAPONS[weapon];
  return def.baseDamage * Math.pow(def.damageGrowth, Math.max(0, level - 1));
}

export function weaponDps(weapon: TowerWeaponId, level: number): number {
  return weaponDamage(weapon, level) / TOWER_WEAPONS[weapon].periodSec;
}

/** Credits for this gun's next level. Level 0 means it is not researched yet. */
export function weaponUpgradeCost(cfg: GameConfig, weapon: TowerWeaponId, level: number): number {
  const def = TOWER_WEAPONS[weapon];
  return levelCost(def.baseCost, def.costGrowth, cfg.economy.costEscalation, level + 1);
}

export function towerDamage(cfg: GameConfig, level: number): number {
  return cfg.towers.baseDamage * Math.pow(cfg.towers.damageGrowth, Math.max(0, level - 1));
}

export function towerPeriod(cfg: GameConfig, level: number): number {
  const raw = cfg.towers.basePeriodSec - cfg.towers.periodPerLevel * Math.max(0, level - 1);
  return Math.max(cfg.towers.minPeriodSec, raw);
}

/**
 * The rows at the top of the field the towers cannot reach. Siege parks here.
 * Levels claw a little of it back, but never all: the strip is what makes
 * siege a problem that tower investment cannot solve.
 */
export function uncoveredStrip(cfg: GameConfig, towerLevel: number): number {
  const t = cfg.towers;
  return Math.max(t.minStrip, t.baseUncoveredStrip - t.stripPerLevel * Math.max(0, towerLevel - 1));
}

/** The row below which the guns can reach: everything above it is the strip. */
export function coverEdgeY(cfg: GameConfig, towerLevel: number): number {
  return uncoveredStrip(cfg, towerLevel);
}

/** How far a tower shoots: far enough to cover the field down to the strip. */
export function towerRange(cfg: GameConfig, towerLevel: number): number {
  return cfg.field.towerY - uncoveredStrip(cfg, towerLevel);
}

/**
 * Where your soldiers hold. A line of their own, not a shadow of tower range —
 * far enough out to meet the horde away from the wall, and fixed, so tuning the
 * guns never drags the infantry with it.
 */
export function holdLineY(cfg: GameConfig): number {
  return cfg.field.wallTop - (cfg.field.wallTop - 0) * cfg.support.holdFraction;
}

/** Where an idle soldier forms up: a little behind the hold line. */
export function musterLineY(cfg: GameConfig): number {
  return Math.min(holdLineY(cfg) + cfg.support.musterInset, cfg.field.wallTop - cfg.sim.wallStandoff - 8);
}

/** Damage per second of a single tower — the headline number for the UI. */
export function towerDps(cfg: GameConfig, level: number): number {
  return towerDamage(cfg, level) / towerPeriod(cfg, level);
}

/**
 * Towers are the one track that starts at level 0, so the exponent is shifted:
 * the first gun costs the base price and every level after it compounds.
 */
export function towerUpgradeCost(cfg: GameConfig, level: number): number {
  return levelCost(cfg.towers.baseCost, cfg.towers.costGrowth, cfg.economy.costEscalation, level + 1);
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
  return levelCost(PLAYER_UNITS[id].upgradeCost, cfg.soldiers.costGrowth, cfg.economy.costEscalation, level);
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

// --- Intel ------------------------------------------------------------------

/**
 * The reveal ladder, in the order that makes each step actionable: what the
 * wave *is*, then what is in it, then how much of it, then exactly how much of
 * each.
 */
export const INTEL_MAX = 4;

export function intelUpgradeCost(cfg: GameConfig, level: number): number {
  return levelCost(cfg.intel.baseCost, cfg.intel.costGrowth, cfg.economy.costEscalation, level + 1);
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
  return levelCost(cfg.charges.maxCost, cfg.charges.maxCostGrowth, cfg.economy.costEscalation, level);
}

export function rechargeCost(cfg: GameConfig, level: number): number {
  return levelCost(cfg.charges.rechargeCost, cfg.charges.rechargeCostGrowth, cfg.economy.costEscalation, level);
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
  return levelCost(a.unlockCost, a.costGrowth, cfg.economy.costEscalation, level + 1);
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
 * Decelerating growth: `growth^((wave-1)^power)`. At power 1 this is the plain
 * geometric curve; below it every wave adds a smaller multiple than the one
 * before, which is the shape the player's own power now has.
 */
function decayingScale(wave: number, growth: number, power: number): number {
  return Math.pow(growth, Math.pow(Math.max(0, wave - 1), power));
}

export function waveHpScale(cfg: GameConfig, wave: number): number {
  return decayingScale(wave, cfg.waves.hpScaleGrowth, cfg.waves.statScalePower);
}

export function waveDamageScale(cfg: GameConfig, wave: number): number {
  return decayingScale(wave, cfg.waves.damageScaleGrowth, cfg.waves.statScalePower);
}

export function waveBountyScale(cfg: GameConfig, wave: number): number {
  return decayingScale(wave, cfg.waves.bountyScaleGrowth, cfg.waves.bountyScalePower);
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
/**
 * The counter triangle, as a multiplier. Returns 1 when there is nothing to
 * match against — your own soldiers have no body class, so enemy attacks are
 * never scaled by this.
 */
export function counterMultiplier(
  cfg: GameConfig,
  damage: DamageClass,
  body: BodyClass | null,
): number {
  if (!body) return 1;
  const matchup = cfg.counters.matchups[damage];
  if (matchup.strong === body) return cfg.counters.strong;
  if (matchup.weak === body) return cfg.counters.weak;
  return 1;
}

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
export function totalTowerDps(state: SimState): number {
  return state.towers.reduce(
    (sum, tower) => sum + weaponDps(tower.weapon, state.upgrades.weapons[tower.weapon]),
    0,
  );
}
