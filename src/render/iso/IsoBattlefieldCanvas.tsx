/**
 * IsoBattlefieldCanvas.tsx — mounts a PixiJS app and runs the isometric
 * renderer. Preloads the iso sprite set, then reads the live sim via refs.
 */

import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { GameConfig, SimEvent, SimState } from '../../sim';
import { loadIsoTextures } from './isoAssets';
import { IsoRenderer } from './IsoRenderer';

interface Props {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  config: GameConfig;
}

export function IsoBattlefieldCanvas({ stateRef, fxRef, config }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let renderer: IsoRenderer | null = null;
    let cancelled = false;

    const run = async () => {
      const a = new Application();
      await a.init({
        resizeTo: host,
        background: 0x3c6b2e,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      const textures = await loadIsoTextures();
      if (cancelled) {
        a.destroy(true);
        return;
      }
      app = a;
      host.appendChild(a.canvas);
      renderer = new IsoRenderer(a.screen, config, textures, a.stage);
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
