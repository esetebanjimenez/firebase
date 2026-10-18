/** App — portrait shell: status on top, battlefield, controls, then the shop. */

import { useGameLoop } from '../game/useGameLoop';
import { BattlefieldCanvas } from '../render/BattlefieldCanvas';
import { CommandBar } from './CommandBar';
import { Panel } from './Panel';
import { TopBar } from './TopBar';
import { WaveReport, WelcomeBack } from './Modals';

export function App() {
  const { stateRef, fxRef, snapshot, actions, idleReport, dismissIdleReport, config } = useGameLoop();
  const armed = snapshot.abilities.find((a) => a.selected && a.unlocked) ?? null;

  return (
    <div className="app">
      <TopBar snapshot={snapshot} />

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
      <Panel snapshot={snapshot} actions={actions} />

      {idleReport && <WelcomeBack report={idleReport} onDismiss={dismissIdleReport} />}
      {!idleReport && snapshot.result && (
        <WaveReport result={snapshot.result} onDismiss={actions.dismissResult} />
      )}
    </div>
  );
}
