# Third-party software

This package (`@fartol/sportident`) is MIT-licensed (see `LICENSE`). It
contains code ported from upstream MIT projects and references reference
implementations under other licenses for verification only. Per-file MIT
NOTICE headers in `src/` carry line-level attribution; this document is
the package-level summary.

## allestuetsmerweh/sportident.js

- **Repository:** <https://github.com/allestuetsmerweh/sportident.js>
- **License:** MIT
  (<https://github.com/allestuetsmerweh/sportident.js/blob/master/LICENSE>)
- **Scope of port:** Protocol primitives (`siProtocol`, constants, storage
  primitives), card decoders (`BaseSiCard`, `ModernSiCard`, `SiCard5`,
  `SiCard9`, `SiCard10`, `SIAC` plus their examples), station handshake
  choreography (`BaseSiStation`, `SiMainStation`, `SiSendTask`). See
  per-file MIT NOTICE headers in `src/` for line-level attribution. See
  `scripts/check-mit-attribution.sh` (lands in Plan 05) for the automated
  audit that scans every ported file.

## per-magnusson/sportident-python

- **Repository:** <https://github.com/per-magnusson/sportident-python>
- **License:** GPL
- **Scope:** Reference only — **no code copied**. Credited here for CRC
  cross-verification (the canonical SI CRC test vectors are tabulated in
  that project's README).

## sdenier/GecoSI

- **Repository:** <https://github.com/sdenier/GecoSI>
- **License:** Apache 2.0
- **Scope:** Reference only — **no code copied**. Credited for handshake
  protocol cross-reading.
