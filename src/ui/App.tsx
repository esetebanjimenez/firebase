/** App — portrait shell: status on top, battlefield, controls, then the shop. */

import { useCallback, useState } from 'react';
import { useGameLoop } from '../game/useGameLoop';
import { BattlefieldCanvas } from '../render/BattlefieldCanvas';
import { CommandBar } from './CommandBar';
import { Panel } from './Panel';
import { TopBar } from './TopBar';
import { PadPicker, PAD_TAP_RADIUS } from './PadPicker';
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

  /**
   * Tapping a gun pad on the wall opens its picker. The pads are things the
   * player can see, so pointing at one is the obvious way to fit it — the
   * list in the panel is an abstraction over the same four objects.
   */
  const [picking, setPicking] = useState<{ index: number; screenX: number; screenY: number } | null>(
    null,
  );
  const pads = snapshot.pads;
  const prep = snapshot.phase === 'prep';
  const pickPad = useCallback(
    (point: { x: number; y: number; screenX: number; screenY: number; scale: number }) => {
      if (!prep) return;
      let best = -1;
      let bestD2 = PAD_TAP_RADIUS * PAD_TAP_RADIUS;
      for (let i = 0; i < pads.length; i++) {
        const d2 = (pads[i].x - point.x) ** 2 + (pads[i].y - point.y) ** 2;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      // A tap anywhere else closes the picker rather than doing nothing.
      if (best < 0) {
        setPicking(null);
        return;
      }
      // Anchor on the pad, not on wherever the thumb landed, so the picker
      // sits in the same place however accurate the tap was.
      setPicking({
        index: best,
        screenX: point.screenX + (pads[best].x - point.x) * point.scale,
        screenY: point.screenY + (pads[best].y - point.y) * point.scale,
      });
    },
    [pads, prep],
  );

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
          onTap={pickPad}
        />
        {picking && (
          <PadPicker
            pad={snapshot.pads[picking.index]}
            guns={snapshot.guns}
            left={picking.screenX}
            top={picking.screenY}
            onPick={(gun) => {
              actions.fitGun(picking.index, gun);
              setPicking(null);
            }}
            onDismiss={() => setPicking(null)}
          />
        )}
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
        <WaveReport
          result={snapshot.result}
          hint={snapshot.resultHint}
          onDismiss={actions.dismissResult}
        />
      )}
    </div>
  );
}
