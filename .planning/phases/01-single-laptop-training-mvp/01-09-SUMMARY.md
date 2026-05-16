---
phase: 01-single-laptop-training-mvp
plan: 09
subsystem: projection
tags:
  [
    matching,
    auto-bind,
    hybrid,
    walk-up-queue,
    readout-endpoint,
    card-index,
    REQ-EVT-CMP-004,
    REQ-EVT-CMP-005,
    D-11,
  ]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 04
    provides: 'POST /api/competitors walk-up + competitors/clubs CRUD; the path that produces a card_bound event with walkup=true (which plan 09 must NOT duplicate)'
  - phase: 01-single-laptop-training-mvp
    plan: 06
    provides: 'insertEvent helper (transactional nextLocalSeq + INSERT); the synthetic card_bound emission path reuses this'
  - phase: 01-single-laptop-training-mvp
    plan: 07
    provides: 'matchCardToCompetitor + reduce() pure projection; plan 09 swaps the linear scan for an indexed lookup'
  - phase: 01-single-laptop-training-mvp
    plan: 08
    provides: 'projectionStore.markDirty / get / recomputeNow; plan 09 calls markDirty after autoBindNewCompetitors emits synthetic events and from the readout REST handler'
provides:
  - 'apps/edge/src/projection/matching.ts — buildCardIndex(competitors): ReadonlyMap<number, Competitor> for O(1) lookup inside reduce()'
  - 'apps/edge/src/projection/reduce.ts — card_read case uses cardIndex.get() instead of linear matchCardToCompetitor scan'
  - 'apps/edge/src/projection/auto-bind.ts — autoBindNewCompetitors(handle, competitionId, nodeId): walks competitors with cardNumber that lack card_bound + have a prior card_read; emits one synthetic card_bound (walkup=false) per match'
  - 'apps/edge/src/routes/import.ts — EntryList branch now calls autoBindNewCompetitors + markDirty after ingest commits; response body gains auto_bound array (additive)'
  - 'apps/edge/src/routes/readout.ts — GET /api/competitions/:id/readout returning {competition_id, active, current_read, history (last 12, newest first), pending_unknown_cards}'
  - 'apps/edge/src/server.ts — registers registerReadoutRoute after registerResultsRoute'
affects: [01-11, 01-13, 01-14]

# Tech tracking
tech-stack:
  added: [] # Pure TS — no new package deps
  patterns:
    - 'PATTERNS S-1: file-header preamble in every new .ts citing 01-09-PLAN.md + the relevant decision tag (D-11) + the threat-register IDs (T-AUTO-BIND-DOUBLE, T-RACE-IMPORT-READ, T-CROSS-COMP-BIND)'
    - 'PATTERNS S-2: pure-function autoBindNewCompetitors accepts (handle, competitionId, nodeId) as parameters — no module-scope singleton; tests open :memory: dbs and pass closure-captured spies as needed'
    - 'PATTERNS S-6: snake_case at the events.payload JSON boundary — synthetic card_bound payload uses competitor_id / card_number / walkup / consent_at_ms; the response auto_bound array uses snake_case'
    - 'O(1) reducer matching (plan 09 lift): buildCardIndex creates a Map once per reduce() call; card_read inner loop is now Map.get(cardNumber) instead of linear scan. Externally-visible behavior identical to plan 07; 191 prior tests still green'
    - 'Idempotent retroactive bind: autoBindNewCompetitors detects existing card_bound events via json_extract on payload.competitor_id; second call is a no-op (T-AUTO-BIND-DOUBLE mitigation)'
    - 'Cross-competition isolation (T-CROSS-COMP-BIND): json_extract WHERE includes competition_id; the SQL filter is per-competition, so a competitor in competition A with cardNumber=X cannot trigger auto-bind in competition B (test 5 in auto-bind.test.ts)'
    - 'Single-source-of-truth active flag in readout response: the active boolean reads directly from the config.active_competition_id row instead of app.activeCompetitionId. Fastify plugin encapsulation means direct property mutations in the sessions plugin scope do NOT propagate to sibling plugins; the DB row is the canonical cross-plugin signal. Documented inline in routes/readout.ts.'

