/** App — portrait shell: status on top, battlefield, controls, then the shop. */

import { useCallback, useState } from 'react';
import { useGameLoop } from '../game/useGameLoop';
import { BattlefieldCanvas } from '../render/BattlefieldCanvas';
import { CommandBar } from './CommandBar';
import { Panel } from './Panel';
import { TopBar } from './TopBar';
import { ConfirmRestart, WaveReport, WelcomeBack } from './Modals';

export function App() {
  const { stateRef, fxRef, snapshot, actions, idleReport, dismissIdleReport, config } = useGameLoop();
  const armed = snapshot.abilities.find((a) => a.selected && a.unlocked) ?? null;
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  const askRestart = useCallback(() => setConfirmingRestart(true), []);
  const doRestart = useCallback(() => {
    actions.hardReset();
    setConfirmingRestart(false);
  }, [actions]);

  return (
    <div className="app">
      <TopBar snapshot={snapshot} onRestart={askRestart} />

      <main className="field">
        <BattlefieldCanvas
          stateRef={stateRef}
          fxRef={fxRef}
          config={config}
          armedRadius={armed ? armed.radius : null}
          armedReady={armed ? armed.ready : false}
          onCast={actions.castAt}
        />
      </main>

      <CommandBar snapshot={snapshot} actions={actions} />
      <Panel snapshot={snapshot} actions={actions} onRestart={askRestart} />

      {confirmingRestart && (
        <ConfirmRestart snapshot={snapshot} onConfirm={doRestart} onCancel={() => setConfirmingRestart(false)} />
      )}
      {!confirmingRestart && idleReport && (
        <WelcomeBack report={idleReport} onDismiss={dismissIdleReport} />
      )}
      {!confirmingRestart && !idleReport && snapshot.result && (
        <WaveReport result={snapshot.result} onDismiss={actions.dismissResult} />
      )}
    </div>
  );
}
