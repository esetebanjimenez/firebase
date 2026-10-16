/**
 * IsoRenderer.ts — isometric renderer for "The Line".
 *
 * An isometric grass field (2:1 diamond tiles) with a 3/4 wall rampart + tower +
 * gate, the FOB keep behind it, a garrison of 3/4 soldiers firing right, and
 * enemies (raiders / brutes) advancing from the right to shoot the wall. Depth
 * is handled by y-sorting everything in a single scene container. Reads the same
 * SimState the engine advances — no sim/balance change.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Enemy, GameConfig, SimEvent, SimState } from '../../sim';
import { ISO_CHAR_ANCHOR_Y, type TextureMap } from './isoAssets';

const NLANES = 4;

interface Soldier { sprite: Sprite; gx: number; gy: number; scale: number; phase: number }
interface EnemyView { sprite: Sprite; lane: number; phase: number; skin: 'A' | 'B' }
interface Anim { sprite: Sprite; frames: string[]; age: number; life: number }
interface Popup { t: Text; age: number; life: number }

const HP = { back: 0x1f2a14, good: 0x7fe05a, mid: 0xe8c54a, low: 0xe5533c, edge: 0x2c3a1c };
const TRACER = 0xffd166;
const ENEMY_TRACER = 0xff8a5c;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class IsoRenderer {
  private readonly world = new Container();
  private readonly ground = new Container();
  private readonly scene = new Container(); // y-sorted: wall, fob, props, soldiers, enemies
  private readonly tracerGfx = new Graphics();
  private readonly hpGfx = new Graphics();
  private readonly fxLayer = new Container();

  private readonly tex: TextureMap;
  private groundSig = '';
  private propsSig = '';
  private wallSig = '';
  private soldierSig = '';

  private wallSprites: Sprite[] = [];
  private fobSprite: Sprite | null = null;
  private props: Sprite[] = [];
  private soldiers: Soldier[] = [];

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
    this.scene.sortableChildren = true;
    this.world.addChild(this.ground, this.scene, this.tracerGfx, this.hpGfx, this.fxLayer);
    stage.addChild(this.world);
  }

  private geo() {
    const w = this.screen.width;
    const h = this.screen.height;

    // ONE uniform world scale for every asset (tiles, walls, FOB, props,
    // characters), so proportions match how the art was drawn — like GER, where
    // a person is small next to the wall. A big, long rampart dominates the fort.
    const S = (h * 0.26) / 384;
    const HW = S * 128; // iso tile half-width step (tile width = 256*S)
    const HH = HW / 2;
    const ox = w * 0.5;
    const oy = -HH * 2;

    // Characters a touch smaller than structures (GER proportion).
    const charBase = S * 0.72;
    const unitH = charBase * 256; // character on-screen height (for pixel offsets)

    const wallScale = S;
    const wsegW = 256 * S;
    const wallBottomX = w * 0.18;
    const wallBottomY = h * 0.78;
    const segDX = wsegW * 0.52;
    const segDY = wsegW * 0.26;
    const numSeg = 6; // long rampart line
    const frontX = wallBottomX + wsegW * 0.5 + 10;
    const laneRight = w - 6;

    return {
      w, h, HW, HH, ox, oy, unitH,
      wallScale, wsegW, wallBottomX, wallBottomY, segDX, segDY, numSeg,
      frontX, laneRight, laneSpan: Math.max(40, laneRight - frontX),
      fobScale: S,
    };
  }

  private enemyX(pos: number, g: ReturnType<IsoRenderer['geo']>): number {
    return g.frontX + Math.max(0, Math.min(1, pos)) * g.laneSpan;
  }
  private laneY(lane: number, g: ReturnType<IsoRenderer['geo']>): number {
    return lerp(g.h * 0.56, g.h * 0.82, lane / (NLANES - 1));
  }
  private laneScale(lane: number, g: ReturnType<IsoRenderer['geo']>): number {
    return (g.unitH / 256) * lerp(0.84, 1.12, lane / (NLANES - 1));
  }

  /** Lay the iso grass field (cached; rebuilt on resize). */
  private buildGround(g: ReturnType<IsoRenderer['geo']>): void {
    const sig = `${Math.round(g.w)}x${Math.round(g.h)}x${Math.round(g.HW)}`;
    if (sig === this.groundSig) return;
    this.groundSig = sig;
    this.ground.removeChildren().forEach((c) => c.destroy());
    const scale = g.HW / 128;
    const rng = makeRng(0x9e37);
    const sMax = Math.ceil((g.h - g.oy) / g.HH) + 2;
    const dMax = Math.ceil(g.w / g.HW) + 2;
    for (let s = 0; s <= sMax; s++) {
      for (let d = -dMax; d <= dMax; d++) {
        if (((s + d) & 1) !== 0) continue; // parity: valid lattice point
        const sx = g.ox + d * g.HW;
        const sy = g.oy + s * g.HH;
        if (sx < -g.HW || sx > g.w + g.HW || sy < -g.HH || sy > g.h + g.HH) continue;
        const r = rng();
        const name = r < 0.22 ? 'tile_grass_2' : 'tile_grass';
        const t = new Sprite(this.tex[name]);
        t.anchor.set(0.5, 0.5);
        t.scale.set(scale);
        t.position.set(sx, sy);
        this.ground.addChild(t);
      }
    }
  }

  /** Scatter trees/bushes on the back/edges (cached). */
  private buildProps(g: ReturnType<IsoRenderer['geo']>): void {
    const sig = `${Math.round(g.w)}x${Math.round(g.h)}`;
    if (sig === this.propsSig) return;
    this.propsSig = sig;
    for (const p of this.props) p.destroy();
    this.props = [];
    const rng = makeRng(0x1234);
    const kinds = ['prop_tree_1', 'prop_tree_2', 'prop_bush', 'prop_rock', 'prop_grass_tuft'];
    const n = Math.round(g.w / 48);
    for (let i = 0; i < n; i++) {
      const name = kinds[Math.floor(rng() * kinds.length)];
      const x = rng() * g.w;
      const y = lerp(g.h * 0.3, g.h * 0.92, rng());
      // keep trees out of the active lane band
      if (y > g.h * 0.52 && y < g.h * 0.86 && x > g.frontX - 20) continue;
      const sp = new Sprite(this.tex[name]);
      sp.anchor.set(0.5, 1);
      const sc = (g.unitH / 128) * (0.5 + 0.5 * (y / g.h));
      sp.scale.set(sc);
      sp.position.set(x, y);
      sp.zIndex = y - 1;
      this.scene.addChild(sp);
      this.props.push(sp);
    }
  }

  private buildWall(g: ReturnType<IsoRenderer['geo']>): void {
    const sig = `${Math.round(g.w)}x${Math.round(g.h)}|${g.numSeg}`;
    if (sig === this.wallSig) return;
    this.wallSig = sig;
    for (const s of this.wallSprites) s.destroy();
    this.wallSprites = [];
    if (this.fobSprite) this.fobSprite.destroy();

    // FOB keep behind the wall (upper-left)
    const fob = new Sprite(this.tex.fob);
    fob.anchor.set(0.5, 1);
    fob.scale.set(g.fobScale);
    fob.position.set(g.wallBottomX - g.wsegW * 0.4, g.wallBottomY - g.segDY * (g.numSeg + 0.6));
    fob.zIndex = fob.position.y;
    this.scene.addChild(fob);
    this.fobSprite = fob;

    // Rampart: segments stepping up-right, a gate in the middle, a tower on the far end.
    for (let i = 0; i < g.numSeg; i++) {
      const isGate = i === Math.floor(g.numSeg / 2);
      const s = new Sprite(this.tex[isGate ? 'wall_gate' : 'wall_intact']);
      s.anchor.set(0.5, 1);
      s.scale.set(g.wallScale);
      s.position.set(g.wallBottomX + i * g.segDX, g.wallBottomY - i * g.segDY);
      s.zIndex = s.position.y;
      (s as Sprite & { _gate?: boolean })._gate = isGate;
      this.scene.addChild(s);
      this.wallSprites.push(s);
    }
    const tower = new Sprite(this.tex.wall_tower);
    tower.anchor.set(0.5, 1);
    tower.scale.set(g.wallScale);
    tower.position.set(g.wallBottomX + g.numSeg * g.segDX, g.wallBottomY - g.numSeg * g.segDY);
    tower.zIndex = tower.position.y;
    this.scene.addChild(tower);
    this.wallSprites.push(tower);
  }

  private updateWallState(state: SimState): void {
    const pct = state.barrier.maxHp > 0 ? state.barrier.hp / state.barrier.maxHp : 0;
    const base = pct > 0.5 ? 'wall_intact' : pct > 0 ? 'wall_damaged' : 'wall_broken';
    for (const s of this.wallSprites) {
      const gate = (s as Sprite & { _gate?: boolean })._gate;
      if (s.texture === this.tex.wall_tower) continue; // tower keeps its look
      if (gate && base === 'wall_intact') s.texture = this.tex.wall_gate;
      else s.texture = this.tex[base];
    }
  }

  private drawHpBar(state: SimState, g: ReturnType<IsoRenderer['geo']>): void {
    const pct = state.barrier.maxHp > 0 ? Math.max(0, state.barrier.hp / state.barrier.maxHp) : 0;
    const cx = g.wallBottomX + (g.numSeg * g.segDX) / 2;
    const topY = g.wallBottomY - g.numSeg * g.segDY - 384 * g.wallScale - 8;
    const barW = Math.max(60, g.numSeg * g.segDX + g.wsegW * 0.5);
    const barH = 6;
    const bx = cx - barW / 2;
    const col = pct > 0.5 ? HP.good : pct > 0.25 ? HP.mid : HP.low;
    const hg = this.hpGfx.clear();
    hg.roundRect(bx - 1, topY - 1, barW + 2, barH + 2, 2).fill(HP.back);
    hg.roundRect(bx, topY, barW * pct, barH, 2).fill(col);
    hg.roundRect(bx, topY, barW, barH, 2).stroke({ width: 1, color: HP.edge, alpha: 0.8 });
  }

  private syncSoldiers(state: SimState, g: ReturnType<IsoRenderer['geo']>): void {
    // Fan the garrison evenly along the full rampart crest, in two shallow rows.
    const count = Math.min(16, Math.max(5, g.numSeg + state.firepowerLevel));
    const sig = `${count}|${Math.round(g.w)}x${Math.round(g.h)}`;
    if (sig !== this.soldierSig) {
      for (const s of this.soldiers) s.sprite.destroy();
      this.soldiers = [];
      this.soldierSig = sig;
      const crestLift = 384 * g.wallScale * 0.52; // up to the walkway
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(this.tex.soldier_idle_1);
        sprite.anchor.set(0.5, ISO_CHAR_ANCHOR_Y);
        this.scene.addChild(sprite);
        const u = (i + 0.6) / count; // position along the wall, 0..1
        const row = i % 2;
        this.soldiers.push({
          sprite,
          gx: g.wallBottomX + u * g.numSeg * g.segDX + (row ? g.segDX * 0.28 : 0),
          gy: g.wallBottomY - u * g.numSeg * g.segDY - crestLift + row * g.unitH * 0.14,
          scale: (g.unitH / 256) * (0.92 - row * 0.04),
          phase: i * 1.1,
        });
      }
    }
    const firing = state.enemies.length > 0;
    for (const s of this.soldiers) {
      s.sprite.position.set(s.gx, s.gy);
      s.sprite.scale.set(s.scale);
      s.sprite.zIndex = s.gy + 1000; // draw above the wall
      s.sprite.texture = firing
        ? (this.time * 6 + s.phase) % 1 < 0.5 ? this.tex.soldier_fire_1 : this.tex.soldier_fire_2
        : (this.time * 1.5 + s.phase) % 1 < 0.5 ? this.tex.soldier_idle_1 : this.tex.soldier_idle_2;
    }
  }

  private syncEnemies(state: SimState, g: ReturnType<IsoRenderer['geo']>): void {
    const alive = new Set<number>();
    for (const e of state.enemies) {
      alive.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const skin: 'A' | 'B' = e.id % 3 === 0 ? 'B' : 'A';
        const sprite = new Sprite(this.tex[skin === 'A' ? 'enemyA_walk_1' : 'enemyB_walk_1']);
        sprite.anchor.set(0.5, ISO_CHAR_ANCHOR_Y);
        this.scene.addChild(sprite);
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
      const y = this.laneY(v.lane, g);
      v.sprite.position.set(this.enemyX(e.pos, g) + recoil, y);
      v.sprite.scale.set(-sc, sc); // face left (mirror the front-right art)
      v.sprite.alpha = 0.72 + 0.28 * (e.hp / e.maxHp);
      v.sprite.zIndex = y;
    }
    for (const [id, v] of this.enemies) {
      if (!alive.has(id)) {
        v.sprite.destroy();
        this.enemies.delete(id);
      }
    }
  }

  private drawFiring(state: SimState, g: ReturnType<IsoRenderer['geo']>): void {
    const tg = this.tracerGfx.clear();
    const on = (this.time * 6) % 0.16 < 0.07;
    if (state.enemies.length && this.soldiers.length && on) {
      let front: Enemy | null = null;
      for (const e of state.enemies) if (!front || e.pos < front.pos) front = e;
      if (front) {
        const sh = this.soldiers[0];
        const sx = sh.gx + g.unitH * 0.3;
        const sy = sh.gy - g.unitH * 0.45;
        const v = this.enemies.get(front.id);
        const tx = this.enemyX(front.pos, g);
        const ty = (v ? v.sprite.y : this.laneY(1, g)) - g.unitH * 0.45;
        tg.moveTo(sx, sy).lineTo(tx, ty).stroke({ width: 1.6, color: TRACER, alpha: 0.8 });
      }
    }
    if (state.barrier.hp > 0) {
      const wx = g.frontX - 4;
      const wy = g.wallBottomY - 384 * g.wallScale * 0.4;
      for (const e of state.enemies) {
        if (!e.engaging) continue;
        const v = this.enemies.get(e.id);
        if (!v) continue;
        if ((this.time * 6 + v.phase) % 0.22 < 0.06) {
          const ex = v.sprite.x - 12 * this.laneScale(v.lane, g);
          const ey = v.sprite.y - g.unitH * 0.45;
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

  private processEvents(events: SimEvent[], g: ReturnType<IsoRenderer['geo']>): void {
    const ex = ['explosion_1', 'explosion_2', 'explosion_3', 'explosion_4', 'explosion_5', 'explosion_6'];
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const x = this.enemyX(e.pos, g);
          const y = this.laneY(1, g) - g.unitH * 0.4;
          this.playAnim(ex, x, y, g.unitH * 1.1, 0.42);
          this.spawnPopup(x, y, `+${Math.round(e.bounty)}`, HP.good);
          break;
        }
        case 'wallBroken':
          this.shake = Math.max(this.shake, 16);
          this.spawnPopup(g.wallBottomX + 20, g.h * 0.5, 'WALL DOWN', HP.low);
          break;
        case 'wallRepaired':
          this.spawnPopup(g.wallBottomX + 20, g.h * 0.5, 'WALL UP', HP.good);
          break;
        case 'fireSupport': {
          this.shake = Math.max(this.shake, 22);
          this.spawnPopup(g.frontX + g.laneSpan * 0.25, g.h * 0.42, 'STRIKE', 0xffce54);
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
    this.buildGround(g);
    this.buildWall(g);
    this.buildProps(g);
    this.updateWallState(state);
    this.drawHpBar(state, g);
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
