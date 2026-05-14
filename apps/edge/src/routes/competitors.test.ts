// Authored for fartol. Not ported from upstream.
//
// node:test coverage for /api/competitors (walk-up registration) + /api/clubs
// autocomplete. Exercises:
//
//   - test 1: POST valid body w/ card_number + club → 201; competitor row +
//     clubs upsert + events row (card_bound) all present.
//   - test 2: POST same card_number twice → 409 'card_taken'.
//   - test 3 (REQ-PRIV-001): POST without consent → 400 with errors path 'consent'.
//   - test 4: POST with consent: false → 400.
//   - test 5 (T-CLASS-COMP-MISMATCH): POST with class_id from a different
//     competition → 422.
//   - test 6: POST w/o card_number (pre-entry walk-up A) → 201, no card_bound
//     event, competitor.card_number IS NULL.
//   - test 7 (broadcast spy): after successful POST w/ card_number, the
//     BroadcastSink recorded one envelope on readout:<comp> with
//     type='card_bound' (PATTERNS S-2 — no real WS client).
//   - test 8 (GET /api/clubs): three clubs inserted with different
//     last_seen_at_ms; GET returns them DESC ordered.
//   - test 9 (atomicity): app.fartolNextLocalSeq is swapped to a throwing fn;
//     POST fails 500, competitor row + clubs row + events row all absent
//     (rollback).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-04-PLAN.md task 2

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildServer, type BroadcastSink } from '../server.ts';
import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { competitors, events, clubs as clubsTable } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import type { FastifyInstance } from 'fastify';
import type { ChannelName } from '@fartol/shared-types';
import { eq } from 'drizzle-orm';

interface Ctx {
  app: FastifyInstance;
  handle: DbHandle;
  recorded: { channel: ChannelName; envelope: { type: string; payload: unknown; seq?: number } }[];
}

async function boot(extra?: {
  nextLocalSeqFn?: (handle: DbHandle, nodeId: string) => number;
}): Promise<Ctx> {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  const recorded: Ctx['recorded'] = [];
  const broadcastSink: BroadcastSink = {
    record: (channel, envelope) => {
      recorded.push({ channel, envelope });
    },
  };
  const app = await buildServer({
    logger: false,
    dbHandle: handle,
    nodeId,
    broadcastSink,
    ...(extra?.nextLocalSeqFn ? { nextLocalSeqFn: extra.nextLocalSeqFn } : {}),
  });
  return { app, handle, recorded };
}

async function seedCompetitionAndClass(
  app: FastifyInstance
): Promise<{ competitionId: string; classId: string }> {
  const compRes = await app.inject({
    method: 'POST',
    url: '/api/competitions',
    payload: { name: 'Wk', date: '2026-05-22' },
  });
  const competitionId = (compRes.json() as { id: string }).id;
  const classRes = await app.inject({
    method: 'POST',
    url: `/api/competitions/${competitionId}/classes`,
    payload: { name: 'H21' },
  });
  const classId = (classRes.json() as { id: string }).id;
  return { competitionId, classId };
}

describe('competitors walk-up registration', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await boot();
  });

  afterEach(async () => {
    await ctx.app.close();
    ctx.handle.close();
  });

  test('test 1: valid POST w/ card + club returns 201; competitor + clubs upsert + card_bound event persisted', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'Jonas Hagberg',
        club: 'StorTuna IF',
        class_id: classId,
        card_number: 7501853,
        consent: true,
      },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as {
      id: string;
      name: string;
      consent_at_ms: number;
      consent_status: string;
    };
    assert.equal(body.name, 'Jonas Hagberg');
    assert.equal(body.consent_status, 'explicit');
    assert.ok(body.consent_at_ms > 0);

    // Competitor row persisted.
    const compRow = ctx.handle.db
      .select()
      .from(competitors)
      .where(eq(competitors.id, body.id))
      .get();
    assert.ok(compRow);
    assert.equal(compRow.cardNumber, 7501853);
    assert.equal(compRow.club, 'StorTuna IF');

    // Clubs upserted.
    const clubRow = ctx.handle.db
      .select()
      .from(clubsTable)
      .where(eq(clubsTable.name, 'StorTuna IF'))
      .get();
    assert.ok(clubRow);

    // Card_bound event inserted.
    const evtRows = ctx.handle.db
      .select()
      .from(events)
      .where(eq(events.competitionId, competitionId))
      .all();
    assert.equal(evtRows.length, 1);
    assert.equal(evtRows[0]?.eventType, 'card_bound');
  });

  test('test 2: same card_number for same competition twice → second is 409 card_taken', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const payload = {
      competition_id: competitionId,
      name: 'Alice',
      club: null,
      class_id: classId,
      card_number: 1234567,
      consent: true,
    };
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload,
    });
    assert.equal(first.statusCode, 201);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: { ...payload, name: 'Bob' },
    });
    assert.equal(second.statusCode, 409);
    const body = second.json() as { error: string; existing_competitor_id: string };
    assert.equal(body.error, 'card_taken');
    assert.equal(body.existing_competitor_id, (first.json() as { id: string }).id);
  });

  test('test 3 (REQ-PRIV-001): POST without consent → 400 with path "consent"', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'Test',
        class_id: classId,
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { errors: { path: string }[] };
    assert.ok(body.errors.some((e) => e.path === 'consent'));
  });

  test('test 4: POST with consent: false → 400', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'Test',
        class_id: classId,
        consent: false,
      },
    });
    assert.equal(res.statusCode, 400);
  });

  test('test 5 (T-CLASS-COMP-MISMATCH): class_id from a DIFFERENT competition → 422', async () => {
    const a = await seedCompetitionAndClass(ctx.app);
    const b = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: a.competitionId,
        name: 'Mismatched',
        class_id: b.classId, // class belongs to comp b, not a
        consent: true,
      },
    });
    assert.equal(res.statusCode, 422);
  });

  test('test 6: POST w/o card_number (walk-up scenario A) → 201, no card_bound event', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'No-card',
        class_id: classId,
        consent: true,
      },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { card_number: number | null };
    assert.equal(body.card_number, null);

    // No events row inserted.
    const evtRows = ctx.handle.db
      .select()
      .from(events)
      .where(eq(events.competitionId, competitionId))
      .all();
    assert.equal(evtRows.length, 0);
  });

  test('test 7 (PATTERNS S-2 broadcast spy): card_bound envelope recorded on readout:<comp>', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'Broadcast Test',
        club: null,
        class_id: classId,
        card_number: 9999999,
        consent: true,
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(ctx.recorded.length, 1);
    const rec = ctx.recorded[0];
    assert.ok(rec);
    assert.equal(rec.channel, `readout:${competitionId}`);
    assert.equal(rec.envelope.type, 'card_bound');
    assert.ok(rec.envelope.seq !== undefined && rec.envelope.seq > 0);
  });

  test('test 7b: card_bound NOT broadcast when card_number is null', async () => {
    const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/competitors',
      payload: {
        competition_id: competitionId,
        name: 'No-broadcast',
        class_id: classId,
        consent: true,
      },
    });
    assert.equal(ctx.recorded.length, 0);
  });
});

