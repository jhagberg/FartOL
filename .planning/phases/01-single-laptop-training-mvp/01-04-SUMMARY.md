---
phase: 01-single-laptop-training-mvp
plan: 04
subsystem: api
tags: [crud, rest, zod, validation, walk-up, consent, REQ-PRIV-001, D-04, D-11, D-15, C-M4]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 02
    provides: 'openDatabase / DbHandle / Drizzle schema (competitions + classes + controls + courses + course_controls + competitors + clubs); ensureNodeId; nextLocalSeq'
  - phase: 01-single-laptop-training-mvp
    plan: 03
    provides: 'wsBroadcast Fastify decorator; readoutChannel; buildServer factory + dbHandle / nodeId opts'
provides:
  - 'packages/shared-types/src/dtos.ts — real Zod schemas + inferred TS types for every Phase 1 wire DTO (Competition + Class + Course + Competitor + Club + Health)'
  - 'apps/edge/src/routes/_zod-errors.ts — shared Zod-issue → wire-error mapper (single structured 400 shape: { errors: [{ path, code, message }] })'
  - 'apps/edge/src/routes/competitions.ts — REST CRUD: list (DESC), create (201), nested get (200 / 404), patch (200 idempotent empty-body)'
  - 'apps/edge/src/routes/classes.ts — REST nested under competition: list + create'
  - 'apps/edge/src/routes/courses.ts — REST nested under competition: list + create with embedded controls (auto-created in single tx)'
  - 'apps/edge/src/routes/competitors.ts — REST walk-up + list + single: POST creates competitor + clubs upsert + card_bound event atomically; 409 card_taken; 422 class-comp mismatch'
  - 'apps/edge/src/routes/clubs.ts — autocomplete: ?prefix=&limit= ordered by last_seen_at_ms DESC'
  - 'apps/edge/src/server.ts — buildServer gains broadcastSink + nextLocalSeqFn injection points (PATTERNS S-2); registers 5 new route plugins'
affects: [01-05, 01-07, 01-08, 01-11, 01-12, 01-14, 01-15, 01-17]

# Tech tracking
tech-stack:
  added:
    - 'zod@4.4.3 (dep on both packages/shared-types AND apps/edge — shared-types owns the schemas, edge body-validates against them)'
  patterns:
    - 'PATTERNS S-1: file-header preamble citing 01-04-PLAN.md + D-04 / D-11 / D-15 / C-M4 in every new .ts file'
    - 'PATTERNS S-2: two new injection points in buildServer — broadcastSink records wsBroadcast calls; nextLocalSeqFn swaps the local_seq generator (test 9 verifies tx atomicity via a throwing fn)'
    - 'PATTERNS S-6: snake_case at the wire boundary (CompetitorCreateInput.competition_id / class_id / card_number) + camelCase internally (Drizzle row.competitionId)'
    - 'Atomicity pattern: sqlite.transaction() wrapping competitor INSERT + clubs upsert + card_bound events INSERT — single C-API tx commit/rollback'
    - 'WS broadcast lives AFTER tx commit so subscribers never see uncommitted card_bound rows (Read Committed at the wire)'
    - 'REQ-PRIV-001 enforced by `consent: z.literal(true)` — the server attests `consent_at_ms = Date.now()` so the client cannot backdate'
    - 'T-CLASS-COMP-MISMATCH: route verifies class.competition_id === body.competition_id and returns 422 with structured message (semantic vs syntactic failure)'
    - 'Pre-flight card_taken SELECT returns 409 with the colliding `existing_competitor_id`; the DB partial unique index is the second line of defence (D-11)'

