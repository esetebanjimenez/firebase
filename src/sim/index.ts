/**
 * Public API of the simulation core. The UI, renderer, and game loop import
 * only from here, never from individual sim modules, so the internal layout can
 * change freely.
 */

export * from './types';
export { defaultConfig, RING_ORDER } from './config';
export type { GameConfig, RingConfig, EnemyConfig } from './config';

export { createInitialState } from './state';
export { step, innermostBuiltRing } from './engine';
export { applyOfflineProgress } from './offline';

export {
  ringDps,
  upgradeCost,
  repairCost,
  enemyHp,
  enemyBounty,
  waveCount,
  activeDps,
  activeRings,
  bandTransitSec,
} from './combat';

export {
  buyUpgrade,
  repairRing,
  sendNextWave,
  canUpgrade,
  canRepair,
  nextUpgradeCost,
} from './actions';

export { serialize, deserialize } from './persistence';
export type { SaveEnvelope } from './persistence';
