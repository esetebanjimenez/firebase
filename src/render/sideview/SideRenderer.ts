/**
 * SideRenderer.ts — a side-view ("Grow Empire"-style) battlefield renderer.
 *
 * PROTOTYPE: reads the exact same `SimState` as the top-down renderer (no sim
 * changes). It just reinterprets an enemy's normalized `radius` as distance
 * along a horizontal lane: radius 1 = far right (spawn), radius 0 = the FOB on
 * the left. Enemies march left toward the base; three defensive lines of
 * soldiers hold the lane. Characters are CC0 cartoon sprites (see assets.ts).
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { RING_ORDER } from '../../sim';
import type { Enemy, GameConfig, RingId, SimEvent, SimState } from '../../sim';
import type { TextureMap } from './assets';

const NLANES = 4;
/** Where each ring's line of defenders stands along the lane (radius units). */
const LINE_RADIUS: Record<RingId, number> = { outer: 0.78, middle: 0.46, inner: 0.16 };
const RING_TINT: Record<RingId, number> = { outer: 0xbfe3ff, middle: 0xc6ffe0, inner: 0xe0d8ff };

interface Defender {
  sprite: Sprite;
  baseX: number;
  y: number;
  scale: number;
  phase: number;
}
interface RingLine {
  sig: string;
  defenders: Defender[];
}
interface EnemyView {
  sprite: Sprite;
  lane: number;
  phase: number;
  skin: 'zombie' | 'raider';
}
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

