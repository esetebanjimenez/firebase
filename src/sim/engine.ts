/**
 * engine.ts — the authoritative per-tick simulation.
 *
 * One `step(state, dt, cfg)` drives everything: passive income, the prep-phase
 * auto-launch, enemy arrivals, deployment charges, ability hazards, unit AI,
 * movement, attacks, towers, projectiles, deaths, and wave resolution.
 *
 * AI, in one paragraph: your soldiers charge the nearest enemy and, with the
 * field clear, fall back to the muster point in the middle of the map. Enemies
 * charge the nearest soldier and, with none left, press the wall — except siege
 * engines, which ignore your soldiers and drive for the wall from the start.
 *
 * Deterministic in (state, dt sequence, cfg): same inputs, same battle.
 */

import type { GameConfig } from './config';
import {
  applyArmor,
  chargeMax,
  incomePerSec,
  rechargeSec,
  towerDamage,
  towerPeriod,
  towerRange,
  wallMaxHp,
} from './derive';
import { angleTo, dist, distSq, stepToward } from './math';
import { PLAYER_UNITS } from './roster';
import type {
  Hazard,
  Projectile,
  SimEvent,
  SimState,
  Team,
  Unit,
  WaveResult,
} from './types';
import { createEnemyUnit, createPlayerUnit, createRaisedUnit, planWave } from './waves';

/** Re-apply level-derived caps after an upgrade. Safe to call any time. */
export function syncDerived(state: SimState, cfg: GameConfig): void {
  state.wall.maxHp = wallMaxHp(cfg, state.wall.level);
  if (state.wall.hp > state.wall.maxHp) state.wall.hp = state.wall.maxHp;
  state.charges.max = chargeMax(cfg, state.upgrades.charges);
  if (state.charges.current > state.charges.max) state.charges.current = state.charges.max;
}

/** Wipe the battlefield and hand the player back a full wall and full charges. */
function resetField(state: SimState, cfg: GameConfig): void {
  state.units = [];
  state.projectiles = [];
  state.hazards = [];
  state.spawnQueue = [];
  state.battleTime = 0;
  state.wall.hp = state.wall.maxHp;
  state.charges.current = state.charges.max;
  state.charges.rechargeIn = rechargeSec(cfg, state.upgrades.recharge);
  for (const id of Object.keys(state.abilities) as (keyof typeof state.abilities)[]) {
    state.abilities[id].cooldown = 0;
  }
}

/** Launch the wave the player is sitting on. Returns false if already fighting. */
export function startBattle(state: SimState, cfg: GameConfig, events?: SimEvent[]): boolean {
  if (state.phase === 'battle') return false;
  syncDerived(state, cfg);
  resetField(state, cfg);
  state.phase = 'battle';
  state.lastResult = null;
  state.battleCredits = 0;
  state.battleKills = 0;
  state.battleUnitsLost = 0;
  state.spawnQueue = [...planWave(cfg, state.wave).spawns];
  events?.push({ type: 'waveStarted', wave: state.wave });
  return true;
}

/**
 * Resolve the wave. A win advances to a tougher wave; a loss re-arms the same
 * one. Credits earned are kept either way, and the wall returns to full.
 */
