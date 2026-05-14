# IOF Data Standard v3.0 — Bundled XSD Attribution

This package bundles `IOF.xsd`, the XML Schema for the IOF Interface Standard
version 3.0, published by the **International Orienteering Federation (IOF)**.

## Source

- Repository: <https://github.com/international-orienteering-federation/datastandard-v3>
- File: `IOF.xsd` at the repository root
- Commit pinned: `24eb108e4c6b5e2904e5f8f0e49142e45e2c5230` (`master` HEAD on 2020-04-22)
- Direct download URL:
  <https://raw.githubusercontent.com/international-orienteering-federation/datastandard-v3/24eb108e4c6b5e2904e5f8f0e49142e45e2c5230/IOF.xsd>
- Bundled into this repository: 2026-05-14 (Phase 1 plan 05).
- Bytes (sha256): see `git log --follow IOF.xsd` for the cumulative hash.

## License

The IOF Data Standard XSD is published by the IOF without an explicit OSI
license header, but the standard itself is openly published for the
interoperability of orienteering software. Per ADR-0007 (standards-first
interop) and RESEARCH §"Open Question 4: bundle IOF.xsd" the IOF has, in
practice, treated the XSD as a public technical specification that vendors
are expected to embed in their products. The schema is shipped here verbatim
without modification; if the IOF publishes a revised license, this file
must be updated.

## Why this file is bundled

Phase 1 ships as a single offline `fartol` binary (REQ-OPS-001). Downloading
the XSD at runtime would defeat the no-internet-required guarantee. Plan 05
therefore commits the schema to the package, copies it into `dist/xml/IOF.xsd`
at `pnpm build` time, and parses it once at module load.

## Updating

To pin a newer commit:

1. Re-download the file from the URL above with the new commit hash.
2. Overwrite `apps/edge/src/xml/IOF.xsd`.
3. Update the **Commit pinned** line and the **Bundled into this repository**
   date in this NOTICE.
4. Run `pnpm --filter @fartol/edge test` — the XSD validator tests act as a
   smoke test against the new schema.
