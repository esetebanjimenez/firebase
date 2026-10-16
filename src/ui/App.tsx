/** App — portrait shell: battlefield on top, controls on the bottom. */

import { useGameLoop } from '../game/useGameLoop';
import { IsoBattlefieldCanvas } from '../render/iso/IsoBattlefieldCanvas';
import { ControlPanel } from './ControlPanel';
import { Sitrep } from './Sitrep';
import { TopBar } from './TopBar';

export function App() {
  const { stateRef, fxRef, snapshot, actions, sitrep, dismissSitrep, config } = useGameLoop();

  return (
    <div className="app">
      <TopBar snapshot={snapshot} />

      <main className="field">
        <IsoBattlefieldCanvas stateRef={stateRef} fxRef={fxRef} config={config} />
      </main>

      <ControlPanel snapshot={snapshot} actions={actions} />

      {sitrep && <Sitrep sitrep={sitrep} onDismiss={dismissSitrep} />}
    </div>
  );
}
