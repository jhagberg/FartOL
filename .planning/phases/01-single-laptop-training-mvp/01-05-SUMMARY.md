---
phase: 01-single-laptop-training-mvp
plan: 05
subsystem: import
tags: [xml, import, iof30, purple-pen, xsd, security, atomic-wizard, C-H3, C-M4, C-L2]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 02
    provides: 'openDatabase + Drizzle schema (competitions / classes / controls / courses / course_controls / competitors / clubs); competitors.consent_status enum incl pending_first_read'
  - phase: 01-single-laptop-training-mvp
    plan: 04
    provides: 'buildServer factory + REST route registration pattern; _zod-errors issuesToErrors mapper; @fastify/sensible + @fastify/cors registration order'
provides:
  - 'apps/edge/src/xml/parse.ts — root-dispatching IOF XML 3.0 parser (CourseData + EntryList) with T-FILE-IMPORT pre-flight'
  - 'apps/edge/src/xml/validate.ts — xmllint-wasm XSD validator backed by the bundled IOF.xsd (commit 24eb108e)'
  - 'apps/edge/src/xml/IOF.xsd — bundled IOF XML 3.0 schema; copied to dist/xml/IOF.xsd at build time'
  - 'apps/edge/src/ingest/courseImport.ts — ingestCourseData with opts.outerTransaction seam (C-H3)'
  - 'apps/edge/src/ingest/entryImport.ts — ingestEntryList with consent_status=pending_first_read + consent_at_ms=null (C-M4 LOCKED)'
  - 'apps/edge/src/routes/import.ts — POST /api/competitions/:id/import (multipart, existing comp)'
  - 'apps/edge/src/routes/competitionsFromWizard.ts — POST /api/competitions/from-wizard (atomic create+import, C-H3)'
  - 'apps/edge/test/fixtures/{coursedata-sample, entrylist-sample, coursedata-corrupt, xml-bomb}.xml — four locked fixtures'
affects: [01-06, 01-07, 01-08, 01-12, 01-14, 01-15, 01-16, 01-17]

# Tech tracking
tech-stack:
  added:
    - 'fast-xml-parser@^5.2.0 (dep) — safe-by-default XML parser; processEntities=false + DOCTYPE pre-flight close T-FILE-IMPORT'
    - 'xmllint-wasm@^5.0.0 (dep) — pure-WASM libxml2 XSD validator; chosen over libxmljs2-xsd to avoid another native postinstall on top of better-sqlite3'
    - '@fastify/multipart@^9.0.0 (dep) — multipart/form-data parser for /api/competitions/:id/import'
  patterns:
    - 'PATTERNS S-1 file-header citing C-H3 + C-M4 + C-L2 reviews in every new .ts file'
    - 'PATTERNS S-3 lazy native-binding pattern adapted for xmllint-wasm (schema parsed once at module load; bytes cached)'
    - 'PATTERNS S-5 HERE-relative path resolution for IOF.xsd resolves correctly under tsx (src/xml) AND under the published tarball (dist/xml)'
    - 'opts.outerTransaction seam on both ingesters — caller-managed transaction toggle is the C-H3 atomic-wizard mechanism (single sqlite.transaction wraps competition INSERT + ingest)'

