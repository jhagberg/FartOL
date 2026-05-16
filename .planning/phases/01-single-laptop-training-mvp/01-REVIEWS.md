---
phase: 1
reviewers: [codex]
reviewed_at: 2026-05-14
plans_reviewed: [01-01..01-18 PLAN.md]
codex_model: gpt-5.5
codex_reasoning_effort: medium
notes: |
  First codex attempt with xhigh reasoning + unlimited web search exhausted
  the 400k context window mid-review (logged 14 web searches). Retry with
  medium reasoning + `features.web_search=false` completed cleanly in ~3 min.
---

# Cross-AI Plan Review — Phase 1

## Codex Review (gpt-5.5, reasoning=medium)

## Summary
The plan set is strong architecturally, but I would not execute it unchanged. The biggest issues are not dependency freshness; they are internal contract breaks: migration generation erasing raw SQL triggers, SI card payloads omitting finish/start data needed by DNF/elapsed/export, wizard “no orphan” semantics that cannot hold, and install-smoke packaging paths that likely fail. Overall: good wave structure, but several “binding contracts” are asserted without a working implementation path.

## Strengths
- Wave sequencing is mostly sound: scaffold → schema → skeleton → CRUD/import → SI/reducer/projection → UI/print/export/ops.
- The plans repeatedly preserve key invariants: append-only events, localhost default, no WebSerial, adapter-static SPA, no QR in Phase 1.
- Testing intent is unusually concrete: regression gates for `card.raceResult.punches`, idle no-broadcast, IOF export status enum, empty exports, auto-print fake timers.
- The project avoids premature multi-operator scope and keeps Phase 1 single-laptop.

## Concerns (severity-tagged)
- **HIGH:** 01-02 Task 1 verify command says `pnpm --filter @fartol/edge db:generate ... grep -q 'CREATE TRIGGER.*events_no_update' apps/edge/drizzle/0000_initial.sql`, while the action says triggers are appended because “drizzle-kit doesn't generate triggers from schema-as-TS.” Running `db:generate` in verification will likely overwrite the post-generated trigger edits, so the append-only invariant can disappear during the very check meant to prove it.

- **HIGH:** 01-06/01-07 card read payload likely cannot support DNF/elapsed/export. 01-06 locks card_read to `payload = { event_type: 'card_read' ... punches }` sourced from `card.raceResult.punches`. 01-07 then assumes “The 'start' punch control_code is the special value 1 OR 4” and “The 'finish' punch control_code is the special value 2 OR 3 (or 240...)”. If Phase 0’s `raceResult` has start/finish/check as separate fields, not normal `punches`, every elapsed time, DNF, receipt split, and IOF `StartTime`/`FinishTime` path is built on missing data.

- **HIGH:** 01-12’s deferred wizard persistence contradicts itself. It says “no competition state persisted until step 3 completes,” but step 3 runs `POST createCompetition → ... POST importCompetitionFile`. It also claims “If any step in the chain fails... No orphan competition rows.” If import fails after create succeeds, there is no Phase 1 delete route and no transaction spanning HTTP requests. This creates orphan competitions despite the stated contract.

- **HIGH:** 01-18 install smoke script likely installs locally but looks for a global-install path. Earlier interface says `npm install --prefix "$tmpdir" -g <tarball>`, but the final script uses `npm install --prefix "$TMPDIR" --silent "$TARBALL"` and then `BIN="$TMPDIR/lib/node_modules/.bin/fartol"`. A non-global prefix install usually places bins under `$TMPDIR/node_modules/.bin`, so the smoke can fail even if the tarball is valid.

- **HIGH:** 01-02 shared-types row-type export creates an upward app dependency: `packages/shared-types/src/db.ts` imports `../../../apps/edge/src/db/schema.ts`. Later 01-18 says to bundle `@fartol/shared-types` via `noExternal`. That may erase runtime imports, but declaration generation and package boundaries can still leak a path that does not exist in the installed tarball. This undermines the “pure-TS shared package” idea.

- **MEDIUM:** 01-03 / 01-08 WebSocket replay mixes raw event replay and results projections. 01-03 says replay sends `{ type: 'replay', channel: 'readout:<id>', payload: Event }` for any subscribed channel. 01-08 then says `results:<id>` hello sends `results_full`. A results client may receive raw event replay envelopes before `results_full`, which is outside the locked results channel contract.

- **MEDIUM:** 01-15 auto-print races the debounced projection. 01-08 says markDirty debounces 50ms; 01-15 says auto-print runs after 400ms and “resolves ... projectionStore.get”. If projection recompute failed, is stale, or unknown-card binding has not landed, the print envelope can be missing competitor/place context. The plan should call `recomputeNow(activeId)` inside the print enqueue path or skip unknown cards explicitly.

