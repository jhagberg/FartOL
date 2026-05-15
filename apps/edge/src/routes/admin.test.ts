// Authored for fartol. Not ported from upstream.
//
// node:test coverage for /api/__admin/run-backup-now + run-retention-now.
//
// test 1: FARTOL_DEV='1' + scheduler attached → 200 { ok: true, dest } and
//   a real backup file exists on disk.
// test 2: FARTOL_DEV unset → 404 (T-ADMIN-ENDPOINT gate).
// test 3: FARTOL_DEV='1' + scheduler NOT attached → 200 { ok: false,
//   error: 'no_backup' } (so tests that don't wire bin/fartol.ts can
//   distinguish "endpoint missing" from "no scheduler").
// test 4: FARTOL_DEV='1' + retention scheduler attached → 200
//   { ok: true, scrubbed_count, cutoff_date }.
// test 5: FARTOL_DEV unset → POST /api/__admin/run-retention-now → 404.
//
// Locked by: .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 1.

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { buildServer } from '../server.ts';
import { openDatabase, type DbHandle } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { scheduleDailyBackup } from '../backup/daily.ts';
import type { FastifyInstance } from 'fastify';

interface Ctx {
  app: FastifyInstance;
  handle: DbHandle;
  tmpDir: string;
  backupDir: string;
}

async function boot(): Promise<Ctx> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'fartol-admin-test-'));
  const dbPath = path.join(tmpDir, 'fartol.db');
  const backupDir = path.join(tmpDir, 'backups');
  const handle = openDatabase(dbPath);
  const nodeId = ensureNodeId(handle);
  const app = await buildServer({ logger: false, dbHandle: handle, nodeId });
  return { app, handle, tmpDir, backupDir };
}

async function teardown(ctx: Ctx): Promise<void> {
  await ctx.app.close();
  try {
    ctx.handle.close();
  } catch {
    /* already closed */
  }
  rmSync(ctx.tmpDir, { recursive: true, force: true });
}

describe('/api/__admin/run-backup-now — gate + happy path', () => {
  const SAVED = process.env['FARTOL_DEV'];

  afterEach(() => {
    if (SAVED === undefined) delete process.env['FARTOL_DEV'];
    else process.env['FARTOL_DEV'] = SAVED;
  });

  test('test 2: without FARTOL_DEV, POST returns 404', async () => {
    delete process.env['FARTOL_DEV'];
    const ctx = await boot();
    try {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/__admin/run-backup-now',
      });
      assert.equal(res.statusCode, 404);
    } finally {
      await teardown(ctx);
    }
  });

  test('test 1: with FARTOL_DEV=1 and scheduler attached, POST returns 200 + dest file exists', async () => {
    process.env['FARTOL_DEV'] = '1';
    const ctx = await boot();
    try {
      const fixedNow = new Date('2026-05-15T12:00:00.000Z').getTime();
      const backup = scheduleDailyBackup(ctx.handle, {
        backupDir: ctx.backupDir,
        testClock: { now: () => fixedNow },
      });
      ctx.app.fartolBackup = backup;
      try {
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/__admin/run-backup-now',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { ok: boolean; dest: string };
        assert.equal(body.ok, true);
        assert.equal(body.dest, path.join(ctx.backupDir, 'fartol.db.bak-2026-05-15'));
        assert.ok(existsSync(body.dest), 'backup file must be created on disk');
      } finally {
        backup.stop();
      }
    } finally {
      await teardown(ctx);
    }
  });

  test('test 3: with FARTOL_DEV=1 but no scheduler attached, POST returns ok=false', async () => {
    process.env['FARTOL_DEV'] = '1';
    const ctx = await boot();
    try {
      // Deliberately do NOT set ctx.app.fartolBackup.
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/__admin/run-backup-now',
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, 'no_backup');
    } finally {
      await teardown(ctx);
    }
  });
});

describe('/api/__admin/run-retention-now — gate + happy path', () => {
  const SAVED = process.env['FARTOL_DEV'];

  afterEach(() => {
    if (SAVED === undefined) delete process.env['FARTOL_DEV'];
    else process.env['FARTOL_DEV'] = SAVED;
  });

  test('test 5: without FARTOL_DEV, POST returns 404', async () => {
    delete process.env['FARTOL_DEV'];
    const ctx = await boot();
    try {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/__admin/run-retention-now',
      });
      assert.equal(res.statusCode, 404);
    } finally {
      await teardown(ctx);
    }
  });

  test('test 4: with FARTOL_DEV=1 and retention scheduler attached, POST returns 200 + result', async () => {
    process.env['FARTOL_DEV'] = '1';
    const ctx = await boot();
    try {
      // Recording stub: returns a known shape so the route's mapping is
      // verified without booting the full retention scrub (that's covered
      // in retention.test.ts).
      ctx.app.fartolRetention = {
        runNow: async () => ({ scrubbed_count: 3, cutoff_date: '2026-04-15' }),
        stop: () => {},
      };
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/__admin/run-retention-now',
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        ok: boolean;
        scrubbed_count: number;
        cutoff_date: string;
      };
      assert.equal(body.ok, true);
      assert.equal(body.scrubbed_count, 3);
      assert.equal(body.cutoff_date, '2026-04-15');
    } finally {
      await teardown(ctx);
    }
  });
});
