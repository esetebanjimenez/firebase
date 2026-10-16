/** TopBar — Days Held, Supply, and wave/wall status. */

import type { UiSnapshot } from '../game/useGameLoop';

export function TopBar({ snapshot }: { snapshot: UiSnapshot }) {
  const { day, supply, wave, barrier } = snapshot;

  let status: string;
  let alert = false;
  if (barrier.down) {
    status = 'WALL DOWN — repair to resume';
    alert = true;
  } else if (wave.inProgress) {
    status = `Wave ${wave.index} at the wall`;
  } else {
    status = `Next wave in ${wave.timerSec.toFixed(1)}s (${wave.nextCount} inf)`;
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
      <div className={`wavebar ${alert ? 'wavebar--alert' : ''}`}>{status}</div>
    </header>
  );
}
