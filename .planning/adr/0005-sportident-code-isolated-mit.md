---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# SportIdent protocol code isolated in MIT-licensed package

## Context and Problem Statement

The SportIdent serial protocol has no official open license;
implementations rely on reverse engineering for interoperability. What
is the right legal and architectural containment for this code?

## Considered Options

- Embed SI protocol code throughout the codebase under the main
  AGPL-3.0 license
- Isolate SI code in a dedicated package under a permissive license
  (MIT)
- Use only the official SPORTident SDK (request-only, restrictive
  terms)

## Decision Outcome

Chosen option: **isolate in `packages/sportident/` under MIT**, because
(1) reverse engineering for interoperability is permitted under EU
InfoSoc Directive Art. 6, (2) SPORTident has tolerated third-party
implementations (MeOS, SI-Droid, OE12, QuickEvent) for 20+ years, and
(3) scoping the legally sensitive code to one MIT-licensed package
limits worst-case exposure while letting the rest of the project use
AGPL-3.0. Other packages consume a clean async `SiReader` interface.

## More Information

- Interface sketch in `.planning/research/architecture.md`
  §"SportIdent isolation".
- Related: ADR-0001.