key-files:
  created:
    - 'apps/edge/src/xml/IOF.xsd (216 KB, bundled IOF XML 3.0 schema, commit 24eb108e 2020-04-22)'
    - 'apps/edge/src/xml/NOTICE-iof-xsd.md (attribution + source URL + commit hash + update protocol)'
    - 'apps/edge/src/xml/parse.ts (~270 lines — root dispatcher + DOCTYPE/ENTITY pre-flight + normalizers)'
    - 'apps/edge/src/xml/validate.ts (~90 lines — xmllint-wasm wrapper, schema cached at module load)'
    - 'apps/edge/src/xml/parse.test.ts (7 node:tests; T-FILE-IMPORT + C-L2 gates)'
    - 'apps/edge/src/xml/validate.test.ts (6 node:tests; C-H3 input gate verified)'
    - 'apps/edge/src/ingest/courseImport.ts (~150 lines — ingestCourseData + opts.outerTransaction)'
    - 'apps/edge/src/ingest/entryImport.ts (~140 lines — ingestEntryList + C-M4 consent semantics + entrylist_without_courses throw)'
    - 'apps/edge/src/ingest/courseImport.test.ts (4 node:tests)'
    - 'apps/edge/src/ingest/entryImport.test.ts (5 node:tests; C-M4 regression gate)'
    - 'apps/edge/src/routes/import.ts (~135 lines — multipart upload, dispatches on root element)'
    - 'apps/edge/src/routes/competitionsFromWizard.ts (~175 lines — atomic create+import in one sqlite.transaction, C-H3 LOCKED)'
    - 'apps/edge/src/routes/import.test.ts (7 node:tests — multipart end-to-end)'
    - 'apps/edge/src/routes/competitionsFromWizard.test.ts (9 node:tests; tests 2+3 are the C-H3 regression gates)'
    - 'apps/edge/test/fixtures/iof30-coursedata-sample.xml (valid CourseData: 2 classes + 4 controls + 2 courses + ClassCourseAssignments)'
    - 'apps/edge/test/fixtures/iof30-entrylist-sample.xml (valid EntryList: 3 PersonEntry rows; one null club, one null card)'
    - 'apps/edge/test/fixtures/iof30-coursedata-corrupt.xml (XSD-invalid: Course missing required Name child — C-H3 regression input)'
    - 'apps/edge/test/fixtures/iof30-xml-bomb.xml (billion-laughs DOCTYPE attempt — rejected at pre-flight)'
  modified:
    - 'apps/edge/package.json (+ fast-xml-parser, xmllint-wasm, @fastify/multipart deps; build script appends mkdir -p dist/xml && cp src/xml/IOF.xsd dist/xml/IOF.xsd; files [] array adds drizzle/ + dist/xml/IOF.xsd)'
    - 'apps/edge/src/server.ts (+ registerImportRoutes + registerCompetitionsFromWizard registrations after the plan-04 routes)'
    - 'pnpm-lock.yaml (regenerated for the three new deps)'

key-decisions:
  - 'xmllint-wasm over libxmljs2-xsd. RESEARCH §"Open Question 1" asked us to try libxmljs2-xsd first and fall back. We went straight to xmllint-wasm: we already have native builds for better-sqlite3 + @serialport/bindings-cpp under pnpm 10+ onlyBuiltDependencies, and adding a third native build (libxml2 via libxmljs2-xsd) is more breakage surface than the pure-WASM alternative. xmllint-wasm validates a ~3 KB document in ~150-250 ms cold, ~150 ms warm — plenty fast for a one-shot import upload. Documented in NOTICE-iof-xsd.md and the validate.ts header.'
  - 'IOF.xsd commit pinned to 24eb108e (2020-04-22, master HEAD as of plan execution date). The XSD has not seen a release tag; the master branch is the canonical reference and 24eb108e is the current HEAD. NOTICE-iof-xsd.md documents the update protocol: re-download, overwrite, update the commit line, re-run validate.test.ts.'
  - "opts.outerTransaction toggle pattern over async-context magic. The C-H3 atomic guarantee requires the ingester to RUN INSIDE the caller's sqlite.transaction without opening a nested one. We exposed this as an explicit boolean option on ingestCourseData / ingestEntryList rather than threading an AsyncLocalStorage-based transaction context. Cost: callers must pass { outerTransaction: true } when nested. Benefit: zero magic, fully typed, easy to test (the courseImport.test.ts test 4 + entryImport tests exercise both modes)."
  - 'EntryList partial-import surfaces missing classes as a result field, NOT as an error. The plan asked whether the executor should surface missing-class warnings as a top-level result field. Answer: YES — `result.classes_missing: string[]` is the contract. The route echoes it through to the client so the wizard can render a single "Some entries skipped: H45, D17" warning toast without aborting the upload. The harder error case (ALL competitors fall through to classes_missing — i.e. no classes exist in the competition yet) throws inside doIngest so the from-wizard atomic transaction rolls back; that surfaces as 422 entrylist_without_courses.'
  - 'Idempotency at the class + control layer, fresh UUIDs at the course layer. Purple Pen re-emits the entire course list on every export, so trying to merge courses across imports is brittle. ingestCourseData reuses classes by (competition_id, name) and controls by (competition_id, code), but inserts every Course as a new row with a fresh UUID. Callers wanting a true re-import should DELETE FROM courses first. Idempotency at the lower layers is what the test 2 covers; the upper layer is documented in the courseImport.ts header.'
  - 'Course unknown-control code → hard throw, not auto-create. The schema requires every course_control row to point at a real controls row via FK. Two choices on encountering a Course that mentions a control code not declared at the top of the RaceCourseData: (a) auto-create it on the fly, (b) throw and roll back the transaction. The plan and the C-H3 regression test 3 both demand (b) — the throw inside doIngest is the explicit seam the from-wizard endpoint uses to prove its rollback guarantee. Auto-create would silently mask malformed Purple Pen exports.'
  - 'Route bodyLimit for /from-wizard set to 7.5 MB. We need to admit a 5 MB decoded XML (= ~6.7 MB base64) plus the JSON envelope (~200 bytes). 7.5 MB gives ~800 KB headroom. Genuinely oversized payloads (>5.6 MB raw) get caught by Fastify''s bodyLimit BEFORE our decoded-byte check fires — that''s still a 413 with the generic "Payload Too Large" body, which is correct mitigation but produces a less precise error code. The test for this acknowledges both shapes are correct.'
  - 'Path-traversal defense-in-depth on multipart route is functionally unreachable but kept. @fastify/multipart already strips the path component from filenames before our handler sees them (busboy basename behavior). Test 6 verifies the upload succeeds with a sanitized "passwd.xml" — the includes("..") check in import.ts is defense-in-depth in case a future multipart upgrade changes behavior. The from-wizard endpoint (test 4) is where the check is load-bearing because the filename arrives via JSON, never multipart.'

