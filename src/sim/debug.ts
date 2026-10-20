/**
 * debug.ts — a run, written down.
 *
 * Balance work on this game is done by reading numbers, and the numbers that
 * matter are spread across the state, the roster and the derived curves: what
 * is owned, what the next level of it costs, what the waves behind the player
 * cost them, and what the wave in front is made of. This gathers them into one
 * JSON document the player can hand over.
 *
 * Pure, like the rest of `sim/`: it takes the state and returns an object. The
 * download — a Blob, a URL, an anchor — belongs to the layer that has a DOM.
 */

import type { GameConfig } from './config';
import {
  abilityCost,
  chargeMax,
  chargeMaxCost,
  incomePerSec,
  intelUpgradeCost,
  rechargeCost,
  rechargeSec,
  totalTowerDps,
  totalUpgradeLevels,
  towerUpgradeCost,
  unitUpgradeCost,
  wallMaxHp,
  wallUpgradeCost,
  weaponDps,
  weaponUpgradeCost,
} from './derive';
import { ABILITY_ORDER, PLAYER_UNITS, PLAYER_UNIT_ORDER, TOWER_WEAPON_ORDER } from './roster';
import { planWave, siegeAllowance } from './waves';
import type { SimState, WaveRecord } from './types';

export interface DebugReport {
  readonly generatedAt: string;
  readonly run: Record<string, unknown>;
  readonly upgrades: Record<string, unknown>;
  readonly nextCosts: Record<string, number>;
  readonly parapet: Record<string, unknown>;
  readonly nextWave: Record<string, unknown>;
  readonly waves: readonly WaveRecord[];
  readonly balance: Record<string, unknown>;
}

/**
 * @param now Wall-clock milliseconds, passed in rather than read, so the same
 *   state always produces the same report in a test.
 */
export function buildDebugReport(state: SimState, cfg: GameConfig, now: number): DebugReport {
  const plan = planWave(cfg, state.wave, state.seed);

  const nextCosts: Record<string, number> = {
    wall: wallUpgradeCost(cfg, state.upgrades.wall),
    towers: towerUpgradeCost(cfg, state.upgrades.towers),
    charges: chargeMaxCost(cfg, state.upgrades.charges),
    recharge: rechargeCost(cfg, state.upgrades.recharge),
    intel: intelUpgradeCost(cfg, state.upgrades.intel),
  };
  for (const weapon of TOWER_WEAPON_ORDER) {
    nextCosts[`gun.${weapon}`] = weaponUpgradeCost(cfg, weapon, state.upgrades.weapons[weapon]);
  }
  for (const id of PLAYER_UNIT_ORDER) {
    nextCosts[`unit.${id}`] = state.unlocked[id]
      ? unitUpgradeCost(cfg, id, Math.max(1, state.unitLevels[id]))
      : PLAYER_UNITS[id].unlockCost;
  }
  for (const id of ABILITY_ORDER) {
    nextCosts[`ability.${id}`] = abilityCost(cfg, id, state.abilities[id].level);
  }

  return {
    generatedAt: new Date(now).toISOString(),

    run: {
      seed: state.seed,
      wave: state.wave,
      bestWave: state.bestWave,
      phase: state.phase,
      credits: Math.floor(state.credits),
      incomePerSec: Number(incomePerSec(cfg, state.bestWave).toFixed(3)),
      totalCreditsEarned: Math.floor(state.stats.totalCreditsEarned),
      totalKills: state.stats.totalKills,
      wavesWon: state.stats.wavesWon,
      wavesLost: state.stats.wavesLost,
      attemptsPerWave:
        state.stats.wavesWon > 0
          ? Number(((state.stats.wavesWon + state.stats.wavesLost) / state.stats.wavesWon).toFixed(2))
          : null,
    },

    upgrades: {
      totalLevels: totalUpgradeLevels(state),
      wall: state.upgrades.wall,
      wallHp: Math.round(wallMaxHp(cfg, state.upgrades.wall)),
      towers: state.upgrades.towers,
      charges: state.upgrades.charges,
      chargeMax: chargeMax(cfg, state.upgrades.charges),
      recharge: state.upgrades.recharge,
      rechargeSec: Number(rechargeSec(cfg, state.upgrades.recharge).toFixed(2)),
      intel: state.upgrades.intel,
      guns: Object.fromEntries(
        TOWER_WEAPON_ORDER.map((weapon) => [
          weapon,
          {
            level: state.upgrades.weapons[weapon],
            dps: Number(weaponDps(weapon, state.upgrades.weapons[weapon]).toFixed(1)),
          },
        ]),
      ),
      units: Object.fromEntries(
        PLAYER_UNIT_ORDER.map((id) => [
          id,
          { unlocked: state.unlocked[id], level: state.unitLevels[id] },
        ]),
      ),
      abilities: Object.fromEntries(
        ABILITY_ORDER.map((id) => [id, state.abilities[id].level]),
      ),
      automation: {
        autoDeploy: state.automation.autoDeploy.unlocked,
        autoLaunch: state.automation.autoLaunch.unlocked,
      },
    },

    nextCosts,

    parapet: {
      pads: state.towers.map((t) => ({ x: Math.round(t.x), weapon: t.weapon })),
      totalDps: Number(totalTowerDps(state).toFixed(1)),
    },

    nextWave: {
      wave: plan.wave,
      shape: plan.shape,
      label: plan.label,
      factions: plan.factions,
      threat: Math.round(plan.totalHp),
      bounty: Math.round(plan.totalBounty),
      bodies: plan.spawns.length,
      firstArrival: Number(Math.min(...plan.spawns.map((q) => q.at)).toFixed(1)),
      lastArrival: Number(Math.max(...plan.spawns.map((q) => q.at)).toFixed(1)),
      siegeAllowed: siegeAllowance(cfg, plan.wave),
      composition: plan.composition,
    },

    waves: state.history,

    // The knobs the numbers above were produced by, so a report from an older
    // build can still be read against the tuning it was played on.
    balance: {
      configVersion: cfg.version,
      costEscalation: cfg.economy.costEscalation,
      hpPerPoint: cfg.waves.hpPerPoint,
      shapeThreat: cfg.waves.shapeThreat,
      statScalePower: cfg.waves.statScalePower,
      bountyScalePower: cfg.waves.bountyScalePower,
      hpScaleGrowth: cfg.waves.hpScaleGrowth,
      damageScaleGrowth: cfg.waves.damageScaleGrowth,
      bountyScaleGrowth: cfg.waves.bountyScaleGrowth,
      budgetGrowth: cfg.waves.budgetGrowth,
      maxBudget: cfg.waves.maxBudget,
      maxUnits: cfg.waves.maxUnits,
      siegeMax: cfg.waves.siegeMax,
      summonerMax: cfg.waves.summonerMax,
      breacherMax: cfg.waves.breacherMax,
      clumpGapSec: cfg.waves.clumpGapSec,
    },
  };
}

/** A filename that says what it is and sorts by when it was taken. */
export function debugReportName(state: SimState, now: number): string {
  const iso = new Date(now).toISOString();
  const day = iso.slice(0, 10).replace(/-/g, '');
  const time = iso.slice(11, 16).replace(':', '');
  return `iron-line-w${state.wave}-${day}-${time}.json`;
}
