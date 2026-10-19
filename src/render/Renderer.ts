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

import { ENEMY_UNITS, PLAYER_UNITS, towerPeriod } from '../sim';
import type { GameConfig, Hazard, SimEvent, SimState, Unit, UnitKindId, UnitMark } from '../sim';
import { PALETTE } from './palette';
import { drawGear } from './gear';
import { fieldLayout } from './layout';
import { createLayer, type Ramp } from './pixel';
import { unitSprites } from './sprites';
import { bakeTerrain, type TerrainLayer } from './terrain';

interface Particle {
  kind: 'spark' | 'puff' | 'ring' | 'coin' | 'flash' | 'smoke';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
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

  // --- Frame ---------------------------------------------------------------

  render(state: SimState, fx: SimEvent[], dt: number, opts: RenderOptions = {}): void {
    this.clock += dt;
    this.consume(fx);
    this.advanceParticles(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);

    const ctx = this.field;
    ctx.clearRect(0, 0, this.cfg.field.width, this.cfg.field.height);
    ctx.drawImage(this.terrain.canvas, 0, 0);

    this.drawWallDamage(state);
    this.drawHazards(state);
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
          this.push('ring', event.x, event.y, 0, 0, 0.32, PALETTE.explosionMid, event.radius);
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            this.push('smoke', event.x, event.y, Math.cos(a) * 12, Math.sin(a) * 12, 0.7, PALETTE.smoke, 2);
          }
          this.shake = Math.min(3.5, this.shake + 1.6);
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
      live.push(p);
    }
    this.particles = live;
  }

  // --- Layers --------------------------------------------------------------

  private px(x: number, y: number, color: string, w = 1, h = 1): void {
    this.field.fillStyle = color;
    this.field.fillRect(Math.round(x), Math.round(y), w, h);
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
        // Mix the hash properly: the raw xor correlates along x and lays the
        // flames down in stripes.
        let hash = (Math.imul(x + tick * 31, 73856093) ^ Math.imul(y - tick * 17, 19349663)) >>> 0;
        hash = Math.imul(hash ^ (hash >>> 15), 2246822519) >>> 0;
        hash = (hash ^ (hash >>> 13)) >>> 0;
        const density = (0.26 + 0.26 * (1 - d2 / r2)) * fading;
        if ((hash % 1024) / 1024 > density) continue;
        this.px(x, y, hash % 3 === 0 ? PALETTE.burn : PALETTE.burnDark);
      }
    }
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
    const frame = sprites.frames[Math.floor(unit.anim / 12) % 2];
    const x = Math.round(unit.x - sprites.originX);
    const y = Math.round(unit.y - sprites.originY);

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

  /** Tower barrels track their target, which is the only moving part up there. */
  private drawTowers(state: SimState): void {
    const period = towerPeriod(this.cfg, state.upgrades.towers);
    for (const tower of state.towers) {
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
