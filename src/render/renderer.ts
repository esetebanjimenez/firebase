/**
 * renderer.ts — draws a `SimState` onto a PixiJS stage every frame.
 *
 * The renderer is a pure consumer of simulation state: it reads `stateRef`
 * (never mutates it) and drains a buffer of `SimEvent`s for juice (explosions,
 * supply pop-ups, screen shake). Because the sim owns all logic, swapping this
 * renderer out — or the placeholder shapes for pixel-art sprites — touches
 * nothing in `sim/`.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { RING_ORDER } from '../sim';
import type { GameConfig, RingId, SimEvent, SimState } from '../sim';
import { COLORS, createBaseView, createExplosionView, createUnitView } from './sprites';

interface Explosion {
  g: Graphics;
  age: number;
  life: number;
  size: number;
}
interface Popup {
  t: Text;
  age: number;
  life: number;
}

/** Deterministic angle in [0, 2π) from an enemy id, so a unit keeps its lane. */
function angleForId(id: number): number {
  // golden-angle spread keeps consecutive spawns visually separated
  return (id * 2.399963229728653) % (Math.PI * 2);
}

export class BattlefieldRenderer {
  private readonly app: Application;
  private readonly cfg: GameConfig;

  private readonly world = new Container(); // shaken as a whole
  private readonly ringLayer = new Container();
  private readonly ringGfx: Record<RingId, Graphics>;
  private readonly fieldGfx = new Graphics();
  private baseView: Container;
  private readonly unitLayer = new Container();
  private readonly fxLayer = new Container();

  private readonly units = new Map<number, Container>();
  private readonly angles = new Map<number, number>();
  private readonly explosions: Explosion[] = [];
  private readonly popups: Popup[] = [];

  private shake = 0;
  private ringFlash: Partial<Record<RingId, number>> = {};
  private baseRadiusPx = 12;

  constructor(app: Application, cfg: GameConfig) {
    this.app = app;
    this.cfg = cfg;

    this.ringGfx = {
      outer: new Graphics(),
      middle: new Graphics(),
      inner: new Graphics(),
    };

    this.world.addChild(this.fieldGfx, this.ringLayer, this.unitLayer, this.fxLayer);
    for (const id of RING_ORDER) this.ringLayer.addChild(this.ringGfx[id]);
    this.baseView = createBaseView(this.baseRadiusPx);
    this.unitLayer.addChild(this.baseView);
    app.stage.addChild(this.world);
  }

