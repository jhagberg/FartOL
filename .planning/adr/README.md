# Architecture Decision Records

This directory holds Architecture Decision Records (ADRs) for the
project, following the [MADR 4.0.0](https://adr.github.io/madr/)
format.

Use `0000-template.md` for new decisions. The template is the full
MADR variant; optional sections are marked. For small, self-contained
decisions, omit the optional sections.

## Status conventions

- **proposed** — under discussion
- **accepted** — decided and in force
- **deprecated** — no longer recommended but not yet replaced
- **superseded by ADR-NNNN** — replaced by a newer decision

## Conventions

- File names: `NNNN-short-kebab-case-title.md` where `NNNN` is
  zero-padded sequential.
- IDs are never reused.
- When an ADR is superseded, update its `status` field to
  `superseded by ADR-NNNN` rather than deleting the file.
- `STATE.md` carries current-state pointers; decision content lives
  here, not there.

## Index

| ID                                                | Title                                                             | Status   |
| ------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| [0001](0001-reimplement-do-not-fork-meos.md)      | Reimplement MeOS functionality, do not fork                       | accepted |
| [0002](0002-three-tier-architecture.md)           | Three-tier architecture: edge-bridge + browser + optional central | accepted |
| [0003](0003-event-sourcing-as-core-data-model.md) | Event sourcing as the core data model                             | accepted |
| [0004](0004-electricsql-is-read-sync-only.md)     | ElectricSQL is used for read-sync only, not write-sync            | accepted |
| [0005](0005-sportident-code-isolated-mit.md)      | SportIdent protocol code isolated in MIT-licensed package         | accepted |
| [0006](0006-tech-stack.md)                        | Tech stack: Node.js + Fastify + SQLite/Postgres + SvelteKit       | accepted |
| [0007](0007-standards-first-interop.md)           | Standards-first interop: IOF XML, Eventor, ROC, SIRAP, MeOS TCP   | accepted |
| [0008](0008-pii-in-append-only-event-log.md)      | PII in append-only event log: scrub competitor row, not payload   | accepted |
