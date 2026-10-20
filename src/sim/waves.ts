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
import {
  openingThreatMult,
  playerUnitStats,
  waveBountyScale,
  waveDamageScale,
  waveHpScale,
  waveBudget,
} from './derive';
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
  let left = budget;
  // Both of these count bodies, not line items. A squad of four archers costs
  // four archers and fills four of the slots the field can hold, so grouping
  // the roster into squads changes how a wave is *arranged* and not how much
  // of it there is — same bodies, same price, same threat, in formations.
  const sizeOf = (d: EnemyUnitDef) => d.squad ?? 1;
  const priceOf = (d: EnemyUnitDef) => d.cost * sizeOf(d);
  const cheapest = Math.min(...roster.map(priceOf));
  let bodies = 0;
  const breacher = (d: EnemyUnitDef) => d.wallFocused === true && d.standoff !== true;
  const allowed = () =>
    roster.filter(
      (d) =>
        (slots.siege > 0 || !d.standoff) &&
        (slots.summoners > 0 || d.spawnKind === undefined) &&
        (slots.breachers > 0 || !breacher(d)) &&
        // A squad is taken whole or not at all, so it has to fit.
        bodies + sizeOf(d) <= maxUnits,
    );
  const take = (def: EnemyUnitDef) => {
    picks.push(def);
    bodies += sizeOf(def);
    if (def.standoff) slots.siege -= 1;
    if (def.spawnKind !== undefined) slots.summoners -= 1;
    if (breacher(def)) slots.breachers -= 1;
  };

  // Heavies first, from the costliest two affordable kinds, up to a share of
  // the budget — this is what keeps late waves from being pure chaff.
  let heavyLeft = budget * 0.45;
  while (heavyLeft >= cheapest && bodies < maxUnits) {
    const affordable = allowed().filter((d) => priceOf(d) <= Math.min(heavyLeft, left));
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
    heavyLeft -= priceOf(def);
    left -= priceOf(def);
  }

  // The rest goes on numbers, weighted toward cheap kinds — and only on kinds
  // the wave could afford several of. The budget doubled when squads arrived
  // (a squad costs four bodies), which put one knight squad inside a wave-5
  // budget for the first time: two armoured bodies carrying most of a wave's
  // hit points, against a player who has nothing but rifles at wave 5. Heavies
  // are the heavy pass's business, and a crowd is made of what is common.
  const crowdPrice = Math.max(cheapest, budget * 0.3);
  while (left >= cheapest && bodies < maxUnits) {
    const affordable = allowed().filter((d) => priceOf(d) <= Math.min(left, crowdPrice));
    if (affordable.length === 0) break;
    const weights = affordable.map(
      (d) => (1 / priceOf(d)) * (favours && d.bodyClass === favours ? bias : 1),
    );
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
    left -= priceOf(def);
  }

  return picks;
}

/**
 * What a boss wave teaches, shown if you lose one.
 *
 * It is the opposite lesson to siege: siege parks where the guns cannot reach
 * and has to be answered by infantry, a boss walks straight past your infantry
 * and has to be answered by the guns.
 */
