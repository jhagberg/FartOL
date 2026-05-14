// Authored for fartol. Not ported from upstream.
//
// CompetitionState + view types for the pure-reducer projection layer.
// The reducer in `./reduce.ts` turns (events table + course + competitors)
// into this in-memory shape, which the REST GETs (plan 08) and the
// WS results channel (plan 08) consume.
//
// Codex review C-H2 (HIGH): card_read carries top-level start/finish/check/
// clear HalfDayClock fields (Phase 0 NDJSON surface). The reducer reads
// `payload.start` / `payload.finish` directly — `latest_start` + `latest_finish`
// are kept on the CompetitorView so plan 16's IOF XML export can render
// <StartTime> + <FinishTime> without re-walking the event log.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-09 D-11 D-12
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2
// - .planning/adr/0003-event-sourcing-as-core-data-model.md
// - REQ-EVT-003 / REQ-EVT-004 (reducer is pure + idempotent)

import type { NdjsonPunch, HalfDayClock } from '@fartol/sportident';

export type PunchStatus = 'PEND' | 'OK' | 'MP' | 'DNF';

/** One competitor's projected view — what readout + receipts render. */
export interface CompetitorView {
  id: string;
  name: string;
  club: string | null;
  class_id: string;
  card_number: number | null;
  status: PunchStatus;
  /** Append-only history of card_read events for this competitor, oldest
   * first. plan 16 IOF export iterates the latest entry; plan 14 receipt
   * mirror can show prior reads. */
  card_read_history: Array<{
    event_time_ms: number;
    card_number: number;
    punches: NdjsonPunch[];
    start: HalfDayClock | null;
    finish: HalfDayClock | null;
  }>;
  latest_punches: NdjsonPunch[];
  /** C-H2: kept on the view so plan 16 (IOF XML export) can render
   * <StartTime> without re-walking the event log. */
  latest_start: HalfDayClock | null;
  /** C-H2: kept on the view so plan 16 (IOF XML export) can render
   * <FinishTime> without re-walking the event log. */
  latest_finish: HalfDayClock | null;
  missing_codes: number[];
  extra_codes: number[];
  out_of_order_codes: number[];
  elapsed_time_ms: number | null;
  manual_dnf_reason: string | null;
}

/** One row in the per-class results table. ResultView is the projection
 * shape the WS results channel (plan 08) broadcasts and plan 16 reads. */
export interface ResultView {
  competitor_id: string;
  name: string;
  club: string | null;
  status: PunchStatus;
  elapsed_time_ms: number | null;
  /** 1-based place among OK competitors; null for MP/DNF/PEND. */
  place: number | null;
  /** ms behind the leader for OK rows; null otherwise. */
  behind_leader_ms: number | null;
}

/** Top-level reducer output. Maps are used (not arrays) so callers can
 * O(1)-look up competitors by id. */
export interface CompetitionState {
  competition_id: string;
  competitors: Map<string, CompetitorView>;
  results_by_class: Map<string, ResultView[]>;
  /** Card numbers seen via card_read for which no competitor row matched.
   * Drives the walk-up modal (UI-SPEC §"Walk-up modal"). Sorted ascending
   * for deterministic snapshots. */
  pending_unknown_cards: number[];
  /** Highest local_seq of any event consumed by this projection — plan 08
   * uses this to skip already-applied events on incremental rebuilds. */
  last_event_seq: number;
}
