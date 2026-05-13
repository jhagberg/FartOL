---
gsd_state_version: 1.0
milestone: v0.0.1
milestone_name: milestone
status: executing
stopped_at: Plan 00-03 complete (Wave 2 card decoders)
last_updated: '2026-05-12T21:15:58.530Z'
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 3
  percent: 50
---

# STATE

GSD's project memory. Updated by GSD commands as work progresses.
This file tracks where we are, what is next, open questions, and
blockers. Decisions live in `.planning/adr/` as MADR-format ADRs —
not duplicated here.

---

## Current position

Phase: 0 (hardware-proof) — EXECUTING
Plan: 4 of 6 (next)
**Phase:** Phase 0 — Hardware proof (Wave 2 card decoders complete)
**Next concrete action:** Run plan 00-04 (Wave 3 transport + multiplexer
— SerialTransport + SiTargetMultiplexer + SiSendTask).

**Last completed:** Plan 00-03 — Wave 2 card decoders. Ported the
storage primitives (SiInt/SiArray/SiDict/SiBool/SiEnum/SiModified/
SiDataType/SiStorage, ~600 LOC), BaseSiCard with TWO non-overlapping
registries (codex review #4 — registerSi5Range vs registerSi8Range),
ModernSiCard with explicit page-4 punch-read chain (codex review #3),
SiCard5/SiCard9/SiCard10/SIAC + 7 upstream fixtures + 13 decoder tests
covering storage decode + detectFromMessage dispatch + cross-registry
safety both directions + multi-page chain page-4-and-page-5. SiTime
re-attached to siProtocol.ts (Plan 02 had trimmed it). Plain-array
storage backing avoids the upstream `immutable` runtime dep. Pipeline
green: 41 tests pass / 2 skipped (Wave 4 placeholders for plan 05) /
0 fail. Commits: `fce06b6` (Task 1, port), `ff72a2f` (Task 2, fixtures +
tests). Six auto-fixes applied (5 Rule 1 bugs, 1 Rule 2 SiEnum
duplicate-key tolerance).

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

Last session: 2026-05-12T21:15:31.495Z
Stopped At: Plan 00-03 complete (Wave 2 card decoders)
Resume File: .planning/phases/00-hardware-proof/00-04-PLAN.md

---

## Recent changes to plan

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
