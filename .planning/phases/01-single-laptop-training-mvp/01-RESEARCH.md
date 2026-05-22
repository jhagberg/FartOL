# Phase 1: Single-laptop training MVP — Research

**Researched:** 2026-05-14
**Domain:** Node.js + Fastify edge bridge + SvelteKit PWA + better-sqlite3 + Drizzle + ESC/POS thermal + IOF XML 3.0
**Confidence:** HIGH on stack choices; MEDIUM on ESC/POS library; HIGH on architecture pattern; HIGH on schemas

## Summary

Phase 1 turns the Phase 0 NDJSON-emitting SI bridge into a runnable single-laptop training MVP. The stack is already locked by CONTEXT.md D-01..D-15 + ADR-0006; this research therefore focuses on **how** to instantiate that stack — not whether to. The biggest research takeaways:

1. **Purple Pen `.xml` IS IOF XML 3.0 CourseData.** Purple Pen's "Create Data Interchange File (IOF XML)" exports the same schema we already import for REQ-EVT-CMP-003. One importer, two requirements.
2. **`@fastify/static` + `setNotFoundHandler` is the canonical SPA-fallback pattern.** `adapter-static` with `fallback: '200.html'` produces a single HTML entry; Fastify serves it for any unmatched non-`/api/*` non-`/ws` request.
3. **ESC/POS landscape is messy but workable.** `node-thermal-printer@4.4.3` (Klemen1337, actively maintained — last modified 2026-01-27) is the best-supported pick for Star TSP143 + Epson TM-T20 + Brother PJ-7 via `/dev/usb/lp0`. `@node-escpos/core` is also alive but slower-moving (last modified 2024-03-13). Both pure-pkg JS solutions exist; no native binding needed.
4. **Drizzle's embedded migrator is one synchronous call.** `migrate(db, { migrationsFolder })` from `drizzle-orm/better-sqlite3/migrator` — runs at bridge startup, creates schema on cold start. The migration files need to ship inside the published `fartola` tarball.
5. **Single-binary packaging is a tarball, not a `pkg`-style executable.** Node SEA can't bundle `better-sqlite3` cleanly. `npm install -g fartola` with a `bin` field + bundled `migrations/`, `dist/web/` (built SvelteKit assets) and `IOF.xsd` is the path that Just Works.
6. **WebSocket fan-out is trivial.** `fastify.websocketServer.clients` iteration + per-connection channel-subscription state. Reconnect uses a small wrapper on the client; on `hello` with `last_seen_seq` server replays missed events from SQLite.
7. **Walking skeleton is the right first wave.** Wave 0 should stub every layer (fake punch event → SQLite insert → REST list → WS push → fake receipt print) and only then deepen each layer. The Phase 0 bench-replay fixture (`packages/sportident/tests/fixtures/jonas/`) is the natural simulate-read source.

**Primary recommendation:** Plan ~6 waves: (0) monorepo + walking skeleton + schema migrator, (1) competition + course-data import, (2) readout pipeline + WS, (3) walk-up + matching + DNF/MP reducer, (4) thermal print + i18n + UI screens, (5) IOF XML 3.0 export + backup + binary packaging.

## Architectural Responsibility Map

| Capability                              | Primary Tier                                | Secondary Tier                        | Rationale                                             |
| --------------------------------------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| SI card read                            | `apps/edge/` (Node)                         | `packages/sportident/` (consumed)     | ADR-0005 invariant. Only edge imports `serialport`.   |
| Event persistence (punches)             | `apps/edge/` (SQLite WAL)                   | —                                     | ADR-0003 event sourcing. Edge owns the immutable log. |
| Competition CRUD (config)               | `apps/edge/` (SQLite mutable tables)        | —                                     | D-09 carve-out from event sourcing. Standard tables.  |
| Card → competitor matching              | `apps/edge/` (reducer)                      | —                                     | Server-side projection. UI shows result.              |
| DNF / MP projection                     | `apps/edge/` (reducer)                      | —                                     | D-12 pure-punch projection over event log.            |
| IOF XML import (Purple Pen + EntryList) | `apps/edge/` REST                           | —                                     | Validation against XSD must be server-side.           |
| IOF XML export (ResultList)             | `apps/edge/` REST                           | —                                     | SC#6: XSD validation BEFORE saving.                   |
| ESC/POS thermal print                   | `apps/edge/`                                | —                                     | Writes to `/dev/usb/lp0`. Browser cannot.             |
| Walk-up registration                    | `apps/web/` (form) → `apps/edge/` (persist) | —                                     | UI captures, edge writes event + competitor row.      |
| Readout view live updates               | `apps/web/` (WS subscriber)                 | `apps/edge/` (WS publisher)           | D-13 WebSocket transport.                             |
| Live results page                       | `apps/web/` (WS subscriber)                 | `apps/edge/` (reducer + WS publisher) | Same channel pattern.                                 |
| i18n string resolution                  | `apps/web/` (locale switch)                 | —                                     | Pure client concern. Server is locale-agnostic in P1. |
| PWA manifest                            | `apps/web/` (static)                        | —                                     | D-14: manifest only, no service worker P1.            |
| Daily backup                            | `apps/edge/` (cron-in-process)              | —                                     | REQ-OPS-003. No human action.                         |
| Static asset serving (built SvelteKit)  | `apps/edge/` (`@fastify/static`)            | —                                     | D-06 single binary. One Fastify process.              |

## Standard Stack

### Core (locked by ADR-0006 + D-10/D-13)

| Library                    | Version                          | Purpose                                                                                          | Why Standard                                                                                                |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `fastify`                  | 5.8.5                            | HTTP server [VERIFIED: npm registry 2026-05-14]                                                  | ADR-0006. Mature plugin ecosystem. v5 is the current stable line.                                           |
| `@fastify/websocket`       | 11.2.0                           | WebSocket plugin [VERIFIED]                                                                      | Official Fastify plugin. Wraps `ws`. Matches Fastify v5.                                                    |
| `@fastify/static`          | 9.1.3                            | Static file serving + 404→SPA fallback [VERIFIED]                                                | Official Fastify plugin. `wildcard: false` mode + `setNotFoundHandler` is the documented SPA pattern.       |
| `@fastify/cors`            | 11.2.0                           | CORS [VERIFIED]                                                                                  | Localhost-only in P1 but enable for future LAN clients.                                                     |
| `@fastify/sensible`        | 6.0.4                            | `httpErrors` + utility decorators [VERIFIED]                                                     | Saves ~50 lines of error plumbing.                                                                          |
| `better-sqlite3`           | 12.10.0                          | Synchronous SQLite driver [VERIFIED]                                                             | ADR-0006. Sync API matches event-sourcing reducer style. ~10k writes/sec.                                   |
| `drizzle-orm`              | 0.45.2                           | Type-safe ORM + schema-as-TS [VERIFIED]                                                          | D-10. Drizzle peerDependencies includes `better-sqlite3 >=7`.                                               |
| `drizzle-kit`              | 0.31.10                          | Migration generator (dev-only) [VERIFIED]                                                        | Generates SQL migrations from schema.ts diffs.                                                              |
| `serialport`               | 13.x (via `packages/sportident`) | Already pinned in Phase 0 [VERIFIED: package.json]                                               | No change. Edge consumes via `SiMainStation`.                                                               |
| `svelte`                   | 5.55.5                           | UI runtime [VERIFIED]                                                                            | Svelte 5 runes (`$state`, `$derived`, `$effect`) are the locked Phase 1 reactivity model.                   |
| `@sveltejs/kit`            | 2.59.1                           | App framework [VERIFIED]                                                                         | D-07 adapter-static SPA mode.                                                                               |
| `@sveltejs/adapter-static` | 3.0.10                           | Static build adapter [VERIFIED]                                                                  | D-07. `fallback: '200.html'` for SPA mode.                                                                  |
| `vite`                     | 8.0.12                           | Build tool [VERIFIED]                                                                            | Bundled with SvelteKit.                                                                                     |
| `node-thermal-printer`     | 4.4.3                            | ESC/POS thermal printer driver [VERIFIED: last modified 2026-01-27, current as of research date] | Native Linux `/dev/usb/lp0` support; built-in Star + Epson + Brother profiles. Pure JS, no native bindings. |
| `i18next`                  | 26.1.0                           | i18n core [VERIFIED]                                                                             | D-02 honors REQ-UI-006 literally. UI-SPEC §Copywriting locks i18n.js port.                                  |

### Supporting

| Library                            | Version               | Purpose                                                                                | When to Use                                                                                                                           |
| ---------------------------------- | --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `zod`                              | 4.4.3                 | Runtime schema validation [VERIFIED]                                                   | REST DTO validation in `apps/edge/`; UI form validation in `apps/web/`. Shared via `packages/shared-types/`.                          |
| `fast-xml-parser`                  | 5.2.0                 | Pure-JS XML parsing [VERIFIED]                                                         | Parse Purple Pen / IOF XML 3.0 CourseData + EntryList on import. No native dep. Pair with Zod for shape validation.                   |
| `libxmljs2` (with `libxmljs2-xsd`) | latest                | XSD validation [CITED: npm trends + GitHub]                                            | **Caveat:** native binding (node-gyp). Use for SC#6 — IOF XML 3.0 ResultList must pass official XSD before saving. Alternative below. |
| `xmllint-wasm`                     | ~latest               | WASM XSD validation [CITED: codegenes.net survey]                                      | Pure-WASM alternative if `libxmljs2` install pain hurts the binary packaging story. Add ~5MB to bundle.                               |
| `vitest`                           | 4.1.6                 | Test runner for `apps/web/` [VERIFIED]                                                 | SvelteKit default. Carries Vite ecosystem.                                                                                            |
| `@playwright/test`                 | 1.60.0                | E2E browser tests [VERIFIED]                                                           | Three-click wizard + walk-up modal + readout E2E.                                                                                     |
| `node:test`                        | (Node 22 built-in)    | Test runner for `apps/edge/` and `packages/shared-types/` [VERIFIED: Phase 0 baseline] | Phase 0 D-06 carries forward. Zero extra deps.                                                                                        |
| `node-cron` (or pure `setTimeout`) | latest                | Daily backup scheduler                                                                 | REQ-OPS-003. Pure `setTimeout` chain at midnight is simpler if no cron expression is needed.                                          |
| `sveltekit-superforms`             | 2.30.1                | Form library [VERIFIED]                                                                | Optional. Walk-up modal + wizard step 1 are the only real forms; raw `<form>` + Zod is fine if Superforms feels heavy.                |
| `pnpm`                             | 10.30.3 (locked)      | Package manager [VERIFIED: package.json]                                               | Already pinned. Workspaces enabled.                                                                                                   |
| `tsup`                             | 8.x (already in repo) | Build tool [VERIFIED]                                                                  | Used by `packages/sportident/`. Reuse for `apps/edge/` build.                                                                         |

