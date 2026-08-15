import { test } from '@playwright/test';
import { boot, driveAllStates, expectBaselineNotStale, NARROW } from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The catalog is selected from and queries generated, and every resulting
 * rendering is scanned in both themes at desktop and phone width. See `gate.ts`
 * for why nothing is injected into the page, why each scan asserts its content
 * first, and why `violations` is not the whole oracle.
 */

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, theme);
    await driveAllStates(page, theme);

    // The third ratchet rule — a baselined finding that no longer appears must
    // be deleted, so the list can only shrink. `expectBaselineNotStale` was
    // exported from `gate.ts` and imported by nothing, so it had never run.
    //
    // Called in all four configurations, which this lab's baseline permits: all
    // three entries are produced by all four drives, confirmed through the
    // gate's own capture path rather than assumed. (Sibling labs do not have
    // that luxury — an accent-bordered control fails in one theme only, and
    // there the check has to be scoped to the drive that sees it.)
    expectBaselineNotStale();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expectBaselineNotStale();
  });
}
