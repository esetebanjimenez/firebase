/**
 * roster.ts — the stat blocks for every unit in the game.
 *
 * Balance surface #1 (the other is config.ts, which holds the global curves).
 * Base stats here are the wave-1 / upgrade-level-1 values; the per-wave enemy
 * scaling and the player's upgrade multipliers are applied in derive.ts, so a
 * number in this file always means "what this unit is worth at the start".
 */

import type {
  AttackStyle,
  EnemyUnitId,
  FactionId,
  PlayerUnitId,
  ProjectileKind,
  Silhouette,
  UnitMark,
} from './types';

/** Stats shared by both teams' unit definitions. */
export interface UnitStats {
  readonly name: string;
  readonly hp: number;
  readonly damage: number;
  /** Seconds between attacks. */
  readonly attackPeriod: number;
  /** Attack reach in field px, center to center. */
  readonly range: number;
  /** Field px per second. */
  readonly speed: number;
  readonly armor: number;
  readonly style: AttackStyle;
  readonly projectile: ProjectileKind;
  readonly projectileSpeed: number;
  readonly splashRadius: number;
  /** Damage multiplier against the wall. */
  readonly siegeBonus: number;
  readonly radius: number;
  /** Art: silhouette + 4-colour palette + a distinguishing mark. */
  readonly silhouette: Silhouette;
  readonly mark: UnitMark;
  readonly colors: readonly [string, string, string, string];
}

export interface PlayerUnitDef extends UnitStats {
  readonly id: PlayerUnitId;
  /** Deployment charges consumed per unit. */
  readonly chargeCost: number;
  /** Credits to unlock. 0 = available from the first wave. */
  readonly unlockCost: number;
  readonly blurb: string;
}

export interface EnemyUnitDef extends UnitStats {
  readonly id: EnemyUnitId;
  readonly faction: FactionId;
  /** Wave-budget points this unit costs the wave planner. */
  readonly cost: number;
  /** Earliest wave this kind can appear in. */
  readonly fromWave: number;
  /** Credits paid for the kill, before per-wave scaling. */
  readonly bounty: number;
  /** Siege engines drive for the wall and ignore your soldiers. */
  readonly wallFocused?: boolean;
  /** Seconds between raising a minion (necromancers). */
  readonly spawnPeriod?: number;
  readonly spawnKind?: EnemyUnitId;
  /** Bosses are added on top of the budget on boss waves. */
  readonly boss?: boolean;
}

// ---------------------------------------------------------------------------
// Your force: modern infantry, deployed from the gate on charges.
// ---------------------------------------------------------------------------

export const PLAYER_UNITS: Readonly<Record<PlayerUnitId, PlayerUnitDef>> = {
  rifleman: {
    id: 'rifleman',
    name: 'Rifleman',
    blurb: 'Cheap, mobile, accurate. The backbone of the line.',
    hp: 60,
    damage: 8,
    attackPeriod: 0.7,
    range: 34,
    speed: 22,
    armor: 0,
    style: 'ranged',
    projectile: 'bullet',
    projectileSpeed: 210,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    chargeCost: 1,
    unlockCost: 0,
    silhouette: 'trooper',
    mark: 'gun',
    colors: ['#3f4a33', '#6b7a50', '#cfa98a', '#2a3124'],
  },
  shield: {
    id: 'shield',
    name: 'Shield Bearer',
    blurb: 'Riot shield and armour. Soaks the charge so the rifles keep firing.',
    hp: 240,
    damage: 8,
    attackPeriod: 1.1,
    range: 11,
    speed: 17,
    armor: 4,
    style: 'melee',
    projectile: 'bullet',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 5,
    chargeCost: 1,
    unlockCost: 120,
    silhouette: 'armored',
    mark: 'shield',
    colors: ['#2f3a44', '#55656f', '#cfa98a', '#1d242a'],
  },
  gunner: {
    id: 'gunner',
    name: 'Machine Gunner',
    blurb: 'Belt-fed and brutal against crowds, but slow to reposition.',
    hp: 90,
    damage: 4.5,
    attackPeriod: 0.2,
    range: 30,
    speed: 13,
    armor: 1,
    style: 'ranged',
    projectile: 'bullet',
    projectileSpeed: 240,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    chargeCost: 2,
    unlockCost: 400,
    silhouette: 'trooper',
    mark: 'bigGun',
    colors: ['#3b4330', '#7d8a5c', '#cfa98a', '#23281c'],
  },
  rocketeer: {
    id: 'rocketeer',
    name: 'Rocketeer',
    blurb: 'Anti-armour rockets with splash. Answer to golems, rams and giants.',
    hp: 75,
    damage: 34,
    attackPeriod: 2.6,
    range: 50,
    speed: 13,
    armor: 0,
    style: 'ranged',
    projectile: 'rocket',
    projectileSpeed: 120,
    splashRadius: 15,
    siegeBonus: 1,
    radius: 4,
    chargeCost: 2,
    unlockCost: 900,
    silhouette: 'trooper',
    mark: 'launcher',
    colors: ['#43402c', '#8a7f4e', '#cfa98a', '#272519'],
  },
};