### Alternatives Considered

| Instead of                           | Could Use                                             | Tradeoff                                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-thermal-printer`               | `@node-escpos/core` + `@node-escpos/usb-adapter`      | Less actively maintained (2024-03 last release). Better TypeScript types. Requires per-OS USB native binding. Choose if `node-thermal-printer`'s built-in profiles miss a printer.                 |
| `node-thermal-printer`               | `receiptline` (4.0.0)                                 | Markdown-style receipt template language; output to ESC/POS bytes. Less direct printer-driver semantics. Skip — adds template indirection we don't need.                                           |
| `libxmljs2-xsd`                      | `xmllint-wasm`                                        | Pure-WASM, no node-gyp, but ~5MB bundle hit. Use if native build fails on a deployment target.                                                                                                     |
| `libxmljs2-xsd`                      | Hand-rolled Zod-based "schema" against IOF XSD types  | Skip — SC#6 says "passes XSD validation," not "passes our partial schema." Use a real XSD validator.                                                                                               |
| `i18next`                            | `@inlang/paraglide-js` (2.18.0)                       | Compiler-based, tree-shakable, smaller bundles. **But:** D-02 locks i18next + sv/en JSON catalogs, and UI-SPEC §Copywriting requires direct port of `01-SKETCHES/.../i18n.js`. Stick with i18next. |
| `i18next`                            | `svelte-i18n` (4.0.1)                                 | Reactive store-based. Slightly more Svelte-idiomatic. D-02 chose i18next so we don't refactor in Phase 2.                                                                                          |
| `@yao-pkg/pkg` for single-executable | `npm install -g fartola` tarball (CHOSEN)             | `pkg` and Node SEA both struggle with `better-sqlite3` native binding. Tarball install is REQ-OPS-001's literal contract.                                                                          |
| `socket.io`                          | native `WebSocket` + small reconnect wrapper (CHOSEN) | UI-SPEC §"Auto-reconnect" already specifies the wrapper. socket.io is heavy; D-13 says native WS.                                                                                                  |

**Installation (apps/edge/):**

```bash
pnpm add fastify @fastify/websocket @fastify/static @fastify/cors @fastify/sensible \
  better-sqlite3 drizzle-orm zod fast-xml-parser libxmljs2-xsd \
  node-thermal-printer i18next @fartola/sportident@workspace:*
pnpm add -D drizzle-kit @types/better-sqlite3 tsx tsup
```

**Installation (apps/web/):**

```bash
pnpm add svelte @sveltejs/kit @sveltejs/adapter-static i18next \
  @fartola/shared-types@workspace:*
