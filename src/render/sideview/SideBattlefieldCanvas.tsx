/**
 * SideBattlefieldCanvas.tsx — mounts a PixiJS app and runs the side-view
 * renderer. Preloads the CC0 sprite textures before first draw. Reads the live
 * sim via refs, exactly like the top-down canvas.
 */

import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { GameConfig, SimEvent, SimState } from '../../sim';
import { loadUnitTextures } from './assets';
import { SideRenderer } from './SideRenderer';

interface Props {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  config: GameConfig;
}

export function SideBattlefieldCanvas({ stateRef, fxRef, config }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let renderer: SideRenderer | null = null;
    let cancelled = false;

    const run = async () => {
      const a = new Application();
      await a.init({
        resizeTo: host,
        background: 0x2a3a52,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      const textures = await loadUnitTextures();
      if (cancelled) {
        a.destroy(true);
        return;
      }
      app = a;
      host.appendChild(a.canvas);
      renderer = new SideRenderer(a.screen, config, textures, a.stage);
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
