---
phase: '01'
phase_name: 'single-laptop-training-mvp'
review_type: 'retroactive_code_review'
reviewed_at: '2026-05-14'
status: issues_found
depth: standard
files_reviewed: 273
scope:
  plans_reviewed: '01-01 through 01-15'
  plans_skipped: '01-16 through 01-18'
  code_roots: 'apps/edge, apps/web, packages/sportident, packages/shared-types'
  post_plan_fixes: '126ac1e..HEAD'
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
verification:
  typecheck: pass
  recursive_test: 'failed once: web i18n default-locale test timed out during concurrent pnpm -r run'
  isolated_edge_test: pass
  isolated_web_test: pass
  isolated_ws_test_with_loopback_permission: pass
---

# Code Review: Phase 01 Single-Laptop Training MVP

## Summary

Reviewed the completed Phase 1 plans `01-01` through `01-15`, skipped unimplemented plans `01-16` through `01-18`, and included the post-plan hardware-session fixes from `126ac1e..HEAD`.

The SportIdent fixture replay, database append-only paths, projection reducer, import paths, and printer paths are broadly covered and passed isolated verification. The issues below are mostly boundary bugs: error-event handling across the hardware bridge, stale projection snapshots across readout/print views, and validation mismatches between equivalent entry points.

## Findings

### CR-001: Edge bridge leaves hardware `error` events unhandled, so read/serial failures can crash the process

**Severity:** Critical  
**Files:** `apps/edge/src/bin/fartol.ts`, `apps/edge/src/si/bridge.ts`, `packages/sportident/src/SiStation/SiMainStation.ts`, `packages/sportident/src/transport/SerialTransport.ts`

`SiMainStation` emits Node's special `'error'` event when a card read chain rejects (`packages/sportident/src/SiStation/SiMainStation.ts:211-226`). `SerialTransport` also forwards OS/serial errors with `this.emit('error', err)` (`packages/sportident/src/transport/SerialTransport.ts:106-111`). In Node, an `'error'` event without a listener is thrown.

The edge runtime constructs `SerialTransport` and `SiMainStation` in `BridgeLifecycle.openAttempt()` (`apps/edge/src/bin/fartol.ts:239-311`) and wires `attachBridge(...)` plus `connectionChanged`, but no `station.on('error', ...)` or `transport.on('error', ...)` handler exists under `apps/edge`. The standalone Phase 0 CLI already documents and handles this exact class of failure (`packages/sportident/src/bin/fartol-readout.ts:278-293`), but the long-running edge bridge does not.

**Impact:** A noisy read, timeout during card page fetch, or serial-port error during the live event can promote a recoverable hardware failure into a process-level crash or unhandled rejection. That is directly in the MVP's primary live-session path.

**Fix direction:** Install edge-owned `station.on('error')` and `transport.on('error')` handlers immediately after construction, before `transport.open()`. Log the error, persist/broadcast a `connection_changed:error` or comparable event if possible, tear down the current bridge, and enter the existing reconnect path. Also consider forwarding `transport.on('error')` through `SiTargetMultiplexer` so consumers have one station-level failure surface.

### WR-001: Readout view can keep showing stale `PEND` status after a card read

**Severity:** Warning  
**Files:** `apps/web/src/lib/screens/ReadoutView.svelte`, `apps/edge/src/routes/readout.ts`, `apps/edge/src/projection/store.ts`, `apps/edge/src/si/bridge.ts`, `apps/edge/src/routes/dev.ts`

`ReadoutView` documents `results_update -> refetch /readout` (`apps/web/src/lib/screens/ReadoutView.svelte:22-27`) and handles `results_update` in `handleLiveEvent()` (`apps/web/src/lib/screens/ReadoutView.svelte:316-324`), but the socket only pre-subscribes to `readoutChannel(competitionId)` (`apps/web/src/lib/screens/ReadoutView.svelte:270-278`). The projection store broadcasts `results_update` only on `results:<competitionId>` (`apps/edge/src/projection/store.ts:82-91`).

