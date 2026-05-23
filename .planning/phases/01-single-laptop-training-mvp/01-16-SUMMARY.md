---
phase: 01-single-laptop-training-mvp
plan: 16
subsystem: export
tags: [iof-xml, resultlist, xsd, export, fast-xml-parser, fastify, svelte]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides: |
      plan 05 validateXml + bundled IOF.xsd;
      plan 07 reduce() → CompetitionState;
      plan 08 projectionStore.recomputeNow();
      plan 11 typed REST client wrapper.
provides:
  - IOF XML 3.0 ResultList export builder (apps/edge/src/xml/iofExport.ts) with
    XSD-order element emission, conservative subset of the spec, and frozen
    fixture round-trip.
  - GET /api/competitions/:id/export/preview and
    GET /api/competitions/:id/export?format=iof30 routes (apps/edge/src/routes/export.ts)
    gated by validateAndBuild — SC#6 binding contract enforced at the route boundary.
  - /competition/[id]/export page + ExportView Svelte component with type toggle,
    inline validation panel, disabled-until-valid download CTA.
  - exportPreview + exportDownloadUrl on apps/web/src/lib/api/client.ts.
  - tests/e2e/export.spec.ts (2 specs: preview-green + download-streams).
affects:
  - Phase 1 plans 17 + 18 (Wave 5 continuation).
  - Future Eventor sync (Phase 2): the conservative-subset elements are
    the safe interop surface.

# Tech tracking
tech-stack:
  added: []  # No new deps; reuses fast-xml-parser + xmllint-wasm from plan 05.
  patterns:
    - "XSD-order key insertion into fast-xml-parser XMLBuilder trees — JS object
      property order maps 1:1 to emitted XML element order."
    - "Deterministic now() injection on builder inputs for byte-stable
      frozen-fixture tests."
    - "Route-level validateAndBuild gate before any response body is written."

key-files:
  created:
    - apps/edge/src/xml/iofExport.ts
    - apps/edge/src/xml/iofExport.test.ts
    - apps/edge/test/fixtures/iof30-resultlist-expected.xml
    - apps/edge/src/routes/export.ts
    - apps/edge/src/routes/export.test.ts
    - apps/web/src/lib/screens/ExportView.svelte
    - apps/web/src/routes/competition/[id]/export/+page.svelte
    - tests/e2e/export.spec.ts
    - .planning/phases/01-single-laptop-training-mvp/deferred-items.md
  modified:
    - apps/edge/src/server.ts
    - apps/web/src/lib/api/client.ts
    - playwright.config.ts

key-decisions:
  - "Bundled IOF.xsd ResultListStatus restriction is {Complete | Delta | Snapshot}.
    The plan's frontmatter quoted {Complete | Delta | Snapshot | Refused}; the
    'Refused' value is not present in this XSD dialect. The W-4 mapping
    (Final → Complete, Provisional → Snapshot) still resolves to enum-valid
    values, so the contract holds without dialect adjustment. Documented in
    iofExport.ts module header + iofExport.test.ts test 3 ALLOWED set."
  - "Emitted PersonRaceResult element order is BibNumber? → StartTime? →
    FinishTime? → Time? → Position? → Status (required). The XSD enforces
    strict sequence order; first emission attempt with Status leading caused
    XSD validation errors, and fast-xml-parser's XMLBuilder preserves JS
    insertion order. Re-keyed the object literal accordingly."
  - "StartTime/FinishTime are omitted for Phase 1 (no robust ISO dateTime
    derivation from HalfDayClock without an operator-set local wall-clock
    base). Time (elapsed seconds) IS emitted. The XSD makes Start/Finish
    minOccurs=0; a later phase can plumb them through when wall-clock
    reconstruction lands."
  - "ExportView uses inline Swedish strings instead of i18n keys — UI-SPEC
    locked Swedish copy and only the existing 'nav.export' key was in the
    catalog. Adding ~6 new i18n keys for one screen is bigger than the
    surface justifies; future i18n cleanup can lift them as needed."
  - "Slugify drops combining diacritics via NFKD + U+0300..U+036F strip
    before the [^a-z0-9] replace — 'Storå Träning' → 'stora-traning' instead
    of 'storå-träning' (the latter is technically a valid path char on Linux
    but breaks Windows clients)."

