/**
 * SideRenderer.ts — side-view renderer for "The Line".
 *
 * Reads the same SimState the engine advances. The FOB sits far left; just in
 * front of it stands the single defended WALL (with an HP bar). Your soldiers
 * hold the wall and fire right; enemies advance from the right, pile at the wall
 * and shoot it. Fire Support strikes land as a burst across the front. All art
 * is CC0 cartoon sprites (see assets.ts) over code-drawn terrain/wall/FX.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Enemy, GameConfig, SimEvent, SimState } from '../../sim';
import type { TextureMap } from './assets';

const NLANES = 4;

interface Soldier {
  sprite: Sprite;
  lane: number;
  phase: number;
  dx: number;
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
  wallFill: 0xcaa96a,
  wallDark: 0x8a6d3a,
  wallWreck: 0x6b5a44,
  fobWall: 0xc7a86a,
  fobDark: 0x8a6d3a,
  hpGood: 0x5fe08a,
  hpMid: 0xe8c54a,
  hpLow: 0xe5533c,
  hpBack: 0x241c10,
  tracer: 0xffd166,
  muzzle: 0xffe9a3,
  enemyMuzzle: 0xff8a5c,
  explosion: 0xffd25c,
  supply: 0x8fe8b0,
  strike: 0xffce54,
  hostile: 0xffc2b0,
} as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SideRenderer {
  private readonly world = new Container();
  private readonly bgGfx = new Graphics();
  private readonly fob = new Container();
  private readonly wallGfx = new Graphics();
  private readonly enemyLayer = new Container();
  private readonly soldierLayer = new Container();
  private readonly tracerGfx = new Graphics();
  private readonly hpGfx = new Graphics();
  private readonly fxLayer = new Container();

  private readonly tex: TextureMap;
  private soldiers: Soldier[] = [];
  private soldierSig = '';
  private fobSig = '';

  private readonly enemies = new Map<number, EnemyView>();
  private readonly explosions: Explosion[] = [];
  private readonly popups: Popup[] = [];

  private time = 0;
  private shake = 0;
  private wallFlash = 0;
  private soldierFireClock = 0;

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
      this.enemyLayer,
      this.wallGfx,
      this.soldierLayer,
      this.tracerGfx,
      this.hpGfx,
      this.fxLayer,
    );
    stage.addChild(this.world);
  }

  private geo() {
    const w = this.screen.width;
    const h = this.screen.height;
    const fobW = Math.min(Math.max(w * 0.18, 60), 118);
    const wallX = fobW + 14;
    const standoff = 18;
    const frontX = wallX + standoff; // where engaged enemies stand (pos = 0)
    const laneRight = w - 6;
    const horizon = h * 0.46;
    const unitH = Math.min(Math.max(h * 0.12, 32), 76);
    return { w, h, fobW, wallX, frontX, laneRight, laneSpan: laneRight - frontX, horizon, unitH };
  }

  private enemyX(pos: number, g: ReturnType<SideRenderer['geo']>): number {
    return g.frontX + Math.max(0, Math.min(1, pos)) * g.laneSpan;
  }
  private laneY(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    return lerp(g.h * 0.6, g.h * 0.95, lane / (NLANES - 1));
  }
  private laneScale(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    return (g.unitH / 110) * lerp(0.72, 1.08, lane / (NLANES - 1));
  }

  private drawBackground(g: ReturnType<SideRenderer['geo']>): void {
    const bg = this.bgGfx.clear();
    bg.rect(0, 0, g.w, g.horizon).fill(COL.skyTop);
    bg.rect(0, g.horizon * 0.5, g.w, g.horizon * 0.5).fill({ color: COL.skyBot, alpha: 0.5 });
    bg.circle(g.w * 0.8, g.horizon * 0.5, g.h * 0.06).fill({ color: COL.sun, alpha: 0.85 });
    const drift = (this.time * 4) % g.w;
    for (let i = 0; i < 3; i++) {
      const y = g.horizon - 6 + i * 4;
      const amp = 10 + i * 4;
      bg.moveTo(0, g.horizon);
      for (let x = -drift; x <= g.w; x += 40) bg.lineTo(x, y - Math.sin((x + i * 30) * 0.02) * amp);
      bg.lineTo(g.w, g.horizon).lineTo(0, g.horizon).closePath().fill({ color: i < 2 ? COL.duneFar : COL.duneNear, alpha: 0.5 });
    }
    bg.rect(0, g.horizon, g.w, g.h - g.horizon).fill(COL.ground);
    bg.rect(0, g.horizon, g.w, 4).fill(COL.groundDark);
    for (let i = 0; i < NLANES; i++) bg.rect(0, this.laneY(i, g), g.w, 1).fill({ color: COL.groundDark, alpha: 0.12 });
  }

  private rebuildFob(g: ReturnType<SideRenderer['geo']>): void {
    const sig = `${Math.round(g.fobW)}|${Math.round(g.h)}`;
    if (sig === this.fobSig) return;
    this.fobSig = sig;
    this.fob.removeChildren().forEach((c) => c.destroy());
    const base = this.laneY(NLANES - 1, g);
    const bw = g.fobW * 0.9;
    const bh = g.h * 0.28;
    const x0 = 2;
    const gfx = new Graphics();
    gfx.ellipse(x0 + bw / 2, base, bw * 0.6, 9).fill({ color: 0x000000, alpha: 0.3 });
    gfx.roundRect(x0, base - bh, bw, bh, 6).fill(COL.fobWall);
    gfx.roundRect(x0, base - bh, bw, bh, 6).stroke({ width: 3, color: COL.fobDark });
    for (let i = 0; i < 3; i++) gfx.roundRect(x0 + 4 + i * (bw - 10) / 3, base - bh - 7, (bw - 10) / 3 - 3, 10, 2).fill(COL.sandbag);
    gfx.rect(x0 + bw * 0.5 - 1, base - bh - 32, 2, 28).fill(COL.fobDark);
    gfx.moveTo(x0 + bw * 0.5 + 1, base - bh - 32).lineTo(x0 + bw * 0.5 + 18, base - bh - 27).lineTo(x0 + bw * 0.5 + 1, base - bh - 22).closePath().fill(0x5fb0e6);
    this.fob.addChild(gfx);
  }

  private drawWall(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const down = state.barrier.hp <= 0;
    const groundY = this.laneY(NLANES - 1, g);
    const topY = g.h * 0.55;
    const wg = this.wallGfx.clear();
    const x = g.wallX;
    if (down) {
      // rubble
      for (let i = 0; i < 5; i++) wg.roundRect(x - 7 + (i % 2) * 6, groundY - 6 - (i % 3) * 4, 12, 7, 2).fill(COL.wallWreck);
    } else {
      wg.roundRect(x - 9, topY, 18, groundY - topY, 3).fill(COL.wallFill);
      wg.roundRect(x - 9, topY, 18, groundY - topY, 3).stroke({ width: 2, color: COL.wallDark });
      // sandbag crenellations
      for (let i = 0; i < 3; i++) wg.roundRect(x - 10, topY - 6 + i * 2, 20, 6, 2).fill(i % 2 ? COL.sandbag : COL.sandbagDark);
      if (this.wallFlash > 0) wg.roundRect(x - 11, topY - 8, 22, groundY - topY + 10, 4).fill({ color: 0xffffff, alpha: this.wallFlash * 0.5 });
    }

    // HP bar above the wall
    const barW = Math.max(40, g.fobW * 0.8);
    const barH = 6;
    const bx = x - barW / 2;
    const by = topY - 20;
    const pct = state.barrier.maxHp > 0 ? Math.max(0, state.barrier.hp / state.barrier.maxHp) : 0;
    const col = pct > 0.5 ? COL.hpGood : pct > 0.25 ? COL.hpMid : COL.hpLow;
    const hg = this.hpGfx.clear();
    hg.roundRect(bx - 1, by - 1, barW + 2, barH + 2, 2).fill(COL.hpBack);
    hg.roundRect(bx, by, barW * pct, barH, 2).fill(col);
    hg.roundRect(bx, by, barW, barH, 2).stroke({ width: 1, color: COL.wallDark, alpha: 0.8 });
  }

  private syncSoldiers(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const count = Math.min(8, 2 + Math.ceil(state.firepowerLevel / 1.5));
    const sig = `${count}|${Math.round(g.fobW)}|${Math.round(g.h)}`;
    if (sig !== this.soldierSig) {
      for (const s of this.soldiers) s.sprite.destroy();
      this.soldiers = [];
      this.soldierSig = sig;
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(this.tex.soldierStand);
        sprite.anchor.set(0.5, 1);
        this.soldierLayer.addChild(sprite);
        this.soldiers.push({ sprite, lane: i % NLANES, phase: i * 1.3, dx: -10 - (i % 3) * 6 });
      }
    }
    const firing = state.enemies.length > 0;
    for (const s of this.soldiers) {
      const sc = this.laneScale(s.lane, g);
      s.sprite.position.set(g.wallX + s.dx, this.laneY(s.lane, g));
      s.sprite.scale.set(sc, sc * (1 + Math.sin(this.time * 2 + s.phase) * 0.02));
      s.sprite.texture = firing
        ? this.tex.soldierFire
        : Math.floor(this.time * 1.5 + s.phase) % 2 === 0
          ? this.tex.soldierStand
          : this.tex.soldierHold;
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
      v.sprite.position.set(this.enemyX(e.pos, g), this.laneY(v.lane, g));
      v.sprite.scale.set(-sc, sc); // face left
      const frame = e.engaging ? 0 : Math.floor(this.time * 7 + v.phase) % 2;
      v.sprite.texture =
        v.skin === 'zombie'
          ? frame === 0 ? this.tex.zombieWalk1 : this.tex.zombieWalk2
          : frame === 0 ? this.tex.raiderWalk1 : this.tex.raiderWalk2;
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

  private drawFiring(state: SimState, dt: number, g: ReturnType<SideRenderer['geo']>): void {
    const tg = this.tracerGfx.clear();
    this.soldierFireClock += dt;
    const on = this.soldierFireClock % 0.16 < 0.07;

    // soldiers -> frontmost enemy
    if (state.enemies.length && this.soldiers.length) {
      let front: Enemy | null = null;
      for (const e of state.enemies) if (!front || e.pos < front.pos) front = e;
      if (front && on) {
        const shooter = this.soldiers[0];
        const sx = shooter.sprite.position.x + 8;
        const sy = shooter.sprite.position.y - 44 * this.laneScale(shooter.lane, g);
        const v = this.enemies.get(front.id);
        const tx = this.enemyX(front.pos, g);
        const ty = (v ? v.sprite.y : this.laneY(1, g)) - 28 * (v ? this.laneScale(v.lane, g) : 1);
        tg.moveTo(sx, sy).lineTo(tx, ty).stroke({ width: 1.6, color: COL.tracer, alpha: 0.85 });
        tg.circle(sx, sy, 3).fill({ color: COL.muzzle, alpha: 0.9 });
      }
    }

    // engaged enemies -> wall (muzzle flashes toward the wall)
    if (state.barrier.hp > 0) {
      const wallHitX = g.wallX + 6;
      const wallHitY = g.h * 0.72;
      for (const e of state.enemies) {
        if (!e.engaging) continue;
        const v = this.enemies.get(e.id);
        if (!v) continue;
        if ((this.soldierFireClock + v.phase) % 0.22 < 0.06) {
          const ex = v.sprite.x - 6;
          const ey = v.sprite.y - 28 * this.laneScale(v.lane, g);
          tg.moveTo(ex, ey).lineTo(wallHitX, wallHitY).stroke({ width: 1.2, color: COL.enemyMuzzle, alpha: 0.6 });
          tg.circle(ex, ey, 2.4).fill({ color: COL.enemyMuzzle, alpha: 0.8 });
        }
      }
    }
  }

  private spawnExplosion(x: number, y: number, scale = 1): void {
    const gfx = new Graphics();
    gfx.star(0, 0, 7, 10, 5).fill(COL.explosion);
    gfx.circle(0, 0, 5).fill(0xffffff);
    gfx.position.set(x, y);
    gfx.scale.set(0.1 * scale);
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
          const x = this.enemyX(e.pos, g);
          const y = this.laneY(1, g) - 28;
          this.spawnExplosion(x, y);
          this.spawnPopup(x, y, `+${Math.round(e.bounty)}`, COL.supply);
          break;
        }
        case 'wallBroken':
          this.shake = Math.max(this.shake, 16);
          this.spawnPopup(g.wallX, g.h * 0.5, 'WALL DOWN', COL.hpLow);
          break;
        case 'wallRepaired':
          this.spawnPopup(g.wallX, g.h * 0.5, 'WALL UP', COL.hpGood);
          break;
        case 'fireSupport': {
          this.shake = Math.max(this.shake, 20);
          this.spawnPopup(g.frontX + g.laneSpan * 0.25, g.h * 0.42, 'STRIKE', COL.strike);
          const bandRight = this.enemyX(this.cfg.fireSupport.radius, g);
          for (let i = 0; i < 6; i++) {
            const x = lerp(g.frontX, bandRight, i / 5) + (Math.random() - 0.5) * 20;
            const y = this.laneY(1 + (i % 3), g) - 20;
            this.spawnExplosion(x, y, 1.6);
          }
          break;
        }
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
      ex.g.scale.set((0.3 + k * 1.8) * (ex.g.scale.x < 0 ? -1 : 1));
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
    if (this.wallFlash > 0) this.wallFlash = Math.max(0, this.wallFlash - dt * 3);
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
    if (state.enemies.some((e) => e.engaging) && state.barrier.hp > 0) this.wallFlash = Math.max(this.wallFlash, 0.25);
    const g = this.geo();
    this.drawBackground(g);
    this.rebuildFob(g);
    this.syncEnemies(state, g);
    this.drawWall(state, g);
    this.syncSoldiers(state, g);
    this.drawFiring(state, dt, g);
    this.processEvents(fx, g);
    this.updateFx(dt);
  }

  destroy(): void {
    for (const v of this.enemies.values()) v.sprite.destroy();
    this.enemies.clear();
    for (const s of this.soldiers) s.sprite.destroy();
    this.world.destroy({ children: true });
  }
}
