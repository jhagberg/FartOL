---
phase: 01-single-laptop-training-mvp
plan: 08
subsystem: projection
tags:
  [
    projection-store,
    results-channel,
    live-update,
    websocket,
    debounce,
    C-M1,
    REQ-EVT-CMP-007,
    REQ-EVT-003,
  ]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 03
    provides: 'wsBroadcast Fastify decorator + WS plugin with per-channel-kind hello-replay dispatch (C-M1 stub for results:)'
  - phase: 01-single-laptop-training-mvp
    plan: 04
    provides: 'POST /api/competitors walk-up + competitions / classes / courses CRUD — the projection-store loader reads these tables'
  - phase: 01-single-laptop-training-mvp
    plan: 06
    provides: 'attachBridge + BridgeOpts (getActiveCompetitionId + broadcast); the LOCKED no-phantom-channel conditional now extends to markDirty'
  - phase: 01-single-laptop-training-mvp
    plan: 07
    provides: 'reduce(input): CompetitionState pure reducer + CompetitorView / ResultView types'
provides:
  - 'apps/edge/src/projection/store.ts — createProjectionStore({handle, broadcast, debounceMs?}): Map-backed cache + setTimeout debounce + per-class results_update fan-out'
  - 'apps/edge/src/projection/loader.ts — loadCompetitionInputs(handle, competitionId) -> ReduceInput | null'
  - 'apps/edge/src/routes/results.ts — GET /api/competitions/:id/results (REST projection snapshot)'
  - 'apps/edge/src/ws/index.ts (modified) — results: hello emits ONE results_full envelope; ZERO replay envelopes ever (C-M1 LOCKED)'
  - 'apps/edge/src/si/bridge.ts (modified) — BridgeOpts gains projectionStore; card_inserted + card_read markDirty when active competition is set'
  - 'apps/edge/src/server.ts (modified) — constructs projectionStore after wsPlugin, decorates app.projectionStore, registers results route, dispose on Fastify close'
  - 'WS envelope shapes LOCKED for results:<id> — results_full on hello + results_update per affected class on markDirty'
affects: [01-09, 01-10, 01-11, 01-12, 01-14, 01-16]

# Tech tracking
tech-stack:
  added: [] # No new package deps — projection store + REST handler are pure TS over plan 07's reducer
  patterns:
    - 'PATTERNS S-1: every new .ts file carries a file-header preamble citing 01-08-PLAN.md + C-M1 + the source-of-truth files (plan 07 reduce.ts, plan 03 ws/index.ts hello branch)'
    - 'PATTERNS S-2: ProjectionStore accepts handle + broadcast + debounceMs as opts — no global cache, no module-scope singleton. Tests open `:memory:` dbs and pass closure-captured spies for broadcast.'
    - 'PATTERNS S-6: snake_case at the WS + REST boundary — results_full + results_update payloads use class_id / class_name / pending_unknown_cards.'
    - 'C-M1 LOCKED (plan 08 stub-lift): results: hello emits EXACTLY ONE results_full envelope; ZERO replay envelopes on results: channels under any condition. ws/index.test.ts test 5 amended (one results_full + zero replay) + test 7 (unknown comp emits zero frames).'
    - 'B-2 LOCKED (plan 08 extension of plan 06): bridge with getActiveCompetitionId() === null skips BOTH wsBroadcast (plan 06) AND projectionStore.markDirty (plan 08). The single null check at the top of maybeBroadcastAndMarkDirty is the mitigation; bridge.test.ts test 9 + store.test.ts test 5 are the regression gates.'
    - 'Debounce coalesce: ProjectionStore.markDirty schedules a setTimeout(debounceMs) and skips when a timer is already pending for that competition_id. Default 50ms (one frame at 20 Hz); tests inject 0 for synchronous assertions.'
    - 'Per-event markDirty policy: card_inserted + card_read mark dirty (they affect the projection). card_removed + frame_error + connection_changed do NOT — they would just churn the recompute without changing CompetitionState.'

