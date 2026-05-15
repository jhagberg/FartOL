# Roadmap: fartol

## Overview

Phases mapped to REQ-IDs from `REQUIREMENTS.md`. Each phase has a single
user-visible deliverable and explicit success criteria. We do not move
to the next phase until the current phase has been used by a real
orienteer at a real event (training counts).

## Phases

- [x] **Phase 0: Hardware proof** — Node.js script reads SI cards via BSM7/BSM8 on Linux, logs structured JSON. (Completed 2026-05-13, tagged `v0.0.1-handshake`.)
- [ ] **Phase 1: Single-laptop training MVP** — Run a real club training using only this software on one laptop.
- [ ] **Phase 1.5: Public demo + landing page** — GitHub Pages site with a clickable mock so anyone can test the UI and leave feedback before Phase 2.
- [ ] **Phase 2: Small sanctioned competition** — Sanctioned competition with 100–200 starters and concurrent operators.
- [ ] **Phase 3: Children's finish, public engagement** — Kids' finish screen, parent notifications, embeddable live widget.
- [ ] **Phase 4: Multi-arena, radio controls** — Radio controls feeding live punches, multiple WiFi cells, peer-to-peer sync.
- [ ] **Phase 5: O-ringen scale** — Demonstrable capacity for a five-stage event with 25 000+ starters.

## Phase Details

### Phase 0: Hardware proof

**Goal**: A Node.js script that reads SI cards from BSM7/BSM8 on Linux and logs structured JSON to stdout.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-HW-001, REQ-HW-002, REQ-HW-004
**Success Criteria** (what must be TRUE):
  1. BSM7/8 enumerates as `/dev/ttyUSB0` on Linux.
  2. Script opens port at 38 400 baud and completes handshake.
  3. CRC16-CCITT-0x8005 validation passes for incoming frames.
  4. Inserting a real SI8/9/10 logs `{cardNumber, punches: [...]}` to stdout.
  5. SI5 card test passes (legacy support).
  6. Tagged `v0.0.1-handshake`.
**Plans**: 6 plans
  - [x] 00-01-PLAN.md — Wave 0 scaffold: pnpm/tsup/lefthook/commitlint + packages/sportident/ skeleton + all Wave-0 test placeholders + CI workflow
  - [x] 00-02-PLAN.md — Port siProtocol (CRC16 + parse + parseAll + render) + constants + utils; 10 frozen CRC vectors green; synthetic frame fixtures
  - [x] 00-03-PLAN.md — Port storage primitives + BaseSiCard + ModernSiCard + SiCard5/9/10/SIAC; upstream-fixture-driven decoder tests
  - [x] 00-04-PLAN.md — SerialTransport (node serialport@13) + simplified SiTargetMultiplexer (Direct-only) + BaseSiStation/SiMainStation handshake; FakeSerialTransport-driven tests
  - [x] 00-05-PLAN.md — NDJSON output layer + bin/fartol-readout + index.ts public API + end-to-end fixture-replay integration test
  - [x] 00-06-PLAN.md — --record/--replay modes + hardware-smoke.sh + 4 bench fixtures (SI5/SI9/SI10/SIAC, captured 2026-05-13 in `packages/sportident/tests/fixtures/jonas/`) + v0.0.1-handshake tag

- Phase 0.1 (gap-closure 2026-05-13): closed 6 of 7 codex review findings — see .planning/phases/00-hardware-proof/00-1-SUMMARY.md

This is the hardest single technical milestone. Everything else is
"normal" web development once this works.

### Phase 1: Single-laptop training MVP

**Goal**: Run a real club training using only this software on one laptop. No internet required.
**Depends on**: Phase 0
**Requirements**: REQ-HW-001..004, REQ-EVT-001..004, REQ-EVT-CMP-001..008, REQ-UI-001..007, REQ-STD-001..003, REQ-OPS-001..003, REQ-PRIV-001, REQ-PRIV-002
**Success Criteria** (what must be TRUE):
  1. Import a Purple Pen `.xml` course file end-to-end.
  2. Web UI accessible at `localhost:5173` on Linux laptop.
  3. Read cards via Phase 0 bridge, match to course, show results live.
  4. Mark DNF / MP automatically.
  5. Print receipt to thermal printer OR show QR receipt.
  6. Export results as valid IOF XML 3.0 (XSD validation passes).
  7. StorTuna OK Tuesday training (20–40 starters) runs without falling over.
**Plans**: TBD

### Phase 1.5: Public demo + landing page