pnpm add -D vite vitest @playwright/test
```

**Version verification:** All versions above were verified against the npm registry on 2026-05-14 via `npm view <pkg> version`. Documented publish dates of "actively maintained" libraries:

- `fastify@5.8.5`, `@fastify/websocket@11.2.0`, `@fastify/static@9.1.3` — Fastify v5 ecosystem, current and supported
- `better-sqlite3@12.10.0` — WiseLibs fork, prebuilt binaries for Node 22
- `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10` — current as of research date
- `svelte@5.55.5`, `@sveltejs/kit@2.59.1` — Svelte 5 stable line
- `node-thermal-printer@4.4.3` — last modified 2026-01-27 (active)
- `@node-escpos/core@0.6.0` — last modified 2024-03-13 (alive but slower)
- `i18next@26.1.0` — last modified 2026-05-11 (very active)

## Architecture Patterns

### System Architecture Diagram

```
                                ┌────────────────────────────────────┐
                                │  Browser (Chrome desktop/Android)  │
                                │  apps/web/ (SvelteKit SPA, runes)  │
                                │  • i18next (sv default, en alt)    │
                                │  • Tweaks panel → localStorage     │
                                │  • Native WS + reconnect wrapper   │
                                └──────────┬───────────────┬─────────┘
                                           │ HTTP REST     │ WS
                                           │ /api/*        │ /ws + channels
                                           │               │  - readout:<id>
                                           │               │  - results:<id>
                                           ▼               ▼
       ┌────────────────────────────────────────────────────────────────────┐
       │  apps/edge/  (single Fastify process, port 3000 prod / proxy dev)  │
       │                                                                    │
       │   ┌──────────────────┐  ┌─────────────────┐  ┌───────────────────┐ │
       │   │ @fastify/static  │  │ REST routes     │  │ WS routes         │ │
       │   │ → built          │  │ /api/competitions  │ /ws (subscribe by  │ │
       │   │   SvelteKit      │  │ /api/courses/    │  │  channel name)    │ │
       │   │   assets         │  │  import          │  │ fan-out to        │ │
       │   │   + 200.html     │  │ /api/competitors │  │ fastify.          │ │
       │   │   fallback for   │  │ /api/.../export  │  │   websocketServer │ │
       │   │   client-side    │  │  ?format=iof30   │  │   .clients        │ │
       │   │   routing        │  │ /api/print       │  │ replays missed    │ │
       │   └──────────────────┘  └────────┬────────┘  │ events on hello   │ │
       │                                  │           └─────────┬─────────┘ │
       │            ┌─────────────────────┴─────────────────────┘           │
       │            │                                                       │
       │            ▼                                                       │
       │   ┌────────────────────────────────────────────────────────────┐   │
       │   │ Projection layer (pure reducers, REQ-EVT-003/004)          │   │
       │   │  events → competition state (results, splits, DNF/MP)      │   │
       │   │  Replay-from-scratch on startup; incremental thereafter.   │   │
       │   └────────────────────────┬───────────────────────────────────┘   │
       │                            │                                       │
       │            ┌───────────────┼──────────────┬─────────────┐          │
       │            ▼               ▼              ▼             ▼          │
       │   ┌─────────────┐  ┌──────────────┐ ┌──────────┐ ┌──────────────┐  │
       │   │ SI ingest   │  │ XML import   │ │ ESC/POS  │ │ IOF XML      │  │
       │   │ ↑ Phase 0   │  │ • Purple Pen │ │ thermal  │ │ ResultList   │  │
       │   │   NDJSON    │  │   .xml       │ │ printer  │ │ export       │  │
       │   │   events    │  │ • IOF 3.0    │ │ via      │ │ + XSD        │  │
       │   │   wired to  │  │   EntryList  │ │ node-    │ │ validation   │  │
       │   │   event     │  │ • fast-xml-  │ │ thermal- │ │ before save  │  │
       │   │   inserter  │  │   parser +   │ │ printer  │ │              │  │
       │   │             │  │   Zod        │ │ /dev/usb │ │              │  │
       │   └──────┬──────┘  └──────┬───────┘ │ /lp0     │ └──────┬───────┘  │
       │          │                │         └────┬─────┘        │          │
       │          ▼                ▼              │              ▼          │
       │   ┌──────────────────────────────────────┴──────────────────────┐  │
       │   │ better-sqlite3 (WAL mode, sync NORMAL, cache_size 32000)    │  │
       │   │  ┌─────────────────────────┐  ┌──────────────────────────┐  │  │
       │   │  │ events  (immutable,     │  │ Mutable config tables    │  │  │
       │   │  │  append-only,           │  │  • competitions          │  │  │
       │   │  │  PRIMARY KEY            │  │  • classes               │  │  │
       │   │  │  (node_id, local_seq))  │  │  • courses               │  │  │
       │   │  │  ADR-0003               │  │  • controls              │  │  │
       │   │  │                         │  │  • course_controls       │  │  │
       │   │  │                         │  │  • competitors           │  │  │
       │   │  │                         │  │  • clubs (autocomplete)  │  │  │
       │   │  │                         │  │  D-09 carve-out          │  │  │
       │   │  └─────────────────────────┘  └──────────────────────────┘  │  │
       │   │  Daily online backup → fartola.db.bak-YYYY-MM-DD             │  │
       │   └─────────────────────────────────────────────────────────────┘  │
       │                                                                    │
       │   Drizzle embedded migrator runs at startup:                       │
       │     migrate(db, { migrationsFolder: path.join(__dirname,          │
       │       '../drizzle') })   ← bundled inside the published tarball   │
       │                                                                    │
       └─────────────────────────────────┬──────────────────────────────────┘
                                         │ /dev/ttyUSB0 @ 38400 baud
                                         │ (Phase 0 SerialTransport)
                                         ▼
                                  ┌────────────────┐
                                  │ BSM7/8-USB     │
                                  │ SI reader      │
                                  │ + cards        │
                                  └────────────────┘
```

### Recommended Project Structure

```
fartola/                                  (workspace root)
├── apps/
│   ├── edge/                            (Fastify bridge — the binary entry)
│   │   ├── src/
│   │   │   ├── server.ts                (Fastify app factory + register plugins)
│   │   │   ├── bin/fartola.ts            (#!/usr/bin/env node — the `fartola` bin)
│   │   │   ├── db/
│   │   │   │   ├── schema.ts            (Drizzle schema-as-TS: events + config tables)
│   │   │   │   ├── index.ts             (connect, set WAL pragmas, run migrator)
│   │   │   │   └── projections/         (reducer modules, one per derived view)
│   │   │   ├── ingest/
│   │   │   │   ├── siBridge.ts          (wires SiMainStation → event log)
│   │   │   │   ├── courseImport.ts      (Purple Pen / IOF CourseData → courses table)
│   │   │   │   └── entryImport.ts       (IOF EntryList → competitors table)
│   │   │   ├── routes/
│   │   │   │   ├── competitions.ts      (REST /api/competitions/*)
│   │   │   │   ├── courses.ts           (REST /api/courses/*)
│   │   │   │   ├── competitors.ts       (REST /api/competitors/*)
│   │   │   │   ├── readout.ts           (REST + helpers for readout state)
│   │   │   │   ├── export.ts            (REST /api/competitions/:id/export → IOF 3.0)
│   │   │   │   ├── print.ts             (REST /api/print/receipt)
│   │   │   │   └── ws.ts                (WebSocket channel registrar)
│   │   │   ├── print/
│   │   │   │   ├── escposDriver.ts      (node-thermal-printer wrapper)
│   │   │   │   └── templates/           (six receipt template renderers)
│   │   │   ├── xml/
│   │   │   │   ├── iofExport.ts         (ResultList XML emitter)
│   │   │   │   ├── iofImport.ts         (Purple Pen + EntryList parser)
│   │   │   │   ├── validate.ts          (libxmljs2-xsd / xmllint-wasm)
│   │   │   │   └── IOF.xsd              (bundled at build time, frozen v3.0)
│   │   │   ├── backup/backup.ts         (cron-in-process daily snapshot)
│   │   │   └── ws/
│   │   │       ├── channels.ts          (channel registry + fan-out)
│   │   │       └── replay.ts            (last_seen_seq replay on reconnect)
│   │   ├── drizzle/                     (generated SQL migrations — bundled)
│   │   ├── drizzle.config.ts            (dev-only, for `drizzle-kit generate`)
│   │   ├── tsup.config.ts
│   │   └── package.json                 (bin: "fartola": "./dist/bin/fartola.cjs")
│   └── web/                             (SvelteKit SPA → built into apps/web/build)
│       ├── src/
│       │   ├── routes/
│       │   │   ├── +layout.svelte       (AppShell, Sidebar, TopBar, Clock)
│       │   │   ├── +layout.ts           (export const ssr = false; prerender = false)
│       │   │   ├── +page.svelte         (HomeView — competition cards grid)
│       │   │   ├── competition/[id]/
│       │   │   │   ├── readout/+page.svelte
│       │   │   │   ├── results/+page.svelte
│       │   │   │   └── export/+page.svelte
│       │   ├── lib/
│       │   │   ├── layout/              (AppShell, Sidebar, TopBar, etc.)
│       │   │   ├── ui/                  (Button, Input, Modal, StatusPill, …)
│       │   │   ├── screens/             (HomeView, ReadoutView, …)
│       │   │   ├── ws/client.ts         (native WS + reconnect wrapper)
│       │   │   ├── api/client.ts        (typed REST client, uses shared-types)
│       │   │   ├── i18n/
│       │   │   │   ├── index.ts         (i18next init + Svelte 5 runes wrapper)
│       │   │   │   ├── sv.json
│       │   │   │   └── en.json          (direct port of 01-SKETCHES/.../i18n.js)
│       │   │   ├── stores/              (operator prefs from Tweaks panel)
│       │   │   └── projections/         (client-side mirror of server reducers — TS, deterministic)
│       │   └── app.html
│       ├── static/manifest.webmanifest  (D-14 PWA manifest, no SW)
│       ├── svelte.config.js             (adapter-static fallback: '200.html')
│       └── package.json
├── packages/
│   ├── sportident/                      (Phase 0, unchanged, MIT)
│   └── shared-types/                    (D-08 pure-TS, no build, "exports": "./src/index.ts")
│       └── src/
│           ├── ndjson.ts                (re-export Phase 0 event types)
│           ├── dto.ts                   (REST DTOs)
│           ├── ws.ts                    (WS envelope + channel names)
│           └── db.ts                    (row types — derived from Drizzle schema)
├── pnpm-workspace.yaml                  (packages: apps/* + packages/*)
└── package.json
```

### Pattern 1: Drizzle schema-as-TS for events + config tables

**What:** Define the events table as Drizzle's `sqliteTable` with `payload: text({ mode: 'json' })` for the per-event JSON shape. Define mutable tables (competitions, classes, courses, controls, course_controls, competitors, clubs) as normal Drizzle tables.

**When to use:** This is the only schema in Phase 1. ADR-0003 says events are immutable; D-09 says config tables are normal CRUD.

**Example:**

```typescript
// Source: Context7 /drizzle-team/drizzle-orm + research/architecture.md §"Event log schema"
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable(
  'events',
  {
    nodeId: text('node_id').notNull(),
    localSeq: integer('local_seq').notNull(),
    competitionId: text('competition_id'), // nullable — early bridge events pre-competition
    eventType: text('event_type').notNull(), // 'punch' | 'card_read' | 'card_bound' | 'manual_dnf' | ...
    eventTimeMs: integer('event_time_ms').notNull(),
    recordedAtMs: integer('recorded_at_ms').notNull(),
    payload: text('payload', { mode: 'json' }).notNull().$type<EventPayload>(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.nodeId, t.localSeq] }),
    timeIdx: index('idx_events_time').on(t.eventTimeMs),
    compIdx: index('idx_events_competition').on(t.competitionId),
  })
);

export const competitions = sqliteTable('competitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  date: text('date').notNull(), // ISO 'YYYY-MM-DD' (UI-SPEC §Visual Anchors)
  receiptTemplate: text('receipt_template').notNull().default('classic'),
  autoPrint: integer('auto_print', { mode: 'boolean' }).notNull().default(false),
  createdAtMs: integer('created_at_ms').notNull(),
});

// ... courses, controls, course_controls, classes, competitors, clubs
```

### Pattern 2: Embedded migrator at bridge cold start

**What:** Run `migrate(db, { migrationsFolder })` synchronously during `apps/edge/src/server.ts` startup. `migrationsFolder` resolves to the bundled `drizzle/` directory inside the installed `fartola` package.

**When to use:** Every cold start. Drizzle's migrator is idempotent — second start is a no-op.

**Example:**

```typescript
// Source: Context7 /drizzle-team/drizzle-orm — drizzle-orm/better-sqlite3/migrator
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initDb(dbPath: string) {
  const sqlite = new Database(dbPath);

  // WAL + tuning per better-sqlite3 docs (verified above)
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('cache_size = -32000'); // -32000 = 32MB (negative = KB)
  sqlite.pragma('temp_store = MEMORY');

  // Embedded migrator — runs every cold start; idempotent if up-to-date
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: path.join(__dirname, '../drizzle'),
  });

  return drizzle(sqlite, { schema });
}
```

### Pattern 3: Fastify SPA fallback for adapter-static build

**What:** Register `@fastify/static` for the `apps/web/build/` directory with `wildcard: false`, then set `setNotFoundHandler` to send `200.html` for non-`/api/*` non-`/ws` URLs. SvelteKit's SPA router takes over client-side.

**When to use:** Production binary (`fartola` running). In dev, Vite serves the web side on port 5173 and Fastify on 3000 with a proxy.

**Example:**

```typescript
// Source: Context7 /fastify/fastify-static + svelte.dev/docs/kit/single-page-apps
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// API routes first
await app.register(import('./routes/competitions.ts'), { prefix: '/api/competitions' });
await app.register(import('./routes/courses.ts'), { prefix: '/api/courses' });
// ... etc
await app.register(import('./routes/ws.ts')); // /ws

// Static last
await app.register(fastifyStatic, {
  root: path.join(__dirname, '../web/build'),
  wildcard: false,
});

// SPA fallback: any non-api non-ws request gets 200.html
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/') || req.url === '/ws') {
    return reply.code(404).send({ error: 'Not found' });
  }
  return reply.sendFile('200.html');
});

await app.listen({ port: 3000, host: '127.0.0.1' });
```

### Pattern 4: WebSocket channels with hello-replay reconnect

**What:** Each client sends a `hello` message on connect with `{type: 'hello', channels: ['readout:abc'], last_seen_seq: N}`. Server stores `(connId → Set<channelName>, last_seen_seq)` in memory; on broadcast, iterates `fastify.websocketServer.clients` and sends to matching subscribers. On reconnect, server replays events with `local_seq > last_seen_seq` from SQLite.

**When to use:** Every WS subscriber (readout view, results view, walk-up channel).

**Example:**

```typescript
// Source: Context7 /fastify/fastify-websocket + UI-SPEC §"Auto-reconnect"
import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';

interface ClientState {
  channels: Set<string>;
  lastSeenSeq: number;
}

export async function wsRoutes(app: FastifyInstance) {
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  const clients = new WeakMap<WebSocket, ClientState>();

  app.get('/ws', { websocket: true }, (socket, req) => {
    const state: ClientState = { channels: new Set(), lastSeenSeq: 0 };
    clients.set(socket, state);

    socket.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hello') {
        for (const ch of msg.channels ?? []) state.channels.add(ch);
        state.lastSeenSeq = msg.last_seen_seq ?? 0;
        // Replay missed events from the event log per channel
        for (const ch of state.channels) {
          const events = app.db.replayChannel(ch, state.lastSeenSeq);
          for (const e of events) socket.send(JSON.stringify(e));
        }
      } else if (msg.type === 'subscribe') {
        state.channels.add(msg.channel);
      }
    });
  });

  // Server-side broadcaster — called by the projection layer when state changes
  app.decorate('wsBroadcast', (channel: string, envelope: WsEnvelope) => {
    const payload = JSON.stringify({ ...envelope, channel });
    for (const client of app.websocketServer.clients) {
      const state = clients.get(client);
      if (state?.channels.has(channel) && client.readyState === 1) {
        client.send(payload);
      }
    }
  });
}
```

### Pattern 5: Pure-reducer projection from event log

**What:** A pure function `reduce(events: Event[], course: Course): CompetitionState`. Called once at startup with all events for the competition; called incrementally as new events arrive. Output drives both REST responses and WS pushes.

**When to use:** DNF / MP detection (D-12), live results, splits. The same function runs in `apps/edge/` (server) and **optionally** mirrors to `apps/web/` for purely-derived UI smoothing.

**Example:**

```typescript
// Source: ADR-0003 + research/architecture.md §"Projections"
export interface CompetitionState {
  competitors: Map<string, CompetitorView>;
  results: Map<string, ResultView[]>; // by classId, sorted
  pendingUnknownCards: number[];
}

export function reduce(events: Event[], course: Course): CompetitionState {
  const state: CompetitionState = {
    competitors: new Map(),
    results: new Map(),
    pendingUnknownCards: [],
  };
  for (const e of events) {
    switch (e.eventType) {
      case 'card_read':
        applyCardRead(state, e, course);
        break;
      case 'card_bound':
        applyCardBound(state, e);
        break;
      case 'manual_dnf':
        applyManualDnf(state, e);
        break;
      case 'un_dnf':
        applyUnDnf(state, e);
        break;
      // … all event types listed in events table
    }
  }
  return state;
}
```

### Pattern 6: ESC/POS thermal print via node-thermal-printer

**What:** Lazy-initialize a `ThermalPrinter` per print, write text + splits + total + place, send to `/dev/usb/lp0`. Six template renderers (one per UI-SPEC template) call the same low-level helpers.

**When to use:** Manual print (REQ-UI-004) and auto-print path (UI-SPEC §Auto-print toggle).

**Example:**

```typescript
// Source: node-thermal-printer README (Klemen1337) + UI-SPEC §Receipt Templates
import { printer as ThermalPrinter, types as Types } from 'node-thermal-printer';

export async function printReceipt(template: TemplateName, data: ReceiptData) {
  const printer = new ThermalPrinter({
    type: Types.STAR, // or Types.EPSON — set per competition config
    interface: 'printer:/dev/usb/lp0',
    characterSet: 'PC852_LATIN2', // Latin-1+Latin-2 covers sv (å/ä/ö)
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });
  if (!(await printer.isPrinterConnected())) {
    throw new Error('Printer not connected');
  }
  renderTemplate(printer, template, data);
  printer.cut();
  await printer.execute();
}
```

### Pattern 7: IOF XML 3.0 ResultList export with XSD validation

**What:** Serialize the projection to IOF XML 3.0 ResultList using `fast-xml-parser`'s `XMLBuilder`. Validate the resulting string against the bundled `IOF.xsd` via `libxmljs2-xsd`. Only if validation passes do we stream the file to the browser.

**When to use:** REQ-EVT-CMP-008 / SC#6. UI-SPEC §Export — pre-validation via `GET /api/competitions/:id/export/preview` then download via `GET /api/competitions/:id/export?format=iof30`.

**Example:**

```typescript
// Source: fast-xml-parser docs + libxmljs2-xsd README + IOF.xsd structure (verified)
import { XMLBuilder } from 'fast-xml-parser';
import libxmljs from 'libxmljs2';
import xsd from 'libxmljs2-xsd';
import { readFileSync } from 'node:fs';

const schema = xsd.parseFile(path.join(__dirname, '../xml/IOF.xsd'));

export function exportResultList(
  state: CompetitionState,
  comp: Competition
): {
  valid: boolean;
  xml?: string;
  errors?: ValidationError[];
} {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    format: true,
  });
  const xml = builder.build({
    '?xml': { '@version': '1.0', '@encoding': 'UTF-8' },
    ResultList: {
      '@xmlns': 'http://www.orienteering.org/datastandard/3.0',
      '@iofVersion': '3.0',
      '@createTime': new Date().toISOString(),
      '@creator': 'fartOLa v0.1',
      Event: { Name: comp.name, StartTime: { Date: comp.date } },
      ClassResult: buildClassResults(state),
    },
  });
  const errors = schema.validate(xml);
  if (errors && errors.length > 0) {
    return { valid: false, errors: errors.map(formatXsdError) };
  }
  return { valid: true, xml };
}
```

### Anti-Patterns to Avoid

- **Don't synthesize a "results" table.** ADR-0003 + REQ-EVT-003: all derived state is computed via reducers. A persisted results table makes bug fixes destructive.
- **Don't open WebSerial from the browser.** ADR-0002 + research/architecture.md §"Three tiers": browser is a UI client; edge owns hardware.
- **Don't run the SvelteKit Node adapter alongside Fastify on a second port.** D-06: single binary, single Fastify process. SvelteKit static build only.
- **Don't validate XML by hand.** SC#6 says "passes XSD validation." Use `libxmljs2-xsd` or `xmllint-wasm`, not a Zod approximation.
- **Don't use `drizzle-kit push` in production.** `push` is for prototyping. Use `drizzle-kit generate` at dev time, ship the SQL files, run `migrate()` at startup.
- **Don't `UPDATE` punch events.** D-12 manual DNF emits a new `manual_dnf` event. The reducer interprets it. Event log stays append-only.
- **Don't bake the IOF.xsd into the schema at parse time per request.** Parse once at startup, reuse the compiled schema object.
- **Don't share `ThermalPrinter` instances across concurrent print requests.** The library is not stateless under the hood; lazy-create per print call (or wrap in a single-flight queue).
- **Don't use `index.html` as the SvelteKit SPA fallback.** It conflicts with prerendered home pages. Use `200.html` as documented.
- **Don't store SI card numbers with thousand separators.** UI-SPEC §"SI card number format" — store and display raw integer.

## Don't Hand-Roll

| Problem                                      | Don't Build                                     | Use Instead                                                                                       | Why                                                                                                            |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SQL migrations                               | Manual schema-version table + ad-hoc SQL files  | `drizzle-kit generate` + `drizzle-orm/better-sqlite3/migrator`                                    | Drizzle tracks `__drizzle_migrations`, runs in-order, idempotent. Already a peer dep we'd want anyway.         |
| Type-safe SQL builder                        | Template-string queries                         | Drizzle query builder                                                                             | Drizzle gives types from schema-as-TS for free.                                                                |
| XML parsing                                  | DOM/regex hacking                               | `fast-xml-parser`                                                                                 | Handles namespaces, attributes, encoding. ~300KB.                                                              |
| XSD validation                               | Schema approximation in Zod                     | `libxmljs2-xsd` (native) or `xmllint-wasm`                                                        | SC#6 requires real XSD validation. IOF.xsd is large and uses `xsd:choice`, `xsd:any` — no shortcut survives.   |
| ESC/POS byte assembly                        | Hand-rolling 0x1B / 0x1D commands               | `node-thermal-printer`                                                                            | Built-in profiles for Star + Epson + Brother. Character set helpers. Output queueing.                          |
| WebSocket reconnect logic                    | Wrapping `WebSocket` manually with timers       | A small ~50-line wrapper (Phase 1 owns this; no library — `socket.io` is too heavy for D-13)      | The wrapper is small enough to own; UI-SPEC pins backoff schedule.                                             |
| i18n string lookup                           | `if (locale === 'sv') ... else ...`             | `i18next`                                                                                         | D-02 locked. Locale fallback + interpolation + plurals out of the box.                                         |
| Validation schema for REST DTOs              | Type guards by hand                             | `zod`                                                                                             | Shared between `apps/edge/` and `apps/web/` via `packages/shared-types/`.                                      |
| Daily backup logic                           | rsync wrapper / shell script                    | `db.backup()` from better-sqlite3 + `setTimeout` chain at midnight                                | The online backup API is page-by-page consistent; file copy of a WAL-mode DB is NOT consistent.                |
| File watcher for migrations during dev       | `chokidar` plumbing                             | `drizzle-kit generate` is one-shot; no watcher needed                                             | Migrations are generated explicitly.                                                                           |
| Single executable packaging with native deps | `pkg` / `nexe` / Node SEA                       | `npm install -g fartola` (CHOSEN)                                                                 | `pkg` + `better-sqlite3` is a known pain point. Tarball install is REQ-OPS-001's literal contract.             |
| Course-file format parsing for Purple Pen    | Reverse-engineering Purple Pen's binary `.ppen` | Use the IOF XML 3.0 CourseData export Purple Pen produces via File → Create Data Interchange File | Purple Pen exports IOF XML 3.0 already. Same parser handles REQ-EVT-CMP-002 and REQ-EVT-CMP-003 + REQ-STD-001. |

**Key insight:** The single biggest scope win is that **Purple Pen `.xml`** in CONTEXT.md D-03 IS IOF XML 3.0 CourseData (verified against purple-pen.org docs). Plan a single XML import pipeline keyed on the root element name (`CourseData` vs `EntryList` vs future `ClassList`). Three requirements (REQ-EVT-CMP-002, REQ-EVT-CMP-003, REQ-STD-001) collapse to one importer + a dispatcher.

## Runtime State Inventory

Phase 1 is **greenfield** for everything except `packages/sportident/` (which is unchanged). No rename, no refactor, no string-replace operation in scope. **No runtime state inventory needed.**

| Category            | Items Found                                                                                 | Action Required |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| Stored data         | None — Phase 1 creates the DB from empty (see "Schema push detection" below)                | None            |
| Live service config | None — no Datadog/Cloudflare/Tailscale config involved                                      | None            |
| OS-registered state | None — `fartola` runs as a Node process, not a systemd unit or scheduled task in Phase 1    | None            |
| Secrets / env vars  | None — no secret keys in Phase 1; localhost-only deployment                                 | None            |
| Build artifacts     | None pre-existing; Phase 1 creates new build outputs (`apps/edge/dist/`, `apps/web/build/`) | None            |

**Schema push detection (workflow input acknowledged):** Phase 1 introduces `apps/edge/src/db/schema.ts` for the first time. There is no existing DB to push to. The first wave **MUST** include a `[BLOCKING]` task that lands the schema + generates the initial migration + wires the embedded migrator into `apps/edge/src/server.ts`, so cold start creates the schema. Once this task is green, every subsequent task can assume the DB exists with the locked schema.

## Common Pitfalls

### Pitfall 1: `adapter-static` ssr/prerender misconfiguration

**What goes wrong:** Build fails or pages 404 in production because some route still tries to SSR or prerender, but no fallback is set.

**Why it happens:** `adapter-static` in SPA mode requires `ssr = false` AND `prerender = false` at the root layout, otherwise it errors at build time.

**How to avoid:** Set `export const ssr = false; export const prerender = false;` in `apps/web/src/routes/+layout.ts`. Configure `adapter({ fallback: '200.html', strict: false })` in `svelte.config.js`.

**Warning signs:** `Error: Could not prerender X — make sure all dynamic routes are reachable` during `pnpm build`. Or routes that work in `pnpm dev` but 404 in production.

### Pitfall 2: Dev proxy missing for `/ws` and `/api/*`

**What goes wrong:** In dev, Vite serves the UI at `:5173` and Fastify at `:3000`. The UI's `fetch('/api/...')` and `new WebSocket('/ws')` hit Vite instead of Fastify.

**Why it happens:** Vite doesn't auto-proxy unknown paths to the backend.

**How to avoid:** Configure `server.proxy` in `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
    '/ws':  { target: 'ws://localhost:3000', ws: true },
  },
}
```

**Warning signs:** UI hits 404s on its own `/api/*` calls during dev; WS never opens.

### Pitfall 3: WAL mode and SQLite file copy

**What goes wrong:** Operator copies `fartola.db` to a USB stick mid-event for "backup" but misses uncommitted WAL data. Restore is silently incomplete.

**Why it happens:** With WAL mode, recent writes live in `fartola.db-wal` until checkpoint. Naïve `cp` only catches the main file.

**How to avoid:** REQ-OPS-003 daily backup MUST use `db.backup(destPath)` (the online backup API). The promise resolves only when the destination is a consistent snapshot. Schedule via a `setTimeout` chain that re-arms for the next midnight.

**Warning signs:** Backup file size doesn't grow as readouts happen, or partial DB on restore.

### Pitfall 4: `serialport` already opened (cold start + auto-reconnect)

**What goes wrong:** After a transient USB unplug, Phase 0's `SerialTransport` tries to reopen `/dev/ttyUSB0` while the kernel still holds the port. Open fails with EBUSY.

**Why it happens:** Linux's cp210x driver has a brief grace period after `close()` before the port is fully released.

**How to avoid:** Wrap the open in a small retry-with-backoff (250ms → 500ms → 1s → 2s, cap 5 attempts). This is `apps/edge/src/ingest/siBridge.ts` territory, not a `packages/sportident/` change. The Phase 0 D-13..D-16 NDJSON `connection_changed` event with `state: 'opening' | 'open' | 'error'` already surfaces the lifecycle.

**Warning signs:** Operator sees "Läsare hittades inte" (UI-SPEC §Error states) after a USB reseat; must restart bridge.

### Pitfall 5: IOF XSD validation passing locally but failing on a partner's tool

**What goes wrong:** Our export validates against the bundled `IOF.xsd` we shipped, but the receiving tool (Eventor, OE2010) uses a stricter or older subset.

**Why it happens:** IOF XML 3.0 has multiple `xsd:choice` paths; not every consumer accepts the full grammar.

**How to avoid:** Always emit the conservative subset: `ResultList` with `iofVersion="3.0"`, `Event` (Name + StartTime), one `ClassResult` per class, `PersonResult` rows with `Person`, `Organisation` (if club known), `Result` (StartTime, FinishTime, Time, Position, Status). Avoid unusual extensions in Phase 1. Cross-check by importing our export into MeOS-OZ once before tagging.

**Warning signs:** Partners complain that our XML "doesn't import" — and the XSD passes locally.

### Pitfall 6: `node-thermal-printer` USB device path varies

**What goes wrong:** On a fresh laptop, the printer enumerates as `/dev/usb/lp1` (or somewhere else) and our hard-coded `/dev/usb/lp0` fails.

**Why it happens:** Device ordering depends on plug order.

**How to avoid:** Probe `/dev/usb/lp*` at print time; first responder wins. Or read from a per-competition config the operator sets on the readout view. UI-SPEC §"Reader handshake fail" is the analogue surface for the printer ("Skrivare hittades inte"). Surface a similar error toast on print fail.

**Warning signs:** Single-laptop install works on bench, fails on Tuesday training night.

### Pitfall 7: Drizzle schema-as-TS drift between generate and migrate

**What goes wrong:** A schema.ts change lands without a `drizzle-kit generate` run. The shipped tarball's `migrations/` is stale; cold-start migrator runs old SQL.

**Why it happens:** Generate is manual.

**How to avoid:** Pre-commit hook (lefthook is already in this repo) runs `drizzle-kit check` or asserts that `schema.ts` mtime ≤ youngest migration mtime. Ship the generated SQL in git.

**Warning signs:** Cold start produces a DB missing recently added columns; query errors with "no such column."

### Pitfall 8: Walk-up modal blocks subsequent reads

**What goes wrong:** Operator dawdles inside the walk-up form; meanwhile a second runner punches in; the second card sits unprocessed.

**Why it happens:** Modal scrim blocks UI; if WS messages are dropped while modal open, history is incomplete.

**How to avoid:** UI-SPEC §"Walk-up modal" explicitly says the modal blocks only the current card. Subsequent unknown cards queue (newest replaces current; previous unknown card remains in history as `unmatched`). Server-side keep emitting `card_read` envelopes regardless; the readout view dedupes and updates history.

**Warning signs:** History panel skips a read; the operator says "that card never showed up."

### Pitfall 9: Bridge process exit during readout

**What goes wrong:** REQ-OPS-002 says the bridge must survive restart with zero data loss. A naive Node process that exits on uncaught exception loses any in-flight WebSocket subscriptions and forces UI reconnects.

**Why it happens:** Top-level await rejection, unhandled `error` event, OOM.

**How to avoid:** Install `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers that log via stderr + force-exit non-zero (NOT swallow — the operator/systemd should restart). Run under `systemd-run --user` or a `pm2`-style supervisor in production. Phase 0 D-15 already emits `card_read` events to SQLite synchronously, so no in-flight data is lost.

**Warning signs:** Bridge dies silently; readout view stuck on "Frånkopplad."

### Pitfall 10: SvelteKit static + i18next locale loading timing

**What goes wrong:** First paint shows English strings briefly before i18next swaps to Swedish from localStorage.

**Why it happens:** i18next init is async; the app renders before init resolves.

**How to avoid:** Initialize i18next synchronously by bundling sv.json AND en.json directly via `import sv from './sv.json'`. Set default locale from `localStorage.getItem('locale') ?? 'sv'` before mounting the root component. UI-SPEC §Tweaks panel localStorage persistence makes this natural.

**Warning signs:** Brief "flash of English" on cold load.

## Code Examples

### Wire SI events into the SQLite event log

```typescript
// Source: packages/sportident/src/output/ndjson.ts (Phase 0 surface) + research/architecture.md event log schema
import { SerialTransport, SiMainStation, NdjsonEmitter } from '@fartola/sportident';
import type { CardReadEvent, FrameErrorEvent, ConnectionChangedEvent } from '@fartola/sportident';
import { events } from '../db/schema.ts';
import { db } from '../db/index.ts';
import { sql } from 'drizzle-orm';

const NODE_ID = ensureNodeId();   // load-or-create from a one-row config table

function nextLocalSeq() {
  const row = db.get<{ max: number }>(sql`SELECT MAX(local_seq) AS max FROM events WHERE node_id = ${NODE_ID}`);
  return (row?.max ?? 0) + 1;
}

export function attachBridge(station: SiMainStation, competitionId: string | null) {
  station.on('card_read', (e: CardReadEvent) => {
    db.insert(events).values({
      nodeId: NODE_ID,
      localSeq: nextLocalSeq(),
      competitionId,
      eventType: 'card_read',
      eventTimeMs: e.ts_ms,          // host-clock ms-epoch
      recordedAtMs: Date.now(),
      payload: { card_number: e.card_number, card_type: e.card_type, punches: e.card_holder?.punches ?? [] },
    }).run();
    fastify.wsBroadcast(`readout:${competitionId}`, { type: 'card_read', payload: { ... } });
  });

  station.on('frame_error', (e: FrameErrorEvent) => { /* log + WS notify */ });
  station.on('connection_changed', (e: ConnectionChangedEvent) => { /* WS notify */ });
}
```

### Walk-up registration: bind unknown card

```typescript
// Source: UI-SPEC §"Walk-up modal" + D-04 first-class walk-up
fastify.post(
  '/api/competitors',
  {
    schema: { body: walkupSchema }, // zod schema in packages/shared-types/
  },
  async (req, reply) => {
    const { name, club, classId, cardNumber, competitionId } = req.body;

    const competitorId = crypto.randomUUID();
    db.transaction(() => {
      db.insert(competitors)
        .values({ id: competitorId, name, club, classId, competitionId, cardNumber })
        .run();
      db.insert(events)
        .values({
          nodeId: NODE_ID,
          localSeq: nextLocalSeq(),
          competitionId,
          eventType: 'card_bound',
          eventTimeMs: Date.now(),
          recordedAtMs: Date.now(),
          payload: { competitor_id: competitorId, card_number: cardNumber, walkup: true },
        })
        .run();
    })();

    // Push so the readout view re-renders with the now-bound competitor
    app.wsBroadcast(`readout:${competitionId}`, {
      type: 'card_bound',
      payload: { competitor_id: competitorId, card_number: cardNumber },
    });
    return reply.code(201).send({ competitor_id: competitorId });
  }
);
```

### WebSocket client wrapper (apps/web/)

```typescript
// Source: UI-SPEC §"Auto-reconnect" + D-13
export class WsClient {
  private ws: WebSocket | null = null;
  private channels = new Set<string>();
  private lastSeenSeq = 0;
  private backoff = [1000, 2000, 4000, 8000, 16000, 30000];
  private attempt = 0;

