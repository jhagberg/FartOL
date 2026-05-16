---
created: 2026-05-16T16:45:00+02:00
title: Update Tuesday → Wednesday across planning docs + test fixtures
area: docs,tests
files:
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md
  - .planning/phases/01-single-laptop-training-mvp/01-VERIFICATION.md
  - .planning/phases/01-single-laptop-training-mvp/01-HUMAN-UAT.md
  - tests/e2e/wizard.spec.ts
  - apps/edge/src/xml/iofExport.test.ts
  - apps/edge/src/xml/parse.test.ts
  - apps/edge/src/ingest/courseImport.test.ts
  - apps/edge/src/ingest/entryImport.test.ts
  - apps/edge/src/routes/competitions.test.ts
  - apps/edge/src/routes/export.test.ts
  - apps/edge/src/routes/competitionsFromWizard.test.ts
source: PR #3, conversation 2026-05-16 — GitHub Pages landing page was corrected to Wednesday; planning + tests still say Tuesday/Tisdag
---

## Problem

The Stora Tuna OK club's regular training session is on **Wednesday** (onsdag),
not Tuesday. The GitHub Pages landing page (`docs/index.html:542`) was
corrected during Phase 1.5 work (`c8cf53a` and follow-ups on main):

> "Redo för en riktig **onsdagsträning** hos Stora Tuna OK"

But the planning artifacts and test fixtures still reference "Tuesday" / "Tisdag":

| File                    | Line(s)         | Current                                                                                             |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md`  | 59              | Success criterion #7: "StorTuna OK **Tuesday** training (20-40 starters) runs without falling over" |
| `.planning/STATE.md`    | 6               | PR-status line mentions "**Tuesday** rehearsal"                                                     |
| `01-CONTEXT.md`         | 11, 323, 358    | "StorTuna OK **Tuesday** training" (3 spots)                                                        |
| `01-VERIFICATION.md`    | 16, 33, 49, 209 | "**Tuesday** rehearsal" + SC#7 wording                                                              |
| `01-HUMAN-UAT.md`       | 25              | SC#7 test label                                                                                     |
| Test fixtures (8 files) | various         | `'StorTuna Tisdag'` / `'StorTuna Tuesday'` competition names                                        |

## Why we haven't bulk-fixed yet

- The user-facing surface (`docs/index.html`) is already correct.
- Test fixtures are pre-existing strings; changing them touches snapshots
  and assertions but doesn't change product behavior.
- Risk: in-flight Phase 1 PR #3 should not be expanded in scope mid-review.

## Proposed fix

When Phase 2 (or a dedicated docs-cleanup PR) lands:

1. **Planning docs** (10 spots across 5 files): swap "Tuesday" → "Wednesday"
   and "Tisdag" → "Onsdag". Substantive — these are the project's stated
   success criteria.
2. **Test fixtures** (8 files, ~14 spots): swap competition names to use
   "Onsdag" / "Wednesday". Mechanical; double-check assertions that
   reference the name string verbatim.
3. **Codex's 01-REVIEW.md** at line 97 mentions "Tuesday rehearsal" — leave
   alone (it's Codex's text describing what the planning docs said at
   review time; updating the planning docs is the canonical fix).

## When to fix

Standalone PR, post Phase 1 merge. Not blocking anything. Surfaced after a
Codex round-2 review re-mentioned "Tuesday" and Jonas reminded us that
Wednesday is the correct day.
