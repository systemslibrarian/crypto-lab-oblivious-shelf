/**
 * 2-server XOR PIR — Chor, Goldreich, Kushilevitz, Sudan (1995)
 *
 * Database: boolean array of length n (each element = 1 bit)
 * Protocol:
 *   1. Patron picks target index i (0 ≤ i < n)
 *   2. Patron generates a uniformly random subset S ⊆ {0,...,n-1}
 *   3. Query A = S, Query B = S △ {i}  (symmetric difference)
 *   4. Server A returns: XOR of db[j] for j ∈ S
 *   5. Server B returns: XOR of db[j] for j ∈ S △ {i}
 *   6. Patron computes: responseA XOR responseB = db[i]
 *
 * Privacy argument:
 *   - Server A sees S — uniformly random, independent of i.
 *   - Server B sees S △ {i} — also uniformly random (toggling i in a
 *     random set yields a random set), independent of i.
 *   - Neither server alone has any information about i.
 */

export interface PIRResult {
  subsetS: Set<number>;
  subsetS2: Set<number>;   // S △ {i}
  responseA: boolean;       // XOR of db bits at positions in S
  responseB: boolean;       // XOR of db bits at positions in S △ {i}
  recovered: boolean;       // responseA XOR responseB = db[i]
  db: boolean[];            // the database snapshot used
}

/**
 * Generate a uniformly random subset of {0, ..., n-1}
 * using crypto.getRandomValues for an unbiased CSPRNG draw.
 */
export function randomSubset(n: number): Set<number> {
  const subset = new Set<number>();
  if (n <= 0) return subset;
  // Draw ceil(n/8) random bytes and consume them one bit at a time: each
  // element gets its own independent fair coin from a single CSPRNG draw.
  // Bit (j & 7) of byte (j >> 3) decides membership of element j. (Spending a
  // whole byte and reading only bit 0 per element — as an earlier version did —
  // is equally unbiased but wastes 7 of every 8 random bits.)
  const bytes = new Uint8Array(Math.ceil(n / 8));
  crypto.getRandomValues(bytes);
  for (let j = 0; j < n; j++) {
    if ((bytes[j >> 3] >> (j & 7)) & 1) {
      subset.add(j);
    }
  }
  return subset;
}

/**
 * Compute the symmetric difference S △ {i}:
 *   if i ∈ S  →  result = S \ {i}
 *   if i ∉ S  →  result = S ∪ {i}
 */
export function symmetricDifferenceWithElement(
  S: Set<number>,
  i: number
): Set<number> {
  const result = new Set(S);
  if (result.has(i)) {
    result.delete(i);
  } else {
    result.add(i);
  }
  return result;
}

/**
 * Compute XOR of db[j] for all j in the given subset.
 * Returns false (0) for an empty subset.
 */
export function xorResponse(db: boolean[], subset: Set<number>): boolean {
  let result = false;
  for (const j of subset) {
    result = result !== db[j]; // boolean XOR
  }
  return result;
}

/**
 * Run the full 2-server XOR PIR protocol.
 *
 * @param db       - boolean database of n bits
 * @param targetIndex - the index the patron wants to retrieve (0 ≤ i < n)
 */
export function pirQuery(db: boolean[], targetIndex: number): PIRResult {
  const n = db.length;
  if (targetIndex < 0 || targetIndex >= n) {
    throw new RangeError(`targetIndex ${targetIndex} out of range [0, ${n})`);
  }

  // Step 2: random subset S
  const subsetS = randomSubset(n);

  // Step 3: S △ {i}
  const subsetS2 = symmetricDifferenceWithElement(subsetS, targetIndex);

  // Steps 4–5: server responses
  const responseA = xorResponse(db, subsetS);
  const responseB = xorResponse(db, subsetS2);

  // Step 6: client recovers db[i]
  const recovered = responseA !== responseB; // XOR of two booleans

  return { subsetS, subsetS2, responseA, responseB, recovered, db };
}

/**
 * Generate a random boolean database of length n using CSPRNG.
 */
export function generateDatabase(n: number): boolean[] {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => !!(b & 1));
}

/** Format a Set<number> as "{0, 3, 5, 9, 11, 14}" */
export function formatSet(s: Set<number>): string {
  const sorted = [...s].sort((a, b) => a - b);
  return '{' + sorted.join(', ') + '}';
}

/** Build the XOR chain string for a given subset and db */
export function buildXorChain(db: boolean[], subset: Set<number>): string {
  const sorted = [...subset].sort((a, b) => a - b);
  if (sorted.length === 0) return '(empty set) = 0';
  const terms = sorted.map((j) => `db[${j}](${db[j] ? '1' : '0'})`);
  const result = xorResponse(db, subset);
  return terms.join(' ⊕ ') + ' = ' + (result ? '1' : '0');
}
