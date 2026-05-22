---
phase: 02-4-klubbs-mvp
plan: 05
subsystem: ui
tags:
  [hyrbricka, readout, toast, returnerad, admin-view, rest, ui, e2e, websocket]

# Dependency graph
requires:
  - phase: 02-4-klubbs-mvp/01
    provides: hired_cards Drizzle table (compound PK [competitionId, cardNumber] + contact_* columns + returnedAtMs nullable)
  - phase: 02-4-klubbs-mvp/02
    provides: POST /api/competitors writes hired_cards row inside the same sqlite.transaction as competitor INSERT (Pitfall 10 onConflictDoUpdate on compound PK)
  - phase: 02-4-klubbs-mvp/04
    provides: ReadoutView.handleLiveEvent extensible WS dispatch (meos_merge case shows the additive pattern this plan extends with hired_card_returned)
  - phase: 01-single-laptop-training-mvp
    provides: readout.ts route shape, ConsentConfirmationToast.svelte structural analog (pendingConsentToast + dismissedConsentForCompetitorIds Set pattern), Sidebar.svelte NavItem layout, Playwright e2e infra (webServer + reuseExistingServer + tests/e2e/), BroadcastSink injection (PATTERNS S-2), broadcast-after-commit (PATTERNS S-4)
provides:
  - GET /api/competitions/:id/hired-cards → 200 { open: HiredCardRow[], returned: HiredCardRow[] } partitioned on returned_at_ms, newest-first within each
  - PATCH /api/competitions/:id/hired-cards/:cardNumber/return → 200 { ok: true, returned_at_ms, already_returned? } — idempotent; broadcasts hired_card_returned on readoutChannel(competitionId) AFTER commit (no broadcast on already_returned path)
  - readout.ts gains hired_card_open: { contact_name, contact_phone, contact_email, note } | null per history row via a single in-memory map (no per-card extra fetch)
  - apps/web/src/lib/components/HyrbrickaToast.svelte — Svelte 5 runes red-urgency toast component with tel:/mailto: links + Ignorera/Returnerad button pair + data-testid hooks for e2e
  - apps/web/src/lib/screens/ReadoutView.svelte — pendingHyrbrickaToast + returnedHiredCardNumbers state, card_read side-effect that surfaces the toast when hired_card_open !== null AND !Set.has(cardNumber), Set-replacement form for Svelte 5 reactivity (Assumption A8)
  - apps/web/src/lib/screens/ActiveHyrbrickorView.svelte — admin backstop view (D-HB-2 reconciliation surface) with empty/loading/error branches + per-row optimistic local update on Returnerad
  - apps/web/src/routes/competition/[id]/hyrbrickor/+page.svelte — SvelteKit route shell
  - apps/web/src/lib/layout/Sidebar.svelte — Hyrbrickor nav item (⚷ glyph)
  - apps/web/src/lib/api/client.ts — listHiredCards + returnHiredCard wrappers
  - packages/shared-types/src/dtos.ts — HiredCardRow / HiredCardsListResponse / HiredCardReturnResponse / HiredCardOpen Zod schemas + inferred types
  - 17 new i18n keys across sv.json + en.json (readout.hyrbricka.* + hyrbrickor.* + nav.hyrbrickor)
  - tests/e2e/hyrbricka.spec.ts — 11-step happy path (walkup → readout toast → Returnerad → no-re-pop → admin view) passing 3 consecutive runs with no flakes