key-files:
  created:
    - 'packages/shared-types/src/dtos.ts (~220 lines — 12 Zod schemas, all snake_case wire boundary)'
    - 'apps/edge/src/routes/_zod-errors.ts (~36 lines — shared `issuesToErrors(issues)` helper)'
    - 'apps/edge/src/routes/competitions.ts (~210 lines — list / post / nested get / patch with idempotent empty-body)'
    - 'apps/edge/src/routes/classes.ts (~80 lines — list + post, nested under competition)'
    - 'apps/edge/src/routes/courses.ts (~170 lines — list + post; controls auto-created via Set dedupe + bulk insert in single tx)'
    - 'apps/edge/src/routes/competitors.ts (~240 lines — walk-up POST + list + single; transaction; broadcast-after-commit)'
    - 'apps/edge/src/routes/clubs.ts (~60 lines — autocomplete with optional prefix + limit, z.coerce.number for query strings)'
    - 'apps/edge/src/routes/competitions.test.ts (~235 lines — 10 node:tests)'
    - 'apps/edge/src/routes/courses.test.ts (~180 lines — 5 node:tests)'
    - 'apps/edge/src/routes/competitors.test.ts (~390 lines — 12 node:tests covering happy path + REQ-PRIV-001 + T-CLASS-COMP-MISMATCH + tx atomicity + broadcast spy + GET /api/clubs)'
  modified:
    - 'packages/shared-types/package.json (+ zod@^4.4.3 dep)'
    - 'packages/shared-types/src/index.ts (re-export Zod schemas + inferred types; trimmed the now-orphan plain interfaces in db.ts down to EventDTO + ControlDTO)'
    - 'packages/shared-types/src/db.ts (now holds only EventDTO + ControlDTO; the 4 plan-04 wire DTOs moved to Zod schemas in dtos.ts)'
    - 'apps/edge/package.json (+ zod@^4.4.3 dep)'
    - 'apps/edge/src/server.ts (+ BroadcastSink + NextLocalSeqFn types, register 5 new route plugins, wrap wsBroadcast when broadcastSink is set, decorate app.fartolaNextLocalSeq)'
    - 'pnpm-lock.yaml (regenerated for zod)'

key-decisions:
  - 'Zod v4 not v3. The plan called for `zod@^4.4.3`; that is the current latest release on npm and matches the plan literal. v4 deprecated `z.string().uuid()` / `.email()` etc. in favour of top-level `z.uuid()` / `z.email()` but `z.string().regex()` is unchanged — we use the hand-rolled UUID regex so the wire-error `path` stays a bare field name (`id` / `competition_id`) without a Zod-format token, which matches what the REST tests grep on.'
  - 'Empty-body PATCH → 200 (idempotent no-op), NOT 304. Zod accepts `{}` because every field on `CompetitionPatchInput` is `.optional()`. The route short-circuits the SQL UPDATE when `Object.keys(patch).length === 0` so we never emit a SET-less statement; the response is the unmodified row. 304 was considered but 304 in Fastify requires ETag negotiation that the wizard does not use (plan 12 will not depend on conditional GETs).'
  - 'Drizzle ON CONFLICT(name) DO UPDATE on clubs works cleanly via `.onConflictDoUpdate({ target: clubs.name, set: { lastSeenAtMs: now } })`. No quirks; the upsert is one statement and runs inside the same `sqlite.transaction()` as the competitor + events INSERT. The `target` syntax is the only place Drizzle insists on the schema column object (not the SQL column name) — same pattern repo-wide.'
  - 'PATTERNS S-2 broadcastSink wrapping. After wsPlugin decorates `app.wsBroadcast`, the factory wraps the function in-place when `opts.broadcastSink` is set. Fastify forbids `app.decorate()` overwriting an existing slot, so we mutate the property via an `as unknown as ...` cast. The wrapper calls the real fan-out first, then `sink.record(channel, envelope)` — tests get a chronologically-correct log and the WS plugin still drives any real clients.'
  - 'PATTERNS S-2 nextLocalSeqFn injection. The competitor route reads `app.fartolaNextLocalSeq` (decorator, defaults to `db/seq.ts:nextLocalSeq`) inside the transaction. Test 9 swaps in a fn that throws — the throw inside `sqlite.transaction(() => {...})` triggers an automatic rollback (better-sqlite3 contract). The test then SELECTs the competitor + clubs + events tables and asserts the row counts are zero, proving the three writes commit/rollback as one unit.'
  - 'Controls auto-create at course POST. CourseCreateInput.controls = `[{ control_code, order_idx }]`; the route maps codes → control rows in two steps inside the tx: bulk-SELECT existing controls for the (competition_id, codes IN (...)) tuple, then bulk-INSERT any missing codes. This same shape will be reused verbatim by plan 05 XML import dispatcher (CourseData usually doesn''t name controls explicitly).'
  - 'Receipt template enum lives in Zod only, not in the Drizzle column. plan 02 left `receipt_template TEXT` deliberately — adding a SQLite CHECK constraint or Drizzle enum would require a 0002 migration whenever the UI lifted a new template, and the Zod schema at the wire boundary is the canonical narrowing. `normaliseReceiptTemplate` runtime-guards the DB → DTO mapping with a `'classic'` fallback so a hand-edited row can never break the response Zod-conformance.'
  - 'Test 9 (atomicity) uses a throwing nextLocalSeqFn rather than mock library or vi.mock. PATTERNS S-2 — pure DI, no monkey-patching, no jest-style auto-mock. The throw triggers better-sqlite3''s tx auto-rollback; we then assert via three SELECTs that none of competitor / clubs / events rows landed.'
  - 'Test 7 (broadcast spy) uses the `broadcastSink` opt rather than spinning up a real WS client + verifyClient handshake. Standing up a real ws client to a 127.0.0.1:0 listener works (see ws/index.test.ts) but adds ~200ms per test; the in-process recorder is ~0.1ms.'
  - 'Drizzle query builder branching. `clubs` autocomplete with optional `?prefix=` cannot share a single chain because Drizzle finalises the builder at `.where()` — the route declares two parallel chains for the prefix vs no-prefix path. Clear, ~10 extra lines, no runtime cost.'