describe('competitors atomicity', () => {
  // Standalone describe so we can pass a custom nextLocalSeqFn that throws.

  test('test 9: events insert failure rolls back competitor + clubs upsert', async () => {
    const ctx = await boot({
      nextLocalSeqFn: () => {
        throw new Error('forced atomicity failure');
      },
    });
    try {
      const { competitionId, classId } = await seedCompetitionAndClass(ctx.app);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/competitors',
        payload: {
          competition_id: competitionId,
          name: 'Atomicity',
          club: 'PhantomClub',
          class_id: classId,
          card_number: 5555555,
          consent: true,
        },
      });
      // Fastify converts the thrown error to a 500.
      assert.equal(res.statusCode, 500);

      // Competitor row NOT inserted (transaction rolled back).
      const compRows = ctx.handle.db
        .select()
        .from(competitors)
        .where(eq(competitors.competitionId, competitionId))
        .all();
      assert.equal(compRows.length, 0);

      // Clubs row NOT inserted (transaction rolled back).
      const clubRows = ctx.handle.db
        .select()
        .from(clubsTable)
        .where(eq(clubsTable.name, 'PhantomClub'))
        .all();
      assert.equal(clubRows.length, 0);

      // No events row inserted.
      const evtRows = ctx.handle.db
        .select()
        .from(events)
        .where(eq(events.competitionId, competitionId))
        .all();
      assert.equal(evtRows.length, 0);
    } finally {
      await ctx.app.close();
      ctx.handle.close();
    }
  });
});

describe('clubs autocomplete (GET /api/clubs)', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await boot();
  });

  afterEach(async () => {
    await ctx.app.close();
    ctx.handle.close();
  });

  test('test 8: three clubs inserted with different last_seen_at_ms; GET returns them DESC ordered', async () => {
    // Seed via raw insert so we control last_seen_at_ms exactly.
    ctx.handle.db
      .insert(clubsTable)
      .values([
        { name: 'Old', lastSeenAtMs: 1000 },
        { name: 'New', lastSeenAtMs: 3000 },
        { name: 'Middle', lastSeenAtMs: 2000 },
      ])
      .run();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/clubs' });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { clubs: { name: string; last_seen_at_ms: number }[] };
    assert.equal(body.clubs.length, 3);
    assert.equal(body.clubs[0]?.name, 'New');
    assert.equal(body.clubs[1]?.name, 'Middle');
    assert.equal(body.clubs[2]?.name, 'Old');
  });

  test('test 8b: GET /api/clubs?prefix=St filters by name prefix', async () => {
    ctx.handle.db
      .insert(clubsTable)
      .values([
        { name: 'StorTuna IF', lastSeenAtMs: 1000 },
        { name: 'Stockholms OK', lastSeenAtMs: 2000 },
        { name: 'OK Linné', lastSeenAtMs: 3000 },
      ])
      .run();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/clubs?prefix=St' });
    const body = res.json() as { clubs: { name: string }[] };
    assert.equal(body.clubs.length, 2);
    assert.ok(body.clubs.every((c) => c.name.startsWith('St')));
  });

  test('test 8c: GET /api/clubs?limit=2 caps the result set', async () => {
    ctx.handle.db
      .insert(clubsTable)
      .values([
        { name: 'A', lastSeenAtMs: 1000 },
        { name: 'B', lastSeenAtMs: 2000 },
        { name: 'C', lastSeenAtMs: 3000 },
      ])
      .run();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/clubs?limit=2' });
    const body = res.json() as { clubs: { name: string }[] };
    assert.equal(body.clubs.length, 2);
  });
});
