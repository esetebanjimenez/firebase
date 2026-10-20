/**
 * config.ts — the global balance curves and the field geometry.
 *
 * Balance surface #2 (roster.ts holds the per-unit stat blocks). Everything
 * here is data only: no DOM, no React, no renderer.
 *
 * The game model: you hold the bottom of the map behind a wall with a gate.
 * In PREP you spend credits on the wall, the towers, your soldiers, your
 * deployment charges and your ground-targeted abilities. Then you launch the
 * wave yourself. Enemies pour in from the top; towers shoot what comes in
 * range and you spend charges to push soldiers out of the gate. The wave is
 * lost if the wall reaches 0 HP (you re-fight the same wave) and won if the
 * field is cleared (the next wave is tougher). Either way every kill's credits
 * are yours to keep and the wall comes back to full.
 */

import type { BodyClass, DamageClass, WaveShape } from './types';

export interface GameConfig {
  readonly version: number;
  readonly seed: number;

  /** The 8-bit field, in the single coordinate space sim and renderer share. */
  readonly field: {
    /**
     * The virtual resolution, doubled from the original 192x240: at 384 wide a
     * phone renders it near 1:1, and the extra pixels are what let a soldier
     * show the gear it has earned. Every distance below is in these units, so
     * doubling them all leaves the game playing exactly as it did.
     */
    readonly width: number;
    readonly height: number;
    /** Top edge of the wall band; the wall's damage line. */
    readonly wallTop: number;
    readonly wallThickness: number;
    readonly gateX: number;
    readonly gateHalfWidth: number;
    /** Enemies walk on between these two rows. */
    readonly spawnTop: number;
    readonly spawnBottom: number;
    /** Keep spawns and movement this far from the left/right edges. */
    readonly sideMargin: number;
    /** Tower emplacements along the wall. */
    readonly towerX: readonly number[];
    readonly towerBuildOrder: readonly number[];
    readonly towerY: number;
  };

  /**
   * Static defenses on the wall. They cover nearly the whole field — all of it
   * bar a strip along the top — so a tower level buys damage and rate rather
   * than ground. The strip is the point: siege parks in it, outranges the guns
   * by construction, and no amount of tower investment reaches it.
   */
  readonly towers: {
    /**
     * The parapet starts empty. Four guns from wave 1 answered the early waves
     * on their own, which made deploying soldiers optional exactly where the
     * game is meant to teach you to do it.
     */
    readonly emplacementEvery: number;
    readonly baseDamage: number;
    /** Damage is multiplied by this per level: power has to compound, or the
     *  geometric upgrade prices outrun it within a dozen waves. */
    readonly damageGrowth: number;
    readonly basePeriodSec: number;
    /** Subtracted per level, floored by minPeriodSec. */
    readonly periodPerLevel: number;
    readonly minPeriodSec: number;
    /** Rows at the top of the field the guns cannot reach, at level 1. */
    readonly baseUncoveredStrip: number;
    /** Each level claws back this much of the strip, down to minStrip. */
    readonly stripPerLevel: number;
    readonly minStrip: number;
    readonly projectileSpeed: number;
    readonly baseCost: number;
    readonly costGrowth: number;
  };

  /**
   * The ground your towers can support, and how far your soldiers will go.
   * Soldiers hold the line the guns can cover rather than a fixed row, so
   * upgrading the towers visibly pushes your front forward.
   */
  readonly support: {
    /**
     * Where your soldiers hold, as a share of the distance from the wall to
     * the top of the field. Deliberately independent of tower range: tying the
     * two together meant every change to the guns dragged the infantry around
     * with it, and neither could be tuned on its own.
     */
    readonly holdFraction: number;
    /** How far inside the line idle soldiers form up. */
    readonly musterInset: number;
    /**
     * How long soldiers will hold with nothing they can reach before advancing
     * on an enemy that refuses to close. Without it, anything that outranges
     * the line — an archer by eight pixels, a catapult by a hundred — stands
     * beyond it and plinks forever, and the wave never ends. Taking fire
     * shortens this sharply: troops shot at return fire rather than stand.
     */
    readonly pushOutSec: number;
  };

