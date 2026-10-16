/**
 * Public API of the simulation core. UI, renderer, and game loop import only
 * from here.
 */

export * from './types';
export { defaultConfig } from './config';
export type { GameConfig, EnemyConfig } from './config';

export { createInitialState } from './state';
export { step, syncBarrierMax } from './engine';
export { applyOfflineProgress } from './offline';

export {
  firepowerDps,
  firepowerCost,
  barrierMaxHp,
  barrierRegen,
  barrierCost,
  repairCost,
  fireSupportDamage,
  fireSupportCooldown,
  fireSupportCost,
  enemyHp,
  enemyBounty,
  enemyAttackDps,
  waveCount,
  wallStanding,
} from './combat';

export {
  upgradeFirepower,
  upgradeBarrier,
  upgradeFireSupport,
  repairBarrier,
  useFireSupport,
  sendNextWave,
  canUseFireSupport,
  firepowerUpgradeCost,
  barrierUpgradeCost,
  fireSupportUpgradeCost,
  barrierRepairCost,
} from './actions';

export { serialize, deserialize } from './persistence';
export type { SaveEnvelope } from './persistence';
