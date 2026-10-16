import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedState } from '../rng';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = seedState(42);
    const b = seedState(42);
    expect(a).toBe(b);

    let sa = a;
    let sb = b;
    for (let i = 0; i < 100; i++) {
      const ra = nextFloat(sa);
      const rb = nextFloat(sb);
      expect(ra.value).toBe(rb.value);
      sa = ra.state;
      sb = rb.state;
    }
  });

  it('produces distinct streams for distinct seeds', () => {
    const s1 = nextFloat(seedState(1)).value;
    const s2 = nextFloat(seedState(2)).value;
    const s3 = nextFloat(seedState(3)).value;
    expect(new Set([s1, s2, s3]).size).toBe(3);
  });

  it('returns floats in [0, 1)', () => {
    let s = seedState(7);
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it('nextInt stays within inclusive bounds', () => {
    let s = seedState(99);
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(s, 3, 7);
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(7);
      s = r.state;
    }
  });
});