key-files:
  created:
    - 'apps/edge/src/projection/loader.ts (~85 lines — single-pass DB load: competitors + classes + courses + course_controls JOIN controls + events sorted)'
    - 'apps/edge/src/projection/store.ts (~125 lines — Map cache + setTimeout debounce + per-class results_update emit; dispose() clears timers)'
    - 'apps/edge/src/projection/store.test.ts (~290 lines — 5 node:tests including the B-2 paired regression gate driven through attachBridge with a spy ProjectionStore)'
    - 'apps/edge/src/routes/results.ts (~75 lines — GET /api/competitions/:id/results; 404 on unknown comp; cache + recomputeNow fallback)'
    - 'apps/edge/src/routes/results.test.ts (~180 lines — 3 node:tests: 404, empty rows, OK row after card_read insertion)'
  modified:
    - 'apps/edge/src/ws/index.ts — hello handler results: branch lifted from no-op stub to ONE results_full emission (C-M1 contract preserved). Imports drizzle eq + classes table for the per-competition class fetch.'
    - 'apps/edge/src/ws/index.test.ts — test 5 amended to assert ZERO replay + ONE results_full; test 7 added (unknown comp silent fall-through); test 8 added (simulate-read end-to-end); test 9 added (walk-up POST end-to-end). seedCompetitionForResults helper.'
    - 'apps/edge/src/si/bridge.ts — BridgeOpts gains projectionStore. Handlers refactored to share maybeBroadcastAndMarkDirty(type, payload, seq, markDirty). Per-event markDirty boolean: card_inserted=true, card_read=true, card_removed=false, frame_error=false, connection_changed=false.'
    - 'apps/edge/src/si/bridge.test.ts — replayFixtureThroughBridge passes a spy ProjectionStore; ReplayCtx tracks markDirtyCalls. Tests 9 + 10 added (markDirty=0 when idle, markDirty>=2 when active).'
    - 'apps/edge/src/routes/dev.ts — simulate-read calls app.projectionStore.markDirty(competition_id) after insertEvent + wsBroadcast.'
    - 'apps/edge/src/routes/competitors.ts — walk-up POST calls app.projectionStore.markDirty(competition_id) after the card_bound event commits + broadcasts.'
    - 'apps/edge/src/server.ts — constructs createProjectionStore after wsPlugin; decorates app.projectionStore; adds onClose hook to dispose. Registers registerResultsRoute. New BuildServerOpts.projectionDebounceMs.'
    - 'apps/edge/src/bin/fartol.ts — BridgeLifecycle passes this.app.projectionStore into attachBridge.'

key-decisions:
  - 'Debounce default = 50ms. UI-SPEC §"Live results auto-update" doesnt pin a specific window; 50ms is one frame at 20 Hz which is well under any human perception threshold, and the plan-07 reducer runs in ~10ms for 1000 events (20× headroom). A real Tuesday training never produces > 1 card_read/sec, so the debounce only matters during simulated burst inputs (and during the simulate-read + walk-up tests where projectionDebounceMs=0).'
  - 'ProjectionStore is constructed AFTER wsPlugin in server.ts. wsPlugin decorates app.wsBroadcast first; the store closes over `(channel, envelope) => app.wsBroadcast(...)` so any BroadcastSink wrapping (plan 04) is honored — the sink sees both the bridge-driven envelopes AND the store-driven envelopes.'
  - 'recomputeNow on an unknown competition returns null + emits ZERO broadcasts. This is the contract the WS hello handler relies on for the C-M1 unknown-competition silent fall-through (test 7).'
  - 'Per-class results_update on markDirty-driven recomputes; results_full ONLY on hello. Two distinct envelope types per the plan-08 wire contract; the client (plan 11 SvelteKit results page) reads hello results_full as the initial state and applies results_update deltas in place.'
  - 'Per-event markDirty policy locked to {card_inserted=true, card_read=true, *=false}. card_inserted is included because it makes the bridge feel "live" on the UI even before the card is read fully (the projection re-runs which is cheap and lets a future receipt-template view show "card 7501853 inserted"). card_removed / frame_error / connection_changed do not change CompetitionState — marking dirty for them would just burn CPU.'
  - 'B-2 contract extension: the SAME null-check that gated wsBroadcast in plan 06 now gates markDirty. The bridge.ts helper `maybeBroadcastAndMarkDirty` is the single point of enforcement — both skips happen together or not at all. Tests 9 + 10 in bridge.test.ts are the paired gates.'
  - 'recomputeNow inside the hello handler is synchronous (no setTimeout). The hello is a one-shot reply; we want the results_full envelope on the wire before the WS client receives any other server-pushed messages. Marking dirty + waiting for the debounce would race against the next broadcast.'
  - 'PlaybackTransport duplicated inline in store.test.ts (same as bridge.test.ts). The Phase 0 packages/sportident/src/bin/replay.ts PlaybackTransport is bin-internal and not exported. Duplicating ~50 lines of test scaffolding beats coupling apps/edge tests to Phase 0 bin internals.'
  - 'BuildServerOpts.projectionDebounceMs is OPTIONAL. Production / walking-skeleton boots without it (default 50ms); tests opt in to 0 for synchronous assertions. results.test.ts + ws/index.test.ts test 8 + test 9 all pass projectionDebounceMs=0.'