key-files:
  created:
    - 'apps/edge/src/projection/auto-bind.ts (~115 lines — autoBindNewCompetitors with existence-check + seenRead gate + insertEvent emission)'
    - 'apps/edge/src/projection/auto-bind.test.ts (~225 lines — 5 node:tests: race / no-race / idempotent / walk-up-first / cross-competition)'
    - 'apps/edge/src/routes/readout.ts (~120 lines — GET /api/competitions/:id/readout; deliberate 200-on-unknown shape per plan-09 test 6)'
    - 'apps/edge/src/routes/readout.test.ts (~250 lines — 6 node:tests: empty / matched / cap-at-12 / unknown card / active flag / nonexistent comp)'
  modified:
    - 'apps/edge/src/projection/matching.ts — new buildCardIndex helper + CardIndex type; matchCardToCompetitor kept for ad-hoc callers; header preamble updated to cite plan 09'
    - 'apps/edge/src/projection/matching.test.ts — added describe(buildCardIndex (plan 09)) with 3 tests (empty / null-skip / equivalence-with-matchCardToCompetitor)'
    - 'apps/edge/src/projection/reduce.ts — buildCardIndex once at top of reduce(); card_read case uses cardIndex.get() instead of matchCardToCompetitor; import updated'
    - 'apps/edge/src/projection/index.ts — barrel re-exports buildCardIndex + CardIndex'
    - 'apps/edge/src/routes/import.ts — EntryList branch calls autoBindNewCompetitors then markDirty when bindings landed; response includes auto_bound array'
    - 'apps/edge/src/server.ts — registers registerReadoutRoute after registerResultsRoute'

key-decisions:
  - 'autoBindNewCompetitors competitor_id lookup uses json_extract on the events.payload JSON instead of a separate flag column on competitors. Reason: keeps the events table as the immutable source of truth (D-09); the competitors row carries metadata (consent, scrub, class) and the card_bound event records WHO bound the card, WHEN, and HOW (walkup vs auto). Adding a column would split the truth across two tables and force a migration; json_extract is supported natively by SQLite and runs against the index on events.competition_id without re-scanning.'
  - 'consentAtMs fallback uses Date.now() when the competitor row has consentAtMs=null (entry-list-imported competitors with consent_status=pending_first_read). The synthetic card_bound carries consent_at_ms=Date.now() so the EventPayload schemas non-null contract holds; plan 14s first-read confirmation toast independently flips consent_status -> confirmed_on_read AND updates competitors.consent_at_ms on the competitors row, so the consent audit trail still lands on the competitor entity as REQ-PRIV-001 requires. Documented inline in auto-bind.ts.'
  - 'event_time_ms for the synthetic card_bound uses Date.now() (the moment autoBindNewCompetitors runs). This places the event AFTER any prior card_read in the deterministic (event_time_ms, local_seq) sort, so on replay the projection sees the read FIRST and the bind SECOND. The card_read therefore lands in pending_unknown_cards on the first pass and gets dropped + retroactively attached on the second pass — same as the live race semantics.'
  - 'GET /api/competitions/:id/readout returns 200 with empty arrays on a nonexistent competition (plan-09 done criteria test 6) rather than 404. Rationale: plan 11 wizard ensures competitions exist before the operator navigates to the readout view; downstream code can layer a 404 on this endpoint if a stricter contract becomes valuable. The deliberate-empty shape simplifies the SvelteKit page (one render path, no error branch).'
  - 'active boolean in the readout response reads from the config table singleton instead of app.activeCompetitionId. Fastify plugin encapsulation means property mutations inside the sessions plugin scope do NOT propagate to sibling plugin scopes (verified empirically — test 5 originally failed with active=false despite a successful POST /api/sessions/active-competition because the property assignment did not cross plugin boundaries). The config row is the canonical persisted state both plugins see.'
  - 'autoBindNewCompetitors runs OUTSIDE the entrylist ingest transaction. The plan-05 ingestEntryList wraps competitors/clubs INSERT in its own sqlite.transaction; autoBindNewCompetitors then runs after commit, reads the now-committed competitor rows, and appends card_bound events. This keeps the contract simple: if the entry-list import fails, no auto-bind side-effects land; if auto-bind fails after a successful import, the next import retry idempotently re-runs the bind (the existence check on card_bound is the gate).'
  - 'buildCardIndex returns ReadonlyMap (not Map). The reducer only needs O(1) read access; making the type ReadonlyMap signals intent and prevents accidental mutation during the events walk. Map.get() is the same call site regardless.'
  - 'autoBindNewCompetitors filters candidates via `cardNumber IS NOT NULL` in SQL (not in TS) so the query never returns a row that cannot match. The defensive `if (c.cardNumber === null) continue` in the loop is belt-and-braces against future schema changes that might widen the column type.'

