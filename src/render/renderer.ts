/**
 * renderer.ts — draws a `SimState` onto a PixiJS stage every frame.
 *
 * The renderer is a pure consumer of simulation state: it reads `stateRef`
 * (never mutates it) and drains a buffer of `SimEvent`s for juice. It owns all
 * the "look": terrain zones, friendly emplacements that track and fire on
 * enemies, marching enemy infantry, explosions, tracers, screen shake. Because
 * the sim owns all logic, swapping these placeholder shapes for pixel-art
 * sprites touches nothing in `sim/`.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { RING_ORDER } from '../sim';
import type { Enemy, GameConfig, RingId, SimEvent, SimState } from '../sim';
import {
  AnimatedView,
  COLORS,
  createBaseView,
  createEmplacementView,
  createExplosionView,
  createInfantryView,
  EmplacementView,
} from './sprites';

interface Explosion {
  g: Graphics;
  age: number;
  life: number;
}
interface Popup {
  t: Text;
  age: number;
  life: number;
}
interface RingEmplacements {
  sig: string;
  items: { view: EmplacementView; angle: number }[];
}

/** Representative normalized radius where each ring's emplacements sit. */
const RING_RADIUS: Record<RingId, number> = { outer: 0.82, middle: 0.48, inner: 0.2 };
/** Angular offset so adjacent rings' emplacements interleave, not line up. */
const RING_ANGLE_OFFSET: Record<RingId, number> = { outer: 0, middle: 0.42, inner: 0.84 };

function angleForId(id: number): number {
  return (id * 2.399963229728653) % (Math.PI * 2);
}

function emplacementCount(ring: RingId, level: number): number {
  const base: Record<RingId, number> = { outer: 8, middle: 6, inner: 5 };
  const cap: Record<RingId, number> = { outer: 16, middle: 12, inner: 9 };
  return Math.min(cap[ring], base[ring] + Math.floor(level / 2));
}

export class BattlefieldRenderer {
  private readonly app: Application;
  private readonly cfg: GameConfig;

  private readonly world = new Container(); // shaken as a whole
  private readonly terrainGfx = new Graphics();
  private readonly ringGfx: Record<RingId, Graphics>;
  private readonly emplacementLayer = new Container();
  private readonly tracerGfx = new Graphics();
  private readonly unitLayer = new Container();
  private readonly fxLayer = new Container();
  private baseView: Container;

  private readonly emplacements: Record<RingId, RingEmplacements> = {
    outer: { sig: '', items: [] },
    middle: { sig: '', items: [] },
    inner: { sig: '', items: [] },
  };
  private readonly fireClock: Record<RingId, number> = { outer: 0, middle: 0, inner: 0 };

  private readonly units = new Map<number, AnimatedView>();
  private readonly angles = new Map<number, number>();
  private readonly explosions: Explosion[] = [];
  private readonly popups: Popup[] = [];

  private time = 0;
  private shake = 0;
  private ringFlash: Partial<Record<RingId, number>> = {};
  private baseRadiusPx = 12;

  constructor(app: Application, cfg: GameConfig) {
    this.app = app;
    this.cfg = cfg;
    this.ringGfx = { outer: new Graphics(), middle: new Graphics(), inner: new Graphics() };

    this.world.addChild(
      this.terrainGfx,
      this.ringGfx.outer,
      this.ringGfx.middle,
      this.ringGfx.inner,
      this.emplacementLayer,
      this.tracerGfx,
      this.unitLayer,
      this.fxLayer,
    );
    this.baseView = createBaseView(this.baseRadiusPx);
    this.unitLayer.addChild(this.baseView);
    app.stage.addChild(this.world);
  }