patterns-established:
  - 'ProjectionStore as the IO layer wrapping plan 07s pure reducer: the store owns the cache + debounce + broadcast loop. Plan 14 (SvelteKit results page) and plan 16 (IOF XML export) read CompetitionState via store.get / store.recomputeNow without re-running reduce() against shuffled inputs.'
  - 'Per-channel-kind WS dispatch (C-M1 final): readout: gets replay envelopes; results: gets results_full on hello + results_update on markDirty-driven recomputes. The branch IS the mitigation; the contract is asserted in ws/index.test.ts tests 5 + 7.'
  - 'B-2 single-point enforcement: maybeBroadcastAndMarkDirty(type, payload, seq, markDirty) is the only place in the bridge where wsBroadcast and markDirty fire. If getActiveCompetitionId() returns null, BOTH are skipped together. Future event types added to the bridge inherit the contract automatically.'

requirements-completed:
  - REQ-EVT-CMP-007
  - REQ-EVT-003

# Metrics
duration: ~30min
completed: 2026-05-14
---

# Phase 1 Plan 08: ProjectionStore + WS results channel + REST results endpoint Summary

**Plan 07's pure reducer now drives both REST and WebSocket. ProjectionStore caches the last `reduce()` output per competition_id, recomputes on `markDirty` calls from the bridge / simulate-read / walk-up POST, and fan-outs one `results_update` envelope per affected class on `results:<id>`. The WS hello on a `results:` channel emits exactly one `results_full` envelope (lifting plan 03's stub); the C-M1 contract — zero `replay` envelopes on `results:` channels — survives. The B-2 contract — when no active competition is set, neither `wsBroadcast` nor `markDirty` fire — is enforced by the single null-check at the top of `maybeBroadcastAndMarkDirty`.**

## Performance

- **Duration:** ~30 min (including pnpm install on the fresh worktree, sportident build to expose @fartol/sportident types, three prettier auto-fix loops, one ESLint unused-import fix, one commit-message capitalization fix)
- **Started:** 2026-05-14T~14:00Z
- **Completed:** 2026-05-14T~14:30Z
- **Tasks:** 2 / 2
- **Files created:** 5 (2 production + 2 test + the results route module)
- **Files modified:** 8 (server.ts, bin/fartol.ts, routes/dev.ts, routes/competitors.ts, si/bridge.ts, si/bridge.test.ts, ws/index.ts, ws/index.test.ts)
- **Tests added:** 13 new node:tests (4 store.test.ts + 1 store.test.ts B-2 paired gate + 3 results.test.ts + 2 bridge.test.ts + 3 ws/index.test.ts new + 1 amended)
- **Edge cumulative:** 183 / 183 pass (170 plan-07 baseline → 177 after Task 1 → 183 after Task 2)

## Accomplishments

