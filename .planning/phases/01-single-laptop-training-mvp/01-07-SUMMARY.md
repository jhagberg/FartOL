---
phase: 01-single-laptop-training-mvp
plan: 07
subsystem: projection
tags:
  [
    projection,
    reducer,
    dnf,
    mp,
    matching,
    half-day-clock,
    event-sourcing,
    idempotent,
    C-H2,
    REQ-EVT-004,
  ]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 02
    provides: 'EventPayload union (card_read carries top-level HalfDayClock start/finish/check/clear + NdjsonPunch[] punches); internal Drizzle row types in apps/edge/src/db/types.ts'
  - phase: 01-single-laptop-training-mvp
    plan: 04
    provides: 'competitors / classes / courses / course_controls / controls populated by REST CRUD — the reducer reads these as readonly inputs alongside the events log'
  - phase: 01-single-laptop-training-mvp
    plan: 06
    provides: 'buildCardReadPayload (the bridge writes the full CardReadEvent shape into events.payload — the reducer can read payload.start / payload.finish directly without punch-code guessing)'
provides:
  - 'apps/edge/src/projection/types.ts — CompetitionState + CompetitorView + ResultView + PunchStatus (latest_start + latest_finish kept on the view for plan 16 IOF export prereq)'
  - 'apps/edge/src/projection/matching.ts — matchCardToCompetitor(cardNumber, competitors) → Competitor | null (D-11)'
  - 'apps/edge/src/projection/halfDayClockMath.ts — halfDayClockToMs + diffMs with midnight-wrap math (C-H2 elapsed-time helper)'
  - 'apps/edge/src/projection/dnfMp.ts — detectStatus({start, finish, punches}, expectedControlCodes) → {status, missing_codes, extra_codes, out_of_order_codes, elapsed_time_ms} (C-H2: finish=null → DNF; punches[] used only for MP order-match)'
  - 'apps/edge/src/projection/reduce.ts — pure reducer: events + course + competitors → CompetitionState'
  - 'apps/edge/src/projection/index.ts — public barrel (plan 08 / 11 / 16 import surface)'
affects: [01-08, 01-09, 01-10, 01-11, 01-12, 01-14, 01-16]

# Tech tracking
tech-stack:
  added: [] # No new package deps — projection is pure TS over existing types
  patterns:
    - 'PATTERNS S-1: file-header preamble in every new .ts citing 01-07-PLAN.md + relevant codex finding (C-H2) + the source-of-truth line range in @fartola/sportident (ndjson.ts lines 84-98 for CardReadEvent shape)'
    - 'PATTERNS S-2: pure-function reducer accepts all inputs as parameters — no DB handle, no Fastify instance, no broadcast hook. Tests construct Event arrays inline; no in-memory SQLite required for projection tests.'
    - 'PATTERNS S-6: snake_case JSON boundary preserved through the reducer — CompetitionState + CompetitorView + ResultView fields are snake_case so plan 08 WS broadcast and plan 16 IOF export consume them directly without re-mapping.'
    - 'C-H2 (locked, dual-gate): payload.start / payload.finish read directly from CardReadEvent top-level fields. The revision-1 punch-code constants (START_CODES / FINISH_CODES / CHECK_CODES) are NOT present anywhere in the projection codebase — verified by grep returning zero matches across apps/edge/src/projection/. The only remaining mentions of those identifiers are in dnfMp.ts header comments explaining why they were removed.'
    - 'T-IDEMPOTENT-BREAK contract: reduce sorts events by (event_time_ms, local_seq) before walking; idempotent.test.ts asserts two runs over the same input + shuffled-order input both produce structurally identical state.'
    - 'Out-of-order detection: the plan-spec greedy algorithm could double-count a swapped code as both out-of-order AND missing. Fixed inline by tracking attributed codes in a Set so they do not re-surface as missing later in the walk — matches plan test 5 expected output for the [31,33,32,34] vs [31,32,33,34] transposition.'

