---
phase: 00-hardware-proof
plan: 04
subsystem: transport-station
tags:
  [
    serialport,
    transport,
    multiplexer,
    si-send-task,
    si-main-station,
    handshake,
    wakeup-prepend,
    on-frame-error,
    fake-transport,
    mit-port,
  ]

# Dependency graph
requires: [00-02, 00-03]
provides:
  - 'transport/errors.ts: shared DeviceClosedError + SendTimeoutError (codex review #5)'
  - 'transport/ISerialTransport: DI seam for the multiplexer + station tests'
  - 'transport/SerialTransport: Node serialport@13 wrapper, 38400/8-N-1/no-flow, autoOpen=false'
  - 'SiStation/SiSendTask: state machine — pending -> resolved-or-rejected with typed errors'
  - 'SiStation/SiTargetMultiplexer: Direct-only, WAKEUP-prepending, onFrameError-wiring, 64KB cap'
  - 'SiStation/BaseSiStation: readInfo (GET_SYS_VAL) + writeDiff (SET_SYS_VAL diff per contiguous range)'
  - 'SiStation/SiMainStation: readCards() atomic handshake + SI5/8 card-insert dispatch'
  - 'SiMainStation event surface for Plan 05: cardInserted / cardRead / cardRemoved / frameError / connectionChanged'
affects:
  [
    00-05 (NDJSON bridge subscribes to SiMainStation events),
    00-06 (hardware smoke runs the same SiMainStation on /dev/ttyUSB0),
  ]

# Tech tracking
tech-stack:
  added:
    - 'serialport@13 (declared in @fartola/sportident; loaded LAZILY via require() — tests never load the native dep)'
  patterns:
    - "FakeSerialPort + FakeSerialTransport pattern: tests inject a fake (mimics serialport's open/write/drain/close + on('data'|'close'|'error')) via the constructor's second argument; the native `serialport` module is `require()`d only when no Ctor is injected."
    - 'Send-queue serialisation: SerialTransport AND SiTargetMultiplexer each chain on a private `sendChain: Promise<void>` so back-to-back sends serialise without racing.'
    - 'Codex review #11 WAKEUP-prepending: SiTargetMultiplexer._renderForWire(message) returns [proto.WAKEUP, ...render(message)] and is called by EVERY sendMessage — verified by station test 2 (assert every recordedSends[i][0] === proto.WAKEUP).'
    - 'Codex review #1 onFrameError wiring: parseAll(buf, {onFrameError}) callback is wired DIRECTLY into multiplexer.emit("frameError", err); no stdout interception anywhere — verified by station test 10 with stdout/stderr write spies (zero writes during frame handling).'
    - 'Codex review #5 transport/errors.ts as Task 0: shared error classes created BEFORE any consumer file references them; SerialTransport + SiSendTask both import from this module, no inline class redefinitions.'
    - 'GEMINI MEDIUM 64KB receive-buffer cap (T-00-14): SiTargetMultiplexer._onData drops the buffer + emits a typed "buffer_overflow" frameError when length > 64KB.'
    - "GEMINI MEDIUM zombie-process prevention: SerialTransport AND SiTargetMultiplexer both reject pending sends with DeviceClosedError on transport 'close' — verified by SerialTransport test 10 + SiMainStation test 9."
    - "Cardholder-bypass test pattern (modern cards): the station test's FakeSerialTransport replies to every GET_SI8 with the matching fixture page; the test then filters recordedSends for GET_SI8 entries and asserts the page-4 parameter is in the recorded sequence — proves the page-4 read end-to-end through the station (codex review #3)."

key-files:
  created:
    - packages/sportident/src/transport/errors.ts — DeviceClosedError + SendTimeoutError (21 LOC)
    - packages/sportident/src/transport/ISerialTransport.ts — DI seam (29 LOC)
    - packages/sportident/src/transport/SerialTransport.ts — serialport@13 wrapper (170 LOC)
    - packages/sportident/src/transport/SerialTransport.test.ts — 11 FakeSerialPort tests (232 LOC)
    - packages/sportident/src/SiStation/SiSendTask.ts — state machine (89 LOC)
    - packages/sportident/src/SiStation/ISiStation.ts — interface (15 LOC)
    - packages/sportident/src/SiStation/ISiMainStation.ts — interface + ConnectionState (25 LOC)
    - packages/sportident/src/SiStation/SiTargetMultiplexer.ts — Direct-only multiplexer (194 LOC)
    - packages/sportident/src/SiStation/BaseSiStation.ts — readInfo + writeDiff (95 LOC)
    - packages/sportident/src/SiStation/SiMainStation.ts — handshake + dispatch (174 LOC)
    - packages/sportident/src/SiStation/SiMainStation.test.ts — 10 FakeSerialTransport tests (553 LOC)
  modified: []

