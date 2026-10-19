/**
 * CommandBar — the thumb-reach controls: a deploy button per soldier kind, the
 * charge pool they spend from, the fire-support buttons, and the launch button
 * between waves.
 */

import type { GameActions, UiSnapshot } from '../game/useGameLoop';
import { UnitIcon } from './UnitIcon';

interface Props {
  snapshot: UiSnapshot;
  actions: GameActions;
}

/**
 * The charge pool. Up to eight charges get a pip each, with the next one
 * filling up; beyond that a pool of pips would dwarf the controls, so it
 * collapses to a count and a single recharge bar.
 */
function Charges({ current, max, progress }: { current: number; max: number; progress: number }) {
  const label = `${current} of ${max} charges`;
  if (max > 8) {
    return (
      <div className="charges charges--many" aria-label={label}>
        <span className="charges__count">
          {current}
          <small>/{max}</small>
        </span>
        <span className="charges__track">
          <span className="charges__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      </div>
    );
  }
  return (
    <div className="charges" aria-label={label}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < current;
        const filling = !filled && i === current;
        return (
          <span key={i} className={`pip ${filled ? 'pip--full' : ''}`}>
            {filling && <span className="pip__fill" style={{ height: `${Math.round(progress * 100)}%` }} />}
          </span>
        );
      })}
    </div>
  );
}

export function CommandBar({ snapshot, actions }: Props) {
  const { phase, units, abilities, charges, preview } = snapshot;
  const unlockedUnits = units.filter((u) => u.unlocked);
  const unlockedAbilities = abilities.filter((a) => a.unlocked);

  return (
    <section className="command">
      {phase === 'prep' ? (
        <button className="btn btn--launch" onClick={actions.launch}>
          <span className="btn__title">LAUNCH WAVE {preview.wave}</span>
          <span className="btn__sub">
            {preview.count} enemies · {preview.armies.join(' + ')}
            {preview.boss ? ' · BOSS' : ''}
          </span>
        </button>
      ) : (
        <div className="command__deploy">
          {/* One button per soldier: pressing it puts that soldier through the
              gate straight away, so there is no selection step mid-fight. */}
          <div className={`deploys deploys--${unlockedUnits.length}`}>
            {unlockedUnits.map((unit) => (
              <button
                key={unit.id}
                className="deploy"
                disabled={!unit.deployable}
                onClick={() => actions.deploy(unit.id)}
                style={{ borderColor: unit.colors[1] }}
              >
                <UnitIcon kind={unit.id} level={unit.level} className="deploy__icon" scale={1} />
                <span className="deploy__name">{unit.short}</span>
                <span className="deploy__meta">
                  L{unit.level} · {unit.chargeCost}
                </span>
              </button>
            ))}
          </div>
          <Charges current={charges.current} max={charges.max} progress={charges.rechargeProgress} />
        </div>
      )}

      {unlockedAbilities.length > 0 && (
        <div className="abilities">
          {unlockedAbilities.map((ability) => {
            const progress = ability.cooldownTotal > 0 ? 1 - ability.cooldown / ability.cooldownTotal : 1;
            return (
              <button
                key={ability.id}
                className={`ability ${ability.selected ? 'ability--on' : ''} ${ability.ready ? 'ability--ready' : ''}`}
                onClick={() => actions.armAbility(ability.selected ? null : ability.id)}
              >
                <span className="ability__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                <span className="ability__text">
                  {ability.name}
                  <small>
                    {ability.cooldown > 0.05
                      ? `${ability.cooldown.toFixed(1)}s`
                      : ability.selected
                        ? 'tap field'
                        : 'ready'}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