const COL = {
  skyTop: 0x2a3a52,
  skyBot: 0xcf9b6a,
  sun: 0xffe6b0,
  duneFar: 0x9a6a3e,
  duneNear: 0x7a4f2c,
  ground: 0xb98a4e,
  groundDark: 0x8a6436,
  sandbag: 0xd8bd82,
  sandbagDark: 0xa8894f,
  wreck: 0x5a5148,
  fobWall: 0xc7a86a,
  fobDark: 0x8a6d3a,
  tracer: 0xffd166,
  muzzle: 0xffe9a3,
  explosion: 0xffd25c,
  supply: 0x8fe8b0,
  breach: 0xff7a5c,
  // light warm tint: nudges enemies hostile without muddying the sprite (tint multiplies)
  hostile: 0xffc2b0,
} as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SideRenderer {
  private readonly world = new Container();
  private readonly bgGfx = new Graphics();
  private readonly fob = new Container();
  private readonly lineGfx = new Graphics();
  private readonly defenderLayer = new Container();
  private readonly enemyLayer = new Container();
  private readonly tracerGfx = new Graphics();
  private readonly fxLayer = new Container();

  private readonly tex: TextureMap;
  private readonly lines: Record<RingId, RingLine> = {
    outer: { sig: '', defenders: [] },
    middle: { sig: '', defenders: [] },
    inner: { sig: '', defenders: [] },
  };
  private readonly fireClock: Record<RingId, number> = { outer: 0, middle: 0, inner: 0 };
  private readonly firing: Record<RingId, boolean> = { outer: false, middle: false, inner: false };

  private readonly enemies = new Map<number, EnemyView>();
  private readonly explosions: Explosion[] = [];
  private readonly popups: Popup[] = [];

  private time = 0;
  private shake = 0;
  private ringFlash: Partial<Record<RingId, number>> = {};
  private fobSig = '';

  constructor(
    private readonly screen: { width: number; height: number },
    private readonly cfg: GameConfig,
    textures: TextureMap,
    stage: Container,
  ) {
    this.tex = textures;
    this.world.addChild(
      this.bgGfx,
      this.fob,
      this.lineGfx,
      this.enemyLayer,
      this.defenderLayer,
      this.tracerGfx,
      this.fxLayer,
    );
    stage.addChild(this.world);
  }

  private geo() {
    const w = this.screen.width;
    const h = this.screen.height;
    const fobW = Math.min(Math.max(w * 0.2, 68), 128);
    const laneLeft = fobW;
    const laneRight = w - 6;
    const horizon = h * 0.46;
    // Deliberately small so dozens of units read clearly on a phone (swarms later).
    const unitH = Math.min(Math.max(h * 0.12, 32), 78);
    return { w, h, fobW, laneLeft, laneRight, laneWidth: laneRight - laneLeft, horizon, unitH };
  }

  private xForRadius(r: number, g: ReturnType<SideRenderer['geo']>): number {
    return g.laneLeft + Math.max(0, Math.min(1, r)) * g.laneWidth;
  }

  private laneY(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    return lerp(g.h * 0.6, g.h * 0.95, lane / (NLANES - 1));
  }

  private laneScale(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    const base = g.unitH / 110;
    return base * lerp(0.72, 1.08, lane / (NLANES - 1));
  }

  private drawBackground(g: ReturnType<SideRenderer['geo']>): void {
    const bg = this.bgGfx.clear();
    // sky
    bg.rect(0, 0, g.w, g.horizon).fill(COL.skyTop);
    bg.rect(0, g.horizon * 0.5, g.w, g.horizon * 0.5).fill({ color: COL.skyBot, alpha: 0.5 });
    bg.circle(g.w * 0.78, g.horizon * 0.5, g.h * 0.06).fill({ color: COL.sun, alpha: 0.85 });
    // distant dunes (parallax, drifting slowly)
    const drift = (this.time * 4) % g.w;
    for (let i = 0; i < 3; i++) {
      const y = g.horizon - 6 + i * 4;
      const amp = 10 + i * 4;
      bg.moveTo(0, g.horizon);
      for (let x = -drift; x <= g.w; x += 40) {
        bg.lineTo(x, y - Math.sin((x + i * 30) * 0.02) * amp);
      }
      bg.lineTo(g.w, g.horizon).lineTo(0, g.horizon).closePath().fill({ color: i < 2 ? COL.duneFar : COL.duneNear, alpha: 0.5 });
    }
    // ground
    bg.rect(0, g.horizon, g.w, g.h - g.horizon).fill(COL.ground);
    bg.rect(0, g.horizon, g.w, 4).fill(COL.groundDark);
    // faint lane striping for depth
    for (let i = 0; i < NLANES; i++) {
      const y = this.laneY(i, g);
      bg.rect(0, y, g.w, 1).fill({ color: COL.groundDark, alpha: 0.12 });
    }
  }

  private rebuildFob(g: ReturnType<SideRenderer['geo']>): void {
    const sig = `${Math.round(g.fobW)}|${Math.round(g.h)}`;
    if (sig === this.fobSig) return;
    this.fobSig = sig;
    this.fob.removeChildren().forEach((c) => c.destroy());
    const base = this.laneY(NLANES - 1, g);
    const bw = g.fobW * 0.95;
    const bh = g.h * 0.3;
    const x0 = 2;
    const gfx = new Graphics();
    // shadow
    gfx.ellipse(x0 + bw / 2, base, bw * 0.6, 10).fill({ color: 0x000000, alpha: 0.3 });
    // main bunker
    gfx.roundRect(x0, base - bh, bw, bh, 6).fill(COL.fobWall);
    gfx.roundRect(x0, base - bh, bw, bh, 6).stroke({ width: 3, color: COL.fobDark });
    // sandbag crenellations on top
    for (let i = 0; i < 4; i++) {
      gfx.roundRect(x0 + 4 + i * (bw - 10) / 4, base - bh - 7, (bw - 10) / 4 - 3, 10, 2).fill(COL.sandbag);
    }
    // firing slit
    gfx.rect(x0 + bw * 0.55, base - bh * 0.62, bw * 0.4, bh * 0.16).fill(COL.fobDark);
    // flagpole + flag
    gfx.rect(x0 + bw * 0.5 - 1, base - bh - 34, 2, 30).fill(COL.fobDark);
    gfx.moveTo(x0 + bw * 0.5 + 1, base - bh - 34)
      .lineTo(x0 + bw * 0.5 + 20, base - bh - 28)
      .lineTo(x0 + bw * 0.5 + 1, base - bh - 22)
      .closePath()
      .fill(0x5fb0e6);
    this.fob.addChild(gfx);
  }

  private syncDefenders(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      const built = ring.level > 0;
      const down = ring.status === 'down';
      const count = built && !down ? Math.min(6, 3 + Math.floor(ring.level / 2)) : 0;
      const sig = `${count}|${Math.round(g.fobW)}|${Math.round(g.h)}|${Math.round(g.laneWidth)}`;
      const line = this.lines[id];
      if (line.sig !== sig) {
        for (const d of line.defenders) d.sprite.destroy();
        line.defenders = [];
        line.sig = sig;
        const cx = this.xForRadius(LINE_RADIUS[id], g);
        for (let i = 0; i < count; i++) {
          const lane = (i % NLANES);
          const sprite = new Sprite(this.tex.soldierStand);
          sprite.anchor.set(0.5, 1);
          sprite.tint = RING_TINT[id];
          this.defenderLayer.addChild(sprite);
          line.defenders.push({
            sprite,
            baseX: cx + ((i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 5)),
            y: this.laneY(lane, g),
            scale: this.laneScale(lane, g),
            phase: i * 1.3,
          });
        }
      }
      const isFiring = this.firing[id];
      for (const d of line.defenders) {
        const breathe = Math.sin(this.time * 2 + d.phase) * 0.02;
        d.sprite.position.set(d.baseX, d.y);
        d.sprite.scale.set(d.scale, d.scale * (1 + breathe));
        d.sprite.texture = isFiring
          ? this.tex.soldierFire
          : Math.floor(this.time * 1.5 + d.phase) % 2 === 0
            ? this.tex.soldierStand
            : this.tex.soldierHold;
      }
    }
  }

  private computeFiring(state: SimState, g: ReturnType<SideRenderer['geo']>, dt: number): void {
    const tg = this.tracerGfx.clear();
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      this.firing[id] = false;
      if (ring.status !== 'active' || ring.level <= 0) continue;
      const band = this.cfg.rings[id].band;
      let target: Enemy | null = null;
      for (const e of state.enemies) {
        if (e.radius <= band.outer && e.radius > band.inner) {
          if (!target || e.radius < target.radius) target = e;
        }
      }
      this.fireClock[id] += dt;
      if (!target) continue;
      this.firing[id] = true;

      const line = this.lines[id];
      if (!line.defenders.length) continue;
      const shooter = line.defenders[0];
      const sx = shooter.baseX + 10 * shooter.scale;
      const sy = shooter.y - 46 * shooter.scale;
      const tv = this.enemyView(target);
      const tx = this.xForRadius(target.radius, g);
      const ty = (tv ? tv.sprite.y : this.laneY(1, g)) - 30 * (tv ? this.laneScale(tv.lane, g) : 1);
      if (this.fireClock[id] % 0.16 < 0.07) {
        tg.moveTo(sx, sy).lineTo(tx, ty).stroke({ width: 1.6, color: COL.tracer, alpha: 0.85 });
        tg.circle(sx, sy, 3).fill({ color: COL.muzzle, alpha: 0.9 });
      }
    }
  }

  private enemyView(e: Enemy): EnemyView | undefined {
    return this.enemies.get(e.id);
  }

  private drawLines(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const lg = this.lineGfx.clear();
    for (const id of RING_ORDER) {
      const ring = state.rings[id];
      if (ring.level <= 0) continue;
      const x = this.xForRadius(LINE_RADIUS[id], g);
      const y = this.laneY(NLANES - 1, g);
      const down = ring.status === 'down';
      const flash = this.ringFlash[id] ?? 0;
      if (down) {
        // wrecked barricade
        lg.roundRect(x - 14, y - 8, 28, 8, 2).fill(COL.wreck);
        lg.moveTo(x - 10, y - 8).lineTo(x + 6, y - 20).stroke({ width: 2, color: COL.wreck, alpha: 0.8 });
      } else {
        // stacked sandbags
        for (let i = 0; i < 3; i++) {
          lg.roundRect(x - 15 + i * 10, y - 9, 11, 7, 2).fill(i % 2 ? COL.sandbagDark : COL.sandbag);
          lg.roundRect(x - 10 + i * 10, y - 15, 11, 7, 2).fill(i % 2 ? COL.sandbag : COL.sandbagDark);
        }
        if (flash > 0) lg.roundRect(x - 16, y - 16, 34, 16, 3).fill({ color: 0xffffff, alpha: flash * 0.6 });
      }
    }
  }

  private syncEnemies(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const alive = new Set<number>();
    for (const e of state.enemies) {
      alive.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const skin: 'zombie' | 'raider' = e.id % 2 === 0 ? 'zombie' : 'raider';
        const sprite = new Sprite(skin === 'zombie' ? this.tex.zombieWalk1 : this.tex.raiderWalk1);
        sprite.anchor.set(0.5, 1);
        this.enemyLayer.addChild(sprite);
        v = { sprite, lane: e.id % NLANES, phase: e.id * 0.9, skin };
        this.enemies.set(e.id, v);
      }
      const sc = this.laneScale(v.lane, g);
      v.sprite.position.set(this.xForRadius(e.radius, g), this.laneY(v.lane, g));
      // face left (toward the FOB) → mirror horizontally
      v.sprite.scale.set(-sc, sc);
      // 2-frame walk cycle
      const frame = Math.floor(this.time * 7 + v.phase) % 2;
      v.sprite.texture =
        v.skin === 'zombie'
          ? frame === 0
            ? this.tex.zombieWalk1
            : this.tex.zombieWalk2
          : frame === 0
            ? this.tex.raiderWalk1
            : this.tex.raiderWalk2;
      v.sprite.tint = COL.hostile;
      v.sprite.alpha = 0.65 + 0.35 * (e.hp / e.maxHp);
    }
    for (const [id, v] of this.enemies) {
      if (!alive.has(id)) {
        v.sprite.destroy();
        this.enemies.delete(id);
      }
    }
  }

  private spawnExplosion(x: number, y: number): void {
    const gfx = new Graphics();
    gfx.star(0, 0, 7, 10, 5).fill(COL.explosion);
    gfx.circle(0, 0, 5).fill(0xffffff);
    gfx.position.set(x, y);
    gfx.scale.set(0.1);
    this.fxLayer.addChild(gfx);
    this.explosions.push({ g: gfx, age: 0, life: 0.4 });
  }

  private spawnPopup(x: number, y: number, text: string, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 15, fontWeight: '700', fontFamily: 'monospace' } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    this.popups.push({ t, age: 0, life: 0.9 });
  }

  private processEvents(events: SimEvent[], g: ReturnType<SideRenderer['geo']>): void {
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const x = this.xForRadius(e.radius, g);
          const y = this.laneY(1, g) - 30;
          this.spawnExplosion(x, y);
          this.spawnPopup(x, y, `+${Math.round(e.bounty)}`, COL.supply);
          break;
        }
        case 'breach':
          this.ringFlash[e.ring] = 1;
          this.shake = Math.max(this.shake, 7);
          break;
        case 'fullBreach':
          this.shake = Math.max(this.shake, 18);
          this.spawnPopup(g.fobW + 30, g.h * 0.4, 'OVERRUN', COL.breach);
          break;
        default:
          break;
      }
    }
    events.length = 0;
  }

  private updateFx(dt: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const k = ex.age / ex.life;
      ex.g.scale.set(0.3 + k * 1.8);
      ex.g.rotation += dt * 6;
      ex.g.alpha = Math.max(0, 1 - k);
      if (ex.age >= ex.life) {
        ex.g.destroy();
        this.explosions.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      p.t.position.y -= dt * 34;
      p.t.alpha = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        p.t.destroy();
        this.popups.splice(i, 1);
      }
    }
    for (const id of RING_ORDER) {
      if (this.ringFlash[id]) this.ringFlash[id] = Math.max(0, (this.ringFlash[id] ?? 0) - dt * 3);
    }
    if (this.shake > 0.1) {
      this.world.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.max(0, 1 - dt * 6);
    } else {
      this.world.position.set(0, 0);
      this.shake = 0;
    }
  }

  draw(state: SimState, fx: SimEvent[], dt: number): void {
    this.time += dt;
    const g = this.geo();
    this.drawBackground(g);
    this.rebuildFob(g);
    this.computeFiring(state, g, dt); // sets this.firing + tracers
    this.syncDefenders(state, g);
    this.drawLines(state, g);
    this.processEvents(fx, g);
    this.syncEnemies(state, g);
    this.updateFx(dt);
  }

  destroy(): void {
    for (const v of this.enemies.values()) v.sprite.destroy();
    this.enemies.clear();
    this.world.destroy({ children: true });
  }
}
