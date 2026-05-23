---
phase: '01'
phase_name: 'single-laptop-training-mvp'
review_type: 'retroactive_code_review_recheck'
reviewed_at: '2026-05-16'
head: 'c35e427'
status: issues_found
depth: full_phase_current_head_recheck
scope:
  plans_reviewed: '01-01 through 01-18 completed, including Wave 5 plans 01-16 through 01-18'
  code_roots: 'apps/edge, apps/web, packages/sportident, packages/shared-types'
  post_plan_fixes: 'included Wave 5, post-15 hardware-session fixes, and commits through c35e427'
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
verification:
  typecheck: pass
  edge_tests: pass
  web_tests: pass
  sportident_tests: pass
  shared_types_tests: pass
  playwright_e2e: pass_15_passed_2_skipped
  build_fartola: pass_with_existing_svelte_warnings
  install_smoke: pass
---

# Code Review Recheck: Phase 01 Single-Laptop Training MVP

## Summary

Reviewed current `HEAD` (`c35e427`) after the earlier review fixes, Wave 5, and the post-15 live BSM7-USB hardware-session fixes.

Verdict: **no blocking Phase 1 code-review finding remains**. The previous critical finding and previous warning findings are fixed at current `HEAD`. I found one new warning in a post-review EntryList import perf cleanup, plus the two earlier info-level cleanup items that remain safe to defer.

## Previous Review Recheck

| Old ID                                                    | Current status          | Evidence                                                                                                                                         |
| --------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CR-001 packaged SPA WebSocket origin rejected             | Fixed                   | `apps/edge/src/ws/index.ts` now allows `localhost:3000`, `127.0.0.1:3000`, and `[::1]:3000`; the edge WebSocket tests cover the packaged origin. |
| WR-001 daily backup retry schedules next midnight         | Fixed                   | `apps/edge/src/backup/daily.ts` now has an explicit one-hour retry path that calls `runOnce()`, and the regression tests pass.                   |
| WR-002 local-midnight jobs use UTC date strings           | Fixed                   | Backup and retention now format local dates with local date parts; the edge regression tests pass.                                               |
| WR-003 course POST accepts cross-competition `class_id`   | Fixed                   | `apps/edge/src/routes/courses.ts` validates that `class_id` belongs to the same competition and returns `422` on mismatch.                       |
| WR-004 README says Node 22 while engines require Node 24  | Fixed                   | `apps/edge/README.md` now says Node.js 24 LTS, matching `.nvmrc` and package engines.                                                            |
| WR-005 Playwright gate is red/brittle                     | Fixed                   | `CI=1 pnpm e2e --workers=1` now passes: 15 passed, 2 skipped.                                                                                    |
| IN-001 `getCompetitor()` client/server shape mismatch     | Still open, OK to defer | Helper remains unused in current UI paths. See IN-001 below.                                                                                     |
| IN-002 `expectedResponses > 1` advertised but not honored | Still open, OK to defer | Current production callers use the default single-response path. See IN-002 below.                                                               |

## Findings

### WR-001: EntryList club upsert now records clubs for competitors that were skipped

**Severity:** Warning
**Files:** `apps/edge/src/ingest/entryImport.ts`

Commit `7024373` correctly reduces repeated club upserts, but it also changes import semantics. The current code builds `distinctClubs` from every row in `data.competitors` after the competitor loop:

- `apps/edge/src/ingest/entryImport.ts:90-95` skips duplicate-card rows.
- `apps/edge/src/ingest/entryImport.ts:116-131` then upserts club names from all EntryList rows, including skipped rows.
- Rows skipped because their class is missing are also included in that post-loop club upsert.

Before the perf change, a club was upserted only along the successful competitor-insert path. Now an EntryList row that is not imported as a competitor can still create or refresh a club autocomplete value.

**Impact:** Imported-club state can include clubs from competitors the system did not accept. In normal happy-path imports this is harmless, but with duplicate cards or missing classes it is a small behavior and data-retention drift from the accepted competitor set.

