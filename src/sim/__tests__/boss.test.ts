/**
 * Boss waves, as executable claims.
 *
 * Every tenth wave is meant to be an event — the one you do not clear on the
 * first go, or the second. It was not: a boss was worth whatever its roster
 * line said times the campaign curve, which came to about 7% of the wave it
 * gave its name to, and because a boss wave also cuts its rank and file, the
 * tenth wave was *easier* than the ninth. Worse, the boss then stood in the
 * field trading blows with soldiers while the parapet shot it, so even a boss
 * carrying two and a half times its neighbours' hit points never threatened
 * anything: measured, first-try wins at waves 10, 20, 30 and 40 with the wall
 * barely scratched.
 *
 * So it carries real weight now, and it walks past the line for the wall.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { ENEMY_UNITS, bossFor } from '../roster';
import { planWave } from '../waves';
import { FACTION_ORDER } from '../roster';

const bossWave = (wave: number, seed = 1) => planWave(cfg, wave, seed);

describe('a boss', () => {
  it('turns up on every tenth wave, and nowhere else', () => {
    for (let wave = 1; wave <= 60; wave++) {
      const plan = planWave(cfg, wave, 1);
      expect(plan.boss, `wave ${wave}`).toBe(wave % cfg.waves.bossEvery === 0);
    }
  });

  it('walks past your soldiers for the wall, which is what makes it a boss', () => {
    for (const faction of FACTION_ORDER) {
      const boss = bossFor(faction);
      expect(boss, faction).not.toBeNull();
      // Not wall-focused, it simply stood in the field being shot at.
      expect(boss!.wallFocused, boss!.name).toBe(true);
      expect(boss!.siegeBonus, boss!.name).toBeGreaterThan(1);
    }
  });

  it('is worth as much as everything else in its wave put together', () => {
    // Isolated by planning the same wave with a weightless boss: what the
    // difference comes to is what the boss is carrying.
    const weightless = { ...cfg, waves: { ...cfg.waves, bossThreat: 0 } };
    for (const wave of [10, 20, 30, 40, 50, 60]) {
      const withBoss = planWave(cfg, wave, 1).totalHp;
      const without = planWave(weightless, wave, 1).totalHp;
      const share = (withBoss - without) / withBoss;
      expect(share, `wave ${wave}`).toBeGreaterThanOrEqual(0.49);
    }
  });

  it('makes its wave a step up, not the dip it used to be', () => {
    for (const wave of [10, 20, 30, 40, 50]) {
      const boss = bossWave(wave).totalHp;
      const before = bossWave(wave - 1).totalHp;
      const after = bossWave(wave + 1).totalHp;
      const neighbour = Math.max(before, after);
      expect(boss / neighbour, `wave ${wave} against its neighbours`).toBeGreaterThan(1.3);
    }
  });

  it('arrives last, behind the escort it came with', () => {
    for (const seed of [1, 7, 23]) {
      for (const wave of [10, 20, 30, 40]) {
        const spawns = bossWave(wave, seed).spawns;
        const bossSpawn = spawns.find((q) => ENEMY_UNITS[q.kind].boss);
        expect(bossSpawn, `seed ${seed} wave ${wave}`).toBeDefined();
        // In the last clump: its clumpmates are jittered around a shared
        // arrival, so "last" is the clump, not the exact tick.
        const latest = Math.max(...spawns.map((q) => q.at));
        expect(latest - bossSpawn!.at, `seed ${seed} wave ${wave}`).toBeLessThan(0.5);
        const before = spawns.filter((q) => q.at < bossSpawn!.at).length;
        expect(before / spawns.length, `seed ${seed} wave ${wave}`).toBeGreaterThan(0.5);
      }
    }
  });

  it('names its wave and says what it is, so losing it teaches something', () => {
    const plan = bossWave(10);
    expect(plan.label).toBeTruthy();
    expect(plan.hint).toBeTruthy();
    expect(planWave(cfg, 11, 1).label).toBeNull();
  });
});
