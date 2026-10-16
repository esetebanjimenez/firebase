/** TopBar — the headline counters: Days Held, Supply, wave status. */

import type { UiSnapshot } from '../game/useGameLoop';

interface Props {
  snapshot: UiSnapshot;
}

export function TopBar({ snapshot }: Props) {
  const { day, supply, wave, daysHeldPaused, restoreTimerSec } = snapshot;

  let waveLabel: string;
  if (daysHeldPaused) {
    waveLabel = `OVERRUN — rallying in ${restoreTimerSec.toFixed(1)}s`;
  } else if (wave.inProgress) {
    waveLabel = `Wave ${wave.index} inbound`;
  } else {
    waveLabel = `Next wave in ${wave.timerSec.toFixed(1)}s (${wave.nextCount} inf)`;
  }

  return (
    <header className="topbar">
      <div className="stat stat--primary">
        <span className="stat__value">{day}</span>
        <span className="stat__label">Days Held</span>
      </div>
      <div className="stat stat--supply">
        <span className="stat__value">{supply}</span>
        <span className="stat__label">Supply</span>
      </div>
      <div className={`wavebar ${daysHeldPaused ? 'wavebar--alert' : ''}`}>{waveLabel}</div>
    </header>
  );
}
