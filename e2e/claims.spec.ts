import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Functional gate for the claims this page makes on screen.
 *
 * The a11y suite proves the page is reachable; this one proves it is *right*.
 * Every assertion below is against a value the page itself computed and
 * printed — the recovered bit, the XOR chains, the anonymity-set counts — and
 * cross-checks them against each other rather than against a string baked into
 * the test. A hardcoded "1" would pass whether or not the protocol ran; the
 * checks here fail if any two of the page's own numbers stop agreeing.
 *
 * DB_SIZE is the one structural constant: the catalog is 16 books, and the
 * count is read off the rendered grid rather than assumed.
 */

const TARGET = 9;

/** Fail the test on any uncaught page exception or console error. */
function guardPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  const errors = guardPageErrors(page);
  // Stash on the test so afterEach can read it.
  (test.info() as unknown as { _pageErrors: string[] })._pageErrors = errors;
});

test.afterEach(async () => {
  const errors = (test.info() as unknown as { _pageErrors?: string[] })._pageErrors ?? [];
  expect(errors, 'page must raise no uncaught exceptions or console errors').toEqual([]);
});

// ---------------------------------------------------------------- helpers

async function catalogSize(page: Page): Promise<number> {
  return page.locator('#catalog-grid .catalog-card').count();
}

/** The availability flag the catalog grid rendered straight from the database. */
async function cardSaysCheckedOut(page: Page, index: number): Promise<boolean> {
  const badge = page.locator(`#card-${index} .availability-badge`);
  const text = ((await badge.textContent()) ?? '').trim();
  expect(['Checked out', 'Available']).toContain(text);
  return text === 'Checked out';
}

/** Select a book and run one full query, waiting for the walkthrough to settle. */
async function runQuery(page: Page, index: number): Promise<void> {
  await page.locator(`#card-${index}`).click();
  await page.locator('#btn-generate').click();
  await settle(page);
}

async function settle(page: Page): Promise<void> {
  await expect(page.locator('#walkthrough')).toHaveAttribute('aria-busy', 'false', {
    timeout: 15_000,
  });
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(8, { timeout: 15_000 });
}

function step(page: Page, n: number): Locator {
  return page.locator('#walkthrough .walk-step').nth(n);
}

/** Indices rendered inside a `.set` element, as a sorted array. */
async function setElements(scope: Locator): Promise<number[]> {
  const els = await scope.locator('.set-el').allTextContents();
  return els.map((t) => Number(t.trim())).sort((a, b) => a - b);
}

/** Parse an XOR chain step into its `db[j] = bit` terms and the printed total. */
async function xorChain(
  s: Locator
): Promise<{ indices: number[]; bits: boolean[]; printedTotal: boolean }> {
  const terms = await s.locator('.xor-term').allTextContents();
  const indices: number[] = [];
  const bits: boolean[] = [];
  for (const t of terms) {
    const m = /^db\[(\d+)\]\((0|1)\)$/.exec(t.trim());
    expect(m, `unparseable XOR term: ${JSON.stringify(t)}`).not.toBeNull();
    indices.push(Number(m![1]));
    bits.push(m![2] === '1');
  }
  // The chain's total is the emphasised bit at the end of the equation.
  const total = ((await s.locator('.step-body strong').first().textContent()) ?? '').trim();
  expect(['0', '1'], `unparseable XOR total: ${JSON.stringify(total)}`).toContain(total);
  return { indices, bits, printedTotal: total === '1' };
}

function xorAll(bits: boolean[]): boolean {
  return bits.reduce((acc, b) => acc !== b, false);
}

/** Parse step 7's `rA(x) ⊕ rB(y) = z` equation. */
async function recovery(page: Page): Promise<{ ra: boolean; rb: boolean; recovered: boolean }> {
  const eq = ((await step(page, 6).locator('.recovery-eq').textContent()) ?? '').replace(
    /\s+/g,
    ''
  );
  const m = /rA\((0|1)\).*?rB\((0|1)\)=(0|1)$/.exec(eq);
  expect(m, `unparseable recovery equation: ${eq}`).not.toBeNull();
  return { ra: m![1] === '1', rb: m![2] === '1', recovered: m![3] === '1' };
}

