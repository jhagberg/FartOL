---
phase: 01-single-laptop-training-mvp
plan: 17
subsystem: ops
tags: [backup, privacy, retention, gdpr, cron-in-process, sqlite, better-sqlite3, drizzle]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides: |
      plan 02 DbHandle + competitors/competitions Drizzle schema (with
        scrubbedAtMs column already in place);
      plan 03 routes/dev.ts FARTOLA_DEV gate pattern (mirrored for /api/__admin/*);
      plan 06 bin/fartola.ts lifecycle structure + SIGINT shutdown chain;
      plan 11 typed REST client wrapper (unused here — admin endpoints are
        operator-only, not surfaced through apps/web).
provides:
  - scheduleDailyBackup (apps/edge/src/backup/daily.ts): cron-in-process
    daily SQLite backup using better-sqlite3 db.backup() WAL-consistent
    online API; keeps last 7 snapshots, prunes older; testClock injection
    for deterministic test scheduling.
  - scheduleDailyRetention (apps/edge/src/privacy/retention.ts): cron-in-
    process 30-day PII scrub anonymising competitors.name + nulling
    competitors.club while preserving card_number (hardware ID) and
    consent_at_ms/consent_status (audit trail); idempotent.
  - POST /api/__admin/run-backup-now + /run-retention-now
    (apps/edge/src/routes/admin.ts): FARTOLA_DEV-gated operator endpoints
    that drive one-off runs of the scheduled chains; same gate pattern as
    plan 03's /api/__dev/*.
  - CLI flags --backup-dir + --retention-days (apps/edge/src/bin/fartola.ts)
    with defaults './backups' / 30; SIGINT teardown stops both schedulers.
affects:
  - Phase 1 plan 18 (packaging) — backup directory now part of the install
    layout; --backup-dir flag must be documented in the install README.
  - Phase 2 admin auth — replaces FARTOLA_DEV gate on /api/__admin/* with
    real admin-token auth (REQ-AUTH-*).
  - Phase 2 disk-space monitoring (REQ-OPS-004) — backup directory is the
    canonical place to surface "disk filling up" warnings.

# Tech tracking
tech-stack:
  added: []  # No new deps; reuses better-sqlite3 + drizzle-orm from plan 02.
  patterns:
    - "Cron-in-process via setTimeout chain anchored on nextMidnightMs —
      no node-cron dependency. RESEARCH §Don't Hand-Roll permits this for
      midnight-only schedules; the chain re-anchors after each run so the
      delay self-corrects against drift."
    - "testClock injection (PATTERNS S-2) for time-driven schedulers —
      tests pass `{ now: () => fixedMs }` so delay math + ISO-date stamps
      are deterministic without sleeping wall-clock hours."
    - "FARTOLA_DEV gate mirrored from plan 03's routes/dev.ts onto
      routes/admin.ts — same plugin-mounts-but-routes-don't-register
      pattern, same T-*-ENDPOINT mitigation surface."
    - "Module augmentation lives next to the consumer (admin.ts) rather
      than centralized in server.ts — keeps the type adjacent to the
      route handler that uses it. Server.ts only imports the route
      module via `registerAdminRoutes`."

key-files:
  created:
    - apps/edge/src/backup/daily.ts
    - apps/edge/src/backup/daily.test.ts
    - apps/edge/src/privacy/retention.ts
    - apps/edge/src/privacy/retention.test.ts
    - apps/edge/src/routes/admin.ts
    - apps/edge/src/routes/admin.test.ts
  modified:
    - apps/edge/src/bin/fartola.ts
    - apps/edge/src/server.ts
    - .gitignore

key-decisions:
  - "Forward-declared RetentionHandle interface inline in routes/admin.ts
    instead of importing from privacy/retention.ts. Task 1 (admin route)
    runs before Task 2 (retention.ts exists), so a direct import would
    break the per-task atomicity. The local interface is structurally
    identical to the exported one; TypeScript's structural typing makes
    `app.fartolaRetention = scheduleDailyRetention(...)` compatible at the
    bin/fartola.ts assignment site."
  - "Module augmentation for fartolaBackup + fartolaRetention lives in
    routes/admin.ts (the consumer), NOT server.ts (the plan's text
    suggested server.ts). Co-locating the augmentation with the consumer
    keeps the type adjacent to the route handler that depends on it and
    avoids server.ts becoming a kitchen-sink declaration file."
  - "Both fartolaBackup + fartolaRetention typed as `optional` (using `?`)
    instead of `BackupHandle | null`. The plan said `| null` but `optional`
    is more idiomatic for a Fastify decoration that may be absent in tests
    that build the server without a bin (see admin.test.ts test 3) — the
    route handler reads `if (!app.fartolaBackup)` which works for both
    undefined and null."
  - "Added `backups/` to .gitignore so the default snapshot directory
    doesn't accidentally get committed during development. Rule 3 scope
    nudge — pure DX, no behavioral impact."
  - "scheduleDailyBackup uses db.backup(filename) (better-sqlite3 v12.10
    Promise-returning API) not a file copy. RESEARCH §Pitfall 3 documents
    the WAL-tearing failure mode of file copies; db.backup() runs the
    SQLite online-backup C API which is WAL-consistent by construction."
  - "Retention SCRUB-not-DELETE confirmed (RESEARCH A7 + research.md §6).
    PRESERVED columns: card_number (hardware ID, not PII), consent_status,
    consent_at_ms (audit trail). NULLED: club. ANONYMISED: name → literal
    string 'Anonymiserad'. Also sets scrubbed_at_ms = now() so the WHERE
    IS NULL gate makes re-runs idempotent."
  - "Timezone: both schedulers use `Date.setHours(24,0,0,0)` which jumps
    to next local midnight (not UTC). Operators running the laptop in
    Europe/Stockholm will see snapshots dated against local-time midnight.
    The filename's `YYYY-MM-DD` is derived via `toISOString().slice(0,10)`
    which is UTC-formatted — a deliberate split: the schedule anchors on
    LOCAL midnight (when the office is quiet) but the filename uses UTC
    date (stable across DST). For single-laptop Sweden deployments DST
    matters once a year; the dual interpretation is documented inline."

patterns-established:
  - "Cron-in-process scheduler with testClock injection: setTimeout chain
    anchored on nextMidnightMs(now()); each runOnce re-schedules itself;
    error → stderr log + 1h retry timer (transient FS / disk-full); stop()
    is idempotent + cancels the in-flight timer. Pattern reusable for
    any future midnight-anchored job (e.g., Phase 2 event-log compaction)."
  - "Admin endpoint gating: registerAdminRoutes mirrors registerDevRoutes
    structurally (early `if (process.env.FARTOLA_DEV !== '1') return;`);
    keeps T-*-ENDPOINT surface uniform across all dev-mode-only routes.
    Phase 2 will replace both with admin-token auth in a single swap."

requirements-completed:
  - REQ-OPS-003
  - REQ-PRIV-002

# Metrics
duration: ~25min
completed: 2026-05-15
---

# Phase 1 Plan 17: Daily backup + 30-day PII retention Summary

**Cron-in-process daily SQLite backup via better-sqlite3 db.backup() (WAL-consistent) + 30-day competitor PII scrub preserving hardware IDs and consent audit trail — both wired through 2 FARTOLA_DEV-gated admin endpoints for operator-driven one-off runs.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-15T10:30:00Z (approximate — captured at executor spawn)
- **Completed:** 2026-05-15T10:55:00Z
- **Tasks:** 2 / 2
- **Files created/modified:** 9 (6 created, 3 modified)

## Accomplishments

- `scheduleDailyBackup(handle, { backupDir, keepLast, testClock })` runs
  the SQLite online backup API at next local midnight + every 24h after;
  produces `fartola.db.bak-YYYY-MM-DD` snapshots; retains the most recent
  7 by mtime, prunes older.
- `scheduleDailyRetention(handle, { retentionDays, testClock })` scrubs
  competitor PII (name → 'Anonymiserad', club → NULL) for competitions
  whose `date` is older than 30 days. PRESERVES card_number,
  consent_status, consent_at_ms. Idempotent via `scrubbed_at_ms IS NULL`
  WHERE-clause gate.
- Two admin endpoints (`POST /api/__admin/run-backup-now` + `/run-
retention-now`) gated on `FARTOLA_DEV=1` (same pattern as plan 03's
  `/api/__dev/*`); operator-driven one-off triggers for manual ops +
  Phase 2 admin-token migration target.
- CLI flags `--backup-dir <path>` (default `./backups`) and
  `--retention-days <int>` (default 30) on `fartola` bin.
- 15 new tests total (5 backup + 5 retention + 5 admin route);
  full edge suite goes 269 → 274 tests passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: scheduleDailyBackup + tests + admin endpoints** — `649d39e` (feat)
2. **Task 2: scheduleDailyRetention + tests + bin wiring** — `dc271df` (feat)

## Files Created/Modified

- `apps/edge/src/backup/daily.ts` — `scheduleDailyBackup` + `nextMidnightMs`
  - private `prune()`. Cron-in-process setTimeout chain; uses
    `handle.sqlite.backup(dest)` (Promise-returning since better-sqlite3
    v7.5+); error → stderr + 1h retry; `stop()` is idempotent.
- `apps/edge/src/backup/daily.test.ts` — 5 tests: midnight math,
  happy-path file creation with deterministic stamp, same-day overwrite
  (no duplicates), prune retention (10 fake snapshots back-dated via
  `utimesSync`, asserts keepLast=7), closed-DB rejection surfaces via
  the returned promise.
- `apps/edge/src/privacy/retention.ts` — `scheduleDailyRetention` +
  `RetentionResult` + `RetentionHandle`. Drizzle update with `and(isNull
(scrubbedAtMs), sql\`competition_id IN (SELECT ... WHERE date < ${cutoff
  Date})\`)`; SCRUB-not-DELETE per RESEARCH A7.
- `apps/edge/src/privacy/retention.test.ts` — 5 tests: REQ-PRIV-002 happy
  path (35-day-old comp; asserts name/club/scrubbedAtMs scrubbed AND
  card_number/consent_status/consent_at_ms preserved); within-window
  non-scrub (25-day-old); idempotency (re-run returns 0); cross-
  competition isolation; events table untouched (REQ-EVT-002 append-only).
- `apps/edge/src/routes/admin.ts` — `registerAdminRoutes`. FARTOLA_DEV
  gate mirrors `routes/dev.ts`. Both endpoints return 200 ok=false /
  no_backup or no_retention when scheduler not wired (tests). Module
  augmentation declares `fartolaBackup?` + `fartolaRetention?`. Local
  forward-declared `RetentionHandle` interface (structurally compatible
  with Task 2's exported version).
- `apps/edge/src/routes/admin.test.ts` — 5 tests: FARTOLA_DEV gate on
  both routes (404 when unset), backup happy path with scheduler
  attached + dest file exists on disk, no-scheduler fallback, retention
  endpoint maps `runNow()` result correctly via a recording stub.
- `apps/edge/src/server.ts` — register `registerAdminRoutes` after
  `registerExportRoutes` (preserves plan 16's export route ordering).
- `apps/edge/src/bin/fartola.ts` — added `--backup-dir` + `--retention-
days` CLI flags with validation (positive integer for days); start
  both schedulers after `buildServer()`; decorate `app.fartolaBackup` +
  `app.fartolaRetention`; SIGINT shutdown stops both.
- `.gitignore` — add `backups/` so the default snapshot directory
  doesn't get committed.

## Decisions Made

See `key-decisions` in the frontmatter above (7 decisions). The most
load-bearing are:

1. **Forward-declaring `RetentionHandle` in admin.ts** instead of
   importing from `privacy/retention.ts` (which doesn't exist during
   Task 1 typecheck). Structural typing makes the bin's assignment work
   without a circular import.
2. **Module augmentation lives in admin.ts**, not server.ts — adjacent
   to the consumer.
3. **Both decorations are `optional` (`?`)**, not `| null` as the plan
   suggested — more idiomatic for Fastify decorations that may be absent
   in tests that build the server without a bin.
4. **Timezone split**: schedule anchors on LOCAL midnight (operator-time)
   but filename uses UTC date (stable across DST).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Forward-declare `RetentionHandle` in admin.ts
to allow Task 1 to typecheck without Task 2's retention.ts file**

- **Found during:** Task 1 (admin.ts compilation)
- **Issue:** The plan's Task 1 wires `app.fartolaRetention` typed as
  `RetentionHandle | null` in the FastifyInstance module augmentation,
  but `RetentionHandle` is exported from `privacy/retention.ts` which
  doesn't exist until Task 2. Importing from a not-yet-created file
  breaks Task 1's typecheck.
- **Fix:** Inline-declared a local `interface RetentionHandle` in
  admin.ts with the structurally-identical shape. TypeScript's
  structural typing makes the bin's `app.fartolaRetention =
scheduleDailyRetention(...)` assignment work at Task 2's typecheck
  even though the local + exported types are nominally separate.
- **Files modified:** apps/edge/src/routes/admin.ts
- **Verification:** Typecheck passes on both Task 1 commit (`649d39e`)
  and Task 2 commit (`dc271df`).
- **Committed in:** `649d39e` (Task 1 commit).

**2. [Rule 3 — Blocking] pnpm install in worktree before typecheck**

- **Found during:** Task 1 (first typecheck run)
- **Issue:** The worktree was spawned without `node_modules` populated.
  `tsc --noEmit` failed with "Cannot find module '@fartola/sportident'"
  - 25 related errors because the workspace symlinks weren't materialised.
- **Fix:** Ran `pnpm install --frozen-lockfile` followed by
  `pnpm --filter @fartola/sportident build` to produce the `dist/` that
  `apps/edge/tsconfig.json`'s `paths` (via `package.json` "exports")
  resolves to.
- **Files modified:** None (build artefacts not committed).
- **Verification:** `pnpm --filter @fartola/edge typecheck` exits 0
  after both commands.
- **Committed in:** N/A — environment fix, no code change.

**3. [Rule 2 — Missing Critical] `.gitignore` entry for `backups/`**

- **Found during:** Task 2 (bin wiring — the new default `--backup-dir`
  is `./backups`)
- **Issue:** With backups now produced at `./backups/` by default, a
  developer running the bin locally would generate snapshot files inside
  the repo root that `git status` reports as untracked. Without a
  `.gitignore` entry the snapshots could accidentally get staged and
  committed (especially via `git add -A` in CI). Snapshots are runtime
  artefacts, not source — mirrors the existing `fartola.db / fartola.db-
wal / fartola.db-shm` entries.
- **Fix:** Added `backups/` to `.gitignore` next to the existing edge-
  bridge runtime block.
- **Files modified:** .gitignore
- **Verification:** `git check-ignore -v backups/fartola.db.bak-2026-05-15`
  reports the new rule matches.
- **Committed in:** `dc271df` (Task 2 commit).

**4. [Rule 1 — Style] Prettier reformat across 6 new files**

- **Found during:** First commit attempt for both tasks (pre-commit hook)
- **Issue:** Lefthook's prettier hook reformatted whitespace / line
  wrapping in `backup/daily.ts`, `routes/admin.test.ts`,
  `privacy/retention.ts`, and `privacy/retention.test.ts`. No
  behavioral changes — only formatting.
- **Fix:** `pnpm exec prettier --write` on the affected files; re-staged
  - re-committed.
- **Files modified:** (formatting only; no semantic change)
- **Verification:** Pre-commit hook passes on retry.
- **Committed in:** `649d39e` (Task 1) + `dc271df` (Task 2).

**5. [Rule 1 — Lint] Unused `beforeEach` import in admin.test.ts**

- **Found during:** First Task 1 commit attempt
- **Issue:** `admin.test.ts` initially imported `beforeEach` from
  `node:test` but each test self-boots its own context (different from
  the dev.test.ts pattern which uses beforeEach). ESLint flagged the
  unused import.
- **Fix:** Removed `beforeEach` from the import line.
- **Files modified:** apps/edge/src/routes/admin.test.ts
- **Verification:** ESLint passes on retry.
- **Committed in:** `649d39e` (Task 1 commit).

---

**Total deviations:** 5 auto-fixed (3 Rule 3 blockers, 1 Rule 2 missing
DX-critical, 2 Rule 1 lint/format)
**Impact on plan:** All deviations were correctness-required or tooling-
required (no scope creep). The architectural shape of both schedulers +
admin endpoints + bin wiring matches the plan's interface contracts
verbatim.

## Issues Encountered

- **Worktree without node_modules**: the parallel-executor worktree spawn
  doesn't auto-install workspace dependencies. Resolved by running
  `pnpm install --frozen-lockfile` once at executor start; future
  worktree spawns may want this as an explicit setup step.
- **`@fartola/sportident` not built**: even after install, the consuming
  packages couldn't resolve the sportident types because the workspace
  package emits its `dist/` artefacts via `tsup` and `tsconfig` resolves
  through `"exports"` rather than `"main"` -> `src/`. Resolved by
  `pnpm --filter @fartola/sportident build`.

## Known Stubs

None. The schedulers produce real backup files + real PII scrubs; the
admin endpoints invoke the real `runNow()` paths; the bin wires both
schedulers + the SIGINT teardown chain. The `--retention-days` flag
accepts any positive integer for ops flexibility (REQ-PRIV-002 sets the
default at 30).

## Threat Flags

None new beyond the plan's threat register. The plan's threat model
covers:

- **T-RETENTION-MISS** (mitigate): tested by retention.test.ts test 1
  (35-day scrub fires) + test 3 (idempotency).
- **T-RETENTION-OVERREACH** (mitigate): tested by retention.test.ts
  test 2 (25-day window-edge non-scrub) + test 4 (cross-competition
  isolation).
- **T-BACKUP-WAL-CORRUPT** (mitigate): db.backup() online API used in
  daily.ts; backup.test.ts test 2 + test 4 verify the file is a real
  SQLite database (non-zero size, prune walks real files).
- **T-BACKUP-DISK-FULL** (accept): stderr-logged on failure; Phase 2
  REQ-OPS-004 will add disk-space monitoring.
- **T-EVENT-PAYLOAD-PII-LEAK** (accept): retention.test.ts test 5 +
  retention.ts module header document the tradeoff — events.payload
  (especially `card_read.card_holder` which carries the firmware-string
  name from the SI card) survives the scrub; operators are advised to
  encrypt the disk. Phase 2 may add per-event payload redaction.

One additional surface introduced but not in the threat register:

- **threat_flag: dev-mode-only-admin-endpoints**: `routes/admin.ts`
  registers two POST endpoints that can run arbitrary backups or PII
  scrubs. Currently gated on `FARTOLA_DEV=1` which is the same single-
  laptop owner-trust boundary the `/api/__dev/*` routes use. Phase 2
  MUST replace this gate with admin-token auth (REQ-AUTH-\*) before
  multi-laptop deployments — otherwise a host that accidentally sets
  `FARTOLA_DEV=1` in production exposes destructive operations on its
  loopback.

## Self-Check

### Files

- FOUND: apps/edge/src/backup/daily.ts
- FOUND: apps/edge/src/backup/daily.test.ts
- FOUND: apps/edge/src/privacy/retention.ts
- FOUND: apps/edge/src/privacy/retention.test.ts
- FOUND: apps/edge/src/routes/admin.ts
- FOUND: apps/edge/src/routes/admin.test.ts
- FOUND: apps/edge/src/server.ts (modified — registerAdminRoutes added)
- FOUND: apps/edge/src/bin/fartola.ts (modified — CLI flags + scheduler wiring)
- FOUND: .gitignore (modified — backups/)

### Commits

- FOUND: 649d39e (Task 1)
- FOUND: dc271df (Task 2)

## Self-Check: PASSED

## Next Phase Readiness

- Phase 1 plan 18 (packaging) is unblocked. The two new CLI flags
  (`--backup-dir`, `--retention-days`) are documented in `fartola --help`
  output and need to be surfaced in the install README that plan 18 will
  produce.
- Backup snapshots provide the operational rollback target for the
  retention scrub (SCRUB is irreversible; the daily backup is the
  recovery path).
- Plan 16's `/api/competitions/:id/export` route registration in
  server.ts is preserved — `registerExportRoutes` still appears before
  the new `registerAdminRoutes` line.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-15_
