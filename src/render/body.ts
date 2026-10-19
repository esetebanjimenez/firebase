/**
 * body.ts — the unit sprite builder.
 *
 * At the old resolution a unit was nine pixels and six hand-drawn grids covered
 * all 21 kinds. At 384x480 a soldier is sixteen to thirty pixels, which is
 * enough to show anatomy — helmet, shoulders, arms, pack — and enough to hang
 * earned gear on. Hand-authoring that for every kind would freeze each kind to
 * one size, so bodies are built from parts instead: each kind's own `radius`
 * drives the drawing, and a skeleton, a knight and a bone giant are the same
 * construction at three sizes rather than three buckets.
 *
 * Everything is drawn pixel by pixel with hard edges — no anti-aliasing, no
 * gradients — so the output sits in the same world as the terrain. Colour comes
 * from the kind's five-slot ramp: a lit front, a mid-tone body, a shaded
 * underside, an accent for visors and trim, and an outline.
 *
 * Units face up the field (toward the enemy), so "front" is -y.
 */

import { createLayer, type Ramp, type Sprite } from './pixel';
import type { Silhouette } from '../sim';

/** Per-silhouette proportions. All multipliers of the kind's body radius. */
interface Shape {
  /** Body half-width and half-height. */
  readonly bodyW: number;
  readonly bodyH: number;
  /** Head/helmet radius. */
  readonly head: number;
  /** Shoulder pad radius; 0 for none. */
  readonly pad: number;
  /** How far out the pads sit. */
  readonly padX: number;
  readonly arms: boolean;
  readonly pack: boolean;
  /** A hood drawn to a point at the front (casters). */
  readonly hood: boolean;
  /** Rectangular frame instead of a body (siege engines). */
  readonly frame: boolean;
  /** Extra outline weight for heavies. */
  readonly heavy: boolean;
}

const SHAPES: Record<Silhouette, Shape> = {
  trooper: { bodyW: 0.92, bodyH: 1, head: 0.46, pad: 0.42, padX: 0.72, arms: true, pack: true, hood: false, frame: false, heavy: false },
  grunt: { bodyW: 0.86, bodyH: 0.94, head: 0.48, pad: 0.3, padX: 0.66, arms: true, pack: false, hood: false, frame: false, heavy: false },
  armored: { bodyW: 1, bodyH: 1, head: 0.44, pad: 0.56, padX: 0.76, arms: true, pack: false, hood: false, frame: false, heavy: true },
  caster: { bodyW: 0.88, bodyH: 1, head: 0.42, pad: 0.26, padX: 0.6, arms: false, pack: false, hood: true, frame: false, heavy: false },
  brute: { bodyW: 1, bodyH: 1, head: 0.4, pad: 0.6, padX: 0.8, arms: true, pack: false, hood: false, frame: false, heavy: true },
  engine: { bodyW: 1.05, bodyH: 0.85, head: 0, pad: 0, padX: 0, arms: false, pack: false, hood: false, frame: true, heavy: true },
};

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** A filled pixel disc: the primitive everything round is built from. */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  const rr = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) px(ctx, x, y, color);
    }
  }
}

/** A filled pixel ellipse, for bodies that are taller than they are wide. */
function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(ctx, x, y, color);
    }
  }
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Outline every lit pixel that touches empty space, in one pass. */
function outline(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const data = ctx.getImageData(0, 0, size, size);
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && data.data[(y * size + x) * 4 + 3] > 0;
  const edges: [number, number][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edges.push([x, y]);
    }
  }
  for (const [x, y] of edges) px(ctx, x, y, color);
}

export interface BodyArt {
  readonly sprite: Sprite;
  /** Where the unit's centre sits inside the sprite. */
  readonly originX: number;
  readonly originY: number;
}

/**
 * A walk pose. Four of them cycle: feet together, left lead, together, right
 * lead — the body lifting on the passing frames and the arms swinging
 * opposite. At twenty pixels a one-pixel bob alone read as a twitch; a swing
 * plus a roll reads as walking.
 */
export interface Pose {
  /** Pixels the whole figure lifts. */
  readonly lift: number;
  /** Arm swing: positive pushes the left arm forward, right arm back. */
  readonly swing: number;
  /** Side-to-side roll of the shoulders, in pixels. */
  readonly roll: number;
}

export const WALK_CYCLE: readonly Pose[] = [
  { lift: 0, swing: 0, roll: 0 },
  { lift: 1, swing: 1, roll: -1 },
  { lift: 0, swing: 0, roll: 0 },
  { lift: 1, swing: -1, roll: 1 },
];

/** Standing still: no swing, and a slow half-pixel breath. */
export const IDLE_POSE: Pose = { lift: 0, swing: 0, roll: 0 };