- **MEDIUM:** 01-13 and 01-14 disagree on walk-up navigation. 01-13 says unknown card triggers `?walkup=<cardNumber>` on the readout URL. 01-14 says “Walk-up modal opens on `/competition/[id]/walkup?card=<n>`.” That affects routing, back behavior, and e2e selectors.

- **MEDIUM:** 01-17 privacy semantics are under-specified for consent. EntryList import in 01-05 sets `consent_at_ms = Date.now()` for imported competitors, while 01-14 walk-up has an explicit consent checkbox. If REQ-PRIV-001 means informed consent, importing a start list should not silently manufacture consent timestamps.

- **LOW:** 01-16 default export status is inconsistent. UI says final default; the route code defaults `status` to `Final`; but the empty-export route test text says “root @status is 'Snapshot' (default status query param resolves to Provisional? actually default is Final → Complete; verify the default-status path explicitly).” The test description itself flags confusion.

- **LOW:** 01-05 says “Purple Pen `.xml` IS IOF XML 3.0 CourseData,” but D-03 also says “IOF XML 3.0 EntryList.” The endpoint dispatch is fine, but avoid wording that implies any `.xml` from Purple Pen necessarily contains entries.

## Suggestions
- **01-02 Task 1:** Replace `db:generate` in verification with a drift check that does not rewrite `0000_initial.sql`, or create a checked-in custom migration file after Drizzle generation for triggers.
- **01-06 / 01-07:** Extend `card_read` payload to include explicit `start_time_ms`, `finish_time_ms`, and `check_time_ms` from Phase 0’s race result if available. Update reducer/export/receipt tests to use those fields.
- **01-12:** Add a single backend “create competition from wizard draft” transaction endpoint, or add rollback cleanup if import fails.
- **01-18:** Make install smoke use either true global prefix install with the correct bin path, or local install with `$TMPDIR/node_modules/.bin/fartol`.
- **01-02 / 01-18:** Move DB row inferred types out of `@fartol/shared-types`, or generate plain shared interfaces from schema instead of importing app schema upward.
- **01-08:** Special-case `results:` hello replay to send only `results_full`, not raw event `replay` envelopes.
- **01-13/14:** Pick one walk-up route shape and update both e2e specs.

## Risk Assessment
**HIGH** — the architecture is viable, but the current plans contain several executable contradictions that could break core success criteria: append-only storage, DNF/elapsed computation, wizard import atomicity, and packaged install.
---

## Consensus Summary

> Codex is the only cross-AI reviewer invoked for this round (the internal
> sonnet plan-checker is already accounted for separately; its findings
> were folded into the revision-1 fixes before this review ran).
> A second round with `--gemini` or `--claude` is the natural next step
> if more triangulation is desired.

### Agreed Strengths (codex)

- Wave sequencing is sound (scaffold → schema → skeleton → CRUD/import → SI/reducer/projection → UI/print/export/ops).
- Locked invariants are repeatedly honored across plans (append-only events, localhost default, no WebSerial, adapter-static SPA, no QR in Phase 1).
- Test intent is concrete with specific regression gates already in place.
- Phase 1 scope is appropriately bounded — single-laptop, no multi-operator.

### Agreed Concerns — HIGH severity, must fix before execution

Five HIGH findings, all surgical. Citations and recommended owners:

