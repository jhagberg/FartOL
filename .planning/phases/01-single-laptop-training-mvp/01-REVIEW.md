---
phase: '01'
phase_name: 'single-laptop-training-mvp'
review_type: 'retroactive_code_review'
reviewed_at: '2026-05-15'
head: 'da2b196'
status: issues_found
depth: full_phase_current_head
scope:
  plans_reviewed: '01-01 through 01-18'
  code_roots: 'apps/edge, apps/web, packages/sportident, packages/shared-types'
  post_plan_fixes: 'included current HEAD, including Wave 5 and post-review fixes'
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
verification:
  typecheck: pass
  edge_tests: pass_with_ws_loopback_rerun
  web_tests: pass
  sportident_tests: pass
  shared_types_tests: pass
  build_fartol: pass_with_svelte_warnings
  install_smoke: pass
  playwright_e2e: failed_brittle_current_specs_after_clean_rerun
---

# Code Review: Phase 01 Single-Laptop Training MVP

## Summary

Reviewed the full Phase 1 scope at `da2b196`: plans `01-01` through `01-18`, all source under `apps/edge`, `apps/web`, `packages/sportident`, and `packages/shared-types`, plus the fixes that landed after the first review.

Verdict: **fail until CR-001 is fixed**. Most previous findings were corrected, and the package/install smoke passes, but the packaged Wave 5 app serves the SPA from `localhost:3000` while the WebSocket origin allow-list still rejects that origin. That breaks the live UI in the primary production packaging path.

## Previous Review Recheck

| Old ID                                                    | Current status | Evidence                                                                                                                                 |
| --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CR-001 bridge hardware `error` events unhandled           | Fixed          | `apps/edge/src/bin/fartol.ts:321` adds transport/station error listeners and reconnect handling.                                         |
| WR-001 readout can keep stale `PEND`                      | Fixed          | `apps/web/src/lib/screens/ReadoutView.svelte:351` now handles `results_update`; subscriptions include both readout and results channels. |
| WR-002 manual receipt print can use stale projection      | Fixed          | `apps/edge/src/routes/print.ts:123` now recomputes before constructing the receipt envelope.                                             |
| WR-003 CLI `--competition-id` bypasses validation         | Fixed          | `apps/edge/src/bin/fartol.ts:473` validates the competition before persisting the CLI override.                                          |
| WR-004 course POST accepts cross-competition `class_id`   | Still open     | Carried forward as WR-003 below.                                                                                                         |
| IN-001 `getCompetitor()` client/server shape mismatch     | Still open     | Carried forward as IN-001 below.                                                                                                         |
| IN-002 `expectedResponses > 1` advertised but not honored | Still open     | Carried forward as IN-002 below.                                                                                                         |

## Findings

### CR-001: Packaged SPA cannot open WebSocket from the production `localhost:3000` origin

**Severity:** Critical
**Files:** `apps/edge/src/ws/index.ts`, `apps/edge/src/server.ts`, `apps/edge/README.md`, plan `01-18`

Wave 5 moved production delivery to a single edge process that serves the built SPA and API from port `3000`. The server code enables static serving from the edge process (`apps/edge/src/server.ts:234-256`), and the operator README tells users to open `http://localhost:3000/` (`apps/edge/README.md:31-39`).

The WebSocket origin allow-list still only accepts dev and preview origins:

- `apps/edge/src/ws/index.ts:74-81` allows `localhost:5173`, `127.0.0.1:5173`, `[::1]:5173`, `localhost:4173`, and `127.0.0.1:4173`.
- `apps/edge/src/ws/index.ts:83-85` rejects every other non-empty origin.
- `apps/edge/src/ws/index.ts:107-111` turns that into a `403` WebSocket upgrade rejection.

I reproduced the packaged-origin failure with a targeted WebSocket smoke using `Origin: http://127.0.0.1:3000`; the client received `unexpected-response`. CLI/no-origin clients still work, which is why the existing unit tests pass.

**Impact:** The installed single-binary app can serve the HTML shell and REST API, but browser live updates from the production URL are rejected at the WebSocket handshake. Readout, live results, bridge status, and consent/walk-up flows become stale or disconnected in the main packaged operator path.

**Fix direction:** Accept the production same-origin loopback URLs. A conservative fix is to allow `http://localhost:3000`, `http://127.0.0.1:3000`, and `http://[::1]:3000`, plus tests for packaged/static origin. If the configured port can vary, derive the allowed loopback origin from the actual listen port or accept loopback HTTP origins while continuing to reject remote origins.

### WR-001: Daily backup and retention "retry in 1h" schedules the next midnight instead of retrying the failed job