affects: [02-06-parallel-meos-runbook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Single source of truth for derived UI state: hired_card_open lives on /readout history rows rather than a per-card extra fetch — avoids SPA race between card_read arrival + per-card lookup'
    - 'Idempotent PATCH with no-op broadcast: second tap on Returnerad preserves the original returned_at_ms AND skips the WS broadcast (the prior emit covers it)'
    - 'Set-based session dismissal via REPLACEMENT form `new Set([...prev, x])` — Svelte 5 Assumption A8 reliability for $state-tracked Set mutation'
    - 'Cross-operator dismissal via informational WS envelope: hired_card_returned envelope adds the card to the local returnedHiredCardNumbers Set so a different operator''s PATCH from the admin view propagates to live readout views'
    - 'Per-row optimistic local update on PATCH success: filter the returned row out of open[], unshift onto returned[] with the server-returned timestamp — avoids a full refetch'
    - 'Pure-helper test pattern for Svelte 5 component dispatch predicates: replicate the in-template logic in-test as a sentinel; if the source predicate drifts, the test catches it (matches the established meosMerge.test.ts idiom)'

key-files:
  created:
    - apps/edge/src/routes/hiredCards.ts
    - apps/edge/src/routes/hiredCards.test.ts
    - apps/web/src/lib/components/HyrbrickaToast.svelte
    - apps/web/src/lib/components/HyrbrickaToast.test.ts
    - apps/web/src/lib/screens/ActiveHyrbrickorView.svelte
    - apps/web/src/lib/screens/ActiveHyrbrickorView.test.ts
    - apps/web/src/routes/competition/[id]/hyrbrickor/+page.svelte
    - tests/e2e/hyrbricka.spec.ts
  modified:
    - apps/edge/src/routes/readout.ts
    - apps/edge/src/routes/readout.test.ts
    - apps/edge/src/server.ts
    - apps/web/src/lib/api/client.ts
    - apps/web/src/lib/layout/Sidebar.svelte
    - apps/web/src/lib/screens/ReadoutView.svelte
    - apps/web/src/lib/screens/readout-types.ts
    - apps/web/src/lib/i18n/sv.json
    - apps/web/src/lib/i18n/en.json
    - packages/shared-types/src/dtos.ts
    - packages/shared-types/src/index.ts

key-decisions:
  - "i18n namespace alignment: ALL toast strings under `readout.hyrbricka.*` (parallel to the `ro.*` ReadoutView convention) and the admin view under `hyrbrickor.*` (one namespace per surface). The plan suggested mixing readout.* and hyrbrickor.* — both are fine because Plan 02-04 already established that the `ro.*` namespace is for terse runtime strings while longer multi-key feature blocks get their own namespace."
  - "No broadcast on already_returned PATCH (idempotent path). The prior emit already drove every subscriber's Set update; re-emitting on a stale duplicate would surface no new state. Plan task 1 test 6b explicitly verifies the absence of envelope emission on the idempotent path."
  - "hired_card_returned envelope adds to the Set unconditionally. Even if the local operator already returned the card (Set already has it), defensive add is a no-op due to Set semantics, AND it covers the cross-operator case (another operator returns via the admin view — our ReadoutView wouldn't otherwise know to suppress its toast)."
  - "Sidebar nav-item is rendered unconditionally on every layout (matches the plan task 3 escape hatch). The empty-state message in the view handles the no-rentals case gracefully. Visibility-gating on competition-level state would require a new store + WS subscription; the 2.0 simplification is worth the harmless extra nav item."
  - "Single-test e2e for the full happy path (not 9 separate tests). The state dependencies across the walkup → readout → Returnerad → admin-view chain make a per-step test setup so heavy that the total run-time would be ~30s vs the ~7s of the single-test variant. Plan task 4 done criteria says 3 consecutive passes — verified locally; the single-test shape is the only one that fits."
  - "ActiveHyrbrickorView uses optimistic local update on Returnerad (move row from open → returned with server-returned timestamp) rather than a full refetch. Cheaper, snappier UX, and the next mount/refresh would correct any drift anyway."

patterns-established:
  - "Pattern: single-source-of-truth derived field on /readout (hired_card_open) avoids the per-card-on-card_read fetch race"
  - "Pattern: idempotent PATCH with conditional broadcast — only emit when state actually changed"
  - "Pattern: Set-replacement form `new Set([...prev, x])` is the only safe path for Svelte 5 $state-tracked Set mutation (Assumption A8)"
  - "Pattern: informational WS envelope for cross-operator dismissal — same channel as the primary event flow, defensive add to the local Set"
  - "Pattern: per-row optimistic local update on PATCH success in admin list views"

requirements-completed: [REQ-PRIV-002, REQ-EVT-CMP-004, REQ-UI-003]

# Metrics
duration: 30min
completed: 2026-05-17
---

# Phase 2 Plan 05: Hyrbricka finish-readout toast + admin view summary

**Hyrbricka REST surface (GET list + PATCH return) + readout.ts
hired_card_open extension drives the new HyrbrickaToast on every
finish-readout for an open rental. One-tap Returnerad PATCHes the
server and adds the card to a per-session Set so the toast doesn't
re-pop. ActiveHyrbrickorView at /competition/:id/hyrbrickor is the
admin backstop for end-of-event reconciliation. Full e2e covers the
walkup → readout → Returnerad → no-re-pop → admin-view chain.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-17T01:14Z+02
- **Completed:** 2026-05-17T01:44Z+02
- **Tasks:** 4 (Tasks 1-3 TDD RED → GREEN; Task 4 single Playwright spec)
- **Files modified:** 19 (8 created + 11 modified)

## Accomplishments

- **Task 1** — `hiredCards.ts` route + `readout.ts` extension landed
  together (Wave-2 single-commit because both touch the readout
  contract). All 8 new hiredCards tests + 3 new readout tests pass;
  full edge suite 368/368 green.
- **Task 2** — `HyrbrickaToast.svelte` Svelte 5 runes component with
  red-urgency styling; `ReadoutView.svelte` gains
  `pendingHyrbrickaToast` + `returnedHiredCardNumbers` state; the
  card_read side-effect path surfaces the toast iff
  `hired_card_open !== null && !returnedHiredCardNumbers.has(cardNumber) &&
pendingHyrbrickaToast === null`. Returnerad PATCHes the server +
  adds to the Set via the replacement form `new Set([...prev, x])`
  (Assumption A8). Ignorera skips the PATCH but still adds to the
  Set. `handleLiveEvent` gains a `hired_card_returned` case for the
  cross-operator dismissal scenario.
- **Task 3** — `ActiveHyrbrickorView.svelte` + the SvelteKit route +
  Sidebar nav item. Open/Returned sections; per-row Returnerad
  button with optimistic local update; tel:/mailto: links on contact
  fields.
- **Task 4** — `tests/e2e/hyrbricka.spec.ts` single test exercises
  the full 11-step round-trip in ~7s and passes 3 consecutive runs
  with no flakes.
- 17 new i18n keys land in both `sv.json` and `en.json` with parity.
- shared-types DTOs export the new `HiredCardRow` /
  `HiredCardsListResponse` / `HiredCardReturnResponse` /
  `HiredCardOpen` Zod schemas so the web client and edge route share
  the wire shape at compile time.
- All test suites pass: 368/368 edge, 78/78 web, 20/20 e2e
  (including 1 new). Workspace `pnpm -r typecheck` exits 0.

## Task Commits

Each task was committed atomically following TDD where applicable.
Tasks 1-3 are paired RED → GREEN; Task 4 is single because the spec
itself IS the test.

1. **Task 1 RED** (failing hired-cards + readout extension tests) —
   `8243591` (test)
2. **Task 1 GREEN** (hired-cards route + readout hired_card_open) —
   `33f4fe1` (feat)
3. **Task 2 RED** (failing HyrbrickaToast + ReadoutView integration tests)
   — `b83edcd` (test)
4. **Task 2 GREEN** (HyrbrickaToast component + ReadoutView extensions
   - i18n + api wrappers) — `fd957b7` (feat)
5. **Task 3 RED** (failing ActiveHyrbrickorView + Sidebar tests) —
   `d795fa9` (test)
6. **Task 3 GREEN** (ActiveHyrbrickorView + SvelteKit route + Sidebar
   nav item + i18n) — `b0e45e4` (feat)
7. **Task 4** (Playwright e2e for the full happy path) — `7b4358b`
   (test)

Plan metadata commit follows this summary.

## Files Created/Modified

### Created

- `apps/edge/src/routes/hiredCards.ts` — `registerHiredCardsRoutes`
  Fastify plugin: GET list (partitioned open/returned, newest-first
  on marked_at_ms) + PATCH return (idempotent, broadcast-after-commit
  on the state-change path only).
- `apps/edge/src/routes/hiredCards.test.ts` — 8 node:test cases:
  1 GET happy path + 1 empty + 5 PATCH branches + 1 idempotent
  no-broadcast assertion.
- `apps/web/src/lib/components/HyrbrickaToast.svelte` — Svelte 5
  runes component, red-urgency styling, tel:/mailto: contact links,
  Returnerad/Ignorera button pair. data-testid hooks for the e2e.
- `apps/web/src/lib/components/HyrbrickaToast.test.ts` — 16 vitest
  cases: 3 i18n + 3 api wire + 4 toast-show predicate + 3 Set
  replacement helper + 3 WS dispatch predicate.
- `apps/web/src/lib/screens/ActiveHyrbrickorView.svelte` — admin
  backstop view; loading/error/empty branches; optimistic local
  update on Returnerad.
- `apps/web/src/lib/screens/ActiveHyrbrickorView.test.ts` — 12
  vitest cases: 3 i18n + 2 api wire + 5 empty-state predicate + 2
  applyLocalReturn.
- `apps/web/src/routes/competition/[id]/hyrbrickor/+page.svelte` —
  SvelteKit shell mounting the view.
- `tests/e2e/hyrbricka.spec.ts` — Plan 02-05 happy path Playwright
  spec (1 test, 11 steps).

### Modified

- `apps/edge/src/routes/readout.ts` — adds the `hired_card_open`
  field to every history row via a single in-memory map keyed by
  card_number (open hired_cards rows pre-loaded once per request).
- `apps/edge/src/routes/readout.test.ts` — 3 new tests covering the
  hired_card_open field (populated, explicit null, returned-rental
  → null).
- `apps/edge/src/server.ts` — wires `registerHiredCardsRoutes` after
  `registerAdminRoutes` inside the `if (opts.dbHandle)` block.
- `apps/web/src/lib/api/client.ts` — `listHiredCards` (GET) +
  `returnHiredCard` (PATCH) wrappers.
- `apps/web/src/lib/layout/Sidebar.svelte` — new "Hyrbrickor" nav
  item with the ⚷ glyph.
- `apps/web/src/lib/screens/ReadoutView.svelte` — pendingHyrbrickaToast
  state + returnedHiredCardNumbers Set + handler functions
  (onHyrbrickaReturn / onHyrbrickaDismiss) + handleLiveEvent
  `hired_card_returned` case + template `<HyrbrickaToast />` render
  block.
- `apps/web/src/lib/screens/readout-types.ts` — `hired_card_open`
  field added to `ReadoutHistoryRow`.
- `apps/web/src/lib/i18n/sv.json` + `en.json` — 17 new keys (8
  readout.hyrbricka._ + 9 hyrbrickor._/nav.hyrbrickor).
- `packages/shared-types/src/dtos.ts` — HiredCardRow,
  HiredCardsListResponse, HiredCardReturnResponse, HiredCardOpen
  Zod schemas + inferred types.
- `packages/shared-types/src/index.ts` — barrel re-exports.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. Notable
ones:

- **i18n namespace split**: `readout.hyrbricka.*` for the toast
  strings (sits inside the ReadoutView's family of `ro.*` strings —
  the longer keys earn their own sub-namespace) and `hyrbrickor.*`
  for the admin view (a separate surface deserves a separate
  namespace).
- **No broadcast on idempotent PATCH**: the second tap of Returnerad
  on an already-returned card preserves the original timestamp and
  emits NO envelope. Plan task 1 test 6b verifies the absence.
- **Defensive `hired_card_returned` Set add**: covers both the local
  operator's own click (where the toast is already dismissed locally
  via the handler) AND the cross-operator case (where another
  operator returned the card from the admin view). Set.add semantics
  make the redundant local add a harmless no-op.