requirements-completed:
  - REQ-EVT-CMP-002
  - REQ-EVT-CMP-003
  - REQ-STD-001
  - REQ-PRIV-001

# Metrics
duration: ~45min
completed: 2026-05-14
---

# Phase 1 Plan 05: Single XML Importer + Atomic Wizard Endpoint Summary

**Lands the three Phase 1 import requirements behind ONE parser, ONE XSD validator, two ingester functions, and two endpoints — plus the C-H3 atomic-wizard endpoint that makes orphan competition rows impossible on import failure. Purple Pen `.xml`, IOF XML 3.0 CourseData, and IOF XML 3.0 EntryList all dispatch off the same root-element parser. T-FILE-IMPORT mitigated (`processEntities: false` + DOCTYPE pre-flight + bodyLimit). Plan 12 wizard step 3 now fires ONE POST to /api/competitions/from-wizard instead of two sequential POSTs.**

## Performance

- **Duration:** ~45 min (XSD download + native deps install + 4 fixture files + two route handlers + 38 tests + two prettier/eslint auto-fix cycles + build-script `mkdir -p` follow-up)
- **Started:** 2026-05-14T14:30Z (approx)
- **Completed:** 2026-05-14T15:15Z
- **Tasks:** 2 / 2
- **Files created:** 18
- **Files modified:** 3
- **Tests added:** 38 new node:tests (7 parse + 6 validate + 4 courseImport + 5 entryImport + 7 import-route + 9 from-wizard = 38; suite 113/113 green, was 75 before this plan)

## Accomplishments

- **Single parser dispatches on root element.** `parseIofXml('<CourseData ...>')` returns `{ kind: 'CourseData', data: ParsedCourseData }`; `parseIofXml('<EntryList ...>')` returns `{ kind: 'EntryList', data: ParsedEntryList }`. Three requirements (REQ-EVT-CMP-002 Purple Pen + REQ-EVT-CMP-003 IOF EntryList + REQ-STD-001 IOF XML 3.0) collapse to one importer. C-L2 wording is enforced in the unsupported-root error message: "Note: Purple Pen .xml IS valid IOF XML 3.0 CourseData but does not carry entries; upload an EntryList file for competitor data."

- **T-FILE-IMPORT mitigated in the same wave it was introduced.** Three defenses stacked:
  1. `processEntities: false` on the fast-xml-parser config — declared entities are never expanded.
  2. Pre-flight `/<!DOCTYPE/i` + `/<!ENTITY/i` regex rejection so billion-laughs/external-entity attempts never reach the parser at all.
  3. Fastify route-level body caps: multipart `fileSize: 5 MB`, from-wizard `bodyLimit: 7.5 MB`, plus an explicit decoded-bytes check inside the handler.

  `parse.test.ts` test 3 reads the xml-bomb fixture and asserts `parseIofXml` throws `DOCTYPE not allowed` BEFORE the bytes reach fast-xml-parser.

- **XSD validation gates every ingest.** Both endpoints call `validateXml(xmlSource)` before opening a DB transaction. The bundled IOF.xsd is read once at module load (`__schemaInfo.bytes > 1000` smoke-checked in test 1). xmllint-wasm runs in pure WebAssembly — no native postinstall, no platform-specific binary fragility.