  readonly wall: {
    readonly baseMaxHp: number;
    readonly maxHpGrowth: number;
    readonly baseCost: number;
    readonly costGrowth: number;
  };

  /**
   * What a level buys a single soldier kind. One purchase lifts that kind's
   * hit points, damage and (a little) speed, so investment is a choice about
   * which soldiers you want to be good, not a stat shopping list.
   */
  readonly soldiers: {
    readonly hpGrowth: number;
    readonly damageGrowth: number;
    /** Speed stays linear and capped: sprinting soldiers break the formations. */
    readonly speedPerLevel: number;
    readonly maxSpeedMult: number;
    /** Price growth per level; the base price is per kind, in the roster. */
    readonly costGrowth: number;
  };

  /** The deployment charge pool: how many soldiers you can push out, and how fast. */
  readonly charges: {
    readonly baseMax: number;
    readonly maxPerLevel: number;
    readonly baseRechargeSec: number;
    /** Multiplied per level (<1 shortens), floored by minRechargeSec. */
    readonly rechargeFactor: number;
    readonly minRechargeSec: number;
    readonly maxCost: number;
    readonly maxCostGrowth: number;
    readonly rechargeCost: number;
    readonly rechargeCostGrowth: number;
  };

  /** Wave planning: budget growth, pacing, and which army shows up. */
  readonly waves: {
    readonly baseBudget: number;
    readonly budgetGrowth: number;
    readonly maxBudget: number;
    /** Hard cap on enemies planned for a single wave. */
    readonly maxUnits: number;
    readonly hpScaleGrowth: number;
    readonly damageScaleGrowth: number;
    readonly bountyScaleGrowth: number;
    /**
     * The clock the enemy's stats compound on: the exponent is
     * `(wave - 1)^statScalePower`, so at 1 this is the usual straight
     * geometric curve and below it each wave adds a little less than the one
     * before.
     *
     * It is below 1 because the player's side is: priced on an escalating
     * curve, credits that compound per wave buy levels on a square-root
     * clock, so an enemy compounding per wave straight would overtake any
     * possible investment within a dozen waves. This keeps the two curves the
     * same shape, with the enemy's exponent a shade higher — the gap is what
     * makes a wave-40 fight a fight rather than a formality.
     */
    readonly statScalePower: number;
    /**
     * Bounty rides a clock of its own. What a wave pays has to keep pace with
     * what the next level costs, not with how hard the wave hits.
     */
    readonly bountyScalePower: number;
    /** Seconds over which a wave's spawns are spread. */
    readonly spawnWindowSec: number;
    /** Enemies walk on in clumps of up to this many at the same moment. */
    readonly groupSize: number;
    /** A boss joins every Nth wave. */
    readonly bossEvery: number;
    /** Boss waves spend less on rank-and-file, since the boss is the wave. */
    readonly bossBudgetFactor: number;
    /** From this wave on, a wave can draw from two armies at once. */
    readonly mixFromWave: number;
    /**
     * From this wave on a wave can take a shape. Before it, everything is
     * mixed: a pure armoured column is unanswerable while the explosive
     * counter is still hundreds of credits out of reach, and losing to a roll
     * you had no tool for is not a tactical problem, it is a dice game.
     */
    readonly shapeFromWave: number;
    /** How much a shape favours its own class when spending the budget. */
    readonly shapeBias: number;
    /**
     * Where a wave's hit points land: this many per point of budget, before the
     * wave's own scaling. The roll decides what a wave is *made of*; this
     * decides how much beef that composition carries, because a budget buys
     * very different amounts of it depending on what it is spent on — a point
     * of armour was worth about twice a point of swarm, so at a flat budget an
     * armoured column rolled up at nearly double a mixed force's hit points.
     *
     * While levels arrived twenty to a wave that was texture, something you
     * out-levelled on the next wave. On the escalating price curve a level is
     * worth several waves of income, so the same roll is a wall you grind at
     * for fifty attempts. Holding the total to the curve is what lets the
     * economy, rather than the dice, decide the pace.
     */
    readonly hpPerPoint: number;
    /**
     * Deliberate relative threat per shape, applied to that target. Equal hit
     * points are not equal difficulty: armour also soaks flat damage, and a
     * swarm spends its hit points on bodies that all have to be shot
     * separately. This is where that is paid for — 1 means "right on the
     * curve".
     */
    readonly shapeThreat: Readonly<Record<WaveShape, number>>;
    /** Standoff siege engines a wave may field: base, +1 every N waves, capped. */
    readonly siegeBase: number;
    readonly siegePerWaves: number;
    readonly siegeMax: number;
    /**
     * Summoners a wave may field. Capped for the same reason siege is: a
     * necromancer raises a skeleton every few seconds for as long as it lives,
     * so its contribution to a wave is a rate, not a line item, and the budget
     * has no way to see that. Rolled freely, a late wave bought nineteen of
     * them — four skeletons a second, for ever, which is not a wave but a tap
     * you cannot turn off, and the clearest wall in a run. A handful is
     * pressure to answer.
     */
    readonly summonerMax: number;
    /**
     * Wall-breakers — the melee kinds that ignore your soldiers and drive for
     * the wall — a wave may field. Rationed for the same reason the standoff
     * engines are, and in fact more urgently: a ram's whole contribution is
     * wall damage on arrival, so ten of them do not make a wave 10% harder,
     * they take the wall down in seconds and make the wave a pass-or-lose
     * check on stopping every one. A handful that gets through should be a
     * breach you feel, not the end of the run.
     */
    readonly breacherMax: number;
  };

