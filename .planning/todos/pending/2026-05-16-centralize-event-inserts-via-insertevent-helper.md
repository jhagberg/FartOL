---
created: 2026-05-16T15:30:00+02:00
title: Centralize event inserts through the insertEvent helper
area: refactor
files:
  - apps/edge/src/routes/competitors.ts
  - apps/edge/src/routes/manual.ts
  - apps/edge/src/routes/dev.ts
  - apps/edge/src/si/eventInserter.ts
source: PR #3 Gemini round-3 review, 2026-05-16 (medium)
---

## Problem

`apps/edge/src/si/eventInserter.ts` exports `insertEvent(handle, nodeId,
eventType, eventTimeMs, payload, competitionId)` which centralizes:

- `local_seq` generation (via `app.fartolaNextLocalSeq` / `nextLocalSeq`
  injection point — PATTERNS S-2)
- `recorded_at_ms = Date.now()` stamp
- `node_id` from the per-process stable id
- the actual `events` table insert

The bridge (`apps/edge/src/si/bridge.ts`) uses it for all 5 SI event types
(card_inserted / card_read / card_removed / frame_error /
connection_changed). The walk-up + replace-card + manual-DNF + dev
simulate-read paths, however, do the insert by hand:

| File                    | Line | Event type                          | Inline insert |
| ----------------------- | ---- | ----------------------------------- | ------------- |
| `routes/competitors.ts` | 222  | `card_bound` (replace-card)         | manual        |
| `routes/competitors.ts` | 394  | `card_bound` (walk-up create)       | manual        |
| `routes/competitors.ts` | 507  | `card_bound` (consent confirmation) | manual        |
| `routes/competitors.ts` | 598  | `card_bound` (profile edit)         | manual        |

(Plus likely similar patterns in `manual.ts` and `dev.ts`.)

Each inline insert reconstructs the same shape: `nodeId`, `localSeq`,
`competitionId`, `eventType`, `eventTimeMs`, `recordedAtMs`, `payload`.

## Why it matters

- **Drift risk**: a future schema change to the events row (e.g. adding
  a `synthetic` flag, or a `created_by` audit column) would need touching
  every call site instead of one.
- **Sequence-injection point**: PATTERNS S-2 lets test 9 swap
  `fartolaNextLocalSeq` to a throwing fn to verify atomicity. Inline
  inserts that reach for `app.fartolaNextLocalSeq` directly still go
  through the injection point, but the indirection isn't enforced —
  someone could hardcode a seq and break the contract silently.
- **Consistency**: most production-quality codebases centralize "insert
  one event" once; fartOLa did this for the bridge but not the REST
  surface.

## Why we haven't refactored yet

- The inline pattern works; tests cover it; no bug to chase.
- All 4+ inline sites have a `card_bound` event tightly coupled to a
  competitor mutation inside a `sqlite.transaction(() => {...})()`. The
  helper would need a variant that runs inside an existing transaction
  (vs starting its own) — straightforward but adds an API surface.
- Bigger refactor than fits a single PR-review-fix cycle.

## Proposed approach

1. Extend `insertEvent` to optionally accept a pre-computed `localSeq` so
   it can run inside an open transaction that already pulled the next
   seq (or thread the seq generator through the helper's args).
2. Replace each inline `app.fartolaDb.db.insert(events).values(...).run()`
   in `routes/competitors.ts` with `insertEvent(app.fartolaDb, app.fartolaNodeId, 'card_bound', now, {...}, competitionId)`.
3. Repeat for `manual.ts` and `dev.ts` (sweep grep `\.insert(events)` to find all sites).
4. Tests likely don't need changes — the inserted row shape is identical.

## When to fix

Phase 2 cleanup pass, or any time we're touching the routes for an
unrelated reason. Not urgent; no behavioural impact.
