---
phase: 01-single-laptop-training-mvp
plan: 10
subsystem: api

tags:
  [fastify, zod, drizzle, manual-dnf, un-dnf, walk-up, replace-card, ws-broadcast, projection-store]

# Dependency graph
requires:
  - phase: 01-04
    provides: POST /api/competitors handler, CompetitorCreateInput schema, broadcastSink test pattern
  - phase: 01-06
    provides: insertEvent helper (single insertion path, sqlite.transaction)
  - phase: 01-07
    provides: reduce() handlers for manual_dnf + un_dnf event arms
  - phase: 01-08
    provides: projectionStore.markDirty + debounced recompute + per-class broadcast
provides:
  - POST /api/competitions/:id/competitors/:competitorId/manual-dnf endpoint
  - POST /api/competitions/:id/competitors/:competitorId/un-dnf endpoint
  - replace_card_for_competitor_id mode on POST /api/competitors (atomic UPDATE + card_bound event preserving consent_at_ms)
  - ManualDnfInput + UnDnfInput Zod schemas in @fartola/shared-types
affects: [plan-13-readout-view, plan-14-walkup-modal, plan-16-iof-export]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Two-mode REST handler via Zod superRefine + .optional() at the base shape (create vs replace selected by request body)'
    - 'Idempotent un-DNF endpoint — REST returns 201 even when no prior manual_dnf exists; reducer no-op handles re-derivation'
    - 'Cross-competition reject via competitor existence query scoped to competitionId (T-CROSS-COMP-MANUAL / T-CROSS-COMP-REPLACE)'

key-files:
  created:
    - apps/edge/src/routes/manual.ts
    - apps/edge/src/routes/manual.test.ts
  modified:
    - apps/edge/src/routes/competitors.ts
    - apps/edge/src/routes/competitors.test.ts
    - apps/edge/src/server.ts
    - packages/shared-types/src/dtos.ts
    - packages/shared-types/src/index.ts

key-decisions:
  - 'Made name/class_id/consent optional at the Zod base shape so the same CompetitorCreateInput schema covers both create and replace modes; superRefine adds custom issues at the right path for each mode.'
  - 'Replace-card UPDATE branch reuses app.fartolaNextLocalSeq (PATTERNS S-2) so the create-mode test 9 atomicity coverage transitively covers the replace path too.'
  - "Un-DNF endpoint is idempotent at REST layer (always 201) — the projection-layer no-op handles the empty-history case; this matches manual-DNF's reversibility contract per UI-SPEC §'Destructive actions'."
  - 'Did NOT auto-add a 404-on-unknown-card for un-DNF (no prior manual_dnf event); chose idempotent 201 because the reducer already converges (un_dnf is a no-op when no override is active).'

patterns-established:
  - 'Two-mode Zod schema via superRefine + .optional(): base shape declares every field optional, superRefine adds custom issues per mode. Future plans extending wizard/walk-up should follow this rather than splitting into separate schemas.'

requirements-completed:
  - REQ-EVT-CMP-006
  - REQ-EVT-CMP-004
  - REQ-PRIV-001

# Metrics
duration: 35min
completed: 2026-05-14
---

# Phase 01 Plan 10: Manual DNF override + walk-up replace-card Summary

**Operator-attested manual_dnf / un_dnf REST endpoints (reversible per UI-SPEC) and a Bricka-replace mode on POST /api/competitors that preserves consent_at_ms (REQ-PRIV-001).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-14 (plan execution)
- **Completed:** 2026-05-14
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 5

## Accomplishments

- **Manual DNF override flow** wired end-to-end: REST endpoint inserts `manual_dnf` event via `insertEvent`, broadcasts on `readout:<id>`, marks projection dirty. The reducer (plan 07) already handled the override semantics — plan 10 lands the REST that emits the events.
- **Un-DNF reversal** lands as a paired idempotent endpoint — reducer re-derives status from `latest_punches` (PEND if no card_read, OK/MP if punches present). Matches UI-SPEC §"Destructive actions": no irreversible Phase-1 mutations.
- **Walk-up replace-card extension** atomically updates an existing competitor's `card_number` when the operator notices a misread Bricka. `consent_at_ms` is preserved on the competitor row AND in the emitted `card_bound` event payload — REQ-PRIV-001 holds.
- **11 new node:test tests** (5 manual-dnf + 3 un-dnf + 3 replace-card); 208 total tests pass on `pnpm --filter @fartola/edge test`.

