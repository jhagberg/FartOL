# Phase 1: Single-laptop training MVP — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 49 new / 1 modified (root `pnpm-workspace.yaml`)
**Analogs found:** 18 with in-repo analog / 49

**Greenfield reality:** Phase 1 introduces three new workspace members (`apps/edge/`,
`apps/web/`, `packages/shared-types/`) plus repo-root tooling. The only in-repo
codebase to copy from is `packages/sportident/` (Phase 0). For Fastify routes,
Drizzle schema, SvelteKit components, IOF XML import/export, ESC/POS, and i18n
catalogs there is **no in-repo analog** — the planner must lean on RESEARCH.md
Patterns 1–7 + UI-SPEC code excerpts for those. This file flags each such case
explicitly under "No Analog Found."

---

## File Classification

### Edge tier (`apps/edge/`)

| New file                               | Role                  | Data flow                       | Closest analog                                                                                      | Match                                                        |
| -------------------------------------- | --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/edge/package.json`               | config                | n/a                             | `packages/sportident/package.json`                                                                  | exact (package manifest shape)                               |
| `apps/edge/tsconfig.json`              | config                | n/a                             | `packages/sportident/tsconfig.json`                                                                 | exact                                                        |
| `apps/edge/tsup.config.ts`             | config / build        | n/a                             | `packages/sportident/tsup.config.ts`                                                                | exact (multi-entry + node22 target)                          |
| `apps/edge/src/server.ts`              | server / bootstrap    | request-response + event-driven | (none)                                                                                              | greenfield — RESEARCH Pattern 3                              |
| `apps/edge/src/bin/fartola.ts`         | bin / entrypoint      | event-driven                    | `packages/sportident/src/bin/fartola-readout.ts`                                                    | role-match (binary entrypoint w/ argv + lifecycle + SIGINT)  |
| `apps/edge/src/db/schema.ts`           | model                 | CRUD + append-only              | (none)                                                                                              | greenfield — RESEARCH Pattern 1                              |
| `apps/edge/src/db/migrate.ts`          | utility / migration   | n/a                             | (none)                                                                                              | greenfield — RESEARCH Pattern 2                              |
| `apps/edge/src/db/index.ts`            | db handle             | request-response                | (none)                                                                                              | greenfield — RESEARCH Pattern 2                              |
| `apps/edge/src/routes/competitions.ts` | controller / REST     | CRUD                            | (none)                                                                                              | greenfield — RESEARCH Pattern 1+3                            |
| `apps/edge/src/routes/events.ts`       | controller / REST     | streaming + CRUD                | (none)                                                                                              | greenfield — RESEARCH Pattern 4+5                            |
| `apps/edge/src/routes/import.ts`       | controller / file-I/O | transform                       | (none)                                                                                              | greenfield — RESEARCH §"Code Examples" (course/entry import) |
| `apps/edge/src/routes/export.ts`       | controller / file-I/O | transform                       | (none)                                                                                              | greenfield — RESEARCH Pattern 7                              |
| `apps/edge/src/ws/index.ts`            | middleware / pub-sub  | event-driven                    | (none)                                                                                              | greenfield — RESEARCH Pattern 4                              |
| `apps/edge/src/ws/channels.ts`         | utility / pub-sub     | event-driven                    | (none)                                                                                              | greenfield — RESEARCH Pattern 4                              |
| `apps/edge/src/si/bridge.ts`           | service / adapter     | event-driven                    | `packages/sportident/src/bin/fartola-readout.ts`                                                    | **exact** (wire `SiMainStation` events → sink)               |
| `apps/edge/src/projection/results.ts`  | service / reducer     | transform                       | (none)                                                                                              | greenfield — RESEARCH Pattern 5                              |
| `apps/edge/src/projection/dnf-mp.ts`   | service / reducer     | transform                       | (none)                                                                                              | greenfield — RESEARCH Pattern 5                              |
| `apps/edge/src/print/escpos.ts`        | service / driver      | file-I/O                        | (none)                                                                                              | greenfield — RESEARCH Pattern 6                              |
| `apps/edge/src/backup/daily.ts`        | service / scheduler   | file-I/O                        | (none)                                                                                              | greenfield — RESEARCH §"Daily backup" excerpt                |
| `apps/edge/test/*.test.ts`             | test                  | n/a                             | `packages/sportident/src/output/ndjson.test.ts` + `packages/sportident/src/integration/e2e.test.ts` | exact (node:test style)                                      |

### Web tier (`apps/web/`)

| New file                                                    | Role                 | Data flow        | Closest analog                     | Match                                                                                   |
| ----------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/package.json`                                     | config               | n/a              | `packages/sportident/package.json` | partial (web has vitest + playwright instead of node:test)                              |
| `apps/web/svelte.config.js`                                 | config / build       | n/a              | (none)                             | greenfield — RESEARCH §"svelte.config.js" excerpt                                       |
| `apps/web/vite.config.ts`                                   | config / build       | n/a              | (none)                             | greenfield — RESEARCH Pitfall 2 (proxy block)                                           |
| `apps/web/src/lib/i18n.ts`                                  | utility / bootstrap  | request-response | (none)                             | greenfield — RESEARCH Pitfall 10                                                        |
| `apps/web/src/lib/i18n/sv.json`, `en.json`                  | config / data        | n/a              | (none)                             | greenfield — port verbatim from `01-SKETCHES/.../i18n.js` (UI-SPEC §Copywriting LOCKED) |
| `apps/web/src/lib/ws-client.ts`                             | service / transport  | event-driven     | (none)                             | greenfield — RESEARCH §"WebSocket client wrapper" excerpt + UI-SPEC §"Auto-reconnect"   |
| `apps/web/src/lib/tweaks.svelte.ts`                         | store / state        | event-driven     | (none)                             | greenfield — Svelte 5 runes + localStorage                                              |
| `apps/web/src/lib/tokens.css`                               | config / styles      | n/a              | (none)                             | greenfield — UI-SPEC §Color (oklch tokens, LOCKED)                                      |
| `apps/web/src/routes/+layout.svelte`                        | component / shell    | request-response | (none)                             | greenfield — UI-SPEC §"Layout shell"                                                    |
| `apps/web/src/routes/+page.svelte`                          | component / screen   | request-response | (none)                             | greenfield — UI-SPEC §HomeView                                                          |
| `apps/web/src/routes/competition/[id]/+page.svelte`         | component / screen   | request-response | (none)                             | greenfield — UI-SPEC §Wizard                                                            |
| `apps/web/src/routes/competition/[id]/readout/+page.svelte` | component / screen   | event-driven     | (none)                             | greenfield — UI-SPEC §ReadoutView                                                       |
| `apps/web/src/routes/competition/[id]/results/+page.svelte` | component / screen   | event-driven     | (none)                             | greenfield — UI-SPEC §"Live results auto-update"                                        |
| `apps/web/src/routes/competition/[id]/walkup/+page.svelte`  | component / overlay  | request-response | (none)                             | greenfield — UI-SPEC §"Walk-up modal"                                                   |
| `apps/web/src/routes/competition/[id]/export/+page.svelte`  | component / screen   | request-response | (none)                             | greenfield — UI-SPEC §Export                                                            |
| `apps/web/src/lib/components/*.svelte`                      | component primitives | n/a              | (none)                             | greenfield — UI-SPEC §"Component Inventory"                                             |
| `apps/web/tests/*.test.ts`                                  | test                 | n/a              | (none)                             | greenfield — vitest, no in-repo analog                                                  |
| `tests/e2e/*.spec.ts`                                       | test (e2e)           | n/a              | (none)                             | greenfield — Playwright, no in-repo analog                                              |

### Shared types (`packages/shared-types/`)

| New file                              | Role             | Data flow | Closest analog                                                           | Match                                                                                             |
| ------------------------------------- | ---------------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `packages/shared-types/package.json`  | config           | n/a       | `packages/sportident/package.json`                                       | **exact** (workspace package manifest; difference: no build step → `"exports": "./src/index.ts"`) |
| `packages/shared-types/tsconfig.json` | config           | n/a       | `packages/sportident/tsconfig.json`                                      | **exact**                                                                                         |
| `packages/shared-types/src/index.ts`  | barrel / exports | n/a       | `packages/sportident/src/index.ts`                                       | **exact** (named re-exports only, no default)                                                     |
| `packages/shared-types/src/events.ts` | model / types    | n/a       | `packages/sportident/src/output/ndjson.ts` (types section, lines 35–102) | **exact** (`schema_version: 1` event union — re-export or mirror)                                 |
| `packages/shared-types/src/dtos.ts`   | model / types    | n/a       | (none)                                                                   | greenfield — REST DTO shapes derived from Drizzle                                                 |
| `packages/shared-types/src/db.ts`     | model / types    | n/a       | (none)                                                                   | greenfield — Drizzle `$inferSelect` row types                                                     |

### Repo-root additions

| New / modified file            | Role   | Data flow | Closest analog                      | Match                                      |
| ------------------------------ | ------ | --------- | ----------------------------------- | ------------------------------------------ |
| `pnpm-workspace.yaml` (modify) | config | n/a       | current `pnpm-workspace.yaml`       | exact (append `'apps/*'` line)             |
| `playwright.config.ts`         | config | n/a       | (none)                              | greenfield — no in-repo analog             |
| `package.json` (modify)        | config | n/a       | current root `package.json` scripts | exact (append `test:quick`, `e2e` scripts) |

---

## Pattern Assignments

### `apps/edge/src/bin/fartola.ts` (bin / entrypoint, event-driven)

**Analog:** `packages/sportident/src/bin/fartola-readout.ts`

**Shebang + ESM entrypoint guard** (lines 1, 312–325):

```typescript
#!/usr/bin/env node
// ...
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const isEntrypoint = ((): boolean => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isEntrypoint)
  main().catch((err: unknown) => {
    /* structured fatal */
  });
