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
  - apps/edge/src/bin/fartol.ts
  - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
---

## Problem

The Star TSP143 prints receipts but they look ugly. Two attempts so far:

1. **Direct ESC/POS path** (plan 01-15 baseline): `node-thermal-printer` writing to `/dev/usb/lp0`. Couldn't get it working reliably during live testing on 2026-05-14.
2. **CUPS path** (added during 2026-05-14 hardware session): compiled and installed the vendor CUPS driver; queue name defaults to `TSP143--STR_T-001-`. Prints, but output is visually unattractive.

Plan 01-15 lazy-requires both `node-thermal-printer` and `sharp`. The Skogis kids template specifically depends on the sharp → printer.printImage raster path; CUPS may not render that well.

## Solution

Options to investigate (in rough order of effort):

1. **Tighten direct ESC/POS** (RESEARCH §Pattern 6, Pattern 1, Pitfall 6):
   - Probe `/dev/usb/lp*` at print time instead of hard-coded `lp0` (Pitfall 6 — device enumeration order).
   - Make sure the Star profile is selected (`Types.STAR` in node-thermal-printer).
   - Set `characterSet: 'PC852_LATIN2'` so å/ä/ö render correctly.
   - Confirm `printer.cut()` is sent at end-of-receipt.
   - Re-check whether the printer needs `removeSpecialCharacters: false`.
   - Compare bytes with `xxd /dev/usb/lp0` while the vendor app prints — confirm header/init/cut sequences match.

2. **Improve CUPS output**:
   - Write a proper PostScript or CUPS Raster template instead of pushing ESC/POS through CUPS (CUPS may be re-encoding the byte stream).
   - Investigate `lp -o raw` so CUPS doesn't transform our ESC/POS output.

3. **Reverse-engineer the printer**:
   - `sudo cat /dev/usb/lp0 | xxd > vendor-trace.hex` while printing a known sample from the vendor app.
   - Compare with our bytes; diff the headers, font commands, cut sequences.
   - Star's TSP143 docs are public — cross-check with the official ESC/POS-derivative command set.

4. **Try receiptline** (rejected initially in RESEARCH §"Alternatives considered" as adding template indirection — worth a second look if direct ESC/POS keeps looking ugly).

After re-attempt, decide: keep CUPS as the default sink (currently set in `fartol.ts`'s `resolvePrinterConfig` — falls back to CUPS unless `FARTOL_PRINTER=direct|stdout`), or revert to direct ESC/POS as Phase 1 originally planned.

## Research already mapped

From `.planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md`:

- Pattern 6 (ESC/POS via node-thermal-printer) — full code sketch with `Types.STAR`, `interface: 'printer:/dev/usb/lp0'`, `characterSet: 'PC852_LATIN2'`.
- Pitfall 6 (USB device path varies) — must probe `/dev/usb/lp*` at print time.
- Dependency choice rationale: `node-thermal-printer@4` actively maintained, has built-in STAR/EPSON/BROTHER profiles, pure-JS (no native binding hassle).
- Skogis kids template requires the raster bitmap path (sharp → printer.printImage); this is implemented in `apps/edge/src/print/kids-svg-to-bitmap.ts` and only exercised by the direct path today.

## Acceptance

- Pick one of the four approaches and verify on the real TSP143.
- Receipt looks acceptable to Jonas (legible, properly cut, å/ä/ö correct, Skogis bitmap visible on Kids template).
- Default printer sink documented in `apps/edge/src/bin/fartol.ts` matches the chosen approach.
- If CUPS is kept, the udev rule + install steps land in plan 01-18 packaging notes.