- **C-H3 atomic-wizard endpoint LOCKED end-to-end.** `POST /api/competitions/from-wizard` wraps competition INSERT + ingest in a single `app.fartolaDb.sqlite.transaction(() => { ... })`. The two regression tests are GREEN:
  - `competitionsFromWizard.test.ts` test 2 (early-exit rollback): posting the corrupt CourseData fixture returns 400 xsd_invalid and the competitions row count is unchanged.
  - `competitionsFromWizard.test.ts` test 3 (mid-transaction rollback — THE GATE): a custom adversarial CourseData that PASSES parse + XSD but mentions an undeclared control code throws inside `ingestCourseData` → the transaction rolls back → 422 ingest_failed → competitions row count unchanged. This is the canonical C-H3 regression input.
  - Test 7 covers the C-M4 + entrylist_without_courses path: posting an EntryList against an empty competition rolls back the competition INSERT.

- **C-M4 EntryList consent semantics LOCKED.** Every imported competitor row gets `consent_at_ms = NULL` AND `consent_status = 'pending_first_read'`. The `consentAtMs` parameter on `ingestEntryList` is retained for backward compatibility but IGNORED for EntryList imports (documented in the function header). `entryImport.test.ts` test 4 is the regression gate: it explicitly SELECTs every imported row and asserts both column values. `import.test.ts` test 2 verifies the same contract end-to-end via the multipart upload route. Plan 14 will surface the one-time confirmation toast that flips status → `confirmed_on_read` + sets `consent_at_ms = Date.now()`.

- **Plan 12 wizard step 3 shape is locked.** The wizard sends ONE JSON POST:

  ```json
  POST /api/competitions/from-wizard
  {
    "name": "StorTuna Tisdag",
    "date": "2026-05-22",
    "xml_file": { "name": "course.xml", "content_base64": "<base64>" }
  }
  ```

  201 returns `{ competition_id, kind: 'CourseData', classes_created: 2, controls_created: 4, courses_created: 2 }`. 400/422 returns include a precise `error` code so the wizard can render a precise toast (`xsd_invalid` / `parse_failed` / `ingest_failed` / `entrylist_without_courses` / `bad_filename` / `bad_base64` / `file_too_large`).

- **IOF.xsd bundled + shipped.** The schema is committed at `apps/edge/src/xml/IOF.xsd` (4316 lines, ~216 KB); the build script copies it to `dist/xml/IOF.xsd` so the published tarball ships the schema. The `files` array in `apps/edge/package.json` now includes `drizzle/` and `dist/xml/IOF.xsd` so both migration files AND the schema land in the npm tarball (REQ-OPS-001 single-binary install).

## Task Commits

Each task committed atomically:

1. **Task 1: Bundle IOF.xsd + safe XML parser + XSD validator + adversarial fixtures** — `d2c0522` (feat)
2. **Task 2: Ingesters + import route + atomic /from-wizard (C-H3) + C-M4 consent semantics** — `2cf341b` (feat)

_No plan metadata commit lands from this agent — the orchestrator owns STATE.md / ROADMAP.md updates._

## Files Created / Modified

### Created — apps/edge/src/xml/

- `IOF.xsd` — verbatim IOF XML 3.0 schema (commit 24eb108e of github.com/international-orienteering-federation/datastandard-v3).
- `NOTICE-iof-xsd.md` — attribution + source URL + commit hash + bundle date + update protocol.
- `parse.ts` — single root-dispatching parser; T-FILE-IMPORT pre-flight; ParsedCourseData + ParsedEntryList normalized shapes.
- `validate.ts` — xmllint-wasm wrapper; schema cached at module load; `validateXml(xmlSource)` returns `Promise<{ valid; errors: XsdError[] }>`.
- `parse.test.ts` — 7 node:tests (3 happy-path + 4 adversarial).
- `validate.test.ts` — 6 node:tests (3 happy-path + 2 XSD-fail + 1 schema-info).

### Created — apps/edge/src/ingest/

- `courseImport.ts` — `ingestCourseData(handle, competitionId, data, opts?)`. Class + control idempotency via (competition_id, name/code); fresh course UUIDs every import; throws on unknown control code → transaction rolls back; `opts.outerTransaction=true` skips the wrap.
- `entryImport.ts` — `ingestEntryList(handle, competitionId, data, nowMs, opts?)`. C-M4 consent semantics LOCKED (pending_first_read + null). Missing-class names accumulated; if EVERY competitor is rejected for missing class, throws → from-wizard maps to 422 entrylist_without_courses.
- `courseImport.test.ts` — 4 node:tests (happy + idempotent + unknown-control + outer-tx seam).
- `entryImport.test.ts` — 5 node:tests (happy + missing-class partial + duplicate-card-skip + C-M4 consent gate + entrylist-without-classes throw).

### Created — apps/edge/src/routes/

