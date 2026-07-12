import { describe, expect, it } from 'vitest';
import {
  buildXorChain,
  formatSet,
  generateDatabase,
  pirQuery,
  randomSubset,
  symmetricDifferenceWithElement,
  xorResponse,
} from './pir';

/**
 * These tests pin the two properties the demo's whole narrative rests on:
 *
 *   1. CORRECTNESS  — responseA XOR responseB == db[i], for every index, over
 *      every subset S (we brute-force all 2^n subsets on a small db).
 *   2. PRIVACY      — each server's view is a uniformly random subset that is
 *      statistically independent of the target index i. If randomSubset were
 *      biased, or S △ {i} leaked i, these tests would fail.
 *
 * A regression in randomSubset (e.g. off-by-one bit indexing) or in the XOR
 * recovery would be caught here rather than shipped silently.
 */

/** Enumerate every subset of {0,...,n-1} as Set<number>. */
function allSubsets(n: number): Set<number>[] {
  const out: Set<number>[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const s = new Set<number>();
    for (let j = 0; j < n; j++) if (mask & (1 << j)) s.add(j);
    out.push(s);
  }
  return out;
}

describe('xorResponse', () => {
  it('returns false (0) for the empty set', () => {
    expect(xorResponse([true, true, true], new Set())).toBe(false);
  });

  it('is the parity of the selected bits', () => {
    const db = [true, false, true, true]; // 1,0,1,1
    expect(xorResponse(db, new Set([0]))).toBe(true); // 1
    expect(xorResponse(db, new Set([0, 2]))).toBe(false); // 1^1 = 0
    expect(xorResponse(db, new Set([0, 2, 3]))).toBe(true); // 1^1^1 = 1
    expect(xorResponse(db, new Set([1, 3]))).toBe(true); // 0^1 = 1
  });

  it('matches manual parity over all subsets of a random db', () => {
    const db = generateDatabase(6);
    for (const s of allSubsets(6)) {
      const expected = [...s].reduce((acc, j) => acc !== db[j], false);
      expect(xorResponse(db, s)).toBe(expected);
    }
  });
});

describe('symmetricDifferenceWithElement', () => {
  it('adds i when absent and removes i when present', () => {
    const s = new Set([1, 3, 5]);
    expect([...symmetricDifferenceWithElement(s, 2)].sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);
    expect([...symmetricDifferenceWithElement(s, 3)].sort((a, b) => a - b)).toEqual([1, 5]);
  });

  it('does not mutate the input set', () => {
    const s = new Set([4]);
    symmetricDifferenceWithElement(s, 4);
    expect([...s]).toEqual([4]);
  });

  it('is an involution: applying twice restores the original set', () => {
    const s = new Set([0, 2, 7]);
    for (const i of [0, 3, 7, 9]) {
      const once = symmetricDifferenceWithElement(s, i);
      const twice = symmetricDifferenceWithElement(once, i);
      expect([...twice].sort((a, b) => a - b)).toEqual([...s].sort((a, b) => a - b));
    }
  });
});

describe('pirQuery — CORRECTNESS (recovers db[i])', () => {
  it('recovers the correct bit for every index across many random runs', () => {
    const n = 16;
    const db = generateDatabase(n);
    for (let i = 0; i < n; i++) {
      for (let trial = 0; trial < 50; trial++) {
        const r = pirQuery(db, i);
        expect(r.recovered).toBe(db[i]);
        // responseA XOR responseB must equal recovered, always.
        expect(r.responseA !== r.responseB).toBe(r.recovered);
        // S2 must be exactly S △ {i}.
        expect(r.subsetS2).toEqual(symmetricDifferenceWithElement(r.subsetS, i));
      }
    }
  });

  it('recovers correctly for EVERY subset S (brute force, empty set included)', () => {
    const n = 5;
    const db = generateDatabase(n);
    for (const S of allSubsets(n)) {
      for (let i = 0; i < n; i++) {
        const S2 = symmetricDifferenceWithElement(S, i);
        const a = xorResponse(db, S);
        const b = xorResponse(db, S2);
        // The empty-S case exercises the "server sees {}" edge explicitly.
        expect(a !== b).toBe(db[i]);
      }
    }
  });

  it('throws RangeError on out-of-range target index', () => {
    const db = generateDatabase(8);
    expect(() => pirQuery(db, -1)).toThrow(RangeError);
    expect(() => pirQuery(db, 8)).toThrow(RangeError);
    expect(() => pirQuery(db, 100)).toThrow(RangeError);
  });
});

