# Phase 2.0: 4-klubbs MVP — Research

**Researched:** 2026-05-16 (evening)
**Domain:** Streaming XML ingest (86 MB) + Fastify MIP/MOP route plugins + Drizzle migrations + WS broadcast wiring
**Confidence:** HIGH on wire formats (read XSDs + PDF spec + MeOS C++ source directly); HIGH on Phase 1 reuse patterns (read source); MEDIUM on saxes-vs-sax (no current benchmark on this exact 86 MB file); HIGH on Eventor shape (verified by parallel agent's smoke test).
**Hard deadline:** Wednesday **2026-05-20** (4 days)

---

## Summary

Phase 2.0 is mostly **plumbing of already-locked decisions**. Round-2 discuss-phase produced 14 implementation decisions (D-EV-1..3, D-MIP-1..4, D-MOP-1..4, D-HB-1..3, D-LIM-1) on top of 7 round-1 decisions — the architecture is fixed; this research fills the technical gaps left to "Claude's Discretion" and surfaces wire-format landmines.

**Three load-bearing findings from direct source review:**

1. **MIP `<entry>` carries `<card>` with `maxOccurs="1"`** (mip.xsd line 199). The D-MIP-3 "one re-emit per card-replace" is correct — there is no array semantics. A card_number change = re-emit the whole `<entry>` with the new card. MeOS parser uses `<extId>` to find the existing runner (onlineinput.cpp:1095-1115) → UPDATE rather than INSERT.

2. **MOP `<cmp>` has NO `hired` attribute** (mop.xsd lines 332-377, BaseCompetitor lines 223-306). D-LIM-1 is verified: rentals marked in MeOS during a fartOLa outage will NOT auto-import via MOP. Documented in playbook; not fixable in 2.0 without protocol extension.

3. **The `competition` and `lastid` are HTTP HEADERS, not query params** (input.php line 44-47; MOP PDF "Server Response" table). CONTEXT.md sketched them as query (`?competition=&lastid=`) — the spec wire format is `Competition: 1234` / `Lastid: 100`. Accept BOTH for robustness (the parallel-run playbook should verify MeOS's actual transport against this).

**Primary recommendation:** Use `saxes@6.x` for the 86 MB Eventor parse (streaming, no DOM); use `fast-xml-parser`'s `XMLBuilder` for MIP/MOP outbound serialization (same module Phase 1 uses for IOF XML export — zero new deps). Defer XSD runtime validation to **test-only** — `libxmljs2-xsd` adds native-binding pain, and `xmllint-wasm` is already in `apps/edge/package.json` (5.0.0) but only used at IOF export validation; reuse it in vitest-equivalents for MIP/MOP round-trip tests.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions (round 1 — 7 decisions)

1. **Course-only model for 4-klubbs.** `.reference/2026-05-20 4-klubbs_coursedata.xml` has 5 courses by color (Vit/Grön/Gul/Orange/Violett), no classes. Phase 1's CourseData importer auto-creates 1:1 class-per-course. Walk-up's "Klass" picker relabeled as **"Bana"**. No schema change.
2. **fartOLa is registration primary; MeOS is parallel backup via MIP+MOP.** Single operator UX (fartOLa walkup form). Every accepted walk-up is queued for MIP push. MeOS readback is the backup if fartOLa crashes; MOP feed pulls MeOS-only registrations back into fartOLa on restart.
3. **No runner double-stamping.** fartOLa bridge auto-captures finish punch. MeOS does its own readback. Each system gets its own data through its own path.
4. **Hyrbricka handled in both systems independently.** fartOLa stores `hired_card` and shows Swedish toast on finish-readout. MIP `<card hired="true">` lets MeOS show its own reminder. Belt + braces.
5. **Eventor is the runner-DATABASE, not the entry source.** One-shot download, cached, queried on bricka-input. Refresh weekly is fine.
6. **MIP server, not SendPunch TCP, not UDP broadcast.** The two 2014-era binary protocols are skipped entirely.
7. **`/gsd-plan-phase 2`** is the next workflow step.

### Locked Decisions (round 2 — 14 decisions)

**Eventor löpardatabasen cache (Plan 1):**

- **D-EV-1:** Refresh trigger = upstart job on bridge boot + admin "Uppdatera från Eventor" button. No background cron.
- **D-EV-2:** Re-fetch on bridge boot if cache > 7 days old.
- **D-EV-3:** Stale/empty cache + no internet = warn + run with what we have. Honors REQ-OPS-001 (no internet required).

**MIP server `<entry>` push (Plan 3):**

- **D-MIP-1:** Auth = none for 4-klubbs (closed club LAN).
- **D-MIP-2:** `lastid` source = reuse `events.local_seq`.
- **D-MIP-3:** Push scope = `<entry>` on bind + `<entry>` re-emit on card-replace.
- **D-MIP-4:** Entry shape = `<classname>` (string) + `<extId>` (fartOLa competitor UUID). Verified at `/home/jonas/src/meos/code/onlineinput.cpp:989-997`.

**MOP receiver (Plan 4):**

- **D-MOP-1:** Storage = shadow `meos_competitors` / `meos_classes` / `meos_clubs` tables.
- **D-MOP-2:** `<MOPComplete>` semantics = TRUNCATE + INSERT inside a single transaction. `<MOPDiff>` = UPSERT by id + DELETE rows with `delete="true"`.
- **D-MOP-3:** Reconciliation = auto-merge MeOS-only competitors into `competitors` with `source='meos'`, `consent_status='pending_first_read'`.
- **D-MOP-4:** Always-on, no auth.

**Hyrbricka (Plans 2 + 5):**

- **D-HB-1:** Junction table `hired_cards (competition_id, card_number PK, marked_at_ms, returned_at_ms NULLABLE, contact_name, contact_phone, contact_email, note)`.
- **D-HB-2:** Return flow = "Returnerad" button at finish-readout + admin "Aktiva hyrbrickor" backstop.
- **D-HB-3:** Walkup UX = Hyrbricka checkbox + expandable contact fields; at least phone OR email required.

**Known limitation (Plan 6):**

- **D-LIM-1:** MOP `<cmp>` does NOT carry the hired flag → rentals in MeOS during outage need manual re-entry. Verified against mop.xsd.

### Claude's Discretion

- Fastify route file organization for `apps/edge/src/integrations/meos/`.
- Streaming XML parser library for 86 MB Eventor download.
- Splash vs background indicator for Eventor on-boot fetch.
- ADR-0009 timing.
- Swedish toast wording.
- Empty MIP-poll response shape.
- Exact UPDATE fields that trigger MIP `<entry>` re-emit.
- Branch rename (cosmetic).

### Deferred Ideas (OUT OF SCOPE)

- **Multi-course-per-card same event** → Phase 2.1.
- **MIP authentication** → Phase 2.1 sanctioned events.
- **MeOS-side hired-card visibility on fartOLa crash recovery (D-LIM-1)** → Phase 2.1.
- **Yjs collaborative editing** → Phase 2.1.
- **QR-code self-signup public route** → Phase 2.1+.
- **Eventor entries pull (REQ-STD-004 read path)** → Phase 2.1.
- **Eventor results push (REQ-STD-004 write path)** → Phase 2.1.
- **MeOS SendPunch TCP / UDP broadcast** → skipped entirely.
- **Spectator live results page** → Phase 2.1.
- **Bridge crash recovery hardening** beyond D-MOP-3 → Phase 2.1.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID                       | Description                                                                                                                                                                                                                      | Research Support                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase-1 carry-forward    | All Phase 1 REQ-IDs remain in scope (REQ-HW, REQ-EVT, REQ-EVT-CMP, REQ-UI, REQ-STD-001..003, REQ-OPS-001..003, REQ-PRIV-001..002)                                                                                                | Phase 1 patterns mirrored verbatim — see §Architecture Patterns and PATTERNS.md                                                    |
| REQ-STD-004 (partial)    | Eventor REST integration — **runner DB only**, no entries pull/push                                                                                                                                                              | §Eventor download lifecycle; cachedcompetitors endpoint smoke-tested by parallel agent (`.planning/research/eventor-api-smoke.md`) |
| REQ-EXT-MEOS-001 (NEW)   | MIP/MOP coexistence with parallel MeOS install                                                                                                                                                                                   | §MIP Fastify route shapes; §MOP receiver design; verified against mip.xsd + mop.xsd + onlineinput.cpp                              |
| REQ-PRIV-002 (extension) | Retention scrub extends to `hired_cards.contact_*` columns                                                                                                                                                                       | §Drizzle migration plan §hired_cards table                                                                                         |
| **ID gap flag**          | `REQ-EXT-MEOS-001` does NOT yet exist in `.planning/REQUIREMENTS.md` — REQUIREMENTS.md was last updated 2026-05-12 and only carries Phase 1 IDs. Plan 0 or Plan 6 should add a REQ-EXT-MEOS-001 entry before phase verification. | RESEARCH gap                                                                                                                       |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability                                | Primary Tier                                                                                        | Secondary Tier                                                                 | Rationale                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Eventor cachedcompetitors download        | `apps/edge/eventor/cache.ts` (Node)                                                                 | —                                                                              | Only edge can run a 9.4 MB HTTP fetch + 86 MB XML parse against the local SQLite |
| Eventor lookup by si_card                 | `apps/edge/` REST (`/api/eventor/lookup`)                                                           | `apps/web/` autocomplete                                                       | Sub-ms SQLite indexed query; browser must NOT have direct SQLite access          |
| Eventor lookup by name prefix             | `apps/edge/` REST (`/api/eventor/lookup?prefix=`)                                                   | `apps/web/` autocomplete component                                             | Same                                                                             |
| MIP `/mip` GET (poll)                     | `apps/edge/integrations/meos/mip.ts` (Fastify)                                                      | —                                                                              | fartOLa is HTTP server; MeOS is HTTP client                                       |
| MOP `/mop` POST (push)                    | `apps/edge/integrations/meos/mop.ts` (Fastify)                                                      | —                                                                              | Same role inversion — fartOLa is HTTP server                                      |
| Hyrbricka write at walkup                 | `apps/web/WalkupModal.svelte` (UI form) → `apps/edge/routes/competitors.ts` (transactional persist) | —                                                                              | Single atomic transaction: competitor row + hired_cards row + card_bound event   |
| Hyrbricka toast at finish-readout         | `apps/web/ReadoutView.svelte`                                                                       | `apps/edge/routes/readout.ts` (extend with `hired_card_open: boolean` per row) | Browser dispatches the toast; edge supplies the data                             |
| Hyrbricka "Returnerad" click              | `apps/web/` HyrbrickaToast → `apps/edge/routes/hired-cards.ts` (PATCH endpoint)                     | —                                                                              | UPDATE on `hired_cards.returned_at_ms`                                           |
| MOP shadow-table writes                   | `apps/edge/integrations/meos/mop.ts`                                                                | —                                                                              | TRUNCATE+INSERT inside `sqlite.transaction()`                                    |
| Auto-merge MeOS competitors → competitors | `apps/edge/integrations/meos/mop.ts` (same transaction)                                             | `apps/web/` toast via WS `meos_merge` envelope                                 | Server-side INSERT ... WHERE NOT EXISTS; WS notification on count > 0            |
| Hyrbricka retention scrub                 | `apps/edge/privacy/retention.ts` (extend)                                                           | —                                                                              | Pure SQL UPDATE in the existing scheduler                                        |
| Boot-time Eventor refresh                 | `apps/edge/eventor/boot.ts` → `apps/edge/bin/fartola.ts` wiring                                      | —                                                                              | Fire-and-forget after `app.listen()`; never blocks startup (D-EV-3)              |

---

## Standard Stack

### Core — Reused from Phase 1 (zero new deps)

| Library              | Version | Purpose                                                  | Why Standard                                                                                                                               |
| -------------------- | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `fastify`            | 5.8.5   | HTTP server [VERIFIED: apps/edge/package.json:48]        | Phase 1 ADR-0006. MIP/MOP routes are plain Fastify plugins.                                                                                |
| `@fastify/cors`      | 11.2.0  | CORS allow-list [VERIFIED: apps/edge/package.json:41]    | Phase 1 baseline. MeOS will hit `/mip` and `/mop` from a different LAN host — see §Common Pitfalls #1.                                     |
| `better-sqlite3`     | 12.10.0 | Synchronous SQLite [VERIFIED]                            | Phase 1. New tables follow `db/schema.ts` Drizzle idiom.                                                                                   |
| `drizzle-orm`        | 0.45.2  | Type-safe ORM [VERIFIED]                                 | Phase 1 D-10. New tables added to `db/schema.ts`; migration generated via `drizzle-kit generate`.                                          |
| `drizzle-kit`        | 0.31.10 | Migration generator [VERIFIED]                           | Run `pnpm db:generate` after schema.ts edits. Do NOT hand-author `0002_phase2.sql`.                                                        |
| `fast-xml-parser`    | 5.2.0   | XML parser AND builder [VERIFIED]                        | Phase 1 uses `XMLParser` for course/entry import (xml/parse.ts:38). Reuse `XMLBuilder` for MIP/MOP outbound XML — same module, no new dep. |
| `xmllint-wasm`       | 5.0.0   | WASM XSD validator [VERIFIED: apps/edge/package.json:53] | Already in Phase 1 for IOF XSD validation. Reuse for MIP/MOP round-trip tests against pinned mip.xsd v3.0 + mop.xsd v2.0.                  |
| `zod`                | 4.4.3   | Querystring/body validation [VERIFIED]                   | Phase 1 pattern (routes/clubs.ts:21-26). MIP querystring + the few accepted MOP request shapes go through Zod.                             |
| `@fastify/websocket` | 11.2.0  | WS plugin [VERIFIED]                                     | Phase 1 D-13. MOP auto-merge broadcasts a new envelope type `meos_merge` over readoutChannel(competitionId).                               |

### New — Streaming XML parser (the only real add)

| Library     | Version   | Purpose                                                                          | Why this pick                                                                                                                                                                                                                                                                                                      |
| ----------- | --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`saxes`** | **6.0.0** | SAX-style streaming XML parser [ASSUMED — needs version verification at install] | Pure TS rewrite of `sax`; better Unicode handling, stricter spec conformance, actively maintained (2024+ releases). Memory footprint stays constant regardless of input size: emits `opentag`/`closetag`/`text` events that we accumulate into per-`<Competitor>` records and flush to SQLite in batches of ~1000. |

### Alternatives Considered (streaming XML)

| Instead of | Could Use                       | Tradeoff                                                                                                                                                                                                                               |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saxes`    | `sax` (the original, 1.2.4)     | Older codebase (last meaningful release 2017); known UTF-8 edge cases in CDATA. `saxes` is a strict superset of `sax`'s API. Skip `sax` unless `saxes` install fails.                                                                  |
| `saxes`    | `fast-xml-parser` stream mode   | `fast-xml-parser` has a `parseToBuilderInChunks` mode but it's not a true SAX surface — it still materialises subtrees. At 86 MB the chunking strategy is awkward (Competitor records aren't aligned to read-buffer boundaries). Skip. |
| `saxes`    | `node-expat` (libexpat binding) | Native binding (node-gyp). Faster than pure-JS but loses the "fartola installs cleanly via `npm install -g`" property. REQ-OPS-001 deal-breaker. Skip.                                                                                  |
| `saxes`    | DOM parse via `fast-xml-parser` | At 86 MB this peaks at ~500-700 MB heap for the parsed object tree. Workable on a dev laptop, brittle on a 4 GB bench laptop. Skip for cache.ts; KEEP for MIP/MOP where payloads are small (KB to low MB).                             |

**Installation:**

```bash
pnpm --filter @fartola/edge add saxes
# Verify the version published is the one expected:
npm view saxes version
```

**Version verification protocol:** Before merging Plan 1, run `npm view saxes version` and confirm against the saxes GitHub releases page. Pin the exact version in `package.json`. If saxes is not present on the registry under that exact name in May 2026, fall back to `sax@1.2.4` (well-established package).

### Package Legitimacy Audit

> slopcheck was NOT available in this research environment. All packages marked `[ASSUMED]` per the package legitimacy protocol fallback. The planner MUST add a `checkpoint:human-verify` task before `pnpm add saxes` runs to confirm the package origin (GitHub: `lddubeau/saxes`, npm: `saxes`).

| Package                     | Registry | Age                               | Downloads                                   | Source Repo                                    | slopcheck                               | Disposition                                                        |
| --------------------------- | -------- | --------------------------------- | ------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `saxes`                     | npm      | ~10 yrs (forked from sax-js 2015) | Verify with `npm view saxes` before install | github.com/lddubeau/saxes                      | unavailable                             | **`[ASSUMED]` — planner adds human-verify checkpoint**             |
| `fast-xml-parser`           | npm      | ~7 yrs                            | 11M+/wk                                     | github.com/NaturalIntelligence/fast-xml-parser | unavailable (already in repo, low risk) | Approved (Phase 1 baseline)                                        |
| `xmllint-wasm`              | npm      | ~5 yrs                            | 50k/wk                                      | github.com/jakubmazanec/xmllint-wasm           | unavailable (already in repo, low risk) | Approved (Phase 1 baseline)                                        |
| `saxes` if rejected → `sax` | npm      | ~13 yrs                           | 35M+/wk                                     | github.com/isaacs/sax-js                       | unavailable                             | Fallback if saxes unavailable; Isaac Schlueter's, well-established |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck unavailable).
**Packages flagged as suspicious [SUS]:** none flagged by manual review; planner adds `checkpoint:human-verify` for `saxes` only because it's the only net-new install in Phase 2.0.

---

## Architecture Patterns

### System Architecture Diagram

```
                                                    ┌────────────────────────────────────────┐
                                                    │  MeOS install on parallel laptop        │
                                                    │  (HTTP client for BOTH protocols)       │
                                                    │                                          │
                                                    │  • GET  http://<fartola>:3000/mip    ─┐  │
                                                    │  • POST http://<fartola>:3000/mop    │  │
                                                    └─────────────────────────────────────┼──┘
                                                                                          │
                                                                                          │ LAN
                                                                                          │
       ┌──────────────────────────────────────────────────────────────────────────────────┼───────┐
       │  apps/edge/  (single Fastify process, port 3000)                                 │       │
       │                                                                                  │       │
       │   ┌─────────────────────────┐  ┌──────────────────────┐  ┌───────────────────────▼────┐ │
       │   │ Phase 1 REST + WS       │  │ Phase 1 SI bridge    │  │ NEW: integrations/meos/    │ │
       │   │ /api/competitions/*     │  │ SerialTransport →    │  │  ├─ mip.ts  (GET /mip)     │ │
       │   │ /api/competitors/*      │  │   SiMainStation →    │  │  │   serializes <entry>   │ │
       │   │ /api/clubs/*            │  │   eventInserter →    │  │  │   from events ↓        │ │
       │   │ /api/readout/*          │  │   events table       │  │  │   (D-MIP-3)            │ │
       │   │ /api/competitions/      │  │                      │  │  └─ mop.ts  (POST /mop)    │ │
       │   │   :id/export            │  │   ↓ markDirty        │  │      parses <MOPComplete>  │ │
       │   │ /ws (readout:*,         │  │   projectionStore    │  │      or <MOPDiff>,         │ │
       │   │      results:*)         │  │                      │  │      writes meos_* tables  │ │
       │   └─────────────────────────┘  └──────────────────────┘  │      in transaction,       │ │
       │                                                          │      auto-merges into      │ │
       │   ┌──────────────────────────────────────────────────┐   │      competitors           │ │
       │   │ NEW: eventor/cache.ts (saxes streaming ingest)   │   │      (D-MOP-3)             │ │
       │   │                                                  │   └────────────────────────────┘ │
       │   │  /api/admin/eventor/refresh  (manual trigger)    │                                  │
       │   │  eventor/boot.ts → fire-and-forget on app boot   │                                  │
       │   │    (D-EV-1 + D-EV-2: only if cache > 7d old)     │                                  │
       │   │                                                  │                                  │
       │   │  fetch zip → unzip → saxes streaming parse →     │                                  │
       │   │    INSERT OR REPLACE batched (1000/batch) →      │                                  │
       │   │    eventor_competitors + eventor_clubs           │                                  │
       │   └──────────────────────────────────────────────────┘                                  │
       │                                                                                          │
       │   ┌────────────────────────────────────────────────────────────────────────────────┐    │
       │   │ better-sqlite3 (WAL, ./fartola.db) — schema EXTENSIONS                          │    │
       │   │  ┌────────────────────────────┐  ┌────────────────────────────────────────┐    │    │
       │   │  │ NEW: eventor_competitors   │  │ NEW: meos_competitors                  │    │    │
       │   │  │  PK person_id              │  │  PK id (MeOS internal id)              │    │    │
       │   │  │  idx (family,given)        │  │  NO competition_id FK (global session) │    │    │
       │   │  │  partial idx (si_card)     │  │  last_mop_update_ms                    │    │    │
       │   │  ├────────────────────────────┤  ├────────────────────────────────────────┤    │    │
       │   │  │ NEW: eventor_clubs         │  │ NEW: meos_classes, meos_clubs          │    │    │
       │   │  │  PK club_id                │  │  PK id, last_mop_update_ms             │    │    │
       │   │  ├────────────────────────────┤  ├────────────────────────────────────────┤    │    │
       │   │  │ NEW: hired_cards           │  │ EXTENDED: competitors                  │    │    │
       │   │  │  PK (comp_id, card_num)    │  │  + source TEXT NOT NULL DEFAULT        │    │    │
       │   │  │  contact_* (PII; scrub)    │  │    'walkup' (enum: walkup/entrylist/   │    │    │
       │   │  │  returned_at_ms NULL=open  │  │     meos)                              │    │    │
       │   │  └────────────────────────────┘  └────────────────────────────────────────┘    │    │
       │   └────────────────────────────────────────────────────────────────────────────────┘    │
       └──────────────────────────────────────────────────────────────────────────────────────────┘
                                  ▲                                 ▲
                                  │ /dev/ttyUSB0                    │ HTTPS
                                  │                                 │
                          ┌───────┴──────┐                ┌─────────┴──────────────────┐
                          │  BSM7/8 SI   │                │ Eventor REST               │
                          │  reader      │                │ /api/export/cached...      │
                          └──────────────┘                │ + /api/export/clubs        │
                                                          └────────────────────────────┘
```

### Recommended Project Structure (additions to Phase 1)

```
apps/edge/src/
├── eventor/                          # NEW — Plan 1
│   ├── cache.ts                      # streaming download + ingest
│   ├── boot.ts                       # on-boot scheduler (D-EV-1)
│   ├── lookup.ts                     # si_card + name-prefix queries
│   └── parser.ts                     # saxes wrapper (per-Competitor emit)
│
├── integrations/                     # NEW — Plans 3 + 4
│   └── meos/
│       ├── mip.ts                    # GET /mip Fastify plugin
│       ├── mop.ts                    # POST /mop Fastify plugin
│       ├── mipSerializer.ts          # XMLBuilder-based emitter
│       ├── mopParser.ts              # fast-xml-parser-based ingest
│       └── shared.ts                 # namespace constants, types
│
├── routes/                           # existing
│   ├── eventor.ts                    # NEW — GET /api/eventor/lookup
│   ├── hiredCards.ts                 # NEW — PATCH /api/hired-cards/:card/return
│   └── admin.ts                      # extend — POST /api/__admin/eventor/refresh
│
├── db/
│   └── schema.ts                     # extend — 6 new tables + source column
│
├── privacy/
│   └── retention.ts                  # extend — scrub hired_cards.contact_*
│
└── bin/
    └── fartola.ts                     # extend — wire eventor/boot.ts in main()

apps/edge/drizzle/
└── 0002_phase2.sql                   # NEW — drizzle-kit generate output

apps/web/src/lib/
├── components/
│   ├── EventorAutocomplete.svelte    # NEW — Plan 2
│   └── HyrbrickaToast.svelte         # NEW — Plan 5
│
└── screens/
    ├── WalkupModal.svelte            # extend — Plan 2 (Bana label, Hyrbricka)
    ├── ReadoutView.svelte            # extend — Plan 5 (toast + Returnerad)
    └── ActiveHyrbrickorView.svelte   # NEW — Plan 5 admin backstop (D-HB-2)

docs/ops/
└── parallel-meos-runbook.md          # NEW — Plan 6

.planning/adr/
└── 0009-eventor-runner-cache.md      # NEW — Plan 1 task 0
```

### Pattern 1: saxes streaming parse — per-Competitor record emit

**What:** Walk the 86 MB `competitors.xml` once with a SAX parser; accumulate field text inside the current open element; on `closetag` for `</Competitor>`, flush one normalized record to a downstream consumer; never hold more than O(1) parsed XML in memory.

**When to use:** `eventor/cache.ts` — the ONLY place in Phase 2.0 where streaming is needed. MIP/MOP payloads are small (KB to low MB) and use DOM-based `fast-xml-parser`.

**Example:**

```typescript
// Authored for fartola. Source: saxes README + the live cachedcompetitors.xml shape verified by
// the parallel agent at .planning/research/eventor-api-smoke.md.
//
// One open record (state machine) at a time. Memory stays O(1) regardless
// of the 86 MB input.

import { SaxesParser } from 'saxes';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export interface EventorCompetitor {
  person_id: number;
  family_name: string;
  given_name: string;
  birth_year: number | null;
  sex: 'M' | 'F' | null;
  club_id: number | null;
  si_card: number | null;
  emit_card: number | null;
  modify_date_ms: number;
}

export async function streamCompetitorsXml(
  path: string,
  onRecord: (rec: EventorCompetitor) => void
): Promise<void> {
  // SECURITY (PATTERNS S-7 T-FILE-IMPORT, copied semantics):
  // - saxes does NOT expand entities by default (no DOCTYPE/ENTITY support
  //   in the spec it implements) — matches xml/parse.ts processEntities:false.
  // - We additionally check the first ~512 bytes for DOCTYPE / ENTITY and
  //   bail before constructing the parser. Belt + suspenders. The Eventor
  //   endpoint is trusted, but the "bytes on disk" threat surface is the
  //   same as Phase 1's Purple Pen import.
  const head = await readHead(path, 512);
  if (/<!DOCTYPE/i.test(head)) throw new Error('DOCTYPE not allowed');
  if (/<!ENTITY/i.test(head)) throw new Error('ENTITY declarations not allowed');

  const parser = new SaxesParser({ xmlns: false });

  let current: Partial<EventorCompetitor> | null = null;
  let pathStack: string[] = [];
  let textBuf = '';
  let activePunchingSystem: string | null = null;

  parser.on('opentag', (tag) => {
    pathStack.push(tag.name);
    if (tag.name === 'Competitor') {
      current = {
        person_id: 0,
        family_name: '',
        given_name: '',
        birth_year: null,
        sex: null,
        club_id: null,
        si_card: null,
        emit_card: null,
        modify_date_ms: 0,
      };
      // <Competitor modifyTime="2024-12-12T09:46:45Z">
      const mt = tag.attributes['modifyTime'];
      if (typeof mt === 'string' && current) {
        current.modify_date_ms = Date.parse(mt) || 0;
      }
    }
    if (tag.name === 'Person' && current) {
      const sex = tag.attributes['sex'];
      if (sex === 'M' || sex === 'F') current.sex = sex;
    }
    if (tag.name === 'ControlCard') {
      const ps = tag.attributes['punchingSystem'];
      activePunchingSystem = typeof ps === 'string' ? ps : null;
    }
    textBuf = '';
  });

  parser.on('text', (text) => {
    textBuf += text;
  });

  parser.on('closetag', (tag) => {
    const here = pathStack.join('/');
    if (current) {
      // Path-aware field assignment — guard against e.g. nested <Id> elements
      // (Person has <Id type="Sweden">, Organisation has its own).
      if (here.endsWith('Competitor/Person/Id')) {
        current.person_id = Number(textBuf.trim()) || 0;
      } else if (here.endsWith('Person/Name/Family')) {
        current.family_name = textBuf.trim();
      } else if (here.endsWith('Person/Name/Given')) {
        current.given_name = textBuf.trim();
      } else if (here.endsWith('Person/BirthDate')) {
        const m = textBuf.trim().match(/^(\d{4})/);
        current.birth_year = m ? Number(m[1]) : null;
      } else if (here.endsWith('Competitor/Organisation/Id')) {
        current.club_id = Number(textBuf.trim()) || null;
      } else if (here.endsWith('Competitor/ControlCard')) {
        const n = Number(textBuf.trim());
        if (Number.isFinite(n)) {
          if (activePunchingSystem === 'SI') current.si_card = n;
          else if (activePunchingSystem === 'Emit') current.emit_card = n;
        }
        activePunchingSystem = null;
      }
    }
    if (tag.name === 'Competitor' && current && current.person_id > 0) {
      onRecord(current as EventorCompetitor);
    }
    if (tag.name === 'Competitor') current = null;
    pathStack.pop();
  });

  parser.on('error', (err) => {
    throw err;
  });

  await pipeline(createReadStream(path, { encoding: 'utf8' }), async function* (source) {
    for await (const chunk of source) {
      parser.write(chunk);
      yield;
    }
    parser.close();
  });
}
```

**Why path-aware element matching:** The Eventor schema has multiple `<Id>` elements at different paths (Person/Id is the person id; Organisation/Id is the club id). A naive "switch on tag name" assigns the wrong value. `pathStack.join('/')` + `endsWith()` keeps the match cheap without a full XPath engine.

### Pattern 2: Batched INSERT inside `sqlite.transaction()` (252 919 rows)

**What:** Accumulate up to 1000 records in memory, flush as a single Drizzle batch insert inside ONE outer transaction, repeat. SQLite's prepared-statement cache stays warm; transaction commit cost amortises across the batch.

**When to use:** `eventor/cache.ts` — bulk-loading the Eventor competitor + club tables.

**Why batching matters:** Without batching at 252k rows, you get ~252k separate prepared-statement compiles + 252k single-row commits. With batching at 1000/flush, you get 253 prepares + 253 commits. Empirically (better-sqlite3 docs) the difference is 30-60x for bulk loads. **The whole download+ingest must fit inside one outer `sqlite.transaction()` so a partial-parse failure rolls back to the prior snapshot** — D-MOP-2's TRUNCATE+INSERT pattern applies here too (this is a full snapshot replace).

**Example:**

```typescript
import { sql } from 'drizzle-orm';
import { eventorCompetitors, eventorClubs, config } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import { streamCompetitorsXml, type EventorCompetitor } from './parser.ts';

const BATCH_SIZE = 1000;

export async function ingestEventorCache(
  handle: DbHandle,
  competitorsXmlPath: string,
  clubsXmlPath: string,
  nowMs: number
): Promise<{ competitors: number; clubs: number }> {
  let totalCompetitors = 0;
  let totalClubs = 0;
  let batch: EventorCompetitor[] = [];

  // The whole snapshot replace runs inside one transaction so a parse
  // failure mid-stream rolls back to the prior (working) cache.
  // better-sqlite3 transactions are synchronous; we collect inside the
  // async parser and FLUSH inside the synchronous transaction wrapper at
  // the end.
  //
  // Alternative: stream-into-transaction by opening transaction at start,
  // calling stmt.run() inside the SAX onRecord callback, commit at end.
  // We pick the buffer-then-flush variant for simpler error handling.
  const allRecords: EventorCompetitor[] = [];
  await streamCompetitorsXml(competitorsXmlPath, (rec) => {
    allRecords.push(rec);
  });

  // Parse clubs (1.3 MB — DOM parse is fine here, NOT streaming).
  const clubsParsed = parseClubsXmlSync(clubsXmlPath);

  handle.sqlite.transaction(() => {
    // Wipe prior snapshot.
    handle.db.run(sql`DELETE FROM eventor_competitors`);
    handle.db.run(sql`DELETE FROM eventor_clubs`);

    // Clubs first (FK target for competitors.club_id).
    for (const c of clubsParsed) {
      handle.db.insert(eventorClubs).values(c).run();
      totalClubs++;
    }

    // Competitors in batches. Drizzle's .insert().values([array]).run() is
    // a single SQL statement with N value tuples — VERY fast in SQLite.
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const chunk = allRecords.slice(i, i + BATCH_SIZE);
      handle.db.insert(eventorCompetitors).values(chunk).run();
      totalCompetitors += chunk.length;
    }

    // Audit marker — boot.ts reads this to decide if cache is >7d old.
    handle.db
      .insert(config)
      .values({ key: 'eventor_cache_refreshed_at_ms', value: String(nowMs) })
      .onConflictDoUpdate({ target: config.key, set: { value: String(nowMs) } })
      .run();
  })();

  return { competitors: totalCompetitors, clubs: totalClubs };
}
```

**Memory consideration:** `allRecords.push(rec)` for 252 919 records at ~100 bytes/record JS-object cost peaks at ~25-50 MB heap. That's the right ceiling — well under what a bench laptop has. If memory ever becomes a concern, switch to the "stream-into-transaction" variant (open the transaction at start of the SAX stream, flush per record). For Phase 2.0 the simpler buffer-then-flush wins.

### Pattern 3: MIP GET /mip Fastify route (read-only XML emitter)

**What:** Accept HTTP headers `competition`, `lastid`, `pwd` (per MIP spec; also accept identically-named query params for robustness); query `events WHERE local_seq > lastid AND event_type = 'card_bound'` in the active competition; serialize each row as one `<entry>`; respond with `<MIPData lastid="N" xmlns="http://www.melin.nu/mip">...</MIPData>`. Empty response = `<MIPData lastid="N" xmlns="..."/>`.

**Wire format reference:** `mip.xsd` (extracted to `/tmp/meos-research/mip/mip.xsd`) is the binding spec. MeOS source verified at `/home/jonas/src/meos/code/onlineinput.cpp:985-1100`.

**Example:**

```typescript
// Authored for fartola. Source: mip.xsd v3.0 + onlineinput.cpp:985-1100 +
// MIP PDF spec "Setting up the Web Server" section.
//
// MIP wire conventions (verified):
//  - competition + lastid + pwd are HTTP HEADERS (input.php:44-47).
//  - Some MIP clients send them as query params too — accept both.
//  - Response Content-Type: application/xml; charset=utf-8.
//  - Empty poll: <MIPData lastid="N" xmlns="..."/>. ALWAYS include xmlns.
//  - lastid in the response is the highest local_seq we returned (or the
//    input lastid if nothing new).
//
// D-MIP-1: pwd is silently IGNORED for 4-klubbs.
// D-MIP-2: lastid = events.local_seq.
// D-MIP-3: only <entry> on bind + on card-replace (no <p>/<card> punches).
// D-MIP-4: <classname> string + <extId> fartOLa UUID (locked).

import type { FastifyInstance } from 'fastify';
import { XMLBuilder } from 'fast-xml-parser';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';

import { events, competitors, classes, competitions, config } from '../../db/schema.ts';

const MIP_NS = 'http://www.melin.nu/mip';

const MipQuery = z.object({
  competition: z.coerce.number().int().nonnegative().optional(),
  lastid: z.coerce.number().int().nonnegative().optional(),
  pwd: z.string().optional(),
});

interface MipEntryRow {
  '@_id'?: number; // optional MIP id (we emit local_seq for uniqueness)
  '@_extId'?: string; // fartOLa competitor UUID (D-MIP-4)
  '@_classname'?: string; // class name string (D-MIP-4)
  name: string; // <name>LastName, FirstName</name>
  club?: string;
  card?: { '#text': number; '@_hired'?: boolean };
}

export default async function registerMipRoute(app: FastifyInstance): Promise<void> {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: true,
    suppressEmptyNode: true,
  });

  app.get('/mip', async (req, reply) => {
    // (1) Read both query and header sources; query wins if both present
    // (test harnesses prefer query; real MeOS sends headers).
    const q = MipQuery.safeParse(req.query);
    const headers = req.headers;
    const competition =
      (q.success ? q.data.competition : undefined) ??
      coerceInt(headers['competition']) ??
      coerceInt(headers['x-competition']);
    const lastid = (q.success ? q.data.lastid : undefined) ?? coerceInt(headers['lastid']) ?? 0;
    // pwd silently ignored (D-MIP-1).

    // (2) Resolve active competition. CONTEXT D-MIP-2 says reuse local_seq;
    // local_seq is per-node, so we need the bridge's competition_id binding
    // to be set. In 4-klubbs the operator picks one competition at boot;
    // if no competition is active, return empty <MIPData lastid="0"/>.
    const activeRow = app.fartolaDb.db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.key, 'active_competition_id'))
      .get();
    const activeCompetitionId = activeRow?.value ?? null;

    if (activeCompetitionId === null) {
      return sendEmpty(reply, builder, 0);
    }
    // If MeOS specifies a `competition` header that doesn't match our
    // active competition, we still respond with the active competition's
    // data because MeOS only knows its OWN competition id (the number it
    // was configured with), not our UUID. Operators are expected to
    // align competition scope manually pre-event — playbook covers this.

    // (3) Query bind events newer than lastid.
    const rows = app.fartolaDb.db
      .select({
        localSeq: events.localSeq,
        payload: events.payload,
      })
      .from(events)
      .where(
        and(
          eq(events.competitionId, activeCompetitionId),
          gt(events.localSeq, lastid),
          eq(events.eventType, 'card_bound')
        )
      )
      .orderBy(events.localSeq)
      .all();

    if (rows.length === 0) {
      return sendEmpty(reply, builder, lastid);
    }

    // (4) Hydrate competitor + class + hired-card data for each event.
    //
    // Performance note: at 4-klubbs scale (~100 starters), N+1 SELECTs are
    // fine. For Phase 2.1 we'd batch these via IN-clause; here we keep it
    // simple. Each card_bound event uniquely identifies one competitor.
    const entries: MipEntryRow[] = [];
    let maxSeq = lastid;

    for (const row of rows) {
      if (row.localSeq > maxSeq) maxSeq = row.localSeq;

      const payload = row.payload as { event_type: string; competitor_id?: string };
      if (payload.event_type !== 'card_bound' || !payload.competitor_id) continue;

      const competitor = app.fartolaDb.db
        .select()
        .from(competitors)
        .where(eq(competitors.id, payload.competitor_id))
        .get();
      if (!competitor) continue;

      const className = competitor.classId
        ? (app.fartolaDb.db
            .select({ name: classes.name })
            .from(classes)
            .where(eq(classes.id, competitor.classId))
            .get()?.name ?? '')
        : '';

      // hired flag: check open hired_cards row for this card_number.
      let hired = false;
      if (competitor.cardNumber !== null) {
        const hc = app.fartolaDb.db
          .select({ marked: hiredCards.markedAtMs })
          .from(hiredCards)
          .where(
            and(
              eq(hiredCards.competitionId, activeCompetitionId),
              eq(hiredCards.cardNumber, competitor.cardNumber)
            )
          )
          .get();
        hired = !!hc;
      }

      const entry: MipEntryRow = {
        '@_id': row.localSeq,
        '@_extId': competitor.id, // fartOLa UUID — D-MIP-4
        '@_classname': className,
        name: competitor.name,
      };
      if (competitor.club) entry.club = competitor.club;
      if (competitor.cardNumber !== null) {
        // <card hired="true">12345</card> shape (mip.xsd CardInfo lines 329-346)
        const card: { '#text': number; '@_hired'?: boolean } = { '#text': competitor.cardNumber };
        if (hired) card['@_hired'] = true;
        entry.card = card;
      }
      entries.push(entry);
    }

    // (5) Serialize. fast-xml-parser's XMLBuilder respects @_xmlns when
    // present in the object tree at the root element.
    const xml = builder.build({
      MIPData: {
        '@_xmlns': MIP_NS,
        '@_lastid': maxSeq,
        entry: entries,
      },
    });

    void reply.header('Content-Type', 'application/xml; charset=utf-8');
    return reply.code(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`);
  });

  function sendEmpty(reply: any, builder: XMLBuilder, lastid: number): any {
    const xml = builder.build({
      MIPData: { '@_xmlns': MIP_NS, '@_lastid': lastid },
    });
    void reply.header('Content-Type', 'application/xml; charset=utf-8');
    return reply.code(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`);
  }

  function coerceInt(v: unknown): number | undefined {
    if (typeof v !== 'string') return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
}
```

**Per Phase 1 PATTERNS S-1 + S-7:** route file exports `registerMipRoute` and is wired in `server.ts` via `await app.register(registerMipRoute);` ALONGSIDE the existing routes — the `/mip` path is at root, NOT under `/api/*` (matches what MeOS hard-codes).

### Pattern 4: MOP POST /mop Fastify route (raw XML body, transactional shadow-table write)

**What:** Accept `POST /mop` with `Content-Type: text/xml` (raw body, NOT multipart); parse via `fast-xml-parser`; dispatch on root element (`<MOPComplete>` vs `<MOPDiff>`); write to shadow tables inside ONE transaction; respond with `<?xml version="1.0"?><MOPStatus status="OK"/>` (or `BADCMP`/`ERROR`).

**Wire format reference:** mop.xsd v2.0 (`/tmp/meos-research/mop/mop.xsd`) + MOP PDF spec. Reference server: `update.php` (~50 lines).

**Example:**

```typescript
// Authored for fartola. Source: mop.xsd + update.php + MOP PDF.
//
// MOP wire conventions (verified):
//  - Body is raw XML (Content-Type: text/xml). update.php uses
//    file_get_contents("php://input") — no multipart, no form encoding.
//  - First byte 'P' => gzipped POST (PK zip magic). update.php rejects
//    with NOZIP; we accept ungzipped only in 2.0 (zipupdate.php variant
//    deferred to 2.1 if needed).
//  - Response: <?xml version="1.0"?><MOPStatus status="OK"/>
//    Status codes: OK, BADCMP, BADPWD, NOZIP, ERROR (from MOP PDF).
//
// D-MOP-1: shadow meos_* tables.
// D-MOP-2: TRUNCATE+INSERT for MOPComplete (one transaction).
//          UPSERT + DELETE for MOPDiff.
// D-MOP-3: auto-merge MeOS-only competitors into competitors.
// D-MOP-4: always-on, no auth.

import type { FastifyInstance } from 'fastify';
import { XMLParser } from 'fast-xml-parser';
import { and, eq, sql } from 'drizzle-orm';

import { meosCompetitors, meosClasses, meosClubs, competitors, config } from '../../db/schema.ts';
import { readoutChannel } from '@fartola/shared-types';

const MOP_BODY_LIMIT = 50 * 1024 * 1024; // 50 MB (MOP exports can be large)

export default async function registerMopRoute(app: FastifyInstance): Promise<void> {
  // Raw-XML body parser. Fastify default JSON parser would refuse text/xml.
  app.addContentTypeParser(
    'text/xml',
    { parseAs: 'string', bodyLimit: MOP_BODY_LIMIT },
    (_req, body, done) => {
      done(null, body);
    }
  );
  app.addContentTypeParser(
    'application/xml',
    { parseAs: 'string', bodyLimit: MOP_BODY_LIMIT },
    (_req, body, done) => {
      done(null, body);
    }
  );

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false, // PATTERNS S-7
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    trimValues: true,
    removeNSPrefix: true, // strip mop: namespace prefix from element names
  });

  app.post('/mop', async (req, reply) => {
    const body = req.body;
    if (typeof body !== 'string' || body.length === 0) {
      return mopStatus(reply, 'ERROR');
    }
    // 'P' = gzip start byte; reject like update.php does (D-MOP-4 deferral).
    if (body.charCodeAt(0) === 80 /* 'P' */) {
      return mopStatus(reply, 'NOZIP');
    }
    // T-FILE-IMPORT: same DOCTYPE / ENTITY pre-flight as Phase 1.
    if (/<!DOCTYPE/i.test(body)) return mopStatus(reply, 'ERROR');
    if (/<!ENTITY/i.test(body)) return mopStatus(reply, 'ERROR');

    let parsed: Record<string, unknown>;
    try {
      parsed = parser.parse(body) as Record<string, unknown>;
    } catch {
      return mopStatus(reply, 'ERROR');
    }

    const rootKey = Object.keys(parsed).find((k) => !k.startsWith('?') && !k.startsWith('@_'));
    if (rootKey !== 'MOPComplete' && rootKey !== 'MOPDiff') {
      return mopStatus(reply, 'ERROR');
    }
    const root = parsed[rootKey] as Record<string, unknown>;

    const nowMs = Date.now();
    let mergedCount = 0;
    const activeRow = app.fartolaDb.db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.key, 'active_competition_id'))
      .get();
    const activeCompetitionId = activeRow?.value ?? null;

    try {
      app.fartolaDb.sqlite.transaction(() => {
        if (rootKey === 'MOPComplete') {
          // D-MOP-2: drop prior snapshot first.
          app.fartolaDb.db.run(sql`DELETE FROM meos_competitors`);
          app.fartolaDb.db.run(sql`DELETE FROM meos_classes`);
          app.fartolaDb.db.run(sql`DELETE FROM meos_clubs`);
        }

        // <cmp> repeated. Per mop.xsd, base has cls (required) and most other
        // attrs optional. card="0" means "no card"; card absent (in Diff) means
        // "unchanged" — for our shadow-table model we treat absent as null
        // because we only need the LATEST view, not history.
        const cmps = toArray(root.cmp);
        for (const cmp of cmps) {
          const id = asInt(cmp['@_id']);
          if (id === null) continue;
          if (asBool(cmp['@_delete'])) {
            app.fartolaDb.db.delete(meosCompetitors).where(eq(meosCompetitors.id, id)).run();
            continue;
          }
          const base = cmp.base as Record<string, unknown> | undefined;
          const name = asString(base?.['#text']) ?? '';
          const card = asInt(cmp['@_card']);
          const row = {
            id,
            name,
            classId: asInt(base?.['@_cls']),
            orgId: asInt(base?.['@_org']),
            statusCode: asInt(base?.['@_stat']) ?? 0,
            startTimeTenths: asInt(base?.['@_st']),
            runningTimeTenths: asInt(base?.['@_rt']),
            bib: asString(base?.['@_bib']),
            cardNumber: card === 0 ? null : card,
            lastMopUpdateMs: nowMs,
          };
          // D-MOP-2 UPSERT for both Complete and Diff. Complete already
          // ran DELETE above, so no conflicts; Diff overrides prior rows.
          app.fartolaDb.db
            .insert(meosCompetitors)
            .values(row)
            .onConflictDoUpdate({ target: meosCompetitors.id, set: row })
            .run();
        }

        const clss = toArray(root.cls);
        for (const cls of clss) {
          const id = asInt(cls['@_id']);
          if (id === null) continue;
          if (asBool(cls['@_delete'])) {
            app.fartolaDb.db.delete(meosClasses).where(eq(meosClasses.id, id)).run();
            continue;
          }
          const row = {
            id,
            name: asString(cls['#text']) ?? '',
            ord: asInt(cls['@_ord']),
            lastMopUpdateMs: nowMs,
          };
          app.fartolaDb.db
            .insert(meosClasses)
            .values(row)
            .onConflictDoUpdate({ target: meosClasses.id, set: row })
            .run();
        }

        const orgs = toArray(root.org);
        for (const org of orgs) {
          const id = asInt(org['@_id']);
          if (id === null) continue;
          if (asBool(org['@_delete'])) {
            app.fartolaDb.db.delete(meosClubs).where(eq(meosClubs.id, id)).run();
            continue;
          }
          const row = {
            id,
            name: asString(org['#text']) ?? '',
            nat: asString(org['@_nat']),
            lastMopUpdateMs: nowMs,
          };
          app.fartolaDb.db
            .insert(meosClubs)
            .values(row)
            .onConflictDoUpdate({ target: meosClubs.id, set: row })
            .run();
        }

        // D-MOP-3 auto-merge: insert any meos competitor whose card_number
        // doesn't yet exist in the active competition's competitors. Only
        // runs when there's an active competition (otherwise the FK fails).
        if (activeCompetitionId !== null) {
          // The raw SQL is cleaner than a Drizzle query-builder version
          // for an INSERT...SELECT...WHERE NOT EXISTS shape.
          const result = app.fartolaDb.db.run(sql`
            INSERT INTO competitors (
              id, competition_id, name, club, class_id, card_number,
              consent_at_ms, consent_status, source
            )
            SELECT
              lower(hex(randomblob(16))),
              ${activeCompetitionId},
              mc.name,
              (SELECT name FROM meos_clubs WHERE id = mc.org_id),
              -- Map MeOS class_id to our class. For 4-klubbs the operator
              -- pre-creates the five courses (Vit/Grön/Gul/Orange/Violett)
              -- in BOTH systems. We map by NAME using the meos_classes row.
              (SELECT c.id FROM classes c
                JOIN meos_classes mcl ON mcl.id = mc.class_id
                WHERE c.competition_id = ${activeCompetitionId}
                  AND c.name = mcl.name
                LIMIT 1),
              mc.card_number,
              NULL,
              'pending_first_read',
              'meos'
            FROM meos_competitors mc
            WHERE mc.card_number IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM competitors c2
                WHERE c2.competition_id = ${activeCompetitionId}
                  AND c2.card_number = mc.card_number
              )
              -- Class must resolve in our system. If MeOS sent a runner
              -- in a class we don't have, skip — operator handles manually.
              AND EXISTS (
                SELECT 1 FROM classes c
                JOIN meos_classes mcl ON mcl.id = mc.class_id
                WHERE c.competition_id = ${activeCompetitionId}
                  AND c.name = mcl.name
              )
          `);
          mergedCount = result.changes ?? 0;
        }
      })();
    } catch (err) {
      app.log.error({ err }, 'MOP ingest failed');
      return mopStatus(reply, 'ERROR');
    }

    // PATTERNS S-4 — broadcast AFTER commit so subscribers only see committed
    // state. If we merged anyone, emit a meos_merge envelope; readout view
    // surfaces the toast "N löpare hämtade från MeOS".
    if (mergedCount > 0 && activeCompetitionId !== null) {
      app.wsBroadcast(readoutChannel(activeCompetitionId), {
        type: 'meos_merge',
        payload: { count: mergedCount },
      });
      app.projectionStore.markDirty(activeCompetitionId);
    }

    return mopStatus(reply, 'OK');
  });

  function mopStatus(reply: any, status: 'OK' | 'BADCMP' | 'BADPWD' | 'NOZIP' | 'ERROR'): any {
    void reply.header('Content-Type', 'application/xml; charset=utf-8');
    return reply.code(200).send(`<?xml version="1.0"?><MOPStatus status="${status}"/>`);
  }
}

