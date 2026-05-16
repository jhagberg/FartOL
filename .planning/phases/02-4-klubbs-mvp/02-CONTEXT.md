# Phase 2.0: 4-klubbs MVP — Context

**Gathered:** 2026-05-16
**Status:** Ready for planning (`/gsd-discuss-phase 2` then `/gsd-plan-phase 2`)
**Hard deadline:** Wednesday **2026-05-20** (4-klubbs training at Stora Tuna OK)

<domain>
## Phase Boundary

Phase 2.0 is a deliberately narrow slice of the broader Phase 2 "Small
sanctioned competition" goal. The motivating event is a **4-klubbs
training** on Wednesday 2026-05-20 where we want to run FartOL **as the
primary registration + readout system in parallel with MeOS as a safety
backup**. The MeOS coexistence is the new architectural piece; the rest
is Phase-1 surface work and an Eventor pull.

**In scope (Phase 2.0):**

- **Eventor runner-database (löpardatabasen) download** — one-shot fetch
  of all runners (filtered by district or organisation), cached to a
  local SQLite table indexed by `si_card_number`. Used **only** for
  autocomplete; we do NOT import entries from Eventor for this event
  (almost no one pre-registers on 4-klubbs trainings).
- **WalkupModal enhancements** in `apps/web/src/lib/screens/`:
  - Rename "Klass" → **"Bana"** for 4-klubbs (course-only model).
  - Add **`Hyrbricka` checkbox** — stored on the competitor row as
    `hired_card BOOLEAN`.
  - When SI bricka is read/entered, **look up the runner cache** and
    pre-fill `name` + `klubb` (already wired for `cardHolderHint` from
    SI firmware; this adds Eventor as a second source).
- **MIP server** (`apps/edge/src/integrations/meos/mip.ts`) — Fastify
  route that MeOS polls. Serves `<MIPData>` containing:
  - `<entry>` for every walk-up registration (sync direktanmälningar
    FartOL → MeOS so MeOS has the runner when card hits MeOS readback).
  - `<p>` / `<card>` for finish punches if MeOS wants them.
  - `hired="true"` on entries with Hyrbricka so MeOS's own "return card"
    reminder kicks in too (belt + braces with our own toast).
- **MOP receiver** (`apps/edge/src/integrations/meos/mop.ts`) — Fastify
  route MeOS pushes to. Ingests `<cmp>` updates so:
  - We see runners registered directly in MeOS during a FartOL outage.
  - We can reconcile state after FartOL restart.
- **Hyrbricka finish-readout toast** — when finish read returns a
  competitor with `hired_card=true`, ReadoutView shows a prominent
  Swedish alert: *"⚠️ Hyrbricka — be om att få tillbaka brickan!"*.
- **Parallel-run ops playbook** — short Markdown runbook in
  `docs/ops/parallel-meos-runbook.md` covering: pre-event MeOS+FartOL
  setup, network config (both on same LAN), what each operator does
  during the event, failure-fallback steps (FartOL crashes → switch to
  MeOS-only → reconcile after restart).

**Out of scope (Phase 2.0 — deferred to 2.1+):**

