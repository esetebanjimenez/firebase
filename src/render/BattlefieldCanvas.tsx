/**
 * BattlefieldCanvas — the canvas element, its render loop, and aiming.
 *
 * Deliberately outside React's render cycle: the component mounts a canvas,
 * hands it to the Renderer, and drives frames from its own rAF loop reading the
 * simulation ref. React re-renders (snapshots, panels, modals) therefore never
 * touch the battlefield, and the battlefield never triggers a React render.
 *
 * Aiming is press-drag-release: pressing shows the blast radius where you are
 * pointing, dragging moves it, releasing calls the strike in.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { GameConfig, SimEvent, SimState } from '../sim';
import { Renderer, type RenderOptions } from './Renderer';

interface Props {
  stateRef: React.MutableRefObject<SimState>;
  fxRef: React.MutableRefObject<SimEvent[]>;
  config: GameConfig;
  /** Radius of the armed ability, or null when nothing is armed. */
  armedRadius: number | null;
  armedReady: boolean;
  onCast: (x: number, y: number) => void;
  /**
   * A tap on the field while no ability is armed. Field coordinates, plus
   * where that landed on screen so the caller can hang a control off it.
   */
  onTap?: (point: {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    /** CSS pixels per field pixel, so the caller can place things exactly. */
    scale: number;
  }) => void;
}

export function BattlefieldCanvas({
  stateRef,
  fxRef,
  config,
  armedRadius,
  armedReady,
  onCast,
  onTap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const pressingRef = useRef(false);
  // Latest aiming props, read inside the loop without re-subscribing it.
  const armedRef = useRef({ radius: armedRadius, ready: armedReady });
  armedRef.current = { radius: armedRadius, ready: armedReady };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const renderer = new Renderer(canvas, config);
    rendererRef.current = renderer;

    const fit = () => {
      const rect = host.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const fx = fxRef.current;
      const batch = fx.length > 0 ? fx.splice(0, fx.length) : [];
      const armed = armedRef.current;
      const opts: RenderOptions = {
        aim: armed.radius !== null ? aimRef.current : null,
        aimRadius: armed.radius ?? 12,
        aimReady: armed.ready,
      };
      renderer.render(stateRef.current, batch, dt, opts);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rendererRef.current = null;
    };
  }, [config, fxRef, stateRef]);

  const pointAt = useCallback((clientX: number, clientY: number) => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    return renderer.toFieldCoords(clientX, clientY);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (armedRadius === null) {
        // Nothing armed, so the tap belongs to whatever is on the field —
        // the gun pads use this to let you fit them where you can see them.
        const renderer = rendererRef.current;
        const point = pointAt(event.clientX, event.clientY);
        if (onTap && point && renderer) {
          const here = renderer.toScreenCoords(point.x, point.y);
          const step = renderer.toScreenCoords(point.x + 1, point.y);
          onTap({ ...point, screenX: here.x, screenY: here.y, scale: step.x - here.x });
        }
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      pressingRef.current = true;
      aimRef.current = pointAt(event.clientX, event.clientY);
    },
    [armedRadius, onTap, pointAt],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pressingRef.current) return;
      aimRef.current = pointAt(event.clientX, event.clientY);
    },
    [pointAt],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pressingRef.current) return;
      pressingRef.current = false;
      const point = pointAt(event.clientX, event.clientY) ?? aimRef.current;
      aimRef.current = null;
      if (point) onCast(point.x, point.y);
    },
    [onCast, pointAt],
  );

  const onPointerCancel = useCallback(() => {
    pressingRef.current = false;
    aimRef.current = null;
  }, []);

  return (
    <div className="battlefield" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className={`battlefield__canvas ${armedRadius !== null ? 'battlefield__canvas--armed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  );
}