- `import.ts` — `POST /api/competitions/:id/import`. Multipart parse → filename sanitize → parseIofXml → validateXml → competition exists check → dispatch ingester. 400/404/413/422 surface every failure mode with structured error codes.
- `competitionsFromWizard.ts` — `POST /api/competitions/from-wizard`. JSON body with base64 XML; atomic competition INSERT + ingest in ONE sqlite.transaction (C-H3 LOCKED).
- `import.test.ts` — 7 node:tests (happy CourseData + happy EntryList incl C-M4 column check + xml-bomb + xsd_invalid + unknown competition + path-traversal sanitized by multipart + unknown root).
- `competitionsFromWizard.test.ts` — 9 node:tests including the two C-H3 regression gates (tests 2 + 3) + path-traversal in JSON (test 4) + decoded-size cap (test 5) + bad_base64 (test 6) + entrylist_without_courses (test 7) + parse_failed (test 8) + missing required field (test 9).

### Created — apps/edge/test/fixtures/

- `iof30-coursedata-sample.xml` — 2 classes (H21, D21) + 4 controls (31, 32, 33, 34) + 2 courses (Bana 1: 31-32-33-34; Bana 2: 34-33-32-31) + 2 ClassCourseAssignments. Event name "StorTuna Tisdag".
- `iof30-entrylist-sample.xml` — 3 PersonEntry rows: Anna Andersson / StorTuna OK / H21 / SI card 7501853; Bo Berg / StorTuna OK / H21 / no card; Cia Carlsson / no org / D21 / SI card 1428824.
- `iof30-coursedata-corrupt.xml` — XSD-invalid: Course element missing its required Name child. The C-H3 regression input.
- `iof30-xml-bomb.xml` — DOCTYPE + nested ENTITY definitions (billion-laughs attempt). Rejected at pre-flight.

### Modified

- `apps/edge/package.json` — added `fast-xml-parser@^5.2.0`, `xmllint-wasm@^5.0.0`, `@fastify/multipart@^9.0.0` to dependencies. `scripts.build` now: `tsup && mkdir -p dist/xml && cp src/xml/IOF.xsd dist/xml/IOF.xsd`. `files`: `["dist", "drizzle", "dist/xml/IOF.xsd"]`.
- `apps/edge/src/server.ts` — registered `registerImportRoutes` + `registerCompetitionsFromWizard` after the plan-04 routes.
- `pnpm-lock.yaml` — regenerated for the three new deps + their transitive surface.

## Decisions Made

1. **xmllint-wasm over libxmljs2-xsd.** RESEARCH §"Open Question 1" suggested trying libxmljs2-xsd first; we went directly to xmllint-wasm to keep the project on a pure-JS XSD path. Three native binders (better-sqlite3, @serialport/bindings-cpp, libxmljs2) under pnpm 10+'s `onlyBuiltDependencies` allow-list is one binder too many — every native package adds a CI-fragility surface. xmllint-wasm validates a 3 KB document in ~150-250 ms cold, ~150 ms warm; that's well inside the wizard's UX budget (the import is a one-shot click, not a hot path). Trade-off recorded in NOTICE-iof-xsd.md and the validate.ts header.

2. **IOF.xsd commit pinned to 24eb108e (2020-04-22).** The IOF datastandard-v3 repo has no release tags — the master branch is the canonical reference. 24eb108e is the current HEAD. NOTICE-iof-xsd.md documents the bump protocol so a Phase 2 schema refresh is a one-line edit + test re-run.

3. **opts.outerTransaction toggle pattern.** The C-H3 atomic guarantee requires the from-wizard handler to share its sqlite.transaction with the ingester (better-sqlite3 doesn't allow nested transactions). We exposed this as an explicit `{ outerTransaction: true }` option on both ingesters rather than threading an AsyncLocalStorage-based context. Cost: callers must pass the flag when nested. Benefit: zero implicit context, fully typed, easy to test (`courseImport.test.ts` test 4 + `competitionsFromWizard.test.ts` test 3 exercise both modes end-to-end).

4. **EntryList partial-import → `result.classes_missing[]`.** Surfaced as a structured result field so the wizard can render "Some entries skipped: H45, D17" as a soft warning. The harder case (every competitor skipped for missing class) escalates to a thrown error inside doIngest so the from-wizard atomic transaction rolls back; that surfaces as 422 `entrylist_without_courses`. The plan asked the executor to decide this shape — the answer is recorded here.

5. **Course unknown-control code → throw, not auto-create.** Two choices: silently insert a phantom controls row, or surface as a hard error. The plan's C-H3 regression test depends on (b) and the contract is clearer: malformed Purple Pen exports fail loudly. Documented in courseImport.ts.

6. **Route bodyLimit of 7.5 MB for /from-wizard.** Sized to admit a 5 MB decoded XML (= ~6.7 MB base64) + ~200 bytes JSON envelope. Genuinely oversized payloads (> ~5.6 MB raw) get caught by Fastify's bodyLimit BEFORE our explicit decoded-bytes check fires — that path is still a 413 but with Fastify's default body shape; the test for T-LARGE-BODY-DOS asserts "either shape is acceptable" so this doesn't break on a future Fastify body-shape change.

7. **Multipart filename sanitization is handled by @fastify/multipart's basename behavior.** Empirically verified: uploading a file named `../etc/passwd.xml` results in `part.filename === 'passwd.xml'` before our handler runs. Our `includes('..')` check is unreachable today but kept as defense-in-depth in case the basename behavior is removed in a future multipart version. The from-wizard JSON endpoint is where the check is load-bearing — that path's filename arrives as raw input.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] entrylist_without_courses guard triggered on duplicate-card no-op**

