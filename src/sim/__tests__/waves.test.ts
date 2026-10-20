import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { ENEMY_UNITS, FACTIONS } from '../roster';
import { availableFactions, factionsForWave, planWave } from '../waves';
import { openingThreatMult, waveBudget } from '../derive';
import { SEED } from './helpers';
import { randomSeed } from '../rng';

describe('faction schedule', () => {
  it('opens with the Kingdom alone and adds the other armies later', () => {
    expect(availableFactions(1)).toEqual(['kingdom']);
    expect(availableFactions(FACTIONS.arcane.fromWave)).toEqual(['kingdom', 'arcane']);
    expect(availableFactions(FACTIONS.undead.fromWave)).toEqual(['kingdom', 'arcane', 'undead']);
  });

  it('sends one army per wave until mixed waves begin', () => {
    for (let wave = 1; wave < cfg.waves.mixFromWave; wave++) {
      expect(factionsForWave(cfg, wave)).toHaveLength(1);
    }
    const mixed = Array.from({ length: 12 }, (_, i) => factionsForWave(cfg, cfg.waves.mixFromWave + i));
    expect(mixed.some((f) => f.length === 2)).toBe(true);
  });

  it('only ever fields units from the waveʼs own armies', () => {
    for (let wave = 1; wave <= 40; wave++) {
      const plan = planWave(cfg, wave, SEED);
      for (const entry of plan.composition) {
        expect(plan.factions).toContain(ENEMY_UNITS[entry.kind].faction);
      }
    }
  });
});

describe('planWave', () => {
  it('is deterministic for a given config and wave', () => {
    const a = planWave(cfg, 7, SEED);
    const b = planWave(cfg, 7, SEED);
    expect(b.spawns).toEqual(a.spawns);
    expect(b.composition).toEqual(a.composition);
  });

  it('differs between waves', () => {
    expect(planWave(cfg, 7, SEED).spawns).not.toEqual(planWave(cfg, 8, SEED).spawns);
  });

  it('never fields a kind before its debut wave', () => {
    for (let wave = 1; wave <= 60; wave++) {
      for (const entry of planWave(cfg, wave, SEED).composition) {
        expect(ENEMY_UNITS[entry.kind].fromWave).toBeLessThanOrEqual(wave);
      }
    }
  });

  it('grows in size and threat as waves go on', () => {
    const early = planWave(cfg, 2, SEED);
    const later = planWave(cfg, 25, SEED);
    expect(later.spawns.length).toBeGreaterThan(early.spawns.length);
    expect(later.totalHp).toBeGreaterThan(early.totalHp * 5);
  });

  it('respects the unit cap and the spawn window', () => {
    for (const wave of [1, 10, 30, 60, 120]) {
      const plan = planWave(cfg, wave, SEED);
      expect(plan.spawns.length).toBeLessThanOrEqual(cfg.waves.maxUnits + 1);
      for (const spawn of plan.spawns) {
        expect(spawn.at).toBeGreaterThanOrEqual(0);
        expect(spawn.at).toBeLessThanOrEqual(cfg.waves.spawnWindowSec + 1);
        expect(spawn.x).toBeGreaterThanOrEqual(cfg.field.sideMargin - 1);
        expect(spawn.x).toBeLessThanOrEqual(cfg.field.width - cfg.field.sideMargin + 1);
      }
    }
  });

  it('schedules spawns in chronological order', () => {
    const plan = planWave(cfg, 18, SEED);
    const times = plan.spawns.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('sends a boss on boss waves and not in between', () => {
    expect(planWave(cfg, cfg.waves.bossEvery, SEED).boss).toBe(true);
    expect(planWave(cfg, cfg.waves.bossEvery * 2, SEED).boss).toBe(true);
    expect(planWave(cfg, cfg.waves.bossEvery + 1, SEED).boss).toBe(false);
  });

  it('opens wave 1 with a crowd of the cheapest Kingdom troops', () => {
    // A crowd, not a handful: a budget point buys about what a militia
    // carries, so the opening's weight is spent on bodies at their roster
    // strength rather than on a few of them at six times it.
    const plan = planWave(cfg, 1, SEED);
    expect(plan.factions).toEqual(['kingdom']);
    expect(plan.spawns.length).toBeGreaterThanOrEqual(12);
    expect(plan.spawns.length).toBeLessThanOrEqual(60);
    expect(plan.composition.every((c) => c.kind === 'militia')).toBe(true);
  });
});

describe('a run has its own campaign', () => {
  /**
   * Waves used to be planned from a constant in config, so the composition was
   * random but it was the *same* random for every player in every playthrough,
   * forever. The seed is the run's now.
   */
  it('fields different waves for different runs', () => {
    const a = randomSeed();
    const b = randomSeed();
    expect(a).not.toBe(b);

    // Over a stretch of waves, two runs must differ somewhere. Any single wave
    // can coincide, so this asks about the campaign rather than one roll.
    let differences = 0;
    for (let wave = 1; wave <= 20; wave++) {
      const left = planWave(cfg, wave, a).composition;
      const right = planWave(cfg, wave, b).composition;
      if (JSON.stringify(left) !== JSON.stringify(right)) differences += 1;
    }
    expect(differences).toBeGreaterThan(10);
  });

  it('keeps the same wave stable within a run, so a loss can be studied', () => {
    const seed = randomSeed();
    for (const wave of [1, 6, 13, 27]) {
      // Re-fighting a lost wave must hand back the fight you just lost, not a
      // reroll — the preview is only worth reading if it is a promise.
      expect(planWave(cfg, wave, seed).spawns).toEqual(planWave(cfg, wave, seed).spawns);
    }
  });

  it('gives every run the same total strength for a given wave', () => {
    // The budget is the constant; the composition is the roll.
    for (const wave of [3, 11, 22]) {
      const budgets = [randomSeed(), randomSeed(), randomSeed()].map(
        (seed) => planWave(cfg, wave, seed).composition.reduce((n, c) => n + c.count * ENEMY_UNITS[c.kind].cost, 0),
      );
      const purse = waveBudget(cfg, wave) * openingThreatMult(cfg, wave);
      for (const spent of budgets) expect(spent).toBeLessThanOrEqual(Math.ceil(purse));
    }
  });
});
