/** ControlPanel — the bottom, thumb-reach half: upgrades + wave controls. */

import type { GameActions, UiSnapshot } from '../game/useGameLoop';
import { UpgradeTabs } from './UpgradeTabs';

interface Props {
  snapshot: UiSnapshot;
  actions: GameActions;
}

export function ControlPanel({ snapshot, actions }: Props) {
  const canSend = !snapshot.wave.inProgress && !snapshot.daysHeldPaused;

  return (
    <section className="controls">
      <UpgradeTabs snapshot={snapshot} actions={actions} />

      <div className="controls__wave">
        <button
          className="btn btn--send"
          disabled={!canSend}
          onClick={() => actions.sendNextWave()}
        >
          {snapshot.wave.inProgress ? 'Wave in progress…' : 'Send next wave ▸'}
        </button>
      </div>
    </section>
  );
}