const BOSS_HINT =
  'A boss walks past your soldiers without stopping — a shield wall will not hold it, ' +
  'and it hits the wall far harder than anything in its escort. The parapet is the answer: ' +
  'it has to be shot down before it arrives, or soon after.';

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
  // The full budget is what the wave is worth; a boss wave spends less of it
  // on rank and file, because the boss is where the rest of it went.
  // The opening's extra weight is spent on *bodies*: it multiplies the budget,
  // not the hit points that budget is held to. Applied to the target instead
  // it bought the same eight militia at six times their roster hit points,
  // which is the weakest thing in the game arriving as a brick.
  const fullBudget = waveBudget(cfg, wave) * (scripted ? 1 : openingThreatMult(cfg, wave));
  const budget = fullBudget * (isBossWave ? cfg.waves.bossBudgetFactor : 1);
  const baseHpScale = waveHpScale(cfg, wave);
  const damageScale = waveDamageScale(cfg, wave);
  const bountyScale = waveBountyScale(cfg, wave);

  /** A unit of the wave: a kind, and how many bodies of it come on together. */
  const defs: Array<{ def: EnemyUnitDef; size: number }> = [];

  if (scripted) {
    // A written wave brings its own composition, and it counts bodies: five
    // skirmishers means five. They are grouped into squads of the kind's size
    // with the last one short if the count does not divide — wave 6 teaches
    // with five and would have fielded twenty the moment they came in fours.
    for (const entry of scripted.entries) {
      const def = ENEMY_UNITS[entry.kind];
      const size = Math.max(1, def.squad ?? 1);
      for (let left = entry.count; left > 0; left -= size) {
        defs.push({ def, size: Math.min(size, left) });
      }
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
      for (const def of pickUnits(
        roster,
        budget * shares[i],
        bodyCap,
        rng,
        openSlots,
        SHAPES[shape].favours,
        cfg.waves.shapeBias,
      )) {
        defs.push({ def, size: Math.max(1, def.squad ?? 1) });
      }
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
  const rawHp = defs.reduce((sum, d) => sum + d.def.hp * d.size, 0);
  // A written wave says what it weighs; a rolled one takes its weight from the
  // budget, the opening's extra points included.
  const targetHp =
    budget * cfg.waves.hpPerPoint * cfg.waves.shapeThreat[shape] * (scripted?.threat ?? 1);
  const hpScale = rawHp > 0 ? (targetHp / rawHp) * baseHpScale : baseHpScale;

  /** Every squad in the wave, with the hit-point scale its bodies fight at. */
  const bodies: Array<{ def: EnemyUnitDef; hpScale: number; size: number }> = defs.map((d) => ({
    def: d.def,
    hpScale,
    size: d.size,
  }));
  if (bossDef) {
    // Held to the curve like everything else, against the wave's full budget:
    // left on its roster line it was 7% of the wave that bears its name.
    const bossHp = fullBudget * cfg.waves.hpPerPoint * cfg.waves.bossThreat * baseHpScale;
    bodies.push({ def: bossDef, hpScale: bossHp / bossDef.hp, size: 1 });
  }

  // Schedule: a wave lands as an opening force and up to two lots of
  // reinforcements, each of them several squads abreast across the field.
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

  /**
   * Arrivals, not a trickle.
   *
   * Clumping by headcount put exactly one squad in each clump — a squad is
   * four bodies and a clump held four — so a wave came on single file, a
   * fresh squad every few seconds, and the player fought the same small
   * skirmish over and over while the rest of the army queued offscreen. A
   * wave now lands in at most `arrivals` moments, and every squad in a
   * moment walks on together.
   */
  const groups = Math.max(
    1,
    Math.min(waves.arrivals, Math.floor(escort.length / waves.squadsPerArrival)),
  );
  const clumps: Array<Array<{ def: EnemyUnitDef; hpScale: number; size: number }>> = Array.from(
    { length: groups },
    () => [],
  );
  for (let i = 0; i < escort.length; i++) {
    // Contiguous blocks, so the composition's own order survives: what the
    // roll put at the front opens, and its tail reinforces.
    clumps[Math.min(groups - 1, Math.floor((i * groups) / escort.length))].push(escort[i]);
  }

  // Evenly across the window, but never further apart than arrivalGapSec: a
  // five-body wave should not be spread over the same eighteen seconds as a
  // ninety-body one.
  const gap = Math.min(waves.arrivalGapSec, waves.spawnWindowSec / Math.max(1, groups - 1));
  const groupAt = (g: number) => g * gap;

  /**
   * Frontage inside one arrival: every squad gets its own stretch of the top
   * edge, so six squads walking on at the same moment form a line across the
   * field rather than a heap around one x.
   */
  const anchorsFor = (count: number) => {
    const lane = (field.width - field.sideMargin * 2) / Math.max(1, count);
    return Array.from(
      { length: count },
      (_, i) => field.sideMargin + lane * (i + 0.5) + rng.spread(lane * 0.25),
    );
  };

  /**
   * Queue one unit — which is one body, or a squad's worth of them.
   *
   * A squad walks on together, abreast and at the same moment: staggering a
   * squad would undo the thing it is for. The clump it belongs to is still
   * staggered against the clumps around it.
   */
  let nextSquadId = 1;
  const push = (
    body: { def: EnemyUnitDef; hpScale: number; size: number },
    at: number,
    anchorX: number,
  ) => {
    const size = Math.max(1, body.size);
    const squadId = size > 1 ? nextSquadId++ : 0;
    const when = at === 0 ? 0 : at + rng.float() * 0.4;
    const x = anchorX;
    const spread = body.def.radius * 2.2;
    for (let slot = 0; slot < size; slot++) {
      // Abreast of each other, centred on where the unit would have stood.
      const offset = (slot - (size - 1) / 2) * spread;
      spawns.push({
        kind: body.def.id,
        x: Math.min(
          field.width - field.sideMargin,
          Math.max(field.sideMargin, x + offset),
        ),
        at: when,
        hpScale: body.hpScale,
        damageScale,
        bountyScale,
        squadId,
        squadSlot: slot,
        squadSize: size,
      });
    }
  };

  // The engines ride in with the reinforcements, spread over the arrivals
  // after the first. A wave too small to have a second arrival brings them up
  // on their own, one gap behind the troops.
  const trailing: Array<{ def: EnemyUnitDef; hpScale: number; size: number }> = [];
  for (let i = 0; i < engines.length; i++) {
    if (groups > 1) clumps[1 + (i % (groups - 1))].push(engines[i]);
    else trailing.push(engines[i]);
  }

  for (let g = 0; g < clumps.length; g++) {
    const anchors = anchorsFor(clumps[g].length);
    for (let i = 0; i < clumps[g].length; i++) push(clumps[g][i], groupAt(g), anchors[i]);
  }
  if (trailing.length > 0) {
    const anchors = anchorsFor(trailing.length);
    for (let i = 0; i < trailing.length; i++) push(trailing[i], gap, anchors[i]);
  }

  spawns.sort((a, b) => a.at - b.at);

  // Preview data.
  const counts = new Map<EnemyUnitId, number>();
  const classMix: Record<BodyClass, number> = { armored: 0, swarm: 0, elusive: 0 };
  let totalHp = 0;
  let totalBounty = 0;
  for (const { def, hpScale: scale, size } of bodies) {
    // Counted in bodies: "archers x8" is what the player will see walk on,
    // whether that is two squads of four or eight loners.
    counts.set(def.id, (counts.get(def.id) ?? 0) + size);
    // Weighted by hit points, not bodies. A column is 15 knights behind 39
    // skeletons by headcount, which makes "armoured column" read as a lie;
    // by threat it is overwhelmingly armour, which is what the player meets.
    classMix[def.bodyClass] += def.hp * scale * size;
    totalHp += def.hp * scale * size;
    totalBounty += def.bounty * bountyScale * size;
  }
  const composition = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => ENEMY_UNITS[a.kind].cost - ENEMY_UNITS[b.kind].cost);

  return {
    wave,
    shape,
    classMix,
    // A boss wave names itself. It is the one wave that is scheduled rather
    // than rolled, so there is nothing to give away by saying what is coming.
    label: scripted?.label ?? (bossDef ? bossDef.name.toUpperCase() : null),
    hint: scripted?.hint ?? (bossDef ? BOSS_HINT : null),
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
  readonly squadId?: number;
  readonly squadSlot?: number;
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
    squadId: args.squadId ?? 0,
    squadSlot: args.squadSlot ?? 0,
    targetId: null,
    retargetIn: 0,
    aim: args.aim,
    anim: 0,
    flash: 0,
    recoil: 0,
    advancePressure: 0,
  };
}

