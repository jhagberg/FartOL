// Authored for fartol. Not ported from upstream.
//
// Admin-only routes — registered ONLY when process.env.FARTOL_DEV === '1'.
// Mirrors the gate pattern from routes/dev.ts (T-DEV-ENDPOINT mitigation):
// the plugin still mounts in production, but every route registration
// short-circuits at the env check and the @fastify/sensible 404 handler
// returns `{ error: 'Not found' }` for any /api/__admin/* path.
//
// Endpoints:
//
//   - POST /api/__admin/run-backup-now
//     → 200 { ok: true, dest: '<path>' } when the daily-backup scheduler is
//       wired (bin/fartol.ts decorates app.fartolBackup) and the backup
//       completes successfully.
//     → 200 { ok: false, error: 'no_backup' } when the scheduler is not
//       attached (tests that build the server without a bin wiring it up).
//     → 500 surfaces any underlying db.backup() failure.
//
//   - POST /api/__admin/run-retention-now
//     → 200 { ok: true, scrubbed_count, cutoff_date } when wired.
//     → 200 { ok: false, error: 'no_retention' } when not attached.
//     → 500 surfaces underlying scrub-query failures.
//
// Phase 2 will replace the FARTOL_DEV gate with admin-token auth (REQ-AUTH-*).
// For Phase 1 the dev gate is the same operator/owner trust boundary the
// /api/__dev/* routes use — single-laptop deployments mean dev-mode = owner.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-17-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md (dev.ts
//   FARTOL_DEV gate pattern — mirrored here verbatim)
// - REQ-OPS-003 (run-backup-now is the operator-driven trigger for the same
//   path the daily cron uses)
// - REQ-PRIV-002 (run-retention-now is the operator-driven trigger for the
//   30-day PII scrub)

import type { FastifyInstance } from 'fastify';

import type { BackupHandle } from '../backup/daily.ts';

// Forward declaration: the full implementation lives in
// apps/edge/src/privacy/retention.ts (created in plan 17 task 2). The
// admin route only needs the runNow() shape — we re-declare it locally to
// avoid a forward import from a file that may not exist during partial
// builds. Task 2's retention.ts MUST export a `RetentionHandle` whose
// shape matches this local definition (the typecheck enforces structural
// compatibility through the FastifyInstance decoration).
interface RetentionHandle {
  runNow: () => Promise<{ scrubbed_count: number; cutoff_date: string }>;
  stop: () => void;
}

export default async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // T-ADMIN-ENDPOINT (analogous to T-DEV-ENDPOINT): refuse to register routes
  // outside of dev. The plugin mounts but adds no handlers, so /api/__admin/*
  // paths return the standard 404.
  if (process.env['FARTOL_DEV'] !== '1') return;

  app.post('/api/__admin/run-backup-now', async (_req, reply) => {
    const backup = app.fartolBackup;
    if (!backup) {
      return reply.code(200).send({ ok: false, error: 'no_backup' });
    }
    try {
      const r = await backup.runNow();
      return reply.code(200).send({ ok: true, dest: r.dest });
    } catch (err) {
      app.log.error({ err }, 'run-backup-now failed');
      return reply.code(500).send({ ok: false, error: 'backup_failed' });
    }
  });

  app.post('/api/__admin/run-retention-now', async (_req, reply) => {
    const retention = app.fartolRetention;
    if (!retention) {
      return reply.code(200).send({ ok: false, error: 'no_retention' });
    }
    try {
      const r = await retention.runNow();
      return reply.code(200).send({
        ok: true,
        scrubbed_count: r.scrubbed_count,
        cutoff_date: r.cutoff_date,
      });
    } catch (err) {
      app.log.error({ err }, 'run-retention-now failed');
      return reply.code(500).send({ ok: false, error: 'retention_failed' });
    }
  });
}

// FastifyInstance decoration: bin/fartol.ts (Task 2) wires these from the
// real scheduleDailyBackup + scheduleDailyRetention. Tests that exercise the
// admin endpoints decorate them directly with recording stubs. Default
// is undefined — the route detects that and returns no_backup/no_retention.
declare module 'fastify' {
  interface FastifyInstance {
    fartolBackup?: BackupHandle | undefined;
    fartolRetention?: RetentionHandle | undefined;
  }
}
