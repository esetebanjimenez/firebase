/** Sitrep — the "welcome back" summary of offline progress. */

import type { Sitrep as SitrepData } from '../sim';

interface Props {
  sitrep: SitrepData;
  onDismiss: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return `${Math.round(seconds)}s`;
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const d = Math.floor(h / 24);
  if (d < 1) return `${h}h ${m % 60}m`;
  return `${d}d ${h % 24}h`;
}

export function Sitrep({ sitrep, onDismiss }: Props) {
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal sitrep" onClick={(e) => e.stopPropagation()}>
        <h2>SITREP</h2>
        <p className="sitrep__sub">While you were away ({formatDuration(sitrep.secondsCredited)})</p>

        <dl className="sitrep__grid">
          <div>
            <dt>Days Held</dt>
            <dd>+{sitrep.daysGained}</dd>
          </div>
          <div>
            <dt>Supply earned</dt>
            <dd>+{Math.round(sitrep.supplyEarned)}</dd>
          </div>
          <div>
            <dt>Waves resolved</dt>
            <dd>{sitrep.wavesResolved}</dd>
          </div>
        </dl>

        {sitrep.ringsFallen.length > 0 && (
          <p className="sitrep__warn">
            Rings fallen and needing repair: {sitrep.ringsFallen.join(', ')}
          </p>
        )}
        {sitrep.capped && (
          <p className="sitrep__note">Offline progress was capped — report back sooner for full credit.</p>
        )}

        <button className="btn btn--send" onClick={onDismiss}>
          Resume command
        </button>
      </div>
    </div>
  );
}
