/**
 * SideRenderer.ts — side-view renderer for "The Line", using the bespoke sprite
 * set. Reads the live SimState (never mutates it): the FOB keep and a tiled WALL
 * rampart hold the left; a garrison lines the crest and fires right; enemies
 * advance from the right and halt at their range to shoot the wall. Terrain is
 * dressed with a far ridge, scattered rocks/shrubs and a vignette so the desert
 * doesn't read flat.
 */

import { Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import type { Enemy, GameConfig, SimEvent, SimState } from '../../sim';
import { CHAR_ANCHOR_Y, type TextureMap } from './assets';

const NLANES = 4;
const MAX_WALL_SEG = 5;

interface Soldier {
  sprite: Sprite;
  gx: number;
  gy: number;
  scale: number;
  phase: number;
}
interface EnemyView {
  sprite: Sprite;
  lane: number;
  phase: number;
  skin: 'A' | 'B';
}
interface Anim {
  sprite: Sprite;
  frames: string[];
  age: number;
  life: number;
}
interface Popup {
  t: Text;
  age: number;
  life: number;
}

const HP = { back: 0x241c10, good: 0x5fe08a, mid: 0xe8c54a, low: 0xe5533c, edge: 0x6b5a3a };
const TRACER = 0xffd166;
const ENEMY_TRACER = 0xff8a5c;
const DECOR = { ridge: 0x6b4a2c };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Tiny deterministic LCG for reproducible decor scatter. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class SideRenderer {
  private readonly world = new Container();
  private readonly sky: Sprite;
  private readonly ridgeGfx = new Graphics();
  private readonly dunesFar: TilingSprite;
  private readonly dunesNear: TilingSprite;
  private readonly ground: TilingSprite;
  private readonly decorGfx = new Graphics();
  private readonly fob: Sprite;
  private readonly wallGroup = new Container();
  private readonly wallSprites: Sprite[] = [];
  private readonly enemyLayer = new Container();
  private readonly soldierLayer = new Container();
  private readonly tracerGfx = new Graphics();
  private readonly hpGfx = new Graphics();
  private readonly fxLayer = new Container();
  private readonly vignette = new Graphics();

  private readonly tex: TextureMap;
  private soldiers: Soldier[] = [];
  private soldierSig = '';
  private decorSig = '';

  private readonly enemies = new Map<number, EnemyView>();
  private readonly anims: Anim[] = [];
  private readonly popups: Popup[] = [];

  private time = 0;
  private shake = 0;

  constructor(
    private readonly screen: { width: number; height: number },
    private readonly cfg: GameConfig,
    textures: TextureMap,
    stage: Container,
  ) {
    this.tex = textures;
    this.sky = new Sprite(textures.bg_sky);
    this.dunesFar = new TilingSprite({ texture: textures.bg_dunes_far, width: 10, height: 10 });
    this.dunesNear = new TilingSprite({ texture: textures.bg_dunes_near, width: 10, height: 10 });
    this.ground = new TilingSprite({ texture: textures.ground_tile, width: 10, height: 10 });
    this.fob = new Sprite(textures.fob);
    this.fob.anchor.set(0.5, 1);
    for (let i = 0; i < MAX_WALL_SEG; i++) {
      const s = new Sprite(textures.wall_intact);
      s.anchor.set(0.5, 1);
      s.visible = false;
      this.wallSprites.push(s);
      this.wallGroup.addChild(s);
    }

    this.world.addChild(
      this.sky,
      this.ridgeGfx,
      this.dunesFar,
      this.dunesNear,
      this.ground,
      this.decorGfx,
      this.fob,
      this.enemyLayer,
      this.wallGroup,
      this.soldierLayer,
      this.tracerGfx,
      this.fxLayer,
      this.hpGfx,
      this.vignette,
    );
    stage.addChild(this.world);
  }

  private geo() {
    const w = this.screen.width;
    const h = this.screen.height;
    const horizon = h * 0.5;
    const groundLine = h * 0.9;

    const fobH = h * 0.2;
    const fobScale = fobH / 640;
    const fobW = 512 * fobScale;
    const wallH = h * 0.26;
    const wallScale = wallH / 640;
    const wallSegW = 384 * wallScale;

    const fobX = Math.max(fobW * 0.42, 22);
    const step = wallSegW * 0.6;
    const wallFirst = fobX + fobW * 0.28 + wallSegW * 0.4; // center of the first segment
    const spanTarget = w * 0.42;
    const numSeg = Math.max(2, Math.min(MAX_WALL_SEG, Math.round(spanTarget / step)));
    const wallLeftX = wallFirst - wallSegW * 0.45;
    const wallRightX = wallFirst + (numSeg - 1) * step + wallSegW * 0.45;
    const wallMidX = (wallLeftX + wallRightX) / 2;
    const frontX = wallRightX + 8;
    const laneRight = w - 4;
    const unitH = Math.min(Math.max(h * 0.095, 30), 60);

    return {
      w, h, horizon, groundLine,
      fobX, fobScale, fobW,
      wallScale, wallSegW, wallFirst, step, numSeg, wallLeftX, wallRightX, wallMidX, wallH,
      frontX, laneRight, laneSpan: Math.max(40, laneRight - frontX), unitH,
    };
  }

  private enemyX(pos: number, g: ReturnType<SideRenderer['geo']>): number {
    return g.frontX + Math.max(0, Math.min(1, pos)) * g.laneSpan;
  }
  private laneY(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    return lerp(g.h * 0.68, g.groundLine, lane / (NLANES - 1));
  }
  private laneScale(lane: number, g: ReturnType<SideRenderer['geo']>): number {
    return (g.unitH / 512) * lerp(0.82, 1.12, lane / (NLANES - 1));
  }

  private drawBackground(g: ReturnType<SideRenderer['geo']>): void {
    this.sky.position.set(0, 0);
    this.sky.width = g.w;
    this.sky.height = g.h;

    const duneH = g.h * 0.2;
    for (const [d, speed, y] of [
      [this.dunesFar, 5, g.horizon - duneH + 14],
      [this.dunesNear, 11, g.horizon - duneH + 28],
    ] as const) {
      d.width = g.w;
      d.height = duneH;
      d.position.set(0, y);
      d.tileScale.set(duneH / 256);
      d.tilePosition.x = -(this.time * speed) % 256;
    }

    this.ground.position.set(0, g.horizon);
    this.ground.width = g.w;
    this.ground.height = g.h - g.horizon;
    this.ground.tileScale.set((g.h - g.horizon) / 256 / 1.8);
  }

  /** Far ridge + scattered rocks/shrubs + vignette. Cached; redrawn on resize. */
  private drawDecor(g: ReturnType<SideRenderer['geo']>): void {
    const sig = `${Math.round(g.w)}x${Math.round(g.h)}`;
    if (sig === this.decorSig) return;
    this.decorSig = sig;

    // far ridge just above the dune band
    const rg = this.ridgeGfx.clear();
    const ry = g.horizon - g.h * 0.2 + 6;
    rg.moveTo(0, g.horizon);
    for (let x = 0; x <= g.w; x += 26) rg.lineTo(x, ry - Math.sin(x * 0.015) * 10 - ((x * 7) % 13));
    rg.lineTo(g.w, g.horizon).closePath().fill({ color: DECOR.ridge, alpha: 0.45 });

    // scattered ground props
    const dg = this.decorGfx.clear();
    const rng = makeRng(0x51ab);
    const count = Math.round(g.w / 22);
    for (let i = 0; i < count; i++) {
      const x = rng() * g.w;
      const y = lerp(g.horizon + 8, g.h - 2, rng());
      const depth = (y - g.horizon) / (g.h - g.horizon);
      const s = (0.5 + depth) * (0.8 + rng() * 0.6);
      if (rng() < 0.62) {
        // rock cluster
        const r = 3 * s + rng() * 3 * s;
        dg.ellipse(x, y + r * 0.5, r * 1.1, r * 0.45).fill({ color: 0x000000, alpha: 0.18 });
        dg.ellipse(x, y, r, r * 0.8).fill(0x9a8562);
        dg.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.3).fill({ color: 0xc7b489, alpha: 0.9 });
      } else {
        // dry shrub
        const b = 4 * s;
        dg.ellipse(x, y + 1, b * 0.7, 1.4).fill({ color: 0x000000, alpha: 0.15 });
        for (let k = -2; k <= 2; k++) {
          dg.moveTo(x, y).lineTo(x + k * b * 0.3, y - b - Math.abs(k) * 0.5).stroke({ width: 1, color: 0x8a7a3a, alpha: 0.8 });
        }
      }
    }

    // vignette: darken the four edges
    const vg = this.vignette.clear();
    const m = Math.min(g.w, g.h) * 0.16;
    vg.rect(0, 0, g.w, m).fill({ color: 0x000000, alpha: 0.0 });
    for (let i = 0; i < 6; i++) {
      const a = 0.05 * (1 - i / 6);
      vg.rect(0, i * 2, g.w, 2).fill({ color: 0x000000, alpha: a });
      vg.rect(0, g.h - (i + 1) * 2, g.w, 2).fill({ color: 0x000000, alpha: a });
      vg.rect(i * 2, 0, 2, g.h).fill({ color: 0x000000, alpha: a });
      vg.rect(g.w - (i + 1) * 2, 0, 2, g.h).fill({ color: 0x000000, alpha: a });
    }
  }

  private drawProps(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    this.fob.scale.set(g.fobScale);
    this.fob.position.set(g.fobX, g.groundLine + 2);

    const pct = state.barrier.maxHp > 0 ? state.barrier.hp / state.barrier.maxHp : 0;
    const texName = pct > 0.5 ? 'wall_intact' : pct > 0 ? 'wall_damaged' : 'wall_broken';
    for (let i = 0; i < this.wallSprites.length; i++) {
      const s = this.wallSprites[i];
      if (i < g.numSeg) {
        s.visible = true;
        s.texture = this.tex[texName];
        s.scale.set(g.wallScale);
        s.position.set(g.wallFirst + i * g.step, g.groundLine + 2);
      } else {
        s.visible = false;
      }
    }

    // HP bar spanning the whole rampart
    const barW = Math.max(60, g.wallRightX - g.wallLeftX);
    const barH = 6;
    const bx = g.wallMidX - barW / 2;
    const yy = g.groundLine - g.wallH - 10;
    const col = pct > 0.5 ? HP.good : pct > 0.25 ? HP.mid : HP.low;
    const hg = this.hpGfx.clear();
    hg.roundRect(bx - 1, yy - 1, barW + 2, barH + 2, 2).fill(HP.back);
    hg.roundRect(bx, yy, barW * pct, barH, 2).fill(col);
    hg.roundRect(bx, yy, barW, barH, 2).stroke({ width: 1, color: HP.edge, alpha: 0.8 });
  }

  private syncSoldiers(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    // Garrison lines the full rampart crest: more with firepower, capped to fit.
    const count = Math.min(14, Math.max(4, g.numSeg * 2 + state.firepowerLevel));
    const sig = `${count}|${Math.round(g.h)}|${Math.round(g.wallLeftX)}|${Math.round(g.wallRightX)}`;
    const crestY = g.groundLine - g.wallH * 0.52;
    if (sig !== this.soldierSig) {
      for (const s of this.soldiers) s.sprite.destroy();
      this.soldiers = [];
      this.soldierSig = sig;
      const left = g.wallLeftX + 6;
      const span = Math.max(10, g.wallRightX - g.wallLeftX - 12);
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(this.tex.soldier_idle_1);
        sprite.anchor.set(0.5, CHAR_ANCHOR_Y);
        this.soldierLayer.addChild(sprite);
        const row = i % 2;
        const col = Math.floor(i / 2);
        const cols = Math.ceil(count / 2);
        const t = cols > 1 ? col / (cols - 1) : 0.5;
        this.soldiers.push({
          sprite,
          gx: left + t * span + (row ? span / cols / 2 : 0),
          gy: crestY + row * g.unitH * 0.12,
          scale: (g.unitH / 512) * (0.82 - row * 0.04),
          phase: i * 1.1,
        });
      }
    }
    const firing = state.enemies.length > 0;
    for (const s of this.soldiers) {
      s.sprite.position.set(s.gx, s.gy);
      s.sprite.scale.set(s.scale);
      if (firing) {
        s.sprite.texture = (this.time * 6 + s.phase) % 1 < 0.5 ? this.tex.soldier_fire_1 : this.tex.soldier_fire_2;
      } else {
        s.sprite.texture = (this.time * 1.5 + s.phase) % 1 < 0.5 ? this.tex.soldier_idle_1 : this.tex.soldier_idle_2;
      }
    }
  }

  private syncEnemies(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const alive = new Set<number>();
    for (const e of state.enemies) {
      alive.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const skin: 'A' | 'B' = e.id % 3 === 0 ? 'B' : 'A';
        const sprite = new Sprite(this.tex[skin === 'A' ? 'enemyA_walk_1' : 'enemyB_walk_1']);
        sprite.anchor.set(0.5, CHAR_ANCHOR_Y);
        this.enemyLayer.addChild(sprite);
        v = { sprite, lane: e.id % NLANES, phase: e.id * 0.7, skin };
        this.enemies.set(e.id, v);
      }
      const sc = this.laneScale(v.lane, g);
      const p = `enemy${v.skin}`;
      let recoil = 0;
      if (e.engaging) {
        const f2 = (this.time * 3.4 + v.phase) % 1 >= 0.5;
        v.sprite.texture = this.tex[`${p}_fire_${f2 ? 2 : 1}`];
        recoil = f2 ? 3 : 0;
      } else {
        const frame = 1 + (Math.floor(this.time * 8 + v.phase) % 4);
        v.sprite.texture = this.tex[`${p}_walk_${frame}`];
      }
      v.sprite.position.set(this.enemyX(e.pos, g) + recoil, this.laneY(v.lane, g));
      v.sprite.scale.set(-sc, sc);
      v.sprite.alpha = 0.7 + 0.3 * (e.hp / e.maxHp);
    }
    for (const [id, v] of this.enemies) {
      if (!alive.has(id)) {
        v.sprite.destroy();
        this.enemies.delete(id);
      }
    }
  }

  private drawFiring(state: SimState, g: ReturnType<SideRenderer['geo']>): void {
    const tg = this.tracerGfx.clear();
    const on = (this.time * 6) % 0.16 < 0.07;
    if (state.enemies.length && this.soldiers.length && on) {
      let front: Enemy | null = null;
      for (const e of state.enemies) if (!front || e.pos < front.pos) front = e;
      if (front) {
        const sh = this.soldiers[this.soldiers.length - 1]; // rightmost defender
        const sx = sh.sprite.position.x + g.unitH * 0.32;
        const sy = sh.sprite.position.y - g.unitH * 0.5;
        const v = this.enemies.get(front.id);
        const tx = this.enemyX(front.pos, g);
        const ty = (v ? v.sprite.y : this.laneY(1, g)) - g.unitH * 0.5;
        tg.moveTo(sx, sy).lineTo(tx, ty).stroke({ width: 1.6, color: TRACER, alpha: 0.8 });
      }
    }
    if (state.barrier.hp > 0) {
      const wx = g.wallRightX - 2;
      const wy = g.groundLine - g.wallH * 0.5;
      for (const e of state.enemies) {
        if (!e.engaging) continue;
        const v = this.enemies.get(e.id);
        if (!v) continue;
        if ((this.time * 6 + v.phase) % 0.22 < 0.06) {
          const ex = v.sprite.x - 12 * this.laneScale(v.lane, g);
          const ey = v.sprite.y - g.unitH * 0.5;
          tg.moveTo(ex, ey).lineTo(wx, wy).stroke({ width: 1.2, color: ENEMY_TRACER, alpha: 0.5 });
        }
      }
    }
  }

  private playAnim(frames: string[], x: number, y: number, size: number, life: number): void {
    const sprite = new Sprite(this.tex[frames[0]]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(size / this.tex[frames[0]].width);
    this.fxLayer.addChild(sprite);
    this.anims.push({ sprite, frames, age: 0, life });
  }
  private spawnPopup(x: number, y: number, text: string, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 14, fontWeight: '700', fontFamily: 'monospace' } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fxLayer.addChild(t);
    this.popups.push({ t, age: 0, life: 0.9 });
  }

  private processEvents(events: SimEvent[], g: ReturnType<SideRenderer['geo']>): void {
    const exFrames = ['explosion_1', 'explosion_2', 'explosion_3', 'explosion_4', 'explosion_5', 'explosion_6'];
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const x = this.enemyX(e.pos, g);
          const y = this.laneY(1, g) - g.unitH * 0.4;
          this.playAnim(exFrames, x, y, g.unitH * 1.1, 0.42);
          this.spawnPopup(x, y, `+${Math.round(e.bounty)}`, HP.good);
          break;
        }
        case 'wallBroken':
          this.shake = Math.max(this.shake, 16);
          this.spawnPopup(g.wallMidX, g.h * 0.44, 'WALL DOWN', HP.low);
          break;
        case 'wallRepaired':
          this.spawnPopup(g.wallMidX, g.h * 0.44, 'WALL UP', HP.good);
          break;
        case 'fireSupport': {
          this.shake = Math.max(this.shake, 22);
          this.spawnPopup(g.frontX + g.laneSpan * 0.25, g.h * 0.4, 'STRIKE', 0xffce54);
          const strike = ['airstrike_1', 'airstrike_2', 'airstrike_3', 'airstrike_4', 'airstrike_5', 'airstrike_6'];
          const bandRight = this.enemyX(this.cfg.fireSupport.radius, g);
          for (let i = 0; i < 4; i++) {
            const x = lerp(g.frontX, bandRight, i / 3) + (Math.random() - 0.5) * 16;
            const y = this.laneY(1 + (i % 3), g) - g.unitH * 0.2;
            this.playAnim(strike, x, y, g.unitH * 1.8, 0.55);
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
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.age += dt;
      const k = Math.min(0.999, a.age / a.life);
      a.sprite.texture = this.tex[a.frames[Math.floor(k * a.frames.length)]];
      a.sprite.alpha = a.age > a.life * 0.7 ? Math.max(0, 1 - (a.age - a.life * 0.7) / (a.life * 0.3)) : 1;
      if (a.age >= a.life) {
        a.sprite.destroy();
        this.anims.splice(i, 1);
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
    this.drawDecor(g);
    this.drawProps(state, g);
    this.syncEnemies(state, g);
    this.syncSoldiers(state, g);
    this.drawFiring(state, g);
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
