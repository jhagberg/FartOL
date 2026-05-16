---
phase: 02-4-klubbs-mvp
plan: 03
subsystem: api
tags: [meos, mip, fastify, xml, xsd, integration, fast-xml-parser, xmllint-wasm]

# Dependency graph
requires:
  - phase: 02-4-klubbs-mvp/01
    provides: hiredCards (compound-PK) + events (Phase 1 carry-forward) + config singleton ('active_competition_id') tables; migration 0002_phase2.sql
  - phase: 02-4-klubbs-mvp/02
    provides: POST /api/competitors hired_card extension that writes hired_cards in the same sqlite.transaction as the competitor — Plan 03 reads those rows for the <card hired="true"> wire flag
  - phase: 01-single-laptop-training-mvp
    provides: events.local_seq monotonic cursor (D-13); fast-xml-parser + xmllint-wasm baseline; routes/competitors.ts replace_card_for_competitor_id path that emits a fresh card_bound event on card-replace (Phase 1 D-MIP-3 prerequisite); routes/sessions.ts active_competition_id config singleton; buildServer factory + plugin registration order
provides:
  - apps/edge/src/integrations/meos/shared.ts — MIP_NS + MOP_NS namespace constants + toArray/asString/asInt/asBool/coerceInt normalizers (copy of xml/parse.ts:171-200 + a coerceInt header parser); imported by mip.ts here and slated for re-use by mop.ts in Plan 04
  - apps/edge/src/integrations/meos/mip.xsd — verbatim pin of MIP XSD v3.0 (May 2026, April 2025 update) from /tmp/meos-research/mip/mip.xsd; bundled so xmllint-wasm can validate every emitted MIP response in tests
  - apps/edge/src/integrations/meos/mip.ts — GET /mip Fastify route; emits <MIPData xmlns lastid="N"> with <entry id=localSeq extId=UUID classname=…><name><club><card hired?> per D-MIP-1..4
  - GET /mip mounted at the ROOT (not /api/*) so MeOS hard-coded poll URLs work without prefix rewriting
  - Header + query parameter dual-source support (lastid/competition/pwd) with query-wins precedence; pwd silently ignored (D-MIP-1)
  - 3 fixture XMLs (mip-empty.xml / mip-entry-plain.xml / mip-entry-hired.xml) — literal expected response bodies that double as XSD-conformance regression goldens
  - 12 new node:test cases in mip.test.ts covering fixture XSD validation (3) + Fastify-inject route behavior (8) + the D-MIP-3 card-replace round-trip integration test (1)
affects:
  [
    02-04-mop-receiver,
    02-06-parallel-meos-runbook,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'XMLBuilder with suppressBooleanAttributes:false — libxml2 strict validation requires explicit hired="true" not bare-attribute shorthand'
    - 'Per-request lookup cache (Map<classId,name>) for N+1 hydration on hot fan-out — keeps 4-klubbs-scale (~100 starters, 5 classes) sub-ms without batching'
    - 'Pre-MIP integration shared module (shared.ts) staged so Plan 04 (mop.ts) imports namespace constants + normalizers without re-implementing'
    - 'Empty-response echo semantics — when active competition has no new card_bound rows, echo the input lastid; when no active competition, return lastid=0 (both XSD-valid)'

key-files:
  created:
    - apps/edge/src/integrations/meos/shared.ts
    - apps/edge/src/integrations/meos/mip.xsd
    - apps/edge/src/integrations/meos/mip.ts
    - apps/edge/src/integrations/meos/mip.test.ts
    - apps/edge/src/integrations/meos/__fixtures__/mip-empty.xml
    - apps/edge/src/integrations/meos/__fixtures__/mip-entry-plain.xml
    - apps/edge/src/integrations/meos/__fixtures__/mip-entry-hired.xml
  modified:
    - apps/edge/src/server.ts

key-decisions:
  - 'Task 3 = Case A: Phase 1 already emits a fresh card_bound event on the POST /api/competitors replace path (routes/competitors.ts:207-242, verified by existing test 10). No code change to competitors.ts needed; D-MIP-3 round-trip is covered by the new integration test 9 in mip.test.ts.'
  - 'XMLBuilder suppressBooleanAttributes:false — fast-xml-parser default emits <card hired> (no value) which the libxml2/xmllint validator rejects with "Specification mandates value for attribute hired". Setting false forces the explicit hired="true" the MIP XSD xsd:boolean type demands. This was a Rule 1 auto-fix discovered when the GREEN run surfaced 1/340 failures.'
  - 'Per-request class-name cache (Map) instead of an IN-clause batch — 4-klubbs has 5 classes max and the per-request fan-out is at most ~100 entries, so the simpler-to-read Map cache wins over the query-builder complexity of a batched lookup. Phase 2.1 can revisit if scale changes.'
  - 'hired flag = "row exists in hired_cards for (competition_id, card_number)" without filtering on returned_at_ms — Phase 1 plan #4 specifies belt+braces with MeOS reminders, and MeOS expects hired=true throughout the rental lifecycle, not just when open. If we want to toggle hired off on Returnerad, that is a future enhancement.'
  - 'Mounted /mip via Fastify plugin at the root in server.ts (NOT /api/*) — directly mirrors MeOS\\\'s hard-coded poll URL (RESEARCH §Anti-patterns). The wire is a route ordering concern so it lands AFTER registerAdminRoutes but BEFORE registerDevRoutes.'

patterns-established:
  - 'Pattern: integrations/<service>/ subdirectory pairs <route>.ts + <route>.test.ts + <route>.xsd + __fixtures__/ in the same module for service-protocol plugins (mirrored by Plan 04 mop.ts)'
  - 'Pattern: XSD round-trip test as the authoritative wire-format gate — every emitted response body fed through xmllint-wasm.validateXML against the pinned XSD; goldens double as golden-master fixtures AND validation inputs'
  - 'Pattern: query-wins-over-header parameter precedence for dual-source HTTP inputs (test harnesses prefer query; real protocol clients send headers)'
  - 'Pattern: Phase 1 replace_card_for_competitor_id path covers D-MIP-3 re-emit without a new endpoint — the immutable events table + the existing card_bound emission give MeOS the UPDATE trigger via extId match'

requirements-completed: [REQ-EXT-MEOS-001]

# Metrics
duration: 25min
completed: 2026-05-17
---

# Phase 2 Plan 03: MIP server (GET /mip) Summary

**Fastify GET /mip route serves MeOS Input Protocol v3.0 polls from the events.local_seq cursor; pinned mip.xsd + 3 fixture goldens + xmllint-wasm round-trip tests confirm every response is XSD-valid before it reaches a MeOS client; D-MIP-3 card-replace re-emit works without a new endpoint because Phase 1 already emits card_bound on replace.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-16T22:31:00Z
- **Completed:** 2026-05-16T22:56:00Z
- **Tasks:** 3 (Task 1 + Task 2 TDD RED/GREEN + Task 3 verified by Task 2's integration test)
- **Files modified:** 8 (7 created + 1 modified)

## Accomplishments

- `shared.ts` ships MIP_NS + MOP_NS + 5 normalizers (toArray, asString, asInt, asBool, coerceInt) so Plan 04 (mop.ts) can import a single namespace + helper module instead of re-implementing.
- `mip.xsd` v3.0 bundled verbatim (14 440 bytes, cmp == 0 against `/tmp/meos-research/mip/mip.xsd`) — the test suite validates every emitted response against this pinned schema.
- `mip.ts` (~225 LOC) parses query + header sources (query-wins), resolves active_competition_id from the existing Phase 1 config singleton, queries card_bound events newer than lastid, hydrates competitor + class + hired_card data with a per-request class-name cache, and serializes the response via fast-xml-parser's XMLBuilder.
- `/mip` is wired at the root (NOT /api/\*) so MeOS's hard-coded poll URL works without prefix rewriting.
- D-MIP-1 honored: `pwd` silently ignored, no auth, route mounts unconditionally.
- D-MIP-2 honored: zero new state, reuses `events.local_seq` directly.
- D-MIP-3 honored: only `<entry>` on bind + on card-replace (no `<p>`/`<card>` punch dumps); the existing POST /api/competitors replace path emits a fresh card_bound, so the next /mip poll re-serializes with the same extId + new card.
- D-MIP-4 honored: `<classname>` string + `<extId>` FartOL UUID (no `<classid>` — MeOS falls back to `oe.getClass(clsName)`).
- 12 new tests pass (3 fixture-XSD validations + 8 route-behavior tests + 1 D-MIP-3 round-trip).
- Smoke-test from the plan's verification block:
  ```
  valid: true errors: []
  ```
- Full edge test suite: 340/340 pass, 0 fail.
- Workspace `-r typecheck` exits 0.

## Task Commits

1. **Task 1: shared.ts module + pin mip.xsd v3.0** — `a300609` (feat)
2. **Task 2 RED: failing GET /mip tests + fixtures** — `5675061` (test)
3. **Task 2 GREEN + Task 3: mip.ts + server.ts wiring** — `8167a1b` (feat) — Task 3 (D-MIP-3 card-replace round-trip) is verified by the integration test bundled in the same commit; Phase 1 already emits a fresh card_bound on the replace path so no competitors.ts changes were needed.

**Plan metadata commit follows this summary.**

## Files Created/Modified

### Created

- `apps/edge/src/integrations/meos/shared.ts` — MIP_NS + MOP_NS constants; toArray / asString / asInt / asBool normalizers (verbatim copy of xml/parse.ts:171-200); coerceInt header parser (rejects negatives, decimals, non-numeric strings — returns undefined for clean fall-through to query-string source or `?? 0` default).
- `apps/edge/src/integrations/meos/mip.xsd` — pinned MIP XSD v3.0 (May 2026 / April 2025 update). 14 440 bytes; cmp == 0 against `/tmp/meos-research/mip/mip.xsd`. Committed as a checked-in binary asset; do not regenerate.
- `apps/edge/src/integrations/meos/mip.ts` — GET /mip Fastify route. Parses query (Zod strict integer-only) + header fallback (lastid/competition/pwd); resolves active competition from config table; queries events WHERE local_seq > lastid AND event_type = 'card_bound' AND competition_id = active; serializes entries with @\_id=localSeq + @\_extId=UUID + @\_classname; conditionally adds `<club>` + `<card hired?>`. Per-request class-name cache; skips entries with empty classname (Landmine: MeOS rejects entries with empty `<classname>`).
- `apps/edge/src/integrations/meos/mip.test.ts` — 12 tests: 3 fixture-XSD validations (0a/0b/0c), 8 route-behavior tests (1-8), 1 D-MIP-3 round-trip integration test (9). All XSD validations via xmllint-wasm against the bundled mip.xsd.
- `apps/edge/src/integrations/meos/__fixtures__/mip-empty.xml` — empty-poll response body.
- `apps/edge/src/integrations/meos/__fixtures__/mip-entry-plain.xml` — 1-entry response, no hired flag.
- `apps/edge/src/integrations/meos/__fixtures__/mip-entry-hired.xml` — 1-entry response with `<card hired="true">12345</card>`.

### Modified

- `apps/edge/src/server.ts` — `registerMipRoute` import added near the other route imports; `await app.register(registerMipRoute)` registered AFTER `registerAdminRoutes` but BEFORE `registerDevRoutes`. The plugin is registered inside the `if (opts.dbHandle)` block because the route reads from the DB.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The notable ones:

- **Task 3 = Case A** (Phase 1 already emits a fresh card_bound on replace): the existing POST /api/competitors replace_card_for_competitor_id path at competitors.ts:207-242 emits a card_bound event with the SAME competitor UUID and the NEW card_number inside the same transaction as the competitors UPDATE. Test 9 in mip.test.ts proves the round-trip: bind → poll → replace → poll-delta returns exactly one entry with same extId + new card. No code changes to competitors.ts were needed.
- **suppressBooleanAttributes: false on XMLBuilder**: fast-xml-parser's default treats string `'true'` as the "presence" form of a boolean attribute and emits `<card hired>` (no value). The MIP XSD declares `hired` as `xsd:boolean`, and libxml2's strict validator rejects bare-attribute shorthand with "Specification mandates value for attribute hired". This was a Rule 1 auto-fix discovered during the GREEN run.
- **Per-request class-name cache** instead of an IN-clause batch: 4-klubbs has 5 classes max; the per-request fan-out is at most ~100 entries; the Map cache is simpler than rewriting the query into a SELECT...WHERE class_id IN (...) batch. Phase 2.1 can revisit if scale changes.
- **hired flag = "row exists" not "row open"**: MeOS expects `hired=true` throughout the rental lifecycle (oe.isHiredCard is sticky per onlineinput.cpp:1072-1073); we don't filter on returned_at_ms IS NULL. If we want to flip hired off on Returnerad, that is a Phase 2.1 enhancement; D-LIM-1 already documents the workflow asymmetry.
- **/mip mounted at the root** (NOT /api/\*): MeOS hard-codes its poll URL with no prefix; nesting under /api/meos/mip would require a custom MeOS build (RESEARCH §Anti-patterns).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] XMLBuilder suppressBooleanAttributes default emits `<card hired>` not `<card hired="true">`**