key-files:
  created:
    - 'apps/edge/src/projection/types.ts (~80 lines — CompetitionState + CompetitorView + ResultView + PunchStatus)'
    - 'apps/edge/src/projection/matching.ts (~40 lines — matchCardToCompetitor pure linear scan)'
    - 'apps/edge/src/projection/matching.test.ts (3 node:tests)'
    - 'apps/edge/src/projection/halfDayClockMath.ts (~55 lines — halfDayClockToMs + diffMs)'
    - 'apps/edge/src/projection/halfDayClockMath.test.ts (8 node:tests)'
    - 'apps/edge/src/projection/dnfMp.ts (~130 lines — detectStatus with finish=null DNF gate + order-match MP detection)'
    - 'apps/edge/src/projection/dnfMp.test.ts (11 node:tests including test 2b — the explicit C-H2 regression gate)'
    - 'apps/edge/src/projection/reduce.ts (~245 lines — pure reducer over the event log)'
    - 'apps/edge/src/projection/reduce.test.ts (13 node:tests including tests 11/12/13 — the reducer-layer C-H2 regression gates)'
    - 'apps/edge/src/projection/idempotent.test.ts (3 node:tests — REQ-EVT-004)'
    - 'apps/edge/src/projection/index.ts — barrel export surface (plan 08 import path)'
  modified: [] # Plan 07 is entirely additive — no existing files touched

key-decisions:
  - 'Out-of-order single-attribution: when the plan-spec greedy walk identifies a code as out-of-order, track it in a Set so the same code does not get re-flagged as missing on the subsequent expected-index step. Matches plan test 5 expected output (single transposition surfaces as one out_of_order_codes entry, not two — once for the early-jumper plus once as "missing where it should have been").'
  - 'reduce.ts return type uses Map<string, CompetitorView> + Map<string, ResultView[]> rather than plain objects. O(1) competitor lookup matters for plan 16 IOF export which projects per-class and per-competitor without re-scanning the whole map.'
  - 'consent_confirmed event is treated as a no-op by reduce.ts. The consent_status column lives on the competitors table (mutated by plan 14 walk-up + plan 17 PII scrub); the projection only cares about punches + DNF. Documented inline in the switch default case.'
  - 'Course without classId (legacy from XML import path D-03 where a course can be imported before classes exist) → empty expected list → competitors with that class get OK based purely on punches presence + finish stamp. Documented inline in reduce.ts.'
  - 'halfDayClockMath.ts treats weekday as ignored under the Phase 1 < 12h-course assumption. Phase 2 (relay legs, rogaining) will need weekday-aware disambiguation; the helper header documents this so the regression is visible at the point of change.'

patterns-established:
  - 'Pure-reducer projection (RESEARCH §Pattern 5): the events table + a snapshot of competitors/classes/courses are the only inputs; the reducer is import-only. Plan 08 wires reduce() to the WS results broadcast loop; plan 16 IOF export reads the same CompetitionState. The reducer never opens a connection or hits IO.'
  - 'C-H2 dual-layer regression gates: helper-layer (dnfMp.test.ts test 2b — detectStatus with finish=null + full punches → DNF) + reducer-layer (reduce.test.ts test 11 — same scenario through reduce() → Anna.status="DNF"). Either path catches a future revert of the punch-code-guessing logic at CI time.'
  - 'Test event helpers: cardRead() / evt() / comp() / cls() / course() inline in reduce.test.ts + idempotent.test.ts. Mirrors the upstream BSiCard test-helper pattern (Phase 0) so a scenario is one line per event.'

requirements-completed:
  - REQ-EVT-003
  - REQ-EVT-004
  - REQ-EVT-CMP-005
  - REQ-EVT-CMP-006

# Metrics
duration: ~25min
completed: 2026-05-14
---

# Phase 1 Plan 07: Pure reducer + DNF/MP detection + matching Summary

**Pure reducer turning events table + (course + competitors) into CompetitionState. Reads payload.start + payload.finish directly per codex C-H2 — finish=null trumps a full punch set → DNF, elapsed computed via diffMs over the HalfDayClock pair, half-day clock math handles midnight + AM/PM wrap. Idempotent over shuffled inputs (REQ-EVT-004); 1000-event synthetic stream runs in ~10ms (20× the 200ms budget headroom).**

## Performance

