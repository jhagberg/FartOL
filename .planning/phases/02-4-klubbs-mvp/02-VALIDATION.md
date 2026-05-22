---
phase: 2
slug: 4-klubbs-mvp
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-16
updated: 2026-05-16 (plan-checker BL-1 — Nyquist gate)
---

# Phase 2.0 — Validation Strategy

> Per-phase validation contract. Phase 2.0 extends the Phase 1 validation
> contract (`01-VALIDATION.md`); see RESEARCH §"Validation Architecture"
> (`02-RESEARCH.md` line ~1908) for the full per-requirement test map. This
> file is the gate artifact required by the plan-checker dimension 8 (Nyquist).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (apps/edge/, packages/shared-types/)** | `node:test` + `tsx` (Phase 1 carry-forward) |
| **Framework (apps/web/)** | `vitest` 4.x (SvelteKit default; Phase 1 carry-forward) |
| **Framework (E2E)** | `@playwright/test` 1.x (repo-root `tests/e2e/*` + per-app `e2e/*`) |
| **New dep (Wave 0 gate)** | `saxes@^6` (streaming XML parser; Plan 01 Task 0 npm-verify gate) |
| **Quick run command (phase scope)** | `pnpm --filter @fartol/edge test --test-name-pattern="eventor\|mip\|mop\|hyrbricka\|hired"` (~5s) |
| **Full suite command** | `pnpm -r test && pnpm e2e` (~5 min including Phase 1 carry tests) |
| **Estimated runtime (phase only)** | quick ~5s · full ~120s + ~30s new e2e |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter <changed-pkg> test --test-name-pattern="<feature>"` — only the affected suite, < 10s.
- **After every plan wave:** `pnpm --filter @fartol/edge test && pnpm --filter @fartol/web test` — full unit + integration ~30s.
- **Before `/gsd-verify-work` / Wednesday bench:** Full suite green + Playwright e2e green + `bash apps/edge/scripts/bench-smoke-phase2.sh` against a real bridge (Plan 06 Task 3).
- **Phase gate (Wednesday 2026-05-20 ~16:30-17:30 CEST):** Plan 06 Task 4 blocking-human checkpoint — bench-smoke against real BSM-mini reader + real MeOS install + real Eventor key. ALL 10 steps green required.
- **Max feedback latency:** ~120s full · ~10s quick · ~30s bench-smoke.

---

## Per-Plan Verification Map

> One row per plan. The detailed per-requirement / per-test breakdown lives
> in `02-RESEARCH.md` §"Validation Architecture" (lines ~1908-1964) — this
> table is the index plan-checker dimension 8 reads.

| Plan | Wave | Requirement(s) Covered | Test Type(s) | Automated Command | File Exists |
|------|------|------------------------|--------------|-------------------|-------------|
| 02-01 | 0 | REQ-STD-004 (partial), REQ-EXT-MEOS-001, REQ-PRIV-002, REQ-OPS-001 | unit + integration | `pnpm --filter @fartol/edge test --test-name-pattern="eventor"` | ⬜ pending |
| 02-02 | 1 | REQ-STD-004 (partial), REQ-EVT-CMP-004, REQ-PRIV-002, REQ-EXT-MEOS-001 | unit + integration + component | `pnpm --filter @fartol/edge test --test-name-pattern="competitors\|eventor/lookup" && pnpm --filter @fartol/web test --testPathPattern="(eventorStatus\|WalkupModal\|TweaksPanel)"` | ⬜ pending |
| 02-02b | 2 | REQ-UI-005, REQ-UI-006, REQ-UI-007 | unit + e2e | `pnpm --filter @fartol/web test --testPathPattern="cardQueue\|cardSubscription" && npx playwright test tests/e2e/registration-queue.spec.ts` | ⬜ pending |
| 02-03 | 1 | REQ-EXT-MEOS-001 | unit + integration + contract (XSD) | `pnpm --filter @fartol/edge test --test-name-pattern="integrations/meos/mip"` | ⬜ pending |
| 02-04 | 2 | REQ-EXT-MEOS-001 | unit + integration + contract (XSD) | `pnpm --filter @fartol/edge test --test-name-pattern="integrations/meos/mop"` | ⬜ pending |
| 02-05 | 2 | REQ-EVT-CMP-004, REQ-UI-003, REQ-PRIV-002 | unit + e2e | `pnpm --filter @fartol/edge test --test-name-pattern="hired-cards\|readout" && npx playwright test tests/e2e/hyrbricka.spec.ts` | ⬜ pending |
| 02-06 | 3 | REQ-PRIV-002, REQ-OPS-001, REQ-EXT-MEOS-001 (operational) | unit + integration + bench-smoke + manual | `pnpm --filter @fartol/edge test --test-name-pattern="retention\|bench-smoke-phase2" && bash apps/edge/scripts/bench-smoke-phase2.sh` | ⬜ pending |

---

## Eight Validation Dimensions (Nyquist)

Maps to RESEARCH §"Validation Architecture" — pointers, not duplicates:

1. **Unit** — Per-module logic (saxes streaming, lookupBySiCard, MIP serializer, MOP parser, cardQueue store). Owned by Plan 01/02/02b/03/04/05.
2. **Integration** — Cross-module (Fastify-inject end-to-end, transactional shadow-table writes, auto-merge with WS broadcast). Owned by Plan 03/04/05.
3. **Contract (XSD)** — MIP/MOP XML round-trip against pinned `mip.xsd` v3.0 + `mop.xsd` v2.0 via `libxmljs2`'s `validateXML()`. Owned by Plan 03/04.
4. **End-to-end (Playwright)** — Hyrbricka walkup→readout→Returnerad flow; registration-desk queue auto-advance. Owned by Plan 05 + 02b.
5. **Manual smoke** — `bash apps/edge/scripts/bench-smoke-phase2.sh` against a freshly-booted bridge (6 assertions). Owned by Plan 06 Task 3.
6. **Privacy / PII** — `retention.ts` test extension proves `hired_cards.contact_*` scrubbed after 30 days per REQ-PRIV-002. Owned by Plan 06 Task 1.
7. **Ops runbook drill** — Read `docs/ops/parallel-meos-runbook.md` cold and confirm a non-author operator can boot FartOL + point MeOS at /mip + /mop in <10 min. Owned by Plan 06 Task 2.
8. **Regression / bench (real hardware)** — Plan 06 Task 4 blocking-human checkpoint on Wednesday 2026-05-20 ~16:30. The 10-step round-trip against real BSM-mini + real MeOS + real Eventor key is the only acceptable production gate for SC#1.

---

## Exceptions / Notes

- **No new VALIDATION.md was generated by the research agent because** the Validation Architecture section was inlined directly into `02-RESEARCH.md` (lines ~1908-1964). This file is the canonical Nyquist gate artifact; RESEARCH.md is the source of detail.
- **Phase 2.0 reuses Phase 1's test framework verbatim** — no new framework install. The only net-new dep is `saxes@^6` for streaming XML parsing, gated behind Plan 01 Task 0's `npm view saxes` legitimacy check.
- **bench-smoke-phase2.sh** is the integration gate that bridges automated tests and the Wednesday manual checkpoint. Plan 06 Tasks 3 + 4 share env-var parameterization (`FARTOL_PORT`, `FARTOL_DB`, `FARTOL_HOST`, `FARTOL_SKIP_BOOT`) so the same script tests both the local-mocked-bridge case and the production-bridge case without modification.
- **MIP/MOP no-auth posture** (D-MIP-1 + D-MOP-4) is a Phase 2.0 trade-off accepted in CONTEXT.md `<decisions>`. Phase 2.1 must add `pwd` header verification (RESEARCH §Security Domain calls this out).
- **Multi-course-per-card** (registration-desk Plan 2b reads its second beep but won't bind two courses to one card) remains a documented limitation per CONTEXT.md `<deferred>` — Phase 2.1 scope.

---

## How Plans Mark This Up

Each plan's `must_haves.truths` carries the verifiable claim; `must_haves.artifacts`
lists the test files; the test commands above are what `/gsd-execute-phase` runs at
wave completion. The verifier (`/gsd-verify-work` Phase 2.0) reads this file as the
Nyquist gate authority.
