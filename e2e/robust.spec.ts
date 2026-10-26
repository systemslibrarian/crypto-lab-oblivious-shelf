import { expect, test, type Page } from '@playwright/test';

type ServerRow = {
  serverId: number;
  point: number;
  state: string;
  query: number[];
  honest: number;
  transmitted: number | null;
  delta: number | null;
};

function mul(a: number, b: number): number {
  let x = a;
  let y = b;
  let out = 0;
  for (let bit = 0; bit < 3; bit += 1) {
    if (y & 1) out ^= x;
    y >>>= 1;
    x <<= 1;
    if (x & 8) x ^= 0b1011;
  }
  return out & 7;
}

function inv(value: number): number {
  if (value === 0) throw new Error('zero inverse');
  for (let candidate = 1; candidate < 8; candidate += 1) {
    if (mul(value, candidate) === 1) return candidate;
  }
  throw new Error(`no inverse for ${value}`);
}

function div(a: number, b: number): number {
  return mul(a, inv(b));
}

function lineThrough(a: ServerRow, b: ServerRow): { constant: number; slope: number } {
  const slope = div(a.transmitted! ^ b.transmitted!, a.point ^ b.point);
  return { constant: a.transmitted! ^ mul(slope, a.point), slope };
}

function evalLine(line: { constant: number; slope: number }, point: number): number {
  return line.constant ^ mul(line.slope, point);
}

function decode(rows: ServerRow[]): {
  status: 'accepted' | 'insufficient' | 'refused' | 'ambiguous';
  radius: number;
  threshold: number;
  candidates: Array<{ constant: number; slope: number; agreement: number }>;
  accepted: { constant: number; slope: number; agreement: number } | null;
} {
  const received = rows.filter((row) => row.transmitted !== null);
  const radius = Math.max(0, Math.floor((received.length - 2) / 2));
  const threshold = received.length - radius;
  if (received.length < 2) {
    return { status: 'insufficient', radius, threshold, candidates: [], accepted: null };
  }

  const lines = new Map<string, { constant: number; slope: number }>();
  for (let i = 0; i < received.length; i += 1) {
    for (let j = i + 1; j < received.length; j += 1) {
      const line = lineThrough(received[i], received[j]);
      lines.set(`${line.constant}:${line.slope}`, line);
    }
  }
  const candidates = [...lines.values()]
    .map((line) => ({
      ...line,
      agreement: received.filter((row) => evalLine(line, row.point) === row.transmitted).length,
    }))
    .sort((a, b) => b.agreement - a.agreement || a.constant - b.constant || a.slope - b.slope);
  const qualified = candidates.filter((line) => line.agreement >= threshold);
  if (qualified.length === 1) {
    return { status: 'accepted', radius, threshold, candidates, accepted: qualified[0] };
  }
  return {
    status: qualified.length === 0 ? 'refused' : 'ambiguous',
    radius,
    threshold,
    candidates,
    accepted: null,
  };
}

function guardPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  const errors = guardPageErrors(page);
  (test.info() as unknown as { _robustErrors: string[] })._robustErrors = errors;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await page.locator('#card-2').click();
});

test.afterEach(async () => {
  const errors = (test.info() as unknown as { _robustErrors?: string[] })._robustErrors ?? [];
  expect(errors).toEqual([]);
});

async function runPreset(page: Page, preset: string): Promise<void> {
  await page.locator('#robust-preset').selectOption(preset);
  await page.locator('#btn-robust-run').click();
  await expect(page.locator('#robust-result')).toBeVisible();
  await expect(page.locator('#robust-awaiting')).toBeHidden();
  await expect(page.locator('[data-server-result]')).toHaveCount(5);
}

async function rows(page: Page): Promise<ServerRow[]> {
  return page.locator('[data-server-result]').evaluateAll((elements) =>
    elements.map((element) => {
      const query = (element.querySelector('.robust-query-vector')?.textContent ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number);
      const rawWire = element.getAttribute('data-transmitted-answer') ?? '';
      const rawDelta = element.getAttribute('data-delta') ?? '';
      return {
        serverId: Number(element.getAttribute('data-server-result')),
        point: Number(element.getAttribute('data-point')),
        state: element.getAttribute('data-state') ?? '',
        query,
        honest: Number(element.getAttribute('data-honest-answer')),
        transmitted: rawWire === '' ? null : Number(rawWire),
        delta: rawDelta === '' ? null : Number(rawDelta),
      };
    })
  );
}

async function database(page: Page): Promise<number[]> {
  const bits = await page.locator('#robust-db-bits').getAttribute('data-bits');
  expect(bits).toMatch(/^[01]{16}$/);
  return [...bits!].map(Number);
}

