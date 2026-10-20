/**
 * waves.ts — wave composition, enemy scheduling, and unit construction.
 *
 * `planWave` is pure in cfg, the wave number and the run's seed (it derives its
 * own RNG stream from them), which means the "next wave" preview in the UI is
 * the very wave you will fight — and that re-fighting a lost wave gives you the
 * same fight to plan against, not a reroll.
 *
 * The seed is the *run's*, passed in rather than read from config, and it is
 * required rather than defaulted. It used to come from `cfg.seed`, a constant,
 * so every player in every playthrough met the same waves in the same order. A
 * default here would let that come back silently the next time someone adds a
 * caller, so there isn't one.
 */

import type { GameConfig } from './config';
import { playerUnitStats, waveBountyScale, waveDamageScale, waveHpScale, waveBudget } from './derive';
import { rankOfLevel, rankOfScale, type Rank } from './ranks';
import { RngStream, deriveSeed } from './rng';
import { ENEMY_UNITS, FACTIONS, FACTION_ORDER, PLAYER_UNITS, bossFor, rosterFor } from './roster';
import { scriptedWave } from './scripted';
import type { EnemyUnitDef } from './roster';
import type {
  BodyClass,
  EnemyUnitId,
  FactionId,
  PlayerUnitId,
  QueuedSpawn,
  SimState,
  Unit,
  WaveShape,
} from './types';

/** What each shape spends its budget on, and what answers it. */
export const SHAPES: Readonly<
  Record<WaveShape, { readonly favours: BodyClass | null; readonly label: string; readonly counter: string }>
> = {
  column: { favours: 'armored', label: 'Armoured column', counter: 'explosives' },
  horde: { favours: 'swarm', label: 'Horde', counter: 'sustained fire' },
  skirmish: { favours: 'elusive', label: 'Skirmish line', counter: 'rifles' },
  mixed: { favours: null, label: 'Mixed force', counter: 'a balanced force' },
};

/**
 * The shape of a given wave. Rolled from the run's seed and the wave number,
 * like everything else about a wave, so the preview is still a promise.
 */
export function shapeFor(cfg: GameConfig, wave: number, seed: number): WaveShape {
  if (wave < cfg.waves.shapeFromWave) return 'mixed';
  const rng = new RngStream(deriveSeed(seed, wave * 7919 + 17));
  return rng.pick(['column', 'horde', 'skirmish', 'mixed', 'mixed']);
}

export interface WaveComposition {
  readonly kind: EnemyUnitId;
  readonly count: number;
}

