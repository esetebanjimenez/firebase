/** state.ts — build a fresh run from config. */

import type { GameConfig } from './config';
import { chargeMax, rechargeSec, wallMaxHp } from './derive';
import { PLAYER_UNITS, PLAYER_UNIT_ORDER } from './roster';
import { seedState } from './rng';
import type { AbilityId, PlayerUnitId, SimState, Tower } from './types';

const ABILITY_IDS: AbilityId[] = ['artillery', 'barrage', 'napalm'];

function initialTowers(cfg: GameConfig): Tower[] {
  return cfg.field.towerX.map((x, i) => ({ id: i + 1, x, y: cfg.field.towerY, cooldown: 0 }));
}

export function createInitialState(cfg: GameConfig, seed: number = cfg.seed): SimState {
  const wallHp = wallMaxHp(cfg, 1);
  const maxCharges = chargeMax(cfg, 1);

  const unlocked = {} as Record<PlayerUnitId, boolean>;
  const unitLevels = {} as Record<PlayerUnitId, number>;
  for (const id of PLAYER_UNIT_ORDER) {
    unlocked[id] = PLAYER_UNITS[id].unlockCost === 0;
    unitLevels[id] = unlocked[id] ? 1 : 0;
  }

  const abilities = {} as SimState['abilities'];
  for (const id of ABILITY_IDS) abilities[id] = { level: 0, cooldown: 0 };

  return {
    version: cfg.version,
    seed,
    rngState: seedState(seed),
    nextId: 1,

    credits: 0,
    wave: 1,
    bestWave: 0,
    phase: 'prep',

    wall: { level: 1, hp: wallHp, maxHp: wallHp },
    towers: initialTowers(cfg),
    upgrades: {
      wall: 1,
      towers: 1,
      charges: 1,
      recharge: 1,
    },
    unlocked,
    unitLevels,
    abilities,
    automation: {
      autoLaunch: { unlocked: false, enabled: false },
      autoDeploy: { unlocked: false, enabled: false },
    },

    units: [],
    projectiles: [],
    hazards: [],
    charges: { current: maxCharges, max: maxCharges, rechargeIn: rechargeSec(cfg, 1) },
    spawnQueue: [],
    battleTime: 0,
    battleCredits: 0,
    battleKills: 0,
    battleUnitsLost: 0,

    selectedUnit: 'rifleman',
    selectedAbility: null,

    autoLaunchIn: cfg.idle.autoLaunchDelaySec,
    lastResult: null,
    stats: { totalKills: 0, totalCreditsEarned: 0, wavesWon: 0, wavesLost: 0 },
  };
}
