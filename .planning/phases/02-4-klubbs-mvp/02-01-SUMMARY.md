---
phase: 02-4-klubbs-mvp
plan: 01
subsystem: database
tags: [eventor, sqlite, drizzle, saxes, streaming, schema, adr, boot-wiring]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides: schema.ts Drizzle idiom; migrate.ts embedded runner; backup/daily.ts handle pattern; routes/admin.ts FARTOL_DEV gate; xml/parse.ts T-FILE-IMPORT preflight
provides:
  - Six new SQLite tables (eventor_competitors, eventor_clubs, meos_competitors, meos_classes, meos_clubs, hired_cards) via single generated migration 0002_phase2.sql
  - competitors.source TEXT NOT NULL DEFAULT 'walkup' (enum walkup|entrylist|meos)
  - apps/edge/src/eventor/parser.ts — saxes 6 streaming parser + DOM clubs parser with T-FILE-IMPORT preflight
  - apps/edge/src/eventor/download.ts — gzipped fetch over the exact MeOS-mirror Eventor URL
  - apps/edge/src/eventor/cache.ts — transactional snapshot replace + config marker
  - apps/edge/src/eventor/boot.ts — EventorHandle { runNow, stop } with 7-day staleness gate, no_key short-circuit, warn-and-run network degradation
  - bin/fartol.ts wiring (fire-and-forget after app.listen) + POST /api/__admin/eventor/refresh
  - ADR-0009 covering the 252 919-row PII trade-off
  - REQUIREMENTS.md REQ-EXT-MEOS-001 entry under new "External integration" section
affects:
  [
    02-walkup-bana-hyrbricka,
    02b-registration-desk,
    03-mip-server,
    04-mop-receiver,
    05-hyrbricka-toast,
    06-parallel-meos-runbook,
  ]

# Tech tracking
tech-stack:
  added: [saxes@6.0.0]
  patterns:
    - 'Streaming XML parser with state-machine + pathStack for path-aware element matching'
    - 'Buffer-then-flush transactional snapshot replace (DELETE → bulk INSERT in 1000-row batches → config marker upsert inside one sqlite.transaction)'
    - 'EventorHandle mirrors BackupHandle shape — { runNow, stop } — so admin/route binding stays uniform'
    - 'Fail-fast no-key short-circuit BEFORE any DB read or HTTP call (D-EV-3 fallback)'
    - 'Fire-and-forget after app.listen so a slow/missing network never blocks /api/health'

key-files:
  created:
    - apps/edge/src/eventor/parser.ts
    - apps/edge/src/eventor/parser.test.ts
    - apps/edge/src/eventor/__fixtures__/competitors-sample.xml
    - apps/edge/src/eventor/__fixtures__/clubs-sample.xml
    - apps/edge/src/eventor/__fixtures__/competitors-with-doctype.xml
    - apps/edge/src/eventor/download.ts
    - apps/edge/src/eventor/cache.ts
    - apps/edge/src/eventor/cache.test.ts
    - apps/edge/src/eventor/boot.ts
    - apps/edge/src/eventor/boot.test.ts
    - apps/edge/drizzle/0002_phase2.sql
    - apps/edge/drizzle/meta/0002_snapshot.json
    - .planning/adr/0009-eventor-runner-cache.md
  modified:
    - apps/edge/src/db/schema.ts
    - apps/edge/src/db/schema.test.ts
    - apps/edge/src/db/migrate.test.ts
    - apps/edge/drizzle/meta/_journal.json
    - apps/edge/src/routes/admin.ts
    - apps/edge/src/routes/admin.test.ts
    - apps/edge/src/bin/fartol.ts
    - apps/edge/package.json
    - pnpm-lock.yaml
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Renamed drizzle-kit's auto-generated `0002_grey_katie_power.sql` to `0002_phase2.sql` and patched meta/_journal.json so the file name reflects intent — matches the existing 0001 hand-authored naming convention."
  - 'FK-safety in cache.ts: orphan competitors (club_id not in just-loaded clubs set) get clubId=null rather than failing the transaction. Runner is still searchable by si_card + name; the missing club is recoverable on the next refresh. Documented at cache.ts:108-118.'
  - 'Buffer-then-flush variant over stream-into-transaction. Pattern 2 endorsed both; we picked the simpler one because ~25-50 MB heap is well inside what the bench laptop has and error-handling stays single-error-site.'
  - "ADR-0009 explicitly cross-references ADR-0008's disk-encryption operator guidance instead of duplicating the threat model. The eventor_* tables intentionally stay OUTSIDE privacy/retention.ts's scrub list — the cache is freely re-fetchable from Eventor any time, so retention doesn't apply."
  - "EventorHandle.stop() is a deliberate no-op (D-EV-1 rejected cron) but kept in the type for parity with BackupHandle so the admin route binding doesn't need a type-guard."