| ID | Plan/Task | Issue | Fix |
|----|-----------|-------|-----|
| C-H1 | 01-02 T1 | `db:generate` in the verify command re-runs the generator and will overwrite the post-generated `CREATE TRIGGER events_no_update` triggers — verification itself can erase the append-only invariant. | Replace the `db:generate` verify step with a drift check that does NOT regenerate (`drizzle-kit check` or a stat-based "no schema-drift" test). Alternatively: move triggers into a checked-in custom migration file that survives regeneration. |
| C-H2 | 01-06 T1 + 01-07 T1 | Plan 06 persists `card_read` payload with only `{ punches }`. **Phase 0's NdjsonEmitter** (`packages/sportident/src/output/ndjson.ts:268-275`) emits `card_read` with `start / finish / check / clear` as **top-level fields**, NOT inside `punches[]`. Plan 07's reducer expects punches with `code = 1 OR 4` for start and `2 OR 3` for finish — but those would be control punches in Phase 0's surface, not start/finish events. **Result: every elapsed-time, every DNF mark, every IOF `StartTime` / `FinishTime` export is built on missing or wrong data.** | Plan 06 T1: extend the persisted payload to include `start_time`, `finish_time`, `check_time`, `clear_time` (top-level, mirror NdjsonEmitter shape). Plan 07 T1: update reducer to read from those top-level fields, not from a punch with magic code. Update DB schema if necessary (payload is JSON so no schema change needed). Add a test fixture replay assertion: `events.payload.finish_time IS NOT NULL` for the SI10 Jonas bench fixture. |
| C-H3 | 01-12 T2 (wizard step 3) | The wizard contract claims "no orphan competition rows" but step 3 fires two POSTs (`createCompetition` then `importCompetitionFile`). HTTP requests cannot share a transaction; if import fails after create succeeds, an orphan competition is persisted, violating the locked contract. | Either (a) add a single backend `POST /api/competitions/from-wizard` that wraps both steps in a SQL transaction, OR (b) add a cleanup step: if import fails, fire `DELETE /api/competitions/:id` with rollback semantics. Option (a) is cleaner and matches D-15's three-click guarantee. |
| C-H4 | 01-18 T2 (install smoke) | Script does `npm install --prefix "$TMPDIR" --silent "$TARBALL"` (local prefix install) but then looks for binary at `$TMPDIR/lib/node_modules/.bin/fartol`. Non-global prefix installs place binaries at `$TMPDIR/node_modules/.bin/fartol`. Smoke test will fail even with a valid tarball. | Either use true global-install with `--prefix "$TMPDIR" -g` (binary at `$TMPDIR/lib/node_modules/.bin/`) OR use local install and look at `$TMPDIR/node_modules/.bin/fartol`. Document choice in the task. |
| C-H5 | 01-02 (shared-types) | `packages/shared-types/src/db.ts` imports types from `../../../apps/edge/src/db/schema.ts` (upward dependency from a "pure-TS shared package" into an app). Plan 18 mitigates the runtime side with `noExternal`, but `.d.ts` generation and package boundaries still leak the path. The published `@fartol/shared-types` tarball would reference a path that doesn't exist on install. | Move Drizzle row-type inference into `apps/edge/` (where the schema lives) and only export plain shared interfaces from `@fartol/shared-types`. OR generate stub `.d.ts` types from the schema at build time and bundle the generated `.d.ts` inside `packages/shared-types/`. |

### Agreed Concerns — MEDIUM

| ID | Plan/Task | Issue | Fix |
|----|-----------|-------|-----|
| C-M1 | 01-03 T1 vs 01-08 T2 | WS `replay` envelope can leak raw event replay to a `results:` channel subscriber before `results_full` arrives. | Special-case `results:` hello to send only `results_full`, never raw event `replay` envelopes. |
| C-M2 | 01-15 T2b (auto-print) | 400ms auto-print debounce vs 50ms projection markDirty debounce — auto-print can fire before the projection includes the new card, so receipt prints missing competitor/place context. | Inside the auto-print enqueue path: call `projectionStore.recomputeNow(activeId)` before reading `competitor/place context`, or skip auto-print when projection doesn't have the card yet. |
| C-M3 | 01-13 vs 01-14 | Plan 13 says unknown card opens `?walkup=<cardNumber>` on the readout URL; plan 14 says walk-up modal opens on `/competition/[id]/walkup?card=<n>`. Two different route shapes, two different e2e selector sets. | Pick one (recommend the readout-query-param variant so back-navigation returns to readout naturally), update both plans + e2e specs. |
| C-M4 | 01-05 (EntryList import) vs 01-14 (walk-up) | EntryList import silently sets `consent_at_ms = Date.now()` for imported competitors; walk-up requires an explicit consent checkbox. REQ-PRIV-001 implies informed consent — silently manufacturing it on import is inconsistent. | Either (a) require EntryList import to mark imported competitors as `consent_pending` until first walk-up confirmation, OR (b) document the import-time consent semantics explicitly (e.g. "by importing EntryList you confirm operator has obtained consent from all listed competitors") and reflect in the UI. |

### Agreed Concerns — LOW

| ID | Plan/Task | Issue | Fix |
|----|-----------|-------|-----|
| C-L1 | 01-16 | `@status` default mapping has internal documentation drift in the route test 5 text. | Tighten the test 5 phrasing: the default-status path locked to "Final → Complete". |
| C-L2 | 01-05 | Wording "Purple Pen `.xml` IS IOF XML 3.0 CourseData" can confuse the EntryList vs CourseData dispatch. | Clarify the wording: Purple Pen `.xml` is a *valid IOF XML 3.0 CourseData document* but does NOT contain entries; entries arrive separately via EntryList. |

### Codex Risk Verdict

**HIGH overall** — architecture is viable but several executable contradictions could break core success criteria. All 5 HIGH findings have small, surgical fixes.

---

## Recommended next step

```
/gsd-plan-phase 1 --reviews
```

This will re-spawn the planner with REVIEWS.md as input. The planner will:
1. Read each finding (C-H1..C-L2).
2. Identify the affected plans (02, 05, 06, 07, 12, 13, 14, 15, 16, 18).
3. Apply surgical fixes per the recommended owner column.
4. Re-run the plan-checker.
5. Optionally rerun `/gsd-review --phase 1 --codex` for a closing check.

Mobile-readability: the planner should keep revision commit messages tight and one-per-plan so the diff is reviewable on mobile.
