import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Scans the full page with every collapsible expanded,
 * animations neutralized, in both dark (default) and light themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Expand every <details>, reveal class-toggled/hidden panels, kill animations. */
async function revealEverything(page: Page): Promise<void> {
  // Neutralize transitions/animations/opacity so mid-fade states never produce
  // phantom contrast failures.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
    .walk-step { transform: none !important; }`,
  });

  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('details'))) {
      (d as HTMLDetailsElement).open = true;
    }
    // Reveal the JS-toggled server-view panel that starts display:none.
    const sv = document.getElementById('server-views');
    if (sv) sv.style.display = 'grid';
  });
}

/** Run the walkthrough so its dynamically-injected content is scanned too. */
async function runWalkthrough(page: Page): Promise<void> {
  await page.locator('#card-9').click();
  await page.locator('#btn-generate').click();
  // Steps render staggered; wait for the run to finish (aria-busy flips false).
  await expect(page.locator('#walkthrough')).toHaveAttribute('aria-busy', 'false', {
    timeout: 10_000,
  });
  await expect(page.locator('#walkthrough .walk-step')).toHaveCount(8, { timeout: 10_000 });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await runWalkthrough(page);
  await revealEverything(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await runWalkthrough(page);
  await revealEverything(page);
  await scan(page);
});
