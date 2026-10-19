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
  const { width, height, wallTop, wallThickness, gateX, gateHalfWidth, towerX } = cfg.field;
  const { canvas, ctx } = createLayer(width, height);
  const rand = rng(cfg.seed * 7919 + 13);

  // --- Open ground, dithered so a flat colour doesn't read as a void.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, width, wallTop);
  for (let i = 0; i < width * wallTop * 0.07; i++) {
    const x = rand() * width;
    const y = rand() * wallTop;
    dot(ctx, x, y, rand() < 0.5 ? PALETTE.grassLight : PALETTE.grassDark);
  }

  // --- The approach: ground churned to dirt by every wave that came before,
  // funnelling from the open top down to the gate.
  for (let y = 0; y < wallTop; y++) {
    const t = y / wallTop;
    const centre = width / 2 + (gateX - width / 2) * t;
    const halfWidth = 18 + 18 * t; // widest where the fighting ends up, by the gate
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
  for (let i = 0; i < 44; i++) {
    const id = props[Math.floor(rand() * props.length)];
    const x = 8 + rand() * (width - 20);
    const y = 12 + rand() * (wallTop - 60);
    const onApproach = Math.abs(x - (width / 2 + (gateX - width / 2) * (y / wallTop))) < 32;
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
    dot(ctx, x, wallTop, x % 12 < 6 ? PALETTE.wallStoneLight : PALETTE.wallStoneDark);
    dot(ctx, x, wallTop + 1, PALETTE.wallStoneLight);
    dot(ctx, x, wallTop + 2, PALETTE.wallStoneLight);
  }
  // Block courses: mortar lines, with the vertical joints offset per row.
  for (let y = wallTop + 6; y < wallBottom; y += 6) {
    for (let x = 0; x < width; x++) dot(ctx, x, y, PALETTE.wallStoneDark);
    const offset = ((y - wallTop) / 6) % 2 === 0 ? 0 : 12;
    for (let x = offset; x < width; x += 24) {
      for (let dy = 1; dy < 6 && y + dy < wallBottom; dy++) dot(ctx, x, y + dy, PALETTE.wallStoneDark);
    }
  }

  // The gate: a dark opening with a steel grille and a lintel over it.
  const gateLeft = gateX - gateHalfWidth;
  const gateRight = gateX + gateHalfWidth;
  ctx.fillStyle = PALETTE.dirtDark;
  ctx.fillRect(gateLeft, wallTop + 4, gateRight - gateLeft, wallThickness - 4);
  ctx.fillStyle = PALETTE.gateMetal;
  for (let x = gateLeft + 2; x < gateRight; x += 6) {
    ctx.fillRect(x, wallTop + 6, 2, wallThickness - 8);
  }
  ctx.fillStyle = PALETTE.gateMetalLight;
  ctx.fillRect(gateLeft, wallTop + 4, gateRight - gateLeft, 2);
  ctx.fillRect(gateLeft, wallBottom - 2, gateRight - gateLeft, 2);
  // Sandbagged lane out of the gate, so the exit reads as a chokepoint.
  ctx.fillStyle = PALETTE.sandbag;
  for (const side of [gateLeft - 4, gateRight + 2]) {
    for (let y = wallTop - 10; y < wallTop; y++) {
      if ((y + (side > gateX ? 1 : 0)) % 2 === 0) dot(ctx, side, y, PALETTE.sandbag);
      else dot(ctx, side, y, PALETTE.dirt);
    }
  }

  // --- Gun pads, dug into the wall line: the stonework for all four, empty.
  // The guns themselves are drawn per frame from the ones actually bought, so
  // a new player looks at four bare emplacements and sees what the Towers
  // upgrade is for.
  for (const tx of towerX) {
    const left = Math.floor(tx) - 10;
    ctx.fillStyle = PALETTE.wallStoneDark;
    ctx.fillRect(left - 2, wallTop - 10, 24, 10);
    ctx.fillStyle = PALETTE.wallStoneLight;
    ctx.fillRect(left, wallTop - 8, 20, 2);
    ctx.fillStyle = PALETTE.sandbag;
    for (let x = left; x < left + 20; x += 6) ctx.fillRect(x, wallTop - 10, 4, 2);
  }

  // --- Your compound, behind the wall: dirt, sandbag rows, crates, tents.
  ctx.fillStyle = PALETTE.dirtDark;
  ctx.fillRect(0, wallBottom, width, height - wallBottom);
  for (let i = 0; i < (height - wallBottom) * width * 0.1; i++) {
    dot(ctx, rand() * width, wallBottom + rand() * (height - wallBottom), PALETTE.dirt);
  }
  ctx.fillStyle = PALETTE.sandbag;
  for (let x = 4; x < width - 4; x += 10) {
    if (Math.abs(x - gateX) < gateHalfWidth + 4) continue;
    ctx.fillRect(x, wallBottom + 4, 8, 4);
  }
  // Crates and a command tent flanking the gate road.
  ctx.fillStyle = PALETTE.dirt;
  ctx.fillRect(gateX - 48, wallBottom + 14, 14, 12);
  ctx.fillRect(gateX + 36, wallBottom + 12, 18, 14);
  ctx.fillStyle = PALETTE.towerBody;
  ctx.fillRect(gateX - 46, wallBottom + 16, 10, 8);
  ctx.fillRect(gateX + 38, wallBottom + 14, 14, 10);
  // The road out of the gate.
  ctx.fillStyle = PALETTE.dirt;
  ctx.fillRect(gateX - gateHalfWidth + 4, wallBottom, gateHalfWidth * 2 - 8, height - wallBottom);

  return { canvas };
}