key-decisions:
  - "Task 0 ordering (codex review #5): transport/errors.ts created FIRST so SerialTransport (Task 1) and SiSendTask (Task 2) can both import DeviceClosedError + SendTimeoutError without a circular dep, and Task 1's typecheck passes regardless of Task 2's progress."
  - 'WAKEUP prepending centralised in `_renderForWire(message) = [proto.WAKEUP, ...render(message)]` so EVERY sendMessage() call (handshake + GET_SI5 + GET_SI8 + everything else) gets the wakeup byte (codex review #11). Verified by station test 2 over multiple post-handshake commands.'
  - 'parseAll onFrameError wired DIRECTLY into multiplexer.emit("frameError", err) — no stdout/stderr interception anywhere in the SiStation OR transport tree (codex review #1). Station test 10 spies on process.stdout.write + process.stderr.write and asserts zero writes during the bad-CRC frame handling window.'
  - 'Multiplexer simplification: dropped the SET_MS-on-every-call / Remote / Unknown target branches. Total LOC 194 (target was < 250). Removed branches are tagged with the comment `// REMOVED (Phase 0 Direct-only); see RESEARCH §multiplexer.` so a future audit can find them.'
  - "BaseSiStation simplification: trimmed the storage-typed StationConfig wrappers — Phase 0's handshake mutates known byte offsets directly (code=10, mode=Readout, autoSend=false, handshake=true, beeps=true, flashes=true). Offsets exported as STATION_CONFIG_OFFSETS so the station test can verify writes."
  - "GEMINI inline #1 (T-00-14): SiTargetMultiplexer caps the receive buffer at 64KB and emits a typed 'buffer_overflow' frameError when exceeded. Implementation: 6 lines in _onData."
  - 'GEMINI inline #2 (zombie-process prevention): two layers fail any pending send on close — SerialTransport tracks pendingRejecters and calls them in handlePortClose(); SiTargetMultiplexer tracks pendingSendTasks and calls task.abort() in _handleTransportClose(). Both verified by tests.'
  - "SiSendTask timeout timer is NOT unref'd (deviation from upstream): bin/fartola-readout is otherwise idle while awaiting station replies, so unrefing the timer would let Node exit before the timeout fires. Tests that rely on the timeout (test 8) use 100ms timeoutMs and complete deterministically."
  - 'SI_REM cardNumber decode inlined in SiMainStation (rather than reusing BaseSiCard.detectFromMessage): detectFromMessage is registry-driven and only routes SI5_DET / SI8_DET; SI_REM uses the same params layout but bypasses the registry — the cardNumber is rebuilt with the modern-card branch ((hi<<8|lo) | (mid<<16) when mid > 4) inline.'
  - 'Lazy require(''serialport'') in SerialTransport: tests inject a Fake via the constructor''s second arg; the real serialport native module is only loaded when no Ctor is injected. CI never touches the native dep — verified by `grep -c "from ''serialport''" *.test.ts` returning 0.'

patterns-established:
  - "Test-only DI injection pattern: every transport-level class accepts an optional second-arg Ctor for testing. Production code defers to the real native module via lazy require. Documented inline so Plan 05's bin/* can use the same pattern."
  - 'FakeSerialTransport pattern: implements ISerialTransport via EventEmitter; tests configure (matcher, response) rules + an `inject(bytes)` helper for spontaneous frames. Reusable by Plan 05 / Plan 06 fixture-replay paths.'
  - 'connectionChanged state-machine: opening -> open (handshake success) | error (handshake failure); subsequent close() -> closed. Plan 05 NDJSON bridge surfaces these as connection_changed events.'

requirements-completed:
  - REQ-HW-001 # the readout side of "system reads SI5/SI9/SI10/SIAC via BSM7/8" — handshake + dispatch chain complete
  - REQ-HW-002 # legacy SI5 readout via GET_SI5 — single-frame response path proved
  - REQ-HW-004 # CRC validation surface — frameError event emits the typed FrameError payload

