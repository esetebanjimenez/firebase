import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../config';
import { ENEMY_UNITS, FACTIONS } from '../roster';
import { availableFactions, factionsForWave, planWave } from '../waves';

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
      const plan = planWave(cfg, wave);
      for (const entry of plan.composition) {
        expect(plan.factions).toContain(ENEMY_UNITS[entry.kind].faction);
      }
    }
  });
});

describe('planWave', () => {
  it('is deterministic for a given config and wave', () => {
    const a = planWave(cfg, 7);
    const b = planWave(cfg, 7);
    expect(b.spawns).toEqual(a.spawns);
    expect(b.composition).toEqual(a.composition);
  });

  it('differs between waves', () => {
    expect(planWave(cfg, 7).spawns).not.toEqual(planWave(cfg, 8).spawns);
  });

  it('never fields a kind before its debut wave', () => {
    for (let wave = 1; wave <= 60; wave++) {
      for (const entry of planWave(cfg, wave).composition) {
        expect(ENEMY_UNITS[entry.kind].fromWave).toBeLessThanOrEqual(wave);
      }
    }
  });

  it('grows in size and threat as waves go on', () => {
    const early = planWave(cfg, 2);
    const later = planWave(cfg, 25);
    expect(later.spawns.length).toBeGreaterThan(early.spawns.length);
    expect(later.totalHp).toBeGreaterThan(early.totalHp * 5);
  });

  it('respects the unit cap and the spawn window', () => {
    for (const wave of [1, 10, 30, 60, 120]) {
      const plan = planWave(cfg, wave);
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
    const plan = planWave(cfg, 18);
    const times = plan.spawns.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('sends a boss on boss waves and not in between', () => {
    expect(planWave(cfg, cfg.waves.bossEvery).boss).toBe(true);
    expect(planWave(cfg, cfg.waves.bossEvery * 2).boss).toBe(true);
    expect(planWave(cfg, cfg.waves.bossEvery + 1).boss).toBe(false);
  });

  it('opens wave 1 with a handful of the cheapest Kingdom troops', () => {
    const plan = planWave(cfg, 1);
    expect(plan.factions).toEqual(['kingdom']);
    expect(plan.spawns.length).toBeGreaterThanOrEqual(3);
    expect(plan.spawns.length).toBeLessThanOrEqual(8);
    expect(plan.composition.every((c) => c.kind === 'militia')).toBe(true);
  });
});
