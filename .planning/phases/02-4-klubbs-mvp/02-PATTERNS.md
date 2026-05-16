# Phase 2.0: 4-klubbs MVP — Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 12 new/extended file groups
**Analogs found:** 12 / 12 (full Phase 1 coverage)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/edge/src/eventor/cache.ts` | Background job (streaming ingest) | File-I/O + transactional bulk-upsert | `apps/edge/src/ingest/entryImport.ts` + `apps/edge/src/xml/parse.ts` | role-match (no streaming analog yet) |
| `apps/edge/src/eventor/boot.ts` | Background job (boot hook + admin trigger) | Event-driven (boot, admin button) | `apps/edge/src/backup/daily.ts` (handle pattern) + `apps/edge/src/bin/fartol.ts` (wiring) | role-match (no on-boot analog yet) |
| `apps/edge/src/integrations/meos/mip.ts` | Fastify route plugin | request-response (GET, serializes XML) | `apps/edge/src/routes/export.ts` (XML serialize) + `apps/edge/src/routes/clubs.ts` (param query) | role-match |
| `apps/edge/src/integrations/meos/mop.ts` | Fastify route plugin | request-response (POST XML body) | `apps/edge/src/routes/import.ts` (XML upload) + `apps/edge/src/ingest/entryImport.ts` (transactional ingest) | role-match |
| `apps/edge/src/integrations/meos/shared.ts` | Shared types | n/a (pure types + parser glue) | `apps/edge/src/xml/parse.ts` (typed normalizers) | role-match |
| `apps/edge/drizzle/0002_phase2.sql` (+ `meta`) | Migration | n/a | `apps/edge/drizzle/0000_initial.sql` + `apps/edge/src/db/schema.ts` | exact |
| `apps/edge/src/db/schema.ts` (extend) | DB schema | n/a (Drizzle TS table defs) | itself (same file) | exact |
| `apps/edge/src/privacy/retention.ts` (extend) | Background job (scrub extension) | CRUD (UPDATE) | itself (same file) | exact |
| `apps/web/src/lib/screens/WalkupModal.svelte` (extend) | Svelte form | request-response (POST competitor + lookup) | itself + `apps/web/src/lib/components/ClubAutocomplete.svelte` (debounced autocomplete) | exact + role-match |
| `apps/web/src/lib/screens/ReadoutView.svelte` (extend) | Svelte view | event-driven (WS subscribe) | itself (extend pendingConsentToast pattern) | exact |
| `docs/ops/parallel-meos-runbook.md` | Operator docs | n/a | no analog (first ops doc) — use README markdown conventions | no analog |
| `.planning/adr/0009-eventor-runner-cache.md` | ADR | n/a | `.planning/adr/0008-pii-in-append-only-event-log.md` | exact |

## Pattern Assignments

### 1. `apps/edge/src/eventor/cache.ts` (background job, streaming ingest)

**Analog 1 (transactional bulk-upsert):** `apps/edge/src/ingest/entryImport.ts`
**Analog 2 (XML parser config + entity-safe guard):** `apps/edge/src/xml/parse.ts`

**Why these analogs:**
- entryImport.ts is the only existing bulk-insert-from-XML pipeline. It already
  uses the inner-function + outer-`sqlite.transaction()` shape we need for
  the 252 919-row competitor upsert (atomic rollback on partial failure).
- xml/parse.ts establishes the `XMLParser` configuration we MUST inherit:
  `processEntities: false` + DOCTYPE/ENTITY pre-flight (T-FILE-IMPORT
  mitigation). Eventor's XML is from a trusted source (Eventor itself), but
  Phase 1 reviewers will reject any new XML ingest that doesn't match the
  hardened parser config — and they're right; the trust boundary is "what
  bytes show up on disk," not "what bytes Eventor sent."

**Imports pattern (from entryImport.ts lines 40-45):**
```typescript
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';

