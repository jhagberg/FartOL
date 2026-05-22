// Authored for fartol. Not ported from upstream.
//
// scheduleEventorBoot — the staleness-gated, fire-and-forget Eventor
// cache refresher (Plan 02-01 task 4). Mirrors the BackupHandle shape
// from backup/daily.ts so admin/route binding is uniform.
//
//   scheduleEventorBoot(handle, opts) → { runNow, stop }
//
// Behavior of runNow() — implements D-EV-1 / D-EV-2 / D-EV-3:
//
//   1. Call opts.apiKey() to resolve the key at refresh time (NOT boot
//      time — see code-review F-001). If the resolver returns
//      undefined/empty → log info "Eventor: nyckel saknas
//      (EVENTOR_API_KEY) — falling back to firmware hint" and
//      return { skipped: true, reason: 'no_key' }. NEVER call downloadFn.
//      The per-call resolution is what lets the settings UI's "Spara +
//      Uppdatera Eventor" workflow succeed without a bridge restart.
//   2. Else read the config row `eventor_cache_refreshed_at_ms`. If it
//      exists AND `now - parseInt(value) < staleThresholdMs` (default
//      7 days) → log info "Eventor: cache N dagar gammal — skipping
//      refresh" and return { skipped: true, reason: 'fresh' }.
//   3. If the marker is missing → reason is 'empty' (same downstream
//      code path as 'fresh' but distinguishable in logs).
//   4. Call downloadFn({ apiKey }). On rejection → log warn "Eventor:
//      refresh failed" and return { skipped: true, reason:
//      'network_error', error } WITHOUT THROWING (D-EV-3).
//   5. On resolve, call ingestFn(handle, paths, nowFn()); log the row
//      counts; return { skipped: false, competitors, clubs }.
//
// stop() is a no-op for this implementation — D-EV-1 explicitly rejected
// cron, so there is no setTimeout chain to cancel. The method is kept in
// the API for parity with BackupHandle so the admin route binding doesn't
// need a type-guard.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md task 4
// - .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md D-EV-1 / D-EV-2 / D-EV-3
// - .planning/phases/02-4-klubbs-mvp/02-PATTERNS.md §2

import { promises as fsp } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { DbHandle } from '../db/index.ts';
import { config as configTable } from '../db/schema.ts';
import { downloadEventorPayloads } from './download.ts';
import { ingestEventorCache } from './cache.ts';

export interface EventorBootOpts {
  /** Eventor API key resolver. Called fresh on every runNow() so that
   * keys written via the settings UI (PUT /api/settings/integrations →
   * config table) are picked up without a bridge restart. Returns
   * undefined/empty when the bridge runs without Eventor — boot.ts logs
   * and skips. See code-review F-001. */
  apiKey: () => string | undefined;
  /** Fastify logger — info for normal staleness checks, warn for the
   * D-EV-3 network-failure path. */
  logger: FastifyBaseLogger;
  /** PATTERNS S-2 — tests inject a mock download / ingest so the
   * staleness gate can be exercised deterministically. */
  downloadFn?: typeof downloadEventorPayloads;
  ingestFn?: typeof ingestEventorCache;
  /** Staleness window in ms; default 7 days (D-EV-2). */
  staleThresholdMs?: number;
  /** Clock injection so tests can drive the gate. */
  nowFn?: () => number;
}

export type EventorBootResult =
  | {
      skipped: false;
      competitors: number;
      clubs: number;
      /** Phase 2.0 — competitors whose Eventor club_id had no matching
       * row in the just-loaded clubs.xml; nulled to keep the runner
       * searchable. Surfaced for observability (code-review F-005). */
      nulledClubs: number;
    }
  | {
      skipped: true;
      reason: 'fresh' | 'empty' | 'no_key' | 'network_error' | 'ingest_error';
      /** Only present when reason='network_error' or 'ingest_error'. */
      error?: unknown;
    };

export interface EventorHandle {
  runNow: () => Promise<EventorBootResult>;
  stop: () => void;
}

const DEFAULT_STALE_MS = 7 * 86_400_000;
const CONFIG_MARKER_KEY = 'eventor_cache_refreshed_at_ms';