The race is deterministic after normal first paint: `GET /readout` creates a projection cache on mount, then a live `card_read` broadcast causes the UI to refetch immediately (`apps/web/src/lib/screens/ReadoutView.svelte:342-350`). Both the bridge and dev simulate path insert/broadcast first and then schedule a debounced projection recompute (`apps/edge/src/si/bridge.ts:274-283`, `apps/edge/src/routes/dev.ts:149-174`). `GET /readout` reuses the cached projection when present (`apps/edge/src/routes/readout.ts:113-130`), so the refetch can see the new history row but old `view.status`, usually `PEND`. The later debounced recompute sends `results_update` on `results:<id>`, where this view is not listening.

**Impact:** The primary operator screen can show the latest read and runner name while the status pill remains stale until another manual action or reload. Existing E2E coverage checks card number and runner name after `simulate-read`, but not the status (`tests/e2e/readout.spec.ts:135-149`).

**Fix direction:** Either subscribe the readout view to `resultsChannel(competitionId)` as well as `readoutChannel(competitionId)`, or make `/api/competitions/:id/readout` force a fresh `recomputeNow(id)` for authoritative snapshots. The most robust fix is to do both: subscribe for the pushed invalidation and make explicit readout snapshots fresh.

### WR-002: Manual receipt printing can use a stale projection snapshot

**Severity:** Warning  
**Files:** `apps/edge/src/routes/print.ts`, `apps/edge/src/si/bridge.ts`, `apps/web/src/lib/screens/ReadoutView.svelte`

Manual print calls `apiPrintReceipt(...)` for the currently displayed competitor (`apps/web/src/lib/screens/ReadoutView.svelte:496-508`). The print route builds the receipt from `app.projectionStore.get(competitionId)` and recomputes only on cache miss (`apps/edge/src/routes/print.ts:123-132`).

The auto-print path already forces `projectionStore.recomputeNow(activeId)` before reading status/place data (`apps/edge/src/si/bridge.ts:144-155`), which is the safer contract after a just-committed `card_read`. Manual print does not do that, so it has the same stale-cache window as the readout route.

**Impact:** Pressing `P` or clicking print shortly after a read can produce a receipt with stale status, place context, or split state even though the event row is already committed.

**Fix direction:** Have the manual print route call `recomputeNow(competitionId)` before constructing the envelope, matching the auto-print path. If recompute cost becomes a concern later, gate it behind a last-event sequence freshness check.

### WR-003: `--competition-id` bypasses the active-competition validation used by the REST API

**Severity:** Warning  
**Files:** `apps/edge/src/bin/fartol.ts`, `apps/edge/src/routes/sessions.ts`, `apps/edge/src/si/eventInserter.ts`, `apps/edge/src/db/schema.ts`

The CLI help says `--competition-id` is equivalent to `POST /api/sessions/active-competition` (`apps/edge/src/bin/fartol.ts:107-110`). The REST route validates that the competition exists before persisting it (`apps/edge/src/routes/sessions.ts:77-92`). The CLI path directly writes `active_competition_id` into config without that lookup (`apps/edge/src/bin/fartol.ts:412-425`).

The bridge reads this config value for every station event (`apps/edge/src/bin/fartol.ts:241-253`) and `insertEvent()` writes it into `events.competition_id` (`apps/edge/src/si/eventInserter.ts:69-82`). That column is a foreign key to `competitions.id` (`apps/edge/src/db/schema.ts:298-305`).

**Impact:** A typo in `--competition-id` can make the first live station event fail the FK insert path instead of failing fast at boot with a clear operator error. Depending on the event that hits it, this can also feed into CR-001's unhandled error behavior.

**Fix direction:** Reuse the REST route's existence check before persisting the CLI override. If the ID is unknown, fail boot with a clear fatal message and leave the previous config row unchanged.

### WR-004: Course creation accepts a `class_id` from a different competition

