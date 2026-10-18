/** Modals — the after-action report, and the welcome back from an absence. */

import type { IdleReport, WaveResult } from '../sim';
import { compact } from './TopBar';

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return `${Math.round(seconds)}s`;
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const d = Math.floor(h / 24);
  if (d < 1) return `${h}h ${m % 60}m`;
  return `${d}d ${h % 24}h`;
}

export function WaveReport({ result, onDismiss }: { result: WaveResult; onDismiss: () => void }) {
  return (
    <div className="backdrop" onClick={onDismiss}>
      <div className={`modal ${result.won ? 'modal--win' : 'modal--loss'}`} onClick={(e) => e.stopPropagation()}>
        <h2>{result.won ? `WAVE ${result.wave} HELD` : `WALL BREACHED`}</h2>
        <p className="modal__sub">
          {result.won
            ? `The field is clear. Wave ${result.wave + 1} will be worse.`
            : `Wave ${result.wave} got through the wall. Spend the credits and try again.`}
        </p>
        <dl className="grid">
          <div>
            <dt>Credits</dt>
            <dd>+{compact(result.credits)}</dd>
          </div>
          <div>
            <dt>Kills</dt>
            <dd>{result.kills}</dd>
          </div>
          <div>
            <dt>Lost</dt>
            <dd>{result.unitsLost}</dd>
          </div>
          <div>
            <dt>Wall left</dt>
            <dd>
              {result.won ? `${Math.round((result.wallHpLeft / result.wallMaxHp) * 100)}%` : '0%'}
            </dd>
          </div>
        </dl>
        <button className="btn btn--launch" onClick={onDismiss}>
          {result.won ? 'Rearm' : 'Rebuild'}
        </button>
      </div>
    </div>
  );
}

export function WelcomeBack({ report, onDismiss }: { report: IdleReport; onDismiss: () => void }) {
  return (
    <div className="backdrop" onClick={onDismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>GARRISON REPORT</h2>
        <p className="modal__sub">You were away {duration(report.secondsAway)}.</p>
        <dl className="grid">
          <div>
            <dt>Credits earned</dt>
            <dd>+{compact(report.creditsEarned)}</dd>
          </div>
          <div>
            <dt>Credited</dt>
            <dd>{duration(report.secondsCredited)}</dd>
          </div>
        </dl>
        {report.capped && (
          <p className="modal__note">
            The books only cover {duration(report.secondsCredited)} of absence — check in sooner for full credit.
          </p>
        )}
        <button className="btn btn--launch" onClick={onDismiss}>
          Take command
        </button>
      </div>
    </div>
  );
}
