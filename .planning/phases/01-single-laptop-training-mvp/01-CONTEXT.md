# Phase 1: Single-laptop training MVP - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 turns the Phase 0 NDJSON-emitting sportident bridge into a
runnable, single-laptop competition system for **club training events
(20–40 starters)**. The success target is StorTuna OK Tuesday training
running end-to-end on one Linux laptop with no internet required:
Purple Pen course import → SI card read → live results in a browser →
DNF / MP detection → thermal receipt → IOF XML 3.0 ResultList export.

**In scope (Phase 1):**
- `apps/edge/` Node.js Fastify bridge: serialport (Phase 0 sportident),
  better-sqlite3 event log + Drizzle, REST + WebSocket API, serves the
  built web UI as static assets.
- `apps/web/` SvelteKit PWA (adapter-static, installable manifest):
  three-click new-competition flow, readout view, live results page,
  walk-up registration, Swedish-first i18next (en bundled but secondary).
- `packages/shared-types/` pure-TS package exporting NDJSON event types,
  REST DTOs, DB row types, consumed by both apps.
- `packages/sportident/` unchanged; consumed by `apps/edge/` for SI card
  reading. SI11 + macOS/Windows still deferred per ADR scope.
- Course import: **Purple Pen `.xml`** (SC#1) AND **IOF XML 3.0
  EntryList** import (REQ-EVT-CMP-003).
- IOF XML 3.0 ResultList **export** with XSD validation (SC#6,
  REQ-STD-002).
- Card→competitor matching: **hybrid** — auto-attach on start-list
  match; modal walk-up registration for unknown cards
  (REQ-EVT-CMP-004, REQ-EVT-CMP-005).
- DNF/MP detection as a **pure-punch projection** over the event log
  (REQ-EVT-CMP-006). No time-based auto-DNF in Phase 1; operator can
  manually flag via dedicated event.
- **Thermal printer** receipt via ESC/POS (REQ-UI-004). QR-receipt
  deferred to Phase 2.
- Restart-safe bridge process, daily SQLite backup
  (REQ-OPS-001..003).
- Privacy: consent + 30-day retention (REQ-PRIV-001, REQ-PRIV-002).
- Single `fartol` binary: one Fastify process, REST `/api/*`,
  WebSocket `/ws`, static SvelteKit build at `/`.

**Out of scope (deferred to later phases):**
- Eventor REST integration (REQ-STD-004) — Phase 2 sanctioned
  competition. ADR-0009 placed it there; `no-internet-required` ruled
  it out of Phase 1.
- IOF XML 2.0.3 read (REQ-STD-003) — deferred; Purple Pen + IOF 3.0
  EntryList cover Phase 1 needs.
- Multi-operator concurrent editing / Yjs CRDT (REQ-UI-008) — Phase 2.
- Edge-node health dashboard (REQ-OPS-004) — Phase 2.
- Peer-sync between bridges, central tier, ElectricSQL public read
  flow — Phase 4+.
- SRR dongle / autosend `0xD3` / set-time / clock-sync — Phase 4.
- macOS / Windows hardware path — Phase 1 ships Linux only (same
  scope as Phase 0).
- QR-receipt path (REQ-UI-005) — deferred; thermal is the Phase 1
  receipt surface.
- Speaker dashboard / kids' finish screen / SMS notifications — Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Scope tightening

- **D-01:** Receipt path = **thermal only** via ESC/POS. QR receipt
  deferred to Phase 2. Reason: SC#5 says "thermal OR QR"; clubs expect
  thermal; QR work isn't blocked by anything in Phase 1 so it slides
  cleanly.
- **D-02:** i18n = **full i18next, Swedish as default locale**. All
  user-facing strings authored as keys in `sv.json` + `en.json` from
  day one. Honors REQ-UI-006 literally; avoids a Phase 2 refactor.
- **D-03:** Entry/runner imports = **Purple Pen `.xml` (SC#1) +
  IOF XML 3.0 EntryList (REQ-EVT-CMP-003)**. No Eventor REST in
  Phase 1; no IOF 2.0.3 read in Phase 1. Clubs that need Eventor
  data can export it as IOF XML 3.0 from Eventor and import the
  file — same offline-first story.
- **D-04:** Walk-up registration = **first-class** in Phase 1
  (REQ-EVT-CMP-004). When an unknown SI card is read, a modal
  collects competitor details inline; the card auto-binds to the
  new competitor on save.

### Monorepo + binary

- **D-05:** Repo layout = `apps/edge/` + `apps/web/` +
  `packages/sportident/` + `packages/shared-types/`. Update
  `pnpm-workspace.yaml` to include both `apps/*` and `packages/*`.
  Runtime apps vs reusable libraries are visually separated.
- **D-06:** Production binary = **single `fartol` binary**. One
  Fastify process serves built SvelteKit assets (adapter-static
  output, SPA fallback `200.html`) at `/`, REST at `/api/*`,
  WebSocket at `/ws`. Honors REQ-OPS-001 (`npm install -g fartol` →
  run). Dev: `pnpm dev` runs Vite at :5173 + Fastify at :3000 with
  proxy.
- **D-07:** SvelteKit adapter = **`@sveltejs/adapter-static`** with
  `fallback: '200.html'` (SPA mode). SEO is a non-issue for
  `localhost:5173`. Server-render features (`+page.server.ts`,
  form actions) explicitly not used in Phase 1 — all data flows via
  REST and WebSocket.
- **D-08:** Shared types live in **`packages/shared-types/`** as a
  pure-TS package (no build step, exports `.ts` directly). Both
  `apps/edge/` and `apps/web/` consume via `workspace:*`. Standard
  pnpm pattern (context7 / pnpm.io). Keeps `packages/sportident/`
  free of non-SI DTOs per Phase 0 D-04.

### Data model & matching

- **D-09:** Competition configuration data (competitions, classes,
  courses, competitor list) lives in **mutable SQL tables**.
  Punches stay in the immutable `events` table per
  `.planning/research/architecture.md` event-log schema. ADR-0003
  (event sourcing as core) applies to punches; config-mutation
  uses normal CRUD. Phase 2 will layer Yjs on top of these
  tables for multi-operator editing.
- **D-10:** DB query layer = **Drizzle ORM** on `better-sqlite3`.
  Schema-as-TS, type-safe queries, built-in migrations. Dominant
  Node+SQLite choice in 2025–26.
- **D-11:** Card-to-competitor matching = **hybrid**. Card SI in
  start list → auto-attach and project result immediately. Unknown
  SI → walk-up modal blocks readout for that card only. Matches
  what MeOS users expect; safest for stressed operators.
- **D-12:** DNF / MP detection = **pure-punch projection** over the
  event log. MP = punches missing or out-of-order vs. expected
  course punch list. DNF = no finish punch. No time-based auto-DNF
  in Phase 1. Operator may emit a `manual_dnf` event (with reason)
  to override; that becomes another input to the same reducer.

### Realtime + UI shape

- **D-13:** Live transport bridge → browser = **WebSocket** via
  `@fastify/websocket` on the bridge and native WebSocket in
  SvelteKit. Reconnect logic handled via a small client wrapper
  ("await server hello, resubscribe channels on reconnect").
  Phase 2 layers Yjs CRDT over the same WebSocket — no transport
  migration.
- **D-14:** PWA depth in Phase 1 = **manifest + installable icons**.
  No service worker / offline asset cache yet. Bridge IS the
  server; local-only deployment doesn't need offline asset shells.
  REQ-UI-001 ("PWA accessible on Chrome desktop and Chrome
  Android") is satisfied; tablet installability works.
- **D-15:** Three-click new-competition flow (REQ-UI-002) =
  **Create → Import course → Ready**.
  - Click 1: "New competition" — name + date inline modal.
  - Click 2: "Import course" — file picker accepts Purple Pen
    `.xml` (and IOF XML 3.0 CourseData if present).
  - Click 3: "Start readout" — auto-detects connected BSM7/8
    reader via the Phase 0 bridge; lights green when handshake
    completes.

### Claude's Discretion

Areas where the planner / executor has flexibility:

- Exact Fastify plugin set (`@fastify/cors`, `@fastify/static`,
  `@fastify/websocket`, `@fastify/sensible`) and route file
  organization.
- Drizzle migration tool choice (`drizzle-kit generate` + manual
  run vs. embedded migrator at bridge startup). Suggest embedded
  migrator so `npm install -g fartol && fartol` Just Works.
- SvelteKit project structure (`src/routes/` layout, store/runes
  organization, component library — likely Skeleton or shadcn-svelte).
- WebSocket message envelope (`{type, payload, seq}` suggested) and
  channel naming (`readout:<competitionId>`, `results:<competitionId>`).
- IOF XML 3.0 import/export library choice (`fast-xml-parser` +
  hand-rolled schema validation, or `libxmljs2` + XSD). Phase 1 must
  validate ResultList against the official XSD before saving.
- ESC/POS thermal printer library (`node-escpos` per architecture.md,
  but `escpos-buffer` and direct USB write are reasonable too;
  `escpos-printer-db` config for Star TSP143 / Epson TM-T20 /
  Brother PJ-7 per REQ-UI-004).
- i18next backend / framework integration (`sveltekit-i18n` vs
  `typesafe-i18n` vs raw `i18next` + small Svelte wrapper).
- Daily backup mechanism (cron-in-process vs node-cron vs OS cron
  vs simple setInterval at midnight). REQ-OPS-003 just demands
  "no human action required."
- Walk-up form validation rules (name length, club code format,
  SI card range checks).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked decisions (ADRs)

- `.planning/adr/0002-three-tier-architecture.md` — Edge-bridge
  owns hardware + local SQLite + LAN HTTP/WS API. Phase 1 = edge
  tier + browser client tier only. No central tier.
- `.planning/adr/0003-event-sourcing-as-core-data-model.md` —
  Punches are immutable events; derived state is computed.
  Applies to the `events` table; not to mutable config tables
  (D-09).
- `.planning/adr/0005-sportident-code-isolated-mit.md` — All
  SportIdent code stays in `packages/sportident/`; consumed by
  `apps/edge/` through Phase 0's NDJSON / typed event surface.
- `.planning/adr/0006-tech-stack.md` — Node.js 22 LTS + Fastify,
  better-sqlite3, SvelteKit PWA, `node-escpos`. Phase 1 instantiates
  this stack for the first time.
- `.planning/adr/0007-standards-first-interop.md` — IOF XML 3.0
  is foundational; Phase 1 must export valid 3.0 ResultList
  (SC#6, XSD-validated).
- `.planning/adr/0009-v1-scope-clarification.md` — REQ-STD-004
  (Eventor), REQ-UI-008 (Yjs multi-op), REQ-OPS-004 (health
  dashboard) are v1 but land in **Phase 2**, not Phase 1.

### Phase 0 outputs (deps)

- `.planning/phases/00-hardware-proof/00-CONTEXT.md` — Phase 0
  scope, NDJSON event surface, D-13..D-16 output contract.
- `.planning/phases/00-hardware-proof/00-1-SUMMARY.md` —
  Phase 0.1 review-cycle outcomes (bare-ACK beep, ESM import,
  multiplexer queue-head fix, etc.).
- `packages/sportident/` — the Phase 0 package itself. Surface:
  `SiMainStation`, `SerialTransport`, `NdjsonEmitter`, all five
  event types (`card_inserted`, `card_read`, `card_removed`,
  `frame_error`, `connection_changed`), `schema_version: 1`.
- `packages/sportident/bin/fartol-readout` — Phase 0 CLI; reference
  for how `apps/edge/` consumes the SI surface (event handlers
  wired to NdjsonEmitter).

### Requirements & roadmap

- `.planning/REQUIREMENTS.md` — All Phase 1 REQ-IDs: REQ-HW-001..004,
  REQ-EVT-001..004, REQ-EVT-CMP-001..008, REQ-UI-001..007,
  REQ-STD-001..003, REQ-OPS-001..003, REQ-PRIV-001, REQ-PRIV-002.
- `.planning/ROADMAP.md` §"Phase 1: Single-laptop training MVP" —
  goal, 7 numbered success criteria (the binding contract).

### Architecture & research

- `.planning/research/architecture.md` §"Event log schema" —
  SQLite `events` table shape `(node_id, local_seq, event_type,
  event_time_ms, recorded_at_ms, payload)`. Phase 1 instantiates
  this schema for the first time.
- `.planning/research/architecture.md` §"Tech stack — chosen" —
  Fastify, better-sqlite3, SvelteKit, node-escpos.
- `.planning/research/architecture.md` §"Compatibility surface" —
  IOF XML 3.0 + 2.0.3 + Purple Pen + Eventor + ROC + SIRAP + MeOS
  TCP. Phase 1 implements the bold rows (IOF 3.0 + Purple Pen).

### External standards (downstream research targets)

- IOF XML 3.0 schema — <https://github.com/international-orienteering-federation/datastandard-v3>.
  Phase 1 must export ResultList that passes the upstream XSD.
- Purple Pen XML format — <https://purplepen.golde.org/>. Course
  files are the SC#1 import target.
- i18next docs — <https://www.i18next.com/> + Svelte integration.
- Drizzle ORM docs — <https://orm.drizzle.team/> (better-sqlite3
  dialect).
- `@fastify/websocket` — <https://github.com/fastify/fastify-websocket>.
- `@sveltejs/adapter-static` — <https://svelte.dev/docs/kit/adapter-static>.
  SPA mode via `fallback: '200.html'` is the Phase 1 deployment
  target.

### SportIdent (carry-forward from Phase 0)

- `https://github.com/allestuetsmerweh/sportident.js` — Port source
  for `packages/sportident/`. No new porting in Phase 1.
- `https://docs.sportident.com/` — Vendor docs; still the
  authoritative protocol reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`packages/sportident/`** — Phase 0 deliverable. `apps/edge/`
  consumes `SiMainStation` + `NdjsonEmitter`. Hook the station's five
  events (`connection_changed`, `card_inserted`, `card_read`,
  `card_removed`, `frame_error`) directly to a Drizzle-backed event
  inserter — that's the entire bridge-to-event-log path.
- **`packages/sportident/bin/fartol-readout`** — Reference
  implementation of "open serialport, run station, emit NDJSON."
  `apps/edge/`'s bridge entrypoint is structurally the same minus
  the stdout sink.
- **Phase 0 NDJSON schema (`schema_version: 1`)** — Already
  versioned and stable. Phase 1's `events` table column `payload`
  stores the same JSON shape minus the wire-format wrapper.

### Established Patterns

- **Conventional Commits + commitlint + lefthook** — Phase 0 set
  this. Phase 1 stays inside the same pre-commit chain.
- **TypeScript strict + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`** — Phase 0 baseline; carry into
  `apps/edge/`, `apps/web/`, `packages/shared-types/`.
- **node:test** — Phase 0 test runner. Plausible for `apps/edge/`
  too. `apps/web/` will likely add Vitest (SvelteKit default) and
  Playwright for E2E.
- **MIT NOTICE headers in ported files** — Phase 0 D-11. Not
  expected to trigger in Phase 1 (no further porting planned).

### Integration Points

- **`apps/edge/` consumes `packages/sportident/`** — only place
  that imports `serialport`. ADR-0005 invariant.
- **`apps/edge/` writes to local SQLite** — Drizzle migrations
  bundled into the binary so first run produces a usable database.
- **`apps/web/` ↔ `apps/edge/` contract** — REST `/api/*` for
  CRUD, WebSocket `/ws` for live updates. Shared DTOs live in
  `packages/shared-types/`.
- **Built web assets baked into the bridge binary** — at install
  time, `pnpm build` produces `apps/web/build/`, the Fastify app
  serves it. The published `fartol` package bundles the build
  output so global install works without a second build step.

</code_context>

<specifics>
## Specific Ideas

- **Target event:** StorTuna OK Tuesday training, 20–40 starters
  (SC#7). The success bar is "runs without falling over" — not
  performance optimization, not multi-arena, not federation
  sanctioning.
- **Hardware in hand:** SPORTident BSM7/8-USB at `/dev/ttyUSB0`,
  serial 593656; cards SI5/9/10/SIAC. All verified end-to-end in
  Phase 0; Phase 1 inherits the same bench.
- **Beep behavior:** Phase 0.1 added bare-ACK after every card
  read so the BSM-mini beeps. `apps/edge/` keeps that behavior
  via `packages/sportident/` defaults; no additional work needed.
- **Mobile readability:** Jonas reads on mobile. Downstream
  agents keep AskUserQuestion option descriptions and chat
  replies terse. Long content goes in this file / PLAN.md /
  ADRs, not in interactive prompts.
- **MeOS reference for UX:** When in doubt about operator UX
  flow, MeOS is the anchor — it's what current StorTuna operators
  know. Three-click new-competition (REQ-UI-002) is literally
  copying MeOS's UX bar.
- **Eventor parity note (from discussion):** Jonas asked whether
  we plan Eventor pull. Answer: yes, but in **Phase 2**. Clubs
  that want Eventor data in Phase 1 can export from Eventor as
  IOF XML 3.0 and use the EntryList import (D-03).

</specifics>

<deferred>
## Deferred Ideas

- **Eventor REST API pull + result push** (REQ-STD-004) — Phase 2
  sanctioned competition. Pull-only-in-prep is tempting for
  Phase 1 but ADR-0009 deliberately placed it in Phase 2 and
  "no internet required" rules it out.
- **QR-receipt path** (REQ-UI-005) — Phase 2. Lightweight; not
  blocked by Phase 1 work.
- **IOF XML 2.0.3 read** (REQ-STD-003) — Phase 2 or later. Legacy
  course tool import; not needed for StorTuna Tuesday.
- **Multi-operator concurrent editing / Yjs CRDT** (REQ-UI-008)
  — Phase 2 (sanctioned competition). Single-laptop training
  doesn't need it.
- **Edge-node health dashboard** (REQ-OPS-004) — Phase 2.
- **macOS / Windows hardware path** — Phase 2 or 3. Phase 1 is
  Linux-only.
- **Time-based auto-DNF** — Phase 2 or 3. Phase 1 detection is
  punch-only.
- **Service worker / offline asset cache** — Phase 3 or later.
  Local-only deployment in Phase 1 doesn't need it.
- **Big-screen overlay, speaker dashboard, kids' finish, SMS** —
  Phase 3 (the visible UX leap).
- **Peer sync between bridges, central tier, ElectricSQL public
  read** — Phase 4+.
- **SRR dongle, autosend `0xD3`, clock sync** — Phase 4.

### Reviewed Todos (not folded)

None — no matching todos for Phase 1 in the GSD todo registry at
discussion time.

</deferred>

---

*Phase: 1-Single-laptop-training-mvp*
*Context gathered: 2026-05-13*