- **Found during:** Task 2 (GREEN run — 1/340 test failed: test 4 walk-up with hired_card=true)
- **Issue:** fast-xml-parser's `XMLBuilder` default `suppressBooleanAttributes: true` strips the `="true"` from boolean attributes, emitting the bare-attribute shorthand `<card hired>`. The bundled mip.xsd declares `hired` as `xsd:boolean` (CardInfo lines 337-344), and libxml2's strict validator rejects this with "parser error: Specification mandates value for attribute hired".
- **Fix:** Set `suppressBooleanAttributes: false` on the XMLBuilder constructor in mip.ts; documented the rationale inline (the comment quotes the XSD line range and the libxml2 error message).
- **Files modified:** `apps/edge/src/integrations/meos/mip.ts` (XMLBuilder options block)
- **Verification:** All 340 tests pass after the fix; the test 4 fixture-shaped output is byte-equal to the bundled mip-entry-hired.xml golden.
- **Committed in:** `8167a1b` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — XML serializer default was wrong for the MIP XSD's strict xsd:boolean type).
**Impact on plan:** Plan executed essentially as written. The one auto-fix is a serializer config that the plan template (RESEARCH Pattern 3) didn't enumerate — easily resolved by reading the libxml2 error verbatim.

## Issues Encountered

