---
gsd_state_version: 1.0
milestone: v0.0.1
milestone_name: milestone
status: executing
stopped_at: Plan 00-05 complete (Wave 4 NDJSON output + bin + e2e replay)
last_updated: '2026-05-12T21:52:15Z'
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 5
  percent: 83
---

# STATE

GSD's project memory. Updated by GSD commands as work progresses.
This file tracks where we are, what is next, open questions, and
blockers. Decisions live in `.planning/adr/` as MADR-format ADRs —
not duplicated here.

---

## Current position

Phase: 0 (hardware-proof) — EXECUTING
Plan: 6 of 6 (next)
**Phase:** Phase 0 — Hardware proof (Wave 4 NDJSON output + bin + e2e complete)
**Next concrete action:** Run plan 00-06 (Wave 5 hardware smoke + record/replay) —
add `--record <path>` / `--replay <path>` modes to `bin/fartol-readout`, then
run `scripts/hardware-smoke.sh` against `/dev/ttyUSB0` (SI5 + SI9 + SI10 + SIAC
insertions). After green smoke, tag `v0.0.1-handshake`.

**Last completed:** Plan 00-05 — Wave 4 NDJSON output + bin entry + e2e
fixture replay. Landed `NdjsonEmitter` (5 event types: connection_changed,
card_inserted, card_read, card_removed, frame_error) with stable v1 schema
(schema_version=1, snake_case D-15, ms-epoch D-14, raw half-day clock per
RESEARCH §"Half-day clock + missing event date"); `emitDiagnostic` for
stderr human diagnostics; `bin/fartol-readout` public entry point that
wires all 5 SiMainStation events to NdjsonEmitter on stdout +
emitDiagnostic on stderr (typed FrameError consumed directly — codex
review #1 closed end-to-end through Plans 02+04+05; zero console.warn
anywhere in src/). Full public API surface in `index.ts` (18 named
exports per RESEARCH §"Open Questions #6") with side-effect imports of
card-type modules so BaseSiCard registries populate at consumer import.
e2e fixture-replay test (`integration/e2e.test.ts`) replaces the Wave 0
placeholder — synthetic SI5_DET + GET_SI5 reply -> 3-line NDJSON
sequence with punches byte-equal to upstream `si5-16-punches` fixture.
MIT attribution audit script (`scripts/check-mit-attribution.sh`,
codex review #13) scans 54 files and exits 0; wired into root
`pnpm lint` chain. tsup build produces all four expected artifacts
(`.mjs` + `.cjs` for both entries + .d.ts). Pipeline green: 76 tests
pass / 0 fail / 0 skipped. Commits `70020bb` (Task 1 RED tests),
`84d9719` (Task 1 GREEN — NdjsonEmitter + diagnostics + bridge),
`3be5c9d` (Task 2 — bin + index.ts + e2e + MIT audit script). Five
auto-fixes (5 Rule 1 bugs — card_holder snake_case at boundary, three
NOTICE-header comment-token rewordings, MIT-audit grep regex relaxation,
unknown[] cast for fixture, prettier reformat).

---

## Decisions

Captured as MADR-format ADRs in `.planning/adr/`. See
`.planning/adr/README.md` for the index.

**Plan-level decisions (00-01):**

- D-01 deviation: pnpm-workspace.yaml anchored in Phase 0 (codex review #10). 5 lines + comment header.
- CI pinning: Corepack reads packageManager field from root package.json (codex review #9 default; pnpm/action-setup@v4 documented fallback).
- tsup outExtension stub: explicit `.mjs`/`.cjs` so package.json `bin` path resolves to a real file (codex review #12).
- Root `type: module` + per-extension globals in ESLint flat config (.cjs explicitly carved out as sourceType: commonjs for commitlint).

**Plan-level decisions (00-02):**

- Pure parse() + callback in parseAll(): single-frame `parse` stays
  side-effect-free; `parseAll(input, {onFrameError})` is the sole
  surface that synthesizes the typed `FrameError` payload. Plans 04
  (multiplexer) and 05 (NDJSON) wire directly to the callback with no
  `console.warn` interception.

- `allowImportingTsExtensions: true` in root tsconfig — required for
  Node-22 strip-types-native `.ts` import suffixes (the RESEARCH code-
  example style); `noEmit: true` already in place satisfies the
  precondition.

- Trimmed upstream `siProtocol.ts`'s storage-backed `SiDate`/`SiTime`
  classes from this port: Phase 0 uses only the pure `arr2date` /
  `arr2cardNumber` helpers; the class wrappers depend on `storage/*`
  which Plan 03 lands.

**Plan-level decisions (00-03):**

- Two non-overlapping registries on BaseSiCard — codex review #4.
  `registerSi5Range` (SI5_DET only) and `registerSi8Range` (SI8_DET only)
  cannot capture each other's frames regardless of cardNumber overlap.

- Storage primitives backed by plain `(number|undefined)[]` instead of
  `Immutable.List` — avoids the upstream `immutable` runtime dep.
  Phase 0 decoders are read-only so structural-sharing buys nothing.

- SiEnum reverse lookup is first-key-wins on int collisions — SiCard10
  and SIAC both share series byte 0x0F; the shared `utils.getLookup`
  throws on duplicates which is wrong for this case. Routing within a
  shared series is by card-number range anyway.

- Test-only `_decodeFromStorage(bytes)` helper on every card subclass
  lets fixture replay tests skip the mainStation. The multi-page
  `typeSpecificRead` chain is still exercised separately against a
  recording mock station (codex review #3 multi-page verification).

**Plan-level decisions (00-04):**

- `transport/errors.ts` created as Task 0 (codex review #5) so
  `SerialTransport` (Task 1) and `SiSendTask` (Task 2) both import
  `DeviceClosedError` + `SendTimeoutError` from the same module — no
  circular dep, no inline class redefinitions, Task 1 typechecks
  regardless of Task 2's progress.

- WAKEUP prepending centralised (codex review #11) — every
  `SiTargetMultiplexer.sendMessage()` call wraps the rendered message in
  `[proto.WAKEUP, ...render(message)]` via `_renderForWire`. Verified
  end-to-end through station test 2 over multiple post-handshake commands.

- `onFrameError` callback wired DIRECTLY (codex review #1) into
  `multiplexer.emit('frameError', err)` — no stdout interception anywhere
  in the SiStation OR transport tree. Station test 10 spies on
  `process.stdout.write` + `process.stderr.write` and asserts zero writes
  during bad-CRC frame handling.

- Multiplexer simplification: Direct-only — dropped the SET_MS-on-every-
  call dance and Remote/Unknown target branches. 194 LOC vs. upstream's
  300+. Removed branches tagged with `// REMOVED (Phase 0 Direct-only);
see RESEARCH §multiplexer.` for auditability.

- GEMINI MEDIUM #1 (T-00-14): 64KB receive-buffer cap in
  `SiTargetMultiplexer._onData` → emits a typed `'buffer_overflow'`
  frameError when exceeded. Protects against adversarial / noisy byte
  streams that never yield a valid frame.

- GEMINI MEDIUM #2 (zombie-process prevention): transport close rejects
  any pending send. Implemented at BOTH layers — `SerialTransport` (port-
  close fails its `pendingRejecters`) and `SiTargetMultiplexer` (transport-
  close aborts every pending `SiSendTask`). Verified by SerialTransport
  test 10 + SiMainStation test 9.

- `SiSendTask` timer is NOT `unref()`'d — `bin/fartol-readout` is
  otherwise idle while awaiting station replies; unrefing would let Node
  exit before the timeout fires.

- Lazy `require('serialport')` in `SerialTransport` — tests inject a
  FakeSerialPort via the constructor's second arg; the real native module
  is only loaded when no Ctor is injected. CI never touches it.

- `BaseSiStation` simplified — Phase 0 mutates known byte offsets directly
  (`STATION_CONFIG_OFFSETS.CODE / MODE / AUTOSEND / HANDSHAKE / BEEPS /
FLASHES`) instead of porting upstream's storage-typed config wrappers.

- SI_REM cardNumber decode inlined in `SiMainStation` (the BaseSiCard
  registry only routes SI5_DET/SI8_DET per Plan 03's codex review #4
  invariant). The inline rebuild uses the modern-card branch
  `((hi<<8)|lo) | (mid<<16)` when `mid > 4`.

**Plan-level decisions (00-05):**

- `schema_version: 1` LOCKED on every NDJSON event (Claude's discretion
  per CONTEXT.md "schema_version=1 strongly suggested but not yet locked").
  All 5 event types carry this field as the first key.

- card_holder snake_case at the NDJSON boundary — the ported Phase 0
  decoder produces upstream's camelCase field names (firstName, isComplete,
  etc.). `NdjsonEmitter.card_read` applies a one-level `snakeCaseKeys()`
  transform so D-15 (snake_case end-to-end) holds without modifying the
  ported decoder. Alternative — rewriting the decoder — would have created
  upstream drift.

- `weekday: null` from `toHalfDayClock` — `SiTimestamp` is `number | null`
  with no weekday byte attached; weekday lives elsewhere in card storage
  and isn't currently exposed by Phase 0 decoders. Phase 1 will plumb it
  through when wall-clock reconstruction matters.

- Bin uses a hand-rolled minimal CLI arg parser (no commander/yargs dep).
  Keeps the install lean. `--record`/`--replay` flags are parsed-but-
  stubbed; Plan 06 wires the file IO.

- `setBlocking(true)` on `process.stdout._handle` wrapped in try/catch in
  the bin (per RESEARCH §Landmines #12, internal Node API; best-effort).

- MIT audit grep relaxed to regex `(Ported|Derived)( \(qualifier\))? from
allestuetsmerweh/sportident\.js` — literal "Ported from" would have
  failed on real existing headers like "Ported (simplified) from" in
  SiStation/\* files. Pattern preserves the audit intent.

## Open questions (deferred until we have working code)

- Does Electric scale to 30 000 concurrent public viewers at O-ringen,
  or do we need a CDN tier in front?

- Should the edge-bridge auto-discover peers via mDNS/Bonjour, or do
  we require manual peer configuration?

- Payment integration — Swish Handel direct, or Stripe with Swish
  via their connector?

---

## Active blockers

None. Phase 0 plans created.

## Plan-phase overrides

- 2026-05-12 — Phase 0 decision-coverage gate: gate reported 10/20 D-IDs uncovered (D-01, D-03, D-06, D-09, D-10, D-12, D-13, D-17, D-18, D-19). Plan-checker independently verified all 20 decisions are content-honored across the 6 plans (see VERIFICATION output). Gate's strict `D-NN:` citation matching does not reflect content coverage. Override recorded; verify-phase to re-surface if any decision turns out to actually drop.

---

## Session Continuity

Last session: 2026-05-12T21:52:15Z
Stopped At: Plan 00-05 complete (Wave 4 NDJSON output + bin + e2e replay)
Resume File: .planning/phases/00-hardware-proof/00-06-PLAN.md

---

## Recent changes to plan

- 2026-05-12 — Plan 00-05 executed: Wave 4 NDJSON output + bin entry landed.
  NdjsonEmitter (5 event types: connection_changed, card_inserted, card_read,
  card_removed, frame_error) with stable v1 schema; emitDiagnostic for stderr
  human diagnostics; bin/fartol-readout (#!/usr/bin/env node) wires all 5
  SiMainStation events to NdjsonEmitter on stdout + emitDiagnostic on stderr.
  Typed FrameError flows from parseAll(onFrameError) straight through to
  NdjsonEmitter.frame_error (codex review #1 closed end-to-end through Plans
  02+04+05; zero console.warn anywhere in src/). Full public API surface in
  index.ts (18 named exports per RESEARCH §"Open Questions #6"). e2e fixture-
  replay test replaces Wave 0 placeholder (synthetic SI5_DET + GET_SI5 reply
  -> 3-line NDJSON sequence with punches byte-equal to upstream fixture). MIT
  attribution audit script (codex review #13) scans 54 files; wired into root
  pnpm lint chain. tsup build produces all four expected artifacts (.mjs +
  .cjs for both entries + .d.ts). Pipeline green: 76 tests pass / 0 fail / 0
  skipped. Commits `70020bb` (Task 1 RED), `84d9719` (Task 1 GREEN),
  `3be5c9d` (Task 2). Five auto-fixes (5 Rule 1 bugs — card_holder boundary
  snake_case, three NOTICE-header comment rewordings for cross-plan grep
  safety, MIT-audit grep regex relaxation, unknown[] cast, prettier reformat).

- 2026-05-12 — Plan 00-04 executed: Wave 3 transport + station layer
  landed. SerialTransport (170 LOC) replaces upstream's WebUSB transport
  via `serialport@13`; SiTargetMultiplexer (194 LOC, Direct-only)
  prepends WAKEUP to every command (codex review #11) and wires
  parseAll's onFrameError callback directly (codex review #1); BaseSi-
  Station + SiMainStation port the atomic handshake (SET_MS → readInfo
  → writeDiff). transport/errors.ts created as Task 0 so Task 1/2
  imports resolve regardless of order (codex review #5). 21 new tests
  (11 SerialTransport + 10 SiMainStation) drive every behavior against
  a FakeSerialTransport — including SI5/SI9/SI10/SIAC insertion paths
  with the GET_SI8 page-4 read for modern cards (codex review #3 + #2).
  Inlined GEMINI MEDIUM findings: 64KB receive-buffer cap + close-rejects-
  pending-send (zombie-process prevention) at both transport and
  multiplexer layers. Pipeline green: 62 pass / 2 skipped / 0 fail.
  Commits `24012f1` (Task 0 errors.ts), `265e50d` (Task 1 SerialTransport),
  `a9a649a` (Task 2 station layer). Six auto-fixes (6 Rule 1 bugs — all
  test-helper / runner / formatting follow-ons; no scope creep).

- 2026-05-12 — Plan 00-03 executed: Wave 2 card decoders landed.
  Storage primitives (8 files, plain-array backed — no immutable.js
  dep), BaseSiCard with two non-overlapping registries (codex review
  #4: registerSi5Range vs registerSi8Range, cannot cross-capture),
  ModernSiCard with explicit page-4 punch chain (codex review #3),
  SiCard5/SiCard9/SiCard10/SIAC, 7 upstream-derived fixtures
  (including a 64-punch one that exercises pages 4+5), 13 decoder
  tests including cross-registry safety in both directions.
  Pipeline green: 41 pass / 2 skipped / 0 fail. Commits `fce06b6`
  (port), `ff72a2f` (fixtures + tests). Six auto-fixes (5 Rule 1
  bugs, 1 Rule 2 SiEnum first-key-wins for shared series 0x0F).

- 2026-05-12 — Plan 00-02 executed: Wave 1 siProtocol port landed.
  CRC16 + parse + parseAll + render verified end-to-end with 10
  frozen CRC vectors and 5 synthetic fixtures. Upstream's
  `console.warn` bad-CRC channel replaced by the typed
  `parseAll(input, {onFrameError})` callback (codex review #1 HIGH).
  Pipeline green: 28 pass / 6 skipped / 0 fail. Commits `1b0095d`
  (port), `2102dea` (tests + fixtures). Three auto-fixes applied
  (1 Rule 3 blocker — `allowImportingTsExtensions`; 2 Rule 1
  docs/style — prettier reformat + comment grep-safety).

- 2026-05-12 — Plan 00-01 executed: Wave 0 scaffold landed. Repo now
  bootstraps with `pnpm install --frozen-lockfile && pnpm lint &&
pnpm typecheck && pnpm test` exit 0 (8 skipped tests). Commits
  `3b6afaf` (root toolchain), `0a59fdc` (sub-package skeleton),
  `fd83a56` (Wave 0 placeholders + CI + smoke stub). Five auto-fixes
  applied (Rule 1/3) — all toolchain-config follow-ons, no scope creep.

- 2026-05-12 — Phase 0 context discussion complete: 4 areas covered
  (Repo scaffold, Protocol approach, Output contract, Test strategy);
  20 decisions captured in `00-CONTEXT.md`. Commit `48c7cd3`.

- 2026-05-12 — Reformatted ROADMAP.md to GSD template structure so
  `roadmap.analyze` / `roadmap.get-phase` parse phases. Content
  preserved verbatim. Commit `81eccbe`.

- 2026-05-12 — Migrated DEC-001..008 from inline `STATE.md` to MADR
  ADRs in `.planning/adr/`. Added ADR-0009 capturing the v1/v2 scope
  clarification (REQ-UI-008, REQ-STD-004, REQ-OPS-004 retagged from
  `(v2)` to `(v1)`). Removed Yjs v1/v2 open question (resolved by
  ADR-0009). Dropped `/gsd-map-codebase` from "next action" — repo
  is greenfield. Commit `cbd6fb6`.

(GSD will append entries here as the project progresses. Format:
`YYYY-MM-DD - what changed - why`.)