describe('randomSubset — unbiased and well-formed', () => {
  it('only ever contains valid indices in [0, n)', () => {
    const n = 20;
    for (let t = 0; t < 200; t++) {
      for (const j of randomSubset(n)) {
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(n);
        expect(Number.isInteger(j)).toBe(true);
      }
    }
  });

  it('returns an empty set for n <= 0', () => {
    expect(randomSubset(0).size).toBe(0);
    expect(randomSubset(-3).size).toBe(0);
  });

  it('each element is included ~50% of the time (fair coin per element)', () => {
    const n = 16;
    const trials = 6000;
    const counts = new Array(n).fill(0);
    for (let t = 0; t < trials; t++) {
      const s = randomSubset(n);
      for (const j of s) counts[j]++;
    }
    // Each count is Binomial(trials, 0.5): mean 3000, sd ~38.7. A ~10 sigma
    // window [2600, 3400] makes flakes astronomically unlikely while still
    // catching a stuck bit (always-0 or always-1) or a biased draw.
    for (let j = 0; j < n; j++) {
      expect(counts[j]).toBeGreaterThan(2600);
      expect(counts[j]).toBeLessThan(3400);
    }
  });

  it('produces varied subsets (not a constant) across runs', () => {
    const seen = new Set<string>();
    for (let t = 0; t < 100; t++) seen.add(formatSet(randomSubset(16)));
    expect(seen.size).toBeGreaterThan(50);
  });
});

describe('PRIVACY — server views are independent of the target index', () => {
  /**
   * The security claim: Server A sees S (uniform, independent of i) and Server
   * B sees S △ {i} (also uniform, independent of i). We test index-independence
   * empirically: for a FIXED subset-generating stream, the marginal
   * distribution of "does element k appear in the server's view" must not
   * depend on which i was queried.
   *
   * Concretely: for Server B's view (S △ {i}), the probability that element k
   * is present is 0.5 for every k regardless of i — because toggling one
   * element of a uniform random set yields another uniform random set.
   */
  it("Server B's view (S △ {i}) is uniform for every target i", () => {
    const n = 12;
    const trials = 4000;
    for (const i of [0, 5, 11]) {
      const counts = new Array(n).fill(0);
      for (let t = 0; t < trials; t++) {
        const S = randomSubset(n);
        const view = symmetricDifferenceWithElement(S, i);
        for (const k of view) counts[k]++;
      }
      // Every element (including the toggled i) appears ~50% of the time.
      // If i leaked, element i would appear at a rate != 0.5.
      for (let k = 0; k < n; k++) {
        expect(counts[k]).toBeGreaterThan(trials * 0.42);
        expect(counts[k]).toBeLessThan(trials * 0.58);
      }
    }
  });

  it('the two server views differ in exactly one element: the target i', () => {
    const n = 16;
    const db = generateDatabase(n);
    for (let i = 0; i < n; i++) {
      const r = pirQuery(db, i);
      const inA = r.subsetS.has(i);
      const inB = r.subsetS2.has(i);
      // Element i toggles between the two views; all others are identical.
      expect(inA).not.toBe(inB);
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        expect(r.subsetS.has(k)).toBe(r.subsetS2.has(k));
      }
    }
  });

  it('mean server-view size is ~n/2, independent of target index', () => {
    const n = 16;
    const trials = 3000;
    for (const i of [0, 8, 15]) {
      const db = generateDatabase(n);
      let sumA = 0;
      let sumB = 0;
      for (let t = 0; t < trials; t++) {
        const r = pirQuery(db, i);
        sumA += r.subsetS.size;
        sumB += r.subsetS2.size;
      }
      // Mean of Binomial(16, .5) = 8. Allow a generous band.
      expect(sumA / trials).toBeGreaterThan(7);
      expect(sumA / trials).toBeLessThan(9);
      expect(sumB / trials).toBeGreaterThan(7);
      expect(sumB / trials).toBeLessThan(9);
    }
  });
});

describe('presentation helpers', () => {
  it('formatSet renders a sorted brace list', () => {
    expect(formatSet(new Set([5, 1, 3]))).toBe('{1, 3, 5}');
    expect(formatSet(new Set())).toBe('{}');
  });

  it('buildXorChain handles the empty set and non-empty chains', () => {
    const db = [true, false, true];
    expect(buildXorChain(db, new Set())).toBe('(empty set) = 0');
    expect(buildXorChain(db, new Set([0, 2]))).toContain('db[0](1)');
    expect(buildXorChain(db, new Set([0, 2]))).toContain('= 0'); // 1 ^ 1 = 0
  });

  it('generateDatabase yields a boolean array of the requested length', () => {
    const db = generateDatabase(10);
    expect(db).toHaveLength(10);
    expect(db.every((b) => typeof b === 'boolean')).toBe(true);
  });
});