- **Duration:** ~25 min (including pnpm install on the cold worktree, sportident build, one prettier auto-fix loop per task, one Rule-1 fix on the out-of-order algorithm)
- **Started:** 2026-05-14T~13:30Z
- **Completed:** 2026-05-14T~13:55Z
- **Tasks:** 2 / 2
- **Files created:** 11 (5 production + 5 test + 1 barrel)
- **Files modified:** 0 — plan 07 is entirely additive
- **Tests added:** 38 new node:tests (3 matching + 8 halfDayClockMath + 11 dnfMp + 13 reduce + 3 idempotent). apps/edge cumulative: 170 / 170 pass (baseline 132 → +38).
- **Reducer perf:** idempotent.test.ts test 3 (1000-event synthetic stream, 40 competitors × 25 reads each) runs in ~10ms. Plan budget was < 200ms; actual is 20× under budget.

## Accomplishments

- **Codex C-H2 closed at both layers.**
  - **Helper layer (dnfMp.test.ts test 2b):** `detectStatus({ start, finish: null, punches: [31, 32, 33, 34] }, [31, 32, 33, 34])` → `status: 'DNF', elapsed_time_ms: null`. The DNF gate fires from `finish === null` alone, regardless of how many control punches were present. This is the explicit regression gate against the revision-1 algorithm where the reducer would have reasoned "finish punch = code 2 OR 3 in punches[]" and emitted MP.
  - **Reducer layer (reduce.test.ts test 11):** `reduce()` over a card_read event with `payload.finish: null` AND four matching control punches produces `Anna.status === 'DNF'`. The reducer reads `payload.finish` — not `punches[]` for magic codes.
- **halfDayClockMath handles wrap-around end-to-end.** halfDayClockMath.test.ts test 6 (PM 23:50 → AM 00:10 next day) returns 20 min. dnfMp.test.ts test 9 (same wrap through detectStatus) returns the same 20 min. The `((f - s) % DAY_MS + DAY_MS) % DAY_MS` shape handles both half-day boundary AND midnight wrap in a single expression.
- **REQ-EVT-004 idempotency mechanically enforced.** idempotent.test.ts test 1 reduces a 5-event input twice and asserts structural equality via a stable-JSON serializer. Test 2 reduces the same events in shuffled order and asserts the same output as the sorted run. Test 3 builds a 1000-event synthetic stream (40 competitors × 25 reads each) and asserts the reduce completes in < 200ms (actual ~10ms).
- **Walk-up pending_unknown_cards path wired for plan 14.** reduce.test.ts test 3 reads an unknown card → `pending_unknown_cards: [9_999_999]`; after `card_bound` lands → `pending_unknown_cards: []`. Plan 14 walk-up modal reads `pending_unknown_cards` directly off CompetitionState.
- **Manual-DNF override + un-DNF revert verified.** reduce.test.ts tests 5 + 6 exercise the manual_dnf → status='DNF', un_dnf → re-projection-from-latest-card_read flow. The `manual_dnf_reason` gate on the view skips card_read overwrite while the override is in force.
- **Cross-competition isolation (T-CROSS-COMP-LEAK) verified.** reduce.test.ts test 7 has an event for comp-2 in the events array but reduces against comp-1; comp-2's competitor is filtered out of competitorsByCompetition AND the event is skipped via the `e.competitionId !== input.competition_id` short-circuit.
- **Wave 2 plan 08 unblocked.** The `import { reduce, type CompetitionState }` surface that plan 08 will wire to the WS results broadcast is live and tested. `reduce()` accepts an in-memory list of `Event` rows — plan 08 wraps it with the DB query + the broadcast loop.

## Task Commits

Each task committed atomically:

1. **Task 1: Types + matching + halfDayClockMath + dnfMp pure functions with exhaustive unit tests** — `4ad310f` (feat)
2. **Task 2: reduce.ts orchestration + idempotency suite + index.ts barrel** — `188ae68` (feat)

_Plan metadata commit lands with this SUMMARY._

## Files Created / Modified

### Created — apps/edge/src/projection/