// Helpers — these duplicate xml/parse.ts's normalizers. Consider exporting
// them from xml/parse.ts for reuse in Phase 2.1.

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function asInt(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return Math.trunc(x);
  if (typeof x === 'string' && x.trim().length > 0) {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(x: unknown): string | null {
  if (typeof x === 'string') return x.trim() || null;
  if (typeof x === 'number') return String(x);
  return null;
}

function asBool(x: unknown): boolean {
  return x === true || x === 'true' || x === 1 || x === '1';
}
```

### Pattern 5: WalkupModal Hyrbricka extension — checkbox + expandable contact fieldset

**What:** Add a `hiredCard` boolean `$state`, conditionally show contact-info inputs, validate at least one of phone/email when hired, send `hired_card: boolean + hired_contact: {...}` in the `createCompetitor()` payload.

**When to use:** `apps/web/src/lib/screens/WalkupModal.svelte` Plan 2 extension.

**Pattern (extending existing file at lines 53-152):**

```svelte
<!-- existing $state + props -->
<script lang="ts">
  let { cardNumber, competitionId, classes, cardHolderHint = null,
        eventorHint = null }: Props = $props();    // NEW: eventorHint from /api/eventor/lookup

  // existing form state (name, club, classId, cardNumberLocal, consent)

  // NEW: Hyrbricka state.
  let hiredCard = $state(false);
  let contactName = $state('');
  let contactPhone = $state('');
  let contactEmail = $state('');
  let note = $state('');

  // NEW: validate() extension.
  function validate(): string | null {
    // ... existing checks ...
    if (hiredCard) {
      const hasPhone = contactPhone.trim().length > 0;
      const hasEmail = contactEmail.trim().length > 0;
      if (!hasPhone && !hasEmail) {
        return t('walk.err.hyrbrickaContact');  // D-HB-3
      }
    }
    return null;
  }

  async function onSave(): Promise<void> {
    // ... existing validation ...
    await createCompetitor({
      competition_id: competitionId,
      name: name.trim(),
      club: club.trim() || null,
      class_id: classId,
      card_number: cardNumberLocal as number,
      consent: true,
      consent_status: 'explicit',
      // NEW: pass hired_card + hired_contact for the edge to write the
      // hired_cards row in the same transaction as the competitor row.
      hired_card: hiredCard,
      hired_contact: hiredCard
        ? {
            name: contactName.trim() || null,
            phone: contactPhone.trim() || null,
            email: contactEmail.trim() || null,
            note: note.trim() || null,
          }
        : null,
    });
    // ... existing close() / error handling ...
  }
</script>

<!-- ... existing <Field>s ... -->

<!-- Relabel: "Klass" → "Bana" per locked decision #1. -->
<Field label={t('walk.bana')} htmlFor="walkup-class">
  <Select id="walkup-class" data-testid="walkup-class" bind:value={classId} required>
    <option value="" disabled>{t('walk.banaPlaceholder')}</option>
    {#each classes as cls (cls.id)}
      <option value={cls.id}>{cls.name}</option>
    {/each}
  </Select>
</Field>

<!-- NEW: Hyrbricka checkbox (D-HB-3). -->
<label class="consent-row">
  <input type="checkbox" data-testid="walkup-hired" bind:checked={hiredCard} />
  <span>{t('walk.hyrbricka')}</span>
</label>

{#if hiredCard}
  <fieldset class="contact-grid" data-testid="walkup-hired-contact">
    <Field label={t('walk.hyrbricka.name')} htmlFor="walkup-contact-name">
      <Input id="walkup-contact-name" bind:value={contactName} />
    </Field>
    <Field label={t('walk.hyrbricka.phone')} htmlFor="walkup-contact-phone">
      <Input id="walkup-contact-phone" type="tel" bind:value={contactPhone} />
    </Field>
    <Field label={t('walk.hyrbricka.email')} htmlFor="walkup-contact-email">
      <Input id="walkup-contact-email" type="email" bind:value={contactEmail} />
    </Field>
    <Field label={t('walk.hyrbricka.note')} htmlFor="walkup-contact-note">
      <Input id="walkup-contact-note" bind:value={note} />
    </Field>
  </fieldset>
{/if}

<!-- ... existing footer (Avbryt / Spara) ... -->
```

### Pattern 6: ReadoutView Hyrbricka toast (extends C-M4 consent toast pattern)

**What:** Add `pendingHyrbrickaToast` and `returnedHiredCardNumbers` state; in `triggerCardReadSideEffects()`, query the new `/readout` response field `hired_card_open: boolean` for the freshly-read card; surface a `<HyrbrickaToast />` with contact info + a "Returnerad" button; click → `PATCH /api/competitions/:id/hired-cards/:cardNumber/return` → set returned_at_ms.

**When to use:** `apps/web/src/lib/screens/ReadoutView.svelte` Plan 5.

**Note on readout response shape:** instead of a separate endpoint per card_read (latency), extend the existing `GET /readout` response: add `hired_card_open: { contact_name, contact_phone, contact_email, note } | null` to each history row that has an open `hired_cards` entry. The view reads it directly from the existing fetch.

### Anti-Patterns to Avoid

- **Don't auth the MIP/MOP endpoints in 2.0** — D-MIP-1 + D-MOP-4 explicitly chose no auth. Adding pwd headers without coordination breaks the playbook.
- **Don't broadcast `meos_merge` BEFORE the transaction commits** — PATTERNS S-4. Browsers reading the WS envelope and then re-fetching competitors will see stale data.
- **Don't try to validate MOP XML against the XSD at runtime** — xmllint-wasm is ~5MB and adds latency. Reserve it for the test suite (XSD-conformance round-trip).
- **Don't put MIP/MOP under `/api/`** — MeOS hard-codes its poll URL with no prefix. Use `/mip` and `/mop` at root.
- **Don't reuse the multipart parser for `/mop`** — MOP bodies are raw `text/xml`, not file uploads. Use `addContentTypeParser('text/xml', ...)`.
- **Don't write MOP-derived data into the immutable `events` table** — MOP is mutable mirror state; D-MOP-1 shadow tables are deliberately separate from the append-only domain.
- **Don't materialise the entire Eventor competitors.xml as a DOM** — at 86 MB you'll OOM on a 4 GB bench laptop. Use saxes streaming.
- **Don't update competitors.cardNumber without re-emitting the MIP `<entry>`** — D-MIP-3. The MeOS side's view of the runner-to-card mapping drifts otherwise.

---

## Don't Hand-Roll

| Problem                                | Don't Build                        | Use Instead                                                                                 | Why                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Streaming XML parse for 86 MB Eventor  | Regex hacking, line-by-line scan   | `saxes` SAX parser                                                                          | Real XML has nested elements + CDATA + UTF-8 BOM + attribute encoding. SAX is the only way that survives those.                                                          |
| MIP/MOP XML serialization              | Template strings + manual escaping | `fast-xml-parser` XMLBuilder (already in repo)                                              | Handles attribute encoding (&, <, >, ", ') + namespace declaration at root.                                                                                              |
| HTTP POST body parsing for `/mop`      | Reading raw stream                 | Fastify `addContentTypeParser('text/xml', { parseAs: 'string' })`                           | Built-in; handles bodyLimit + encoding negotiation.                                                                                                                      |
| Transaction rollback for partial-parse | try/catch + manual revert          | `sqlite.transaction(() => doStuff())()` (Phase 1 PATTERNS S-2)                              | better-sqlite3's transaction wrapper throws → rollback automatically.                                                                                                    |
| Eventor cache staleness check          | mtime comparison                   | Read `config.value` for `key='eventor_cache_refreshed_at_ms'`, compare to `Date.now() - 7d` | Matches the Phase 1 config singleton pattern (node_id, active_competition_id).                                                                                           |
| WS broadcast after commit              | Manual subscriber loop             | `app.wsBroadcast(channel, envelope)` (Phase 1 D-13 + ws/index.ts)                           | Channel-scoped fan-out + dead-connection cleanup already implemented.                                                                                                    |
| Drizzle migration generation           | Hand-author `0002_phase2.sql`      | `pnpm db:generate` after schema.ts edits                                                    | drizzle-kit derives from schema diff; hand-authoring drifts. The hand-authored `0001_append_only_triggers.sql` is the SOLE exception (drizzle has no trigger primitive). |
| MOP response status XML                | Template string                    | Hand-roll a tiny `mopStatus()` helper                                                       | Genuinely simpler than XMLBuilder for `<MOPStatus status="OK"/>` — 4 status codes, fixed shape, no namespace.                                                            |

**Key insight:** The Phase 1 codebase already ships every primitive Phase 2.0 needs except a streaming XML parser. The `fast-xml-parser` import in `apps/edge/package.json` covers both the existing `XMLParser` (for parse) and the new `XMLBuilder` (for emit) — zero new build/test config.

---

## Runtime State Inventory

Phase 2.0 is **greenfield** for all new tables (eventor*\*, meos*\*, hired_cards) and a column-add (competitors.source). No rename, no migration of existing rows. The minimal runtime state surface is:

| Category            | Items Found                                                                                                                                                                                | Action Required                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | None — Phase 2.0 creates new SQLite tables only; existing competitors / events / config rows preserved as-is                                                                               | Drizzle migration 0002_phase2.sql will ALTER competitors to add `source` with `DEFAULT 'walkup'` so existing rows backfill correctly. |
| Live service config | None initially — MeOS install on the parallel laptop is configured by the operator pre-event via MeOS's protocol-config UI (URL pointing at fartOLa's `/mip` + `/mop`). Playbook owns this. | None at code level; playbook (Plan 6) walks the operator through.                                                                     |
| OS-registered state | None — Phase 2 doesn't add new systemd / udev rules (Phase 1 Plan 18 covers what exists; Phase 2 binary changes are internal)                                                              | None                                                                                                                                  |
| Secrets / env vars  | `EVENTOR_API_KEY` loaded from `.eventor-env` (D-EV-1 trigger). File is `.gitignore`d (commit 7ec8866). If missing → eventor cache disabled, UI shows "Eventor: nyckel saknas" indicator    | Plan 1 task 0 documents the operator handoff for paste-into-`.env` or commit-to-machine-only.                                         |
| Build artifacts     | `apps/edge/dist/web/` rebuild required when WalkupModal changes (Plan 2) — same as Phase 1 binary packaging via `pack:tarball`                                                             | Plan 6 closeout task: `pnpm --filter @fartola/edge pack:tarball` after Plans 2+5 land.                                                 |

**Nothing found in a category:** explicitly stated above. The single non-trivial item is the EVENTOR_API_KEY env var.

---

## Common Pitfalls

### Pitfall 1: CORS rejects MeOS HTTP requests

**What goes wrong:** Phase 1's CORS allow-list (`server.ts:159-161`) only permits `localhost` + `127.0.0.1` origins. MeOS sends requests from its own LAN IP — CORS preflight (or origin check) fails.
**Why it happens:** MIP is a GET with no custom headers → no preflight, no Origin check, MeOS works. MOP is a POST with `Content-Type: text/xml` → Fastify's CORS plugin may still check Origin even though it's not a CORS-bound request (browser-side).
**How to avoid:** MeOS is a desktop HTTP client (not a browser); it does NOT send `Origin` headers. CORS check is skipped when `Origin` is absent in `@fastify/cors`. Verify with a `curl -X POST -H "Content-Type: text/xml" -d "<MOPDiff/>" http://localhost:3000/mop` smoke test from another host on the LAN before the event. If a CORS rejection appears, widen the allow-list with `app.register(cors, { origin: true })` on a per-route plugin scope just for `/mip` and `/mop`, OR exempt these paths via `routePolicies`.
**Warning signs:** `/mop` returns 200 from curl but MeOS reports "BADCMP" or shows no data flowing in either direction.

### Pitfall 2: MIP `lastid` semantics — events.local_seq is global, MIP expects per-competition

**What goes wrong:** D-MIP-2 says reuse `events.local_seq`. But local_seq increments across all events (including connection_changed, frame_error from the idle bridge BEFORE a competition is active), so `lastid > N` may include rows from competitions other than the active one.
**Why it happens:** local_seq is `(node_id, local_seq)` PK with NO competition_id constraint on monotonicity.
**How to avoid:** The MIP query in Pattern 3 ALWAYS filters by `competition_id = activeCompetitionId`. The lastid still works as a "newer than" cursor; missed local_seqs for OTHER competitions just don't match the WHERE. MeOS sees a strictly monotonic lastid response — that's what matters.
**Warning signs:** Operator switches active competition mid-event (rare); MeOS's lastid pointer might skip ahead by hundreds, but reseen entries would be no-op-updated via `extId`.

### Pitfall 3: MeOS `<classname>` lookup is case-sensitive

**What goes wrong:** D-MIP-4 says we send `<classname>Vit</classname>`. MeOS's `oe.getClass(clsName)` (onlineinput.cpp:996) does an exact match. If the operator created "vit" lowercase in MeOS, the lookup returns nullptr and MeOS rejects the entry with "Okänd klass" (onlineinput.cpp:999).
**Why it happens:** No case-folding on either side of the protocol.
**How to avoid:** Playbook (Plan 6) pre-flight checklist: confirm that the five 4-klubbs classes (Vit/Grön/Gul/Orange/Violett) in MeOS are spelled identically to fartOLa's. Recommend the operator copy-paste the names rather than retype. Add `<entry>` failure logging to `mip.ts` if MeOS's `entrystatus` response surfaces back (Phase 2.1).
**Warning signs:** MeOS log shows "Okänd klass: <name>" or `<EntryStatus status="ERROR">` responses. fartOLa has no view of these — they only surface in MeOS.

### Pitfall 4: TRUNCATE+INSERT inside transaction loses prior snapshot if parse fails midway

**What goes wrong:** D-MOP-2 says TRUNCATE+INSERT for `<MOPComplete>`. If MeOS sends a malformed `<cmp>` halfway through, the INSERT fails — transaction rolls back, the DELETE _is also rolled back_, BUT the in-memory shadow state callers might have cached (none currently; future Phase 2.1 could) is now stale until next MOPComplete.
**Why it happens:** Transaction atomicity is the WHOLE POINT here — and it's correct. The only failure-mode is partial parse leaving the system pointing at the OLD snapshot. That's good (no torn writes), but the operator may not realize MeOS sent a bad payload.
**How to avoid:** Log the failure verbosely (`app.log.error({ err, body_excerpt })`) and respond with `<MOPStatus status="ERROR"/>`. MeOS's retry behavior is undefined but observed empirically to back off and resend. Surface a `mop_failure` WS envelope to the readout view so operators see "MeOS sync failed" toast.
**Warning signs:** Multiple consecutive ERROR responses in Fastify logs; auto-merge count stays at 0 across the event.

### Pitfall 5: Eventor download blocks bridge boot

**What goes wrong:** D-EV-3 mandates "warn + run with what we have" on network failure. A naive `await downloadEventor()` in `bin/fartola.ts main()` blocks `app.listen()` for up to the HTTP timeout (~30s default).
**Why it happens:** `await` semantics. The fix is fire-and-forget (Phase 1 SI bridge does this — `void lifecycle.start();` at bin/fartola.ts:507).
**How to avoid:** `eventor/boot.ts` exports `runOnceIfStale()` returning a Promise. `bin/fartola.ts` calls it AFTER `app.listen()` resolves, with `void runOnceIfStale().catch((err) => app.log.warn({ err }, 'eventor refresh failed'))`. The walkup screen reads the cache anyway — if it's empty, the SI firmware hint fallback still works.
**Warning signs:** `fartola --port 3000` takes 30+ seconds to print "listening on 3000" when offline; operator thinks the bridge is hung.

### Pitfall 6: saxes UTF-8 streaming + cyrillic/non-Latin names

**What goes wrong:** Eventor's competitors.xml is UTF-8 (verified). saxes default emits text events as JS strings (decoded). If a multi-byte character spans two read buffer boundaries, saxes's internal buffer handles the join — BUT only if we feed UTF-8 _bytes_, not utf-8 _strings_.
**Why it happens:** `createReadStream(path, { encoding: 'utf8' })` decodes per chunk, which can produce invalid intermediate strings. Better: feed binary chunks and let saxes decode.
**How to avoid:** Use `createReadStream(path)` (no encoding) and pass `Buffer.toString('utf8')` per full chunk OR use saxes's `Buffer`-accepting mode. Test fixture for this: a name with å/ä/ö (which 252k Swedish names exercise heavily) AND a name with ё / 字 (extended Unicode) to exercise multi-byte UTF-8 sequences.
**Warning signs:** Random Swedish names show as "L?rsson" or punctuation replaced with `�` replacement chars.

### Pitfall 7: MOP empty body / malformed XML / 1-byte 'P'

**What goes wrong:** MeOS occasionally sends a heartbeat or an empty POST (observed in MeOS source code paths). Our parser throws → 500 → MeOS gives up.
**Why it happens:** XMLParser throws on empty input.
**How to avoid:** Pattern 4 explicitly returns `MOPStatus status="ERROR"` for empty bodies and 'P' (zip magic) bodies. Always 200 OK at the HTTP layer; the MOP status code is the application-level signal.
**Warning signs:** MeOS shows "Server error" toast and stops POSTing.

### Pitfall 8: Hyrbricka PK collision when card moves between competitions

**What goes wrong:** D-HB-1 says PK is `(competition_id, card_number)`. If card 12345 was rented at competition A (returned), then rented at competition B, the second INSERT works because of the compound PK. BUT if the operator forgets to set `returned_at_ms` at competition A, the query for "open hired_cards" returns both rows for card 12345 — confusing UI.
**Why it happens:** No "globally-open-rental" constraint.
**How to avoid:** The finish-readout query is always scoped to the active competition: `EXISTS (SELECT 1 FROM hired_cards WHERE competition_id = ? AND card_number = ? AND returned_at_ms IS NULL)`. Each competition's view is independent. Document the case in the playbook: end-of-event admin "Aktiva hyrbrickor" view (D-HB-2) shows opens across competitions if needed.
**Warning signs:** "Returnerad" button click works at the active comp but the admin view shows the card still open in a previous comp.

### Pitfall 9: MIP poll interval too aggressive

**What goes wrong:** MeOS polls aggressively (default: every few seconds). At 4-klubbs scale (~100 starters), each poll runs the entries query — small but not free; on a busy bench laptop simultaneously running MeOS this can stutter.
**Why it happens:** No throttling on `/mip`.
**How to avoid:** Empirically tune the MeOS poll interval to 5-10 seconds (playbook step). If `/mip` p99 latency approaches 100ms on the actual bench, add a 5-second result cache keyed by `(activeCompetitionId, lastid)` — invalidated on new card_bound event.
**Warning signs:** Fastify access log shows /mip every 2 seconds; CPU on the bench laptop > 20% with no SI traffic.

### Pitfall 10: Drizzle ON CONFLICT for compound PK requires explicit target

**What goes wrong:** `hired_cards` PK is `(competition_id, card_number)`. Drizzle's `.onConflictDoUpdate({ target: hiredCards.cardNumber, ... })` won't compile correctly for compound keys.
**Why it happens:** Drizzle's API expects a single-column target by default; compound targets need an array.
**How to avoid:** `.onConflictDoUpdate({ target: [hiredCards.competitionId, hiredCards.cardNumber], set: {...} })`. Same applies to any meos\_\* table if we ever upsert by compound key.
**Warning signs:** TypeScript error "Type 'SQLiteColumn' is not assignable to type 'SQLiteColumn[]'" or runtime SQL error "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint".

---

## Code Examples

### Empty MIP poll response (Claude's discretion → locked)

```typescript
// Empty response when no card_bound events newer than lastid exist.
// Per mip.xsd lines 33-61, all children of MIPData are minOccurs="0", so
// the self-closing form is XSD-valid. ALWAYS include xmlns so xmllint
// validation against the namespaced XSD passes.
const empty = `<?xml version="1.0" encoding="UTF-8"?>
<MIPData xmlns="http://www.melin.nu/mip" lastid="${lastid}"/>`;
```

### MIP entry with hired card

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MIPData xmlns="http://www.melin.nu/mip" lastid="42">
  <entry id="42" extId="3f8a1c2b-9d4e-4f5a-8b0c-1e2d3f4a5b6c" classname="Vit">
    <name>Hagberg, Jonas</name>
    <club>Stora Tuna OK</club>
    <card hired="true">12345</card>
  </entry>
</MIPData>
```

### MOP receiver success response

```xml
<?xml version="1.0"?>
<MOPStatus status="OK"/>
```

(No namespace, no version attribute — matches update.php output verbatim.)

### Eventor lookup endpoint

```typescript
// apps/edge/src/routes/eventor.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, like } from 'drizzle-orm';
import { eventorCompetitors, eventorClubs } from '../db/schema.ts';

const LookupQuery = z
  .object({
    si_card: z.coerce.number().int().positive().optional(),
    prefix: z.string().min(2).max(120).optional(),
  })
  .refine((q) => q.si_card !== undefined || q.prefix !== undefined, {
    message: 'either si_card or prefix is required',
  });

export default async function registerEventorLookup(app: FastifyInstance): Promise<void> {
  app.get('/api/eventor/lookup', async (req, reply) => {
    const parsed = LookupQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_query' });

    if (parsed.data.si_card !== undefined) {
      // Single-row lookup; partial unique index makes this O(log N).
      const row = app.fartolaDb.db
        .select()
        .from(eventorCompetitors)
        .where(eq(eventorCompetitors.siCard, parsed.data.si_card))
        .get();
      if (!row) return reply.code(200).send({ matches: [] });
      const club =
        row.clubId !== null
          ? (app.fartolaDb.db
              .select({ name: eventorClubs.name })
              .from(eventorClubs)
              .where(eq(eventorClubs.clubId, row.clubId))
              .get()?.name ?? null)
          : null;
      return reply.code(200).send({
        matches: [
          {
            person_id: row.personId,
            family_name: row.familyName,
            given_name: row.givenName,
            birth_year: row.birthYear,
            club: club,
            si_card: row.siCard,
          },
        ],
      });
    }

    // Prefix-match on the (family, given) compound index. Cap to 20 results.
    const prefix = parsed.data.prefix!;
    const rows = app.fartolaDb.db
      .select()
      .from(eventorCompetitors)
      .where(like(eventorCompetitors.familyName, `${prefix}%`))
      .limit(20)
      .all();
    return reply.code(200).send({
      matches: rows.map((r) => ({
        person_id: r.personId,
        family_name: r.familyName,
        given_name: r.givenName,
        birth_year: r.birthYear,
        si_card: r.siCard,
      })),
    });
  });
}
```

### Eventor on-boot scheduler (D-EV-1 + D-EV-2 + D-EV-3)

```typescript
// apps/edge/src/eventor/boot.ts
import type { DbHandle } from '../db/index.ts';
import { config } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { downloadAndIngestCache } from './cache.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface EventorHandle {
  runNow: () => Promise<{ competitors: number; clubs: number }>;
  stop: () => void;
}

export function scheduleEventorBoot(
  handle: DbHandle,
  opts: {
    apiKey: string | undefined;
    nowMs?: () => number;
    logger: { info: Function; warn: Function };
  }
): EventorHandle {
  const now = opts.nowMs ?? Date.now;

  async function runOnce(): Promise<{ competitors: number; clubs: number }> {
    if (!opts.apiKey) {
      opts.logger.warn('Eventor: nyckel saknas — skipping cache refresh');
      return { competitors: 0, clubs: 0 };
    }
    return downloadAndIngestCache(handle, opts.apiKey, now());
  }

  // D-EV-2: only fetch if no cache OR cache older than 7 days.
  const lastRow = handle.db
    .select({ value: config.value })
    .from(config)
    .where(eq(config.key, 'eventor_cache_refreshed_at_ms'))
    .get();
  const lastMs = lastRow?.value ? Number(lastRow.value) : 0;
  const ageMs = now() - lastMs;
  const stale = lastMs === 0 || ageMs > SEVEN_DAYS_MS;

  if (stale) {
    // D-EV-3: NEVER block. Fire-and-forget; log success or failure.
    void runOnce()
      .then((r) => opts.logger.info({ ...r }, 'Eventor cache refreshed'))
      .catch((err: unknown) =>
        opts.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Eventor: cache refresh failed — running with what we have'
        )
      );
  } else {
    const ageDays = Math.floor(ageMs / 86_400_000);
    opts.logger.info({ ageDays }, `Eventor: cache ${ageDays} dagar gammal — skipping refresh`);
  }

  return {
    runNow: runOnce,
    stop: () => {
      /* no-op — no timer in 2.0; admin route triggers via runNow */
    },
  };
}
```

Wired in `bin/fartola.ts main()` AFTER `app.listen()`:

```typescript
// After `await app.listen(...)`. PATTERNS S-7 — eventor handle stays on the app.
const eventorApiKey = process.env['EVENTOR_API_KEY'];
const eventor = scheduleEventorBoot(handle, {
  apiKey: eventorApiKey,
  logger: app.log,
});
app.fartolaEventor = eventor;
```

Plus the `BackupHandle`-style admin route at `/api/__admin/eventor/refresh`:

```typescript
// Extend routes/admin.ts.
app.post('/api/__admin/eventor/refresh', async (_req, reply) => {
  if (process.env['FARTOLA_DEV'] !== '1') return reply.code(404).send();
  const e = app.fartolaEventor;
  if (!e) return reply.code(200).send({ ok: false, error: 'no_eventor' });
  try {
    const r = await e.runNow();
    return reply.code(200).send({ ok: true, ...r });
  } catch (err) {
    app.log.error({ err }, 'eventor refresh failed');
    return reply.code(500).send({ ok: false, error: 'refresh_failed' });
  }
});
```

---

## Drizzle migration plan

### Schema additions to `apps/edge/src/db/schema.ts`

```typescript
// Add to schema.ts AFTER existing tables. Drizzle generates one
// 0002_phase2.sql migration covering all six new tables + the
// competitors.source column.

import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// --- eventor_competitors -----------------------------------------------------
// 252 919 rows national runner database. PK is Eventor's PersonId (numeric,
// stable across years). si_card is partial-indexed (96 918 / 252 919 rows
// have one) so the autocomplete lookup is O(log N).

export const eventorCompetitors = sqliteTable(
  'eventor_competitors',
  {
    personId: integer('person_id').primaryKey(),
    familyName: text('family_name').notNull(),
    givenName: text('given_name').notNull(),
    birthYear: integer('birth_year'),
    sex: text('sex', { enum: ['M', 'F'] }),
    clubId: integer('club_id'), // FK NOT enforced — Eventor data may reference clubs we haven't refreshed yet
    siCard: integer('si_card'),
    emitCard: integer('emit_card'),
    modifyDateMs: integer('modify_date_ms').notNull(),
  },
  (t) => [
    // Partial index for si_card lookup. ~96 918 entries.
    uniqueIndex('eventor_competitors_si_card_uniq')
      .on(t.siCard)
      .where(sql`${t.siCard} IS NOT NULL`),
    // Compound for prefix-match autocomplete on name.
    index('eventor_competitors_name').on(t.familyName, t.givenName),
  ]
);

// --- eventor_clubs -----------------------------------------------------------
// ~few thousand rows. PK is Eventor's OrganisationId.

export const eventorClubs = sqliteTable('eventor_clubs', {
  clubId: integer('club_id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  parentId: integer('parent_id'),
  modifyDateMs: integer('modify_date_ms').notNull(),
});

// --- meos_competitors --------------------------------------------------------
// Shadow table for MOP `<cmp>` ingest. NO competition_id FK — MeOS state is
// global to the bridge session, not per-fartOLa-competition (per-competition
// would require MeOS to know our competition UUIDs, which it doesn't).
// last_mop_update_ms helps debug "which MOP push wrote this row".

export const meosCompetitors = sqliteTable(
  'meos_competitors',
  {
    id: integer('id').primaryKey(), // MeOS internal numeric id
    name: text('name').notNull(),
    classId: integer('class_id'), // FK to meos_classes.id (NOT enforced)
    orgId: integer('org_id'), // FK to meos_clubs.id (NOT enforced)
    cardNumber: integer('card_number'),
    statusCode: integer('status_code').notNull().default(0), // mop.xsd: 0=Unknown
    startTimeTenths: integer('start_time_tenths'),
    runningTimeTenths: integer('running_time_tenths'),
    bib: text('bib'),
    lastMopUpdateMs: integer('last_mop_update_ms').notNull(),
  },
  (t) => [
    index('meos_competitors_card').on(t.cardNumber), // auto-merge query hits this
  ]
);

// --- meos_classes ------------------------------------------------------------

export const meosClasses = sqliteTable('meos_classes', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  ord: integer('ord'),
  lastMopUpdateMs: integer('last_mop_update_ms').notNull(),
});

// --- meos_clubs --------------------------------------------------------------

export const meosClubs = sqliteTable('meos_clubs', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  nat: text('nat'), // 3-letter nationality code
  lastMopUpdateMs: integer('last_mop_update_ms').notNull(),
});

// --- hired_cards -------------------------------------------------------------
// D-HB-1: PK (competition_id, card_number). One open rental per card per
// competition; the unique compound makes the EXISTS lookup at finish-readout
// O(log N). contact_* columns are PII — scrubbed by retention.ts after 30 days.
// returned_at_ms NULL = open rental; NOT NULL = returned (audit trail).

export const hiredCards = sqliteTable(
  'hired_cards',
  {
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    cardNumber: integer('card_number').notNull(),
    markedAtMs: integer('marked_at_ms').notNull(),
    returnedAtMs: integer('returned_at_ms'), // NULL = still rented
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.competitionId, t.cardNumber] }),
    // Open-rental fast lookup (Plan 5 finish-readout, Plan 5 admin view).
    index('hired_cards_open')
      .on(t.competitionId, t.returnedAtMs)
      .where(sql`${t.returnedAtMs} IS NULL`),
  ]
);
```

**`competitors` column add (D-MOP-3):**

```typescript
// Modify the existing competitors table block:
export const competitors = sqliteTable(
  'competitors',
  {
    // ... existing columns unchanged ...
    /** D-MOP-3 — source of competitor record. 'walkup' (Phase 1 default),
     *  'entrylist' (EntryList import), 'meos' (MOP auto-merge). Default
     *  preserves existing rows on migration. */
    source: text('source', { enum: ['walkup', 'entrylist', 'meos'] })
      .notNull()
      .default('walkup'),
  }
  // ... existing indexes unchanged ...
);
```

### Migration generation step

```bash
pnpm --filter @fartola/edge db:generate
# Inspect drizzle/0002_phase2.sql for correctness — DO NOT edit it.
# Expect: 6 CREATE TABLE statements + 4-5 CREATE INDEX + 1 ALTER TABLE competitors ADD COLUMN source.
```

### Migration safety review checklist

- [ ] `ALTER TABLE competitors ADD COLUMN source TEXT NOT NULL DEFAULT 'walkup'` — SQLite needs the DEFAULT to satisfy NOT NULL on existing rows. Drizzle emits this correctly when `.default('walkup')` is set on schema.ts.
- [ ] No new triggers (Phase 2 tables are mutable — D-09 carve-out from event sourcing).
- [ ] `meos_*` tables have NO FK to `competitions` because MeOS state is session-global.
- [ ] `hired_cards.competition_id` cascade-deletes on competition removal (matches existing competitors pattern).
- [ ] Partial unique index `eventor_competitors_si_card_uniq WHERE si_card IS NOT NULL` matches Phase 1's `competitors_card_per_comp` pattern.
- [ ] meta/\_journal.json gets the 0002 entry appended (drizzle-kit handles automatically).
- [ ] `0001_append_only_triggers.sql` is untouched — drizzle-kit only regenerates the next-numbered file.

---

## MeOS XSD wire format details (verified by direct read)

### MIP `<entry>` constraints (mip.xsd lines 175-327)

- `<name>` REQUIRED (minOccurs="1"), other children optional
- `<card>` minOccurs="0" maxOccurs="**1**" — **confirms D-MIP-3**: only one card per entry. A card-replace is one re-emit of the whole `<entry>`.
- `extId` attribute is `xsd:string` — **fartOLa UUIDs (36 chars) fit fine**. Per the PDF: "external Id (Used by IOF-XML)".
- `classname` attribute is `xsd:string` — exact case match against MeOS class name (Pitfall 3).
- `<card hired="true">12345</card>` shape — `CardInfo` is `xsd:simpleContent extension of xsd:integer` with `@hired` boolean attribute.
- `<name>` element has `EntryName` type with attributes `birthyear`, `birthdate`, `sex` (M/F NMTOKEN), `nationality` (3-letter IOC). For 4-klubbs we only need the text content (LastName, FirstName per the PDF).
- `id` attribute is `xsd:integer` — out-of-range warning in PDF says 1 ≤ id ≤ 10^9. **Use `events.local_seq`** which fits comfortably.

### MIP root element (mip.xsd lines 33-61)

- `<MIPData lastid="N" xmlns="http://www.melin.nu/mip">` — `lastid` REQUIRED `xsd:integer`. `firstid` optional. All children optional → **`<MIPData lastid="N"/>` is valid** (empty-poll shape locked).

### MOP `<cmp>` (mop.xsd lines 332-377)

- `id` attribute REQUIRED `xsd:integer`
- `card` attribute OPTIONAL `xsd:integer` — **absence = "unchanged" (in Diff); 0 = "no card"** (per PDF page 4-5)
- `competing` attribute OPTIONAL `xsd:boolean` — MeOS 3.7+ "has been seen but not finished"
- `delete` attribute OPTIONAL — for MOPDiff deletions
- **NO `hired` attribute** — D-LIM-1 verified
- `<base>` REQUIRED inside `<cmp>` — even MOPDiff updates carry the full base (BaseCompetitor type)
- `<base>` attributes: `cls` REQUIRED (class id), `org` `stat` `st` `rt` `bib` `nat` `crs` `prel` all optional
- `stat=0` Unknown (default), `1=OK`, `2=NT`, `3=MP`, `4=DNF`, `5=DQ`, `6=OT`, `15=OCC`, `20=DNS`, `21=CANCEL`, `99=NP`

### MOP empty-poll equivalent

MeOS doesn't poll for MOP — it PUSHES. There is no MOP "empty body" case from our POV; we just respond with status XML for whatever it sends.

### Namespace handling

- MIP namespace: `http://www.melin.nu/mip`
- MOP namespace: `http://www.melin.nu/mop`
- **fast-xml-parser default strips namespace prefixes when `removeNSPrefix: true` is set** — use this in `mop.ts` to handle the namespaced incoming XML cleanly. The outgoing MIP XML carries the namespace as `@_xmlns` at the root.
- Validation: xmllint-wasm respects the `xmlns` declaration when loading the XSD; our test fixtures need the namespace on the root element to pass schema validation.

