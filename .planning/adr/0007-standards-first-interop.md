---
status: accepted
date: 2026-05-12
decision-makers: [Jonas Hagberg]
---

# Standards-first interop: IOF XML, Eventor, ROC, SIRAP, MeOS TCP

## Context and Problem Statement

Clubs don't switch competition software all at once — they migrate one
event at a time. A system that cannot exchange data with existing
tools (Eventor, MeOS, ROC, Livelox) is dead on arrival regardless of
internal quality. How do we ensure interop is structural, not an
afterthought?

## Considered Options

- Build the core first; add export/import formats later as plugins
- Make every IOF/federation standard a v1 requirement, designing data
  models around them
- Pick one or two formats and let others be community contributions

## Decision Outcome

Chosen option: **standards-first**, with these commitments:

- **v1 (Phase 1):** IOF XML 3.0 import + export; IOF XML 2.0.3 read.
- **v1 (Phase 2):** Eventor REST API (pull entries, push results).
- **v2 (Phase 4):** ROC protocol receiver, SIRAP TCP server, MeOS TCP
  input output (side-car mode), Livelox export.

Side-car mode (MeOS TCP input _output_) is the migration trick: a
club can run MeOS as the primary secretariat and this system as a
parallel kids'-finish/live-board service, building trust before
switching primary systems.

## More Information

- IOF XSD: <https://github.com/international-orienteering-federation/datastandard-v3>
- `.planning/REQUIREMENTS.md` REQ-STD-001..008.
