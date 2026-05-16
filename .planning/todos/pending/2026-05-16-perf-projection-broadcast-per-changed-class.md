---
created: 2026-05-16T14:30:00+02:00
title: Projection store broadcasts results_update for ALL classes every recompute
area: perf
files:
  - apps/edge/src/projection/store.ts
  - apps/edge/src/projection/reduce.ts
source: PR #3 Gemini review, 2026-05-16 (medium)
---

## Problem

`createProjectionStore.recomputeNow` in `apps/edge/src/projection/store.ts:80-92`
emits one `results_update` WS envelope per class in the competition,
unconditionally, on every recompute:

```ts
for (const [classId, rows] of next.results_by_class) {
  opts.broadcast(resultsChannel(competitionId), {
    type: 'results_update',
    payload: { class_id: classId, class_name, rows },
    seq: next.last_event_seq,
  });
}
```

A single card_read mutates exactly one class's results (the runner's
class). The store still broadcasts updates for every class — generating
redundant WS traffic and triggering client-side re-renders for unchanged
classes.

## Impact

- **Phase 1 (training, 5 classes × 30 card_reads × 50ms debounce)**:
  ~150 envelopes per session. Negligible.
- **Phase 2 (sanctioned, 10-20 classes × 200 starters)**: ~2-4k
  envelopes per event. Still invisible.
- **Phase 4-5 (O-ringen, ~100 classes × 25k starters)**: meaningful
  WS bandwidth + client re-render cost.

## Proposed fix

The reducer needs to return _which classes actually changed_ since the
last reduce. Options:

1. **Diff at the store level**: compare `prev.results_by_class` vs
   `next.results_by_class` row-by-row, broadcast only changed classes.
   Cheap (Map equality check); no reducer API change.

2. **Event → class index**: walk the new events since `prev.last_event_seq`,
   map each `card_read` to a `competitor.class_id`, build the
   `Set<changedClassId>`. Broadcast only those.

Option 1 is simpler and doesn't change the reducer's pure-function shape.

## When to fix

Phase 4 or 5 perf hardening. No urgency for Phase 1/2.