- **REST projection snapshot wired.** `GET /api/competitions/:id/results` returns `{competition_id, classes: [{class_id, class_name, rows: ResultView[]}], pending_unknown_cards, last_event_seq}`. 404 on unknown competition. Plan 14's SvelteKit results page consumes this on initial mount.
- **WS results channel wired.** `results:<id>` hello → ONE `results_full` envelope carrying the current per-class projection state. Every subsequent `markDirty` from the bridge / simulate-read / walk-up POST → ONE `results_update` per affected class (debounced 50ms, coalesced).
- **C-M1 LOCKED at the wire.** `ws/index.test.ts` test 5 asserts ZERO `replay` envelopes AND exactly ONE `results_full` envelope on a `results:` hello against 3 pre-loaded card_read events; test 7 asserts ZERO frames on `results:` hello for an unknown competition (silent fall-through). The branch in `handleHello` NEVER falls through to any `replayChannel(...)` codepath on a `results:` channel under any condition.
- **B-2 LOCKED at the bridge.** `bridge.test.ts` test 9 asserts ZERO `markDirty` calls across an SI10 fixture replay when `getActiveCompetitionId() === null`; test 10 asserts at least 2 `markDirty` calls (card_inserted + card_read) when the active competition is set. `store.test.ts` test 5 is the paired regression gate at the projection-store layer.
- **End-to-end integration verified.** `ws/index.test.ts` test 8: a WS client subscribes to `results:<id>`, then a `POST /api/__dev/simulate-read` fires a `card_read` event, and within 400ms the client receives a `results_update` envelope on the right channel with the right `class_id`. test 9: same end-to-end vertical via `POST /api/competitors` (walk-up with consent + card_number → card_bound event → markDirty → results_update broadcast).
- **Debounce coalesce verified.** `store.test.ts` test 3: three `markDirty` calls inside a 10ms debounce window collapse to ONE recompute + ONE broadcast (per class). Test 4: `dispose()` cancels a pending timer + subsequent `markDirty` is a no-op.
- **Unknown competition is silent.** `store.test.ts` test 1: `recomputeNow('does-not-exist')` returns null + zero broadcasts + cache stays empty. The contract the WS hello handler depends on for the C-M1 unknown-competition fall-through.
- **Test totals:** apps/edge 183 / 183 pass (baseline 170 → +13 new). No flakes across three full runs. Slowest individual test (~530ms) is `test 9 plan-08 walk-up integration` — well within the 1s sanity budget.

## Task Commits

Each task committed atomically:

1. **Task 1: ProjectionStore + loader + GET /api/competitions/:id/results** — `eac06db` (feat)
2. **Task 2: markDirty wiring + results_full hello + C-M1 + B-2 regression gates** — `6cf87ce` (feat)

_Plan metadata commit lands with this SUMMARY (separate from per-task commits)._

## Files Created / Modified

### Created — apps/edge/src/projection/

- `loader.ts` — `loadCompetitionInputs(handle, competitionId)`. Single pass over competitions (existence check) → competitors → classes → courses + course_controls JOIN controls (per-course `control_codes`) → events (ordered by `event_time_ms, local_seq`). Returns null on unknown competition.
- `store.ts` — `createProjectionStore({handle, broadcast, debounceMs?})`. Map-backed cache + `setTimeout`-based debounce. `markDirty` is a coalescing scheduler; `recomputeNow` is the synchronous path. `dispose` clears pending timers.
- `store.test.ts` — 5 node:tests (unknown-competition no-op, recompute caches + broadcasts, debounce coalesce, dispose cancels, B-2 paired gate driven through `attachBridge`).

### Created — apps/edge/src/routes/

- `results.ts` — `GET /api/competitions/:id/results`. Cache-first: `store.get(id)`; falls back to `store.recomputeNow(id)` on the first read. 404 on unknown competition. Returns `{competition_id, classes: [{class_id, class_name, rows: ResultView[]}], pending_unknown_cards, last_event_seq}`.
- `results.test.ts` — 3 node:tests (404, empty rows + PEND status, OK row after a card_read event lands).

### Modified