function endBattle(state: SimState, cfg: GameConfig, won: boolean, events: SimEvent[]): void {
  const result: WaveResult = {
    wave: state.wave,
    won,
    credits: Math.floor(state.battleCredits),
    kills: state.battleKills,
    unitsLost: state.battleUnitsLost,
    wallHpLeft: Math.max(0, Math.ceil(state.wall.hp)),
    wallMaxHp: Math.round(state.wall.maxHp),
    durationSec: state.battleTime,
  };
  events.push({ type: 'waveEnded', wave: state.wave, won });

  if (won) {
    state.stats.wavesWon += 1;
    state.bestWave = Math.max(state.bestWave, state.wave);
    state.wave += 1;
  } else {
    state.stats.wavesLost += 1;
  }

  state.phase = 'prep';
  state.lastResult = result;
  resetField(state, cfg);
  state.autoLaunchIn = cfg.idle.autoLaunchDelaySec;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

function hurtUnit(cfg: GameConfig, unit: Unit, amount: number, events: SimEvent[]): void {
  if (unit.hp <= 0) return;
  const dealt = applyArmor(cfg, amount, unit.armor);
  unit.hp -= dealt;
  unit.flash = cfg.sim.flashSec;
  events.push({ type: 'hit', x: unit.x, y: unit.y, team: unit.team });
}

function hurtWall(
  state: SimState,
  cfg: GameConfig,
  amount: number,
  x: number,
  events: SimEvent[],
): void {
  if (state.wall.hp <= 0) return;
  state.wall.hp = Math.max(0, state.wall.hp - amount);
  events.push({ type: 'wallHit', x, y: cfg.field.wallTop, damage: amount });
}

/** Area damage against one team. Splash falls off to 60% away from the center. */
function areaDamage(
  state: SimState,
  cfg: GameConfig,
  x: number,
  y: number,
  radius: number,
  damage: number,
  against: Team,
  events: SimEvent[],
): void {
  const r2 = radius * radius;
  for (const u of state.units) {
    if (u.team !== against || u.hp <= 0) continue;
    const d2 = distSq(u.x, u.y, x, y);
    if (d2 > r2) continue;
    const falloff = 0.6 + 0.4 * (1 - Math.sqrt(d2) / radius);
    hurtUnit(cfg, u, damage * falloff, events);
  }
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

function nearestEnemyOf(state: SimState, unit: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD2 = Infinity;
  for (const other of state.units) {
    if (other.team === unit.team || other.hp <= 0) continue;
    const d2 = distSq(unit.x, unit.y, other.x, other.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = other;
    }
  }
  return best;
}

function resolveTarget(
  state: SimState,
  cfg: GameConfig,
  unit: Unit,
  byId: Map<number, Unit>,
  dt: number,
): Unit | null {
  unit.retargetIn -= dt;
  const current = unit.targetId === null ? null : byId.get(unit.targetId) ?? null;
  if (current && current.hp > 0 && unit.retargetIn > 0) return current;
  const next = nearestEnemyOf(state, unit);
  unit.targetId = next ? next.id : null;
  unit.retargetIn = cfg.sim.retargetSec;
  return next;
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

function fireProjectile(
  state: SimState,
  unit: Unit,
  tx: number,
  ty: number,
  targetId: number | null,
  atWall: boolean,
  events: SimEvent[],
): void {
  state.projectiles.push({
    id: state.nextId++,
    team: unit.team,
    kind: unit.projectile,
    x: unit.x,
    y: unit.y,
    speed: unit.projectileSpeed,
    damage: unit.damage,
    splashRadius: unit.splashRadius,
    siegeBonus: unit.siegeBonus,
    targetId,
    tx,
    ty,
    atWall,
    life: 6,
  });
  events.push({ type: 'shot', kind: unit.projectile, x: unit.x, y: unit.y, aim: unit.aim });
}

/** How long the firing kick lasts, as a share of the attack period. */
const RECOIL_FRACTION = 0.35;
const MAX_RECOIL_SEC = 0.12;

/** Resolve one attack from `unit` against a unit target. */
function attackUnit(state: SimState, cfg: GameConfig, unit: Unit, target: Unit, events: SimEvent[]): void {
  unit.cooldown = unit.attackPeriod;
  unit.recoil = Math.min(MAX_RECOIL_SEC, unit.attackPeriod * RECOIL_FRACTION);
  unit.aim = angleTo(unit.x, unit.y, target.x, target.y);
  if (unit.style === 'ranged' && unit.projectileSpeed > 0) {
    fireProjectile(state, unit, target.x, target.y, target.id, false, events);
    return;
  }
  hurtUnit(cfg, target, unit.damage, events);
  if (unit.splashRadius > 0) {
    areaDamage(state, cfg, target.x, target.y, unit.splashRadius, unit.damage * 0.5, target.team, events);
  }
}

/** Resolve one attack from `unit` against the wall. */
function attackWall(state: SimState, cfg: GameConfig, unit: Unit, events: SimEvent[]): void {
  unit.cooldown = unit.attackPeriod;
  unit.recoil = Math.min(MAX_RECOIL_SEC, unit.attackPeriod * RECOIL_FRACTION);
  unit.aim = Math.PI / 2;
  const wallY = cfg.field.wallTop;
  if (unit.style === 'ranged' && unit.projectileSpeed > 0) {
    fireProjectile(state, unit, unit.x, wallY, null, true, events);
    return;
  }
  hurtWall(state, cfg, unit.damage * unit.siegeBonus, unit.x, events);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Where an idle soldier parks: a loose block around the gate, mid-field. */
function musterPoint(cfg: GameConfig, unit: Unit): { x: number; y: number } {
  const column = ((unit.id * 37) % 7) - 3;
  const row = ((unit.id * 17) % 3) - 1;
  return {
    x: cfg.field.gateX + column * 32,
    y: cfg.field.musterY + row * 22,
  };
}

function clampToField(cfg: GameConfig, unit: Unit): void {
  const minX = cfg.field.sideMargin * 0.4 + unit.radius;
  const maxX = cfg.field.width - cfg.field.sideMargin * 0.4 - unit.radius;
  unit.x = Math.min(maxX, Math.max(minX, unit.x));
  const maxY = cfg.field.wallTop - cfg.sim.wallStandoff - unit.radius;
  unit.y = Math.min(maxY, Math.max(unit.radius, unit.y));
}

/** Push overlapping bodies apart so crowds spread into a line, not a stack. */
function separate(state: SimState, cfg: GameConfig, dt: number): void {
  const units = state.units;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const min = a.radius + b.radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      const overlap = min - d;
      const push = (overlap * cfg.sim.separationPush * dt) / 2;
      const nx = (dx / d) * push;
      const ny = (dy / d) * push;
      a.x -= nx;
      a.y -= ny;
      b.x += nx;
      b.y += ny;
    }
  }
  for (const u of units) clampToField(cfg, u);
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export function step(state: SimState, dt: number, cfg: GameConfig): SimEvent[] {
  const events: SimEvent[] = [];
  if (dt <= 0) return events;

  // --- Idle layer: the garrison earns whether or not a wave is running.
  const income = incomePerSec(cfg, state.bestWave) * dt;
  state.credits += income;
  state.stats.totalCreditsEarned += income;

  // --- Ability cooldowns always tick, so prep time is not wasted.
  for (const ability of Object.values(state.abilities)) {
    if (ability.cooldown > 0) ability.cooldown = Math.max(0, ability.cooldown - dt);
  }

  if (state.phase === 'prep') {
    const auto = state.automation.autoLaunch;
    if (auto.unlocked && auto.enabled) {
      state.autoLaunchIn -= dt;
      if (state.autoLaunchIn <= 0) startBattle(state, cfg, events);
    }
    return events;
  }

  state.battleTime += dt;

  // --- Enemy arrivals.
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.battleTime) {
    const q = state.spawnQueue.shift()!;
    if (state.units.length >= cfg.sim.maxUnits) break;
    const unit = createEnemyUnit(state, cfg, q);
    state.units.push(unit);
    events.push({ type: 'spawn', team: 'enemy', kind: unit.kind, x: unit.x, y: unit.y });
  }

  // --- Deployment charges.
  const charges = state.charges;
  if (charges.current < charges.max) {
    charges.rechargeIn -= dt;
    const full = rechargeSec(cfg, state.upgrades.recharge);
    let guard = charges.max + 1;
    while (charges.rechargeIn <= 0 && charges.current < charges.max && guard-- > 0) {
      charges.current += 1;
      charges.rechargeIn += full;
    }
    if (charges.current >= charges.max) charges.rechargeIn = full;
  }

  // --- Auto-deploy spends charges on the selected unit without being asked.
  if (state.automation.autoDeploy.unlocked && state.automation.autoDeploy.enabled) {
    const cost = PLAYER_UNITS[state.selectedUnit].chargeCost;
    let guard = charges.max + 1;
    while (
      state.unlocked[state.selectedUnit] &&
      charges.current >= cost &&
      state.units.length < cfg.sim.maxUnits &&
      guard-- > 0
    ) {
      charges.current -= cost;
      const unit = createPlayerUnit(state, cfg, state.selectedUnit);
      state.units.push(unit);
      events.push({ type: 'spawn', team: 'player', kind: unit.kind, x: unit.x, y: unit.y });
    }
  }

  // --- Hazards: inbound shells detonate, burning ground keeps burning.
  if (state.hazards.length > 0) {
    const live: Hazard[] = [];
    for (const h of state.hazards) {
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay > 0) {
          live.push(h);
          continue;
        }
      }
      if (h.kind === 'strike') {
        areaDamage(state, cfg, h.x, h.y, h.radius, h.damage, 'enemy', events);
        events.push({ type: 'explosion', x: h.x, y: h.y, radius: h.radius });
        continue;
      }
      h.timer -= dt;
      areaDamage(state, cfg, h.x, h.y, h.radius, h.dps * dt, 'enemy', events);
      events.push({ type: 'burn', x: h.x, y: h.y, radius: h.radius });
      if (h.timer > 0) live.push(h);
    }
    state.hazards = live;
  }

  // --- Unit AI: target, close the distance, attack.
  const byId = new Map<number, Unit>();
  for (const u of state.units) byId.set(u.id, u);

  const wallLine = cfg.field.wallTop;
  const raised: Unit[] = [];
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt);
    if (u.flash > 0) u.flash = Math.max(0, u.flash - dt);
    if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt);

    // Necromancers and friends raise reinforcements on a timer.
    if (u.spawnPeriod > 0 && u.spawnKind) {
      u.spawnIn -= dt;
      if (u.spawnIn <= 0) {
        u.spawnIn += u.spawnPeriod;
        if (state.units.length + raised.length < cfg.sim.maxUnits) {
          const minion = createRaisedUnit(state, cfg, u.spawnKind, u.x, u.y);
          byId.set(minion.id, minion);
          raised.push(minion);
          events.push({ type: 'spawn', team: 'enemy', kind: minion.kind, x: minion.x, y: minion.y });
        }
      }
    }

    const target = u.wallFocused ? null : resolveTarget(state, cfg, u, byId, dt);

    if (target) {
      const d = dist(u.x, u.y, target.x, target.y);
      const reach = u.style === 'melee' ? u.range + target.radius : u.range;
      if (d > reach) {
        // Close in, stopping just inside reach so the firing line holds.
        const stop = Math.max(1, reach * 0.9);
        const toward = stepToward(u.x, u.y, target.x, target.y, Math.min(u.speed * dt, d - stop));
        u.x = toward.x;
        u.y = toward.y;
        u.anim += u.speed * dt;
        u.aim = angleTo(u.x, u.y, target.x, target.y);
      } else if (u.cooldown <= 0) {
        attackUnit(state, cfg, u, target, events);
      } else {
        u.aim = angleTo(u.x, u.y, target.x, target.y);
      }
      clampToField(cfg, u);
      continue;
    }

    if (u.team === 'enemy') {
      // No soldier to fight (or a siege engine that never cared): hit the wall.
      const reach = u.style === 'melee' ? u.range + u.radius : u.range;
      const distanceToWall = wallLine - u.y;
      if (distanceToWall > reach) {
        const stop = wallLine - Math.max(cfg.sim.wallStandoff + u.radius, reach * 0.95);
        const toward = stepToward(u.x, u.y, u.x, stop, u.speed * dt);
        u.y = toward.y;
        u.anim += u.speed * dt;
        u.aim = Math.PI / 2;
      } else if (u.cooldown <= 0 && state.wall.hp > 0) {
        attackWall(state, cfg, u, events);
      }
      clampToField(cfg, u);
      continue;
    }

    // Field is clear: your soldiers fall back to the muster point and hold.
    const park = musterPoint(cfg, u);
    const d = dist(u.x, u.y, park.x, park.y);
    if (d > 2) {
      const toward = stepToward(u.x, u.y, park.x, park.y, u.speed * dt);
      u.x = toward.x;
      u.y = toward.y;
      u.anim += u.speed * dt;
      u.aim = angleTo(u.x, u.y, park.x, park.y);
    } else {
      u.aim = -Math.PI / 2;
    }
    clampToField(cfg, u);
  }

  if (raised.length > 0) state.units.push(...raised);

  // --- Towers: the static line shoots whatever comes into range.
  const tDamage = towerDamage(cfg, state.upgrades.towers);
  const tPeriod = towerPeriod(cfg, state.upgrades.towers);
  const tRange = towerRange(cfg, state.upgrades.towers);
  for (const tower of state.towers) {
    if (tower.cooldown > 0) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      continue;
    }
    let best: Unit | null = null;
    let bestD2 = tRange * tRange;
    for (const u of state.units) {
      if (u.team !== 'enemy' || u.hp <= 0) continue;
      const d2 = distSq(tower.x, tower.y, u.x, u.y);
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = u;
      }
    }
    if (!best) continue;
    tower.cooldown = tPeriod;
    state.projectiles.push({
      id: state.nextId++,
      team: 'player',
      kind: 'bullet',
      x: tower.x,
      y: tower.y,
      speed: cfg.towers.projectileSpeed,
      damage: tDamage,
      splashRadius: 0,
      siegeBonus: 1,
      targetId: best.id,
      tx: best.x,
      ty: best.y,
      atWall: false,
      life: 4,
    });
    events.push({
      type: 'shot',
      kind: 'bullet',
      x: tower.x,
      y: tower.y,
      aim: angleTo(tower.x, tower.y, best.x, best.y),
    });
  }

  // --- Projectiles.
  if (state.projectiles.length > 0) {
    const flying: Projectile[] = [];
    for (const p of state.projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      const target = p.targetId === null ? null : byId.get(p.targetId) ?? null;
      if (target && target.hp > 0) {
        p.tx = target.x;
        p.ty = target.y;
      }
      const d = dist(p.x, p.y, p.tx, p.ty);
      const travel = p.speed * dt;
      if (d > travel && travel > 0) {
        const moved = stepToward(p.x, p.y, p.tx, p.ty, travel);
        p.x = moved.x;
        p.y = moved.y;
        flying.push(p);
        continue;
      }

      // Arrived.
      p.x = p.tx;
      p.y = p.ty;
      if (p.atWall) {
        hurtWall(state, cfg, p.damage * p.siegeBonus, p.x, events);
        if (p.splashRadius > 0) {
          areaDamage(state, cfg, p.x, p.y, p.splashRadius, p.damage * 0.5, 'player', events);
          events.push({ type: 'explosion', x: p.x, y: p.y, radius: p.splashRadius });
        }
        continue;
      }
      const against: Team = p.team === 'player' ? 'enemy' : 'player';
      if (target && target.hp > 0) hurtUnit(cfg, target, p.damage, events);
      if (p.splashRadius > 0) {
        areaDamage(state, cfg, p.x, p.y, p.splashRadius, p.damage * 0.6, against, events);
        events.push({ type: 'explosion', x: p.x, y: p.y, radius: p.splashRadius });
      } else if (!target) {
        events.push({ type: 'hit', x: p.x, y: p.y, team: against });
      }
    }
    state.projectiles = flying;
  }

  separate(state, cfg, dt);

  // --- Reap the dead and pay out.
  let died = false;
  for (const u of state.units) {
    if (u.hp > 0) continue;
    died = true;
    if (u.team === 'enemy') {
      state.credits += u.bounty;
      state.battleCredits += u.bounty;
      state.stats.totalCreditsEarned += u.bounty;
      state.stats.totalKills += 1;
      state.battleKills += 1;
    } else {
      state.battleUnitsLost += 1;
    }
    events.push({
      type: 'kill',
      team: u.team,
      kind: u.kind,
      x: u.x,
      y: u.y,
      bounty: u.bounty,
      aim: u.aim,
    });
  }
  if (died) state.units = state.units.filter((u) => u.hp > 0);

  // --- Resolution. The wall falling ends the wave immediately.
  if (state.wall.hp <= 0) {
    endBattle(state, cfg, false, events);
    return events;
  }
  const enemiesLeft = state.spawnQueue.length > 0 || state.units.some((u) => u.team === 'enemy');
  if (!enemiesLeft) endBattle(state, cfg, true, events);

  return events;
}