## Task Commits

Each task was committed atomically:

1. **Task 1: manual-dnf + un-dnf REST routes + tests** — `643bb61` (feat)
2. **Task 2: Walk-up endpoint extension — replace-card-for-competitor** — `8d96e0d` (feat)

## Files Created/Modified

- `apps/edge/src/routes/manual.ts` _(new)_ — manual_dnf + un_dnf REST handlers; insertEvent + wsBroadcast + markDirty per-endpoint.
- `apps/edge/src/routes/manual.test.ts` _(new)_ — 8 node:test cases: happy path, empty-reason 400, unknown-competitor 404, T-CROSS-COMP-MANUAL 404, broadcast spy, un-dnf reversion, un-dnf idempotence, un-dnf 404.
- `apps/edge/src/routes/competitors.ts` _(modified)_ — POST /api/competitors split into two branches keyed off `replace_card_for_competitor_id`. Replace branch: scoped existence check (T-CROSS-COMP-REPLACE), collision check, atomic UPDATE + card_bound event with original consent_at_ms preserved.
- `apps/edge/src/routes/competitors.test.ts` _(modified)_ — 3 new tests under `describe('competitors replace-card-for-competitor (plan 10)')`: happy path with consent_at_ms preservation, cross-competition reject 404, card-collision 409.
- `apps/edge/src/server.ts` _(modified)_ — registered `manualRoutes` between readout + dev routes.
- `packages/shared-types/src/dtos.ts` _(modified)_ — CompetitorCreateInput → two-mode Zod schema via superRefine; new ManualDnfInput + UnDnfInput schemas.
- `packages/shared-types/src/index.ts` _(modified)_ — barrel exports the two new schemas.

## Decisions Made

- **Idempotent un-DNF at REST layer:** chose 201-always over 409-on-no-prior-override because the reducer already converges. The alternative would have required the REST layer to query the projection (a layering violation in Phase 1) or read the event log (an unnecessary SELECT on a happy path that almost always follows a manual_dnf within the same operator session). Test 5 documents the contract.
- **Replace-card mode does NOT collision-check when the new card equals the current card:** the UPDATE is a no-op but the `card_bound` event is still emitted. This keeps the audit trail honest — the operator's action is recorded even when the card_number didn't change (e.g., they re-confirmed in the modal). Test 10 does NOT cover this micro-case; future plans may add it if the readout UI needs to render the re-confirmation.
- **Two-mode Zod over two separate schemas:** keeping one `CompetitorCreateInput` simplifies the SvelteKit walk-up modal (plan 14) — one form, one schema, one error renderer. The superRefine is ~25 lines vs. 50+ lines for a discriminated-union pair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split CompetitorCreateInput optionality across two task commits**

- **Found during:** Task 1 (initial integration)
- **Issue:** The plan's <action> for Task 1 included `UnDnfInput = z.object({}).optional()` and the Task 2 <action> overhauled `CompetitorCreateInput`. I initially made all of those Zod changes in Task 1, which broke typechecking inside competitors.ts (handler assumed name/class_id were `string`, not `string | undefined`).
- **Fix:** Reverted the `CompetitorCreateInput` changes from Task 1's commit; ship only `ManualDnfInput` + `UnDnfInput` schemas there. Task 2 lands the `CompetitorCreateInput` superRefine alongside the handler refactor that needs it. This makes each commit independently buildable + testable.
- **Files modified:** packages/shared-types/src/dtos.ts (revert + re-add split across commits)
- **Verification:** `pnpm --filter @fartola/edge typecheck` passes at the head of each commit.
- **Committed in:** `643bb61` (Task 1) + `8d96e0d` (Task 2)

**2. [Rule 2 - Missing Critical] Belt-and-braces null check in replace-mode handler**

- **Found during:** Task 2
- **Issue:** Zod superRefine guarantees `card_number` is non-null in replace mode, but TypeScript can't narrow across `.superRefine()` — `input.card_number` stays `number | null`. A future refactor of the schema could silently break the contract.
- **Fix:** Added an explicit `if (newCardNumber === null) return reply.code(400)...` block immediately after the competitor lookup. The block is unreachable in practice (the comment says so) but compile-time-safe and contract-explicit.
- **Files modified:** apps/edge/src/routes/competitors.ts
- **Committed in:** `8d96e0d`

