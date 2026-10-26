import { describe, expect, it } from 'vitest';
import {
  GF8_MODULUS,
  assertGF8,
  gf8Add,
  gf8Div,
  gf8EvalLine,
  gf8InterpolateLine,
  gf8Inv,
  gf8Mul,
  gf8Pow,
  type GF8,
} from './gf8.ts';
import {
  ROBUST_SERVER_POINTS,
  buildRobustQueries,
  colludeRobustQueries,
  createRobustTranscript,
  decodeRobustReplies,
  fieldElementsFromBytes,
  robustAnswerSlope,
  robustCommunicationCost,
  robustServerAnswer,
  runRobustPlan,
  runRobustScenario,
  singleServerCandidateTargets,
  type ReceivedReply,
} from './robust-pir.ts';

const ADDITION_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [1, 0, 3, 2, 5, 4, 7, 6],
  [2, 3, 0, 1, 6, 7, 4, 5],
  [3, 2, 1, 0, 7, 6, 5, 4],
  [4, 5, 6, 7, 0, 1, 2, 3],
  [5, 4, 7, 6, 1, 0, 3, 2],
  [6, 7, 4, 5, 2, 3, 0, 1],
  [7, 6, 5, 4, 3, 2, 1, 0],
] as const;

const MULTIPLICATION_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 2, 4, 6, 3, 1, 7, 5],
  [0, 3, 6, 5, 7, 4, 1, 2],
  [0, 4, 3, 7, 6, 2, 5, 1],
  [0, 5, 1, 4, 2, 7, 3, 6],
  [0, 6, 7, 1, 5, 3, 2, 4],
  [0, 7, 5, 2, 1, 6, 4, 3],
] as const;

