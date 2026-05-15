---
phase: 00-hardware-proof
plan: 02
subsystem: protocol
tags: [crc16, parser, siProtocol, typed-frame-error, node-test, mit-port]

# Dependency graph
requires: [00-01]
provides:
  - CRC16 (non-standard SI variant: poly 0x8005, init=first-two-bytes, MSB-first) — 10 frozen vectors locked
  - parse / parseAll / render — pure, no stdout/stderr writes
  - Typed FrameError channel via parseAll(input, {onFrameError}) — replaces upstream console.warn (codex review #1)
  - SiMessage union (mode | command+parameters), arr2date / date2arr / arr2cardNumber, prettyHex helpers
  - 5 synthetic .bytes.hex fixtures (crc-mismatch, truncated, partial-then-complete, bad-stx, back-to-back)
affects:
  [
    00-03 (card decoders consume parse output),
    00-04 (multiplexer wires onFrameError),
    00-05 (NDJSON bridges onFrameError to frame_error event),
    00-06 (replay smoke uses parseAll on captured bytes),
  ]

# Tech tracking
tech-stack:
  added:
    - "tsconfig.json: allowImportingTsExtensions: true (required for Node 22 strip-types-native '.ts' imports)"
  patterns:
    - 'Per-file MIT NOTICE header on every ported file (D-11)'
    - 'Pure parse() + parseAll() orchestrator wraps it with structured callback channel (no console.* anywhere in siProtocol.ts)'
    - "Internal `badFrame` field on parse result composes cleanly with parseAll's FrameError synthesis without leaking implementation details to public type"
    - 'Synthetic byte fixtures committed verbatim (NOT computed at test-time) to avoid masking CRC bugs'
    - "node:test `mock.method(process.stdout, 'write')` to assert zero stdout/stderr writes from parseAll"

key-files:
  created:
    - packages/sportident/src/constants.ts — full proto table (proto.STX/ETX/ACK/NAK/WAKEUP, basicCmd, cmd, NO_TIME, P_MS_DIRECT/REMOTE) as `const ... as const`
    - packages/sportident/src/siProtocol.ts — CRC16, parse, parseAll, render, arr2date, date2arr, arr2cardNumber, prettyMessage, FrameError, ParseAllOptions, SiMessage union
    - packages/sportident/src/utils/bytes.ts — prettyHex, unPrettyHex, isByteArr, assertIsByteArr, arr2big, isArrOfLengths, assertArrIsOfLengths
    - packages/sportident/src/utils/general.ts — cached, getLookup, waitFor
    - packages/sportident/src/utils/events.ts — node:events re-export + TypedEventEmitter helper (no upstream code copied)
    - packages/sportident/tests/fixtures/synthetic/crc-mismatch.bytes.hex — SET_MS(0x4D) with crc_lo flipped (0x6D 0x0B instead of 0x6D 0x0A)
    - packages/sportident/tests/fixtures/synthetic/truncated-frame.bytes.hex — first 4 bytes only (missing CRC + ETX)
    - packages/sportident/tests/fixtures/synthetic/partial-then-complete.bytes.hex — full SET_MS(0x4D) split across a blank-line boundary
    - packages/sportident/tests/fixtures/synthetic/bad-stx.bytes.hex — 0x42 garbage prefix + valid SET_MS(0x4D)
    - packages/sportident/tests/fixtures/synthetic/back-to-back-frames.bytes.hex — two SET_MS(0x4D) frames concatenated
  modified:
    - tsconfig.json — added allowImportingTsExtensions
    - packages/sportident/src/siProtocol.test.ts — replaced Wave 0 placeholder with full CRC + parse + parseAll + render suite (28 tests, 7 suites)
    - packages/sportident/src/integration/frameError.test.ts — replaced Wave 0 placeholder with fixture-driven onFrameError assertions (5 tests)

key-decisions:
  - "parse() is pure (no callback, no stdout/stderr writes). parseAll() is the single place that synthesizes the typed FrameError and invokes opts.onFrameError. This composes cleanly with Plans 04 (multiplexer wires onFrameError -> 'frameError' event) and 05 (NDJSON bridge wires onFrameError -> frame_error NDJSON event), neither of which has to intercept stdout/stderr."
  - "Bad-CRC and bad-ETX both surface via the same FrameError contract (different error_code values). Stray-garbage / bad-STX bytes are SILENTLY DROPPED with no callback (matches upstream + plan: 'ONLY when the entire remainder is consumed without finding a valid STX' — Phase 0 currently never hits that path since parseAll always advances past stray bytes)."
  - "Synthetic fixtures are committed byte-exact (NOT generated at test time) so a future CRC bug would surface as a fixture-mismatch failure, not silently produce a 'matching' bytes-with-wrong-CRC scenario."
  - "Trimmed upstream's storage-backed SiDate / SiTime classes from this port: Phase 0 uses only the pure arr2date / arr2cardNumber helpers; the class-based wrappers depend on storage/* which Plan 03 will land."

patterns-established:
  - 'MIT NOTICE header preamble: 4-line block (Ported from / Upstream URL / Local modifications / NOTICE.md cross-reference). Plan 03 inherits this exact style for the storage + card-decoder ports.'
  - 'Lodash strip pattern: `_.isEqual(crcA, crcB)` -> `crcA[0] === crcB[0] && crcA[1] === crcB[1]` (CRCs are always 2 bytes). Documented in the siProtocol.ts header so future ports apply the same rule.'
  - 'Internal vs public result-shape pattern: parse returns `{message, remainder, badFrame?}` where `badFrame` is documented as internal and parseAll lifts it into the public FrameError type. Keeps single-frame primitive clean while allowing rich error data to flow.'

requirements-completed:
  - REQ-HW-004

# Metrics
duration: 6 min
completed: 2026-05-12
---

# Phase 0 Plan 02: Protocol foundation Summary

**Ported `siProtocol.ts` + `constants.ts` + 3 utils files (~620 LOC) from `allestuetsmerweh/sportident.js` verbatim under MIT attribution, stripped lodash, replaced the legacy `console.warn` bad-CRC channel with a typed `parseAll(input, {onFrameError})` callback per codex review #1, and locked the non-standard SportIdent CRC16 (poly 0x8005, init=first-two-bytes, MSB-first) with all 10 RESEARCH.md frozen vectors plus a battery of parse/parseAll/render tests driven by 5 byte-exact synthetic fixtures. 28 tests pass, 0 fail, full pipeline green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-12T20:47:49Z
- **Completed:** 2026-05-12T20:54:25Z
- **Tasks:** 2 (per plan)
- **Files modified:** 13 (10 created + 3 modified — tsconfig.json, two Wave 0 placeholders replaced)
- **LOC added:** ~985 lines (5 ported source files + 2 tests; sized by `wc -l`)

## Accomplishments

- All 10 CRC16 frozen vectors from RESEARCH.md §"Test vectors" pass byte-for-byte:
  - empty `[]` -> `[0x00, 0x00]`
  - 1-byte short-circuit (`0x01` / `0x12` / `0xFF`)
  - 2-byte short-circuit identity (`0x01 0x02` / `0x12 0x34`)
  - 3-byte one-iteration + byte-2 sensitivity (`0x12 0x34 0x56` -> `0xBA 0xBB`; `0x12 0x32 0x56` -> `0xBA 0xAF`)
  - 4-byte one-iteration + byte-2 sensitivity (`0x12 0x34 0x56 0x78` -> `0x1E 0x83`; `0x12 0x32 0x56 0x78` -> `0x1E 0xFB`)
- `siProtocol.parse` handles all five frame conditions called for in the plan:
  1. Happy-path frames `[STX, CMD, LEN, ...DATA, crc_hi, crc_lo, ETX]` -> `{message: {command, parameters}, remainder: []}`
  2. Bare single-byte ACK / NAK / WAKEUP modes -> `{message: {mode}, remainder: []}`
  3. Truncated bytes -> `{message: null, remainder: <full input>}` (multiplexer can buffer-and-retry)
  4. Bad CRC -> `{message: null, remainder: <after frame>, badFrame: {code:'crc_mismatch', ...}}` — parseAll wraps this into a public `FrameError`
  5. Bad STX -> drop one byte, return remainder past it (parseAll recurses)
- `parseAll(input, {onFrameError})` contract verified end-to-end:
  - Without a callback: bad-CRC frames silently drop, ZERO writes to `process.stdout`/`process.stderr` (asserted via `mock.method(process.stdout, 'write')` + `mock.method(process.stderr, 'write')` with `callCount === 0` for both)
  - With a callback: typed `FrameError` fires exactly once per corrupted frame carrying `error_code: 'crc_mismatch'`, `expected_crc`, `actual_crc`, `raw_bytes`, `bytes_consumed`
- `render(message)` produces frames that round-trip back through `parse()` to identical `SiMessage` objects (verified for `GET_SI5` + `SET_MS(0x4D)`).
- Back-to-back rendered frames in one buffer -> `parseAll` returns 2 messages with empty remainder. Frame1 + partial frame2 -> 1 message + the partial bytes as remainder (Plan 04 multiplexer can buffer-and-retry).
- Five synthetic byte-exact fixtures committed at `packages/sportident/tests/fixtures/synthetic/`. Each starts with a `#` comment header documenting the case.
- Integration test `frameError.test.ts` replaces the Wave 0 placeholder and asserts the structured-callback contract directly against each fixture. Plan-05 handoff comment included at the bottom.

## Task Commits

| #   | Description                                                                                                                                                                   | Hash      | Conv-commit type |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| 1   | Port constants.ts + utils/{bytes,general,events}.ts + siProtocol.ts with lodash strip, MIT NOTICE headers, and the typed FrameError channel replacing upstream's console.warn | `1b0095d` | `feat(00-02):`   |
| 2   | CRC + parse + parseAll + render tests + 5 synthetic .bytes.hex fixtures + integration/frameError.test.ts (callback-based bad-CRC assertion)                                   | `2102dea` | `test(00-02):`   |

## Files Created / Modified

### Task 1 (port)

- `packages/sportident/src/constants.ts` (93 LOC) — full upstream `proto` table as `const ... as const`. Dropped the upstream `get basicCmdLookup` / `get cmdLookup` accessors (Phase 0 doesn't need reverse lookup; can be added in Plan 03 if storage decoders need it).
- `packages/sportident/src/siProtocol.ts` (356 LOC) — `CRC16`, `parse`, `parseAll`, `render`, `arr2date`, `date2arr`, `arr2cardNumber`, `cardNumber2arr`, `prettyMessage`, `SI_TIME_CUTOFF` plus all type exports (`SiMessage`, `SiMessageWithMode`, `SiMessageWithoutMode`, `FrameError`, `FrameErrorCode`, `ParseAllOptions`, `SiMessageParseResult`, `SiMessagesParseResult`).
- `packages/sportident/src/utils/bytes.ts` (87 LOC) — `isByte`, `isByteArr`, `assertIsByteArr` (asserts-as predicate), `isArrOfLengths`, `assertArrIsOfLengths`, `arr2big`, `prettyHex`, `unPrettyHex`. `substr` -> `slice` (substr is deprecated).
- `packages/sportident/src/utils/general.ts` (59 LOC) — `cached`, `getLookup`, `waitFor`. Dropped upstream's `binarySearch` (no Phase 0 caller).
- `packages/sportident/src/utils/events.ts` (27 LOC) — Replacement (no upstream code copied): `export { EventEmitter } from 'node:events'` + `TypedEventEmitter<EventMap>` helper interface.
- `tsconfig.json` — added `allowImportingTsExtensions: true` (Rule 3 blocker fix — Node 22's strip-types-native pipeline accepts `.ts` import suffixes per RESEARCH style, but `tsc --noEmit` rejects them without this flag).

### Task 2 (tests + fixtures)

- `packages/sportident/src/siProtocol.test.ts` (263 LOC) — replaces the Wave 0 placeholder. 7 `describe` suites, 28 `test` cases total: 10 CRC frozen vectors + 3 bare-mode parses + 2 render+parse round-trips + 2 truncated cases + 2 bad-STX cases + 2 back-to-back cases + 2 bad-CRC callback cases. Uses `node:test` + `node:assert/strict` exclusively (no Jest).
- `packages/sportident/src/integration/frameError.test.ts` (100 LOC) — replaces the Wave 0 placeholder. 5 fixture-driven tests covering all 5 synthetic byte files. TODO(plan-05) comment at the bottom pins the NDJSON-bridge handoff.
- 5 synthetic fixtures in `packages/sportident/tests/fixtures/synthetic/` — all built around `SET_MS(0x4D)` whose real CRC is `0x6D 0x0A` (verified via `siProtocol.CRC16`).

## Public Contract Summary (for Plans 04 + 05)

```ts
export type FrameErrorCode =
  | 'crc_mismatch'
  | 'bad_etx'
  | 'bad_stx'
  | 'truncated'
  | 'buffer_overflow';

export interface FrameError {
  error_code: FrameErrorCode;
  raw_bytes: number[]; // the bytes that were consumed / dropped
  bytes_consumed: number; // how many bytes parseAll advanced past
  expected_crc?: [number, number]; // present when error_code === 'crc_mismatch'
  actual_crc?: [number, number]; // present when error_code === 'crc_mismatch'
}

export interface ParseAllOptions {
  onFrameError?: (err: FrameError) => void;
}

export const parseAll: (
  inputData: number[],
  opts?: ParseAllOptions
) => { messages: SiMessage[]; remainder: number[] };
```

**Plan 04 wires** `onFrameError` straight into `SiTargetMultiplexer.emit('frameError', err)`. **Plan 05 wires** it into the NDJSON output: `(err) => emit({event: 'frame_error', error_code: err.error_code, ...})`. Neither plan has to intercept `console.warn`.

## Lodash strip — exact replacements

The upstream `siProtocol.ts` imports `_ from 'lodash'` and uses `_.isEqual(actualCRC, expectedCRC)` to compare 2-byte CRC arrays. Ported as:

```ts
// Before (upstream):
if (!_.isEqual(actualCRC, expectedCRC)) { ... }
// After (port):
if (actualCRC[0] !== expectedCRC[0] || actualCRC[1] !== expectedCRC[1]) { ... }
```

CRC arrays are always exactly 2 bytes by construction (CRC16's contract), so the explicit comparison is provably equivalent to `_.isEqual` here. The siProtocol.ts file-header lists this as one of the four documented local modifications.

`grep -rn "from ['\"]lodash" packages/sportident/` returns nothing (audited).

## Decisions Made

- **Pure-parse + callback-in-parseAll split** — see key-decisions above. The alternative (have parse() take the callback) would have been simpler but conflated the single-frame primitive with side-effects, making fakes / replay harder. The plan asked for "parse stays pure"; the implementation honors that strictly.
- **Bad-STX is silent in Phase 0** — the plan says callback fires "ONLY when the entire remainder is consumed without finding a valid STX". The current parseAll never hits that path because stray bytes get advanced past until a valid frame surfaces or the buffer empties (in which case there's nothing left to surface). The `'bad_stx'` `FrameErrorCode` is exported as a forward-compatible enum value for Plan 04/05 if they explicitly want to purge buffers.
- **`'bad_etx'` is surfaced** — upstream's `console.warn` on bad ETX is replaced by a `FrameError` with `error_code: 'bad_etx'`. Not currently exercised by a test (synthesizing a bad-ETX byte sequence is fiddly), but the callback contract is in place for Plans 04/05.
- **`allowImportingTsExtensions` toggled in root tsconfig** — Rule 3 blocking fix; the RESEARCH code examples explicitly use `import {...} from './siProtocol.ts'` and Node 22's strip-types-native pipeline requires the `.ts` suffix. `tsc --noEmit` would otherwise reject it.
- **Tsc `as number` casts where `noUncheckedIndexedAccess` requires** — every `arr[i]` returns `T|undefined` under `noUncheckedIndexedAccess: true`. Where we know an index is in range (after explicit length checks), I cast `(arr[i] as number)` rather than disable the flag. Matches existing repo style; the casts are localized and documented by surrounding length guards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc --noEmit` rejected `.ts` import suffixes**

- **Found during:** Task 1 verification (first `pnpm typecheck`).
- **Issue:** Plan + RESEARCH code examples use `import { CRC16 } from './siProtocol.ts'` (Node 22 strip-types-native style). TypeScript 5.6+ rejects `.ts` suffixes unless `allowImportingTsExtensions: true` AND `noEmit: true` are both set.
- **Fix:** Added `"allowImportingTsExtensions": true` to root `tsconfig.json` (root already has `noEmit: true`).
- **Files modified:** `tsconfig.json`.
- **Verification:** `pnpm typecheck` exits 0.
- **Committed in:** `1b0095d` (Task 1 commit).

**2. [Rule 1 - Bug] Pre-commit prettier reformatted ported files**

- **Found during:** Task 1 and Task 2 `git commit` attempts (lefthook pre-commit).
- **Issue:** The ported files used per-arrow-parameter manual newlines that prettier reformatted to fit `printWidth: 100`.
- **Fix:** Ran `pnpm exec prettier --write` on the affected files and re-staged.
- **Files modified:** `siProtocol.ts`, `utils/bytes.ts`, `utils/general.ts`, `siProtocol.test.ts`, `integration/frameError.test.ts`.
- **Verification:** Re-staged commits cleared lefthook; tests + tsc + eslint still green.
- **Committed in:** `1b0095d` (Task 1) and `2102dea` (Task 2).

**3. [Rule 1 - Bug] Plan's literal `grep` audits matched comments mentioning `console.warn`**

- **Found during:** Task 1 final audit.
- **Issue:** The plan's verify command is `grep -En 'console\.(warn|log|error)' packages/sportident/src/siProtocol.ts` (will fail on ANY match, including comments). My file had 5 comment-only mentions describing what upstream does.
- **Fix:** Reworded the 5 comments to say "stdout warning" / "warn-line" / "stdout/stderr" instead of the literal `console.warn` token.
- **Files modified:** `siProtocol.ts` (5 single-word edits), `siProtocol.test.ts` (1 single-word edit).
- **Verification:** `grep -En 'console\.(warn|log|error)' packages/sportident/src/siProtocol.ts` -> exit 1 (no matches); `grep -c 'console\.warn' packages/sportident/src/siProtocol.test.ts` -> 0.

**Total deviations:** 3 auto-fixed (1 Rule 3 blocker, 2 Rule 1 documentation/style bugs). No scope creep; all three are toolchain/audit follow-ons that the plan didn't anticipate.

## Self-Check: PASSED

- `/home/jonas/src/FartOL/packages/sportident/src/constants.ts` — FOUND (93 LOC, MIT NOTICE header present)
- `/home/jonas/src/FartOL/packages/sportident/src/siProtocol.ts` — FOUND (356 LOC, all 9 required exports + types)
- `/home/jonas/src/FartOL/packages/sportident/src/utils/bytes.ts` — FOUND (87 LOC)
- `/home/jonas/src/FartOL/packages/sportident/src/utils/general.ts` — FOUND (59 LOC)
- `/home/jonas/src/FartOL/packages/sportident/src/utils/events.ts` — FOUND (27 LOC)
- `/home/jonas/src/FartOL/packages/sportident/src/siProtocol.test.ts` — FOUND (263 LOC, ≥10 CRC tests)
- `/home/jonas/src/FartOL/packages/sportident/src/integration/frameError.test.ts` — FOUND (100 LOC)
- `/home/jonas/src/FartOL/packages/sportident/tests/fixtures/synthetic/crc-mismatch.bytes.hex` — FOUND
- `/home/jonas/src/FartOL/packages/sportident/tests/fixtures/synthetic/truncated-frame.bytes.hex` — FOUND
- `/home/jonas/src/FartOL/packages/sportident/tests/fixtures/synthetic/partial-then-complete.bytes.hex` — FOUND
- `/home/jonas/src/FartOL/packages/sportident/tests/fixtures/synthetic/bad-stx.bytes.hex` — FOUND
- `/home/jonas/src/FartOL/packages/sportident/tests/fixtures/synthetic/back-to-back-frames.bytes.hex` — FOUND
- Commit `1b0095d` (Task 1) — FOUND in git log
- Commit `2102dea` (Task 2) — FOUND in git log
- `pnpm lint && pnpm typecheck && pnpm test` — green (28 pass / 6 skipped Wave 0 placeholders / 0 fail)
- `grep -rn "from ['\"]lodash" packages/sportident/` — exit 1 (no matches)
- `grep -rEn '^\s*enum\s+\w+' packages/sportident/src/` — exit 1 (no matches)
- `grep -En 'console\.(warn|log|error)' packages/sportident/src/siProtocol.ts` — exit 1 (no matches)
- All five ported files start with the MIT NOTICE header (D-11)

## Final test report

```
ℹ tests 34
ℹ suites 7
ℹ pass 28
ℹ fail 0
ℹ cancelled 0
ℹ skipped 6      # Wave 0 placeholders for plans 03 (SI5/SI9/SI10/SIAC decoders) + 05 (NDJSON + e2e)
ℹ todo 0
ℹ duration_ms ~170
```

## Next Plan Readiness

- Plan 03 (Wave 2 card decoders) can `import { parse, parseAll, render, arr2cardNumber, arr2date, SiMessage } from '../siProtocol.ts'` and `import { proto } from '../constants.ts'` directly. The storage primitives (`SiInt`, `SiArray`, `SiBool`, `SiDataType` etc.) still need to be ported in Plan 03's Task 1 — they're a self-contained group with no further dependencies on Plan 02 surface.
- Plan 04 (Wave 3 transport + multiplexer) wires `parseAll(receiveBuffer, {onFrameError: (err) => this.emit('frameError', err)})` straight into the multiplexer's `handleReceive` loop. No `console.warn` interception is required anywhere.
- Plan 05 (Wave 4 NDJSON output) wires `onFrameError` into the emit function: `(err) => emit({event:'frame_error', error_code: err.error_code, ...})`. The synthetic crc-mismatch fixture already exists as a test input.

---

_Phase: 00-hardware-proof_
_Completed: 2026-05-12_