export interface WavePlan {
  readonly wave: number;
  /** Set for hand-written waves: a name, and what it is teaching. */
  readonly label: string | null;
  readonly hint: string | null;
  readonly factions: readonly FactionId[];
  readonly shape: WaveShape;
  /** How the wave's *threat* splits across the counter triangle, in hit points. */
  readonly classMix: Readonly<Record<BodyClass, number>>;
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

/**
 * Spend a point budget on one army's roster: a few heavies, then a crowd.
 *
 * `slots` is shared across the armies in a wave and is what keeps the two
 * open-ended kinds rare. Standoff engines are the costliest kinds in every
 * roster, so the heavy pass bought almost nothing else once the budget grew:
 * wave 35 fielded twenty-six of them. A handful of engines is a problem to go
 * and solve; a field of them is just a loss. Summoners are capped for the same
 * reason — see `summonerMax`.
 */
function pickUnits(
  roster: EnemyUnitDef[],
  budget: number,
  maxUnits: number,
  rng: RngStream,
  slots: WaveSlots,
  favours: BodyClass | null,
  bias: number,
): EnemyUnitDef[] {
  const picks: EnemyUnitDef[] = [];
  if (roster.length === 0) return picks;
  const cheapest = roster[0].cost;
  let left = budget;
  const breacher = (d: EnemyUnitDef) => d.wallFocused === true && d.standoff !== true;
  const allowed = () =>
    roster.filter(
      (d) =>
        (slots.siege > 0 || !d.standoff) &&
        (slots.summoners > 0 || d.spawnKind === undefined) &&
        (slots.breachers > 0 || !breacher(d)),
    );
  const take = (def: EnemyUnitDef) => {
    picks.push(def);
    if (def.standoff) slots.siege -= 1;
    if (def.spawnKind !== undefined) slots.summoners -= 1;
    if (breacher(def)) slots.breachers -= 1;
  };

  // Heavies first, from the costliest two affordable kinds, up to a share of
  // the budget — this is what keeps late waves from being pure chaff.
  let heavyLeft = budget * 0.45;
  while (heavyLeft >= cheapest && picks.length < maxUnits) {
    const affordable = allowed().filter((d) => d.cost <= Math.min(heavyLeft, left));
    if (affordable.length === 0) break;
    // A shaped wave takes its heavies from its own class most of the time.
    // Most, not always: a column of nothing but armour is a monoculture the
    // player answers with one unit, and a horde with no heavies at all never
    // fields siege. A shape is a tendency.
    const favoured = favours ? affordable.filter((d) => d.bodyClass === favours) : [];
    const pool = favoured.length > 0 && rng.float() < 0.85 ? favoured : affordable;
    const top = pool.slice(-2);
    const def = rng.pick(top);
    take(def);
    heavyLeft -= def.cost;
    left -= def.cost;
  }

  // The rest goes on numbers, weighted toward cheap kinds.
  while (left >= cheapest && picks.length < maxUnits) {
    const affordable = allowed().filter((d) => d.cost <= left);
    if (affordable.length === 0) break;
    const weights = affordable.map((d) => (1 / d.cost) * (favours && d.bodyClass === favours ? bias : 1));
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
    take(def);
    left -= def.cost;
  }

  return picks;
}

/** The open-ended kinds a wave has left to spend on, shared by its armies. */
interface WaveSlots {
  siege: number;
  summoners: number;
  breachers: number;
}

/** How many standoff siege engines a wave may field. */
export function siegeAllowance(cfg: GameConfig, wave: number): number {
  const w = cfg.waves;
  return Math.min(w.siegeMax, w.siegeBase + Math.floor(wave / w.siegePerWaves));
}

export function planWave(cfg: GameConfig, wave: number, seed: number): WavePlan {
  const rng = new RngStream(deriveSeed(seed, wave));
  const scripted = scriptedWave(wave);
  // A written wave is its own composition, so it has no rolled shape.
  const shape: WaveShape = scripted ? 'mixed' : shapeFor(cfg, wave, seed);
  const factions = scripted
    ? [...new Set(scripted.entries.map((e) => ENEMY_UNITS[e.kind].faction))]
    : factionsForWave(cfg, wave);
  const isBossWave = wave % cfg.waves.bossEvery === 0 && !scriptedWave(wave);
  const budget = waveBudget(cfg, wave) * (isBossWave ? cfg.waves.bossBudgetFactor : 1);
  const baseHpScale = waveHpScale(cfg, wave);
  const damageScale = waveDamageScale(cfg, wave);
  const bountyScale = waveBountyScale(cfg, wave);

  const defs: EnemyUnitDef[] = [];
  if (scripted) {
    // A written wave is its own composition; the budget does not apply.
    for (const entry of scripted.entries) {
      for (let i = 0; i < entry.count; i++) defs.push(ENEMY_UNITS[entry.kind]);
    }
  } else {
    // Split the budget when two armies attack together. The open-ended
    // allowances are shared between them: they are properties of the wave, not
    // of each army.
    const shares = factions.length === 2 ? [0.65, 0.35] : [1];
    const openSlots: WaveSlots = {
      siege: siegeAllowance(cfg, wave),
      summoners: cfg.waves.summonerMax,
      breachers: cfg.waves.breacherMax,
    };
    for (let i = 0; i < factions.length; i++) {
      const roster = rosterFor(factions[i], wave);
      const bodyCap = Math.max(1, Math.floor(cfg.waves.maxUnits / factions.length));
      defs.push(
        ...pickUnits(
          roster,
          budget * shares[i],
          bodyCap,
          rng,
          openSlots,
          SHAPES[shape].favours,
          cfg.waves.shapeBias,
        ),
      );
    }
  }

  let bossDef: EnemyUnitDef | null = null;
  if (isBossWave) {
    const b = bossFor(factions[0]);
    if (b && b.fromWave <= wave) bossDef = b;
  }
  const boss = bossDef !== null;

  /**
   * Hold the wave to its place on the curve.
   *
   * A budget buys wildly different amounts of hit points depending on what it
   * is spent on — a point of armour is worth about twice a point of swarm —
   * so at a flat budget an armoured column rolled up at 30 hit points per
   * point against a mixed force's 16. While upgrade levels arrived twenty to
   * a wave that was texture: you out-levelled the spike on the next wave. On
   * the escalating price curve a level is worth several waves of income, so
   * the same roll is a brick wall you grind at for fifty attempts. The shape
   * is still what the wave *is*; how hard it hits is `shapeThreat`'s to say,
   * not the dice's.
   *
   * A written wave is held to the curve too: it is a composition, chosen to
   * teach something, not an exemption from the campaign's scaling. A boss is
   * the exception — it *is* the wave rather than a line item in its budget, so
   * it carries the plain curve and the rank and file around it is what gets
   * held.
   */
  const rawHp = defs.reduce((sum, d) => sum + d.hp, 0);
  const targetHp = budget * cfg.waves.hpPerPoint * cfg.waves.shapeThreat[shape];
  const hpScale = rawHp > 0 ? (targetHp / rawHp) * baseHpScale : baseHpScale;

  /** Every body in the wave, with the hit-point scale it fights at. */
  const bodies: Array<{ def: EnemyUnitDef; hpScale: number }> = defs.map((def) => ({ def, hpScale }));
  if (bossDef) bodies.push({ def: bossDef, hpScale: baseHpScale });

  // Schedule: clumps of up to groupSize walk on together, spread over the
  // spawn window, each clump arriving around a shared x so they read as a squad.
  const { field, waves } = cfg;
  const spawns: QueuedSpawn[] = [];

  /**
   * The standoff engines ride in behind the troops, never with the first clump.
   *
   * An engine that walks on at second zero is shelling the wall before the
   * player has a target they can reach: the answer to siege is to clear the
   * escort and walk out to it, and that answer needs the escort to have shown
   * up first. Opening with the engines also started the breach clock before
   * the wave had a shape to read, which turned the one mechanic the parapet
   * cannot answer into the first thing that happens.
   */
  const escort = bodies.filter((b) => b.def.standoff !== true);
  const engines = bodies.filter((b) => b.def.standoff === true);

  const groups = Math.max(1, Math.ceil(escort.length / waves.groupSize));
  // Evenly across the window, but never further apart than clumpGapSec: a
  // five-body wave should not be spread over the same eighteen seconds as a
  // ninety-body one.
  const gap = Math.min(waves.clumpGapSec, waves.spawnWindowSec / Math.max(1, groups - 1));
  const groupAt = (g: number) => g * gap;
  const anchors = Array.from(
    { length: groups },
    () => field.sideMargin + rng.float() * (field.width - field.sideMargin * 2),
  );
  const near = (anchorX: number) =>
    Math.min(field.width - field.sideMargin, Math.max(field.sideMargin, anchorX + rng.spread(36)));

  const push = (body: { def: EnemyUnitDef; hpScale: number }, at: number, anchorX: number) => {
    spawns.push({
      kind: body.def.id,
      x: near(anchorX),
      // The opening clump walks on the instant the wave is launched; the rest
      // are staggered a little inside their clump so a squad does not appear
      // in one frame.
      at: at === 0 ? 0 : at + rng.float() * 0.4,
      hpScale: body.hpScale,
      damageScale,
      bountyScale,
    });
  };

  for (let g = 0; g < groups; g++) {
    const members = escort.slice(g * waves.groupSize, (g + 1) * waves.groupSize);
    for (const body of members) push(body, groupAt(g), anchors[g]);
  }

  // Spread the engines over the clumps after the first. A wave too small to
  // have a second clump brings them up at the close of the spawn window.
  for (let i = 0; i < engines.length; i++) {
    const g = groups > 1 ? 1 + (i % (groups - 1)) : -1;
    if (g < 0) push(engines[i], Math.max(gap, waves.clumpGapSec), anchors[0]);
    else push(engines[i], groupAt(g), anchors[g]);
  }

  spawns.sort((a, b) => a.at - b.at);

  // Preview data.
  const counts = new Map<EnemyUnitId, number>();
  const classMix: Record<BodyClass, number> = { armored: 0, swarm: 0, elusive: 0 };
  let totalHp = 0;
  let totalBounty = 0;
  for (const { def, hpScale: scale } of bodies) {
    counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
    // Weighted by hit points, not bodies. A column is 15 knights behind 39
    // skeletons by headcount, which makes "armoured column" read as a lie;
    // by threat it is overwhelmingly armour, which is what the player meets.
    classMix[def.bodyClass] += def.hp * scale;
    totalHp += def.hp * scale;
    totalBounty += def.bounty * bountyScale;
  }
  const composition = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => ENEMY_UNITS[a.kind].cost - ENEMY_UNITS[b.kind].cost);