**Fix direction:** Keep the bulk-upsert optimization, but collect club names only from successfully inserted competitors:

- initialize `const clubsToUpsert = new Set<string>()` before the loop;
- after the competitor insert succeeds, add `e.club` when present;
- upsert from `clubsToUpsert` after the loop.

Add a regression test where an EntryList row is skipped, then assert its club is not inserted. I would not treat this as a Phase 1 release blocker, but I would not defer it as "just perf" unless the new behavior is explicitly accepted.

### IN-001: `getCompetitor()` client type still does not match the server response

**Severity:** Info
**Files:** `apps/web/src/lib/api/client.ts`, `apps/edge/src/routes/competitors.ts`

The web API client still declares `getCompetitor()` as returning `Promise<{ competitor: CompetitorDTO }>`, while the server route returns a bare `CompetitorDTO`. The helper appears unused in current UI paths, so this remains safe to defer.

**Fix direction:** Change the client helper to `Promise<CompetitorDTO>` or intentionally wrap the server response if a single-resource envelope convention is added later.

### IN-002: `sendMessage(expectedResponses > 1)` is exposed but still removed after the first response

**Severity:** Info
**Files:** `packages/sportident/src/SiStation/SiTargetMultiplexer.ts`, `packages/sportident/src/SiStation/SiSendTask.ts`

`SiTargetMultiplexer.sendMessage()` still exposes `expectedResponses`, and `SiSendTask.receive()` still supports waiting for multiple frames, but the multiplexer dispatch path removes a task after the first matching response. Current production callers use the default `1`, so this is safe for Phase 1.

**Fix direction:** Remove the task only after `SiSendTask` has actually settled, or simplify the API if multi-response pairing is not intended.

## Deferred Items Review

The major deferrals are correctly classified:

- Physical/human UAT gates in `01-VERIFICATION.md` remain real-world checks: real SI card session, thermal paper receipt acceptance, Tuesday rehearsal, PWA installability on the target tablet, and bright-sunlight readability.
- `REQ-UI-005` QR receipt and `REQ-STD-003` IOF XML 2.0.3 read are correctly deferred to later roadmap phases, not Phase 1.
- The parent self-signup QR flow, Tailscale/Cloudflare tunnel exploration, SI-card program-name write idea, and thermal receipt polish are correctly outside the Phase 1 training MVP.
- The three PR #3 perf items and the insert-event helper centralization are reasonable follow-ups rather than Phase 1 blockers.

One deferred artifact was stale: `.planning/phases/01-single-laptop-training-mvp/deferred-items.md` still listed the old Playwright parallel-load flake as an active deferral. That is no longer accurate after the current e2e stabilization and green `CI=1 pnpm e2e --workers=1` run, so the item is now marked resolved/superseded.

One adjacent planning artifact also still needs cleanup if it is used as a source of truth: `01-VALIDATION.md` is still marked `status: draft` and its task rows are all `pending`, even though the summaries, commits, and current verification runs show the implemented checks have landed. I did not classify that as a code finding.

The only deferral I would reconsider is the new club-upsert warning above. It is small, but it is a behavior change from the perf commit, not just a scale optimization.

## Verification

Commands run during this recheck:

- `pnpm typecheck`: pass.
- `pnpm --filter @fartola/web test -- --run`: pass, 31 tests.
- `pnpm --filter @fartola/shared-types test`: pass, 1 test.
- `pnpm --filter @fartola/sportident test`: pass, 20 tests.
- `pnpm --filter @fartola/edge test`: pass, 280 tests.
- `CI=1 pnpm e2e --workers=1`: pass, 15 passed, 2 skipped.
- `pnpm build:fartola`: pass; existing Svelte warnings remain for modal accessibility/autofocus and `$state` local-reference usage.
- `pnpm test:install`: pass, 2 install smoke tests.

I also checked the workspace instruction include. `AGENTS.md` references `@RTK.md`, but no `RTK.md` exists in this worktree.
