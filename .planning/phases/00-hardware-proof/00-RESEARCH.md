# Phase 0: Hardware proof - Research

**Researched:** 2026-05-12
**Domain:** SportIdent extended protocol, USB-serial transport, Node 22 LTS toolchain
**Confidence:** HIGH for protocol mechanics + CRC + transport; MEDIUM for SIAC series-byte detection
**Researcher:** gsd-researcher (Opus 4.7, 1M context)

---

## Summary

- The CONTEXT.md "WebSerial → node serialport" framing is technically imprecise: upstream `sportident.js` uses **WebUSB** (browser) and **node-usb / libusb** (Node), **not** WebSerial. Port direction stays the same — strip the libusb-style WebUSB device driver, replace with `serialport@13` opening `/dev/ttyUSB0` — but the planner should expect bigger transport surgery than "swap one import" because the upstream driver uses HID-style 64-byte packet I/O whereas we want byte-stream framing. [VERIFIED: gh api on sportident.js repo + sportident-node-usb/package.json `usb ^2.7.0` dep]
- **CRC is non-standard** but exactly specified in 70 lines of code with 10 frozen test vectors in upstream tests (we can copy both verbatim under MIT attribution). Polynomial 0x8005, no traditional init value — the first two input bytes ARE the init; inputs <3 bytes return raw bytes; odd-length inputs pad with `0x00`. CRC bytes are appended MSB-first. [VERIFIED: siProtocol.ts L128-157 + siProtocol.test.ts L? CRC16 block]
- **Port surface is small and clean:** five upstream files (CRC + frame parser, constants, card decoders for SI5 + ModernSiCard family + SI9/10/SIAC, station handshake, BaseSiStation config) are sufficient for Phase 0. Roughly 1500-1800 lines to port. Test fixtures from `siCard5Examples.ts` + `modernSiCardExamples.ts` come for free. [VERIFIED: file enumeration via gh api]
- **Node 22.19 already strips TypeScript types natively** (`process.config.variables.node_use_amaro === true`), so `node:test` can run `.ts` files directly with no loader. Build pipeline still uses tsup (for the published artifact + `.d.ts`), but the test runner gains zero ts-node/tsx deps. [VERIFIED: ran `node /tmp/test_ts.ts` successfully]
- **Hardware is bench-ready:** `/dev/ttyUSB0` exists (root:dialout, 0660), Jonas is in dialout, `cp210x` module is loaded, USB device `10c4:800a` serial `593656` is bound. **Phase 0 success criterion #1 verified satisfied** on this machine right now. [VERIFIED: ls /dev/ttyUSB0 + lsmod + id]

