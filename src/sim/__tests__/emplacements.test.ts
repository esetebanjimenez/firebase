/**
 * Typed emplacements, as executable claims.
 *
 * The parapet does most of a wave's killing — turning the guns off drops a
 * wave's margin from 45-71% to 0-32% — and all of it used to be fixed
 * kinetic, so the largest share of the player's output answered everything
 * equally and diluted every decision they made. These assert that the guns
 * are now part of the triangle, and that fitting them is a real choice.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { buyUpgrade, buyWeaponLevel, fitTowerWeapon } from '../actions';
import { counterMultiplier, weaponDps, weaponUpgradeCost } from '../derive';
import { startBattle, step } from '../engine';
import { TOWER_WEAPONS, TOWER_WEAPON_ORDER } from '../roster';
import { deserialize, serialize } from '../persistence';
import { DT, freshState } from './helpers';
import type { BodyClass, TowerWeaponId } from '../types';

function withPads(count: number) {
  const state = freshState();
  state.credits = 10_000_000;
  for (let i = 0; i < count * cfg.towers.emplacementEvery; i++) buyUpgrade(state, cfg, 'towers');
  for (const weapon of TOWER_WEAPON_ORDER) buyWeaponLevel(state, weapon);
  state.credits = 10_000_000;
  return state;
}

describe('typed emplacements', () => {
  it('covers all three damage classes, so a parapet can answer any shape', () => {
    const classes = TOWER_WEAPON_ORDER.map((id) => TOWER_WEAPONS[id].damageClass);
    expect(new Set(classes).size).toBe(3);
  });

  it('gives each gun a body class it beats and one it is wasted on', () => {
    for (const id of TOWER_WEAPON_ORDER) {
      const damage = TOWER_WEAPONS[id].damageClass;
      const beats = (['armored', 'swarm', 'elusive'] as BodyClass[]).filter(
        (b) => counterMultiplier(cfg, damage, b) > 1,
      );
      const wasted = (['armored', 'swarm', 'elusive'] as BodyClass[]).filter(
        (b) => counterMultiplier(cfg, damage, b) < 1,
      );
      expect(beats, id).toHaveLength(1);
      expect(wasted, id).toHaveLength(1);
    }
  });

  it('starts with only the MG available, and sells the rest', () => {
    const state = freshState();
    expect(state.upgrades.weapons.mg).toBe(1);
    expect(state.upgrades.weapons.grenade).toBe(0);
    expect(state.upgrades.weapons.rocket).toBe(0);
    // An unresearched gun cannot be fitted, however many pads are standing.
    const pads = withPads(1);
    pads.upgrades.weapons.rocket = 0;
    expect(fitTowerWeapon(pads, 0, 'rocket')).toBe(false);
  });

  it('refits free, but only between waves', () => {
    const state = withPads(2);
    expect(state.phase).toBe('prep');
    const before = state.credits;
    expect(fitTowerWeapon(state, 0, 'rocket')).toBe(true);
    expect(state.towers[0].weapon).toBe('rocket');
    expect(state.credits).toBe(before);

    // Mid-battle the parapet is what you left it as.
    startBattle(state, cfg);
    expect(fitTowerWeapon(state, 0, 'mg')).toBe(false);
    expect(state.towers[0].weapon).toBe('rocket');
  });

  it('lifts every pad fitted with a gun when that gun levels', () => {
    const state = withPads(2);
    fitTowerWeapon(state, 0, 'mg');
    fitTowerWeapon(state, 1, 'mg');
    const before = weaponDps('mg', state.upgrades.weapons.mg);
    expect(buyWeaponLevel(state, 'mg')).toBe(true);
    expect(weaponDps('mg', state.upgrades.weapons.mg)).toBeGreaterThan(before);
    // The other guns are untouched: levels are per type, not per pad.
    expect(state.upgrades.weapons.rocket).toBe(1);
  });

  it('keeps a pad fitted across the rebuild that follows an upgrade', () => {
    const state = withPads(1);
    fitTowerWeapon(state, 0, 'rocket');
    buyUpgrade(state, cfg, 'towers');
    buyUpgrade(state, cfg, 'towers');
    expect(state.towers[0].weapon).toBe('rocket');
    // A newly built pad arrives with the gun everyone starts with.
    expect(state.towers[1]?.weapon).toBe('mg');
  });

  it('shoots what is bolted in, with that gun class', () => {
    const state = withPads(1);
    fitTowerWeapon(state, 0, 'rocket');
    startBattle(state, cfg);
    let seen: string | null = null;
    for (let i = 0; i < 60 / DT && !seen; i++) {
      step(state, DT, cfg);
      const shot = state.projectiles.find((p) => p.team === 'player');
      if (shot) seen = shot.damageClass;
    }
    expect(seen).toBe(TOWER_WEAPONS.rocket.damageClass);
  });

  it('prices the first level of a gun at its base cost, then compounds', () => {
    for (const id of TOWER_WEAPON_ORDER) {
      expect(weaponUpgradeCost(id, 0)).toBe(TOWER_WEAPONS[id].baseCost);
      for (let level = 0; level < 6; level++) {
        expect(weaponUpgradeCost(id, level + 1)).toBeGreaterThan(weaponUpgradeCost(id, level));
      }
    }
  });

  it('refuses a save from before the guns were typed', () => {
    const state = withPads(1);
    const raw = JSON.parse(serialize(state, 1));
    delete raw.state.upgrades.weapons;
    // No fit-out can be guessed for it, so it is foreign rather than migrated.
    expect(deserialize(JSON.stringify(raw), cfg)).toBeNull();
  });

  it('round-trips what is fitted where', () => {
    const state = withPads(2);
    fitTowerWeapon(state, 0, 'grenade');
    fitTowerWeapon(state, 1, 'rocket');
    const loaded = deserialize(serialize(state, 1), cfg)!.state;
    expect(loaded.towers.map((t) => t.weapon)).toEqual(['grenade', 'rocket']);
    expect(loaded.upgrades.weapons).toEqual(state.upgrades.weapons);
  });

  it('aims each gun its own way, which is why fitting one is a decision', () => {
    // A coefficient was not enough: a quarter-second gun has near-perfect
    // uptime, while a two-second rocket pours most of a warhead into a
    // skeleton. The rocket picks the heaviest thing it can see instead.
    const state = withPads(1);
    fitTowerWeapon(state, 0, 'rocket');
    startBattle(state, cfg);
    for (let i = 0; i < 30 / DT; i++) {
      step(state, DT, cfg);
      const shot = state.projectiles.find((p) => p.team === 'player' && p.targetId !== null);
      if (!shot) continue;
      const aimedAt = state.units.find((u) => u.id === shot.targetId);
      if (!aimedAt) continue;
      const inRange = state.units.filter((u) => u.team === 'enemy' && u.hp > 0);
      if (inRange.length < 2) continue;
      expect(aimedAt.maxHp).toBe(Math.max(...inRange.map((u) => u.maxHp)));
      return;
    }
  });
});

describe('the parapet is part of the triangle', () => {
  it('kills what its gun counters faster than what the gun is wasted on', () => {
    const damageOver = (weapon: TowerWeaponId, against: 'knight' | 'skeleton') => {
      const state = withPads(1);
      fitTowerWeapon(state, 0, weapon);
      for (let i = 0; i < 12; i++) buyWeaponLevel(state, weapon);
      startBattle(state, cfg);
      state.spawnQueue = [];
      state.units = [];
      const pool = 1e9;
      for (let i = 0; i < 30 / DT; i++) {
        // Keep one immortal target parked in front of the gun.
        if (state.units.length === 0 || state.units[0].hp < pool / 2) {
          state.units = [];
          state.spawnQueue = [
            { kind: against, x: cfg.field.gateX, at: 0, hpScale: 1, damageScale: 0, bountyScale: 1 },
          ];
          step(state, DT, cfg);
          if (state.units[0]) state.units[0].hp = pool;
          continue;
        }
        state.units[0].y = cfg.field.wallTop - 60;
        step(state, DT, cfg);
      }
      return pool - (state.units[0]?.hp ?? pool);
    };
    expect(damageOver('rocket', 'knight')).toBeGreaterThan(damageOver('rocket', 'skeleton'));
    expect(damageOver('mg', 'skeleton')).toBeGreaterThan(damageOver('mg', 'knight'));
  }, 60000);
});