  return {
    wave,
    shape,
    classMix,
    label: scripted?.label ?? null,
    hint: scripted?.hint ?? null,
    factions,
    spawns,
    composition,
    boss,
    totalHp,
    totalBounty,
  };
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
  readonly rank: Rank;
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
    rank: args.rank,
    posture: 'posture' in stats ? stats.posture : 0,
    damageClass: 'damageClass' in stats ? stats.damageClass : 'kinetic',
    bodyClass: 'bodyClass' in stats ? stats.bodyClass : null,
    wallFocused: 'wallFocused' in stats ? stats.wallFocused === true : false,
    spawnPeriod: args.spawnPeriod,
    spawnIn: args.spawnPeriod,
    spawnKind: args.spawnKind,
    targetId: null,
    retargetIn: 0,
    aim: args.aim,
    anim: 0,
    flash: 0,
    recoil: 0,
    advancePressure: 0,
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
      rank: rankOfLevel(stats.level),
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
      // From the wave's own curve, not from `q.hpScale`: that carries the
      // normalisation that holds a wave's total to the curve, which can be
      // several times the campaign's scaling on a wave whose composition came
      // in light. A chevron is meant to say how deep into the campaign a
      // soldier is, not how thin the roll behind it was.
      rank: rankOfScale(waveHpScale(cfg, state.wave)),
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
  const ox = x + rng.spread(16);
  const oy = y + rng.spread(12);
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
      rank: rankOfScale(waveHpScale(cfg, state.wave)),
    },
    def,
  );
}