- `types.ts` — CompetitionState + CompetitorView + ResultView + PunchStatus. `latest_start` + `latest_finish` kept on CompetitorView per C-H2 so plan 16 IOF export can render `<StartTime>` / `<FinishTime>` without re-walking the event log.
- `matching.ts` — `matchCardToCompetitor(cardNumber, competitors)` → `Competitor | null`. O(n) linear scan; Phase 1 has ≤ 40 competitors per competition.
- `matching.test.ts` — 3 node:tests (empty / match-mismatch / multi-class).
- `halfDayClockMath.ts` — `halfDayClockToMs(clock)` + `diffMs(start, finish)`. The diffMs `((f - s) % DAY_MS + DAY_MS) % DAY_MS` shape handles AM/PM half-day boundary AND midnight wrap.
- `halfDayClockMath.test.ts` — 8 node:tests covering simple AM/PM mapping, same-half-day delta, AM/PM boundary, midnight wrap, null pass-through, identity.
- `dnfMp.ts` — `detectStatus(input, expectedControlCodes)` → `{status, missing_codes, extra_codes, out_of_order_codes, elapsed_time_ms}`. Gate 1: `finish === null` → DNF. Gate 2: order-match expected vs actual control punches; OK if exact match, MP with diff arrays otherwise.
- `dnfMp.test.ts` — 11 node:tests (OK, DNF with incomplete punches, DNF with full punches+null finish — test 2b, MP missing-middle, MP extra, MP out-of-order, elapsed=null when no start, empty+finish=null DNF, empty+finish OK→MP-all-missing, elapsed across midnight, elapsed across AM/PM boundary).
- `reduce.ts` — pure reducer. Sorts events by `(event_time_ms, local_seq)`, filters by `competition_id`, walks the 9-arm EventPayload switch (card_read does the heavy lifting via detectStatus + matchCardToCompetitor; card_bound/manual_dnf/un_dnf mutate the projection; the rest are no-ops). Builds results_by_class via the `OK → MP → DNF → PEND` sort + place + behind_leader assignment.
- `reduce.test.ts` — 13 node:tests. Tests 11/12/13 are the explicit C-H2 reducer-level regression gates (finish=null → DNF; elapsed from HalfDayClock pair; card_read_history preserves clocks per read).
- `idempotent.test.ts` — 3 node:tests (REQ-EVT-004). Two runs structurally identical / shuffled order = sorted order / 1000-event in < 200ms.
- `index.ts` — barrel export. Plan 08 / 11 / 16 import surface: `{ reduce, detectStatus, matchCardToCompetitor, halfDayClockToMs, diffMs }` + the type exports.

### Modified

None — plan 07 is entirely additive over plans 02, 04, 06.

## Decisions Made

1. **Out-of-order single-attribution (Rule 1 deviation):** the plan-spec greedy walk algorithm — if literally implemented — produces `missing=[33]` AND `out_of_order=[33]` for the `[31,33,32,34]` vs `[31,32,33,34]` transposition because the algorithm doesn't track that code 33 already surfaced as out-of-order. Plan test 5 expects `missing=[]`, `out_of_order=[33]` — a single out-of-order entry for the early-jumper. Fix: track codes already attributed to `out_of_order` in a Set, then skip them in the `missing.push(expected[ei])` branch. Documented in dnfMp.ts inline + commit message.

2. **Map-backed CompetitionState** rather than plain object. Plan 16 (IOF export) will look up by competitor_id O(1) when projecting `<PersonResult>` entries; plain `{ [id]: view }` works too but Map preserves insertion-order which simplifies the per-class iteration in reduce.ts.

3. **consent_confirmed handled as a no-op.** Plan 02 schema added the `consent_confirmed` arm to EventPayload (C-M4 walk-up toast); the column lives on the competitors table and is mutated outside the reducer. The projection only reads competitors as input and only cares about punches + DNF.

4. **Course-without-classId path:** plan 04 schema allows `courses.class_id` to be NULL during XML import (D-03). The reducer's `courseByClass.get(competitor.classId)` returns `undefined` in that case → `expected = []` → status falls back to OK (any complete punch sequence is trivially "in order" against an empty expected list, and `elapsed = diffMs(start, finish)` still computes). This is the conservative reading: plan 11 wizard will require the operator to assign classes before readout opens.

5. **halfDayClockMath ignores weekday** under the documented Phase 1 < 12h assumption. The HalfDayClock type carries weekday but the math operates on the 24h ring only. Phase 2 (>12h relays / rogaining) will need the weekday field; the file header documents this so a future re-read surfaces the limitation immediately.

