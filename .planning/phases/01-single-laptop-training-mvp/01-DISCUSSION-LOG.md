# Phase 1: Single-laptop training MVP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 1-Single-laptop-training-mvp
**Areas discussed:** Scope tightening, Monorepo + binary, Data model & matching, Realtime + UI shape

---

## Scope tightening

### Receipt path (SC #5 says "thermal printer OR QR")

| Option                | Description                                                               | Selected |
| --------------------- | ------------------------------------------------------------------------- | -------- |
| QR only               | Skip thermal in P1; QR-receipt on readout screen. No hardware dependency. |          |
| Thermal + QR fallback | Both. Default thermal via node-escpos; fall back to QR.                   |          |
| Thermal only          | Skip QR. Thermal print only. Legacy MeOS UX clubs expect.                 | ✓        |

**User's choice:** Thermal only.

### i18n depth (REQ-UI-006 — Swedish primary, "from day one")

| Option                   | Description                                             | Selected |
| ------------------------ | ------------------------------------------------------- | -------- |
| Full i18next, sv default | Wire i18next, sv.json + en.json, sv as default locale.  | ✓        |
| Wrapper only, sv strings | i18n() helper but hardcoded sv strings; refactor later. |          |
| Swedish hardcoded        | No i18n machinery; reneges on REQ-UI-006.               |          |

**User's choice:** Full i18next, sv default.

### IOF XML / entry import scope (Jonas asked about Eventor)

| Option                     | Description                                                       | Selected |
| -------------------------- | ----------------------------------------------------------------- | -------- |
| Purple Pen + walk-ups only | SC#1 only. Walk-ups for runners. No IOF/Eventor in P1.            |          |
| + IOF EntryList import     | Add IOF XML 3.0 EntryList import (clubs can export from Eventor). | ✓        |
| + Eventor API pull         | Pull-forward REQ-STD-004 partially (pull only, no push).          |          |
| Eventor pull + result push | Full REQ-STD-004 in P1; largest scope expansion.                  |          |

**User's clarifying question:** "Can you check Meos I think it can import runners from eventor do we plan to support that also using the eventor API?"

**Claude's answer:** Yes, MeOS imports from Eventor via the Swedish federation's REST API. That's REQ-STD-004. ROADMAP explicitly places it in Phase 2 (sanctioned competition), reasoning that Phase 1 = training MVP, no internet required, and StorTuna training typically has walk-ups, not pre-registered Eventor entries. Defensible scope-pull-forward, but Eventor remains a Phase 2 deliverable.

**User's choice (after clarification):** + IOF EntryList import. Eventor explicitly stays in Phase 2.

### Walk-up registration (REQ-EVT-CMP-004)

| Option              | Description                                                           | Selected |
| ------------------- | --------------------------------------------------------------------- | -------- |
| First-class in P1   | Dedicated walk-up form at readout view; card auto-binds on next read. | ✓        |
| Operator-only modal | Unknown card triggers inline modal; operator types details.           |          |
| Defer to Phase 2    | Pre-import only in P1; unknown cards bucket-and-confirm-later.        |          |

**User's choice:** First-class in P1.

---

## Monorepo + binary

### Repo layout

| Option                  | Description                                                                 | Selected |
| ----------------------- | --------------------------------------------------------------------------- | -------- |
| All packages/           | Add packages/edge-bridge/ and packages/web/ alongside packages/sportident/. |          |
| apps/ + packages/       | apps/edge/ + apps/web/ for runtime apps; packages/ for libraries.           | ✓        |
| Single monolith package | One root src/ with server/ + web/ subdirs.                                  |          |

**User's choice:** apps/ + packages/.

### Production binary shape (REQ-OPS-001 — single-command install)

| Option                        | Description                                                                           | Selected |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------- |
| Single binary, adapter-static | One Fastify process serves built SvelteKit + REST + WS. SEO irrelevant for localhost. | ✓        |
| adapter-node SvelteKit server | SvelteKit's own Node server in-process; SSR + form actions.                           |          |
| Two binaries                  | fartol-bridge + fartol-web; violates REQ-OPS-001.                                     |          |

**User's clarifying question:** "yes can you give me some pros and cons for the different options and do we have any best-pratice here can /context7 help us?"

**Claude's research (via context7):** SvelteKit docs (svelte.dev/docs/kit/project-types): "the recommended approach is to deploy the SvelteKit frontend separately using adapter-node…" — but that targets non-Node backends. For Node+Node, single-binary with adapter-static is reasonable when SEO doesn't matter. Pros/cons table presented in chat:

- Single binary: one process, REQ-OPS-001 honored, no SSR, data via REST.
- adapter-node: native SvelteKit story; either replaces Fastify (re-implement plugins in hooks) or runs alongside (two ports).
- Two binaries: cleanest separation but violates REQ-OPS-001.

**User's choice (after clarification):** Single binary, adapter-static.

### Shared types

