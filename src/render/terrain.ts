/**
 * terrain.ts — the static half of the field, baked once into a canvas.
 *
 * Ground, the trampled approach to the gate, scattered props, the wall with its
 * gate and tower emplacements, and your compound behind it. None of it changes
 * during a battle, so it is drawn a single time and blitted as one image per
 * frame; only damage, units and effects are redrawn.
 *
 * All scatter comes from a seeded generator, so a given config always produces
 * the same battlefield — handy when comparing screenshots.
 */

import type { GameConfig } from '../sim';
import { PALETTE } from './palette';
import { createLayer } from './pixel';
import { propSprite, type PropId } from './sprites';

/** A small deterministic generator, so terrain is stable across reloads. */
function rng(seed: number): () => number {
  let state = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 374761393) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

export interface TerrainLayer {
  readonly canvas: HTMLCanvasElement;
}

export function bakeTerrain(cfg: GameConfig): TerrainLayer {
  const { width, height, wallTop, wallThickness, gateX, gateHalfWidth, towerX, towerY } = cfg.field;
  const { canvas, ctx } = createLayer(width, height);
  const rand = rng(cfg.seed * 7919 + 13);

  // --- Open ground, dithered so a flat colour doesn't read as a void.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, width, wallTop);
  for (let i = 0; i < width * wallTop * 0.09; i++) {
    const x = rand() * width;
    const y = rand() * wallTop;
    dot(ctx, x, y, rand() < 0.5 ? PALETTE.grassLight : PALETTE.grassDark);
  }

  // --- The approach: ground churned to dirt by every wave that came before,
  // funnelling from the open top down to the gate.
  for (let y = 0; y < wallTop; y++) {
    const t = y / wallTop;
    const centre = width / 2 + (gateX - width / 2) * t;
    const halfWidth = 9 + 9 * t; // widest where the fighting ends up, by the gate
    for (let x = Math.floor(centre - halfWidth); x <= Math.ceil(centre + halfWidth); x++) {
      if (x < 0 || x >= width) continue;
      const edge = Math.abs(x - centre) / halfWidth;
      // Solid where the ground is most trampled, breaking into an ordered
      // dither toward the edges and the far end: a worn track, not noise.
      const wear = (1 - edge * edge) * (0.3 + 0.7 * t);
      // Hash the coordinates rather than stepping a pattern: a modulus here
      // bands into visible diagonal stripes.
      const hash = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 8) % 1024;
      if (hash / 1024 > wear) continue;
      dot(ctx, x, y, hash % 5 === 0 ? PALETTE.dirtDark : PALETTE.dirt);
    }
  }

  // --- Props. Kept off the approach and away from the wall so they never sit
  // under a crowd of units.
  const props: PropId[] = ['rock', 'bush', 'bones', 'crater', 'bush', 'rock'];
  for (let i = 0; i < 26; i++) {
    const id = props[Math.floor(rand() * props.length)];
    const x = 4 + rand() * (width - 10);
    const y = 6 + rand() * (wallTop - 30);
    const onApproach = Math.abs(x - (width / 2 + (gateX - width / 2) * (y / wallTop))) < 16;
    if (onApproach && (id === 'rock' || id === 'bush')) continue;
    const sprite = propSprite(id);
    ctx.drawImage(sprite.canvas, Math.floor(x), Math.floor(y));
  }

  // --- The wall.
  const wallBottom = wallTop + wallThickness;
  ctx.fillStyle = PALETTE.wallStone;
  ctx.fillRect(0, wallTop, width, wallThickness);

  // Crenellations along the top edge, and a bright lip to catch the light.
  for (let x = 0; x < width; x++) {
    dot(ctx, x, wallTop, x % 6 < 3 ? PALETTE.wallStoneLight : PALETTE.wallStoneDark);
    dot(ctx, x, wallTop + 1, PALETTE.wallStoneLight);
  }
  // Block courses: mortar lines, with the vertical joints offset per row.
  for (let y = wallTop + 3; y < wallBottom; y += 3) {
    for (let x = 0; x < width; x++) dot(ctx, x, y, PALETTE.wallStoneDark);
    const offset = ((y - wallTop) / 3) % 2 === 0 ? 0 : 6;
    for (let x = offset; x < width; x += 12) {
      for (let dy = 1; dy < 3 && y + dy < wallBottom; dy++) dot(ctx, x, y + dy, PALETTE.wallStoneDark);
    }
  }

  // The gate: a dark opening with a steel grille and a lintel over it.
  const gateLeft = gateX - gateHalfWidth;
  const gateRight = gateX + gateHalfWidth;
  ctx.fillStyle = PALETTE.dirtDark;
  ctx.fillRect(gateLeft, wallTop + 2, gateRight - gateLeft, wallThickness - 2);
  ctx.fillStyle = PALETTE.gateMetal;
  for (let x = gateLeft + 1; x < gateRight; x += 3) {
    ctx.fillRect(x, wallTop + 3, 1, wallThickness - 4);
  }
  ctx.fillStyle = PALETTE.gateMetalLight;
  ctx.fillRect(gateLeft, wallTop + 2, gateRight - gateLeft, 1);
  ctx.fillRect(gateLeft, wallBottom - 1, gateRight - gateLeft, 1);
  // Sandbagged lane out of the gate, so the exit reads as a chokepoint.
  ctx.fillStyle = PALETTE.sandbag;
  for (const side of [gateLeft - 2, gateRight + 1]) {
    for (let y = wallTop - 5; y < wallTop; y++) {
      if ((y + (side > gateX ? 1 : 0)) % 2 === 0) dot(ctx, side, y, PALETTE.sandbag);
      else dot(ctx, side, y, PALETTE.dirt);
    }
  }

  // --- Tower emplacements, dug into the wall line.
  for (const tx of towerX) {
    const left = Math.floor(tx) - 5;
    ctx.fillStyle = PALETTE.wallStoneDark;
    ctx.fillRect(left - 1, wallTop - 5, 12, 5);
    ctx.fillStyle = PALETTE.towerBody;
    ctx.fillRect(left, wallTop - 4, 10, 10);
    ctx.fillStyle = PALETTE.wallStoneLight;
    ctx.fillRect(left, wallTop - 4, 10, 1);
    ctx.fillStyle = PALETTE.sandbag;
    for (let x = left; x < left + 10; x += 3) ctx.fillRect(x, wallTop - 5, 2, 1);
    // A dark emplacement mouth the barrel sits in (the barrel itself rotates,
    // so the renderer draws that each frame).
    ctx.fillStyle = PALETTE.towerBarrel;
    ctx.fillRect(Math.floor(tx) - 2, Math.floor(towerY) - Math.floor(wallTop) + wallTop - 4, 4, 4);
  }

  // --- Your compound, behind the wall: dirt, sandbag rows, crates, tents.
  ctx.fillStyle = PALETTE.dirtDark;
  ctx.fillRect(0, wallBottom, width, height - wallBottom);
  for (let i = 0; i < (height - wallBottom) * width * 0.12; i++) {
    dot(ctx, rand() * width, wallBottom + rand() * (height - wallBottom), PALETTE.dirt);
  }
  ctx.fillStyle = PALETTE.sandbag;
  for (let x = 2; x < width - 2; x += 5) {
    if (Math.abs(x - gateX) < gateHalfWidth + 2) continue;
    ctx.fillRect(x, wallBottom + 2, 4, 2);
  }
  // Crates and a command tent flanking the gate road.
  ctx.fillStyle = PALETTE.dirt;
  ctx.fillRect(gateX - 24, wallBottom + 7, 7, 6);
  ctx.fillRect(gateX + 18, wallBottom + 6, 9, 7);
  ctx.fillStyle = PALETTE.towerBody;
  ctx.fillRect(gateX - 23, wallBottom + 8, 5, 4);
  ctx.fillRect(gateX + 19, wallBottom + 7, 7, 5);
  // The road out of the gate.
  ctx.fillStyle = PALETTE.dirt;
  ctx.fillRect(gateX - gateHalfWidth + 2, wallBottom, gateHalfWidth * 2 - 4, height - wallBottom);

  return { canvas };
}
