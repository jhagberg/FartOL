---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# ElectricSQL is used for read-sync only, not write-sync

## Context and Problem Statement

ElectricSQL is marketed as a sync engine for Postgres ↔ clients. Does
it solve our edge-node-to-edge-node synchronization problem, or is it
narrower than that?

## Considered Options

- Use Electric for both edge↔central read flow AND edge↔edge peer sync
- Use Electric only for central→client read-sync; write our own
  edge↔edge protocol
- Don't use Electric at all

## Decision Outcome

Chosen option: **Electric is read-sync only**. Per the Electric docs,
it is a **read-path** sync engine (Postgres → clients via Shapes), not
a multi-master write-sync engine. The autonomous-field-node problem is
our responsibility: edge-bridges push events to each other and to
central via a custom append-only protocol, idempotent by
`(node_id, local_seq)`. Electric drives the public-viewer read flow,
where it excels (partial sync, SSE, reconnect).

## More Information

- Electric docs: <https://electric-sql.com>
- `.planning/research/architecture.md` §"Synchronization model".