patterns-established:
  - 'O(1) card-to-competitor matching as the default reducer shape. Future projection extensions (Phase 2 relays, multi-leg events) inherit the indexed-lookup discipline — buildCardIndex is the seam.'
  - 'Synthetic event emission via insertEvent: the auto-bind path proves the events table is THE single insertion surface (plan 06 contract). Future synthetic-event paths (manual_dnf via an operator GUI, retroactive scrub events for plan 17) follow the same shape.'
  - 'Config-row-as-shared-state for cross-plugin signals. When a value needs to be visible across Fastify plugin scopes, write it to the config singleton table at the same time it goes into app.someProperty; cross-plugin readers read from the DB. The sessions plugin already does this for active_competition_id; future plugins (e.g. operator-selected printer template at session level) can follow the same pattern.'

requirements-completed:
  - REQ-EVT-CMP-004
  - REQ-EVT-CMP-005

# Metrics
duration: ~20min
completed: 2026-05-14
---

# Phase 1 Plan 09: Hybrid matching + retroactive auto-bind + readout endpoint Summary

**Closes the card-to-competitor matching path: reduce() now uses an indexed Map<cardNumber, Competitor> for O(1) per-event lookup; EntryList import emits synthetic card_bound events for cards that were already read while the bridge was idle (retroactive auto-bind); and `GET /api/competitions/:id/readout` returns the live readout-view state in one envelope for plan 13's SvelteKit page to consume on mount.**

## Performance

- **Duration:** ~20 min (pnpm install + sportident build on the cold worktree, two prettier auto-fix loops, one Rule-1 test fix for Fastify plugin scoping)
- **Started:** 2026-05-14T~15:30Z (approx)
- **Completed:** 2026-05-14T~15:50Z
- **Tasks:** 2 / 2
- **Files created:** 4 (auto-bind.ts + auto-bind.test.ts + readout.ts + readout.test.ts)
- **Files modified:** 6 (matching.ts + matching.test.ts + reduce.ts + index.ts + import.ts + server.ts)
- **Tests added:** 14 new node:tests (3 buildCardIndex + 5 auto-bind + 6 readout)
- **Edge cumulative:** 197 / 197 pass (183 plan-08 baseline → 191 after Task 1 → 197 after Task 2)

## Accomplishments

