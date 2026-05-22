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

// E2E sandbox ports — distinct from the production-tarball defaults
// (3000 edge, 5173 web). Why: 2026-05-18 we hit a pollution bug where
// `reuseExistingServer: true` made Playwright silently piggyback on a
// developer's locally-installed fartol on :3000, so every test POSTed
// `Walkup E2E …` rows against ~/.local/share/fartol/fartol.db. Moving
// the test edges off the prod ports guarantees the sandbox is the only
// service the spec ever talks to. `reuseExistingServer` stays true for
// dev ergonomics — re-using ON :3001 is still safe because nothing
// else listens there. CI sets CI=1 which forces fresh spawns.
const TEST_EDGE_PORT = 3001;
const TEST_WEB_PORT = 5174;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${TEST_WEB_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // Bypass the `pnpm run dev` script wrapper here on purpose: pnpm 10
      // forwards the `--` separator INTO the script's argv instead of
      // consuming it (caught in CI 2026-05-19), so
      //   `pnpm --filter @fartol/edge dev -- --port=3001`
      // ends up as
      //   `tsx watch src/bin/fartol.ts -- --port=3001`
      // and similarly the web's vite invocation gets two competing --port
      // flags (vite binds 5173, playwright waits on 5174 → timeout). Using
      // `pnpm exec` invokes the tool directly with the exact argv we want.
      command: `pnpm --filter @fartol/edge exec tsx watch src/bin/fartol.ts --port=${TEST_EDGE_PORT}`,
      port: TEST_EDGE_PORT,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        FARTOL_DEV: '1',
        FARTOL_NODE_ID: 'test-node-1',
        FARTOL_DB_PATH: TMP_DB,
        // Plan 16 e2e: pin the printer sink to stdout so dev simulate-read
        // doesn't try to render a thermal receipt via CUPS (the default
        // production sink). The stdout sink writes a JSON envelope to
        // stdout instead, which matches the walking-skeleton plan-03
        // contract the rest of the e2e suite was authored against.
        FARTOL_PRINTER: 'stdout',
      },
    },
    {
      // Custom Vite port + FARTOL_EDGE_PORT env so the web proxy routes
      // /api and /ws to the sandbox edge instead of whatever happens to
      // be on :3000. vite.config.ts reads FARTOL_EDGE_PORT. Direct
      // `pnpm exec vite` for the same reason as the edge entry above.
      command: `pnpm --filter @fartol/web exec vite dev --port ${TEST_WEB_PORT}`,
      port: TEST_WEB_PORT,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        FARTOL_EDGE_PORT: String(TEST_EDGE_PORT),
      },
    },
  ],
});