patterns-established:
  - 'Pattern: SAX streaming parser with O(1) memory per record (saxes 6, pathStack, current Partial<T>)'
  - 'Pattern: Transactional snapshot replace = DELETE + bulk-INSERT + config marker, all inside one sqlite.transaction() — partial failure rolls back ENTIRELY'
  - 'Pattern: { runNow, stop } handle decorated on FastifyInstance, surfaced via FARTOL_DEV-gated admin POST endpoint'
  - 'Pattern: T-FILE-IMPORT preflight (DOCTYPE/ENTITY regex on first 512 bytes) applied to streaming AND DOM parsers'

requirements-completed: [REQ-STD-004, REQ-OPS-001, REQ-PRIV-002]

# Metrics
duration: 28min
completed: 2026-05-16
---

# Phase 2 Plan 01: Eventor cache + Phase 2.0 foundation Summary

**Six-table SQLite migration + saxes streaming Eventor parser + transactional snapshot replace + bridge boot hook with 7-day staleness gate. ADR-0009 locks the 252 919-row PII trade-off and REQ-EXT-MEOS-001 closes the missing requirement.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-05-16T21:23:00Z
- **Completed:** 2026-05-16T21:51:50Z
- **Tasks:** 5 (Task 0 verified by orchestrator before agent start)
- **Files modified:** 19 (10 created + 9 modified, including the lockfile)

## Accomplishments

- Generated migration `0002_phase2.sql` creating six new tables in one
  shot so all Phase 2.0 follow-on plans can land without further
  migrations. Migration includes the `competitors.source` ALTER for
  the D-MOP-3 auto-merge.
- saxes 6.0.0 streaming parser handles UTF-8 (Östberg / Pär),
  multi-ControlCard (SI + Emit on one Competitor), orphan-no-club
  (Larsson row), and the T-FILE-IMPORT DOCTYPE/ENTITY pre-flight
  reject path.
- Transactional snapshot replace verified by the test that seeds a
  3-row cache, triggers a parse error on the next ingest, and
  confirms both the prior 3 rows AND the prior config marker survive.
- Bridge boot wiring honors D-EV-3 to the letter — verified by
  booting `EVENTOR_API_KEY=` with `--no-bridge`; bridge listens on
  port 13579 within ~1 second and immediately logs `Eventor: nyckel
saknas (EVENTOR_API_KEY) — falling back to firmware hint`.
- ADR-0009 documents the trade-off (and explicitly cross-references
  ADR-0008's disk-encryption operator guidance so the threat model
  stays in one place).
- REQUIREMENTS.md gains the missing REQ-EXT-MEOS-001 entry — closing
  the gap RESEARCH.md flagged at line 100.

## Task Commits

Each task was committed atomically following TDD (test → feat) where
applicable. Two commits per implementation task: the failing-test
commit and the GREEN implementation commit.

1. **Task 1 RED** (failing schema tests): `bb358ad` (test)
2. **Task 1 GREEN** (schema + migration): `833ac68` (feat)
3. **Task 2 RED** (failing parser tests + fixtures + saxes dep): `30a1208` (test)
4. **Task 2 GREEN** (saxes streaming parser): `eda173c` (feat)
5. **Task 3 RED** (failing cache + download tests): `268e81d` (test)
6. **Task 3 GREEN** (download + cache modules): `2ae544c` (feat)
7. **Task 4 RED** (failing boot tests): `11f8ec9` (test)
8. **Task 4 GREEN** (boot + admin + bin wiring): `9749e99` (feat)
9. **Task 5** (ADR-0009 + REQ-EXT-MEOS-001): `6adcdde` (docs)

Plan metadata commit follows this summary.

## Files Created/Modified

### Created

- `apps/edge/src/eventor/parser.ts` — saxes 6 streaming parser
  (`streamCompetitorsXml`) and DOM clubs parser (`parseClubsXmlSync`)
  with T-FILE-IMPORT preflight on both surfaces.
- `apps/edge/src/eventor/parser.test.ts` — 6 tests including UTF-8,
  multi-ControlCard, orphan club, DOCTYPE rejection, club DOM parse.
- `apps/edge/src/eventor/__fixtures__/competitors-sample.xml` — 3
  synthetic competitors (Hagberg/STK, orphan Larsson with multi-card,
  Östberg UTF-8).
- `apps/edge/src/eventor/__fixtures__/clubs-sample.xml` — 3 clubs
  including a parent OrganisationGroup.
- `apps/edge/src/eventor/__fixtures__/competitors-with-doctype.xml`
  — hostile preamble for the preflight reject test.
- `apps/edge/src/eventor/download.ts` — `downloadEventorPayloads`,
  fail-fast on missing apiKey, exact MeOS-mirror URL, AbortController
  timeout, gunzip stream into tempfiles.
