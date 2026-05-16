---
created: 2026-05-16T14:30:00+02:00
title: autoBindNewCompetitors uses N+1 query pattern
area: perf
files:
  - apps/edge/src/projection/auto-bind.ts
source: PR #3 Gemini review, 2026-05-16 (medium)
---

## Problem

`autoBindNewCompetitors` in `apps/edge/src/projection/auto-bind.ts` runs
TWO database queries per candidate competitor inside its main loop:

1. SELECT events WHERE event_type = 'card_bound' AND ... — has this
   competitor already been bound?
2. SELECT events WHERE event_type = 'card_read' AND card_number = ... —
   has any card_read landed for this card?

For N candidate competitors (typically all newly-imported entries from
EntryList that have a card_number), that's 2N queries.

## Impact

- This function runs **once per EntryList import**, not per event.
- Phase 2 sanctioned competition with 200 pre-registered starters
  → ~400 SQLite queries → ~50-100ms one-shot cost on import.
- Worst-case Phase 4-5 with 25k starters → 50k queries → multi-second
  import pause. Operator-perceptible.

## Proposed fix

Pre-load both sets once before the loop, then O(1) Set lookups:

```ts
const readCardNumbers = handle.db
  .select({ cardNumber: sql<number>`json_extract(${events.payload}, '$.card_number')` })
  .from(events)
  .where(and(eq(events.competitionId, competitionId), eq(events.eventType, 'card_read')))
  .all();
const readSet = new Set(readCardNumbers.map((r) => r.cardNumber));

const boundCompetitorIds = handle.db
  .select({ id: sql<string>`json_extract(${events.payload}, '$.competitor_id')` })
  .from(events)
  .where(and(eq(events.competitionId, competitionId), eq(events.eventType, 'card_bound')))
  .all();
const boundSet = new Set(boundCompetitorIds.map((r) => r.id));

for (const c of withCard) {
  if (boundSet.has(c.id)) continue;
  if (!readSet.has(c.cardNumber!)) continue;
  // ... emit synthetic card_bound event
}
```

## When to fix

Phase 4 or 5 perf hardening, OR earlier if a Phase 2 operator reports
slow EntryList imports on large fields. No urgency for Phase 1/2.
