// Authored for fartol. Not ported from upstream.
//
// node:test coverage for scheduleDailyBackup. Covers:
//   - testClock-anchored nextMidnightMs math (test 1)
//   - runNow() produces a file at the dated path (test 2)
//   - Same-day runNow twice overwrites (test 3)
//   - prune retains only the N most-recent files (test 4)
//   - Closed-DB error surfaces via the returned promise (test 5)
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 1
// - REQ-OPS-003 (daily SQLite backup)

import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readdirSync, statSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { scheduleDailyBackup, nextMidnightMs, formatLocalDate } from './daily.ts';

interface Ctx {
  handle: DbHandle;
  tmpDir: string;
  backupDir: string;
}

function setupCtx(): Ctx {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'fartol-backup-test-'));
  const dbPath = path.join(tmpDir, 'fartol.db');
  const backupDir = path.join(tmpDir, 'backups');
  const handle = openDatabase(dbPath);
  return { handle, tmpDir, backupDir };
}

function teardownCtx(ctx: Ctx): void {
  try {
    ctx.handle.close();
  } catch {
    /* best-effort — already closed by test */
  }
  rmSync(ctx.tmpDir, { recursive: true, force: true });
}

describe('scheduleDailyBackup', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setupCtx();
  });

  afterEach(() => {
    teardownCtx(ctx);
  });

  test('test 1: nextMidnightMs computes the correct first-fire delay from testClock', () => {
    // 2026-05-15 14:30:00 local → next midnight is 2026-05-16 00:00:00 local.
    const now = new Date(2026, 4, 15, 14, 30, 0, 0).getTime(); // month=4 → May
    const next = nextMidnightMs(now);
    const expected = new Date(2026, 4, 16, 0, 0, 0, 0).getTime();
    assert.equal(next, expected);
    assert.ok(next - now > 0, 'delay must be positive');
    assert.ok(next - now <= 24 * 60 * 60 * 1000, 'delay must be ≤ 24h');
  });

  test('test 2: runNow() produces a file at backupDir/fartol.db.bak-YYYY-MM-DD', async () => {
    // Pin the clock to 2026-05-15 so the filename is deterministic.
    const fixedNow = new Date('2026-05-15T12:00:00.000Z').getTime();
    const backup = scheduleDailyBackup(ctx.handle, {
      backupDir: ctx.backupDir,
      testClock: { now: () => fixedNow },
    });
    try {
      const { dest } = await backup.runNow();
      assert.equal(dest, path.join(ctx.backupDir, 'fartol.db.bak-2026-05-15'));
      assert.ok(existsSync(dest), 'backup file must exist on disk');
      // The backup file is a real SQLite database — non-zero size.
      assert.ok(statSync(dest).size > 0, 'backup file must be non-empty');
    } finally {
      backup.stop();
    }
  });

  test('test 3: runNow twice on the same day overwrites — no duplicate files', async () => {
    const fixedNow = new Date('2026-05-15T12:00:00.000Z').getTime();
    const backup = scheduleDailyBackup(ctx.handle, {
      backupDir: ctx.backupDir,
      testClock: { now: () => fixedNow },
    });
    try {
      await backup.runNow();
      await backup.runNow();
      const files = readdirSync(ctx.backupDir).filter((f) => f.startsWith('fartol.db.bak-'));
      assert.equal(files.length, 1, 'same-day runs must overwrite, not append');
      assert.equal(files[0], 'fartol.db.bak-2026-05-15');
    } finally {
      backup.stop();
    }
  });

  test('test 4: prune keeps the N most-recent files; older snapshots are removed', async () => {
    // Seed 10 fake backup files spanning 10 days. utimes back-dates the older
    // ones so the mtime-sort in prune() picks the right "most recent" set.
    const dates = [
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
    ];
    // Pre-create the directory via the scheduler (mkdir + first runNow on
    // 2026-05-15) so an 11th file lands on top.
    const fixedNow = new Date('2026-05-15T12:00:00.000Z').getTime();
    const backup = scheduleDailyBackup(ctx.handle, {
      backupDir: ctx.backupDir,
      keepLast: 7,
      testClock: { now: () => fixedNow },
    });
    try {
      // Seed the 10 fake snapshots first (so they exist before runNow's prune).
      const fs = await import('node:fs/promises');
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i] as string;
        const p = path.join(ctx.backupDir, `fartol.db.bak-${date}`);
        await fs.writeFile(p, 'fake-content');
        // mtime = 2026-05-15 minus (11 - i) days, so oldest = 2026-05-05.
        const mt = new Date(fixedNow - (dates.length - i) * 86400000);
        utimesSync(p, mt, mt);
      }
      // runNow on 2026-05-15 writes the 11th file (today) and prunes to 7.
      await backup.runNow();
      const remaining = readdirSync(ctx.backupDir)
        .filter((f) => /^fartol\.db\.bak-/.test(f))
        .sort();
      assert.equal(remaining.length, 7, 'must keep exactly keepLast files');
      // The today file MUST be kept (it's the most recent).
      assert.ok(remaining.includes('fartol.db.bak-2026-05-15'));
      // The oldest seeded file MUST be pruned.
      assert.ok(!remaining.includes('fartol.db.bak-2026-05-05'));
      assert.ok(!remaining.includes('fartol.db.bak-2026-05-06'));
      assert.ok(!remaining.includes('fartol.db.bak-2026-05-07'));
    } finally {
      backup.stop();
    }
  });

  test('test 5: runNow() with the DB closed throws via the promise rejection', async () => {
    const fixedNow = new Date('2026-05-15T12:00:00.000Z').getTime();
    const backup = scheduleDailyBackup(ctx.handle, {
      backupDir: ctx.backupDir,
      testClock: { now: () => fixedNow },
    });
    try {
      ctx.handle.close();
      await assert.rejects(() => backup.runNow(), /closed|database/i);
    } finally {
      backup.stop();
    }
  });

  test('test 6 (WR-001): transient failure at midnight retries runOnce after 1h, not the next midnight', async () => {
    // Pin "now" to 2026-05-15 23:30 local so the first midnight tick is 30 min away.
    const startNow = new Date(2026, 4, 15, 23, 30, 0, 0).getTime();
    let currentNow = startNow;
    const fixedClock = { now: (): number => currentNow };

    // Stub handle.sqlite.backup: first call rejects (simulated transient
    // failure), subsequent calls resolve immediately without touching disk.
    // We intentionally do NOT forward to the real backup — the WR-001
    // assertion is about retry TIMING (1h vs 24h), not about producing a
    // backup artifact. Avoiding native I/O keeps the test fast and prevents
    // a libuv-worker leak past test teardown.
    let backupCalls = 0;
    const originalBackup = ctx.handle.sqlite.backup.bind(ctx.handle.sqlite);
    ctx.handle.sqlite.backup = ((dest: string) => {
      backupCalls += 1;
      void dest;
      if (backupCalls === 1) {
        return Promise.reject(new Error('simulated transient disk failure'));
      }
      return Promise.resolve(undefined as never);
    }) as typeof ctx.handle.sqlite.backup;

    mock.timers.enable({ apis: ['setTimeout'] });
    const backup = scheduleDailyBackup(ctx.handle, {
      backupDir: ctx.backupDir,
      testClock: fixedClock,
    });
    try {
      // Advance to local midnight (30 min). The scheduled callback fires
      // runOnce → backup throws → retry() arms a 1h setTimeout.
      currentNow += 30 * 60 * 1000;
      mock.timers.tick(30 * 60 * 1000);
      // Drain microtasks so the rejected promise's catch runs.
      await new Promise<void>((r) => setImmediate(r));
      assert.equal(backupCalls, 1, 'first attempt fired at midnight');

      // Advance by 1h — the retry timer fires runOnce again. The core
      // WR-001 assertion is that runOnce was invoked a SECOND time after
      // 1h, not 24h. Poll briefly so the stub records the call before we
      // tear the scheduler down (the actual native backup may still be in
      // flight on a libuv worker, which is fine — we don't assert on the
      // file because the goal is the retry timing, not the backup itself).
      currentNow += 60 * 60 * 1000;
      mock.timers.tick(60 * 60 * 1000);
      const deadline = Date.now() + 2000;
      while (backupCalls < 2 && Date.now() < deadline) {
        await new Promise<void>((r) => setImmediate(r));
      }
      assert.equal(backupCalls, 2, 'retry ran runOnce after 1h, not after 24h');
    } finally {
      // Order: stop the scheduler (clears pending timers) BEFORE reset so
      // mock.timers.reset doesn't accidentally fire any leftover armed
      // mocked timer (e.g. the post-success schedule() for next midnight).
      backup.stop();
      mock.timers.reset();
      ctx.handle.sqlite.backup = originalBackup;
    }
  });

  test('test 7 (WR-002): formatLocalDate returns the LOCAL calendar date, not the UTC date', () => {
    // Construct dates via LOCAL components — formatLocalDate must report
    // those same components, even when toISOString() would shift the day.
    const localMidnightPlus30 = new Date(2026, 4, 16, 0, 30, 0, 0);
    assert.equal(formatLocalDate(localMidnightPlus30), '2026-05-16');

    // Zero-padding sanity check: January 5th.
    const earlyJan = new Date(2026, 0, 5, 0, 0, 0, 0);
    assert.equal(formatLocalDate(earlyJan), '2026-01-05');

    // Regression assertion: in any TZ east of UTC (Stockholm is +1/+2),
    // toISOString() of local-midnight would report the PREVIOUS day. The
    // local formatter must NOT do that. We assert the date components match
    // the local-constructed source regardless of the test runner's TZ.
    const localMidnight = new Date(2026, 4, 16, 0, 0, 0, 0);
    const offsetMin = localMidnight.getTimezoneOffset();
    if (offsetMin < 0) {
      // East of UTC — toISOString slice would yield the previous day.
      // This is the original bug; verify the fix returns local day.
      const utcDay = localMidnight.toISOString().slice(0, 10);
      assert.notEqual(utcDay, '2026-05-16', 'precondition: UTC day differs in east-of-UTC TZs');
      assert.equal(formatLocalDate(localMidnight), '2026-05-16');
    } else {
      // In UTC or west-of-UTC test runners we can't reproduce the drift,
      // but the local-component round-trip still proves correctness.
      assert.equal(formatLocalDate(localMidnight), '2026-05-16');
    }
  });
});
