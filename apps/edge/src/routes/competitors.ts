// Authored for fartol. Not ported from upstream.
//
// REST routes for competitors — walk-up registration (D-04 first-class) +
// list/single read. POST /api/competitors is the path the SvelteKit walk-up
// modal (plan 14) consumes.
//
// Routes registered here:
//   - POST /api/competitors                              — walk-up create + optional card_bound event (atomic)
//   - GET  /api/competitions/:id/competitors             — list competitors for a competition
//   - GET  /api/competitions/:id/competitors/:competitorId  — single competitor (walk-up modal pre-fill)
//
// Workflow for POST /api/competitors:
//
//   1. Zod safeParse(CompetitorCreateInput) → 400 with structured errors if
//      consent !== true OR any field fails.
//   2. Verify competition_id exists → 404 if not.
//   3. Verify class_id exists AND belongs to competition_id → 422 if
//      semantically wrong (T-CLASS-COMP-MISMATCH).
//   4. If card_number provided, check the partial unique index — another
//      competitor in this competition holding the same card → 409 with
//      `{ error: 'card_taken', existing_competitor_id }`. Operator-visible
//      UI in plan 14 surfaces this.
//   5. In a single sqlite.transaction:
//        - Insert competitor row with consent_at_ms = Date.now(), consent
//          status default 'explicit', scrubbed_at_ms = null.
//        - If club non-null + non-empty, upsert clubs row (ON CONFLICT name
//          DO UPDATE last_seen_at_ms).
//        - If card_number provided, insert events row eventType='card_bound'
//          + payload with competitor_id + card_number + walkup=true +
//          consent_at_ms. local_seq via app.fartolNextLocalSeq (PATTERNS
//          S-2 injection so test 9 can swap a throwing fn).
//   6. After commit, if card_number provided, app.wsBroadcast on
//      readout:<competition_id> with type='card_bound' + payload.
//   7. Return 201 + CompetitorDTO.
//
// REQ-PRIV-001: server attests consent_at_ms (Date.now()); the client cannot
// backdate. T-CONSENT-BYPASS mitigation lives in the Zod literal `true`.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-04-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-04 D-11
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Walk-up modal"

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { CompetitorCreateInput, type CompetitorDTO, readoutChannel } from '@fartol/shared-types';
import { classes, clubs, competitions, competitors, events } from '../db/schema.ts';
import type { Competitor } from '../db/types.ts';
import { issuesToErrors } from './_zod-errors.ts';

function competitorRowToDTO(row: Competitor): CompetitorDTO {
  return {
    id: row.id,
    competition_id: row.competitionId,
    name: row.name,
    club: row.club,
    class_id: row.classId,
    card_number: row.cardNumber,
    consent_at_ms: row.consentAtMs,
    consent_status: row.consentStatus,
    scrubbed_at_ms: row.scrubbedAtMs,
  };
}

