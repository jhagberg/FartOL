// Authored for fartola. Not ported from upstream.
//
// scheduleDailyBackup — cron-in-process daily SQLite backup. Runs at the
// next local midnight + every 24h thereafter; produces `fartola.db.bak-
// YYYY-MM-DD` files in `opts.backupDir` (default './backups'), retains the
// most recent N (default 7), prunes older snapshots.
//
// Uses better-sqlite3's online `db.backup(filename)` API — NOT a file copy.
// File copies under WAL produce torn snapshots (the -wal sidecar holds
// uncommitted pages that the main file has not yet checkpointed). RESEARCH
// Pitfall 3 documents the failure mode in detail; `backup()` is the safe
// recipe SQLite ships for live-database snapshotting.
//
// Pattern: setTimeout chain anchored on next midnight. Pure JS, no
// node-cron dep (RESEARCH §"Don't Hand-Roll" — we DO hand-roll here because
// the schedule is one-shot-at-midnight, not generic cron, so a 25-line
// setTimeout chain beats the dependency).
//
// On error: log to stderr, retry in 1h (transient FS error / disk-full).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §"Daily
//   backup via better-sqlite3 online API" + §"Pitfall 3: WAL + file copy"
// - REQ-OPS-003 (daily SQLite backup; no human action)
// - PATTERNS S-2 (testClock injection so tests can drive scheduling
//   without waiting wall-clock hours)

import path from 'node:path';
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';

import type { DbHandle } from '../db/index.ts';

export interface BackupOpts {
  /** Directory where backup snapshots are written. Created if missing. */
  backupDir: string;
  /** How many recent snapshots to retain. Older files are pruned. Default 7. */
  keepLast?: number;
  /** PATTERNS S-2 — tests inject `{ now: () => fixedMs }` so the setTimeout
   * delay math + the filename's YYYY-MM-DD stamp are deterministic. */
  testClock?: { now: () => number };
}

export interface BackupHandle {
  /** Trigger a one-off backup right now (admin endpoint + tests). */
  runNow: () => Promise<{ dest: string }>;
  /** Cancel the scheduled chain. Idempotent. */
  stop: () => void;
}

/** Return the epoch-ms of the next local midnight strictly AFTER `nowMs`.
 * `setHours(24, 0, 0, 0)` jumps to the next day 00:00:00 (local TZ). */
export function nextMidnightMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Format `d` as `YYYY-MM-DD` in the LOCAL TZ. `toISOString()` would shift to
 * UTC — at Stockholm local midnight (CEST) UTC is still the previous day,
 * which would produce off-by-one filenames. WR-002 fix. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** One-hour retry interval after a transient failure. WR-001. */
const RETRY_MS = 60 * 60 * 1000;

/** Delete all-but-the-most-recent `keepLast` snapshots in `dir`. Newest by
 * the date embedded in the filename (lexicographic sort on YYYY-MM-DD).
 * Filename match is anchored to the bak- date pattern so unrelated files in
 * the same directory are NOT touched.
 *
 * Filename date is preferred over filesystem mtime because mtime drifts on
 * copy/clone/restore-from-backup operations while the embedded date is the
 * canonical identity (one backup per day, see runOnce()). PR #3 Gemini
 * medium review feedback. */
function prune(dir: string, keepLast: number): void {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => /^fartola\.db\.bak-\d{4}-\d{2}-\d{2}$/.test(f));
  // YYYY-MM-DD sorts lexicographically. Sort ascending then reverse so the
  // newest sits at index 0, matching the prior mtime-DESC semantics.
  files.sort();
  files.reverse();
  for (const f of files.slice(keepLast)) {
    try {
      unlinkSync(path.join(dir, f));
    } catch {
      /* best-effort — a concurrent operator-rm doesn't break the scheduler */
    }
  }
}

export function scheduleDailyBackup(handle: DbHandle, opts: BackupOpts): BackupHandle {
  const now = opts.testClock?.now ?? Date.now;
  const keepLast = opts.keepLast ?? 7;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  mkdirSync(opts.backupDir, { recursive: true });

  async function runOnce(): Promise<{ dest: string }> {
    const dateStr = formatLocalDate(new Date(now()));
    const dest = path.join(opts.backupDir, `fartola.db.bak-${dateStr}`);
    // better-sqlite3 db.backup(filename) is the WAL-consistent online API.
    // Two calls on the same day overwrite the same destination — node will
    // unlink the existing file inside the native binding.
    await handle.sqlite.backup(dest);
    prune(opts.backupDir, keepLast);
    return { dest };
  }

  /** Retry the failed job after 1h. WR-001 — the previous version called
   * `schedule()` here, which re-computed the delay to the NEXT midnight and
   * effectively skipped the day. We must call `runOnce()` itself. After
   * runOnce settles (success OR another failure), chain back to the
   * next-midnight `schedule()` so the daily anchor is restored. */
  function retry(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void (async () => {
        try {
          await runOnce();
        } catch (e) {
          process.stderr.write(`[backup] retry failed: ${(e as Error).message}\n`);
          // Still failing — keep retrying every hour until midnight rolls
          // around. schedule() handles the next-midnight anchor on success.
          retry();
          return;
        }
        schedule();
      })();
    }, RETRY_MS);
  }

  function schedule(): void {
    if (stopped) return;
    const delay = nextMidnightMs(now()) - now();
    timer = setTimeout(() => {
      void (async () => {
        try {
          await runOnce();
        } catch (e) {
          process.stderr.write(`[backup] failed: ${(e as Error).message}\n`);
          // Transient failure (disk full, permission glitch): retry in 1h
          // instead of waiting another 24h.
          retry();
          return;
        }
        schedule();
      })();
    }, delay);
  }

  schedule();

  return {
    runNow: runOnce,
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