- **commitlint subject-case rejection**: commit message subjects that included "RED" (all-caps) or PascalCase tokens like "GET" / "MeOS" / "Input Protocol" were rejected by the conventional-commits commitlint rule. Resolved by rephrasing both subjects to lowercase. No code impact.

## User Setup Required

None for plan-level acceptance. For the Wednesday bench dry-run:

1. Boot the bridge with an active competition set:
   `fartol --port 3000 --bind-host 0.0.0.0 --allow-lan` then `POST /api/sessions/active-competition { competition_id: <uuid> }`.
2. Configure MeOS to poll the URL `http://<fartol-ip>:3000/mip` (no `/api/` prefix). MeOS picks the polling cadence; ~5s is typical.
3. Verify with `curl -s "http://<fartol-ip>:3000/mip?lastid=0"` — should return a `<?xml version="1.0" …?>\n<MIPData xmlns="http://www.melin.nu/mip" lastid="0"/>` payload immediately.

## Next Phase Readiness

- **Plan 02-04 (MOP receiver)** unblocked — `shared.ts` is ready with MOP_NS + the four shared normalizers; mop.ts can import them without re-implementing. The integrations/meos/ subdirectory pattern (route + test + xsd + fixtures) is established for the inverse direction.
- **Plan 02-05 (Hyrbricka finish-readout toast)** independently unblocked — the hired_cards table populated by Plan 02-02 is also what mip.ts queries here; no contention.
- **Plan 02-06 (parallel-meos-runbook)** depends on Plans 03 + 04 + 05 — Plan 03 ships its half of that bundle; runbook section "Wire format / MIP poll URL" can be written against this plan's GET /mip surface verbatim.