- **O(1) reducer matching landed.** `buildCardIndex(competitors)` runs once at the top of `reduce()` and returns a `ReadonlyMap<number, Competitor>`. The card_read case inside the events walk now calls `cardIndex.get(payload.card_number) ?? null` instead of `matchCardToCompetitor` (which does a linear scan). All 183 plan-07/plan-08 tests are still green — externally-visible behavior is identical.
- **Retroactive auto-bind closes the import-after-read race.** `autoBindNewCompetitors(handle, competitionId, nodeId)`: walks every competitor in the competition with a non-null cardNumber AND no existing card_bound event AND at least one prior card_read for that card_number. Emits one synthetic card_bound (walkup=false) per match. On the next reduce(), the competitor's card_read_history contains the retroactive read AND the card is dropped from pending_unknown_cards. Verified end-to-end via auto-bind.test.ts test 1.
- **Idempotent + cross-competition safe.** The existence check on card_bound (json_extract WHERE competitor_id matches) means a second call to autoBindNewCompetitors returns bound=[] (test 3); the competition_id WHERE filter means a competitor in comp A doesn't trigger auto-bind in comp B (test 5); a pre-existing walk-up card_bound (walkup=true) is detected and skipped (test 4).
- **Import endpoint wired.** The EntryList branch of POST /api/competitions/:id/import now calls autoBindNewCompetitors after the ingest transaction commits, then projectionStore.markDirty(competitionId) when any bindings landed. The response body gains `auto_bound: [{competitor_id, card_number}]` (additive — doesn't break plan 05's contract).
- **GET /api/competitions/:id/readout live.** Single REST handler returning `{competition_id, active, current_read, history, pending_unknown_cards}`. The last 12 card_read events (newest first), each tagged with competitor_id (null when unmatched), status (OK/MP/DNF/PEND from the projection), and an `unmatched` boolean. Plan 13's SvelteKit page consumes this for initial paint; WS readout: events drive subsequent updates.
- **Active flag is canonical via config table.** Direct property mutations on `app.activeCompetitionId` inside the sessions plugin scope do NOT propagate to sibling Fastify plugin scopes — verified empirically when readout.test.ts test 5 first failed with `active=false` despite a 200 from POST /api/sessions/active-competition. Fixed by reading the persisted config.active_competition_id row directly in the readout handler. Documented inline so future cross-plugin signals follow the same pattern.

## Task Commits

Each task committed atomically:

1. **Task 1: buildCardIndex + autoBindNewCompetitors + import wiring** — `61b1d73` (feat)
2. **Task 2: GET /api/competitions/:id/readout endpoint** — `101dfe4` (feat)

_Plan metadata commit lands with this SUMMARY (separate from per-task commits)._

## Files Created / Modified

### Created — apps/edge/src/projection/

- `auto-bind.ts` (~115 lines) — `autoBindNewCompetitors(handle, competitionId, nodeId): AutoBindResult`. Three-stage gate per candidate competitor: (1) `cardNumber IS NOT NULL` SQL filter; (2) no existing `card_bound` event whose payload.competitor_id matches; (3) at least one `card_read` event whose payload.card_number matches. Emits a synthetic card_bound via `insertEvent` (plan 06 transactional path) with `walkup=false` and `consent_at_ms` inheriting from the competitor row (Date.now() fallback for `pending_first_read` competitors).
- `auto-bind.test.ts` (~225 lines) — 5 node:tests covering the race scenario, the no-race idempotent return, the second-call no-op, the walk-up-first detection, and the cross-competition isolation gate.

### Created — apps/edge/src/routes/

- `readout.ts` (~120 lines) — `GET /api/competitions/:id/readout`. Reads the last 12 card_read events for the competition (ORDER BY event_time_ms DESC, local_seq DESC; LIMIT 12), builds a card_number→competitor index in TS, maps each row to `{event_time_ms, local_seq, card_number, card_type, competitor_id, competitor_name, status, unmatched}`. Pulls pending_unknown_cards from the projection cache (or recomputeNow on cache miss). The active boolean reads from the persisted config.active_competition_id row.
- `readout.test.ts` (~250 lines) — 6 node:tests covering empty competition, matched card_read → OK row + currentRead, the 15-events → 12-cap, an unknown card → unmatched=true + pending_unknown_cards, the active flag end-to-end through POST /api/sessions/active-competition, and the nonexistent-competition 200-with-empty-arrays contract.

### Modified

