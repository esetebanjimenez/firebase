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
  /**
   * Art: a silhouette, a mark, and a five-colour ramp —
   * [body, lit, accent, outline, shade]. The shade is the body's turned-away
   * side; without it a unit is a flat disc with a rim.
   */
  readonly silhouette: Silhouette;
  readonly mark: UnitMark;
  readonly colors: readonly [string, string, string, string, string];
}

export interface PlayerUnitDef extends UnitStats {
  readonly id: PlayerUnitId;
  /** Two-to-six characters, for the deployment chips. */
  readonly short: string;
  /** Deployment charges consumed per unit. */
  readonly chargeCost: number;
  /** Credits to unlock. 0 = available from the first wave. */
  readonly unlockCost: number;
  /** Credits for this kind's level 1 → 2; later levels grow geometrically. */
  readonly upgradeCost: number;
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
    short: 'Rifle',
    blurb: 'Cheap, mobile, accurate. The backbone of the line.',
    hp: 60,
    damage: 8,
    attackPeriod: 0.7,
    range: 68,
    speed: 44,
    armor: 0,
    style: 'ranged',
    projectile: 'bullet',
    projectileSpeed: 420,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    chargeCost: 1,
    unlockCost: 0,
    upgradeCost: 30,
    silhouette: 'trooper',
    mark: 'gun',
    colors: ['#3f4a33', '#6b7a50', '#cfa98a', '#2a3124', '#2f3827'],
  },
  shield: {
    id: 'shield',
    name: 'Shield Bearer',
    short: 'Shield',
    blurb: 'Riot shield and armour. Soaks the charge so the rifles keep firing.',
    hp: 240,
    damage: 8,
    attackPeriod: 1.1,
    range: 22,
    speed: 34,
    armor: 4,
    style: 'melee',
    projectile: 'bullet',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 9,
    chargeCost: 1,
    unlockCost: 120,
    upgradeCost: 45,
    silhouette: 'armored',
    mark: 'shield',
    colors: ['#2f3a44', '#55656f', '#cfa98a', '#1d242a', '#242d35'],
  },
  gunner: {
    id: 'gunner',
    name: 'Machine Gunner',
    short: 'MG',
    blurb: 'Belt-fed and brutal against crowds, but slow to reposition.',
    hp: 90,
    damage: 4.5,
    attackPeriod: 0.2,
    range: 60,
    speed: 26,
    armor: 1,
    style: 'ranged',
    projectile: 'bullet',
    projectileSpeed: 480,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    chargeCost: 2,
    unlockCost: 400,
    upgradeCost: 80,
    silhouette: 'trooper',
    mark: 'bigGun',
    colors: ['#3b4330', '#7d8a5c', '#cfa98a', '#23281c', '#2d3325'],
  },
  rocketeer: {
    id: 'rocketeer',
    name: 'Rocketeer',
    short: 'Rocket',
    blurb: 'Anti-armour rockets with splash. Answer to golems, rams and giants.',
    hp: 75,
    damage: 34,
    attackPeriod: 2.6,
    range: 100,
    speed: 26,
    armor: 0,
    style: 'ranged',
    projectile: 'rocket',
    projectileSpeed: 240,
    splashRadius: 30,
    siegeBonus: 1,
    radius: 7,
    chargeCost: 2,
    unlockCost: 900,
    upgradeCost: 130,
    silhouette: 'trooper',
    mark: 'launcher',
    colors: ['#43402c', '#8a7f4e', '#cfa98a', '#272519', '#332f20'],
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
    range: 18,
    speed: 42,
    armor: 0,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'grunt',
    mark: 'blade',
    colors: ['#7a4a30', '#a86b40', '#d9a885', '#4a2a1c', '#5d3824'],
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
    range: 76,
    speed: 34,
    armor: 0,
    style: 'ranged',
    projectile: 'arrow',
    projectileSpeed: 260,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'grunt',
    mark: 'bow',
    colors: ['#3f6b3a', '#5f9150', '#d9a885', '#27401f', '#305128'],
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
    range: 20,
    speed: 30,
    armor: 3,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 9,
    silhouette: 'armored',
    mark: 'blade',
    colors: ['#6e7684', '#aab3c0', '#d9a885', '#3c424c', '#545b67'],
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
    range: 28,
    speed: 20,
    armor: 5,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 3,
    radius: 12,
    wallFocused: true,
    silhouette: 'engine',
    mark: 'wheels',
    colors: ['#6b4a2a', '#8f6436', '#b9b9c4', '#3b2715', '#523820'],
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
    range: 190,
    speed: 14,
    armor: 1,
    style: 'ranged',
    projectile: 'boulder',
    projectileSpeed: 140,
    splashRadius: 28,
    siegeBonus: 2,
    radius: 10,
    wallFocused: true,
    silhouette: 'engine',
    mark: 'wheels',
    colors: ['#5d4428', '#8a6a38', '#9aa0a8', '#33230f', '#46321d'],
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
    range: 24,
    speed: 28,
    armor: 6,
    style: 'melee',
    projectile: 'arrow',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1.5,
    radius: 12,
    boss: true,
    silhouette: 'brute',
    mark: 'blade',
    colors: ['#8d7330', '#e0c35c', '#d9a885', '#4e3d12', '#6b5724'],
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
    range: 16,
    speed: 60,
    armor: 0,
    style: 'melee',
    projectile: 'bolt',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 5,
    silhouette: 'grunt',
    mark: 'horns',
    colors: ['#8c2f6b', '#c24a93', '#f0a8d0', '#4e1839', '#6b2452'],
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
    range: 84,
    speed: 30,
    armor: 0,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 240,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#3a3f8c', '#5a63c8', '#d9a885', '#20224e', '#2c3069'],
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
    range: 100,
    speed: 26,
    armor: 1,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 200,
    splashRadius: 26,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#6a2fa8', '#9a5ce0', '#d9a885', '#3a1660', '#512480'],
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
    range: 24,
    speed: 16,
    armor: 7,
    style: 'melee',
    projectile: 'bolt',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1.8,
    radius: 12,
    silhouette: 'brute',
    mark: 'none',
    colors: ['#5a5f6b', '#868d9b', '#6fe0d0', '#31343c', '#454953'],
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
    range: 140,
    speed: 22,
    armor: 3,
    style: 'ranged',
    projectile: 'bolt',
    projectileSpeed: 220,
    splashRadius: 40,
    siegeBonus: 1.4,
    radius: 10,
    boss: true,
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#2d1c6e', '#7b5cff', '#b9f0ff', '#160d3a', '#221553'],
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
    range: 16,
    speed: 40,
    armor: 0,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 5,
    silhouette: 'grunt',
    mark: 'blade',
    colors: ['#9aa08c', '#d8dcc4', '#6e7360', '#43463a', '#767a69'],
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
    range: 18,
    speed: 18,
    armor: 2,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'grunt',
    mark: 'none',
    colors: ['#4a6b3f', '#6e9153', '#8aa06e', '#2a3f22', '#395130'],
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
    range: 18,
    speed: 58,
    armor: 0,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'grunt',
    mark: 'horns',
    colors: ['#6b4a6b', '#9a6f9a', '#d8c4d8', '#3a263a', '#523852'],
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
    range: 80,
    speed: 36,
    armor: 2,
    style: 'ranged',
    projectile: 'drain',
    projectileSpeed: 190,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    silhouette: 'caster',
    mark: 'none',
    colors: ['#2f4a5a', '#4e7d92', '#9ae0f0', '#1a2a33', '#243944'],
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
    range: 72,
    speed: 24,
    armor: 1,
    style: 'ranged',
    projectile: 'drain',
    projectileSpeed: 200,
    splashRadius: 0,
    siegeBonus: 1,
    radius: 7,
    spawnPeriod: 5,
    spawnKind: 'skeleton',
    silhouette: 'caster',
    mark: 'staff',
    colors: ['#2a2a3a', '#4a4a6b', '#67d49b', '#16161f', '#20202c'],
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
    range: 26,
    speed: 22,
    armor: 6,
    style: 'melee',
    projectile: 'drain',
    projectileSpeed: 0,
    splashRadius: 0,
    siegeBonus: 2.2,
    radius: 14,
    boss: true,
    silhouette: 'brute',
    mark: 'horns',
    colors: ['#b9bca8', '#e8ebd4', '#67d49b', '#5a5d4c', '#8e9180'],
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
