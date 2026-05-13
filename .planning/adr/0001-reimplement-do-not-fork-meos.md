---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# Reimplement MeOS functionality, do not fork

## Context and Problem Statement

MeOS is the dominant orienteering competition management system in
Sweden, with a mature feature set and proven UX. Should this project
fork its codebase or reimplement from scratch?

## Considered Options

- Fork MeOS and modernize on top
- Clean-room reimplement, drawing inspiration but sharing no code

## Decision Outcome

Chosen option: **clean-room reimplement**, because MeOS is licensed
**AGPL-3.0** (not GPL-3.0). A derived network-accessible service
triggers source-publication obligations to remote users under AGPL
§13, which is heavier than this project is willing to carry. We
reimplement with inspiration but no shared code.

## More Information

- MeOS source: <https://github.com/melinsoftware/meos>
- Related: ADR-0005 (SportIdent code isolated in MIT-licensed package).
