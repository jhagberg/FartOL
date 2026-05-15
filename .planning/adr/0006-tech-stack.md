---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# Tech stack: Node.js + Fastify + SQLite/Postgres + SvelteKit

## Context and Problem Statement

The three-tier architecture (ADR-0002) needs concrete technology
choices for edge, central, frontend, and ancillary concerns. What is
the stack?

## Decision Outcome

| Layer | Choice | Reason |
|---|---|---|
| Edge backend | Node.js 22 LTS + Fastify | Shared TS types with frontend; mature `@serialport` |
| Edge DB | SQLite via `better-sqlite3` | Synchronous, ~10k writes/sec on Pi 5 |
| Central backend | Node.js 22 LTS + Fastify | Symmetric with edge; no language switch |
| Central DB | Postgres 16 | Partitionable, Electric-compatible |
| Read sync (central→client) | ElectricSQL Shapes | GA Mar 2025; Durable Streams Dec 2025 |
| Collab edits (forms only) | Yjs | Only for shared forms, not punches |
| Frontend | SvelteKit (PWA) | Smaller bundles than React; matters on forest 4G |
| Mobile (optional) | Capacitor wrapper of PWA | Only if iOS-as-operator becomes critical |
| Printing | `node-escpos` + `escpos-printer-db` | Open ESC/POS, avoids 72mm format hell |
| Edge hardware (dedicated) | Raspberry Pi 5 (4 GB) + PiJuice UPS | ~1 200 SEK, Linux, USB hub for SI |

## Rejected (with reason)

- **Electron** — too heavy; Tauri / Capacitor if a desktop wrapper is
  needed.
- **React** — fine, but Svelte's bundles are smaller; bundle size
  matters in the forest.
- **GraphQL** — overengineering at this scale; REST + WebSocket
  suffices.
- **Microservices** — overengineering; two well-structured monoliths
  is the right number.
- **Kafka / NATS** — possibly Phase 5 for public fan-out; Electric
  covers Phase 1–4.
- **CRDTs for punches** — unnecessary; event log is conflict-free by
  construction.

## More Information

- `.planning/research/architecture.md` §"Tech stack".
