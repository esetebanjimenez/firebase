/**
 * types.ts — the data model for Iron Line.
 *
 * One coordinate space for everything: positions are "field pixels" in the
 * 8-bit virtual resolution declared by `GameConfig.field`, with y = 0 at the
 * top (enemy side) and y = field.height at the bottom (your wall). The renderer
 * draws that space 1:1 into its offscreen buffer, so the sim never needs to
 * know about screens, DPR, or layout.
 *
 * Shaped so new content extends without rewrites: unit kinds are string unions
 * resolved against the roster tables, upgrades are plain integer levels, and
 * `version` gates save migrations.
 */

import type { Rank } from './ranks';

export type Team = 'player' | 'enemy';

/** The three invading armies. */
export type FactionId = 'kingdom' | 'arcane' | 'undead';

/** Units you deploy through the gate. */
export type PlayerUnitId = 'rifleman' | 'shield' | 'gunner' | 'rocketeer';

export type EnemyUnitId =
  // Kingdom — mundane medieval muscle: numerous, armored, and good at sieges.
  | 'militia'
  | 'skirmisher'
  | 'archer'
  | 'knight'
  | 'ram'
  | 'catapult'
  | 'champion'
  // Arcane — ranged casters behind very tough constructs.
  | 'imp'
  | 'apprentice'
  | 'battlemage'
  | 'golem'
  | 'archmage'
  // Undead — endless cheap bodies, raised faster than you can mow them down.
  | 'skeleton'
  | 'zombie'
  | 'ghoul'
  | 'wraith'
  | 'necromancer'
  | 'boneGiant';

export type UnitKindId = PlayerUnitId | EnemyUnitId;

/** Ground-targeted abilities, fired by tapping the field. */
export type AbilityId = 'artillery' | 'barrage' | 'napalm';

/** How a unit delivers damage: contact, or a travelling projectile. */
export type AttackStyle = 'melee' | 'ranged';

/** Silhouette used to draw a unit (kinds share art and differ by palette). */
export type Silhouette = 'trooper' | 'grunt' | 'armored' | 'caster' | 'brute' | 'engine';

/** A small procedural mark drawn on top of a silhouette to tell kinds apart. */
export type UnitMark = 'none' | 'gun' | 'bigGun' | 'launcher' | 'shield' | 'blade' | 'bow' | 'staff' | 'horns' | 'wheels';

export type ProjectileKind = 'bullet' | 'rocket' | 'arrow' | 'bolt' | 'boulder' | 'drain';

/** A live fighter on the field. Player and enemy units share one shape. */
export interface Unit {
  readonly id: number;
  readonly team: Team;
  readonly kind: UnitKindId;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  /** Movement speed, field px/sec. */
  readonly speed: number;
  /** Damage per attack (before the target's armor). */
  readonly damage: number;
  /** Flat damage soaked per incoming hit. */
  readonly armor: number;
  /** Attack reach, field px, measured between unit centers. */
  readonly range: number;
  /** Seconds between attacks. */
  readonly attackPeriod: number;
  /** Seconds until this unit may attack again. */
  cooldown: number;
  readonly style: AttackStyle;
  readonly projectile: ProjectileKind;
  readonly projectileSpeed: number;
  /** Splash radius of this unit's hits (0 = single target). */
  readonly splashRadius: number;
  /** Damage multiplier against the wall. */
  readonly siegeBonus: number;
  /** Body radius: used for spacing, melee reach, and splash hit tests. */
  readonly radius: number;
  /** Credits paid out when this unit dies (enemies only). */
  readonly bounty: number;
  /**
   * The visible rank: gear carried and the colour it is painted. Player units
   * take it from the kind's level, enemies from how far they have scaled past
   * their debut — the same ladder either way, so the colours mean one thing.
   */
  readonly rank: Rank;
  /** Siege engines push for the wall and ignore your soldiers entirely. */
  readonly wallFocused: boolean;
  /** Offset from the support line this kind holds at; negative is forward. */
  readonly posture: number;
  /** Seconds between raising a minion; 0 for everything that can't. */
  readonly spawnPeriod: number;
  spawnIn: number;
  readonly spawnKind: EnemyUnitId | null;

  targetId: number | null;
  /** Seconds until this unit looks for a better target. */
  retargetIn: number;
  /** Facing, radians, for weapon/animation rendering. */
  aim: number;
  /** Walk-cycle phase, advanced while moving. */
  anim: number;
  /** Seconds of hit-flash left. Render-only. */
  flash: number;
  /** Seconds of firing recoil left: the kick after an attack. Render-only. */
  recoil: number;
  /**
   * Seconds this unit has been held at the support line with a target it
   * cannot reach. Past the configured limit it pushes out regardless.
   */
  heldAtLine: number;
}

export interface Projectile {
  readonly id: number;
  readonly team: Team;
  readonly kind: ProjectileKind;
  x: number;
  y: number;
  readonly speed: number;
  readonly damage: number;
  readonly splashRadius: number;
  readonly siegeBonus: number;
  /** Homing target; falls back to (tx, ty) once the target is gone. */
  targetId: number | null;
  /** Last known target position — also the aim point for wall shots. */
  tx: number;
  ty: number;
  /** True when aimed at the wall rather than a unit. */
  readonly atWall: boolean;
  /** Seconds before the shot expires on its own. */
  life: number;
}

