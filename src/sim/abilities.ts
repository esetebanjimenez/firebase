/**
 * abilities.ts — the player's ground-targeted fire support.
 *
 * A cast never damages anything on the spot: it puts hazards on the ground
 * (shells in the air, then burning earth) that the engine resolves. That keeps
 * the telegraph honest — enemies can walk out of a barrage — and keeps all
 * damage flowing through one path in engine.ts.
 */

import type { GameConfig } from './config';
import { abilityCooldown, abilityDamage } from './derive';
import { RngStream } from './rng';
import type { AbilityId, Hazard, SimState } from './types';

/** Can this ability be fired right now? */
export function canCast(state: SimState, id: AbilityId): boolean {
  const a = state.abilities[id];
  return state.phase === 'battle' && a.level > 0 && a.cooldown <= 0;
}

/**
 * Call fire support down on (x, y): queues the hazards and starts the cooldown.
 * Returns false if the ability is locked, cooling down, or no battle is running.
 * Nothing is damaged here — the engine resolves the hazards on its next ticks,
 * and the renderer draws them straight from `state.hazards`.
 */
export function castAbility(
  state: SimState,
  cfg: GameConfig,
  id: AbilityId,
  x: number,
  y: number,
): boolean {
  if (!canCast(state, id)) return false;

  const ac = cfg.abilities[id];
  const level = state.abilities[id].level;
  const damage = abilityDamage(cfg, id, level);
  state.abilities[id].cooldown = abilityCooldown(cfg, id, level);

  // Keep the aim point on the field, and off your own wall.
  const tx = Math.min(cfg.field.width - 2, Math.max(2, x));
  const ty = Math.min(cfg.field.wallTop - 2, Math.max(2, y));

  const rng = new RngStream(state.rngState);
  const hazards: Hazard[] = [];

  if (ac.burnSec > 0) {
    hazards.push({
      id: state.nextId++,
      kind: 'burn',
      x: tx,
      y: ty,
      radius: ac.radius,
      damage: 0,
      dps: damage,
      // Burning ground is sustained fire: it answers a crowd, not armour.
      damageClass: 'sustained',
      delay: ac.delaySec,
      timer: ac.burnSec,
      duration: ac.burnSec,
    });
  } else {
    for (let i = 0; i < ac.shells; i++) {
      const ox = ac.scatter > 0 ? rng.spread(ac.scatter) : 0;
      const oy = ac.scatter > 0 ? rng.spread(ac.scatter * 0.6) : 0;
      const delay = ac.delaySec + i * ac.shellSpacingSec;
      hazards.push({
        id: state.nextId++,
        kind: 'strike',
        x: Math.min(cfg.field.width - 2, Math.max(2, tx + ox)),
        y: Math.min(cfg.field.wallTop - 2, Math.max(2, ty + oy)),
        radius: ac.radius,
        damage,
        dps: 0,
        // Shells are explosive: fire support is your answer to armour.
        damageClass: 'explosive',
        delay,
        timer: 0,
        duration: delay,
      });
    }
  }

  state.rngState = rng.state;
  state.hazards.push(...hazards);
  return true;
}