```

**Minimal hand-rolled argv parsing** (lines 86–137): no `commander`/`yargs` dep.
For `apps/edge/bin/fartola.ts` the flags will be `--port`, `--db-path`,
`--bind-host` (per RESEARCH §"Security Domain V14 Configuration").

**Centralised shutdown + SIGINT + uncaught error handler** (lines 257–294):

```typescript
const shutdown = async (code: number): Promise<void> => {
  try {
    await station.close();
  } catch {
    /* best-effort */
  }
  // … flush sinks …
  process.exit(code);
};
process.on('SIGINT', () => {
  void shutdown(0);
});
station.on('error', (err: Error) => {
  /* emit structured event, exit 3 */
});
```

Apply to `apps/edge/bin/fartola.ts` for `app.close()` (Fastify) + `db.close()` +
SI bridge close. Also wires `process.on('uncaughtException')` per RESEARCH
Pitfall 9.

---

### `apps/edge/src/si/bridge.ts` (service / adapter, event-driven) — **EXACT analog**

**Analog:** `packages/sportident/src/bin/fartola-readout.ts` lines 187–254

**Construct transport + station + wire all five events**:

```typescript
emitter.connection_changed({ state: 'opening' });
const transport = new SerialTransport({ path: opts.device, baudRate: 38400 });
const station = new SiMainStation(transport);

