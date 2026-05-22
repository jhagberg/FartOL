---
phase: 02-4-klubbs-mvp
verified: 2026-05-17T02:43:00Z
status: gaps_found
score: 4/6 must-haves verified (1 BLOCKER + 1 deferred-to-bench)
overrides_applied: 0
gaps:
  - truth: "SC#5 — Course-only model (no Klasser) works for 4-klubbs's 5-course bundle (Vit / Grön / Gul / Orange / Violett)."
    status: failed
    reason: |
      02-CONTEXT.md decision #1 claims "Phase 1's CourseData importer
      already auto-creates a 1:1 class-per-course when no ClassList is
      provided." Codebase does NOT have this path. The actual import flow
      (apps/edge/src/xml/parse.ts:209-222 → apps/edge/src/ingest/
      courseImport.ts:55-81) extracts classes ONLY from <Event><Class>
      elements. The shipped 4-klubbs file
      `.reference/2026-05-20 4-klubbs_coursedata.xml` has ZERO <Class>
      elements (5 <Course> elements only — verified by grep). After
      import, `data.classes` is empty → `classes_created = 0` → no
      rows in the `classes` table → WalkupModal's Bana picker
      (WalkupModal.svelte:339, iterates over `classes`, NOT `courses`)
      is empty → operator cannot save a walk-up because `classId` is
      required (WalkupModal.svelte:173 `if (!classId) return
      t('walk.err.classRequired')`).
      Plan 02-06 ops runbook tells the operator that classes must
      match between MeOS and FartOL but does NOT instruct creation of
      the 5 classes in FartOL (no `POST /api/competitions/:id/classes`
      curl snippet, no UI walkthrough). The wizard has no UI to add
      classes after the courseData import either.
      Net effect: as of right now the 4-klubbs bench operator cannot
      register a single runner without manual REST POSTs against
      `/api/competitions/:id/classes` for each of the 5 colors.
    artifacts:
      - path: 'apps/edge/src/ingest/courseImport.ts'
        issue: 'ingestCourseData has no fallback class auto-creation when data.classes is empty AND data.courses is non-empty'
      - path: 'apps/edge/src/xml/parse.ts'
        issue: 'normalizeCourseData returns ParsedCourseData.classes = [] for files with no <Class> elements; no synthesis from courses'
      - path: '.reference/2026-05-20 4-klubbs_coursedata.xml'
        issue: 'Actual event file has 5 Course elements + zero Class elements'
      - path: 'apps/web/src/lib/screens/WalkupModal.svelte'
        issue: 'Bana picker (line 339) iterates `classes`, not `courses` — produces empty <Select> if no classes exist'
      - path: 'docs/ops/parallel-meos-runbook.md'
        issue: "Step 7 says 'Bana picker should show the same five entries' but no step explains how to create the 5 classes in FartOL"
    missing:
      - 'Either: (a) auto-create-class-per-course path in ingestCourseData when data.classes is empty (preferred — honors CONTEXT decision #1), OR (b) wizard UI step to create classes after CourseData import + runbook curl snippets, OR (c) update WalkupModal to iterate `courses` instead of `classes` (would require a competition-level course-only mode flag).'
      - 'End-to-end test that imports .reference/2026-05-20 4-klubbs_coursedata.xml and confirms the Bana picker shows 5 entries.'
deferred:
  - truth: 'SC#1 — 4-klubbs 2026-05-20 runs end-to-end on FartOL; MeOS alive but never needed.'
    addressed_in: 'Plan 02-06 Task 4 (Wednesday-morning bench checkpoint, ~16:30 CEST, 2026-05-20)'
    evidence: "Acknowledged by verification context as the authoritative production gate. Manual 10-step procedure documented in 02-06-SUMMARY.md 'Deferred Tasks' section. SUMMARY status: PENDING — resume signal 'smoke green' or 'smoke red'."