- **Found during:** `entryImport.test.ts` test 3 (duplicate card_number silently skipped).
- **Issue:** Initial guard read `if (competitorsCreated === 0 && data.competitors.length > 0) throw`. A legitimate duplicate-card scenario (re-importing the same EntryList) has `competitorsCreated === 0` but `classes_missing` empty — the guard was incorrectly firing as an "entrylist_without_courses" error.
- **Fix:** Changed the guard to `if (competitorsCreated === 0 && missing.size > 0)`. The error now only fires when classes are missing AND no competitors landed — i.e. the genuine "wizard uploaded EntryList before CourseData" precondition.
- **Files modified:** `apps/edge/src/ingest/entryImport.ts`.
- **Verification:** test 3 passed after the fix; test 5 (the legitimate entrylist_without_courses case) continued to pass.
- **Committed in:** `2cf341b` (Task 2).

**2. [Rule 3 — Blocking] Build script needed mkdir -p before cp**

- **Found during:** `pnpm --filter @fartola/edge build` smoke test after writing the new build script.
- **Issue:** `tsup` does not create `dist/xml/` because there are no source files under `src/xml/` matching the entry points; the `cp src/xml/IOF.xsd dist/xml/IOF.xsd` step then failed with "cannot create regular file 'dist/xml/IOF.xsd': No such file or directory".
- **Fix:** Inserted `mkdir -p dist/xml` between `tsup` and `cp`. The build now produces `dist/xml/IOF.xsd` reliably.
- **Files modified:** `apps/edge/package.json`.
- **Verification:** Re-ran build; `dist/xml/IOF.xsd` present (216 KB).
- **Committed in:** `2cf341b` (Task 2).

**3. [Rule 3 — Blocking] TS strict — Buffer is not assignable to BlobPart**

- **Found during:** `pnpm --filter @fartola/edge typecheck` after writing `import.test.ts`.
- **Issue:** TS 5.6 + strict mode complain that Node's `Buffer<ArrayBufferLike>` is not assignable to `BlobPart` (= `ArrayBufferView<ArrayBuffer>` — strictly ArrayBuffer, not ArrayBufferLike which includes SharedArrayBuffer). The error trips when constructing the multipart `new File([bytes], filename)`.
- **Fix:** Copy the buffer bytes into a fresh `ArrayBuffer`-backed `Uint8Array` via `const ab = new ArrayBuffer(...); new Uint8Array(ab).set(bytes); new File([ab], filename)`. The fresh ArrayBuffer is unambiguously `ArrayBuffer` (not `SharedArrayBuffer`), so the BlobPart constraint is satisfied. Cheap copy (one alloc + one memcpy), only used in tests.
- **Files modified:** `apps/edge/src/routes/import.test.ts`.
- **Verification:** typecheck clean.
- **Committed in:** `2cf341b` (Task 2).

**4. [Rule 3 — Blocking] TS overload pick on `app.inject` with `payload: unknown`**

- **Found during:** typecheck for `competitionsFromWizard.test.ts`.
- **Issue:** Declaring `postFromWizard(app, payload: unknown)` makes TS pick the wrong `app.inject` overload — the resulting `res` typed as `void & Promise<Response> & Chain` rather than the LightMyRequest response shape. `.statusCode` + `.json()` then become unknown properties.
- **Fix:** Widen the helper parameter to `payload: Record<string, unknown>`. TS now picks the inject overload that returns a LightMyRequest response.
- **Files modified:** `apps/edge/src/routes/competitionsFromWizard.test.ts`.
- **Verification:** typecheck clean.
- **Committed in:** `2cf341b` (Task 2).