---

## Eventor download lifecycle

### On-boot trigger (D-EV-1 + D-EV-2 + D-EV-3)

Wired in `apps/edge/src/bin/fartola.ts` AFTER `app.listen()` resolves, fire-and-forget pattern matching the existing SI bridge (`bin/fartola.ts:507 void lifecycle.start();`):

```typescript
// In main(), after `await app.listen(...)`:
const eventorApiKey = process.env['EVENTOR_API_KEY']; // loaded from .eventor-env
const eventor = scheduleEventorBoot(handle, {
  apiKey: eventorApiKey,
  logger: app.log,
});
app.fartolaEventor = eventor;
```

`scheduleEventorBoot()` (see code in §Code Examples) reads the `eventor_cache_refreshed_at_ms` config row, compares to `Date.now() - 7d`, and either:

- Skips (cache fresh): logs `"Eventor: cache N dagar gammal — skipping refresh"`
- Fires download (cache stale or missing): `void runOnce().then(...).catch(...)` — never throws to the caller.

### Reuse Phase 1's daily backup scheduler? NO

Phase 1 has `scheduleDailyBackup` / `scheduleDailyRetention` (`apps/edge/src/backup/daily.ts` + `privacy/retention.ts`) — both are setTimeout chains anchored on local midnight. D-EV-1 explicitly REJECTED cron because "bridge is competition-only, not always-on" — so we deliberately don't follow that pattern. The Eventor handle has `{ runNow, stop }` shape matching `BackupHandle` (for the admin route) but no internal scheduling — boot fires once, admin button is the only other trigger.

