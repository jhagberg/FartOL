---
created: 2026-05-14T22:30:00+02:00
title: Revisit thermal receipt rendering quality
area: printing
files:
  - apps/edge/src/print/escposDriver.ts
  - apps/edge/src/print/cups-sink.ts
  - apps/edge/src/print/templates.ts
  - apps/edge/src/print/templates/classic.ts
  - apps/edge/src/print/templates/standing.ts
  - apps/edge/src/print/templates/detailed.ts
  - apps/edge/src/print/templates/top4.ts
  - apps/edge/src/print/templates/minimal.ts
  - apps/edge/src/print/templates/kids.ts
  - apps/edge/src/print/kids-svg-to-bitmap.ts
  - apps/edge/src/bin/fartola.ts
  - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
---

## Problem

The Star TSP143 prints receipts through the vendor CUPS driver, but the current CUPS text output
looks ugly. Two attempts so far:

1. **Direct ESC/POS path** (plan 01-15 baseline): `node-thermal-printer` writing to `/dev/usb/lp0`. Couldn't get it working reliably during live testing on 2026-05-14.
2. **CUPS path** (added during 2026-05-14 hardware session): compiled and installed the vendor CUPS driver; queue name defaults to `TSP143--STR_T-001-`. Prints, but output is visually unattractive.

Plan 01-15 lazy-requires both `node-thermal-printer` and `sharp`. The Skogis kids template specifically depends on the sharp → printer.printImage raster path; CUPS may not render that well.

## 2026-05-14 live hardware findings

Bench printer:

- Model: Star TSP143IIIU / TSP100IIIU USB
- USB ID: `0519:0003`
- Serial: `2550617061100529`
- CUPS queue: `TSP143--STR_T-001-`
- Working PPD: `/usr/share/cups/model/star/tsp143.ppd`
- Working device URI: `usb://Star/TSP143%20(STR_T-001)?serial=2550617061100529`

What worked:

- Installing Star's CUPS driver and reconfiguring the Ubuntu queue with the Star `tsp143.ppd`
  made the printer physically print.
- A plain CUPS smoke test printed after:
  `lpadmin -p TSP143--STR_T-001- -E -v 'usb://Star/TSP143%20(STR_T-001)?serial=2550617061100529' -P /usr/share/cups/model/star/tsp143.ppd -o PageSize=X72MMY200MM`.
- A fartOLa-rendered classic receipt submitted through `createCupsPrinterSink()` printed physically.
  CUPS accepted the job and later showed completed job `TSP143--STR_T-001--68`.
- The implemented sink renders the existing receipt templates to 32-column text and submits:
  `lp -d TSP143--STR_T-001- -t fartOLa-receipt -`.
- Current verification after the CUPS sink landed:
  `pnpm --filter @fartola/edge typecheck` passed, and `pnpm --filter @fartola/edge test`
  passed with 242 tests / 0 failures when run with localhost access for the WebSocket tests.

What did not work:

- The original `node-thermal-printer` interface string `printer:/dev/usb/lp0` was wrong for the
  direct local-device path. It was changed to pass `/dev/usb/lp0` directly.
- Even after that correction, direct raw `/dev/usb/lp0` printing reported `connected=true` and
  `print=ok`, but the TSP143IIIU produced no physical paper output during live testing.
- Therefore, for this printer and current implementation, `print=ok` from the direct path only
  proves that bytes were written to the device node; it does **not** prove the printer understood
  the stream.
- The kernel repeatedly showed CUPS/USB reattach churn around `usblp0` during setup. The key
  working path was not raw `usblp`; it was Star's CUPS `rastertostar` driver path via the proper
  PPD.

Operational conclusion:

- Do not assume we can skip CUPS for the TSP143IIIU unless a new direct-driver experiment proves
  physical paper output on this exact model.
- Keep the current default as CUPS for Phase 1 hardware. Use `FARTOLA_PRINTER=direct` only as an
  explicit experimental/compatibility mode for devices that actually accept the raw stream.
- Any future direct-path attempt must verify physical paper, cut/feed behavior, Swedish
  characters, and the Kids bitmap template. `isPrinterConnected()` plus a resolved print promise is
  not enough.

## Solution

Options to investigate (in rough order of effort):

1. **Only revisit direct ESC/POS with a physical-output gate** (RESEARCH §Pattern 6, Pattern 1, Pitfall 6):
   - Already fixed: direct local device interface now uses `/dev/usb/lp0`, not `printer:/dev/usb/lp0`.
   - Already covered: `/dev/usb/lp*` probing exists and is deterministic in tests.
   - Still unproven: the TSP143IIIU accepts the bytes sent by `node-thermal-printer`'s Star profile.
   - Make sure the Star profile is selected (`Types.STAR` in node-thermal-printer).
   - Set `characterSet: 'PC852_LATIN2'` so å/ä/ö render correctly.
   - Confirm `printer.cut()` is sent at end-of-receipt.
   - Re-check whether the printer needs `removeSpecialCharacters: false`.
   - Compare bytes with `xxd /dev/usb/lp0` while the vendor app prints — confirm header/init/cut sequences match.
   - Acceptance for this option starts only when the real printer physically prints paper from the direct path.

2. **Improve CUPS output**:
   - Write a proper PostScript or CUPS Raster template instead of pushing ESC/POS through CUPS (CUPS may be re-encoding the byte stream).
   - Investigate `lp -o raw` so CUPS doesn't transform our ESC/POS output.

3. **Reverse-engineer the printer**:
   - `sudo cat /dev/usb/lp0 | xxd > vendor-trace.hex` while printing a known sample from the vendor app.
   - Compare with our bytes; diff the headers, font commands, cut sequences.
   - Star's TSP143 docs are public — cross-check with the official ESC/POS-derivative command set.

4. **Try receiptline** (rejected initially in RESEARCH §"Alternatives considered" as adding template indirection — worth a second look if direct ESC/POS keeps looking ugly).

After re-attempt, decide: keep CUPS as the default sink (currently set in `fartola.ts`'s `resolvePrinterConfig` — falls back to CUPS unless `FARTOLA_PRINTER=direct|stdout`), or revert to direct ESC/POS only if it prints physical paper on the real TSP143IIIU.

## Research already mapped

From `.planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md`:

- Pattern 6 (ESC/POS via node-thermal-printer) — full code sketch with `Types.STAR`, `interface: 'printer:/dev/usb/lp0'`, `characterSet: 'PC852_LATIN2'`.
- Pitfall 6 (USB device path varies) — must probe `/dev/usb/lp*` at print time.
- Dependency choice rationale: `node-thermal-printer@4` actively maintained, has built-in STAR/EPSON/BROTHER profiles, pure-JS (no native binding hassle).
- Skogis kids template requires the raster bitmap path (sharp → printer.printImage); this is implemented in `apps/edge/src/print/kids-svg-to-bitmap.ts` and only exercised by the direct path today.

## Acceptance

- Pick one of the four approaches and verify on the real TSP143.
- Receipt looks acceptable to Jonas (legible, properly cut, å/ä/ö correct, Skogis bitmap visible on Kids template).
- Default printer sink documented in `apps/edge/src/bin/fartola.ts` matches the chosen approach.
- If CUPS is kept, the udev rule + install steps land in plan 01-18 packaging notes.
- A resolved `node-thermal-printer` direct-path promise is not accepted as proof unless Jonas also
  sees paper output.
