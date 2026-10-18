/**
 * pixel.ts — string-art sprites baked into offscreen canvases.
 *
 * Sprites are authored as rows of characters, one character per pixel, and
 * baked once at startup into a canvas each. Drawing is then a single
 * `drawImage` per unit with smoothing off, which is both fast and genuinely
 * pixel-exact — no filtering, no half-pixel blur.
 *
 * Character slots are shared by every silhouette, so one grid can be recoloured
 * per unit kind from the four-colour ramp in its roster entry:
 *   '1' body      '2' highlight      '3' accent (skin, glow, trim)
 *   '4' outline   '.' or ' ' transparent
 */

export type PixelGrid = readonly string[];

/** The four-colour ramp a unit kind supplies: [body, highlight, accent, outline]. */
export type Ramp = readonly [string, string, string, string];

export interface Sprite {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

/** Bake a grid into a sprite, one grid character per pixel. */
export function bake(grid: PixelGrid, ramp: Ramp): Sprite {
  const height = grid.length;
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const colors: Record<string, string> = {
    '1': ramp[0],
    '2': ramp[1],
    '3': ramp[2],
    '4': ramp[3],
  };

  for (let y = 0; y < height; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { canvas, width, height };
}

/**
 * The walk frame: the whole body lifted by one pixel. At this scale a one-pixel
 * bob reads as a stride, and it means every silhouette needs authoring once.
 */
export function bobbed(grid: PixelGrid): PixelGrid {
  const blank = ' '.repeat(grid.reduce((w, row) => Math.max(w, row.length), 0));
  return [...grid.slice(1), blank];
}

/** A flat silhouette of a grid in one colour, for hit flashes. */
export function bakeFlat(grid: PixelGrid, color: string): Sprite {
  return bake(grid, [color, color, color, color]);
}

/** A standalone canvas the caller draws into (backgrounds, baked terrain). */
export function createLayer(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
