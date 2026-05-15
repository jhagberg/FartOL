# Phase 0: Hardware proof - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 0 produces a Node.js script that reads SportIdent cards via a
BSM7/8-class USB readout station on Linux and emits structured NDJSON
events to stdout. The script lives in a new `packages/sportident/`
package authored as if it could eventually be published as a
standalone MIT-licensed library. CRC16-CCITT-0x8005 validation runs
on every incoming frame; malformed frames are logged and rejected.

**In scope:**
- Read SI5 + SI8/9/10/11 cards via the SportIdent extended protocol.
- SIAC accidentally covered (BSM readout uses the same `0xEF` command
  as SI8-11).
- CRC validation on every frame (REQ-HW-004).
- NDJSON events to stdout in a stable schema Phase 1 will consume.
- Fixture-based unit tests in CI + a scripted hardware smoke locally
  before tagging `v0.0.1-handshake`.

**Out of scope (deferred to later phases):**
- Web UI, HTTP server, SQLite event log (Phase 1).
- Autosend / control-station punch mode `0xD3` (REQ-HW-005, Phase 4).
- SRR / SIAC beacon path (REQ-HW-003 via SRR, Phase 4).
- Clock sync, set-time, beep (REQ-HW-007, Phase 4).
- Peer sync, central tier, IOF XML export (later phases).
- macOS / Windows support — REQ-HW-001 ultimately requires all three,
  Phase 0 ships Linux only.

</domain>

<decisions>
## Implementation Decisions

### Repo scaffold

- **D-01:** Single `packages/sportident/` package now; defer pnpm
  workspaces to Phase 1 when the second package lands. ADR-0005
  already locks the directory name.
- **D-02:** TypeScript with `strict: true`,
  `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
  Aligns with ADR-0006.
- **D-03:** Package manager: **pnpm** (`corepack enable` acceptable;
  installer instructions go in README).
- **D-04:** `packages/sportident/` authored as **standalone-shaped** —
  own README, LICENSE (MIT), exported public API, semver — but **not**
  published to npm in Phase 0.
- **D-05:** Build: **tsup**, dual ESM+CJS output, includes `.d.ts`.
  One config file.
- **D-06:** Test runner: **node:test** (Node 22 LTS built-in). Zero
  extra deps.
- **D-07:** CI: **GitHub Actions, lean** — one workflow on PR + push
  to `main` running `pnpm install`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test`. Linux runner. No hardware tests in CI.
- **D-08:** Commit discipline: **lefthook** for pre-commit hook
  (`lint` + `format`); **commitlint** enforces Conventional Commits.
  Matches the existing commit style on this repo (cbd6fb6, 81eccbe).

### Protocol approach

- **D-09:** **Port + adapt** `allestuetsmerweh/sportident.js` into
  `packages/sportident/`. Copy protocol code (CRC, frame split, card
  decoders) verbatim with per-file attribution; replace browser
  WebSerial transport with a Node `serialport`-based transport.