  private geometry() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    return { cx: w / 2, cy: h / 2, fieldRadius: Math.min(w, h) / 2 - 6 };
  }

  private toPx(radius: number, fieldRadius: number): number {
    return Math.max(0, radius) * fieldRadius;
  }

  private enemyWorld(e: Enemy, cx: number, cy: number, fieldRadius: number) {
    const a = this.angles.get(e.id) ?? angleForId(e.id);
    const d = this.toPx(e.radius, fieldRadius);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, a };
  }

  private drawTerrain(cx: number, cy: number, fieldRadius: number): void {
    const g = this.terrainGfx.clear();
    g.circle(cx, cy, this.toPx(1.0, fieldRadius)).fill(COLORS.zoneOuter);
    g.circle(cx, cy, this.toPx(this.cfg.rings.outer.band.inner, fieldRadius)).fill(COLORS.zoneMiddle);
    g.circle(cx, cy, this.toPx(this.cfg.rings.middle.band.inner, fieldRadius)).fill(COLORS.zoneInner);
    g.circle(cx, cy, fieldRadius).stroke({ width: 2, color: COLORS.fieldEdge });
  }

  private drawRings(state: SimState, cx: number, cy: number, fieldRadius: number): void {
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      const g = this.ringGfx[id].clear();
      g.position.set(cx, cy);
      const r = this.toPx(this.cfg.rings[id].band.inner, fieldRadius);
      const built = ring.level > 0;
      const active = ring.status === 'active' && built;
      const flash = this.ringFlash[id] ?? 0;
      let color = active ? COLORS.ringActive[id] : COLORS.ringDown;
      let alpha = active ? 0.5 : built ? 0.45 : 0.12;
      if (flash > 0) {
        color = 0xffffff;
        alpha = Math.min(1, alpha + flash);
      }
      g.circle(0, 0, r).stroke({ width: active ? 2 : 1.5, color, alpha });
    }
  }

  private syncEmplacements(state: SimState, cx: number, cy: number, fieldRadius: number): void {
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      const built = ring.level > 0;
      const down = ring.status === 'down';
      const count = built ? emplacementCount(id, ring.level) : 0;
      const sig = `${built ? 1 : 0}|${down ? 1 : 0}|${count}|${Math.round(fieldRadius)}`;
      const slot = this.emplacements[id];

      if (slot.sig !== sig) {
        for (const it of slot.items) it.view.root.destroy();
        slot.items = [];
        slot.sig = sig;
        for (let i = 0; i < count; i++) {
          const angle = RING_ANGLE_OFFSET[id] + (i / count) * Math.PI * 2;
          const view = createEmplacementView(id, down);
          this.emplacementLayer.addChild(view.root);
          slot.items.push({ view, angle });
        }
      }

      const rpx = this.toPx(RING_RADIUS[id], fieldRadius);
      for (const it of slot.items) {
        const sway = Math.sin(this.time * 1.6 + it.angle * 3) * 0.04;
        it.view.root.position.set(cx + Math.cos(it.angle) * rpx, cy + Math.sin(it.angle) * rpx);
        it.view.root.rotation = it.angle + sway;
      }
    }
  }

  /** Nearest emplacement (by angle) to a target angle, within a ring. */
  private nearestEmplacement(id: RingId, targetAngle: number) {
    const items = this.emplacements[id].items;
    let best: { view: EmplacementView; angle: number } | null = null;
    let bestD = Infinity;
    for (const it of items) {
      let d = Math.abs(((it.angle - targetAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  private drawFiring(state: SimState, dtSec: number, cx: number, cy: number, fieldRadius: number): void {
    const tg = this.tracerGfx.clear();
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      if (ring.status !== 'active' || ring.level <= 0) continue;
      const band = this.cfg.rings[id].band;

      // frontmost enemy in this ring's band = the one it is focus-firing
      let target: Enemy | null = null;
      for (const e of state.enemies) {
        if (e.radius <= band.outer && e.radius > band.inner) {
          if (!target || e.radius < target.radius) target = e;
        }
      }

      this.fireClock[id] += dtSec;
      if (!target) continue;

      const tw = this.enemyWorld(target, cx, cy, fieldRadius);
      const emp = this.nearestEmplacement(id, tw.a);
      if (!emp) continue;

      // muzzle world position (rotate local muzzle by the emplacement's angle)
      const ex = emp.view.root.position.x;
      const ey = emp.view.root.position.y;
      const ca = Math.cos(emp.view.root.rotation);
      const sa = Math.sin(emp.view.root.rotation);
      const mx = ex + emp.view.muzzle.x * ca - emp.view.muzzle.y * sa;
      const my = ey + emp.view.muzzle.x * sa + emp.view.muzzle.y * ca;

      // blink the tracer so it reads as rapid fire rather than a solid beam
      const on = this.fireClock[id] % 0.16 < 0.07;
      if (on) {
        tg.moveTo(mx, my).lineTo(tw.x, tw.y).stroke({ width: 1.4, color: COLORS.tracer, alpha: 0.85 });
        tg.circle(mx, my, 3).fill({ color: COLORS.muzzle, alpha: 0.9 });
      }
    }
  }

  private spawnExplosion(x: number, y: number): void {
    const g = createExplosionView();
    g.position.set(x, y);
    g.scale.set(0.1);
    this.fxLayer.addChild(g);
    this.explosions.push({ g, age: 0, life: 0.4 });
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
        case 'breach':
          this.ringFlash[e.ring] = 1;
          this.shake = Math.max(this.shake, 6);
          break;
        case 'fullBreach':
          this.shake = Math.max(this.shake, 16);
          this.spawnPopup(cx, cy - 22, 'OVERRUN', COLORS.breachText);
          break;
        default:
          break;
      }
    }
    events.length = 0;
  }

  private syncUnits(state: SimState, cx: number, cy: number, fieldRadius: number): void {
    const alive = new Set<number>();
    for (const enemy of state.enemies) {
      alive.add(enemy.id);
      let view = this.units.get(enemy.id);
      if (!view) {
        const angle = angleForId(enemy.id);
        view = createInfantryView(enemy.id * 1.7);
        this.units.set(enemy.id, view);
        this.angles.set(enemy.id, angle);
        this.unitLayer.addChild(view.root);
      }
      const ang = this.angles.get(enemy.id)!;
      const dist = this.toPx(enemy.radius, fieldRadius);
      view.root.position.set(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
      view.root.alpha = 0.6 + 0.4 * (enemy.hp / enemy.maxHp);
      view.update(this.time);
    }
    for (const [id, view] of this.units) {
      if (!alive.has(id)) {
        view.root.destroy();
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
      ex.g.scale.set(0.3 + k * 1.7);
      ex.g.rotation += dtSec * 6;
      ex.g.alpha = Math.max(0, 1 - k);
      if (ex.age >= ex.life) {
        ex.g.destroy();
        this.explosions.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dtSec;
      p.t.position.y -= dtSec * 30;
      p.t.alpha = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        p.t.destroy();
        this.popups.splice(i, 1);
      }
    }
    for (const id of RING_ORDER) {
      if (this.ringFlash[id]) this.ringFlash[id] = Math.max(0, (this.ringFlash[id] ?? 0) - dtSec * 3);
    }
    if (this.shake > 0.1) {
      this.world.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.max(0, 1 - dtSec * 6);
    } else {
      this.world.position.set(0, 0);
      this.shake = 0;
    }
  }

  draw(state: SimState, fx: SimEvent[], dtSec: number): void {
    this.time += dtSec;
    const { cx, cy, fieldRadius } = this.geometry();

    const desiredBase = Math.max(12, fieldRadius * 0.13);
    if (Math.abs(desiredBase - this.baseRadiusPx) > 0.5) {
      this.baseRadiusPx = desiredBase;
      this.baseView.destroy();
      this.baseView = createBaseView(this.baseRadiusPx);
      this.unitLayer.addChildAt(this.baseView, 0);
    }
    this.baseView.position.set(cx, cy);

    this.drawTerrain(cx, cy, fieldRadius);
    this.drawRings(state, cx, cy, fieldRadius);
    this.syncEmplacements(state, cx, cy, fieldRadius);
    this.drawFiring(state, dtSec, cx, cy, fieldRadius);
    this.processEvents(fx, cx, cy, fieldRadius);
    this.syncUnits(state, cx, cy, fieldRadius);
    this.updateFx(dtSec);
  }

  destroy(): void {
    for (const view of this.units.values()) view.root.destroy();
    this.units.clear();
    for (const id of RING_ORDER) for (const it of this.emplacements[id].items) it.view.root.destroy();
    this.world.destroy({ children: true });
  }
}
