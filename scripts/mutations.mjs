import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const UNIT = 'src/robust-pir.test.ts';
const BROWSER = 'e2e/robust.spec.ts';

const mutations = [
  {
    name: 'irreducible GF(8) modulus',
    file: 'src/gf8.ts',
    anchor: 'export const GF8_MODULUS = 0b1011;',
    replacement: 'export const GF8_MODULUS = 0b1001;',
    test: 'pins z^3 + z + 1 and the complete addition and multiplication tables',
  },
  {
    name: 'polynomial instead of integer multiplication',
    file: 'src/gf8.ts',
    anchor: '  return product & 0b111;',
    replacement: '  return (a * b) & 0b111;',
    test: 'pins z^3 + z + 1 and the complete addition and multiplication tables',
  },
  {
    name: 'zero remains a legal uniform slope',
    file: 'src/robust-pir.ts',
    anchor: '  return Array.from(bytes, (value) => value & 0b111);',
    replacement: '  return Array.from(bytes, (value) => (value & 0b111) || 1);',
    test: 'maps Web Crypto bytes uniformly to all eight slopes, including zero',
  },
  {
    name: 'independent slope per coordinate',
    file: 'src/robust-pir.ts',
    anchor: 'gf8Add(coordinate === targetIndex ? 1 : 0, gf8Mul(slope, point))',
    replacement: 'gf8Add(coordinate === targetIndex ? 1 : 0, gf8Mul(slopes[0], point))',
    test: 'reproduces the independently derived GF(8) fixture exactly',
  },
  {
    name: 'one-hot bit stays in the polynomial constant',
    file: 'src/robust-pir.ts',
    anchor: 'gf8Add(coordinate === targetIndex ? 1 : 0, gf8Mul(slope, point))',
    replacement:
      'gf8Mul(gf8Add(slope, coordinate === targetIndex ? 1 : 0), point)',
    test: 'reproduces the independently derived GF(8) fixture exactly',
  },
  {
    name: 'server answer remains the query/database dot product',
    file: 'src/robust-pir.ts',
    anchor: '      database[index] ? gf8Add(sum, coefficient) : sum,',
    replacement: '      database[index] ? gf8Add(sum, coefficient) : gf8Add(sum, coefficient),',
    test: 'makes each server compute the displayed dot product, including all-zero and all-one data',
  },
  {
    name: 'line interpolation uses field division',
    file: 'src/gf8.ts',
    anchor: '  const slope = gf8Div(gf8Add(y1, y2), gf8Add(x1, x2));',
    replacement: '  const slope = ((y1 - y2) / (x1 - x2)) as GF8;',
    test: 'interpolates lines over the field rather than with integer arithmetic',
  },
  {
    name: 'duplicate server identifiers are rejected',
    file: 'src/robust-pir.ts',
    anchor: "    if (serverIds.has(reply.serverId)) throw new RangeError('duplicate server identifier');",
    replacement: "    if (false) throw new RangeError('duplicate server identifier');",
    test: 'never treats missing replies as zero and rejects malformed identifiers and points',
  },
  {
    name: 'an unavailable server is not a zero answer',
    file: 'src/robust-pir.ts',
    anchor:
      "    reply.transmittedAnswer === null\n      ? []\n      : [{ serverId: reply.serverId, point: reply.point, answer: reply.transmittedAnswer }]",
    replacement:
      "    reply.transmittedAnswer === null\n      ? [{ serverId: reply.serverId, point: reply.point, answer: 0 }]\n      : [{ serverId: reply.serverId, point: reply.point, answer: reply.transmittedAnswer }]",
    test: 'three-erasures derives u, b, 2b+u, and the guarantee',
  },
  {
    name: 'Byzantine replies count twice in the bound',
    file: 'src/robust-pir.ts',
    anchor: '  const thresholdScore = 2 * wrongAnswerCount + unavailableCount;',
    replacement: '  const thresholdScore = wrongAnswerCount + unavailableCount;',
    test: 'one-byzantine derives u, b, 2b+u, and the guarantee',
  },
  {
    name: 'decoder requires the unique-decoding threshold',
    file: 'src/robust-pir.ts',
    anchor: '  const accepted = candidates.filter((candidate) => candidate.agreement >= threshold);',
    replacement: '  const accepted = candidates.filter((candidate) => candidate.agreement >= 3);',
    test: 'refuses when the largest agreement is below the unique-decoding threshold',
  },
  {
    name: 'one query view keeps every target possible',
    file: 'src/robust-pir.ts',
    anchor: '    if (reproduces) candidates.push(candidate);',
    replacement: '    if (reproduces && candidate === 0) candidates.push(candidate);',
    test: 'derives all candidates from one actual query and the exact target from two',
  },
  {
    name: 'two query views recover the target',
    file: 'src/robust-pir.ts',
    anchor: '    targetIndex: validUnitVector ? ones[0].index : null,',
    replacement: '    targetIndex: null,',
    test: 'derives all candidates from one actual query and the exact target from two',
  },
  {
    name: 'stale reply comes from the changed replica',
    file: 'src/robust-pir.ts',
    anchor: '      const staleAnswer = robustServerAnswer(staleDatabase, staleServer);',
    replacement: '      const staleAnswer = gf8Add(staleServer.answer, 1);',
    test: 'computes a stale reply from a changed replica rather than a scenario label',
  },
  {
    name: 'communication total remains derived from parameters',
    file: 'src/robust-pir.ts',
    anchor: '      totalBits: robustTotalQuery + robustFullReply,',
    replacement: '      totalBits: 255,',
    test: 'recomputes rather than hardcodes the payload when the database size changes',
  },
  {
    name: 'control changes retire the rendered verdict',
    file: 'src/robust-ui.ts',
    anchor: "  result.hidden = true;\n  result.innerHTML = '';",
    replacement: '  result.hidden = false;',
    spec: BROWSER,
    runner: 'browser',
    test: 'custom per-server controls execute independently and input changes retire stale verdicts',
  },
];