**Primary recommendation:** Copy `siProtocol.ts` (CRC + frame parser) + `constants.ts` verbatim under MIT attribution as the foundation. Hand-write a thin `serialport`-based transport (~150 LOC) that mirrors `ISiDevice.send()` and emits `receive` events as `number[]`. Reuse upstream card decoders for SI5/SI9/SI10/SIAC with surgical adjustments (notably: register a heuristic SIAC detection by card-number range 8M-9M because upstream still has SIAC series-byte as TODO).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Repo scaffold (D-01..D-08):**
- D-01: Single `packages/sportident/` package; defer pnpm workspaces to Phase 1.
- D-02: TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- D-03: Package manager pnpm (corepack enable acceptable).
- D-04: `packages/sportident/` authored as standalone-shaped (own README, LICENSE MIT, exported public API, semver) but NOT published to npm in Phase 0.
- D-05: Build: tsup, dual ESM+CJS output, includes `.d.ts`, one config file.
- D-06: Test runner: node:test (Node 22 LTS built-in), zero extra deps.
- D-07: CI: GitHub Actions lean — one workflow on PR + push to `main` running `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Linux runner. No hardware tests in CI.
- D-08: Commit discipline: lefthook for pre-commit (`lint` + `format`); commitlint enforces Conventional Commits.

**Protocol approach (D-09..D-12):**
- D-09: Port + adapt `allestuetsmerweh/sportident.js` into `packages/sportident/`. Copy protocol code (CRC, frame split, card decoders) verbatim with per-file attribution; replace browser transport with a Node `serialport`-based transport.
- D-10: Card-type coverage for `v0.0.1-handshake`: SI5, SI9, SI10, SIAC Air+. SIAC via BSM7/8 readout uses the same `0xEF` command as SI8-11; beacon-mode SIAC (REQ-HW-003 over SRR) stays Phase 4.
- D-11: Per-file MIT NOTICE header in every ported file, plus a single `NOTICE.md` (or `ATTRIBUTION.md`) at package root listing all upstream references with URLs.
- D-12: sportident.js maintenance verified active 2026-05-12 (last commit 2026-04-10).

**Output contract (D-13..D-16):**
- D-13: Output format: NDJSON, one JSON object per line.
- D-14: Timestamps as milliseconds since Unix epoch (number).
- D-15: JSON field names: snake_case end-to-end.
- D-16: Invocation: bin (e.g. `fartol-readout`) AND a pnpm script (e.g. `pnpm dev:readout`).

**Test strategy (D-17..D-20):**
- D-17: Split: fixture-based unit tests in CI + manual hardware smoke locally before tagging.
- D-18: Fixture sources: BOTH — captured from local reader via `--record` mode (one capture per card type) AND reused from sportident.js's existing test fixtures.
- D-19: Hardware acceptance: scripted smoke (`scripts/hardware-smoke.sh`) that prompts the operator to insert each card type, asserts the expected event types appear on stdout, exits 0 on success.
- D-20: CI scope: everything non-hardware — CRC tables, frame split, card decoders, NDJSON formatting, fixture-driven end-to-end parsing, plus lint and typecheck.

### Claude's Discretion

- Exact `event_type` values (suggest `card_inserted`, `card_read`, `card_removed`, `frame_error`, `connection_changed`).
- Diagnostic logging destination for CRC failures (REQ-HW-004) — suggest stderr so stdout stays pure NDJSON.
- `schema_version: 1` field on every NDJSON event for forward compatibility.
- Exact `tsconfig.json`, `eslint.config.js`, `prettier.config.js`, `tsup.config.ts` contents.
- Hot-plug / disconnect handling depth — suggest graceful retry with backoff; document policy in PLAN.
- `.nvmrc` / `engines` field — pin to Node 22 LTS.
- `commitlint` config — extend `@commitlint/config-conventional`.

### Deferred Ideas (OUT OF SCOPE for Phase 0)

- Future "modernize/optimize `packages/sportident/`" phase (clean-room rewrite, scheduled after Phase 1).
- Email SPORTident developer contact for Communication Library + PC Programmer's Guide (parallel, non-blocking).
- macOS / Windows hardware path (Phase 1+).
- SIAC beacon-mode via SRR dongle (Phase 4, REQ-HW-003).
- Autosend / `0xD3` control-station punch mode (Phase 4, REQ-HW-005).
- `schema_version: 1` is suggested but not yet locked — planner should propose v1 schema.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-HW-001 | Read SI8/9/10/11 via BSM7/8-USB on Linux/macOS/Windows | Phase 0 ships Linux only. Card decoders: `ModernSiCard.ts` covers SI8/9/10. Cross-platform deferred to Phase 1 per CONTEXT. |
| REQ-HW-002 | Read SI5 cards | `SiCard5.ts` standalone decoder (different memory layout, single GET_SI5 page read). |
| REQ-HW-004 | CRC16-CCITT-0x8005 validation on every frame; reject with logged diagnostic | `siProtocol.ts CRC16` + `parse()` already log via `console.warn` on mismatch. Adapt to emit `frame_error` NDJSON event on stderr + skip frame. |

---

## Architectural Responsibility Map

Phase 0 is a single-tier hardware utility — no UI, no API, no DB. The "tiers" are internal layers within the `packages/sportident/` package.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| USB-serial byte I/O | Transport (`SerialTransport`) | — | Only place that imports `serialport`. Emits `Uint8Array`/`number[]` chunks. |
| Frame parsing (STX/CMD/LEN/DATA/CRC/ETX) | Protocol codec (`siProtocol.parse/parseAll/render`) | — | Pure byte-array in, message-or-remainder out. Already exists upstream verbatim. |
| CRC16 validation | Protocol codec (`CRC16`) | — | Pure function; ~30 lines; 10 known test vectors. Reject malformed (REQ-HW-004) at this layer. |
| Station handshake (target = direct, readout mode) | Station layer (`SiMainStation.readCards`) | Protocol codec | Sends SET_MS / GET_SYS_VAL / SET_SYS_VAL; orchestrates send queue + responses. |
| Card detection from insert message | Card layer (`BaseSiCard.detectFromMessage`) | Protocol codec | Per-cardtype `typeSpecificInstanceFromMessage(message)` decides instantiation. |
| Card data read (per-page GET_SI8 / GET_SI5) | Card layer (`SiCard5.typeSpecificRead`, `ModernSiCard.typeSpecificRead`) | Station layer | Pulls 1-8 pages depending on type; stops early via `punchCount`. |
| Punch decoding (code + time + day + ms) | Card layer (`cropPunches`, `getPunchOffset`, `SiTime`) | — | Pure; lives in storage definitions. |
| NDJSON event emission | Output layer (new, `bin/fartol-readout.ts`) | Card + Station layers | Wraps the SI events as `{schema_version, event, ...snake_case_fields}` on stdout; CRC errors on stderr. |
| Hardware acceptance smoke | Scripts (`scripts/hardware-smoke.sh`) | All | Orchestrator for manual testing; not part of the published package. |

**Tier ownership invariant:** Nothing above the Output layer is allowed to call `console.log`. Output layer owns stdout exclusively; everything else logs to stderr or returns errors.

---

## SI Protocol Mechanics

### Frame format (extended protocol — what we care about)

```
[optional 0xFF wakeup byte(s)] 0x02 (STX) | CMD | LEN | DATA[LEN] | CRC_HI | CRC_LO | 0x03 (ETX)
```

- `STX = 0x02`, `ETX = 0x03`, `WAKEUP = 0xFF`, `ACK = 0x06`, `NAK = 0x15`.
- `LEN` is the number of data bytes (not including command/CRC/framing).
- CRC is computed over `[CMD, LEN, ...DATA]` (i.e. the frame body starting at CMD, ending at the last DATA byte) and appended **MSB-first** (`crc_hi` then `crc_lo`).
- Single-byte mode frames are just `WAKEUP`, `ACK`, or `NAK` on their own — no STX/ETX.

[VERIFIED: `packages/sportident/src/siProtocol.ts` L210 (`expectedCRC = CRC16(inputData.slice(1, 3 + numParameters))`) + L255-257 (`render` appends crc then ETX after `STX, ...commandString`).]

### Wakeup behavior

Upstream prepends a single `WAKEUP = 0xFF` byte before every command frame it sends:

```typescript
// SiTargetMultiplexer.ts L237-240
const uint8Data = [
    proto.WAKEUP,
    ...siProtocol.render(sendTask.message),
];
this.siDevice.send(uint8Data);
```

This is for stations in low-power sleep mode. BSM7/8-USB stations are bus-powered and rarely sleep, but the wakeup byte costs nothing — keep it for parity with upstream.

### Baud rate

**38 400 baud, 8-N-1, no flow control.** SET_BAUD command exists (`0x7E` basic / `0xFE` extended) to switch between 4800/38400, but BSM7/8-USB factory-defaults to 38400 and `per-magnusson/sportident-python` falls back to 4800 only on timeout. Phase 0: hard-code 38400; document fallback as a Phase 1 task. [VERIFIED: ecosystem.md §3 + per-magnusson `_connect_reader()` description]

### Handshake sequence

Upstream `SiMainStation.readCards()` performs an **atomic configuration write** that subsumes the handshake:

1. Open serial port, send `WAKEUP` byte.
2. Send `SET_MS` (0xF0) with `P_MS_DIRECT = 0x4D` parameter. Station replies with the same byte echoed back, signaling "I'm here, I'm Master mode."
3. Send `GET_SYS_VAL` (0x83) with offset/length `[0x00, 0x80]` to read 128 bytes of station config.
4. Modify the in-memory config to set `code=10, mode=Readout, autoSend=false, handshake=true, beeps=true, flashes=true`.
5. Diff old vs new, send `SET_SYS_VAL` (0x82) for each contiguous dirty range. Station echoes the first byte of each write.
6. Now in readout mode — station will spontaneously send `SI5_DET (0xE5)`, `SI8_DET (0xE8)`, or `SI_REM (0xE7)` frames when cards are inserted/removed.
7. On detection, send `GET_SI5 (0xB1)` or `GET_SI8 (0xEF) + pageNumber` to read card pages, then `ACK (0x06)` to release the card.

[VERIFIED: `SiMainStation.ts` L55-106 (readCards) + `SiTargetMultiplexer.ts` L165-191 (setTarget→SET_MS) + `BaseSiStation.ts` L140-148 (readInfo→GET_SYS_VAL) + L188-243 (writeDiff→SET_SYS_VAL).]

### Key commands (Phase 0 surface)

| Cmd | Hex | Direction | Purpose |
|-----|-----|-----------|---------|
| SET_MS | 0xF0 | host→station | Set master/slave; argument 0x4D=master, 0x53=slave |
| GET_MS | 0xF1 | host→station | Query master/slave |
| GET_SYS_VAL | 0x83 | host→station | Read N bytes from station config (param: offset, length) |
| SET_SYS_VAL | 0x82 | host→station | Write bytes to station config (param: offset, ...bytes) |
| GET_SI5 | 0xB1 | host→station | Read SI5 card (single page response, 128B) |
| GET_SI8 | 0xEF | host→station | Read modern card page (SI8/9/10/11/SIAC); param: page index |
| SI5_DET | 0xE5 | station→host | SI5 inserted; param incl card-number bytes 3..5 |
| SI8_DET | 0xE8 | station→host | Modern card inserted; param incl card-series byte 2, card-num bytes 3..5 |
| SI_REM | 0xE7 | station→host | Any card removed |
| GET_TIME | 0xF7 | host→station | Read station clock (Phase 4) |
| SET_TIME | 0xF6 | host→station | Set station clock (Phase 4) |
| SIGNAL | 0xF9 | host→station | Beep N times (Phase 4 / smoke test convenience) |

[VERIFIED: `constants.ts` `proto.cmd` table — full list lifted verbatim.]

### "Targeting" / multiplexer concern

Upstream uses a `SiTargetMultiplexer` to support both **direct** stations (the BSM7/8 itself) and **remote** stations (paired stations talking to the BSM via SRR). Phase 0 only needs direct mode. We can hard-code `target=Direct` and skip the multiplexer entirely, sending only `SET_MS(0x4D)` once at startup. Note that ALL commands go through this set-target-then-send dance upstream, but with a fixed target it collapses to just "send" after the initial SET_MS.

[ASSUMED: skipping the multiplexer is safe for direct-mode-only readout. **Risk:** If multiplexer target becomes "Unknown" after error recovery, our simplified code may not recover. Mitigation: re-send `SET_MS(0x4D)` on any frame error.]

---

## CRC16-CCITT 0x8005 Parameters

**This CRC is non-standard.** Do NOT use a library that expects "CRC-16/ARC" or "CRC-16/IBM" — they use the same polynomial but reflect bits and use a fixed init value. SportIdent does neither.

### Exact algorithm (from `siProtocol.ts` L128-157)

```typescript
export const CRC16 = (str: number[]): [number, number] => {
    const CRC_POLYNOM = 0x8005;
    const CRC_BITF = 0x8000;
    // Inputs < 3 bytes: return bytes as-is (or 0x00 padding)
    if (str.length < 3) {
        return [(1 <= str.length ? str[0] : 0x00), (2 <= str.length ? str[1] : 0x00)];
    }
    // Pad to even length with 0x00 bytes
    const s = str.length % 2 === 0 ? str.concat([0x00, 0x00]) : str.concat([0x00]);
    // Init CRC from first two bytes (this is the non-standard part)
    let crc = s[0] * 0x100 + s[1];
    // Process subsequent byte-pairs
    for (let i = 2; i < s.length; i += 2) {
        const c = s.slice(i, i + 2);
        let val = c[0] * 0x100 + c[1];
        for (let j = 0; j < 16; j++) {
            if ((crc & CRC_BITF) !== 0) {
                crc = (crc << 1);
                if ((val & CRC_BITF) !== 0) {
                    crc += 1;
                }
                crc = (crc ^ CRC_POLYNOM);
            } else {
                crc = (crc << 1);
                if ((val & CRC_BITF) !== 0) {
                    crc += 1;
                }
            }
            val = (val << 1);
        }
        crc = (crc & 0xFFFF);
    }
    return [(crc >> 8), (crc & 0xFF)];  // MSB-first
};
```

[VERIFIED: copy-paste from upstream]

### Parameter table

| Property | Value |
|----------|-------|
| Polynomial | `0x8005` (`x^16 + x^15 + x^2 + 1`) |
| Init value | **First two input bytes** (not a fixed seed) |
| RefIn | No (bytes processed MSB-first) |
| RefOut | No |
| XorOut | `0x0000` |
| Output byte order | MSB-first (`crc_hi, crc_lo`) |
| Input padding | Pad with `0x00` to even length |
| Special case | Inputs `< 3 bytes` skip the polynomial loop entirely; result is just the input bytes (`0x00` if missing) |

### Test vectors (from `siProtocol.test.ts`)

These are the **gold-standard fixtures** for the CRC implementation. The planner should make them the FIRST tests written and the FIRST tests to pass.

| Input (hex) | Expected CRC | Notes |
|-------------|-------------|-------|
| `[]` | `[0x00, 0x00]` | Empty |
| `[0x01]` | `[0x01, 0x00]` | 1-byte short-circuit |
| `[0x12]` | `[0x12, 0x00]` | 1-byte short-circuit |
| `[0xFF]` | `[0xFF, 0x00]` | 1-byte short-circuit |
| `[0x01, 0x02]` | `[0x01, 0x02]` | 2-byte short-circuit (identity) |
| `[0x12, 0x34]` | `[0x12, 0x34]` | 2-byte short-circuit (identity) |
| `[0x12, 0x34, 0x56]` | `[0xBA, 0xBB]` | 3-byte (one loop iter, padded) |
| `[0x12, 0x32, 0x56]` | `[0xBA, 0xAF]` | 3-byte sensitivity test |
| `[0x12, 0x34, 0x56, 0x78]` | `[0x1E, 0x83]` | 4-byte (one loop iter) |
| `[0x12, 0x32, 0x56, 0x78]` | `[0x1E, 0xFB]` | 4-byte sensitivity test |

[VERIFIED: `siProtocol.test.ts` L? (CRC16 test block) — these are the exact upstream assertions.]

**Cross-verification with `per-magnusson/sportident-python` `sireader2.py:_crc()`:** Same polynomial 0x8005, same first-two-bytes-as-init pattern, same MSB-first output, same odd-length null-pad. Independent implementation matches — confidence HIGH that the CRC is canonical for the SportIdent ecosystem.

---

## serialport API Substitution Map (browser/libusb → node-serialport)

### Reality check on the "WebSerial → serialport" framing

CONTEXT.md says "Port the WebSerial transport to serialport." Investigation shows upstream `sportident.js` actually uses:
- `sportident-webusb` → browser WebUSB API (NOT WebSerial)
- `sportident-node-usb` → npm `usb` package (libusb wrapper, exposes WebUSB-compatible API)

Both packages drive the **CP2102 chip directly via raw USB control transfers** (configuration=1, interface=0, endpoint=1, 64-byte packets) — bypassing the OS serial driver. Linux `cp210x` kernel module is also unloaded/ignored in this path.

We are NOT continuing upstream's approach. We use `/dev/ttyUSB0` (the kernel-managed TTY) via `serialport@13` — a different transport entirely.

**Implications for the port:**
- We REPLACE all of `sportident-{webusb,node-usb}/src/*` with one new file: `src/transport/SerialTransport.ts`.
- The `ISiDevice` interface upstream is built for packet-oriented USB transfers (`send(uint8Data: number[]): Promise<void>`, `receive` event with `uint8Data: number[]`). serialport is **byte-stream**, not packet-oriented. We have to buffer incoming bytes and emit them to the multiplexer, which already does buffering itself (`receiveBuffer` in `SiTargetMultiplexer.handleReceive`). Good — minimal impedance mismatch.
- USB endpoint flags (`siConfiguration=1, siInterface=0, siEndpoint=1, siPacketSize=64`) become irrelevant. Replaced by: `{path: '/dev/ttyUSB0', baudRate: 38400, dataBits: 8, stopBits: 1, parity: 'none'}`.

### Concrete API substitution table

| sportident-node-usb / WebUSB call | serialport@13 equivalent | Notes |
|-----------------------------------|--------------------------|-------|
| `nodeUsb.requestDevice({filters: [{vendorId, productId}]})` | `SerialPort.list()` + filter by `vendorId === '10c4' && productId === '800a'` | Use vendor/productId from the `list()` result to find the right path. |
| `device.open()` | `new SerialPort({path, baudRate, autoOpen: false})` + `port.open(callback)` | Use `autoOpen: false` so we can set up error handlers first. |
| `device.selectConfiguration(1)` | (no-op) | OS handles. |
| `device.claimInterface(0)` | (no-op) | OS handles via TTY. |
| `device.transferOut(endpoint, data)` | `port.write(Buffer.from(data))` | Returns boolean; if false, wait for `drain` event before next write. |
| `device.transferIn(endpoint, 64)` | `port.on('data', (chunk: Buffer) => ...)` | Stream-style. Buffer chunks and feed to `siProtocol.parseAll`. |
| `device.close()` | `port.close(callback)` | Idempotent. |
| `usb.on('attach', ...)` | Use Node `node:fs.watch('/dev')` or a periodic `SerialPort.list()` poll | More work; defer hot-plug to Phase 1 unless smoke-script needs it. |

### Minimal `SerialTransport` shape (planner reference)

```typescript
// packages/sportident/src/transport/SerialTransport.ts (NEW FILE)
import {SerialPort} from 'serialport';
import {EventEmitter} from 'node:events';

export interface ISerialTransport {
  open(): Promise<void>;
  send(bytes: number[]): Promise<void>;
  close(): Promise<void>;
  on(event: 'data', listener: (bytes: number[]) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}

export class SerialTransport extends EventEmitter implements ISerialTransport {
  private port: SerialPort;

  constructor(opts: {path: string; baudRate?: number}) {
    super();
    this.port = new SerialPort({
      path: opts.path,
      baudRate: opts.baudRate ?? 38400,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });
    this.port.on('data', (chunk: Buffer) => {
      this.emit('data', Array.from(chunk));
    });
    this.port.on('error', (err) => this.emit('error', err));
    this.port.on('close', () => this.emit('close'));
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.open((err) => (err ? reject(err) : resolve()));
    });
  }

  send(bytes: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = this.port.write(Buffer.from(bytes), (err) => {
        if (err) return reject(err);
      });
      if (!ok) this.port.once('drain', () => resolve());
      else this.port.drain((err) => (err ? reject(err) : resolve()));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
```

[CITED: serialport.io API docs (Context7) + autoOpen/drain patterns from guide-usage.md]

### serialport version + dep

```bash
pnpm add serialport@13          # Latest stable, published 2024-12-24
# No parser packages needed — we own framing via siProtocol.parseAll().
```

[VERIFIED: `npm view serialport version` returned `13.0.0`]

---

## sportident.js Port Surface (file-by-file map)

Below is the **minimum** set of files to port for Phase 0. Each path is relative to the upstream `packages/sportident/src/`. All ported files MUST carry per-file MIT NOTICE header (D-11).

| Upstream path | Status in Phase 0 | Action | Notes |
|---------------|-------------------|--------|-------|
| `constants.ts` | **PORT VERBATIM** | Copy as-is | `proto.cmd`, `proto.STX/ETX/WAKEUP/ACK/NAK`, NO_TIME constant. ~90 lines. |
| `siProtocol.ts` | **PORT VERBATIM** | Copy as-is, strip `lodash` dep (use `===` and native deep-equal) | CRC16, parse, parseAll, render, arr2date, date2arr, arr2cardNumber, SiDate, SiTime. ~400 lines. |
| `utils/bytes.ts` | **PORT** | Copy; small | `prettyHex`, `unPrettyHex`, byte assertions used in tests + warnings. |
| `utils/general.ts` | **PORT** | Copy; small | `cached`, `getLookup`, `assertIsByteArr` helpers. |
| `utils/events.ts` | **PORT (or replace with node:events)** | Decide: keep upstream's typed EventTarget (fewer surprises in tests) OR use Node's `EventEmitter` (zero copy). Recommend `node:events` since it's simpler and we control the API surface. | EventTarget polyfill style is heavy for Node use. |
| `storage/*` | **PORT** | Copy storage primitives (SiInt, SiArray, SiDict, SiBool, SiEnum, SiModified, SiDataType, SiStorage) | ~600 lines total. Card decoders depend on these heavily. No external deps. |
| `SiCard/BaseSiCard.ts` | **PORT** | Copy verbatim | NumberRangeRegistry pattern + `detectFromMessage`. |
| `SiCard/IRaceResultData.ts`, `ISiCard.ts`, `ISiCardExamples.ts` | **PORT** | Interfaces; copy | Small. |
| `SiCard/types/SiCard5.ts` | **PORT** | Copy + adapt | SI5 storage layout, `typeSpecificRead` does a single GET_SI5 page. |
| `SiCard/types/ModernSiCard.ts` | **PORT + ADAPT** | Copy; mark TODO comments for SI11/SIAC/FCard series bytes | Base class for SI8/9/10/11/SIAC. SI11 + SIAC series bytes still TODO upstream — see "Landmines." |
| `SiCard/types/SiCard9.ts` | **PORT** | Copy verbatim | Trivial subclass of ModernSiCard. |
| `SiCard/types/SiCard10.ts` | **PORT** | Copy verbatim | 17 lines. Trivial subclass. |
| `SiCard/types/SIAC.ts` | **PORT + WATCH** | Copy verbatim | 19 lines. Uses card-number range 8M-9M (heuristic, not series byte). FINE for Phase 0. |
| `SiCard/types/siCard5Examples.ts`, `modernSiCardExamples.ts`, etc. | **PORT** | Copy verbatim | These ARE our reusable fixtures (D-18 "both" — these are the "theirs"). |
| `SiStation/BaseSiStation.ts` | **PORT + SIMPLIFY** | Copy; consider removing fields we don't read in Phase 0 (battery, sleep timers) — but cheaper to copy verbatim. | The atomic-readInfo/writeDiff pattern is what configures the station for readout. |
| `SiStation/SiMainStation.ts` | **PORT + SIMPLIFY** | Copy; drop the SIAC-detection event listening for `TRANS_REC` (autosend) since that's Phase 4. Keep `readCards()`, drop most of the rest. | The handshake choreography. |
| `SiStation/SiTargetMultiplexer.ts` | **SIMPLIFY HEAVILY** or **REPLACE** | We only need Direct target. Either copy and hard-code Direct, or write a 60-LOC replacement that handles send-queue + receive-buffer + multiplexed promises but drops SET_MS-on-every-call. Recommend: write fresh, simpler. | Multiplexer is the biggest piece of complexity upstream and most of it is dead code for us. |
| `SiStation/SiSendTask.ts` | **PORT** | Copy verbatim | Timeout/state machine for outstanding commands. Small. |
| `SiStation/ISiStation.ts`, `ISiMainStation.ts`, etc. | **PORT** | Copy interfaces | Small. |
| `SiDevice/*` | **REPLACE** | This whole subdir is the USB-device abstraction. Replace with `transport/SerialTransport.ts`. | See substitution map above. |
| `index.ts` | **REWRITE** | Define the public API surface for `packages/sportident/` — export `SiReader` async interface (per ADR-0005), card types, transport. | This is OUR public API, not upstream's. |
| `fakes/*` | **OPTIONAL** | Skip in Phase 0 unless needed for fixture playback | The `FakeSiMainStation` is useful for unit tests but adds ~300 LOC; defer or copy as-needed. |

**Files NOT ported** (out of Phase 0 scope):
- `SiStation/CoupledSiStation.ts` — for paired stations on SRR. Phase 4.
- `SiCard/types/SiCard6.ts`, `SiCard8.ts`, `SiCard11.ts`, `PCard.ts`, `TCard.ts`, `FCard.ts` — not in Jonas's inventory, no fixtures to validate. Skip for v0.0.1-handshake; trivial to add later.
- `SiCard/raceResultTools.ts` — `monotonizeRaceResult`, `makeStartZeroTime` — useful for Phase 1 normalization, not Phase 0 raw stream.
- All `*.test.ts` files in upstream — **DO NOT copy upstream's jest tests verbatim** (they use jest, we use `node:test`). Lift the **fixtures and assertions** out, port to `node:test` syntax.

**LOC estimate:** ~1500-1800 lines copied + ~400-600 lines new code (SerialTransport, NDJSON formatter, bin entrypoint, test ports). Plus tests + fixtures.

---

## Card Decoders (SI5, SI8/9/10, SIAC)

### Card-type detection from insert message

| Insert command | Card family | Detection logic |
|----------------|-------------|-----------------|
| `0xE5` (SI5_DET) | SI5 only | Card number from params[3..5]; instantiate `SiCard5`. |
| `0xE6` (SI6_DET) | SI6 only | Phase 0 OUT OF SCOPE (no SI6 in inventory). |
| `0xE8` (SI8_DET) | Modern (SI8/9/10/11/SIAC/pCard/tCard/fCard) | Card number from params[3..5]; **series byte at params[2]**; consult `ModernSiCardSeries` table. |

**Modern card series byte (params[2] of SI8_DET):**

| Series byte | Card type | Number range |
|-------------|-----------|--------------|
| `0x01` | SiCard9 | 1,000,000 – 1,999,999 |
| `0x02` | SiCard8 | 2,000,000 – 2,999,999 |
| `0x04` | pCard | 4,000,000 – 4,999,999 |
| `0x06` | tCard | 6,000,000 – 6,999,999 |
| `0x0F` | **SiCard10 / SiCard11 / SIAC (shared!)** | 7,000,000 – 9,999,999 |
| `0x0E` | fCard | 14,000,000 – 14,999,999 |

[VERIFIED: `ModernSiCard.ts` `ModernSiCardSeries` enum + cross-verified with `per-magnusson/sportident-python._decode_cardnr()`]

**Disambiguating series 0x0F:**
- Upstream `sportident.js` uses **card-number range only**:
  - `SiCard10`: 7,000,000 – 7,999,999
  - `SIAC`: 8,000,000 – 8,999,999
  - SiCard11: NOT yet supported upstream (the enum has `// SiCard11: ?,` and a TODO)
- Per-magnusson's python lumps them all as "SI10" by range
- Phase 0 strategy: use range-based detection (sufficient for SI5/SI9/SI10/SIAC) and document SI11 as Phase 1 task

### SI5 layout (`SiCard5.ts`)

- Single 128-byte page returned by `GET_SI5 (0xB1)` command (response carries 2 leading bytes we slice off).
- Card number at bytes `[0x05, 0x04, 0x06]` (uses `arr2cardNumber`).
- Start time at `[0x14, 0x13]`, Finish at `[0x16, 0x15]`, Check at `[0x1A, 0x19]` (12-bit half-day clock — see SiTime + `SI_TIME_CUTOFF = 43200`).
- Punch count at `[0x17]` (stored as count+1, decode with `-1`).
- Up to **36 punches** (30 with time + 6 codes-only).
- Per-punch layout: 3 bytes per punch in slots 0-29 (`code, time_hi, time_lo`) at `0x20 + floor(i/5) + 1 + i*3`; slots 30-35 are code-only at `0x20 + (i-30)*16`.
- `cropPunches` keeps only entries with `code !== 0x00 && code !== undefined`.

### Modern card layout (`ModernSiCard.ts`, used by SI8/9/10/11/SIAC)

- Multi-page read: GET_SI8 with page index 0..7. 128 bytes per page after stripping 3-byte response header.
- Page 0: card metadata. Pages 1-3: cardholder info. Pages 4-7: punches (32 per page, 4 bytes per punch).
- UID at `[0x03, 0x02, 0x01, 0x00]` (big-endian 4 bytes).
- Card series at `[0x18]`.
- Card number at `[0x19, 0x1A, 0x1B]` (3 bytes).
- Start at `[0x0F, 0x0E]`, Finish at `[0x13, 0x12]`, Check at `[0x0B, 0x0A]`.
- Punch count at `[0x16]`.
- Per-punch (4 bytes at offset `0x200 + i*4`): `[day, code, time_hi, time_lo]` where day is `(weekday<<1) | half_day_flag`.
- Read shortcut: read page 0; if `punchCount <= 32`, done (skip pages 5-7). If `<= 64`, read page 5 only. Etc.

[VERIFIED: `ModernSiCard.ts` `typeSpecificReadPunches` chain L241-277]

### SI9 / SI10 / SIAC specifics

- **SI9** (`SiCard9.ts`): Inherits ModernSiCard but has DIFFERENT punch offset (`0x38 + i*4`) and max 50 punches in 2 pages (0+1). Cardholder shorter (24 bytes). `BaseSiCard.registerNumberRange(1000000, 2000000, SiCard9)`.
- **SI10** (`SiCard10.ts`): Pure ModernSiCard, register at `7000000, 8000000`.
- **SIAC** (`SIAC.ts`): Pure ModernSiCard, register at `8000000, 9000000`. NOTE upstream comment: `// TODO: find out the series value and remove this hack` — series byte detection is missing. Phase 0 is fine because the range check works.

### Time semantics — the half-day-clock gotcha

SI cards store time as **seconds since midnight or midday** (12-hour), with a separate `am/pm` bit. `SiTime` class returns seconds 0-43199 (12h-1s). The "day" byte in modern card punches has the half-day flag in bit 0. To convert to wall-clock you need:
- A reference date (operator-provided or station-clock-derived)
- The half-day bit from the punch (modern cards) or from card header (SI5)
- Detect day wraparounds for events spanning midnight

**Phase 0 stance:** Emit the raw fields (`time_seconds_in_half_day: 7643`, `half_day: 0`, `weekday: 0`, `code: 31`) and let Phase 1 do wall-clock conversion. We do NOT have enough context (event start date, time zone) at Phase 0 to safely produce ms-epoch wall-clock times for punches.

**Exception:** for the card insert/read/remove events emitted by Phase 0, we DO emit ms-epoch — those are events that happen NOW on the host, so `Date.now()` is the right answer.

[ASSUMED: Jonas will not be surprised that Phase 0 punch times are raw seconds, not wall-clock. **Risk:** if Phase 1 expects ms-epoch on every field, schema breaks. **Mitigation:** Document the schema clearly in NDJSON Output Schema section below; planner should reflect this in the schema docs.]

---

## NDJSON Output Schema

### Design constraints (recap)

- Pure NDJSON: one JSON object per line on stdout (D-13).
- All field names snake_case (D-15).
- All timestamps that happen on host = ms-epoch number (D-14). Card-internal times = raw seconds (see above).
- `schema_version: 1` on every event (Claude's discretion suggestion — STRONGLY recommended; lock it).
- Errors and diagnostics go to **stderr**, not stdout (Claude's discretion: keeps stdout pure for parsers).

### Event types

| `event` value | When | Stable fields |
|---------------|------|---------------|
| `connection_changed` | Port opened, closed, errored, station handshake completed | `state` ('opening' / 'open' / 'closed' / 'error'), `device_path`, optional `error` |
| `card_inserted` | Station emits SI5_DET / SI8_DET | `card_type` ('SI5' / 'SI9' / 'SI10' / 'SIAC'), `card_number`, `card_series_byte` (modern only) |
| `card_read` | After all card pages read successfully | full punch + metadata payload (below) |
| `card_removed` | Station emits SI_REM | `card_number` |
| `frame_error` | CRC failure, bad STX/ETX, unparseable byte stream | `error_code`, `error_message`, `raw_bytes` (hex), `bytes_consumed` |

### Stable schema (v1)

Every event has these top-level fields:

```json
{
  "schema_version": 1,
  "event": "<event_type>",
  "ts_ms": 1715543532471,
  "device_path": "/dev/ttyUSB0",
  "device_serial": "593656",
  ...event-specific fields
}
```

### `card_read` payload (the meaty one)

```json
{
  "schema_version": 1,
  "event": "card_read",
  "ts_ms": 1715543532471,
  "device_path": "/dev/ttyUSB0",
  "device_serial": "593656",
  "card_type": "SI10",
  "card_number": 7050892,
  "card_series_byte": 15,
  "uid": 2006910617,
  "start": { "seconds_in_half_day": 8721, "half_day": 0, "weekday": null },
  "finish": null,
  "check": null,
  "clear": null,
  "punch_count": 16,
  "punches": [
    { "code": 31, "seconds_in_half_day": 7967, "half_day": 0, "weekday": 0 },
    { "code": 32, "seconds_in_half_day": 8224, "half_day": 0, "weekday": 0 }
  ],
  "card_holder": null,
  "raw_pages_b64": "<base64 of all read pages, optional>"
}
```

**Notes:**
- `card_type` is one of `SI5 | SI8 | SI9 | SI10 | SI11 | SIAC | PCARD | TCARD | FCARD` (only SI5/SI9/SI10/SIAC implemented in Phase 0 — emit the rest only when added).
- `uid` is undefined/null for SI5 (SI5 has no UID).
- `half_day` is `0` (AM) or `1` (PM); `weekday` is `0`-`6` (Sunday=0) when the card layout provides it (modern punches), else `null` (SI5 doesn't store weekday on most fields).
- `null` for unread fields (e.g. cards with no Finish punch yet).
- `raw_pages_b64` is OPTIONAL and gated by a `--include-raw-pages` flag. Useful for debugging + Phase 1 re-parsing, but bloats the stream.

### `frame_error` payload

```json
{
  "schema_version": 1,
  "event": "frame_error",
  "ts_ms": 1715543532471,
  "device_path": "/dev/ttyUSB0",
  "error_code": "crc_mismatch",
  "error_message": "Invalid CRC: 0x12 0x34 (expected 0xBA 0xBB)",
  "expected_crc_hex": "BABB",
  "actual_crc_hex": "1234",
  "raw_bytes_hex": "0202 ... 03",
  "bytes_consumed": 12
}
```

`error_code` is one of `crc_mismatch | bad_etx | bad_stx | truncated | unknown_command`.

Emit this on **stdout** (per D-13: all events are NDJSON on stdout). Additionally, also emit a one-line human diagnostic on **stderr** so it's visible during interactive testing without a JSON parser:

```
[2026-05-12T19:12:01.234Z] frame_error crc_mismatch: expected BABB, got 1234 (12 bytes consumed)
```

### Why this schema maps onto Phase 1's events table

The architecture doc defines the events table:

```sql
CREATE TABLE events (
  node_id, local_seq, event_type, event_time_ms, recorded_at_ms, payload, ...
);
```

The Phase 0 NDJSON maps directly:
- `event_type` ← `event`
- `recorded_at_ms` ← `ts_ms`
- `event_time_ms` ← derived in Phase 1 from `start/finish/check/punches[].seconds_in_half_day` + event date
- `payload` ← rest of the JSON object (minus the redundant `recorded_at_ms`)
- `node_id` / `local_seq` ← assigned by Phase 1's ingester (not Phase 0's job)

---

## Validation Architecture

This phase has `nyquist_validation: true` (default — config.json doesn't disable it).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 22 LTS built-in, zero deps) — D-06 |
| TS support | Native (Node 22.18+ `--experimental-strip-types` enabled by default since 22.18; verified 22.19 has it via `process.config.variables.node_use_amaro === true`) |
| Config file | None needed for the runner itself. tsconfig.json governs strict-mode checking. |
| Quick run command | `node --test packages/sportident/src/**/*.test.ts` (per-package fast path) |
| Full suite command | `pnpm -r test` (root-level; in Phase 0 this is equivalent — only one package) |
| Watch mode | `node --test --watch packages/sportident/src/**/*.test.ts` |
| Tap reporter for CI | `node --test --test-reporter=spec` |

[VERIFIED: ran a `.ts` file under Node 22.19 without any flags or loader and it worked.]

**Important Node-22 TS-stripping caveats** (relevant for `tsconfig.json`):
- Enums: TypeScript enums generate runtime code; Node's stripper rejects them. **Don't use `enum`** — use `const X = { ... } as const` objects (upstream does this for `ModernSiCardSeries`). ✓ No work needed; upstream is already enum-free.
- Namespaces: Stripper rejects instantiated namespaces. Upstream uses none.
- `tsconfig.json` is **ignored** by Node's stripper (no path mapping, no JS-target transformation). Use relative imports only. ✓ Upstream uses relative imports.
- Recommended `tsconfig.json` for strict typechecking only (build is via tsup):

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

[CITED: Node v22.19 TypeScript docs + satanacchio.hashnode.dev type-stripping notes]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-HW-004 | CRC16 produces correct bytes for known inputs | unit | `node --test packages/sportident/src/siProtocol.test.ts` | Wave 0 |
| REQ-HW-004 | CRC mismatch on frame produces `frame_error` event, frame discarded | unit | `node --test packages/sportident/src/integration/frameError.test.ts` | Wave 0 |
| REQ-HW-004 | Truncated frame doesn't crash; parser returns remainder | unit | `node --test packages/sportident/src/siProtocol.test.ts` | Wave 0 |
| REQ-HW-002 | SI5 fixture decodes to expected `{cardNumber, punches[], startTime, finishTime}` | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard5.test.ts` | Wave 0 |
| REQ-HW-001 (SI9 part) | SI9 fixture decodes correctly | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard9.test.ts` | Wave 0 |
| REQ-HW-001 (SI10 part) | SI10 fixture decodes correctly | unit/fixture | `node --test packages/sportident/src/SiCard/types/SiCard10.test.ts` | Wave 0 |
| REQ-HW-001 (SIAC part) | SIAC fixture decodes correctly + dispatches to SIAC class by number range | unit/fixture | `node --test packages/sportident/src/SiCard/types/SIAC.test.ts` | Wave 0 |
| (architectural) | NDJSON formatter produces valid JSON one-line records for each event type | unit | `node --test packages/sportident/src/output/ndjson.test.ts` | Wave 0 |
| (architectural) | End-to-end fixture → bytes → frame → card → NDJSON line | integration | `node --test packages/sportident/src/integration/e2e.test.ts` | Wave 0 |
| (architectural) | Real reader produces a `connection_changed: open` event when /dev/ttyUSB0 opens | manual hw smoke | `./scripts/hardware-smoke.sh` | Wave 0 (script) |
| REQ-HW-001/002 | Real SI5/SI9/SI10/SIAC insertions produce `card_inserted` + `card_read` with non-empty punches | manual hw smoke | `./scripts/hardware-smoke.sh` | Wave 0 (script) |

### Fixture Strategy

**Two-source fixture strategy (D-18):**

1. **From upstream sportident.js** (`packages/sportident/src/SiCard/types/{siCard5Examples,modernSiCardExamples,siCard9Examples}.ts`):
   - `getCardWith16Punches`, `getFullCard`, `getEmptyCard` etc.
   - Each fixture has `cardData` (the expected decoded result) AND `storageData` (the raw byte pages).
   - This means: feed `storageData` into our decoder, assert deep-equal with `cardData`. Free regression coverage.

2. **From local reader via `--record` mode:**
   - Add a `--record <output.ndjson>` flag to the bin that ALSO writes the raw frames to the file as it processes them.
   - Jonas runs `pnpm dev:readout --record fixtures/si5-jonas-001.ndjson` and inserts his SI5.
   - The resulting NDJSON file contains both the decoded card_read events AND raw byte hex (raw_pages_b64) for replay.
   - A second flag, `--replay <input.ndjson>`, reads the raw bytes and re-runs them through the decoder — confirming determinism.
   - Captured fixtures get committed to `packages/sportident/tests/fixtures/`.

**Fixture file layout proposal:**

```
packages/sportident/tests/fixtures/
├── upstream/                  # Copied verbatim from sportident.js (under MIT NOTICE)
│   ├── si5-16-punches.ts
│   ├── si5-full.ts
│   ├── si9-empty.ts
│   ├── si10-16-punches.ts
│   └── siac-typical.ts
├── jonas/                     # Captured locally via --record
│   ├── si5-jonas-001.bytes.hex
│   ├── si5-jonas-001.expected.json
│   ├── si9-jonas-001.bytes.hex
│   ├── si9-jonas-001.expected.json
│   ├── si10-jonas-001.bytes.hex
│   ├── si10-jonas-001.expected.json
│   └── siac-jonas-001.{bytes.hex,expected.json}
└── synthetic/                 # Hand-crafted edge cases
    ├── crc-mismatch.bytes.hex
    ├── truncated-frame.bytes.hex
    ├── partial-frame.bytes.hex
    └── malformed-stx.bytes.hex
