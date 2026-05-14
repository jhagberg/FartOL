---
phase: 01-single-laptop-training-mvp
plan: 14
subsystem: ui
tags: [svelte5, walkup, consent, live-results, projector, fullscreen, websocket, c-m3, c-m4]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides:
      - plan 02 EventPayload union (consent_confirmed arm, schema.ts)
      - plan 04 POST /api/competitors (create + Zod CompetitorCreateInput)
      - plan 05 EntryList importer (consent_status='pending_first_read' default)
      - plan 08 results channel + results_full / results_update envelopes
      - plan 10 replace_card_for_competitor_id mode
      - plan 11 typed REST client + Modal/Button/Input/Select/Field/StatusPill primitives
      - plan 13 ReadoutView wiring (walkupCard derived from URL, card_read handler)
provides:
  - WalkupModal overlay component (C-M3 — no /walkup route)
  - ConsentConfirmationToast (C-M4 first-card_read flow)
  - ResultsView + ClassTabs + ResultsTable + fullscreen projector mode
  - PATCH /api/competitors/:id (consent_status flip from pending_first_read → confirmed_on_read)
  - confirmConsent() typed REST client helper
  - ClubAutocomplete (datalist + debounced /api/clubs?prefix=)
  - tests/e2e/walkup.spec.ts (5 scenarios) + tests/e2e/results.spec.ts (2 scenarios)
