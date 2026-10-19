/**
 * useGameLoop.ts — the bridge between the plain-TS simulation and React.
 *
 * Owns the authoritative SimState in a ref (the renderer reads it every frame),
 * advances it on a fixed timestep from a rAF accumulator, and publishes a
 * throttled, fully-derived snapshot for the UI — so no React component ever
 * recomputes a cost or a DPS figure, and no re-render is tied to frame rate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PLAYER_UNITS,
  PLAYER_UNIT_ORDER,
  FACTIONS,
  ENEMY_UNITS,
  abilityCooldown,
  abilityCost,
  abilityTotalDamage,
  applyOfflineProgress,
  automationCost,
  buyAbility,
  buyUpgrade,
  canCast,
  canDeploy,
  castAbility,
  chargeMax,
  clearResult,
  createInitialState,
  defaultConfig,
  deployUnit,
  launchWave,
  planWave,
  playerUnitStats,
  rechargeSec,
  selectAbility,
  selectUnit,
  step,
  syncDerived,
  toggleAutomation,
  towerCount,
  towerDps,
  uncoveredStrip,
  trackCost,
  unitLevelCost,
  unlockAutomation,
  unlockUnit,
  upgradeUnit,
  wallMaxHp,
  incomePerSec,
} from '../sim';
import type {
  AbilityId,
  AutomationId,
  GameConfig,
  IdleReport,
  PlayerUnitId,
  SimEvent,
  SimState,
  UpgradeTrack,
  WaveResult,
} from '../sim';
import { clearSave, loadGame, saveGame } from './storage';

const FIXED_DT = 1 / 30;
const MAX_FRAME = 0.25;
const SNAPSHOT_MS = 100;
const AUTOSAVE_MS = 5000;

export interface UpgradeView {
  track: UpgradeTrack;
  label: string;
  detail: string;
  level: number;
  cost: number;
  affordable: boolean;
}

export interface UnitView {
  id: PlayerUnitId;
  name: string;
  short: string;
  blurb: string;
  unlocked: boolean;
  unlockCost: number;
  affordable: boolean;
  /** This kind's own level, and what the next one costs. */
  level: number;
  upgradeCost: number;
  upgradeAffordable: boolean;
  chargeCost: number;
  selected: boolean;
  deployable: boolean;
  hp: number;
  dps: number;
  range: number;
  colors: readonly [string, string, string, string, string];
}

export interface AbilityView {
  id: AbilityId;
  name: string;
  blurb: string;
  level: number;
  unlocked: boolean;
  cost: number;
  affordable: boolean;
  selected: boolean;
  ready: boolean;
  cooldown: number;
  cooldownTotal: number;
  damage: number;
  radius: number;
}

export interface WavePreview {
  wave: number;
  /** Set for hand-written waves: a name to put on the launch button. */
  label: string | null;
  armies: string[];
  accent: string;
  boss: boolean;
  count: number;
  threat: number;
  payout: number;
  composition: { name: string; count: number }[];
}

export interface UiSnapshot {
  credits: number;
  incomePerSec: number;
  wave: number;
  bestWave: number;
  phase: 'prep' | 'battle';
  wall: { level: number; hp: number; maxHp: number; pct: number };
  towers: { level: number; count: number; dps: number; uncoveredRows: number };
  charges: { current: number; max: number; rechargeProgress: number; rechargeSec: number };
  upgrades: UpgradeView[];
  units: UnitView[];
  abilities: AbilityView[];
  automation: {
    autoDeploy: { unlocked: boolean; enabled: boolean; cost: number; affordable: boolean };
    autoLaunch: { unlocked: boolean; enabled: boolean; cost: number; affordable: boolean };
  };
  battle: { enemiesLeft: number; soldiers: number; timeSec: number; incoming: number };
  preview: WavePreview;
  result: WaveResult | null;
  /** What a lost wave was teaching, if it was teaching anything. */
  resultHint: string | null;
  stats: { kills: number; wavesWon: number; wavesLost: number };
}

export interface GameActions {
  buy: (track: UpgradeTrack) => void;
  unlock: (id: PlayerUnitId) => void;
  levelUp: (id: PlayerUnitId) => void;
  select: (id: PlayerUnitId) => void;
  buyAbility: (id: AbilityId) => void;
  armAbility: (id: AbilityId | null) => void;
  castAt: (x: number, y: number) => void;
  deploy: (id?: PlayerUnitId) => void;
  launch: () => void;
  automate: (id: AutomationId) => void;
  toggle: (id: AutomationId) => void;
  dismissResult: () => void;
  hardReset: () => void;
}

const TRACK_LABELS: Record<UpgradeTrack, string> = {
  wall: 'Wall',
  towers: 'Towers',
  charges: 'Charge Pool',
  recharge: 'Recharge',
};