```

**Fixture format:**
- `.bytes.hex`: one whitespace-separated hex byte per token, ignore comments after `#`. Trivial to load with `fs.readFileSync().split(/\s+/).filter(Boolean).map(s => parseInt(s, 16))`.
- `.expected.json`: the expected NDJSON output lines, one per line. Tests assert that running the decoder over the bytes produces this exact output.
- `.ts` files (upstream-style): TypeScript modules exporting `{cardData, storageData}` — used directly by `node:test` via import.

### Manual Hardware Smoke

`scripts/hardware-smoke.sh` (shell script, simple, runs by Jonas before tagging v0.0.1-handshake):

```
1. Check /dev/ttyUSB0 exists and user has rw access
2. Start the bin in background, pipe stdout to a tempfile, stderr to console
3. Prompt: "Insert SI5 card now (Enter when done)..."
4. Wait, then assert tempfile has card_inserted + card_read events with card_type=SI5
5. Repeat for SI9, SI10, SIAC
6. Exit 0 if all 4 cards round-tripped; exit 1 with diff otherwise.
7. Clean up: kill background bin, remove tempfile.
```

Each step shows the captured card_number on screen so Jonas can sanity-check against the card's printed number.

### Sampling Rate

- **Per task commit:** `pnpm lint && pnpm typecheck && pnpm test` (target: < 10s on this Lenovo). All non-hardware tests run.
- **Per wave merge:** Same — CI runs the same lean suite.
- **Phase gate (before tagging v0.0.1-handshake):**
  1. Full CI suite green.
  2. `./scripts/hardware-smoke.sh` exits 0 with all 4 cards.
  3. `pnpm exec fartol-readout --once` confirms one real card read manually (operator inspection of NDJSON output).

