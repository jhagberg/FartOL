// Authored for fartol. Not ported from upstream.
//
// scheduleDailyRetention — cron-in-process daily PII scrub. Runs at the
// next local midnight + every 24h thereafter; updates competitor rows
// belonging to competitions whose `date` is older than `retentionDays`
// (default 30) so name='Anonymiserad', club=null, scrubbed_at_ms=now().
//
// IMPORTANT — what is scrubbed:
//   - competitors.name (PII per REQ-PRIV-002) → 'Anonymiserad'
//   - competitors.club (PII per REQ-PRIV-002) → NULL
//   - competitors.scrubbed_at_ms (audit trail) → now()
//
// What is PRESERVED (RESEARCH A7 + research.md §6):
//   - competitors.card_number — hardware identifier, NOT PII
//   - competitors.consent_status + consent_at_ms — audit trail; consent
//     metadata persists for legal-basis traceability
//   - events.payload — append-only by REQ-EVT-002. card_bound payloads
//     reference competitor_id only, never the name string, so most events
//     don't leak PII post-scrub. card_read payloads carry card_holder
//     (the on-card firmware name string); operators are advised to
//     encrypt the disk. Phase 2 may add per-event payload redaction.
//
// SCRUB vs DELETE: A7 confirmed SCRUB. DELETE would cascade onto event
// rows that have FK references and would mutate the append-only log;
// SCRUB anonymises while keeping the results structure intact for
// post-event analysis and IOF XML export of historical events.
//
// Idempotent: rows already scrubbed (scrubbed_at_ms IS NOT NULL) are
// skipped by the WHERE clause, so re-runs are safe and the result count
// drops to 0 once a competition has been fully scrubbed.
//
// On error: log to stderr, retry in 1h (transient SQLite lock contention,
// disk-full, etc.). Mirrors the backup scheduler's error policy.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §A7
//   (SCRUB interpretation, card_number kept)
// - .planning/research/architecture.md §6 (PII vs hardware-ID distinction)
// - REQ-PRIV-002 (30-day retention for contact information)
// - PATTERNS S-2 (testClock injection)

import { sql, and, isNull } from 'drizzle-orm';

import { competitors } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';

export interface RetentionOpts {
  /** Days post-event-date after which PII is scrubbed. Default 30. */
  retentionDays?: number;
  /** PATTERNS S-2 — tests inject a fixed clock so the cutoff_date is
   * deterministic regardless of when the test runs. */
  testClock?: { now: () => number };
}

export interface RetentionResult {
  scrubbed_count: number;
  /** ISO date 'YYYY-MM-DD' — competitions with `date < cutoff_date` were in scope. */
  cutoff_date: string;
}

export interface RetentionHandle {
  /** Trigger a one-off scrub right now (admin endpoint + tests). */
  runNow: () => Promise<RetentionResult>;
  /** Cancel the scheduled chain. Idempotent. */
  stop: () => void;
}

/** Match the backup scheduler's next-midnight calc — both run on the same
 * anchor so a single laptop never sees the two schedulers race for the
 * SQLite write lock at exactly midnight (they queue, but coincident
 * scheduling is still cleaner). */
function nextMidnightMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Format `d` as `YYYY-MM-DD` in the LOCAL TZ. `toISOString()` would shift to
 * UTC — at Stockholm local midnight (CEST) UTC is still the previous day,
 * which would produce a cutoff_date off by one. WR-002 fix. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** One-hour retry interval after a transient failure. WR-001. */
const RETRY_MS = 60 * 60 * 1000;

export function scheduleDailyRetention(
  handle: DbHandle,
  opts: RetentionOpts = {}
): RetentionHandle {
  const now = opts.testClock?.now ?? Date.now;
  const retentionDays = opts.retentionDays ?? 30;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function runOnce(): Promise<RetentionResult> {
    const cutoffMs = now() - retentionDays * 86400000;
    const cutoffDate = formatLocalDate(new Date(cutoffMs));
    // UPDATE competitors SET name='Anonymiserad', club=NULL, scrubbed_at_ms=now()
    //   WHERE scrubbed_at_ms IS NULL
    //     AND competition_id IN (SELECT id FROM competitions WHERE date < ?)
    // The subquery + isNull combine to make the update idempotent (already-
    // scrubbed rows skipped) and to scope the scrub to the correct dated
    // competitions only — same-day competitions aren't touched.
    const result = handle.db
      .update(competitors)
      .set({ name: 'Anonymiserad', club: null, scrubbedAtMs: now() })
      .where(
        and(
          isNull(competitors.scrubbedAtMs),
          sql`competition_id IN (SELECT id FROM competitions WHERE date < ${cutoffDate})`
        )
      )
      .run();
    return { scrubbed_count: result.changes, cutoff_date: cutoffDate };
  }

  /** Retry the failed job after 1h. WR-001 — the previous version called
   * `schedule()` here, which re-computed the delay to the NEXT midnight and
   * effectively skipped the day. We must call `runOnce()` itself. */
  function retry(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void (async () => {
        try {
          await runOnce();
        } catch (e) {
          process.stderr.write(`[retention] retry failed: ${(e as Error).message}\n`);
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
          process.stderr.write(`[retention] failed: ${(e as Error).message}\n`);
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
