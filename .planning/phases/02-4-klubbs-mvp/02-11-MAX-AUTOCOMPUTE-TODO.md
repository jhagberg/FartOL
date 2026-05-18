# Phase 2.1 todo — MAX auto-compute from class.max_time

**Status:** queued for Phase 2.1 (post 2026-05-20 race).
**Author:** jonas, 2026-05-18.
**Provenance:** carved out of the Phase 2.0 status-model extension (plan
02-11, see `apps/edge/src/projection/types.ts` Phase 2.0 comment block).

## Context

Phase 2.0 added four operator-asserted status states (`DNS`, `DQ`, `CANCEL`,
`MAX`) on top of the auto-detected `OK`/`MP`/`DNF`/`PEND` set. The states
are wired end-to-end (reducer, IOF XML export, UI, tooltips, tests) and the
operator can flip any competitor to any of the five manual states via the
LatestReadCard status popover.

**MAX is currently operator-manual-only.** When an operator decides a
runner blew past the class time cap, they flip the row to `MAX` with a
free-text reason. This was the right scope cut for the 2026-05-20 4-klubbs
race because:

- Phase 1 `CONTEXT.md D-12` deferred all time-auto-DNF / time-cap logic
- We have no `class.max_time` field on the `classes` table
- We have no operator UI to set max_time per class
- The race is a klubbtävling with no rigid cutoff — operator override is fine

## Phase 2.1 scope

Turn `MAX` into a computed state, equivalent to MeOS's
`oRunner.cpp:1245-1270` logic:

1. **Schema:** add `classes.max_time_sec INTEGER NULL` (NULL = no cap)
2. **Migration:** `0003_class_max_time.sql` — additive, no data backfill
3. **UI:** wizard step + class-edit form add a "Maxtid (mm:ss)" input
4. **Reducer:** in `apps/edge/src/projection/reduce.ts`, after
   `dnfMp.detectStatus` returns OK/MP, gate on
   `class.max_time_sec && elapsed_time_ms / 1000 > class.max_time_sec` →
   promote to `MAX`. Manual override still wins (`view.manual_status !==
null` short-circuits the auto-detect path).
5. **Tests:** OK→MAX promotion on cap exceeded; manual MAX persists after
   recompute; clear_manual_status re-derives MAX from auto-compute.
6. **IOF XML export:** `OverTime` enum already wired — no change.

## Out of scope (deferred further)

- Per-class soft-cutoffs (display "over time" but don't change status)
- Live countdown / "X runners still on course past cutoff" widget on
  ReadoutView — that's a Phase 3 ops affordance
- Automatic DNS sweep when race-end timestamp passes — different feature
  ([[reference_meos_source]] `oEvent::analyzeClassResultStatus`)

## References

- Phase 2.0 status extension: `apps/edge/src/projection/types.ts`,
  `apps/edge/src/projection/reduce.ts`, `apps/edge/src/xml/iofExport.ts`
- Phase 1 deferral: `.planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md`
  §D-12 (DNF/MP is a pure projection over the event log — no precomputed
  status column on competitors)
- IOF XSD `OverTime` enumeration: `apps/edge/src/xml/IOF.xsd:2959`
- Prior-art reference: MeOS `RunnerStatus::StatusMAX` (enum) +
  `oRunner.cpp:1245-1270` for the elapsed-vs-cap gate (read-only — see
  [[reference_meos_source]]; the fartol implementation is re-authored
  against the public spec, not ported).