### Wave 0 Gaps

Wave 0 must create the test infrastructure that everything else depends on. These tests must exist (initially failing or empty) BEFORE other tasks land:

- [ ] `packages/sportident/src/siProtocol.test.ts` — CRC16 test-vector block (10 cases), `parse` happy-path, `parse` truncated, `parse` bad CRC.
- [ ] `packages/sportident/src/integration/frameError.test.ts` — CRC mismatch produces `frame_error` event in NDJSON output.
- [ ] `packages/sportident/src/SiCard/types/SiCard5.test.ts` — runs upstream `siCard5Examples` fixtures through decoder.
- [ ] `packages/sportident/src/SiCard/types/SiCard9.test.ts` — same for SI9.
- [ ] `packages/sportident/src/SiCard/types/SiCard10.test.ts` — same for SI10.
- [ ] `packages/sportident/src/SiCard/types/SIAC.test.ts` — same for SIAC.
- [ ] `packages/sportident/src/output/ndjson.test.ts` — formatter produces valid JSON.parse-able lines for each event type.
- [ ] `packages/sportident/src/integration/e2e.test.ts` — end-to-end fixture replay.
- [ ] `scripts/hardware-smoke.sh` — operator-driven script with prompt/assert per card type.
- [ ] Test fixture directories created with empty placeholder files (`tests/fixtures/{upstream,jonas,synthetic}/`).
- [ ] `tsconfig.json` and `tsconfig.test.json` (if needed) in place.
- [ ] CI workflow `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.

No test-framework install needed (node:test is built-in). lefthook + commitlint need install but are not test infra.

---

## Test Fixture Format

Concrete fixture layouts for the planner. Each row below is one fixture; ~10 fixtures total cover the Phase 0 surface adequately.

### Upstream-derived fixtures (ported, MIT attribution)

| Fixture file | Source | What it tests |
|--------------|--------|---------------|
| `fixtures/upstream/si5-16-punches.ts` | `sportident.js/siCard5Examples.getCardWith16Punches` | SI5 happy path with 16 punches |
| `fixtures/upstream/si5-full.ts` | `sportident.js/siCard5Examples.getFullCard` | SI5 full 36-punch card (edge case for slot 30-35 codes-only) |
| `fixtures/upstream/si9-typical.ts` | `sportident.js/siCard9Examples.getCardWith16Punches` (or similar) | SI9 happy path |
| `fixtures/upstream/si10-typical.ts` | `sportident.js/modernSiCardExamples.getCardWith16Punches` (cardSeries=SiCard10) | SI10 happy path; cardSeries 0x0F + number 7050892 |
| `fixtures/upstream/empty-card.ts` | `sportident.js/modernSiCardExamples.getEmptyCard` | No punches; assert punches=[], no crash |

### Locally captured fixtures (D-18 "ours")

| Fixture file | How captured | What it tests |
|--------------|--------------|---------------|
| `fixtures/jonas/si5-jonas-001.{bytes.hex,expected.json}` | `pnpm dev:readout --record si5-jonas-001` + insert Jonas's SI5 | Real SI5 inventory |
| `fixtures/jonas/si9-jonas-001.{bytes.hex,expected.json}` | Same, SI9 | Real SI9 inventory |
| `fixtures/jonas/si10-jonas-001.{bytes.hex,expected.json}` | Same, SI10 | Real SI10 inventory |
| `fixtures/jonas/siac-jonas-001.{bytes.hex,expected.json}` | Same, SIAC | Real SIAC inventory + heuristic-based class dispatch |

### Synthetic fixtures (hand-crafted)

| Fixture file | What it tests |
|--------------|---------------|
| `fixtures/synthetic/crc-mismatch.bytes.hex` | Valid STX/ETX, valid CMD/LEN/DATA, but CRC bytes corrupted — assert `frame_error` event |
| `fixtures/synthetic/truncated-frame.bytes.hex` | First half of a frame followed by EOF — assert parser leaves it in remainder, no error |
| `fixtures/synthetic/partial-then-complete.bytes.hex` | Half a frame + arrives later in two chunks — assert decoder reassembles correctly |
| `fixtures/synthetic/bad-stx.bytes.hex` | Garbage byte before a valid frame — assert parser skips garbage and decodes the frame |
| `fixtures/synthetic/back-to-back-frames.bytes.hex` | Two complete frames in one chunk — assert parseAll returns both |

### Fixture file format spec

`.bytes.hex` (whitespace-separated hex bytes, `#` comment markers):