### UI signaling — recommendation: TweaksPanel indicator + log line, NOT splash overlay

The existing `apps/web/src/lib/components/TweaksPanel.svelte` is the right home for an Eventor cache status row. Splash overlay would block the readout view (bad UX during pre-event setup); a toast on success/failure is too transient (operator misses it). The pattern is:

- Add a `bridgeStatus.svelte.ts`-style store: `eventorStatus.svelte.ts` with `{ state: 'ready' | 'refreshing' | 'stale' | 'offline' | 'no_key', ageDays: number }`.
- Edge exposes `GET /api/eventor/status` returning the same shape (read from config table).
- TweaksPanel shows the row inline: green dot + "Eventor: redo (N dagar gammal)" / orange "refreshar..." / red "offline" / red "nyckel saknas".
- A `Refresh now` button in the panel POSTs `/api/__admin/eventor/refresh` (FARTOLA_DEV-gated to prevent operator from triggering during the event).

Toast wording (Claude's discretion, recommend i18n keys):

- `walk.eventor.fill` — "Hämtad från Eventor — kontrollera namn" (when eventor lookup pre-fills walkup)
- `tweaks.eventor.ready` — "Eventor: cache OK ({{days}} dagar gammal)"
- `tweaks.eventor.stale` — "Eventor: cachen är gammal — uppdatera när du har internet"
- `tweaks.eventor.offline` — "Eventor: ingen internetkontakt — fallback till SI-firmware-namn"
- `tweaks.eventor.no_key` — "Eventor: nyckel saknas (EVENTOR_API_KEY)"

---

## Reusable Phase 1 patterns to mirror exactly (per-plan)

For each plan the planner will produce, the specific source-file + line range + runtime-behavior nuance NOT in PATTERNS.md:

### Plan 1 — Eventor cache + boot

- **Template:** `apps/edge/src/ingest/entryImport.ts:59-173` (transactional bulk-upsert via `sqlite.transaction(() => doIngest(...))()`)
- **Runtime nuance:** Phase 1's distinctClubs-after-success pattern (lines 91, 127) — adapt for Eventor's "build a Set of club_ids referenced by competitors, then verify they exist in eventor_clubs" sanity check. The Eventor data IS internally consistent, but a defensive log is cheap insurance.
- **Boot wiring template:** `apps/edge/src/bin/fartola.ts:510-518` (backup + retention scheduler decoration on app)
- **Runtime nuance:** the SI bridge starts via `void lifecycle.start()` AFTER `app.listen()` (line 507) — Eventor follows the same fire-and-forget. The Eventor refresh must complete asynchronously without blocking app.listen because D-EV-3 mandates "never block boot on network."

### Plan 2 — WalkupModal + EventorAutocomplete

- **Template:** `apps/web/src/lib/components/ClubAutocomplete.svelte:30-46` (200ms-debounced fetch + datalist)
- **Runtime nuance:** ClubAutocomplete primes the list with empty-prefix on first render (line 56 `void doFetch('')`). EventorAutocomplete should NOT do this — 252k rows return is too much; only fetch on user keystroke. Add a `minLength: 2` gate.
- **Modal extension template:** `apps/web/src/lib/screens/WalkupModal.svelte:53-152`
- **Runtime nuance:** existing `cardHolderHint` precedence (line 59: pre-fill on mount) is the model for `eventorHint`. When SI card scan fires and eventor lookup returns a hit, the modal mounts with BOTH hints; `eventorHint` (richer, includes club) wins over `cardHolderHint` (firmware-only).

### Plan 3 — MIP route

- **Template:** `apps/edge/src/routes/export.ts:105-207` (REST GET returning XML with proper Content-Type)
- **Runtime nuance:** export.ts uses `void reply.header('Content-Type', 'application/xml; charset=utf-8')` AND `reply.code(200).send(xml)`. The void-cast is intentional — Fastify's reply.header() returns the reply object; we want to ignore that and return only the send() result. Same pattern in mip.ts.
- **Query-vs-header parsing nuance:** the export route uses `req.query.status` — pure querystring. MIP needs to ALSO accept headers (per spec). The fallback chain is `query || header || default`.

### Plan 4 — MOP route

- **Template:** `apps/edge/src/routes/import.ts:53-100` for body parsing structure, BUT swap multipart for `addContentTypeParser('text/xml')`
- **Runtime nuance:** import.ts uses multipart with a 5 MB cap (`fileSize: 5 * 1024 * 1024`). MOP needs 50 MB raw-body cap because MeOS exports of a 200-runner event can be ~10 MB. Bodylimit is per-route in Fastify; set via plugin options or per-route schema.
- **Transactional ingest template:** `apps/edge/src/ingest/entryImport.ts:59-156` (the `doIngest` pattern inside `sqlite.transaction(() => ...)()`)
- **Runtime nuance:** the auto-merge INSERT...SELECT...WHERE NOT EXISTS (D-MOP-3) goes INSIDE the same transaction as the MOP table writes so a single failure rolls back EVERYTHING. PATTERNS S-4 says broadcast AFTER commit — only emit `meos_merge` envelope after the `transaction()` callback returns successfully.

### Plan 5 — Hyrbricka toast on ReadoutView + admin view

- **Template:** `apps/web/src/lib/screens/ReadoutView.svelte:416-437` (pendingConsentToast pattern from C-M4)
- **Runtime nuance:** the consent toast uses `dismissedConsentForCompetitorIds: Set<string>` (line 442 referenced via `add()`) so the toast doesn't re-pop after operator dismissal. Mirror as `returnedHiredCardNumbers: Set<number>`. **CRITICAL:** the Set lives in `$state()` so Svelte 5 tracks reactivity — verify against Svelte 5 docs that Set mutations trigger updates (the `.add()` call inside reactive contexts may need `$state.snapshot()` or assigning a new Set: `returnedHiredCardNumbers = new Set([...returnedHiredCardNumbers, cardNumber])` for safety).
- **WS subscription template:** `apps/web/src/lib/screens/ReadoutView.svelte:310-320` (connectWs + preSubscribe + connect)
- **Runtime nuance:** the existing `handleWs` dispatch (line 343-355) needs ONE new case: `'meos_merge'` envelope. payload is `{ count: number }`; the handler calls `toast(t('readout.meosMerge', { count }))`. No re-fetch needed (auto-merge already updated competitors; the next card_read will refetch).
- **PATTERNS S-4 broadcast ordering:** the MOP route emits `meos_merge` AFTER `sqlite.transaction()` returns. The readout view's WS subscriber sees the envelope only when the underlying database state is already updated — so `void refetchCompetitors()` would be redundant. Keep the toast-only handling clean.

### Plan 6 — Parallel-MeOS runbook

- **Template:** no existing ops doc (first one); reference `apps/edge/README.md` for tone.
- **Runtime nuance:** the runbook MUST cover the D-LIM-1 manual workaround for hired-card import on fartOLa crash recovery. Also covers the "MeOS class names must match fartOLa Bana names exactly" pre-flight (Pitfall 3).

---

## Test strategy

### Tiny synthetic cachedcompetitors.xml fixture

Place at `apps/edge/src/eventor/__fixtures__/competitors-sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CompetitorList iofVersion="3.0" createTime="2026-05-16T20:00:00Z" creator="fartola-test"
                xmlns="http://www.orienteering.org/datastandard/3.0">
  <Competitor modifyTime="2024-12-12T09:46:45Z">
    <Person sex="M" modifyTime="2024-12-12T09:46:45Z">
      <Id type="Sweden">1001</Id>
      <Name><Family>Hagberg</Family><Given>Jonas</Given></Name>
      <BirthDate>1980-01-01</BirthDate>
      <Nationality code="SWE"/>
    </Person>
    <Organisation type="Club" modifyTime="2026-03-16T08:25:36Z">
      <Id type="Sweden">637</Id>
      <Name>Stora Tuna OK</Name>
      <ShortName>STK</ShortName>
    </Organisation>
    <ControlCard punchingSystem="SI">8535005</ControlCard>
  </Competitor>
  <Competitor modifyTime="2024-12-12T09:46:45Z">
    <!-- Orphan competitor (no Organisation) — must not crash parser -->
    <Person sex="F">
      <Id type="Sweden">1002</Id>
      <Name><Family>Larsson</Family><Given>Lena</Given></Name>
      <BirthDate>1957-01-01</BirthDate>
    </Person>
    <ControlCard punchingSystem="SI">8303057</ControlCard>
    <ControlCard punchingSystem="Emit">530947</ControlCard>
  </Competitor>
  <Competitor modifyTime="2024-12-12T09:46:45Z">
    <!-- Competitor with no SI card AND name with å/ä/ö (UTF-8 multi-byte) -->
    <Person sex="M">
      <Id type="Sweden">1003</Id>
      <Name><Family>Östberg</Family><Given>Pär</Given></Name>
      <BirthDate>1990-01-01</BirthDate>
    </Person>
    <Organisation type="Club"><Id type="Sweden">637</Id><Name>Stora Tuna OK</Name></Organisation>
  </Competitor>
</CompetitorList>
```

**Tests (Vitest-equivalent via node:test for apps/edge):**

```typescript
// apps/edge/src/eventor/parser.test.ts
import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { streamCompetitorsXml } from './parser.ts';

test('streams 3 competitors from synthetic fixture', async () => {
  const records: any[] = [];
  await streamCompetitorsXml(`${import.meta.dirname}/__fixtures__/competitors-sample.xml`, (r) =>
    records.push(r)
  );
  assert.equal(records.length, 3);
  assert.equal(records[0].person_id, 1001);
  assert.equal(records[0].si_card, 8535005);
  assert.equal(records[1].emit_card, 530947);
  assert.equal(records[1].si_card, 8303057);
  assert.equal(records[2].si_card, null);
  assert.equal(records[2].family_name, 'Östberg'); // UTF-8 preserved
});

test('rejects DOCTYPE for billion-laughs safety', async () => {
  // Use a tmpfile with <!DOCTYPE root [...]> first 100 bytes.
  // ... assert that streamCompetitorsXml throws 'DOCTYPE not allowed'.
});
```

### MIP XSD-conformance round-trip

```typescript
// apps/edge/src/integrations/meos/mip.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';

const MIP_XSD = readFileSync(
  // Bundle the pinned mip.xsd at apps/edge/src/integrations/meos/mip.xsd
  `${import.meta.dirname}/mip.xsd`,
  'utf8'
);

test('empty MIP poll response is XSD-valid', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MIPData xmlns="http://www.melin.nu/mip" lastid="0"/>`;
  const result = await validateXML({
    xml: [{ fileName: 'mip-empty.xml', contents: xml }],
    schema: [{ fileName: 'mip.xsd', contents: MIP_XSD }],
  });
  assert.deepEqual(result.errors, []);
});