  constructor(
    private url: string,
    private onMessage: (env: WsEnvelope) => void
  ) {}

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.attempt = 0;
      this.ws!.send(
        JSON.stringify({
          type: 'hello',
          channels: [...this.channels],
          last_seen_seq: this.lastSeenSeq,
        })
      );
    };
    this.ws.onmessage = (ev) => {
      const env = JSON.parse(ev.data);
      if (typeof env.seq === 'number') this.lastSeenSeq = env.seq;
      this.onMessage(env);
    };
    this.ws.onclose = () => {
      const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)];
      this.attempt++;
      setTimeout(() => this.connect(), delay);
    };
  }

  subscribe(channel: string) {
    this.channels.add(channel);
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'subscribe', channel }));
  }
}
```

### Daily backup via better-sqlite3 online API

```typescript
// Source: WiseLibs/better-sqlite3 docs api.md (verified above) + REQ-OPS-003
import path from 'node:path';

export function scheduleDailyBackup(db: Database, backupDir: string) {
  const tick = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(backupDir, `fartola.db.bak-${dateStr}`);

    db.backup(dest)
      .then(() => {
        pruneOld(backupDir, /* keep last */ 7);
        const nextMidnight = nextMidnightMs();
        setTimeout(tick, nextMidnight - Date.now());
      })
      .catch((err) => {
        log.error({ err }, 'Daily backup failed');
        setTimeout(tick, 60 * 60 * 1000); // retry in 1h
      });
  };
  // Initial schedule: run at next midnight
  setTimeout(tick, nextMidnightMs() - Date.now());
}
```

### svelte.config.js — adapter-static SPA mode

```javascript
// Source: svelte.dev/docs/kit/single-page-apps + D-07
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      fallback: '200.html',
      strict: false,
    }),
    prerender: { entries: [] }, // no prerendered routes — all SPA
  },
};
```

## State of the Art

| Old Approach                              | Current Approach                                                                                             | When Changed              | Impact                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------- |
| `node-escpos@0.0.3` (lsongdev, 2013)      | `node-thermal-printer@4.4.3` OR `@node-escpos/core@0.6.0`                                                    | ongoing                   | Original `node-escpos` package is a stub. The active forks live under different names. |
| `vercel/pkg` for single-binary            | `@yao-pkg/pkg` (active fork) OR plain npm-tarball install [CITED: github.com/vercel/pkg archived 2024-01-13] | 2024-01                   | We pick npm-tarball install per D-06; `pkg` family has chronic native-binding pain.    |
| `libxmljs`                                | `libxmljs2` (active fork)                                                                                    | ~2022                     | Original is unmaintained; `libxmljs2` ships prebuilt binaries.                         |
| `typesafe-i18n` (unmaintained per author) | `@inlang/paraglide-js` (successor)                                                                           | 2024-on                   | Not relevant to us — D-02 locks i18next, not the typesafe-i18n lineage.                |
| Svelte 4 stores for shared state          | Svelte 5 runes (`$state`, `$derived`, `$effect`)                                                             | Svelte 5 stable (2024-10) | UI-SPEC §"What This Spec Does NOT Lock" recommends runes for Phase 1.                  |
| `drizzle-kit push` for prod schema        | `drizzle-kit generate` + `migrate()`                                                                         | always                    | `push` is dev-only by design. We need shipped SQL files.                               |

**Deprecated/outdated:**

- `vercel/pkg` — archived 2024-01-13 [VERIFIED: search]. Don't introduce.
- Original `lsongdev/node-escpos@0.0.3` (2013) — stub package on npm; the GitHub repo and `@node-escpos/*` org are different. Don't introduce either; use `node-thermal-printer` or `@node-escpos/core`.
- `typesafe-i18n` — author no longer maintaining [CITED]. Not in our shortlist anyway.

## Assumptions Log

| #   | Claim                                                                                                                                                                 | Section                                | Risk if Wrong                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `libxmljs2-xsd` builds cleanly on Node 22 + Linux x64 with `node-gyp` available.                                                                                      | Standard Stack + Pattern 7             | LOW — fallback to `xmllint-wasm` adds ~5MB to bundle but works. Decide at first integration.                                                                                                                   |
| A2  | `node-thermal-printer@4.4.3`'s Star + Epson + Brother PJ-7 profiles work without per-printer tweaks.                                                                  | Standard Stack + Pattern 6             | MEDIUM — Brother PJ-7 is a portable mobile printer; may need custom feed/cut sequences. Test on bench before tagging.                                                                                          |
| A3  | The Skogis SVG can be rendered as monochrome ESC/POS raster within 80mm column without bitmap-rasterizer dependency.                                                  | UI-SPEC §Receipt templates + Pattern 6 | MEDIUM — `node-thermal-printer` supports `.printImage()` for PNG; we'd render SVG → PNG buffer (e.g., via `sharp` or canvas), then send. Adds a dep. Verify in walking-skeleton wave.                          |
| A4  | Daily backup at midnight is the right granularity for a training event (20–40 starters, single day).                                                                  | Pattern + Pitfall 3                    | LOW — REQ-OPS-003 says "daily backup during event," and Tuesday training is a single ~2h window. A second snapshot at event-end would be cheap to add.                                                         |
| A5  | `setNotFoundHandler` fires for any non-static, non-API path, including paths that have a query string.                                                                | Pattern 3                              | LOW — Fastify routing dispatches by path, not query. Verified via fastify-static README.                                                                                                                       |
| A6  | Drizzle migrator works when `migrationsFolder` is inside an npm-installed package (`node_modules/fartola/dist/drizzle`), not just a relative path.                    | Pattern 2                              | LOW — `migrationsFolder` is just a string path; pass `path.join(__dirname, '../drizzle')` and it resolves wherever the package lives.                                                                          |
| A7  | The 30-day GDPR retention (REQ-PRIV-002) is a per-competition flag — competitions older than 30 days get personal-data fields scrubbed on a daily cron, results stay. | Security Domain + Don't Hand-Roll      | MEDIUM — interpretation of "data retention: 30 days post-event for contact information; competition results retained per federation rules." Discuss with Jonas if he wants delete-all vs scrub-name-club-only. |
| A8  | Single-laptop deployment means no `setuid` for `serialport` is needed — user is added to `dialout` group.                                                             | Security Domain                        | LOW — this is the standard Linux pattern; the bench laptop already works this way for Phase 0.                                                                                                                 |
| A9  | Auto-print toggle persists per competition in SQLite (not per operator session).                                                                                      | Pattern 6 + UI-SPEC                    | LOW — UI-SPEC §"Auto-print toggle" explicitly says event-level.                                                                                                                                                |
| A10 | The bundled IOF.xsd is the latest version (3.0) and matches what partner systems use.                                                                                 | Pattern 7 + Pitfall 5                  | LOW — IOF v3.0 has been stable since 2014. The schema repo's last commit predates Phase 1.                                                                                                                     |

## Open Questions

1. **`libxmljs2-xsd` native build vs `xmllint-wasm` for SC#6.**
   - What we know: both validate against IOF.xsd; `libxmljs2-xsd` is faster but needs `node-gyp` + libxml2-dev at install; `xmllint-wasm` is pure-WASM but ~5MB.
   - What's unclear: whether `pnpm install --prod` of the published `fartola` package succeeds on a fresh laptop without dev tools. If not, `xmllint-wasm` wins despite the size.
   - Recommendation: Wave 0 includes a "fresh-laptop install smoke" subtask that tries `libxmljs2-xsd` first. Fall back to `xmllint-wasm` if install fails.

2. **REQ-PRIV-002 retention semantics for "contact info."**
   - What we know: 30 days after the event. "Contact information" includes name + club + SI card per ADR / research.
   - What's unclear: does retention mean DELETE the rows, or SCRUB the personal fields and keep result placements? Federation rules retain results; GDPR demands deleting PII.
   - Recommendation: Default = SCRUB (name → "Anonymiserad", club → null, card_number kept as-is since card numbers identify hardware not people per research.md §6 GDPR note). Surface as a decision question for `/gsd-discuss-phase` if Jonas wants stricter behavior.

3. **Brother PJ-7 ESC/POS dialect parity with Star/Epson.**
   - What we know: `node-thermal-printer` lists Brother as supported.
   - What's unclear: PJ-7 is a portable thermal that may use a Brother-specific subset of ESC/POS; cuts and barcodes may need different command sequences.
   - Recommendation: Defer hardware bench-test until walking-skeleton wave produces a printable receipt; then verify each printer in a dedicated print-driver task with a manual smoke step.

4. **Are we allowed to bundle IOF.xsd in the published package?**
   - What we know: The XSD is open per ADR-0007.
   - What's unclear: IOF's GitHub license file should be read (it's open data, but verify).
   - Recommendation: Read `https://github.com/international-orienteering-federation/datastandard-v3/blob/master/LICENSE` in Wave 0; include attribution in the published tarball's `NOTICE.md` either way.

5. **Should the readout view's "Simulate read" Tweaks button consume the Phase 0 bench fixtures?**
   - What we know: UI-SPEC §Tweaks panel: "Simulate read" is dev-only.
   - What's unclear: Cleanest implementation is `apps/edge/` exposing `POST /api/__dev/simulate-read` (gated by env var) that ingests one of the 4 Jonas fixtures. The UI button triggers that endpoint.
   - Recommendation: Land this in the walking-skeleton wave so subsequent waves can ride it for fast iteration without the reader.

6. **Receipt template chooser persistence — per-competition or per-operator?**
   - UI-SPEC §"Receipt template DEFAULT" says per-competition. Tweaks panel doesn't mention receipt template.
   - Recommendation: Per-competition (mutable config table column). Operator can change before going live.

## Environment Availability

| Dependency                       | Required By                              | Available                  | Version                              | Fallback                                                                                     |
| -------------------------------- | ---------------------------------------- | -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Node.js 22 LTS                   | Edge bridge runtime                      | ✓                          | v22.19.0 (verified `node --version`) | —                                                                                            |
| pnpm                             | Workspace + install                      | ✓                          | 10.30.3 (verified)                   | —                                                                                            |
| Docker                           | None (Phase 1 doesn't use containers)    | ✓                          | present                              | —                                                                                            |
| `serialport` (NPM)               | SI bridge (Phase 0 dep, carried forward) | ✓                          | 13.x (already installed)             | —                                                                                            |
| `/dev/ttyUSB0` (BSM7/8)          | Live readout                             | ✗ at research time         | —                                    | Phase 0 `--replay` fixture mode covers dev + CI. Bench-time only for SC#7.                   |
| `/dev/usb/lp0` (thermal printer) | Receipt print                            | ✗ at research time         | —                                    | UI-SPEC error state `Utskrift misslyckades` already specified. Hardware-smoke only for SC#5. |
| `sqlite3` CLI                    | DBA convenience (NOT a Node dep)         | ✗                          | —                                    | Optional — better-sqlite3 ships its own SQLite. Add to bench laptop for debugging.           |
| `libxml2-dev` (system)           | `libxmljs2-xsd` install if native chosen | unknown                    | —                                    | `xmllint-wasm` (pure WASM, no system dep).                                                   |
| `xmllint` CLI                    | Optional — manual XSD smoke during dev   | ✗                          | —                                    | Optional.                                                                                    |
| Chrome (desktop)                 | UI testing                               | (Jonas's laptop)           | —                                    | Playwright bundles a browser.                                                                |
| Chrome Android (tablet)          | REQ-UI-001 form factor                   | (Jonas's tablet, untested) | —                                    | Manual tablet smoke before SC#7.                                                             |

**Missing dependencies with no fallback:**

- None — every missing item has an in-process fallback or is hardware-bench territory.

**Missing dependencies with fallback:**

- Thermal printer hardware → Phase 1 walking skeleton starts with a `--print-to-stdout` mock; switch to real printer in the print-driver wave.
- BSM7/8 hardware → Phase 0 bench fixtures + replay mode cover all dev iterations; SC#7 is the only test that needs real hardware.
- `libxml2-dev` system package → switch validator to `xmllint-wasm` if `libxmljs2-xsd` install fails.

## Validation Architecture

### Test Framework

| Property                     | Value                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework (edge + packages)  | `node:test` (Node 22 built-in) — Phase 0 baseline carried forward                                                         |
| Framework (web)              | `vitest@4.1.6` — SvelteKit default, Vite-native                                                                           |
| E2E framework                | `@playwright/test@1.60.0` — three-click wizard + walk-up + readout flows                                                  |
| Edge config file             | `apps/edge/package.json` `"test": "node --test --test-reporter=spec 'src/**/*.test.ts'"` — mirrors `packages/sportident/` |
| Web config file              | `apps/web/vitest.config.ts` (new — Wave 0)                                                                                |
| E2E config file              | `apps/web/playwright.config.ts` (new — Wave 0)                                                                            |
| Quick run command (per task) | `pnpm --filter <pkg> test` — runs only the affected package                                                               |
| Full suite command           | `pnpm -r test && pnpm e2e` — workspace-wide                                                                               |