affects:
  - plan 15 (ESC/POS thermal driver — reads receipt UI now feature-complete)
  - plan 16 (IOF XML 3.0 export — consent_confirmed events row part of audit trail)
  - plan 17 (privacy scrub — consent_status drives scrubbing decisions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Overlay-on-readout walk-up (C-M3): query-param-driven modal mount, no separate route
    - Per-session dismissed-consent Set in operator surface
    - Fullscreen-with-headless-fallback via document.fullscreenElement + local class fallback
    - results_update splice + flashIds Set with per-id 4s setTimeout

key-files:
  created:
    - apps/web/src/lib/screens/WalkupModal.svelte
    - apps/web/src/lib/screens/ResultsView.svelte
    - apps/web/src/lib/components/ClubAutocomplete.svelte
    - apps/web/src/lib/components/ConsentConfirmationToast.svelte
    - apps/web/src/lib/components/ClassTabs.svelte
    - apps/web/src/lib/components/ResultsTable.svelte
    - apps/web/src/routes/competition/[id]/results/+page.svelte
    - tests/e2e/walkup.spec.ts
    - tests/e2e/results.spec.ts
  modified:
    - apps/edge/src/routes/competitors.ts
    - apps/edge/src/routes/competitors.test.ts
    - apps/web/src/lib/api/client.ts
    - apps/web/src/lib/screens/ReadoutView.svelte
    - apps/web/src/lib/i18n/sv.json
    - apps/web/src/lib/i18n/en.json

key-decisions:
  - 'Club autocomplete debounce: 200ms (matches the readout-side simulate debounce; sensitive enough to be responsive without hammering /api/clubs)'
  - 'Fullscreen toggle implementation: requestFullscreen()/exitFullscreen() with a local fallback class flip when the browser rejects (no user gesture in headless e2e). The data-fullscreen attribute mirrors document.fullscreenElement so the projector look is reachable from Playwright without prompting user-gesture grants.'
  - "Replace-card 409 flow lives inline on the walkup modal as a 'Korrigera bricka' button rendered in place of Spara when the cardTakenExistingId state is non-null. No second modal, no extra navigation — the operator stays in the same dialog and re-submits with replace_card_for_competitor_id (plan 10 mode)."
  - "C-M3 confirmation: zero /walkup route files exist in apps/web/src/routes/. Walk-up is mounted by ReadoutView's existing query-param derived signal."
  - "C-M4 confirmation: the consent_confirmed arm declared in apps/edge/src/db/schema.ts (plan 02) is imported, not re-authored. The PATCH handler inserts events.eventType='consent_confirmed' inside the same transaction that flips competitors.consentStatus."
  - 'card_read handler refetches BOTH /readout AND /competitors (was: just /readout) so the consent toast sees current consent_status when deciding whether to surface.'

patterns-established:
  - "Overlay-on-route-shape: bind a query-param signal at the route's screen view; conditionally mount a modal component when non-null. Avoids a /walkup route's extra navigation step (C-M3)."
  - 'Server-side audit-trail flip: a single transaction UPDATEs the row AND inserts an events row capturing the prior state. Per-session UI suppression rides on a local Set.'
  - 'Headless-friendly fullscreen: explicit data-fullscreen attribute + local class fallback for browsers that reject requestFullscreen outside a user gesture.'

requirements-completed:
  - REQ-EVT-CMP-004
  - REQ-EVT-CMP-007
  - REQ-PRIV-001
  - REQ-UI-001

# Metrics
duration: ~50min
completed: 2026-05-14
---

# Phase 1 Plan 14: Walk-up Overlay + Live Results + Consent Toast Summary

**Walk-up overlay (no /walkup route, C-M3) + live results with class tabs and F-key projector mode + C-M4 one-time consent confirmation toast on first card_read for EntryList-imported competitors.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-14T18:08:00Z
- **Completed:** 2026-05-14T18:25:00Z
- **Tasks:** 2 (both autonomous)
- **Files modified:** 6
- **Files created:** 9
- **Tests added:** 5 edge unit + 5 walk-up e2e + 2 results e2e = 12 new tests

## Accomplishments

- **C-M3 walk-up overlay:** WalkupModal mounts on the readout route when `?walkup=<n>` is present. NO separate /walkup route file exists in `apps/web/src/routes/`. Save → `goto(/readout)` (strips the query param). Avbryt + Esc identical path. 409 `card_taken` surfaces inline with a "Korrigera bricka" affordance that re-submits with `replace_card_for_competitor_id` (plan 10 mode).
- **C-M4 consent confirmation flow:** ConsentConfirmationToast surfaces on the first card_read for any competitor whose `consent_status === 'pending_first_read'` (EntryList-imported, plan 05). Operator clicks Bekräfta → `confirmConsent()` → PATCH `/api/competitors/:id` flips to `confirmed_on_read` AND emits a `consent_confirmed` events row inside the same transaction. Avfärda hides the toast without a server flip; a per-session `Set<competitor_id>` prevents the same runner re-popping the toast.
- **Live results view:** /competition/[id]/results subscribes to `results:<id>` WS channel. results_full replaces on hello; results_update splices the affected class's rows and joins newly-introduced competitor_ids to a `flashIds` Set for a 4s `.new` accent-soft fade. Header "Updated" timestamp refreshes on every envelope. F-key (when not in an input) toggles `document.requestFullscreen()` with a local class fallback for browsers that reject without a user gesture.
- **ClassTabs + ResultsTable:** per-class tab strip with "Alla" aggregate; sorted rows with Place/Name/Club/Time/Status; pending rows muted; flashing rows accent-soft.

## Task Commits

Each chunk was committed atomically:

1. **PATCH /api/competitors/:id + edge tests + confirmConsent client + i18n** — `917a88c` (feat)
2. **WalkupModal + ClubAutocomplete + ConsentConfirmationToast + ReadoutView wiring** — `827bd02` (feat)
3. **walkup.spec.ts (5 scenarios) + form novalidate fix** — `e5f682c` (test)
4. **ResultsView + ClassTabs + ResultsTable + results route + results.spec.ts** — `447133d` (feat)

## Files Created/Modified

**Created (9):**

- `apps/web/src/lib/screens/WalkupModal.svelte` — overlay modal: form (Namn/Klubb/Klass/Bricka/Consent), POST createCompetitor with `consent: true` + `consent_status: 'explicit'`, 409 inline replace-card flow
- `apps/web/src/lib/screens/ResultsView.svelte` — mounts ClassTabs + ResultsTable, subscribes to `results:<id>`, F-key fullscreen toggle
- `apps/web/src/lib/components/ClubAutocomplete.svelte` — `<input list>` + `<datalist>` with 200ms debounced /api/clubs?prefix= fetch
- `apps/web/src/lib/components/ConsentConfirmationToast.svelte` — fixed-bottom-right toast, Bekräfta → confirmConsent() PATCH, Avfärda → local dismiss
- `apps/web/src/lib/components/ClassTabs.svelte` — per-class tab strip with "Alla" aggregate + row counts
- `apps/web/src/lib/components/ResultsTable.svelte` — sortable per-class table with .new flash + StatusPill
- `apps/web/src/routes/competition/[id]/results/+page.svelte` — thin shell forwarding $page.params.id to ResultsView
- `tests/e2e/walkup.spec.ts` — 5 scenarios (3 walk-up + 2 consent toast)
- `tests/e2e/results.spec.ts` — 2 scenarios (WS live update + F-key fullscreen)

**Modified (6):**

- `apps/edge/src/routes/competitors.ts` — added PATCH /api/competitors/:id route handler + PatchConsentSchema Zod
- `apps/edge/src/routes/competitors.test.ts` — 5 new tests (PATCH happy path, explicit→422, confirmed→422, 404, bad-body→400). Suite now 213 tests passing.
- `apps/web/src/lib/api/client.ts` — added confirmConsent() typed REST helper with tagged-union return
- `apps/web/src/lib/screens/ReadoutView.svelte` — mount WalkupModal on `?walkup=<n>`, track pendingConsentToast + dismissedConsentForCompetitorIds, refetch competitors on card_read
- `apps/web/src/lib/i18n/sv.json` + `en.json` — walk.consent / walk.classPlaceholder / walk.err.\* / consent.{title,body,confirm,dismiss}

## Decisions Made

- **Debounce for ClubAutocomplete:** 200ms (matches the readout-side simulate debounce; sensitive enough to be responsive without hammering /api/clubs).
- **Fullscreen toggle:** requestFullscreen()/exitFullscreen() + `data-fullscreen` attribute mirrored from `document.fullscreenElement`. On browser rejection (no user gesture in headless e2e), flip the local `fullscreen` state directly so the projector look is reachable from tests. CSS class on the view (not document.body) so the toggle is scoped.
- **Replace-card 409 inline:** the cardTakenExistingId state replaces the Spara button with a "Korrigera bricka" button rendered in place. No second modal, no extra navigation — the operator stays in the same dialog and re-submits with replace_card_for_competitor_id (plan 10 mode).
- **`novalidate` on the walk-up form:** the browser's native `required` field gate would shortcut my custom `validate()` before the operator-facing error message could render. Adding `novalidate` to the `<form>` keeps the inline error path authoritative.
- **C-M4 toast trigger source:** the ReadoutView's WS card_read handler now refetches BOTH /readout AND /competitors before running side-effects. This was a small Rule 1 fix from the plan (plan said "consent_status from the GET …competitors initial fetch"); without the refetch the toast couldn't see the up-to-date row.

## C-M3 + C-M4 Confirmations

- **C-M3 LOCKED:** `find apps/web/src/routes -type d` shows `competition/[id]` + `competition/[id]/readout` + `competition/[id]/results`. **No `/walkup` route file exists** anywhere in the codebase. Walk-up is mounted by ReadoutView's `walkupCard = page.url.searchParams.get('walkup')` derived signal.
- **C-M4 LOCKED:** the `consent_confirmed` arm of EventPayload (declared in `apps/edge/src/db/schema.ts` from plan 02) is imported and used by the PATCH handler, not re-authored locally. The PATCH transaction wraps both the consent_status flip + the consent_confirmed events row insert. Test 13 (PATCH happy path) asserts both the row and the events table reflect the transition; tests 14 + 15 assert non-pending source states return 422.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] card_read handler did not refetch competitors**