**5. [Rule 3 — Blocking] Prettier + ESLint auto-fix on commit**

- **Found during:** both task commit attempts.
- **Issue:** Lefthook's prettier hook flagged 6 files across the two tasks (long-line wrapping); eslint flagged 2 unused imports (`beforeEach`, `afterEach` in `entryImport.test.ts`).
- **Fix:** Ran `pnpm exec prettier --write` on each flagged set; removed the unused imports.
- **Files modified:** several test + route files (formatting only) + the entryImport.test.ts import line.
- **Verification:** both commits passed lefthook on retry.
- **Committed in:** `d2c0522` (Task 1 prettier) + `2cf341b` (Task 2 prettier + eslint).

---

**Total deviations:** 5 auto-fixed (1 Rule 1 bug, 4 Rule 3 blocking — toolchain/typecheck follow-ons). No Rule 2 (missing critical) or Rule 4 (architectural) deviations. The plan was executed as written — three requirements collapsed to one importer, T-FILE-IMPORT in the same wave, C-H3 atomic-wizard + both regression gates green, C-M4 consent semantics locked at the ingester + verified at the route.

## Issues Encountered

- **Multipart filename sanitization made the in-multipart-route bad_filename test vacuous.** `@fastify/multipart` (via busboy) strips the path component from the Content-Disposition filename before our handler runs, so `'../etc/passwd.xml'` arrives as `'passwd.xml'`. The test was rewritten to verify both the upload succeeds (sanitization in place) and a future regression where multipart stops sanitizing would be caught by our defense-in-depth check. The from-wizard JSON endpoint (test 4 there) is where filename safety is load-bearing because the path arrives via raw JSON, never multipart.

- **xmllint-wasm performance variance.** First call after module load takes 150-700 ms depending on system warmup; subsequent calls settle at 150-250 ms. `validate.test.ts` test 5 (perf sanity) uses a generous 30s ceiling because CI variance can swing the second-call timing wider than the first.

- **`dist/xml/IOF.xsd` build step required mkdir.** tsup doesn't pre-create directories outside its entry-point graph; the `cp` step needed an explicit `mkdir -p dist/xml`. Resolved in Task 2.

## Adversarial Test Outcomes