  readonly abilities: {
    readonly artillery: AbilityConfig;
    readonly barrage: AbilityConfig;
    readonly napalm: AbilityConfig;
  };

  /**
   * Intel: what you know about the wave before you commit to it.
   *
   * Strength is never hidden — the budget is the constant half of a wave, and
   * a player who cannot see how big one is has no way to judge anything. What
   * is sold is the *composition*, and specifically advance notice of it:
   * without a scrap of intel you still learn what a wave is made of when it
   * walks on, which is too late to have fitted the parapet for it.
   */
  readonly intel: {
    readonly baseCost: number;
    readonly costGrowth: number;
  };

  /** Idle layer: passive credits, scaled by the furthest wave you've cleared. */
  readonly idle: {
    readonly baseCreditsPerSec: number;
    /** Income is multiplied by this for every wave cleared. */
    readonly incomeGrowth: number;
    /** Offline time beyond this is not credited. */
    readonly maxOfflineSec: number;
    readonly autoDeployCost: number;
    readonly autoLaunchCost: number;
    /** Seconds of prep before auto-launch fires the next wave. */
    readonly autoLaunchDelaySec: number;
  };

  /**
   * The counter triangle. Stored as one strong and one weak matchup per damage
   * class rather than a free 3x3 of numbers: that shape *is* the rule, so a
   * mistyped table cannot quietly produce a weapon good against everything.
   */
  readonly counters: {
    readonly strong: number;
    readonly weak: number;
    readonly matchups: Readonly<Record<DamageClass, { readonly strong: BodyClass; readonly weak: BodyClass }>>;
  };

  /**
   * The shape of every price in the game.
   *
   * An idle game normally prices level L at base * growth^L: a straight
   * geometric curve. Against income that also compounds per wave, that curve
   * buys a *constant* number of levels per wave, and because a wave's takings
   * grow with both bounty and head-count while a level's price grows with
   * neither, it bought an accelerating number of them — 1 a wave at wave 3,
   * 19 a wave at wave 20, 411 levels owned by wave 30.
   *
   * So the growth rate itself grows. The step from level L to L+1 costs
   * `growth * costEscalation^(L-1)` times the step before it, which turns the
   * exponent quadratic: credits compounding per wave then buy levels on a
   * square-root curve, and the gap between what a wave pays and what the next
   * level asks widens for as long as you keep playing. Early levels are still
   * cheap; it is depth that is expensive.
   */
  readonly economy: {
    readonly costEscalation: number;
  };