```
# SI5 insert + read fixture (jonas-001)
# Captured 2026-05-12 from /dev/ttyUSB0, serial 593656
# Card: SI5, number 406402
02 E5 06 00 00 00 06 33 02 9C 1E 03   # SI5_DET, cardnumber=406402
02 B1 80 ...                            # GET_SI5 response (128 bytes of card data)
```

`.expected.json` (one JSON object per line, matches NDJSON output):

```json
{"schema_version":1,"event":"connection_changed","state":"open","ts_ms":..., ...}
{"schema_version":1,"event":"card_inserted","card_type":"SI5","card_number":406402,...}
{"schema_version":1,"event":"card_read","card_type":"SI5","card_number":406402,"punches":[...]}
```

Tests load both, replay bytes through the decoder, normalize `ts_ms` to a stable placeholder (`0`) for comparison, assert deep-equal.

---

## Landmines & Pitfalls

### 1. cp210x driver vs brltty conflict (Linux)
**What goes wrong:** On some Linux distros, `brltty` (Braille TTY daemon) claims any `10c4:ea60` USB-serial device and pre-empts `cp210x`, so `/dev/ttyUSB0` never appears.
**Why it happens:** brltty's udev rules match generic CP210x VID/PID for legacy Braille terminals.
**How to avoid:** Document in README that if `/dev/ttyUSB0` is missing despite `cp210x` being loaded, run `sudo apt-get remove brltty` (or mask the service). **NOT a problem on Jonas's machine** — verified: SPORTident PID is `0x800a` (not the generic `0xea60`), and `/dev/ttyUSB0` is present. But document for other Linux users.
**Warning signs:** `dmesg | grep brltty` shows "interface claimed by brltty"; `ls /dev/ttyUSB*` returns nothing despite `lsmod | grep cp210x` showing the module is loaded.