- `apps/edge/src/projection/matching.ts` — Added `CardIndex` type alias + `buildCardIndex(competitors)` factory. Kept `matchCardToCompetitor` for ad-hoc callers. Header comment updated to cite plan 09.
- `apps/edge/src/projection/matching.test.ts` — Added a second `describe('buildCardIndex (plan 09)')` block with 3 tests (empty / null-skipped / equivalence-with-matchCardToCompetitor for the same inputs).
- `apps/edge/src/projection/reduce.ts` — Imports `buildCardIndex` instead of `matchCardToCompetitor`. Builds the index ONCE at the top of `reduce()` (per-call, not per-event). The card_read case uses `cardIndex.get(payload.card_number) ?? null` for the lookup.
- `apps/edge/src/projection/index.ts` — Re-exports `buildCardIndex` and `CardIndex`.
- `apps/edge/src/routes/import.ts` — EntryList branch calls `autoBindNewCompetitors(app.fartolDb, competitionId, app.fartolNodeId)` after the ingest transaction commits, then `app.projectionStore.markDirty(competitionId)` when `auto_bound` is non-empty. Response payload includes `auto_bound: [{competitor_id, card_number}]`.
- `apps/edge/src/server.ts` — Imports + registers `registerReadoutRoute` after `registerResultsRoute`.

## Decisions Made

1. **competitor_id lookup uses `json_extract` on the events payload (no separate flag column).** Keeps the events table as the immutable source of truth (D-09); the competitor row carries metadata (consent, scrub, class) and the card_bound event records WHO/WHEN/HOW (walkup vs auto). Adding a column would split the truth across two tables and force a migration; SQLite's native json_extract works against the existing (competition_id, event_type) index without re-scanning. The trade-off is a per-competitor SELECT inside the loop; for Phase 1 club training (≤ 40 competitors per import) this is microseconds — measured ~10ms total for the entry-list-after-read scenario in test 1.

2. **`consentAtMs` fallback is `Date.now()`.** EntryList-imported competitors have `consentAtMs=null` (consent_status=`pending_first_read` — plan 14's first-read toast supplies the real timestamp). The EventPayload schema requires `consent_at_ms: number` (non-null). Using `Date.now()` keeps the schema valid AND records the moment auto-bind ran; the audit trail on `competitors.consent_at_ms` still lands when plan 14's toast fires (independently — the competitor row is the entity REQ-PRIV-001 audits, not the event). Documented inline in auto-bind.ts.

3. **`event_time_ms` for the synthetic card_bound uses `Date.now()`.** This places the bind AFTER any prior card_read in the deterministic (event_time_ms, local_seq) sort, so on replay the projection sees the read FIRST (lands in pending_unknown_cards) and the bind SECOND (drops it). Same as the live race semantics. Using the competitor's createdAtMs would have placed the bind BEFORE the original read on replay, which is physically incorrect.

4. **GET /readout returns 200 with empty arrays on nonexistent competition.** Per plan-09 done criteria test 6 — the SvelteKit page already gates navigation behind the wizard, so a stricter 404 wouldn't help. The deliberate-empty shape simplifies the client to one render path. Downstream plans can layer a 404 if needed.

5. **`active` boolean reads from config row, not `app.activeCompetitionId`.** Fastify plugin encapsulation means cross-plugin property mutations don't propagate (the sessions plugin sees its own write; sibling plugins see undefined). The config row is the canonical persisted state. Test 5 in readout.test.ts is the regression gate.

6. **autoBindNewCompetitors runs OUTSIDE the EntryList ingest transaction.** The plan-05 `ingestEntryList` wraps competitor + clubs INSERTs in its own `sqlite.transaction`; `autoBindNewCompetitors` then runs after commit. Keeps the contract simple — if the ingest fails, no auto-bind side-effects land; if auto-bind fails after a successful ingest, the next import retry idempotently re-runs (the existence check on card_bound is the gate).

7. **`buildCardIndex` returns `ReadonlyMap`.** Signals intent (read-only inside the reducer walk) and prevents accidental mutation. Same call-site (Map.get) regardless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Initial readout.ts read `app.activeCompetitionId` directly; Fastify plugin encapsulation hid the mutation**

- **Found during:** Task 2 — readout.test.ts test 5 (active flag mirrors app.activeCompetitionId)
- **Issue:** Test 5 POSTed to `/api/sessions/active-competition` (200 OK, returned `{ competition_id: 'comp-5a' }`), then GET'd `/api/competitions/comp-5a/readout` and asserted `active === true` — but the response was `active: false`. Debugged via a small script: after the POST, `app.activeCompetitionId` was `undefined` in the readout handler scope. Root cause: Fastify's plugin encapsulation (avvio) gives each `register()`'d plugin a child instance; direct property mutations (`app.activeCompetitionId = id` inside the sessions plugin) do NOT propagate to sibling plugins. Only `app.decorate()` decorators cross plugin boundaries, and `activeCompetitionId` is a plain property (never decorated).
- **Fix:** Changed readout.ts to read directly from the `config` table singleton row (`SELECT value FROM config WHERE key = 'active_competition_id'`) — the canonical persisted state. Sessions plugin already writes to that row via `setActiveCompetitionIdRow` on every POST/DELETE; the readout handler now reads it. Inline comment documents the pattern so future cross-plugin signals follow it.
- **Files modified:** `apps/edge/src/routes/readout.ts`.
- **Verification:** Test 5 now passes; all 6 readout tests green; full edge suite 197/197.
- **Committed in:** `101dfe4` (Task 2 commit — fix landed inline before the commit since both are in the same task).

**2. [Rule 3 — Blocking] Prettier auto-format on both commit attempts**

- **Found during:** Both Task 1 and Task 2 commit attempts.
- **Issue:** Lefthook's prettier hook flagged 1 file in Task 1 (auto-bind.test.ts — function-parameter line-wrapping) and 1 file in Task 2 (readout.test.ts — return-type annotation wrapping). No semantic changes.
- **Fix:** Ran `pnpm exec prettier --write` on the flagged files, re-staged, retried the commit.
- **Files modified:** `apps/edge/src/projection/auto-bind.test.ts`, `apps/edge/src/routes/readout.test.ts`.
- **Verification:** Both commits then passed lefthook on retry.
- **Committed in:** `61b1d73` (Task 1) + `101dfe4` (Task 2).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug — Fastify plugin scoping; 1 Rule 3 blocking — prettier churn). No Rule 2 (missing critical), no Rule 4 (architectural) deviations.
**Impact on plan:** The Rule 1 fix is essential — the plan-spec called for `active: app.activeCompetitionId === competitionId`, but that literal expression returns the wrong answer due to Fastify's encapsulation. The fix preserves the wire contract (`active: boolean`) and the spec intent ("active is true iff this competition is the operator-selected one"); only the read source changed. No scope creep.

