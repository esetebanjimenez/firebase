/**
 * Renderer.ts — draws a SimState as an 8-bit top-down battlefield.
 *
 * Everything is composed at the field's native resolution (192x240 "field
 * pixels", the same coordinates the simulation thinks in) into one offscreen
 * canvas, then blitted to the visible canvas with smoothing off. That single
 * upscale is what keeps the look pixel-exact: nothing in the pipeline ever
 * draws at a fraction of a pixel.
 *
 * The renderer owns no game state. It reads the sim, consumes the FX event
 * queue into short-lived particles, and keeps its own clock — so it can be
 * dropped, resized or re-created at any time without touching a battle.
 */

import { ENEMY_UNITS, PLAYER_UNITS, towerPeriod, uncoveredStrip } from '../sim';
import type { GameConfig, Hazard, SimEvent, SimState, Unit, UnitKindId, UnitMark } from '../sim';
import { PALETTE } from './palette';
import { drawGear } from './gear';
import { fieldLayout } from './layout';
import { createLayer, type Ramp } from './pixel';
import { unitSprites } from './sprites';
import { bakeTerrain, type TerrainLayer } from './terrain';

/**
 * A stable, well-mixed hash of a pixel position (and an optional step, for
 * effects that crawl). A raw xor of two multiplies correlates along the
 * diagonals and lays dithered patches down in stripes — which is exactly what
 * the first crater looked like, and what the burning ground looked like before
 * it was mixed properly. Learned twice; now it lives in one place.
 */
