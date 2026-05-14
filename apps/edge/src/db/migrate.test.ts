// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the embedded Drizzle migrator:
// - Idempotency on the same handle (REQ-EVT-004 mirror at infra layer).
// - BOTH 0000_initial + 0001_append_only_triggers apply on cold start
//   (C-H1 regression gate — if a future db:generate run loses the 0001
//   journal entry, __drizzle_migrations row count or trigger count fall
//   short and this test fails).
// - Cross-process restart-safety (REQ-OPS-002) — close handle, reopen on
//   the same dbPath, schema persists, node_id stable.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H1
// - REQ-OPS-002 (restart-safe), REQ-EVT-004 (idempotent replay shape)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import crypto from 'node:crypto';

import { openDatabase } from './index.ts';
import { runMigrations } from './migrate.ts';
import { ensureNodeId } from './node-id.ts';

interface MigrationRow {
  id: number;
  hash: string;
}

interface CountRow {
  count: number;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('migrator: idempotency + cold-start coverage', () => {
  test('test 1: calling runMigrations twice on the same sqlite is a no-op', () => {
    const handle = openDatabase(':memory:');
    try {
      // openDatabase already ran the migrator once.
      const initialCount = handle.sqlite
        .prepare<unknown[], CountRow>('SELECT count(*) as count FROM __drizzle_migrations')
        .get();
      assert.ok(initialCount);
      assert.equal(
        initialCount.count,
        2,
        `expected 2 migrations applied, got ${initialCount.count}`
      );

      // Call again — should be a no-op.
      runMigrations(handle.sqlite);
      const after = handle.sqlite
        .prepare<unknown[], CountRow>('SELECT count(*) as count FROM __drizzle_migrations')
        .get();
      assert.ok(after);
      assert.equal(after.count, 2, 'count must not change on second run');
    } finally {
      handle.close();
    }
  });

  test('test 2 (C-H1): both 0000 + 0001 applied with distinct hashes; triggers present', () => {
    const handle = openDatabase(':memory:');
    try {
      const rows = handle.sqlite
        .prepare<
          unknown[],
          MigrationRow
        >('SELECT id, hash FROM __drizzle_migrations ORDER BY id ASC')
        .all();
      assert.equal(rows.length, 2, `expected 2 migrations, got ${rows.length}`);
      assert.notEqual(rows[0]?.hash, rows[1]?.hash, 'migration hashes must differ');

      // Idempotent re-application.
      runMigrations(handle.sqlite);
      const after = handle.sqlite
        .prepare<
          unknown[],
          MigrationRow
        >('SELECT id, hash FROM __drizzle_migrations ORDER BY id ASC')
        .all();
      assert.equal(after.length, 2, 'still 2 migrations after re-run');

      // Two append-only triggers from 0001.
      const triggers = handle.sqlite
        .prepare<
          unknown[],
          CountRow
        >("SELECT count(*) as count FROM sqlite_master WHERE type='trigger'")
        .get();
      assert.ok(triggers);
      assert.equal(triggers.count, 2, `expected exactly 2 triggers (C-H1), got ${triggers.count}`);
    } finally {
      handle.close();
    }
  });

  test('test 3: file-based db survives close + reopen', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fartol-migrate-test-'));
    const dbPath = path.join(dir, `${crypto.randomUUID()}.db`);
    try {
      const h1 = openDatabase(dbPath);
      const beforeCount = h1.sqlite
        .prepare<unknown[], CountRow>('SELECT count(*) as count FROM __drizzle_migrations')
        .get();
      assert.equal(beforeCount?.count, 2);
      h1.close();

      const h2 = openDatabase(dbPath);
      try {
        const afterCount = h2.sqlite
          .prepare<unknown[], CountRow>('SELECT count(*) as count FROM __drizzle_migrations')
          .get();
        assert.equal(
          afterCount?.count,
          2,
          'reopening must NOT replay migrations (idempotent on disk)'
        );
        const triggers = h2.sqlite
          .prepare<
            unknown[],
            CountRow
          >("SELECT count(*) as count FROM sqlite_master WHERE type='trigger'")
          .get();
        assert.equal(triggers?.count, 2, 'triggers persist across reopen');
      } finally {
        h2.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('test 4 (REQ-OPS-002): node_id is stable across openDatabase close/reopen cycles', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fartol-nodeid-test-'));
    const dbPath = path.join(dir, `${crypto.randomUUID()}.db`);
    try {
      const h1 = openDatabase(dbPath);
      const id1 = ensureNodeId(h1);
      h1.close();
      assert.match(id1, UUID_V4, `expected UUIDv4, got ${id1}`);

      const h2 = openDatabase(dbPath);
      try {
        const id2 = ensureNodeId(h2);
        assert.equal(id2, id1, 'node_id must be stable across restart');
      } finally {
        h2.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('test 5: ensureNodeId is idempotent within a single handle', () => {
    const handle = openDatabase(':memory:');
    try {
      const id1 = ensureNodeId(handle);
      const id2 = ensureNodeId(handle);
      assert.equal(id1, id2, 'second call must return the same UUID');
      assert.match(id1, UUID_V4);
    } finally {
      handle.close();
    }
  });
});
