/**
 * Panel — the shop. Three tabs over one scrolling list: the defenses on the
 * wall, the soldiers you send through the gate, and the fire support you call
 * down. Everything is buyable mid-battle too, which is often the right move.
 */

import { useState } from 'react';
import type { GameActions, UiSnapshot } from '../game/useGameLoop';
import { compact } from './TopBar';

type Tab = 'defense' | 'troops' | 'support';

interface Props {
  snapshot: UiSnapshot;
  actions: GameActions;
}

function Row({
  title,
  detail,
  badge,
  cost,
  affordable,
  onClick,
  accent,
  disabled,
}: {
  title: string;
  detail: string;
  badge?: string;
  cost: number | null;
  affordable: boolean;
  onClick?: () => void;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`row ${affordable && !disabled ? 'row--buyable' : ''}`}
      onClick={onClick}
      disabled={disabled || !affordable || !onClick}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <span className="row__main">
        <span className="row__title">
          {title}
          {badge && <em className="row__badge">{badge}</em>}
        </span>
        <span className="row__detail">{detail}</span>
      </span>
      {cost !== null && <span className="row__cost">{compact(cost)}</span>}
    </button>
  );
}

export function Panel({ snapshot, actions }: Props) {
  const [tab, setTab] = useState<Tab>('defense');
  const { upgrades, units, abilities, automation, wall, towers, charges, preview, phase } = snapshot;

  const defenseTracks = upgrades.filter((u) => u.track === 'wall' || u.track === 'towers');
  const troopTracks = upgrades.filter(
    (u) =>
      u.track === 'soldierHp' ||
      u.track === 'soldierDamage' ||
      u.track === 'soldierSpeed' ||
      u.track === 'charges' ||
      u.track === 'recharge',
  );

  return (
    <section className="panel">
      <nav className="tabs">
        {(['defense', 'troops', 'support'] as Tab[]).map((id) => (
          <button key={id} className={`tab ${tab === id ? 'tab--on' : ''}`} onClick={() => setTab(id)}>
            {id === 'defense' ? 'Defense' : id === 'troops' ? 'Troops' : 'Support'}
          </button>
        ))}
      </nav>

      <div className="panel__scroll">
        {tab === 'defense' && (
          <>
            <p className="panel__note">
              Wall {wall.hp}/{wall.maxHp} · {towers.count} towers at {towers.dps.toFixed(0)} dps combined ·
              range {towers.range.toFixed(0)}
            </p>
            {defenseTracks.map((u) => (
              <Row
                key={u.track}
                title={`${u.label} L${u.level}`}
                detail={u.detail}
                cost={u.cost}
                affordable={u.affordable}
                onClick={() => actions.buy(u.track)}
              />
            ))}
            {phase === 'prep' && (
              <p className="panel__note panel__note--dim">
                Wave {preview.wave} threat {compact(preview.threat)} hp · pays {compact(preview.payout)} credits
                {preview.composition.length > 0 && (
                  <>
                    <br />
                    {preview.composition.map((c) => `${c.count}× ${c.name}`).join(', ')}
                  </>
                )}
              </p>
            )}
          </>
        )}

        {tab === 'troops' && (
          <>
            <p className="panel__note">
              {charges.current}/{charges.max} charges · one back every {charges.rechargeSec.toFixed(1)}s
            </p>
            {units.map((unit) =>
              unit.unlocked ? (
                <Row
                  key={unit.id}
                  title={unit.name}
                  badge={unit.selected ? 'selected' : undefined}
                  detail={`${unit.hp} hp · ${unit.dps.toFixed(1)} dps · ${unit.chargeCost} charge${unit.chargeCost > 1 ? 's' : ''}`}
                  cost={null}
                  affordable
                  accent={unit.colors[1]}
                  onClick={() => actions.select(unit.id)}
                />
              ) : (
                <Row
                  key={unit.id}
                  title={`Unlock ${unit.name}`}
                  detail={unit.blurb}
                  cost={unit.unlockCost}
                  affordable={unit.affordable}
                  accent={unit.colors[1]}
                  onClick={() => actions.unlock(unit.id)}
                />
              ),
            )}
            {troopTracks.map((u) => (
              <Row
                key={u.track}
                title={`${u.label} L${u.level}`}
                detail={u.detail}
                cost={u.cost}
                affordable={u.affordable}
                onClick={() => actions.buy(u.track)}
              />
            ))}
          </>
        )}

        {tab === 'support' && (
          <>
            {abilities.map((ability) => (
              <Row
                key={ability.id}
                title={ability.unlocked ? `${ability.name} L${ability.level}` : `Unlock ${ability.name}`}
                detail={
                  ability.unlocked
                    ? `${compact(ability.damage)} damage · ${ability.radius} radius · ${ability.cooldownTotal.toFixed(0)}s cooldown`
                    : ability.blurb
                }
                cost={ability.cost}
                affordable={ability.affordable}
                onClick={() => actions.buyAbility(ability.id)}
              />
            ))}

            <p className="panel__note">Automation</p>
            {(['autoDeploy', 'autoLaunch'] as const).map((id) => {
              const auto = automation[id];
              const name = id === 'autoDeploy' ? 'Auto-deploy' : 'Auto-launch';
              const detail =
                id === 'autoDeploy'
                  ? 'Spends charges on the selected soldier by itself.'
                  : 'Sends the next wave as soon as you are back in prep.';
              return auto.unlocked ? (
                <Row
                  key={id}
                  title={name}
                  badge={auto.enabled ? 'on' : 'off'}
                  detail={detail}
                  cost={null}
                  affordable
                  onClick={() => actions.toggle(id)}
                />
              ) : (
                <Row
                  key={id}
                  title={`Unlock ${name}`}
                  detail={detail}
                  cost={auto.cost}
                  affordable={auto.affordable}
                  onClick={() => actions.automate(id)}
                />
              );
            })}

            <button className="reset" onClick={actions.hardReset}>
              Abandon the firebase (wipe save)
            </button>
          </>
        )}
      </div>
    </section>
  );
}
