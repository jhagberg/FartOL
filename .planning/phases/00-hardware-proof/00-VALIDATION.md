---
phase: 0
slug: hardware-proof
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `00-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 22 LTS built-in, zero deps) — D-06 |
| **TS support** | Native (Node 22.18+ strips TS by default; verified on 22.19) |
| **Config file** | `tsconfig.json` (strict-mode typechecking only; tsup builds) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm lint && pnpm typecheck && pnpm test` |
| **CI reporter** | `node --test --test-reporter=spec` |
| **Estimated runtime** | ~10 seconds (all fixture-based; no hardware in CI) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm lint && pnpm typecheck && pnpm test`
- **Before `/gsd-verify-work` / tagging `v0.0.1-handshake`:** Full suite green + `./scripts/hardware-smoke.sh` exits 0 + one manual `pnpm exec fartola-readout --once` inspection
- **Max feedback latency:** 10 seconds (per-task) / 30 seconds (per-wave with lint+typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-CRC-01 | TBD | 1 | REQ-HW-004 | — | CRC16-CCITT-0x8005 with SI's init-from-first-2-bytes variant produces frozen vectors | unit | `node --test packages/sportident/src/siProtocol.test.ts` | ❌ W0 | ⬜ pending |
| TBD-CRC-02 | TBD | 1 | REQ-HW-004 | — | Frame with bad CRC emits `frame_error` event, no `card_read` | unit | `node --test packages/sportident/src/integration/frameError.test.ts` | ❌ W0 | ⬜ pending |
| TBD-FRM-01 | TBD | 1 | REQ-HW-004 | — | Truncated frame returns remainder, no crash | unit | `node --test packages/sportident/src/siProtocol.test.ts` | ❌ W0 | ⬜ pending |
| TBD-SI5-01 | TBD | 2 | REQ-HW-002 | — | SI5 fixture decodes to `{cardNumber, punches[], startTime, finishTime}` | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard5.test.ts` | ❌ W0 | ⬜ pending |
| TBD-SI9-01 | TBD | 2 | REQ-HW-001 | — | SI9 fixture decodes correctly | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard9.test.ts` | ❌ W0 | ⬜ pending |
| TBD-SI10-01 | TBD | 2 | REQ-HW-001 | — | SI10 fixture decodes correctly | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard10.test.ts` | ❌ W0 | ⬜ pending |
| TBD-SIAC-01 | TBD | 2 | REQ-HW-001 | — | SIAC fixture decodes; dispatched by card-number range | unit/fixture | `node --test packages/sportident/src/SiCard/types/SIAC.test.ts` | ❌ W0 | ⬜ pending |
| TBD-NDJSON-01 | TBD | 4 | — | — | Each event type emits a valid JSON.parse-able one-line record (snake_case, ms-epoch) | unit | `node --test packages/sportident/src/output/ndjson.test.ts` | ❌ W0 | ⬜ pending |
| TBD-E2E-01 | TBD | 4 | REQ-HW-001,002,004 | — | Fixture bytes → frame → card → NDJSON line | integration | `node --test packages/sportident/src/integration/e2e.test.ts` | ❌ W0 | ⬜ pending |
| TBD-HW-01 | TBD | 5 | REQ-HW-001,002 | — | Real SI5/SI9/SI10/SIAC insertions produce `card_inserted` + `card_read` | manual hw smoke | `./scripts/hardware-smoke.sh` | ❌ W0 | ⬜ pending |
| TBD-HW-02 | TBD | 5 | — | — | Reader opens `/dev/ttyUSB0` and emits `connection_changed: open` event | manual hw smoke | `./scripts/hardware-smoke.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders (`TBD-*`). Planner replaces with concrete IDs (e.g., `0-01-01`) per plan ownership; the row's `Requirement`/`Test Type`/`Automated Command` columns stay verbatim.*

---

## Wave 0 Requirements

Wave 0 must create the test infrastructure that every later task depends on. These files must exist (initially empty or failing) before tasks in Waves 1–5 land:

- [ ] `packages/sportident/src/siProtocol.test.ts` — CRC16 frozen vectors (10 cases) + `parse` happy-path / truncated / bad-CRC
- [ ] `packages/sportident/src/integration/frameError.test.ts` — bad-CRC frame → `frame_error` event
- [ ] `packages/sportident/src/SiCard/types/SiCard5.test.ts` — upstream `siCard5Examples` fixtures through decoder
- [ ] `packages/sportident/src/SiCard/types/SiCard9.test.ts` — SI9 fixtures
- [ ] `packages/sportident/src/SiCard/types/SiCard10.test.ts` — SI10 fixtures
- [ ] `packages/sportident/src/SiCard/types/SIAC.test.ts` — SIAC fixtures + range dispatch
- [ ] `packages/sportident/src/output/ndjson.test.ts` — formatter validity per event type
- [ ] `packages/sportident/src/integration/e2e.test.ts` — fixture replay end-to-end
- [ ] `scripts/hardware-smoke.sh` — operator-driven prompt/assert per card type
- [ ] `packages/sportident/tests/fixtures/{upstream,jonas,synthetic}/` — placeholder dirs
- [ ] `tsconfig.json` — strict-mode config (target esnext, erasableSyntaxOnly, verbatimModuleSyntax)
- [ ] `.github/workflows/ci.yml` — `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`

*No test-framework install required (node:test is built-in). lefthook + commitlint install separately (not test infra).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BSM7/8 enumerates as `/dev/ttyUSB0` on Linux | REQ-HW-001 (success #1) | Hardware-dependent; CI has no SPORTident reader | `ls -l /dev/ttyUSB0` shows `crw-rw---- root:dialout` with cp210x driver bound. Already verified bench-ready in RESEARCH.md (serial 593656). |
| Real SI5 read produces expected `cardNumber` matching printed number | REQ-HW-002 (success #5) | Requires physical SI5 card | `./scripts/hardware-smoke.sh` → insert SI5 when prompted → asserts NDJSON `card_read` event with `card_type: "SI5"` + non-empty punches. Operator sanity-checks `card_number` against card label. |
| Real SI8/9/10 read produces expected output | REQ-HW-001 (success #4) | Requires physical SI9/SI10 card | Same flow as SI5 row. Bench inventory: SI9 + SI10 + SIAC. |
| SIAC read decodes correctly | REQ-HW-001 | Requires physical SIAC card | Same flow. SIAC dispatched by card-number range (8M–9M). |
| Tag `v0.0.1-handshake` after smoke pass | — (phase exit) | Human gates release | After hardware smoke exits 0 + CI green, `git tag v0.0.1-handshake && git push --tags`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references in Per-Task Verification Map
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 10s (per-task) / 30s (per-wave)
- [ ] `nyquist_compliant: true` set in frontmatter once planner finalizes task IDs
- [ ] Hardware smoke script committed and runnable before tagging

**Approval:** pending
