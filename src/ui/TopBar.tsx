/** TopBar — credits and income, the wave you are on, and what the field is doing. */

import type { UiSnapshot } from '../game/useGameLoop';

function compact(value: number): string {
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

export { compact };

export function TopBar({ snapshot, onRestart }: { snapshot: UiSnapshot; onRestart: () => void }) {
  const { credits, incomePerSec, wave, bestWave, phase, battle, wall } = snapshot;
  const status =
    phase === 'battle'
      ? `${battle.enemiesLeft} on the field${battle.incoming > 0 ? ` · ${battle.incoming} inbound` : ''}`
      : `Next: wave ${wave} · ${snapshot.preview.armies.join(' + ')}`;

  return (
    <header className="topbar">
      <div className="topbar__row">
        <div className="stat">
          <span className="stat__value stat__value--credits">{compact(credits)}</span>
          <span className="stat__label">credits · {incomePerSec.toFixed(1)}/s</span>
        </div>
        <div className="topbar__right">
          <div className="stat stat--right">
            <span className="stat__value">
              {phase === 'battle' ? `WAVE ${wave}` : `W${wave}`}
            </span>
            <span className="stat__label">best {bestWave}</span>
          </div>
          <button className="restart" onClick={onRestart} title="Restart the run">
            RESTART
          </button>
        </div>
      </div>
      <div className={`topbar__status ${wall.pct < 0.3 ? 'topbar__status--alert' : ''}`}>{status}</div>
    </header>
  );
}
