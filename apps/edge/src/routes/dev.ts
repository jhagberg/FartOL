// Authored for fartol. Not ported from upstream.
//
// Development-only routes — registered ONLY when process.env.FARTOL_DEV
// equals '1'. In production builds the plugin is still mounted by
// server.ts but the route registration short-circuits at the env check
// (T-DEV-ENDPOINT mitigation). The Fastify @fastify/sensible 404 handler
// then returns `{ error: 'Not found' }` for any /api/__dev/* path —
// indistinguishable from "no such endpoint."
//
// /api/__dev/simulate-read is the walking-skeleton vertical:
//   - inserts a card_read event into the events table (single transaction)
//   - broadcasts via WS readout:<competitionId> with seq populated
//   - calls printerSink.print() so the stdout sink emits one JSON line
//
// Plan 06 Task 2 refactors this handler to call insertEvent + populate the
// full CardReadEvent shape (start/finish/check/clear/card_holder/punch_count)
// per codex C-H2. For plan 03 the simplified shape is fine — walking
// skeleton placeholder, not the production wire shape.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Open Question 5" (simulate-read consumes Phase 0 Jonas fixtures)
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Tweaks panel" (Simulate-read is dev-only, behind env / ?dev=1)

import type { FastifyInstance } from 'fastify';

import { events, competitions } from '../db/schema.ts';
import { nextLocalSeq } from '../db/seq.ts';
import { readoutChannel } from '@fartol/shared-types';
import { eq } from 'drizzle-orm';

interface SimulateReadBody {
  competition_id?: unknown;
  card_number?: unknown;
  card_type?: unknown;
  punches?: unknown;
}

interface SimulatePunch {
  control_code: number;
  time_ms: number | null;
}

function validateBody(body: SimulateReadBody): {
  competition_id: string;
  card_number: number;
  card_type: string;
  punches: SimulatePunch[];
} | null {
  if (typeof body.competition_id !== 'string' || body.competition_id.length === 0) return null;
  if (
    typeof body.card_number !== 'number' ||
    !Number.isInteger(body.card_number) ||
    body.card_number < 0
  ) {
    return null;
  }
  if (typeof body.card_type !== 'string' || body.card_type.length === 0) return null;
  if (!Array.isArray(body.punches)) return null;
  const punches: SimulatePunch[] = [];
  for (const p of body.punches) {
    if (!p || typeof p !== 'object') return null;
    const pp = p as { control_code?: unknown; time_ms?: unknown };
    if (typeof pp.control_code !== 'number' || !Number.isInteger(pp.control_code)) return null;
    if (pp.time_ms !== null && (typeof pp.time_ms !== 'number' || !Number.isInteger(pp.time_ms))) {
      return null;
    }
    punches.push({ control_code: pp.control_code, time_ms: pp.time_ms as number | null });
  }
  return {
    competition_id: body.competition_id,
    card_number: body.card_number,
    card_type: body.card_type,
    punches,
  };
}

export default async function registerDevRoutes(app: FastifyInstance): Promise<void> {
  // T-DEV-ENDPOINT: refuse to register routes outside of dev. The plugin
  // mounts but adds no handlers, so /api/__dev/* paths return the standard
  // 404. Test 2 in dev.test.ts asserts this gate.
  if (process.env['FARTOL_DEV'] !== '1') return;

  app.post('/api/__dev/simulate-read', async (req, reply) => {
    const validated = validateBody(req.body as SimulateReadBody);
    if (!validated) {
      return reply.code(400).send({ error: 'invalid simulate-read body' });
    }

    const eventTimeMs = Date.now();
    const recordedAtMs = eventTimeMs;

    // Walking-skeleton convenience: auto-create the competition row if
    // the operator hasn't run the three-click wizard yet. The full
    // create-competition flow lands in plan 11; this stub keeps the
    // walking-skeleton vertical operable without it (plan 06 + plan 11
    // will replace this with a real competition-must-exist check).
    const existing = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, validated.competition_id))
      .get();
    if (!existing) {
      app.fartolDb.db
        .insert(competitions)
        .values({
          id: validated.competition_id,
          name: `Walking-skeleton ${validated.competition_id}`,
          date: new Date(eventTimeMs).toISOString().slice(0, 10),
          createdAtMs: eventTimeMs,
        })
        .run();
    }

    // Wrap the seq fetch + insert in a single transaction. better-sqlite3's
    // sync transaction API works under drizzle's prepared statements because
    // both ultimately call the same underlying handle.
    let seq = 0;
    app.fartolDb.sqlite.transaction(() => {
      seq = nextLocalSeq(app.fartolDb, app.fartolNodeId);
      app.fartolDb.db
        .insert(events)
        .values({
          nodeId: app.fartolNodeId,
          localSeq: seq,
          competitionId: validated.competition_id,
          eventType: 'card_read',
          eventTimeMs,
          recordedAtMs,
          payload: {
            // Plan-03 simplified card_read shape (plan 06 Task 2 lifts to
            // the full CardReadEvent shape with start/finish/check/clear/
            // card_holder/punch_count). Tests in dev.test.ts assert on
            // these fields directly.
            event_type: 'card_read',
            card_number: validated.card_number,
            card_type: validated.card_type,
            start: null,
            finish: null,
            check: null,
            clear: null,
            punch_count: validated.punches.length,
            // Walking-skeleton stores the simulate-read punches as
            // NdjsonPunch-shaped rows even though the input shape is
            // simpler. Half-day=0/weekday=null are placeholders the bridge
            // (plan 06) replaces with real values.
            punches: validated.punches.map((p) => ({
              code: p.control_code,
              seconds_in_half_day: p.time_ms === null ? null : Math.floor(p.time_ms / 1000),
              half_day: 0,
              weekday: null,
            })) as never,
            card_holder: null,
          },
        })
        .run();
    })();

    // Broadcast to the readout: channel so the SvelteKit walking-skeleton
    // page renders the card_read live.
    app.wsBroadcast(readoutChannel(validated.competition_id), {
      type: 'card_read',
      payload: {
        card_number: validated.card_number,
        card_type: validated.card_type,
        punches: validated.punches,
      },
      seq,
    });

    // Walking-skeleton "thermal print" — stdout-sink writes one JSON line.
    await app.printerSink.print({
      template: 'classic',
      competition_id: validated.competition_id,
      card_number: validated.card_number,
      data: { punches: validated.punches },
    });

    return reply.code(201).send({ local_seq: seq, broadcasted: true });
  });
}