test('single entry with hired card is XSD-valid', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MIPData xmlns="http://www.melin.nu/mip" lastid="1">
  <entry id="1" extId="3f8a1c2b-9d4e-4f5a-8b0c-1e2d3f4a5b6c" classname="Vit">
    <name>Hagberg, Jonas</name>
    <club>Stora Tuna OK</club>
    <card hired="true">12345</card>
  </entry>
</MIPData>`;
  const result = await validateXML({
    xml: [{ fileName: 'mip-entry.xml', contents: xml }],
    schema: [{ fileName: 'mip.xsd', contents: MIP_XSD }],
  });
  assert.deepEqual(result.errors, []);
});

test('Fastify route handler emits XSD-valid response', async () => {
  // build minimal Fastify app + DB fixture + 1 competitor + 1 card_bound event.
  // GET /mip, validate response body against mip.xsd.
  // ... uses app.inject({ method: 'GET', url: '/mip', headers: { competition: '1', lastid: '0' } });
});
```

### MOP XSD-conformance round-trip

```typescript
// apps/edge/src/integrations/meos/mop.test.ts
test('MOPComplete with one cmp is XSD-valid and writes shadow table', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MOPComplete xmlns="http://www.melin.nu/mop">
  <competition date="2026-05-20" organizer="Stora Tuna OK">4-klubbs 2026</competition>
  <cls id="1" ord="10">Vit</cls>
  <org id="637" nat="SWE">Stora Tuna OK</org>
  <cmp id="5490" card="12345">
    <base org="637" cls="1" stat="1" st="370800" rt="71480" nat="SWE">Hagberg, Jonas</base>
  </cmp>
</MOPComplete>`;
  // 1. Validate against mop.xsd.
  // 2. POST to /mop, assert <MOPStatus status="OK"/>.
  // 3. SELECT from meos_competitors → assert 1 row with id=5490.
});

