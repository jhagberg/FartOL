# Phase 0: Hardware proof - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or
> execution agents. Decisions are captured in `00-CONTEXT.md` — this
> log preserves the alternatives that were considered.

**Date:** 2026-05-12
**Phase:** 0-Hardware-proof
**Areas discussed:** Repo scaffold, Protocol approach, Output contract,
Test strategy

---

## Repo scaffold

### Q1 — How much repo scaffolding should Phase 0 actually set up?

| Option | Description | Selected |
|--------|-------------|----------|
| Just enough | TS + ESLint + Prettier inside single `packages/sportident/`; defer workspaces to Phase 1 | ✓ |
| Minimal | One package, one entry script, no lint, no tests directory | |
| Full monorepo now | pnpm workspaces + `apps/edge-bridge` + `apps/web` placeholder from day one | |

**User's choice:** Just enough.

### Q2 — TypeScript posture for `packages/sportident/`?

| Option | Description | Selected |
|--------|-------------|----------|
| TS strict | `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | ✓ |
| TS relaxed | `strict: false` initially, tighten later | |
| Plain JavaScript | Skip TS for Phase 0, convert at Phase 1 | |

**User's choice:** TS strict.

### Q3 — Package manager?

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm | Fast, strict, native workspace support | ✓ |
| npm | Bundled with Node 22 LTS, zero extra install | |
| yarn | Established; berry has stricter resolution | |

**User's choice:** pnpm.

### Q4 — Future of `packages/sportident/` — standalone or internal?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone-shaped | Author as if eventually publishable; don't publish in Phase 0 | ✓ |
| Publish now | `npm publish` from Phase 0 | |
| Internal-only | Private workspace package, no public-API discipline | |

**User's choice:** Standalone-shaped.

### Q5 — Build/transpile approach?

| Option | Description | Selected |
|--------|-------------|----------|
| tsup | Rollup-based; dual ESM+CJS; declarations included | ✓ |
| Plain tsc | Zero extra deps; ESM-only by default | |
| esbuild direct | Faster; lower-level; more configuration to write | |

**User's choice:** tsup.

### Q6 — Test runner?

| Option | Description | Selected |
|--------|-------------|----------|
| node:test | Node 22 LTS built-in; zero deps | ✓ |
| vitest | Fast, popular, vite-aligned | |
| jest | Ubiquitous but heavy and slow on TS | |

**User's choice:** node:test.

### Q7 — CI baseline?

| Option | Description | Selected |
|--------|-------------|----------|
| GH Actions, lean | One workflow: install, lint, typecheck, unit tests | ✓ |
| Pre-commit hook only | lefthook / husky locally, no remote CI | |
| None yet | Manual discipline for Phase 0 | |

**User's choice:** GH Actions, lean.

### Q8 — Commit discipline and git hooks?

| Option | Description | Selected |
|--------|-------------|----------|
| lefthook + Conventional | Single-binary hook + commitlint | ✓ |
| Honor system | Docs only, no machine enforcement | |
| husky + lint-staged | More established, Node-based | |

**User's choice:** lefthook + Conventional.

---

## Protocol approach

### Q1 — Strategic approach to `sportident.js` (MIT TS reference)?

| Option | Description | Selected |
|--------|-------------|----------|
| Port + adapt | Copy protocol code; swap WebSerial for node-serialport | ✓ |
| npm dep + Node transport | Install `sportident`; write thin Node transport adapter | |
| Fresh write, multi-ref | Clean-room from all references; no copied code | |
| Hybrid | Port boring bits (CRC, decoders); fresh-write state machine + transport | |

**User's choice (after pros/cons exchange):** Port + adapt.

**Notes:** Jonas requested a pros/cons comparison between Hybrid,
Fresh write, and Port + adapt, gated on whether sportident.js is
actively maintained. Maintenance check confirmed: last commit
`2026-04-10` (~1 month before discussion), no stable release tags
(alpha-only since 2020) — safe to port from, risky to depend on as a
release. Jonas confirmed Port + adapt with the explicit understanding
that a future refactor phase will clean-room rewrite once the port
has proven against real hardware. He also flagged the option to email
SPORTident's developer contact for the Communication Library and PC
Programmer's Guide — captured as deferred parallel work.

### Q2 — Which card types must read end-to-end for `v0.0.1-handshake`?

| Option | Description | Selected |
|--------|-------------|----------|
| SI5 + SI8/9/10/11 | Minimum per REQ-HW-001 + REQ-HW-002 | |
| Just SI8/9/10 | Skips SI5; breaks REQ-HW-002 | |
| All you have | Jonas's actual inventory | ✓ |

**User's choice:** All you have. **Inventory:** SI5, SI9, SI10, SIAC
Air+ touch-free.

### Q3 — Attribution style for ported sportident.js code?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file NOTICE + root NOTICE | Header in each ported file plus a single ATTRIBUTION.md at package root | ✓ |
| Root NOTICE only | Single `NOTICE.md` at package root | |
| Per-file only | Headers in each file, no root NOTICE | |

**User's choice:** Per-file NOTICE + root NOTICE.

---

## Output contract

### Q1 — Output mode?

| Option | Description | Selected |
|--------|-------------|----------|
| NDJSON, line-per-event | One JSON object per line | ✓ |
| One object per card | Single blob per card with embedded `punches` array | |
| Both, flag-controlled | Default NDJSON; `--pretty` for one-object | |

**User's choice:** NDJSON, line-per-event.

### Q2 — Timestamp format?

| Option | Description | Selected |
|--------|-------------|----------|
| ms-epoch | Milliseconds since Unix epoch (number) | ✓ |
| ISO 8601 string | `"2026-05-12T18:42:13.123Z"` | |
| Both fields | `event_time_ms` + `event_time_iso` | |

**User's choice:** ms-epoch.

### Q3 — JSON field naming convention?

| Option | Description | Selected |
|--------|-------------|----------|
| snake_case | Matches event log SQL schema | ✓ |
| camelCase | TS-idiomatic; requires translation to SQL | |
| Mixed by layer | snake_case for schema fields; camelCase for transient | |

**User's choice:** snake_case.

### Q4 — How is the Phase 0 script invoked?

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm script + bin | Both invocation paths supported | ✓ |
| Just pnpm script | `pnpm dev:readout` only | |
| Just bin | `bin` field only, no pnpm convenience script | |

**User's choice:** pnpm script + bin.

---

## Test strategy

### Q1 — Overall test split?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixtures + manual hw | CI-friendly unit tests + manual hardware smoke before tagging | ✓ |
| Hardware-only, no CI tests | Skip unit tests entirely | |
| Hardware-aware with auto-skip | Detect `/dev/ttyUSB0`, run hardware path if present | |

**User's choice:** Fixtures + manual hw.

### Q2 — Where do the byte fixtures come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Capture from real reader | `--record` mode + per-card-type capture | |
| Reuse sportident.js fixtures | Pull their existing test data | |
| Both | Ours via `--record` + theirs as smoke check | ✓ |

**User's choice:** Both.

### Q3 — How is the hardware acceptance test run?

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted smoke | `scripts/hardware-smoke.sh` prompts + asserts | ✓ |
| Manual checklist | `HARDWARE-TEST.md` ticked by hand | |
| Both | Script + markdown checklist | |

**User's choice:** Scripted smoke.

### Q4 — What's tested under CI (no hardware)?

| Option | Description | Selected |
|--------|-------------|----------|
| All non-hardware code | CRC, frame split, decoders, NDJSON, fixture-driven end-to-end, lint, typecheck | ✓ |
| Smoke only | Lint + typecheck + `--help` smoke | |
| Pure functions only | Only leaf parsers (CRC, byte slicing) | |

**User's choice:** All non-hardware code.

---

## Claude's Discretion

No "you decide" answers were given. CONTEXT.md notes the unasked
decisions where Claude has flexibility (exact `event_type` values;
diagnostic-log destination for REQ-HW-004; `schema_version` field;
exact `tsconfig.json` / `eslint.config.js` / `tsup.config.ts`
contents; hot-plug handling depth; `.nvmrc` / `engines` field;
`commitlint` config) and Claude's recommendation for each.

## Deferred Ideas

- Future refactor phase to clean-room rewrite `packages/sportident/`
  once the port has proven against real hardware. Not added to
  ROADMAP.md today.
- Parallel: email SPORTident's developer contact for Communication
  Library + PC Programmer's Guide. Non-blocking; useful for the
  refactor.
- macOS / Windows hardware path (rolls into Phase 1+).
- SIAC beacon-mode via SRR (Phase 4 per REQ-HW-003).
- Autosend / `0xD3` mode (Phase 4 per REQ-HW-005).
- `schema_version: 1` field on every NDJSON event (planner should
  propose v1 schema).