async function renderedDecoder(page: Page): Promise<{
  status: string;
  received: number;
  radius: number;
  threshold: number;
}> {
  const node = page.locator('#robust-decoder-parameters');
  return {
    status: (await node.getAttribute('data-status'))!,
    received: Number(await node.getAttribute('data-received')),
    radius: Number(await node.getAttribute('data-radius')),
    threshold: Number(await node.getAttribute('data-threshold')),
  };
}

async function renderedCandidates(page: Page): Promise<Array<{
  constant: number;
  slope: number;
  agreement: number;
}>> {
  return page.locator('[data-candidate]').evaluateAll((elements) => elements.map((element) => {
    const [constant, slope] = (element.getAttribute('data-candidate') ?? '').split(':').map(Number);
    return {
      constant,
      slope,
      agreement: Number(element.getAttribute('data-agreement')),
    };
  }));
}

test('honest queries, dot products, decoding, and payload figures recompute independently', async ({ page }) => {
  await runPreset(page, 'honest');
  const db = await database(page);
  const serverRows = await rows(page);

  for (const row of serverRows) {
    expect(row.query).toHaveLength(db.length);
    const dot = row.query.reduce((sum, coefficient, index) =>
      db[index] ? sum ^ coefficient : sum, 0);
    expect(row.honest, `S${row.serverId} dot product`).toBe(dot);
    expect(row.transmitted).toBe(dot);
    expect(row.state).toBe('honest');
  }

  const independent = decode(serverRows);
  const rendered = await renderedDecoder(page);
  expect(rendered).toEqual({
    status: independent.status,
    received: 5,
    radius: independent.radius,
    threshold: independent.threshold,
  });
  expect(independent.accepted?.constant).toBe(db[2]);
  expect(await renderedCandidates(page)).toEqual(independent.candidates);
  await expect(page.locator('[data-independent-match="true"]')).toBeVisible();

  const numbers = async (name: string): Promise<number> =>
    Number(((await page.locator(`[data-cost="${name}"]`).textContent()) ?? '').match(/\d+/)?.[0]);
  const n = db.length;
  expect(await numbers('baseline-query-per')).toBe(n);
  expect(await numbers('baseline-query-total')).toBe(2 * n);
  expect(await numbers('baseline-total')).toBe(2 * n + 2);
  expect(await numbers('robust-query-per')).toBe(3 * n);
  expect(await numbers('robust-query-total')).toBe(5 * 3 * n);
  expect(await numbers('robust-replies')).toBe(5 * 3);
  expect(await numbers('robust-total')).toBe(5 * 3 * n + 5 * 3);
});

test('every pinned fault case reports actual wire values and the coding bound', async ({ page }) => {
  const cases = [
    ['three-erasures', 3, 0, true],
    ['one-byzantine', 0, 1, true],
    ['one-byzantine-one-erasure', 1, 1, true],
    ['stale-replica', 0, 1, true],
    ['beyond-bound', 1, 2, false],
  ] as const;

  for (const [preset, expectedU, expectedB, guaranteed] of cases) {
    await runPreset(page, preset);
    const db = await database(page);
    const serverRows = await rows(page);

    for (const row of serverRows) {
      const honest = row.query.reduce((sum, coefficient, index) =>
        db[index] ? sum ^ coefficient : sum, 0);
      expect(row.honest, `${preset}: S${row.serverId} honest dot product`).toBe(honest);
      if (row.state === 'corrupted') {
        expect(row.delta).not.toBeNull();
        expect(row.transmitted).toBe(row.honest ^ row.delta!);
      }
      if (row.state === 'unavailable') expect(row.transmitted).toBeNull();
      if (row.state === 'stale') {
        const stale = [...db];
        stale[2] ^= 1;
        const staleDot = row.query.reduce((sum, coefficient, index) =>
          stale[index] ? sum ^ coefficient : sum, 0);
        expect(row.transmitted).toBe(staleDot);
      }
    }

    const u = serverRows.filter((row) => row.transmitted === null).length;
    const b = serverRows.filter(
      (row) => row.transmitted !== null && row.transmitted !== row.honest
    ).length;
    const guarantee = page.locator('#robust-guarantee');
    expect(u).toBe(expectedU);
    expect(b).toBe(expectedB);
    expect(Number(await guarantee.getAttribute('data-u'))).toBe(u);
    expect(Number(await guarantee.getAttribute('data-b'))).toBe(b);
    expect(Number(await guarantee.getAttribute('data-score'))).toBe(2 * b + u);
    expect(await guarantee.getAttribute('data-guaranteed')).toBe(String(guaranteed));

    const independent = decode(serverRows);
    expect(await renderedDecoder(page)).toEqual({
      status: independent.status,
      received: serverRows.length - u,
      radius: independent.radius,
      threshold: independent.threshold,
    });
    expect(await renderedCandidates(page)).toEqual(independent.candidates);
    if (guaranteed) {
      expect(independent.status).toBe('accepted');
      expect(independent.accepted?.constant).toBe(db[2]);
    } else {
      await expect(guarantee).toContainText('GUARANTEE EXCEEDED');
      expect(independent.status).toBe('accepted');
      expect(independent.accepted?.constant).not.toBe(db[2]);
      await expect(page.locator('[data-independent-match="false"]')).toContainText('DOES NOT MATCH');
    }
  }
});