### Phase Requirements → Test Map

| Req ID                   | Behavior                                                     | Test Type            | Automated Command                                                  | File Exists? |
| ------------------------ | ------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------ | ------------ |
| REQ-HW-001..004          | Phase 0 carry-forward (SI card read + CRC)                   | unit + integration   | `pnpm --filter @fartola/sportident test`                           | ✅ Phase 0   |
| REQ-EVT-001              | Events get `(node_id, local_seq)` tuple and become immutable | unit                 | `pnpm --filter @fartola/edge test --test-name-pattern="event log"` | ❌ Wave 0    |
| REQ-EVT-002              | No UPDATEs/DELETEs on events table (append-only)             | unit                 | `apps/edge/src/db/events.test.ts::test_append_only`                | ❌ Wave 0    |
| REQ-EVT-003              | All derived state comes from reducers                        | unit                 | `apps/edge/src/db/projections/reduce.test.ts`                      | ❌ Wave 0    |
| REQ-EVT-004              | Reducers are deterministic + idempotent                      | unit                 | `reduce.test.ts::test_replay_idempotent`                           | ❌ Wave 0    |
| REQ-EVT-CMP-001          | Create competition (name + date + classes + courses)         | integration          | `apps/edge/src/routes/competitions.test.ts`                        | ❌ Wave 1    |
| REQ-EVT-CMP-002          | Import Purple Pen XML, auto-create classes                   | integration          | `apps/edge/src/ingest/courseImport.test.ts`                        | ❌ Wave 1    |
| REQ-EVT-CMP-003          | Import IOF XML 3.0 EntryList                                 | integration          | `apps/edge/src/ingest/entryImport.test.ts`                         | ❌ Wave 1    |
| REQ-EVT-CMP-004          | Walk-up registration creates competitor + binds card         | integration          | `apps/edge/src/routes/competitors.test.ts::test_walkup`            | ❌ Wave 3    |
| REQ-EVT-CMP-005          | Auto-attach card on start-list match                         | unit                 | `apps/edge/src/db/projections/match.test.ts`                       | ❌ Wave 3    |
| REQ-EVT-CMP-006          | Mark DNF/MP from punch sequence                              | unit                 | `apps/edge/src/db/projections/dnfMp.test.ts`                       | ❌ Wave 3    |
| REQ-EVT-CMP-007          | Live results page updates over WS                            | e2e                  | `apps/web/e2e/results.spec.ts`                                     | ❌ Wave 2    |
| REQ-EVT-CMP-008          | Export IOF XML 3.0, XSD-valid                                | integration          | `apps/edge/src/xml/iofExport.test.ts::test_xsd_valid`              | ❌ Wave 5    |
| REQ-UI-001               | PWA on Chrome desktop + Android tablet                       | e2e + manual         | `apps/web/e2e/pwa.spec.ts` + manual tablet smoke                   | ❌ Wave 4    |
| REQ-UI-002               | Three-click wizard                                           | e2e                  | `apps/web/e2e/wizard.spec.ts`                                      | ❌ Wave 4    |
| REQ-UI-003               | Readout view live updates                                    | e2e                  | `apps/web/e2e/readout.spec.ts`                                     | ❌ Wave 4    |
| REQ-UI-004               | Thermal print path                                           | integration + manual | `apps/edge/src/print/escposDriver.test.ts` (stubbed) + bench print | ❌ Wave 4    |
| REQ-UI-006               | i18n sv default + en fallback                                | unit                 | `apps/web/src/lib/i18n/i18n.test.ts`                               | ❌ Wave 4    |
| REQ-UI-007               | High-contrast mode + 44px hit targets                        | e2e                  | `apps/web/e2e/a11y.spec.ts`                                        | ❌ Wave 4    |
| REQ-STD-001              | IOF XML 3.0 import (Course + Entry + Class)                  | integration          | shared with REQ-EVT-CMP-002/003                                    | (above)      |
| REQ-STD-002              | IOF XML 3.0 export (Result list)                             | integration          | shared with REQ-EVT-CMP-008                                        | (above)      |
| REQ-STD-003              | IOF XML 2.0.3 read (legacy)                                  | integration          | `apps/edge/src/xml/iof203Import.test.ts`                           | ❌ Wave 5    |
| REQ-OPS-001              | `npm install -g fartola && fartola` boots cleanly            | manual-only          | `scripts/install-smoke.sh` (Wave 5)                                | ❌ Wave 5    |
| REQ-OPS-002              | Bridge survives restart with zero data loss                  | integration          | `apps/edge/src/restart.test.ts`                                    | ❌ Wave 5    |
| REQ-OPS-003              | Daily SQLite backup, no human action                         | integration          | `apps/edge/src/backup/backup.test.ts`                              | ❌ Wave 5    |
| REQ-PRIV-001             | Consent timestamp captured at walk-up                        | unit                 | `apps/edge/src/routes/competitors.test.ts::test_consent`           | ❌ Wave 3    |
| REQ-PRIV-002             | 30-day retention scrub                                       | unit                 | `apps/edge/src/db/retention.test.ts`                               | ❌ Wave 5    |
| Walking skeleton         | Fake punch → DB insert → REST → WS → mock print              | e2e                  | `apps/web/e2e/skeleton.spec.ts`                                    | ❌ Wave 0    |
| SC#7 (StorTuna training) | Real event runs without falling over                         | manual-only          | Bench evening                                                      | ❌ phase-tag |