function run(command, args, timeout = 300_000) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  });
  if (result.error) throw result.error;
  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ranExactlyOnePassingTest(output, runner) {
  return runner === 'browser'
    ? /(?:^|\n)\s*1 passed \(/.test(output)
    : /(?:^|\n)\s*Tests\s+1 passed\b/.test(output);
}

function namedTest(mutation, shouldPass) {
  const testPattern = escapeRegExp(mutation.test);
  const args = mutation.runner === 'browser'
    ? ['playwright', 'test', mutation.spec, '--grep', testPattern, '--retries=0', '--workers=1', '--reporter=list']
    : ['vitest', 'run', UNIT, '--testNamePattern', testPattern, '--reporter=verbose'];
  const result = run('npx', args, mutation.runner === 'browser' ? 300_000 : 120_000);
  if (shouldPass && result.code !== 0) {
    throw new Error(`${mutation.name}: passing control failed\n${result.output}`);
  }
  if (shouldPass && !ranExactlyOnePassingTest(result.output, mutation.runner)) {
    throw new Error(`${mutation.name}: passing control did not execute exactly one test\n${result.output}`);
  }
  if (!shouldPass && result.code === 0) {
    throw new Error(`${mutation.name}: mutation survived its named test`);
  }
  if (!result.output.includes(mutation.test)) {
    throw new Error(`${mutation.name}: output did not name the owning test\n${result.output}`);
  }
  if (/No tests found|ERR_CONNECTION_REFUSED|Process from config\.webServer/.test(result.output)) {
    throw new Error(`${mutation.name}: infrastructure failure is not a mutation kill\n${result.output}`);
  }
}

function fullBaseline() {
  const unit = run('npx', ['vitest', 'run', UNIT], 120_000);
  if (unit.code !== 0) throw new Error(`unit baseline failed\n${unit.output}`);
  const build = run('npm', ['run', 'build'], 120_000);
  if (build.code !== 0) throw new Error(`build baseline failed\n${build.output}`);
  const browser = run('npx', ['playwright', 'test', BROWSER, '--retries=0', '--workers=1'], 300_000);
  if (browser.code !== 0) throw new Error(`browser baseline failed\n${browser.output}`);
  console.log('baseline: unmutated copy PASSES');
}

const selectedName = process.argv[2];
const selected = selectedName
  ? mutations.filter((mutation) => mutation.name === selectedName)
  : mutations;
if (selected.length === 0) throw new Error(`unknown mutation: ${selectedName}`);

const dirty = run('git', ['status', '--porcelain']).output.trim();
if (dirty) throw new Error('commit source changes before running the mutation gate');

fullBaseline();
let caught = 0;
for (const mutation of selected) {
  const original = readFileSync(mutation.file, 'utf8');
  if (original.split(mutation.anchor).length !== 2) {
    throw new Error(`${mutation.name}: anchor must occur exactly once`);
  }
  namedTest(mutation, true);
  try {
    const changed = original.replace(mutation.anchor, mutation.replacement);
    if (changed === original) throw new Error(`${mutation.name}: mutation changed nothing`);
    writeFileSync(mutation.file, changed);
    namedTest(mutation, false);
    caught += 1;
    console.log(`caught: ${mutation.name}`);
  } finally {
    writeFileSync(mutation.file, original);
  }
  namedTest(mutation, true);
}

const finalBuild = run('npm', ['run', 'build'], 120_000);
if (finalBuild.code !== 0) throw new Error(`restored build failed\n${finalBuild.output}`);
if (run('git', ['status', '--porcelain']).output.trim()) {
  throw new Error('mutation gate did not restore the clean source tree');
}
console.log(`all ${caught} mutation(s) caught`);