  /** Current field geometry in pixels. */
  private geometry() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h / 2;
    const fieldRadius = Math.min(w, h) / 2 - 6;
    return { cx, cy, fieldRadius };
  }

  /** Pixel distance from center for a normalized sim radius (1 = edge, 0 = core). */
  private toPx(radius: number, fieldRadius: number): number {
    return Math.max(0, radius) * fieldRadius;
  }

  private drawField(cx: number, cy: number, fieldRadius: number): void {
    this.fieldGfx
      .clear()
      .circle(cx, cy, fieldRadius)
      .fill(COLORS.field)
      .circle(cx, cy, fieldRadius)
      .stroke({ width: 2, color: COLORS.fieldEdge });
  }

  private drawRings(state: SimState, cx: number, cy: number, fieldRadius: number): void {
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      const g = this.ringGfx[id];
      g.clear();
      g.position.set(cx, cy);

      const bandInner = this.toPx(this.cfg.rings[id].band.inner, fieldRadius);
      const built = ring.level > 0;
      const active = ring.status === 'active' && built;

      const flash = this.ringFlash[id] ?? 0;
      let color = active ? COLORS.ringActive[id] : COLORS.ringDown;
      let alpha = active ? 0.9 : built ? 0.55 : 0.18;
      const width = active ? 3 + Math.min(ring.level - 1, 6) : 2;

      if (flash > 0) {
        color = 0xffffff;
        alpha = Math.min(1, alpha + flash);
      }

      // The ring is drawn at its inner boundary — the line enemies must not cross.
      g.circle(0, 0, bandInner).stroke({ width, color, alpha });

      if (!active && built) {
        // dashed "down" marker ticks so a fallen ring reads instantly
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const r1 = bandInner - 3;
          const r2 = bandInner + 3;
          g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
            .lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
            .stroke({ width: 2, color: COLORS.ringDown, alpha: 0.7 });
        }
      }
    }
  }

  private spawnExplosion(x: number, y: number, size = 1): void {
    const g = createExplosionView();
    g.position.set(x, y);
    g.scale.set(0.1);
    this.fxLayer.addChild(g);
    this.explosions.push({ g, age: 0, life: 0.4, size });
  }

  private spawnPopup(x: number, y: number, text: string, color: number): void {
    const t = new Text({
      text,
      style: { fill: color, fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    this.popups.push({ t, age: 0, life: 0.9 });
  }

  private processEvents(events: SimEvent[], cx: number, cy: number, fieldRadius: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const ang = this.angles.get(e.enemyId) ?? 0;
          const px = cx + Math.cos(ang) * this.toPx(e.radius, fieldRadius);
          const py = cy + Math.sin(ang) * this.toPx(e.radius, fieldRadius);
          this.spawnExplosion(px, py);
          this.spawnPopup(px, py, `+${Math.round(e.bounty)}`, COLORS.supplyText);
          break;
        }
        case 'breach': {
          this.ringFlash[e.ring] = 1;
          this.shake = Math.max(this.shake, 6);
          break;
        }
        case 'fullBreach': {
          this.shake = Math.max(this.shake, 16);
          this.spawnPopup(cx, cy - 20, 'OVERRUN', COLORS.breachText);
          break;
        }
        default:
          break;
      }
    }
    events.length = 0; // drained
  }

  private syncUnits(state: SimState, cx: number, cy: number, fieldRadius: number): void {
    const alive = new Set<number>();
    for (const enemy of state.enemies) {
      alive.add(enemy.id);
      let view = this.units.get(enemy.id);
      if (!view) {
        view = createUnitView(enemy.type);
        this.units.set(enemy.id, view);
        this.angles.set(enemy.id, angleForId(enemy.id));
        this.unitLayer.addChild(view);
      }
      const ang = this.angles.get(enemy.id)!;
      const dist = this.toPx(enemy.radius, fieldRadius);
      view.position.set(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
      // fade a little as HP drops so wounded units read as weaker
      view.alpha = 0.55 + 0.45 * (enemy.hp / enemy.maxHp);
    }
    // prune views whose enemies are gone
    for (const [id, view] of this.units) {
      if (!alive.has(id)) {
        view.destroy();
        this.units.delete(id);
        this.angles.delete(id);
      }
    }
  }

  private updateFx(dtSec: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dtSec;
      const k = ex.age / ex.life;
      ex.g.scale.set((0.3 + k * 1.6) * ex.size);
      ex.g.alpha = Math.max(0, 1 - k);
      if (ex.age >= ex.life) {
        ex.g.destroy();
        this.explosions.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dtSec;
      const k = p.age / p.life;
      p.t.position.y -= dtSec * 30;
      p.t.alpha = Math.max(0, 1 - k);
      if (p.age >= p.life) {
        p.t.destroy();
        this.popups.splice(i, 1);
      }
    }
    for (const id of RING_ORDER) {
      if (this.ringFlash[id]) {
        this.ringFlash[id] = Math.max(0, (this.ringFlash[id] ?? 0) - dtSec * 3);
      }
    }
    // screen shake decay
    if (this.shake > 0.1) {
      this.world.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.max(0, 1 - dtSec * 6);
    } else {
      this.world.position.set(0, 0);
      this.shake = 0;
    }
  }

  /** Draw one frame. `dtSec` is wall-clock delta for FX animation. */
  draw(state: SimState, fx: SimEvent[], dtSec: number): void {
    const { cx, cy, fieldRadius } = this.geometry();

    // keep the base centered & sized
    const desiredBase = Math.max(10, fieldRadius * 0.12);
    if (Math.abs(desiredBase - this.baseRadiusPx) > 0.5) {
      this.baseRadiusPx = desiredBase;
      this.baseView.destroy();
      this.baseView = createBaseView(this.baseRadiusPx);
      this.unitLayer.addChildAt(this.baseView, 0);
    }
    this.baseView.position.set(cx, cy);

    this.drawField(cx, cy, fieldRadius);
    this.drawRings(state, cx, cy, fieldRadius);
    this.processEvents(fx, cx, cy, fieldRadius);
    this.syncUnits(state, cx, cy, fieldRadius);
    this.updateFx(dtSec);
  }

  destroy(): void {
    for (const view of this.units.values()) view.destroy();
    this.units.clear();
    this.world.destroy({ children: true });
  }
}
