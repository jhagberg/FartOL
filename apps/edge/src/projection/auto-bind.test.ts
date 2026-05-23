// Authored for fartola. Not ported from upstream.
//
// node:test coverage for autoBindNewCompetitors. Five scenarios:
//   1. Race: card_read lands before competitor is created → autoBind
//      emits synthetic card_bound; subsequent reduce sees retroactive
//      attach (pending=[]) AND the prior card_read becomes part of the
//      competitor's history.
//   2. No race: competitor exists but no card_read for that card →
//      autoBind returns bound=[] (nothing to resolve).
//   3. Idempotent: calling twice produces zero new card_bound events on
//      the second call (T-AUTO-BIND-DOUBLE mitigation).
//   4. Walk-up first: a walk-up card_bound (walkup=true) already exists
//      → autoBind detects + skips (no overwrite).
//   5. Cross-competition: competitor in comp A with cardNumber=X does
//      NOT trigger auto-bind in comp B (T-CROSS-COMP-BIND mitigation).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-09-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { classes, controls, courses, courseControls, competitors, events } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';

import { autoBindNewCompetitors } from './auto-bind.ts';
import { loadCompetitionInputs } from './loader.ts';
import { reduce } from './reduce.ts';

interface Ctx {
  handle: DbHandle;
  nodeId: string;
}

function boot(): Ctx {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  return { handle, nodeId };
}

function seedCompetition(handle: DbHandle, id: string, name = `Comp ${id}`): { classId: string } {
  handle.sqlite
    .prepare(
      `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms, race_started_at_ms)
       VALUES (?, ?, ?, 'classic', 0, ?, 0)`
    )
    .run(id, name, '2026-05-14', 1_000);
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
  return { classId };
}

function insertCardRead(
  handle: DbHandle,
  nodeId: string,
  competitionId: string,
  cardNumber: number,
  eventTimeMs: number,
  localSeq: number
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
        punch_count: 1,
        punches: [
          {
            code: 31,
            seconds_in_half_day: 9 * 3600 + 15 * 60,
            half_day: 0,
            weekday: null,
          },
        ],
        card_holder: null,
      },
    })
    .run();
}

function insertCompetitor(
  handle: DbHandle,
  competitionId: string,
  classId: string,
  cardNumber: number | null,
  name = 'Anna',
  consentAtMs: number | null = null,
  consentStatus: 'explicit' | 'pending_first_read' | 'confirmed_on_read' = 'pending_first_read'
): string {
  const id = crypto.randomUUID();
  handle.db
    .insert(competitors)
    .values({
      id,
      competitionId,
      name,
      club: 'Test',
      classId,
      cardNumber,
      consentAtMs,
      consentStatus,
      scrubbedAtMs: null,
    })
    .run();
  return id;
}

