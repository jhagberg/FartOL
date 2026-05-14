// Authored for fartol. Not ported from upstream.
//
// Playwright config for the repo-root e2e suite. Plan 01 lands the
// structural skeleton (zero specs but a valid config so
// `npx playwright test --list` exits 0). The walking-skeleton e2e flow
// (skeleton, three-click wizard, readout simulate-read, walk-up, IOF
// export round-trip) lands in plan 03.
//
// webServer entries spawn the bridge + the SvelteKit dev server in
// parallel so any spec can hit http://localhost:5173 with /api proxied
// to :3000. reuseExistingServer keeps Playwright from churning servers
// on every spec.

import { defineConfig } from '@playwright/test';

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
    },
    {
      command: 'pnpm --filter @fartol/web dev',
      port: 5173,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