**Severity:** Warning
**Files:** `apps/edge/src/backup/daily.ts`, `apps/edge/src/privacy/retention.ts`

Both schedulers document a one-hour retry on transient failure, but the retry timer calls `schedule()`, not `runOnce()`.

- Backup: `apps/edge/src/backup/daily.ts:101-105` catches the failure and sets `timer = setTimeout(schedule, 60 * 60 * 1000)`.
- Retention: `apps/edge/src/privacy/retention.ts:117-119` does the same.

When that one-hour timer fires, `schedule()` computes the delay to the next local midnight and waits again. The failed backup or PII retention pass is skipped until the next day.

**Impact:** A transient disk, permission, or SQLite issue at midnight can skip the daily backup and/or retention scrub for about 24 hours, despite the code comments and operator contract saying it retries after one hour.

**Fix direction:** On failure, schedule a one-hour callback that invokes `runOnce()` and then either schedules the next midnight on success or retries again on failure. Add fake-clock tests that force `runOnce()` to fail once and assert the second attempt actually executes after one hour.

### WR-002: Local-midnight jobs derive date strings with UTC `toISOString()`

**Severity:** Warning
**Files:** `apps/edge/src/backup/daily.ts`, `apps/edge/src/privacy/retention.ts`

The schedulers are anchored to local midnight:

- Backup uses `setHours(24, 0, 0, 0)` in `apps/edge/src/backup/daily.ts:51-56`.
- Retention mirrors that in `apps/edge/src/privacy/retention.ts:69-76`.

The job date strings are then derived with UTC formatting:

- Backup filenames use `new Date(now()).toISOString().slice(0, 10)` at `apps/edge/src/backup/daily.ts:83-85`.
- Retention cutoff dates use `new Date(cutoffMs).toISOString().slice(0, 10)` at `apps/edge/src/privacy/retention.ts:88-90`.

For a Swedish laptop at local midnight during CEST, the UTC date is still the previous calendar day. A scheduled backup for local `2026-05-16 00:00` gets a `2026-05-15` filename, and retention day math follows UTC dates while the scheduler and operator docs describe local days.

**Impact:** Operators get confusing backup filenames, and retention can drift from local event-day expectations around midnight. Existing tests use midday timestamps, so they do not exercise the production scheduled boundary.

**Fix direction:** Either explicitly document UTC-day semantics, or derive local `YYYY-MM-DD` using local date parts. Add tests under `TZ=Europe/Stockholm` at local midnight.

### WR-003: Course creation still accepts a `class_id` from a different competition

**Severity:** Warning
**Files:** `apps/edge/src/routes/courses.ts`, `apps/edge/src/db/schema.ts`, `apps/edge/src/projection/reduce.ts`

The old WR-004 finding is still present. `POST /api/competitions/:id/courses` validates that the parent competition exists (`apps/edge/src/routes/courses.ts:88-93`) and then inserts `parsed.data.class_id` unchanged (`apps/edge/src/routes/courses.ts:99-110`). The schema enforces `courses.class_id -> classes.id`, but not `(competition_id, class_id)` consistency.

**Impact:** A course under competition A can point at a class from competition B. Projection loads courses by competition and indexes them by `classId`, so this can misattach or hide course controls in multi-competition local databases.

**Fix direction:** When `class_id` is present, select a class by both `classes.id` and `classes.competitionId = competitionId` before inserting. Return `422` for unknown or cross-competition classes and add a regression test beside `apps/edge/src/routes/courses.test.ts`.

### WR-004: Operator README says Node 22 while package engines require Node 24

**Severity:** Warning
**Files:** `apps/edge/README.md`, `.nvmrc`, `package.json`, `apps/edge/package.json`

The install docs list `Node.js 22 LTS` as the prerequisite (`apps/edge/README.md:15`). The actual runtime contract is Node 24:

- `.nvmrc:1` is `24`.
- Root `package.json:9-10` requires `node >=24.0.0`.
- `apps/edge/package.json:8-9` also requires `node >=24.0.0`.

**Impact:** A laptop operator following the packaged README can install the wrong major Node version and hit engine/runtime failures during `npm install -g` or first boot.

**Fix direction:** Update the README to Node 24, or intentionally lower and test the package engines if Node 22 support is required.

### WR-005: The full Playwright gate is no longer a clean current-tree signal

**Severity:** Warning
**Files:** `playwright.config.ts`, `tests/e2e/readout.spec.ts`, `tests/e2e/results.spec.ts`, `apps/edge/src/routes/dev.ts`, `apps/web/src/lib/components/LatestReadCard.svelte`, `apps/web/src/lib/screens/ResultsView.svelte`