import type { DbHandle } from '../db/index.ts';
import { classes, clubs, competitors } from '../db/schema.ts';
import type { ParsedEntryList } from '../xml/parse.ts';
```

**Transactional bulk-upsert pattern (from entryImport.ts lines 91-135):**
```typescript
const distinctClubs = new Set<string>();
for (const e of data.competitors) {
  // ... per-row pre-flight checks ...
  handle.db
    .insert(competitors)
    .values({ id: crypto.randomUUID(), competitionId, name: e.name, ... })
    .run();
  competitorsCreated++;
  if (e.club !== null && e.club.length > 0) distinctClubs.add(e.club);
}
for (const clubName of distinctClubs) {
  handle.db
    .insert(clubs)
    .values({ name: clubName, lastSeenAtMs: nowMs })
    .onConflictDoUpdate({ target: clubs.name, set: { lastSeenAtMs: nowMs } })
    .run();
}
```

**Outer-transaction wrapper (from entryImport.ts lines 157-173):**
```typescript
export function ingestEntryList(
  handle: DbHandle, competitionId: string, data: ParsedEntryList,
  nowMs: number, opts: EntryImportOpts = {}
): EntryImportResult {
  if (opts.outerTransaction) return doIngest(handle, competitionId, data, nowMs);
  let result: EntryImportResult = { competitors_created: 0, classes_missing: [] };
  handle.sqlite.transaction(() => {
    result = doIngest(handle, competitionId, data, nowMs);
  })();
  return result;
}
```

**Entity-safe XMLParser config (from xml/parse.ts lines 93-104):**
```typescript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,          // T-FILE-IMPORT: disable entity expansion.
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  trimValues: true,
});
```

**Pre-flight DOCTYPE/ENTITY guard (from xml/parse.ts lines 115-124):**
```typescript
if (typeof xmlSource !== 'string' || xmlSource.length === 0) {
  throw new Error('Empty XML input');
}
if (/<!DOCTYPE/i.test(xmlSource)) {
  throw new Error('DOCTYPE not allowed');
}
if (/<!ENTITY/i.test(xmlSource)) {
  throw new Error('ENTITY declarations not allowed');
}
```

**What to copy / what to change:**
- **Copy verbatim:** the doIngest() inner-function + outer-`sqlite.transaction()`
  pattern; the distinctClubs set-after-success pattern (WR-001 in entryImport);
  the `processEntities: false` parser config; the DOCTYPE/ENTITY guard.
- **Change:** swap `XMLParser` for a streaming parser (`saxes` or
  `fast-xml-parser`'s `XMLParser` is in-memory and will blow 86 MB into
  ~500 MB of objects — researcher should evaluate `saxes` or `sax`).
  TRUNCATE+INSERT inside the transaction (Eventor refresh = full snapshot;
  same model as MOP `<MOPComplete>` D-MOP-2). Add a `last_refreshed_at_ms`
  marker in the `config` singleton table so the `eventor/boot.ts` 7-day
  staleness check (D-EV-2) has a query target. Insert in batches of ~1000
  rows so SQLite's prepared-statement cache doesn't thrash on 252 k unique
  prepares.

---

### 2. `apps/edge/src/eventor/boot.ts` (background job, boot hook + admin trigger)

**Analog 1 (boot wiring):** `apps/edge/src/bin/fartol.ts` lines 510-518
**Analog 2 (RetentionHandle / BackupHandle pattern):** `apps/edge/src/backup/daily.ts`

**Why these analogs:**
- bin/fartol.ts is where the daily backup + retention schedulers are wired
  today. Plan 2 should add the Eventor on-boot fetch (D-EV-1) at the same
  hook point (after buildServer, before listen) and decorate the app the
  same way (`app.fartolEventor = ...`) so the admin route can call `runNow()`.
- backup/daily.ts shows the canonical handle shape: `{ runNow(), stop() }`
  with internal `setTimeout`-chained scheduling. We don't need the recurring
  chain (D-EV-1 explicitly rejects cron — bridge is competition-only, not
  always-on), but the `runNow()`/`stop()` symmetry is the contract the admin
  route consumes.

**Existing wiring pattern (from bin/fartol.ts lines 510-518):**
```typescript
// Plan 17 — start the daily backup + retention schedulers. ...
const backup = scheduleDailyBackup(handle, { backupDir: opts.backupDir });
const retention = scheduleDailyRetention(handle, { retentionDays: opts.retentionDays });
app.fartolBackup = backup;
app.fartolRetention = retention;
```

**Shutdown wiring (from bin/fartol.ts lines 520-547):**
```typescript
const shutdown = async (code: number): Promise<void> => {
  try { if (lifecycle) await lifecycle.stop(); } catch { /* best-effort */ }
  try { backup.stop(); } catch { /* best-effort */ }
  try { retention.stop(); } catch { /* best-effort */ }
  try { await app.close(); } catch { /* best-effort */ }
  ...
};
```

**Handle shape (from backup/daily.ts lines 44-49):**
```typescript
export interface BackupHandle {
  /** Trigger a one-off backup right now (admin endpoint + tests). */
  runNow: () => Promise<{ dest: string }>;
  /** Cancel the scheduled chain. Idempotent. */
  stop: () => void;
}
```

**Admin route binding (from routes/admin.ts lines 59-71):**
```typescript
app.post('/api/__admin/run-backup-now', async (_req, reply) => {
  const backup = app.fartolBackup;
  if (!backup) {
    return reply.code(200).send({ ok: false, error: 'no_backup' });
  }
  try {
    const r = await backup.runNow();
    return reply.code(200).send({ ok: true, dest: r.dest });
  } catch (err) {
    app.log.error({ err }, 'run-backup-now failed');
    return reply.code(500).send({ ok: false, error: 'backup_failed' });
  }
});
```

**FastifyInstance decoration (from routes/admin.ts lines 96-101):**
```typescript
declare module 'fastify' {
  interface FastifyInstance {
    fartolBackup?: BackupHandle | undefined;
    fartolRetention?: RetentionHandle | undefined;
  }
}
```

**What to copy / what to change:**
- **Copy verbatim:** the `{ runNow(), stop() }` handle shape; the
  `app.fartolEventor` decoration pattern; the FARTOL_DEV admin-route gate
  (mirror admin.ts's `if (process.env['FARTOL_DEV'] !== '1') return;`).
- **Change:** no setTimeout chain. The boot path is one-shot: check `config`
  table for `last_eventor_refresh_at_ms`, compare to `Date.now() - 7d`, fetch
  if stale, log "Eventor: cache N dagar gammal" if not. Pull Eventor API key
  from `process.env['EVENTOR_API_KEY']` (loaded by `.eventor-env` dotenv —
  commit 7ec8866). Fetch should NOT block `app.listen()` — fire-and-forget
  with logging, matching the SI bridge's `void lifecycle.start();` pattern
  in bin/fartol.ts line 507. D-EV-3 mandates warn-and-run-with-cache on
  network failure — exception handler logs but does NOT throw.

---

### 3. `apps/edge/src/integrations/meos/mip.ts` (Fastify route plugin)

**Analog 1 (route shape + serialization):** `apps/edge/src/routes/export.ts`
**Analog 2 (param/querystring parsing):** `apps/edge/src/routes/clubs.ts`

**Why these analogs:**
- export.ts is the only existing route that builds an XML string from a DB
  query and streams it with `application/xml` Content-Type. MIP is the
  same shape: read events → serialize XML → return.
- clubs.ts shows the canonical Zod-driven querystring parsing for an
  optional integer (we need `lastid: z.coerce.number().int().nonnegative()`).

**Route registration shape (from export.ts lines 105-152):**
```typescript
export default async function registerExportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/api/competitions/:id/export/preview',
    async (req, reply) => {
      const { id } = req.params;
      const status = parseStatus(req.query.status);

      const compRow = app.fartolDb.db
        .select()
        .from(competitions)
        .where(eq(competitions.id, id))
        .get() as CompetitionRow | undefined;
      if (!compRow) {
        void reply.code(404).send({ error: 'competition_not_found' });
        return;
      }
      ...
    }
  );
}
```

**XML response wiring (from export.ts lines 203-207):**
```typescript
const slug = slugifyName(compRow.name);
void reply.header('Content-Type', 'application/xml; charset=utf-8');
void reply.header('Content-Disposition', `attachment; filename="${slug}-resultlist.xml"`);
return reply.code(200).send(result.build.xml);
```

**Querystring schema (from clubs.ts lines 21-26):**
```typescript
const ClubsQuery = z.object({
  prefix: z.string().max(120).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});
```

**Events query by local_seq (use seq.ts pattern — `nextLocalSeq` reverse):**
```typescript
// Equivalent of "WHERE local_seq > ?" — Drizzle ORM:
import { gt, and, eq } from 'drizzle-orm';
import { events } from '../../db/schema.ts';