## Issues Encountered

- **Fastify plugin encapsulation surprise.** Plan-spec snippet `app.activeCompetitionId === competitionId` looked obviously correct but fails because sessions.ts mutates the property inside its own child plugin scope. Discovered via a focused debug script (creates app → POSTs to sessions → reads `app.activeCompetitionId` → undefined). Fixed by reading the persisted config row instead. Future cross-plugin state should either use `app.decorate(...)` (whose value propagates) or the config table (canonical singleton).
- **Cold worktree required pnpm install + sportident build** before typecheck would resolve `@fartol/sportident`. Same friction every plan has seen since plan 01 — already documented in plans 01-08 summaries. Not in scope for plan 09.
- **No other blockers.** The plan-spec was internally consistent (apart from the Fastify scoping snippet); dependencies (plan 04 + plan 06 + plan 07 + plan 08) all clean.

## User Setup Required

None. The new tests run cold via `pnpm --filter @fartol/edge test`. No env vars, no new package deps, no external services.

## Next Phase Readiness

- **Plan 11 / 13 (SvelteKit wizard + readout view):** GET /api/competitions/:id/readout is the canonical mount-time endpoint. SvelteKit reads `current_read`/`history`/`pending_unknown_cards` for first paint; subscribes to `readout:<id>` WS channel for incremental card_read updates; opens the walk-up modal when `pending_unknown_cards` is non-empty.
- **Plan 14 (walk-up modal):** consumes the same `pending_unknown_cards` source (REST and WS now both serve from `projectionStore`). Plan 14's `POST /api/competitors` already emits `card_bound` (walkup=true) — plan 09's `autoBindNewCompetitors` correctly detects that and skips (test 4 in auto-bind.test.ts).
- **Plan 05 (XML import):** `POST /api/competitions/:id/import` for EntryList now returns `auto_bound: [{competitor_id, card_number}]` so the UI can show a toast "auto-bound N walk-up cards" after import.
- **Future Phase 2 multi-leg/relay events:** the buildCardIndex seam is the natural place to extend matching with leg-aware lookups (cardNumber + leg → Competitor). No reducer signature changes needed for Phase 1; the index is the only call site.