requirements-completed:
  - REQ-EVT-CMP-001
  - REQ-EVT-CMP-004
  - REQ-PRIV-001

# Metrics
duration: ~25min
completed: 2026-05-14
---

# Phase 1 Plan 04: Competition + walk-up CRUD + clubs autocomplete Summary

**Lands the mutable-config-tables REST surface (D-09) that the SvelteKit wizard (plan 12) and walk-up modal (plan 14) consume. POST /api/competitors writes a competitor row + a `card_bound` event in a single atomic transaction (REQ-PRIV-001 + D-04 walk-up first-class), and WS broadcasts the envelope after commit. Zod 4.4.3 schemas in `packages/shared-types/src/dtos.ts` become the single source of truth for every REST DTO.**

## Performance

- **Duration:** ~25 min (including one prettier-format auto-fix cycle per task, one `as const` → explicit-type fix, one bogus `eq(competitionId, competitionId)` self-bug catch)
- **Started:** 2026-05-14T12:15Z (approx)
- **Completed:** 2026-05-14T12:40Z (approx)
- **Tasks:** 2 / 2
- **Files created:** 10 (4 production routes + 1 zod-error helper + 1 zod-schema bundle + 3 test files + 1 club autocomplete route — actually 9 source files since dtos.ts was rewritten not created)
- **Files modified:** 5 (package.json × 2, index.ts, db.ts, server.ts, pnpm-lock.yaml)
- **Tests added:** 27 new node:tests (10 competitions + 5 courses + 12 competitors); total edge suite 75 / 75 green

## Accomplishments

- **All Phase 1 mutable-config CRUD routes live:** competitions (4 methods), classes (2 nested), courses (2 nested with embedded controls + auto-create in tx), competitors (POST + 2 nested GETs), clubs (1 GET autocomplete). Manual smoke verified:

  ```
  $ curl -X POST :PORT/api/competitions -d '{"name":"StorTuna Tuesday","date":"2026-05-19"}'
  201 { id: "c9b806d3-...", name: "StorTuna Tuesday", date: "2026-05-19",
        receipt_template: "classic", auto_print: false, created_at_ms: 1778761996429 }

  $ curl -X PATCH :PORT/api/competitions/c9b806d3-... -d '{"auto_print":true}'
  200 { ..., auto_print: true }

  $ curl :PORT/api/competitions/c9b806d3-...
  200 { competition: {...}, classes: [], courses: [] }

  $ curl -X POST :PORT/api/competitors -d '{"competition_id":"...","name":"X","class_id":"00000000-..."}'
  400 { errors: [{ path: "name", ... }, { path: "consent", code: "invalid_value", message: "expected true" }] }

  $ curl :PORT/api/clubs
  200 { clubs: [] }
  ```

- **REQ-PRIV-001 enforced server-side.** `CompetitorCreateInput.consent = z.literal(true)` — a missing or `false` consent flag returns 400 with `path: "consent"`. The server then attests `consent_at_ms = Date.now()` inside the transaction; the client cannot backdate. T-CONSENT-BYPASS closed at the input boundary.

