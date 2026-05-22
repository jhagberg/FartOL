---
phase: 00-hardware-proof
plan: 0.1
type: gap-closure
status: complete
gap_closure: true
completed_at: 2026-05-13
commits:
  - f5df121
  - 9df11ab
  - 598d583
  - b247dc7
  - f205cb6
  - c21a985
findings_addressed:
  critical: [CR-001, CR-002, CR-003]
  warning: [WR-001, WR-002, WR-003]
  info: [] # IN-001 (root build script) deferred
---

# Plan 0.1 — Phase 0 Gap-Closure (post-tag review fixes)

## Summary

Codex performed a deep review of Phase 0 immediately after v0.0.1-handshake was tagged. The review identified 7 findings (3 critical, 3 warning, 1 info). 6 of the 7 were addressed in this cycle; IN-001 (cosmetic — root `pnpm build` script) is deferred to Phase 1.

The most user-visible finding was CR-003: the BSM-mini reader didn't beep on card read because the host never sent the bare ACK (0x06) after a successful page read. Fixed by adding `sendBareAck()` to `SiTargetMultiplexer` and chaining it after `card.read()` in `SiMainStation`. Bench-verified on Jonas's reader 2026-05-13: beeps now fire on every card insert/read cycle.

## Findings Addressed

| ID     | Severity | What                                                                                     | Where                                                            | Commit    |
| ------ | -------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| CR-001 | critical | ESM consumers can't construct SerialTransport (`require` in ESM)                         | `transport/SerialTransport.ts`                                   | `9df11ab` |
| CR-002 | critical | Production --replay didn't round-trip Jonas fixtures (hardcoded SI5, lifecycle mismatch) | `bin/replay.ts`, `SiCard/cardTypeFromNumber.ts` (new)            | `c21a985` |
| CR-003 | critical | Missing bare ACK after card read → mini-reader didn't beep                               | `SiStation/SiMainStation.ts`, `SiStation/SiTargetMultiplexer.ts` | `b247dc7` |
| WR-001 | warning  | Timed-out send leaves stale task at queue head → cascading timeouts                      | `SiStation/SiTargetMultiplexer.ts`                               | `598d583` |
| WR-002 | warning  | Repair script verification parsed at wrong offset (off-by-one)                           | `scripts/repair-station-sn.mjs`                                  | `f5df121` |
| WR-003 | warning  | Card-read errors emitted unhandled EventEmitter `error`                                  | `bin/fartola-readout.ts`                                          | `f205cb6` |

## Deferred

- **IN-001** (info): Root-level `pnpm build` script. Trivial — Phase 1 prep work.

## Tests

99 pass / 0 fail / 0 skipped (up from 92 after Plan 06). New tests:

- `src/integration/esmImport.test.ts` — dist .mjs SerialTransport import (CR-001 regression)
- `src/SiStation/SiTargetMultiplexer.test.ts` — timed-out task does not block subsequent commands (WR-001 regression)
- `src/SiStation/SiMainStation.test.ts` — bare ACK emitted after card read (CR-003 regression, test-side proof)
- `src/bin/replay-jonas-fixtures.test.ts` — all 4 committed Jonas fixtures round-trip byte-equal through production `replayFixture()` (CR-002 regression)

## Bench Evidence

Jonas re-ran `./scripts/hardware-smoke.sh` on 2026-05-13 after the Phase 0.1 commits landed. Reported: "WE GOT BEEEPS!" — BSM-mini fires audible beep on every card insert/read cycle. CR-003 verified on real hardware.

The committed v0.0.1 fixtures in `packages/sportident/tests/fixtures/jonas/` are intentionally frozen at the pre-ACK wire shape — they're historical bench truth from the original 2026-05-13 capture, and `BenchPlaybackTransport` / `PlaybackTransport` tolerate the missing trailing ACK. If a future bench session re-captures with the new ACK byte, the new fixtures land alongside as `*-jonas-002.*` (don't overwrite v0.0.1 truth).

## Public Surface After 0.1

- `import { SerialTransport, SiMainStation, NdjsonEmitter, ... } from '@fartola/sportident'` works for both CJS and ESM consumers
- `fartola-readout --replay <basename>` round-trips any captured fixture byte-equal (with `ts_ms` normalized)
- `fartola-readout` exits non-zero with structured NDJSON on station read errors instead of crashing
- BSM7/BSM8/BSM-mini all beep on card read
- Multiplexer is timeout-robust (one timeout doesn't poison subsequent commands)

## Phase 0 Success Criteria — Re-Confirmed Post-0.1

All 6 ROADMAP criteria stand. CR-003 (the beep) wasn't a ROADMAP criterion but was real-world operator-visible, so it's now also met. Phase 0 + 0.1 are jointly the production-quality v0.0.2-handshake release.

## Next

`/gsd-discuss-phase 1` — Single-laptop training MVP. Phase 1 inherits the corrected sportident package, the four Jonas bench fixtures, the bench-replay regression suite, and the bench smoke script.