function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask += 1) {
    out.push(items.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
}

function slopeVectors(length: number): GF8[][] {
  const count = 8 ** length;
  return Array.from({ length: count }, (_, encoded) => {
    let remaining = encoded;
    return Array.from({ length }, () => {
      const value = remaining & 0b111;
      remaining = Math.floor(remaining / 8);
      return value;
    });
  });
}

function receivedFrom(
  transcript: ReturnType<typeof createRobustTranscript>,
  keepServerIds: readonly number[]
): ReceivedReply[] {
  return transcript.servers
    .filter((server) => keepServerIds.includes(server.serverId))
    .map(({ serverId, point, answer }) => ({ serverId, point, answer }));
}

describe('GF(8) polynomial-basis arithmetic', () => {
  it('pins z^3 + z + 1 and the complete addition and multiplication tables', () => {
    expect(GF8_MODULUS).toBe(0b1011);
    for (let a = 0; a < 8; a += 1) {
      for (let b = 0; b < 8; b += 1) {
        expect(gf8Add(a, b), `${a} + ${b}`).toBe(ADDITION_TABLE[a][b]);
        expect(gf8Mul(a, b), `${a} * ${b}`).toBe(MULTIPLICATION_TABLE[a][b]);
      }
    }
  });

  it('has the field identities, all seven inverses, associativity, and distributivity', () => {
    for (let a = 0; a < 8; a += 1) {
      expect(gf8Add(a, 0)).toBe(a);
      expect(gf8Add(a, a)).toBe(0);
      expect(gf8Mul(a, 0)).toBe(0);
      expect(gf8Mul(a, 1)).toBe(a);
      if (a !== 0) {
        expect(gf8Mul(a, gf8Inv(a))).toBe(1);
        expect(gf8Pow(a, 7)).toBe(1);
      }
      for (let b = 0; b < 8; b += 1) {
        expect(gf8Mul(a, b)).toBe(gf8Mul(b, a));
        for (let c = 0; c < 8; c += 1) {
          expect(gf8Mul(gf8Mul(a, b), c)).toBe(gf8Mul(a, gf8Mul(b, c)));
          expect(gf8Mul(a, gf8Add(b, c))).toBe(
            gf8Add(gf8Mul(a, b), gf8Mul(a, c))
          );
        }
      }
    }
  });

  it('interpolates lines over the field rather than with integer arithmetic', () => {
    const line = { constant: 1, slope: 6 };
    expect(ROBUST_SERVER_POINTS.map((x) => gf8EvalLine(line, x))).toEqual([7, 6, 0, 4, 2]);
    for (const [x1, x2] of [[1, 2], [1, 5], [3, 4]] as const) {
      expect(
        gf8InterpolateLine(x1, gf8EvalLine(line, x1), x2, gf8EvalLine(line, x2))
      ).toEqual(line);
    }
  });

  it('rejects malformed elements, division by zero, and duplicate interpolation points', () => {
    for (const value of [-1, 8, 1.5, NaN, Infinity]) {
      expect(() => assertGF8(value)).toThrow(RangeError);
    }
    expect(() => gf8Inv(0)).toThrow(/zero/);
    expect(() => gf8Div(1, 0)).toThrow(/zero/);
    expect(() => gf8InterpolateLine(1, 2, 1, 3)).toThrow(/distinct/);
  });
});

describe('robust unit-vector query and answer computation', () => {
  it('maps Web Crypto bytes uniformly to all eight slopes, including zero', () => {
    expect(fieldElementsFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(fieldElementsFromBytes(Uint8Array.from([8, 9, 254, 255])))
      .toEqual([0, 1, 6, 7]);
    expect(() => fieldElementsFromBytes([0] as unknown as Uint8Array)).toThrow(TypeError);
  });

  it('reproduces the independently derived GF(8) fixture exactly', () => {
    const database = [true, false, true, true];
    const slopes = [2, 5, 7, 3];
    const transcript = createRobustTranscript(database, 2, slopes);

    expect(transcript.slopes).toEqual(slopes);
    expect(transcript.servers.map((server) => server.vector)).toEqual([
      [2, 5, 6, 3],
      [4, 1, 4, 6],
      [6, 4, 3, 5],
      [3, 2, 0, 7],
      [1, 7, 7, 4],
    ]);
    expect(robustAnswerSlope(database, slopes)).toBe(6);
    expect(transcript.answerLine).toEqual({ constant: 1, slope: 6 });
    expect(transcript.servers.map((server) => server.answer)).toEqual([7, 6, 0, 4, 2]);
    expect(transcript.directBit).toBe(1);
  });

  it('makes each server compute the displayed dot product, including all-zero and all-one data', () => {
    const slopes = [0, 1, 2, 3];
    const { queries } = buildRobustQueries(1, 4, slopes);
    for (const query of queries) {
      expect(robustServerAnswer([false, false, false, false], query)).toBe(0);
      const independentAllOne = query.vector.reduce((sum, value) => sum ^ value, 0);
      expect(robustServerAnswer([true, true, true, true], query)).toBe(independentAllOne);
    }
    expect(new Set(queries.map((query) => robustServerAnswer([true, false, true, false], query))).size)
      .toBeGreaterThan(1);
  });

  it('recovers every reduced-database target for every slope vector and every server pair', () => {
    const database = [true, false, true];
    const pairs = subsets([1, 2, 3, 4, 5]).filter((set) => set.length === 2);
    for (let target = 0; target < database.length; target += 1) {
      for (const slopes of slopeVectors(database.length)) {
        const transcript = createRobustTranscript(database, target, slopes);
        for (const pair of pairs) {
          const decoded = decodeRobustReplies(receivedFrom(transcript, pair));
          expect(decoded.status).toBe('accepted');
          expect(decoded.accepted?.constant).toBe(database[target] ? 1 : 0);
        }
      }
    }
  });

  it('takes defensive snapshots and rejects malformed dimensions and inputs', () => {
    const database = [true, false, true];
    const transcript = createRobustTranscript(database, 1, [0, 0, 0]);
    database[1] = true;
    expect(transcript.database).toEqual([true, false, true]);
    expect(transcript.directBit).toBe(0);

    expect(() => createRobustTranscript([], 0)).toThrow(RangeError);
    expect(() => createRobustTranscript([true, 1 as unknown as boolean], 0)).toThrow(TypeError);
    expect(() => buildRobustQueries(-1, 3, [0, 0, 0])).toThrow(RangeError);
    expect(() => buildRobustQueries(0, 3, [0, 0])).toThrow(RangeError);
    expect(() => buildRobustQueries(0, 3, [0, 0, 8])).toThrow(RangeError);
    expect(() => robustServerAnswer([true], { serverId: 1, point: 1, vector: [1, 0] }))
      .toThrow(RangeError);
  });
});

describe('one-server privacy and two-server collusion boundary', () => {
  it('has the same exact one-coordinate output census for secret zero and one at every point', () => {
    for (const point of ROBUST_SERVER_POINTS) {
      const census = (secret: GF8): number[] => {
        const counts = Array<number>(8).fill(0);
        for (let slope = 0; slope < 8; slope += 1) {
          counts[gf8Add(secret, gf8Mul(slope, point))] += 1;
        }
        return counts;
      };
      expect(census(0)).toEqual(Array(8).fill(1));
      expect(census(1)).toEqual(Array(8).fill(1));
      expect(census(0)).toEqual(census(1));
    }
  });

  it('derives all candidates from one actual query and the exact target from two', () => {
    const transcript = createRobustTranscript(
      [true, false, true, false, true, true],
      4,
      [0, 1, 2, 3, 4, 5]
    );
    for (const server of transcript.servers) {
      expect(singleServerCandidateTargets(server)).toEqual([0, 1, 2, 3, 4, 5]);
    }
    for (const [first, second] of subsets(transcript.servers).filter((set) => set.length === 2)) {
      const collusion = colludeRobustQueries(first, second);
      expect(collusion.validUnitVector).toBe(true);
      expect(collusion.constants).toEqual([0, 0, 0, 0, 1, 0]);
      expect(collusion.targetIndex).toBe(4);
      expect(collusion.slopes).toEqual(transcript.slopes);
    }
  });

  it('rejects fake collusion inputs that reuse an identity, point, or dimension', () => {
    const { queries } = buildRobustQueries(0, 2, [1, 2]);
    expect(() => colludeRobustQueries(queries[0], { ...queries[1], serverId: 1 }))
      .toThrow(/distinct server/);
    expect(() => colludeRobustQueries(queries[0], { ...queries[1], point: 1 }))
      .toThrow(/distinct evaluation/);
    expect(() => colludeRobustQueries(queries[0], { ...queries[1], vector: [1] }))
      .toThrow(/exactly 2/);
  });
});

describe('bounded Reed–Solomon answer decoding', () => {
  const fixture = createRobustTranscript([true, false, true, true], 2, [2, 5, 7, 3]);

  it('decodes every honest erasure pattern with at least two replies', () => {
    for (const kept of subsets([1, 2, 3, 4, 5]).filter((set) => set.length >= 2)) {
      const decoded = decodeRobustReplies(receivedFrom(fixture, kept));
      expect(decoded.status, `servers ${kept.join(',')}`).toBe('accepted');
      expect(decoded.accepted).toMatchObject({ constant: 1, slope: 6, agreement: kept.length });
    }
  });

  it('corrects every nonzero single-answer delta with zero or one erasure', () => {
    for (const corruptId of [1, 2, 3, 4, 5]) {
      for (let delta = 1; delta < 8; delta += 1) {
        for (const erasedId of [0, 1, 2, 3, 4, 5]) {
          if (erasedId === corruptId) continue;
          const replies = fixture.servers.flatMap(({ serverId, point, answer }) => {
            if (serverId === erasedId) return [];
            return [{
              serverId,
              point,
              answer: serverId === corruptId ? gf8Add(answer, delta) : answer,
            }];
          });
          const decoded = decodeRobustReplies(replies);
          expect(decoded.status, `corrupt ${corruptId}, delta ${delta}, erase ${erasedId}`).toBe('accepted');
          expect(decoded.accepted?.constant).toBe(1);
          expect(decoded.accepted?.disagreeingServerIds).toEqual([corruptId]);
        }
      }
    }
  });

  it('pins the four-reply corrupt-answer fixture and derives its outlier from agreements', () => {
    const replies: ReceivedReply[] = [
      { serverId: 1, point: 1, answer: 7 },
      { serverId: 2, point: 2, answer: 6 },
      { serverId: 3, point: 3, answer: 5 },
      { serverId: 4, point: 4, answer: 4 },
    ];
    const decoded = decodeRobustReplies(replies);
    expect(decoded).toMatchObject({ status: 'accepted', receivedCount: 4, radius: 1, threshold: 3 });
    expect(decoded.accepted).toMatchObject({
      constant: 1,
      slope: 6,
      agreement: 3,
      agreeingServerIds: [1, 2, 4],
      disagreeingServerIds: [3],
    });
    expect(decoded.candidates.map(({ constant, slope, agreement }) => ({ constant, slope, agreement })))
      .toEqual([
        { constant: 1, slope: 6, agreement: 3 },
        { constant: 0, slope: 3, agreement: 2 },
        { constant: 2, slope: 4, agreement: 2 },
        { constant: 6, slope: 1, agreement: 2 },
      ]);
  });

  it('refuses when the largest agreement is below the unique-decoding threshold', () => {
    const decoded = decodeRobustReplies([
      { serverId: 1, point: 1, answer: 0 },
      { serverId: 2, point: 2, answer: 0 },
      { serverId: 3, point: 3, answer: 0 },
      { serverId: 4, point: 4, answer: 1 },
      { serverId: 5, point: 5, answer: 2 },
    ]);
    expect(decoded.threshold).toBe(4);
    expect(decoded.candidates[0].agreement).toBe(3);
    expect(decoded.status).toBe('refused');
    expect(decoded.accepted).toBeNull();
  });

  it('pins an exceeded-bound run that accepts the wrong answer', () => {
    const decoded = decodeRobustReplies([
      { serverId: 1, point: 1, answer: 0 },
      { serverId: 2, point: 2, answer: 0 },
      { serverId: 3, point: 3, answer: 0 },
      { serverId: 4, point: 4, answer: 4 },
    ]);
    expect(decoded.status).toBe('accepted');
    expect(decoded.accepted).toMatchObject({ constant: 0, slope: 0, agreement: 3 });
    expect(decoded.accepted?.constant).not.toBe(fixture.directBit);
  });

  it('never treats missing replies as zero and rejects malformed identifiers and points', () => {
    expect(decodeRobustReplies([])).toMatchObject({ status: 'insufficient', receivedCount: 0 });
    expect(decodeRobustReplies([{ serverId: 1, point: 1, answer: 7 }]))
      .toMatchObject({ status: 'insufficient', receivedCount: 1 });
    expect(() => decodeRobustReplies([
      { serverId: 1, point: 1, answer: 7 },
      { serverId: 1, point: 2, answer: 6 },
    ])).toThrow(/duplicate server/);
    expect(() => decodeRobustReplies([
      { serverId: 1, point: 1, answer: 7 },
      { serverId: 2, point: 1, answer: 6 },
    ])).toThrow(/duplicate evaluation/);
    expect(() => decodeRobustReplies([
      { serverId: 1, point: 0, answer: 7 },
      { serverId: 2, point: 2, answer: 6 },
    ])).toThrow(/nonzero/);
    expect(() => decodeRobustReplies([
      { serverId: 1, point: 1, answer: 8 },
      { serverId: 2, point: 2, answer: 6 },
    ])).toThrow(RangeError);
  });
});

describe('fault scenarios and declared threshold', () => {
  const database = [true, false, true, true];
  const slopes = [2, 5, 7, 3];

  it.each([
    ['honest', 0, 0, true],
    ['one-erasure', 1, 0, true],
    ['three-erasures', 3, 0, true],
    ['one-byzantine', 0, 1, true],
    ['one-byzantine-one-erasure', 1, 1, true],
    ['stale-replica', 0, 1, true],
    ['beyond-bound', 1, 2, false],
  ] as const)('%s derives u, b, 2b+u, and the guarantee', (scenario, u, b, guaranteed) => {
    const result = runRobustScenario(database, 2, scenario, slopes);
    expect(result.unavailableCount).toBe(u);
    expect(result.wrongAnswerCount).toBe(b);
    expect(result.thresholdScore).toBe(2 * b + u);
    expect(result.guaranteeMet).toBe(guaranteed);
    if (guaranteed) {
      expect(result.decode.status).toBe('accepted');
      expect(result.acceptedMatchesDirect).toBe(true);
    }
  });

  it('computes a stale reply from a changed replica rather than a scenario label', () => {
    const result = runRobustScenario(database, 2, 'stale-replica', slopes);
    const stale = result.replies.find((reply) => reply.state === 'stale');
    expect(stale).toBeDefined();
    const changed = [...result.transcript.database];
    changed[result.transcript.targetIndex] = !changed[result.transcript.targetIndex];
    expect(stale?.transmittedAnswer).toBe(robustServerAnswer(changed, stale!));
    expect(stale?.transmittedAnswer).not.toBe(stale?.answer);
  });

  it('labels the exceeded run before reporting its empirically wrong accepted value', () => {
    const result = runRobustScenario(database, 2, 'beyond-bound', slopes);
    expect(result.thresholdScore).toBe(5);
    expect(result.guaranteeMet).toBe(false);
    expect(result.decode.status).toBe('accepted');
    expect(result.decode.accepted?.constant).toBe(0);
    expect(result.acceptedMatchesDirect).toBe(false);
  });

  it('executes independent per-server unavailable, delta, and stale controls', () => {
    const result = runRobustPlan(database, 2, [
      { serverId: 1, kind: 'unavailable' },
      { serverId: 2, kind: 'corrupt', delta: 7 },
      { serverId: 4, kind: 'stale' },
    ], slopes);
    expect(result.scenario).toBe('custom');
    expect(result.replies.map(({ state }) => state)).toEqual([
      'unavailable',
      'corrupted',
      'honest',
      'stale',
      'honest',
    ]);
    expect(result.replies[0].transmittedAnswer).toBeNull();
    expect(result.replies[1].transmittedAnswer).toBe(gf8Add(result.replies[1].answer, 7));
    const staleDatabase = [...result.transcript.database];
    staleDatabase[2] = !staleDatabase[2];
    expect(result.replies[3].transmittedAnswer).toBe(
      robustServerAnswer(staleDatabase, result.replies[3])
    );
  });

  it('rejects contradictory or malformed custom fault controls', () => {
    expect(() => runRobustPlan(database, 2, [
      { serverId: 1, kind: 'corrupt', delta: 0 },
    ], slopes)).toThrow(/nonzero/);
    expect(() => runRobustPlan(database, 2, [
      { serverId: 1, kind: 'honest', delta: 1 },
    ], slopes)).toThrow(/only a corrupt/);
    expect(() => runRobustPlan(database, 2, [
      { serverId: 1, kind: 'honest' },
      { serverId: 1, kind: 'unavailable' },
    ], slopes)).toThrow(/duplicate fault plan/);
    expect(() => runRobustPlan(database, 2, [
      { serverId: 6, kind: 'honest' },
    ], slopes)).toThrow(/\[1, 5\]/);
  });

  it('pins every erasure/corruption boundary value to 2b+u <= 3', () => {
    for (let unavailable = 0; unavailable <= 5; unavailable += 1) {
      const replies = 5 - unavailable;
      for (let wrong = 0; wrong <= replies; wrong += 1) {
        const score = 2 * wrong + unavailable;
        const radius = Math.max(0, Math.floor((replies - 2) / 2));
        expect(score <= 3).toBe(replies >= 2 && wrong <= radius);
      }
    }
  });
});

describe('derived communication comparison', () => {
  it('derives the 16-bit baseline and five-server algebraic payloads', () => {
    const costs = robustCommunicationCost(16);
    expect(costs).toEqual({
      databaseBits: 16,
      fieldBits: 3,
      baseline: {
        replicas: 2,
        queryBitsPerServer: 16,
        totalQueryBits: 32,
        fullReplyBits: 2,
        totalBits: 34,
        honestRepliesRequired: 2,
        privateAgainstServers: 1,
      },
      robust: {
        replicas: 5,
        queryBitsPerServer: 48,
        totalQueryBits: 240,
        fullReplyBits: 15,
        totalBits: 255,
        honestRepliesRequired: 2,
        privateAgainstServers: 1,
      },
    });
  });

  it('recomputes rather than hardcodes the payload when the database size changes', () => {
    const costs = robustCommunicationCost(7);
    expect(costs.baseline.totalBits).toBe(16);
    expect(costs.robust.queryBitsPerServer).toBe(21);
    expect(costs.robust.totalBits).toBe(120);
  });
});