test('the learner page keeps the construction and security boundaries explicit', async ({ page }) => {
  const section = page.locator('#section-e');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /retrieves one book's checked-out flag/
  );
  await expect(section).toContainText('2b+u ≤ 3');
  await expect(section).toContainText('Agreement is not provenance');
  await expect(section).toContainText('not their sublinear Theorem 5.2 construction');
  await expect(section).toContainText('There is no signature, MAC');
  await expect(section).toContainText('Operational metadata remains visible');
  await expect(section).not.toContainText('answers are authenticated');
  await expect(section.getByRole('link', { name: /Beimel and Stahl/ })).toHaveAttribute(
    'href',
    'https://www.cs.bgu.ac.il/~beimel/Papers/BS_Journal.pdf'
  );
  await expect(section.getByRole('link', { name: /Goldberg 2007/ })).toHaveAttribute(
    'href',
    'https://crysp.uwaterloo.ca/courses/pet/F09/cache/www.cypherpunks.ca/~iang/pubs/robustpir.pdf'
  );
});

test('one actual query keeps every target possible while two query views recover the one-hot target', async ({ page }) => {
  await page.locator('#robust-colluder-a').selectOption('1');
  await page.locator('#robust-colluder-b').selectOption('0');
  await runPreset(page, 'honest');
  const firstRun = await rows(page);
  const oneView = firstRun[0];

  for (let candidate = 0; candidate < oneView.query.length; candidate += 1) {
    const slopes = oneView.query.map((value, coordinate) =>
      div(value ^ (coordinate === candidate ? 1 : 0), oneView.point)
    );
    const reproduced = slopes.map((slope, coordinate) =>
      (coordinate === candidate ? 1 : 0) ^ mul(slope, oneView.point)
    );
    expect(reproduced).toEqual(oneView.query);
  }
  const shownCandidates = (await page.locator('[data-one-view-candidates]').getAttribute('data-one-view-candidates'))!
    .split(',').map(Number);
  expect(shownCandidates).toEqual(Array.from({ length: 16 }, (_, index) => index));

  await page.locator('#robust-colluder-b').selectOption('2');
  await page.locator('#btn-robust-run').click();
  const secondRun = await rows(page);
  const a = secondRun[0];
  const b = secondRun[1];
  const constants = a.query.map((value, index) => {
    const slope = div(value ^ b.query[index], a.point ^ b.point);
    return value ^ mul(slope, a.point);
  });
  expect(constants.filter((value) => value === 1)).toHaveLength(1);
  expect(constants.every((value) => value === 0 || value === 1)).toBe(true);
  expect(constants.indexOf(1)).toBe(2);
  expect((await page.locator('.robust-colluded-vector').textContent())?.trim())
    .toBe(constants.join(' '));
  expect(await page.locator('[data-colluded-target]').getAttribute('data-colluded-target')).toBe('2');
});

test('custom per-server controls execute independently and input changes retire stale verdicts', async ({ page }) => {
  await runPreset(page, 'honest');
  await expect(page.locator('#robust-result')).toBeVisible();

  // Re-selecting the same target is a no-op for the robust evidence.
  await page.locator('#card-2').click();
  await expect(page.locator('#robust-result')).toBeVisible();

  await page.locator('#robust-kind-4').selectOption('unavailable');
  await expect(page.locator('#robust-result')).toBeHidden();
  await expect(page.locator('#robust-preset')).toHaveValue('custom');
  await page.locator('#robust-kind-2').selectOption('corrupt');
  await page.locator('#robust-delta-2').selectOption('7');
  await page.locator('#btn-robust-run').click();

  const serverRows = await rows(page);
  expect(serverRows[3]).toMatchObject({ serverId: 4, state: 'unavailable', transmitted: null });
  expect(serverRows[1]).toMatchObject({ serverId: 2, state: 'corrupted', delta: 7 });
  expect(serverRows[1].transmitted).toBe(serverRows[1].honest ^ 7);

  await page.locator('#card-3').click();
  await expect(page.locator('#robust-result')).toBeHidden();
  await expect(page.locator('#robust-awaiting')).toContainText('selected book changed');
  await expect(page.locator('#robust-target')).toContainText('#3');
});

test('the robust workbench reflows at 320 CSS pixels without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await runPreset(page, 'beyond-bound');
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  await expect(page.locator('#robust-guarantee')).toBeVisible();
  await expect(page.locator('#btn-robust-run')).toBeVisible();
});