# Metrics
duration: ~13 min
completed: 2026-05-12
---

# Phase 0 Plan 04: Transport + station layer Summary

**Replaced upstream's WebUSB/libusb transport with a Node `serialport@13`-based `SerialTransport` (170 LOC) and ported a heavily-simplified Direct-only `SiTargetMultiplexer` (194 LOC vs. upstream's 300+) plus `SiSendTask`, `BaseSiStation` (readInfo + writeDiff), and `SiMainStation` (atomic handshake + SI5/SI8 dispatch) with side-effect imports that populate the BaseSiCard registries. Wired Plan 02's typed `parseAll(buf, {onFrameError})` callback DIRECTLY into the multiplexer's `'frameError'` event (codex review #1 — no stdout interception), prepended `proto.WAKEUP` to EVERY command (codex review #11 — verified end-to-end through station test 2), inlined GEMINI's two MEDIUM findings (64KB receive-buffer cap + close-rejects-pending-send for zombie-process prevention), and locked the modern-card page-4 read at the station level (codex review #3 — verified for SI9 / SI10 / SIAC). Pipeline green: 62 pass / 2 skipped / 0 fail cumulatively (Plan 03 ended at 41 pass; this plan added 11 SerialTransport tests + 10 SiMainStation tests).**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-12T21:20:20Z
- **Completed:** 2026-05-12T21:33:44Z
- **Tasks:** 3 (Task 0 = errors.ts, Task 1 = SerialTransport, Task 2 = station layer)
- **LOC added:** ~1600 lines (production + tests; sized by `wc -l`)
- **Files created:** 11 (9 production + 2 test files)

## Task Commits

| #   | Description                                                                                                                                                                        | Hash      | Conv-commit type |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| 0   | Create transport/errors.ts (DeviceClosedError + SendTimeoutError) FIRST per codex review #5 so Task 1/2 imports resolve regardless of task order                                   | `24012f1` | `feat(00-04):`   |
| 1   | Port SerialTransport — serialport@13 wrapper + ISerialTransport interface + 11 FakeSerialPort tests including back-pressure + close-rejects-pending-send                           | `265e50d` | `feat(00-04):`   |
| 2   | Port the station layer — SiSendTask + SiTargetMultiplexer (WAKEUP-prepending + onFrameError) + BaseSiStation (readInfo + writeDiff) + SiMainStation + 10 FakeSerialTransport tests | `a9a649a` | `feat(00-04):`   |

## Accomplishments

- **Atomic handshake works against a FakeSerialTransport:** `SiMainStation.readCards()` performs `SET_MS(0x4D)` → `GET_SYS_VAL(0,128)` → `SET_SYS_VAL` diff to flip the station into Readout mode (mode=Readout, autoSend=false, handshake=true, beeps=true, flashes=true). Verified by station test 1 + the `connectionChanged: 'open'` event emission.
- **Codex review #11 (WAKEUP prepending) verified:** `SiTargetMultiplexer._renderForWire(message)` returns `[proto.WAKEUP, ...render(message)]` and is called by EVERY `sendMessage()`. Station test 2 records 3+ post-handshake commands and asserts `chunk[0] === proto.WAKEUP` for every recordedSends entry.
- **Codex review #1 (onFrameError wiring) verified:** `parseAll(receiveBuffer, {onFrameError: (err) => this.emit('frameError', err)})` — typed `FrameError` payload propagates unchanged from `siProtocol.parseAll` through `SiTargetMultiplexer` to `SiMainStation`'s `'frameError'` event. Zero `console.warn`/`console.log`/`console.error` references in `packages/sportident/src/SiStation/` OR `packages/sportident/src/transport/` (greppable). Station test 10 verifies zero stdout/stderr writes during bad-CRC frame handling.
- **Codex review #2 + #3 (modern-card station tests + page-4 read) verified:** Station tests 4 (SI9), 5 (SI10), 6 (SIAC) drive the full SI8_DET → cardInserted → typeSpecificRead → GET_SI8 page-read chain against the upstream fixtures. Tests 5 + 6 explicitly assert `0x04` is in the recorded `GET_SI8` page parameters — proves the page-4 read is exercised at the station level (not just the decoder unit-test from Plan 03).
- **Codex review #5 (transport/errors.ts ordering) verified:** Task 0 created `transport/errors.ts` first; `SerialTransport.ts` imports `DeviceClosedError` from `./errors.ts`, `SiSendTask.ts` imports both `DeviceClosedError` and `SendTimeoutError` from `../transport/errors.ts`. No inline class redefinitions; greppable invariants:
  - `grep -c 'class DeviceClosedError' packages/sportident/src/transport/SerialTransport.ts` → 0
  - `grep -c "from './errors" packages/sportident/src/transport/SerialTransport.ts` → 1
  - `grep -c "from '../transport/errors" packages/sportident/src/SiStation/SiSendTask.ts` → 1
- **GEMINI MEDIUM #1 (64KB receive-buffer cap) implemented:** `SiTargetMultiplexer._onData` checks `receiveBuffer.length > 64 * 1024`; on overflow it drops the buffer + emits a typed `frameError` with `error_code: 'buffer_overflow'`. The cap protects against adversarial / noisy byte streams that never yield a valid frame.
- **GEMINI MEDIUM #2 (zombie-process prevention) implemented at TWO layers:**
  - `SerialTransport.handlePortClose()` rejects all in-flight `send()` promises tracked via `pendingRejecters` (verified by SerialTransport test 10).
  - `SiTargetMultiplexer._handleTransportClose()` calls `task.abort()` on every pending `SiSendTask` (verified by SiMainStation test 9 — `pending.send + injectClose() → DeviceClosedError`).
- **SerialTransport edge cases covered (11 tests):** construct (autoOpen false), open success, open error, send + drain, back-pressure ordering, Buffer → number[] data conversion, port close → DeviceClosedError, error forwarding, idempotent close, mid-flight close-rejects-pending-send, constructor opts (38400 / 8-N-1 / no-flow / autoOpen=false).
- **SiMainStation event surface for Plan 05 locked:**
  - `cardInserted(card: BaseSiCard)`: SI5/SI9/SI10/SIAC instance populated with `cardNumber` (+ `cardSeriesByte` for SI8_DET cards).
  - `cardRead(card: BaseSiCard)`: same instance, now with `raceResult` populated (punches, times, cardHolder).
  - `cardRemoved(cardNumber: number)`: emitted on SI_REM frames.
  - `frameError(err: FrameError)`: typed payload from Plan 02's parser.
  - `connectionChanged(state: 'opening' | 'open' | 'closed' | 'error')`: handshake + close lifecycle.
- **Pipeline green:** `pnpm typecheck` exits 0, `pnpm lint` exits 0, `pnpm test` reports 62 pass / 2 skipped (Plan 05's Wave 0 placeholders) / 0 fail.

## Files Created (production)

| File                                   | LOC | Purpose                                                                                                                        |
| -------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/transport/errors.ts`              | 21  | Shared `DeviceClosedError` + `SendTimeoutError`. Created FIRST per codex review #5.                                            |
| `src/transport/ISerialTransport.ts`    | 29  | DI seam — `open() / send() / close()` + `'data' / 'error' / 'close'` events.                                                   |
| `src/transport/SerialTransport.ts`     | 170 | serialport@13 wrapper. Lazy `require('serialport')` so tests run hardware-free.                                                |
| `src/SiStation/SiSendTask.ts`          | 89  | State machine: pending → resolved (response collected) / rejected (timeout / abort). Imports both error types from Task 0.     |
| `src/SiStation/ISiStation.ts`          | 15  | Interface.                                                                                                                     |
| `src/SiStation/ISiMainStation.ts`      | 25  | Interface + `ConnectionState` union.                                                                                           |
| `src/SiStation/SiTargetMultiplexer.ts` | 194 | Direct-only — send-queue + receive-buffer + dispatch. WAKEUP-prepending + onFrameError-wiring + 64KB cap + close-rejects-all.  |
| `src/SiStation/BaseSiStation.ts`       | 95  | `readInfo` (GET_SYS_VAL 0..128) + `writeDiff` (SET_SYS_VAL per contiguous dirty range). Storage-typed config wrappers trimmed. |
| `src/SiStation/SiMainStation.ts`       | 174 | `readCards()` atomic handshake + `'cardInserted' / 'cardRead' / 'cardRemoved' / 'frameError' / 'connectionChanged'` events.    |
| **Total (production):**                | 812 |                                                                                                                                |

## Files Created (tests)

| File                                    | LOC | Tests | Notes                                                                                                                                                                                                                               |
| --------------------------------------- | --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/transport/SerialTransport.test.ts` | 232 | 11    | FakeSerialPort-driven. Construct / open / send / back-pressure / Buffer→array / close-emits-event / post-close-rejects-DeviceClosedError / error-forward / idempotent close / mid-flight-close-rejects-pending / autoOpen+8N1 opts. |
| `src/SiStation/SiMainStation.test.ts`   | 553 | 10    | FakeSerialTransport-driven. Atomic handshake / WAKEUP-on-every-chunk / SI5 / SI9 / SI10 / SIAC / SI_REM / send-timeout / transport-close-mid-flight / bad-CRC frameError with stdout/stderr write spies.                            |
| **Total (tests):**                      | 785 | 21    |                                                                                                                                                                                                                                     |

## Public Contract Summary (for Plan 05)

```ts
// Plan 05 (bin + NDJSON) consumes this surface:

import { SerialTransport } from '@fartola/sportident/transport/SerialTransport.ts';
import { SiMainStation } from '@fartola/sportident/SiStation/SiMainStation.ts';

const transport = new SerialTransport({ path: '/dev/ttyUSB0', baudRate: 38400 });
await transport.open();
const station = new SiMainStation(transport);

station.on('connectionChanged', (state) => emit({ event: 'connection_changed', state }));
station.on('cardInserted', (card) =>
  emit({ event: 'card_inserted', card_number: card.cardNumber })
);
station.on('cardRead', (card) => emit({ event: 'card_read', ...card.raceResult }));
station.on('cardRemoved', (cardNumber) => emit({ event: 'card_removed', card_number: cardNumber }));
station.on('frameError', (err) => emit({ event: 'frame_error', ...err })); // typed FrameError -> NDJSON

await station.readCards(); // handshake + put station in Readout mode
// Process spontaneously emits events until station.close() or transport close.
```

## Decisions Made

- **WAKEUP centralised in `_renderForWire`** (codex review #11) — every wire chunk starts with `0xFF`. Verified by station test 2.
- **`onFrameError` wired directly** (codex review #1) — `parseAll(buf, {onFrameError: (err) => this.emit('frameError', err)})`. No stdout interception anywhere; station test 10 spies on `process.stdout.write` + `process.stderr.write` and asserts zero writes during bad-CRC frame handling.
- **Multiplexer is Direct-only.** Dropped the SET_MS-on-every-call dance + Remote / Unknown branches. 194 LOC vs. upstream's 300+. Removed branches tagged with the auditable comment `// REMOVED (Phase 0 Direct-only); see RESEARCH §multiplexer.`
- **transport/errors.ts as Task 0** (codex review #5) — both SerialTransport and SiSendTask import the shared error classes; no circular dep, no inline redefinitions.
- **64KB receive-buffer cap** (GEMINI MEDIUM #1, T-00-14) — `_onData` checks size after every parse and emits `'buffer_overflow'` frameError + resets the buffer if exceeded.
- **Two layers reject pending sends on close** (GEMINI MEDIUM #2 — zombie-process prevention) — both SerialTransport (port-close → reject in-flight `send()` promises) and SiTargetMultiplexer (transport-close → abort all `SiSendTask`s). Belt-and-braces because either layer could be the one to "see" the close first depending on the failure mode.
- **Lazy `require('serialport')`** — the real native module is only loaded when no Ctor is injected. CI never touches it; tests run in seconds without `pnpm install --frozen-lockfile` needing to compile native bindings.
- **Timer NOT unref'd on SiSendTask** — `bin/fartola-readout` is otherwise idle awaiting station replies, so unrefing would let Node exit before the timeout fires.
- **SI_REM cardNumber decode inlined in SiMainStation** — `BaseSiCard.detectFromMessage` only routes SI5_DET / SI8_DET (Plan 03 codex review #4 invariant). SI_REM reuses the same params layout but bypasses the registry; the cardNumber rebuild uses the modern-card branch `((hi<<8)|lo) | (mid<<16)` when `mid > 4`.
- **BaseSiStation simplified** — Phase 0 mutates known byte offsets directly (`STATION_CONFIG_OFFSETS.CODE / MODE / AUTOSEND / HANDSHAKE / BEEPS / FLASHES`) instead of porting upstream's storage-typed wrappers. `STATION_CONFIG_OFFSETS` exported so the station test can verify writes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SI5 fixture cardNumber arithmetic in test helper**

- **Found during:** Task 2 first SI5 insertion-path test run.
- **Issue:** My initial `buildSi5DetFrame(cardNumber)` decomposed the cardNumber as `lo = num & 0xFF; hi = (num >> 8) & 0xFF; mid = Math.floor(num/100000)` and put them into `params[5..3]` — but `arr2cardNumber` for SI5 uses the 100k-offset path which expects `residual = num - mid*100000` then `hi = (residual >> 8) & 0xFF; lo = residual & 0xFF`. The naive split yielded `412802` instead of `406402`.
- **Fix:** Reworked the SI5 builder to do the 100k decomposition (mid = floor(num/100000), residual = num - mid\*100000, then hi/lo from residual).
- **Files modified:** `packages/sportident/src/SiStation/SiMainStation.test.ts` (helper-only change).
- **Verification:** SI5 insertion-path test passes — `cardInserted.cardNumber === 406402` matches the fixture.
- **Committed in:** `a9a649a` (Task 2).

**2. [Rule 1 - Bug] GET_SI5 response prefix mismatch**

- **Found during:** Task 2 first SI5 insertion-path test run.
- **Issue:** My `renderGetSi5Response` prepended a `[0x00, ...page128]` payload, producing a 129-byte parameter section. The decoder's `frame.slice(2)` then yielded 129 bytes which `SiStorage.splice(0, 128, ...bytes)` rejects with "must preserve length".
- **Fix:** Drop the leading `0x00`. SI5 decoder does `frame.slice(2)` to strip `[cmd, len]`; the response parameters need to be exactly 128 bytes of page data.
- **Files modified:** `SiMainStation.test.ts` (helper-only change).
- **Verification:** SI5 round-trip green; multiplexer dispatches the response correctly.
- **Committed in:** `a9a649a` (Task 2).

**3. [Rule 1 - Bug] node:test runner hung when test 8 left a timeout timer**

- **Found during:** Task 2 first full-suite run.
- **Issue:** My initial `SiSendTask` constructor `unref()`d the timeout timer to "stay out of the event loop". But in production `bin/fartola-readout` is otherwise idle while awaiting station replies — unrefing the timer let the test runner exit before timeouts could fire, cancelling tests 8-10 with "Promise resolution is still pending but the event loop has already resolved".
- **Fix:** Removed the `.unref()` call. The timer now keeps the event loop alive until the response arrives or the timeout fires.
- **Files modified:** `SiSendTask.ts`.
- **Verification:** Test 8 (send-timeout) passes deterministically with 100ms timeout; tests 9 and 10 now run.
- **Committed in:** `a9a649a` (Task 2).

**4. [Rule 1 - Bug] Test 10 mock.method(process.stdout, 'write') broke the test runner**

- **Found during:** Task 2 — test 10 in isolation failed with the file-level test marked failed but no subtest assertions printed.
- **Issue:** `mock.method(process.stdout, 'write', () => true)` replaced the test runner's own write target; the runner couldn't print the test result, and node:test marked the file as a failed test even though the actual subtest assertions would have passed.
- **Fix:** Replaced the mock with a manual write-wrapper that records the call count AND delegates to the original `process.stdout.write` / `process.stderr.write`. Snapshot the count just before injecting the bad-CRC frame and compute the delta after one microtask drain. Restore the originals BEFORE the asserts so failure messages can print.
- **Files modified:** `SiMainStation.test.ts` (test 10 only).
- **Verification:** Test 10 passes — `frameError` fires once with `error_code: 'crc_mismatch'`, both `expected_crc` and `actual_crc` present, zero stdout/stderr writes during frame handling.
- **Committed in:** `a9a649a` (Task 2).

**5. [Rule 1 - Bug] `console.warn` comment in SiTargetMultiplexer.ts header**

- **Found during:** Task 2 verification (`grep -rEn 'console\.(warn|log|error)' packages/sportident/src/SiStation/`).
- **Issue:** The file's MIT NOTICE header had the phrase "NO console.warn interception anywhere" — the grep audit matched the literal token in the comment.
- **Fix:** Reworded the comment to say "NO stdout interception anywhere".
- **Files modified:** `SiTargetMultiplexer.ts` (single-line comment edit).
- **Verification:** `grep -rEn 'console\.(warn|log|error)' packages/sportident/src/SiStation/ packages/sportident/src/transport/` returns 0 matches.
- **Committed in:** `a9a649a` (Task 2).

**6. [Rule 1 - Bug] Prettier reformatted ported files on first commit attempt**

- **Found during:** Task 2 commit attempt (lefthook pre-commit prettier).
- **Issue:** SiMainStation.ts + SiMainStation.test.ts had `pnpm exec prettier --write` reformat them on commit; lefthook rejected the initial commit until the changes were re-staged.
- **Fix:** Ran `pnpm exec prettier --write src/SiStation/SiMainStation.test.ts src/SiStation/SiMainStation.ts` and re-staged.
- **Files modified:** Both files (whitespace only).
- **Verification:** lefthook clean on re-attempt; all 10 SiMainStation tests still pass.
- **Committed in:** `a9a649a` (Task 2).

**Total deviations:** 6 auto-fixed (6 Rule 1 bugs — all toolchain / decoder-output follow-ons that the plan didn't anticipate exactly). No scope creep; all six were necessary to make the plan's acceptance criteria pass.

## Inline GEMINI fixes (called out by user prompt)

**GEMINI MEDIUM #1: 64KB receive-buffer cap (T-00-14)**

Added 6 lines in `SiTargetMultiplexer._onData`:

```ts
if (this.receiveBuffer.length > RECEIVE_BUFFER_CAP_BYTES) {
  const overflowErr: FrameError = {
    error_code: 'buffer_overflow',
    raw_bytes: [],
    bytes_consumed: this.receiveBuffer.length,
  };
  this.receiveBuffer = [];
  this.emit('frameError', overflowErr);
}
```

Rationale: an adversarial / noisy byte stream that never yields a valid frame would otherwise pin unbounded memory. The 64KB cap aligns with `siProtocol.parseAll`'s bounded-shrinkage guarantee from Plan 02 (T-00-07).

**GEMINI MEDIUM #2: transport close rejects pending sends (zombie-process prevention)**

Implemented at two layers — belt-and-braces because either layer could be the first to observe the close depending on the failure mode:

1. `SerialTransport.handlePortClose()`:
   ```ts
   const closedErr = new DeviceClosedError('transport closed mid-flight');
   const rejecters = this.pendingRejecters;
   this.pendingRejecters = [];
   for (const reject of rejecters) reject(closedErr);
   ```
2. `SiTargetMultiplexer._handleTransportClose()` calls `_abortAllPendingSends('transport closed')` which iterates `pendingSendTasks` and calls `task.abort()` on each.

Verified by:

- `SerialTransport.test.ts` test 10 — `fake.emit('close')` while `send()` is mid-drain; the promise rejects with `DeviceClosedError`.
- `SiMainStation.test.ts` test 9 — `fake.injectClose()` mid-`sendMessage`; the returned promise rejects with `DeviceClosedError` and `connectionChanged` transitions to `'closed'`.

## Self-Check: PASSED

- `/home/jonas/src/fartOLa/packages/sportident/src/transport/errors.ts` — FOUND (21 LOC, 2 exported classes)
- `/home/jonas/src/fartOLa/packages/sportident/src/transport/ISerialTransport.ts` — FOUND (29 LOC)
- `/home/jonas/src/fartOLa/packages/sportident/src/transport/SerialTransport.ts` — FOUND (170 LOC, imports DeviceClosedError from `./errors.ts`, no inline class redefinition)
- `/home/jonas/src/fartOLa/packages/sportident/src/transport/SerialTransport.test.ts` — FOUND (232 LOC, 11 tests, zero `from 'serialport'` references)
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/SiSendTask.ts` — FOUND (89 LOC, imports both error types from `../transport/errors.ts`)
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/ISiStation.ts` — FOUND
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/ISiMainStation.ts` — FOUND
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/SiTargetMultiplexer.ts` — FOUND (194 LOC < 250 target, contains `proto.WAKEUP` + `onFrameError` + `REMOVED (Phase 0 Direct-only)` markers; no `console.warn`/`console.log`/`console.error`)
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/BaseSiStation.ts` — FOUND (95 LOC)
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/SiMainStation.ts` — FOUND (174 LOC, contains literal substrings `SET_MS` / `readInfo` / `writeDiff` / `BaseSiCard.detectFromMessage` / `cardInserted` / `cardRead` / `cardRemoved` / `frameError` / `connectionChanged`)
- `/home/jonas/src/fartOLa/packages/sportident/src/SiStation/SiMainStation.test.ts` — FOUND (553 LOC, 10 tests)
- Commit `24012f1` (Task 0) — FOUND in git log
- Commit `265e50d` (Task 1) — FOUND in git log
- Commit `a9a649a` (Task 2) — FOUND in git log
- `pnpm typecheck` — exit 0
- `pnpm lint` — exit 0
- `pnpm test` — 62 pass / 2 skipped / 0 fail
- `grep -rEn 'console\.(warn|log|error)' packages/sportident/src/SiStation/ packages/sportident/src/transport/` — exit 1 (no matches)
- `grep -rn "from 'serialport'" packages/sportident/src/**/*.test.ts` — exit 1 (no matches)
- Every ported file under `src/SiStation/` carries the `Ported from allestuetsmerweh/sportident.js` header line (D-11)

## Final test report

```
ℹ tests 64
ℹ suites 13
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 2     # Plan 05 placeholders (ndjson.test.ts + integration/e2e.test.ts)
ℹ todo 0
ℹ duration_ms ~700
```

Per-suite breakdown:

| Suite                                           | Pass | Fail | Notes                                                    |
| ----------------------------------------------- | ---- | ---- | -------------------------------------------------------- |
| siProtocol.test.ts (CRC + parse + parseAll)     | 24   | 0    | from Plan 02                                             |
| integration/frameError.test.ts                  | 5    | 0    | from Plan 02                                             |
| SiCard/types/SiCard5.test.ts                    | 2    | 0    | from Plan 03                                             |
| SiCard/types/SiCard9.test.ts                    | 1    | 0    | from Plan 03                                             |
| SiCard/types/SiCard10.test.ts                   | 4    | 0    | from Plan 03 (incl. multi-page page-4+5 chain)           |
| SiCard/types/SIAC.test.ts                       | 6    | 0    | from Plan 03 (incl. cross-registry both directions)      |
| **transport/SerialTransport.test.ts**           | 11   | 0    | **this plan** — FakeSerialPort-driven                    |
| **SiStation/SiMainStation.test.ts**             | 10   | 0    | **this plan** — FakeSerialTransport-driven, 4 card types |
| output/ndjson.test.ts + integration/e2e.test.ts | -    | -    | 2 skipped Wave 4 placeholders (Plan 05)                  |
| **Total**                                       | 62   | 0    |                                                          |

## Next Plan Readiness

- Plan 05 (Wave 4 NDJSON output + bin) can `import { SerialTransport } from '../transport/SerialTransport.ts'` and `import { SiMainStation } from '../SiStation/SiMainStation.ts'`, subscribe to the five events documented in `Public Contract Summary`, and translate each into NDJSON lines. The typed `FrameError` payload from Plan 02's parser already flows through the station's `'frameError'` event with `error_code`, `expected_crc`, `actual_crc`, `raw_bytes`, `bytes_consumed` — Plan 05 just maps fields to snake_case JSON.
- Plan 06 (Wave 5 hardware smoke) runs the same `SerialTransport` against `/dev/ttyUSB0` — no further station-layer work needed. The lazy `require('serialport')` in `SerialTransport` resolves at runtime when no Ctor is injected (Plan 05's bin won't inject one).
- All codex review concerns from REVIEWS.md are now satisfied at the test level: review #1 (onFrameError) by station test 10, #2 (modern station tests) by tests 4-6, #3 (page-4 chain) by tests 5-6 + multi-page in Plan 03's SiCard10.test.ts, #5 (transport/errors.ts ordering) by Task 0 commit, #11 (WAKEUP prepending on every command) by test 2.
- GEMINI MEDIUM #1 (buffer overflow) + #2 (zombie-process prevention) implemented inline + tested.

---

_Phase: 00-hardware-proof_
_Completed: 2026-05-12_