- `apps/edge/src/server.ts` — constructs `createProjectionStore({handle, broadcast: app.wsBroadcast, debounceMs?})` AFTER `wsPlugin` registers. Decorates `app.projectionStore`. Adds `onClose` hook to dispose pending timers. Registers `registerResultsRoute`. New `BuildServerOpts.projectionDebounceMs` (optional; tests inject 0).
- `apps/edge/src/ws/index.ts` — `handleHello`'s results: branch lifted from the plan-03 no-op stub to a `results_full` emission. New imports: `eq` from drizzle + `classes as classesTable` from `db/schema.ts`. The branch fetches the projection (via `store.get` then `store.recomputeNow`), fetches per-competition classes, builds the `{classes: [{class_id, class_name, rows}], pending_unknown_cards}` payload, and emits ONE `results_full` envelope. On unknown competition the projection is null + the branch emits nothing (socket stays open).
- `apps/edge/src/ws/index.test.ts` — test 5 amended; tests 7 + 8 + 9 added; `seedCompetitionForResults` helper added.
- `apps/edge/src/si/bridge.ts` — `BridgeOpts` gains `projectionStore: ProjectionStore`. Handlers refactored to share `maybeBroadcastAndMarkDirty(type, payload, seq, markDirty)`. Per-event policy: card_inserted=true, card_read=true, card_removed=false, frame_error=false, connection_changed=false. The single null-check at the top is the B-2 mitigation.
- `apps/edge/src/si/bridge.test.ts` — `replayFixtureThroughBridge` passes a spy `ProjectionStore`. `ReplayCtx.markDirtyCalls` tracks counts. Tests 9 + 10 added.
- `apps/edge/src/routes/dev.ts` — simulate-read calls `app.projectionStore.markDirty(competition_id)` after `insertEvent` + `wsBroadcast`.
- `apps/edge/src/routes/competitors.ts` — walk-up POST calls `app.projectionStore.markDirty(competition_id)` after the card_bound event commits + broadcasts.
- `apps/edge/src/bin/fartol.ts` — `BridgeLifecycle.openAttempt` passes `this.app.projectionStore` into `attachBridge`.

## Decisions Made

1. **Debounce default 50ms.** UI-SPEC §"Live results auto-update" doesn't pin a specific window; 50ms is one frame at 20 Hz and well under any human perception threshold. The plan-07 reducer runs in ~10ms for 1000 events (per plan-07 idempotent.test.ts test 3), so 50ms leaves ~40ms headroom. Tests inject `projectionDebounceMs=0` for synchronous assertions.
2. **ProjectionStore constructed AFTER wsPlugin.** The store closes over `(channel, envelope) => app.wsBroadcast(...)`. Any BroadcastSink wrapping (plan 04) is honored because the wrapping happens before the store is built.
3. **recomputeNow on unknown competition returns null + ZERO broadcasts.** This is the contract the WS hello handler relies on for the C-M1 unknown-competition silent fall-through. Asserted in `store.test.ts` test 1.
4. **`results_update` is per class, not per envelope-of-all-classes.** The plan locked this: one envelope per affected class, with `class_id + class_name + rows`. Plan 14 client merges by `class_id` and replaces the rows array in place.
5. **`results_full` is ONLY emitted on hello.** markDirty-driven broadcasts emit `results_update` per class. The two envelope types are distinct on purpose — `results_full` is the initial state replay, `results_update` is a delta. Client (plan 14) treats them differently: `results_full` reinitialises the class map; `results_update` mutates one class entry.
6. **Per-event markDirty policy `{card_inserted=true, card_read=true, *=false}`.** card_inserted is included because it makes the bridge feel "live" on the UI even before the card is read (the projection re-runs cheaply and a future receipt-template view can show "card 7501853 inserted"). card_removed / frame_error / connection_changed don't change `CompetitionState` — marking dirty for them would just burn CPU.
7. **B-2 single-point enforcement.** The `maybeBroadcastAndMarkDirty` helper is the only place in the bridge where wsBroadcast and markDirty fire. If `getActiveCompetitionId()` returns null, both are skipped together. Future event types added to the bridge inherit the contract for free.
8. **The recomputeNow call inside the hello handler is synchronous.** The hello is a one-shot reply — we want the `results_full` envelope on the wire before any other server-pushed messages. Marking dirty + waiting for the debounce would race against the next broadcast. Plan 14's client can rely on `results_full` arriving first.
9. **`store.test.ts` includes a B-2 paired gate** rather than only having the gate live in `bridge.test.ts`. Two layers of regression catch any future divergence: bridge.test.ts asserts the bridge doesn't call `markDirty`; store.test.ts asserts that even with a real projection store wired in, no `markDirty` lands. Either test failing surfaces the regression at CI time.
10. **PlaybackTransport duplicated inline in `store.test.ts`** (same as bridge.test.ts). Phase 0's `packages/sportident/src/bin/replay.ts` PlaybackTransport is bin-internal and not exported via the package barrel. Duplicating ~50 lines of test scaffolding beats coupling apps/edge tests to Phase 0 bin internals.
11. **Integration tests live in `ws/index.test.ts`** (tests 8 + 9) rather than a separate `apps/edge/src/projection/integration.test.ts`. The vertical they test is "WS subscribe → REST POST → WS receive" — the boot infrastructure (Fastify listen + WebSocket client) already exists in ws/index.test.ts. A separate integration file would duplicate it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Drizzle imports + prettier formatting churn**