### Sampling Rate

- **Per task commit:** `pnpm --filter <changed-pkg> test` — runs the package's `node:test` or `vitest` suite, < 30s for most. Triggered by lefthook pre-commit.
- **Per wave merge:** `pnpm -r test && pnpm e2e` — full suite including Playwright. Target < 5 min.
- **Phase gate:** Full suite green + manual hardware smoke (printer + reader) + IOF XML export imported into MeOS-OZ for sanity check, before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `apps/edge/package.json` — new, with `node:test` script mirroring `packages/sportident/`
- [ ] `apps/web/package.json` — new, with `vitest` + `playwright` scripts
- [ ] `apps/web/vitest.config.ts` — new
- [ ] `apps/web/playwright.config.ts` — new
- [ ] `apps/edge/src/db/schema.ts` — Drizzle schema (BLOCKING per "Schema push detection" note)
- [ ] `apps/edge/drizzle.config.ts` — dev-only drizzle-kit config
- [ ] `apps/edge/drizzle/0000_initial.sql` — generated initial migration
- [ ] `apps/edge/src/db/events.test.ts` — append-only + WAL pragmas verified
- [ ] `apps/edge/src/db/projections/reduce.test.ts` — empty-input + replay-idempotent placeholder
- [ ] `apps/edge/src/server.test.ts` — Fastify boot + `/api/health` + static fallback smoke
- [ ] `apps/web/e2e/skeleton.spec.ts` — walking-skeleton happy path (simulate-read → readout update → mock print toast)
- [ ] `packages/shared-types/package.json` — new, pure-TS, `"exports": "./src/index.ts"`
- [ ] `packages/shared-types/src/{ndjson.ts,dto.ts,ws.ts}` — type modules

