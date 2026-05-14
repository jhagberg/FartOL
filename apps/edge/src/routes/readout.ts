// Authored for fartol. Not ported from upstream.
//
// REST handler: `GET /api/competitions/:id/readout`. Returns the live
// readout-view state in a single envelope so plan 13's SvelteKit
// /competition/[id]/readout page can paint on mount without waiting for
// the WS hello round-trip:
//
//   {
//     competition_id,
//     active,                  // true iff config.active_competition_id === id
//     current_read,            // last card_read row (any class) or null
//     history,                 // last 12 card_read events, newest first
//     pending_unknown_cards,   // from the projection store
//   }
//
// Each history row carries the per-event status (OK / MP / DNF / PEND)
// derived from the competitor's current projected view AND an
// `unmatched: boolean` flag for cards that didn't bind to any competitor.
// The status reflects the competitor's CURRENT state — re-reads update
// the OK/MP gate via reduce(), so an old card_read that was OK at the
// time but later overridden by manual_dnf shows status=DNF here. This
// matches UI-SPEC §"Readout view live behavior" (the history row label
// reflects the same data the live status pills do).
//
// `pending_unknown_cards` comes straight from the projection cache so
// plan 13's walk-up modal trigger reads the same source as the WS
// `results:` channel.
//
// Plan 13 + plan 14 contract: the SPA mounts → hits this endpoint for
// first paint → subscribes to WS readout:<id> for incremental updates.
// REST is the snapshot; WS is the delta.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-09-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Readout view live behavior" (history cap 12; current_read = most
//   recent card_read; pending_unknown_cards drives walk-up modal)
// - REQ-EVT-CMP-004 (walk-up registration)
// - REQ-EVT-CMP-005 (auto-attach card → competitor)

import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';

import { events, competitors as competitorsTable, config } from '../db/schema.ts';
import type { PunchStatus } from '../projection/types.ts';
import type { EventPayload } from '../db/schema.ts';

const ACTIVE_COMP_KEY = 'active_competition_id';

interface HistoryRow {
  event_time_ms: number;
  local_seq: number;
  card_number: number;
  card_type: string;
  competitor_id: string | null;
  competitor_name: string | null;
  status: PunchStatus;
  unmatched: boolean;
  /** Raw card punches in card order. Codes match station numbers; the
   * UI computes splits client-side from seconds_in_half_day. */
  punches: Array<{ code: number; seconds_in_half_day: number; half_day: number }>;
  /** Finish timestamp on the card, or null if the card never reached
   * the finish station. Used by the UI to compute elapsed time. */
  finish_seconds_in_half_day: number | null;
  finish_half_day: number | null;
  /** Start timestamp on the card, or null. */
  start_seconds_in_half_day: number | null;
  start_half_day: number | null;
}

interface ReadoutResponse {
  competition_id: string;
  active: boolean;
  current_read: HistoryRow | null;
  history: HistoryRow[];
  pending_unknown_cards: number[];
}

const HISTORY_CAP = 12;

export default async function registerReadoutRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/competitions/:id/readout',
    async (req, reply): Promise<ReadoutResponse | undefined> => {
      const { id } = req.params;

      // Pull the last 12 card_read events for this competition, newest
      // first. Order by event_time_ms DESC then local_seq DESC so a tied
      // event_time still produces a deterministic order. Deliberately do
      // NOT 404 on unknown competition (per plan-09 task 2 done criteria
      // test 6): an empty result for a nonexistent competition is the
      // same shape as a real-but-empty competition; downstream plans can
      // layer a 404 if desired.
      const cardReadRows = app.fartolDb.db
        .select()
        .from(events)
        .where(and(eq(events.competitionId, id), eq(events.eventType, 'card_read')))
        .orderBy(desc(events.eventTimeMs), desc(events.localSeq))
        .limit(HISTORY_CAP)
        .all();

      // Build the card_number → competitor index for this competition.
      const compRows = app.fartolDb.db
        .select()
        .from(competitorsTable)
        .where(eq(competitorsTable.competitionId, id))
        .all();
      const byCard = new Map<number, (typeof compRows)[number]>();
      for (const c of compRows) {
        if (c.cardNumber !== null) byCard.set(c.cardNumber, c);
      }

      // Source per-event status from the projection cache (or compute on
      // first read). The projection.competitors map keys on competitor_id,
      // and `pending_unknown_cards` is the canonical unknown-card source.
      let projection = app.projectionStore.get(id);
      if (projection === null) projection = app.projectionStore.recomputeNow(id);

      const history: HistoryRow[] = cardReadRows.map((e) => {
        const payload = e.payload as Extract<EventPayload, { event_type: 'card_read' }>;
        const competitor = byCard.get(payload.card_number);
        const view = competitor && projection ? projection.competitors.get(competitor.id) : null;
        return {
          event_time_ms: e.eventTimeMs,
          local_seq: e.localSeq,
          card_number: payload.card_number,
          card_type: payload.card_type,
          competitor_id: competitor?.id ?? null,
          competitor_name: competitor?.name ?? null,
          status: view?.status ?? 'PEND',
          unmatched: !competitor,
          punches: payload.punches.map((p) => ({
            code: p.code,
            seconds_in_half_day: p.seconds_in_half_day,
            half_day: p.half_day,
          })),
          finish_seconds_in_half_day: payload.finish?.seconds_in_half_day ?? null,
          finish_half_day: payload.finish?.half_day ?? null,
          start_seconds_in_half_day: payload.start?.seconds_in_half_day ?? null,
          start_half_day: payload.start?.half_day ?? null,
        };
      });

      const currentRead = history[0] ?? null;
      const pendingUnknownCards = projection?.pending_unknown_cards ?? [];

      // The active flag mirrors the persisted active_competition_id config
      // singleton (the canonical source — sessions.ts writes to it on POST
      // /api/sessions/active-competition). Reading directly from the config
      // table sidesteps Fastify's plugin-scope encapsulation: setting
      // `app.activeCompetitionId` inside the sessions plugin scope does
      // not propagate to sibling plugin scopes (this route). The DB row is
      // a single source of truth that every plugin sees.
      const activeRow = app.fartolDb.db
        .select({ value: config.value })
        .from(config)
        .where(eq(config.key, ACTIVE_COMP_KEY))
        .get();
      const isActive = (activeRow?.value ?? null) === id;

      const response: ReadoutResponse = {
        competition_id: id,
        active: isActive,
        current_read: currentRead,
        history,
        pending_unknown_cards: pendingUnknownCards,
      };
      void reply.code(200);
      return response;
    }
  );
}