- **D-04 walk-up: atomic competitor + card_bound event.** `sqlite.transaction(() => { ...insert competitor; upsert clubs; insert events... })` — three writes commit/rollback as one unit. Test 9 proves it: a throwing `nextLocalSeqFn` rolls back competitor + clubs + events together (all three SELECTs return zero rows).

- **D-11 hybrid card-to-competitor matching.** Pre-flight SELECT returns structured `409 { error: "card_taken", existing_competitor_id }` so plan 14's walk-up UI can surface the conflict. The DB partial unique index (plan 02) is the second line of defence.

- **C-M4 consent_status default = 'explicit'.** Walk-up POST always inserts `consent_status: 'explicit'`. CompetitorCreateInput accepts only `z.literal('explicit')` (or omitted = server default). The other two arms (`pending_first_read`, `confirmed_on_read`) belong to plan 05 (import path) + plan 14 (toast that flips to confirmed) and are NOT accepted at the walk-up boundary.

- **C-H5 boundary unchanged.** zod is allowed in shared-types (the boundary test only blocks `drizzle-orm` + upward `apps/` imports). The shared-types-boundary.test.ts grep gate ran clean against the post-plan-04 tree.

- **PATTERNS S-2 two-axis injection.** `buildServer({ broadcastSink, nextLocalSeqFn })` exposes the two test sinks plan 04 needs: a recording broadcast that intercepts wsBroadcast (test 7) and a seq generator that can throw (test 9). Neither is referenced from production code paths; defaults are pure pass-through.

## Task Commits

Each task committed atomically:

1. **Task 1: Zod schemas in shared-types + competitions/classes/courses CRUD routes + tests** — `dd2e4f8` (feat)
2. **Task 2: POST /api/competitors walk-up + GET /api/clubs autocomplete + tests + PATTERNS S-2 injection points in buildServer** — `2b35473` (feat)

_No plan metadata commit lands from this agent — the orchestrator owns STATE.md / ROADMAP.md updates._

## Files Created / Modified

### Created — packages/shared-types/

- `src/dtos.ts` rewritten (220 lines, was 50). Zod schemas: `CompetitionDTO`, `CompetitionCreateInput`, `CompetitionPatchInput`, `ClassDTO`, `ClassCreateInput`, `CourseDTO`, `CourseCreateInput`, `CourseControlDTO`, `CompetitorDTO`, `CompetitorCreateInput`, `ClubDTO`, `HealthDTO` — plus shared atoms `UUID` / `ISO_DATE` / `RECEIPT_TEMPLATE` / `POSITIVE_INT`.

### Created — apps/edge/src/routes/

- `_zod-errors.ts` — shared `issuesToErrors(issues)` → `{ errors: [{ path, code, message }] }`. Handles Zod v4's `PropertyKey[]` path via `String(seg)` widening.
- `competitions.ts` — 4 routes (list, post, nested-get-with-classes-and-courses, patch). `normaliseReceiptTemplate` guards the row → DTO mapping.
- `classes.ts` — 2 nested routes (list + post). 404 on unknown parent competition.
- `courses.ts` — 2 nested routes. POST runs (Set-dedupe → bulk-SELECT existing controls → bulk-INSERT missing → insert course_controls join) inside a single tx.
- `competitors.ts` — 3 routes. POST walk-up does (zod parse → comp exists → class belongs → card-taken check → atomic insert → broadcast). Helpers: `competitorRowToDTO`.
- `clubs.ts` — 1 route with `?prefix=` + `?limit=` (z.coerce.number().max(200)).

### Created — apps/edge/src/routes/

- `competitions.test.ts` — 10 node:tests.
- `courses.test.ts` — 5 node:tests (includes classes-nested smoke).
- `competitors.test.ts` — 12 node:tests (happy path + REQ-PRIV-001 + T-CLASS-COMP-MISMATCH + walk-up scenario A + broadcast spy + atomicity + 3 clubs cases).

### Modified

- `packages/shared-types/package.json` — `+ zod@^4.4.3` dep.
- `packages/shared-types/src/index.ts` — re-export the 12 Zod schemas; trim `db.ts` re-exports to `EventDTO` + `ControlDTO`.
- `packages/shared-types/src/db.ts` — strip down to `EventDTO` + `ControlDTO` (the four plan-04 wire DTOs moved to Zod schemas in dtos.ts).
- `apps/edge/package.json` — `+ zod@^4.4.3` dep.
- `apps/edge/src/server.ts` — add `BroadcastSink` + `NextLocalSeqFn` types; register 5 new route plugins; decorate `fartolaNextLocalSeq`; wrap `wsBroadcast` when `broadcastSink` is set.
- `pnpm-lock.yaml` — regenerated for zod.