- `apps/edge/src/eventor/cache.ts` — `ingestEventorCache`,
  buffer-then-flush, single sqlite.transaction with DELETE + bulk
  INSERT in 1000-row batches + config marker upsert.
- `apps/edge/src/eventor/cache.test.ts` — 6 tests covering both
  modules including the rollback-on-parse-error path.
- `apps/edge/src/eventor/boot.ts` — `scheduleEventorBoot` exposing
  `{ runNow, stop }` with the 7-day staleness gate, no_key short-
  circuit, and D-EV-3 warn-and-run.
- `apps/edge/src/eventor/boot.test.ts` — 5 staleness/degradation
  scenarios + 1 sanity test.
- `apps/edge/drizzle/0002_phase2.sql` — generated migration
  (renamed from drizzle-kit's auto-name to follow project convention).
- `apps/edge/drizzle/meta/0002_snapshot.json` — drizzle-kit snapshot.
- `.planning/adr/0009-eventor-runner-cache.md` — MADR template with
  Context / Decision Drivers / 3 Considered Options / Decision
  Outcome with 5 numbered mitigations.

### Modified

- `apps/edge/src/db/schema.ts` — added 6 new `sqliteTable()` calls
  plus the `source` enum column on `competitors`. JSDoc per-table
  cross-references the locking ADRs / decisions.
- `apps/edge/src/db/schema.test.ts` — 8 new tests covering the new
  tables and the source column. PHASE2_TABLES list separate from
  EXPECTED_TABLES.
- `apps/edge/src/db/migrate.test.ts` — bumped migration count
  assertion from 2 → 3 (0000+0001+0002).
- `apps/edge/drizzle/meta/_journal.json` — appended 0002_phase2
  entry; existing 0000+0001 entries untouched (codex C-H1 lock).
- `apps/edge/src/routes/admin.ts` — added POST
  `/api/__admin/eventor/refresh` behind the FARTOL_DEV gate; extended
  FastifyInstance declaration with `fartolEventor`.
- `apps/edge/src/routes/admin.test.ts` — 3 new tests for the new
  endpoint (gate, success with stub, no-handle path).
- `apps/edge/src/bin/fartol.ts` — scheduleEventorBoot wired after
  the existing backup/retention block; fire-and-forget `runNow()`
  AFTER `app.listen`; `eventor.stop()` added to shutdown.
- `apps/edge/package.json` — `saxes: 6.0.0` (exact pin, no caret).
- `pnpm-lock.yaml` — saxes + transitive `xmlchars`.
- `.planning/REQUIREMENTS.md` — new "External integration" section
  with REQ-EXT-MEOS-001 (v1).

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The
notable ones:

- **0002_phase2.sql naming**: drizzle-kit auto-named the file
  `0002_grey_katie_power.sql`. Renamed to `0002_phase2.sql` and
  patched `meta/_journal.json` so the filename matches intent.
- **FK-safety on orphan competitors**: Eventor competitors with a
  `club_id` we don't have in our just-loaded clubs set get
  `clubId=null` rather than failing the whole transaction. The
  alternative (strict FK enforcement) would mean a single
  out-of-band club id wipes the entire refresh. Documented at
  `cache.ts:108-118`.
- **Buffer-then-flush vs stream-into-transaction**: Pattern 2
  endorsed both; chose the former because ~25-50 MB heap is well
  inside the bench laptop's RAM and error handling stays at a single
  site (the outer try/await over `streamCompetitorsXml`).
- **EventorHandle.stop() is a no-op**: D-EV-1 explicitly rejected
  cron. Kept in the type for parity with `BackupHandle` so admin
  route binding doesn't need a type-guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migrate test count assertions out of date**

- **Found during:** Task 1 (schema GREEN)
- **Issue:** `apps/edge/src/db/migrate.test.ts` asserted exactly 2
  migrations (`__drizzle_migrations` count == 2). Plan 02-01 task 1
  legitimately added migration 0002, so 3 is the new correct count.
- **Fix:** Updated all three assertions (tests 1, 2, 3) to expect
  3 instead of 2, with a comment naming the plan. Trigger count
  remains 2 (0002 adds no triggers).
- **Files modified:** `apps/edge/src/db/migrate.test.ts`
- **Verification:** `node --test src/db/migrate.test.ts` → 5/5 pass.
- **Committed in:** `833ac68` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] BodyInit type mismatch in mock fetch**

- **Found during:** Task 3 (cache GREEN)
- **Issue:** `new Response(Buffer)` failed typecheck because
  Response's BodyInit doesn't include Node's Buffer.
- **Fix:** Wrapped the Buffer in `new Uint8Array(bytes)` before
  passing to `new Response(...)`. Buffer extends Uint8Array so the
  bytes round-trip is byte-identical.
