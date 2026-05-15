// Authored for fartol. Not ported from upstream.
//
// node:test coverage for scheduleDailyRetention. Covers:
//   - test 1 (REQ-PRIV-002 happy path): 35-day-old competition → scrub
//     anonymises name + nulls club + sets scrubbed_at_ms; card_number,
//     consent_status, consent_at_ms all UNCHANGED.
//   - test 2: 25-day-old competition (within retention window) → 0 scrubs.
//   - test 3: idempotency — already-scrubbed rows are not re-scrubbed; a
//     second runNow returns count 0.
//   - test 4: cross-competition isolation — scrubbing competition A
//     doesn't touch competition B (different date).
//   - test 5: events table is UNTOUCHED — append-only invariant survives.
//     Documents the card_holder PII tradeoff (research A7 — operator-aware).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 2
// - REQ-PRIV-002

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, count } from 'drizzle-orm';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { competitions, classes, competitors, events } from '../db/schema.ts';
import { insertEvent } from '../si/eventInserter.ts';
import { scheduleDailyRetention } from './retention.ts';

interface Ctx {
  handle: DbHandle;
  nodeId: string;
}

function setupCtx(): Ctx {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  return { handle, nodeId };
}

function teardownCtx(ctx: Ctx): void {
  try {
    ctx.handle.close();
  } catch {
    /* best-effort */
  }
}

/** Seed a competition + class + one competitor on the given date.
 * The returned competitor row is unscrubbed (consent_status='explicit',
 * consent_at_ms set to a known sentinel for traceability checks). */
function seedCompetition(
  ctx: Ctx,
  opts: { id: string; date: string; competitorName: string; club: string; cardNumber: number }
): { competitorId: string } {
  const now = Date.now();
  ctx.handle.db
    .insert(competitions)
    .values({ id: opts.id, name: `Comp ${opts.id}`, date: opts.date, createdAtMs: now })
    .run();
  const classId = `class-${opts.id}`;
  ctx.handle.db.insert(classes).values({ id: classId, competitionId: opts.id, name: 'H21' }).run();
  const competitorId = `competitor-${opts.id}`;
  ctx.handle.db
    .insert(competitors)
    .values({
      id: competitorId,
      competitionId: opts.id,
      name: opts.competitorName,
      club: opts.club,
      classId,
      cardNumber: opts.cardNumber,
      consentAtMs: 1_715_700_000_000, // sentinel — must survive scrub
      consentStatus: 'explicit',
      scrubbedAtMs: null,
    })
    .run();
  return { competitorId };
}