**Goal**: Anyone with a browser can click through the FartOL UI end-to-end and leave feedback before Phase 2 ships.
**Depends on**: Phase 1
**Requirements**: (no new REQ-IDs — derived from Phase 1's REQ-UI surface)

**Scope decision (2026-05-15)**: ship `.planning/phases/01-single-laptop-training-mvp/01-SKETCHES/claude-design-bundle/project/` as the demo. It's already a standalone React+Babel SPA with mock data, no backend required, and covers wizard / home / readout / results / walk-up / 6 receipt templates / tweaks panel. The sketches were the *design* the implementation was built from — minor drift between sketch and built app IS itself feedback. Avoid a separate "mock service mode" for the SvelteKit app unless v1 feedback shows the drift is too large.

**Success Criteria** (what must be TRUE):
  1. GitHub Pages site live at a stable URL (e.g. `https://jhagberg.github.io/FartOL/`).
  2. Landing page (single static HTML) explains what FartOL is, who it's for, and links to the demo + repo + feedback channel.
  3. The sketches bundle is reachable at `/demo/` on the same site — clicking through works in modern browsers (Chrome / Firefox / Safari current).
  4. Feedback path is clickable from the page (pre-filled GitHub issue template, or a Tally/Google Form embed) — feedback in <60 seconds.
  5. Deploy is automatic on push to `main` via GitHub Actions (`actions/upload-pages-artifact` + `actions/deploy-pages`).

**Plans** (provisional — flesh out via `/gsd-discuss-phase 1.5`):
  - Plan A: Landing page (static HTML, repo-root `docs/` or `site/`) with intro, screenshots, "Try the demo" CTA, repo link, feedback link. ~half a day.
  - Plan B: GitHub Pages deploy workflow + repo settings (artefact bundling, pages branch, custom 404). Workflow copies `docs/` + sketches `project/` into the deploy artefact. ~2 hours.
  - Plan C (optional): Feedback channel — pre-filled GitHub issue template (`.github/ISSUE_TEMPLATE/demo-feedback.yml`) and/or Tally embed. ~1 hour.

Phase 1.5 is explicitly non-blocking for Phase 2 — if the StorTuna club is ready to use Phase 1 in production before 1.5 lands, ship Phase 1 to them and run 1.5 in parallel.

**Future option (out of scope here)**: a Phase 1.6 / Phase 2 follow-up could ship a *real* SvelteKit-mock build to keep the demo pixel-aligned with shipped code. Decide after Phase 1.5 v1 collects feedback.

### Phase 2: Small sanctioned competition

**Goal**: A sanctioned competition with 100–200 starters and multiple secretariat operators editing concurrently.
**Depends on**: Phase 1
**Requirements**: Phase 1 + REQ-UI-008, REQ-STD-004, REQ-OPS-004
**Success Criteria** (what must be TRUE):
  1. Eventor pull (entries) and push (results) works end-to-end.
  2. Three+ browser clients connected to one edge-bridge.
  3. Yjs collaborative editing of registrations: live cursors, no conflicts.
  4. Spectator-facing live results page on arena WiFi.
  5. Bridge process killed mid-event recovers with zero data loss.
  6. A real Swedish-ranking competition runs on this stack.
**Plans**: TBD

### Phase 3: Children's finish, public engagement

**Goal**: The visible UX leap. Kids' finish screen, parent notifications, embeddable live widget.
**Depends on**: Phase 2
**Requirements**: REQ-UI-009, REQ-UI-010, REQ-UI-011, REQ-UI-012
**Success Criteria** (what must be TRUE):
  1. Kids' finish HDMI screen runs at arena: animated, TTS, configurable.
  2. Parent SMS opt-in pipeline tested with 10+ real families.
  3. Speaker dashboard used live by a real arena announcer.
  4. Big-screen overlay customized per club logo/colors.
  5. At least one parent says "this is way better" unprompted.
**Plans**: TBD

### Phase 4: Multi-arena, radio controls

**Goal**: Competition with radio controls feeding live punches, multiple WiFi cells, full peer-to-peer sync.
**Depends on**: Phase 3
**Requirements**: REQ-HW-005..009, REQ-EVT-005..007, REQ-EVT-CMP-009..011, REQ-STD-005, REQ-STD-006, REQ-STD-007, REQ-OPS-005, REQ-OPS-006, REQ-PRIV-003, REQ-PRIV-004
**Success Criteria** (what must be TRUE):
  1. Receive punches from a ROC radio control in the wild.
  2. SIRAP gateway accepted by an existing MeOS install for testing.
  3. Two edge-bridges sync events under simulated partition; no data loss.
  4. Relay-day at a regional cup runs end-to-end on this stack.
  5. Score-event support proven at a rogaining.
**Plans**: TBD

### Phase 5: O-ringen scale

**Goal**: Demonstrable capacity for a five-stage event with 25 000+ starters.
**Depends on**: Phase 4
**Requirements**: REQ-STD-008, plus performance and operational hardening across all earlier REQs
**Success Criteria** (what must be TRUE):
  1. Partitioned Postgres per stage validated.
  2. CDN tier (Cloudflare or self-hosted) tested at 30 000 concurrent viewers.
  3. 4G/5G+Starlink bonded uplink playbook documented and run-once.
  4. Livelox API integration working under their approval.
  5. IOF result-feed compliance validated by federation.
  6. System pitched to O-ringen organizing committee without lying.
**Plans**: TBD

## Cross-cutting (all phases)

These must be respected throughout, not deferred to a phase:

- Tests run on real hardware before any release tag.
- ADRs (`.planning/adr/NNNN-title.md`, MADR 4.0.0 format) for non-obvious decisions.
- README, PROJECT.md, research notes stay current.
- Swedish-first UI strings. Plain language over jargon.
- Backwards compatibility with SI5 cards and IOF XML 2.0.3.
- AGPL-3.0 application, MIT for `packages/sportident`.

## Progress

**Execution Order:** Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Hardware proof | 6/6 | Complete   | 2026-05-13 |
| 1. Single-laptop training MVP | 0/TBD | Not started | - |
| 2. Small sanctioned competition | 0/TBD | Not started | - |
| 3. Children's finish, public engagement | 0/TBD | Not started | - |
| 4. Multi-arena, radio controls | 0/TBD | Not started | - |
| 5. O-ringen scale | 0/TBD | Not started | - |