_Test infrastructure detected (Phase 0): `node --test` runner + lefthook + commitlint chain is reusable. No framework install needed for the edge package or shared-types. Vitest + Playwright are net-new for the web package._

## Security Domain

### Applicable ASVS Categories

| ASVS Category               | Applies       | Standard Control                                                                                                               |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| V2 Authentication           | no            | Phase 1 = localhost-only single-laptop. No auth boundary inside the box. Phase 2+ when LAN clients arrive.                     |
| V3 Session Management       | no            | Same — no sessions in P1.                                                                                                      |
| V4 Access Control           | yes (minimal) | Bind Fastify to `127.0.0.1` only (not `0.0.0.0`). Reject WS upgrades from foreign origins via `@fastify/cors`.                 |
| V5 Input Validation         | yes           | Zod schemas on every REST + WS-inbound payload. `fast-xml-parser` parse + Zod-validate every imported XML before any DB write. |
| V6 Cryptography             | no            | No secret storage or transit in P1 (localhost).                                                                                |
| V7 Error Handling & Logging | yes           | Fastify default logger; stderr for diagnostics; no PII in logs (mask card numbers? — leave as-is in P1, revisit in P2).        |
| V8 Data Protection          | yes           | REQ-PRIV-002 retention scrub + consent capture (REQ-PRIV-001) per ADR-0006.                                                    |
| V9 Communications           | no            | Localhost only. HTTPS not required in P1.                                                                                      |
| V10 Malicious Code          | yes (minimal) | Pin all deps via pnpm lockfile (already done). Audit `node-thermal-printer` install scripts before adding.                     |
| V11 Business Logic          | yes           | DNF/MP detection (D-12 reducer) must be tested against adversarial punch sequences (out-of-order, duplicate, malformed).       |
| V12 Files & Resources       | yes           | Course-XML upload size cap (Fastify `bodyLimit`). Reject filenames that contain path traversal.                                |
| V13 API & Web Service       | yes           | All API JSON, all input validated. `@fastify/sensible` for 4xx response shapes.                                                |
| V14 Configuration           | yes           | `fartola` reads minimal env (e.g., `FARTOLA_DB_PATH`, `FARTOLA_BIND_HOST`); no secrets in env.                                 |