/** Build a unit body in a given pose. */
export function buildBody(
  silhouette: Silhouette,
  radius: number,
  ramp: Ramp,
  pose: Pose = IDLE_POSE,
): BodyArt {
  const shape = SHAPES[silhouette];
  const [body, light, accent, dark, shade] = ramp;
  const pad = 6;
  const size = Math.ceil(radius * 2 + pad * 2);
  const { canvas, ctx } = createLayer(size, size);
  const cx = size / 2 + pose.roll * 0.5;
  const cy = size / 2 - pose.lift;

  if (shape.frame) {
    // Siege engines: a timber frame with cross beams, not a figure.
    const w = radius * shape.bodyW * 2;
    const h = radius * shape.bodyH * 2;
    rect(ctx, cx - w / 2, cy - h / 2, w, h, shade);
    rect(ctx, cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2, light);
    rect(ctx, cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4, body);
    // Beams along and across.
    rect(ctx, cx - w / 2 + 2, cy - 1, w - 4, 2, dark);
    rect(ctx, cx - 1, cy - h / 2 + 2, 2, h - 4, dark);
    rect(ctx, cx - 2, cy - h / 2 + 3, 4, 3, accent);
    outline(ctx, size, dark);
    return { sprite: { canvas, width: size, height: size }, originX: size / 2, originY: size / 2 };
  }

  // Pack sits behind the shoulders, so it is drawn before the body covers it.
  if (shape.pack) {
    const pw = radius * 1.05;
    const ph = radius * 0.72;
    rect(ctx, cx - pw / 2, cy + radius * 0.25, pw, ph, dark);
    rect(ctx, cx - pw / 2 + 1, cy + radius * 0.25 + 1, pw - 2, ph - 2, shade);
  }

  // Arms reach toward the front, where the weapon will be.
  if (shape.arms) {
    const armR = Math.max(1, radius * 0.22);
    for (const side of [-1, 1]) {
      // One arm forward, the other back, swapping each passing frame.
      const swing = pose.swing * side * radius * 0.18;
      disc(ctx, cx + side * radius * 0.62, cy - radius * 0.52 - swing, armR, shade);
      disc(ctx, cx + side * radius * 0.5, cy - radius * 0.85 - swing, armR * 0.9, body);
    }
  }

  // Torso: shaded underside, mid-tone body, lit front.
  ellipse(ctx, cx, cy, radius * shape.bodyW, radius * shape.bodyH, shade);
  for (let y = Math.floor(cy - radius); y < cy + radius * 0.45; y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = (x + 0.5 - cx) / (radius * shape.bodyW * 0.95);
      const dy = (y + 0.5 - cy) / (radius * shape.bodyH * 0.95);
      if (dx * dx + dy * dy <= 1) px(ctx, x, y, body);
    }
  }
  for (let y = Math.floor(cy - radius); y < cy - radius * 0.12; y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = (x + 0.5 - cx) / (radius * shape.bodyW * 0.78);
      const dy = (y + 0.5 - cy) / (radius * shape.bodyH * 0.78);
      if (dx * dx + dy * dy <= 1) px(ctx, x, y, light);
    }
  }

  if (shape.hood) {
    // A hood drawn to a point at the front: the caster's read at a glance.
    const tip = cy - radius * 1.15;
    for (let y = Math.floor(tip); y < cy + radius * 0.2; y++) {
      const t = (y - tip) / (cy + radius * 0.2 - tip);
      const halfWidth = radius * 0.95 * t;
      for (let x = Math.floor(cx - halfWidth); x <= Math.ceil(cx + halfWidth); x++) {
        px(ctx, x, y, t < 0.45 ? light : body);
      }
    }
  }

  if (shape.pad > 0) {
    for (const side of [-1, 1]) {
      disc(ctx, cx + side * radius * shape.padX, cy + radius * 0.1, radius * shape.pad, shade);
      disc(ctx, cx + side * radius * shape.padX, cy + radius * 0.02, radius * shape.pad * 0.88, body);
      disc(ctx, cx + side * radius * shape.padX, cy - radius * 0.1, radius * shape.pad * 0.6, light);
    }
  }

  if (shape.head > 0) {
    const headR = radius * shape.head;
    disc(ctx, cx, cy - radius * 0.1, headR, dark);
    disc(ctx, cx, cy - radius * 0.12, headR - 1, shape.hood ? accent : light);
    // A visor strip at the front edge of the helmet.
    rect(ctx, cx - headR * 0.6, cy - radius * 0.12 - headR * 0.82, headR * 1.2, Math.max(1, headR * 0.34), accent);
  }

  if (shape.heavy) {
    // Heavies get a second, darker ring so they read as armoured mass.
    outline(ctx, size, dark);
  }
  outline(ctx, size, dark);

  // Origin is the box centre, not the posed centre — the pose's roll has to
  // survive into the draw position or the sway cancels itself out.
  return { sprite: { canvas, width: size, height: size }, originX: size / 2, originY: size / 2 };
}
