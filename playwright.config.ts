// Authored for fartol. Not ported from upstream.
//
// Playwright config for the repo-root e2e suite. Plan 01 lands the
// structural skeleton (zero specs but a valid config so
// `npx playwright test --list` exits 0). Plan 03 lands the
// walking-skeleton spec (tests/e2e/walking-skeleton.spec.ts) and
// extends the webServer entries so the edge bridge boots with
// FARTOL_DEV=1 + FARTOL_NODE_ID=test-node-1 + a tmp DB path.
//
// webServer entries spawn the bridge + the SvelteKit dev server in
// parallel so any spec can hit http://localhost:5173 with /api proxied
// to :3000. reuseExistingServer keeps Playwright from churning servers
// on every spec.

import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Walking-skeleton e2e: a tmp DB in tests/e2e/.tmp.db avoids polluting
// the repo root. The path is deterministic so a developer can `rm -f
// tests/e2e/.tmp.db*` between runs if the WAL leaves cruft.
const TMP_DB = path.resolve(__dirname, 'tests/e2e/.tmp.db');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @fartol/edge dev',
      port: 3000,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        FARTOL_DEV: '1',
        FARTOL_NODE_ID: 'test-node-1',
        FARTOL_DB_PATH: TMP_DB,
      },
    },
    {
      command: 'pnpm --filter @fartol/web dev',
      port: 5173,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