export function scheduleEventorBoot(handle: DbHandle, opts: EventorBootOpts): EventorHandle {
  const downloadFn = opts.downloadFn ?? downloadEventorPayloads;
  const ingestFn = opts.ingestFn ?? ingestEventorCache;
  const staleThresholdMs = opts.staleThresholdMs ?? DEFAULT_STALE_MS;
  const nowFn = opts.nowFn ?? Date.now;

  async function runNow(): Promise<EventorBootResult> {
    // (1) Resolve the API key fresh on every call (code-review F-001 —
    // settings UI writes land in the config table; we need to pick them
    // up without a restart). No API key → log + skip BEFORE any DB read
    // or HTTP call.
    const apiKey = opts.apiKey();
    if (!apiKey || apiKey.length === 0) {
      opts.logger.info('Eventor: nyckel saknas (EVENTOR_API_KEY) — falling back to firmware hint');
      return { skipped: true, reason: 'no_key' };
    }

    // (2) Staleness gate — read the config marker.
    const now = nowFn();
    const markerRow = handle.db
      .select({ value: configTable.value })
      .from(configTable)
      .where(eq(configTable.key, CONFIG_MARKER_KEY))
      .get();

    if (markerRow) {
      const markerMs = Number.parseInt(markerRow.value, 10);
      if (Number.isFinite(markerMs) && now - markerMs < staleThresholdMs) {
        const ageDays = Math.floor((now - markerMs) / 86_400_000);
        opts.logger.info(`Eventor: cache ${ageDays} dagar gammal — skipping refresh`);
        return { skipped: true, reason: 'fresh' };
      }
    }
    // If marker is missing we still proceed to refresh, with reason
    // 'empty' reserved for logging (downstream behavior is identical to
    // stale). The skipped-vs-not status is encoded in result.skipped.

    // (3) Download — wrap in try/catch so a network failure DEGRADES
    //     gracefully (D-EV-3 warn-and-run with prior cache).
    let paths;
    try {
      paths = await downloadFn({ apiKey });
    } catch (err) {
      opts.logger.warn({ err }, 'Eventor: refresh failed');
      return { skipped: true, reason: 'network_error', error: err };
    }

    // (4) Ingest — same defensive wrapper. A failed ingest leaves the
    //     prior snapshot intact (cache.ts is transactional). The finally
    //     block unlinks the ~86 MB tempfiles regardless of outcome so a
    //     long-running bridge doesn't fill its disk over weeks of refreshes.
    try {
      const result = await ingestFn(handle, paths.competitorsPath, paths.clubsPath, nowFn());
      // Code-review F-005: surface nulledClubs in the log. A jump in
      // this counter (e.g. from 0 to thousands) means clubs.xml lost a
      // popular org between runs — operator should investigate before
      // event start. WARN threshold of >100 keeps normal background
      // noise (single-digit orphans) silent.
      const NULLED_CLUB_WARN_THRESHOLD = 100;
      const nulledTail =
        result.nulledClubs > 0 ? ` (${result.nulledClubs} runners nulled — orphan club)` : '';
      opts.logger.info(
        `Eventor: refresh ok — ${result.competitors} competitors, ${result.clubs} clubs${nulledTail}`
      );
      if (result.nulledClubs >= NULLED_CLUB_WARN_THRESHOLD) {
        opts.logger.warn(
          { nulledClubs: result.nulledClubs },
          `Eventor: ${result.nulledClubs} runners had unresolved club FK — clubs.xml may be missing orgs`
        );
      }
      return {
        skipped: false,
        competitors: result.competitors,
        clubs: result.clubs,
        nulledClubs: result.nulledClubs,
      };
    } catch (err) {
      // Code-review F-008: distinguish ingest-side failures (parser,
      // SQLite, FK violation) from network-side failures. Operators
      // reading the log shouldn't be steered toward "check internet"
      // when the real cause is a malformed XML or a transactional
      // rollback. Network errors are handled by the (3) catch above.
      opts.logger.warn({ err }, 'Eventor: ingest failed');
      return { skipped: true, reason: 'ingest_error', error: err };
    } finally {
      await fsp.unlink(paths.competitorsPath).catch(() => undefined);
      await fsp.unlink(paths.clubsPath).catch(() => undefined);
    }
  }

  function stop(): void {
    // D-EV-1 explicitly rejected cron — no timer to cancel. Parity stub.
  }

  return { runNow, stop };
}