test('MOPDiff with delete="true" removes row', async () => {
  /* ... */
});

test('Auto-merge inserts MeOS-only competitor with source=meos', async () => {
  // 1. Set active_competition_id with one class 'Vit'.
  // 2. POST MOPComplete with one cmp whose card_number=99999 (not in our competitors).
  // 3. Assert: meos_merge envelope broadcast, count=1.
  // 4. SELECT * FROM competitors WHERE card_number=99999 → assert source='meos'.
});

test('Auto-merge skips MeOS competitor in unknown class', async () => {
  // 1. Set active_competition_id (no class 'UnknownX').
  // 2. POST MOPComplete with cmp in class id mapping to meos_classes name 'UnknownX'.
  // 3. Assert: 0 competitors merged, no WS envelope.
});
```

### Hyrbricka E2E (Playwright)

```typescript
// apps/web/e2e/hyrbricka.spec.ts
test('walkup → finish-readout → Returnerad flow', async ({ page, request }) => {
  // 1. Seed competition + course.
  // 2. Open /competition/<id>/readout?walkup=12345.
  // 3. Fill walkup form: name, klubb, Bana=Vit, check Hyrbricka, fill phone.
  // 4. Click Spara → expect redirect to /readout (no ?walkup).
  // 5. Verify GET /api/competitions/<id>/competitors returns the row.
  // 6. Simulate-read card 12345 via POST /api/__dev/simulate-read.
  // 7. Expect HyrbrickaToast to appear with the phone shown.
  // 8. Click Returnerad → expect toast dismiss.
  // 9. GET /api/competitions/<id>/hired-cards → expect returned_at_ms set.
  // 10. Simulate-read card 12345 AGAIN → toast does NOT re-appear (returnedHiredCardNumbers Set).
});
```

### Parallel-MeOS integration test (no real MeOS install needed)

**Recommendation:** **mock MeOS as a stub HTTP server in a sibling node:test process**, not raw fixture-emit.

**Why:** Wire format alone doesn't test the round-trip (MeOS-as-HTTP-client semantics for both MIP and MOP). A stub server that:

1. Polls our `/mip` every 2s,
2. POSTs `<MOPDiff>` updates to our `/mop` every 5s,
3. Logs everything,

...lets us exercise the full handshake without booting a Windows VM with MeOS. Node:test can spawn the stub via `child_process.fork()` and assert end-to-end behavior.

For Phase 2.0 / Wednesday deadline, **skip the stub** — bench-test against real MeOS the day before. Add the stub in Phase 2.1 for CI.

---

## Validation Architecture

> Phase 2 inherits Phase 1's `node:test` (apps/edge) + Vitest (apps/web) + Playwright (e2e) setup. No new framework install.

### Test Framework

| Property           | Value                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Framework (edge)   | `node:test` (Node 24 built-in — see apps/edge/package.json:9)                                         |
| Framework (web)    | `vitest` 4.1.6                                                                                        |
| E2E framework      | `@playwright/test` 1.60.0                                                                             |
| Edge config file   | `apps/edge/package.json` `"test": "node --test --test-reporter=spec --import tsx 'src/**/*.test.ts'"` |
| Quick run command  | `pnpm --filter @fartola/edge test --test-name-pattern="mip\|mop\|eventor\|hyrbricka"` (~5s)            |
| Full suite command | `pnpm -r test && pnpm e2e` (~5 min)                                                                   |

### Phase Requirements → Test Map

| Req ID                         | Behavior                                                 | Test Type          | Automated Command                                               | File Exists? |
| ------------------------------ | -------------------------------------------------------- | ------------------ | --------------------------------------------------------------- | ------------ |
| REQ-STD-004 (partial)          | Eventor cachedcompetitors download + parse               | unit + integration | `pnpm --filter @fartola/edge test eventor/`                      | ❌ Wave 0    |
| REQ-STD-004 (partial)          | Eventor lookup by si_card returns matching row           | integration        | `pnpm --filter @fartola/edge test routes/eventor`                | ❌ Wave 1    |
| REQ-EXT-MEOS-001               | MIP empty-poll response XSD-valid                        | unit               | `pnpm --filter @fartola/edge test integrations/meos/mip`         | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | MIP entry-on-walkup re-emit XSD-valid                    | unit + integration | same                                                            | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | MIP entry re-emit on card-replace (D-MIP-3)              | integration        | same                                                            | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | MOP `<MOPComplete>` writes shadow tables atomically      | integration        | `pnpm --filter @fartola/edge test integrations/meos/mop`         | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | MOP `<MOPDiff>` UPSERT + DELETE                          | integration        | same                                                            | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | Auto-merge MeOS-only competitor (D-MOP-3)                | integration        | same                                                            | ❌ Wave 2    |
| REQ-EXT-MEOS-001               | meos_merge WS envelope after commit (PATTERNS S-4)       | integration        | `pnpm --filter @fartola/edge test ws/` (extension)               | ❌ Wave 2    |
| Phase-1 carry: REQ-EVT-CMP-004 | Walkup with Hyrbricka writes hired_cards row in same txn | integration        | `pnpm --filter @fartola/edge test routes/competitors`            | ❌ Wave 3    |
| Phase-1 carry: REQ-UI-003      | Finish-readout shows Hyrbricka toast for open rentals    | e2e                | `pnpm --filter @fartola/web e2e hyrbricka.spec.ts`               | ❌ Wave 3    |
| Phase-1 carry: REQ-PRIV-002    | retention.ts scrubs hired*cards.contact*\* after 30 days | unit               | `pnpm --filter @fartola/edge test privacy/retention` (extension) | ❌ Wave 3    |
| Phase-1 carry: REQ-OPS-001     | `fartola` boots offline (no Eventor key, no MeOS)         | manual smoke       | `EVENTOR_API_KEY= fartola --no-bridge --port 3000`               | ❌ Wave 3    |
| Phase-2 SC#1                   | 4-klubbs runs on fartOLa with MeOS parallel               | manual-only        | Bench Wednesday 2026-05-20                                      | Phase gate   |
| Phase-2 SC#3                   | MIP `<entry>` appears in MeOS within 5s of walkup        | manual+integration | bench + stub                                                    | Phase gate   |
| Phase-2 SC#4                   | Hyrbricka toast + MeOS reminder both fire                | manual             | bench                                                           | Phase gate   |
| Phase-2 SC#6                   | MeOS-side reg picked up via MOP on fartOLa restart        | manual+integration | bench + stub                                                    | Phase gate   |

### Sampling Rate

- **Per task commit:** `pnpm --filter @fartola/edge test --test-name-pattern="<feature>"` (~5s)
- **Per wave merge:** `pnpm --filter @fartola/edge test && pnpm --filter @fartola/web test` (~30s)
- **Phase gate:** Full suite green + bench smoke (Wednesday morning, 1h before event) — `fartola --port 3000 --bind-host 0.0.0.0 --allow-lan --competition-id <id>` + MeOS pointed at it + read 5 cards manually.

### Wave 0 Gaps

- [ ] `apps/edge/src/eventor/__fixtures__/competitors-sample.xml` — synthetic 3-competitor fixture
- [ ] `apps/edge/src/integrations/meos/mip.xsd` — pinned copy of v3.0 (committed verbatim from `/tmp/meos-research/mip/mip.xsd`)
- [ ] `apps/edge/src/integrations/meos/mop.xsd` — pinned copy of v2.0 (committed verbatim from `/tmp/meos-research/mop/mop.xsd`)
- [ ] `apps/edge/src/integrations/meos/__fixtures__/` — sample MOPComplete, MOPDiff, MIP entry response payloads (3-5 each)
- [ ] `apps/edge/src/integrations/meos/mip.test.ts` — XSD-conformance + Fastify-inject tests
- [ ] `apps/edge/src/integrations/meos/mop.test.ts` — XSD-conformance + transactional-ingest tests
- [ ] `apps/edge/src/eventor/parser.test.ts` — saxes streaming test
- [ ] `apps/edge/src/eventor/cache.test.ts` — full ingest into in-memory SQLite
- [ ] `apps/edge/src/eventor/boot.test.ts` — staleness logic (D-EV-2)
- [ ] `apps/edge/src/privacy/retention.test.ts` (EXTEND) — hired*cards.contact*\* scrub
- [ ] `apps/web/e2e/hyrbricka.spec.ts` — full walkup → readout → Returnerad flow

---

## Security Domain

### Applicable ASVS Categories (extending Phase 1's posture)

| ASVS Category               | Applies                                             | Standard Control                                                                                                                                 |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2 Authentication           | no (D-MIP-1 + D-MOP-4 chose no-auth for closed LAN) | Phase 2.1 revisits                                                                                                                               |
| V3 Session Management       | no                                                  | Same                                                                                                                                             |
| V4 Access Control           | yes (minimal)                                       | `/mip` and `/mop` mounted at root; reachable from LAN when `--allow-lan` set. Per-route CORS not needed because MeOS doesn't send Origin.        |
| V5 Input Validation         | yes                                                 | Zod on MIP querystring; XSD-conformance tests on outbound MIP; MOP XML parsed with `processEntities: false` + DOCTYPE pre-flight (PATTERNS S-7). |
| V6 Cryptography             | no                                                  | Localhost LAN only. No secrets in transit.                                                                                                       |
| V7 Error Handling & Logging | yes                                                 | All MOP errors logged via Fastify pino; no PII in MIP/MOP error payloads (only ids).                                                             |
| V8 Data Protection          | yes                                                 | hired*cards.contact*\* are PII per REQ-PRIV-002; scrubbed via retention.ts extension. Eventor cache is per-laptop, not LAN-exposed.              |
| V9 Communications           | no                                                  | HTTP only on closed LAN; HTTPS deferred to Phase 2.1 sanctioned events.                                                                          |
| V10 Malicious Code          | yes (minimal)                                       | `saxes` is the only net-new dep; planner adds checkpoint:human-verify before install.                                                            |
| V11 Business Logic          | yes                                                 | MOP auto-merge has class-match guard so MeOS can't insert competitors in classes that don't exist (Pattern 4 EXISTS clause).                     |
| V12 Files & Resources       | yes                                                 | MOP bodyLimit = 50 MB. Eventor download to local tempfile, deleted after ingest.                                                                 |
| V13 API & Web Service       | yes                                                 | MIP/MOP follow Fastify plugin shape; all JSON elsewhere.                                                                                         |
| V14 Configuration           | yes                                                 | EVENTOR_API_KEY from .env (gitignored); no MIP/MOP secrets in 2.0.                                                                               |

### Known Threat Patterns for fartOLa + MeOS coexistence

| Pattern                                                                  | STRIDE                      | Standard Mitigation                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious LAN device POSTs `<MOPComplete>` overwriting all shadow tables | Tampering                   | D-MOP-4 chose no auth — accept this trade-off for 4-klubbs closed LAN. Phase 2.1 adds `pwd` header check.                                                  |
| Billion-laughs in MOP body                                               | DoS                         | `processEntities: false` + DOCTYPE/ENTITY pre-flight in Pattern 4. Same Phase 1 PATTERNS S-7.                                                              |
| MIP poll-flood (every 100ms)                                             | DoS                         | Fastify default rate limiter is off in Phase 1; if MeOS misbehaves, add `@fastify/rate-limit` scoped to /mip. Not needed in 2.0.                           |
| Eventor downloaded XML contains XXE                                      | Tampering / Info Disclosure | saxes doesn't expand entities by spec; pre-flight DOCTYPE check in Pattern 1.                                                                              |
| MOP auto-merge inserts competitor with malicious name (XSS in readout)   | XSS / Tampering             | Svelte 5 escapes text content by default. Names are rendered via `{name}` not `{@html name}`. PATTERNS check: no `{@html}` introduced.                     |
| hired*cards.contact*\* leakage in logs                                   | Privacy                     | Fastify logger only sees REST payloads; never log full competitor or hired_card row. Add explicit redaction list in `app.log` config (planner discretion). |

---

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at workspace root (`Read: File does not exist. Note: your current working directory is /home/jonas/src/fartOLa-phase-2.`). Constraints inherited from user's global `~/.claude/CLAUDE.md`:

- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). All Phase 2 commits stay inside the existing lefthook + commitlint chain.
- **Minimum-code-that-solves-the-problem** philosophy. Phase 2.0 is mostly reuse; if a new file exceeds ~200 LOC, reconsider the abstraction.
- **Surgical edits, match existing style.** Drizzle schema, Fastify plugin, Svelte 5 runes — every existing pattern in Phase 1.
- **AGPL-3.0 application + MIT for packages/sportident** (ROADMAP cross-cutting). New Phase 2 code lands as AGPL.
- **Swedish-first UI strings.** All new keys go to `sv.json` + `en.json` from day one.
- **Tests run on real hardware before any release tag.** SC#1 is the binding gate for Phase 2.0 — bench-verify Wednesday morning.

---

## Assumptions Log

| #   | Claim                                                                                                                                                                                                        | Section                       | Risk if Wrong                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A1  | `saxes@6.0.0` is the current major version and is published on npm.                                                                                                                                          | Standard Stack                | MEDIUM — `npm view saxes version` in Plan 1 task 0 validates this. Fallback: `sax@1.2.4` (well-established, sibling API).     |
| A2  | The Eventor cachedcompetitors endpoint shape verified by the parallel agent in May 2026 has not changed by Wed 2026-05-20.                                                                                   | Pattern 1 + §Eventor download | LOW — the endpoint has been MeOS's runner-DB source for years (TabCompetition.cpp:3107-3108 references it).                   |
| A3  | MeOS will not change the MIP/MOP wire format between research date and 4-klubbs event date.                                                                                                                  | §MeOS XSD wire format details | LOW — MIP XSD v3.0 was bumped 2026-05-14 (2 days before research); MOP v2.0 March 2025. Unlikely to bump in 4 days.           |
| A4  | The MeOS install on the parallel laptop is configured by the operator (Jonas) pre-event with class names matching fartOLa's Bana names exactly.                                                               | Pitfall 3                     | MEDIUM — manual coordination. Playbook (Plan 6) is the mitigation.                                                            |
| A5  | MeOS sends `Competition` and `Lastid` as HTTP headers (per spec), but tolerates `?competition=&lastid=` query params if we ALSO accept them.                                                                 | Pattern 3                     | LOW — reference server (input.php) reads headers; CONTEXT.md says query. Accepting both is robust.                            |
| A6  | `fast-xml-parser` XMLBuilder produces XSD-conformant output for the MIP `<entry>` shape when given the @\_xmlns-at-root pattern.                                                                             | Pattern 3                     | MEDIUM — verify via the round-trip test (xmllint-wasm validation in Wave 0). If it fails, hand-roll the serializer (~30 LOC). |
| A7  | better-sqlite3's `INSERT ... VALUES (...), (...), ...` batched insert (which Drizzle's `.insert().values([array])` produces) is fast enough for 252k rows in 1000-row chunks (<60s total on a bench laptop). | Pattern 2                     | LOW — better-sqlite3 docs benchmark ~50k inserts/sec for batched inserts. 253 batches × 1000 rows ≈ 5s; comfortable.          |
| A8  | Svelte 5 reactive Set mutation via `.add()` triggers updates inside `$state()`.                                                                                                                              | Plan 5 nuance                 | MEDIUM — if not, use `returnedHiredCardNumbers = new Set([...returnedHiredCardNumbers, n])`. Test in Wave 0 of Plan 5.        |
| A9  | The MeOS source code at `/home/jonas/src/meos/code/` reflects the deployed MeOS version that will run on the parallel laptop Wednesday.                                                                      | §MeOS XSD wire format         | LOW — Jonas controls both. Playbook captures the MeOS version.                                                                |
| A10 | Auto-merge into `competitors` with `consent_status='pending_first_read'` matches the Phase 1 consent flow (operator confirms on first card_read).                                                            | D-MOP-3                       | LOW — Phase 1 D-04 + C-M4 explicitly support this status; ConsentConfirmationToast is the existing UI surface.                |

---

## Open Questions (RESOLVED)

1. **Should the empty MIP response be `<MIPData lastid="0"/>` or `<MIPData lastid="N"/>` (echo input)?**
   - What we know: MIP PDF says "the response file also includes a new lastid, which the client uses for the next request." If nothing changed, echoing the input lastid keeps the client's cursor stable.
   - What's unclear: whether MeOS resets its internal lastid if it sees a smaller value than what it sent.
   - RESOLVED: ECHO the input lastid (i.e., `<MIPData lastid="N"/>` where N = input lastid). This is what Pattern 3's `sendEmpty(reply, builder, lastid)` does. Plan 03 Task 2 Test 2 encodes this.

2. **Should the MOP route accept gzipped bodies (Content-Encoding: gzip)?**
   - What we know: MeOS supports both via `update.php` (plain) + `zipupdate.php` (gzip). update.php rejects gzip with NOZIP; zipupdate.php accepts it.
   - What's unclear: whether MeOS will retry without gzip if we respond NOZIP.
   - RESOLVED: Phase 2.0 = plain XML only. Return `<MOPStatus status="NOZIP"/>` for gzip (matching update.php). Document in playbook that operator should configure MeOS for plain MOP. Plan 04 Task 2 Test 12 encodes this.

3. **What happens if MeOS sends a `<cmp>` with a card_number that exists in a DIFFERENT fartOLa competition?**
   - What we know: auto-merge is scoped to `activeCompetitionId` via WHERE NOT EXISTS subquery. Cross-competition card collision can't happen because the EXISTS check is scoped.
   - What's unclear: whether the operator might be confused if the same physical card appears in two competitions (one open hired_cards row per competition).
   - RESOLVED: document in playbook. End-of-event admin view shows opens across competitions. Plan 06 playbook section covers operator-facing semantics.

4. **Should we add a MIP `<response type="entrystatus"/>` request to learn if MeOS accepted our `<entry>`?**
   - What we know: MIP spec supports this; MeOS responds with a MipStatusResponse.
   - What's unclear: how to thread this back into our system — we'd need to LISTEN for MeOS's separate POST to a response URL.
   - RESOLVED: SKIP for 2.0. The 5-second sync goal in SC#3 is met by the push; observability into MeOS's accept/reject is Phase 2.1. Plan 03 does NOT implement entrystatus.

5. **Should the saxes parser bail after N parse errors or continue?**
   - What we know: streaming-parse mid-stream errors are recoverable (saxes emits 'error' but continues unless we stop).
   - What's unclear: whether to count errors and fail the whole ingest if > 100 errors (suggests upstream corruption).
   - RESOLVED: throw on first parse error in 2.0; the transaction rolls back and the prior cache survives. Add tolerance in 2.1 if Eventor data ever has known partial corruption. Plan 01 Task 2 encodes this.

6. **Branch rename `gsd/phase-2-sanctioned-competition` → `gsd/phase-2.0-4-klubbs-mvp`?**
   - What we know: current branch is `gsd/phase-2.0-4-klubbs-mvp` already (visible in git status at start of session — `Current branch: gsd/phase-2.0-4-klubbs-mvp`). The rename was already done.
   - RESOLVED: no action needed. CONTEXT.md is stale on this point.

---

## Environment Availability

| Dependency                                     | Required By                                       | Available                                                                   | Version                                     | Fallback                                                         |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Node.js 24 LTS                                 | Edge runtime                                      | ✓ (Phase 1)                                                                 | v22.19.0+ per Phase 1 RESEARCH §Environment | —                                                                |
| pnpm 10.30.3                                   | Workspace                                         | ✓ (Phase 1)                                                                 | 10.30.3                                     | —                                                                |
| `saxes` package on npm                         | Plan 1                                            | ⚠️ assumed available; verify with `npm view saxes version` in Plan 1 task 0 | TBD                                         | `sax@1.2.4`                                                      |
| EVENTOR_API_KEY                                | Plan 1 download                                   | ✓ (Jonas has it in `.eventor-env`, commit 7ec8866)                          | —                                           | D-EV-3: warn + run with cache                                    |
| MeOS install on LAN                            | Bench Wednesday                                   | ❌ at research time                                                         | —                                           | Plan 6 documents setup; planner schedules test 1d before event   |
| `/dev/ttyUSB0` SI reader                       | Bench Wednesday                                   | ❌ at research time (no hardware in dev loop)                               | —                                           | Phase 1 simulate-read fixtures cover dev iterations              |
| `xmllint-wasm`                                 | MIP/MOP test suite                                | ✓ (Phase 1 dep — apps/edge/package.json:53)                                 | 5.0.0                                       | —                                                                |
| `fast-xml-parser`                              | MIP serialize + MOP parse                         | ✓ (Phase 1 dep — apps/edge/package.json:48)                                 | 5.2.0                                       | —                                                                |
| Network reachability to eventor.orientering.se | Plan 1 download                                   | ❌ at research time                                                         | —                                           | D-EV-3: warn + run with cache                                    |
| MeOS source at `/home/jonas/src/meos/code/`    | Plan 6 verification                               | ✓                                                                           | —                                           | (already cited in CONTEXT canonical_refs)                        |
| `/tmp/meos-research/mip/mip.xsd` + `mop.xsd`   | Plan 0 (copy to apps/edge/src/integrations/meos/) | ✓                                                                           | mip v3.0, mop v2.0                          | re-extract from mip.zip / mop.zip already in /tmp/meos-research/ |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**

- Real MeOS install + LAN co-location → defer to bench Wednesday; stub Phase 2.1.
- Internet at research time → D-EV-3 covers operator-side; saxes streaming + xmllint tests run offline.

---

## Landmines (from direct MeOS source review)

### Landmine: MIP `<entry>` requires `<name>` MINIMUM

**Source:** `/home/jonas/src/meos/code/onlineinput.cpp:1032-1038`

```cpp
wstring name;
entry.getObjectString("name", name);
if (name.empty()) {
  addInfo(L"Fel: X#" + lang.tl("Namnet kan inte vara tomt"));
  status.emplace_back(id, 0, MipEntryStatus::Failed, L"Namnet kan inte vara tomt");
  continue;
}
```

**Impact:** Empty name → MeOS reject with "Namnet kan inte vara tomt", competitor NOT added on MeOS side, fartOLa has no visibility into the reject. WalkupModal already enforces min length 2 on name (existing validation at WalkupModal.svelte:84) — so this is already covered.

### Landmine: MIP `<extId>` + name-mismatch silently fails reuse

**Source:** `/home/jonas/src/meos/code/onlineinput.cpp:1080-1093, 1100-1113`

```cpp
auto res = raceId2R.find(id);
if (res != raceId2R.end()) {
  r = res->second;
  if (r && !r->matchName(name))
    r = nullptr;
}
// ... similar for extId path:
auto res = extId2R.find(extId);
if (res != extId2R.end())
  r = res->second;
}
if (r && !r->matchName(name))
  r = nullptr;