function buildUpgrades(state: SimState, cfg: GameConfig): UpgradeView[] {
  const tracks: UpgradeTrack[] = ['wall', 'towers', 'charges', 'recharge'];
  return tracks.map((track) => {
    const level = state.upgrades[track];
    const cost = trackCost(cfg, state, track);
    let detail: string;
    switch (track) {
      case 'wall':
        detail = `${Math.round(wallMaxHp(cfg, level))} → ${Math.round(wallMaxHp(cfg, level + 1))} hp`;
        break;
      case 'towers': {
        const built = towerCount(cfg, level);
        const next = towerCount(cfg, level + 1);
        detail =
          next > built
            ? `builds gun ${next} of ${cfg.field.towerX.length}` +
              ` · ${towerDps(cfg, level + 1).toFixed(1)} dps each`
            : `${towerDps(cfg, level).toFixed(1)} → ${towerDps(cfg, level + 1).toFixed(1)} dps each` +
              ` · strip ${Math.round(uncoveredStrip(cfg, level))} → ${Math.round(uncoveredStrip(cfg, level + 1))}`;
        break;
      }
      case 'charges':
        detail = `${chargeMax(cfg, level)} → ${chargeMax(cfg, level + 1)} charges`;
        break;
      case 'recharge':
        detail = `${rechargeSec(cfg, level).toFixed(1)}s → ${rechargeSec(cfg, level + 1).toFixed(1)}s`;
        break;
    }
    return {
      track,
      label: TRACK_LABELS[track],
      detail,
      level,
      cost,
      affordable: state.credits >= cost,
    };
  });
}

function buildUnits(state: SimState, cfg: GameConfig): UnitView[] {
  return PLAYER_UNIT_ORDER.map((id) => {
    const def = PLAYER_UNITS[id];
    const stats = playerUnitStats(cfg, state.unitLevels, id);
    const upgradeCost = unitLevelCost(cfg, state, id);
    return {
      id,
      name: def.name,
      short: def.short,
      blurb: def.blurb,
      unlocked: state.unlocked[id],
      unlockCost: def.unlockCost,
      affordable: state.credits >= def.unlockCost,
      level: state.unitLevels[id],
      upgradeCost,
      upgradeAffordable: state.unlocked[id] && state.credits >= upgradeCost,
      chargeCost: def.chargeCost,
      selected: state.selectedUnit === id,
      deployable: canDeploy(state, cfg, id),
      hp: Math.round(stats.hp),
      dps: stats.dps,
      range: def.range,
      colors: def.colors,
    };
  });
}

function buildAbilities(state: SimState, cfg: GameConfig): AbilityView[] {
  const ids: AbilityId[] = ['artillery', 'barrage', 'napalm'];
  return ids.map((id) => {
    const ac = cfg.abilities[id];
    const level = state.abilities[id].level;
    return {
      id,
      name: ac.name,
      blurb: ac.blurb,
      level,
      unlocked: level > 0,
      cost: abilityCost(cfg, id, level),
      affordable: state.credits >= abilityCost(cfg, id, level),
      selected: state.selectedAbility === id,
      ready: canCast(state, id),
      cooldown: Math.max(0, state.abilities[id].cooldown),
      cooldownTotal: level > 0 ? abilityCooldown(cfg, id, level) : 0,
      damage: abilityTotalDamage(cfg, id, level),
      radius: ac.radius,
    };
  });
}

function buildPreview(state: SimState, cfg: GameConfig): WavePreview {
  const plan = planWave(cfg, state.wave);
  return {
    wave: state.wave,
    label: plan.label,
    armies: plan.factions.map((f) => FACTIONS[f].name),
    accent: FACTIONS[plan.factions[0]].accent,
    boss: plan.boss,
    count: plan.spawns.length,
    threat: Math.round(plan.totalHp),
    payout: Math.round(plan.totalBounty),
    composition: plan.composition.map((c) => ({ name: ENEMY_UNITS[c.kind].name, count: c.count })),
  };
}