**Severity:** Warning  
**Files:** `apps/edge/src/routes/courses.ts`, `apps/edge/src/db/schema.ts`, `apps/edge/src/projection/loader.ts`, `apps/edge/src/projection/reduce.ts`

`CourseCreateInput` allows an optional `class_id` (`packages/shared-types/src/dtos.ts:152-158`). The POST route verifies only the parent competition exists (`apps/edge/src/routes/courses.ts:88-93`) and then inserts the supplied `class_id` unchanged (`apps/edge/src/routes/courses.ts:99-110`). The schema enforces only `courses.class_id -> classes.id`, not `(competition_id, class_id)` consistency (`apps/edge/src/db/schema.ts:190-197`).

The projection loader then loads courses by competition (`apps/edge/src/projection/loader.ts:59-63`), and the reducer indexes them by `classId` (`apps/edge/src/projection/reduce.ts:89-95`). A course under competition A can therefore point at a class from competition B. It will be stored and returned under A, but it cannot validly attach to A's competitors/classes.

**Impact:** Cross-competition course/class links can corrupt course assignment, hide expected controls from the actual class, or leak misleading configuration across competitions. The competitor creation route already has an explicit cross-competition class guard in tests, but courses do not.

**Fix direction:** When `class_id` is present, select the class with both `classes.id` and `classes.competitionId = competitionId` before the transaction. Return `422` for an unknown or cross-competition class and add a regression test beside `apps/edge/src/routes/courses.test.ts`.

### IN-001: `getCompetitor()` client type does not match the server response

**Severity:** Info  
**Files:** `apps/web/src/lib/api/client.ts`, `apps/edge/src/routes/competitors.ts`

The web API client declares `getCompetitor()` as `Promise<{ competitor: CompetitorDTO }>` (`apps/web/src/lib/api/client.ts:240-246`), but the server returns a bare `CompetitorDTO` (`apps/edge/src/routes/competitors.ts:465-476`). `rg` shows the helper is currently unused, so this is not breaking a shipped Phase 1 view yet.

**Fix direction:** Change the client helper to `Promise<CompetitorDTO>` or wrap the server response. Prefer aligning the client with the existing server shape unless there is a planned envelope convention for single-resource GETs.

### IN-002: `sendMessage(expectedResponses > 1)` is exposed but the multiplexer removes the task after the first response

**Severity:** Info  
**Files:** `packages/sportident/src/SiStation/SiTargetMultiplexer.ts`, `packages/sportident/src/SiStation/SiSendTask.ts`

`SiSendTask` is built to collect `expectedResponses` frames before resolving (`packages/sportident/src/SiStation/SiSendTask.ts:37-67`), and `SiTargetMultiplexer.sendMessage()` exposes that parameter (`packages/sportident/src/SiStation/SiTargetMultiplexer.ts:75-83`). The dispatch path still removes the head task immediately after one matching frame (`packages/sportident/src/SiStation/SiTargetMultiplexer.ts:202-212`).

All current production callers pass `1`, including the multi-page card readers, which issue separate one-response commands. That keeps this informational for Phase 1. A future caller that actually relies on `expectedResponses > 1` will lose response pairing and time out.

**Fix direction:** Have `SiSendTask.receive()` return whether it settled, expose a read-only settled flag, or remove the task only from the `finally()` cleanup path after the task really resolves.

## Verification

- `pnpm typecheck`: pass.
- `pnpm test`: failed once in the recursive concurrent package runner because `apps/web/src/lib/i18n/index.test.ts` timed out at 5000 ms while edge tests were also running.
- `pnpm --filter @fartol/web test`: pass, 31 tests.
- `pnpm --filter @fartol/edge test`: pass with loopback socket permission, 242 tests.
- `pnpm --filter @fartol/edge exec node --test --test-reporter=spec --import tsx src/ws/index.test.ts`: pass with loopback socket permission, 9 tests.

The isolated package passes make the recursive failure look like runner/resource contention rather than a product regression. It is still worth fixing separately because it makes the top-level verification command noisy.