const rows = app.fartolDb.db
  .select()
  .from(events)
  .where(and(
    eq(events.competitionId, competitionId),
    gt(events.localSeq, lastid),
    eq(events.eventType, 'card_bound'),
  ))
  .orderBy(events.localSeq)
  .all();
```

**XMLBuilder pattern (from xml/iofExport.ts):** import and use `new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true })` — see iofExport.ts header for XSD-aware element ordering.

**What to copy / what to change:**
- **Copy verbatim:** the `registerXxx(app: FastifyInstance)` plugin shape;
  the `Querystring` typing; the `application/xml` content-type header; the
  XMLBuilder usage from iofExport.ts.
- **Change:** route is `GET /mip` (NOT `/api/mip`) — MeOS hard-codes its
  poll URL and doesn't add the `/api` prefix. CORS allow-list in server.ts
  (`http://127.0.0.1` / `http://localhost`) does NOT cover the MeOS LAN
  origin; either widen the CORS for `/mip` only, or document that MeOS makes
  cross-origin requests with no preflight (it sends `GET` with no custom
  headers → no preflight required). D-MIP-1: NO auth (closed club LAN); the
  `pwd` query param MeOS may send is silently ignored. D-MIP-2: `lastid`
  reuses `events.local_seq` directly — no new state. Response shape per MIP
  XSD v3.0 (uploaded 2026-05-14, see `.planning/research/meos-protocols.md`):
  `<MIPData lastid="N"><entry>...</entry></MIPData>` with `<extId>` carrying
  the FartOL competitor UUID (D-MIP-4) and `<classname>` carrying the
  string class name (verified at `/home/jonas/src/meos/code/onlineinput.cpp:989-997`).
  Empty `lastid → 0` is valid; empty response is `<MIPData lastid="N"/>`.

---

### 4. `apps/edge/src/integrations/meos/mop.ts` (Fastify route plugin)

**Analog 1 (POST body + XML upload):** `apps/edge/src/routes/import.ts`
**Analog 2 (transactional ingest):** `apps/edge/src/ingest/entryImport.ts`

**Why these analogs:**
- import.ts is the only existing endpoint that accepts an XML body and
  routes it to a transactional ingester. Same data flow: read body → parse
  XML → validate → write inside `sqlite.transaction()` → respond.
- entryImport.ts provides the transactional-write template (D-MOP-2:
  TRUNCATE+INSERT inside a single transaction — partial-parse safe).

**Body parsing pattern (from import.ts lines 58-100):**
```typescript
app.post<{ Params: { id: string } }>('/api/competitions/:id/import', async (req, reply) => {
  const competitionId = req.params.id;
  const part = await req.file();
  if (!part) {
    return reply.code(400).send({ error: 'no_file', message: 'Förväntar en fil.' });
  }
  ...
  let bytes: Buffer;
  try { bytes = await part.toBuffer(); } catch (e) { ... }
  const xmlSource = bytes.toString('utf8');

  let parsed;
  try { parsed = parseIofXml(xmlSource); }
  catch (e) {
    return reply.code(400).send({
      error: 'parse_failed', ...
      detail: (e as Error).message,
    });
  }
  ...
});
```

**Multipart cap (from import.ts lines 53-56):**
```typescript
await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
```

**Transactional shadow-table write (from entryImport.ts lines 59-156):**
```typescript
function doIngest(handle: DbHandle, ...): EntryImportResult {
  // ... pre-load lookup maps ...
  for (const row of data.rows) {
    handle.db.insert(meosCompetitors).values({ ... }).run();
  }
  // ... post-loop bulk operations ...
}

export function ingestMop(handle, ...): IngestResult {
  let result;
  handle.sqlite.transaction(() => {
    result = doIngest(handle, ...);
  })();
  return result;
}
```

**What to copy / what to change:**
- **Copy verbatim:** the `registerXxx(app)` plugin shape; the
  `sqlite.transaction(() => doIngest(...))();` rollback-on-throw template;
  the per-row pre-flight check (replace with TRUNCATE+INSERT for `<MOPComplete>`).
- **Change:** route is `POST /mop` (NOT `/api/mop` — see MIP note). Body is
  raw XML, NOT multipart (MeOS POSTs `Content-Type: text/xml` directly);
  use Fastify `addContentTypeParser('text/xml', ...)` instead of multipart.
  XML body cap should be higher than 5 MB (MeOS exports can be larger);
  set `bodyLimit: 50 * 1024 * 1024` on the route. D-MOP-2 dispatch on root
  element: `<MOPComplete>` → TRUNCATE+INSERT on all three shadow tables in
  one transaction; `<MOPDiff>` → UPSERT by id + DELETE rows with
  `delete="true"`. D-MOP-3 reconciliation: after every successful MOP write,
  run the auto-merge subquery `INSERT INTO competitors SELECT ... FROM
  meos_competitors mc WHERE NOT EXISTS (SELECT 1 FROM competitors WHERE
  card_number = mc.card_number)` with `source='meos'` and
  `consent_status='pending_first_read'`. If insertions > 0, broadcast
  `wsBroadcast(readoutChannel(competitionId), { type: 'meos_merge', payload: { count: N }, ... })`
  so the readout view's toast picks it up. D-MIP-1 / D-MOP-4: NO auth; the
  route mounts whenever the bridge runs.

---

### 5. `apps/edge/src/integrations/meos/shared.ts` (shared types + XML helpers)

**Analog:** `apps/edge/src/xml/parse.ts`

**Why this analog:**
- parse.ts already establishes the convention for "normalized output shapes"
  (the `ParsedCourseData` / `ParsedEntryList` discriminated unions) plus
  the helper functions (`toArray`, `asNumber`, `asInt`, `asString`) that
  handle fast-xml-parser's one-vs-many duality. MIP/MOP need the same
  helpers and the same discriminated-union output style.

**Discriminated-union output shape (from xml/parse.ts lines 67-86):**
```typescript
export interface ParsedEntryList {
  kind: 'EntryList';
  event_name: string;
  competitors: Array<{
    name: string;
    club: string | null;
    class_name: string;
    card_number: number | null;
  }>;
}

export type ParsedXml =
  | { kind: 'CourseData'; data: ParsedCourseData }
  | { kind: 'EntryList'; data: ParsedEntryList };
```

