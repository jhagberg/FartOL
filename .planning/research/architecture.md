# ARCHITECTURE

This document describes the **target architecture** for the system. It is
not a plan for v0.1 — see `ROADMAP.md` for phased delivery. This is the
shape we are building toward.

If a decision in this file conflicts with code or another doc, this file
wins. If reality conflicts with this file, update this file.

---

## Core principle: punches are immutable events

A SportIdent punch is a tuple
`(card_number, station_code, timestamp_ms, node_id, local_seq)`.
Once recorded by a node, it is **never modified**. Two nodes can never
produce the same event because `(node_id, local_seq)` makes every event
globally unique.

All derived state — start lists, results, splits, placements, DNF status,
class standings — is **computed from the event log**, not stored.
If a bug is found mid-event, the code is fixed and projections are
recomputed from the log. There is no corrupt state to repair.

This is the single architectural decision that makes everything else fall
into place. Offline-first works naturally; multi-secretary collaboration
works naturally; scaling to O-ringen works naturally — because conflicts
that other systems fight against simply cannot occur in this model.

Configuration data that _can_ legitimately conflict (start lists, class
definitions, course assignments) is a smaller surface and is handled
separately via CRDT-style edits (Yjs) on the secretariat client.

---

## Three tiers

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3 · CLIENT (browser / PWA)                                │
│  Secretariat · Speaker · Big screen · Public · Kids' finish     │
│  SvelteKit · ElectricSQL read-sync · Yjs for collaborative edits│
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / WebSocket / SSE
                                │ over LAN or internet
┌───────────────────────────────▼─────────────────────────────────┐
│  TIER 2 · EDGE-BRIDGE (Android app · Pi · mini-PC · laptop)     │
│  • Talks to SportIdent hardware via serial / USB                │
│  • Writes punch events to local SQLite (append-only)            │
│  • Exposes HTTP+WebSocket API on LAN                            │
│  • Syncs events with peer nodes when connectivity available     │
│  Node.js · @serialport · Fastify · better-sqlite3 · ws          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Custom event-sync protocol
                                │ (push-when-possible, no master)
┌───────────────────────────────▼─────────────────────────────────┐
│  TIER 1 · CENTRAL (optional — internet only)                    │
│  • Postgres aggregating events from all edge nodes              │
│  • Drives Electric read-sync to public viewers                  │
│  • Eventor sync · Livelox export · IOF XML import/export        │
│  Node.js · Fastify · Postgres · ElectricSQL                     │
└─────────────────────────────────────────────────────────────────┘
```

### Why three tiers, not two

A naïve design lets the browser talk directly to SportIdent hardware via
WebSerial. We rejected this because:

- iOS Safari and Firefox have no WebSerial support and no roadmap.
- Chrome Android support is limited to USB OTG with caveats.
- A browser tab being closed must not lose punches.
- Background sync requires Service Worker reliability that Apple does not provide.

The edge-bridge eliminates these problems: it owns the hardware connection
and the local event log. Browsers become pure UI clients that connect over
HTTP/WebSocket — a model every platform supports identically. This also
matches how SI-Droid and SPORTident Center already work in practice.

### Why central tier is optional

A competition can run end-to-end on a single edge-bridge plus browser
clients on the same LAN. No internet required. The central tier exists
to enable:

- Public live results during the race.
- Eventor synchronization for entries and rankings.
- Livelox export.
- Cross-arena event aggregation (relays with split arenas, O-ringen scale).

For a club training event, the central tier is not deployed. For O-ringen,
the central tier is critical.

---

## Synchronization model — corrected

### What ElectricSQL is and is not

ElectricSQL is a **read-path sync engine for Postgres → clients**. It is
not a write-sync engine. Writes go through your existing backend, which
means Electric solves the public-results-display problem brilliantly but
does not solve the autonomous-field-node problem.

For this system:

- **Tier 1 → Tier 3 read flow** uses Electric Shapes. Public viewers,
  speaker dashboards, and big-screen overlays subscribe to live result
  projections. Electric handles partial sync, SSE delivery, and reconnect.
- **Tier 2 ↔ Tier 2 peer sync** is **custom**: append-only event log
  push between edge nodes. Each node tracks `(peer_id → last_seq_seen)`
  watermarks. On reconnect, nodes exchange events newer than their
  respective watermarks. Idempotent by construction.
- **Tier 2 → Tier 1 push** is also our own code: each edge node POSTs
  new events to the central server when internet is available.
  Central server deduplicates by `(node_id, local_seq)` primary key
  and updates the Postgres `events` table.

### Event log schema (SQLite at edge, Postgres centrally)

```sql
CREATE TABLE events (
  node_id        TEXT NOT NULL,        -- UUID of edge node
  local_seq      INTEGER NOT NULL,     -- per-node monotonic counter
  event_type     TEXT NOT NULL,        -- 'punch' | 'card_read' | 'manual_*'
  event_time_ms  INTEGER NOT NULL,     -- SI station time (or local on manual)
  recorded_at_ms INTEGER NOT NULL,     -- when node received it
  payload        TEXT NOT NULL,        -- JSON, schema per event_type
  PRIMARY KEY (node_id, local_seq)
);