export const PLAYER_UNIT_ORDER: readonly PlayerUnitId[] = ['rifleman', 'shield', 'gunner', 'rocketeer'];

// ---------------------------------------------------------------------------
// The three invading armies.
// ---------------------------------------------------------------------------

export interface FactionDef {
  readonly id: FactionId;
  readonly name: string;
  readonly blurb: string;
  /** Earliest wave this army can be drawn for. */
  readonly fromWave: number;
  /** Accent colour used by the UI and the wave banner. */
  readonly accent: string;
}

export const FACTIONS: Readonly<Record<FactionId, FactionDef>> = {
  kingdom: {
    id: 'kingdom',
    name: 'Kingdom Army',
    blurb: 'Levies, knights and siege engines. Numerous, armoured, relentless.',
    fromWave: 1,
    accent: '#d8c45a',
  },
  arcane: {
    id: 'arcane',
    name: 'Magical Army',
    blurb: 'Casters hurling bolts from range behind near-unkillable constructs.',
    fromWave: 4,
    accent: '#8f7bff',
  },
  undead: {
    id: 'undead',
    name: 'Necromancer Army',
    blurb: 'Cheap bodies without end — and necromancers raising more of them.',
    fromWave: 7,
    accent: '#67d49b',
  },
};

export const FACTION_ORDER: readonly FactionId[] = ['kingdom', 'arcane', 'undead'];

