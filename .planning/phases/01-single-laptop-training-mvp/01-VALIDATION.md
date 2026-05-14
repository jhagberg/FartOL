---
phase: 1
slug: single-laptop-training-mvp
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-14
updated: 2026-05-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract. Filled by the planner from RESEARCH §"Validation
> Architecture" + plan task verify blocks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (apps/edge/, packages/shared-types/)** | `node:test` + `tsx` (Phase 0 parity) |
| **Framework (apps/web/)** | `vitest` 4.x (SvelteKit default) |
| **Framework (E2E)** | `@playwright/test` 1.x — repo-root tests/e2e/* |
| **Config files** | apps/edge/package.json `test` script · apps/web/vite.config.ts test block · playwright.config.ts at repo root (all created in plan 01) |
| **Quick run command** | `pnpm -w test:quick` (filters: @fartol/edge + @fartol/shared-types + @fartol/web — unit + integration only, no e2e) |
| **Full suite command** | `pnpm -w test && pnpm -w e2e` (all packages + e2e against built `fartol` binary) |
| **Estimated runtime** | quick ~15s · full ~120s (e2e dominates) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter <changed-pkg> test` — runs only the affected package's node:test or vitest suite, < 30s.
- **After every plan wave:** `pnpm -w test` — full unit + integration suite.
- **Before `/gsd-verify-work`:** Full suite green + Playwright e2e green + manual bench-print + bench-read smokes (plan 18 checkpoint).
- **Max feedback latency:** ~120s full · ~15s quick.

---

## Per-Task Verification Map

> One row per task across all 18 plans. Status legend below.

| Task ID | Plan | Wave | Requirement(s) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 0 | REQ-OPS-001 | — | workspace install integrity | unit | `pnpm --filter @fartol/shared-types test` | apps/edge/, apps/web/, packages/shared-types/ | ⬜ pending |
| 01-01-T2 | 01 | 0 | REQ-OPS-001 | T-WS-FAN-OUT, T-CORS | bind 127.0.0.1; reject 0.0.0.0 without --allow-lan | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/server.test.ts | ⬜ pending |
| 01-01-T3 | 01 | 0 | REQ-UI-001 | — | SvelteKit SPA build produces 200.html | build | `pnpm --filter @fartol/web build && test -f apps/web/build/200.html` | apps/web/, playwright.config.ts | ⬜ pending |
| 01-02-T1 | 02 | 0 | REQ-EVT-001, REQ-EVT-002, REQ-EVT-CMP-001, REQ-OPS-001 | T-EVENT-TAMPER, T-MIGRATION-DRIFT | append-only triggers; schema generated + bundled | integration | `pnpm --filter @fartol/edge db:generate && grep CREATE TRIGGER apps/edge/drizzle/0000_initial.sql` | apps/edge/drizzle/0000_initial.sql | ⬜ pending |
| 01-02-T2 | 02 | 0 | REQ-EVT-001, REQ-EVT-002, REQ-EVT-004, REQ-OPS-002 | T-EVENT-TAMPER | embedded migrator idempotent; events append-only | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/db/{schema,events,migrate}.test.ts | ⬜ pending |
| 01-03-T1 | 03 | 0 | REQ-EVT-001, REQ-EVT-002 | T-WS-FAN-OUT, T-DOS-WS, T-EVENT-REPLAY | localhost-origin; maxPayload 256K; replay seq sanity | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/ws/{index,replay}.test.ts | ⬜ pending |
| 01-03-T2 | 03 | 0 | REQ-EVT-001, REQ-EVT-002 | T-DEV-ENDPOINT | /api/__dev/* gated on FARTOL_DEV=1 | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/dev.test.ts | ⬜ pending |
| 01-03-T3 | 03 | 0 | REQ-UI-001, REQ-UI-003, REQ-EVT-CMP-007 | T-WS-FAN-OUT | e2e walking-skeleton via WS | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/walking-skeleton.spec.ts` | tests/e2e/walking-skeleton.spec.ts | ⬜ pending |
| 01-04-T1 | 04 | 1 | REQ-EVT-CMP-001 | T-SQL-INJECT, T-INPUT-SIZE-DOS | Zod validation; max() bounds | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/competitions.test.ts | ⬜ pending |
| 01-04-T2 | 04 | 1 | REQ-EVT-CMP-004, REQ-PRIV-001 | T-CONSENT-BYPASS, T-DUPLICATE-CARD-BINDING, T-CLASS-COMP-MISMATCH | consent: literal true; partial unique; semantic 422 | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/competitors.test.ts | ⬜ pending |
| 01-05-T1 | 05 | 1 | REQ-STD-001 | T-FILE-IMPORT, T-LARGE-BODY-DOS | DOCTYPE rejection; processEntities false; size cap | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/xml/{parse,validate}.test.ts | ⬜ pending |
| 01-05-T2 | 05 | 1 | REQ-EVT-CMP-002, REQ-EVT-CMP-003 | T-PATH-TRAVERSAL, T-XSD-PARTIAL-WRITE | filename sanitization; XSD before commit | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/{ingest,routes}/{courseImport,entryImport,import}.test.ts | ⬜ pending |
| 01-06-T1 | 06 | 2 | REQ-EVT-001, REQ-EVT-002 | T-SEQ-COLLISION | sqlite.transaction serializes nextLocalSeq+INSERT | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/si/eventInserter.test.ts | ⬜ pending |
| 01-06-T2 | 06 | 2 | REQ-HW-001..004, REQ-EVT-CMP-005 | T-USB-EBUSY, T-EVENT-DROP-ON-CRASH | reconnect backoff; bench-replay regression | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/si/bridge.test.ts | ⬜ pending |
| 01-07-T1 | 07 | 2 | REQ-EVT-CMP-005, REQ-EVT-CMP-006 | T-DNF-LOGIC | 9 locked DNF/MP scenarios | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/projection/{matching,dnfMp}.test.ts | ⬜ pending |
| 01-07-T2 | 07 | 2 | REQ-EVT-003, REQ-EVT-004 | T-IDEMPOTENT-BREAK, T-CROSS-COMP-LEAK | pure reducer; two runs identical; competition_id isolation | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/projection/{reduce,idempotent}.test.ts | ⬜ pending |
| 01-08-T1 | 08 | 3 | REQ-EVT-003, REQ-EVT-CMP-007 | T-PROJECTION-DOS, T-DEBOUNCE-COALESCE-LOSS | ProjectionStore debounced recompute | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/projection/store.test.ts + apps/edge/src/routes/results.test.ts | ⬜ pending |
| 01-08-T2 | 08 | 3 | REQ-EVT-CMP-007 | — | markDirty wired into bridge/dev/competitors; hello-replay results_full | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/results.test.ts (integration) | ⬜ pending |
| 01-09-T1 | 09 | 3 | REQ-EVT-CMP-005 | T-AUTO-BIND-DOUBLE, T-RACE-IMPORT-READ, T-CROSS-COMP-BIND | retroactive card_bound; idempotent | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/projection/auto-bind.test.ts | ⬜ pending |
| 01-09-T2 | 09 | 3 | REQ-EVT-CMP-005, REQ-EVT-CMP-004 | — | readout endpoint history cap 12 | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/readout.test.ts | ⬜ pending |
| 01-10-T1 | 10 | 3 | REQ-EVT-CMP-006 | T-CROSS-COMP-MANUAL | manual-dnf cross-comp reject; ws broadcast | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/manual.test.ts | ⬜ pending |
| 01-10-T2 | 10 | 3 | REQ-EVT-CMP-004 | T-REPLACE-CARD-COLLISION, T-MISSING-CONSENT-REPLACE | replace-card atomic; preserves consent_at_ms | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/routes/competitors.test.ts | ⬜ pending |
| 01-11-T1 | 11 | 4 | REQ-UI-006 | T-LOCALSTORAGE-XSS | i18n sync init; tweaks persistence | unit | `pnpm --filter @fartol/web test` | apps/web/src/lib/i18n/index.test.ts + tweaks.svelte.test.ts | ⬜ pending |
| 01-11-T2 | 11 | 4 | REQ-UI-001, REQ-UI-007 | T-DEV-BUTTON-LEAK | AppShell + tokens + TweaksPanel; dev-only Simulate-read | build | `pnpm --filter @fartol/web build && test -f apps/web/build/200.html` | apps/web/src/lib/{layout,ui,components}/*.svelte | ⬜ pending |
| 01-12-T1 | 12 | 4 | REQ-EVT-CMP-001 | — | Home + CompetitionCard + DropZone | unit + build | `pnpm --filter @fartol/web build` | apps/web/src/lib/{screens,components}/*.svelte | ⬜ pending |
| 01-12-T2 | 12 | 4 | REQ-UI-002, REQ-EVT-CMP-002 | T-ORPHAN-COMPETITION, T-CLIENT-XML-PARSE | deferred-POST; client+server XML gating | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/wizard.spec.ts` | tests/e2e/wizard.spec.ts | ⬜ pending |
| 01-13-T1 | 13 | 4 | REQ-UI-004 | — | Skogis deterministic mono-printable | unit | `pnpm --filter @fartol/web test` | apps/web/src/lib/skogis/skogis.test.ts | ⬜ pending |
| 01-13-T2 | 13 | 4 | REQ-UI-003, REQ-UI-005, REQ-EVT-CMP-005, REQ-EVT-CMP-006 | T-XSS-RUNNER-NAME, T-WS-RECONNECT-LOSS | ReadoutView live WS; manual DNF inline | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/readout.spec.ts` | tests/e2e/readout.spec.ts | ⬜ pending |
| 01-14-T1 | 14 | 4 | REQ-EVT-CMP-004, REQ-PRIV-001 | T-CONSENT-UNCHECK, T-CARD-COLLISION-WALKUP | walk-up consent literal; replace-card 409 path | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/walkup.spec.ts` | tests/e2e/walkup.spec.ts | ⬜ pending |
| 01-14-T2 | 14 | 4 | REQ-EVT-CMP-007, REQ-UI-001 | T-PROJECTOR-LEAK | Live results WS-driven; .new flash; F fullscreen | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/results.spec.ts` | tests/e2e/results.spec.ts | ⬜ pending |
| 01-15-T1 | 15 | 4 | REQ-UI-004 | T-USB-LP, T-DOS-PRINT, T-PRINTER-HANG | single-flight queue; queue cap; probe lp* | integration | `pnpm --filter @fartol/edge test` | apps/edge/src/print/escposDriver.test.ts + apps/edge/src/routes/print.test.ts | ⬜ pending |
| 01-15-T2 | 15 | 4 | REQ-UI-004 | T-SHARP-SVG-INPUT, T-AUTOPRINT-LOOP | sharp PNG bitmap; auto-print 400ms delay | unit + integration | `pnpm --filter @fartol/edge test` | apps/edge/src/print/kids-svg-to-bitmap.test.ts | ⬜ pending |
| 01-16-T1 | 16 | 5 | REQ-EVT-CMP-008, REQ-STD-002 | T-XSD-INVALID-LEAK, T-PARTNER-INTEROP | XSD before write; conservative subset | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/xml/iofExport.test.ts | ⬜ pending |
| 01-16-T2 | 16 | 5 | REQ-EVT-CMP-008, REQ-STD-002 | — | preview + download endpoints; UI gating | e2e | `FARTOL_DEV=1 npx playwright test tests/e2e/export.spec.ts` | tests/e2e/export.spec.ts | ⬜ pending |
| 01-17-T1 | 17 | 5 | REQ-OPS-003 | T-BACKUP-WAL-CORRUPT, T-BACKUP-DISK-FULL | online db.backup(); prune 7; admin gate | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/backup/daily.test.ts + apps/edge/src/routes/admin.test.ts | ⬜ pending |
| 01-17-T2 | 17 | 5 | REQ-PRIV-002 | T-RETENTION-MISS, T-RETENTION-OVERREACH, T-EVENT-PAYLOAD-PII-LEAK | scrub idempotent; cross-comp isolation; events untouched | unit | `pnpm --filter @fartol/edge test` | apps/edge/src/privacy/retention.test.ts | ⬜ pending |
| 01-18-T1 | 18 | 5 | REQ-OPS-001, REQ-OPS-002 | T-INSTALL-BACKDOOR, T-PROD-DEV-LEAK, T-MIGRATIONS-MISSING | tarball self-contained; production static-serve | integration | `bash scripts/build-fartol.sh && ls dist/fartol-*.tgz` | apps/edge/scripts/build-tarball.sh | ⬜ pending |
| 01-18-T2 | 18 | 5 | REQ-OPS-001 | T-UDEV-OVER-PERMISSION, T-SYSTEMD-RESTART-LOOP | install-smoke PASS; cold-start migrations | integration | `bash apps/edge/scripts/install-smoke.sh dist/fartol-*.tgz` | tests/install/install-smoke.test.ts + apps/edge/{systemd,udev}/* | ⬜ pending |
| 01-18-T3 | 18 | 5 | REQ-HW-001..004, REQ-UI-004, ROADMAP SC#3+#5+#7 | — | manual bench: real SI cards + thermal print + Tuesday rehearsal | manual | (operator-driven) | (none — checkpoint task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (all landed by plan 03)

- [ ] `pnpm-workspace.yaml` updated to include `apps/*` (plan 01).
- [ ] `apps/edge/package.json` with `test` script (node:test) (plan 01).
- [ ] `apps/web/package.json` with `test` script (vitest) (plan 01).
- [ ] `playwright.config.ts` at repo root (plan 01).
- [ ] `apps/edge/src/db/schema.ts` + Drizzle migration 0000_initial.sql with append-only triggers (plan 02 — [BLOCKING]).
- [ ] `apps/edge/src/db/migrate.ts` — embedded migrator (plan 02).
- [ ] `tests/e2e/walking-skeleton.spec.ts` — simulate-read → DB → REST → WS → stdout-print (plan 03).
- [ ] `packages/shared-types/` pure-TS package (plan 01).
- [ ] `apps/edge/src/ws/index.ts` + WebSocket plugin (plan 03).
- [ ] `apps/edge/src/routes/dev.ts` simulate-read endpoint gated on FARTOL_DEV=1 (plan 03).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thermal receipt prints on actual hardware (Star TSP143 / Epson TM-T20 / Brother PJ-7) | REQ-UI-004, SC#5 | Real ESC/POS device output | Run with printer at `/dev/usb/lp0`; POST /api/competitions/:id/print-receipt with each template; verify Skogis monochrome render + cut (plan 18 Task 3 checkpoint). |
| SI bridge handshake against BSM7/8-USB on `/dev/ttyUSB0` | REQ-HW-001..004, SC#3 | Real serial hardware | Plug Jonas's reader; run `fartol`; insert each of 4 Jonas SI cards (SI5/SI9/SI10/SIAC); verify Phase 0 NDJSON event stream into events table (plan 18 Task 3 checkpoint). |
| StorTuna OK Tuesday training rehearsal | ROADMAP SC#7 | Real event, real operators | Bench rehearsal Tuesday 19:00 — observe operator UX, 20–40 starters (plan 18 Task 3 checkpoint). |
| IOF XML 3.0 ResultList round-trips through external tool (Eventor / MeOS-OZ) | REQ-STD-002, SC#6 | External tool not available in CI | Upload generated ResultList.xml to MeOS-OZ or Eventor import preview; confirm no schema errors (plan 18 Task 3 checkpoint cross-check). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit checkpoint marker (plan 18 Task 3 is explicit checkpoint:human-verify)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every plan has automated verify on Task 1 + Task 2)
- [x] Wave 0 covers schema bootstrap + WS plumbing + walking skeleton
- [x] No watch-mode flags (all CI-friendly node --test / vitest run / playwright test commands)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — awaits gsd-plan-checker pass + execute-plan run.
