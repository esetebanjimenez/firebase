/**
 * waves.ts — wave composition, enemy scheduling, and unit construction.
 *
 * `planWave` is pure in cfg and the wave number (it derives its own RNG stream
 * from the seed), which means the "next wave" preview in the UI is the very
 * wave you will fight — and that re-fighting a lost wave gives you the same
 * fight to plan against, not a reroll.
 */

import type { GameConfig } from './config';
import { playerUnitStats, waveBountyScale, waveDamageScale, waveHpScale, waveBudget } from './derive';
import { RngStream, deriveSeed } from './rng';
import { ENEMY_UNITS, FACTIONS, FACTION_ORDER, PLAYER_UNITS, bossFor, rosterFor } from './roster';
import type { EnemyUnitDef } from './roster';
import type { EnemyUnitId, FactionId, PlayerUnitId, QueuedSpawn, SimState, Unit } from './types';

export interface WaveComposition {
  readonly kind: EnemyUnitId;
  readonly count: number;
}

export interface WavePlan {
  readonly wave: number;
  readonly factions: readonly FactionId[];
  readonly spawns: readonly QueuedSpawn[];
  readonly composition: readonly WaveComposition[];
  readonly boss: boolean;
  /** Total effective HP walking on — the UI's "threat" readout. */
  readonly totalHp: number;
  /** Total credits on the field if you kill everything. */
  readonly totalBounty: number;
}

/** Armies that have shown up by this wave. */
export function availableFactions(wave: number): FactionId[] {
  return FACTION_ORDER.filter((f) => wave >= FACTIONS[f].fromWave);
}

/** Which army (or two) attacks on a given wave. */
export function factionsForWave(cfg: GameConfig, wave: number): FactionId[] {
  const available = availableFactions(wave);
  const primary = available[(wave - 1) % available.length];
  if (wave < cfg.waves.mixFromWave || available.length < 2) return [primary];
  const secondary = available[wave % available.length];
  return secondary === primary ? [primary] : [primary, secondary];
}

/** Spend a point budget on one army's roster: a few heavies, then a crowd. */
function pickUnits(roster: EnemyUnitDef[], budget: number, maxUnits: number, rng: RngStream): EnemyUnitDef[] {
  const picks: EnemyUnitDef[] = [];
  if (roster.length === 0) return picks;
  const cheapest = roster[0].cost;
  let left = budget;

  // Heavies first, from the costliest two affordable kinds, up to a share of
  // the budget — this is what keeps late waves from being pure chaff.
  let heavyLeft = budget * 0.45;
  while (heavyLeft >= cheapest && picks.length < maxUnits) {
    const affordable = roster.filter((d) => d.cost <= Math.min(heavyLeft, left));
    if (affordable.length === 0) break;
    const top = affordable.slice(-2);
    const def = rng.pick(top);
    picks.push(def);
    heavyLeft -= def.cost;
    left -= def.cost;
  }

  // The rest goes on numbers, weighted toward cheap kinds.
  while (left >= cheapest && picks.length < maxUnits) {
    const affordable = roster.filter((d) => d.cost <= left);
    if (affordable.length === 0) break;
    const weights = affordable.map((d) => 1 / d.cost);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.float() * total;
    let def = affordable[affordable.length - 1];
    for (let i = 0; i < affordable.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        def = affordable[i];
        break;
      }
    }
    picks.push(def);
    left -= def.cost;
  }

  return picks;
}

export function planWave(cfg: GameConfig, wave: number): WavePlan {
  const rng = new RngStream(deriveSeed(cfg.seed, wave));
  const factions = factionsForWave(cfg, wave);
  const isBossWave = wave % cfg.waves.bossEvery === 0;
  const budget = waveBudget(cfg, wave) * (isBossWave ? cfg.waves.bossBudgetFactor : 1);
  const hpScale = waveHpScale(cfg, wave);
  const damageScale = waveDamageScale(cfg, wave);
  const bountyScale = waveBountyScale(cfg, wave);

  // Split the budget when two armies attack together.
  const shares = factions.length === 2 ? [0.65, 0.35] : [1];
  const defs: EnemyUnitDef[] = [];
  for (let i = 0; i < factions.length; i++) {
    const roster = rosterFor(factions[i], wave);
    const slots = Math.max(1, Math.floor(cfg.waves.maxUnits / factions.length));
    defs.push(...pickUnits(roster, budget * shares[i], slots, rng));
  }

  let boss = false;
  if (isBossWave) {
    const b = bossFor(factions[0]);
    if (b && b.fromWave <= wave) {
      defs.push(b);
      boss = true;
    }
  }

  // Schedule: clumps of up to groupSize walk on together, spread over the
  // spawn window, each clump arriving around a shared x so they read as a squad.
  const { field, waves } = cfg;
  const spawns: QueuedSpawn[] = [];
  const groups = Math.max(1, Math.ceil(defs.length / waves.groupSize));
  for (let g = 0; g < groups; g++) {
    const members = defs.slice(g * waves.groupSize, (g + 1) * waves.groupSize);
    if (members.length === 0) continue;
    const at = groups === 1 ? 0 : (g / (groups - 1 || 1)) * waves.spawnWindowSec;
    const anchorX = field.sideMargin + rng.float() * (field.width - field.sideMargin * 2);
    for (const def of members) {
      const x = Math.min(
        field.width - field.sideMargin,
        Math.max(field.sideMargin, anchorX + rng.spread(18)),
      );
      spawns.push({ kind: def.id, x, at: at + rng.float() * 0.4, hpScale, damageScale, bountyScale });
    }
  }
  spawns.sort((a, b) => a.at - b.at);

  // Preview data.
  const counts = new Map<EnemyUnitId, number>();
  let totalHp = 0;
  let totalBounty = 0;
  for (const def of defs) {
    counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
    totalHp += def.hp * hpScale;
    totalBounty += def.bounty * bountyScale;
  }
  const composition = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => ENEMY_UNITS[a.kind].cost - ENEMY_UNITS[b.kind].cost);

  return { wave, factions, spawns, composition, boss, totalHp, totalBounty };
}