- **Unconditional Sidebar nav item**: matches the plan task 3 escape
  hatch — visibility-gating would require a new store + WS
  subscription, deferred to a future polish pass; the empty-state
  message handles the no-rentals case gracefully.
- **Single-test e2e**: the state dependencies across the 11 steps
  make per-step tests roughly 4× slower than the single-test
  variant; the single test passes 3 consecutive runs with no flakes
  so the readability cost is worth the speed.

## Deviations from Plan

None to auto-fix. All 4 tasks landed exactly as planned. Two minor
shape adjustments that are below deviation threshold:

- **Test count over plan**: hiredCards.test.ts ships 8 cases (plan
  said 5 + 1 broadcast); the 2 extras are a defensive empty-competition
  GET check (test 1b) and the no-broadcast assertion on the
  idempotent PATCH path (test 6b). Both fall under "complete the
  contract" not "scope creep".
- **HyrbrickaToast.test.ts ships 16 cases**: the plan called out 6
  behaviors. The extra coverage breaks out 3 distinct dispatch
  predicates (i18n, toast-show, Set-replacement, WS-dispatch) into
  pure-helper cases that match the project's established
  meosMerge.test.ts test idiom — no svelte-testing-library mount.
- **ActiveHyrbrickorView.test.ts ships 12 cases**: same pattern;
  empty-state predicate gets explicit branch coverage (5 cases) and
  applyLocalReturn gets 2 cases.

