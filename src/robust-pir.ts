import {
  GF8_BITS,
  assertGF8,
  gf8Add,
  gf8Div,
  gf8EvalLine,
  gf8InterpolateLine,
  gf8Mul,
  type GF8,
  type GF8Line,
} from './gf8.ts';

export const ROBUST_SERVER_POINTS = [1, 2, 3, 4, 5] as const;
export const ROBUST_SERVER_COUNT = ROBUST_SERVER_POINTS.length;
export const ROBUST_PRIVACY_THRESHOLD = 1;
export const ROBUST_HONEST_REPLIES = 2;
export const MAX_ROBUST_DATABASE_BITS = 65_536;

export interface RobustServerQuery {
  readonly serverId: number;
  readonly point: GF8;
  readonly vector: readonly GF8[];
}

export interface HonestServerResult extends RobustServerQuery {
  readonly answer: GF8;
}

export interface RobustTranscript {
  readonly database: readonly boolean[];
  readonly targetIndex: number;
  readonly slopes: readonly GF8[];
  readonly servers: readonly HonestServerResult[];
  readonly answerLine: GF8Line;
  readonly directBit: GF8;
}

export interface ReceivedReply {
  readonly serverId: number;
  readonly point: GF8;
  readonly answer: GF8;
}

export interface DecodeCandidate extends GF8Line {
  readonly agreement: number;
  readonly agreeingServerIds: readonly number[];
  readonly disagreeingServerIds: readonly number[];
}

export type DecodeStatus = 'accepted' | 'insufficient' | 'refused' | 'ambiguous';

export interface DecodeResult {
  readonly status: DecodeStatus;
  readonly receivedCount: number;
  readonly radius: number;
  readonly threshold: number;
  readonly candidates: readonly DecodeCandidate[];
  readonly accepted: DecodeCandidate | null;
}

export type RobustFaultScenario =
  | 'honest'
  | 'one-erasure'
  | 'three-erasures'
  | 'one-byzantine'
  | 'one-byzantine-one-erasure'
  | 'stale-replica'
  | 'beyond-bound'
  | 'custom';

export type ReplyState = 'honest' | 'unavailable' | 'corrupted' | 'stale';

export interface ScenarioReply extends HonestServerResult {
  readonly transmittedAnswer: GF8 | null;
  readonly state: ReplyState;
  readonly delta: GF8 | null;
}

export interface RobustScenarioResult {
  readonly transcript: RobustTranscript;
  readonly scenario: RobustFaultScenario;
  readonly replies: readonly ScenarioReply[];
  readonly unavailableCount: number;
  readonly wrongAnswerCount: number;
  readonly thresholdScore: number;
  readonly guaranteeMet: boolean;
  readonly decode: DecodeResult;
  readonly acceptedMatchesDirect: boolean | null;
}

export type ServerFaultKind = 'honest' | 'unavailable' | 'corrupt' | 'stale';

export interface ServerFaultPlan {
  readonly serverId: number;
  readonly kind: ServerFaultKind;
  /** Required and nonzero only for `corrupt`; rejected for every other kind. */
  readonly delta?: GF8;
}

export interface RobustCommunicationCost {
  readonly databaseBits: number;
  readonly fieldBits: number;
  readonly baseline: {
    readonly replicas: 2;
    readonly queryBitsPerServer: number;
    readonly totalQueryBits: number;
    readonly fullReplyBits: 2;
    readonly totalBits: number;
    readonly honestRepliesRequired: 2;
    readonly privateAgainstServers: 1;
  };
  readonly robust: {
    readonly replicas: 5;
    readonly queryBitsPerServer: number;
    readonly totalQueryBits: number;
    readonly fullReplyBits: number;
    readonly totalBits: number;
    readonly honestRepliesRequired: 2;
    readonly privateAgainstServers: 1;
  };
}

function assertDatabase(database: readonly boolean[]): void {
  if (!Array.isArray(database)) throw new TypeError('database must be an array');
  if (
    !Number.isSafeInteger(database.length) ||
    database.length < 1 ||
    database.length > MAX_ROBUST_DATABASE_BITS
  ) {
    throw new RangeError(
      `database length must be a safe integer in [1, ${MAX_ROBUST_DATABASE_BITS}]`
    );
  }
  if (!database.every((bit) => typeof bit === 'boolean')) {
    throw new TypeError('database must contain only booleans');
  }
}

function assertTarget(targetIndex: number, length: number): void {
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= length) {
    throw new RangeError(`targetIndex must be a safe integer in [0, ${length})`);
  }
}

function assertLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_ROBUST_DATABASE_BITS) {
    throw new RangeError(`length must be a safe integer in [1, ${MAX_ROBUST_DATABASE_BITS}]`);
  }
}

function assertSlopes(slopes: readonly GF8[], length: number): void {
  if (!Array.isArray(slopes) || slopes.length !== length) {
    throw new RangeError(`slopes must contain exactly ${length} field elements`);
  }
  slopes.forEach((value, index) => assertGF8(value, `slopes[${index}]`));
}

function assertQuery(query: RobustServerQuery, expectedLength?: number): void {
  if (!Number.isSafeInteger(query.serverId) || query.serverId < 1) {
    throw new RangeError('serverId must be a positive safe integer');
  }
  assertGF8(query.point, 'query.point');
  if (query.point === 0) throw new RangeError('server evaluation point must be nonzero');
  if (!Array.isArray(query.vector) || query.vector.length === 0) {
    throw new RangeError('query vector must be a non-empty array');
  }
  if (expectedLength !== undefined && query.vector.length !== expectedLength) {
    throw new RangeError(`query vector must contain exactly ${expectedLength} elements`);
  }
  query.vector.forEach((value, index) => assertGF8(value, `query.vector[${index}]`));
}

function randomFieldElements(length: number): GF8[] {
  assertLength(length);
  const bytes = new Uint8Array(length);
  const chunkSize = 65_536;
  for (let offset = 0; offset < length; offset += chunkSize) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + chunkSize, length)));
  }
  return fieldElementsFromBytes(bytes);
}

/** Eight divides 256, so the low three bits are uniform and zero is valid. */
export function fieldElementsFromBytes(bytes: Uint8Array): GF8[] {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  return Array.from(bytes, (value) => value & 0b111);
}

export function generateRobustSlopes(length: number): GF8[] {
  return randomFieldElements(length);
}

/** Share the one-hot target vector with independent degree-one polynomials. */
export function buildRobustQueries(
  targetIndex: number,
  length: number,
  suppliedSlopes?: readonly GF8[]
): { readonly slopes: readonly GF8[]; readonly queries: readonly RobustServerQuery[] } {
  assertLength(length);
  assertTarget(targetIndex, length);
  const slopes = suppliedSlopes ? [...suppliedSlopes] : generateRobustSlopes(length);
  assertSlopes(slopes, length);

  const queries = ROBUST_SERVER_POINTS.map((point, index) => ({
    serverId: index + 1,
    point,
    vector: slopes.map((slope, coordinate) =>
      gf8Add(coordinate === targetIndex ? 1 : 0, gf8Mul(slope, point))
    ),
  }));

  return { slopes, queries };
}

/** The server performs only its query/database dot product. */
export function robustServerAnswer(
  database: readonly boolean[],
  query: RobustServerQuery
): GF8 {
  assertDatabase(database);
  assertQuery(query, database.length);
  return query.vector.reduce<GF8>(
    (sum, coefficient, index) =>
      database[index] ? gf8Add(sum, coefficient) : sum,
    0
  );
}

export function robustAnswerSlope(
  database: readonly boolean[],
  slopes: readonly GF8[]
): GF8 {
  assertDatabase(database);
  assertSlopes(slopes, database.length);
  return slopes.reduce<GF8>(
    (sum, slope, index) => (database[index] ? gf8Add(sum, slope) : sum),
    0
  );
}

export function createRobustTranscript(
  database: readonly boolean[],
  targetIndex: number,
  suppliedSlopes?: readonly GF8[]
): RobustTranscript {
  assertDatabase(database);
  assertTarget(targetIndex, database.length);
  const snapshot = [...database];
  const { slopes, queries } = buildRobustQueries(targetIndex, snapshot.length, suppliedSlopes);
  const directBit: GF8 = snapshot[targetIndex] ? 1 : 0;
  const answerLine: GF8Line = {
    constant: directBit,
    slope: robustAnswerSlope(snapshot, slopes),
  };
  const servers = queries.map((query) => ({
    ...query,
    answer: robustServerAnswer(snapshot, query),
  }));

  return { database: snapshot, targetIndex, slopes, servers, answerLine, directBit };
}

/**
 * Derive, rather than assert, which targets are compatible with one query.
 * For every candidate, invert p_a(omega) = e_candidate[a] + r_a omega and
 * re-evaluate the resulting legal slopes at the observed point.
 */