/**
 * Deploy one of your soldiers in the gate mouth: a squad's worth of bodies for
 * one charge, abreast in the gate. Mutates the id counter.
 *
 * A charge buys a squad rather than a man, and every body in it is a whole
 * soldier with the stats its level paid for. That is a real increase in what
 * a charge is worth, and it is meant to be: the wave budget buys squads too,
 * at a squad's price, so both sides field the same bodies they always did,
 * arranged into fire teams. What it does change is the balance between your
 * infantry and your parapet, which the threat curve is tuned against.
 */
export function createPlayerSquad(state: SimState, cfg: GameConfig, kind: PlayerUnitId): Unit[] {
  const size = Math.max(1, PLAYER_UNITS[kind].squad ?? 1);
  const squadId = size > 1 ? state.nextId++ : 0;
  const rng = new RngStream(state.rngState);
  const centre = cfg.field.gateX + rng.spread(cfg.field.gateHalfWidth * 0.4);
  state.rngState = rng.state;
  const spread = PLAYER_UNITS[kind].radius * 2.2;
  const squad: Unit[] = [];
  for (let slot = 0; slot < size; slot++) {
    const offset = (slot - (size - 1) / 2) * spread;
    squad.push(createPlayerUnit(state, cfg, kind, centre + offset, squadId, slot));
  }
  return squad;
}

/** One body of a squad (or a lone soldier, when a kind has no squad). */
export function createPlayerUnit(
  state: SimState,
  cfg: GameConfig,
  kind: PlayerUnitId,
  x = cfg.field.gateX,
  squadId = 0,
  squadSlot = 0,
): Unit {
  const def = PLAYER_UNITS[kind];
  const stats = playerUnitStats(cfg, state.unitLevels, kind);
  return makeUnit(
    {
      id: state.nextId++,
      team: 'player',
      kind,
      squadId,
      squadSlot,
      x: Math.min(
        cfg.field.width - cfg.field.sideMargin,
        Math.max(cfg.field.sideMargin, x),
      ),
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
      squadId: q.squadId ?? 0,
      squadSlot: q.squadSlot ?? 0,
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