export const ENEMY_UNITS: Readonly<Record<EnemyUnitId, EnemyUnitDef>> = {
  // --- Kingdom ---
  militia: {
    id: 'militia',
    faction: 'kingdom',
    name: 'Militia',
    cost: 1,
    fromWave: 1,
    bounty: 6,
    hp: 34,
    damage: 5,
    attackPeriod: 1,
    range: 9,
    speed: 21,
    armor: 0,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'grunt',
    mark: 'blade',
    colors: ['#7a4a30', '#a86b40', '#d9a885', '#4a2a1c'],
  },
  archer: {
    id: 'archer',
    faction: 'kingdom',
    name: 'Archer',
    cost: 2,
    fromWave: 2,
    bounty: 9,
    hp: 28,
    damage: 6,
    attackPeriod: 1.3,
    range: 38,
    speed: 17,
    armor: 0,
    style: 'ranged',
    projectile: 'arrow',
    projectileSpeed: 130,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'grunt',
    mark: 'bow',
    colors: ['#3f6b3a', '#5f9150', '#d9a885', '#27401f'],
  },
  knight: {
    id: 'knight',
    faction: 'kingdom',
    name: 'Knight',
    cost: 4,
    fromWave: 5,
    bounty: 20,
    hp: 120,
    damage: 13,
    attackPeriod: 1.2,
    range: 10,
    speed: 15,
    armor: 3,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 5,
    silhouette: 'armored',
    mark: 'blade',
    colors: ['#6e7684', '#aab3c0', '#d9a885', '#3c424c'],
  },
  ram: {
    id: 'ram',
    faction: 'kingdom',
    name: 'Battering Ram',
    cost: 6,
    fromWave: 8,
    bounty: 38,
    hp: 260,
    damage: 40,
    attackPeriod: 1.8,
    range: 14,
    speed: 10,
    armor: 5,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 3,
    radius: 7,
    wallFocused: true,
    silhouette: 'engine',
    mark: 'wheels',
    colors: ['#6b4a2a', '#8f6436', '#b9b9c4', '#3b2715'],
  },
  catapult: {
    id: 'catapult',
    faction: 'kingdom',
    name: 'Catapult',
    cost: 7,
    fromWave: 12,
    bounty: 40,
    hp: 130,
    damage: 46,
    attackPeriod: 3.6,
    range: 95,
    speed: 7,
    armor: 1,
    style: 'ranged',
    projectile: 'boulder',
    projectileSpeed: 70,
    splashRadius: 14,
    siegeBonus: 2,
    radius: 6,
    wallFocused: true,
    silhouette: 'engine',
    mark: 'wheels',
    colors: ['#5d4428', '#8a6a38', '#9aa0a8', '#33230f'],
  },
  champion: {
    id: 'champion',
    faction: 'kingdom',
    name: 'Royal Champion',
    cost: 14,
    fromWave: 10,
    bounty: 160,
    hp: 380,
    damage: 34,
    attackPeriod: 1.1,
    range: 12,
    speed: 14,
    armor: 6,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1.5,
    radius: 7,
    boss: true,
    silhouette: 'brute',
    mark: 'blade',
    colors: ['#8d7330', '#e0c35c', '#d9a885', '#4e3d12'],
  },

  // --- Arcane ---
  imp: {
    id: 'imp',
    faction: 'arcane',
    name: 'Imp',
    cost: 1,
    fromWave: 1,
    bounty: 5,
    hp: 26,
    damage: 4,
    attackPeriod: 0.8,
    range: 8,
    speed: 30,
    armor: 0,
    style: 'melee',
    projectile: 'bolt',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 3,
    silhouette: 'grunt',
    mark: 'horns',
    colors: ['#8c2f6b', '#c24a93', '#f0a8d0', '#4e1839'],
  },
  apprentice: {
    id: 'apprentice',
    faction: 'arcane',
    name: 'Apprentice',
    cost: 2,
    fromWave: 2,
    bounty: 9,
    hp: 34,
    damage: 8,
    attackPeriod: 1.5,
    range: 42,
    speed: 15,
    armor: 0,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 120,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#3a3f8c', '#5a63c8', '#d9a885', '#20224e'],
  },
  battlemage: {
    id: 'battlemage',
    faction: 'arcane',
    name: 'Battle Mage',
    cost: 5,
    fromWave: 6,
    bounty: 24,
    hp: 70,
    damage: 18,
    attackPeriod: 2.2,
    range: 50,
    speed: 13,
    armor: 1,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 100,
    splashRadius: 13,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#6a2fa8', '#9a5ce0', '#d9a885', '#3a1660'],
  },
  golem: {
    id: 'golem',
    faction: 'arcane',
    name: 'Stone Golem',
    cost: 7,
    fromWave: 10,
    bounty: 52,
    hp: 330,
    damage: 26,
    attackPeriod: 1.6,
    range: 12,
    speed: 8,
    armor: 7,
    style: 'melee',
    projectile: 'bolt',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1.8,
    radius: 7,
    silhouette: 'brute',
    mark: 'none',
    colors: ['#5a5f6b', '#868d9b', '#6fe0d0', '#31343c'],
  },
  archmage: {
    id: 'archmage',
    faction: 'arcane',
    name: 'Archmage',
    cost: 15,
    fromWave: 10,
    bounty: 170,
    hp: 320,
    damage: 40,
    attackPeriod: 2.4,
    range: 70,
    speed: 11,
    armor: 3,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 110,
    splashRadius: 20,
    siegeBonus: 1.4,
    radius: 6,
    boss: true,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#2d1c6e', '#7b5cff', '#b9f0ff', '#160d3a'],
  },

  // --- Undead ---
  skeleton: {
    id: 'skeleton',
    faction: 'undead',
    name: 'Skeleton',
    cost: 0.6,
    fromWave: 1,
    bounty: 4,
    hp: 20,
    damage: 4,
    attackPeriod: 0.9,
    range: 8,
    speed: 20,
    armor: 0,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 3,
    silhouette: 'grunt',
    mark: 'blade',
    colors: ['#9aa08c', '#d8dcc4', '#6e7360', '#43463a'],
  },
  zombie: {
    id: 'zombie',
    faction: 'undead',
    name: 'Zombie',
    cost: 2,
    fromWave: 2,
    bounty: 11,
    hp: 110,
    damage: 9,
    attackPeriod: 1.5,
    range: 9,
    speed: 9,
    armor: 2,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'grunt',
    mark: 'none',
    colors: ['#4a6b3f', '#6e9153', '#8aa06e', '#2a3f22'],
  },
  ghoul: {
    id: 'ghoul',
    faction: 'undead',
    name: 'Ghoul',
    cost: 2,
    fromWave: 3,
    bounty: 10,
    hp: 46,
    damage: 8,
    attackPeriod: 0.7,
    range: 9,
    speed: 29,
    armor: 0,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'grunt',
    mark: 'horns',
    colors: ['#6b4a6b', '#9a6f9a', '#d8c4d8', '#3a263a'],
  },
  wraith: {
    id: 'wraith',
    faction: 'undead',
    name: 'Wraith',
    cost: 4,
    fromWave: 6,
    bounty: 20,
    hp: 60,
    damage: 14,
    attackPeriod: 1.6,
    range: 40,
    speed: 18,
    armor: 2,
    style: 'ranged',
    projectile: 'drain',
    projectileSpeed: 95,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    silhouette: 'caster',
    mark: 'none',
    colors: ['#2f4a5a', '#4e7d92', '#9ae0f0', '#1a2a33'],
  },
  necromancer: {
    id: 'necromancer',
    faction: 'undead',
    name: 'Necromancer',
    cost: 6,
    fromWave: 10,
    bounty: 40,
    hp: 120,
    damage: 9,
    attackPeriod: 2,
    range: 36,
    speed: 12,
    armor: 1,
    style: 'ranged',
    projectile: 'drain',
    projectileSpeed: 100,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 4,
    spawnPeriod: 5,
    spawnKind: 'skeleton',
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#2a2a3a', '#4a4a6b', '#67d49b', '#16161f'],
  },
  boneGiant: {
    id: 'boneGiant',
    faction: 'undead',
    name: 'Bone Giant',
    cost: 15,
    fromWave: 10,
    bounty: 180,
    hp: 460,
    damage: 44,
    attackPeriod: 1.4,
    range: 13,
    speed: 11,
    armor: 6,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 2.2,
    radius: 8,
    boss: true,
    silhouette: 'brute',
    mark: 'horns',
    colors: ['#b9bca8', '#e8ebd4', '#67d49b', '#5a5d4c'],
  },
};

export const ENEMY_UNIT_IDS = Object.keys(ENEMY_UNITS) as EnemyUnitId[];

/** Every non-boss kind of a faction that may appear by `wave`, cheapest first. */
export function rosterFor(faction: FactionId, wave: number): EnemyUnitDef[] {
  return ENEMY_UNIT_IDS.map((id) => ENEMY_UNITS[id])
    .filter((d) => d.faction === faction && !d.boss && d.fromWave <= wave)
    .sort((a, b) => a.cost - b.cost);
}

/** The faction's boss, if it has one. */
export function bossFor(faction: FactionId): EnemyUnitDef | null {
  return ENEMY_UNIT_IDS.map((id) => ENEMY_UNITS[id]).find((d) => d.faction === faction && d.boss) ?? null;
}
