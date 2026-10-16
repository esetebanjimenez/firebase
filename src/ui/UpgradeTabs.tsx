/**
 * UpgradeTabs — one card per ring with its build/upgrade and repair controls.
 * Thumb-reach, tap-only. The outer→inner order matches the battlefield.
 */

import type { GameActions, RingSnapshot, UiSnapshot } from '../game/useGameLoop';

interface Props {
  snapshot: UiSnapshot;
  actions: GameActions;
}

function RingCard({ ring, supply, actions }: { ring: RingSnapshot; supply: number; actions: GameActions }) {
  const built = ring.level > 0;
  const down = ring.status === 'down' && built;
  const canAffordUpgrade = supply >= ring.upgradeCost;
  const canAffordRepair = supply >= ring.repairCost;

  const statusClass = down ? 'ringcard--down' : built ? 'ringcard--active' : 'ringcard--unbuilt';

  return (
    <div className={`ringcard ${statusClass}`}>
      <div className="ringcard__head">
        <span className={`ringcard__dot ringcard__dot--${ring.id}`} />
        <div className="ringcard__title">
          <strong>{ring.name}</strong>
          <small>{ring.weapon}</small>
        </div>
        <span className="ringcard__level">{built ? `Lv ${ring.level}` : 'Not built'}</span>
      </div>

      {down && (
        <div className="ringcard__status">BREACHED — not firing</div>
      )}

      <div className="ringcard__actions">
        {down ? (
          <button
            className="btn btn--repair"
            disabled={!canAffordRepair}
            onClick={() => actions.repairRing(ring.id)}
          >
            Repair · {ring.repairCost}
          </button>
        ) : (
          <button
            className="btn btn--upgrade"
            disabled={!ring.canUpgrade || !canAffordUpgrade}
            onClick={() => actions.buyUpgrade(ring.id)}
          >
            {built ? 'Upgrade' : 'Build'} · {ring.upgradeCost}
          </button>
        )}
      </div>
    </div>
  );
}

export function UpgradeTabs({ snapshot, actions }: Props) {
  return (
    <div className="upgrades">
      {snapshot.rings.map((ring) => (
        <RingCard key={ring.id} ring={ring} supply={snapshot.supply} actions={actions} />
      ))}
    </div>
  );
}