/** Every "N of M" pair printed by the privacy-proof step. */
async function anonymitySets(page: Page): Promise<Array<{ count: number; total: number }>> {
  const body = ((await step(page, 7).locator('.step-body').textContent()) ?? '').replace(
    /\s+/g,
    ' '
  );
  return [...body.matchAll(/(\d+) of (\d+)/g)].map((m) => ({
    count: Number(m[1]),
    total: Number(m[2]),
  }));
}

// ---------------------------------------------------------------- tests

test('before any selection the demo is inert and says so', async ({ page }) => {
  await page.goto('.');

  await expect(page.locator('#btn-generate')).toBeDisabled();
  await expect(page.locator('#btn-again')).toBeDisabled();
  await expect(page.locator('#selected-display')).toContainText('No book selected');
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(0);
  await expect(page.locator('#server-views')).toBeHidden();

  // Forcing the guarded button must not fabricate a run.
  await page.locator('#btn-generate').click({ force: true });
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(0);
  await expect(page.locator('#server-views')).toBeHidden();
});

test('selecting a book arms the demo and retargets the explanation diagrams', async ({ page }) => {
  await page.goto('.');
  const n = await catalogSize(page);
  expect(n).toBeGreaterThan(0);

  await page.locator('#card-4').click();

  await expect(page.locator('#btn-generate')).toBeEnabled();
  await expect(page.locator('#btn-again')).toBeEnabled();
  await expect(page.locator('#card-4')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#catalog-grid [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#selected-display')).toContainText('#4');

  // Section A's diagrams claim to describe the book you picked, not a literal.
  await expect(page.locator('#diag-single-target')).toHaveText('#4');
  await expect(page.locator('#diag-single-known')).toHaveText('#4');
  await expect(page.locator('#diag-pir-target')).toHaveText('#4');
  await expect(page.locator('#diag-pir-sd')).toHaveText('4');
  await expect(page.locator('#diag-pir-sd-b')).toHaveText('4');

  await page.locator('#card-11').click();
  await expect(page.locator('#diag-pir-target')).toHaveText('#11');
  await expect(page.locator('#diag-pir-sd')).toHaveText('11');
});

test('the recovered bit is the protocol output and agrees with the catalog', async ({ page }) => {
  await page.goto('.');
  await runQuery(page, TARGET);

  const { ra, rb, recovered } = await recovery(page);

  // The headline verdict is the XOR of the two server responses the page
  // printed — not a value this test chose.
  expect(recovered, 'r_A XOR r_B must equal the printed recovered bit').toBe(ra !== rb);

  // ...and it must equal db[i] as rendered independently in the catalog grid.
  const cardCheckedOut = await cardSaysCheckedOut(page, TARGET);
  expect(recovered, 'recovered bit must match the catalog badge for the same book').toBe(
    cardCheckedOut
  );

  // The page's own "Checked:" verdict must name the match, not the failure.
  const body = ((await step(page, 6).locator('.step-body').textContent()) ?? '').replace(
    /\s+/g,
    ' '
  );
  expect(body).toContain(
    `matches db[${TARGET}] = ${recovered ? '1' : '0'} read directly from the database`
  );
  expect(body, 'a correct run must not print the broken-protocol verdict').not.toContain(
    'DOES NOT MATCH'
  );
  expect(body).not.toContain('the protocol is broken');

  // The result badge is the human-readable form of the same bit.
  await expect(step(page, 6).locator('.result-badge')).toHaveText(
    recovered ? 'Checked out' : 'Available'
  );

  // The screen-reader announcement must carry the same bit and the same word.
  const status = ((await page.locator('#sr-status').textContent()) ?? '').replace(/\s+/g, ' ');
  expect(status).toContain(`Recovered db[${TARGET}] = ${recovered ? '1' : '0'}`);
  expect(status).toContain(recovered ? 'is checked out' : 'is available');
});

test('both server XOR chains recompute to the responses the recovery step used', async ({
  page,
}) => {
  await page.goto('.');
  await runQuery(page, TARGET);

  const S = await setElements(step(page, 1)); // Step 2 — the random subset S
  const S2 = await setElements(step(page, 3)); // Step 4 — S △ {i}

  // Step 4 claims exactly one element toggled: the target, and only the target.
  const symDiff = [
    ...S.filter((x) => !S2.includes(x)),
    ...S2.filter((x) => !S.includes(x)),
  ].sort((a, b) => a - b);
  expect(symDiff, 'S and S△{i} must differ in exactly the target index').toEqual([TARGET]);

  // Step 3 re-sends S verbatim.
  expect(await setElements(step(page, 2))).toEqual(S);

  const chainA = await xorChain(step(page, 4));
  const chainB = await xorChain(step(page, 5));

  // Each server XORs precisely the set it was sent...
  expect(chainA.indices.slice().sort((a, b) => a - b)).toEqual(S);
  expect(chainB.indices.slice().sort((a, b) => a - b)).toEqual(S2);

  // ...the printed total is the XOR of the printed bits, recomputed here...
  expect(xorAll(chainA.bits), 'Server A chain must XOR to its printed total').toBe(
    chainA.printedTotal
  );
  expect(xorAll(chainB.bits), 'Server B chain must XOR to its printed total').toBe(
    chainB.printedTotal
  );

  // ...and those totals are the r_A / r_B the recovery step then combined.
  const { ra, rb } = await recovery(page);
  expect(chainA.printedTotal).toBe(ra);
  expect(chainB.printedTotal).toBe(rb);

  // A server's view must not mark the target: the page says nothing in it does.
  await expect(step(page, 4).locator('.xor-term--target')).toHaveCount(0);
  await expect(step(page, 5).locator('.xor-term--target')).toHaveCount(0);

  // A bit that a server reports must be the bit the catalog shows for that book.
  for (let k = 0; k < chainA.indices.length; k++) {
    expect(
      await cardSaysCheckedOut(page, chainA.indices[k]),
      `Server A's bit for db[${chainA.indices[k]}] must match the catalog badge`
    ).toBe(chainA.bits[k]);
  }
});

test('the anonymity-set counters are the whole catalog and sum consistently', async ({ page }) => {
  await page.goto('.');
  const n = await catalogSize(page);
  await runQuery(page, TARGET);

  // |S| as printed must equal the number of elements actually listed.
  const S = await setElements(step(page, 1));
  const sizeText = ((await step(page, 1).locator('.step-body').textContent()) ?? '').replace(
    /\s+/g,
    ' '
  );
  const sizeMatch = /\|S\| = (\d+)/.exec(sizeText);
  expect(sizeMatch, `no |S| printed in: ${sizeText}`).not.toBeNull();
  expect(Number(sizeMatch![1]), '|S| must count the elements the page listed').toBe(S.length);

  // Step 8: both anonymity sets, enumerated candidate by candidate.
  const sets = await anonymitySets(page);
  expect(sets, 'step 8 must report an anonymity set for each server').toHaveLength(2);
  for (const s of sets) {
    expect(s.total, 'the denominator must be the catalog size').toBe(n);
    expect(s.count, 'no server may rule out a single book').toBe(n);
  }

  const proof = ((await step(page, 7).locator('.step-body').textContent()) ?? '').replace(
    /\s+/g,
    ' '
  );
  expect(proof).toContain('Both anonymity sets are the whole catalog');
  expect(proof, 'a sound run must not print the leak verdict').not.toContain(
    'Anonymity set smaller than the catalog'
  );
  expect(proof).not.toContain('the query construction is leaking');
  expect(proof).toContain(`The real target was #${TARGET}`);

  // The server-view panel repeats those numbers; consistent + summing to n.
  await expect(page.locator('#server-views')).toBeVisible();
  for (const [id, expected] of [
    ['#sv-a-note', sets[0].count],
    ['#sv-b-note', sets[1].count],
  ] as const) {
    const note = ((await page.locator(id).textContent()) ?? '').replace(/\s+/g, ' ');
    const m = /(\d+) of (\d+) books are consistent[\s\S]*?rule out (\d+)/.exec(note);
    expect(m, `unparseable server-view note: ${note}`).not.toBeNull();
    const [consistent, total, ruledOut] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect(total).toBe(n);
    expect(consistent, 'panel and step 8 must report the same anonymity set').toBe(expected);
    expect(
      consistent + ruledOut,
      'consistent + ruled out must account for every book'
    ).toBe(total);
  }

  // The panel's sets are the same sets the walkthrough sent.
  const S2 = await setElements(step(page, 3));
  const fmt = (xs: number[]) => `{${xs.join(', ')}}`;
  expect(((await page.locator('#sv-a-set').textContent()) ?? '').trim()).toBe(`S = ${fmt(S)}`);
  expect(((await page.locator('#sv-b-set').textContent()) ?? '').trim()).toBe(
    `S△{i} = ${fmt(S2)}`
  );
});

test('every book in the catalog recovers its own bit', async ({ page }) => {
  // Reduced motion renders the walkthrough in one shot, so all 16 runs fit.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  const n = await catalogSize(page);

  for (let i = 0; i < n; i++) {
    await runQuery(page, i);

    const { ra, rb, recovered } = await recovery(page);
    expect(recovered, `book ${i}: r_A XOR r_B`).toBe(ra !== rb);
    expect(recovered, `book ${i}: recovered bit vs catalog badge`).toBe(
      await cardSaysCheckedOut(page, i)
    );

    // The whole run must be about book i, top to bottom.
    await expect(step(page, 0).locator('.step-body')).toContainText(`book #${i}`);
    await expect(step(page, 6).locator('.step-title')).toHaveText(`Step 7 — Patron recovers db[${i}]`);

    const S = await setElements(step(page, 1));
    const S2 = await setElements(step(page, 3));
    const symDiff = [
      ...S.filter((x) => !S2.includes(x)),
      ...S2.filter((x) => !S.includes(x)),
    ];
    expect(symDiff, `book ${i}: exactly the target toggles`).toEqual([i]);
  }
});

test('Run Again redraws S but recovers the same bit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await runQuery(page, TARGET);

  const seen: string[] = [];
  const bits: boolean[] = [];
  for (let run = 0; run < 4; run++) {
    if (run > 0) {
      await page.locator('#btn-again').click();
      await settle(page);
    }
    seen.push((await setElements(step(page, 1))).join(','));
    bits.push((await recovery(page)).recovered);
  }

  expect(new Set(bits).size, 'the same book must recover the same bit every run').toBe(1);
  expect(
    new Set(seen).size,
    'each run must draw a fresh subset S (4 identical 16-bit draws is ~2^-48)'
  ).toBeGreaterThan(1);
});

