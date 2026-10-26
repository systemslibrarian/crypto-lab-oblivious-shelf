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
 * Privacy argument within the protocol model (uniform independent randomness,
 * identical databases, no collusion, and a server view limited to its query):
 *   - Server A sees S — uniformly random, independent of i.
 *   - Server B sees S △ {i} — also uniformly random (toggling i in a
 *     random set yields a random set), independent of i.
 *   - Neither protocol query alone has any information about i.
 */

export interface PIRResult {
  subsetS: Set<number>;
  subsetS2: Set<number>;   // S △ {i}
  responseA: boolean;       // XOR of db bits at positions in S
  responseB: boolean;       // XOR of db bits at positions in S △ {i}
  recovered: boolean;       // responseA XOR responseB — the protocol's output
  directBit: boolean;       // db[i] read straight out of the database
  correct: boolean;         // recovered === directBit — checked, not assumed
  db: boolean[];            // the database snapshot used
}

/**
 * Keep public helpers from turning malformed input into unbounded allocations.
 * This is deliberately generous for a browser teaching demo; the live catalog
 * contains only 16 bits.
 */
export const MAX_DATABASE_BITS = 1_000_000;

const MAX_RANDOM_BYTES_PER_CALL = 65_536;

function assertSize(n: number, name: string, allowZero = true): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(n) || n < minimum || n > MAX_DATABASE_BITS) {
    throw new RangeError(
      `${name} must be a safe integer in [${minimum}, ${MAX_DATABASE_BITS}]`
    );
  }
}

function assertDatabase(db: boolean[], allowEmpty = true): void {
  if (!Array.isArray(db)) {
    throw new TypeError('db must be an array of booleans');
  }
  assertSize(db.length, 'db.length', allowEmpty);
  if (!db.every((bit) => typeof bit === 'boolean')) {
    throw new TypeError('db must contain only booleans');
  }
}

function assertIndex(index: number, name: string, upperExclusive = MAX_DATABASE_BITS): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= upperExclusive) {
    throw new RangeError(`${name} must be a safe integer in [0, ${upperExclusive})`);
  }
}

function assertSubset(
  subset: Set<number>,
  name: string,
  upperExclusive = MAX_DATABASE_BITS
): void {
  if (!(subset instanceof Set)) {
    throw new TypeError(`${name} must be a Set of indices`);
  }
  if (subset.size > MAX_DATABASE_BITS) {
    throw new RangeError(`${name} contains too many indices`);
  }
  for (const index of subset) {
    assertIndex(index, `${name} index`, upperExclusive);
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // Web Crypto limits a getRandomValues call to 65,536 bytes. Chunking keeps
  // every accepted public size inside that platform limit.
  for (let offset = 0; offset < bytes.length; offset += MAX_RANDOM_BYTES_PER_CALL) {
    crypto.getRandomValues(
      bytes.subarray(offset, Math.min(offset + MAX_RANDOM_BYTES_PER_CALL, bytes.length))
    );
  }
  return bytes;
}

/**
 * Generate a uniformly random subset of {0, ..., n-1}
 * using crypto.getRandomValues for an unbiased CSPRNG draw.
 */
export function randomSubset(n: number): Set<number> {
  assertSize(n, 'n');
  const subset = new Set<number>();
  if (n === 0) return subset;
  // Draw ceil(n/8) random bytes and consume them one bit at a time: each
  // element gets its own independent fair coin from a single CSPRNG draw.
  // Bit (j & 7) of byte (j >> 3) decides membership of element j. (Spending a
  // whole byte and reading only bit 0 per element — as an earlier version did —
  // is equally unbiased but wastes 7 of every 8 random bits.)
  const bytes = randomBytes(Math.ceil(n / 8));
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
  assertSubset(S, 'S');
  assertIndex(i, 'i');
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
  assertDatabase(db);
  assertSubset(subset, 'subset', db.length);
  return xorResponseUnchecked(db, subset);
}

function xorResponseUnchecked(db: boolean[], subset: Set<number>): boolean {
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
  assertDatabase(db, false);
  const snapshot = db.slice();
  const n = snapshot.length;
  assertIndex(targetIndex, 'targetIndex', n);

  // Step 2: random subset S
  const subsetS = randomSubset(n);

  // Step 3: S △ {i}
  const subsetS2 = symmetricDifferenceWithElement(subsetS, targetIndex);

  // Steps 4–5: server responses
  const responseA = xorResponseUnchecked(snapshot, subsetS);
  const responseB = xorResponseUnchecked(snapshot, subsetS2);

  // Step 6: client recovers db[i]
  const recovered = responseA !== responseB; // XOR of two booleans

  // Correctness check. The page claims r_A ⊕ r_B = db[i]; rather than assert
  // that, read db[i] directly and compare. `correct` is the only thing the UI
  // is allowed to print a "verified" verdict from — if the protocol were
  // implemented wrongly this would go false and the page would say so.
  const directBit = snapshot[targetIndex];
  const correct = recovered === directBit;

  return {
    subsetS,
    subsetS2,
    responseA,
    responseB,
    recovered,
    directBit,
    correct,
    db: snapshot,
  };
}

/**
 * The anonymity set: every target index that is consistent with what ONE
 * server observed.
 *
 * The page used to assert "Server A cannot distinguish which element of S (if
 * any) is the target" as a fixed sentence. This derives it instead. Once the
 * observed view is validated as a legal subset, every candidate j survives:
 * for Server A the implied draw is the view itself; for Server B it is
 * view △ {j}. Both are legal draws with non-zero probability.
 *
 * The model this encodes is the one `randomSubset` implements: S is drawn
 * uniformly over all subsets of {0..n-1}, independently of the target. If that
 * ever stops being true — if some future edit made the target's membership in S
 * depend on the target — this function's model would have to change with it,
 * and `pir.test.ts` pins the independence empirically so the drift is caught.
 */
export function consistentTargets(view: Set<number>, n: number, role: 'A' | 'B'): number[] {
  assertSize(n, 'n', false);
  assertSubset(view, 'view', n);
  if (role !== 'A' && role !== 'B') {
    throw new TypeError("role must be 'A' or 'B'");
  }
  return Array.from({ length: n }, (_, j) => j);
}

/**
 * Generate a random boolean database of length n using CSPRNG.
 */
export function generateDatabase(n: number): boolean[] {
  assertSize(n, 'n');
  const bytes = randomBytes(n);
  return Array.from(bytes, (b) => !!(b & 1));
}

/** Format a Set<number> as "{0, 3, 5, 9, 11, 14}" */
export function formatSet(s: Set<number>): string {
  assertSubset(s, 's');
  const sorted = [...s].sort((a, b) => a - b);
  return '{' + sorted.join(', ') + '}';
}

/** Build the XOR chain string for a given subset and db */
export function buildXorChain(db: boolean[], subset: Set<number>): string {
  const result = xorResponse(db, subset);
  const sorted = [...subset].sort((a, b) => a - b);
  if (sorted.length === 0) return '(empty set) = 0';
  const terms = sorted.map((j) => `db[${j}](${db[j] ? '1' : '0'})`);
  return terms.join(' ⊕ ') + ' = ' + (result ? '1' : '0');
}