### 2. udev permissions / dialout group
**What goes wrong:** Fresh-install Linux user not in `dialout` group; `/dev/ttyUSB0` exists with `crw-rw---- root:dialout` but user can't open it.
**Why it happens:** Default permission model assigns serial ports to the dialout group, and new users aren't members by default.
**How to avoid:** README pre-flight check: `groups | grep -q dialout || sudo usermod -aG dialout $USER && echo "Log out and back in"`. Verified Jonas is in dialout already.
**Warning signs:** `port.open()` rejects with `EACCES` / "Permission denied".

### 3. CRC implementation byte-order confusion
**What goes wrong:** A "well-meaning fix" uses a standard `crc-16` library, gets the right polynomial but wrong init or wrong reflection, frames silently fail validation.
**Why it happens:** Multiple "CRC-16" variants share polynomial 0x8005 (ANSI/ARC/IBM); only one matches SportIdent's quirks.
**How to avoid:** **Use the upstream CRC verbatim** (copy `siProtocol.CRC16` from `sportident.js`). Test against the 10 known vectors in the very first unit test file written. Cross-verify by feeding upstream test data through the new CRC implementation in CI.
**Warning signs:** Test vectors fail for inputs `< 3 bytes` (means the short-circuit path is wrong) or for inputs with byte-changes in the second position (means the init-from-first-two-bytes is wrong).

### 4. SIAC series byte still TODO upstream
**What goes wrong:** A future SI11 card (series byte 0x?? — unknown) arrives, the modern card dispatcher mis-classifies it as SI10/SIAC by number range.
**Why it happens:** Upstream's `ModernSiCardSeries` enum has `// SiCard11: ?,` (and similar for SIAC) — they detect by card-number range, not series byte.
**How to avoid:** Phase 0 stays heuristic (range only); document in code comments as a known limitation. Plan a Phase 1 task to capture an SI11 series byte from a real card (Jonas to source one).
**Warning signs:** `card_series_byte` field in NDJSON has a value we don't recognize when an unknown card type is inserted.

### 5. Half-day clock + missing event date
**What goes wrong:** Phase 1 ingests Phase 0 NDJSON and tries to compute ms-epoch punch times without knowing the event date.
**Why it happens:** SI cards store only 12-hour seconds + half-day flag; the date/year context is the operator's responsibility.
**How to avoid:** Phase 0 emits raw `{seconds_in_half_day, half_day, weekday}` — never invents a date. Phase 1 (or later) does wall-clock conversion using the event start date. Document in NDJSON schema docs.
**Warning signs:** Phase 1 produces punch times for "year 1970" — means Phase 0 was tempted to use `Date.now() - ...` math.

### 6. Multi-page card-read race / partial reads
**What goes wrong:** Inserting an SI10 with 100 punches: decoder reads page 0 (gets punchCount=100), then page 4, then 5, then 6 — but operator pulls card before page 6 arrives. Decoder hangs on the GET_SI8 timeout, station has gone silent.
**Why it happens:** Modern card reads are multi-page. Upstream's `typeSpecificReadPunches` chains pages 4→5→6→7 sequentially.
**How to avoid:** Wrap each `sendMessage` with the existing 10-second timeout (upstream default in `SiSendTask`). On timeout, emit a `frame_error` (or new `card_read_aborted`) event and reset to listening state. Don't crash.
**Warning signs:** Bin appears to hang after some card insertions; manual smoke script needs to add a timeout per-card.

### 7. ACK byte spam from stale firmware
**What goes wrong:** Some BSM7/8 firmware ACKs every host message with `0x06` after the response frame; if our parser doesn't recognize the bare ACK byte, it logs "Invalid start byte: 0x06" repeatedly.
**Why it happens:** Documented in upstream parser (`siProtocol.parse` L180: `proto.ACK` handled as a special mode). Phase 0 must KEEP this handling.
**How to avoid:** Don't simplify the parser by removing the WAKEUP/ACK/NAK branches — they're load-bearing.
**Warning signs:** Stream of `frame_error` events with `error_code: bad_stx` and `raw_bytes_hex: "06"`.

### 8. Wakeup byte 0xFF interaction with empty CDC buffer
**What goes wrong:** First write after a long idle period: 0xFF wakeup gets lost in the CP2102's internal buffer reset. Station never replies.
**Why it happens:** USB-CDC adapters have quirky behavior on first write after idle.
**How to avoid:** Send TWO wakeup bytes on the first command after open (or send a wakeup, wait 10ms, send the actual SET_MS). Document as "first-write quirk." Alternatively, send a SET_MS(0x4D) twice on connection open and ignore the first failure.
**Warning signs:** Station handshake times out the first time after plug-in; works on retry.

### 9. Stale send-queue after disconnect
**What goes wrong:** USB cable yanked mid-read. SerialPort emits `close`, but in-flight `sendMessage` Promises never resolve or reject; bin hangs.
**Why it happens:** Upstream's `abortProcessingSendQueue` IS called on `SiDeviceState.Closing/Closed`, but our new SerialTransport needs to wire this up.
**How to avoid:** On `serialport`'s `close` event, fail all pending `SiSendTask` instances with a `DeviceClosedError`. Test this with a fixture that simulates abrupt closure.
**Warning signs:** After pulling the USB cable, the bin doesn't exit and doesn't emit anything.

### 10. Lodash dependency
**What goes wrong:** Upstream `siProtocol.ts` imports `_.isEqual` for CRC comparison. Pulling in lodash adds a heavy dep to a "minimal" package.
**Why it happens:** Convenience.
**How to avoid:** Replace `_.isEqual(actualCRC, expectedCRC)` with `actualCRC[0] === expectedCRC[0] && actualCRC[1] === expectedCRC[1]` (CRCs are always exactly 2 bytes). Audit every ported file for `import _ from 'lodash'` and remove.
**Warning signs:** `pnpm install` pulls in lodash; bundle size unexpectedly large.

### 11. Node.js TypeScript stripper rejects upstream enums (in test files)
**What goes wrong:** Upstream test files use `enum SiTargetMultiplexerTarget { Direct, Remote, ... }`. Node's type-stripper refuses to run them.
**Why it happens:** Type-stripping doesn't synthesize the runtime enum object.
**How to avoid:** Replace enums with `const SiTargetMultiplexerTarget = { Direct: 0, Remote: 1, ... } as const`. Or use tsup to pre-build everything (heavier). Recommend: enum-to-const refactor as part of the port (small, easy).
**Warning signs:** `node --test` fails with "Enum members must use literal initializer" or similar.

### 12. NDJSON line-buffering vs `process.stdout` flush
**What goes wrong:** Bin writes `console.log(JSON.stringify(event))` — but `console.log` is synchronous to a tty and async to a pipe. Downstream consumer reads stale stream when bin crashes.
**Why it happens:** Node's stdout buffering differs by destination.
**How to avoid:** Use `process.stdout.write(JSON.stringify(event) + '\n')` directly, and call `process.stdout.uncork()` after each line if needed. Or set `process.stdout._handle?.setBlocking?.(true)` at startup.
**Warning signs:** Piping bin output to `tee` shows missing tail lines after Ctrl-C.

---

## Out of Scope

**Explicit non-goals for Phase 0** (locked by CONTEXT.md + ROADMAP.md):

- **No GUI / no web server / no SQLite.** Bin is stdout-only. Phase 1 owns ingest and UI.
- **No autosend / `0xD3` control-station mode.** REQ-HW-005, Phase 4.
- **No SRR USB dongle.** REQ-HW-006, Phase 4. (Implicitly: no SIAC beacon-mode reception.)
- **No clock sync / SET_TIME / SI-Master.** REQ-HW-007, Phase 4.
- **No BS11 beacon stations.** REQ-HW-008, Phase 4.
- **No SI-GSM / LTE-modem.** REQ-HW-009, Phase 4.
- **No SI6 / SI8 / SI11 / pCard / tCard / fCard explicit support.** Out of Jonas's inventory. Decoders exist upstream and could trivially be added — but no fixtures to validate against. SI11 is borderline (range collides with SI10/SIAC) — keep range-based detection, document as Phase 1 task.
- **No macOS / Windows.** REQ-HW-001 requires all three platforms ultimately; Phase 0 ships Linux only.
- **No Phase 1 event-log mapping / projections.** Phase 0 produces stdout; ingestion is Phase 1.
- **No peer sync / central tier / IOF XML.** Phase 1+.
- **No CRC-16 vs CRC-16-CCITT polynomial debate.** Locked: 0x8005, non-standard init, MSB-first append. Don't re-research.
- **No alternative protocol references (per-magnusson, sireader, GecoSI, MeOS C++).** Read-only references — verified `sportident.js` CRC + protocol against them. No further code can be copied without re-litigating ADR-0005.
- **No npm publish.** `packages/sportident/` is standalone-shaped but private to this repo at Phase 0 (D-04).
- **No `tsx` / `ts-node` / Babel.** Node 22.19 type stripping is native and sufficient for tests; tsup is the build tool.
- **No hot-plug auto-reconnect logic beyond graceful close.** Document as Phase 1 enhancement; Phase 0's smoke script restarts the bin manually between cards.

---

## Code Examples

### Verified CRC test vector assertions (`node:test` syntax)

```typescript
// packages/sportident/src/siProtocol.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { CRC16 } from './siProtocol.ts';

test('CRC16: empty input', () => {
  assert.deepStrictEqual(CRC16([]), [0x00, 0x00]);
});

test('CRC16: 1-byte short-circuit', () => {
  assert.deepStrictEqual(CRC16([0x01]), [0x01, 0x00]);
  assert.deepStrictEqual(CRC16([0xFF]), [0xFF, 0x00]);
});

test('CRC16: 2-byte short-circuit (identity)', () => {
  assert.deepStrictEqual(CRC16([0x12, 0x34]), [0x12, 0x34]);
});

test('CRC16: 3-byte polynomial', () => {
  assert.deepStrictEqual(CRC16([0x12, 0x34, 0x56]), [0xBA, 0xBB]);
  assert.deepStrictEqual(CRC16([0x12, 0x32, 0x56]), [0xBA, 0xAF]);
});

test('CRC16: 4-byte polynomial', () => {
  assert.deepStrictEqual(CRC16([0x12, 0x34, 0x56, 0x78]), [0x1E, 0x83]);
  assert.deepStrictEqual(CRC16([0x12, 0x32, 0x56, 0x78]), [0x1E, 0xFB]);
});
```

