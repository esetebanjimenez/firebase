/**
 * useGameLoop.ts — bridge between the plain-TS simulation and React/Pixi.
 *
 * Owns the authoritative SimState in a ref (read by the renderer every frame),
 * drives engine.step from a fixed-timestep accumulator, publishes a throttled
 * UI snapshot, loads/saves to localStorage with offline progress on mount, and
 * exposes player actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyOfflineProgress,
  barrierRepairCost,
  barrierUpgradeCost,
  canUseFireSupport,
  createInitialState,
  defaultConfig,
  firepowerDps,
  firepowerUpgradeCost,
  fireSupportCooldown,
  fireSupportUpgradeCost,
  repairBarrier as simRepair,
  sendNextWave as simSend,
  step,
  upgradeBarrier as simUpBarrier,
  upgradeFireSupport as simUpFire,
  upgradeFirepower as simUpFire2,
  useFireSupport as simUseFire,
  waveCount,
} from '../sim';
import type { GameConfig, SimEvent, SimState, Sitrep } from '../sim';
import { clearSave, loadGame, saveGame } from './storage';

const FIXED_DT = 1 / 30;
const MAX_FRAME = 0.25;
const SNAPSHOT_MS = 100;
const AUTOSAVE_MS = 5000;

export interface UiSnapshot {
  day: number;
  supply: number;
  firepower: { level: number; dps: number; upgradeCost: number };
  barrier: {
    level: number;
    hp: number;
    maxHp: number;
    pct: number;
    upgradeCost: number;
    repairCost: number;
    down: boolean;
  };
  fireSupport: {
    level: number;
    unlocked: boolean;
    upgradeCost: number;
    ready: boolean;
    cooldownRemaining: number;
    cooldownTotal: number;
  };
  wave: { index: number; inProgress: boolean; timerSec: number; nextCount: number };
  enemyCount: number;
  totalKills: number;
  bestDay: number;
}

export interface GameActions {
  upgradeFirepower: () => void;
  upgradeBarrier: () => void;
  upgradeFireSupport: () => void;
  repairBarrier: () => void;
  useFireSupport: () => void;
  sendNextWave: () => void;
  hardReset: () => void;
}

function buildSnapshot(s: SimState, cfg: GameConfig): UiSnapshot {
  const fsLevel = s.fireSupport.level;
  return {
    day: s.day,
    supply: Math.floor(s.supply),
    firepower: {
      level: s.firepowerLevel,
      dps: Math.round(firepowerDps(cfg, s.firepowerLevel)),
      upgradeCost: firepowerUpgradeCost(cfg, s),
    },
    barrier: {
      level: s.barrier.level,
      hp: Math.ceil(s.barrier.hp),
      maxHp: Math.round(s.barrier.maxHp),
      pct: s.barrier.maxHp > 0 ? Math.max(0, s.barrier.hp / s.barrier.maxHp) : 0,
      upgradeCost: barrierUpgradeCost(cfg, s),
      repairCost: barrierRepairCost(cfg, s),
      down: s.barrier.hp <= 0,
    },
    fireSupport: {
      level: fsLevel,
      unlocked: fsLevel > 0,
      upgradeCost: fireSupportUpgradeCost(cfg, s),
      ready: canUseFireSupport(s),
      cooldownRemaining: Math.max(0, s.fireSupport.cooldownRemaining),
      cooldownTotal: fsLevel > 0 ? fireSupportCooldown(cfg, fsLevel) : 0,
    },
    wave: {
      index: s.wave.index,
      inProgress: s.wave.inProgress,
      timerSec: Math.max(0, s.wave.timerSec),
      nextCount: waveCount(cfg, s.day + 1),
    },
    enemyCount: s.enemies.length,
    totalKills: s.stats.totalKills,
    bestDay: s.stats.bestDay,
  };
}

export interface UseGameLoop {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  snapshot: UiSnapshot;
  actions: GameActions;
  sitrep: Sitrep | null;
  dismissSitrep: () => void;
  config: GameConfig;
}

export function useGameLoop(cfg: GameConfig = defaultConfig): UseGameLoop {
  const init = useMemo(() => {
    const loaded = loadGame(cfg);
    if (loaded) {
      const sit = applyOfflineProgress(loaded.state, cfg, Date.now() - loaded.savedAt);
      return { state: loaded.state, sitrep: sit.wavesResolved > 0 ? sit : null };
    }
    return { state: createInitialState(cfg), sitrep: null };
  }, [cfg]);

  const stateRef = useRef<SimState>(init.state);
  const fxRef = useRef<SimEvent[]>([]);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(() => buildSnapshot(init.state, cfg));
  const [sitrep, setSitrep] = useState<Sitrep | null>(init.sitrep);

  const publish = useCallback(() => setSnapshot(buildSnapshot(stateRef.current, cfg)), [cfg]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sinceSnap = 0;
    let sinceSave = 0;

    const tick = (now: number) => {
      let frame = (now - last) / 1000;
      last = now;
      if (frame > MAX_FRAME) frame = MAX_FRAME;
      acc += frame;
      while (acc >= FIXED_DT) {
        const ev = step(stateRef.current, FIXED_DT, cfg);
        if (ev.length) fxRef.current.push(...ev);
        acc -= FIXED_DT;
      }
      sinceSnap += frame;
      if (sinceSnap * 1000 >= SNAPSHOT_MS) {
        sinceSnap = 0;
        publish();
      }
      sinceSave += frame;
      if (sinceSave * 1000 >= AUTOSAVE_MS) {
        sinceSave = 0;
        saveGame(stateRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onHide = () => saveGame(stateRef.current);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      saveGame(stateRef.current);
    };
  }, [cfg, publish]);

  const actions = useMemo<GameActions>(
    () => ({
      upgradeFirepower: () => {
        if (simUpFire2(stateRef.current, cfg)) publish();
      },
      upgradeBarrier: () => {
        if (simUpBarrier(stateRef.current, cfg)) publish();
      },
      upgradeFireSupport: () => {
        if (simUpFire(stateRef.current, cfg)) publish();
      },
      repairBarrier: () => {
        if (simRepair(stateRef.current, cfg)) publish();
      },
      useFireSupport: () => {
        const ev = simUseFire(stateRef.current, cfg);
        if (ev.length) {
          fxRef.current.push(...ev);
          publish();
        }
      },
      sendNextWave: () => {
        if (simSend(stateRef.current)) publish();
      },
      hardReset: () => {
        clearSave();
        stateRef.current = createInitialState(cfg);
        fxRef.current = [];
        setSitrep(null);
        publish();
      },
    }),
    [cfg, publish],
  );

  const dismissSitrep = useCallback(() => setSitrep(null), []);

  return { stateRef, fxRef, snapshot, actions, sitrep, dismissSitrep, config: cfg };
}
