// Authored for fartola. Not ported from upstream.
//
// Placeholder Playwright spec for Phase 1 plan 01. Exists so
// `pnpm exec playwright test --list` exits 0 with the structural
// config in place. The real walking-skeleton flow (home page reachable,
// /api/health proxied through Vite to Fastify) lands in plan 03; the
// full e2e set (three-click wizard, readout simulate-read, walk-up,
// IOF export round-trip) lands in plans 11+.

import { test } from '@playwright/test';

test.skip('walking-skeleton placeholder (real spec lands in plan 03)', () => {
  // Intentionally skipped — see file header.
});
