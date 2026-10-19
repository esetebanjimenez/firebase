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
     * Your power compounds across seven upgrade tracks; the enemy only has
     * stats and numbers, and numbers are capped. So from this wave on the
     * armies scale on a steeper curve, which is what keeps a wave-40 fight a
     * fight instead of a formality.
     */
    readonly lateFromWave: number;
    readonly lateHpScaleGrowth: number;
    readonly lateDamageScaleGrowth: number;
    readonly lateBountyScaleGrowth: number;
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
     * Threat multiplier per shape, so shapes differ in *what* they field
     * rather than in how dangerous they are. A point of budget buys far more
     * hit points as armour than as skirmishers, so at a flat budget a column
     * carried 121% of a mixed wave's threat and a horde 60% — which made the
     * shape a difficulty label rather than a tactical one, and left hordes and
     * skirmish lines comfortable whatever you brought.
     *
     * This scales hit points rather than the budget: the budget is capped by
     * how many bodies a field can hold, so buying more of them barely moved
     * the threat at all (60% to 64%).
     */
    readonly shapeThreat: Readonly<Record<WaveShape, number>>;
    /** Standoff siege engines a wave may field: base, +1 every N waves, capped. */
    readonly siegeBase: number;
    readonly siegePerWaves: number;
    readonly siegeMax: number;
  };

  readonly abilities: {
    readonly artillery: AbilityConfig;
    readonly barrage: AbilityConfig;
    readonly napalm: AbilityConfig;
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
  version: 2,
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
    lateFromWave: 12,
    lateHpScaleGrowth: 1.3,
    lateDamageScaleGrowth: 1.17,
    lateBountyScaleGrowth: 1.21,
    spawnWindowSec: 18,
    groupSize: 4,
    bossEvery: 10,
    bossBudgetFactor: 0.6,
    mixFromWave: 16,
    shapeFromWave: 8,
    shapeBias: 8,
    shapeThreat: { column: 0.9, horde: 1.55, skirmish: 1.5, mixed: 1 },
    siegeBase: 1,
    siegePerWaves: 12,
    siegeMax: 4,
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