CREATE INDEX idx_events_time ON events (event_time_ms);
```

Projections (results, splits, class standings) live in separate tables
and are rebuilt from `events` via stateless reducers. Schema migrations
to projections do not require a backfill — they just rebuild.

---

## SportIdent isolation

All SportIdent-specific code lives in a dedicated package:
`packages/sportident/`. It is the only place that imports `serialport`
or knows about CP2102 chips. Licensed **MIT** so legal risk of reverse-
engineered protocol code is scoped to that package. Other packages
consume a clean async interface:

```typescript
interface SiReader {
  onPunch(handler: (p: Punch) => void): void;
  onCardRead(handler: (c: CardRead) => void): void;
  setTime(t: Date): Promise<void>;
  // ... no SI internals leak outside this interface
}
```

This is also what makes the system testable: mock `SiReader` in unit
tests, exercise the full event pipeline without hardware.

---

## Tech stack — chosen

| Layer             | Choice                              | Reason                                             |
| ----------------- | ----------------------------------- | -------------------------------------------------- |
| Edge backend      | Node.js 22 LTS + Fastify            | Shared TS types with frontend; mature `serialport` |
| Edge DB           | SQLite via `better-sqlite3`         | Synchronous, ~10k writes/sec on Pi 5               |
| Central backend   | Node.js + Fastify                   | Symmetric with edge; no language switch            |
| Central DB        | Postgres 16                         | Mature, partitionable, Electric-compatible         |
| Read sync         | ElectricSQL Shapes                  | GA Mar 2025, Durable Streams Dec 2025              |
| Collab edits      | Yjs                                 | Only for shared forms, not for punches             |
| Frontend          | SvelteKit (PWA)                     | Smaller bundles than React, important in forest 4G |
| Mobile (optional) | Capacitor wrapper of PWA            | Only if iOS-as-operator becomes critical           |
| Printing          | `node-escpos` + `escpos-printer-db` | Open ESC/POS, avoids 72mm format hell              |
| Edge hardware     | Raspberry Pi 5 (4 GB) + PiJuice UPS | ~1 200 SEK, Linux, USB hub for SI                  |

### Tech stack — not chosen, and why

- **Electron** — too heavy. Tauri or Capacitor if desktop wrapper needed.
- **React** — fine, but Svelte is smaller. Bundle size matters in the forest.
- **GraphQL** — overengineering at this scale. REST + WebSocket suffices.
- **Microservices** — overengineering. Two well-structured monoliths
  (edge + central) is the right number.
- **Kafka / NATS** — possibly later for fan-out to large public audiences.
  Not in v0.1–v0.4. Electric handles public read flow for now.
- **CRDTs (Automerge, Yjs) for punches** — unnecessary. The event log
  is conflict-free by construction. Yjs only for editable forms.

---

## Compatibility surface — what we speak

This system survives in the existing ecosystem only if it interoperates
with what clubs already use. From day one we read and write:

- **IOF XML 3.0** (start lists, results, courses) — both directions.
- **IOF XML 2.0.3** — read only, for legacy course tools.
- **Purple Pen `.xml`** exports.
- **OCAD `.xml`** exports.
- **Eventor REST API** — entries, results upload.
- **ROC protocol** — receive punches from existing Pi+4G radio controls.
- **SIRAP** — radio-control TCP protocol used by MeOS/OLA/OE12.
- **MeOS TCP input protocol** — feed punches to existing MeOS installations
  during migration period. Lets clubs run our system as a side-car.

The last point is the **migration trick**: clubs do not need to switch
all at once. They can run MeOS as the official secretariat and our system
as a parallel kids'-finish-screen / live-board / QR-receipt service.
Adoption rises with trust.

---

## Non-goals

We are explicitly not building:

- **Map drawing.** Use OCAD, Purple Pen, or OpenOrienteering Mapper.
- **Course planning.** Use Purple Pen or Condes.
- **GPS replay.** Use Livelox or 2DRerun.
- **Custom hardware.** SportIdent and ROC are mature; we integrate.
- **A SportIdent killer.** We work with their ecosystem, not against it.

---

## Open questions

These are decisions deferred until we have working code in hand:

1. Does Electric scale to 30 000 concurrent public viewers at O-ringen,
   or do we need a CDN tier in front (Cloudflare Workers + KV)?
2. Should the edge-bridge auto-discover peers via mDNS/Bonjour, or do
   we require manual peer configuration?
3. Yjs for collaborative form editing — necessary in v0.1, or can we
   defer until multi-secretary use cases prove it out?
4. Payment integration — Swish Handel direct, or Stripe with Swish via
   their connector?