patterns-established:
  - "Pattern: deterministic builder time injection — pass `now: () => Date`
    into the builder so frozen-fixture tests are byte-stable. Mirrors plan
    05's NDJSON test pattern."
  - "Pattern: route-level validateAndBuild gate — the body is built then
    validated; on failure the route returns a 400 with structured
    errors[]. No partial XML is ever streamed (SC#6 binding contract)."

requirements-completed:
  - REQ-EVT-CMP-008
  - REQ-STD-002

# Metrics
duration: ~35min
completed: 2026-05-15
---

# Phase 1 Plan 16: IOF ResultList 3.0 export Summary

**XSD-validated IOF XML 3.0 ResultList export — builder + 2 REST endpoints + Svelte view + e2e — wired through validateAndBuild so SC#6 (no partial XML streamed) is enforced at the route boundary.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-15T08:30:00Z (approximate — captured at executor spawn)
- **Completed:** 2026-05-15T07:05:21Z
- **Tasks:** 2 / 2
- **Files modified/created:** 12

## Accomplishments

- `buildResultListXml` emits a conservative subset of the IOF 3.0 ResultList
  schema in XSD-required sequence order, validated against the bundled
  IOF.xsd. W-4 @status mapping locked (Final → 'Complete',
  Provisional → 'Snapshot'); W-5 empty-competition valid 200 path locked.
- `validateAndBuild` gates every export — XSD validation precedes any body
  write (SC#6 binding contract).
- Two REST endpoints (`/preview` + `?format=iof30`) registered on the
  Fastify server with correct Content-Disposition: attachment headers and
  Final/Provisional toggle support.
- `/competition/[id]/export` Svelte page with type toggle, inline
  validation panel (green check or red XSD error list), and a
  disabled-until-valid download CTA.
- 11 builder + helper tests + 6 route tests + 2 e2e specs. All 259
  apps/edge unit tests pass. Both export e2e specs pass when run alone or
  paired with any one other spec.

## Task Commits

1. **Task 1: builder + frozen fixture + tests** — `bc0506c` (feat)
2. **Task 2: REST routes + ExportView + e2e** — `57c3753` (feat)

## Files Created/Modified

- `apps/edge/src/xml/iofExport.ts` — builder + validateAndBuild + helpers
  (splitName, statusForXml, resultListStatusFor). Emits elements in XSD
  sequence order; deterministic `now()` for fixture stability.
- `apps/edge/src/xml/iofExport.test.ts` — 11 tests including byte-equal
  frozen fixture, @status enum regression gate, empty-competition gate,
  status mapping, null club handling, round-trip parse.
- `apps/edge/test/fixtures/iof30-resultlist-expected.xml` — frozen
  fixture from the seeded "StorTuna Tisdag 2026-05-19" scenario
  (Anna OK 12:00 place 1, Bo MP 13:20, Cia DNF). Built by running
  the builder with `now: () => new Date('2026-05-19T18:30:00.000Z')`
  and `creator: 'fartOLa test v0.0'`; the test re-runs that exact
  invocation and asserts byte-equality.
- `apps/edge/src/routes/export.ts` — preview + download endpoints with
  C-L1 default-status (`Final → Complete`), W-5 empty-competition
  200-not-422 contract, and the 400 on XSD invalid path.
- `apps/edge/src/routes/export.test.ts` — 6 route tests covering the
  preview success path, download Content-Type + W-4 enum gate,
  unsupported format → 400, Provisional toggle, W-5/C-L1 empty
  competition default-status round-trip, and 404 on unknown competition.
- `apps/edge/src/server.ts` — register export routes after the existing
  route block.
- `apps/web/src/lib/api/client.ts` — `exportPreview` + `exportDownloadUrl`
  - `ExportStatus` / `ExportPreviewResult` / `ExportPreviewError` types.
- `apps/web/src/lib/screens/ExportView.svelte` — three-section page
  (Exporttyp / Validering / Nedladdning), `$effect` to refresh preview
  on toggle, `<a href>` CTA that bypasses fetch so the browser handles
  the file save via the server's Content-Disposition header.
- `apps/web/src/routes/competition/[id]/export/+page.svelte` — thin
  shell that forwards page.params.id to ExportView (mirrors the
  existing readout/results page shells).
- `tests/e2e/export.spec.ts` — two specs: "preview validation green +
  download enabled" + "download streams an IOF XML 3.0 ResultList".
- `playwright.config.ts` — set `FARTOLA_PRINTER=stdout` on the webServer
  env (Rule 3 blocker — see Deviations).
- `.planning/phases/01-single-laptop-training-mvp/deferred-items.md` —
  parallel e2e flake doc (Rule SCOPE BOUNDARY — not in plan 16's scope).

## Decisions Made

See `key-decisions` in the frontmatter above (5 decisions, the most
load-bearing being the XSD enum dialect note and the PersonRaceResult
sequence-order fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] PersonRaceResult element sequence-order mismatch**

- **Found during:** Task 1 (builder + frozen fixture)
- **Issue:** Initial implementation emitted `<Status>` first inside the
  `<Result>` block, and `<Organisation>` after `<Result>` inside
  `<PersonResult>`. The XSD enforces strict `sequence` order, and the
  bundled IOF.xsd validator (xmllint-wasm) rejected both orderings with
  "Element X: This element is not expected" errors. fast-xml-parser's
  XMLBuilder preserves JS object insertion order — the fix was to
  re-key the literal so `Result` ends with `Status` and `PersonResult`
  emits `Person → Organisation? → Result`.
- **Fix:** Rebuilt the `result` and `node` objects with the XSD-required
  key order; documented inline + in the SUMMARY's key-decisions.
- **Files modified:** apps/edge/src/xml/iofExport.ts (buildPersonResult)
- **Verification:** validateAndBuild on the seeded fixture now returns
  `valid: true`; the four prior XSD errors disappear.
- **Committed in:** `bc0506c` (task 1 commit).

**2. [Rule 3 — Blocking] Playwright FARTOLA_PRINTER=stdout for dev simulate-read**

- **Found during:** Task 2 (e2e first run)
- **Issue:** The default production printer sink (CUPS, set in
  `apps/edge/src/bin/fartola.ts:resolvePrinterConfig`) renders the
  `classic` ESC/POS template, which dereferences
  `data.competition.name`. But `apps/edge/src/routes/dev.ts`
  simulate-read only sends `{ punches: [...] }` in `envelope.data`,
  so `/api/__dev/simulate-read` 500s with
  "Cannot read properties of undefined (reading 'name')". The plan's
  e2e couldn't proceed past setup.
- **Fix:** Set `FARTOLA_PRINTER=stdout` on the Playwright `webServer`
  env so dev simulate-read uses the JSON-line stdout sink the
  walking-skeleton e2e was originally authored against. This matches
  the broader pattern: dev/CI uses stdout, production hardware uses
  CUPS or direct ESC/POS. The mismatch between dev.ts's payload shape
  and cups-sink's expectations is a pre-existing bug outside this
  plan's scope; the env override is the minimum fix that unblocks
  the e2e without touching plan-15's printer pipeline.
- **Files modified:** playwright.config.ts
- **Verification:** Both export e2e specs pass; the previously-failing
  simulate-read returns 201.
- **Committed in:** `57c3753` (task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocker)
**Impact on plan:** Both auto-fixes were correctness-required.
Deviation 1 was internal to plan 16 (own bug); deviation 2 is an
external environment workaround (the underlying dev.ts↔cups-sink
mismatch lives in plan 15's scope and is captured in
`deferred-items.md` for follow-up).

## Issues Encountered

- **Parallel e2e flake** under heavy worker load. Adding the 2 export
  e2e specs to the suite pushed Playwright's worker pool past a
  timing margin where `tests/e2e/results.spec.ts > live results
update via WS` (and occasionally walkup/readout specs) flake on
  WS/SvelteKit-dev contention. The export specs themselves are
  deterministic — they pass alone and paired with any other single
  spec. Documented in `deferred-items.md`; not a regression caused
  by plan 16's code (verified by re-running the full suite with
  `export.spec.ts` moved aside: 13 pass + 2 skip + 0 fail).

## Known Stubs

None. ExportView renders real preview data; the download CTA navigates
to a real route that serves real validated XML.

## Threat Flags

None. The export path is server-side-derivation only (no user-supplied
XML), and the SC#6 validate-before-write gate covers the
T-XSD-INVALID-LEAK + T-PARTNER-INTEROP threats in the plan's threat
register.

## Self-Check

### Files

- FOUND: apps/edge/src/xml/iofExport.ts
- FOUND: apps/edge/src/xml/iofExport.test.ts
- FOUND: apps/edge/test/fixtures/iof30-resultlist-expected.xml
- FOUND: apps/edge/src/routes/export.ts
- FOUND: apps/edge/src/routes/export.test.ts
- FOUND: apps/edge/src/server.ts (modified — export route registered)
- FOUND: apps/web/src/lib/screens/ExportView.svelte
- FOUND: apps/web/src/routes/competition/[id]/export/+page.svelte
- FOUND: apps/web/src/lib/api/client.ts (modified — exportPreview added)
- FOUND: tests/e2e/export.spec.ts
- FOUND: playwright.config.ts (modified — FARTOLA_PRINTER=stdout)
- FOUND: .planning/phases/01-single-laptop-training-mvp/deferred-items.md

### Commits

- FOUND: bc0506c (task 1)
- FOUND: 57c3753 (task 2)

## Self-Check: PASSED

## Next Phase Readiness

- Plans 17 + 18 (Wave 5 continuation) unblocked. The frozen fixture
  - the validate-before-write contract are stable points future plans
    can rely on without re-deriving them.
- Pre-existing parallel-e2e flake (deferred-items.md) does NOT block
  forward progress; it's a CI-tuning task for a later cleanup plan.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-15_