describe('scheduleDailyRetention', () => {
  let ctx: Ctx;
  // Pin "now" to 2026-05-15 12:00 UTC for deterministic cutoff_date math.
  const FIXED_NOW = new Date('2026-05-15T12:00:00.000Z').getTime();

  beforeEach(() => {
    ctx = setupCtx();
  });

  afterEach(() => {
    teardownCtx(ctx);
  });

  test('test 1 (REQ-PRIV-002): 35-day-old competition is scrubbed — name + club nulled, card_number + consent_at_ms preserved', async () => {
    // Competition dated 2026-04-10 → 35 days before 2026-05-15.
    const { competitorId } = seedCompetition(ctx, {
      id: 'comp-old',
      date: '2026-04-10',
      competitorName: 'Anna Andersson',
      club: 'StorTuna IF',
      cardNumber: 7501853,
    });
    const retention = scheduleDailyRetention(ctx.handle, {
      retentionDays: 30,
      testClock: { now: () => FIXED_NOW },
    });
    try {
      const r = await retention.runNow();
      assert.equal(r.scrubbed_count, 1);
      // cutoff_date = 2026-05-15 minus 30 days = 2026-04-15.
      assert.equal(r.cutoff_date, '2026-04-15');

      const row = ctx.handle.db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .get();
      assert.ok(row);
      assert.equal(row.name, 'Anonymiserad');
      assert.equal(row.club, null);
      assert.equal(row.scrubbedAtMs, FIXED_NOW);

      // PRESERVED fields (RESEARCH A7 + research.md §6).
      assert.equal(row.cardNumber, 7501853, 'card_number is a hardware ID, not PII');
      assert.equal(row.consentStatus, 'explicit', 'consent_status must persist');
      assert.equal(row.consentAtMs, 1_715_700_000_000, 'consent_at_ms must persist as audit trail');
    } finally {
      retention.stop();
    }
  });

  test('test 2: 25-day-old competition is NOT scrubbed (within retention window)', async () => {
    // Competition dated 2026-04-20 → 25 days before 2026-05-15 → still in window.
    const { competitorId } = seedCompetition(ctx, {
      id: 'comp-recent',
      date: '2026-04-20',
      competitorName: 'Bo Berg',
      club: 'OK Linné',
      cardNumber: 1428824,
    });
    const retention = scheduleDailyRetention(ctx.handle, {
      retentionDays: 30,
      testClock: { now: () => FIXED_NOW },
    });
    try {
      const r = await retention.runNow();
      assert.equal(r.scrubbed_count, 0);

      const row = ctx.handle.db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .get();
      assert.ok(row);
      // Unchanged.
      assert.equal(row.name, 'Bo Berg');
      assert.equal(row.club, 'OK Linné');
      assert.equal(row.scrubbedAtMs, null);
    } finally {
      retention.stop();
    }
  });

  test('test 3: already-scrubbed rows are not re-scrubbed (idempotent)', async () => {
    seedCompetition(ctx, {
      id: 'comp-old-2',
      date: '2026-03-01',
      competitorName: 'Cia Carlsson',
      club: 'IFK Lidingö',
      cardNumber: 248215,
    });
    const retention = scheduleDailyRetention(ctx.handle, {
      retentionDays: 30,
      testClock: { now: () => FIXED_NOW },
    });
    try {
      const first = await retention.runNow();
      assert.equal(first.scrubbed_count, 1, 'first run scrubs the one old row');

      const second = await retention.runNow();
      assert.equal(second.scrubbed_count, 0, 'second run finds nothing to scrub');
    } finally {
      retention.stop();
    }
  });

  test('test 4: cross-competition isolation — scrubbing A leaves B alone', async () => {
    const { competitorId: oldId } = seedCompetition(ctx, {
      id: 'comp-A-old',
      date: '2026-04-01',
      competitorName: 'Anna A',
      club: 'Club A',
      cardNumber: 100,
    });
    const { competitorId: newId } = seedCompetition(ctx, {
      id: 'comp-B-new',
      date: '2026-05-10',
      competitorName: 'Bo B',
      club: 'Club B',
      cardNumber: 200,
    });
    const retention = scheduleDailyRetention(ctx.handle, {
      retentionDays: 30,
      testClock: { now: () => FIXED_NOW },
    });
    try {
      const r = await retention.runNow();
      assert.equal(r.scrubbed_count, 1, 'only the old competition is scrubbed');

      const oldRow = ctx.handle.db
        .select()
        .from(competitors)
        .where(eq(competitors.id, oldId))
        .get();
      const newRow = ctx.handle.db
        .select()
        .from(competitors)
        .where(eq(competitors.id, newId))
        .get();
      assert.equal(oldRow?.name, 'Anonymiserad');
      assert.equal(oldRow?.club, null);
      assert.equal(newRow?.name, 'Bo B');
      assert.equal(newRow?.club, 'Club B');
    } finally {
      retention.stop();
    }
  });

  test('test 5: events table is UNTOUCHED by retention scrub (REQ-EVT-002 append-only)', async () => {
    const { competitorId } = seedCompetition(ctx, {
      id: 'comp-E',
      date: '2026-04-01',
      competitorName: 'Eva Eriksson',
      club: 'Eskilstuna OK',
      cardNumber: 1428824,
    });
    // Insert a card_bound event referencing the competitor. The bind payload
    // carries competitor_id + card_number only — not the name string — so
    // the event row's payload survives the scrub without exposing PII.
    insertEvent(
      ctx.handle,
      ctx.nodeId,
      'card_bound',
      Date.now(),
      {
        event_type: 'card_bound',
        competitor_id: competitorId,
        card_number: 1428824,
        walkup: false,
        consent_at_ms: 1_715_700_000_000,
      },
      'comp-E'
    );

    // Count events before retention runs.
    const beforeRow = ctx.handle.db.select({ c: count() }).from(events).get();
    const beforeCount = beforeRow?.c ?? 0;
    assert.equal(beforeCount, 1, 'precondition: one event row exists');

    const retention = scheduleDailyRetention(ctx.handle, {
      retentionDays: 30,
      testClock: { now: () => FIXED_NOW },
    });
    try {
      const r = await retention.runNow();
      assert.equal(r.scrubbed_count, 1);
    } finally {
      retention.stop();
    }

    // Events table count + content unchanged. (REQ-EVT-002 append-only.)
    const afterRow = ctx.handle.db.select({ c: count() }).from(events).get();
    assert.equal(afterRow?.c ?? 0, beforeCount, 'events row count must be unchanged');

    // The card_bound payload's competitor_id still resolves — competitor row
    // exists, just with anonymised PII.
    const eventRow = ctx.handle.db.select().from(events).get();
    assert.ok(eventRow);
    const payload = eventRow.payload as { event_type: string; competitor_id: string };
    assert.equal(payload.event_type, 'card_bound');
    assert.equal(payload.competitor_id, competitorId);
  });
});