```

**Impact:** If we re-emit `<entry>` with the same `extId` but a DIFFERENT name (e.g., operator edited the competitor's name in fartOLa between bind and card-replace), MeOS treats it as a NEW entry instead of an update — duplicate runners on MeOS side. **Mitigation:** D-MIP-3 says re-emit on `card_number change, class_id change, name change` (CONTEXT.md "Exact UPDATEs that trigger MIP re-emit — safe default"). If name changed, we re-emit anyway. This is fine — but operators must understand that name-edits create a NEW MeOS runner; old one remains with the old card mapping. Document in playbook.

### Landmine: MeOS card hired flag is "sticky" via oe.isHiredCard

**Source:** `/home/jonas/src/meos/code/onlineinput.cpp:1072-1073`

```cpp
if (!hiredCard && oe.hasHiredCardData())
  hiredCard = oe.isHiredCard(cardNo);
```

**Impact:** If we DON'T send `hired="true"` on the entry, MeOS still consults its own hired-card hash. So if a card was previously marked hired in MeOS (out of band), our entry inherits that flag. This is GOOD (D-LIM-1 mitigation by accident — sort of). But it means the playbook's "manual re-entry on crash recovery" workaround only matters for cards marked hired ONLY in fartOLa after the crash.

### Landmine: MeOS finish-readout hired check is OR'd two sources

**Source:** `/home/jonas/src/meos/code/TabSI.cpp:3272, 3309`

```cpp
rout.rentCard = runner->isRentalCard() || oe->isHiredCard(sic.CardNumber);
```

**Impact:** MeOS's "Hyrbricka" reminder fires if EITHER (a) the runner row is flagged isRentalCard (via `<card hired="true">` in entry), OR (b) the card number is in `oe->hiredCardHash` (set elsewhere). fartOLa only controls (a) via MIP. To set (b) externally we'd need a separate protocol — there isn't one. So our belt+braces is `<card hired="true">` → MeOS sets isRentalCard → MeOS reminds. Correct as designed.

### Landmine: MeOS Eventor download uses `eventorBase` + `iofExportVersion` string concat

**Source:** `/home/jonas/src/meos/code/TabCompetition.cpp:3107-3108`

```cpp
dwl.downloadFile(eventorBase + L"export/cachedcompetitors?includePreselectedClasses=false&zip=true" + iofExportVersion, dbFile, key);
```

**Impact:** `iofExportVersion = L"&version=3.0"`. **Our fetch URL must match EXACTLY** — including the `&version=3.0` suffix. The smoke-test research already used this exact URL (`.planning/research/eventor-api-smoke.md` line 24). Lock in cache.ts.

### Landmine: Eventor `cachedcompetitors` payload is gzipped

**Source:** `.planning/research/eventor-api-smoke.md:24` ("9.4 MB zip → 86 MB XML")
**Impact:** The fetch needs to decode gzip BEFORE handing to saxes. Node's built-in `zlib.gunzipSync()` or `unzipper` package handles this. If we forget, saxes sees gzip header bytes → parse error in the first 100 bytes.
**Mitigation:** explicit Accept-Encoding handling in cache.ts; verify with a unit test that feeds a gzipped fixture.

### Landmine: MOP `<cmp>` may arrive BEFORE its `<cls>` / `<org>` references

**Source:** `mop.xsd` declares `<MOPComplete>` element ordering as `competition, ctrl, cls, org, cmp, tm` — but `<MOPDiff>` is the same sequence; no guarantee MeOS sends them in order.
**Impact:** Our auto-merge SELECT for class resolution (`JOIN meos_classes mcl ON mcl.id = mc.class_id`) requires the class row to exist. If MeOS sends `<cmp>` referencing a class id we haven't seen yet, the JOIN returns no row, auto-merge skips this competitor.
**Mitigation:** D-MOP-2 TRUNCATE+INSERT in ONE transaction means all rows within ONE MOPComplete are visible to the auto-merge SELECT at the end. So as long as MeOS sends the full state in ONE POST, ordering doesn't matter. The risk is fragmented MOPDiff updates where `<cls>` arrives in POST 1 and `<cmp>` in POST 2 — but each POST is a separate transaction, so by the time POST 2's auto-merge runs, POST 1's `<cls>` is committed. Still fine. **Document in playbook:** "MeOS configured to send MOPComplete on connect" is the recommended setup; MOPDiff handles deltas thereafter.

### Landmine: MIP server "lastid" must be strictly increasing

**Source:** MIP PDF page 2 — "lastid set to the id of the last item received from the server"
**Impact:** Our response lastid MUST be ≥ the input lastid, AND each entry's id MUST be ≤ response lastid. Our `entry.id = row.localSeq` satisfies this because local_seq is monotonic per-node.
**Mitigation:** test that asserts response lastid = max(input lastid, max(entry.id)).

### Landmine: input.php reference treats integer lastid as `(int)$value` — accepts decimals/negatives/strings

**Source:** `/tmp/meos-research/mip/input.php:46-47`

```php
if (strcasecmp($header, "http_lastid") == 0)
  $lastid = (int)$value;
