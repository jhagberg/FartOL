---
phase: 01-single-laptop-training-mvp
plan: 12
subsystem: ui
tags: [svelte, wizard, file-import, c-h3, playwright, e2e]

requires:
  - phase: 01-04
    provides: GET /api/competitions (read endpoint backing HomeView load)
  - phase: 01-05
    provides: POST /api/competitions/from-wizard (atomic create+ingest endpoint)
  - phase: 01-11
    provides: AppShell + tokens + i18n catalog + api client base
provides:
  - HomeView (/) with hero + competition cards grid + empty state + Ny tävling CTA
  - NewCompetitionWizard 3-step shell with deferred-POST + single atomic from-wizard call
  - DropZone primitive (.xml drag-and-drop, comment-aware root-element check)
  - Wizard happy-path + C-H3 rollback regression Playwright e2e suite
affects: [01-13 readout view, 01-14 results view, future re-import flows]

tech-stack:
  added: []
  patterns:
    - Svelte 5 runes for wizard state machine ($state for step/file/error, $derived for can-advance gates)
    - Deferred-POST contract — pendingFile held in browser memory until step 3 commits
    - C-H3 atomic single-call pattern collapsing two-call wizard wire shape
    - Comment-/CDATA-stripping client-side XML root-element detection

key-files:
  created:
    - apps/web/src/lib/screens/HomeView.svelte
    - apps/web/src/lib/screens/NewCompetitionWizard.svelte
    - apps/web/src/lib/screens/WizardStep1.svelte
    - apps/web/src/lib/screens/WizardStep2.svelte
    - apps/web/src/lib/screens/WizardStep3.svelte
    - apps/web/src/lib/components/CompetitionCard.svelte
    - apps/web/src/lib/components/DropZone.svelte
    - apps/web/src/routes/competition/[id]/+page.svelte
    - apps/web/src/routes/competition/[id]/readout/+page.svelte
    - tests/e2e/wizard.spec.ts
    - tests/e2e/fixtures/wizard-corrupt-coursedata.xml
  modified:
    - apps/web/src/lib/api/client.ts
    - apps/web/src/routes/+page.svelte
    - tests/e2e/walking-skeleton.spec.ts

key-decisions:
  - File-to-base64 conversion: arrayBuffer → Uint8Array → chunked String.fromCharCode → btoa. Avoids FileReader.readAsDataURL's data:URL prefix and chunks at 0x8000 bytes to keep the spread arg-count safe for 5 MB inputs.
  - Playwright dispatched the drop event via setInputFiles on the DropZone's hidden file input — explicit, deterministic, and matches the user's click-to-pick path (drag-and-drop and click both route through the same handler).
  - WizardStep2's client-side root-element regex strips XML declaration AND comments AND CDATA before searching for the first element. The corrupt fixture's comment prose contains "<Name>" literals, which would otherwise win the root race and reject the file before it ever reached the server.
  - The reader-detect step uses a hard-coded 1600ms setTimeout in dev mode. Plan 13's readout view will subscribe to the bridge's connection_changed channel for authoritative status; the wizard's simulation is sufficient for the deferred-POST contract because no real card reads happen until after the goto.
  - Forced serial execution for wizard.spec.ts (test.describe.configure({ mode: 'serial' })) because both tests share the bridge's SQLite DB and the rollback test's row-count assertion would race with the happy-path test's successful create.

patterns-established:
  - "Wizard deferred-POST: file bytes held in $state until step 3; ZERO POSTs in steps 1+2; ONE atomic POST in step 3."
  - "Tagged-union API result: createCompetitionFromWizard returns { ok: true, data } | { ok: false, status, data } so callers branch on shape, not on ApiError instanceof."
  - "Client-side XML inspection: read first 4 KB only; strip declaration/comments/CDATA before regex-detecting root."

requirements-completed:
  - REQ-UI-002
  - REQ-EVT-CMP-001
  - REQ-EVT-CMP-002