[VERIFIED test vectors from `sportident.js/packages/sportident/src/siProtocol.test.ts`]

### Verified frame parse round-trip

```typescript
// packages/sportident/src/siProtocol.parseRoundTrip.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { render, parse } from './siProtocol.ts';
import { proto } from './constants.ts';

test('render + parse round-trip: GET_SI5 command', () => {
  const message = { command: proto.cmd.GET_SI5, parameters: [] };
  const bytes = render(message);  // [STX, 0xB1, 0x00, crc_hi, crc_lo, ETX]
  const { message: parsed, remainder } = parse(bytes);
  assert.deepStrictEqual(parsed, message);
  assert.deepStrictEqual(remainder, []);
});

test('parse: ACK byte alone', () => {
  const { message, remainder } = parse([proto.ACK]);
  assert.deepStrictEqual(message, { mode: proto.ACK });
  assert.deepStrictEqual(remainder, []);
});
```

### NDJSON bin skeleton (planner reference)

```typescript
// packages/sportident/src/bin/fartol-readout.ts
import { SerialTransport } from '../transport/SerialTransport.ts';
// import the rest of the ported protocol/card/station bits

const port = process.env.FARTOL_DEVICE ?? '/dev/ttyUSB0';
const transport = new SerialTransport({ path: port, baudRate: 38400 });

function emit(event: object): void {
  process.stdout.write(JSON.stringify({
    schema_version: 1,
    ts_ms: Date.now(),
    device_path: port,
    ...event,
  }) + '\n');
}

function diag(line: string): void {
  process.stderr.write(`[${new Date().toISOString()}] ${line}\n`);
}

transport.on('error', (err) => {
  diag(`transport_error: ${err.message}`);
  emit({ event: 'connection_changed', state: 'error', error: err.message });
});

transport.on('close', () => {
  emit({ event: 'connection_changed', state: 'closed' });
  process.exit(0);
});

await transport.open();
emit({ event: 'connection_changed', state: 'open' });

// ... wire transport.on('data') into SiTargetMultiplexer.handleReceive
// ... wire SiMainStation.readCards onCardInserted to emit card_inserted + card.read() → card_read
// ... wire frame errors from parser warnings into emit({ event: 'frame_error', ... })
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js (>= 22 LTS, TS-stripping) | All code, tests, bin | ✓ | 22.19.0 (via nvm) | none — required |
| pnpm | Install, scripts | ✓ | 10.30.3 | corepack will install if needed |
| corepack | pnpm bootstrap | ✓ | 0.34.0 | manual `npm install -g pnpm` |
| `serialport` npm package | Transport | ⟂ to install | target 13.0.0 | none — D-09 mandates |
| GitHub Actions runner (Linux) | CI | n/a here | runners available | none |
| `lefthook` binary | pre-commit hooks | ✗ | — | optional for local dev; CI doesn't need; `pnpm dlx lefthook install` resolves on first dev clone |
| commitlint CLI | commit-msg hook | ✗ | — | installed via pnpm devDependency at scaffold |
| `gh` CLI | (researcher used, not required at runtime) | ✓ | 2.92.0 | — |
| `/dev/ttyUSB0` (CP2102 device node) | Smoke test only | ✓ | n/a | smoke test skips if absent; CI doesn't need |
| `cp210x` kernel module | TTY node creation | ✓ | loaded | most modern distros ship it |
| User in `dialout` group | Open ttyUSB without sudo | ✓ | Jonas confirmed | `sudo usermod -aG dialout $USER` |
| `udev` daemon | Device node permissions | ✓ | systemd-udev | — |

**Missing dependencies with no fallback:** None — everything required is installed or available via `pnpm install`.

**Missing dependencies with fallback:** lefthook + commitlint are installed by `pnpm install` (devDependencies) and `pnpm dlx lefthook install` activates the hooks.

---

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists at the repo root (`/home/jonas/src/FartOL/CLAUDE.md` does not exist). The global `~/.claude/CLAUDE.md` instructions apply:

- **Surgical edits / minimum code that solves the stated problem.** Phase 0 plan should resist over-scaffolding (e.g., don't add ESLint plugin overload, jest configs, husky, etc.). Lefthook + commitlint + tsup + node:test is enough.
- **Match existing style.** No existing code yet — establish conventions in Phase 0 that Phase 1+ inherit (snake_case fields, ESM imports, relative paths, no enums, MIT NOTICE headers).
- **Conventional Commits with optional scope.** D-08 locks this. Repo commits 0016633, 48c7cd3, 81eccbe already follow `docs(state): ...` / `docs(00): ...` / `docs(planning): ...` pattern — extend with `feat(sportident): ...`, `feat(transport): ...`, `test(crc): ...`, etc.
- **Skip ceremony for small reversible tasks.** Most Phase 0 tasks are NOT small — they're protocol implementation, fixture authoring, and transport layer. Treat as multi-step work where structured plans + TDD are appropriate.
- **Mobile readability** (from memory): Jonas reads on mobile. Keep PLAN.md task descriptions terse; long context lives in this RESEARCH.md.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tsc` + ts-node for tests | Node 22.18+ native TS stripping | 2024-08 (22.6 flagged) → 2024-12 (22.18 unflagged) | Drop tsx/ts-node dev deps; `node --test src/**/*.test.ts` "just works." |
| node-usb 1.x callback API | node-usb 2.x WebUSB-compatible API | 2022 | Upstream `sportident-node-usb` already uses 2.x — but we skip this entirely in favor of serialport@13. |
| serialport 11.x (mixed callback/promise) | serialport 13.x (consistent + better TypeScript types) | 2024-12 | Use `autoOpen: false` + `port.open(callback)`; promises via simple wrappers. |
| Jest + babel-jest for TS | node:test + native TS strip | 2024-12 | Smaller dependency tree; faster startup; better stack traces. |
| `tsup` 7.x | `tsup` 8.x (`format: ['esm', 'cjs']` + `dts: true`) | 2024 | Same usage; minor config tweaks. |
| ESLint 8 with `.eslintrc.json` | ESLint 9 with flat config (`eslint.config.js`) | 2024 | If using ESLint, prefer flat config from day one. |