export default async function registerCompetitors(app: FastifyInstance): Promise<void> {
  // POST /api/competitors — walk-up registration (D-04 first-class).
  app.post('/api/competitors', async (req, reply) => {
    const parsed = CompetitorCreateInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(issuesToErrors(parsed.error.issues));
    }
    const input = parsed.data;

    // (2) Competition must exist.
    const compRow = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, input.competition_id))
      .get();
    if (!compRow) return reply.code(404).send({ error: 'competition not found' });

    // (3) Class must exist AND belong to the competition.
    const classRow = app.fartolDb.db
      .select({ id: classes.id, competitionId: classes.competitionId })
      .from(classes)
      .where(eq(classes.id, input.class_id))
      .get();
    if (!classRow) return reply.code(422).send({ error: 'class not found' });
    if (classRow.competitionId !== input.competition_id) {
      return reply.code(422).send({ error: 'class does not belong to competition' });
    }

    // (4) Card-taken check — D-11 partial unique index covers this at the
    // SQL layer but a pre-flight SELECT gives the operator a structured
    // 409 response (with the colliding competitor id) instead of a raw
    // SQLITE_CONSTRAINT_UNIQUE error.
    if (input.card_number !== null) {
      const collision = app.fartolDb.db
        .select({ id: competitors.id })
        .from(competitors)
        .where(
          and(
            eq(competitors.competitionId, input.competition_id),
            eq(competitors.cardNumber, input.card_number)
          )
        )
        .get();
      if (collision) {
        return reply.code(409).send({ error: 'card_taken', existing_competitor_id: collision.id });
      }
    }

    // (5) Atomic insert: competitor + (clubs upsert) + (card_bound event).
    const now = Date.now();
    const competitorId = crypto.randomUUID();
    let seq: number | null = null;

    app.fartolDb.sqlite.transaction(() => {
      app.fartolDb.db
        .insert(competitors)
        .values({
          id: competitorId,
          competitionId: input.competition_id,
          name: input.name,
          club: input.club,
          classId: input.class_id,
          cardNumber: input.card_number,
          consentAtMs: now,
          consentStatus: 'explicit',
          scrubbedAtMs: null,
        })
        .run();

      if (input.club !== null && input.club.length > 0) {
        // ON CONFLICT (name) DO UPDATE last_seen_at_ms = excluded.last_seen_at_ms.
        // Drizzle exposes onConflictDoUpdate on the sqlite insert builder.
        app.fartolDb.db
          .insert(clubs)
          .values({ name: input.club, lastSeenAtMs: now })
          .onConflictDoUpdate({
            target: clubs.name,
            set: { lastSeenAtMs: now },
          })
          .run();
      }

      if (input.card_number !== null) {
        // PATTERNS S-2 injection: app.fartolNextLocalSeq defaults to the
        // real nextLocalSeq trailing-edge SELECT; test 9 swaps in a
        // throwing fn to verify transactional atomicity.
        seq = app.fartolNextLocalSeq(app.fartolDb, app.fartolNodeId);
        app.fartolDb.db
          .insert(events)
          .values({
            nodeId: app.fartolNodeId,
            localSeq: seq,
            competitionId: input.competition_id,
            eventType: 'card_bound',
            eventTimeMs: now,
            recordedAtMs: now,
            payload: {
              event_type: 'card_bound',
              competitor_id: competitorId,
              card_number: input.card_number,
              walkup: true,
              consent_at_ms: now,
            },
          })
          .run();
      }
    })();

    // (6) Broadcast AFTER commit so subscribers only see committed state.
    if (input.card_number !== null && seq !== null) {
      app.wsBroadcast(readoutChannel(input.competition_id), {
        type: 'card_bound',
        payload: {
          competitor_id: competitorId,
          card_number: input.card_number,
          competition_id: input.competition_id,
          class_id: input.class_id,
          name: input.name,
          club: input.club,
        },
        seq,
      });
      // Plan 08: walk-up bind ALSO touches the projection (clears
      // pending_unknown_cards once the projection sees this card_bound
      // event AND the competitor is now matchable against subsequent
      // card_read events). markDirty schedules a recompute + per-class
      // results_update broadcast.
      app.projectionStore.markDirty(input.competition_id);
    }

    // Echo the created row.
    const dto: CompetitorDTO = {
      id: competitorId,
      competition_id: input.competition_id,
      name: input.name,
      club: input.club,
      class_id: input.class_id,
      card_number: input.card_number,
      consent_at_ms: now,
      consent_status: 'explicit',
      scrubbed_at_ms: null,
    };
    return reply.code(201).send(dto);
  });

  // GET /api/competitions/:id/competitors — list competitors.
  app.get<{ Params: { id: string } }>('/api/competitions/:id/competitors', async (req, reply) => {
    const { id } = req.params;
    const compRow = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, id))
      .get();
    if (!compRow) return reply.code(404).send({ error: 'competition not found' });
    const rows = app.fartolDb.db
      .select()
      .from(competitors)
      .where(eq(competitors.competitionId, id))
      .orderBy(asc(competitors.name))
      .all();
    return { competitors: rows.map(competitorRowToDTO) };
  });

  // GET /api/competitions/:id/competitors/:competitorId — single competitor.
  app.get<{ Params: { id: string; competitorId: string } }>(
    '/api/competitions/:id/competitors/:competitorId',
    async (req, reply) => {
      const { id, competitorId } = req.params;
      const row = app.fartolDb.db
        .select()
        .from(competitors)
        .where(and(eq(competitors.competitionId, id), eq(competitors.id, competitorId)))
        .get();
      if (!row) return reply.code(404).send({ error: 'competitor not found' });
      return competitorRowToDTO(row);
    }
  );
}