duration: 73min
completed: 2026-05-14
---

# Phase 01 Plan 12: Home View + Three-Click Wizard Summary

**Three-click new-competition wizard with deferred-POST + single atomic /api/competitions/from-wizard call (Codex C-H3 LOCKED); HomeView + CompetitionCard + DropZone primitive; Playwright happy-path + corrupt-XML rollback regression e2e gate.**

## Performance

- **Duration:** ~73 min
- **Started:** 2026-05-14T19:25Z (approx)
- **Completed:** 2026-05-14T17:40Z (UTC)
- **Tasks:** 2 / 2
- **Files created:** 11
- **Files modified:** 3

## Accomplishments

- Retired the plan-03 walking-skeleton at `/` and landed the real HomeView with hero, auto-fill competition grid, empty state, and the `+ Ny tävling` CTA wired to `/competition/_new?wizard=1`.
- Three-step wizard end-to-end: step 1 (name + ISO-date text input), step 2 (file drop + client-side root-element preview), step 3 (simulated reader handshake → ONE atomic POST → goto readout). State machine implemented with Svelte 5 runes.
- C-H3 contract enforced and regression-gated: wizard step 3 fires exactly ONE POST to `/api/competitions/from-wizard`; the prior two-call wizard path (`createCompetition` + `importCompetitionFile`) is fully retired from the wizard UX. wizard.spec.ts asserts the wire shape (1 from-wizard, 0 old-endpoint) and the rollback invariant (corrupt XML → inline error → unchanged competitions row count).
- DropZone primitive reusable: drag-and-drop + click-to-pick + .xml extension gate + empty/has-file/error states + 44 px tap target.
- Competition route placeholder lands so `goto('/competition/<uuid>/readout')` resolves cleanly; plan 13 will replace the readout placeholder with the real component.

## Task Commits

1. **Task 1: HomeView + CompetitionCard + DropZone primitive + +page.svelte wiring** — `f946540` (feat)
2. **Task 2: NewCompetitionWizard 3 steps + ONE atomic POST + e2e regression gate** — `122cb1f` (feat)

## Files Created/Modified

### Created

- `apps/web/src/lib/screens/HomeView.svelte` — hero + auto-fill competition grid + empty state.
- `apps/web/src/lib/screens/NewCompetitionWizard.svelte` — 3-step shell, scrim, step indicator, deferred-POST orchestrator.
- `apps/web/src/lib/screens/WizardStep1.svelte` — name + ISO-date text/pattern input (no native date flicker).
- `apps/web/src/lib/screens/WizardStep2.svelte` — DropZone host + client-side root-element check + import preview.
- `apps/web/src/lib/screens/WizardStep3.svelte` — reader-handshake simulation + ONE atomic POST + Swedish error mapping.
- `apps/web/src/lib/components/CompetitionCard.svelte` — competition tile with progress bar + meta row.
- `apps/web/src/lib/components/DropZone.svelte` — drag-and-drop + click-to-pick + .xml filter primitive.
- `apps/web/src/routes/competition/[id]/+page.svelte` — wizard overlay for `_new?wizard=1`, otherwise bounce to readout.
- `apps/web/src/routes/competition/[id]/readout/+page.svelte` — placeholder (real readout lands in plan 13).
- `tests/e2e/wizard.spec.ts` — happy path + C-H3 rollback regression (serial mode, shared DB).
- `tests/e2e/fixtures/wizard-corrupt-coursedata.xml` — copy of edge XSD-invalid fixture for self-contained e2e.

### Modified

- `apps/web/src/lib/api/client.ts` — REPLACED old wizard signature with file-based `createCompetitionFromWizard` returning a tagged union.
- `apps/web/src/routes/+page.svelte` — mounts `HomeView` (walking-skeleton placeholder retired).
- `tests/e2e/walking-skeleton.spec.ts` — converted to `test.skip` with a comment routing the assertion to plan 13's readout e2e (the simulate-read button moved off `/`).