**Normalization helpers (from xml/parse.ts lines 171-200):**
```typescript
type RawNode = Record<string, unknown> | undefined | null;

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function asString(x: unknown): string | null {
  if (x === undefined || x === null) return null;
  if (typeof x === 'string') return x.trim().length > 0 ? x.trim() : null;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  return null;
}

function asInt(x: unknown): number | null {
  const n = asNumber(x);
  if (n === null) return null;
  return Math.trunc(n);
}
```

**What to copy / what to change:**
- **Copy verbatim:** the `RawNode` type alias; `toArray`/`asString`/`asNumber`/`asInt`
  helpers (consider exporting them from `xml/parse.ts` so we don't fork);
  the discriminated-union `Parsed*` output shape.
- **Change:** new union members for `ParsedMop = { kind: 'MOPComplete' | 'MOPDiff';
  competitions: ..., classes: ..., clubs: ... }`. XML namespace handling:
  the MOP XSD declares an explicit namespace (`xmlns="http://www.melin.nu/mop"`
  per the v2.0 spec) while the MIP XSD declares
  `xmlns="http://www.melin.nu/mip"`; fast-xml-parser by default strips
  namespace prefixes, but the parser config in parse.ts doesn't configure
  `removeNSPrefix`. Test with a real MeOS payload from the research output
  (`.planning/research/meos-protocols.md` has sample payloads). Keep
  `processEntities: false` — same T-FILE-IMPORT mitigation applies.

---

### 6. `apps/edge/drizzle/0002_phase2.sql` + `meta/0002_snapshot.json` (migrations)

**Analog 1 (SQL shape):** `apps/edge/drizzle/0000_initial.sql`
**Analog 2 (TS schema → SQL bridge):** `apps/edge/src/db/schema.ts`
**Analog 3 (hand-authored migration co-existence):** `apps/edge/drizzle/0001_append_only_triggers.sql`

**Why these analogs:**
- 0000_initial.sql is the canonical example of the SQL-shape drizzle-kit
  generates: `CREATE TABLE`, `--> statement-breakpoint` separators,
  partial unique indexes on nullable columns.
- 0001_append_only_triggers.sql shows that hand-authored migrations CAN
  coexist with drizzle-kit's regenerated ones, provided we don't disturb
  `meta/_journal.json` ordering (codex C-H1 documented this).

**Existing partial-unique-index pattern (from 0000_initial.sql line 38):**
```sql
CREATE UNIQUE INDEX `competitors_card_per_comp`
  ON `competitors` (`competition_id`,`card_number`)
  WHERE "competitors"."card_number" IS NOT NULL;
```

**Existing FK + cascade (from 0000_initial.sql lines 33-36):**
```sql
CREATE TABLE `competitors` (
  `id` text PRIMARY KEY NOT NULL,
  `competition_id` text NOT NULL,
  ...
  FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`)
    ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`)
    ON UPDATE no action ON DELETE no action
);
```

**TS schema idiom (from db/schema.ts lines 227-266):**
```typescript
export const competitors = sqliteTable(
  'competitors',
  {
    id: text('id').primaryKey(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cardNumber: integer('card_number'),
    scrubbedAtMs: integer('scrubbed_at_ms'),
  },
  (t) => [
    uniqueIndex('competitors_card_per_comp')
      .on(t.competitionId, t.cardNumber)
      .where(sql`${t.cardNumber} IS NOT NULL`),
  ]
);
```

**Hand-authored migration pattern (from 0001_append_only_triggers.sql lines 12-16):**
```sql
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'events table is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'events table is append-only'); END;
```

**What to copy / what to change:**
- **Copy verbatim:** the FK + ON DELETE cascade pattern (every new
  competition-scoped table); `--> statement-breakpoint` separators between
  CREATE statements; partial unique indexes on nullable columns; the TS
  table-definition idiom in db/schema.ts.