function buildSnapshot(state: SimState, cfg: GameConfig): UiSnapshot {
  const rechargeTotal = rechargeSec(cfg, state.upgrades.recharge);
  return {
    credits: Math.floor(state.credits),
    incomePerSec: incomePerSec(cfg, state.bestWave),
    wave: state.wave,
    bestWave: state.bestWave,
    phase: state.phase,
    wall: {
      level: state.wall.level,
      hp: Math.ceil(state.wall.hp),
      maxHp: Math.round(state.wall.maxHp),
      pct: state.wall.maxHp > 0 ? Math.max(0, state.wall.hp / state.wall.maxHp) : 0,
    },
    towers: {
      level: state.upgrades.towers,
      count: state.towers.length,
      dps: towerDps(cfg, state.upgrades.towers) * state.towers.length,
      uncoveredRows: Math.round(uncoveredStrip(cfg, state.upgrades.towers)),
    },
    charges: {
      current: state.charges.current,
      max: state.charges.max,
      rechargeProgress:
        state.charges.current >= state.charges.max
          ? 1
          : Math.min(1, Math.max(0, 1 - state.charges.rechargeIn / rechargeTotal)),
      rechargeSec: rechargeTotal,
    },
    upgrades: buildUpgrades(state, cfg),
    units: buildUnits(state, cfg),
    abilities: buildAbilities(state, cfg),
    automation: {
      autoDeploy: {
        ...state.automation.autoDeploy,
        cost: automationCost(cfg, 'autoDeploy'),
        affordable: state.credits >= automationCost(cfg, 'autoDeploy'),
      },
      autoLaunch: {
        ...state.automation.autoLaunch,
        cost: automationCost(cfg, 'autoLaunch'),
        affordable: state.credits >= automationCost(cfg, 'autoLaunch'),
      },
    },
    battle: {
      enemiesLeft: state.units.filter((u) => u.team === 'enemy').length,
      soldiers: state.units.filter((u) => u.team === 'player').length,
      timeSec: state.battleTime,
      incoming: state.spawnQueue.length,
    },
    preview: buildPreview(state, cfg),
    result: state.lastResult,
    resultHint:
      state.lastResult && !state.lastResult.won ? planWave(cfg, state.lastResult.wave).hint : null,
    stats: {
      kills: state.stats.totalKills,
      wavesWon: state.stats.wavesWon,
      wavesLost: state.stats.wavesLost,
    },
  };
}

export interface UseGameLoop {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  snapshot: UiSnapshot;
  actions: GameActions;
  idleReport: IdleReport | null;
  dismissIdleReport: () => void;
  config: GameConfig;
}

export function useGameLoop(cfg: GameConfig = defaultConfig): UseGameLoop {
  const init = useMemo(() => {
    const loaded = loadGame(cfg);
    if (!loaded) return { state: createInitialState(cfg), report: null as IdleReport | null };
    syncDerived(loaded.state, cfg);
    const report = applyOfflineProgress(loaded.state, cfg, Date.now() - loaded.savedAt);
    return { state: loaded.state, report: report.creditsEarned >= 1 ? report : null };
  }, [cfg]);

  const stateRef = useRef<SimState>(init.state);
  const fxRef = useRef<SimEvent[]>([]);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(() => buildSnapshot(init.state, cfg));
  const [idleReport, setIdleReport] = useState<IdleReport | null>(init.report);

  const publish = useCallback(() => setSnapshot(buildSnapshot(stateRef.current, cfg)), [cfg]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let sinceSnapshot = 0;
    let sinceSave = 0;

    const tick = (now: number) => {
      const frame = Math.min(MAX_FRAME, (now - last) / 1000);
      last = now;
      accumulator += frame;
      while (accumulator >= FIXED_DT) {
        const events = step(stateRef.current, FIXED_DT, cfg);
        if (events.length > 0) fxRef.current.push(...events);
        accumulator -= FIXED_DT;
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

    const persist = () => saveGame(stateRef.current);
    document.addEventListener('visibilitychange', persist);
    window.addEventListener('pagehide', persist);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', persist);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [cfg, publish]);

  const actions = useMemo<GameActions>(
    () => ({
      buy: (track) => {
        if (buyUpgrade(stateRef.current, cfg, track)) publish();
      },
      unlock: (id) => {
        if (unlockUnit(stateRef.current, cfg, id)) publish();
      },
      levelUp: (id) => {
        if (upgradeUnit(stateRef.current, cfg, id)) publish();
      },
      select: (id) => {
        if (selectUnit(stateRef.current, id)) publish();
      },
      buyAbility: (id) => {
        if (buyAbility(stateRef.current, cfg, id)) publish();
      },
      armAbility: (id) => {
        if (selectAbility(stateRef.current, id)) publish();
      },
      castAt: (x, y) => {
        const state = stateRef.current;
        if (!state.selectedAbility) return;
        if (castAbility(state, cfg, state.selectedAbility, x, y)) publish();
      },
      deploy: (id) => {
        const state = stateRef.current;
        if (deployUnit(state, cfg, id ?? state.selectedUnit, fxRef.current)) publish();
      },
      launch: () => {
        if (launchWave(stateRef.current, cfg, fxRef.current)) publish();
      },
      automate: (id) => {
        if (unlockAutomation(stateRef.current, cfg, id)) publish();
      },
      toggle: (id) => {
        if (toggleAutomation(stateRef.current, id)) publish();
      },
      dismissResult: () => {
        clearResult(stateRef.current);
        publish();
      },
      hardReset: () => {
        clearSave();
        stateRef.current = createInitialState(cfg);
        fxRef.current = [];
        setIdleReport(null);
        publish();
      },
    }),
    [cfg, publish],
  );

  const dismissIdleReport = useCallback(() => setIdleReport(null), []);

  return { stateRef, fxRef, snapshot, actions, idleReport, dismissIdleReport, config: cfg };
}