// ---------------------------------------------------------------------------
// Unit construction
// ---------------------------------------------------------------------------

interface MakeUnitArgs {
  readonly id: number;
  readonly team: Unit['team'];
  readonly kind: Unit['kind'];
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly damage: number;
  readonly speed: number;
  readonly bounty: number;
  readonly aim: number;
  readonly spawnPeriod: number;
  readonly spawnKind: EnemyUnitId | null;
}

function makeUnit(args: MakeUnitArgs, stats: typeof PLAYER_UNITS[PlayerUnitId] | EnemyUnitDef): Unit {
  return {
    id: args.id,
    team: args.team,
    kind: args.kind,
    x: args.x,
    y: args.y,
    hp: args.hp,
    maxHp: args.hp,
    speed: args.speed,
    damage: args.damage,
    armor: stats.armor,
    range: stats.range,
    attackPeriod: stats.attackPeriod,
    cooldown: 0,
    style: stats.style,
    projectile: stats.projectile,
    projectileSpeed: stats.projectileSpeed,
    splashRadius: stats.splashRadius,
    siegeBonus: stats.siegeBonus,
    radius: stats.radius,
    bounty: args.bounty,
    wallFocused: 'wallFocused' in stats ? stats.wallFocused === true : false,
    spawnPeriod: args.spawnPeriod,
    spawnIn: args.spawnPeriod,
    spawnKind: args.spawnKind,
    targetId: null,
    retargetIn: 0,
    aim: args.aim,
    anim: 0,
    flash: 0,
  };
}

/** Deploy one of your soldiers in the gate mouth. Mutates the id counter. */
export function createPlayerUnit(state: SimState, cfg: GameConfig, kind: PlayerUnitId): Unit {
  const def = PLAYER_UNITS[kind];
  const stats = playerUnitStats(cfg, state.unitLevels, kind);
  const rng = new RngStream(state.rngState);
  const x = cfg.field.gateX + rng.spread(cfg.field.gateHalfWidth * 0.6);
  state.rngState = rng.state;
  return makeUnit(
    {
      id: state.nextId++,
      team: 'player',
      kind,
      x,
      y: cfg.field.wallTop - cfg.sim.gateSpawnOffset,
      hp: stats.hp,
      damage: stats.damage,
      speed: stats.speed,
      bounty: 0,
      aim: -Math.PI / 2,
      spawnPeriod: 0,
      spawnKind: null,
    },
    def,
  );
}

/** Walk a scheduled enemy onto the field. */
export function createEnemyUnit(state: SimState, cfg: GameConfig, q: QueuedSpawn): Unit {
  const def = ENEMY_UNITS[q.kind];
  const rng = new RngStream(state.rngState);
  const y = cfg.field.spawnTop + rng.float() * (cfg.field.spawnBottom - cfg.field.spawnTop);
  state.rngState = rng.state;
  return makeUnit(
    {
      id: state.nextId++,
      team: 'enemy',
      kind: q.kind,
      x: q.x,
      y,
      hp: def.hp * q.hpScale,
      damage: def.damage * q.damageScale,
      speed: def.speed,
      bounty: def.bounty * q.bountyScale,
      aim: Math.PI / 2,
      spawnPeriod: def.spawnPeriod ?? 0,
      spawnKind: def.spawnKind ?? null,
    },
    def,
  );
}

/**
 * Raise a minion next to its summoner. Scaled by the wave being fought, so a
 * necromancer's skeletons are as dangerous as the rest of that wave.
 */
export function createRaisedUnit(
  state: SimState,
  cfg: GameConfig,
  kind: EnemyUnitId,
  x: number,
  y: number,
): Unit {
  const def = ENEMY_UNITS[kind];
  const rng = new RngStream(state.rngState);
  const ox = x + rng.spread(8);
  const oy = y + rng.spread(6);
  state.rngState = rng.state;
  return makeUnit(
    {
      id: state.nextId++,
      team: 'enemy',
      kind,
      x: Math.min(cfg.field.width - cfg.field.sideMargin, Math.max(cfg.field.sideMargin, ox)),
      y: Math.max(0, oy),
      hp: def.hp * waveHpScale(cfg, state.wave),
      damage: def.damage * waveDamageScale(cfg, state.wave),
      speed: def.speed,
      bounty: def.bounty * waveBountyScale(cfg, state.wave),
      aim: Math.PI / 2,
      spawnPeriod: def.spawnPeriod ?? 0,
      spawnKind: def.spawnKind ?? null,
    },
    def,
  );
}