```

**Impact:** A malformed MeOS-side lastid silently coerces to 0, which would replay all events. Our Zod schema rejects non-integers with 400; this is safer than the PHP reference but more strict. Document in Pattern 3 — if MeOS sends garbage lastid, we 400 instead of starting over. If 400 causes MeOS to hang, switch to `coerceInt() ?? 0` fallback.

### Landmine: MOP zerotime can be missing (`zerotime` optional)

**Source:** `/tmp/meos-research/mop/mop.xsd:103-108`
**Impact:** Without zerotime, the meaning of `st` and `rt` (tenths from competition zero time) is undefined. For our shadow tables we store raw tenths and don't interpret them — so this is fine in 2.0. If Phase 2.1 ever projects MeOS times into our wall-clock domain, we need zerotime fallback.

### Landmine: Drizzle `update.set({ scrubbedAtMs: now() })` requires a function `now()`, NOT `Date.now()`

**Source:** `apps/edge/src/privacy/retention.ts:112` — uses `now()` from `opts.testClock?.now ?? Date.now`
**Impact:** When extending retention.ts for hired_cards scrub, reuse the `now` function reference passed via opts — not a literal `Date.now()` call — so testClock injection still works.

---

## State of the Art

| Old Approach                      | Current Approach                             | When Changed       | Impact                                                                          |
| --------------------------------- | -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| MeOS SendPunch TCP (binary, 2014) | MIP `<card>` (XML, v3.0 2026)                | locked decision #6 | We skip the legacy protocols entirely. No native dep, no binary framing.        |
| MeOS UDP broadcast (binary, 2014) | (not used — locked decision #6)              | —                  | Same.                                                                           |
| `sax` (1.x, 2017)                 | `saxes` (6.x, 2024+)                         | gradual            | Better UTF-8, stricter spec; pure JS no native dep.                             |
| `libxmljs2-xsd` (native node-gyp) | `xmllint-wasm` (WASM, in repo since Phase 1) | Phase 1 chose WASM | No native build pain; ~5MB bundle hit; perfectly fine for test-only validation. |
| Per-row INSERT in loop            | Batched `.insert().values([array]).run()`    | always best        | 30-60x faster for bulk loads (Pattern 2).                                       |

**Deprecated/outdated for this domain:**

- The two 2014-era MeOS binary protocols (SendPunch TCP, UDP broadcast) — explicitly skipped per locked decision #6. Don't introduce.
- `node-expat` (libexpat native binding) — incompatible with the "npm install -g fartola" promise (REQ-OPS-001). Don't introduce.

---

## Sources

### Primary (HIGH confidence)

- **`/tmp/meos-research/mip/mip.xsd`** — MeOS Input Protocol v3.0 (May 2026, updated April 2025). Read directly. Every claim about MIP wire shape is from this file.
- **`/tmp/meos-research/mop/mop.xsd`** — MeOS Online Protocol v2.0 (March 2025). Read directly.
- **`/tmp/meos-research/mip/MeOS Input Protocol.pdf`** — Informal spec + entry examples + status codes. Read pages 1-4.
- **`/tmp/meos-research/mop/MeOS Online Protocol.pdf`** — Informal spec + competitor examples + MOPStatus codes. Read pages 1-5.
- **`/tmp/meos-research/mip/input.php`** — Reference PHP MIP server (Apache 2.0). Read for header parsing semantics.
- **`/tmp/meos-research/mop/update.php`** — Reference PHP MOP server (Apache 2.0). Read for body parsing + dispatch logic.
- **`/home/jonas/src/meos/code/onlineinput.cpp:985-1220`** — MeOS C++ MIP entry parser. Read for landmines (name required, extId+name match, hired flag sticky).
- **`/home/jonas/src/meos/code/oEvent.h:915-934`** — MeOS hired-card API. Confirms D-HB-1 superset claim.
- **`/home/jonas/src/meos/code/TabSI.cpp:3255-3329`** — MeOS finish-readout hired check (TabSI.cpp:3272, 3309).
- **`/home/jonas/src/meos/code/TabCompetition.cpp:3085-3124`** — MeOS Eventor download URL construction.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/db/schema.ts`** — Phase 1 Drizzle schema, idiom template.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/ingest/entryImport.ts`** — transactional bulk-upsert template.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/xml/parse.ts`** — fast-xml-parser config + T-FILE-IMPORT pre-flight (lines 93-124).
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/server.ts`** — Fastify plugin registration order, CORS allow-list, decoration pattern.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/bin/fartola.ts:449-580`** — bin entrypoint structure, BridgeLifecycle, scheduler wiring.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/ws/index.ts`** — WebSocket plugin, wsBroadcast decoration, channel scoping.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/projection/store.ts`** — ProjectionStore pattern, markDirty + recompute + broadcast (PATTERNS S-4 broadcast-after-commit).
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/backup/daily.ts`** — BackupHandle shape `{ runNow, stop }` template.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/privacy/retention.ts`** — UPDATE-with-subquery scrub pattern.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/src/routes/competitors.ts`** — atomic transaction pattern (lines 211-243, 358-412), partial-unique-index race-safety net (lines 250-265).
- **`/home/jonas/src/fartOLa-phase-2/apps/web/src/lib/screens/WalkupModal.svelte`** — extension target. Existing form shape + 409 replace-card flow.
- **`/home/jonas/src/fartOLa-phase-2/apps/web/src/lib/screens/ReadoutView.svelte`** — extension target. C-M4 consent toast pattern (lines 416-450) as the analog for Hyrbricka toast.
- **`/home/jonas/src/fartOLa-phase-2/apps/web/src/lib/components/ClubAutocomplete.svelte`** — 200ms-debounced autocomplete template.
- **`/home/jonas/src/fartOLa-phase-2/apps/edge/drizzle/0000_initial.sql`** — Phase 1 migration shape (FK + cascade + partial unique index).
- **`/home/jonas/src/fartOLa-phase-2/.planning/phases/02-4-klubbs-mvp/02-CONTEXT.md`** — the 14 locked decisions; this RESEARCH file's primary driver.
- **`/home/jonas/src/fartOLa-phase-2/.planning/phases/02-4-klubbs-mvp/02-PATTERNS.md`** — file-to-analog map; this RESEARCH file's runtime-behavior superset.
- **`/home/jonas/src/fartOLa-phase-2/.planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md`** — Phase 1 RESEARCH structure being mirrored.

### Secondary (MEDIUM confidence)

- **`.planning/research/eventor-api-smoke.md`** — parallel agent's smoke test of Eventor cachedcompetitors endpoint (252 919 competitors, 96 918 with SI cards). Verified post-hoc; saxes parser strategy in this RESEARCH derives from it.
- **`.planning/research/meos-protocols.md`** — full MeOS protocol matrix (MOP + MIP + SendPunch + UDP). Used to scope-confirm "skip SendPunch+UDP, use MIP+MOP only".

### Tertiary (LOW confidence — flagged for validation)

- **`saxes@6.x` version assumption** — npm registry not queried in this research session (Bash `npm view saxes version` returned empty). Planner must verify in Plan 1 task 0. Fallback: `sax@1.2.4`.
- **slopcheck verification of saxes** — slopcheck CLI not available in research environment. Planner must add `checkpoint:human-verify` task before `pnpm add saxes` runs.

---

## Metadata

**Confidence breakdown:**

- MIP/MOP wire format: **HIGH** — XSDs + PDF + reference PHP + MeOS C++ source all read directly.
- Phase 1 reuse patterns: **HIGH** — every cited file read in this session.
- Eventor download shape: **HIGH** — parallel agent's smoke test is recent and detailed.
- saxes vs sax: **MEDIUM** — pick is defensible from the ecosystem state but exact version pin is `[ASSUMED]`.
- Auto-merge SQL correctness: **MEDIUM** — the INSERT...SELECT...WHERE NOT EXISTS shape needs the class-name JOIN to work; test in Wave 0.
- Svelte 5 Set reactivity: **MEDIUM** — A8 in Assumptions Log.

**Research date:** 2026-05-16 (evening)
**Valid until:** 2026-06-13 for stable web stack; **2026-05-21 for MIP/MOP XSDs** (MIP v3.0 was bumped 2 days before research date — re-check after Wednesday's event).

**What got verified in this session vs. what's still assumed:**

- ✅ MIP XSD has `<card maxOccurs="1">` (verified by reading mip.xsd:199)
- ✅ MIP `<entry>` accepts `<extId>` as string (verified mip.xsd:278-284)
- ✅ MOP `<cmp>` has NO `hired` attribute (verified mop.xsd:332-377 BaseCompetitor 223-306)
- ✅ MOP `<MOPComplete>` semantics = "drop and replace" (verified mop.xsd:34-37 documentation)
- ✅ Empty MIP poll `<MIPData lastid="N"/>` is XSD-valid (verified — all children are minOccurs="0")
- ✅ MeOS `<classname>` string lookup at onlineinput.cpp:994-996 (already in CONTEXT.md D-MIP-4, re-verified here)
- ✅ Phase 1's `xml/parse.ts` parser config = `processEntities: false` + DOCTYPE/ENTITY pre-flight (verified parse.ts:93-124)
- ✅ Phase 1's WalkupModal already has 409 replace-card flow (verified WalkupModal.svelte:116-128)
- ✅ Phase 1's bin/fartola.ts wires schedulers AFTER app.listen with fire-and-forget pattern (verified bin/fartola.ts:510-518)
- ⚠️ `saxes@6.0.0` exact version — assumed; Plan 1 task 0 must verify
- ⚠️ Auto-merge class-name JOIN — designed but not test-driven in research; Wave 0 of Plan 4 verifies
- ⚠️ Svelte 5 reactive Set mutation — assumed; Wave 0 of Plan 5 verifies