A clean `CI=1 pnpm e2e --workers=1` run with fresh servers still fails two browser specs:

- `tests/e2e/readout.spec.ts:172-185` expects the manual-DNF reason input to open after a synthetic card read. The synthetic dev payload has `finish: null` (`apps/edge/src/routes/dev.ts:136-147`), and the reducer contract treats `finish=null` as DNF. The current UI therefore shows the un-DNF action, not the reason input (`apps/web/src/lib/components/LatestReadCard.svelte:82-90`, `apps/web/src/lib/components/LatestReadCard.svelte:211-219`).
- `tests/e2e/results.spec.ts:104-119` asserts that a second-resolution timestamp string changes after a live update. `ResultsView` formats only `HH:MM:SS` (`apps/web/src/lib/screens/ResultsView.svelte:110-116`), so an update that lands in the same second as the initial render can be real but produce identical visible text.

The local `pnpm e2e` path is also vulnerable to false failures because `playwright.config.ts:39-40` and `playwright.config.ts:56-57` reuse existing local servers outside CI. I initially hit this with an old edge dev server on port `3000` that had `FARTOL_DEV=1` but not `FARTOL_PRINTER=stdout`, which made `/api/__dev/simulate-read` fail through the production printer sink.

**Impact:** Phase 1 no longer has a single trustworthy browser regression command. Real browser coverage is partially passing, but the red result currently mixes stale assertions, timing brittleness, and stale-server reuse.

**Fix direction:** Update the manual-DNF spec to use a read scenario whose projected status is not already DNF, or assert the current un-DNF behavior if that is the intended contract. Change the results test to assert a data change or a monotonic millisecond test hook instead of a second-resolution label. Consider disabling `reuseExistingServer` for the edge server or adding a health/env precheck before reuse.

### IN-001: `getCompetitor()` client type still does not match the server response

**Severity:** Info
**Files:** `apps/web/src/lib/api/client.ts`, `apps/edge/src/routes/competitors.ts`

The web API client declares `getCompetitor()` as `Promise<{ competitor: CompetitorDTO }>` (`apps/web/src/lib/api/client.ts:240-246`), but the server returns a bare `CompetitorDTO` (`apps/edge/src/routes/competitors.ts:572-583`). The helper is still unused in current UI paths, so this remains informational.

**Fix direction:** Change the client helper to `Promise<CompetitorDTO>` or wrap the server response. Prefer aligning the client with the existing server shape unless a single-resource envelope convention is introduced.

### IN-002: `sendMessage(expectedResponses > 1)` is exposed but still removed after the first response

**Severity:** Info
**Files:** `packages/sportident/src/SiStation/SiTargetMultiplexer.ts`, `packages/sportident/src/SiStation/SiSendTask.ts`

`SiTargetMultiplexer.sendMessage()` exposes `expectedResponses` (`packages/sportident/src/SiStation/SiTargetMultiplexer.ts:75-83`), and `SiSendTask.receive()` resolves only after collecting that many frames (`packages/sportident/src/SiStation/SiSendTask.ts:59-68`). The dispatch path still removes the task after one matching frame (`packages/sportident/src/SiStation/SiTargetMultiplexer.ts:202-212`).

All current production callers use the default `1`, so this is not breaking Phase 1 hardware reads today. A future caller that relies on multi-frame collection will lose response pairing and time out.

**Fix direction:** Make `receive()` return whether the task settled, expose a read-only settled flag, or remove the task only from the cleanup path after the promise really resolves.

## Verification

Commands run during this review:

- `pnpm typecheck`: pass.
- `pnpm --filter @fartol/web test -- --run`: pass, 31 tests.
- `pnpm --filter @fartol/shared-types test`: pass.
- `pnpm --filter @fartol/sportident test`: pass.
- `pnpm --filter @fartol/edge test`: suite passed except the WebSocket file under sandbox localhost restrictions; `src/ws/index.test.ts` passed when rerun with host loopback access.
- `pnpm build:fartol`: pass, with existing Svelte warnings around dialog accessibility/autofocus and `$state` local references.
- `apps/edge/scripts/install-smoke.sh dist/fartol-0.1.0.tgz`: pass with host access.
- `pnpm test:install`: pass with host access.
- Targeted packaged-origin WebSocket smoke: fails with `unexpected-response` for `Origin: http://127.0.0.1:3000`, confirming CR-001.
- `CI=1 pnpm e2e --workers=1`: fails in the two current brittle/stale browser specs described in WR-005; 11 passed, 2 failed, 2 skipped, 2 did not run.

I also checked the missing workspace instruction include: `AGENTS.md` references `@RTK.md`, but no `RTK.md` exists in this worktree.
