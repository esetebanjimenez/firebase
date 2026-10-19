/**
 * layout.ts — where the field sits inside the visible canvas.
 *
 * Pulled out of the renderer because it is pure arithmetic with a judgement
 * call in it, and because the blit and the pointer mapping have to agree: if
 * they ever disagree, taps land somewhere other than where the reticle is.
 *
 * The judgement call is snapping. Nearest-neighbour upscaling at a fractional
 * scale duplicates some pixel rows and drops others, and the pattern shifts as
 * things move, which reads as a shimmer across every sprite. Drawing at a whole
 * number of device pixels per field pixel removes it. But snapping is only
 * worth it when it is nearly free: forcing 1.65x down to 1x would throw away
 * 40% of the picture to fix a shimmer, which is a bad trade.
 */

export interface FieldLayout {
  /** Device pixels per field pixel. */
  readonly scale: number;
  /** Top-left of the drawn field, in device pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Drawn size, in device pixels. */
  readonly width: number;
  readonly height: number;
  /** True when the scale is a whole number of device pixels. */
  readonly snapped: boolean;
}

/**
 * Letterboxing costs size the player can see; cropping cuts the play area off
 * the edges. So we accept a generous shrink to reach an integer scale, and only
 * a sliver of overflow.
 */
const MAX_SHRINK = 0.12;
const MAX_OVERFLOW = 0.03;

export function fieldLayout(
  canvasWidth: number,
  canvasHeight: number,
  fieldWidth: number,
  fieldHeight: number,
): FieldLayout {
  const fit = Math.min(canvasWidth / fieldWidth, canvasHeight / fieldHeight) || 1;

  let scale = fit;
  let snapped = false;
  const down = Math.floor(fit);
  const up = Math.ceil(fit);
  if (down >= 1 && 1 - down / fit <= MAX_SHRINK) {
    scale = down;
    snapped = true;
  } else if (up >= 1 && up / fit - 1 <= MAX_OVERFLOW) {
    scale = up;
    snapped = true;
  }

  const width = fieldWidth * scale;
  const height = fieldHeight * scale;
  return {
    scale,
    width,
    height,
    // Whole-pixel offsets, or the snapping is undone by a half-pixel origin.
    offsetX: Math.round((canvasWidth - width) / 2),
    offsetY: Math.round((canvasHeight - height) / 2),
    snapped,
  };
}
