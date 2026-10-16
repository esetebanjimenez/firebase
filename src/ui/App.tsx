/** App — portrait shell: battlefield on top, controls on the bottom. */

import { useState } from 'react';
import { useGameLoop } from '../game/useGameLoop';
import { BattlefieldCanvas } from '../render/BattlefieldCanvas';
import { SideBattlefieldCanvas } from '../render/sideview/SideBattlefieldCanvas';
import { ControlPanel } from './ControlPanel';
import { Sitrep } from './Sitrep';
import { TopBar } from './TopBar';

type ViewMode = 'side' | 'top';

export function App() {
  const { stateRef, fxRef, snapshot, actions, sitrep, dismissSitrep, config } = useGameLoop();
  const [view, setView] = useState<ViewMode>('side');

  return (
    <div className="app">
      <TopBar snapshot={snapshot} />

      <main className="field">
        {/* Remount the canvas on view change via key so Pixi tears down cleanly. */}
        {view === 'side' ? (
          <SideBattlefieldCanvas key="side" stateRef={stateRef} fxRef={fxRef} config={config} />
        ) : (
          <BattlefieldCanvas key="top" stateRef={stateRef} fxRef={fxRef} config={config} />
        )}

        <button
          className="view-toggle"
          onClick={() => setView((v) => (v === 'side' ? 'top' : 'side'))}
          title="Switch battlefield view"
        >
          {view === 'side' ? 'Side view' : 'Top-down'} ⤵
        </button>
      </main>

      <ControlPanel snapshot={snapshot} actions={actions} />

      {sitrep && <Sitrep sitrep={sitrep} onDismiss={dismissSitrep} />}
    </div>
  );
}