export function singleServerCandidateTargets(query: RobustServerQuery): number[] {
  assertQuery(query);
  const candidates: number[] = [];
  for (let candidate = 0; candidate < query.vector.length; candidate += 1) {
    const slopes = query.vector.map((value, coordinate) =>
      gf8Div(gf8Add(value, coordinate === candidate ? 1 : 0), query.point)
    );
    const reproduces = slopes.every(
      (slope, coordinate) =>
        gf8Add(coordinate === candidate ? 1 : 0, gf8Mul(slope, query.point)) ===
        query.vector[coordinate]
    );
    if (reproduces) candidates.push(candidate);
  }
  return candidates;
}

export interface CollusionResult {
  readonly constants: readonly GF8[];
  readonly slopes: readonly GF8[];
  readonly validUnitVector: boolean;
  readonly targetIndex: number | null;
}

/** Two distinct query recipients interpolate each coordinate at zero. */
export function colludeRobustQueries(
  first: RobustServerQuery,
  second: RobustServerQuery
): CollusionResult {
  assertQuery(first);
  assertQuery(second, first.vector.length);
  if (first.serverId === second.serverId) {
    throw new RangeError('colluding queries must come from distinct server identifiers');
  }
  if (first.point === second.point) {
    throw new RangeError('colluding queries must use distinct evaluation points');
  }

  const lines = first.vector.map((value, index) =>
    gf8InterpolateLine(first.point, value, second.point, second.vector[index])
  );
  const constants = lines.map((line) => line.constant);
  const slopes = lines.map((line) => line.slope);
  const ones = constants
    .map((constant, index) => ({ constant, index }))
    .filter(({ constant }) => constant === 1);
  const validUnitVector =
    ones.length === 1 && constants.every((constant) => constant === 0 || constant === 1);

  return {
    constants,
    slopes,
    validUnitVector,
    targetIndex: validUnitVector ? ones[0].index : null,
  };
}

function assertReplies(replies: readonly ReceivedReply[]): void {
  if (!Array.isArray(replies)) throw new TypeError('replies must be an array');
  if (replies.length > ROBUST_SERVER_COUNT) {
    throw new RangeError(`at most ${ROBUST_SERVER_COUNT} replies are accepted`);
  }
  const serverIds = new Set<number>();
  const points = new Set<number>();
  for (const reply of replies) {
    if (!Number.isSafeInteger(reply.serverId) || reply.serverId < 1) {
      throw new RangeError('reply serverId must be a positive safe integer');
    }
    if (serverIds.has(reply.serverId)) throw new RangeError('duplicate server identifier');
    serverIds.add(reply.serverId);
    assertGF8(reply.point, 'reply.point');
    if (reply.point === 0) throw new RangeError('reply evaluation point must be nonzero');
    if (points.has(reply.point)) throw new RangeError('duplicate evaluation point');
    points.add(reply.point);
    assertGF8(reply.answer, 'reply.answer');
  }
}

/** Decode the received degree-one Reed–Solomon word without fault labels or ground truth. */
export function decodeRobustReplies(replies: readonly ReceivedReply[]): DecodeResult {
  assertReplies(replies);
  const receivedCount = replies.length;
  const radius = Math.max(0, Math.floor((receivedCount - ROBUST_HONEST_REPLIES) / 2));
  const threshold = receivedCount - radius;

  if (receivedCount < ROBUST_HONEST_REPLIES) {
    return {
      status: 'insufficient',
      receivedCount,
      radius,
      threshold,
      candidates: [],
      accepted: null,
    };
  }

  const lines = new Map<string, GF8Line>();
  for (let left = 0; left < replies.length; left += 1) {
    for (let right = left + 1; right < replies.length; right += 1) {
      const a = replies[left];
      const b = replies[right];
      const line = gf8InterpolateLine(a.point, a.answer, b.point, b.answer);
      lines.set(`${line.constant}:${line.slope}`, line);
    }
  }

  const candidates = [...lines.values()]
    .map<DecodeCandidate>((line) => {
      const agreeingServerIds = replies
        .filter((reply) => gf8EvalLine(line, reply.point) === reply.answer)
        .map((reply) => reply.serverId);
      const agreeing = new Set(agreeingServerIds);
      return {
        ...line,
        agreement: agreeingServerIds.length,
        agreeingServerIds,
        disagreeingServerIds: replies
          .filter((reply) => !agreeing.has(reply.serverId))
          .map((reply) => reply.serverId),
      };
    })
    .sort(
      (a, b) =>
        b.agreement - a.agreement || a.constant - b.constant || a.slope - b.slope
    );

  const accepted = candidates.filter((candidate) => candidate.agreement >= threshold);
  if (accepted.length === 1) {
    return {
      status: 'accepted',
      receivedCount,
      radius,
      threshold,
      candidates,
      accepted: accepted[0],
    };
  }
  return {
    status: accepted.length === 0 ? 'refused' : 'ambiguous',
    receivedCount,
    radius,
    threshold,
    candidates,
    accepted: null,
  };
}