human_verification:
  - test: 'Bench-smoke green against real BSM7/8 + real MeOS + real Eventor key'
    expected: '`FARTOL_PORT=3000 FARTOL_DB=/var/lib/fartol/4-klubbs.db FARTOL_SKIP_BOOT=1 bash apps/edge/scripts/bench-smoke-phase2.sh` reports 6/6 PASS against the prod bridge'
    why_human: 'Requires physical reader + parallel MeOS install + .eventor-env; verifier environment lacks xmllint+sqlite3 (bails at preflight as designed)'
  - test: 'MIP <5s latency from FartOL walk-up → MeOS'
    expected: 'Walk-up registered in FartOL appears on MeOS within ~5s via MeOS-side MIP poll (manual test 8 in 02-06 deferred task)'
    why_human: 'Needs real MeOS install polling our /mip endpoint at its configured cadence'
  - test: 'MOP crash-recovery import'
    expected: "Kill FartOL → register competitor in MeOS → restart FartOL → MeOS-side competitor appears as `source='meos'` via next MOPComplete cycle"
    why_human: 'Needs real MeOS push timing + bridge kill/restart; manual test 10 in 02-06 deferred task'
  - test: 'Hyrbricka belt+braces: both FartOL toast AND MeOS reminder fire'
    expected: 'Card-bound runner with hired=true → MIP <entry><card hired="true">...</card></entry> reaches MeOS → MeOS surfaces its own rental reminder AND FartOL surfaces the HyrbrickaToast at finish-readout'
    why_human: 'Belt-braces requires watching both UIs simultaneously; MeOS reminder cannot be asserted via code (manual test 8 step in 02-06)'
  - test: 'SC5 actual remediation (operator workaround)'
    expected: 'Even with the gap above, an operator who manually creates the 5 classes in FartOL via REST before the event can run walk-ups end-to-end; verify this workaround'
    why_human: 'Needs Jonas to decide whether to fix the gap in code or document the curl/UI workaround in the runbook before Wednesday'
---

# Phase 2.0 — 4-klubbs MVP Verification Report

**Phase Goal:** Run a real 4-klubbs training at Stora Tuna OK on
Wednesday 2026-05-20 with FartOL as primary registration + readout
system, MeOS as parallel safety backup via MIP+MOP sync.

**Verified:** 2026-05-17T02:43Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (the 6 ROADMAP Success Criteria)

| #   | Truth                                                                                                           | Status                    | Evidence                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 4-klubbs 2026-05-20 runs end-to-end on FartOL; MeOS alive but never needed.                                     | DEFERRED (Wed checkpoint) | Plan 02-06 Task 4 is the production gate; not a code-path concern. Acknowledged by verification context. Code-path readiness for SC1 is the conjunction of SCs 2-6.                                                             |
| 2   | Eventor löpardatabasen import works: typing or reading known SI bricka auto-fills name+klubb in walk-up.        | VERIFIED                  | apps/edge/src/eventor/{download,parser,cache,boot,lookup}.ts all present, bin/fartol.ts L527 calls scheduleEventorBoot; e2e `walkup-eventor.spec.ts` runs 4/4 green including "bricka pre-fill" and "Bana label" cases.         |
| 3   | Every walk-up registration in FartOL shows up in MeOS within ~5s via MIP `<entry>`.                             | VERIFIED (code-path)      | apps/edge/src/integrations/meos/mip.ts wired at server.ts:243; mip.test.ts 12 cases incl. D-MIP-3 round-trip; XSD round-trip vs pinned mip.xsd v3.0. Real ~5s latency depends on MeOS-side poll cadence (human verification).   |
| 4   | Hyrbricka flag survives round-trip: FartOL toast at finish-readout AND MeOS reminder both fire.                 | VERIFIED (FartOL side)    | e2e `hyrbricka.spec.ts` 1/1 green (walkup→toast→Returnerad→no re-pop→admin). MIP serializer emits `<card hired="true">` (mip.ts L273-277). MeOS side requires real-MeOS bench gate.                                             |
| 5   | Course-only model (no Klasser) works for 4-klubbs's 5-course bundle (Vit / Grön / Gul / Orange / Violett).      | **FAILED (BLOCKER)**      | Importer extracts classes ONLY from <Class> elements; the actual 4-klubbs XML has zero <Class> elements (5 Courses only). Operator cannot select Bana because the picker iterates `classes`, not `courses`. See gaps section.   |
| 6   | If FartOL killed mid-event, MeOS-side registrations done during outage are picked up via MOP on FartOL restart. | VERIFIED (code-path)      | mop.ts D-MOP-3 auto-merge SQL (L259-294); mop.test.ts 17 cases; smoke assertion 2 exercises real POST. Restart-resume depends on the bridge bin (PRESERVED — DB-backed). Bench-checkpoint manual test 10 is the real-MeOS gate. |

