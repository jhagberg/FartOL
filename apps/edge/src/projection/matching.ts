// Authored for fartol. Not ported from upstream.
//
// Pure card-to-competitor matching helpers. REQ-EVT-CMP-005 D-11: when a
// card_read event arrives, the reducer looks up the competitor whose
// `cardNumber` matches; if no row matches the card becomes a
// pendingUnknownCard (driving the walk-up modal — UI-SPEC §"Walk-up modal").
//
// Plan 09 adds `buildCardIndex(competitors)` so the reducer can build a
// `Map<cardNumber, Competitor>` ONCE per reduce() call and then O(1) look
// up per card_read event during the walk. matchCardToCompetitor stays
// available for one-off non-reducer call sites (e.g. ad-hoc REST handlers).
//
// Per codex review C-H5: this file imports the internal Drizzle row type
// from `../db/types.ts` (NOT from `@fartol/shared-types`). The reducer
// boundary stays inside apps/edge.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-09-PLAN.md task 1
//   (buildCardIndex + reduce.ts O(1) lookup)
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5

import type { Competitor } from '../db/types.ts';

/** Readonly view of a card_number → Competitor lookup table. */
export type CardIndex = ReadonlyMap<number, Competitor>;

/**
 * Build a `Map<cardNumber, Competitor>` for O(1) lookup inside reduce().
 * Competitors with `cardNumber === null` are skipped (they cannot match a
 * card_read). Last-write-wins on duplicate card_numbers — the D-11 partial
 * unique index already prohibits duplicates at the DB layer, so this is a
 * defensive fallback only.
 */
export function buildCardIndex(competitors: readonly Competitor[]): CardIndex {
  const map = new Map<number, Competitor>();
  for (const c of competitors) {
    if (c.cardNumber !== null) map.set(c.cardNumber, c);
  }
  return map;
}

/**
 * Return the competitor whose `cardNumber` matches the read card, or null
 * when no row matches. Caller (reduce.ts) treats null as a walk-up trigger.
 *
 * Plan 09 note: prefer `buildCardIndex(competitors).get(cardNumber) ?? null`
 * when looking up many cards against the same competitor list (as reduce
 * does). This O(n) helper stays for ad-hoc callers (single lookup).
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