## Issues Encountered

- **commitlint subject-case + prettier hook flakes during 1st GREEN
  commit**: lefthook flagged `apps/edge/src/routes/hiredCards.ts` +
  `apps/edge/src/routes/readout.ts` for formatting after the first
  Write. Resolved by running `pnpm exec prettier --write` on the
  flagged files then re-staging. No code impact. The recurring
  prettier-reformat-after-Write friction is a known artefact of
  Write tool composition with the project's prettier config (long
  comments + import-order specifics).

## User Setup Required

None for plan-level acceptance.

To exercise the live Hyrbricka flow on Wednesday's 4-klubbs bench:

1. Boot the bridge with FARTOL_DEV=1 + an active competition.
2. Walk up to /competition/:id/readout, type a card number, fill the
   walkup modal with Hyrbricka checked + a phone number, Spara.
3. The bridge can now produce a real card_read for that card
   (BSM7/8 finish-station) — the HyrbrickaToast surfaces with the
   contact phone visible. One tap on Returnerad acknowledges it.
4. End-of-event reconciliation: navigate to
   /competition/:id/hyrbrickor. Open rentals are the unreturned
   inventory; operator can mark each Returnerad as the rentals trickle
   back. Optionally use the contact phone/email to chase the
   stragglers.

## Next Phase Readiness

