/**
 * Siege, as executable claims.
 *
 * The strip the guns cannot reach only means something if standoff siege is a
 * problem you have to go and solve: it must be out of tower reach, it must
 * give you time to get to it, and soldiers must actually be able to get there.
 * Each of those broke at least once while this was being built.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { buyUpgrade, buyWeaponLevel, deployUnit } from '../actions';
import { holdLineY, uncoveredStrip } from '../derive';
import { startBattle, step } from '../engine';
import { ENEMY_UNITS, PLAYER_UNITS, TOWER_WEAPON_ORDER } from '../roster';
import { planWave, siegeAllowance } from '../waves';
import { DT, SEED, freshState } from './helpers';
import type { EnemyUnitId, SimState } from '../types';

const SIEGE = (Object.keys(ENEMY_UNITS) as EnemyUnitId[]).filter((k) => ENEMY_UNITS[k].standoff === true);

/** A player who has upgraded steadily to the given wave. */
function readyAt(wave: number, wallLevels: number, towerLevels: number, chargeLevels = 0): SimState {
  const state = freshState();
  state.wave = wave;
  state.credits = 10_000_000;
  for (let i = 0; i < wallLevels; i++) buyUpgrade(state, cfg, 'wall');
  for (let i = 0; i < towerLevels; i++) buyUpgrade(state, cfg, 'towers');
  for (let i = 0; i < chargeLevels; i++) buyUpgrade(state, cfg, 'charges');
  // The `towers` track buys pads, not firepower — the guns bolted into them
  // carry that now, so a build without gun levels is an empty parapet.
  for (let i = 0; i < towerLevels; i++) {
    for (const weapon of TOWER_WEAPON_ORDER) buyWeaponLevel(state, cfg, weapon);
  }
  state.credits = 10_000_000;
  return state;
}

describe('siege', () => {
  it('is every army, not just the kingdom', () => {
    expect(new Set(SIEGE.map((k) => ENEMY_UNITS[k].faction)).size).toBe(3);
  });

  it('outranges the guns at every tower level, so it parks in the strip', () => {
    for (const kind of SIEGE) {
      const def = ENEMY_UNITS[kind];
      // Where it stops: its own range short of the wall.
      const parkY = cfg.field.wallTop - def.range;
      for (const level of [1, 10, 40, 200]) {
        expect(parkY, `${def.name} at tower L${level}`).toBeLessThan(uncoveredStrip(cfg, level));
      }
      expect(def.wallFocused).toBe(true);
    }
  });

  /**
   * The clock used to *shrink* as the campaign went on — 14 seconds at wave
   * 13, four by wave 35 — because engine count and per-engine damage both
   * scaled while the wall only grew with what you bought on a flat price
   * curve. It needed a share of the wall per hit to hold still. On the
   * escalating curve it holds itself: wall levels compound on a square-root
   * clock and so does enemy damage, so flat shots plus a cap on engines leave
   * a breach a minute or two out at every wave — which is what lets the wall
   * track mean something against the one threat the guns cannot touch.
   *
   * The builds below are what a player actually owns at that wave on this
   * curve, about 2.4 levels per square root of the wave.
   */
  it('gives you about the same time to answer it, whatever the wave', () => {
    const clocks: number[] = [];
    for (const [from, towers, wall] of [[13, 8, 8], [18, 10, 10], [25, 12, 12], [35, 14, 14]] as const) {
      // Not every wave fields siege any more: a horde or a skirmish line may
      // field none at all, which is the shape system working. Take the next
      // wave from here that does, since the claim is about the clock.
      let wave = from;
      while (wave < from + 12 && !planWave(cfg, wave, SEED).composition.some((c) => SIEGE.includes(c.kind))) {
        wave += 1;
      }
      const state = readyAt(wave, wall, towers);
      startBattle(state, cfg);
      // Keep only the siege: this measures the siege clock, not the whole wave.
      state.spawnQueue = state.spawnQueue.filter((q) => SIEGE.includes(q.kind));
      const engines = state.spawnQueue.length;
      expect(engines, `wave ${wave} fields siege`).toBeGreaterThan(0);
      let seconds = 0;
      for (let i = 0; i < 300 / DT && state.phase === 'battle'; i++) {
        step(state, DT, cfg);
        seconds = i * DT;
      }
      expect(state.lastResult?.wallHpLeft, `wave ${wave} breaches eventually`).toBe(0);
      clocks.push(seconds * engines);
    }
    // Engine-seconds rather than seconds: a wave may field one engine or three
    // depending on its shape, and three breach three times as fast. What has
    // to hold across the campaign is the time one engine needs — long enough
    // to clear an escort and walk out, short enough to be a threat. It drifts
    // upward now, in the player's favour, which is the wall track paying off.
    for (const c of clocks) expect(c).toBeGreaterThan(100);
    for (const c of clocks) expect(c).toBeLessThan(320);
  }, 60000);

  it('caps the summoners too, since a necromancer is a rate and not a body', () => {
    for (let wave = 10; wave <= 80; wave++) {
      const summoners = planWave(cfg, wave, SEED)
        .composition.filter((c) => ENEMY_UNITS[c.kind].spawnKind !== undefined)
        .reduce((n, c) => n + c.count, 0);
      expect(summoners, `wave ${wave}`).toBeLessThanOrEqual(cfg.waves.summonerMax);
    }
  });

  it('stays a handful of engines however rich the wave gets', () => {
    for (let wave = 10; wave <= 60; wave++) {
      const engines = planWave(cfg, wave, SEED)
        .composition.filter((c) => SIEGE.includes(c.kind))
        .reduce((n, c) => n + c.count, 0);
      expect(engines, `wave ${wave}`).toBeLessThanOrEqual(siegeAllowance(cfg, wave));
    }
    expect(siegeAllowance(cfg, 60)).toBeLessThanOrEqual(cfg.waves.siegeMax);
  });

  it('is answered by walking out to it, since the guns never will', () => {
    // A wave-13 build: the full parapet and a deep enough charge pool to put
    // a firing line out. Under-invest and the wave is simply lost, which is a
    // statement about the curve rather than about siege — so this build is
    // sized against the curve, and grew when the late scaling steepened.
    const state = readyAt(13, 14, 14, 6);
    startBattle(state, cfg);
    const strip = uncoveredStrip(cfg, state.upgrades.towers);
    const hold = holdLineY(cfg);
    let deepest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 120 / DT && state.phase === 'battle'; i++) {
      while (deployUnit(state, cfg, 'rifleman')) continue;
      step(state, DT, cfg);
      for (const u of state.units) if (u.team === 'player') deepest = Math.min(deepest, u.y);
    }
    // They left the muster line far behind and brought the strip under fire —
    // standing in it is not required, shooting into it is the point. How far
    // past the line they get is not the claim: rifles are kinetic and siege is
    // armoured, so they chew through it slowly by design, and how deep they
    // press depends on how fast the escort dies.
    expect(deepest).toBeLessThan(hold);
    expect(deepest - PLAYER_UNITS.rifleman.range).toBeLessThan(strip);
    expect(state.units.filter((u) => SIEGE.includes(u.kind as EnemyUnitId))).toHaveLength(0);
  }, 60000);
});