- **Change:** the 6 new tables are NOT append-only (they're mutable mirrors —
  D-09 says CRUD is fine for non-event tables), so NO triggers. Use
  drizzle-kit's `pnpm db:generate` to produce 0002_phase2.sql (do NOT
  hand-author the SQL; let drizzle-kit derive it from the schema.ts
  additions). `eventor_competitors` should use `(family_name, given_name)`
  as a unique key OR a UUID PK plus an index — research/eventor-api-smoke.md
  recommends UUID PK + indexes on `(family_name, given_name)` and `si_card`.
  `hired_cards` PK = `(competition_id, card_number)` per D-HB-1. `meos_*`
  tables have NO competition_id FK — MeOS state is global to the bridge
  session, not scoped per-competition (per-competition would require MeOS
  to know our competition ids, which it doesn't).

---

### 7. `apps/edge/src/db/schema.ts` (extend with 6 tables)

**Analog:** itself — same file, same idiom.

**Why this analog:**
- Drizzle's schema-as-TS is the established pattern. We add 6 new
  `sqliteTable()` calls in the same file, mirroring the column-typing and
  index-declaration conventions already established for `competitors`,
  `events`, `clubs`.

**Existing table-definition idiom (from schema.ts lines 156-167 for `classes`):**
```typescript
export const classes = sqliteTable(
  'classes',
  {
    id: text('id').primaryKey(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    shortName: text('short_name'),
  },
  (t) => [uniqueIndex('classes_name_per_comp').on(t.competitionId, t.name)]
);
```

**Existing autocomplete-cache table (`clubs`, schema.ts lines 275-278):** the
closest direct analog for `eventor_clubs` because it's also a mutable
text-PK-name autocomplete source:
```typescript
export const clubs = sqliteTable('clubs', {
  name: text('name').primaryKey(),
  lastSeenAtMs: integer('last_seen_at_ms').notNull(),
});
```

**Existing scrub-column convention (from schema.ts lines 227-266 — `competitors`):**
```typescript
scrubbedAtMs: integer('scrubbed_at_ms'),
// + JSDoc: "REQ-PRIV-002 — set when PII columns nulled by plan 17 daily scrub;
//          non-null indicates an anonymized row."
```

**What to copy / what to change:**
- **Copy verbatim:** the JSDoc header pattern (lock-by references); the
  `text('column_name')` snake_case at the SQL boundary while keeping
  TS field names camelCase; the `(t) => [uniqueIndex(...)]` index declarations.
- **Change:**
  - `eventorCompetitors`: PK = `id text` (Eventor numeric id), columns
    `family_name`, `given_name`, `si_card integer` (nullable — only 96 918 /
    252 919 have SI cards), `club_id text` FK to `eventor_clubs.id`,
    `birth_year integer`. Indexes: `idx_eventor_si_card` (partial WHERE
    si_card IS NOT NULL); `idx_eventor_name` on `(family_name, given_name)`.
  - `eventorClubs`: PK = `id text` (Eventor numeric id), `name`,
    `short_name`.
  - `meosCompetitors`, `meosClasses`, `meosClubs`: mirror MeOS's `<cmp>`
    /`<cls>` /`<org>` shapes from MOP XSD v2.0. PK = MeOS internal id
    (`id text`). NO `competition_id` FK (these are global to the bridge
    session). Add a `last_mop_update_ms integer` audit column.
  - `hiredCards`: PK = `(competition_id, card_number)` per D-HB-1.
    Columns: `marked_at_ms`, `returned_at_ms` (nullable), `contact_name`,
    `contact_phone`, `contact_email`, `note`. ALL `contact_*` columns are
    PII and MUST be scrubbed by the extended retention scrubber (REQ-PRIV-002).
  - `competitors`: ADD `source text NOT NULL DEFAULT 'walkup'` column with
    `enum: ['walkup', 'entrylist', 'meos']` — D-MOP-3 auto-merge writes
    `source='meos'`.

---

### 8. `apps/edge/src/privacy/retention.ts` (extend)

**Analog:** itself — same file, same UPDATE-with-subquery pattern.

**Why this analog:**
- The existing `runOnce()` already updates `competitors.name/club/scrubbed_at_ms`
  with a single UPDATE using `sql\`competition_id IN (SELECT id FROM competitions
  WHERE date < ${cutoffDate})\``. The extension adds a second UPDATE
  inside the same function targeting `hired_cards.contact_*`.

**Existing scrub UPDATE (from retention.ts lines 110-120):**
```typescript
const result = handle.db
  .update(competitors)
  .set({ name: 'Anonymiserad', club: null, scrubbedAtMs: now() })
  .where(
    and(
      isNull(competitors.scrubbedAtMs),
      sql`competition_id IN (SELECT id FROM competitions WHERE date < ${cutoffDate})`
    )
  )
  .run();
return { scrubbed_count: result.changes, cutoff_date: cutoffDate };
```

**Existing JSDoc PII-call-out (from retention.ts lines 8-22):**
```typescript
// IMPORTANT — what is scrubbed:
//   - competitors.name (PII per REQ-PRIV-002) → 'Anonymiserad'
//   - competitors.club (PII per REQ-PRIV-002) → NULL
//   - competitors.scrubbed_at_ms (audit trail) → now()
//
// What is PRESERVED (RESEARCH A7 + research.md §6):
//   - competitors.card_number — hardware identifier, NOT PII
//   - competitors.consent_status + consent_at_ms — audit trail; ...
```

**What to copy / what to change:**
- **Copy verbatim:** the UPDATE-with-`IN` subquery pattern; the idempotency
  guard (`isNull(scrubbedAtMs)`); the per-row JSDoc PII call-out.
- **Change:** add a second UPDATE in the same `runOnce()` body:
  ```typescript
  const hiredResult = handle.db
    .update(hiredCards)
    .set({
      contactName: null, contactPhone: null, contactEmail: null,
      note: null, // note can carry PII per D-HB-3
    })
    .where(
      sql`competition_id IN (SELECT id FROM competitions WHERE date < ${cutoffDate})
          AND (contact_name IS NOT NULL OR contact_phone IS NOT NULL
               OR contact_email IS NOT NULL OR note IS NOT NULL)`
    )
    .run();
  return {
    scrubbed_count: result.changes + hiredResult.changes,
    cutoff_date: cutoffDate,
  };
  ```
  Extend the JSDoc PII block to list `hired_cards.contact_name/phone/email/note`
  as scrubbed columns. Keep `marked_at_ms` / `returned_at_ms` / `card_number`
  PRESERVED (audit trail + hardware ID; not PII).

---

### 9. `apps/web/src/lib/screens/WalkupModal.svelte` (extend)

**Analog 1 (self — overall form shape):** itself
**Analog 2 (debounced autocomplete):** `apps/web/src/lib/components/ClubAutocomplete.svelte`

**Why these analogs:**
- The existing WalkupModal already has the consent + Bricka + Klubb form
  surface. The extension is additive: relabel + new checkbox + expandable
  fieldset + new autocomplete source for the name field.
- ClubAutocomplete is the canonical "200ms-debounced fetch + datalist"
  pattern. The Eventor name + si-card autocompletes copy this verbatim
  with a new API endpoint (`/api/eventor/lookup?prefix=` or `?si_card=`).

**Existing form-field pattern (from WalkupModal.svelte lines 197-205):**
```svelte
<Field label={t('walk.class')} htmlFor="walkup-class">
  <Select id="walkup-class" data-testid="walkup-class" bind:value={classId} required>
    <option value="" disabled>{t('walk.classPlaceholder')}</option>
    {#each classes as cls (cls.id)}
      <option value={cls.id}>{cls.name}</option>
    {/each}
  </Select>
</Field>
```

**Existing 409 error path (from WalkupModal.svelte lines 116-128):**
```typescript
try { await createCompetitor({ ... }); close(); }
catch (e) {
  if (e instanceof ApiError && e.status === 409) {
    const body = e.body as { error?: string; existing_competitor_id?: string } | undefined;
    if (body && body.error === 'card_taken' && typeof body.existing_competitor_id === 'string') {
      cardTakenExistingId = body.existing_competitor_id;
    } else {
      fieldError = t('err.network');
    }
  } else {
    fieldError = (e as Error).message ?? t('err.network');
  }
}
```

**Existing debounced autocomplete (from ClubAutocomplete.svelte lines 30-46):**
```typescript
function scheduleFetch(prefix: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void doFetch(prefix);
  }, 200);
}

async function doFetch(prefix: string): Promise<void> {
  try {
    const trimmed = prefix.trim();
    const res = trimmed.length > 0
      ? await listClubs(trimmed, 50)
      : await listClubs(undefined, 50);
    suggestions = res.clubs.map((c) => c.name);
  } catch {
    suggestions = []; // Soft fail — autocomplete is non-essential.
  }
}
```

**Existing pre-fill hint pattern (from WalkupModal.svelte lines 53-69 — cardHolderHint):**
```typescript
interface Props {
  cardNumber: number;
  competitionId: string;
  classes: ClassDTO[];
  cardHolderHint?: string | null;
}
let { cardNumber, competitionId, classes, cardHolderHint = null }: Props = $props();

let name = $state(cardHolderHint && cardHolderHint.length > 0 ? cardHolderHint : '');
```

**What to copy / what to change:**
- **Copy verbatim:** the `Field` + `Input` + `Select` form layout; the
  `consent-row` checkbox pattern (replicate for Hyrbricka); the `cardHolderHint`
  pre-fill pattern (add `eventorHint` for the Eventor lookup); the
  200ms-debounced fetch helper from ClubAutocomplete.
- **Change:**
  - Relabel `t('walk.class')` → `t('walk.bana')` (Bana per locked decision #1).
    Add `bana.json` keys; keep `klass.json` as alias for Phase 2.1 (sanctioned
    events have real classes).
  - Add a `EventorAutocomplete.svelte` sibling component for the name field
    (parallel to ClubAutocomplete) backed by `GET /api/eventor/lookup?prefix=`
    (returns top 20 by name) AND a separate trigger for `?si_card=` (called
    when the operator types in or scans the Bricka field). On si_card hit,
    pre-fill BOTH `name` AND `club` (via the resolved `eventor_clubs.name`).
  - Add `hiredCard` boolean state ($state(false)) + `<input type="checkbox">`
    bound to it. When `hiredCard === true`, show an expandable fieldset
    with `<Input>` rows for `contactName` / `contactPhone` / `contactEmail` /
    `note` ($state strings). Validation: when `hiredCard === true`, at least
    one of `contactPhone` OR `contactEmail` must be non-empty (D-HB-3).
  - Extend the `createCompetitor()` payload with `hired_card: boolean` and
    `hired_contact: { name, phone, email, note } | null`. The edge POST
    handler in `routes/competitors.ts` extends to write a `hired_cards` row
    in the same `sqlite.transaction()` as the competitor row.

---

### 10. `apps/web/src/lib/screens/ReadoutView.svelte` (extend)

**Analog:** itself — same view, same WS subscription pattern, extend the
`pendingConsentToast` pattern.

**Why this analog:**
- ReadoutView already subscribes to the WS readoutChannel and dispatches on
  envelope type. The Hyrbricka finish-readout toast is structurally
  identical to the existing C-M4 consent toast: a derived state on each
  card_read that fires a one-time toast.

**Existing WS subscribe (from ReadoutView.svelte lines 310-320):**
```typescript
function connectWs(): void {
  if (typeof window === 'undefined') return;
  const wsUrl =
    window.location.protocol === 'https:'
      ? `wss://${window.location.host}/ws`
      : `ws://${window.location.host}/ws`;
  wsClient = new WsClient(wsUrl, handleWs);
  wsClient.preSubscribe(readoutChannel(competitionId));
  wsClient.preSubscribe(resultsChannel(competitionId));
  wsClient.connect();
}
```

**Existing card_read side-effect handler (the C-M4 consent toast pattern —
ReadoutView.svelte lines 416-437):**
```typescript
// C-M4: first card_read for a competitor whose consent_status ===
// 'pending_first_read' surfaces the one-time confirmation toast.
if (top && top.competitor_id && !top.unmatched && pendingConsentToast === null) {
  const competitor = competitorsById.get(top.competitor_id);
  if (
    competitor &&
    competitor.consent_status === 'pending_first_read' &&
    !dismissedConsentForCompetitorIds.has(competitor.id)
  ) {
    const cls = classesById.get(competitor.class_id);
    pendingConsentToast = {
      competitorId: competitor.id,
      competitorName: competitor.name,
      className: cls?.name ?? '—',
    };
  }
}
```

**Existing toast helper (from ReadoutView.svelte lines 570-577):**
```typescript
function toast(msg: string): void {
  toastMessage = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage = null;
  }, 3000);
}
```

**Toast render (from ReadoutView.svelte lines 668-670):**
```svelte
{#if toastMessage}
  <div class="toast" role="status" data-testid="toast">{toastMessage}</div>
{/if}
```

**Existing modal-on-derived-state render (ReadoutView.svelte lines 681-688 — pendingConsentToast):**
```svelte
{#if pendingConsentToast}
  <ConsentConfirmationToast
    competitorId={pendingConsentToast.competitorId}
    competitorName={pendingConsentToast.competitorName}
    className={pendingConsentToast.className}
    onResolved={onConsentToastResolved}
  />
{/if}
```

**What to copy / what to change:**
- **Copy verbatim:** the WS connect/subscribe shape; the C-M4
  pendingConsentToast pattern (extend with `pendingHyrbrickaToast`); the
  `dismissedConsentForCompetitorIds: Set<string>` pattern (mirror as
  `returnedHiredCardNumbers: Set<number>` so the toast doesn't re-pop
  after the operator marks Returnerad); the modal-on-state render block.
- **Change:**
  - Add `pendingHyrbrickaToast: { cardNumber, contactName, contactPhone, ... } | null`
    state. On every card_read, query `EXISTS (SELECT 1 FROM hired_cards
    WHERE card_number = ? AND returned_at_ms IS NULL)` via a new endpoint
    `GET /api/competitions/:id/hired-cards/:cardNumber` (or include in
    `/readout` response — single source of truth). If hit AND
    `!returnedHiredCardNumbers.has(cardNumber)`, set the toast.
  - Render the toast with red urgency styling: `<HyrbrickaToast />` (new
    sibling of ConsentConfirmationToast) showing
    `t('readout.hyrbricka.title')` ("⚠️ Hyrbricka — be om att få tillbaka
    brickan!"), the contact fields if present, and a "Returnerad" button.
    Click → `POST /api/competitions/:id/hired-cards/:cardNumber/return` →
    `returnedHiredCardNumbers.add(cardNumber)` and dismiss.
  - Optional: WebSocket subscription for MOP-merge toast (D-MOP-3): subscribe
    to a new envelope `type: 'meos_merge'` with `payload: { count: N }`.
    Show `t('readout.meosMerge', { count })` toast. Use the existing
    `toast(msg)` helper.

---

### 11. `docs/ops/parallel-meos-runbook.md` (operator playbook)

**Analog:** no existing ops doc — first one. Closest reference is
`apps/edge/README.md` (operator deployment guidance per ADR-0008).

**Why no analog:**
- `docs/` today contains demo HTML, screenshots, and event fixtures; no
  Markdown ops runbook exists. The closest tone is `apps/edge/README.md`
  (referenced from ADR-0008 line 96 for "disk-encryption advice in
  apps/edge/README.md"), which is operator-facing but app-scoped, not
  event-procedural.

**Suggested skeleton (operator-procedural format):**
```markdown
# Parallel MeOS + FartOL runbook

**Audience:** Stora Tuna OK competition operators running FartOL as primary
with MeOS as parallel safety backup (locked decision #2).
**Tested on:** 4-klubbs training, 2026-05-20.

## Before the event (T-2 hours)

1. Power on the FartOL laptop. Plug in BSM7/8 SI reader to `/dev/ttyUSB0`.
2. Power on the MeOS laptop. Connect both laptops to the same LAN switch.
   Verify ping: `ping <fartol-laptop-ip>` from MeOS.
3. On FartOL: `fartol --port 3000 --bind-host 0.0.0.0 --allow-lan
   --competition-id <id>`. Confirm the readout page is reachable at
   `http://<fartol-ip>:3000/competition/<id>/readout` from the MeOS laptop.
4. On MeOS: open Anmälningsläge. Tools → Online → Configure MIP+MOP:
   - MIP URL: `http://<fartol-ip>:3000/mip` (no password — closed club LAN).
   - MOP URL: `http://<fartol-ip>:3000/mop`.
   - Poll interval: 5 seconds.
5. **Pre-flight check**: confirm the five 4-klubbs classes
   (Vit / Grön / Gul / Orange / Violett) are set up in MeOS (D-MIP-4
   precondition — MIP `<entry>` uses `<classname>` string lookup).

## During the event

[ ... per-role steps ... ]

## When something breaks

[ ... failure-fallback matrix ... ]

## After the event

[ ... reconciliation steps + Eventor results upload ... ]

## Known limitations (Phase 2.0)

- **D-LIM-1**: MOP `<cmp>` does NOT carry the hired flag. Hyrbrickor
  marked in MeOS during a FartOL outage will NOT auto-import on recovery;
  re-enter manually in FartOL.
- **Multi-course-per-card same event**: Phase 2.0 limits one course per
  card per competition. Workaround for the H45+open-course case: register
  the runner twice with two different cards.
```

**What to copy / what to change:**
- **Copy:** the project's existing Conventional-Commits headline tone +
  Swedish-first audience framing (Phase 1 D-02). Use the same Markdown
  heading hierarchy as `.planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md`.
- **Change:** this is operator-facing, NOT engineer-facing. Procedural
  numbered steps, Swedish UI labels for screen elements, screenshots
  inline where useful (operators are stressed; visual cues save minutes).

---

### 12. `.planning/adr/0009-eventor-runner-cache.md` (ADR)

**Analog:** `.planning/adr/0008-pii-in-append-only-event-log.md`

**Why this analog:**
- ADR-0008 is the most recent ADR and follows the same `MADR 3.0` template
  used across `.planning/adr/`. ADR-0009 is structurally similar: a
  trade-off ADR (privacy vs. operational utility) requested by a parallel
  agent's research output (`.planning/research/eventor-api-smoke.md`).

**Existing frontmatter (from 0008 lines 1-7):**
```markdown
---
status: accepted
date: 2026-05-16
decision-makers: [Jonas Hagberg]
consulted: [gemini-code-assist code review on PR #3]
informed: []
---
```

**Existing structure (0008 lines 9-108):**
```markdown
# {Title}

## Context and Problem Statement
{2-3 paragraphs}

## Decision Drivers
- {bulleted, evidence-anchored}

## Considered Options
- **A. {option}.** {explanation + trade-offs}
- **B. {option}.** ...
- **C. {option}.** ...

## Decision Outcome
Chosen option: **{letter} — {summary}.**
{paragraph explaining the choice}

The {pattern at the implementation site is locked here}.

The residual {trade-off} is mitigated by:
1. ...
2. ...
3. ...

### Consequences
- Good, because ...
- Good, because ...
- Bad, because ...
- Bad, because ...

### Confirmation
- `path/to/file.ts` comment block in lines N-M documents the trade-off at
  the implementation site.
- ...
- This ADR is the cross-reference target from REQ-XXX.

## More Information
- REQ-XXX — `.planning/REQUIREMENTS.md`
- Implementation: `path/to/file.ts`
- Originating: {issue / PR / research output}
```

**What to copy / what to change:**
- **Copy verbatim:** the MADR frontmatter; the section headings (Context,
  Decision Drivers, Considered Options, Decision Outcome with Consequences
  + Confirmation, More Information); the "residual exposure is mitigated by:
  1. 2. 3." pattern.
- **Change:** title is "Eventor löpardatabasen cached locally for walk-up
  autocomplete". Context covers the 252 919 PII records (name + birth
  year + SI card) downloaded once per week and stored in `eventor_competitors`.
  Decision drivers: REQ-OPS-001 (no internet required) + REQ-PRIV-002 (30-day
  retention) + Eventor ToS ("members fetched once per day is plenty") +
  D-EV-2 (7-day staleness) + research/eventor-api-smoke.md confirmation
  that the endpoint is open to club-level keys. Options: (A) Inline lookup
  via Eventor API at walk-up time (rejected: REQ-OPS-001 + latency); (B)
  weekly cache, local-only (chosen); (C) per-club subset by chasing
  organisation membership (rejected: cachedcompetitors is national and
  open). Residual mitigations: local-only (no LAN exposure of the cache);
  no phone/email columns (none in the upstream payload); clear-cache admin
  endpoint; weekly refresh respects ToS; cache stays OUT of the
  events table (no retention conflict — re-fetchable any time).

---

## Shared Patterns

### S-1: Fastify route plugin shape (apply to: mip.ts, mop.ts)

**Source:** `apps/edge/src/routes/clubs.ts` (smallest example)
```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export default async function registerXxx(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { ... } }>('/path', async (req, reply) => {
    const parsed = SomeSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(issuesToErrors(parsed.error.issues));
    ...
    return { ... };  // or: return reply.code(N).send({...});
  });
}
```
**And:** wire the plugin in `apps/edge/src/server.ts` via `await app.register(registerXxx);`
**Per ADR-0002 + ADR-0007:** Fastify is the locked HTTP framework; do not
introduce express/koa.

### S-2: Transactional DB ingest (apply to: cache.ts, mop.ts)

**Source:** `apps/edge/src/ingest/entryImport.ts` lines 157-173
```typescript
function doIngest(handle, ...) { /* per-row work inside */ }

export function ingestXxx(handle, ..., opts: { outerTransaction?: boolean } = {}) {
  if (opts.outerTransaction) return doIngest(handle, ...);
  let result;
  handle.sqlite.transaction(() => {
    result = doIngest(handle, ...);
  })();
  return result;
}
```
**Why:** rollback-on-throw atomicity; supports both standalone and
`from-wizard`-style atomic compositions. Phase 2.0 only needs the
standalone path, but keep the `opts.outerTransaction` seam for Phase 2.1.

### S-3: events table inserts via `app.fartolNextLocalSeq` (apply to: routes that emit events)

**Source:** `apps/edge/src/routes/competitors.ts` lines 220-241
```typescript
seq = app.fartolNextLocalSeq(app.fartolDb, app.fartolNodeId);
app.fartolDb.db
  .insert(events)
  .values({
    nodeId: app.fartolNodeId,
    localSeq: seq,
    competitionId,
    eventType: 'card_bound',
    eventTimeMs: now, recordedAtMs: now,
    payload: { event_type: 'card_bound', ...},
  })
  .run();
```
**Why:** PATTERNS S-2 injection — tests swap in throwing fn to verify
transactional atomicity. MIP needs this if Plan 3 ever extends to emit
synthetic events for state changes (D-MIP-3 says it should NOT, but a
future card-replace UPDATE may).

### S-4: PATTERNS S-2 broadcast wiring (apply to: mop.ts — D-MOP-3 toast)

**Source:** `apps/edge/src/routes/competitors.ts` lines 269-282
```typescript
app.wsBroadcast(readoutChannel(competition_id), {
  type: 'card_bound',  // or 'meos_merge', 'hired_card_marked', etc.
  payload: { ... },
  seq,
});
app.projectionStore.markDirty(competition_id);
```
**Why:** broadcast AFTER commit so subscribers only see committed state.
markDirty triggers debounced results recompute.

### S-5: Drizzle pre-flight checks before transaction (apply to: cache.ts, mop.ts)

**Source:** `apps/edge/src/routes/competitors.ts` lines 145-204
- Verify FK target exists → return 404
- Verify partial-unique-index won't collide → return 409 with
  `existing_xxx_id` for structured client handling
- Open the `sqlite.transaction()` only AFTER pre-flights pass

**Race-safety net:** the partial unique index catches concurrent inserts
that race past the pre-flight SELECT — the `isCardCollisionError(err)`
catch (competitors.ts lines 114-119) converts a raw `SQLITE_CONSTRAINT_UNIQUE`
into the same structured 409 the pre-flight returns.

### S-6: snake_case at the JSON boundary, camelCase in TS (apply to: all)

**Source:** repository convention — `apps/edge/src/db/schema.ts` columns are
snake_case (`event_type`, `card_number`, `competition_id`) at the SQL layer;
Drizzle TS field names are camelCase (`eventType`, `cardNumber`, `competitionId`);
DTOs in `@fartol/shared-types` use snake_case (`competition_id`, `card_number`).

### S-7: T-FILE-IMPORT XML parser hardening (apply to: cache.ts, shared.ts)

**Source:** `apps/edge/src/xml/parse.ts` lines 93-124
- `processEntities: false` on every `XMLParser` instance
- DOCTYPE regex pre-flight → throw on match
- ENTITY regex pre-flight → throw on match

Eventor + MeOS feeds are nominally trusted, but the bytes-on-disk attack
surface is the same as Phase 1's Purple Pen import. PR review will reject
any XML ingest that doesn't match this hardening.

### S-8: i18next Swedish-first keys (apply to: WalkupModal.svelte, ReadoutView.svelte)

**Source:** Phase 1 D-02 — all user-facing strings as i18next keys with
`sv.json` + `en.json` populated from day one. New Phase 2.0 keys (per
Claude's Discretion in 02-CONTEXT.md):
- `walk.hyrbricka` / `walk.hyrbricka.contact.*` (Hyrbricka checkbox + fields)
- `walk.bana` (replaces / aliases `walk.class`)
- `readout.hyrbricka.title` (⚠️ Hyrbricka toast)
- `readout.hyrbricka.returned` (Returnerad button)
- `readout.eventor.cache.stale` (Eventor: cache N dagar gammal)
- `readout.eventor.offline` (Eventor: offline)
- `readout.meosMerge` (N löpare hämtade från MeOS)

UI-SPEC can polish wording before plan execution.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `docs/ops/parallel-meos-runbook.md` | Operator docs | n/a | First operator-facing runbook in `docs/`. Use README.md tone + skeleton above. |

(All other files have at least a role-match analog in the Phase 1 codebase.)

---

## Metadata

**Analog search scope:**
- `apps/edge/src/` (server, routes, db, ingest, xml, privacy, backup, ws, si, projection, bin)
- `apps/web/src/lib/` (screens, components)
- `apps/edge/drizzle/` (migrations)
- `.planning/adr/` (ADR template + 0001..0008)
- `docs/` (no analog for ops runbook)

**Files scanned:** ~40 source files (Edge), ~10 components (Web), 2 migration
files, 9 ADRs.

**Pattern extraction date:** 2026-05-16 22:10 GMT+2.

**Cross-references for the planner:**
- 02-CONTEXT.md `<canonical_refs>` Phase 1 code lists the same target files
  with shorter rationales — this PATTERNS.md adds the concrete code
  excerpts.
- 02-CONTEXT.md `<code_context>` "Reusable Assets" and "Integration Points"
  enumerate the surface area; this PATTERNS.md commits the
  copy-this-pattern decisions per file.
- `.planning/research/meos-protocols.md` and `.planning/research/eventor-api-smoke.md`
  are the wire-format references; this PATTERNS.md tells the planner
  WHICH local file is the canonical idiom for each new file.