function scenarioReplies(
  transcript: RobustTranscript,
  scenario: RobustFaultScenario
): ScenarioReply[] {
  const replies: ScenarioReply[] = transcript.servers.map((server) => ({
    ...server,
    transmittedAnswer: server.answer,
    state: 'honest',
    delta: null,
  }));

  const unavailable = (serverId: number): void => {
    const server = replies[serverId - 1];
    replies[serverId - 1] = {
      ...server,
      transmittedAnswer: null,
      state: 'unavailable',
      delta: null,
    };
  };
  const corrupt = (serverId: number, transmittedAnswer: GF8): void => {
    assertGF8(transmittedAnswer, 'transmittedAnswer');
    const server = replies[serverId - 1];
    replies[serverId - 1] = {
      ...server,
      transmittedAnswer,
      state: 'corrupted',
      delta: gf8Add(server.answer, transmittedAnswer),
    };
  };

  switch (scenario) {
    case 'honest':
      break;
    case 'one-erasure':
      unavailable(5);
      break;
    case 'three-erasures':
      unavailable(3);
      unavailable(4);
      unavailable(5);
      break;
    case 'one-byzantine':
      corrupt(3, gf8Add(replies[2].answer, 1));
      break;
    case 'one-byzantine-one-erasure':
      corrupt(3, gf8Add(replies[2].answer, 1));
      unavailable(5);
      break;
    case 'stale-replica': {
      // A degree-one target-coordinate query can be zero at at most one of the
      // five points, so at least one server must visibly disagree after this
      // actual stale-database computation.
      const staleServer = replies.find(
        (server) => server.vector[transcript.targetIndex] !== 0
      );
      if (!staleServer) throw new Error('no server exposes a nonzero target coefficient');
      const staleDatabase = [...transcript.database];
      staleDatabase[transcript.targetIndex] = !staleDatabase[transcript.targetIndex];
      const staleAnswer = robustServerAnswer(staleDatabase, staleServer);
      const index = staleServer.serverId - 1;
      replies[index] = {
        ...staleServer,
        transmittedAnswer: staleAnswer,
        state: 'stale',
        delta: gf8Add(staleServer.answer, staleAnswer),
      };
      break;
    }
    case 'beyond-bound': {
      // Two corruptions plus one erasure exceed 2b+u <= 3. Construct a wrong
      // line that intersects the honest answer line at server 3; servers 1 and
      // 2 then make the wrong line win 3-to-1 without consulting the decoder.
      unavailable(5);
      const wrongConstant = gf8Add(transcript.answerLine.constant, 1);
      const intersection = replies[2];
      const wrongSlope = gf8Div(
        gf8Add(intersection.answer, wrongConstant),
        intersection.point
      );
      const wrongLine = { constant: wrongConstant, slope: wrongSlope };
      corrupt(1, gf8EvalLine(wrongLine, replies[0].point));
      corrupt(2, gf8EvalLine(wrongLine, replies[1].point));
      break;
    }
    case 'custom':
      throw new TypeError('custom scenarios require runRobustPlan');
    default: {
      const exhaustive: never = scenario;
      throw new TypeError(`unsupported scenario: ${String(exhaustive)}`);
    }
  }
  return replies;
}