- **Found during:** Both task commits.
- **Issue:** Lefthook's prettier hook flagged 3 files in Task 1 (loader.ts, results.test.ts, server.ts) and 1 file in Task 2 (ws/index.test.ts). One ESLint unused-import in Task 1 (`competitions` import in results.test.ts was unused after schema-import re-arrangement). One commit-message capitalization issue (`Task 1:` in the subject line tripped commitlint's `subject-case` rule).
- **Fix:** Ran `pnpm exec prettier --write` on each flagged set; dropped the unused import; rewrote the commit subject in lowercase imperative form (`add projection store + loader + GET results endpoint`).
- **Files modified:** as listed.
- **Verification:** Both commits land on retry; all 183 tests still pass.
- **Committed in:** `eac06db` (Task 1) + `6cf87ce` (Task 2).

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking toolchain churn). No Rule 1 / Rule 2 / Rule 4 deviations. The plan spec was internally consistent and matched the actual surface of plan 07 + plan 06 — no plan-spec bugs surfaced.

## Issues Encountered

- **Fresh worktree required pnpm install + sportident build before typecheck would resolve `@fartol/sportident`.** Same friction every plan has seen since plan 01 — already documented in plans 01, 02, 06, 07 summaries. A Phase 2 follow-up (source-fallback export in `packages/sportident/package.json`) would remove the interleaved-build need; not in scope for plan 08.
- **No other blockers.** The plan spec was clear, the dependencies (plan 03 + plan 04 + plan 06 + plan 07) all landed clean, and the test infrastructure (in-memory SQLite + `app.inject()` + WebSocket clients on port 0) was already established in earlier plans.

## User Setup Required

None. The new tests run cold via `pnpm --filter @fartol/edge test`. No env vars beyond `FARTOL_DEV=1` (which the integration test sets/unsets within the test itself). No new package deps.

## Next Phase Readiness

- **Plan 11 / 14 (SvelteKit results page + walk-up modal):** `import { ResultView, CompetitorView } from '@fartol/edge/projection/types.ts'` (or the shared-types re-export once plan 11 wires it). The SvelteKit results page on initial mount calls `GET /api/competitions/:id/results` for the snapshot, subscribes to `results:<id>` for `results_full` (a redundant initial state in case the WS connects faster than the REST round trip), and applies `results_update` envelopes by `class_id`. The walk-up modal reads `pending_unknown_cards` directly off the results envelope.
- **Plan 09 / 10 (additional REST + WS):** the projection-store contract is locked. Future routes that mutate the projection state (e.g. a future `POST /api/competitions/:id/manual-dnf` for the operator-DNF flow) just call `app.projectionStore.markDirty(competition_id)` after the events row commits.
- **Plan 16 (IOF XML 3.0 export):** reads CompetitorView's `latest_start` + `latest_finish` + `elapsed_time_ms` from the projection cache via `app.projectionStore.get(id)`. No re-walk of the event log; the cache is the source of truth for the export.

## Confirmation: Plan-08 OUTPUT items

Per the plan's `<output>` section, the items it asked the executor to record:

1. **Chosen debounce time post-bench-verification:** 50 ms (one frame at 20 Hz). UI-SPEC doesn't pin a specific window; 50 ms is well under any human perception threshold and the plan-07 reducer runs ~20× faster than the debounce. No bench-verification needed beyond `store.test.ts` test 3 (coalesce) which uses 10 ms (faster than default to keep CI runs short).
2. **markDirty placement adjustments:** None. The plan-spec policy `{card_inserted=true, card_read=true, card_removed=false, frame_error=false, connection_changed=false}` matched the implementation 1:1. The walk-up POST (plan 04 path) calls markDirty after the card_bound event commits + broadcasts — same pattern as the bridge handlers.
3. **Integration tests location:** lifted into `apps/edge/src/ws/index.test.ts` (tests 8 + 9) rather than a separate `apps/edge/src/projection/integration.test.ts`. The boot infrastructure (Fastify listen + WebSocket client + simulate-read REST inject + walk-up POST inject) already lives in ws/index.test.ts. A separate file would duplicate ~80 lines of scaffolding.
4. **bridge.test.ts + store.test.ts B-2 regression gates pass:** Confirmed live. `bridge.test.ts` test 9 (`markDirty NOT invoked when activeCompetitionId is null`) + test 10 (`markDirty fires on card_inserted + card_read when active competition is set`) + `store.test.ts` test 5 (`store.markDirty is NOT invoked from the bridge when no active competition`) — all three pass on the final run.
5. **C-M1 confirmation:** `ws/index.test.ts` test 5 confirms ZERO `replay` envelopes + exactly ONE `results_full` envelope on `results:` hello against a seeded competition with 3 card_read events in the DB. test 7 confirms silent fall-through on unknown-competition `results:` hello (zero frames total). Both pass on the final run.

## Threat Flags

None. All new surface in this plan was covered by the threat model up-front (T-PROJECTION-DOS, T-DEBOUNCE-COALESCE-LOSS, T-IDLE-MARKDIRTY-LEAK, T-RESULTS-CHANNEL-LEAK / C-M1, T-WS-FAN-OUT). No new endpoints, auth paths, or schema changes introduced that escape the existing register. The new REST endpoint (`GET /api/competitions/:id/results`) returns derived data only (no events leaked); the new WS envelopes (`results_full`, `results_update`) carry only ResultView rows (no raw card data, no card_holder PII).

## Known Stubs

None. Plan 08 LIFTS plan 03's results: hello stub into a real `results_full` emission. The plan-03 walking-skeleton auto-create-competition convenience in `routes/dev.ts` is still present but unchanged (plan 11's three-click wizard will replace it).

## Self-Check: PASSED

**Files verified present on disk:**

- `apps/edge/src/projection/loader.ts`: FOUND
- `apps/edge/src/projection/store.ts`: FOUND
- `apps/edge/src/projection/store.test.ts`: FOUND
- `apps/edge/src/routes/results.ts`: FOUND
- `apps/edge/src/routes/results.test.ts`: FOUND
- `apps/edge/src/ws/index.ts`: FOUND (modified — results: hello branch lifted)
- `apps/edge/src/ws/index.test.ts`: FOUND (modified — test 5 amended + tests 7-9 added)
- `apps/edge/src/si/bridge.ts`: FOUND (modified — BridgeOpts + maybeBroadcastAndMarkDirty)
- `apps/edge/src/si/bridge.test.ts`: FOUND (modified — markDirty spy + tests 9-10)
- `apps/edge/src/routes/dev.ts`: FOUND (modified — markDirty after simulate-read)
- `apps/edge/src/routes/competitors.ts`: FOUND (modified — markDirty after card_bound)
- `apps/edge/src/server.ts`: FOUND (modified — createProjectionStore + decorate + register)
- `apps/edge/src/bin/fartol.ts`: FOUND (modified — pass projectionStore into attachBridge)

**Commits verified in git log:**

- `eac06db` (Task 1: projection store + loader + GET results endpoint): FOUND
- `6cf87ce` (Task 2: markDirty wiring + results_full hello + C-M1 + B-2 gates): FOUND

**Behavior verified live:**

- `pnpm --filter @fartol/edge typecheck`: clean.
- `pnpm --filter @fartol/edge test`: 183 / 183 pass (baseline 170 → +13 new tests for plan 08).
- `grep -rn "type: 'replay'" apps/edge/src/ws/index.ts`: returns ONE match — inside the `if (kind === 'readout')` branch only. Zero matches inside the `} else {` branch for results: channels.
- `grep -rn "results_full" apps/edge/src/ws/index.ts`: returns ONE match — inside the `} else {` results: branch. The only emitter of `results_full` envelopes in the codebase.
- `grep -rn "results_update" apps/edge/src/projection/store.ts`: returns ONE match — inside `recomputeNow`. The only emitter of `results_update` envelopes in the codebase.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