test('changing the selection clears the previous verdict instead of leaving it stale', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await runQuery(page, 2);
  await expect(step(page, 6).locator('.step-title')).toHaveText('Step 7 — Patron recovers db[2]');

  await page.locator('#card-13').click();

  // No verdict for book 2 may survive a switch to book 13.
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(0);
  await expect(page.locator('#server-views')).toBeHidden();
  await expect(page.locator('#selected-display')).toContainText('#13');

  await page.locator('#btn-generate').click();
  await settle(page);
  await expect(step(page, 6).locator('.step-title')).toHaveText('Step 7 — Patron recovers db[13]');
  const { recovered } = await recovery(page);
  expect(recovered).toBe(await cardSaysCheckedOut(page, 13));
});

test('regression: interrupting a run mid-animation leaves the demo usable', async ({ page }) => {
  // The staggered render sets an in-flight flag that both buttons check.
  // Selecting another book cancels the pending steps; if the flag is not
  // cleared with them, Generate Query and Run Again silently stop working for
  // the rest of the session and the walkthrough is stuck aria-busy="true".
  await page.goto('.');
  await page.locator(`#card-${TARGET}`).click();
  await page.locator('#btn-generate').click();
  await expect(step(page, 0)).toBeVisible({ timeout: 5_000 });

  await page.locator('#card-3').click();
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(0);
  await expect(page.locator('#walkthrough')).toHaveAttribute('aria-busy', 'false');

  await page.locator('#btn-generate').click();
  await settle(page);
  await expect(step(page, 6).locator('.step-title')).toHaveText('Step 7 — Patron recovers db[3]');

  const { ra, rb, recovered } = await recovery(page);
  expect(recovered).toBe(ra !== rb);
  expect(recovered).toBe(await cardSaysCheckedOut(page, 3));
});

test('keyboard selection drives the same protocol as the mouse', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');

  await page.locator('#card-0').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect(page.locator('#card-2')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#btn-generate').click();
  await settle(page);

  await expect(step(page, 6).locator('.step-title')).toHaveText('Step 7 — Patron recovers db[2]');
  const { recovered } = await recovery(page);
  expect(recovered).toBe(await cardSaysCheckedOut(page, 2));
});
