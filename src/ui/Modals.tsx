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

export function WaveReport({
  result,
  hint,
  onDismiss,
}: {
  result: WaveResult;
  /** What this wave was teaching, shown only when it was lost. */
  hint?: string | null;
  onDismiss: () => void;
}) {
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
        {!result.won && hint && <p className="modal__lesson">{hint}</p>}
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

/**
 * The restart confirmation. Wiping a run can throw away hours, and the button
 * sits in the corner of every screen, so it asks first and spells out exactly
 * what goes — no undo afterwards.
 */
export function ConfirmRestart({
  snapshot,
  onConfirm,
  onCancel,
}: {
  snapshot: { wave: number; bestWave: number; credits: number };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="backdrop" onClick={onCancel}>
      <div className="modal modal--loss" onClick={(e) => e.stopPropagation()}>
        <h2>RESTART THE RUN?</h2>
        <p className="modal__sub">
          Everything goes back to wave 1: your credits, every upgrade and soldier level, every
          unlock, and the abilities. This cannot be undone.
        </p>
        <dl className="grid">
          <div>
            <dt>On wave</dt>
            <dd>{snapshot.wave}</dd>
          </div>
          <div>
            <dt>Best wave</dt>
            <dd>{snapshot.bestWave}</dd>
          </div>
          <div>
            <dt>Credits</dt>
            <dd>{compact(snapshot.credits)}</dd>
          </div>
        </dl>
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Keep playing
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
