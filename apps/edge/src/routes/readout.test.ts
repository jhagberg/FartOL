// Authored for fartol. Not ported from upstream.
//
// node:test coverage for GET /api/competitions/:id/readout (plan 09 task 2).
//
// Tests:
//   1. Seeded competition with 0 events → 200; history=[]; current_read=null;
//      pending_unknown_cards=[].
//   2. Seeded competition with 1 matched card_read (course OK) → 200;
//      history[0].status='OK', current_read.competitor_id matches.
//   3. 15 card_read events → history.length === 12 (cap).
//   4. card_read for an unknown card → history[0].unmatched=true;
//      pending_unknown_cards includes that card.
//   5. GET on a competition where ANOTHER competition is active → active=false.
//      GET on the active competition → active=true.
//   6. GET on non-existent competition → 200 with empty arrays (Phase 1
//      deliberate; plan 11 wizard ensures competitions exist before
//      navigating to readout).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-09-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Readout view live behavior"

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildServer } from '../server.ts';
import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { classes, controls, courses, courseControls, competitors, events } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import type { FastifyInstance } from 'fastify';

interface Ctx {
  app: FastifyInstance;
  handle: DbHandle;
  nodeId: string;
}

async function boot(): Promise<Ctx> {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  const app = await buildServer({
    logger: false,
    dbHandle: handle,
    nodeId,
    projectionDebounceMs: 0,
  });
  return { app, handle, nodeId };
}

function seedCompetition(handle: DbHandle, id: string): { classId: string; competitorId: string } {
  handle.sqlite
    .prepare(
      `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
       VALUES (?, ?, ?, 'classic', 0, ?)`
    )
    .run(id, `Comp ${id}`, '2026-05-14', 1_000);
  const classId = `cls-${id}`;
  handle.db.insert(classes).values({ id: classId, competitionId: id, name: 'H21' }).run();
  const controlId = `ctl-${id}-31`;
  handle.db.insert(controls).values({ id: controlId, competitionId: id, code: 31 }).run();
  const courseId = `crs-${id}`;
  handle.db
    .insert(courses)
    .values({ id: courseId, competitionId: id, name: 'A', classId, lengthM: 1000 })
    .run();
  handle.db
    .insert(courseControls)
    .values({ id: `cc-${id}-1`, courseId, controlId, orderIdx: 0 })
    .run();
  const competitorId = `cmp-${id}`;
  handle.db
    .insert(competitors)
    .values({
      id: competitorId,
      competitionId: id,
      name: 'Anna',
      club: 'Test',
      classId,
      cardNumber: 7501853,
      consentAtMs: 1_000,
      consentStatus: 'explicit',
      scrubbedAtMs: null,
    })
    .run();
  return { classId, competitorId };
}

function insertCardRead(
  handle: DbHandle,
  nodeId: string,
  competitionId: string,
  cardNumber: number,
  eventTimeMs: number,
  localSeq: number,
  punches: number[] = [31]
): void {
  handle.db
    .insert(events)
    .values({
      nodeId,
      localSeq,
      competitionId,
      eventType: 'card_read',
      eventTimeMs,
      recordedAtMs: eventTimeMs,
      payload: {
        event_type: 'card_read',
        card_number: cardNumber,
        card_type: 'SI10',
        start: { half_day: 0, seconds_in_half_day: 9 * 3600, weekday: null },
        finish: { half_day: 0, seconds_in_half_day: 9 * 3600 + 30 * 60, weekday: null },
        check: null,
        clear: null,
        punch_count: punches.length,
        punches: punches.map((code) => ({
          code,
          seconds_in_half_day: 9 * 3600 + 15 * 60,
          half_day: 0,
          weekday: null,
        })),
        card_holder: null,
      },
    })
    .run();
}

