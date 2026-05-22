---
phase: 02-4-klubbs-mvp
plan: 02b
subsystem: ui
tags: [registration-desk, walkup, queue, auto-advance, sveltekit, ergonomics, ui, websocket, e2e]

# Dependency graph
requires:
  - phase: 02-4-klubbs-mvp/02
    provides: WalkupModal extended with eventorHint / hyrbricka / Bana label; createCompetitor REST shape with hired_card; lookupEventorBySiCard wiring; EventorAutocomplete data-testid='walkup-name' contract
  - phase: 01-single-laptop-training-mvp
    provides: WalkupModal Phase 1 baseline (cardHolderHint, consent); Svelte 5 runes store pattern (bridgeStatus.svelte.ts); WsClient wrapper with preSubscribe + replay unwrap; readoutChannel(competitionId) helper; Playwright e2e infra (webServer + reuseExistingServer)
provides:
  - apps/web/src/lib/stores/cardQueue.svelte.ts — FIFO Svelte 5 runes store with push (dedupe-on-card_number returning false) / pop / peek (current) / count / clear / contains surface; pure (no fetch, no DOM); safe for Node test env
  - apps/web/src/lib/services/cardSubscription.ts — createCardSubscription({competitionId, onCardRead, classifyCard?, onConnectionChange?, onOtherEnvelope?, extraChannels?}) wraps WsClient + replay-unwrap + dispatch loop; classification='unknown'|'known'|'unclassified' resolved by optional async classifyCard (omitted → 'unclassified')
  - apps/web/src/lib/screens/RegistrationView.svelte — registration-desk operator surface; cardSubscription routes every card_read to cardQueue.push; auto-advance on modal close via {#key currentCard.cardNumber} re-mount; dedupe scope = currently-open modal AND queue
  - apps/web/src/routes/competition/[id]/registration/+page.svelte — thin shell mounting RegistrationView (mirrors readout/+page.svelte)
  - apps/web/src/routes/competition/[id]/registration/+page.ts — universal load returning competitionId from params (no fetch, SSR + CSR both succeed)
  - apps/web/src/lib/screens/WalkupModal.svelte: optional onClose callback prop; when supplied, close() calls it INSTEAD of goto(/readout) → enables parent-driven auto-advance without router round-trip; backward-compatible (null default preserves Phase 1 behavior)
  - tests/e2e/registration-queue.spec.ts — single 6-step spec covering empty mount + first card opens + second queues + Save auto-advances + dedupe toast + late finish punch flow
  - 5 new i18n keys across sv.json + en.json (registration.title / welcome / empty / queuedBadge / dedupeToast)
affects: [02-06-parallel-meos-runbook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Shared subscription factory pattern: WS connect + replay-unwrap + dispatch loop lives in a service so multiple screens consume the same plumbing with different policies (classifyCard supplied vs omitted)'
    - 'Three-way classification enum (known | unknown | unclassified) so consumer screens can opt into projection-aware semantics without forcing every consumer to supply a resolver'
    - 'Parent-driven modal close via optional callback prop: WalkupModal.onClose lets the parent (RegistrationView) drive auto-advance; null default preserves Phase 1 router-strip behavior'
    - "Component re-mount via {#key currentCard.cardNumber}: when a modal's $state form fields only initialize at mount, wrapping in #key cleanly resets them on each auto-advance — no manual $effect-driven reinitialization required"
    - 'Dedupe-at-two-scopes: cardQueue.contains() covers the queue; sibling check `currentCard?.cardNumber === n` covers the currently-open modal; both surface the same toast'

key-files:
  created:
    - apps/web/src/lib/stores/cardQueue.svelte.ts
    - apps/web/src/lib/stores/cardQueue.svelte.test.ts
    - apps/web/src/lib/services/cardSubscription.ts
    - apps/web/src/lib/screens/RegistrationView.svelte
    - apps/web/src/routes/competition/[id]/registration/+page.svelte
    - apps/web/src/routes/competition/[id]/registration/+page.ts
    - tests/e2e/registration-queue.spec.ts
  modified:
    - apps/web/src/lib/screens/ReadoutView.svelte
    - apps/web/src/lib/screens/WalkupModal.svelte
    - apps/web/src/lib/i18n/sv.json
    - apps/web/src/lib/i18n/en.json

key-decisions:
  - "cardSubscription's `onCardRead` carries a three-way `classification` enum (known | unknown | unclassified) rather than separate `onUnknown` / `onKnown` callbacks. This keeps one canonical hook (the WS plumbing dispatches via classifyCard once) while letting consumers branch as they like. /registration omits classifyCard → always 'unclassified' (every read enqueues); /readout supplies it → only 'unknown' triggers the walkup-redirect branch."
  - 'WalkupModal.onClose is an OPTIONAL prop (null default). Backward-compatible with the Phase 1 /readout path which passes nothing → close() falls through to the existing goto(/readout). Removes the alternative of forking WalkupModal into two variants — additive prop is the right complexity for this seam.'
  - "Wrap `<WalkupModal />` in `{#key currentCard.cardNumber}` for clean re-mount on auto-advance. The modal's `name`, `club`, `classId`, `cardNumberLocal` are all `$state(...)` initialized once at mount, so a parent prop change wouldn't reset them — the next runner would see leftover form state from the prior runner. Using `{#key}` is cheaper than an `$effect`-driven reset and works regardless of how many new fields Plan 02 added (Bana, Hyrbricka, contact fields, etc.)."
  - 'cardSubscription extracts WS connect + replay-unwrap + dispatch, NOT the per-event side effects. ReadoutView keeps its screen-local dispatch (consent toast / hyrbricka toast / meos_merge / hired_card_returned / refetch-on-event) via the `onOtherEnvelope` callback. This is a pure refactor — the screen-local state mutations stay co-located with their state.'
  - "RegistrationView fetches competition + classes itself on mount (mirrors Phase 1 ReadoutView). The +page.ts load function returns only competitionId — symmetric with Phase 1's readout/+page.svelte (which has NO +page.ts and reads page.params directly). Future Phase 2.1 work that wants SSR-prefetched class data has a seam to extend."
  - 'onDestroy drains cardQueue. Stale entries from a closed registration tab would otherwise leak into the next mount; explicit clear() is cheap insurance.'
  - "Set as data-testid contract: registration-view / reg-empty / reg-queue-badge / reg-toast. The walkup-* test-ids from Phase 1 + Plan 02-02 carry over verbatim (data-testid='walkup-modal' / 'walkup-card' / 'walkup-name' / 'walkup-class' / 'walkup-save'), so the e2e spec composes cleanly without churning the Phase 1 selectors."

patterns-established:
  - 'Pattern: shared WS subscription service with policy-via-callback (cardSubscription.ts)'
  - 'Pattern: three-way classification enum for multi-screen WS consumers'
  - 'Pattern: optional parent-driven close callback on modal components — fall through to existing close behavior when null'
  - 'Pattern: {#key prop.value} for modal re-mount on auto-advance'
  - 'Pattern: dedupe-at-two-scopes for FIFO-with-modal-overlay UX (queue.contains + currentCard sibling check)'

requirements-completed: [REQ-UI-005, REQ-UI-006, REQ-UI-007]

# Metrics
duration: 17min
completed: 2026-05-17
---

# Phase 2 Plan 02b: registration-desk + card-beep queue + auto-advance summary

**Registration-desk operator surface at /competition/:id/registration
mounts the same Plan-02 WalkupModal overlay on a clean
registration-themed shell with a FIFO card-beep queue + auto-advance
on Save + dedupe-with-toast on repeated card numbers. ReadoutView's
inline WS plumbing extracted into a shared cardSubscription service so
/registration and /readout consume one piece of code without
duplicating connect/dispatch logic. Pure refactor — zero observable
behavior change for /readout; new behavior is the registration-desk
ergonomics layer.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-17T01:47Z
- **Completed:** 2026-05-17T02:04Z
- **Tasks:** 5 (1 TDD, 4 single-commit)
- **Files modified:** 11 (7 created + 4 modified)

## Accomplishments

- **Task 1 (TDD)** — `cardQueue.svelte.ts` Svelte 5 rune-based FIFO
  store with `push` (dedupe returning false) / `pop` / `current`
  (peek) / `count` / `clear` / `contains`. 8 vitest cases cover the
  full surface: empty queue, push + count, dedupe drop, two-card
  ordering, pop drains in FIFO order, clear, hint=null/"" stored
  verbatim. Pure module — no fetch, no DOM, safe for the Node test
  env.
- **Task 2 (refactor)** — Extracted `cardSubscription.ts` from
  ReadoutView's inline WS code. New interface:
  `createCardSubscription({competitionId, onCardRead, classifyCard?, onConnectionChange?, onOtherEnvelope?, extraChannels?})`.
  ReadoutView now supplies `classifyCard` (refetches /readout +
  /competitors, returns isUnmatched from history[0]) so the existing
  C-M3 silent-drop-when-modal-open semantics keep working. The
  consent toast / hyrbricka toast / meos_merge / hired_card_returned
  / refetch-on-event dispatch logic stays in-screen via
  `onOtherEnvelope`. All 9 readout + walkup e2e tests + the 11-step
  hyrbricka spec pass unchanged.
- **Task 3** — `RegistrationView.svelte` is the registration-desk
  operator surface. Hosts the WalkupModal as an overlay on the same
  page (no nested route), shows a "N i kö" badge, surfaces a dedupe
  toast, and drains cardQueue on unmount so stale entries don't
  carry over to /readout. Added an optional `onClose` callback prop
  to WalkupModal — backward-compatible with the Phase 1 /readout
  path (null default → falls through to the existing goto(/readout)).
  5 new i18n keys land in `sv.json` + `en.json`.
- **Task 4** — `/competition/:id/registration/+page.svelte` +
  `+page.ts` thin shell route. +page.ts returns competitionId from
  params (no fetch — RegistrationView fetches competition + classes
  itself, mirroring Phase 1 ReadoutView). +page.svelte passes
  competitionId through.
- **Task 5** — `tests/e2e/registration-queue.spec.ts` single 6-step
  Playwright spec exercises the full round-trip. Passes 3
  consecutive runs with no flakes (15s, 15s, 12s).

## Task Commits

1. **Task 1** — cardQueue runes store + 8 unit tests — `3552786`
2. **Task 2** — extract cardSubscription shared WS service —
   `c3cc7c5`
3. **Task 3** — registration-desk view + walkup-modal onClose hook —
   `d667552`
4. **Task 4** — /competition/:id/registration route shell —
   `8bcab9e`
5. **Task 5** — e2e for registration-desk queue + auto-advance +
   dedupe — `ed6edf4`

Plan metadata commit follows this summary.

## Files Created/Modified

### Created

- `apps/web/src/lib/stores/cardQueue.svelte.ts` — Svelte 5 rune-based
  FIFO with `push/pop/current/count/clear/contains` surface and
  dedupe-on-card_number returning false.
- `apps/web/src/lib/stores/cardQueue.svelte.test.ts` — 8 vitest
  cases (empty, push, dedupe, ordering, pop, clear, hint verbatim).
- `apps/web/src/lib/services/cardSubscription.ts` — shared WS
  service: `createCardSubscription(opts) → {connect, disconnect}`
  with classification-aware `onCardRead`, optional `classifyCard`,
  `onConnectionChange`, `onOtherEnvelope`, `extraChannels`.
- `apps/web/src/lib/screens/RegistrationView.svelte` —
  registration-desk view; cardSubscription → cardQueue.push;
  auto-advance via {#key currentCard.cardNumber}; dedupe toast.
- `apps/web/src/routes/competition/[id]/registration/+page.svelte` —
  thin shell mounting RegistrationView (mirrors readout/+page.svelte).
- `apps/web/src/routes/competition/[id]/registration/+page.ts` —
  universal load returning competitionId from params.
- `tests/e2e/registration-queue.spec.ts` — single 6-step Playwright
  spec for the full queue + auto-advance + dedupe round-trip.

### Modified

- `apps/web/src/lib/screens/ReadoutView.svelte` — connectWs() now
  constructs a cardSubscription with classifyCard (preserves C-M3
  silent-drop semantics) + onConnectionChange (bridgeStatus.set) +
  onOtherEnvelope (manual_dnf / un_dnf / results_update /
  card_bound / meos_merge / hired_card_returned dispatch). Inline
  handleWs / handleLiveEvent / onCardRead removed (78 lines deleted).
- `apps/web/src/lib/screens/WalkupModal.svelte` — added optional
  `onClose?: () => void` prop. When supplied, `close()` calls it
  INSTEAD of `goto(/competition/<id>/readout)`. Null default
  preserves the Phase 1 /readout path verbatim.
- `apps/web/src/lib/i18n/sv.json` — 5 new keys
  (registration.title / welcome / empty / queuedBadge /
  dedupeToast). Swedish-first per Phase 1 D-02.
- `apps/web/src/lib/i18n/en.json` — 5 new keys matching sv.json
  parity.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. Notable
ones:

- **Three-way `classification` enum on `onCardRead`**: simpler than
  separate `onKnown` / `onUnknown` callbacks because both screens
  share one WS dispatch path; the consumer branches as it pleases.
  /registration uses 'unclassified' (every read enqueues); /readout
  uses 'unknown' (only unmatched cards trigger walkup-redirect).
- **WalkupModal.onClose is optional**: backward-compatibility was
  cheap (null default falls through to the existing goto). The
  alternative — forking WalkupModal into two variants — would have
  bloated the file Plan 02-02 just extended.
- **`{#key currentCard.cardNumber}` for re-mount on auto-advance**:
  WalkupModal's `$state(...)` fields initialize once at mount. A
  parent prop change wouldn't reset them; the next runner would
  inherit the prior runner's name/club/etc. `{#key}` cleanly
  unmounts + remounts on each advance. Cheaper than an
  `$effect`-driven reset (which would need to clear every form
  field individually and would break as Plan 02 added more fields).
- **cardSubscription extracts WS plumbing, NOT screen-local
  dispatch**: the per-event side effects (consent toast / hyrbricka
  / refetch / meos_merge) stay in ReadoutView via `onOtherEnvelope`.
  Pure refactor — zero observable behavior change. Verified by the
  existing 9 readout + walkup + 11-step hyrbricka e2e tests all
  green.
- **onDestroy drains cardQueue**: stale entries from a closed tab
  would otherwise leak into the next mount; the explicit clear() is
  cheap insurance and matches the "operator opens /registration
  fresh each session" mental model documented in 02-CONTEXT.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] eslint prefer-const on cardQueue's `_queue`**

- **Found during:** Task 1 commit (lefthook eslint stage)
- **Issue:** Eslint flagged `let _queue = $state<QueuedCard[]>([]);`
  as "never reassigned". Svelte 5's `$state(...)` returns a proxy;
  the array reference is never reassigned, only mutated via push /
  shift / length = 0.
- **Fix:** Changed to `const _queue = $state<QueuedCard[]>([]);`.
  Tests still pass (all 8 cardQueue cases). Matches Svelte 5 idiom
  (`tweaks` is also declared `const`).
- **Files modified:** `apps/web/src/lib/stores/cardQueue.svelte.ts`
- **Committed in:** `3552786` (Task 1 commit, fixed before commit
  landed)

**2. [Rule 3 - Blocking] commitlint subject-case rejected
"RegistrationView"**

- **Found during:** Task 3 commit (lefthook commitlint stage)
- **Issue:** commitlint blocked PascalCase tokens in the commit
  subject ("feat(02-02b): RegistrationView screen + ..."). Same
  recurring artifact Plan 02-02 + Plan 02-05 hit.
- **Fix:** Rephrased the subject as "feat(02-02b): registration-desk
  view + walkup-modal onClose hook" (all lowercase). Body content
  unchanged.
- **Files modified:** none (commit message only)
- **Committed in:** `d667552` (Task 3 commit, second attempt)

**3. [Rule 1 - Bug] WalkupModal didn't reset `cardNumberLocal` on
parent prop change**

- **Found during:** Task 5 (e2e step 4 — Save click didn't
  auto-advance the modal)
- **Issue:** The first e2e run showed the modal staying on card
  #9999991 after Spara, even though the POST /api/competitors
  returned 201 and `onWalkupClose` set `currentCard =
cardQueue.pop()`. Root cause: WalkupModal's `cardNumberLocal`,
  `name`, `club`, `classId`, `hiredCard` are all `$state(...)`
  initialized once at mount. A parent prop change doesn't reset
  them.
- **Fix:** Wrapped `<WalkupModal />` in `{#key currentCard.cardNumber}`
  so each auto-advance unmounts+remounts the modal. Clean state for
  the next runner; works regardless of how many `$state` fields
  WalkupModal has (Plan 02 added several).
- **Files modified:**
  `apps/web/src/lib/screens/RegistrationView.svelte`
- **Verification:** e2e step 4 (auto-advance) went from FAIL → PASS;
  full suite passes 3 consecutive runs with no flakes.
- **Committed in:** `ed6edf4` (Task 5 commit, bundled with the e2e
  spec since the {#key} change is what made the e2e pass)

**4. [Rule 3 - Blocking] +page.ts tsc errors on PageLoad import +
implicit any**

- **Found during:** Task 4 typecheck
- **Issue:** Initial +page.ts used `import type { PageLoad } from
'./$types';` but tsc reported "Relative import paths need
  explicit file extensions" + "Binding element 'params' implicitly
  has an 'any' type." The SvelteKit-generated $types.d.ts wasn't
  populating early enough in the typecheck pass for `node16` module
  resolution.
- **Fix:** Inlined a minimal `interface LoadEvent { params: { id?:
string } }` and dropped the $types import. Trivial fn; the
  load-payload typing is checked by Svelte 5 at the +page.svelte
  consumer side anyway.
- **Files modified:**
  `apps/web/src/routes/competition/[id]/registration/+page.ts`
- **Verification:** `pnpm -r typecheck` exits 0.
- **Committed in:** `8bcab9e` (Task 4 commit, fixed before commit
  landed)

---

**Total deviations:** 4 auto-fixed (3 Rule 3 blocking — eslint /
commitlint / tsc; 1 Rule 1 bug — WalkupModal state reset). No scope
creep — every change traces directly to a plan task. The Rule 1 bug
was a Plan-02-architecture-meets-Plan-02b-flow finding: WalkupModal
was always mounted-then-router-stripped on /readout, so its
"reinitialize on cardNumber change" path was unexercised. The
`{#key}` fix is the right shape for the registration-desk flow
without changing how WalkupModal works on /readout.

## Issues Encountered

- **commitlint + lefthook recurring friction**: same pattern Plan
  02-02 + Plan 02-05 hit. PascalCase tokens in commit subjects are
  blocked; eslint `prefer-const` flags `let _state = $state(...)`
  patterns. Both are mechanical resolves; no code impact.
- **First e2e run revealed the WalkupModal state-reset bug**: the
  unit tests for cardQueue + the typecheck for RegistrationView all
  passed cleanly, but the integration only surfaced once Playwright
  drove the full Save → auto-advance flow. Vindicates the e2e gate
  in the plan acceptance criteria.

## User Setup Required

None for plan-level acceptance.

To exercise the registration-desk flow live on Wednesday's 4-klubbs
bench:

1. Boot the bridge with FARTOL_DEV=1 + an active competition (the
   `pnpm --filter @fartol/edge dev` shell brings this up).
2. Navigate to `http://localhost:5173/competition/<id>/registration`
   — see the "Inga brickor i kö" empty state.
3. Beep one SI bricka on the reader — WalkupModal opens with the
   card_number pre-filled.
4. While the modal is open, beep another bricka — see the "1 i kö"
   badge appear. The modal stays on the first card.
5. Fill name + Bana + Spara on the first runner — the modal
   auto-advances to the second runner's card_number.
6. Beep the same card twice — see the "Brickan finns redan i kön"
   toast.

## Next Phase Readiness

- **Plan 02-06 (parallel-meos-runbook)** unblocked — the
  registration-desk surface is now documented and behaviorally
  pinned. The playbook can document:
  - "Run /competition/:id/registration on the registration laptop
    and /competition/:id/readout on the results laptop. Both
    surfaces consume the same WS plumbing (cardSubscription) and
    can be opened simultaneously without interfering."
  - "Operators should use ONE registration tab per bridge (cardQueue
    is module-scoped per-tab — two tabs would each surface their own
    modal independently, which is confusing but not data-corrupting)."

The Phase 2.0 implementation backlog is now feature-complete; the
only remaining work is the operator playbook (Plan 02-06) and any
day-of polish that comes out of Tuesday's dry-run.

---

## Self-Check: PASSED

- [x] `apps/web/src/lib/stores/cardQueue.svelte.ts` — FOUND
- [x] `apps/web/src/lib/stores/cardQueue.svelte.test.ts` — FOUND, 8
      tests pass
- [x] `apps/web/src/lib/services/cardSubscription.ts` — FOUND
- [x] `apps/web/src/lib/screens/RegistrationView.svelte` — FOUND,
      mounts WalkupModal via {#key currentCard.cardNumber}
- [x] `apps/web/src/routes/competition/[id]/registration/+page.svelte`
      — FOUND
- [x] `apps/web/src/routes/competition/[id]/registration/+page.ts` —
      FOUND
- [x] `apps/web/src/lib/screens/ReadoutView.svelte` — UPDATED, uses
      createCardSubscription
- [x] `apps/web/src/lib/screens/WalkupModal.svelte` — UPDATED,
      optional onClose prop added
- [x] `apps/web/src/lib/i18n/sv.json` — UPDATED, 5 new keys (parity
      with en.json)
- [x] `apps/web/src/lib/i18n/en.json` — UPDATED, 5 new keys
- [x] `tests/e2e/registration-queue.spec.ts` — FOUND, passes 3
      consecutive runs
- [x] Commits: `3552786`, `c3cc7c5`, `d667552`, `8bcab9e`,
      `ed6edf4` — all FOUND in `git log`
- [x] `pnpm --filter @fartol/web test --run` — 86/86 pass
- [x] `pnpm -r typecheck` — exits 0
- [x] `pnpm exec playwright test tests/e2e/readout.spec.ts tests/e2e/walkup.spec.ts tests/e2e/hyrbricka.spec.ts tests/e2e/registration-queue.spec.ts`
      — 11/11 pass
- [x] No --no-verify used

---

_Phase: 02-4-klubbs-mvp_
_Completed: 2026-05-17_