describe('autoBindNewCompetitors (plan 09)', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = boot();
  });
  afterEach(() => {
    ctx.handle.close();
  });

  test('test 1: race scenario — card_read at t=0, EntryList creates competitor → autoBind retroactively attaches', () => {
    const compId = 'comp-1';
    const { classId } = seedCompetition(ctx.handle, compId);

    // Bridge inserts card_read at t=0; no competitor row exists yet.
    insertCardRead(ctx.handle, ctx.nodeId, compId, 7501853, 0, 1);

    // Before EntryList import — projection sees pending=[7501853].
    const input1 = loadCompetitionInputs(ctx.handle, compId);
    assert.ok(input1);
    const state1 = reduce(input1);
    assert.deepEqual(state1.pending_unknown_cards, [7501853]);
    assert.equal(state1.competitors.size, 0);

    // t=5s: EntryList import creates competitor with cardNumber=7501853.
    const competitorId = insertCompetitor(ctx.handle, compId, classId, 7501853);

    // autoBindNewCompetitors emits a synthetic card_bound.
    const result = autoBindNewCompetitors(ctx.handle, compId, ctx.nodeId);
    assert.equal(result.bound.length, 1);
    assert.equal(result.bound[0]?.competitor_id, competitorId);
    assert.equal(result.bound[0]?.card_number, 7501853);

    // A row was appended to events with eventType=card_bound + walkup=false.
    const cardBoundRows = ctx.handle.sqlite
      .prepare(`SELECT payload FROM events WHERE event_type = 'card_bound'`)
      .all() as Array<{ payload: string }>;
    assert.equal(cardBoundRows.length, 1);
    const cbPayload = JSON.parse(cardBoundRows[0]!.payload) as {
      event_type: string;
      competitor_id: string;
      card_number: number;
      walkup: boolean;
    };
    assert.equal(cbPayload.event_type, 'card_bound');
    assert.equal(cbPayload.competitor_id, competitorId);
    assert.equal(cbPayload.card_number, 7501853);
    assert.equal(cbPayload.walkup, false);

    // Re-running reduce now sees the card_bound (drops pending) AND the
    // prior card_read retroactively attaches via cardIndex.get() inside
    // the reducer walk (plan 09 buildCardIndex behavior).
    const input2 = loadCompetitionInputs(ctx.handle, compId);
    assert.ok(input2);
    const state2 = reduce(input2);
    assert.deepEqual(state2.pending_unknown_cards, []);
    const view = state2.competitors.get(competitorId);
    assert.ok(view);
    // The retroactive attach: the card_read history now contains the
    // original t=0 read (proof that the read flowed into the competitor
    // even though it landed before the competitor row existed).
    assert.equal(view.card_read_history.length, 1);
    assert.equal(view.card_read_history[0]?.card_number, 7501853);
    assert.equal(view.status, 'OK');
    assert.equal(view.elapsed_time_ms, 30 * 60 * 1000);
  });

  test('test 2: no race — competitor created without any prior card_read → bound=[]', () => {
    const compId = 'comp-2';
    const { classId } = seedCompetition(ctx.handle, compId);
    insertCompetitor(ctx.handle, compId, classId, 7501853);

    const result = autoBindNewCompetitors(ctx.handle, compId, ctx.nodeId);
    assert.deepEqual(result.bound, []);

    // No card_bound events were emitted (nothing to resolve).
    const rows = ctx.handle.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE event_type = 'card_bound'`)
      .get() as { n: number };
    assert.equal(rows.n, 0);
  });

  test('test 3: idempotent — second call after first returns bound=[]', () => {
    const compId = 'comp-3';
    const { classId } = seedCompetition(ctx.handle, compId);
    insertCardRead(ctx.handle, ctx.nodeId, compId, 7501853, 0, 1);
    insertCompetitor(ctx.handle, compId, classId, 7501853);

    const r1 = autoBindNewCompetitors(ctx.handle, compId, ctx.nodeId);
    assert.equal(r1.bound.length, 1);

    const r2 = autoBindNewCompetitors(ctx.handle, compId, ctx.nodeId);
    assert.deepEqual(r2.bound, []);

    // Still exactly ONE card_bound event in the log.
    const rows = ctx.handle.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE event_type = 'card_bound'`)
      .get() as { n: number };
    assert.equal(rows.n, 1);
  });

  test('test 4: walk-up first — pre-existing card_bound (walkup=true) is detected; autoBind skips', () => {
    const compId = 'comp-4';
    const { classId } = seedCompetition(ctx.handle, compId);
    const competitorId = insertCompetitor(
      ctx.handle,
      compId,
      classId,
      7501853,
      'Bea',
      1_000,
      'explicit'
    );
    // Simulate plan-04 walk-up path: card_bound with walkup=true.
    ctx.handle.db
      .insert(events)
      .values({
        nodeId: ctx.nodeId,
        localSeq: 1,
        competitionId: compId,
        eventType: 'card_bound',
        eventTimeMs: 1_000,
        recordedAtMs: 1_000,
        payload: {
          event_type: 'card_bound',
          competitor_id: competitorId,
          card_number: 7501853,
          walkup: true,
          consent_at_ms: 1_000,
        },
      })
      .run();
    // Also a card_read so the "seenRead" gate would otherwise allow autoBind.
    insertCardRead(ctx.handle, ctx.nodeId, compId, 7501853, 2_000, 2);

    const result = autoBindNewCompetitors(ctx.handle, compId, ctx.nodeId);
    assert.deepEqual(result.bound, []);

    // Still exactly ONE card_bound event (the walk-up one, not a duplicate).
    const rows = ctx.handle.sqlite
      .prepare(`SELECT payload FROM events WHERE event_type = 'card_bound' AND competition_id = ?`)
      .all(compId) as Array<{ payload: string }>;
    assert.equal(rows.length, 1);
    const payload = JSON.parse(rows[0]!.payload) as { walkup: boolean };
    assert.equal(payload.walkup, true);
  });

  test('test 5: cross-competition — competitor in comp A with cardNumber=X does NOT trigger auto-bind in comp B', () => {
    const compA = 'comp-A';
    const compB = 'comp-B';
    const { classId: classIdA } = seedCompetition(ctx.handle, compA, 'A');
    seedCompetition(ctx.handle, compB, 'B');

    // card_read landed in comp B for card 7501853 (no competitor in B for it).
    insertCardRead(ctx.handle, ctx.nodeId, compB, 7501853, 0, 1);
    // Competitor in comp A has cardNumber=7501853.
    insertCompetitor(ctx.handle, compA, classIdA, 7501853);

    // autoBind on comp A: no prior card_read in comp A → bound=[].
    const rA = autoBindNewCompetitors(ctx.handle, compA, ctx.nodeId);
    assert.deepEqual(rA.bound, []);

    // autoBind on comp B: no competitor in B for that card → bound=[].
    const rB = autoBindNewCompetitors(ctx.handle, compB, ctx.nodeId);
    assert.deepEqual(rB.bound, []);

    // No card_bound events anywhere.
    const all = ctx.handle.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE event_type = 'card_bound'`)
      .get() as { n: number };
    assert.equal(all.n, 0);

    // Comp B's projection sees pending_unknown_cards=[7501853]; comp A's
    // projection is clean (no events tied to comp A yet).
    const inputB = loadCompetitionInputs(ctx.handle, compB);
    assert.ok(inputB);
    const stateB = reduce(inputB);
    assert.deepEqual(stateB.pending_unknown_cards, [7501853]);

    const inputA = loadCompetitionInputs(ctx.handle, compA);
    assert.ok(inputA);
    const stateA = reduce(inputA);
    assert.deepEqual(stateA.pending_unknown_cards, []);
  });
});