interface ReadoutBody {
  competition_id: string;
  active: boolean;
  current_read: {
    event_time_ms: number;
    local_seq: number;
    card_number: number;
    card_type: string;
    competitor_id: string | null;
    competitor_name: string | null;
    status: string;
    unmatched: boolean;
  } | null;
  history: Array<{
    event_time_ms: number;
    card_number: number;
    competitor_id: string | null;
    status: string;
    unmatched: boolean;
  }>;
  pending_unknown_cards: number[];
}

describe('GET /api/competitions/:id/readout', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await boot();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.handle.close();
  });

  test('test 1: seeded competition with 0 events → 200; history empty; current_read null', async () => {
    seedCompetition(ctx.handle, 'comp-1');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-1/readout',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ReadoutBody;
    assert.equal(body.competition_id, 'comp-1');
    assert.deepEqual(body.history, []);
    assert.equal(body.current_read, null);
    assert.deepEqual(body.pending_unknown_cards, []);
  });

  test('test 2: matched card_read produces status=OK and current_read.competitor_id', async () => {
    const { competitorId } = seedCompetition(ctx.handle, 'comp-2');
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-2', 7501853, 100, 1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-2/readout',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ReadoutBody;
    assert.equal(body.history.length, 1);
    assert.equal(body.history[0]?.status, 'OK');
    assert.equal(body.history[0]?.competitor_id, competitorId);
    assert.equal(body.history[0]?.unmatched, false);
    assert.ok(body.current_read);
    assert.equal(body.current_read.competitor_id, competitorId);
    assert.equal(body.current_read.status, 'OK');
  });

  test('test 3: 15 card_read events → history.length === 12 (cap)', async () => {
    seedCompetition(ctx.handle, 'comp-3');
    for (let i = 1; i <= 15; i++) {
      insertCardRead(ctx.handle, ctx.nodeId, 'comp-3', 7501853, i * 100, i);
    }
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-3/readout',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ReadoutBody;
    assert.equal(body.history.length, 12);
    // Newest first: the first row is the highest event_time_ms (i=15 → 1500).
    assert.equal(body.history[0]?.event_time_ms, 1500);
    // The last row in the (capped) history is event_time_ms = 400 (i=4),
    // because i=1..3 fell off (15 events - 12 cap = 3 dropped from oldest).
    assert.equal(body.history[11]?.event_time_ms, 400);
  });

  test('test 4: unknown card → history[0].unmatched=true; pending_unknown_cards contains the card', async () => {
    seedCompetition(ctx.handle, 'comp-4');
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-4', 9_999_999, 100, 1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-4/readout',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ReadoutBody;
    assert.equal(body.history.length, 1);
    assert.equal(body.history[0]?.unmatched, true);
    assert.equal(body.history[0]?.competitor_id, null);
    assert.equal(body.history[0]?.status, 'PEND');
    assert.deepEqual(body.pending_unknown_cards, [9_999_999]);
  });

  test('test 5: active flag mirrors app.activeCompetitionId', async () => {
    seedCompetition(ctx.handle, 'comp-5a');
    seedCompetition(ctx.handle, 'comp-5b');

    // No active competition: both report active=false.
    const r1 = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-5a/readout',
    });
    assert.equal(r1.statusCode, 200);
    assert.equal((r1.json() as ReadoutBody).active, false);

    // Set comp-5a active via the sessions REST surface.
    const setActive = await ctx.app.inject({
      method: 'POST',
      url: '/api/sessions/active-competition',
      payload: { competition_id: 'comp-5a' },
    });
    assert.equal(setActive.statusCode, 200);

    const r2 = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-5a/readout',
    });
    const r3 = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/comp-5b/readout',
    });
    assert.equal((r2.json() as ReadoutBody).active, true);
    assert.equal((r3.json() as ReadoutBody).active, false);
  });

  test('test 6: GET on non-existent competition → 200 with empty arrays (Phase 1 deliberate)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/competitions/does-not-exist/readout',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ReadoutBody;
    assert.equal(body.competition_id, 'does-not-exist');
    assert.equal(body.active, false);
    assert.deepEqual(body.history, []);
    assert.equal(body.current_read, null);
    assert.deepEqual(body.pending_unknown_cards, []);
  });
});
