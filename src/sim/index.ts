/**
 * The simulation's public API. The game loop, UI and renderer import only from
 * here, never from the modules directly.
 */

export * from './types';

export { defaultConfig } from './config';
export type { AbilityConfig, GameConfig } from './config';

export {
  ENEMY_UNITS,
  FACTIONS,
  FACTION_ORDER,
  PLAYER_UNITS,
  PLAYER_UNIT_ORDER,
  bossFor,
  rosterFor,
} from './roster';
export type { EnemyUnitDef, FactionDef, PlayerUnitDef, UnitStats } from './roster';

export {
  MAX_RANK,
  RANK_COLOR_COUNT,
  RANK_COLOR_NAMES,
  RANK_GEAR_STEPS,
  rankName,
  rankOfLevel,
  rankOfScale,
} from './ranks';
export type { Rank } from './ranks';

export { createInitialState } from './state';
export { startBattle, step, syncDerived } from './engine';
export { applyOfflineProgress } from './offline';
export { canCast, castAbility } from './abilities';

export {
  abilityCooldown,
  abilityCost,
  abilityDamage,
  abilityTotalDamage,
  applyArmor,
  chargeMax,
  chargeMaxCost,
  coverEdgeY,
  geometricCost,
  holdLineY,
  musterLineY,
  uncoveredStrip,
  incomePerSec,
  playerUnitStats,
  rechargeCost,
  rechargeSec,
  unitDamageMult,
  unitHpMult,
  unitSpeedMult,
  unitUpgradeCost,
  totalTowerDps,
  towerDamage,
  towerCount,
  towerDps,
  towerPositions,
  towerPeriod,
  towerRange,
  towerUpgradeCost,
  unitUnlockCost,
  wallMaxHp,
  wallUpgradeCost,
  waveBudget,
  waveBountyScale,
  waveDamageScale,
  waveHpScale,
} from './derive';

export {
  automationCost,
  buyAbility,
  buyUpgrade,
  canDeploy,
  chargeCost,
  clearResult,
  deployUnit,
  launchWave,
  selectAbility,
  selectUnit,
  toggleAutomation,
  trackCost,
  unitLevelCost,
  unlockAutomation,
  unlockUnit,
  upgradeUnit,
} from './actions';
export type { AutomationId, UpgradeTrack } from './actions';

export { availableFactions, factionsForWave, planWave } from './waves';
export { SCRIPTED_WAVES, scriptedWave } from './scripted';
export type { ScriptedWave } from './scripted';
export type { WaveComposition, WavePlan } from './waves';

export { deserialize, serialize, toSaveState } from './persistence';
export type { SaveEnvelope } from './persistence';
