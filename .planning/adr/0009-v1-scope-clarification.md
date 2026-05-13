---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
consulted: []
informed: []
---

# Clarify v1 scope: retag three Phase-2 requirements from v2 to v1

## Context and Problem Statement

`REQUIREMENTS.md` defined the scope buckets as **v1 = required for
Phase 1–2** and **v2 = required for Phase 3–5**, but three requirements
tagged `(v2)` were mapped into Phase 2 by `ROADMAP.md`:

- `REQ-UI-008` — multi-operator simultaneous editing (Yjs CRDT)
- `REQ-STD-004` — Eventor REST API integration
- `REQ-OPS-004` — live edge-node health dashboard

This contradicted the bucket definitions. `STATE.md` also carried an
open question — "Yjs for collaborative form editing — necessary in v1,
or defer to v2?" — logically coupled to this scoping question.

## Decision Drivers

- `REQUIREMENTS.md` bucket definitions are clear and don't need
  rewriting.
- Phase 2's deliverable — "a sanctioned competition with 100–200
  starters and multiple secretariat operators editing concurrently" —
  cannot be met without Eventor sync (Swedish federation requirement)
  or collaborative editing (the differentiator from Phase 1).
- The bundle should be internally consistent before Phase 0 begins;
  planning ambiguities compound when carried into execution.

## Considered Options

- **(a) Retag the three REQs from `(v2)` to `(v1)`** — matches the
  existing bucket definitions; minimal change.
- **(b) Redefine the buckets** — e.g., introduce `v1 / v2 / v3` per
  phase pair; more invasive, no clear benefit.
- **(c) Move the three REQs out of Phase 2 into Phase 3+** — strips
  Phase 2 of Eventor and concurrent editing, reducing it to "Phase 1
  with more chairs" and breaking the sanctioned-event milestone.

## Decision Outcome

Chosen option: **(a) retag**. The labels were the inconsistent element;
the bucket definitions and phase mappings were both internally
consistent. Inline clarifiers added to the bucket headers ("MVP scope"
/ "extended scope") reduce the chance of regression.

Side effect: closes the `STATE.md` open question on Yjs. Yjs is in v1
because Phase 2 needs `REQ-UI-008`. Whether to actually use Yjs vs. an
alternative for Phase 2 collaboration belongs in
`/gsd-discuss-phase 2`, not in this ADR.

### Consequences

- Good, because `REQUIREMENTS.md`, `ROADMAP.md`, and `STATE.md` are now
  internally consistent.
- Good, because one Phase-0-irrelevant open question is removed.
- Neutral, because Phase 2 success criteria already committed to these
  three behaviors; the labels were trailing reality.

## More Information

- Affects `REQUIREMENTS.md` lines 4–8 (bucket headers) and the
  REQ tags for REQ-UI-008, REQ-STD-004, REQ-OPS-004.
- Affects `STATE.md` (Yjs v1/v2 open question removed; inline DECs
  replaced by pointer to this directory).