## Decisions Made

1. **Zod v4 (4.4.3) — plan literal matches npm latest.** The v3 → v4 migration deprecated `z.string().uuid()` / `.email()` / `.url()` in favour of `z.uuid()` / `z.email()` / `z.url()`. The plan said "`zod@^4.4.3`" verbatim, and this is the current latest release on npm. We use `z.string().regex(...)` (not deprecated) for the UUID + ISO_DATE atoms so the resulting wire-error `path` is a bare field name (`id` / `date`) — the REST tests assert on `path` directly.

2. **Empty-body PATCH → 200 idempotent, not 304.** Zod accepts `{}` against `CompetitionPatchInput` because every field is `.optional()`. The route short-circuits the SQL UPDATE when no fields changed (so we don't issue `UPDATE ... SET WHERE id=...` with no SET clause). 304 was considered and rejected — 304 requires ETag negotiation that plan 12 wizard does not use. The current 200 response carries the unmodified row.

3. **Receipt template enum at Zod boundary only.** Plan 02 left `receipt_template TEXT` in the SQL schema deliberately so that adding a new template name (post-Phase-1) doesn't require a migration. The Zod enum at `CompetitionCreateInput.receipt_template` is the canonical narrowing. `normaliseReceiptTemplate(row.receiptTemplate)` runtime-guards the DB → DTO mapping with a `'classic'` fallback so a hand-edited row can never break a response.

4. **Drizzle ON CONFLICT DO UPDATE for clubs — no quirks.** `.onConflictDoUpdate({ target: clubs.name, set: { lastSeenAtMs: now } })` emits `INSERT INTO clubs(...) VALUES (...) ON CONFLICT (name) DO UPDATE SET last_seen_at_ms = ?` and runs cleanly inside `sqlite.transaction(() => { ... })`. The `target` arg insists on the Drizzle column object (not the SQL column name) — same convention as `.where()` everywhere else.

5. **PATTERNS S-2 broadcast sink via post-decorate wrapping.** Fastify forbids overwriting an existing decorator slot with `app.decorate()`. The factory mutates the slot directly with `(app as unknown as { wsBroadcast: ... }).wsBroadcast = wrapped` AFTER `wsPlugin` registers. Tests get a clean recorder; production never sees the wrapper.

6. **PATTERNS S-2 `nextLocalSeqFn` via decorator + opt.** `app.fartolaNextLocalSeq` defaults to `db/seq.ts:nextLocalSeq`. Test 9 swaps in a throwing fn — the throw inside `sqlite.transaction(() => {...})` triggers better-sqlite3's automatic rollback, and the three SELECTs (competitor / clubs / events) all return zero rows. Atomicity verified end-to-end.

7. **Auto-create controls inside the course-POST tx.** Course POST accepts `controls: [{ control_code, order_idx }]`. The route runs `Set` dedupe → bulk SELECT existing `(competition_id, code IN (...))` → bulk INSERT any missing codes → bulk INSERT the `course_controls` join. One round-trip per stage, no per-control SELECT/INSERT. Plan 05 XML import dispatcher will share this shape verbatim.

8. **T-CLASS-COMP-MISMATCH → 422 not 400.** A `class_id` from a different competition is semantically wrong (the input parsed successfully but the relationship is invalid). 422 distinguishes this from 400 (syntactic) and 404 (parent missing). Plan 14 walk-up UI can branch on the three codes for distinct toast copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Self-introduced `eq(competitionId, competitionId)` in courses.ts**

- **Found during:** Task 1 typecheck after first write.
- **Issue:** The first draft of `routes/courses.ts` POST handler had two existence checks for the parent competition, the first one being `eq(competitionId, competitionId)` (the local variable compared to itself, a tautology). The query would always return a row and the 404 short-circuit would be wrong.
- **Fix:** Removed the erroneous `compRow` SELECT and kept the canonical `existing = SELECT ... WHERE competitions.id = competitionId` check.
- **Files modified:** `apps/edge/src/routes/courses.ts`.
- **Verification:** courses.test.ts test 2 ("non-existent competition_id → 404") passes; the typecheck would have flagged the unused `compRow` variable anyway.
- **Committed in:** `dd2e4f8` (Task 1).

**2. [Rule 3 — Blocking] Zod v4 issue.path is `PropertyKey[]`, not `(string|number)[]`**

- **Found during:** Task 1 typecheck.
- **Issue:** Each route's first draft inlined an `interface ZodLikeIssue { path: (string|number)[]; ... }` to type the safeParse result. Zod 4 widens `path` to `PropertyKey[]` (which includes `symbol`). `tsc --strict` flagged the mismatch.
- **Fix:** Extracted the helper into `apps/edge/src/routes/_zod-errors.ts` using `import type { ZodIssue } from 'zod'` directly; the mapper widens each path segment via `i.path.map((seg) => String(seg)).join('.')`. Symbols never appear in our schemas (every field is a literal string property), so the widening is cosmetic.
- **Files modified:** `apps/edge/src/routes/_zod-errors.ts` (new), `competitions.ts` + `classes.ts` + `courses.ts` (use the helper).
- **Verification:** typecheck clean across all four route files.
- **Committed in:** `dd2e4f8` (Task 1).

**3. [Rule 3 — Blocking] `row as const` lost the receipt_template literal union**

- **Found during:** Task 1 typecheck.
- **Issue:** The first draft of POST /api/competitions built the insert row with `const row = { ..., receiptTemplate: parsed.data.receipt_template ?? 'classic' } as const`. `as const` narrows `'classic'` to the literal `'classic'` BUT the Zod-parsed input is `'classic' | 'standing' | ... | undefined` so `??` produces `string` — and `as const` makes the property `readonly string`, which Drizzle's insert builder rejects because the column type at the schema layer is `string` but not `readonly`.
- **Fix:** Drop `as const`; let TS infer the row shape. `receiptTemplate` is then plain `string` which Drizzle accepts.
- **Files modified:** `apps/edge/src/routes/competitions.ts` (POST), `apps/edge/src/routes/classes.ts` (POST).
- **Verification:** typecheck clean; node:tests confirm the POST + GET round-trip preserves the value.
- **Committed in:** `dd2e4f8` (Task 1).

**4. [Rule 3 — Blocking] Prettier auto-format on first commit attempt**

- **Found during:** Task 1 + Task 2 commit attempts.
- **Issue:** Lefthook's prettier hook flagged route files (long-form `as` casts, line-length wrapping in the test files). Pre-commit had to be retried after `prettier --write`.
- **Fix:** Ran `pnpm exec prettier --write <files>` on each task's flagged set before re-staging.
- **Files modified:** 5 in Task 1, 3 in Task 2.
- **Verification:** Both commits then passed lefthook on the retry.
- **Committed in:** both task commits.

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking). No Rule 4 architectural deviations. The plan was executed as written — REST surface, route shape, atomicity guarantee, broadcast-after-commit, Zod schemas, test counts (target ~19, actual 27) all match the plan.

