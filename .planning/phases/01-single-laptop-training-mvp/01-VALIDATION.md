---
phase: 1
slug: single-laptop-training-mvp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled by the planner from the Validation Architecture section in
> `01-RESEARCH.md`. The planner MUST replace placeholder rows.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (apps/edge/, packages/shared-types/)** | `node:test` + `tsx` (Phase 0 parity) |
| **Framework (apps/web/)** | `vitest` 2.x (SvelteKit default) |
| **Framework (E2E)** | `@playwright/test` 1.x — readout view + 3-click wizard happy paths |
| **Config files** | `apps/edge/package.json` `test` script; `apps/web/vite.config.ts` test block; `playwright.config.ts` at repo root — Wave 0 lands all three |
| **Quick run command** | `pnpm -w test:quick` (planner defines: ~edge node:test + ~web vitest unit, no e2e) |
| **Full suite command** | `pnpm -w test` (all packages + e2e against built `fartol` binary) |
| **Estimated runtime** | quick ~10s · full ~90s (e2e dominates) |

---

## Sampling Rate

- **After every task commit:** `pnpm -w test:quick` — node:test + vitest unit only.
- **After every plan wave:** `pnpm -w test` — full suite including Playwright e2e.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 90s (full) / 10s (quick).

---

## Per-Task Verification Map

> Planner fills this table with one row per task. Use the wave structure
> from `01-RESEARCH.md` §"Suggested Wave Structure" as the skeleton.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {planner fills} | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 (monorepo scaffold + Drizzle bootstrap + walking-skeleton e2e) MUST land:

- [ ] `pnpm-workspace.yaml` updated to include `apps/*` and `packages/*`.
- [ ] `apps/edge/package.json` with `test` script (node:test).
- [ ] `apps/web/package.json` with `test` script (vitest).
- [ ] `playwright.config.ts` at repo root.
- [ ] `apps/edge/src/db/schema.ts` + first generated Drizzle migration under `apps/edge/drizzle/`.
- [ ] `apps/edge/src/db/migrate.ts` — embedded migrator wrapper (called on cold start).
- [ ] `tests/e2e/walking-skeleton.spec.ts` — simulate-read → DB insert → REST `/api/events` → WS `readout:*` → fake receipt print.
- [ ] `packages/shared-types/` pure-TS package with NDJSON event types + REST DTOs + DB row types.

*Without these, downstream tasks have no test surface to assert against.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thermal receipt prints on actual hardware (Star TSP143 / Epson TM-T20 / Brother PJ-7) | REQ-UI-004 | Real ESC/POS device output | Run `pnpm --filter @fartol/edge thermal:smoke` with printer at `/dev/usb/lp0`; verify Skogis monochrome render + cut. |
| SI bridge handshake against BSM7/8-USB on `/dev/ttyUSB0` | REQ-HW-001..004 | Real serial hardware | Plug reader; run `fartol-readout` from `packages/sportident/`; verify Phase 0 NDJSON event stream into `apps/edge/` event log. |
| StorTuna OK Tuesday training rehearsal | ROADMAP SC#7 | Real event, real operators | Bench rehearsal Tuesday 19:00 — observe operator UX, 20–40 starters. |
| IOF XML 3.0 ResultList round-trips through external tool (e.g. Eventor export) | REQ-STD-002, SC#6 | External tool not available in CI | Upload generated `ResultList.xml` to Eventor's import preview; confirm no schema errors. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or explicit Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills the task map

**Approval:** pending
