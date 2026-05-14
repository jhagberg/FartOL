// Authored for fartol. Not ported from upstream.
//
// Playwright walking-skeleton e2e (plan 03). Drives the full simulate-read
// vertical headlessly:
//
//   1. The webServer entries in playwright.config.ts spawn @fartol/edge
//      (FARTOL_DEV=1) on :3000 and @fartol/web (vite dev) on :5173.
//   2. The test opens http://localhost:5173/, waits for the page button to
//      mount, and clicks "Simulate read".
//   3. The page POSTs to /api/__dev/simulate-read; the bridge inserts a
//      card_read event, broadcasts via WS, and the page renders the
//      envelope as `card_number=7501853`.
//   4. The test asserts (a) the rendered <li> appears and (b) GET
//      /api/health returns 200 (the bin is alive).
//
// The stdout-sink JSON line assertion does NOT happen here — Playwright's
// webServer captures process stdout but exposes it only via the
// playwright-report artefact, which is opaque to the spec. The dev
// route's unit test in apps/edge/src/routes/dev.test.ts already asserts
// that the printer sink is called for every successful simulate-read,
// so the wire is end-to-end-tested across two layers without a third
// stdout-grep assertion here.

import { test, expect } from '@playwright/test';

test('walking-skeleton: simulate-read -> WS broadcast -> UI render', async ({ page, request }) => {
  // Sanity: the edge bridge is reachable via the vite dev proxy.
  const health = await request.get('http://localhost:5173/api/health');
  expect(health.status()).toBe(200);

  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('FartOL');

  const button = page.getByTestId('simulate-read-btn');
  await expect(button).toBeVisible();

  // Click the button and wait for the WS broadcast to round-trip back to
  // the page. The card_number 7501853 is the SI10 Jonas-001 fixture.
  await button.click();

  const event = page.getByTestId('event').first();
  await expect(event).toBeVisible({ timeout: 5_000 });
  await expect(event).toHaveText('card_number=7501853');

  // Bin liveness — the health route owns no DB state but proves the bin
  // didn't crash mid-simulate-read.
  const healthAfter = await request.get('http://localhost:5173/api/health');
  expect(healthAfter.status()).toBe(200);
});
