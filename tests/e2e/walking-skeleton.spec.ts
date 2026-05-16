// Authored for fartol. Not ported from upstream.
//
// Plan 03's walking-skeleton e2e — RETIRED in plan 12.
//
// Plan 12 retires the simulate-read button from `/` (it moves into the
// readout view in plan 13), so the original assertions (h1=FartOL,
// simulate-read-btn, event=card_number=7501853) no longer line up with
// the page surface. The dev-only simulate-read endpoint itself still
// exists and is exercised by apps/edge/src/routes/dev.test.ts; the
// vertical slice it proved (simulate-read → WS broadcast → UI render)
// will be re-asserted in plan 13's readout e2e spec.
//
// Locked by:
// - 01-12-PLAN.md task 1 (retire walking-skeleton placeholder)
// - 01-13-PLAN.md (readout view will host the new simulate-read assertion)

import { test } from '@playwright/test';

test.skip('walking-skeleton (retired in plan 12; replaced by plan 13 readout e2e)', () => {
  // Intentionally skipped — see file header.
});
