// Authored for fartol. Not ported from upstream.
//
// node:test coverage for replayChannel — the SQLite-backed missed-event
// replay for the WS hello handshake. Pure unit tests against an in-memory
// DB; the actual WS framing lives in ws/index.test.ts.
//
// Tests 3 + 4 are the T-EVENT-REPLAY regression gate: negative or
// out-of-bounds last_seen_seq returns an empty array (no DB scan, no
// throw, no log).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { events } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import { replayChannel, maxLocalSeq, parseChannel } from './replay.ts';
import { readoutChannel } from '@fartol/shared-types';

function ensureCompetition(handle: DbHandle, id: string): void {
  // Idempotent — INSERT OR IGNORE so repeated calls in test loops are safe.
  handle.sqlite
    .prepare(
      'INSERT OR IGNORE INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms) VALUES (?, ?, ?, ?, 0, ?)'
    )
    .run(id, `test-${id}`, '2026-05-14', 'classic', 1_000);
}

function insertReadout(handle: DbHandle, nodeId: string, competitionId: string, seq: number): void {
  ensureCompetition(handle, competitionId);
  handle.db
    .insert(events)
    .values({
      nodeId,
      localSeq: seq,
      competitionId,
      eventType: 'card_read',
      eventTimeMs: 1000 + seq,
      recordedAtMs: 1000 + seq,
      payload: {
        event_type: 'card_read',
        card_number: 100 + seq,
        card_type: 'SI10',
        start: null,
        finish: null,
        check: null,
        clear: null,
        punch_count: 0,
        punches: [],
        card_holder: null,
      },
    })
    .run();
}

describe('parseChannel', () => {
  test('readout:abc parses to { kind: readout, competitionId: abc }', () => {
    assert.deepEqual(parseChannel('readout:abc'), { kind: 'readout', competitionId: 'abc' });
  });

  test('results:xyz parses to { kind: results, competitionId: xyz }', () => {
    assert.deepEqual(parseChannel('results:xyz'), { kind: 'results', competitionId: 'xyz' });
  });

  test('competitionId may contain colons (slice on first colon only)', () => {
    assert.deepEqual(parseChannel('readout:a:b:c'), {
      kind: 'readout',
      competitionId: 'a:b:c',
    });
  });
});

describe('replayChannel', () => {
  test('test 1: empty events table -> empty replay regardless of last_seen_seq', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      assert.deepEqual(replayChannel(handle, readoutChannel('comp-1'), 0, nodeId), []);
    } finally {
      handle.close();
    }
  });

  test('test 2: three events inserted, last_seen_seq=1 -> events with localSeq 2, 3 in order', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      insertReadout(handle, nodeId, 'comp-1', 1);
      insertReadout(handle, nodeId, 'comp-1', 2);
      insertReadout(handle, nodeId, 'comp-1', 3);
      const rows = replayChannel(handle, readoutChannel('comp-1'), 1, nodeId);
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.seq, 2);
      assert.equal(rows[1]?.seq, 3);
      assert.equal(rows[0]?.event_type, 'card_read');
    } finally {
      handle.close();
    }
  });

  test('test 3 (T-EVENT-REPLAY): last_seen_seq=999 (>max) -> empty result', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      insertReadout(handle, nodeId, 'comp-1', 1);
      insertReadout(handle, nodeId, 'comp-1', 2);
      assert.deepEqual(replayChannel(handle, readoutChannel('comp-1'), 999, nodeId), []);
    } finally {
      handle.close();
    }
  });

  test('test 4 (T-EVENT-REPLAY): negative last_seen_seq -> empty result', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      insertReadout(handle, nodeId, 'comp-1', 1);
      assert.deepEqual(replayChannel(handle, readoutChannel('comp-1'), -1, nodeId), []);
      assert.deepEqual(replayChannel(handle, readoutChannel('comp-1'), -100, nodeId), []);
    } finally {
      handle.close();
    }
  });

  test('test 5: only events for the matching competition are returned (no cross-competition leakage)', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      insertReadout(handle, nodeId, 'comp-1', 1);
      insertReadout(handle, nodeId, 'comp-2', 2);
      insertReadout(handle, nodeId, 'comp-1', 3);
      const rows = replayChannel(handle, readoutChannel('comp-1'), 0, nodeId);
      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.map((r) => r.seq),
        [1, 3]
      );
    } finally {
      handle.close();
    }
  });

  test('maxLocalSeq returns 0 on empty, max otherwise', () => {
    const handle = openDatabase(':memory:');
    try {
      const nodeId = ensureNodeId(handle);
      assert.equal(maxLocalSeq(handle, nodeId), 0);
      insertReadout(handle, nodeId, 'comp-1', 1);
      insertReadout(handle, nodeId, 'comp-1', 5);
      assert.equal(maxLocalSeq(handle, nodeId), 5);
    } finally {
      handle.close();
    }
  });
});
