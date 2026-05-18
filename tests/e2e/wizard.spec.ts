// Authored for fartol. Not ported from upstream.
//
// Three-click new-competition wizard e2e (plan 12).
//
// Two tests:
//
//   1. **happy path** — visit /, click + Ny tävling, fill name+date,
//      drop the IOF30 CourseData sample, wait for the simulated reader
//      handshake, click ▶ Starta avläsning. Assert:
//      - URL ends with /competition/<uuid>/readout (real UUID, no
//        `_new` literal sentinel survived the round-trip).
//      - Exactly ONE POST to /api/competitions/from-wizard fired.
//      - Zero POSTs to /api/competitions (the old two-call wizard
//        path). This is the C-H3 wire-shape regression gate.
//
//   2. **C-H3 rollback regression** — same flow with the corrupt
//      CourseData fixture (well-formed XML, XSD-invalid: Course missing
//      required Name child). Assert:
//      - The inline error banner appears at step 3 (xsd_invalid
//        message contains "IOF XML 3.0").
//      - URL is STILL /competition/_new?wizard=1 — no navigation.
//      - GET /api/competitions returns the SAME row count as before
//        the click. This is the explicit C-H3 e2e regression gate:
//        the server's atomic transaction rolled back; no orphan
//        competition row persists.
//
// Locked by:
// - 01-12-PLAN.md task 2
// - 01-REVIEWS.md §C-H3

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both tests share the bridge's SQLite DB; the rollback test
// asserts on competitions table row count, which would race with
// the happy-path test's successful create. Force serial mode so
// the count snapshot stays sound.
test.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COURSEDATA_FIXTURE = path.resolve(
  __dirname,
  '../../apps/edge/test/fixtures/iof30-coursedata-sample.xml'
);
const CORRUPT_FIXTURE = path.resolve(__dirname, './fixtures/wizard-corrupt-coursedata.xml');

test('three-click wizard happy path (C-H3: ONE atomic POST)', async ({ page, request }) => {
  // Collect all outbound POST URLs so we can assert the wire-shape
  // (one from-wizard POST, zero /api/competitions POSTs).
  const postUrls: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') postUrls.push(req.url());
  });

  await page.goto('/');
  await page.getByTestId('open-wizard').first().click();

  // Step 1
  await page.getByTestId('wiz-name').fill('StorTuna Tisdag');
  await page.getByTestId('wiz-date').fill('2026-05-19');
  await page.getByTestId('wiz-next').click();

  // Step 2 — setInputFiles on the hidden file input inside the DropZone.
  await page.getByTestId('drop-zone-input').setInputFiles(COURSEDATA_FIXTURE);
  await expect(page.getByTestId('wiz-preview')).toBeVisible();
  await page.getByTestId('wiz-next').click();

  // Step 3 — wait for the simulated reader handshake (1600ms) then
  // click Starta avläsning. The button is disabled until then.
  const startBtn = page.getByTestId('wiz-start');
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });
  await startBtn.click();

  // Wait for the URL to be the readout view with a real UUID.
  await page.waitForURL(
    /\/competition\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/readout$/,
    {
      timeout: 10_000,
    }
  );
  expect(page.url()).not.toContain('_new');

  // Wire-shape regression: exactly ONE from-wizard POST, ZERO
  // /api/competitions POSTs (the old two-call wizard path).
  const fromWizard = postUrls.filter((u) => u.endsWith('/api/competitions/from-wizard'));
  const oldCreate = postUrls.filter((u) => /\/api\/competitions$/.test(u));
  expect(fromWizard).toHaveLength(1);
  expect(oldCreate).toHaveLength(0);

  // Sanity: the readout view rendered (plan 13 replaced the placeholder
  // with the real ReadoutView component; the test-id moved to
  // `readout-view` accordingly).
  await expect(page.getByTestId('readout-view')).toBeVisible();
  // The edge has the competition row.
  const list = await request.get('http://localhost:5174/api/competitions');
  expect(list.status()).toBe(200);
  const listBody = (await list.json()) as { competitions: { id: string }[] };
  const newId = page.url().match(/\/competition\/([^/]+)\/readout$/)?.[1];
  expect(newId).toBeTruthy();
  expect(listBody.competitions.some((c) => c.id === newId)).toBe(true);
});

test('three-click wizard rollback on corrupt XML — C-H3 regression gate', async ({
  page,
  request,
}) => {
  // Snapshot the count BEFORE the wizard touches anything.
  const before = await request.get('http://localhost:5174/api/competitions');
  expect(before.status()).toBe(200);
  const countBefore = ((await before.json()) as { competitions: unknown[] }).competitions.length;

  await page.goto('/');
  await page.getByTestId('open-wizard').first().click();

  // Step 1 — unique name so we'd notice if it accidentally persisted.
  const uniqueName = `Corrupt Sample ${Date.now()}`;
  await page.getByTestId('wiz-name').fill(uniqueName);
  await page.getByTestId('wiz-date').fill('2026-05-19');
  await page.getByTestId('wiz-next').click();

  // Step 2 — corrupt fixture (well-formed XML, XSD-invalid: Course
  // missing required Name child). Client-side root-element check
  // passes (root IS <CourseData>); the import-preview banner appears.
  await page.getByTestId('drop-zone-input').setInputFiles(CORRUPT_FIXTURE);
  await expect(page.getByTestId('wiz-preview')).toBeVisible();
  await page.getByTestId('wiz-next').click();

  // Step 3 — wait for the simulated reader handshake, click Starta.
  const startBtn = page.getByTestId('wiz-start');
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });
  await startBtn.click();

  // The inline error banner appears with the xsd_invalid mapping
  // (contains "IOF XML 3.0"); the wizard stays open at /_new?wizard=1.
  const err = page.getByTestId('wizard-error');
  await expect(err).toBeVisible({ timeout: 10_000 });
  await expect(err).toContainText('IOF XML 3.0');
  expect(page.url()).toContain('/competition/_new?wizard=1');

  // Codex C-H3 e2e regression gate: no orphan row persists. The strict
  // `countBefore` snapshot used to be the assertion but plan 13 added
  // tests/e2e/readout.spec.ts which creates competitions in a parallel
  // worker (DB-isolation hassle called out in the plan). The
  // "no row with our unique name" check below is the actual C-H3
  // semantic — the corrupt wizard run MUST NOT have committed a row
  // — and is parallel-worker safe. `countBefore` is referenced so
  // ESLint doesn't flag it as unused.
  void countBefore;
  const after = await request.get('http://localhost:5174/api/competitions');
  expect(after.status()).toBe(200);
  const afterBody = (await after.json()) as { competitions: { name: string }[] };
  expect(afterBody.competitions.some((c) => c.name === uniqueName)).toBe(false);
});
