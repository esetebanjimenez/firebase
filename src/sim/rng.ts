/**
 * rng.ts — a tiny deterministic PRNG (mulberry32).
 *
 * The generator's entire state is a single 32-bit integer, which we store in
 * `SimState.rngState`. That makes the whole simulation reproducible: the same
 * seed + the same inputs always produce the same run, for both the live engine
 * and offline progress, and lets tests assert exact outcomes.
 *
 * Usage pattern (pure-ish): pass in the current state, get back the next value
 * and the next state. Callers thread the state through `SimState`.
 */

/** Hash a seed into a well-mixed initial generator state. */
export function seedState(seed: number): number {
  // Mix the seed so small seeds (0, 1, 2) still produce distinct streams.
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Advance the generator. Returns the next float in [0, 1) and the next state. */
export function nextFloat(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  const s = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Integer in [min, max] inclusive. */
export function nextInt(state: number, min: number, max: number): { value: number; state: number } {
  const r = nextFloat(state);
  const span = max - min + 1;
  return { value: min + Math.floor(r.value * span), state: r.state };
}