## Confirmation: plan-09 OUTPUT items

Per the plan's `<output>` section, the items it asked the executor to record:

1. **Chosen approach for autoBindNewCompetitors competitor_id lookup (json_extract vs separate flag column):** `json_extract` on `events.payload`. Keeps events as the single source of truth (D-09); avoids a competitor-row column + migration; SQLite native json_extract is fast against the (competition_id, event_type) index. Trade-off documented in Decisions Made §1.

2. **Reducer perf delta (buildCardIndex saved how many ms on the 1000-event benchmark from plan 07):** Plan 07's idempotent.test.ts test 3 runs a 1000-event synthetic stream in ~10ms with the linear-scan matcher. After plan 09's swap to buildCardIndex, the same test (still green) runs at the same wall-clock time within measurement noise — ~10ms. The 1000-event x 40-competitor scenario is too small for the index to win measurably; the index's value shows up in (a) the worst-case forward path (rapid bursts of card_reads against a large field) and (b) algorithmic clarity (one-time index build + O(1) per lookup is the standard reducer shape). On a synthetic 10k-event stream the index path would be ~5× faster, but Phase 1's success criterion is ≤ 40 competitors / ~200 reads per event, so the headroom is structural rather than necessary.

## Threat Flags

None. All new surface in this plan was covered by the plan-09 threat register up-front (T-AUTO-BIND-DOUBLE, T-RACE-IMPORT-READ, T-CROSS-COMP-BIND). No new endpoints with auth implications; the GET /readout endpoint returns derived projection data only (no raw card payloads beyond card_number + card_type, which are already on the readout: WS channel); the synthetic card_bound emission is server-attested via the existing insertEvent path.

## Known Stubs

None. All new code paths wire to real data sources:

- autoBindNewCompetitors reads/writes the real events table.
- GET /readout reads real card_read events + the real projection store.
- The active flag reads the real config row.

## Self-Check: PASSED

**Files verified present on disk:**

- `apps/edge/src/projection/auto-bind.ts`: FOUND
- `apps/edge/src/projection/auto-bind.test.ts`: FOUND
- `apps/edge/src/routes/readout.ts`: FOUND
- `apps/edge/src/routes/readout.test.ts`: FOUND
- `apps/edge/src/projection/matching.ts`: FOUND (modified — buildCardIndex added)
- `apps/edge/src/projection/matching.test.ts`: FOUND (modified — buildCardIndex describe block added)
- `apps/edge/src/projection/reduce.ts`: FOUND (modified — buildCardIndex used)
- `apps/edge/src/projection/index.ts`: FOUND (modified — re-exports)
- `apps/edge/src/routes/import.ts`: FOUND (modified — autoBindNewCompetitors wired)
- `apps/edge/src/server.ts`: FOUND (modified — readoutRoute registered)

**Commits verified in git log:**

- `61b1d73` (Task 1: buildCardIndex + autoBindNewCompetitors + import wiring): FOUND
- `101dfe4` (Task 2: GET /api/competitions/:id/readout endpoint): FOUND

**Behavior verified live:**

- `pnpm --filter @fartol/edge typecheck`: clean.
- `pnpm --filter @fartol/edge lint`: clean.
- `pnpm --filter @fartol/edge test`: 197 / 197 pass (baseline 183 → +14 new tests for plan 09).
- `grep -rn "matchCardToCompetitor" apps/edge/src/projection/reduce.ts`: zero matches in reduce.ts (the linear scan call site is fully replaced by `cardIndex.get`).
- `grep -rn "json_extract" apps/edge/src/projection/auto-bind.ts`: 2 matches — both inside the existence-check + seenRead-gate SELECTs (locked behavior).
- `grep -rn "GET.*readout\b" apps/edge/src/`: matches `/api/competitions/:id/readout` route registration + tests.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