- **xml-bomb fixture:** 327 bytes on disk. Pre-flight DOCTYPE regex fires in < 1 ms. `parseIofXml` throws `DOCTYPE not allowed` BEFORE the bytes reach fast-xml-parser. The `processEntities: false` config is a second line of defense; even if the regex missed, the parser would not expand declared entities.
- **DOCTYPE-less ENTITY declaration:** `parse.test.ts` test 7 asserts a bare `<!ENTITY x "lolz">` (no DOCTYPE wrapper) also throws. The ENTITY regex is matched independently of DOCTYPE.
- **Corrupt CourseData fixture:** 776 bytes on disk. fast-xml-parser accepts it (it's well-formed XML). xmllint-wasm rejects with at least one error referencing `Name` / `Course`. `validate.test.ts` test 3 + `competitionsFromWizard.test.ts` test 2 both consume this fixture as the C-H3 input gate.

## User Setup Required

None. `pnpm install` picks up the three new deps. No external services. The bundled IOF.xsd is at `apps/edge/src/xml/IOF.xsd` after `git pull`; the build script copies it to `dist/xml/IOF.xsd` on `pnpm --filter @fartola/edge build`. xmllint-wasm runs from `node_modules/xmllint-wasm/xmllint.wasm` with no extra steps.

## Next Phase Readiness

- **Plan 06 (SI bridge)** ready: the import path doesn't change the bridge surface. The bridge produces `card_read` events with `card_number` payloads; the EntryList importer seeds `competitors.card_number`; plan 07's reducer joins them.
- **Plan 07 (card-to-competitor matching)** ready: imported competitors with `card_number` IS NOT NULL participate in the partial unique index (plan 02). Card-read events from plan 06 will resolve `card_number → competitor_id` via the same SELECT pattern that plan 04's walk-up uses.
- **Plan 08 (results projection)** ready: imported competitors have `class_id` set (when class match) or are skipped (`classes_missing`); the results projection reads from `competitors` + `course_controls` and ignores the consent_status column entirely.
- **Plan 12 (three-click wizard)** ready: step 3 fires ONE POST to `/api/competitions/from-wizard`. The single-call contract is locked here. Wizard hooks: on 201, route to `/competition/{competition_id}/readout`; on 400 `xsd_invalid`, render the structured errors list with line numbers; on 422 `entrylist_without_courses`, render "Ladda upp banor först (CourseData)" toast.
- **Plan 14 (walk-up modal + consent_status confirmation toast)** ready: every imported competitor row arrives with `consent_status='pending_first_read'`. Plan 14 owns the UPDATE that flips it to `'confirmed_on_read'` on first operator confirmation, plus the `consent_confirmed` event emission.
- **Plan 15-16 (printer + IOF export)** ready: no dependency on the import path.
- **Plan 17 (PII scrub)** ready: imported competitors have `scrubbed_at_ms IS NULL` (plan 02 default); the daily scrub flips the column.

## Threat Flags

None — every new surface is in the threat register up-front:

- T-FILE-IMPORT — mitigated at three layers (processEntities, DOCTYPE pre-flight, bodyLimit).
- T-PATH-TRAVERSAL — sanitized by @fastify/multipart in the multipart route + explicit check in both routes.
- T-XSD-PARTIAL-WRITE — XSD validation BEFORE every ingest transaction in both endpoints.
- T-ORPHAN-COMPETITION-FROM-WIZARD — closed by the from-wizard atomic endpoint + regression tests 2 + 3.
- T-LARGE-BODY-DOS — Fastify bodyLimit + decoded-bytes check.
- T-CONSENT-IMPORT-DRIFT — closed by the C-M4 consent semantics in ingestEntryList + regression test 4 in entryImport.test.ts + test 2 in import.test.ts.

## Known Stubs

None — every path is production-ready.

## Self-Check: PASSED

**Files verified present on disk:**

- `apps/edge/src/xml/IOF.xsd`: FOUND (4316 lines, ~216 KB, sha256 implicit via commit hash)
- `apps/edge/src/xml/NOTICE-iof-xsd.md`: FOUND (attribution + source URL + commit hash)
- `apps/edge/src/xml/parse.ts`: FOUND (root-dispatching parser + T-FILE-IMPORT pre-flight)
- `apps/edge/src/xml/validate.ts`: FOUND (xmllint-wasm wrapper, schema cached)
- `apps/edge/src/xml/parse.test.ts`: FOUND (7 tests)
- `apps/edge/src/xml/validate.test.ts`: FOUND (6 tests)
- `apps/edge/src/ingest/courseImport.ts`: FOUND
- `apps/edge/src/ingest/courseImport.test.ts`: FOUND (4 tests)
- `apps/edge/src/ingest/entryImport.ts`: FOUND
- `apps/edge/src/ingest/entryImport.test.ts`: FOUND (5 tests)
- `apps/edge/src/routes/import.ts`: FOUND
- `apps/edge/src/routes/import.test.ts`: FOUND (7 tests)
- `apps/edge/src/routes/competitionsFromWizard.ts`: FOUND
- `apps/edge/src/routes/competitionsFromWizard.test.ts`: FOUND (9 tests; tests 2+3 are the C-H3 gates)
- `apps/edge/test/fixtures/iof30-coursedata-sample.xml`: FOUND
- `apps/edge/test/fixtures/iof30-entrylist-sample.xml`: FOUND
- `apps/edge/test/fixtures/iof30-coursedata-corrupt.xml`: FOUND
- `apps/edge/test/fixtures/iof30-xml-bomb.xml`: FOUND
- `apps/edge/src/server.ts`: modified (registers the two new routes)
- `apps/edge/package.json`: modified (build script + files[] + new deps)

**Commits verified in git log:**

- `d2c0522` (Task 1: parser + validator + XSD + fixtures): FOUND
- `2cf341b` (Task 2: ingesters + import route + from-wizard atomic + tests): FOUND

**Behavior verified:**

- `pnpm -r --if-present typecheck`: clean across all 4 workspace projects.
- `pnpm --filter @fartola/edge test`: 113/113 pass (+38 over plan-04 baseline).
- `pnpm -r --if-present test`: 108 sportident + 3 shared-types + 5 web + 113 edge = 229 tests, 0 fail.
- `pnpm --filter @fartola/edge build`: produces `dist/xml/IOF.xsd` (216 KB) alongside the standard tsup outputs.
- `competitionsFromWizard.test.ts` test 2 (XSD-fail rollback): PASSES — competitions count unchanged after 400 xsd_invalid.
- `competitionsFromWizard.test.ts` test 3 (mid-transaction rollback): PASSES — competitions count unchanged after 422 ingest_failed (unknown control 99 throw inside transaction).
- `entryImport.test.ts` test 4 (C-M4): PASSES — every imported competitor has consent_status='pending_first_read' AND consent_at_ms=null.
- `import.test.ts` test 2 (C-M4 end-to-end): PASSES — multipart EntryList upload produces rows with the same consent semantics.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