6. **Map → object serializer in idempotent.test.ts** for structural comparison. The default `JSON.stringify` does not serialize Map entries (returns `{}`). The test's `serialize()` helper walks both Maps and emits `Object.fromEntries(...sort by key)` so the comparison is canonical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Out-of-order detection algorithm double-counted swapped codes**

- **Found during:** Task 1 dnfMp.test.ts test 5 (out-of-order: `[31, 33, 32, 34]` vs `[31, 32, 33, 34]`)
- **Issue:** The plan-spec greedy walk algorithm marks `33` as out-of-order when `ai=1` (jumped ahead of `32`), but later when `ei=2 expected[2]=33, ai=3 actual[3]=34` it doesn't recognize that 33 was already accounted for, so it pushes 33 into `missing`. Test 5 expects `missing=[]`, `out_of_order=[33]` — single attribution per swapped pair. The plan-spec algorithm produces `missing=[33], out_of_order=[33]`.
- **Fix:** Track codes already attributed to `out_of_order` in a `Set<number>`. In the `missing.push(expected[ei])` branch, skip codes already in the set. Algorithm header comment documents the single-transposition shape so a future reader sees the explicit intent.
- **Files modified:** `apps/edge/src/projection/dnfMp.ts`
- **Verification:** All 11 dnfMp.test.ts cases pass including test 5. The Set is also defensive against future course-controls-with-duplicates scenarios (Phase 2 relay legs) — it caps each code at one attribution.
- **Committed in:** `4ad310f` (Task 1 commit)

**2. [Rule 3 — Blocking] Prettier auto-format on commit attempts**

- **Found during:** Both Task 1 and Task 2 commit attempts.
- **Issue:** Lefthook's prettier hook flagged 3 files in Task 1 (dnfMp.test.ts, halfDayClockMath.ts, matching.test.ts) and 1 in Task 2 (reduce.test.ts). Differences were line-wrapping + nested-parens spacing; no semantic changes.
- **Fix:** Ran `pnpm exec prettier --write <files>` on each flagged set before re-staging.
- **Files modified:** as listed above.
- **Verification:** Both commits then passed lefthook on retry.
- **Committed in:** `4ad310f` (Task 1) + `188ae68` (Task 2).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking). No Rule 2 (missing critical), no Rule 4 (architectural) deviations.
**Impact on plan:** The out-of-order fix is essential for plan test 5's stated expected output AND for clean MP diagnostics — without it, an operator-facing message would say "missing 33 AND 33 was out of order" for a single transposition, which is confusing. No scope creep.

## Issues Encountered

- **Cold worktree required pnpm install + sportident build before typecheck would resolve `@fartola/sportident`.** Same friction every plan has seen since plan 01 — documented in plans 01, 02, 06 summaries. A Phase 2 follow-up (source-fallback export in `packages/sportident/package.json`) would remove the interleaved-build need.
- **Plan-spec algorithm for out-of-order detection had the bug described in Deviation #1.** This is a pre-existing plan-spec issue (codex's C-H2 review didn't catch it; the test scenarios themselves contradicted the algorithm). Fixing inline was Rule 1; the plan can be amended retroactively if desired but the fix is documented here and in the commit.

## User Setup Required

None. The reducer is pure TypeScript — no env vars, no external services, no DB pre-create. All tests run cold via `pnpm --filter @fartola/edge test`.

## Next Phase Readiness

- **Plan 08 (WS results channel + projection store)** ready: `import { reduce, type CompetitionState } from '../projection/index.ts'` is the canonical surface. The plan-08 store wraps `reduce()` with a DB-query for events + competitors + classes + courses, broadcasts the resulting state via `wsBroadcast(resultsChannel(competitionId), ...)`, and snapshots+memoizes on incremental events.
- **Plan 09 / 10 (REST GETs for results / readout view live behavior)** ready: the same CompetitionState shape feeds both REST `/api/competitions/:id/results` and the WS `results:<id>` channel. Snake_case fields ready for the wire.
- **Plan 11 (full UI + AppShell)** ready: `apps/web` consumes the projection types via plan 08's `@fartola/shared-types` re-export.
- **Plan 14 (walk-up modal)** ready: `pending_unknown_cards` drives the modal trigger; `card_bound` events dismiss it. Verified by reduce.test.ts test 3.
- **Plan 16 (IOF XML 3.0 export)** ready: CompetitorView's `latest_start` + `latest_finish` + `elapsed_time_ms` + `card_read_history` give the IOF `<PersonResult>` projection everything it needs without re-walking the event log. Verified by reduce.test.ts test 13.

