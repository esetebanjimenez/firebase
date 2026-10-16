/**
 * sprites.ts — placeholder art as a swappable factory.
 *
 * Everything the battlefield draws is created here as simple colored shapes
 * (PixiJS `Graphics`) in a toy-soldier / tabletop-miniature spirit: little 3/4
 * figures, sandbag nests, bunkers. To move to pixel art later, replace the
 * bodies of these factories with `Sprite`s built from textures — the renderer
 * only ever asks this module for a display object, so nothing else changes.
 */

import { Container, Graphics } from 'pixi.js';
import type { RingId } from '../sim';

/** Fixed, information-carrying palette: friendly cool hues vs. hostile warm. */
export const COLORS = {
  background: 0x16130b,
  // terrain zones, outer → inner, warm earth tones pushed brighter than realism
  zoneOuter: 0x2b2416,
  zoneMiddle: 0x322a19,
  zoneInner: 0x3a311d,
  fieldEdge: 0x4a3c24,
  shadow: 0x000000,

  base: 0xd9c08a,
  baseCore: 0x8a6d3a,
  baseWall: 0xb79a63,

  // ring hue families (friendly)
  ringActive: {
    outer: 0x5fb0e6,
    middle: 0x5fe0a0,
    inner: 0x9f8cff,
  } as Record<RingId, number>,
  ringDown: 0xb3433a,

  // friendly materials
  sandbag: 0xcdb07a,
  sandbagDark: 0x9c8450,
  gunmetal: 0x40464e,
  gunmetalDark: 0x2a2f36,
  concrete: 0x8f8a7a,
  concreteDark: 0x625e51,
  friendlyUniform: 0x3f6f57,
  friendlyHelmet: 0x2f5141,
  wreck: 0x5a5148,

  // hostile (enemy infantry)
  enemyUniform: 0xe0633a,
  enemyUniformDark: 0xa6421f,
  enemyHelmet: 0x7a2d16,
  enemySkin: 0xf0c49a,
  rifle: 0x2b2420,

  // fx
  explosion: 0xffd25c,
  muzzle: 0xffe9a3,
  tracer: 0xffd166,
  supplyText: 0x8fe8b0,
  breachText: 0xff7a5c,
} as const;

/** A view that animates over time (idle sway, marching bob). */
export interface AnimatedView {
  root: Container;
  update(t: number): void;
}

/** A fixed emplacement plus the local-space point its shots leave from. */
export interface EmplacementView {
  root: Container;
  muzzle: { x: number; y: number };
}

function addShadow(c: Container, rx: number, ry: number, y = 0): void {
  const s = new Graphics();
  s.ellipse(0, y, rx, ry).fill({ color: COLORS.shadow, alpha: 0.33 });
  c.addChild(s);
}

/**
 * Enemy infantry: a small 3/4 trooper (helmet, torso, rifle, legs) with a drop
 * shadow. Recognizable by silhouette alone. Faces the viewer and "marches" via
 * a leg/body bob driven by `update`.
 */
export function createInfantryView(phase: number): AnimatedView {
  const root = new Container();
  addShadow(root, 6, 2.5, 7);

  const figure = new Container();
  const legs = new Graphics();
  legs.rect(-3.5, 3, 2.6, 5).fill(COLORS.enemyUniformDark); // left leg
  legs.rect(1, 3, 2.6, 5).fill(COLORS.enemyUniformDark); // right leg

  const body = new Graphics();
  body.roundRect(-4.5, -4, 9, 9, 2).fill(COLORS.enemyUniform);
  body.rect(-4.5, -1, 9, 2).fill(COLORS.enemyUniformDark); // belt
  // rifle across the chest
  body.rect(-7, -1.5, 12, 1.6).fill(COLORS.rifle);
  // head + helmet
  body.circle(0, -7.5, 3.1).fill(COLORS.enemySkin);
  body.moveTo(-3.4, -8.2).lineTo(3.4, -8.2).lineTo(2.6, -10.6).lineTo(-2.6, -10.6).closePath().fill(COLORS.enemyHelmet);
  body.rect(-3.6, -8.2, 7.2, 1.3).fill(COLORS.enemyHelmet); // helmet brim

  figure.addChild(legs, body);
  root.addChild(figure);

  return {
    root,
    update: (t: number) => {
      const bob = Math.abs(Math.sin(t * 7 + phase));
      figure.y = -bob * 1.6;
      // legs scissor a touch
      legs.skew.x = Math.sin(t * 7 + phase) * 0.12;
    },
  };
}