station.on('cardInserted', (card: BaseSiCard) => {
  emitter.card_inserted({
    card_type: inferCardType(card.cardNumber),
    card_number: card.cardNumber,
    ...(card.cardSeriesByte !== undefined ? { card_series_byte: card.cardSeriesByte } : {}),
  });
});
station.on('cardRead', (card: BaseSiCard) => { emitter.card_read({ card }); /* … */ });
station.on('cardRemoved', (cardNumber: number) =>
  emitter.card_removed({ card_number: cardNumber })
);
station.on('frameError', (err: FrameError) => { emitter.frame_error(err); /* … */ });
station.on('connectionChanged', (state, err?) => { emitter.connection_changed({ state, … }); });
```

**The bridge's job is to swap the emitter sink:** instead of NDJSON to stdout,
the Phase 1 bridge inserts each event into the SQLite event log (RESEARCH
§"Code Examples — Wire SI events into the SQLite event log") and broadcasts
the typed envelope via `wsBroadcast` (RESEARCH Pattern 4). The five `station.on(...)`
calls are the locked surface — copy them verbatim.

**Reconnect-with-backoff** (RESEARCH Pitfall 4 — serialport EBUSY): wrap
`transport.open()` in 250ms → 500ms → 1s → 2s retry chain. Not present in the
Phase 0 bin; new code, but the lifecycle event surface
(`connection_changed: 'opening' | 'open' | 'error'`) is already emitted.

---

### `apps/edge/package.json` (config)

**Analog:** `packages/sportident/package.json`

**Shape to copy**:

```jsonc
{
  "name": "@fartola/edge",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.18.0" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs" } },
  "bin": { "fartola": "./dist/bin/fartola.cjs" },
  "scripts": {
    "build": "tsup",
    "test": "node --test --test-reporter=spec 'src/**/*.test.ts'",
    "test:watch": "node --test --watch --test-reporter=spec 'src/**/*.test.ts'",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
  },
}
```

Mirror exactly. Difference vs. sportident: `dependencies` add Fastify stack +
Drizzle + node-thermal-printer + libxmljs2-xsd + `@fartola/sportident@workspace:*`

- `@fartola/shared-types@workspace:*` per RESEARCH §"Installation (apps/edge/)".

---

### `apps/edge/tsconfig.json` (config)

**Analog:** `packages/sportident/tsconfig.json`

**Verbatim copy**:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Root `tsconfig.json` already locks `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `verbatimModuleSyntax`,
`allowImportingTsExtensions`. New packages just extend it.