### Known Threat Patterns for Node + Fastify + Browser stack

| Pattern                                              | STRIDE                      | Standard Mitigation                                                                                                  |
| ---------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Path traversal in `@fastify/static`                  | Tampering / Info Disclosure | `@fastify/static` defaults strip `..`; verify `prefix:` and `root:` are absolute paths in `apps/web/build/`.         |
| Prototype pollution in JSON parse                    | Tampering                   | Use `JSON.parse` (safe by default in Node 22). Zod-validate after parse.                                             |
| XML entity expansion (Billion Laughs)                | DoS                         | `fast-xml-parser` has `processEntities` option — leave at default and enforce input size cap on the import endpoint. |
| ReDoS in user-typed walk-up form (club autocomplete) | DoS                         | UI-SPEC says no regex on name field. Don't introduce one without complexity-bounded matchers.                        |
| SQL injection                                        | Tampering                   | Drizzle parameterizes by default. Never concatenate user input into `sql\`\``.                                       |
| Open WebSocket origin                                | Spoofing                    | Set `verifyClient` on `@fastify/websocket` to reject foreign origins. Localhost only in P1.                          |
| Unbounded WS message size                            | DoS                         | `@fastify/websocket` `maxPayload: 256 * 1024`.                                                                       |
| Receipt-print resource hog                           | DoS                         | Single-flight queue in `print/escposDriver.ts` — one print at a time, drop new requests with a 429-like toast.       |
| Card-number range probing                            | Info Disclosure             | Cards are public hardware IDs, not PII per research.md §6. No mitigation needed; log normally.                       |
| CSRF on REST endpoints                               | Tampering                   | Phase 1 = same-origin only via SPA fallback. Add CSRF tokens in P2 when remote clients land.                         |
| GDPR personal data exposure in logs                  | Privacy                     | Never log full competitor objects; log `competitor_id` and structured fields only.                                   |

**Security posture for Phase 1:** localhost-only deployment dramatically narrows the attack surface. The dominant controls are input validation (Zod on REST + WS, XSD on XML imports, schema on parsed Purple Pen files) and append-only event log discipline. Phase 2 must layer authentication + LAN-origin checks when multi-operator arrives.

## Project Constraints (from CLAUDE.md)

The repository has no `./CLAUDE.md` at the workspace root (verified `cat: No such file or directory`). Therefore project constraints are inherited from the user's global `~/.claude/CLAUDE.md` (already followed by all agents) and from Phase 0 conventions:

- **Conventional Commits** + commitlint + lefthook (Phase 0 D-08) — Phase 1 stays inside the same pre-commit chain.
- **TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`** (Phase 0 D-02) — applies to `apps/edge/`, `apps/web/`, `packages/shared-types/`.
- **`node:test` for edge + packages** — Phase 0 D-06 baseline carried forward; `vitest` only for `apps/web/`.
- **AGPL-3.0 for the application, MIT for `packages/sportident/`** — ROADMAP.md "Cross-cutting." Phase 1 code lands as AGPL by default; only `packages/sportident/` and (if it becomes a publishable shared lib) `packages/shared-types/` can be MIT.
- **MIT NOTICE headers in ported files (Phase 0 D-11)** — not expected to trigger in Phase 1 (no further porting from `allestuetsmerweh/sportident.js`).
- **Swedish-first UI strings** — UI-SPEC §Copywriting already locks the catalog.
- **Backwards compatibility with SI5 cards and IOF XML 2.0.3** — SI5 is Phase 0 done; IOF 2.0.3 is deferred to Phase 2 per CONTEXT.md (REQ-STD-003 dropped from Phase 1 scope).
- **Tests run on real hardware before any release tag** — SC#7 is the binding contract; bench evening at StorTuna.

## Sources

### Primary (HIGH confidence)

- **Context7 `/drizzle-team/drizzle-orm`** — Embedded migrator (`drizzle-orm/better-sqlite3/migrator`), `migrate(db, { migrationsFolder })`, schema-as-TS with `sqliteTable`. Fetched 2026-05-14.
- **Context7 `/fastify/fastify-websocket`** — Plugin registration, `socket` API, `fastify.websocketServer.clients` broadcast, `createWebSocketStream`. Fetched 2026-05-14.
- **Context7 `/fastify/fastify-static`** — `wildcard: false` + `setNotFoundHandler` SPA-fallback pattern (canonical). Fetched 2026-05-14.
- **Context7 `/fastify/fastify`** — Plugin order, routing, error handling. Fetched 2026-05-14.
- **Context7 `/websites/svelte_dev_kit`** — `adapter-static` options, `fallback: '200.html'`, SPA mode docs. Fetched 2026-05-14.
- **`https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md`** — `db.backup()` async, progress callback, `db.pragma('journal_mode = WAL')`. WebFetched 2026-05-14.
- **`https://github.com/international-orienteering-federation/datastandard-v3`** — Confirmed XSD presence + examples for ResultList / EntryList / CourseData / StartList / ClassList. v3.0 stable since 2014, current. WebFetched 2026-05-14.
- **`https://github.com/international-orienteering-federation/datastandard-v3/blob/master/examples/CourseData_Individual_Step2.xml`** — Verified root element `<CourseData iofVersion="3.0">`, structure of `<Event>`, `<RaceCourseData>`, `<Control>`, `<Course>` / `<CourseControl>`. WebFetched 2026-05-14.
- **`https://purple-pen.org/`** + `https://purple-pen.org/about.htm`\*\* — "Create Data Interchange File (IOF XML)" exports IOF XML 3.0 CourseData. This is the SAME file as REQ-STD-001 / REQ-EVT-CMP-003. WebFetched 2026-05-14.
- **npm registry `npm view`** — All version numbers verified 2026-05-14: fastify 5.8.5, @fastify/websocket 11.2.0, @fastify/static 9.1.3, better-sqlite3 12.10.0, drizzle-orm 0.45.2, drizzle-kit 0.31.10, svelte 5.55.5, @sveltejs/kit 2.59.1, @sveltejs/adapter-static 3.0.10, node-thermal-printer 4.4.3 (modified 2026-01-27), @node-escpos/core 0.6.0 (modified 2024-03-13), i18next 26.1.0 (modified 2026-05-11), vitest 4.1.6, @playwright/test 1.60.0, zod 4.4.3, fast-xml-parser 5.2.0, sveltekit-superforms 2.30.1.
- **Phase 0 CONTEXT + SUMMARY** — `.planning/phases/00-hardware-proof/00-CONTEXT.md` (D-01..D-20), `.planning/phases/00-hardware-proof/00-1-SUMMARY.md` (Phase 0.1 gap closures, public surface). Read 2026-05-14.
- **Phase 0 NDJSON schema** — `packages/sportident/src/output/ndjson.ts` (verified directly): 5 event types, `schema_version: 1`, snake_case fields.

### Secondary (MEDIUM confidence)

- **`https://github.com/node-escpos/driver`** — `@node-escpos/core@0.6.0` (Jan 2024), `@node-escpos/usb-adapter`, network/serial/bluetooth adapters. WebFetched 2026-05-14.
- **WebSearch** "node-thermal-printer Linux /dev/usb/lp0 Star TSP143 Epson character set" — confirmed Linux USB device path support + Star + Epson + Brother profiles, character set parameter. 2026-05-14.
- **WebSearch** "better-sqlite3 WAL mode journal_mode synchronous performance" — confirmed `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`, `PRAGMA cache_size`. 2026-05-14.
- **WebSearch** "vercel/pkg deprecated 2024 @yao-pkg/pkg node-sea" — confirmed `vercel/pkg` archived 2024-01-13; `@yao-pkg/pkg` is active fork; both struggle with `better-sqlite3` native binding. 2026-05-14.
- **WebFetch `https://inlang.com/m/dxnzrydw/paraglide-sveltekit-i18n`** — verified paraglide-js SvelteKit SPA mode works (relevant only as alternative; we keep i18next per D-02). 2026-05-14.
- **WebSearch** "sveltekit-superforms zod Svelte 5 2025" — confirmed Superforms 2.30.1 is active, Zod-backed. 2026-05-14.

### Tertiary (LOW confidence)

- **WebSearch** "Purple Pen .ppen XML root element schema documentation" — confirmed `.ppen` is Purple Pen's native binary-flavored XML; documentation is sparse. The export-to-IOF-XML path is well-documented; the native `.ppen` parser is NOT what we want. 2026-05-14. Marked LOW because Phase 1 deliberately uses the IOF XML export from Purple Pen, not the native `.ppen`.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every library version verified against npm registry today; Drizzle / Fastify / SvelteKit usage patterns verified via Context7 official docs.
- Architecture: **HIGH** — patterns derive from existing ADRs (0002, 0003, 0005, 0006, 0007) and CONTEXT.md decisions D-01..D-15 + UI-SPEC. Walking skeleton + reducer pattern are textbook.
- Pitfalls: **HIGH** for documented Node/SQLite/Fastify pitfalls; **MEDIUM** for the Brother PJ-7 specifics (A2) and the libxmljs2 native build (A1).
- IOF XML: **HIGH** — verified XSD top-level elements + CourseData example shape directly from upstream GitHub.
- ESC/POS: **MEDIUM** — `node-thermal-printer` is the right pick but bench verification of Brother PJ-7 + Skogis SVG monochrome render is open work (A2, A3).
- IOF 2.0.3 / Eventor: **N/A** — out of Phase 1 scope per CONTEXT.md.

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days for stable web stack)
**Notable freshness:** `i18next@26.1.0` published 2026-05-11 (3 days ago) and `node-thermal-printer@4.4.3` published 2026-01-27 — both active. `@node-escpos/core@0.6.0` last published 2024-03-13 — alive but slower; if it stalls further, switch to `node-thermal-printer` is trivial (one-file driver wrapper).