- **Yjs collaborative editing** — at 4-klubbs scale (~100 starters, 1–2
  operators) one operator + the existing optimistic-write path is
  enough. Different operators registering different cards don't conflict
  (D-11 partial unique index on `card_number` is the only collision
  point and it's already handled with a 409 → replace-card flow).
- **QR-code self-signup public route** — would be nice but adds a
  public-facing surface (rate limiting, spam, mobile UX, anti-abuse).
  Defer to Phase 2.1 unless 2.0 lands ahead of schedule.
- **Eventor entries pull** (REQ-STD-004 read path) — irrelevant for
  4-klubbs (no Eventor entries exist). Defer to Phase 2.1 for sanctioned
  competitions.
- **Eventor results push** (REQ-STD-004 write path) — keep manual IOF
  XML 3.0 export + Eventor web upload; the existing Phase 1 exporter
  covers it. Defer automation to Phase 2.1.
- **MeOS SendPunch TCP integration** (2014-era binary protocol) —
  MIP+MOP cover the same use cases with a maintained schema (XSD v3.0
  uploaded 2026-05-14). SendPunch only earns its keep if MIP turns out
  to be too slow at 4-klubbs scale, which is unlikely at ~100 starters.
- **Spectator live results page** — Phase 2.1.
- **Bridge crash recovery hardening** beyond "MOP receiver picks up
  MeOS-registered direktanmälningar" — Phase 2.1.

## Dependencies

- **Phase 1**: merged to `main` (PR #3, merged 2026-05-16T16:21Z).
  Provides the bridge, walkup modal, readout view, IOF XML export.
- **Phase 1.5**: merged. Landing page is live. Not load-bearing for 2.0.
- **External — BLOCKING for Plan "Eventor runner-database download"**:
  - Eventor API key (Stora Tuna OK). User has it; interactive setup
    deferred to the start of execution (paste-into-chat or `.env`).
  - Stora Tuna OK organisation ID (numeric).
- **External — NEEDED for cross-system test**:
  - A MeOS install on the same LAN as the FartOL edge bridge. MeOS
    version pinned ahead of Wednesday so the MIP/MOP XSD versions we
    target match what's running.
  - User runs the MeOS install; we just need to point MeOS at our HTTP
    endpoint via its protocol-config UI.

## Locked decisions from discussion 2026-05-16

These came out of the discuss-phase conversation between Jonas and the
orchestrator agent. Each one is a "do not relitigate without strong
reason."

1. **Course-only model for 4-klubbs.** The provided courseData
   (`docs/2026-05-20 4-klubbs_coursedata.xml`) has 5 courses by color
   (Vit 1875m, Grön 1525m, Gul 2425m, Orange 2975m, Violett 3750m) and
   no classes. Phase 1's CourseData importer already auto-creates a 1:1
   class-per-course when no ClassList is provided — we lean on that and
   just relabel the operator-facing "Klass" picker as **"Bana"** in
   walk-up. No schema change.

2. **FartOL is registration primary; MeOS is parallel backup via MIP+MOP.**
   - Single operator UX (FartOL walkup form).
   - Every accepted walk-up is queued for MIP push to MeOS.
   - MeOS readback is the backup if FartOL crashes; MOP feed pulls those
     MeOS-only registrations back into FartOL on restart.
   - **NOT** "MeOS is source of truth, FartOL is passive mirror" — that
     was the agent's lowest-risk recommendation but would not exercise
     FartOL's full workflow.

3. **No runner double-stamping.** FartOL bridge auto-captures the finish
   punch (Phase 1 path). MeOS does its own card readback at the MeOS
   desk for any runner who visits it. Each system gets its own data
   through its own path; cross-validation happens post-event.

4. **Hyrbricka handled in both systems independently.** FartOL stores
   the flag on the competitor row and shows a Swedish toast on
   finish-readout. MIP `<card hired="true">` lets MeOS show its own
   "return card" reminder too. Belt + braces because the goal is **zero
   lost rental cards**.

5. **Eventor is the runner-DATABASE, not the entry source.** One-shot
   download, cached, queried on bricka-input. Refresh weekly is fine —
   Eventor löpardatabasen doesn't change minute-to-minute.

6. **MIP server, not SendPunch TCP, not UDP broadcast.** The two
   2014-era binary protocols are skipped entirely; MIP's XSD v3.0
   (uploaded 2026-05-14) and MOP's v2.0 (March 2025) are the only
   actively-versioned protocols and they cover every documented Phase
   2.0 use case.

7. **`/gsd-plan-phase 2`** is the next workflow step. This CONTEXT file
   is the input; the planner should expand it into ~5–6 numbered
   `02-NN-PLAN.md` files. See "Suggested plan breakdown" below for a
   starting point — not normative.

## Suggested plan breakdown (not normative — `gsd-plan-phase` decides)

| # | Plan title | Est. | Depends on |
|---|---|---|---|
| 1 | Eventor löpardatabasen download + SQLite cache | 1d | API key |
| 2 | WalkupModal: Bana label + Hyrbricka + Eventor name autocomplete | 0.5d | Plan 1 |
| 3 | MIP server: `<entry>` push for direktanmälningar | 1d | Plan 2 |
| 4 | MOP receiver: ingest MeOS `<cmp>` for state reconciliation | 0.5d | Plan 3 |
| 5 | Hyrbricka finish-readout toast | 0.25d | Plan 2 |
| 6 | Parallel-run ops playbook (`docs/ops/parallel-meos-runbook.md`) | 0.25d | Plans 3+4 |
| 7 | **Stretch** — QR self-signup public route | 1d | Plan 2 |

Total committed: **~3.5d**. Wednesday morning is the buffer / dry-run.

## References

- `.planning/research/meos-protocols.md` — full research output. MOP/MIP
  XSD locations, sample payloads, cost estimates, staleness flags.
- `docs/2026-05-20 4-klubbs_coursedata.xml` — the actual courseData for
  the event (Condes 10.8.12 export, IOF XML 3.0). Use this verbatim as
  the e2e fixture for 2.0 plans that touch course import.
- `docs/2026-05-20 4-klubbs.wcd` — Purple Pen / Condes native file
  (sibling of the IOF XML). Not load-bearing; FartOL ingests the XML.
- `docs/guide-meos.pdf` (in worktree `/home/jonas/src/FartOL-phase-1.5/`)
  — MeOS user manual; the **UX pattern we're matching** for walk-up
  registration (Anmälningsläge, runner DB autocomplete, Hyrbricka tag).
- `apps/web/src/lib/screens/WalkupModal.svelte` — Phase 1 baseline that
  Plan 2 extends. Already has `cardHolderHint` from SI firmware; Plan 2
  adds the Eventor cache as a second autocomplete source.
- `apps/edge/src/ingest/entryImport.ts` — pattern for `clubs` upsert +
  competitor insert (Phase 1). MIP `<entry>` push follows the same
  shape on the way out.
- ADR-0008 (`pii-in-append-only-event-log.md`) — PII retention rules
  still apply; runner cache from Eventor is **NOT** event-log data and
  is allowed to be re-fetched any time, so retention-scrub doesn't
  touch it. Adds a new SQLite table outside the append-only domain.

## Open questions (resolve in `/gsd-discuss-phase 2`)

- Eventor download endpoint shape — list-by-district vs
  list-by-organisation. Confirmed at execution start with an
  interactive curl.
- MIP authentication — MeOS supports a plain-text `pwd` header. For
  4-klubbs (closed club LAN) we probably skip it; for Phase 2.1
  (sanctioned event with bigger LAN attack surface) we add it.
- MOP storage shape — do we project MeOS `<cmp>` rows into the existing
  `competitors` table, or keep a shadow `meos_competitors` table to
  avoid cross-contaminating ground truth? Recommend shadow table; let
  the planner confirm.
- Hyrbricka column placement — `competitors.hired_card BOOLEAN` vs a
  separate junction. Recommend column; trivial migration.
- Branch rename — current branch is
  `gsd/phase-2-sanctioned-competition` (off the original Phase 2 name).
  Consider renaming to `gsd/phase-2.0-4-klubbs-mvp` to match the split.
  Not blocking.
</domain>