/** The firebase at the center: sandbag wall ring + core + flag. */
export function createBaseView(radiusPx: number): Container {
  const c = new Container();
  addShadow(c, radiusPx * 1.1, radiusPx * 0.5, radiusPx * 0.5);
  const g = new Graphics();
  g.circle(0, 0, radiusPx).fill(COLORS.base);
  g.circle(0, 0, radiusPx).stroke({ width: 2, color: COLORS.baseWall });
  g.circle(0, 0, radiusPx * 0.58).fill(COLORS.baseCore);
  // sandbag nubs around the wall
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.circle(Math.cos(a) * radiusPx, Math.sin(a) * radiusPx, radiusPx * 0.16).fill(COLORS.baseWall);
  }
  c.addChild(g);
  // little command flag
  const flag = new Graphics();
  flag.rect(-0.8, -radiusPx * 0.9, 1.6, radiusPx * 0.9).fill(COLORS.gunmetalDark);
  flag.moveTo(0.8, -radiusPx * 0.9)
    .lineTo(radiusPx * 0.7, -radiusPx * 0.72)
    .lineTo(0.8, -radiusPx * 0.54)
    .closePath()
    .fill(COLORS.ringActive.outer);
  c.addChild(flag);
  return c;
}

/**
 * A friendly emplacement for a ring, drawn in local space with "outward"
 * pointing along +x (the renderer rotates the whole thing to its angle). When
 * `down`, a wrecked grey version is drawn instead.
 */
export function createEmplacementView(ring: RingId, down: boolean): EmplacementView {
  const root = new Container();
  addShadow(root, 7, 3, 2);
  const g = new Graphics();

  if (down) {
    // toppled sandbags / wreckage — reads instantly as "fallen"
    g.roundRect(-4, -2, 9, 5, 1).fill(COLORS.wreck);
    g.rect(-6, 1, 14, 2).fill(COLORS.wreck);
    g.moveTo(2, -2).lineTo(9, -6).stroke({ width: 1.6, color: COLORS.wreck, alpha: 0.8 });
    root.addChild(g);
    root.alpha = 0.8;
    return { root, muzzle: { x: 6, y: 0 } };
  }

  const hue = COLORS.ringActive[ring];

  if (ring === 'outer') {
    // Wire picket + a prone rifleman behind it.
    g.moveTo(7, -5).lineTo(10, 5).moveTo(10, -5).lineTo(7, 5).stroke({ width: 1.4, color: COLORS.gunmetal });
    g.moveTo(6, 0).lineTo(11, 0).stroke({ width: 1, color: COLORS.gunmetal, alpha: 0.7 });
    g.roundRect(-5, -3, 8, 6, 2).fill(COLORS.friendlyUniform); // body
    g.circle(2, 0, 2.4).fill(COLORS.friendlyHelmet); // helmet
    g.rect(2, -0.9, 8, 1.6).fill(COLORS.rifle); // rifle forward
    g.rect(-5, -3, 2, 6).fill(hue); // unit color tab
    root.addChild(g);
    return { root, muzzle: { x: 10, y: 0 } };
  }

  if (ring === 'middle') {
    // Sandbagged MG nest with a gunner.
    for (let i = -2; i <= 2; i++) {
      g.roundRect(3, i * 3 - 1.4, 4, 2.8, 1).fill(i % 2 === 0 ? COLORS.sandbag : COLORS.sandbagDark);
    }
    g.roundRect(-5, -3.5, 8, 7, 2).fill(COLORS.friendlyUniform); // crew
    g.circle(-1, 0, 2.6).fill(COLORS.friendlyHelmet);
    g.rect(0, -1, 11, 2).fill(COLORS.gunmetalDark); // MG barrel
    g.rect(-1, -1.6, 4, 3.2).fill(COLORS.gunmetal); // receiver
    g.rect(-5, -3.5, 2, 7).fill(hue);
    root.addChild(g);
    return { root, muzzle: { x: 11, y: 0 } };
  }

  // inner: concrete bunker with a mortar tube.
  g.roundRect(-6, -5, 12, 10, 2).fill(COLORS.concrete);
  g.roundRect(-6, -5, 12, 10, 2).stroke({ width: 1, color: COLORS.concreteDark });
  g.rect(3, -2, 5, 4).fill(COLORS.gunmetalDark); // firing slit housing
  // mortar tube angled outward/up
  g.rect(-1, -3, 9, 2.4).fill(COLORS.gunmetal);
  g.rotation = 0;
  g.circle(-2, -2, 2).fill(COLORS.gunmetalDark); // baseplate
  g.rect(-6, -5, 2.4, 10).fill(hue);
  root.addChild(g);
  return { root, muzzle: { x: 8, y: -2 } };
}

/** A one-shot explosion graphic; the renderer animates its scale/alpha. */
export function createExplosionView(): Graphics {
  const g = new Graphics();
  g.star(0, 0, 7, 10, 5).fill(COLORS.explosion);
  g.circle(0, 0, 5).fill(0xffffff);
  return g;
}