**Score:** 4/6 truths verified at the code-path level; **1 BLOCKER (SC5)** + 1 deferred-to-bench (SC1).

### Required Artifacts (selected high-value verifications)

| Artifact                                                                     | Expected                                       | Status   | Details                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/edge/drizzle/0002_phase2.sql`                                          | Single migration creating 6 new tables         | VERIFIED | All 6 tables found: eventor_competitors, eventor_clubs, meos_competitors, meos_classes, meos_clubs, hired_cards                         |
| `apps/edge/src/eventor/{boot,cache,download,parser,lookup}.ts`               | Eventor pipeline                               | VERIFIED | All 5 modules present; scheduleEventorBoot wired in bin/fartol.ts L527                                                                  |
| `apps/edge/src/integrations/meos/mip.ts` + mip.xsd + 3 fixtures              | MIP server bundle                              | VERIFIED | mip.ts:131 mounts `/mip` at root (NOT /api/\*) per D-MIP wire spec; pinned mip.xsd v3.0; 3 fixture XMLs present                         |
| `apps/edge/src/integrations/meos/mop.ts` + mop.xsd + 3 fixtures              | MOP receiver bundle                            | VERIFIED | mop.ts:99 mounts `POST /mop` at root; D-MOP-2 TRUNCATE+INSERT in transaction; D-MOP-3 auto-merge SQL; broadcast-after-commit (L307-313) |
| `apps/edge/src/routes/hiredCards.ts` + `apps/edge/src/routes/readout.ts` ext | Hyrbricka REST + readout extension             | VERIFIED | GET/PATCH endpoints wired in server.ts:239; readout.ts adds hired_card_open field                                                       |
| `apps/edge/src/routes/competitors.ts` hired_card extension                   | Walk-up writes hired_cards in same transaction | VERIFIED | competitors.ts L338+L436 — pre-flight phone-OR-email at L338, conditional insert at L436 with onConflictDoUpdate on compound PK         |
| `apps/edge/src/privacy/retention.ts` extension                               | hired*cards.contact*\* scrub after 30 days     | VERIFIED | retention.ts L147-148 WHERE clause includes contact_name/phone/email/note; JSDoc at L12-14 documents the scrub                          |
| `apps/web/src/lib/screens/WalkupModal.svelte` (Bana/Hyrbricka/Eventor)       | Modal extensions                               | VERIFIED | walk.bana label L336; eventorHint $effect L96-108; Hyrbricka checkbox L368-374; EventorAutocomplete L314                                |
| `apps/web/src/lib/screens/ReadoutView.svelte` (Hyrbricka + cardSubscription) | Toast + WS dispatch                            | VERIFIED | HyrbrickaToast import L84; pendingHyrbrickaToast state; handleLiveEvent meos_merge + hired_card_returned cases (L815-821)               |
| `apps/web/src/lib/screens/ActiveHyrbrickorView.svelte` + `/hyrbrickor` route | Admin backstop                                 | VERIFIED | Both view + +page.svelte route present; e2e exercises admin row                                                                         |
| `apps/web/src/lib/stores/cardQueue.svelte.ts` + RegistrationView             | Card-beep queue + auto-advance                 | VERIFIED | 8 unit tests pass; e2e registration-queue.spec.ts 1/1 green                                                                             |
| `apps/web/src/lib/services/cardSubscription.ts`                              | Shared WS subscription extracted               | VERIFIED | Used by ReadoutView + RegistrationView                                                                                                  |
| `apps/edge/scripts/bench-smoke-phase2.sh`                                    | 6-assertion bash gate, env-var parameterized   | VERIFIED | All 6 assertions documented (L132-294); FARTOL_SKIP_BOOT short-circuit for Task 4 prod-bridge mode; chmod 755                           |
| `docs/ops/parallel-meos-runbook.md`                                          | Operator playbook ~437 lines                   | VERIFIED | 437 lines confirmed; covers Before/During/Recovery/After/Known-limits; D-LIM-1 documented; **BUT** does not cover SC5 class creation    |
| `.planning/adr/0009-eventor-runner-cache.md`                                 | ADR for national-DB PII trade-off              | VERIFIED | Present per Plan 02-01 task 5                                                                                                           |
| REQ-EXT-MEOS-001 entry in REQUIREMENTS.md                                    | New external-integration section               | VERIFIED | REQUIREMENTS.md L195-202                                                                                                                |

### Key Link Verification

| From               | To                               | Via                                           | Status     | Details                                                                                                           |
| ------------------ | -------------------------------- | --------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| bin/fartol.ts      | eventor/boot.ts                  | `scheduleEventorBoot(handle, {...})` L527     | WIRED      | Decorated as `app.fartolEventor` L531                                                                             |
| server.ts          | integrations/meos/mip.ts         | `app.register(registerMipRoute)` L243         | WIRED      | Inside `if (opts.dbHandle)` block                                                                                 |
| server.ts          | integrations/meos/mop.ts         | `app.register(registerMopRoute)` L247         | WIRED      | Inside `if (opts.dbHandle)` block                                                                                 |
| server.ts          | routes/hiredCards.ts             | `app.register(registerHiredCardsRoutes)` L239 | WIRED      | After admin routes                                                                                                |
| server.ts          | routes/eventor.ts                | `app.register(registerEventorRoutes)` L223    | WIRED      | After clubs routes                                                                                                |
| WalkupModal.svelte | api/client.ts lookupEventorBy\*  | Direct import L33                             | WIRED      | Eventor hit pre-fills name + klubb (e2e green)                                                                    |
| ReadoutView.svelte | components/HyrbrickaToast.svelte | Import L84 + render L815-821                  | WIRED      | Driven by pendingHyrbrickaToast state + card_read $effect                                                         |
| WalkupModal        | classes prop                     | `{#each classes as cls}` L339                 | **HOLLOW** | `classes` is empty when CourseData has no <Class> blocks — this is the SC5 gap surface                            |
| readout.ts         | hiredCards data                  | In-memory map per request (Plan 02-05 task 1) | WIRED      | hired_card_open populated on every history row; 3 new readout tests pass                                          |
| MIP serializer     | hired_cards SELECT               | mip.ts L243-258                               | WIRED      | hired="true" attribute set when row exists in hired_cards (sticky throughout rental lifecycle per MeOS semantics) |
| MOP receiver       | meos_merge WS broadcast          | mop.ts L307-313 broadcast-after-commit        | WIRED      | Only emits when mergedCount > 0 AND active competition set; PATTERNS S-4 honored                                  |
| retention.ts       | hired*cards.contact*\* UPDATE    | retention.ts L147-148                         | WIRED      | Idempotency via "contact\_\* IS NOT NULL" guard; 6 new test cases (P206-1..6) pass                                |

### Data-Flow Trace (Level 4 — for dynamic-data artifacts)

| Artifact                          | Data Variable            | Source                                                             | Produces Real Data  | Status     |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------ | ------------------- | ---------- |
| WalkupModal.svelte Bana picker    | `classes` prop           | GET /api/competitions/:id/classes via ReadoutView/RegistrationView | NO (for 4-klubbs)   | **HOLLOW** |
| WalkupModal.svelte name field     | `eventorHint`            | GET /api/eventor/lookup?si_card=N (ReadoutView $effect)            | YES (e2e proven)    | FLOWING    |
| ReadoutView.svelte HyrbrickaToast | `pendingHyrbrickaToast`  | history[0].hired_card_open from /api/competitions/:id/readout      | YES (e2e proven)    | FLOWING    |
| ActiveHyrbrickorView.svelte       | `open` / `returned`      | GET /api/competitions/:id/hired-cards                              | YES (smoke A4)      | FLOWING    |
| RegistrationView.svelte queue     | `cardQueue` store        | WS card_read envelopes via cardSubscription                        | YES (e2e proven)    | FLOWING    |
| MIP /mip response                 | `entries[]`              | events table SELECT, then competitor+class+hired_cards hydrate     | YES (mip.test.ts)   | FLOWING    |
| MOP /mop ingest                   | shadow tables            | XML body → 3 UPSERTs in transaction                                | YES (mop.test.ts)   | FLOWING    |
| ReadoutView meos_merge toast      | `count` from WS envelope | mop.ts auto-merge SQL `result.changes`                             | YES (smoke + tests) | FLOWING    |

### Behavioral Spot-Checks

| Behavior                         | Command                                                                                                | Result                                  | Status                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------- |
| Edge test suite passes           | `pnpm --filter @fartol/edge test --test-name-pattern="eventor\|mip\|mop\|hyrbricka\|hired\|retention"` | 376 pass, 0 fail, 1 skipped             | PASS                                              |
| Web test suite passes            | `pnpm --filter @fartol/web test --run`                                                                 | 86/86 pass                              | PASS                                              |
| Workspace typecheck              | `pnpm -r typecheck`                                                                                    | exits 0 across all projects             | PASS                                              |
| Eventor walk-up e2e              | `pnpm exec playwright test tests/e2e/walkup-eventor.spec.ts`                                           | 4/4 pass (incl. bricka pre-fill)        | PASS                                              |
| Hyrbricka full-flow e2e          | `pnpm exec playwright test tests/e2e/hyrbricka.spec.ts`                                                | 1/1 pass                                | PASS                                              |
| Registration-desk queue e2e      | `pnpm exec playwright test tests/e2e/registration-queue.spec.ts`                                       | 1/1 pass                                | PASS                                              |
| Bench-smoke against verifier env | `bash apps/edge/scripts/bench-smoke-phase2.sh`                                                         | Fails at preflight (no xmllint/sqlite3) | SKIP (env limitation; Wed checkpoint is the gate) |

### Probe Execution

| Probe                                     | Command                                        | Result                                     | Status               |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------ | -------------------- |
| `apps/edge/scripts/bench-smoke-phase2.sh` | `bash apps/edge/scripts/bench-smoke-phase2.sh` | exit 1: "preflight: 'xmllint' not on PATH" | MISSING_TOOLS_IN_ENV |

The probe correctly bails because the verifier environment lacks the
production tools (xmllint + sqlite3). Plan 02-06 acknowledges this:
the authoritative gate is the Wednesday-morning bench checkpoint
(Task 4, deferred to operator at the bench laptop). The CI surface
(`apps/edge/scripts/bench-smoke-phase2.test.ts`) does verify the
script is executable AND fails clearly when no bridge is reachable
— that wrapper passes inside the edge test suite above.

### Requirements Coverage

| Requirement           | Source Plan(s)                    | Description                                                 | Status              | Evidence                                                                                                       |
| --------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| REQ-EXT-MEOS-001      | 02-01, 02-02, 02-03, 02-04, 02-06 | MeOS coexistence — MIP + MOP                                | SATISFIED           | mip.ts + mop.ts wired; mip.test.ts + mop.test.ts pass; bench-smoke A2 + A6 (when prod-tools available)         |
| REQ-STD-004 (partial) | 02-01, 02-02                      | Eventor runner DB pull (entries pull/push remain Phase 2.1) | SATISFIED (partial) | cachedcompetitors download path + lookup; e2e walkup-eventor green                                             |
| REQ-PRIV-002          | 02-01, 02-02, 02-05, 02-06        | 30-day post-event PII scrub                                 | SATISFIED           | retention.ts dual UPDATE (competitors + hired*cards.contact*\*); 6 P206 tests pass                             |
| REQ-OPS-001           | 02-01, 02-06                      | No-internet operation                                       | SATISFIED           | Eventor boot D-EV-3 warn-and-run; bridge boots with empty/stale cache; runbook covers offline recovery         |
| REQ-EVT-CMP-004       | 02-02, 02-05                      | Walk-up + hired-card lifecycle                              | SATISFIED           | POST /api/competitors hired_card extension; hyrbricka.spec.ts green                                            |
| REQ-UI-003            | 02-05                             | Live readout view                                           | SATISFIED           | ReadoutView extensions (hired_card_open + meos_merge + hired_card_returned WS cases); 3 new readout tests pass |
| REQ-UI-005            | 02-02b                            | (registration-desk ergonomics — interpreted by plan 02b)    | SATISFIED           | registration-queue.spec.ts green                                                                               |
| REQ-UI-006            | 02-02b                            | Swedish-first i18n                                          | SATISFIED           | 17 + 5 + 17 new keys in sv.json + en.json with parity; i18n parity test green                                  |
| REQ-UI-007            | 02-02b                            | Card-beep auto-advance                                      | SATISFIED           | {#key currentCard.cardNumber} re-mount pattern; e2e exercises FIFO + dedupe                                    |

### Anti-Patterns Found

| File                                               | Line | Pattern                                                                               | Severity | Impact                                                                                 |
| -------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `apps/edge/src/ingest/courseImport.ts`             | 105  | `classId = cr.class_id_ref ? ... : null` returns null silently for class-less courses | Warning  | Allows the import to succeed but produces unusable downstream state (SC5 root cause)   |
| `apps/web/src/lib/screens/WalkupModal.svelte`      | 339  | `{#each classes as cls}` empty-list shows only the disabled placeholder               | Warning  | Operator sees empty Bana picker; can't save walk-up — no error, no fallback to courses |
| Various task SUMMARYs (02-02, 02-04, 02-05, 02-06) | -    | "commitlint/prettier flakes" recurring in Issues Encountered                          | Info     | Process noise, not code defect                                                         |

**No `TBD`/`FIXME`/`XXX` debt markers found in Phase 2.0 modified files.**

### Human Verification Required

See frontmatter `human_verification` block — 5 items needing human
testing (4 are the Wednesday bench checkpoint sub-items; 1 is the
SC5 remediation decision).

### Gaps Summary

**1 hard BLOCKER + 1 deferred-to-bench:**

1. **SC#5 — Course-only model BLOCKER.** The CONTEXT.md decision #1
   asserted "Phase 1's CourseData importer already auto-creates a 1:1
   class-per-course when no ClassList is provided" but this auto-create
   path does NOT exist in the code. The actual 4-klubbs courseData
   (`.reference/2026-05-20 4-klubbs_coursedata.xml`) has zero `<Class>`
   elements; the importer therefore creates zero classes; the
   WalkupModal Bana picker iterates `classes` (not `courses`) so it's
   empty; operator can't select a Bana → can't save a walk-up. The
   runbook does not bridge this gap either.
   Three remediation paths (operator-decision):
   - (a) **Recommended.** Add auto-class-per-course fallback in
     `apps/edge/src/ingest/courseImport.ts`: when `data.classes.length
=== 0 && data.courses.length > 0`, synthesize a class per course
     with `class.name = course.name` and link `course.classId =
synthClass.id`. Add e2e using the real 4-klubbs XML.
   - (b) Document a runbook curl snippet ("Before step 8, create the
     5 classes:") + ship a wizard UI step. Operator workload but no
     code change.
   - (c) Refactor WalkupModal to iterate `courses` (or pass a
     unified Bana[] prop). Wider blast radius — touches Phase 1
     readout DTO too.

2. **SC#1 — Wednesday bench checkpoint.** Acknowledged by verification
   context as the authoritative production gate. Not a code-path
   concern; deferred to operator action at 2026-05-20 ~16:30 CEST.

**Other deferrals (Phase 2.1 — confirmed absent from Phase 2.0 code as expected):**

- No Yjs collaborative editing imports (`grep -r "yjs" apps/` returns 0 hits — verified)
- No QR self-signup public route (no public surface added)
- No Eventor entries pull (only cachedcompetitors download path)
- No SendPunch TCP server (only MIP+MOP)
- No spectator live results page (no new public route)
- No crash-recovery hardening beyond MOP auto-merge (D-MOP-3 is the floor)

**Phase 2.0 implementation backlog status:** code-path complete for
SCs 2/3/4/6; SC1 properly deferred to bench; **SC5 has a real BLOCKER
that needs an operator decision before Wednesday.**

---

_Verified: 2026-05-17T02:43Z_
_Verifier: Claude (gsd-verifier, Opus 4.7)_
