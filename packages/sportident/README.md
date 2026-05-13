# @fartol/sportident

NDJSON-emitting reader for SPORTident BSM7/8-USB readout stations on
Linux. Reads SI5, SI9, SI10 and SIAC Air+ cards and writes one JSON
object per line to stdout for downstream consumption.

This package is the hardware-bridge layer of FartOL. It is MIT-licensed
(see `LICENSE`) so it can eventually be published as a standalone library
independent of FartOL's AGPL application code. See `NOTICE.md` for
upstream attribution.

## Phase 0 scope

- **Cards:** SI5, SI9, SI10, SIAC Air+ via touch-readout
- **Stations:** BSM7-USB and BSM8-USB (CP210x USB-serial)
- **Platforms:** Linux only in Phase 0 (cross-platform in Phase 1)
- **Output:** NDJSON to stdout; diagnostics to stderr

## Run

After `pnpm install` at the repo root:

```sh
# from packages/sportident/
pnpm dev:readout          # runs src/bin/fartol-readout.ts via Node 22 type-stripping
pnpm exec fartol-readout  # runs the built dist/bin/fartol-readout.cjs (after pnpm build)
```

The reader opens the serial device given by `FARTOL_DEVICE` (default
`/dev/ttyUSB0`). Set the variable to a different path if your reader
enumerates elsewhere.

## Attribution

This package contains code ported from
[allestuetsmerweh/sportident.js](https://github.com/allestuetsmerweh/sportident.js)
under MIT. See `NOTICE.md` for the full third-party software list.
