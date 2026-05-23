// Authored for fartola. Not ported from upstream.
//
// Retroactive card-to-competitor binding. After EntryList import (plan 05),
// the newly-created competitor rows carry cardNumber values that may
// already have been read while the bridge was idle (no active competition).
// The race:
//
//   t=0  bridge.card_read(card_number=7501853) — no competitor exists yet
//        → projection.pending_unknown_cards = [7501853]
//   t=5s POST /api/competitions/:id/import (EntryList) creates competitor X
//        with cardNumber=7501853.
//        Without intervention, the projection would STILL see that
//        card_read as unmatched on the next reduce() (no card_bound exists
//        to dismiss it, and the linear-scan/cardIndex match only happens
//        inside the reducer — which means the moment the competitor row
//        is added AND a reduce() runs, the match goes through anyway).
//        BUT pending_unknown_cards.add() is keyed on each card_read pass;
//        the second reduce after import correctly attaches the read AND
//        drops the card from pending. The synthetic card_bound this
//        module emits records that retroactive bind as a first-class
//        event in the immutable log — so on REPLAY, the projection
//        history is the same whether we replayed before-or-after the
//        bind landed.
//
// Contract:
//   - autoBindNewCompetitors walks the events table for all card_read
//     payloads whose card_number matches a competitor in the competition
//     with no existing card_bound event yet, and emits one synthetic
//     card_bound event per match.
//   - walkup=false on the synthetic event distinguishes it from the
//     plan-04 walk-up path (POST /api/competitors) where walkup=true.
//   - Idempotent: calling twice produces zero new events on the second
//     pass (the existence check on card_bound is the gate).
//   - Cross-competition isolation: the json_extract WHERE clause includes
//     competitionId — a competitor in competition A with cardNumber=X
//     does NOT trigger auto-bind in competition B.
//   - Event timing: synthetic card_bound uses event_time_ms = max(
//     competitor.consentAtMs, Date.now()) → for EntryList-imported
//     competitors consentAtMs is null, so we use Date.now(). The
//     event_time is AFTER any prior card_read so the events sort
//     deterministically (sort key is event_time_ms then local_seq).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-09-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11
//   (hybrid matching — auto-attach on start-list match)
// - REQ-EVT-CMP-004 (walk-up registration; this module closes the
//   retroactive case)
// - REQ-EVT-CMP-005 (auto-attach on start-list match)

import { eq, and, sql } from 'drizzle-orm';

import { events, competitors as competitorsTable } from '../db/schema.ts';
import { insertEvent } from '../si/eventInserter.ts';
import type { DbHandle } from '../db/index.ts';

export interface AutoBindResult {
  bound: Array<{ competitor_id: string; card_number: number }>;
}

/**
 * Walk every competitor in `competitionId` and emit a synthetic
 * card_bound event for any that (a) have a non-null cardNumber, (b) have
 * no existing card_bound event yet, AND (c) have at least one prior
 * card_read event with the same card_number. Returns the list of bound
 * (competitor_id, card_number) pairs so callers can include them in the
 * import response payload.
 *
 * Caller's responsibility: invoke `projectionStore.markDirty(competitionId)`
 * AFTER this returns so the next reduce() picks up the new card_bound
 * events.
 */
export function autoBindNewCompetitors(
  handle: DbHandle,
  competitionId: string,
  nodeId: string
): AutoBindResult {
  const result: AutoBindResult = { bound: [] };

  // 1. Find competitors in this competition with non-null cardNumber.
  const candidates = handle.db
    .select()
    .from(competitorsTable)
    .where(
      and(
        eq(competitorsTable.competitionId, competitionId),
        sql`${competitorsTable.cardNumber} IS NOT NULL`
      )
    )
    .all();

  for (const c of candidates) {
    if (c.cardNumber === null) continue; // defensive (SQL filter already excludes)

    // 2. Skip if a card_bound event for this competitor already exists in
    //    this competition. json_extract WHERE keeps the lookup scoped to
    //    the right competition row (T-CROSS-COMP-BIND mitigation).
    const existing = handle.db
      .select({ localSeq: events.localSeq })
      .from(events)
      .where(
        and(
          eq(events.competitionId, competitionId),
          eq(events.eventType, 'card_bound'),
          sql`json_extract(${events.payload}, '$.competitor_id') = ${c.id}`
        )
      )
      .get();
    if (existing) continue;

    // 3. Only emit if at least one card_read event for this card_number
    //    has already landed — otherwise there's no race to resolve.
    const seenRead = handle.db
      .select({ localSeq: events.localSeq })
      .from(events)
      .where(
        and(
          eq(events.competitionId, competitionId),
          eq(events.eventType, 'card_read'),
          sql`json_extract(${events.payload}, '$.card_number') = ${c.cardNumber}`
        )
      )
      .get();
    if (!seenRead) continue;

    // 4. Emit the synthetic card_bound. consent_at_ms inherits from the
    //    competitor row when present; falls back to Date.now() for
    //    EntryList-imported competitors (consent_status=
    //    'pending_first_read' starts at consent_at_ms=null and is
    //    completed by plan 14's first-read confirmation toast).
    //    event_time_ms uses the same effective value so the event sorts
    //    AFTER the originating card_read in the deterministic walk.
    const nowMs = Date.now();
    const effectiveConsentAtMs = c.consentAtMs ?? nowMs;
    insertEvent(
      handle,
      nodeId,
      'card_bound',
      nowMs,
      {
        event_type: 'card_bound',
        competitor_id: c.id,
        card_number: c.cardNumber,
        walkup: false,
        consent_at_ms: effectiveConsentAtMs,
      },
      competitionId
    );

    result.bound.push({ competitor_id: c.id, card_number: c.cardNumber });
  }

  return result;
}