function hashPixel(x: number, y: number, step = 0): number {
  let h = (Math.imul((x | 0) + step * 31, 374761393) ^ Math.imul((y | 0) - step * 17, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

interface Corpse {
  readonly kind: UnitKindId;
  readonly x: number;
  readonly y: number;
  life: number;
  readonly maxLife: number;
}

interface Particle {
  kind: 'spark' | 'puff' | 'ring' | 'coin' | 'flash' | 'smoke' | 'blast' | 'shock' | 'ember';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/**
 * The mark a blast leaves on the ground.
 *
 * Drawn with the terrain rather than with the particles, because a crater is
 * under the fight: soldiers walk over it, bodies fall on it. It is also the
 * part of an explosion that is still there a second later, which is most of
 * what makes one feel like it happened.
 */
interface Scorch {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Baked once on impact: redrawing the stipple every frame cost thousands
   *  of pixel tests a crater, and a crater does not change shape. */
  readonly canvas: HTMLCanvasElement;
  life: number;
  readonly maxLife: number;
}

/** Per-frame extras the UI wants drawn on the field itself. */
export interface RenderOptions {
  /** Where the player is aiming an ability, in field coordinates. */
  readonly aim?: { x: number; y: number } | null;
  /** Blast radius to preview around the aim point. */
  readonly aimRadius?: number;
  /** True when the armed ability is ready to fire (otherwise the reticle greys). */
  readonly aimReady?: boolean;
}

export class Renderer {
  private readonly display: CanvasRenderingContext2D;
  private readonly field: CanvasRenderingContext2D;
  private readonly fieldCanvas: HTMLCanvasElement;
  private terrain: TerrainLayer;
  private particles: Particle[] = [];
  private scorches: Scorch[] = [];
  private corpses: Corpse[] = [];
  private shake = 0;
  private clock = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private cfg: GameConfig,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.display = ctx;
    const layer = createLayer(cfg.field.width, cfg.field.height);
    this.fieldCanvas = layer.canvas;
    this.field = layer.ctx;
    this.terrain = bakeTerrain(cfg);
  }

  /** Size the visible canvas to its box. Call on mount and on resize. */
  resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1): void {
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.display.imageSmoothingEnabled = false;
  }

  /**
   * Map a pointer position on the visible canvas to field coordinates, through
   * the same layout the blit uses — so a tap lands where the reticle is drawn.
   */
  toFieldCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const { width, height } = this.cfg.field;
    const layout = fieldLayout(this.canvas.width, this.canvas.height, width, height);
    return {
      x: ((clientX - rect.left) * dpr - layout.offsetX) / layout.scale,
      y: ((clientY - rect.top) * dpr - layout.offsetY) / layout.scale,
    };
  }

  /**
   * The inverse of `toFieldCoords`: where a point on the field sits on screen,
   * in CSS pixels relative to the canvas. Used to hang controls off things the
   * player can see, like the gun pads on the wall.
   */
  toScreenCoords(x: number, y: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const { width, height } = this.cfg.field;
    const layout = fieldLayout(this.canvas.width, this.canvas.height, width, height);
    return {
      x: (x * layout.scale + layout.offsetX) / dpr,
      y: (y * layout.scale + layout.offsetY) / dpr,
    };
  }

  // --- Frame ---------------------------------------------------------------

  render(state: SimState, fx: SimEvent[], dt: number, opts: RenderOptions = {}): void {
    this.clock += dt;
    this.consume(fx);
    this.advanceParticles(dt);
    this.advanceScorches(dt);
    this.advanceCorpses(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);

    const ctx = this.field;
    ctx.clearRect(0, 0, this.cfg.field.width, this.cfg.field.height);
    ctx.drawImage(this.terrain.canvas, 0, 0);

    this.drawWallDamage(state);
    this.drawScorches();
    this.drawCoverLine(state);
    this.drawHazards(state);
    this.drawCorpses();
    this.drawUnits(state);
    this.drawTowers(state);
    this.drawProjectiles(state);
    this.drawParticles();
    this.drawWallHp(state);
    if (opts.aim) this.drawReticle(opts.aim.x, opts.aim.y, opts.aimRadius ?? 12, opts.aimReady !== false);

    this.blit();
  }

  private blit(): void {
    const ctx = this.display;
    const { width, height } = this.cfg.field;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const layout = fieldLayout(this.canvas.width, this.canvas.height, width, height);
    // Shake in whole device pixels: a fractional offset would undo the snap.
    const shake = this.shake * layout.scale;
    const jitterX = this.shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
    const jitterY = this.shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.fieldCanvas,
      layout.offsetX + jitterX,
      layout.offsetY + jitterY,
      layout.width,
      layout.height,
    );
  }

  // --- FX queue ------------------------------------------------------------

  /** Turn simulation events into particles. The queue is emptied by the caller. */
  private consume(fx: SimEvent[]): void {
    for (const event of fx) {
      switch (event.type) {
        case 'shot':
          this.push('flash', event.x, event.y, 0, 0, 0.07, PALETTE.flash, 2);
          break;
        case 'hit':
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            this.push(
              'spark',
              event.x,
              event.y,
              Math.cos(a) * 26,
              Math.sin(a) * 26,
              0.16,
              event.team === 'enemy' ? PALETTE.blood : PALETTE.flash,
              1,
            );
          }
          break;
        case 'kill':
          if (this.corpses.length < 60) {
            this.corpses.push({ kind: event.kind, x: event.x, y: event.y, life: 1.6, maxLife: 1.6 });
          }
          for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2;
            this.push(
              'puff',
              event.x,
              event.y,
              Math.cos(a) * 18,
              Math.sin(a) * 18,
              0.4 + Math.random() * 0.2,
              event.team === 'enemy' ? PALETTE.blood : PALETTE.dust,
              1,
            );
          }
          if (event.team === 'enemy' && event.bounty > 0) {
            this.push('coin', event.x, event.y - 4, 0, -16, 0.6, PALETTE.credit, 2);
          }
          break;
        case 'explosion':
          this.explode(event.x, event.y, event.radius);
          break;
        case 'wallHit':
          for (let i = 0; i < 4; i++) {
            this.push(
              'spark',
              event.x + (Math.random() - 0.5) * 6,
              event.y,
              (Math.random() - 0.5) * 30,
              -Math.random() * 20,
              0.25,
              PALETTE.wallStoneLight,
              1,
            );
          }
          this.shake = Math.min(2.5, this.shake + 0.5);
          break;
        default:
          break;
      }
    }
  }

  /**
   * A blast, in layers, sized by its own radius.
   *
   * A grenade airburst and a 52-pixel artillery shell used to be the same
   * effect: one expanding ring, six puffs of smoke and a fixed knock on the
   * camera. The shell is the thing the player saved four hundred credits for,
   * so it has to land like it. What sells it is the order — a white core that
   * is gone in two frames, fire that swells and dies, a shockwave that outruns
   * the fire, dirt thrown on an arc, and a crater still there afterwards —
   * rather than any one of those being bigger.
   */
  private explode(x: number, y: number, radius: number): void {
    // Everything below scales off this: 1 at a grenade's splash, 3 and a half
    // at an artillery shell's.
    const weight = Math.max(0.6, radius / 16);
    const heavy = radius >= 24;

    // The core: a white-hot disc, two frames long.
    this.push('blast', x, y, 0, 0, 0.08 + 0.03 * weight, PALETTE.explosionCore, radius * 0.32);
    // The fireball, swelling behind it. Deliberately short of the blast's own
    // radius: the shockwave is what reaches the edge of what the shell kills.
    this.push('blast', x, y, 0, 0, 0.2 + 0.06 * weight, PALETTE.explosionCore, radius * 0.6);
    // The shockwave, thin and faster than the fire.
    this.push('shock', x, y, 0, 0, 0.26 + 0.05 * weight, PALETTE.explosionEdge, radius * 1.15);

    // Dirt and embers, thrown out and pulled back down.
    const debris = Math.round(5 + 7 * weight);
    for (let i = 0; i < debris; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (20 + Math.random() * 46) * Math.min(2, weight);
      this.push(
        'ember',
        x,
        y,
        Math.cos(a) * speed,
        Math.sin(a) * speed - 18 * weight,
        0.35 + Math.random() * 0.4,
        Math.random() < 0.45 ? PALETTE.explosionMid : PALETTE.dirtDark,
        Math.random() < 0.3 ? 2 : 1,
      );
    }

    // Smoke: more of it, rising, and it outlives the fire by a long way.
    const puffs = Math.round(4 + 5 * weight);
    for (let i = 0; i < puffs; i++) {
      const a = Math.random() * Math.PI * 2;
      const drift = 10 + Math.random() * 14 * weight;
      this.push(
        'smoke',
        x + Math.cos(a) * radius * 0.3,
        y + Math.sin(a) * radius * 0.3,
        Math.cos(a) * drift,
        Math.sin(a) * drift - 10,
        0.8 + Math.random() * 0.8 * weight,
        PALETTE.smoke,
        heavy ? 3 : 2,
      );
    }

    if (heavy) this.scorch(x, y, radius * 0.6);
    this.shake = Math.min(6, this.shake + 0.9 + 0.9 * weight);
  }

  /** Burn the ground where a heavy shell landed. */
  private scorch(x: number, y: number, radius: number): void {
    if (this.scorches.length > 14) this.scorches.shift();
    const r = Math.max(2, Math.round(radius));
    const { canvas, ctx } = createLayer(r * 2 + 1, r * 2 + 1);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        // Hashed on where the pixel lands on the field, not on where it sits
        // in this little canvas, so two craters never come out identical.
        const hash = hashPixel(Math.round(x) + dx, Math.round(y) + dy);
        const density = 0.85 - (Math.sqrt(d2) / r) * 0.7;
        if ((hash % 1024) / 1024 > density) continue;
        ctx.fillStyle = hash % 9 === 0 ? PALETTE.burnDark : PALETTE.dirtDark;
        ctx.fillRect(dx + r, dy + r, 1, 1);
      }
    }
    this.scorches.push({ x, y, radius: r, canvas, life: 6, maxLife: 6 });
  }

  private push(
    kind: Particle['kind'],
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: string,
    size: number,
  ): void {
    if (this.particles.length > 400) return;
    this.particles.push({ kind, x, y, vx, vy, life, maxLife: life, color, size });
  }

  private advanceCorpses(dt: number): void {
    if (this.corpses.length === 0) return;
    const live: Corpse[] = [];
    for (const c of this.corpses) {
      c.life -= dt;
      if (c.life > 0) live.push(c);
    }
    this.corpses = live;
  }

  /** Fallen bodies, drawn under everything still standing. */
  private drawCorpses(): void {
    for (const c of this.corpses) {
      const t = c.life / c.maxLife;
      const sprites = unitSprites(c.kind);
      // Settle into the ground over the first moments, then fade out.
      const frame = sprites.frames[t > 0.75 ? 1 : 0];
      this.field.globalAlpha = t < 0.35 ? t / 0.35 : 1;
      this.field.drawImage(
        frame.canvas,
        Math.round(c.x - sprites.originX),
        Math.round(c.y - sprites.originY + (1 - t) * 2),
      );
      this.field.globalAlpha = 1;
    }
  }

  private advanceParticles(dt: number): void {
    const live: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'puff' || p.kind === 'smoke') {
        p.vx *= 0.9;
        p.vy *= 0.9;
      }
      // Thrown dirt arcs: it slows sideways and falls, which is what separates
      // debris from a puff of anything.
      if (p.kind === 'ember') {
        p.vx *= 0.94;
        p.vy = p.vy * 0.94 + 150 * dt;
      }
      live.push(p);
    }
    this.particles = live;
  }

  private advanceScorches(dt: number): void {
    if (this.scorches.length === 0) return;
    const live: Scorch[] = [];
    for (const scorch of this.scorches) {
      scorch.life -= dt;
      if (scorch.life > 0) live.push(scorch);
    }
    this.scorches = live;
  }

  /**
   * Craters, laid over the terrain and under everything alive — a stipple of
   * burnt pixels rather than a solid disc, which would read as a hole cut in
   * the canvas. They fade rather than thin out, because the shape is baked.
   */
  private drawScorches(): void {
    for (const scorch of this.scorches) {
      const t = scorch.life / scorch.maxLife;
      this.field.globalAlpha = t > 0.6 ? 1 : t / 0.6;
      this.field.drawImage(
        scorch.canvas,
        Math.round(scorch.x) - scorch.radius,
        Math.round(scorch.y) - scorch.radius,
      );
      this.field.globalAlpha = 1;
    }
  }

  /** Cracks and rubble that grow as the wall is worn down. */
  private drawWallDamage(state: SimState): void {
    const { wallTop, wallThickness, width } = this.cfg.field;
    const ratio = state.wall.maxHp > 0 ? state.wall.hp / state.wall.maxHp : 0;
    const damage = 1 - Math.max(0, Math.min(1, ratio));
    if (damage <= 0.02) return;

    // Deterministic crack positions, revealed in the same order every time, so
    // damage looks like accumulating harm rather than noise.
    const cracks = Math.floor(damage * 120);
    for (let i = 0; i < cracks; i++) {
      const seed = (i * 2654435761) >>> 0;
      const x = (seed % width + ((seed >> 7) % 3)) % width;
      const y = wallTop + 2 + ((seed >> 11) % (wallThickness - 3));
      this.px(x, y, PALETTE.wallCrack);
      if (i % 3 === 0) this.px(x + 1, y + 1, PALETTE.wallCrack);
    }
    if (damage > 0.6) {
      for (let i = 0; i < 30; i++) {
        const seed = (i * 40503 + 7) >>> 0;
        this.px(seed % width, wallTop - 1 - (seed % 2), PALETTE.wallStoneDark);
      }
    }
  }

  /**
   * The strip along the top that the guns cannot reach. This is the one piece
   * of ground that matters strategically: siege parks in it and shells the
   * wall from safety, and no amount of tower investment clears it. Drawing the
   * boundary makes that readable — everything below the line is covered,
   * everything above it is somebody else's problem.
   */
  private drawCoverLine(state: SimState): void {
    const { width } = this.cfg.field;
    const edge = uncoveredStrip(this.cfg, state.upgrades.towers);
    for (let x = 0; x < width; x += 2) {
      if ((x >> 1) % 2 === 0) this.px(x, edge, PALETTE.coverLine);
      // A sparse wash above the line marks the ground the guns cannot hold.
      if ((x >> 1) % 5 === 0) this.px(x, edge - 5, PALETTE.coverGround);
    }
  }

  /** Inbound shells as shrinking reticles; napalm as flickering burning ground. */
  private drawHazards(state: SimState): void {
    for (const hazard of state.hazards) {
      if (hazard.delay > 0) {
        const progress = 1 - hazard.delay / Math.max(0.001, hazard.duration);
        this.drawReticle(hazard.x, hazard.y, hazard.radius * (1 - 0.35 * progress), true);
        continue;
      }
      if (hazard.kind === 'burn') this.drawBurn(hazard);
    }
  }

  /**
   * Burning ground: a dithered patch over the whole circle, re-rolled a few
   * times a second. Scattering points by angle leaves a ring; walking the
   * bounding box fills it, and hashing the coordinates against a stepped clock
   * makes the flames crawl instead of strobe.
   */
  private drawBurn(hazard: Hazard): void {
    const r = Math.round(hazard.radius);
    const r2 = r * r;
    const tick = Math.floor(this.clock * 9);
    const fading = hazard.timer < 1.2 ? hazard.timer / 1.2 : 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = Math.round(hazard.x) + dx;
        const y = Math.round(hazard.y) + dy;
        const hash = hashPixel(x, y, tick);
        const density = (0.26 + 0.26 * (1 - d2 / r2)) * fading;
        if ((hash % 1024) / 1024 > density) continue;
        this.px(x, y, hash % 3 === 0 ? PALETTE.burn : PALETTE.burnDark);
      }
    }
  }

  /**
   * A filled circle in field pixels — scanline rows, so it stays square-edged.
   *
   * `ragged` knocks pixels out of the rim on a stable per-pixel hash, which is
   * what keeps a fireball from reading as a perfect geometric circle. The hash
   * is on position rather than random, so the edge does not crawl between
   * frames while the disc grows.
   */
  private disc(x: number, y: number, radius: number, color: string, ragged = false): void {
    const r = Math.round(radius);
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (half <= 0) continue;
      if (!ragged) {
        this.px(cx - half, cy + dy, color, half * 2 + 1, 1);
        continue;
      }
      const solid = Math.round(half * 0.82);
      this.px(cx - solid, cy + dy, color, solid * 2 + 1, 1);
      for (const side of [-1, 1]) {
        for (let i = solid; i <= half; i++) {
          const x0 = cx + side * i;
          if (hashPixel(x0, cy + dy) % 4 === 0) continue;
          this.px(x0, cy + dy, color);
        }
      }
    }
  }

  private px(x: number, y: number, color: string, w = 1, h = 1): void {
    this.field.fillStyle = color;
    this.field.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private drawUnits(state: SimState): void {
    // Lower on the screen means nearer the camera, so sort by y.
    const order = [...state.units].sort((a, b) => a.y - b.y);
    for (const unit of order) {
      this.drawShadow(unit);
    }
    for (const unit of order) {
      this.drawUnit(unit);
    }
  }

  private drawShadow(unit: Unit): void {
    const ctx = this.field;
    ctx.fillStyle = PALETTE.shadow;
    const w = unit.radius * 2;
    ctx.fillRect(Math.round(unit.x - unit.radius), Math.round(unit.y + unit.radius - 3), w, 3);
  }

  private drawUnit(unit: Unit): void {
    const sprites = unitSprites(unit.kind);
    // The walk cycle advances with distance covered, so a slow golem plods and
    // a ghoul scurries without either needing its own timing.
    const frame = sprites.frames[Math.floor(unit.anim / 9) % sprites.frames.length];
    // Firing kicks the shooter back along its aim for a moment.
    const kick = unit.recoil > 0 ? Math.min(2, unit.recoil * 22) : 0;
    const x = Math.round(unit.x - sprites.originX - Math.cos(unit.aim) * kick);
    const y = Math.round(unit.y - sprites.originY - Math.sin(unit.aim) * kick);

    this.drawKit(unit);
    this.field.drawImage(frame.canvas, x, y);
    if (unit.flash > 0) {
      this.field.globalAlpha = Math.min(1, unit.flash * 7);
      this.field.drawImage(sprites.flash.canvas, x, y);
      this.field.globalAlpha = 1;
    }
    this.drawUnitHp(unit);
  }

  /** The kit a unit is wearing: its weapon plus whatever its rank has earned. */
  private drawKit(unit: Unit): void {
    drawGear(this.field, {
      x: unit.x,
      y: unit.y,
      aim: unit.aim,
      mark: markOf(unit.kind),
      rank: unit.rank,
      ramp: rampOf(unit.kind),
      radius: unit.radius,
      roll: Math.floor(this.clock * 8) % 2,
    });
  }

  private drawUnitHp(unit: Unit): void {
    if (unit.hp >= unit.maxHp - 0.01) return;
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    const w = Math.max(8, unit.radius * 2);
    const x = Math.round(unit.x - w / 2);
    const y = Math.round(unit.y - unit.radius - 7);
    this.px(x, y, PALETTE.wallCrack, w, 2);
    const color =
      unit.team === 'enemy' ? PALETTE.enemyHp : ratio > 0.5 ? PALETTE.hpGood : ratio > 0.25 ? PALETTE.hpMid : PALETTE.hpLow;
    this.px(x, y, color, Math.max(1, Math.round(w * ratio)), 2);
  }

  /**
   * The guns that have actually been bought. The stone pads for all four are
   * baked into the terrain; the hardware standing in them is drawn here, so
   * the parapet visibly fills up as the Towers track is levelled.
   */
  private drawTowers(state: SimState): void {
    const period = towerPeriod(this.cfg, state.upgrades.towers);
    const { wallTop } = this.cfg.field;
    for (const tower of state.towers) {
      // The emplacement body, sitting in its pad.
      this.px(tower.x - 10, wallTop - 8, PALETTE.towerBody, 20, 20);
      this.px(tower.x - 10, wallTop - 8, PALETTE.wallStoneLight, 20, 2);
      this.px(tower.x - 4, wallTop - 8, PALETTE.towerBarrel, 8, 8);
      let aim = -Math.PI / 2;
      let nearest = Infinity;
      for (const unit of state.units) {
        if (unit.team !== 'enemy') continue;
        const d = (unit.x - tower.x) ** 2 + (unit.y - tower.y) ** 2;
        if (d < nearest) {
          nearest = d;
          aim = Math.atan2(unit.y - tower.y, unit.x - tower.x);
        }
      }
      const cos = Math.cos(aim);
      const sin = Math.sin(aim);
      for (let i = 0; i <= 13; i += 0.5) {
        this.px(tower.x + cos * i, tower.y + sin * i, PALETTE.towerBarrel, 3, 3);
      }
      this.px(tower.x - 3, tower.y - 3, PALETTE.towerBody, 7, 7);
      // A muzzle glow right after firing: the flicker reads as rate of fire.
      if (tower.cooldown > period - 0.08) {
        this.px(tower.x + cos * 15, tower.y + sin * 15, PALETTE.flash, 3, 3);
      }
    }
  }

  private drawProjectiles(state: SimState): void {
    for (const p of state.projectiles) {
      const aim = Math.atan2(p.ty - p.y, p.tx - p.x);
      const cos = Math.cos(aim);
      const sin = Math.sin(aim);
      switch (p.kind) {
        case 'bullet':
          for (let i = 0; i < 6; i++) this.px(p.x - cos * i, p.y - sin * i, i < 2 ? PALETTE.tracerCore : PALETTE.tracer, 2, 2);
          break;
        case 'rocket':
          this.px(p.x - 1, p.y - 1, PALETTE.rocket, 4, 4);
          this.push('smoke', p.x - cos * 2, p.y - sin * 2, 0, 0, 0.35, PALETTE.smoke, 1);
          break;
        case 'arrow':
          for (let i = 0; i < 8; i++) this.px(p.x - cos * i, p.y - sin * i, PALETTE.arrow, 2, 2);
          break;
        case 'bolt':
          this.px(p.x - 2, p.y - 2, PALETTE.bolt, 5, 5);
          this.px(p.x - 1, p.y - 1, PALETTE.tracerCore, 2, 2);
          break;
        case 'boulder':
          this.px(p.x - 2, p.y - 2, PALETTE.boulder, 5, 5);
          this.px(p.x - 2, p.y - 2, PALETTE.dirtDark, 2, 2);
          break;
        case 'drain':
          this.px(p.x - 2, p.y - 2, PALETTE.drain, 4, 4);
          break;
        default:
          this.px(p.x, p.y, PALETTE.tracer);
          break;
      }
    }
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      switch (p.kind) {
        case 'ring': {
          const r = p.size * (1 - t) + 2;
          const color = t > 0.66 ? PALETTE.explosionCore : t > 0.33 ? PALETTE.explosionMid : PALETTE.explosionEdge;
          for (let a = 0; a < 56; a++) {
            const ang = (a / 28) * Math.PI * 2;
            this.px(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, color);
          }
          if (t > 0.6) this.px(p.x - 2, p.y - 2, PALETTE.explosionCore, 5, 5);
          break;
        }
        case 'blast': {
          // Fire, not a sticker: three bands from white-hot centre to dull
          // red rim, a ragged edge, and a fade out rather than a vanish. A
          // single flat disc at full opacity read as a circle pasted over the
          // battlefield, which is exactly what it was.
          const grow = 1 - t * t;
          const r = Math.max(1, p.size * (0.4 + 0.6 * grow));
          this.field.globalAlpha = t > 0.45 ? 1 : Math.max(0, t / 0.45);
          this.disc(p.x, p.y, r, PALETTE.explosionEdge, true);
          this.disc(p.x, p.y, r * 0.68, t > 0.3 ? PALETTE.explosionMid : PALETTE.explosionEdge);
          if (t > 0.35) this.disc(p.x, p.y, r * 0.34, p.color);
          this.field.globalAlpha = 1;
          break;
        }
        case 'shock': {
          // Outruns the fireball and thins to nothing: one pixel wide, always.
          const r = p.size * (1 - t) + 2;
          const color = t > 0.5 ? PALETTE.explosionMid : PALETTE.explosionEdge;
          // Two pixels thick while it is young, one as it thins out — a
          // single-pixel ring expanding this fast is gone before it registers.
          const thickness = t > 0.5 ? 2 : 1;
          const steps = Math.max(16, Math.round(r * 5));
          this.field.globalAlpha = t > 0.3 ? 1 : t / 0.3;
          for (let a = 0; a < steps; a++) {
            const ang = (a / steps) * Math.PI * 2;
            this.px(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, color, thickness, thickness);
          }
          this.field.globalAlpha = 1;
          break;
        }
        case 'ember':
          this.px(p.x, p.y, t > 0.45 ? p.color : PALETTE.dirtDark, p.size, p.size);
          break;
        case 'coin':
          this.px(p.x, p.y, PALETTE.credit, 3, 3);
          break;
        case 'flash':
          this.px(p.x - 2, p.y - 2, p.color, 5, 5);
          break;
        default:
          this.px(p.x, p.y, p.color, p.size, p.size);
          break;
      }
    }
  }

  private drawWallHp(state: SimState): void {
    const { width, wallTop, wallThickness } = this.cfg.field;
    const ratio = state.wall.maxHp > 0 ? Math.max(0, state.wall.hp / state.wall.maxHp) : 0;
    const inset = 12;
    const barWidth = width - inset * 2;
    const y = wallTop + wallThickness + 4;
    // A recessed gauge set into the parapet, not a stripe floating over it.
    this.px(inset - 2, y - 2, PALETTE.wallGaugeFrame, barWidth + 4, 8);
    this.px(inset, y, PALETTE.wallCrack, barWidth, 4);
    const color =
      ratio > 0.5 ? PALETTE.wallGaugeGood : ratio > 0.25 ? PALETTE.hpMid : PALETTE.hpLow;
    this.px(inset, y, color, Math.max(0, Math.round(barWidth * ratio)), 4);
  }

  private drawReticle(x: number, y: number, radius: number, ready: boolean): void {
    const color = ready ? PALETTE.reticle : PALETTE.smoke;
    const steps = Math.max(10, Math.floor(radius));
    for (let i = 0; i < steps; i++) {
      if (i % 2 === 0) continue; // dashed ring
      const a = (i / steps) * Math.PI * 2;
      this.px(x + Math.cos(a) * radius, y + Math.sin(a) * radius, color);
    }
    for (let i = -4; i <= 4; i++) {
      this.px(x + i, y, color);
      this.px(x, y + i, color);
    }
  }
}

// --- Kind lookups -----------------------------------------------------------

function markOf(kind: UnitKindId): UnitMark {
  return kind in PLAYER_UNITS
    ? PLAYER_UNITS[kind as keyof typeof PLAYER_UNITS].mark
    : ENEMY_UNITS[kind as keyof typeof ENEMY_UNITS].mark;
}

function rampOf(kind: UnitKindId): Ramp {
  return (kind in PLAYER_UNITS
    ? PLAYER_UNITS[kind as keyof typeof PLAYER_UNITS].colors
    : ENEMY_UNITS[kind as keyof typeof ENEMY_UNITS].colors) as Ramp;
}