## Decisions Made

### File-to-base64 conversion approach

`arrayBuffer()` → `Uint8Array` → chunked `String.fromCharCode.apply(null, ...)` at 0x8000-byte boundaries → `btoa()`. Two reasons:

1. **No `data:` URL prefix.** `FileReader.readAsDataURL` emits `data:application/xml;base64,...` — we'd have to strip the prefix every time. Manual encoding is one less foot-gun.
2. **Stack-safe spread.** A 5 MB XML is ~5 000 000 args if you spread the whole Uint8Array. Chunked at 32 KB the spread stays bounded.

### Playwright file-drop dispatch

Used `setInputFiles` on the DropZone's hidden `<input type="file">` (test-id: `drop-zone-input`). The DropZone exposes both a click-to-pick path and a drag-and-drop path — both call the same `handleFile` handler so testing the click path covers the drop path's filtering logic. `setInputFiles` is also deterministic across CI vs local (no need to dispatch real drag events with `DataTransfer` payloads).

### C-H3 rollback test passes

Confirmed: the rollback regression test passes. The corrupt fixture (well-formed XML, XSD-invalid: Course missing required Name child) flows through:

1. Wizard step 2 client-side check: PASSES (root IS `<CourseData>`; comments stripped before regex).
2. Wizard step 3 atomic POST: server validates XSD, returns 400 `{ error: "xsd_invalid", errors: [...] }`.
3. Wizard maps error → "Filen är inte giltig IOF XML 3.0. {N} fel..."; sets `importError`; stays at `/competition/_new?wizard=1`.
4. Test asserts `GET /api/competitions` row count is unchanged from snapshot taken before the click → server's SQLite transaction rolled back. NO orphan competition row.

### Reader-detect simplification

Hard-coded 1600ms `setTimeout` flips `readerStatus` from `'opening'` to `'open'`. The real bridge `connection_changed` channel is plumbed by the SI bridge (plan 06) and surfaced to the UI via plan 13's readout view. For the wizard the simulation is sound because:

- No real card reads happen inside the wizard. The reader-detect step is purely a UX cue saying "now is a good time to set the reader on the desk."
- The deferred-POST contract means no DB state exists until the user actively clicks Starta avläsning — a wrong "ready" signal would just mean a no-op click, not a data integrity violation.

### Forced serial e2e mode

`test.describe.configure({ mode: 'serial' })` in `wizard.spec.ts`. Both tests share the bridge's SQLite DB (single edge process, single tmp DB path per the playwright.config.ts webServer entry). The rollback test asserts `competitions` row count is unchanged — but if the happy-path test runs in parallel and inserts a row, the count drifts. Serial mode is the surgical fix; alternative would be filtering by name (more brittle).

## Quirks / Notes

