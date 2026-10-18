/** math.ts — small geometry helpers shared by the engine and the abilities. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Move (x, y) toward (tx, ty) by at most `step`; returns the new position. */
export function stepToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  step: number,
): { x: number; y: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= 1e-6 || d <= step) return { x: tx, y: ty };
  return { x: x + (dx / d) * step, y: y + (dy / d) * step };
}

export function angleTo(x: number, y: number, tx: number, ty: number): number {
  return Math.atan2(ty - y, tx - x);
}
