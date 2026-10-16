/** ControlPanel — the bottom, thumb-reach half: wall status, upgrades, abilities. */

import type { GameActions, UiSnapshot } from '../game/useGameLoop';

interface Props {
  snapshot: UiSnapshot;
  actions: GameActions;
}

function UpgradeCard({
  label,
  detail,
  cost,
  affordable,
  onClick,
  accent,
}: {
  label: string;
  detail: string;
  cost: number;
  affordable: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button className={`upg upg--${accent}`} disabled={!affordable} onClick={onClick}>
      <span className="upg__label">{label}</span>
      <span className="upg__detail">{detail}</span>
      <span className="upg__cost">{cost}</span>
    </button>
  );
}

export function ControlPanel({ snapshot, actions }: Props) {
  const { supply, firepower, barrier, fireSupport, wave } = snapshot;
  const canSend = !wave.inProgress;
  const cdPct = fireSupport.cooldownTotal > 0 ? 1 - fireSupport.cooldownRemaining / fireSupport.cooldownTotal : 1;

  return (
    <section className="controls">
      {/* Wall status + repair */}
      <div className={`wallrow ${barrier.down ? 'wallrow--down' : ''}`}>
        <div className="wallrow__info">
          <span className="wallrow__title">Wall</span>
          <div className="hpbar">
            <div
              className="hpbar__fill"
              style={{
                width: `${Math.round(barrier.pct * 100)}%`,
                background: barrier.pct > 0.5 ? 'var(--hp-good)' : barrier.pct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)',
              }}
            />
          </div>
          <span className="wallrow__hp">
            {barrier.hp}/{barrier.maxHp}
          </span>
        </div>
        <button
          className="btn btn--repair"
          disabled={barrier.repairCost <= 0 || supply < barrier.repairCost}
          onClick={actions.repairBarrier}
        >
          Repair · {barrier.repairCost > 0 ? barrier.repairCost : '—'}
        </button>
      </div>

      {/* Upgrade tracks */}
      <div className="upgrades3">
        <UpgradeCard
          label={`Firepower L${firepower.level}`}
          detail={`${firepower.dps} dps`}
          cost={firepower.upgradeCost}
          affordable={supply >= firepower.upgradeCost}
          onClick={actions.upgradeFirepower}
          accent="fire"
        />
        <UpgradeCard
          label={`Fortify L${barrier.level}`}
          detail={`${barrier.maxHp} hp`}
          cost={barrier.upgradeCost}
          affordable={supply >= barrier.upgradeCost}
          onClick={actions.upgradeBarrier}
          accent="wall"
        />
        <UpgradeCard
          label={fireSupport.unlocked ? `Support L${fireSupport.level}` : 'Unlock Support'}
          detail={fireSupport.unlocked ? `${fireSupport.cooldownTotal.toFixed(0)}s cd` : 'airstrike'}
          cost={fireSupport.upgradeCost}
          affordable={supply >= fireSupport.upgradeCost}
          onClick={actions.upgradeFireSupport}
          accent="support"
        />
      </div>

      {/* Abilities */}
      <div className="abilities">
        {fireSupport.unlocked && (
          <button
            className="btn btn--strike"
            disabled={!fireSupport.ready}
            onClick={actions.useFireSupport}
          >
            <span className="btn__cdfill" style={{ width: `${Math.round(cdPct * 100)}%` }} />
            <span className="btn__text">
              {fireSupport.ready ? 'Call Fire Support ▸' : `Fire Support ${fireSupport.cooldownRemaining.toFixed(1)}s`}
            </span>
          </button>
        )}
        <button className="btn btn--send" disabled={!canSend} onClick={actions.sendNextWave}>
          {wave.inProgress ? 'Wave in progress…' : 'Send next wave ▸'}
        </button>
      </div>
    </section>
  );
}