- **Comment-aware XML inspection (DropZone deviation):** The first revision of `WizardStep2.inspectFile` regexed the first 4 KB for `<\s*([A-Za-z_][A-Za-z0-9_-]*)` after stripping the XML declaration. The corrupt fixture's comment prose contains `<Name>` literals (the comment documents the missing-Name violation inline) which won the regex race — the dropzone surfaced "Root-elementet är <Name>" and refused the file. Fixed by stripping `<!--...-->` comments and `<![CDATA[...]]>` blocks before the root match. The plan didn't anticipate the comment-as-poison-pill; this counts as a Rule 1 auto-fix (the regex was broken under the corrupt fixture, blocking task 2's e2e verification).
- **i18n catalog:** All required keys (`home.*`, `wiz.*`) were already in `sv.json` + `en.json` from plan 11; no additions needed. (Plan 11 front-loaded the full catalog per UI-SPEC §Copywriting.)
- **walking-skeleton.spec.ts:** Converted to `test.skip` because the simulate-read button moved off `/`. The dev endpoint behind it (`/api/__dev/simulate-read`) still has full unit coverage in `apps/edge/src/routes/dev.test.ts`, and plan 13 will re-prove the WS-broadcast vertical in the readout e2e.
- **Svelte 5 wizard state shape:** Used flat `$state` declarations rather than a single `$state({ step, name, date, ... })` object. Flat reads better in this size and avoids accidental dependency re-tracking through the nested object accessor. The plan's `interfaces` block sketched the nested shape, but the flat translation is semantically equivalent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment-aware root-element regex in WizardStep2**

- **Found during:** Task 2 e2e — the rollback test failed because the corrupt fixture's preview banner never appeared.
- **Issue:** The client-side root detection regex matched `<Name>` inside the corrupt fixture's leading XML comment (the comment documents the missing-Name violation in prose).
- **Fix:** Added comment-stripping (`/<!--[\s\S]*?(?:-->|$)/g`) and CDATA-stripping (`/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/g`) before the root-element match.
- **Files modified:** `apps/web/src/lib/screens/WizardStep2.svelte`
- **Commit:** Folded into `122cb1f`.

**2. [Rule 3 - Blocking] walking-skeleton.spec.ts retired**

- **Found during:** Task 1 — replacing +page.svelte broke the walking-skeleton e2e (asserts on `<h1>fartOLa</h1>` and `simulate-read-btn`).
- **Issue:** The plan-03 e2e depended on the walking-skeleton placeholder that plan 12 retires.
- **Fix:** Converted spec to `test.skip` with a comment routing future readers to plan 13's readout e2e for the missing simulate-read assertion.
- **Files modified:** `tests/e2e/walking-skeleton.spec.ts`
- **Commit:** Folded into `f946540`.

**3. [Rule 1 - Bug] Forced serial e2e mode in wizard.spec.ts**

- **Found during:** Task 2 e2e — rollback test's row count drifted by 1 from the snapshot.
- **Issue:** Playwright's `fullyParallel: true` ran the two wizard tests in parallel against a shared bridge SQLite DB; the happy-path test's successful INSERT raced the rollback test's count snapshot.
- **Fix:** `test.describe.configure({ mode: 'serial' })` at the top of wizard.spec.ts.
- **Files modified:** `tests/e2e/wizard.spec.ts`
- **Commit:** Folded into `122cb1f`.

### Architectural Changes

None.

## Verification

| Check                                                                                 | Result                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm --filter @fartola/web typecheck`                                                 | PASS                                         |
| `pnpm --filter @fartola/web test` (vitest)                                             | PASS — 14 tests across 4 files               |
| `pnpm --filter @fartola/web build` (SvelteKit + adapter-static)                        | PASS                                         |
| `pnpm --filter @fartola/edge build` (tsup CJS + DTS)                                   | PASS                                         |
| `npx playwright test tests/e2e/wizard.spec.ts` (with FARTOLA_DEV=1)                    | PASS — 2 / 2                                 |
| Full e2e suite (`npx playwright test`)                                                | PASS — 2 / 2 active (2 skipped placeholders) |
| C-H3 wire-shape regression (1 from-wizard POST, 0 /api/competitions POSTs)            | PASS                                         |
| C-H3 rollback regression (competitions row count unchanged after corrupt-XML failure) | PASS                                         |

## Self-Check: PASSED

- All listed key-files exist on disk (verified via `git diff --stat` + `git status` after each commit).
- All commit hashes resolve in `git log`:
  - `f946540` — `feat(01-12): land HomeView + CompetitionCard + DropZone primitive`
  - `122cb1f` — `feat(01-12): three-click wizard + atomic from-wizard POST (C-H3)`
- No deletions across the plan window: `git diff --diff-filter=D --name-only f946540~1 122cb1f` returns empty.
- C-H3 contract enforced and regression-gated by wizard.spec.ts test 2 (PASSES).