- **Found during:** Task 1 (consent toast wiring)
- **Issue:** Plan said the toast reads `consent_status` from competitors; but the existing ReadoutView card_read handler only refetched /readout, so the locally-cached competitor row stayed stale until a card_bound or results_update WS envelope arrived. Without the refetch the toast would never see `pending_first_read` reliably on first read.
- **Fix:** changed `onCardRead` to `Promise.all([refetchReadout(), refetchCompetitors()])` before running `triggerCardReadSideEffects`.
- **Files modified:** apps/web/src/lib/screens/ReadoutView.svelte
- **Verification:** walkup.spec.ts tests 4 + 5 (C-M4 toast surfaces) pass deterministically.
- **Committed in:** 827bd02

**2. [Rule 3 - Blocking] `novalidate` on walk-up form**

- **Found during:** Task 1 (running the walkup e2e for the first time)
- **Issue:** The plan's form has `required` attributes on Input/Select; the browser's native validation gate intercepts the submit click and shows its own tooltip before the form's `onsubmit` handler runs my `validate()`. Result: test 2 (empty name shows inline error) failed because the inline error never rendered.
- **Fix:** added `novalidate` to the `<form>` so the inline error path is authoritative.
- **Files modified:** apps/web/src/lib/screens/WalkupModal.svelte
- **Verification:** walkup.spec.ts test 2 now passes; the inline `data-testid=walkup-error` element renders.
- **Committed in:** e5f682c

