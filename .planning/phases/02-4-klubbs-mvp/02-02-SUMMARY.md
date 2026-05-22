---
phase: 02-4-klubbs-mvp
plan: 02
subsystem: ui
tags: [walkup, eventor, autocomplete, hyrbricka, sveltekit, rest, i18n, fastify, drizzle, e2e, playwright]

# Dependency graph
requires:
  - phase: 02-4-klubbs-mvp/01
    provides: eventor_competitors + eventor_clubs Drizzle tables with idx_eventor_si_card + idx_eventor_name indexes; hiredCards compound-PK table; competitors.source enum column; ingestEventorCache transactional ingester; competitors-sample.xml + clubs-sample.xml fixtures; EventorHandle decoration on FastifyInstance; /api/__admin/eventor/refresh admin route
  - phase: 01-single-laptop-training-mvp
    provides: WalkupModal Phase 1 baseline (consent + cardHolderHint); ClubAutocomplete debounced datalist pattern; POST /api/competitors transactional insert with card_bound event; TweaksPanel modal shell; Svelte 5 runes store pattern (bridgeStatus.svelte.ts); Playwright e2e infrastructure (tests/e2e/ with webServer + reuseExistingServer); CompetitorCreateInput Zod superRefine pattern
provides:
  - GET /api/eventor/lookup?si_card=N → 200 { hit: true, person_id, family_name, given_name, club_id, club_name } | { hit: false }
  - GET /api/eventor/lookup?prefix=S&limit=K → 200 { suggestions: EventorNameSuggestion[] }
  - GET /api/eventor/lookup with missing OR conflicting params → 400 missing_query / conflicting_query
  - GET /api/eventor/status → 200 { state: ready | stale | offline | no_key, ageDays, competitorCount, fartola_dev }
  - POST /api/competitors extended additively with hired_card + hired_contact (defaults preserve Phase 1 wire shape exactly)
  - POST /api/competitors hired_card=true validates phone-OR-email pre-flight (400 hyrbricka_contact_required) AND writes hired_cards row inside the same sqlite.transaction as the competitor (Pitfall 10 mitigation — onConflictDoUpdate on compound PK for re-rental)
  - apps/web/src/lib/api/client.ts: lookupEventorBySiCard / lookupEventorByPrefix / getEventorStatus wrappers
  - apps/web/src/lib/components/EventorAutocomplete.svelte: ClubAutocomplete-shape mirror with minLength=2 prefix gate + onPick(suggestion) callback
  - apps/web/src/lib/screens/WalkupModal.svelte: Bana label (was Klass per decision #1); eventorHint prop that wins over cardHolderHint; Hyrbricka checkbox + expandable contact fieldset; D-HB-3 phone-OR-email validation; debounced lookupEventorBySiCard on card-number edit
  - apps/web/src/lib/screens/ReadoutView.svelte: $effect derives eventorHint from lookupEventorBySiCard on walkupCard change; threaded into WalkupModal
  - apps/web/src/lib/stores/eventorStatus.svelte.ts: Svelte 5 rune store with state/ageDays/competitorCount/fartola_dev; soft-fails refresh to state='offline' on network error (D-EV-3); triggerEventorRefresh fires admin POST + re-fetches status
  - apps/web/src/lib/components/TweaksPanel.svelte: Eventor row with status dot + i18next-interpolated label + FARTOLA_DEV-gated 'Uppdatera' button (gated on server-side status.fartola_dev — NOT import.meta.env.DEV which would be bundler-time and always false in production builds)
  - apps/edge/src/routes/dev.ts: POST /api/__dev/eventor-seed FARTOLA_DEV-gated helper for e2e specs
  - tests/e2e/walkup-eventor.spec.ts: 4 Playwright cases — bricka pre-fill, Bana label, Hyrbricka happy path, Hyrbricka validation
  - 17 new i18n keys across sv.json + en.json (walk.bana + walk.banaPlaceholder + walk.hyrbricka.{,name,phone,email,note} + walk.err.hyrbrickaContact + walk.eventor.fill + 8 tweaks.eventor.* keys)
affects:
  [02-03-mip-server, 02-04-mop-receiver, 02-05-hyrbricka-toast, 02-06-parallel-meos-runbook, 02-02b-registration-desk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Discriminated-union REST responses: { hit: true, ... } | { hit: false } for the Eventor lookup hit/miss path so callers can destructure without instanceof checks'
    - 'Mutual-exclusion query params via Zod safeParse + post-parse 400 gate (missing_query / conflicting_query) — cleaner than overlapping superRefine arms'
    - 'Server-side fartola_dev flag in status endpoints so the UI gate is correct in production builds (request-time process.env eval; NOT import.meta.env.DEV which is bundler-time)'
    - 'Pre-flight validation BEFORE opening sqlite.transaction (PATTERNS S-5): hired_card phone-OR-email check returns 400 hyrbricka_contact_required without touching the DB so partial failures leave zero side effects'
    - 'Compound-PK upsert via Drizzle .onConflictDoUpdate({ target: [t.a, t.b], set: {...} }) — Pitfall 10 mitigation for re-rental of the same card after a delete'
    - 'Lazy reactive hint via $effect — late-arriving prop (async lookup result) reflects into Svelte state ONLY when the operator has not yet edited (preserves user input precedence)'
    - 'minLength=2 server-cheap prefix gate in autocomplete components to protect the wire against single-character scans against 252919-row tables'

key-files:
  created:
    - apps/edge/src/eventor/lookup.ts
    - apps/edge/src/eventor/lookup.test.ts
    - apps/edge/src/routes/eventor.ts
    - apps/edge/src/routes/eventor.test.ts
    - apps/web/src/lib/components/EventorAutocomplete.svelte
    - apps/web/src/lib/components/EventorAutocomplete.test.ts
    - apps/web/src/lib/stores/eventorStatus.svelte.ts
    - apps/web/src/lib/stores/eventorStatus.svelte.test.ts
    - tests/e2e/walkup-eventor.spec.ts
  modified:
    - apps/edge/src/routes/competitors.ts
    - apps/edge/src/routes/competitors.test.ts
    - apps/edge/src/routes/dev.ts
    - apps/edge/src/server.ts
    - apps/web/src/lib/api/client.ts
    - apps/web/src/lib/components/TweaksPanel.svelte
    - apps/web/src/lib/screens/WalkupModal.svelte
    - apps/web/src/lib/screens/ReadoutView.svelte
    - apps/web/src/lib/i18n/sv.json
    - apps/web/src/lib/i18n/en.json
    - packages/shared-types/src/dtos.ts
    - packages/shared-types/src/index.ts

key-decisions:
  - "EventorAutocomplete inherits the data-testid='walkup-name' contract (was on the original <Input> the autocomplete replaces) so Phase 1 walkup.spec.ts selectors stay valid — no churn in the 5 existing e2e cases."
  - "ReadoutView's lookupEventorBySiCard is triggered by an $effect on walkupCard rather than by the bridge's card_read handler because the URL is the single source of truth for which card the modal is opened for (Phase 1's ?walkup=<n> contract). Avoids races with the WS arrival order."
  - "WalkupModal applies eventorHint via a lazy $effect (preserves operator-typed values) rather than during initialName/initialClub — the lookup resolves AFTER mount, so the initial-value path would always see null."
  - "/api/eventor/lookup uses query-string mutual-exclusion (missing_query / conflicting_query) instead of two separate GET routes (e.g. /lookup/by-card vs /lookup/by-prefix) — keeps the surface narrow and the Zod parser shared."
  - "TweaksPanel's 'Uppdatera' button is gated on status.fartola_dev (server-side) rather than import.meta.env.DEV (bundler-time). The latter would always be false in production builds even when the operator boots with FARTOLA_DEV=1, making the button unreachable in real ops."
  - "Added POST /api/__dev/eventor-seed (FARTOLA_DEV-gated) as the e2e seeding path. The alternative — running the real Eventor fetch — would require the API key in CI and add a 5s+ network roundtrip per test setup."

patterns-established:
  - "Pattern: discriminated-union REST hit/miss for autocomplete lookups (EventorLookupHit | EventorLookupMiss)"
  - "Pattern: server-side runtime flags surfaced via /status endpoints (fartola_dev) so UI gates are correct in production builds"
  - "Pattern: pre-flight validation OUTSIDE sqlite.transaction for cross-cutting constraints (hired_card phone/email gate) so 400-class rejections leave zero side effects"
  - "Pattern: late-arriving prop pattern (parent fetches async; child uses $effect to reflect into state when not-yet-edited) for autocomplete-fed forms"

requirements-completed: [REQ-STD-004, REQ-EVT-CMP-004, REQ-PRIV-002, REQ-EXT-MEOS-001]

# Metrics
duration: 28min
completed: 2026-05-17
---

# Phase 2 Plan 02: walkup Eventor autocomplete + Hyrbricka summary

**Walk-up modal wires the Plan-01 Eventor cache to pre-fill name + klubb on bricka scan AND on prefix-typed autocomplete; Hyrbricka checkbox + contact fieldset writes to hired_cards in the same transaction as competitors; TweaksPanel surfaces cache health with a FARTOLA_DEV-gated manual refresh button.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-05-16T21:58:09Z
- **Completed:** 2026-05-16T22:26:48Z
- **Tasks:** 5 (all TDD where applicable)
- **Files modified:** 21 (9 created + 12 modified)

## Accomplishments

- Two read-only Eventor helpers in `apps/edge/src/eventor/lookup.ts` (`lookupBySiCard` + `lookupByNamePrefix`) backed by the Plan-01 indexes `idx_eventor_si_card` (partial) + `idx_eventor_name` (composite).
- `registerEventorRoutes` mounts `/api/eventor/lookup` + `/api/eventor/status`. Lookup enforces mutual exclusion of `si_card` and `prefix`; status derives `state ∈ {ready, stale, offline, no_key}` from the boot-marker plus `competitorCount` plus a request-time `fartola_dev` flag so the TweaksPanel admin button works in production.
- `POST /api/competitors` extended additively with `hired_card` + `hired_contact{name,phone,email,note}`. Pre-flight enforces D-HB-3 (phone OR email required) BEFORE opening the transaction so a bad request never touches `competitors`. The hired_cards INSERT lands in the SAME `sqlite.transaction` as the competitor row, with `.onConflictDoUpdate` on the compound PK for clean re-rental (Pitfall 10 mitigation).
- `EventorAutocomplete.svelte` mirrors `ClubAutocomplete` with a hard `minLength=2` prefix gate (the cache holds ~252k rows) and an `onPick` callback so the parent can side-effect-populate `klubb`.
- `WalkupModal` ships the locked decision #1 relabel `Klass → Bana`, the Hyrbricka checkbox + expandable contact fieldset (D-HB-3), the `eventorHint` pre-fill precedence over `cardHolderHint` (Plan 2 nuance), and a debounced `lookupEventorBySiCard` on card-number edits.
- `ReadoutView` derives `eventorHint` via an `$effect` keyed off the URL `?walkup=<n>` change, then passes it to the modal. The modal's own `$effect` reflects the late-arriving hint into form state only when the operator hasn't typed yet — preserves user-edit precedence.
- `eventorStatus.svelte.ts` runes store: soft-fails refresh to `state='offline'` on network error (D-EV-3); `triggerEventorRefresh` fires the FARTOLA_DEV-gated admin POST then re-fetches the status to land the truth.
- `TweaksPanel` Eventor row with a status dot, i18next-interpolated label (`tweaks.eventor.ready: 'Eventor: cache OK ({{days}} dagar gammal)'`), and the FARTOLA_DEV-gated "Uppdatera" button.
- 17 new i18n keys (Swedish-first per Phase 1 D-02) covering Bana label, Hyrbricka fields + error, Eventor fill note, and 8 TweaksPanel status strings. i18n parity test still passes.
- Playwright e2e `tests/e2e/walkup-eventor.spec.ts` covers all 4 scenarios; the 5 Phase 1 walkup tests + 4 readout tests still pass alongside.

## Task Commits

Each task was committed atomically following TDD where applicable. Two commits per implementation task (RED → GREEN); Tasks 3-5 landed as single feat/test commits because they primarily extend existing surfaces.

1. **Task 1 RED** (failing lookup + routes tests) — `dc87e0d` (test)
2. **Task 1 GREEN** (lookup module + REST routes) — `375707e` (feat)
3. **Task 2 RED** (failing hired_card tests) — `a12e088` (test)
4. **Task 2 GREEN** (hired_card transactional insert) — `bf3f61c` (feat)
5. **Task 3** (EventorAutocomplete + WalkupModal Bana/Hyrbricka + i18n) — `252d748` (feat)
6. **Task 4** (TweaksPanel Eventor row + eventorStatus store) — `642d00c` (feat)
7. **Task 5** (e2e + ReadoutView eventorHint wiring + dev seed) — `cf9bab0` (test)

Plan metadata commit follows this summary.

## Files Created/Modified

### Created

- `apps/edge/src/eventor/lookup.ts` — `lookupBySiCard` (single-row SELECT with LEFT JOIN to eventor_clubs) + `lookupByNamePrefix` (LIKE 'prefix%' with ORDER BY family_name, given_name and caller-clamped limit).
- `apps/edge/src/eventor/lookup.test.ts` — 4 node:test cases against the Plan-01 fixture (Hagberg/STK, Östberg UTF-8, miss path, empty-prefix early-return guard).
- `apps/edge/src/routes/eventor.ts` — Fastify plugin `registerEventorRoutes` mounting GET `/api/eventor/lookup` (mutual-exclusion of si_card and prefix, 400 missing_query / conflicting_query) and GET `/api/eventor/status` (state derived from boot marker + competitor count + request-time `fartola_dev`).
- `apps/edge/src/routes/eventor.test.ts` — 9 node:test cases covering hit/miss/missing/conflicting + all four state branches + the FARTOLA_DEV request-time eval.
- `apps/web/src/lib/components/EventorAutocomplete.svelte` — ClubAutocomplete-shape mirror with minLength=2 gate + `onPick(suggestion)` callback. `data-testid="walkup-name"` so Phase 1 walkup.spec.ts selectors remain valid.
- `apps/web/src/lib/components/EventorAutocomplete.test.ts` — 6 vitest cases: API client wire shapes (prefix/si_card/status) + i18n key presence + walk.class alias preservation.
- `apps/web/src/lib/stores/eventorStatus.svelte.ts` — Svelte 5 rune store with `refreshEventorStatus` (soft-fails to offline) and `triggerEventorRefresh` (admin POST + re-fetch).
- `apps/web/src/lib/stores/eventorStatus.svelte.test.ts` — 3 vitest cases: refresh OK, refresh network failure → offline, triggerEventorRefresh fires admin POST + re-fetches.
- `tests/e2e/walkup-eventor.spec.ts` — 4 Playwright cases (bricka pre-fill, Bana label, Hyrbricka happy path, Hyrbricka validation). All four pass end-to-end against the live SvelteKit dev server + Fastify bridge.

### Modified

- `apps/edge/src/routes/competitors.ts` — pre-flight phone-OR-email check before opening the transaction; conditional `hired_cards` INSERT inside the existing `sqlite.transaction(() => …)()` with `.onConflictDoUpdate` on the compound PK.
- `apps/edge/src/routes/competitors.test.ts` — 6 new test cases under "Phase 2.0 — hired_card extension" describe block. All 9 pre-existing competitor tests still pass.
- `apps/edge/src/routes/dev.ts` — added POST `/api/__dev/eventor-seed` (FARTOLA_DEV-gated) wrapping `ingestEventorCache` against the Plan-01 fixture.
- `apps/edge/src/server.ts` — `registerEventorRoutes` wired after `registerClubs` (lookup conceptually parallels clubs autocomplete).
- `apps/web/src/lib/api/client.ts` — `lookupEventorBySiCard`, `lookupEventorByPrefix`, `getEventorStatus` thin apiFetch wrappers.
- `apps/web/src/lib/components/TweaksPanel.svelte` — Eventor row with `$derived(getEventorStatusStore())`, status dot, i18next-interpolated label, and `{#if eventorState.fartola_dev}`-gated refresh button. Mounts a one-shot refresh via `$effect` on first open.
- `apps/web/src/lib/screens/WalkupModal.svelte` — `eventorHint` prop with `$effect` to reflect late-arriving hits; Hyrbricka checkbox + contact fieldset; `walk.bana` label; debounced `onCardEdit → lookupEventorBySiCard`; extended `createCompetitor` payload.
- `apps/web/src/lib/screens/ReadoutView.svelte` — `$effect` on `walkupCard` change runs `lookupEventorBySiCard` and stores `EventorLookupHit | null`; threaded through to `WalkupModal` as `eventorHint`.
- `apps/web/src/lib/i18n/sv.json` + `en.json` — 17 new keys (9 walk._ + 8 tweaks.eventor._). i18n parity test passes.
- `packages/shared-types/src/dtos.ts` — `EventorLookupHit` / `EventorLookupMiss` / `EventorLookupResult` / `EventorNameSuggestion` / `EventorStatusDTO` Zod schemas; `CompetitorCreateInput` extended additively with `hired_card` + nullable `hired_contact`.
- `packages/shared-types/src/index.ts` — barrel re-exports.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. Notable ones:

- **`data-testid="walkup-name"` on EventorAutocomplete**: preserves the Phase 1 walkup.spec.ts contract so the 5 existing e2e cases pass unchanged. Alternative — renaming to `eventor-name` and updating all callers — would have churned the Phase 1 specs for cosmetic gain.
- **`$effect` reactive eventorHint in WalkupModal**: the parent's `lookupEventorBySiCard` resolves AFTER the modal mounts, so an `initialName()` synchronous path would always see null. The `$effect` reflects the late-arriving hit but only when the operator hasn't already typed.
- **Server-side `fartola_dev` flag**: derived from `process.env.FARTOLA_DEV === '1'` at request time so the TweaksPanel "Uppdatera" button shows correctly in production builds when the operator boots with FARTOLA_DEV=1. `import.meta.env.DEV` would be bundler-time and always `false` in prod.
- **`/api/__dev/eventor-seed`**: FARTOLA_DEV-gated dev helper for the e2e spec. Avoids requiring an Eventor API key in CI and the ~5s network roundtrip per test setup.
- **Pre-flight validation BEFORE transaction**: D-HB-3 phone-OR-email is checked at the route surface, not inside the `sqlite.transaction`. Mirrors PATTERNS S-5 — partial failures leave zero side effects.
- **`.onConflictDoUpdate` on `[competitionId, cardNumber]`**: explicit target array required by Drizzle for compound-PK upserts (Pitfall 10). Re-rental of the same card after a delete cleanly resets `marked_at_ms` + null `returned_at_ms`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] ReadoutView wiring for eventorHint**

- **Found during:** Task 5 (e2e bricka pre-fill test failed)
- **Issue:** Plan task 3 specified "WalkupModal applies pre-fill precedence on mount if eventorHint?.hit", but the WalkupModal is mounted by ReadoutView and no one was wiring up the Eventor lookup → eventorHint pipeline. The bricka pre-fill test failed because eventorHint was always null at the seam.
- **Fix:** Added a `$effect` in ReadoutView that calls `lookupEventorBySiCard` whenever the `?walkup=<n>` URL param changes, stores the result as `EventorLookupHit | null`, and threads it through to `<WalkupModal eventorHint={...} />`.
- **Files modified:** `apps/web/src/lib/screens/ReadoutView.svelte`
- **Verification:** e2e bricka pre-fill test went from failing (empty input value) → passing (input value `Hagberg, Jonas`, club `Stora Tuna OK`).
- **Committed in:** `cf9bab0` (Task 5 commit)

**2. [Rule 1 - Bug] WalkupModal initialName/initialClub were eager, not reactive**

- **Found during:** Task 5 (after Rule 2 fix above, the test still failed)
- **Issue:** `initialName()` runs ONCE at component-mount time. By the time the parent's async `lookupEventorBySiCard` resolves, the modal has already initialized name/club to empty strings. The hit never landed.
- **Fix:** Added a `$effect` inside WalkupModal that reflects late-arriving `eventorHint` into `name` + `club` ONLY when those fields are still empty (preserves operator-typed values). Also sets the eventorFillNote so the UI shows "Hämtad från Eventor — kontrollera namn".
- **Files modified:** `apps/web/src/lib/screens/WalkupModal.svelte`
- **Verification:** e2e bricka pre-fill test passes after this fix.
- **Committed in:** `cf9bab0` (Task 5 commit)

**3. [Rule 3 - Blocking] EventorAutocomplete test-id mismatch broke Phase 1 walkup.spec.ts**

- **Found during:** Task 5 (after running Phase 1 walkup.spec.ts to verify no regression)
- **Issue:** I initially set `data-testid="eventor-name"` on EventorAutocomplete, replacing the Phase 1 `<Input data-testid="walkup-name">`. The Phase 1 walkup.spec.ts uses `getByTestId('walkup-name')` in 4 of 5 tests — all would have failed.
- **Fix:** Changed EventorAutocomplete's testid to `walkup-name` so the Phase 1 selectors keep working.
- **Files modified:** `apps/web/src/lib/components/EventorAutocomplete.svelte`
- **Verification:** All 5 Phase 1 walkup e2e tests pass after the rename; all 4 readout e2e tests also pass.
- **Committed in:** `cf9bab0` (Task 5 commit — bundled with the Rule 1+2 fixes since all three were Task 5 discoveries)

**4. [Rule 2 - Missing Critical] /api/\_\_dev/eventor-seed for e2e determinism**

- **Found during:** Task 5 (writing the e2e spec)
- **Issue:** Plan task 5 e2e scenarios depend on the Eventor cache being seeded, but the only seed path was the bridge boot fetch (requires EVENTOR_API_KEY + network) or directly calling `ingestEventorCache` from the test (requires server-internal imports the e2e doesn't have).
- **Fix:** Added a small FARTOLA_DEV-gated `POST /api/__dev/eventor-seed` route in `apps/edge/src/routes/dev.ts` that ingests the bundled Plan-01 fixture (`competitors-sample.xml` + `clubs-sample.xml`). The e2e calls it once per test via `request.post(...)`.
- **Files modified:** `apps/edge/src/routes/dev.ts`
- **Verification:** All 4 e2e tests pass with deterministic data (Hagberg/STK appears reliably for the bricka 8535005).
- **Committed in:** `cf9bab0` (Task 5 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 2 missing-critical, 1 Rule 1 bug, 1 Rule 3 blocking — all surfaced in Task 5 because Tasks 1-4 are unit-test-covered).
**Impact on plan:** All 4 auto-fixes were necessary to deliver the success criteria. The eventorHint wiring is implied by plan task 3's "applies pre-fill precedence on mount" but lives one component up (ReadoutView mounts WalkupModal); the lazy-effect pattern is required because the lookup is async; the test-id alignment is a defensive no-op for Phase 1 specs; the dev-seed route is the cleanest e2e seam. No scope creep — every change traces directly to a plan task or its verify criterion.

## Issues Encountered

- **commitlint subject-case enforcement**: commitlint blocks PascalCase tokens in commit subjects, so "feat(02-02): EventorAutocomplete + ..." had to be rephrased as "feat(02-02): walkup eventor autocomplete + ..." — cosmetic, no code impact. Lefthook + prettier also required two prettier passes on the test files (formatter rewrote multi-line Response constructors). Both resolved by re-running prettier --write on the staged files.

## User Setup Required

None for plan-level acceptance.

The Eventor cache must be populated for the live walk-up flow to pre-fill from Eventor data. Already covered by Plan 02-01 (bridge boot fetches when `EVENTOR_API_KEY` is set in `.eventor-env`). For local dev / e2e the new `POST /api/__dev/eventor-seed` (FARTOLA_DEV-gated) seeds from the bundled 3-record fixture.

## Next Phase Readiness

- **Plan 02-03 (MIP server)** unblocked — has the `events.local_seq` cursor and the `card_bound` event shape from Phase 1; the hired_cards table from this plan is available for the `<card hired="true">` MIP wire flag in plan 03.
- **Plan 02-04 (MOP receiver)** unblocked — no dependency on this plan beyond the shared schema landed in 02-01.
- **Plan 02-05 (Hyrbricka finish-readout toast)** unblocked — the `hired_cards` table is now populated by the walk-up surface; plan 05 reads it on `card_read` to surface the Returnerad toast.
- **Plan 02-02b (registration-desk + auto-advance queue)** unblocked — adds a sibling route hosting the same WalkupModal; this plan's modal extensions (Bana, Hyrbricka, Eventor lookup) carry over verbatim.
- **Plan 02-06 (parallel-MeOS runbook)** depends on plans 03 + 04 + 05 — not blocked by this plan.

---

## Self-Check: PASSED

- [x] `apps/edge/src/eventor/lookup.ts` — FOUND
- [x] `apps/edge/src/eventor/lookup.test.ts` — FOUND
- [x] `apps/edge/src/routes/eventor.ts` — FOUND
- [x] `apps/edge/src/routes/eventor.test.ts` — FOUND
- [x] `apps/edge/src/routes/competitors.ts` — UPDATED, hired_cards transactional insert
- [x] `apps/edge/src/routes/competitors.test.ts` — UPDATED, 6 new HB tests
- [x] `apps/edge/src/routes/dev.ts` — UPDATED, /api/\_\_dev/eventor-seed added
- [x] `apps/edge/src/server.ts` — UPDATED, registerEventorRoutes wired
- [x] `apps/web/src/lib/api/client.ts` — UPDATED, 3 lookup wrappers
- [x] `apps/web/src/lib/components/EventorAutocomplete.svelte` — FOUND, data-testid="walkup-name"
- [x] `apps/web/src/lib/components/EventorAutocomplete.test.ts` — FOUND
- [x] `apps/web/src/lib/components/TweaksPanel.svelte` — UPDATED, Eventor row + admin button
- [x] `apps/web/src/lib/stores/eventorStatus.svelte.ts` — FOUND
- [x] `apps/web/src/lib/stores/eventorStatus.svelte.test.ts` — FOUND
- [x] `apps/web/src/lib/screens/WalkupModal.svelte` — UPDATED, Bana + Hyrbricka + eventorHint
- [x] `apps/web/src/lib/screens/ReadoutView.svelte` — UPDATED, eventorHint $effect
- [x] `apps/web/src/lib/i18n/sv.json` — UPDATED, 17 new keys
- [x] `apps/web/src/lib/i18n/en.json` — UPDATED, 17 new keys
- [x] `packages/shared-types/src/dtos.ts` — UPDATED, Eventor schemas + hired_card on CompetitorCreateInput
- [x] `packages/shared-types/src/index.ts` — UPDATED, barrel re-exports
- [x] `tests/e2e/walkup-eventor.spec.ts` — FOUND, 4 cases all passing under Playwright
- [x] Commits: `dc87e0d`, `375707e`, `a12e088`, `bf3f61c`, `252d748`, `642d00c`, `cf9bab0` — all FOUND in `git log`

---

_Phase: 02-4-klubbs-mvp_
_Completed: 2026-05-17_