- **D-10:** Card-type coverage for `v0.0.1-handshake`: **SI5, SI9,
  SI10, SIAC Air+** (Jonas's inventory in hand). SIAC via BSM7/8
  readout uses the same `0xEF` command as SI8-11; beacon-mode SIAC
  (REQ-HW-003 over SRR) stays Phase 4.
- **D-11:** **Per-file MIT NOTICE header** in every ported file,
  **plus** a single `NOTICE.md` (or `ATTRIBUTION.md`) at the package
  root listing all upstream references with URLs.
- **D-12:** sportident.js maintenance verified active 2026-05-12:
  last commit `2026-04-10`, no stable release tags (`v2.0.0-alpha.x`
  since 2020). Port-from is safe; npm-dep-on is not.

### Output contract

- **D-13:** Output format: **NDJSON**, one JSON object per line.
  Streams naturally into Phase 1's event log. Each line is
  independently parseable.
- **D-14:** Timestamps as **milliseconds since Unix epoch** (`number`).
  Matches the event log schema (`event_time_ms`, `recorded_at_ms`) in
  `.planning/research/architecture.md`.
- **D-15:** JSON field names: **snake_case** end-to-end. Same style as
  the SQL table that will hold these events in Phase 1.
- **D-16:** Invocation: package exposes a **bin** (e.g.
  `fartol-readout`) **AND** a pnpm script (e.g. `pnpm dev:readout`).
  Devs prefer pnpm; the bin is the supported public entry point.

### Test strategy

- **D-17:** Split: **fixture-based unit tests** in CI + **manual
  hardware smoke** locally before tagging. CI has no hardware.
- **D-18:** Fixture sources: **both** — captured from the local reader
  via a `--record` mode (one capture per card type) AND reused from
  sportident.js's existing test fixtures.
- **D-19:** Hardware acceptance: **scripted smoke**
  (`scripts/hardware-smoke.sh`) that prompts the operator to insert
  each card type, asserts the expected event types appear on stdout,
  exits 0 on success. Run by Jonas before tagging `v0.0.1-handshake`.
- **D-20:** CI scope: **everything non-hardware** — CRC tables, frame
  split, card decoders, NDJSON formatting, fixture-driven end-to-end
  parsing, plus lint and typecheck.

### Claude's Discretion

No "you decide" answers were given. Areas not explicitly asked about
where Claude has flexibility (planner-territory):

- Exact `event_type` values (suggest `card_inserted`, `card_read`,
  `card_removed`, `frame_error`, `connection_changed`).
- Diagnostic logging destination for CRC failures (REQ-HW-004) —
  suggest **stderr** so stdout stays pure NDJSON.
- **`schema_version: 1`** field on every NDJSON event for forward
  compatibility — strongly suggested but not yet locked.
- Exact `tsconfig.json`, `eslint.config.js`, `prettier.config.js`,
  `tsup.config.ts` contents.
- Hot-plug / disconnect handling depth — suggest graceful retry with
  backoff; document policy in PLAN.
- `.nvmrc` / `engines` field — pin to Node 22 LTS.
- `commitlint` config — extend `@commitlint/config-conventional`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked decisions (ADRs)

- `.planning/adr/0002-three-tier-architecture.md` — Edge-bridge owns
  hardware. Phase 0 is the edge-bridge prototype.
- `.planning/adr/0005-sportident-code-isolated-mit.md` — All SI code
  in `packages/sportident/`, MIT-licensed, behind a clean async
  `SiReader` interface.
- `.planning/adr/0006-tech-stack.md` — Node.js 22 LTS + `serialport`.
  Fastify/SQLite/SvelteKit do not apply in Phase 0 (stdout is the
  sink).

### Requirements & roadmap

- `.planning/REQUIREMENTS.md` §"Hardware integration" — REQ-HW-001,
  REQ-HW-002, REQ-HW-004 (the three Phase 0 REQ-IDs).
- `.planning/ROADMAP.md` §"Phase 0: Hardware proof" — phase
  boundary, goal, depends-on, numbered success criteria 1-6.

### Research / protocol references

- `.planning/research/ecosystem.md` §3 "SportIdent ecosystem — facts"
  — cards, stations, frame format, key commands (`0xEF`, `0xB1`,
  `0xD3`, etc.), CRC polynomial.
- `.planning/research/architecture.md` §"Event log schema" — SQLite
  `events` table schema (`node_id, local_seq, event_type,
  event_time_ms, recorded_at_ms, payload`). Phase 0 NDJSON output
  should map cleanly onto this.

### Port source (MIT-licensed, primary)

- <https://github.com/allestuetsmerweh/sportident.js> — Port source.
  Last commit `2026-04-10`. MIT-licensed.

### Read-only reference implementations (understanding, no copying)

- <https://github.com/per-magnusson/sportident-python> — Best-
  documented; GPL, reference-only.
- <https://github.com/sdenier/GecoSI> — Mature handshake handling;
  Java reference.
- MeOS `SportIdent.cpp` in
  <https://github.com/melinsoftware/meos> — AGPL, reference-only.

### Vendor docs

- <https://docs.sportident.com/> — Official SPORTident docs.
- <https://docs.sportident.com/developers/center-rest-api> — REST
  API spec (Phase 4+ territory).
- Communication Library + PC Programmer's Guide — **request from
  SPORTident developer contact**. Parallel, non-blocking; valuable
  for the future refactor phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

None — greenfield repo. Phase 0 is the first code commit.

### Established Patterns

None in this codebase. Patterns to inherit selectively from external
references (and from `.planning/research/architecture.md`):

- sportident.js's TypeScript module structure (selectively, while
  porting).
- The event-sourced architecture sketched in `.planning/research/architecture.md`
  — Phase 0 NDJSON output must map field-for-field onto the eventual
  `events` table.

### Integration Points

Phase 0 is upstream of everything. The integration point is the
**NDJSON output contract** (D-13 through D-16): Phase 1's event
ingester reads stdout (or a recorded NDJSON file), parses each line,
and inserts rows into `events`.

</code_context>

<specifics>
## Specific Ideas

- **Hardware in hand (2026-05-12):** SPORTident CP2102 reader at
  `/dev/ttyUSB0` — VID `0x10c4`, PID `0x800a`, serial `593656`,
  kernel driver `cp210x`. Phase 0 success criterion #1 ("BSM7/8
  enumerates as `/dev/ttyUSB0`") is **already satisfied** by plugging
  in the reader.
- **Cards in hand:** SI5, SI9, SI10, SIAC Air+ touch-free. All four
  must read end-to-end before tagging `v0.0.1-handshake`.
- **Style anchor:** Repo's existing commits (cbd6fb6, 81eccbe) follow
  Conventional Commits. lefthook + commitlint chosen to keep that
  consistent.
- **Mobile-readability:** Jonas reads on mobile. Downstream agents
  should keep AskUserQuestion option descriptions and chat replies
  terse. Long content goes in CONTEXT.md / PLAN.md / ADRs, not in
  interactive prompts.

</specifics>

<deferred>
## Deferred Ideas

- **Future "modernize/optimize `packages/sportident/`" phase.** After
  Phase 0 proves the port works against real hardware, plan a
  clean-room rewrite for style consistency, performance, and shedding
  the upstream's WebSerial-era patterns. Schedule after Phase 1 (or
  later) — not added to ROADMAP.md today. Trigger: when porting
  friction or upstream divergence becomes annoying.
- **Email SPORTident developer contact** for the Communication
  Library and PC Programmer's Guide (per
  `.planning/research/ecosystem.md` §3). Parallel, non-blocking work
  for Jonas. Useful input for the future refactor phase and for
  resolving any reference-implementation disagreements.
- **macOS / Windows hardware path.** REQ-HW-001 ultimately requires
  all three platforms; Phase 0 ships Linux only. Cross-platform work
  folds into Phase 1.
- **SIAC beacon-mode via SRR dongle.** REQ-HW-003 in v1 scope, but
  explicitly Phase 4 per ROADMAP. Phase 0 covers SIAC-via-readout for
  free.
- **Autosend / `0xD3` control-station punch mode.** REQ-HW-005,
  Phase 4. Not Phase 0.
- **`schema_version: 1` field on NDJSON events.** Not asked
  explicitly but worth including from day one. Planner should
  propose v1 schema.

### Reviewed Todos (not folded)

None — no matching todos for Phase 0 in the GSD todo registry.

</deferred>

---

*Phase: 0-Hardware-proof*
*Context gathered: 2026-05-12*