**3. [Rule 2 - Critical] `club: null` required on replace-card POST shape**

- **Found during:** Task 1 (svelte-check)
- **Issue:** The Zod-inferred `CompetitorCreateInput` type makes `club` required after the `.nullable().optional().transform(v => v ?? null)` collapse — TS surfaces it as `string | null`, not `string | null | undefined`. The replace-card branch in WalkupModal omitted club entirely, failing typecheck.
- **Fix:** pass `club: null` explicitly in the replace-card POST.
- **Files modified:** apps/web/src/lib/screens/WalkupModal.svelte
- **Verification:** `pnpm --filter @fartol/web typecheck` clean.
- **Committed in:** 827bd02

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 critical)
**Impact on plan:** All three deviations preserve plan intent. Item 1 enables the C-M4 toast contract; item 2 enables the LOCKED inline error UX; item 3 satisfies the wire-side Zod shape.

## Issues Encountered

None blocking. The `state_referenced_locally` Svelte warnings on `cardNumber` initial-only capture in WalkupModal are intentional — only the URL's `?walkup=<n>` at modal-mount time counts; if the prop value changes after that the dialog should not silently overwrite operator edits. Two of the warnings (a11y dialog tabindex + scrim click-handler) match an existing pattern in `apps/web/src/lib/ui/Modal.svelte`.

## Test Results

- **Edge:** 213/213 tests pass (5 new for PATCH route).
- **Web unit:** 31/31 tests pass.
- **E2E:** 13/13 tests pass (5 walkup + 2 results + 4 readout + 2 wizard).

## TDD Gate Compliance

Plan was not marked `type: tdd` — no RED/GREEN gate required. The walkup + consent + results changes were behavior-first with tests written alongside (and run before commit).

## Next Phase Readiness

- Plan 14 closes the human-flow gaps surfaced in plan 13:
  - Walk-up registration is reachable from the readout view (C-M3 LOCKED — same URL, query param).
  - Live results page satisfies REQ-EVT-CMP-007 + UI-SPEC §"Live results auto-update".
  - C-M4 consent semantics fully wired end-to-end: EntryList → pending → first read toast → confirmed_on_read flip + audit event.
- Plan 15 (ESC/POS thermal driver) is the last UI-adjacent plan; results UI is now feature-complete for SC#2 + SC#7.
- The `consent_confirmed` event in the audit trail gives plan 17 (privacy scrub) a deterministic source for "which competitors had their consent confirmed via the toast vs the walk-up checkbox."

## Self-Check: PASSED

Verified:

- ✅ `apps/web/src/lib/screens/WalkupModal.svelte` exists
- ✅ `apps/web/src/lib/screens/ResultsView.svelte` exists
- ✅ `apps/web/src/lib/components/ConsentConfirmationToast.svelte` exists
- ✅ `apps/web/src/lib/components/ClubAutocomplete.svelte` exists
- ✅ `apps/web/src/lib/components/ClassTabs.svelte` + `ResultsTable.svelte` exist
- ✅ `apps/web/src/routes/competition/[id]/results/+page.svelte` exists
- ✅ NO `apps/web/src/routes/competition/[id]/walkup/` directory or file exists (C-M3 LOCKED)
- ✅ Commits `917a88c`, `827bd02`, `e5f682c`, `447133d` exist on `gsd/phase-1-training-mvp`
- ✅ `pnpm --filter @fartol/edge typecheck && test` — 213/213
- ✅ `pnpm --filter @fartol/web typecheck && build && test` — 31/31, build clean
- ✅ `pnpm playwright test` — 13/13

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