---

### `apps/edge/tsup.config.ts` (config / build)

**Analog:** `packages/sportident/tsup.config.ts`

**Shape to copy** (verbatim with two entry-point changes):

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/bin/fartola.ts'], // ← change
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  outDir: 'dist',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' };
  },
  esbuildOptions(options) {
    options.logOverride = { ...options.logOverride, 'empty-import-meta': 'silent' };
  },
});
```

The explicit `.mjs`/`.cjs` `outExtension` is load-bearing because the published
tarball's `bin` field resolves to `./dist/bin/fartola.cjs`.

---

### `apps/edge/test/*.test.ts` (test)

**Analog (unit):** `packages/sportident/src/output/ndjson.test.ts`
**Analog (integration):** `packages/sportident/src/integration/e2e.test.ts` + `packages/sportident/src/integration/benchReplay.test.ts`

**Unit-test header pattern** (ndjson.test.ts lines 17–32):

```typescript
import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
// … production imports …

const MOCKED_TS_MS = 1715543532471;
const setMockedClock = (): void => {
  mock.method(Date, 'now', () => MOCKED_TS_MS);
};

describe('NdjsonEmitter', () => {
  test('connection_changed: emits one JSON.parse-able line …', () => {
    setMockedClock();
    // arrange / act / assert …
  });
});
```

**Integration / pipeline-replay pattern** (e2e.test.ts lines 15–73):

- `import { describe, test } from 'node:test'; import assert from 'node:assert/strict';`
- Inline a small `FakeSerialTransport extends EventEmitter implements ISerialTransport` (or in Phase 1: `FakeDb`, `FakePrinter`) — zero dependencies on test scaffolding.
- Capture sink output via injected callback (`out: (line) => lines.push(line)`),
  not by monkey-patching `process.stdout`.

**Fixture-relative path resolution** (benchReplay.test.ts lines 45–49):

```typescript
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '..', '..', 'tests', 'fixtures', 'jonas');
```

Use this exact pattern for `apps/edge/test/iof-fixtures/` paths (Purple Pen XML,
IOF EntryList, IOF ResultList). `process.cwd()` lies under pnpm workspaces.

---

### `packages/shared-types/package.json` (config) — **EXACT analog**

**Analog:** `packages/sportident/package.json`

**Diff** (no build, no `bin`, no `dependencies`):

```jsonc
{
  "name": "@fartola/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.18.0" },
  "exports": { ".": "./src/index.ts" }, // ← pure-TS, no dist
  "scripts": {
    "test": "node --test --test-reporter=spec 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit",
  },
}
```

CONTEXT D-08 explicitly says no build step; `"exports": "./src/index.ts"`
relies on `allowImportingTsExtensions` (already on in root tsconfig). Consumers
import as `import type { ... } from '@fartola/shared-types';`.

---

### `packages/shared-types/src/index.ts` (barrel)

**Analog:** `packages/sportident/src/index.ts`

**Pattern to copy** (lines 14–76): named-only exports, no default exports,
sectioned with `// --- Section ---` separators, types imported as
`export type { ... }`. Phase 0's `index.ts` is the locked surface contract
template.

```typescript
// Section header style — copy this exactly:
// --- Transport ---------------------------------------------------------------
export { SerialTransport } from './transport/SerialTransport.ts';
export type { ISerialTransport } from './transport/ISerialTransport.ts';
```

---

### `packages/shared-types/src/events.ts` (model / types) — **EXACT analog**

**Analog:** `packages/sportident/src/output/ndjson.ts` lines 35–146

Phase 0 already defines the locked event type union. shared-types either:

1. **Re-exports** `@fartola/sportident`'s `NdjsonEvent`, `NdjsonBase`, `CardType`,
   `HalfDayClock`, `NdjsonPunch`, `ConnectionChangedEvent`, `CardInsertedEvent`,
   `CardReadEvent`, `CardRemovedEvent`, `FrameErrorEvent` — preferred to avoid
   drift.
2. **Or** mirrors them verbatim with a stable `EVENT_SCHEMA_VERSION = 1` const.

Recommendation: re-export. The Phase 0 NDJSON contract is the same contract the
SQLite `events.payload` stores.

**Discriminated union pattern (locked, lines 35–146)**:

```typescript
export interface NdjsonBase {
  schema_version: 1;
  event: string;
  ts_ms: number;
  device_path: string;
  device_serial?: string;
}
export interface ConnectionChangedEvent extends NdjsonBase {
  event: 'connection_changed';
  state: ConnectionState;
  error?: string;
}
// … one interface per event variant, each with literal `event: '...'` discriminator
export type NdjsonEvent =
  | ConnectionChangedEvent
  | CardInsertedEvent
  | CardReadEvent
  | CardRemovedEvent
  | FrameErrorEvent;
```

The literal-string discriminator (`event: 'card_read'`, etc.) is what makes
`switch (e.eventType)` reducers in `apps/edge/src/projection/results.ts`
exhaustively type-safe.

---

### `pnpm-workspace.yaml` (modify)

**Analog:** current `pnpm-workspace.yaml` (5-line file at repo root)

**Current content**:

```yaml
packages:
  - 'packages/*'
```

**Phase 1 diff** (one line):

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

The header comment in the existing file (`# INTENTIONAL DEVIATION FROM D-01…`)
explains exactly why this file exists — preserve it.

---

## Shared Patterns

### Pattern S-1: File-header comment block

**Source:** every file in `packages/sportident/src/` (see e.g. `ndjson.ts`
lines 1–23, `fartola-readout.ts` lines 1–27)

**Apply to:** every new `.ts` file in `apps/edge/`, `apps/web/`,
`packages/shared-types/`

Pattern: 3–25 line header explaining (a) what the file is, (b) the upstream
provenance ("Authored for fartola. Not ported from upstream." OR
"Ported from allestuetsmerweh/sportident.js — …"), (c) which planning doc
locks the behavior, (d) codex / gemini review fix notes inline, ending with
`// See packages/<pkg>/NOTICE.md for cumulative attribution.` (the NOTICE pointer
is Phase 0 D-11; only needed in `packages/sportident/`. For new
fartola-authored files in `apps/*` and `packages/shared-types/`, end with the
planning-doc pointer only.)

Example template for `apps/edge/src/server.ts`:

```typescript
// Authored for fartola. Not ported from upstream.
//
// Fastify bootstrap for the fartOLa edge bridge. Registers @fastify/cors,
// @fastify/sensible, @fastify/websocket, @fastify/static, then mounts REST
// (/api/*), WS (/ws), and SPA-fallback handlers per
// .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §Pattern 3.
//
// Binds 127.0.0.1 only (RESEARCH §Security Domain V4) — no LAN exposure in P1.
```

### Pattern S-2: Sink injection for testability

**Source:** `packages/sportident/src/output/ndjson.ts` `NdjsonEmitterOpts.out`

- `ndjson.test.ts` lines 37–45 + `e2e.test.ts` lines 39–73

**Apply to:** every service that writes to an external sink — DB inserter, WS
broadcaster, printer driver, XML file writer.

Pattern: production code accepts a typed sink callback / interface; tests pass
an in-memory recorder. **No monkey-patching `process.stdout`, no `vi.mock`,
no jest-style auto-mock.**

Example for ESC/POS driver:

```typescript
export interface PrinterSink {
  isPrinterConnected(): Promise<boolean>;
  println(text: string): void;
  cut(): void;
  execute(): Promise<void>;
}

export async function printReceipt(
  printer: PrinterSink, // ← injected
  template: TemplateName,
  data: ReceiptData
): Promise<void> {
  /* … */
}
```

Tests construct an in-memory `PrinterSink` that pushes lines into an array
and asserts on the final array. Bench / production constructs the real
`node-thermal-printer` instance and passes it.

### Pattern S-3: Lazy native-binding require for ESM packages

**Source:** `packages/sportident/src/transport/SerialTransport.ts` lines 18–60

**Apply to:** `apps/edge/src/print/escpos.ts` (node-thermal-printer wraps native
USB write) and `apps/edge/src/xml/validate.ts` (libxmljs2-xsd is a native
binding per RESEARCH A1).

Pattern: `createRequire(import.meta.url)` to lazy-load CJS native packages
from an ESM file (`type: "module"` package). Avoids "Dynamic require of X not
supported" at runtime and `require is not defined` at source level.

```typescript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// only when actually constructing the driver:
function loadDriver() {
  const { printer } = require('node-thermal-printer');
  return printer;
}
```

Tests inject a fake driver via constructor opts so the native module never
loads in CI. This is **the Phase 0 pattern that makes the test suite run
without `/dev/ttyUSB0`** — copy it verbatim for `/dev/usb/lp0` and libxml2.

### Pattern S-4: Conventional Commits + lefthook + TS strict baseline

**Source:** repo root (already in place from Phase 0)

**Apply to:** every commit landed in Phase 1. No new tooling required. New
`apps/*` packages must add `lint`, `typecheck`, `test` scripts to their
`package.json` so the root `pnpm -r --if-present run …` chain picks them up.

### Pattern S-5: Fixture-relative path resolution

**Source:** `packages/sportident/src/integration/benchReplay.test.ts` lines 45–49

**Apply to:** every test that loads fixtures from disk (IOF XML samples,
Purple Pen sample, ResultList expected output).

```typescript
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '..', '..', 'tests', 'fixtures', '<topic>');
```

`process.cwd()` differs between `pnpm --filter <pkg> test`, root `pnpm -r test`,
and IDE test runners. `HERE`-based resolution is stable.

### Pattern S-6: Snake_case at the I/O boundary, camelCase in TS

**Source:** `packages/sportident/src/output/ndjson.ts` lines 35–146 (all NDJSON
fields snake_case) + `siProtocol.ts` (internal types camelCase like
`cardNumber`, `seriesByte`)

**Apply to:** every REST DTO + WS envelope + SQLite `events.payload` JSON in
`packages/shared-types/src/dtos.ts` and `packages/shared-types/src/events.ts`.

CONTEXT D-15 locks snake_case for the NDJSON schema (Phase 0). Phase 1's WS
envelopes (`card_read`, `card_bound`, `manual_dnf`) MUST stay snake_case in the
JSON payload; TS field accessors stay camelCase.

### Pattern S-7: Test-injectable lifecycle (no top-level side effects)

**Source:** `packages/sportident/src/bin/fartola-readout.ts` lines 312–325

**Apply to:** `apps/edge/src/bin/fartola.ts` and any module that performs I/O
at top level.

Pattern: wrap startup in a `main()` function; only call it when the module is
the entrypoint (`isEntrypoint` check via `realpathSync` of `import.meta.url`).
Lets `parseArgs`, `buildServer`, etc. be unit-tested without booting the real
Fastify listener.

### Pattern S-8: AGPL vs MIT licence boundary

**Source:** `packages/sportident/package.json` `"license": "MIT"` +
`packages/sportident/NOTICE.md` + root README

**Apply to:** new packages. Phase 0 ADR-0005 + CONTEXT D-08 lock:

- `packages/sportident/` → MIT (already done)
- `packages/shared-types/` → MIT-compatible (CONTEXT D-08 says
  "If it becomes a publishable shared lib" — Phase 1 keeps it MIT since the
  NDJSON event types come from MIT-licensed Phase 0 code)
- `apps/edge/`, `apps/web/` → AGPL-3.0-or-later (matches root `package.json`)

Set `"license"` correctly in each new package.json on day one.

---

## No Analog Found

The following files have no in-repo analog. The planner MUST reference
RESEARCH.md / UI-SPEC.md sections directly in the corresponding PLAN.md
action steps. These are the largest greenfield surfaces in Phase 1.

| File                                                        | Role                         | Use RESEARCH / UI-SPEC reference                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/edge/src/server.ts`                                   | server bootstrap             | RESEARCH §Pattern 3 "Fastify SPA fallback" (verbatim)                                                                                                           |
| `apps/edge/src/db/schema.ts`                                | Drizzle schema               | RESEARCH §Pattern 1 "Drizzle schema-as-TS"                                                                                                                      |
| `apps/edge/src/db/migrate.ts` + `db/index.ts`               | embedded migrator            | RESEARCH §Pattern 2 (verbatim) + Pitfall 7 (lefthook check)                                                                                                     |
| `apps/edge/src/routes/competitions.ts`                      | REST CRUD                    | RESEARCH §Pattern 3 + Pattern 1 schema                                                                                                                          |
| `apps/edge/src/routes/import.ts`                            | XML import dispatcher        | RESEARCH §"Don't Hand-Roll" + §Architecture (one importer, three REQs) — `fast-xml-parser` + Zod, root-element dispatch (`CourseData` vs `EntryList`)           |
| `apps/edge/src/routes/export.ts`                            | XML export + XSD             | RESEARCH §Pattern 7 (verbatim) + Pitfall 5 (conservative subset)                                                                                                |
| `apps/edge/src/ws/{index,channels}.ts`                      | WS plugin + channel registry | RESEARCH §Pattern 4 (verbatim, includes `wsBroadcast` decorator) + Pitfall 8 (queue subsequent unknown-card events)                                             |
| `apps/edge/src/projection/results.ts`                       | reducer                      | RESEARCH §Pattern 5 (verbatim) — pure function, idempotent                                                                                                      |
| `apps/edge/src/projection/dnf-mp.ts`                        | DNF/MP reducer               | CONTEXT D-12 — punch-only projection, no time-based auto-DNF; `manual_dnf` is another input                                                                     |
| `apps/edge/src/print/escpos.ts`                             | thermal driver               | RESEARCH §Pattern 6 + UI-SPEC §"Receipt templates" (6 templates) + Pattern S-2 sink injection + Pattern S-3 lazy native require                                 |
| `apps/edge/src/backup/daily.ts`                             | daily backup                 | RESEARCH §"Daily backup via better-sqlite3 online API" excerpt (verbatim) + Pitfall 3                                                                           |
| `apps/web/svelte.config.js`                                 | adapter-static SPA           | RESEARCH §"svelte.config.js — adapter-static SPA mode" (verbatim) + Pitfall 1                                                                                   |
| `apps/web/vite.config.ts`                                   | dev proxy + vitest           | RESEARCH §Pitfall 2 (proxy block, verbatim)                                                                                                                     |
| `apps/web/src/lib/i18n.ts` + `sv.json` + `en.json`          | i18n bootstrap               | RESEARCH §Pitfall 10 (sync init) + UI-SPEC §Copywriting: catalog is a **direct port** of `01-SKETCHES/claude-design-bundle/project/i18n.js` (~150 keys, LOCKED) |
| `apps/web/src/lib/ws-client.ts`                             | WS reconnect wrapper         | RESEARCH §"WebSocket client wrapper" excerpt (verbatim, lines 798–829 of 01-RESEARCH.md) + UI-SPEC §"Auto-reconnect" backoff schedule                           |
| `apps/web/src/lib/tweaks.svelte.ts`                         | runes store + localStorage   | UI-SPEC §"Tweaks panel" (6 settings, all localStorage-persisted) — Svelte 5 `$state` runes                                                                      |
| `apps/web/src/lib/tokens.css`                               | oklch tokens                 | UI-SPEC §Color (verbatim — `--bg`, `--accent`, `--ok`, `--mp`, `--dnf`, `--pend` plus accent variants)                                                          |
| `apps/web/src/routes/+layout.svelte`                        | app shell                    | UI-SPEC §"Layout shell" — sidebar 240px, topbar 56px, grid `240px 1fr`                                                                                          |
| `apps/web/src/routes/+page.svelte`                          | HomeView                     | UI-SPEC §HomeView + §"Empty states"                                                                                                                             |
| `apps/web/src/routes/competition/[id]/+page.svelte`         | 3-click wizard               | UI-SPEC §"Click 1, Click 2, Click 3" + CONTEXT D-15                                                                                                             |
| `apps/web/src/routes/competition/[id]/readout/+page.svelte` | readout view                 | UI-SPEC §"Readout view live behavior"                                                                                                                           |
| `apps/web/src/routes/competition/[id]/results/+page.svelte` | live results                 | UI-SPEC §"Live results auto-update"                                                                                                                             |
| `apps/web/src/routes/competition/[id]/walkup/+page.svelte`  | walk-up modal                | UI-SPEC §"Walk-up modal" + CONTEXT D-04                                                                                                                         |
| `apps/web/src/routes/competition/[id]/export/+page.svelte`  | IOF export UI                | UI-SPEC §"Export IOF XML 3.0 ResultList"                                                                                                                        |
| `apps/web/src/lib/components/*.svelte`                      | UI primitives                | UI-SPEC §"Component Inventory" + §"Receipt templates" (6 templates, monochrome-printable)                                                                       |
| `apps/web/tests/*.test.ts`                                  | vitest unit tests            | no in-repo analog — use vitest defaults; Pattern S-2 sink injection still applies                                                                               |
| `tests/e2e/*.spec.ts`                                       | Playwright e2e               | no in-repo analog — five flows: skeleton, three-click wizard, readout-simulate-read, walk-up, IOF export round-trip                                             |
| `playwright.config.ts`                                      | Playwright config            | no in-repo analog                                                                                                                                               |

---

## Cross-Cutting Notes for the Planner

1. **Walking skeleton first (RESEARCH §Summary point 7):** Wave 0 wires every
   layer in a stub form. The simulate-read endpoint (RESEARCH §Open Question 5)
   pipes the four Phase 0 Jonas fixtures
   (`packages/sportident/tests/fixtures/jonas/`) through the bridge so
   subsequent waves iterate without `/dev/ttyUSB0` hardware. This is the only
   in-repo asset Phase 1 reuses beyond the `@fartola/sportident` export surface.

2. **One XML importer (RESEARCH key insight):** Purple Pen `.xml` IS IOF XML
   3.0 CourseData. `apps/edge/src/routes/import.ts` is a single endpoint that
   dispatches on root element (`CourseData` vs `EntryList`). Three REQs
   (REQ-EVT-CMP-002, REQ-EVT-CMP-003, REQ-STD-001) collapse to one parser.

3. **Schema-first wave gate (RESEARCH §Runtime State Inventory):** Wave 0
   `[BLOCKING]` task = land `apps/edge/src/db/schema.ts` + generate initial
   migration + wire migrator. Once green, every later task can assume the DB
   exists with the locked schema. The planner must place the schema task
   ahead of every route + projection task.

4. **No new tooling files at repo root.** lefthook, commitlint, prettier,
   eslint, tsconfig, pnpm-workspace, package.json scripts are all in place.
   The only additions are `playwright.config.ts` (new) and a `pnpm-workspace.yaml`
   one-line edit (`'apps/*'`).

5. **Sink-injection everywhere (Pattern S-2):** copy the Phase 0 testability
   discipline. Every service that touches DB / WS / printer / disk accepts an
   injected sink. Tests never reach for `vi.mock` / `sinon` / `nock`.

6. **MIT vs AGPL boundary (Pattern S-8):** set `"license"` correctly on day one
   for every new package — `apps/*` AGPL, `packages/shared-types/` MIT.

---

## Metadata

**Analog search scope:** `/home/jonas/src/fartOLa-phase-1/packages/sportident/`
(all 60 source + test + fixture files), repo root tooling, root tsconfig.
**Files scanned:** 65.
**Pattern extraction date:** 2026-05-14.
**Reads performed:** 1× CONTEXT, 1× UI-SPEC, 3× RESEARCH (chunked), 1× REQUIREMENTS,
1× tsconfig, 1× sportident package.json, 1× sportident tsconfig, 1× sportident
tsup.config, 1× sportident index.ts, 1× fartola-readout.ts, 1× ndjson.ts (first
100 lines), 1× ndjson.test.ts (header), 1× siProtocol.test.ts (header),
1× e2e.test.ts (header), 1× benchReplay.test.ts (header), 1× SerialTransport.ts
(header). No file re-read.