function planReplies(
  transcript: RobustTranscript,
  plans: readonly ServerFaultPlan[]
): ScenarioReply[] {
  if (!Array.isArray(plans)) throw new TypeError('plans must be an array');
  const byServer = new Map<number, ServerFaultPlan>();
  for (const plan of plans) {
    if (!Number.isSafeInteger(plan.serverId) || plan.serverId < 1 || plan.serverId > 5) {
      throw new RangeError('plan serverId must be an integer in [1, 5]');
    }
    if (byServer.has(plan.serverId)) throw new RangeError('duplicate fault plan serverId');
    if (!['honest', 'unavailable', 'corrupt', 'stale'].includes(plan.kind)) {
      throw new TypeError(`unsupported fault kind: ${String(plan.kind)}`);
    }
    if (plan.kind === 'corrupt') {
      if (plan.delta === undefined) throw new RangeError('corrupt plan requires a delta');
      assertGF8(plan.delta, 'plan.delta');
      if (plan.delta === 0) throw new RangeError('corruption delta must be nonzero');
    } else if (plan.delta !== undefined) {
      throw new RangeError('only a corrupt plan may carry a delta');
    }
    byServer.set(plan.serverId, plan);
  }

  return transcript.servers.map((server) => {
    const plan = byServer.get(server.serverId) ?? {
      serverId: server.serverId,
      kind: 'honest' as const,
    };
    switch (plan.kind) {
      case 'honest':
        return { ...server, transmittedAnswer: server.answer, state: 'honest', delta: null };
      case 'unavailable':
        return { ...server, transmittedAnswer: null, state: 'unavailable', delta: null };
      case 'corrupt': {
        const transmittedAnswer = gf8Add(server.answer, plan.delta!);
        return {
          ...server,
          transmittedAnswer,
          state: 'corrupted',
          delta: plan.delta!,
        };
      }
      case 'stale': {
        const staleDatabase = [...transcript.database];
        staleDatabase[transcript.targetIndex] = !staleDatabase[transcript.targetIndex];
        const transmittedAnswer = robustServerAnswer(staleDatabase, server);
        return {
          ...server,
          transmittedAnswer,
          state: 'stale',
          delta: gf8Add(server.answer, transmittedAnswer),
        };
      }
    }
  });
}

function finishScenario(
  transcript: RobustTranscript,
  scenario: RobustFaultScenario,
  replies: readonly ScenarioReply[]
): RobustScenarioResult {
  const received: ReceivedReply[] = replies.flatMap((reply) =>
    reply.transmittedAnswer === null
      ? []
      : [{ serverId: reply.serverId, point: reply.point, answer: reply.transmittedAnswer }]
  );
  const unavailableCount = replies.filter((reply) => reply.transmittedAnswer === null).length;
  const wrongAnswerCount = replies.filter(
    (reply) =>
      reply.transmittedAnswer !== null && reply.transmittedAnswer !== reply.answer
  ).length;
  const thresholdScore = 2 * wrongAnswerCount + unavailableCount;
  const decode = decodeRobustReplies(received);
  const acceptedMatchesDirect =
    decode.accepted === null ? null : decode.accepted.constant === transcript.directBit;

  return {
    transcript,
    scenario,
    replies,
    unavailableCount,
    wrongAnswerCount,
    thresholdScore,
    guaranteeMet: thresholdScore <= 3,
    decode,
    acceptedMatchesDirect,
  };
}

export function runRobustScenario(
  database: readonly boolean[],
  targetIndex: number,
  scenario: RobustFaultScenario,
  suppliedSlopes?: readonly GF8[]
): RobustScenarioResult {
  if (scenario === 'custom') throw new TypeError('custom scenarios require runRobustPlan');
  const transcript = createRobustTranscript(database, targetIndex, suppliedSlopes);
  const replies = scenarioReplies(transcript, scenario);
  return finishScenario(transcript, scenario, replies);
}

export function runRobustPlan(
  database: readonly boolean[],
  targetIndex: number,
  plans: readonly ServerFaultPlan[],
  suppliedSlopes?: readonly GF8[]
): RobustScenarioResult {
  const transcript = createRobustTranscript(database, targetIndex, suppliedSlopes);
  return finishScenario(transcript, 'custom', planReplies(transcript, plans));
}

export function robustCommunicationCost(databaseBits: number): RobustCommunicationCost {
  assertLength(databaseBits);
  const baselineQueryPerServer = databaseBits;
  const robustQueryPerServer = databaseBits * GF8_BITS;
  const baselineTotalQuery = 2 * baselineQueryPerServer;
  const robustTotalQuery = ROBUST_SERVER_COUNT * robustQueryPerServer;
  const robustFullReply = ROBUST_SERVER_COUNT * GF8_BITS;
  return {
    databaseBits,
    fieldBits: GF8_BITS,
    baseline: {
      replicas: 2,
      queryBitsPerServer: baselineQueryPerServer,
      totalQueryBits: baselineTotalQuery,
      fullReplyBits: 2,
      totalBits: baselineTotalQuery + 2,
      honestRepliesRequired: 2,
      privateAgainstServers: 1,
    },
    robust: {
      replicas: 5,
      queryBitsPerServer: robustQueryPerServer,
      totalQueryBits: robustTotalQuery,
      fullReplyBits: robustFullReply,
      totalBits: robustTotalQuery + robustFullReply,
      honestRepliesRequired: 2,
      privateAgainstServers: 1,
    },
  };
}
