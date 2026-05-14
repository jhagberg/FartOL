// Authored for fartol. Not ported from upstream.
//
// Pure card-to-competitor matching helper. REQ-EVT-CMP-005 D-11: when a
// card_read event arrives, the reducer looks up the competitor whose
// `cardNumber` matches; if no row matches the card becomes a
// pendingUnknownCard (driving the walk-up modal — UI-SPEC §"Walk-up modal").
//
// The function is intentionally minimal — O(n) linear scan. Phase 1 club
// training has ≤ 40 competitors per competition, so an indexed lookup is
// pointless. Plan 08 (results projection) calls this once per card_read
// event during reduce(); for 1000 events × 40 competitors that's 40k
// comparisons total which runs in microseconds.
//
// Per codex review C-H5: this file imports the internal Drizzle row type
// from `../db/types.ts` (NOT from `@fartol/shared-types`). The reducer
// boundary stays inside apps/edge.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5

import type { Competitor } from '../db/types.ts';

/**
 * Return the competitor whose `cardNumber` matches the read card, or null
 * when no row matches. Caller (reduce.ts) treats null as a walk-up trigger.
 */
export function matchCardToCompetitor(
  cardNumber: number,
  competitors: readonly Competitor[]
): Competitor | null {
  for (const c of competitors) {
    if (c.cardNumber === cardNumber) return c;
  }
  return null;
}