- **Plan 02-06 (parallel-meos-runbook)** unblocked — the Hyrbricka
  feature is the last D-HB-\* decision to land. The playbook can now
  document:
  - "When a runner doesn't return their rental card, FartOL shows a
    one-tap Returnerad button at finish-readout. If they walk out
    without scanning, /competition/:id/hyrbrickor lists every open
    rental with contact info — operator chases the stragglers there."
  - The D-LIM-1 known limitation (MOP `<cmp>` lacks hired flag, so
    MeOS-side rentals during a FartOL outage won't auto-import on
    recovery) still applies — operator re-enters those manually in
    the walkup modal post-restart.

---

## Self-Check: PASSED

- [x] `apps/edge/src/routes/hiredCards.ts` — FOUND, exports `registerHiredCardsRoutes`
- [x] `apps/edge/src/routes/hiredCards.test.ts` — FOUND, 8 tests pass
- [x] `apps/edge/src/routes/readout.ts` — UPDATED, hired_card_open field added
- [x] `apps/edge/src/routes/readout.test.ts` — UPDATED, 3 new tests pass
- [x] `apps/edge/src/server.ts` — UPDATED, registerHiredCardsRoutes wired
- [x] `apps/web/src/lib/components/HyrbrickaToast.svelte` — FOUND
- [x] `apps/web/src/lib/components/HyrbrickaToast.test.ts` — FOUND, 16 tests pass
- [x] `apps/web/src/lib/screens/ActiveHyrbrickorView.svelte` — FOUND
- [x] `apps/web/src/lib/screens/ActiveHyrbrickorView.test.ts` — FOUND, 12 tests pass
- [x] `apps/web/src/routes/competition/[id]/hyrbrickor/+page.svelte` — FOUND
- [x] `apps/web/src/lib/screens/ReadoutView.svelte` — UPDATED, pendingHyrbrickaToast + handlers + WS case
- [x] `apps/web/src/lib/screens/readout-types.ts` — UPDATED, hired_card_open on ReadoutHistoryRow
- [x] `apps/web/src/lib/layout/Sidebar.svelte` — UPDATED, Hyrbrickor nav item
- [x] `apps/web/src/lib/api/client.ts` — UPDATED, listHiredCards + returnHiredCard
- [x] `apps/web/src/lib/i18n/sv.json` — UPDATED, 17 new keys (parity with en.json)
- [x] `apps/web/src/lib/i18n/en.json` — UPDATED, 17 new keys
- [x] `packages/shared-types/src/dtos.ts` — UPDATED, 4 new Zod schemas + types
- [x] `packages/shared-types/src/index.ts` — UPDATED, barrel re-exports
- [x] `tests/e2e/hyrbricka.spec.ts` — FOUND, passes 3 consecutive runs
- [x] Commits: `8243591`, `33f4fe1`, `b83edcd`, `fd957b7`, `d795fa9`, `b0e45e4`, `7b4358b` — all FOUND in `git log`
- [x] `pnpm --filter @fartol/edge test` — 368/368 pass
- [x] `pnpm --filter @fartol/web test --run` — 78/78 pass
- [x] `pnpm exec playwright test tests/e2e/hyrbricka.spec.ts` — passes 3 consecutive runs
- [x] `pnpm -r typecheck` — exits 0
- [x] No --no-verify used

---

_Phase: 02-4-klubbs-mvp_
_Completed: 2026-05-17_