  /** Simulation details that are tuning, not rules. */
  readonly sim: {
    /** Fraction of damage that always lands, however thick the armor. */
    readonly minDamageFraction: number;
    /** Seconds between a unit re-evaluating its target. */
    readonly retargetSec: number;
    /** How hard overlapping units push each other apart (px/sec per px). */
    readonly separationPush: number;
    /** Enemies stop this far short of the wall line to attack it. */
    readonly wallStandoff: number;
    /** Player units spawn this far above the wall, in the gate mouth. */
    readonly gateSpawnOffset: number;
    /** Hit-flash duration for the renderer. */
    readonly flashSec: number;
    /** Safety cap on live entities. */
    readonly maxUnits: number;
  };
}

export interface AbilityConfig {
  readonly name: string;
  readonly blurb: string;
  readonly baseDamage: number;
  readonly damageGrowth: number;
  readonly radius: number;
  readonly baseCooldownSec: number;
  readonly cooldownPerLevel: number;
  readonly minCooldownSec: number;
  readonly unlockCost: number;
  readonly costGrowth: number;
  /** Shells per cast (barrage); 1 for single-impact abilities. */
  readonly shells: number;
  /** Seconds from cast to first impact. */
  readonly delaySec: number;
  /** Extra seconds between shells of a barrage. */
  readonly shellSpacingSec: number;
  /** Scatter radius for a barrage's impact points. */
  readonly scatter: number;
  /** Burn duration; 0 = an instant strike. */
  readonly burnSec: number;
}