- **Files modified:** `apps/edge/src/eventor/cache.test.ts`
- **Verification:** `pnpm typecheck` → exits 0; cache tests pass.
- **Committed in:** `2ae544c` (Task 3 GREEN commit)

**3. [Rule 1 - Bug] Numeric sort comparator in tests**

- **Found during:** Task 3 (cache GREEN)
- **Issue:** `.sort()` on `[320, 637, 8]` uses lexicographic string
  comparison and yields `[320, 637, 8]` instead of `[8, 320, 637]`.
- **Fix:** Added `(a, b) => a - b` comparator to two sort calls.
- **Files modified:** `apps/edge/src/eventor/cache.test.ts`
- **Verification:** cache.test.ts → 6/6 pass.
- **Committed in:** `2ae544c` (Task 3 GREEN commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs — all in test
infrastructure, no production behavior change).
**Impact on plan:** All auto-fixes were follow-ons from the
intentional changes (migration 0002 added, mock fetch added, new
test added). No scope creep; production code lands as planned.

## Issues Encountered

- **First-time `pnpm install` required**: the worktree had no
  `node_modules`. Resolved by running `pnpm install` followed by
  `pnpm --filter @fartol/sportident build` so the workspace
  `@fartol/sportident` package's `dist/index.d.ts` resolved. No
  scope impact; standard first-run setup.

## User Setup Required

None for plan-level acceptance.

To exercise the live Eventor refresh path (out of scope for plan
acceptance, but useful for the bench dry-run before Wednesday's
4-klubbs event):

1. Place the Eventor API key in `.eventor-env` (gitignored, commit
   7ec8866).
2. Source it before booting the bridge:
   `set -a; source .eventor-env; set +a; fartol --port 3000`.
3. Watch the logs for `Eventor: refresh ok — N competitors, M clubs`
   (~5 s on a fresh DB, ~250 k rows landed).
4. Subsequent boots within 7 days will log `Eventor: cache N dagar
gammal — skipping refresh`. Force a refresh with
   `curl -X POST http://localhost:3000/api/__admin/eventor/refresh`
   (requires `FARTOL_DEV=1`).

## Next Phase Readiness

- Plan 02 (WalkupModal: Bana + Hyrbricka + Eventor lookup) is
  unblocked — the `eventor_competitors` table is queryable, the
  `hired_cards` table accepts inserts, and the `source` column on
  `competitors` is available.
- Plans 03 (MIP) and 04 (MOP) are unblocked — the `meos_*` shadow
  tables exist with no `competition_id` FK (per D-MOP-1, global
  session state).
- Plan 05 (hyrbricka finish-readout toast) reads `hired_cards`.
- Plan 06 (parallel-meos-runbook) will document the bench-side
  refresh procedure using the verification commands above.

---

## Self-Check: PASSED

- [x] `apps/edge/src/db/schema.ts` — FOUND, contains 6 new tables + source column
- [x] `apps/edge/drizzle/0002_phase2.sql` — FOUND
- [x] `apps/edge/drizzle/meta/0002_snapshot.json` — FOUND
- [x] `apps/edge/drizzle/meta/_journal.json` — UPDATED, 0002_phase2 entry appended
- [x] `apps/edge/src/eventor/parser.ts` — FOUND
- [x] `apps/edge/src/eventor/parser.test.ts` — FOUND
- [x] `apps/edge/src/eventor/__fixtures__/competitors-sample.xml` — FOUND
- [x] `apps/edge/src/eventor/__fixtures__/clubs-sample.xml` — FOUND
- [x] `apps/edge/src/eventor/__fixtures__/competitors-with-doctype.xml` — FOUND
- [x] `apps/edge/src/eventor/cache.ts` — FOUND
- [x] `apps/edge/src/eventor/cache.test.ts` — FOUND
- [x] `apps/edge/src/eventor/download.ts` — FOUND
- [x] `apps/edge/src/eventor/boot.ts` — FOUND
- [x] `apps/edge/src/eventor/boot.test.ts` — FOUND
- [x] `apps/edge/src/bin/fartol.ts` — UPDATED, scheduleEventorBoot wired
- [x] `apps/edge/src/routes/admin.ts` — UPDATED, /api/\_\_admin/eventor/refresh added
- [x] `apps/edge/src/routes/admin.test.ts` — UPDATED, 3 new tests
- [x] `.planning/adr/0009-eventor-runner-cache.md` — FOUND, status: accepted
- [x] `.planning/REQUIREMENTS.md` — UPDATED, REQ-EXT-MEOS-001 + External integration section
- [x] Commits: `bb358ad`, `833ac68`, `30a1208`, `eda173c`, `268e81d`, `2ae544c`, `11f8ec9`, `9749e99`, `6adcdde` — all FOUND in `git log`

---

_Phase: 02-4-klubbs-mvp_
_Completed: 2026-05-16_