## Issues Encountered

- **Drizzle query-builder branching pattern.** `clubs?prefix=` autocomplete cannot share a single chain because Drizzle's builder methods are final at each stage (`.where()` returns a non-chainable result). The route declares two parallel chains for the prefix vs no-prefix case (~10 extra lines). No runtime cost; documented inline.

- **`pnpm dev` argv forwarding.** During the manual smoke I tried `pnpm --filter @fartola/edge dev -- --port 37183 --bind-host 127.0.0.1` and the `--` boundary was eaten by pnpm; the bin saw the args but `--bind-host` was missing one slot. Solved by `cd apps/edge && node --import tsx src/bin/fartola.ts --port 37183 --bind-host 127.0.0.1` directly (the same pattern Playwright's webServer uses). Documented for future plan executors.

## User Setup Required

None — plan 04 is pure REST + Zod + Drizzle. `pnpm install` picks up zod@4.4.3; `pnpm --filter @fartola/edge test` runs the suite cold.

## Next Phase Readiness

- **Plan 05 (XML import dispatcher)** ready: POST `/api/competitions/:id/courses` is the surface the IOF CourseData / Purple Pen importer writes through. Controls auto-create + course_controls atomic insert already proven; plan 05 just needs to map XML → `CourseCreateInput`. Also `consent_status: 'pending_first_read'` lives at the schema layer (plan 02 + plan 04 left it untouched) so the import path is unblocked.
- **Plan 07 (card-to-competitor matching reducer)** ready: `competitors.card_number` is the column the reducer reads; the plan-04 walk-up emits `card_bound` events on the readout: channel so the reducer's input stream is in place.
- **Plan 08 (results projection + results_full)** ready: nothing in plan 04 touches the results: channel; the C-M1 contract still holds (test 5 in ws/index.test.ts: `results:` hello emits zero `replay` envelopes).
- **Plan 11 (full UI + AppShell)** ready: every wire DTO has a Zod schema exported from `@fartola/shared-types`. SvelteKit forms can `import { CompetitionCreateInput }` and run client-side validation against the same shape the bridge accepts.
- **Plan 12 (three-click wizard)** ready: POST `/api/competitions` returns the row used to route to `/competition/[id]/readout`. PATCH `/api/competitions/:id` updates `auto_print` per UI-SPEC §"Auto-print toggle".
- **Plan 14 (walk-up modal)** ready: POST `/api/competitors` is the contract. 409 `card_taken` includes `existing_competitor_id` so the modal can surface the colliding row; 422 distinguishes class-mismatch from comp-missing.
- **Plan 17 (PII scrub cron)** ready: `competitors.scrubbed_at_ms` is set to `null` on walk-up POST; non-null after the daily scrub.

## Known Stubs

None new — plan 04 ships only production paths.

## Threat Flags

None — every new surface (`POST /api/competitors` consent path, `POST /api/competitors` card-taken collision, `GET /api/clubs` autocomplete) was in the threat model up-front:

- T-CONSENT-BYPASS — closed by `z.literal(true)` at the input boundary + server-attested `consent_at_ms`.
- T-DUPLICATE-CARD-BINDING — closed at two layers: pre-flight 409 + DB partial unique index.
- T-CLASS-COMP-MISMATCH — closed by the explicit `class.competition_id === input.competition_id` check (422 with structured message).
- T-INPUT-SIZE-DOS — Fastify default bodyLimit (1 MB) + Zod `.max()` on every string field (name 200, club 120).
- T-SQL-INJECT — Drizzle parameterises every query; the route hand-builds no SQL strings.

## Self-Check: PASSED

**Files verified present on disk:**

- `apps/edge/src/routes/_zod-errors.ts`: FOUND
- `apps/edge/src/routes/competitions.ts`: FOUND
- `apps/edge/src/routes/competitions.test.ts`: FOUND
- `apps/edge/src/routes/classes.ts`: FOUND
- `apps/edge/src/routes/courses.ts`: FOUND
- `apps/edge/src/routes/courses.test.ts`: FOUND
- `apps/edge/src/routes/competitors.ts`: FOUND
- `apps/edge/src/routes/competitors.test.ts`: FOUND
- `apps/edge/src/routes/clubs.ts`: FOUND
- `apps/edge/src/server.ts`: FOUND (modified)
- `packages/shared-types/src/dtos.ts`: FOUND (rewritten — 220 lines of Zod)
- `packages/shared-types/src/index.ts`: FOUND (re-exports the 12 schemas)
- `packages/shared-types/src/db.ts`: FOUND (trimmed to EventDTO + ControlDTO)

**Commits verified in git log:**

- `dd2e4f8` (Task 1: zod schemas + competitions/classes/courses CRUD): FOUND
- `2b35473` (Task 2: competitor walk-up + clubs autocomplete + S-2 injection points): FOUND

**Behavior verified live:**

- `pnpm --filter @fartola/shared-types typecheck`: clean.
- `pnpm --filter @fartola/edge typecheck`: clean.
- `pnpm --filter @fartola/edge lint`: clean.
- `pnpm --filter @fartola/edge test`: 75 / 75 pass (+27 over plan-03 baseline).
- `pnpm --filter @fartola/web typecheck`: clean (no churn — the wire shapes added are compatible with the placeholder web routes).
- Manual smoke against `node --import tsx src/bin/fartola.ts --port <N>`: POST competition → 201 with full DTO, PATCH auto_print → 200 reflects flip, GET nested → competition + empty classes + empty courses, POST competitor without consent → 400 with `path: "consent"`, GET clubs → empty array.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