export const defaultConfig: GameConfig = {
  // 3: the escalating price curve. A save from the flat curve carries levels
  // bought at a fraction of what they now cost — forty of them a track where
  // this curve hands out sixteen — so loading one would be a walk through
  // every wave it has already paid for. Bumping the version retires those
  // saves rather than honouring prices that no longer exist.
  version: 3,
  seed: 1,

  field: {
    width: 384,
    height: 480,
    wallTop: 412,
    wallThickness: 22,
    gateX: 192,
    gateHalfWidth: 30,
    spawnTop: 8,
    spawnBottom: 36,
    sideMargin: 20,
    towerX: [40, 112, 272, 344],
    /** Which emplacement each tower level buys: the gate pair, then the flanks. */
    towerBuildOrder: [1, 2, 0, 3],
    towerY: 422,
  },

  towers: {
    emplacementEvery: 2,
    baseDamage: 7,
    damageGrowth: 1.17,
    basePeriodSec: 0.9,
    periodPerLevel: 0.02,
    minPeriodSec: 0.4,
    baseUncoveredStrip: 96,
    stripPerLevel: 2,
    minStrip: 40,
    projectileSpeed: 460,
    baseCost: 40,
    costGrowth: 1.13,
  },

  support: {
    holdFraction: 0.42,
    musterInset: 14,
    pushOutSec: 2,
  },

  wall: {
    baseMaxHp: 520,
    maxHpGrowth: 1.2,
    baseCost: 40,
    costGrowth: 1.16,
  },

  soldiers: {
    hpGrowth: 1.15,
    damageGrowth: 1.15,
    speedPerLevel: 0.03,
    maxSpeedMult: 1.6,
    costGrowth: 1.17,
  },

  charges: {
    baseMax: 3,
    maxPerLevel: 1,
    baseRechargeSec: 9,
    rechargeFactor: 0.9,
    minRechargeSec: 2.5,
    maxCost: 150,
    maxCostGrowth: 1.45,
    rechargeCost: 90,
    rechargeCostGrowth: 1.35,
  },

  waves: {
    baseBudget: 5,
    budgetGrowth: 1.17,
    maxBudget: 600,
    maxUnits: 90,
    hpScaleGrowth: 1.18,
    damageScaleGrowth: 1.1,
    bountyScaleGrowth: 1.16,
    statScalePower: 0.7,
    // Straight geometric, deliberately: prices compound per *level* and a
    // level's price now climbs as well, so pay that decelerates too would
    // leave the late game earning for a shop it can never reach.
    bountyScalePower: 1,
    spawnWindowSec: 18,
    groupSize: 4,
    bossEvery: 10,
    bossBudgetFactor: 0.6,
    mixFromWave: 16,
    shapeFromWave: 8,
    shapeBias: 8,
    hpPerPoint: 52,
    shapeThreat: { column: 0.65, horde: 1, skirmish: 1, mixed: 1 },
    siegeBase: 1,
    siegePerWaves: 12,
    siegeMax: 3,
    summonerMax: 3,
    breacherMax: 4,
  },

  abilities: {
    artillery: {
      name: 'Artillery Strike',
      blurb: 'A single heavy shell. Tap the ground to call it in.',
      baseDamage: 130,
      damageGrowth: 1.3,
      radius: 52,
      baseCooldownSec: 24,
      cooldownPerLevel: 0.8,
      minCooldownSec: 10,
      unlockCost: 150,
      costGrowth: 1.5,
      shells: 1,
      delaySec: 1.1,
      shellSpacingSec: 0,
      scatter: 0,
      burnSec: 0,
    },
    barrage: {
      name: 'Mortar Barrage',
      blurb: 'Six shells walked across a wide area over several seconds.',
      baseDamage: 70,
      damageGrowth: 1.3,
      radius: 32,
      baseCooldownSec: 50,
      cooldownPerLevel: 1.5,
      minCooldownSec: 22,
      unlockCost: 600,
      costGrowth: 1.55,
      shells: 6,
      delaySec: 0.9,
      shellSpacingSec: 0.45,
      scatter: 68,
      burnSec: 0,
    },
    napalm: {
      name: 'Napalm',
      blurb: 'Sets the ground alight, burning everything that walks through.',
      baseDamage: 50,
      damageGrowth: 1.3,
      radius: 48,
      baseCooldownSec: 60,
      cooldownPerLevel: 2,
      minCooldownSec: 28,
      unlockCost: 1400,
      costGrowth: 1.6,
      shells: 1,
      delaySec: 0.8,
      shellSpacingSec: 0,
      scatter: 0,
      burnSec: 6,
    },
  },

  intel: {
    // Priced so the first level lands around wave 3-4: the gun pads arrive
    // early and fitting them is guesswork without knowing the shape.
    baseCost: 50,
    costGrowth: 3,
  },
  idle: {
    baseCreditsPerSec: 0.25,
    incomeGrowth: 1.12,
    maxOfflineSec: 8 * 3600,
    autoDeployCost: 2500,
    autoLaunchCost: 5000,
    autoLaunchDelaySec: 4,
  },

  counters: {
    strong: 1.5,
    weak: 0.65,
    matchups: {
      kinetic: { strong: 'elusive', weak: 'armored' },
      explosive: { strong: 'armored', weak: 'swarm' },
      sustained: { strong: 'swarm', weak: 'elusive' },
    },
  },
  economy: {
    // 1.04 per level: the price ratio starts at a track's own growth and is
    // about 75% above it by level 15, which is roughly where a track sits
    // after thirty waves. Swept against the difficulty curve — at 1.05 a
    // straight run to wave 60 took 269 attempts and 174 hours of waiting
    // against 86 attempts and under four hours here, because a player who
    // cannot clear the wave in front of them earns the same credits every
    // attempt, so every further level takes geometrically longer to afford.
    costEscalation: 1.04,
  },

  sim: {
    minDamageFraction: 0.3,
    retargetSec: 0.4,
    separationPush: 9,
    wallStandoff: 6,
    gateSpawnOffset: 12,
    flashSec: 0.12,
    maxUnits: 260,
  },
};