**3. [Rule 3 - Blocking] Prettier formatting on chained `.code(400).send({...})` calls**

- **Found during:** Task 2 pre-commit hook
- **Issue:** Prettier's preferred line-break policy on chained Fastify reply builders differs from what came out of the edit pass; the lefthook prettier check failed.
- **Fix:** Ran `prettier --write` on the modified files; re-staged and re-committed.
- **Files modified:** apps/edge/src/routes/competitors.ts
- **Committed in:** `8d96e0d`

---

**Total deviations:** 3 auto-fixed (1 blocking-task-split, 1 missing-critical-null-guard, 1 blocking-formatter)
**Impact on plan:** Plan executed as written. Deviation 1 is a sequencing nit — Task 1 stays small + safe rather than landing a broken interim state.

## Issues Encountered

### Zod superRefine + optional() interplay (the documented quirk)

The plan's `<output>` specifically asked me to record Zod superRefine quirks. Findings:

1. **`.optional()` is required at the base shape for any field that's conditionally required.** Zod parses the base shape FIRST, THEN runs superRefine. If `name` is declared `z.string().min(2)` (not optional), a replace-mode POST that omits `name` gets a base-layer 400 BEFORE superRefine can run. The fix is to declare `name: z.string().trim().min(2).max(200).optional()` — Zod treats `.min(2)` as a constraint that only fires when the value is present, so the optionality + constraint compose correctly.

2. **`superRefine` cannot narrow the inferred TypeScript type.** Even after `superRefine` proves that `card_number !== null` in replace mode, `z.infer<typeof CompetitorCreateInput>` still types `card_number` as `number | null`. The handler needs an explicit narrowing check (the belt-and-braces null guard in Deviation 2).

3. **`ctx.addIssue({ code: 'custom', path: ['field'], ... })` flows through `issuesToErrors` unchanged.** The shared error mapper joins `path` with `.` and the SvelteKit form (plan 14) renders the issue against the named field. No extra mapping required.

4. **`UnDnfInput = z.object({}).optional()` from the plan needed adjustment.** `.optional()` on `z.object({})` typechecks but breaks `z.infer<...>` (the type becomes `{} | undefined`). I changed it to `z.object({}).passthrough()` so the inferred type is just `{}` — the handler doesn't safeParse the un-DNF body at all, so the schema is exported purely for symmetry / future use. Documented in dtos.ts.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 13 (readout-view UI)** can now POST inline manual-dnf + un-dnf from the active row. The `readout:<id>` WS channel already carries `manual_dnf` / `un_dnf` envelopes for incremental UI updates without a full re-fetch.
- **Plan 14 (walk-up modal)** can POST `replace_card_for_competitor_id` when the operator corrects a misread Bricka. The single `POST /api/competitors` endpoint handles both create + replace; SvelteKit form code only needs one fetcher.
- **Plan 16 (IOF XML export)** is unaffected — manual_dnf/un_dnf events live in the same event log and the existing projection types (`CompetitorView.status`, `manual_dnf_reason`) already carry the override state.

### Verification commands

```
cd /home/jonas/src/fartOLa-phase-1 && pnpm --filter @fartola/edge typecheck
cd /home/jonas/src/fartOLa-phase-1 && pnpm --filter @fartola/edge test
# Expected: 208 tests pass, 0 fail.
```

## Self-Check: PASSED

- [x] `apps/edge/src/routes/manual.ts` exists
- [x] `apps/edge/src/routes/manual.test.ts` exists
- [x] `apps/edge/src/routes/competitors.ts` modified (replace-card branch added)
- [x] `apps/edge/src/routes/competitors.test.ts` modified (3 new tests)
- [x] `packages/shared-types/src/dtos.ts` modified (ManualDnfInput + UnDnfInput + CompetitorCreateInput superRefine)
- [x] `packages/shared-types/src/index.ts` modified (barrel re-exports)
- [x] `apps/edge/src/server.ts` modified (manualRoutes registered)
- [x] Commit `643bb61` present in `git log` (feat(01-10): manual-dnf + un-dnf)
- [x] Commit `8d96e0d` present in `git log` (feat(01-10): replace_card_for_competitor_id)
- [x] `pnpm --filter @fartola/edge typecheck` passes
- [x] `pnpm --filter @fartola/edge test` reports 208 pass / 0 fail / 0 skipped

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
