---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# Event sourcing as the core data model

## Context and Problem Statement

MeOS-era systems store mutable result tables and have no clean recovery
from corrupt state under tournament pressure. Multi-node collaboration
and offline-first operation are bolted on. What data model makes those
properties native?

## Considered Options

- Mutable normalized schema (like MeOS / OLA)
- Event-sourced log with deterministic projections (reducers) for all
  derived state
- CRDT-everywhere (Automerge / Yjs for every entity)

## Decision Outcome

Chosen option: **event-sourced log**, because every punch is naturally
an immutable event keyed by `(node_id, local_seq)`. All derived state
(results, splits, placements, DNF, class standings) is computed by
stateless reducers. Bugs are fixed by updating the reducer and
recomputing — no corrupt state to repair. CRDT-everywhere was rejected
because the event log is conflict-free by construction; Yjs is retained
only for editable forms where genuine concurrent edits exist.

## More Information

- See REQ-EVT-001..007 in `.planning/REQUIREMENTS.md`.
- Schema in `.planning/research/architecture.md` §"Event log schema".