**Deprecated / outdated patterns to avoid:**
- TypeScript `enum` — runtime code generation; Node stripper rejects.
- `lodash` for trivial operations (deep equals, find) — replace with native.
- `@types/serialport` — serialport ships its own types since 10.x.
- `node-serialport` (legacy single-package install) — use `serialport` (the new umbrella package).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `serialport@13` is the right transport for `/dev/ttyUSB0`; raw libusb (sportident-node-usb's approach) not needed | serialport API Substitution Map | Medium — if CP2102 quirks need direct USB control, we'd hit them at hardware smoke. **Mitigation:** smoke test catches this; fallback would be to switch the transport to `usb` lib (same as upstream sportident-node-usb). |
| A2 | Skipping `SiTargetMultiplexer` (Direct-only) is safe — no SRR remote stations in Phase 0 | SI Protocol Mechanics / sportident.js Port Surface | Low — Phase 0 explicitly excludes SRR (REQ-HW-006, Phase 4). |
| A3 | Two-wakeup-bytes-on-first-write is a known CP2102 quirk worth proactively addressing | Landmines #8 | Medium — based on community lore, not verified on this exact reader. Mitigation: add a flag to enable/disable, default ON. |
| A4 | NDJSON `schema_version: 1` field is acceptable to lock now even though discussion left it as "suggestion" | NDJSON Output Schema | Very low — Jonas's discretion section in CONTEXT.md explicitly suggests this; planner just confirms by adding. |
| A5 | Punch times emit as raw `{seconds_in_half_day, half_day, weekday}` not ms-epoch — Phase 1 does wall-clock conversion | NDJSON Output Schema | Low — Phase 1 has the event-date context Phase 0 lacks. But Jonas might want a "best effort wall-clock guess" using `Date.now()` rounded. Worth confirming. |
| A6 | SIAC detection by card-number range (8M-9M) suffices for Phase 0 — series byte detection is a known TODO upstream | Card Decoders / Landmines #4 | Low — Jonas's SIAC has a card number in the 8M-9M range; we'd misclassify a hypothetical future card with overlapping range, but that's a Phase 1 problem. |
| A7 | `commit_docs` is enabled (default) and commit message `docs(00): research phase 0 protocol + transport` is appropriate | (commit step) | Very low |
| A8 | `lodash` import in `siProtocol.ts` is removable by hand-replacing `_.isEqual(arr1, arr2)` with `arr1[0]===arr2[0] && arr1[1]===arr2[1]` | sportident.js Port Surface | Very low |
| A9 | Node 22.19's TS-stripper handles all upstream-style code (after enum→const refactor) | Validation Architecture | Low — verified empty TS file works; some advanced features (decorators, JSX) untested but not used by upstream. |
| A10 | The CP2102 chip on this BSM7/8 emits ASCII-clean stream once SET_MS handshake completes (no binary garbage interleaved) | SI Protocol Mechanics | Very low — upstream operates fine without special handling. |
| A11 | `process.stdout.write` plus explicit `\n` is sufficient for line-buffered NDJSON; `setBlocking(true)` not required | NDJSON / Landmines #12 | Low — common Node pattern; if buffer-flush issues appear, add `setBlocking` mitigation. |

---

## Open Questions for Planner

1. **Should Phase 0 attempt SI11 support?**
   - What we know: SI11 number range OVERLAPS SI10 (7M) and SIAC (8M) per per-magnusson; sportident.js doesn't yet have a series-byte mapping for SI11.
   - What's unclear: Does Jonas have an SI11 anywhere accessible to capture a fixture from?
   - Recommendation: Skip SI11 for v0.0.1-handshake. Add to ROADMAP as a Phase 1 task contingent on acquiring an SI11 for fixture capture.

2. **Should the `--record` mode write raw bytes + decoded JSON, or just JSON with `raw_pages_b64`?**
   - What we know: D-18 says capture fixtures from local reader. Two output formats viable: separate `.bytes.hex` + `.expected.json` files (easier to diff), OR self-contained `.ndjson` with embedded base64 raw bytes (single file, replayable).
   - What's unclear: Jonas's preference.
   - Recommendation: Both. `--record path/foo` produces `path/foo.bytes.hex` AND `path/foo.expected.json`. Planner picks one task to implement first.

3. **What's the right hot-plug strategy for the smoke script — restart bin between cards, or persistent + retry-on-close?**
   - What we know: CONTEXT discretion area says "graceful retry with backoff" — but smoke script is operator-driven.
   - What's unclear: Whether the smoke script wants single-bin-invocation (faster) or one-bin-per-card (more isolation).
   - Recommendation: Single persistent bin; smoke script asserts events accumulate in the same stdout file. Easier to reason about, faster to run. If reconnect logic is too painful, fall back to per-card.

4. **Should `frame_error` events go to BOTH stdout (NDJSON) and stderr (human diag), or just one?**
   - What we know: D-13 says NDJSON on stdout. CONTEXT discretion says diagnostics on stderr.
   - What's unclear: Whether downstream consumers (Phase 1 ingester) want to see frame_errors in the event stream or only successful events.
   - Recommendation: BOTH. NDJSON `frame_error` event on stdout (machine-readable, Phase 1 may want to count CRC errors for health monitoring). One-line human diag on stderr (operator visibility during testing).

5. **Should the bin support reading multiple stations (e.g. BSM7 + BSM8 plugged in simultaneously)?**
   - What we know: Phase 0 only has ONE reader on the bench. ROADMAP Phase 4+ touches multi-station, but for sync across the network not for parallel readout.
   - What's unclear: Operator workflow at a club — do operators ever plug in two readout stations at once?
   - Recommendation: Phase 0 supports exactly one reader (`/dev/ttyUSB0` by default, override via `--device` flag). Document multi-device as Phase 1 task.

6. **What's the public API surface for `packages/sportident/` (i.e. the `index.ts` exports)?**
   - What we know: ADR-0005 sketches a clean async `SiReader` interface with `onPunch(handler)`, `onCardRead(handler)`, `setTime(t)`. But Phase 0 doesn't need that final API yet — the bin can directly use the internal types.
   - What's unclear: How much to commit to in `index.ts` now vs. defer to Phase 1.
   - Recommendation: Export a minimal stable surface: `SerialTransport`, `SiMainStation` (with our adaptation), `parseAll`/`render`/`CRC16`, the four card classes (`SiCard5`, `SiCard9`, `SiCard10`, `SIAC`), and the NDJSON event types as TypeScript types. Defer the `SiReader` higher-level abstraction to Phase 1 once consumers exist.

7. **Should we use `--watch` mode for tests in dev?**
   - What we know: `node --test --watch` works since Node 19.
   - What's unclear: Tooling vs philosophy. CLAUDE.md says minimum code; `--watch` is purely DX.
   - Recommendation: Document `pnpm test:watch` script in package.json but don't require it.

---

## Sources

### Primary (HIGH confidence)

- **sportident.js source code** (MIT, verified active 2026-04-10):
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/siProtocol.ts> — CRC16, parse, render (the heart)
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/constants.ts> — proto.cmd / proto.STX / etc
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiStation/SiMainStation.ts> — handshake (readCards)
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiStation/BaseSiStation.ts> — atomic readInfo/writeDiff
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiStation/SiTargetMultiplexer.ts> — send queue + receive buffer
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiCard/BaseSiCard.ts> — card-type registry
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiCard/types/ModernSiCard.ts> — SI8/9/10/11/SIAC base
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiCard/types/SiCard5.ts> — legacy SI5
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/SiCard/types/{SiCard9,SiCard10,SIAC}.ts> — concrete cards
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident/src/siProtocol.test.ts> — 10 CRC test vectors
  - <https://github.com/allestuetsmerweh/sportident.js/blob/master/packages/sportident-node-usb/src/NodeUsbSiDeviceDriver.ts> — confirms upstream uses libusb/WebUSB, not WebSerial

- **per-magnusson/sportident-python** (GPL, reference-only):
  - <https://github.com/per-magnusson/sportident-python/blob/master/sireader2.py> — cross-verification of CRC + card-series byte values

- **serialport.io docs** (via Context7 + WebFetch):
  - <https://serialport.io/docs/api-serialport/> — SerialPort constructor + open/write/close
  - <https://serialport.io/docs/api-parsers-overview/> — parser overview (not used directly; we own framing)

- **Node.js TypeScript docs**:
  - <https://nodejs.org/docs/latest-v22.x/api/typescript.html> — type-stripping in Node 22

### Secondary (MEDIUM confidence)

- **Project planning artifacts** (read for context):
  - `/home/jonas/src/FartOL/.planning/research/ecosystem.md` — SportIdent ecosystem facts (cards, stations, protocol commands)
  - `/home/jonas/src/FartOL/.planning/research/architecture.md` — Three-tier architecture, event log schema
  - `/home/jonas/src/FartOL/.planning/REQUIREMENTS.md` — REQ-HW-001/002/004 + scope buckets
  - `/home/jonas/src/FartOL/.planning/adr/0005-sportident-code-isolated-mit.md` — MIT package + clean SiReader interface
  - `/home/jonas/src/FartOL/.planning/adr/0006-tech-stack.md` — Node 22 LTS + serialport
  - `/home/jonas/src/FartOL/.planning/ROADMAP.md` — Phase 0 success criteria + downstream phases

- **WebSearch results** (verified against upstream where possible):
  - <https://docs.sportident.com/products/stations/bsm7-usb-rs232> — BSM7 baud 38400
  - <https://docs.sportident.com/products/cards/siac> — SIAC overview
  - <https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing> — tsup dual ESM/CJS
  - <https://lefthook.dev/examples/commitlint/> — lefthook + commitlint config

### Tertiary (LOW confidence)

- **WebSearch ecosystem patterns** (not strictly verified):
  - <https://bugs.launchpad.net/bugs/1958224> — brltty conflict (well-known but only affects generic 0xea60 PID, not our 0x800a)
  - <https://forums.raspberrypi.com/viewtopic.php?t=287337> — CP2102 community troubleshooting

### Hardware probes (LOCAL VERIFICATION)

- `lsusb` showed `Bus 003 Device 068: ID 10c4:800a Silicon Labs SPORTident`
- `ls /dev/ttyUSB0` showed `crw-rw---- 1 root dialout 188, 0 maj 12 20:21 /dev/ttyUSB0`
- `lsmod | grep cp210x` showed cp210x loaded with usbserial parent
- `groups` showed Jonas in `dialout`
- `node --version` showed v22.19.0
- `pnpm --version` showed 10.30.3
- `node /tmp/test_ts.ts` ran successfully without flags (TS-stripping native)
- `udevadm info -q all /dev/bus/usb/003/068` confirmed serial 593656 matches CONTEXT
- `npm view serialport version` returned `13.0.0`

---

## Metadata

**Confidence breakdown:**
- SI protocol mechanics: **HIGH** — upstream source verified line-by-line; tested cross-reference with per-magnusson
- CRC parameters: **HIGH** — 10 frozen test vectors + verbatim 30-LOC algorithm
- serialport API: **HIGH** — official Context7 docs + version verified via npm registry
- sportident.js port surface: **HIGH** — full directory tree enumerated via `gh api`
- Card decoders (SI5/SI9/SI10): **HIGH** — concrete files + offsets verified
- Card decoders (SIAC): **MEDIUM** — heuristic detection (series byte unknown upstream); range-based dispatch works in practice but is the most likely place for a future regression
- NDJSON schema: **MEDIUM-HIGH** — schema is opinionated but maps cleanly to documented event log schema
- Landmines: **MEDIUM** — mix of verified (cp210x/brltty) and lore-based (CP2102 first-write quirk)
- Validation architecture: **HIGH** — node:test + tsup native + verified Node 22.19 TS stripping

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days for stable libs; recheck `sportident.js` if more than 30 days elapse before plan execution)
**External research budget used:** ~14 tool calls (gh api, WebFetch, WebSearch, Bash probes, ctx7) — within budget for a Phase 0 of this complexity

---

## RESEARCH COMPLETE

**Phase:** 0 - Hardware proof
**Confidence:** HIGH overall (one MEDIUM area: SIAC series-byte detection — flagged as Phase 1 followup)

### Key Findings

- **The "WebSerial → serialport" framing is wrong.** Upstream uses WebUSB/libusb. The transport replacement is therefore bigger than implied — but cleaner because we control the byte stream directly.
- **CRC is non-standard but exactly specified.** 30-LOC algorithm + 10 frozen test vectors. Port verbatim and write tests against the vectors FIRST.
- **Port surface is small.** ~1500-1800 lines copied from upstream + ~400-600 lines new. SiTargetMultiplexer can be heavily simplified or rewritten.
- **Node 22.19 strips TS natively.** Tests can be `.ts` files run directly with `node --test`. tsup is still needed for the built artifact.
- **Hardware is already bench-ready.** /dev/ttyUSB0 present, dialout group OK, cp210x module loaded. Phase 0 success criterion #1 verified satisfied.

### File Created

`/home/jonas/src/FartOL/.planning/phases/00-hardware-proof/00-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | serialport@13, tsup, node:test, lefthook, commitlint — all verified versions + first-party docs |
| Architecture | HIGH | Tier ownership table is clear; port surface is enumerated file-by-file |
| Pitfalls | MEDIUM | 12 landmines documented; some (CP2102 first-write quirk) based on community lore |
| Validation | HIGH | Test framework, fixtures, smoke script all specified; matches D-17..D-20 locked decisions |
| Out-of-scope clarity | HIGH | Explicit list cross-checked with CONTEXT.md deferred + ROADMAP phase boundaries |

### Open Questions Awaiting Planner

7 questions documented in §"Open Questions for Planner" — most are minor framing decisions, none block planning. Recommend the planner answer each with a one-line decision in PLAN.md.

### Ready for Planning

Yes. Plan can begin immediately. Recommend planner orders work as:

1. **Wave 0:** scaffold (`packages/sportident/` with tsconfig, package.json, tsup.config.ts, lefthook.yml, .github/workflows/ci.yml), commit hook setup, empty test files, fixture directories.
2. **Wave 1:** port `siProtocol.ts` + `constants.ts` + utils + CRC test vectors. ALL 10 CRC tests pass before moving on.
3. **Wave 2:** port storage primitives + BaseSiCard + ModernSiCard + SiCard5/9/10/SIAC + their fixture-based unit tests.
4. **Wave 3:** write `SerialTransport.ts` + simplified send queue + handshake state machine (subset of SiMainStation).
5. **Wave 4:** write `bin/fartol-readout.ts` + NDJSON formatter + frame_error path + connection state events.
6. **Wave 5:** `--record` mode for fixture capture + `scripts/hardware-smoke.sh` + capture Jonas's SI5/SI9/SI10/SIAC fixtures + smoke green + tag `v0.0.1-handshake`.

Estimated total: ~1500-2000 LOC across ~25-30 files. Single-developer Phase 0 should fit in 2-4 focused days.
