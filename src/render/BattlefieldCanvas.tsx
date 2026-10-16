/**
 * BattlefieldCanvas.tsx — mounts a PixiJS application and runs the renderer's
 * own draw loop (Pixi's ticker), reading the live sim state via refs. React
 * never re-renders this component for gameplay; it only sets it up/tears it
 * down.
 */

import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { GameConfig, SimEvent, SimState } from '../sim';
import { COLORS } from './sprites';
import { BattlefieldRenderer } from './renderer';

interface Props {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  config: GameConfig;
}

export function BattlefieldCanvas({ stateRef, fxRef, config }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let renderer: BattlefieldRenderer | null = null;
    let cancelled = false;

    const run = async () => {
      const a = new Application();
      await a.init({
        resizeTo: host,
        background: COLORS.background,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      app = a;
      host.appendChild(a.canvas);
      renderer = new BattlefieldRenderer(a, config);

      a.ticker.add((ticker) => {
        renderer?.draw(stateRef.current, fxRef.current, ticker.deltaMS / 1000);
      });
    };

    void run();

    return () => {
      cancelled = true;
      renderer?.destroy();
      renderer = null;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, [stateRef, fxRef, config]);

  return <div ref={hostRef} className="battlefield-host" />;
}