---

## Self-Check: PASSED

- [x] `apps/edge/src/integrations/meos/shared.ts` — FOUND
- [x] `apps/edge/src/integrations/meos/mip.xsd` — FOUND (14 440 bytes, cmp == 0 against /tmp/meos-research/mip/mip.xsd)
- [x] `apps/edge/src/integrations/meos/mip.ts` — FOUND, exports `registerMipRoute`
- [x] `apps/edge/src/integrations/meos/mip.test.ts` — FOUND, 12 tests (3 fixture + 8 route + 1 D-MIP-3 round-trip)
- [x] `apps/edge/src/integrations/meos/__fixtures__/mip-empty.xml` — FOUND
- [x] `apps/edge/src/integrations/meos/__fixtures__/mip-entry-plain.xml` — FOUND
- [x] `apps/edge/src/integrations/meos/__fixtures__/mip-entry-hired.xml` — FOUND
- [x] `apps/edge/src/server.ts` — UPDATED, `registerMipRoute` import + register call added
- [x] Commits: `a300609`, `5675061`, `8167a1b` — all FOUND in `git log`
- [x] Full edge test suite — 340/340 pass / 0 fail
- [x] Workspace `-r typecheck` — exits 0

---

_Phase: 02-4-klubbs-mvp_
_Completed: 2026-05-17_
