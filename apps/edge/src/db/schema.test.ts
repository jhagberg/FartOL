// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the Phase 1 Drizzle schema (plan 02). Asserts:
// - All 9 expected tables exist after openDatabase + migrate.
// - events table has a composite primary key on (node_id, local_seq).
// - competitors has the D-11 partial unique index on
//   (competition_id, card_number) WHERE card_number IS NOT NULL.
// - C-M4: competitors.consent_status is NOT NULL DEFAULT 'explicit' and
//   accepts only the three allowed values (insert with override works,
//   insert with NULL fails the NOT NULL constraint).
//
// Uses openDatabase(':memory:') for a fresh, isolated SQLite per test.
// PATTERNS S-2 sink injection — no globals, no monkey-patches.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from './index.ts';

interface SqliteMasterRow {
  name: string;
}

interface PragmaTableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: number;
}

interface PragmaIndexListRow {
  seq: number;
  name: string;
  unique: 0 | 1;
  origin: string;
  partial: 0 | 1;
}

interface PragmaIndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

interface CompetitorRow {
  id: string;
  consent_status: string;
  consent_at_ms: number | null;
  scrubbed_at_ms: number | null;
}

const EXPECTED_TABLES = [
  'classes',
  'clubs',
  'competitions',
  'competitors',
  'config',
  'controls',
  'course_controls',
  'courses',
  'events',
];

describe('schema: cold-start table inventory', () => {
  test('openDatabase(:memory:) creates the 9 expected tables + __drizzle_migrations', () => {
    const handle = openDatabase(':memory:');
    try {
      const rows = handle.sqlite
        .prepare<
          unknown[],
          SqliteMasterRow
        >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      const names = rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
      // __drizzle_migrations is created by the migrator; assert it exists separately.
      assert.ok(
        names.includes('__drizzle_migrations'),
        `missing __drizzle_migrations in ${names.join(',')}`
      );
      for (const expected of EXPECTED_TABLES) {
        assert.ok(names.includes(expected), `missing ${expected} in ${names.join(',')}`);
      }
    } finally {
      handle.close();
    }
  });
});

describe('schema: events composite primary key', () => {
  test('events table_info reports PK on node_id (pk=1) and local_seq (pk=2)', () => {
    const handle = openDatabase(':memory:');
    try {
      const cols = handle.sqlite
        .prepare<unknown[], PragmaTableInfoRow>('PRAGMA table_info(events)')
        .all();
      const nodeId = cols.find((c) => c.name === 'node_id');
      const localSeq = cols.find((c) => c.name === 'local_seq');
      assert.ok(nodeId, 'node_id column missing');
      assert.ok(localSeq, 'local_seq column missing');
      // SQLite numbers composite PK members 1..N in the order they appear.
      assert.equal(nodeId.pk, 1, `expected node_id.pk=1, got ${nodeId.pk}`);
      assert.equal(localSeq.pk, 2, `expected local_seq.pk=2, got ${localSeq.pk}`);
    } finally {
      handle.close();
    }
  });
});

describe('schema: competitors partial unique index (D-11)', () => {
  test('competitors_card_per_comp is UNIQUE + PARTIAL on (competition_id, card_number)', () => {
    const handle = openDatabase(':memory:');
    try {
      const indexes = handle.sqlite
        .prepare<unknown[], PragmaIndexListRow>('PRAGMA index_list(competitors)')
        .all();
      const target = indexes.find((i) => i.name === 'competitors_card_per_comp');
      assert.ok(target, `competitors_card_per_comp not found in ${JSON.stringify(indexes)}`);
      assert.equal(target.unique, 1, 'expected unique=1');
      assert.equal(target.partial, 1, 'expected partial=1 (D-11)');

      const cols = handle.sqlite
        .prepare<unknown[], PragmaIndexInfoRow>('PRAGMA index_info(competitors_card_per_comp)')
        .all();
      const colNames = cols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
      assert.deepEqual(colNames, ['competition_id', 'card_number']);
    } finally {
      handle.close();
    }
  });
});

describe('schema: competitors.consent_status (C-M4)', () => {
  test('consent_status defaults to "explicit" when omitted from INSERT', () => {
    const handle = openDatabase(':memory:');
    try {
      // Seed FK parents first (competitions + classes).
      handle.sqlite
        .prepare(
          "INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms) VALUES ('c1', 't', '2026-05-14', 'classic', 0, 1)"
        )
        .run();
      handle.sqlite
        .prepare("INSERT INTO classes (id, competition_id, name) VALUES ('cl1', 'c1', 'H21')")
        .run();
      handle.sqlite
        .prepare(
          "INSERT INTO competitors (id, competition_id, name, class_id) VALUES ('comp1', 'c1', 'Anna', 'cl1')"
        )
        .run();
      const row = handle.sqlite
        .prepare<
          unknown[],
          CompetitorRow
        >('SELECT id, consent_status, consent_at_ms, scrubbed_at_ms FROM competitors WHERE id=?')
        .get('comp1');
      assert.ok(row, 'expected row for comp1');
      assert.equal(row.consent_status, 'explicit');
      assert.equal(row.consent_at_ms, null);
      assert.equal(row.scrubbed_at_ms, null);
    } finally {
      handle.close();
    }
  });

  test('consent_status accepts "pending_first_read" override', () => {
    const handle = openDatabase(':memory:');
    try {
      handle.sqlite
        .prepare(
          "INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms) VALUES ('c1', 't', '2026-05-14', 'classic', 0, 1)"
        )
        .run();
      handle.sqlite
        .prepare("INSERT INTO classes (id, competition_id, name) VALUES ('cl1', 'c1', 'H21')")
        .run();
      handle.sqlite
        .prepare(
          "INSERT INTO competitors (id, competition_id, name, class_id, consent_status) VALUES ('comp2', 'c1', 'Bo', 'cl1', 'pending_first_read')"
        )
        .run();
      const row = handle.sqlite
        .prepare<
          unknown[],
          CompetitorRow
        >('SELECT id, consent_status, consent_at_ms, scrubbed_at_ms FROM competitors WHERE id=?')
        .get('comp2');
      assert.ok(row);
      assert.equal(row.consent_status, 'pending_first_read');
    } finally {
      handle.close();
    }
  });

  test('consent_status=NULL is rejected by NOT NULL constraint', () => {
    const handle = openDatabase(':memory:');
    try {
      handle.sqlite
        .prepare(
          "INSERT INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms) VALUES ('c1', 't', '2026-05-14', 'classic', 0, 1)"
        )
        .run();
      handle.sqlite
        .prepare("INSERT INTO classes (id, competition_id, name) VALUES ('cl1', 'c1', 'H21')")
        .run();
      assert.throws(() => {
        handle.sqlite
          .prepare(
            "INSERT INTO competitors (id, competition_id, name, class_id, consent_status) VALUES ('comp3', 'c1', 'Ce', 'cl1', NULL)"
          )
          .run();
      }, /NOT NULL constraint failed: competitors\.consent_status/);
    } finally {
      handle.close();
    }
  });
});
