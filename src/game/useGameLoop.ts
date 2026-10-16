/**
 * useGameLoop.ts — the bridge between the plain-TS simulation and React/Pixi.
 *
 * Responsibilities:
 *   - own the authoritative `SimState` in a ref (so the Pixi renderer can read
 *     it every frame without triggering React re-renders);
 *   - drive `engine.step` from a fixed-timestep accumulator (determinism);
 *   - publish a throttled, UI-friendly snapshot to React;
 *   - load/save to localStorage and apply offline progress on mount (SITREP);
 *   - expose player actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyOfflineProgress,
  buyUpgrade as simBuyUpgrade,
  canRepair,
  canUpgrade,
  createInitialState,
  defaultConfig,
  nextUpgradeCost,
  repairCost as simRepairCost,
  repairRing as simRepairRing,
  RING_ORDER,
  sendNextWave as simSendNextWave,
  step,
  waveCount,
} from '../sim';
import type { GameConfig, RingId, SimEvent, SimState, Sitrep } from '../sim';
import { clearSave, loadGame, saveGame } from './storage';

const FIXED_DT = 1 / 30; // seconds per simulation step
const MAX_FRAME = 0.25; // clamp real dt so a hitched frame can't spiral
const SNAPSHOT_MS = 100; // UI refresh cadence
const AUTOSAVE_MS = 5000;

export interface RingSnapshot {
  id: RingId;
  name: string;
  weapon: string;
  level: number;
  status: 'active' | 'down';
  /** Cost of the next build/upgrade. */
  upgradeCost: number;
  canUpgrade: boolean;
  canRepair: boolean;
  repairCost: number;
}

/** The read-only view the React UI renders from. */
export interface UiSnapshot {
  day: number;
  supply: number;
  rings: RingSnapshot[];
  wave: {
    index: number;
    inProgress: boolean;
    timerSec: number;
    /** Size of the wave that will arrive next (forecast). */
    nextCount: number;
  };
  daysHeldPaused: boolean;
  restoreTimerSec: number;
  totalKills: number;
  bestDay: number;
}

export interface GameActions {
  buyUpgrade: (ring: RingId) => void;
  repairRing: (ring: RingId) => void;
  sendNextWave: () => void;
  hardReset: () => void;
}

function buildSnapshot(state: SimState, cfg: GameConfig): UiSnapshot {
  return {
    day: state.day,
    supply: Math.floor(state.supply),
    rings: RING_ORDER.map((id) => ({
      id,
      name: cfg.rings[id].name,
      weapon: cfg.rings[id].weapon,
      level: state.rings[id].level,
      status: state.rings[id].status,
      upgradeCost: nextUpgradeCost(cfg, state, id),
      canUpgrade: canUpgrade(state, id),
      canRepair: canRepair(state, id),
      repairCost: simRepairCost(cfg, id),
    })),
    wave: {
      index: state.wave.index,
      inProgress: state.wave.inProgress,
      timerSec: Math.max(0, state.wave.timerSec),
      nextCount: waveCount(cfg, state.day + 1),
    },
    daysHeldPaused: state.daysHeldPaused,
    restoreTimerSec: Math.max(0, state.restoreTimerSec),
    totalKills: state.stats.totalKills,
    bestDay: state.stats.bestDay,
  };
}

export interface UseGameLoop {
  /** Live simulation state, for the renderer. Do not mutate from React. */
  stateRef: React.MutableRefObject<SimState>;
  /** FX event buffer; the renderer drains this each frame. */
  fxRef: React.MutableRefObject<SimEvent[]>;
  snapshot: UiSnapshot;
  actions: GameActions;
  /** Offline SITREP to show on return, or null. */
  sitrep: Sitrep | null;
  dismissSitrep: () => void;
  config: GameConfig;
}

export function useGameLoop(cfg: GameConfig = defaultConfig): UseGameLoop {
  // Initialise once: load save + apply offline progress, or start fresh.
  const init = useMemo(() => {
    const loaded = loadGame(cfg);
    if (loaded) {
      const elapsed = Date.now() - loaded.savedAt;
      const sit = applyOfflineProgress(loaded.state, cfg, elapsed);
      return { state: loaded.state, sitrep: sit.wavesResolved > 0 ? sit : null };
    }
    return { state: createInitialState(cfg), sitrep: null };
  }, [cfg]);

  const stateRef = useRef<SimState>(init.state);
  const fxRef = useRef<SimEvent[]>([]);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(() => buildSnapshot(init.state, cfg));
  const [sitrep, setSitrep] = useState<Sitrep | null>(init.sitrep);

  const publish = useCallback(() => {
    setSnapshot(buildSnapshot(stateRef.current, cfg));
  }, [cfg]);

  // The simulation + render-snapshot + autosave loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sinceSnapshot = 0;
    let sinceSave = 0;

    const tick = (now: number) => {
      let frame = (now - last) / 1000;
      last = now;
      if (frame > MAX_FRAME) frame = MAX_FRAME;
      acc += frame;

      while (acc >= FIXED_DT) {
        const events = step(stateRef.current, FIXED_DT, cfg);
        if (events.length) fxRef.current.push(...events);
        acc -= FIXED_DT;
      }

      sinceSnapshot += frame;
      if (sinceSnapshot * 1000 >= SNAPSHOT_MS) {
        sinceSnapshot = 0;
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
      buyUpgrade: (ring) => {
        if (simBuyUpgrade(stateRef.current, cfg, ring)) publish();
      },
      repairRing: (ring) => {
        if (simRepairRing(stateRef.current, cfg, ring)) publish();
      },
      sendNextWave: () => {
        if (simSendNextWave(stateRef.current)) publish();
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