/** A timed area effect: an inbound shell, or ground that keeps burning. */
export interface Hazard {
  readonly id: number;
  readonly kind: 'strike' | 'burn';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** One-shot damage for a 'strike'. */
  readonly damage: number;
  /** Damage per second for a 'burn'. */
  readonly dps: number;
  /** Seconds before this hazard goes off: the shell is still in the air. */
  delay: number;
  /** Seconds of burning left (unused by a 'strike', which is instantaneous). */
  timer: number;
  /** Initial `delay` for a strike / `timer` for a burn, for drawing progress. */
  readonly duration: number;
}

export interface WallState {
  level: number;
  hp: number;
  /** Derived from level; cached for the UI and the renderer. */
  maxHp: number;
}

/** A static defense emplacement on the wall. Position comes from config. */
export interface Tower {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  cooldown: number;
}

/** Enemy reinforcements still owed to the field this wave. */
export interface QueuedSpawn {
  readonly kind: EnemyUnitId;
  readonly x: number;
  /** Battle clock, seconds, at which this one walks on. */
  readonly at: number;
  /** Stat multipliers baked in at planning time. */
  readonly hpScale: number;
  readonly damageScale: number;
  readonly bountyScale: number;
}

/** Everything the player buys with credits. Plain levels, 1-based. */
/**
 * The command-level tracks. Soldiers are not upgraded here — each kind carries
 * its own level in `SimState.unitLevels`, so improving riflemen is a different
 * decision from improving rocketeers.
 */
export interface UpgradeState {
  wall: number;
  towers: number;
  /** Size of the deployment charge pool. */
  charges: number;
  /** Charge recharge rate. */
  recharge: number;
}

export interface AbilityState {
  /** 0 = still locked. */
  level: number;
  cooldown: number;
}

export interface ChargeState {
  current: number;
  max: number;
  /** Seconds until the next charge returns. */
  rechargeIn: number;
}

/** The idle side of the game: unlockable, toggleable automation. */
export interface AutomationState {
  autoLaunch: { unlocked: boolean; enabled: boolean };
  autoDeploy: { unlocked: boolean; enabled: boolean };
}

export type Phase = 'prep' | 'battle';

export interface SimStats {
  totalKills: number;
  totalCreditsEarned: number;
  wavesWon: number;
  wavesLost: number;
}

/** The outcome of the wave that just ended, for the report screen. */
export interface WaveResult {
  wave: number;
  won: boolean;
  credits: number;
  kills: number;
  unitsLost: number;
  wallHpLeft: number;
  wallMaxHp: number;
  durationSec: number;
}

export interface SimState {
  version: number;
  readonly seed: number;
  rngState: number;
  nextId: number;

  credits: number;
  /** The wave the player is about to face (1-based). Only a win advances it. */
  wave: number;
  bestWave: number;
  phase: Phase;

  wall: WallState;
  towers: Tower[];
  upgrades: UpgradeState;
  unlocked: Record<PlayerUnitId, boolean>;
  /** Per-kind level: 0 while the kind is still locked, 1 once unlocked. */
  unitLevels: Record<PlayerUnitId, number>;
  abilities: Record<AbilityId, AbilityState>;
  automation: AutomationState;

  units: Unit[];
  projectiles: Projectile[];
  hazards: Hazard[];
  charges: ChargeState;
  spawnQueue: QueuedSpawn[];
  /** Seconds since the current battle started. */
  battleTime: number;
  /** Credits and kills banked during the current battle, for the report. */
  battleCredits: number;
  battleKills: number;
  battleUnitsLost: number;

  /** Which unit a deployment charge spawns, and which ability a tap fires. */
  selectedUnit: PlayerUnitId;
  selectedAbility: AbilityId | null;

  /** Seconds of prep left before automation launches the next wave. */
  autoLaunchIn: number;

  lastResult: WaveResult | null;
  stats: SimStats;
}

/** Discrete things that happened during a `step()`, for sound and FX. */
export type SimEvent =
  | { type: 'spawn'; team: Team; kind: UnitKindId; x: number; y: number }
  | { type: 'shot'; kind: ProjectileKind; x: number; y: number; aim: number }
  | { type: 'hit'; x: number; y: number; team: Team }
  | {
      type: 'kill';
      team: Team;
      kind: UnitKindId;
      x: number;
      y: number;
      bounty: number;
      /** Facing at the moment of death, so the body falls the way it stood. */
      aim: number;
    }
  | { type: 'wallHit'; x: number; y: number; damage: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'burn'; x: number; y: number; radius: number }
  | { type: 'waveStarted'; wave: number }
  | { type: 'waveEnded'; wave: number; won: boolean };

/** "While you were away" summary, from passive garrison income. */
export interface IdleReport {
  creditsEarned: number;
  secondsCredited: number;
  secondsAway: number;
  capped: boolean;
}
