// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the single events-table insertion path. Covers the
// REQ-EVT-001/002/003 invariants (event shape + per-node monotonic local_seq
// + recorded_at_ms wall-clock) plus the T-SEQ-COLLISION mitigation (the seq
// fetch + insert run inside a single sqlite.transaction so concurrent
// callers serialise via SQLite's BEGIN/COMMIT).
//
// Sink injection (PATTERNS S-2): every test opens a fresh `':memory:'` db.
// No globals, no monkey-patches, no leaked state between tests.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-06-PLAN.md task 1
// - REQ-EVT-001 / REQ-EVT-003

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { openDatabase } from '../db/index.ts';
import { events } from '../db/schema.ts';
import { insertEvent } from './eventInserter.ts';

describe('insertEvent — single insertion path', () => {
  test('test 1: first call returns local_seq=1; second call returns local_seq=2', () => {
    const handle = openDatabase(':memory:');
    try {
      handle.sqlite
        .prepare(
          `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
           VALUES ('comp-1', 'C1', '2026-01-01', 'classic', 0, 0)`
        )
        .run();
      const r1 = insertEvent(
        handle,
        'node-A',
        'card_read',
        1_000,
        {
          event_type: 'card_read',
          card_number: 7501853,
          card_type: 'SI10',
          start: null,
          finish: null,
          check: null,
          clear: null,
          punch_count: 0,
          punches: [],
          card_holder: null,
        },
        'comp-1'
      );
      assert.equal(r1.local_seq, 1);
      assert.equal(r1.node_id, 'node-A');
      assert.equal(r1.event_time_ms, 1_000);
      assert.ok(r1.recorded_at_ms > 0);

      const r2 = insertEvent(
        handle,
        'node-A',
        'card_removed',
        2_000,
        {
          event_type: 'card_removed',
          card_number: 7501853,
        },
        'comp-1'
      );
      assert.equal(r2.local_seq, 2);
    } finally {
      handle.close();
    }
  });

  test('test 2: concurrent inserts serialise via sqlite.transaction (no PK collision)', () => {
    // better-sqlite3 is synchronous; "concurrent" here means rapid sequential
    // calls without an awaited gap. The transaction wrapper makes each
    // {nextLocalSeq + insert} atomic — if it weren't, two reads of max()
    // could return the same value and the second insert would collide with
    // the events PK (node_id, local_seq).
    const handle = openDatabase(':memory:');
    try {
      const N = 50;
      for (let i = 0; i < N; i++) {
        insertEvent(
          handle,
          'node-B',
          'card_inserted',
          1_000 + i,
          {
            event_type: 'card_inserted',
            card_number: 100 + i,
            card_type: 'SI10',
          },
          null
        );
      }
      const rows = handle.db.select().from(events).where(eq(events.nodeId, 'node-B')).all();
      assert.equal(rows.length, N);
      // local_seq must be 1..N contiguous, no duplicates.
      const seqs = rows.map((r) => r.localSeq).sort((a, b) => a - b);
      for (let i = 0; i < N; i++) {
        assert.equal(seqs[i], i + 1, `seq mismatch at ${i}`);
      }
    } finally {
      handle.close();
    }
  });

  test('test 3: competitionId=null persists as NULL (idle bridge)', () => {
    const handle = openDatabase(':memory:');
    try {
      const r = insertEvent(
        handle,
        'node-C',
        'connection_changed',
        5_000,
        {
          event_type: 'connection_changed',
          state: 'open',
        },
        null
      );
      const row = handle.db.select().from(events).where(eq(events.localSeq, r.local_seq)).get();
      assert.ok(row);
      assert.equal(row.competitionId, null);
      assert.equal(row.eventType, 'connection_changed');
    } finally {
      handle.close();
    }
  });

  test('test 4: all 5 station EventPayload variants round-trip through INSERT + SELECT', () => {
    const handle = openDatabase(':memory:');
    try {
      // Seed comp so the FK accepts competitionId.
      handle.sqlite
        .prepare(
          `INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
           VALUES ('comp-x', 'X', '2026-01-01', 'classic', 0, 0)`
        )
        .run();

      const variants = [
        {
          type: 'card_inserted' as const,
          payload: {
            event_type: 'card_inserted' as const,
            card_number: 7501853,
            card_type: 'SI10',
          },
        },
        {
          type: 'card_read' as const,
          payload: {
            event_type: 'card_read' as const,
            card_number: 7501853,
            card_type: 'SI10',
            start: { seconds_in_half_day: 1, half_day: 0 as const, weekday: null },
            finish: null,
            check: null,
            clear: null,
            punch_count: 0,
            punches: [],
            card_holder: null,
          },
        },
        {
          type: 'card_removed' as const,
          payload: { event_type: 'card_removed' as const, card_number: 7501853 },
        },
        {
          type: 'frame_error' as const,
          payload: { event_type: 'frame_error' as const, reason: 'crc_mismatch', raw: 'FF FE' },
        },
        {
          type: 'connection_changed' as const,
          payload: { event_type: 'connection_changed' as const, state: 'open' as const },
        },
      ];

      for (const v of variants) {
        const r = insertEvent(handle, 'node-D', v.type, 7_000, v.payload, 'comp-x');
        const row = handle.db.select().from(events).where(eq(events.localSeq, r.local_seq)).get();
        assert.ok(row, `row for ${v.type} must exist`);
        assert.equal(row.eventType, v.type);
        assert.deepEqual(row.payload, v.payload);
      }
    } finally {
      handle.close();
    }
  });

  test('test 5: recorded_at_ms is monotonic (or equal) across back-to-back calls', () => {
    const handle = openDatabase(':memory:');
    try {
      const a = insertEvent(
        handle,
        'node-E',
        'card_removed',
        1,
        {
          event_type: 'card_removed',
          card_number: 1,
        },
        null
      );
      const b = insertEvent(
        handle,
        'node-E',
        'card_removed',
        2,
        {
          event_type: 'card_removed',
          card_number: 2,
        },
        null
      );
      const c = insertEvent(
        handle,
        'node-E',
        'card_removed',
        3,
        {
          event_type: 'card_removed',
          card_number: 3,
        },
        null
      );
      assert.ok(a.recorded_at_ms <= b.recorded_at_ms);
      assert.ok(b.recorded_at_ms <= c.recorded_at_ms);
    } finally {
      handle.close();
    }
  });
});
