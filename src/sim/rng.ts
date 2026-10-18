/**
 * rng.ts — a tiny deterministic PRNG (mulberry32).
 *
 * The whole generator state is one 32-bit integer, stored in
 * `SimState.rngState`, so a run is reproducible from its seed: wave plans,
 * spawn positions and scatter are identical for the same seed and the same
 * player inputs, which is what lets the tests assert exact outcomes.
 *
 * Pure by convention: pass a state in, get a value and the next state back.
 */

/** Hash a seed into a well-mixed initial generator state. */
export function seedState(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Advance the generator: the next float in [0, 1) and the next state. */
export function nextFloat(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  const s = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Integer in [min, max], inclusive. */
export function nextInt(state: number, min: number, max: number): { value: number; state: number } {
  const r = nextFloat(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

/**
 * A stream whose state is threaded for you. Deliberately not stored in
 * `SimState`: callers construct one from a state value, use it, and write
 * `stream.state` back, which keeps determinism explicit at the call site.
 */
export class RngStream {
  constructor(public state: number) {}

  float(): number {
    const r = nextFloat(this.state);
    this.state = r.state;
    return r.value;
  }

  int(min: number, max: number): number {
    const r = nextInt(this.state, min, max);
    this.state = r.state;
    return r.value;
  }

  /** Float in [-spread, +spread]. */
  spread(spread: number): number {
    return (this.float() * 2 - 1) * spread;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

/** Derive an independent stream from a seed and a label, e.g. a wave number. */
export function deriveSeed(seed: number, label: number): number {
  return seedState((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(label >>> 0, 0x85ebca6b)) >>> 0);
}