| Option                 | Description                                                                | Selected |
| ---------------------- | -------------------------------------------------------------------------- | -------- |
| packages/shared-types/ | Pure-TS package, workspace:\*. Standard pnpm pattern (context7 / pnpm.io). | ✓        |
| Inline in edge-bridge  | One fewer package; couples web build to bridge build.                      |          |
| Inline in sportident   | Reuses existing package; breaks D-04 standalone-shape.                     |          |

**User's choice:** packages/shared-types/.

---

## Data model & matching

### Where competition configuration lives

| Option                                     | Description                                                          | Selected |
| ------------------------------------------ | -------------------------------------------------------------------- | -------- |
| Mutable SQL tables                         | Punches stay in immutable events table; config = normal CRUD tables. | ✓        |
| Everything as events                       | Pure event-sourced; cleaner conceptually, more boilerplate.          |          |
| Hybrid: events for create, tables for edit | Initial records via events; subsequent edits mutate. Ambiguous.      |          |

**User's choice:** Mutable SQL tables.

### DB query layer on better-sqlite3

| Option                           | Description                                                            | Selected |
| -------------------------------- | ---------------------------------------------------------------------- | -------- |
| Drizzle                          | Schema-as-TS, type-safe, built-in migrations. Dominant 2025–26 choice. | ✓        |
| Kysely                           | Pure TS query builder; migrations via separate kysely-codegen.         |          |
| Raw SQL + hand-rolled migrations | Direct better-sqlite3 prepared statements; lightest.                   |          |

**User's choice:** Drizzle.

### Card-to-competitor matching policy

| Option                                  | Description                                                         | Selected |
| --------------------------------------- | ------------------------------------------------------------------- | -------- |
| Hybrid: auto on match, confirm walk-ups | Auto-attach when in start list; modal for unknown SI. Matches MeOS. | ✓        |
| Always auto-assign                      | Card read → immediate attach; placeholder for unknown.              |          |
| Always confirm                          | Every card prompts operator; safest but slow.                       |          |

**User's choice:** Hybrid: auto on match, confirm walk-ups.

### DNF / MP detection trigger (REQ-EVT-CMP-006)

| Option                | Description                                                         | Selected |
| --------------------- | ------------------------------------------------------------------- | -------- |
| Pure-punch projection | Reducer over event log: MP = missing/out-of-order; DNF = no finish. | ✓        |
| + Operator override   | Above + manual_dnf/manual_dsq events with reason.                   |          |
| + Time-based auto-DNF | Above + auto-DNF after event time + grace.                          |          |

**User's choice:** Pure-punch projection.

---

## Realtime + UI shape

### Live update transport (bridge → browser tabs)

| Option                   | Description                                                                                   | Selected |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| WebSocket                | @fastify/websocket on bridge, native WebSocket in SvelteKit. Phase 2 layers Yjs over same WS. | ✓        |
| Server-Sent Events (SSE) | One-way server→client; EventSource auto-reconnects; commands via POST.                        |          |
| Polling                  | Browser polls GET /api/state; dead simple, wasteful, laggy.                                   |          |

**User's choice:** WebSocket.

### PWA depth in Phase 1 (REQ-UI-001)

| Option                  | Description                                                                        | Selected |
| ----------------------- | ---------------------------------------------------------------------------------- | -------- |
| Manifest + installable  | Web manifest, icons, installable to Chrome Android home screen. No service worker. | ✓        |
| Full SW + offline cache | Service worker that caches assets; useful for arena WiFi flakiness.                |          |
| Skip PWA, plain web app | Defer manifest to P2; reneges on REQ-UI-001.                                       |          |

**User's choice:** Manifest + installable.

### Three-click new-competition flow (REQ-UI-002)

| Option                         | Description                                                                    | Selected |
| ------------------------------ | ------------------------------------------------------------------------------ | -------- |
| Create → Import course → Ready | Click 1: New competition; Click 2: Import course .xml; Click 3: Start readout. | ✓        |
| Wizard with progress           | Multi-step modal with progress bar; not "three-click."                         |          |
| Dashboard-first                | Land on dashboard, click New, fill long form, Save.                            |          |

**User's choice:** Create → Import course → Ready.

---

## Claude's Discretion

No "you decide" answers were given. Discretion areas where the planner / executor has flexibility (planner-territory) are listed in `01-CONTEXT.md` §Decisions §Claude's Discretion.

## Deferred Ideas

See `01-CONTEXT.md` §Deferred Ideas for the canonical list. Highlights:

- Eventor REST API pull + result push (REQ-STD-004) — Phase 2
- QR-receipt path (REQ-UI-005) — Phase 2
- IOF XML 2.0.3 read (REQ-STD-003) — Phase 2 or later
- Multi-operator Yjs (REQ-UI-008) — Phase 2
- Edge-node health dashboard (REQ-OPS-004) — Phase 2
- macOS / Windows hardware path — Phase 2 or 3
- Time-based auto-DNF — Phase 2 or 3
- Service worker / offline asset cache — Phase 3+