## Confirmation: plan-07 OUTPUT items

Per the plan's `<output>` section, the items it asked the executor to record:

1. **idempotent.test.ts test 3 actual runtime for 1000 events:** ~10ms (plan budget: < 200ms). 40 competitors × 25 reads each, all OK + finish stamped. Plan 08 has 20× headroom for the per-event projection rebuild it will wrap on top.

2. **Any reduce.ts refactor (executor may have collapsed maps):** No collapse. Two Maps (`competitorViews` for O(1) lookup during the walk, `resultsByClass` for the post-walk per-class sort+place pass) are the cleanest shape and match the plan-spec literal types in the plan's `<interfaces>` block. The reducer body stays at 245 lines.

3. **Confirmation that the punch-code constants (START_CODES / FINISH_CODES / CHECK_CODES) from revision 1 are NOT present anywhere in the codebase:** Verified. `grep -rE 'START_CODES|FINISH_CODES|CHECK_CODES' apps/edge/src/projection/` returns 2 matches — both in `dnfMp.ts` HEADER COMMENT lines documenting the REMOVAL (lines 7 + 14 — "punches[] for FINISH_CODES = {2, 3, 240}; those codes …" + "The START_CODES / FINISH_CODES / CHECK_CODES filter constants from revision 1 are REMOVED"). No code-path reference; no constant declaration; the C-H2 mechanical removal is clean.

4. **Confirmation that the SI10 Jonas fixture replayed through plan 06's bridge produces a card_read payload with the C-H2 fields populated, and reduce.ts handles it without referencing punch codes for start/finish:** Plan 06 already verified the bridge produces the C-H2 fields end-to-end (plan 06 SUMMARY accomplishments + bridge.test.ts test 1b: `payload.finish !== null`, `payload.start !== null`). Plan 07 closes the chain at the reducer: reduce.test.ts test 12 asserts `Anna.elapsed_time_ms = 15 * 60 * 1000` from a card_read with `payload.start = hd(10:00)` and `payload.finish = hd(10:15)` — `diffMs(start, finish)` produces 900s correctly. The reducer never inspects punches[] codes for start/finish; the only inspection of punches[] is in dnfMp's order-match loop for MP detection.

## Self-Check: PASSED

**Files verified present on disk:**

- `apps/edge/src/projection/types.ts`: FOUND
- `apps/edge/src/projection/matching.ts`: FOUND
- `apps/edge/src/projection/matching.test.ts`: FOUND
- `apps/edge/src/projection/halfDayClockMath.ts`: FOUND
- `apps/edge/src/projection/halfDayClockMath.test.ts`: FOUND
- `apps/edge/src/projection/dnfMp.ts`: FOUND
- `apps/edge/src/projection/dnfMp.test.ts`: FOUND
- `apps/edge/src/projection/reduce.ts`: FOUND
- `apps/edge/src/projection/reduce.test.ts`: FOUND
- `apps/edge/src/projection/idempotent.test.ts`: FOUND
- `apps/edge/src/projection/index.ts`: FOUND

**Commits verified in git log:**

- `4ad310f` (Task 1: types + matching + halfDayClockMath + dnfMp + tests): FOUND
- `188ae68` (Task 2: reduce + idempotent + barrel + tests): FOUND

**Behavior verified live:**

- `pnpm --filter @fartola/edge typecheck`: clean.
- `pnpm --filter @fartola/edge lint`: clean (ESLint: No issues found).
- `pnpm --filter @fartola/edge test`: 170 / 170 pass (was 132 baseline → +38 new tests for plan 07).
- `grep -rE "from 'drizzle-orm'|from 'better-sqlite3'|from 'fastify'|from 'node:fs'|from 'node:http'" apps/edge/src/projection/`: zero matches — the reducer is import-only, no IO.
- `grep -rE 'START_CODES|FINISH_CODES|CHECK_CODES' apps/edge/src/projection/`: only 2 matches, both in dnfMp.ts HEADER COMMENT documenting the removal (no code-path reference).
- 1000-event reduce runtime: ~10ms (idempotent.test.ts test 3 timing).

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
