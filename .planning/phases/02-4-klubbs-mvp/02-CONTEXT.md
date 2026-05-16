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

- **Eventor national runner DB download** — nightly fetch of
  `/api/export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0`
  (9.4 MB zipped, 86 MB XML, **252 919 competitors, 96 918 with SI cards**)
  plus `/api/export/clubs?version=3.0` (1.3 MB XML). Parsed streamingly
  (sax) into SQLite tables `eventor_competitors` (indexed by `si_card`
  and `(family_name, given_name)`) and `eventor_clubs`. This is the
  **same endpoint MeOS uses** (verified at `/home/jonas/src/meos/code/
  TabCompetition.cpp:3107-3108`), and it's OPEN to club-level API keys
  despite the live `/api/competitors` endpoint being 403. Used **only**
  for walk-up autocomplete; we do NOT import entries from Eventor for
  this event (almost no one pre-registers on 4-klubbs trainings).
  **Privacy footnote**: 252 k names + birth years + SI cards is materially
  more PII than Phase 1 carried — Plan 1 should write a new ADR-0009
  covering the trade-off and mitigations (local-only, no phone/email,
  clear-cache admin endpoint, nightly refresh respects Eventor ToS).
- **WalkupModal enhancements** in `apps/web/src/lib/screens/`:
  - Rename "Klass" → **"Bana"** for 4-klubbs (course-only model).
  - Add **`Hyrbricka` checkbox** — stored on the competitor row as
    `hired_card BOOLEAN`.
  - When **SI bricka is read/entered**, look up `eventor_competitors`
    by `si_card`. If hit → pre-fill `name` + `klubb` (resolved via
    `eventor_clubs.name`). If miss → fall back to the Phase 1
    `cardHolderHint` from SI firmware. This is the MeOS-style flow.
  - When **operator types in the name field**, prefix-match
    autocomplete on the `(family_name, given_name)` index → 96 918
    SI-card-carrying runners + the rest typed manually still work.
- **Registration-desk screen** — new `/competition/<id>/registration`
  route (NEW IN PHASE 2.0, ADDED 2026-05-16 LATE). Optimised for the
  pre-race **"line of kids with own + rental bricks"** scenario:
  - Hosts the same `WalkupModal` overlay but on a clean
    registration-themed page (NOT on `ReadoutView`, which mixes the
    operator's role — results-display vs. registration-desk).
  - **Card-beep queue + auto-advance.** Today (Phase 1, `ReadoutView
    .svelte:406-414`) a second unknown card beep arriving while the
    modal is already open is *silently dropped onto the recent-reads
    history* — operator must hunt for it after saving the first kid.
    For the kids line, replace this with: queue the second card,
    show a small "N i kö" badge, and **auto-open** the modal for the
    next queued card on Save. Defensive: same card beeped twice while
    queued → ignore-with-toast.
  - **MeOS-style ergonomics**: with Plan 1 Eventor lookup landing,
    each known kid is **3-5 sec to register** (modal opens with name +
    klubb pre-filled, operator only picks Bana + clicks Spara). Without
    Eventor lookup or for unknown bricks, **8-12 sec**. The auto-advance
    queue makes the difference between a line that flows and a line
    that pools.
  - The bridge reader is the same physical SI master station Phase 1
    uses; **before the race starts** there are no finish punches to
    confuse, so single-reader-serves-both is fine. If a finish punch
    arrives WHILE the registration screen is active (late-comers
    during the race), the queue swallows it gracefully too — operator
    sees "okänd bricka" entry and decides whether it's a late
    registrant or an already-registered runner finishing.
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
| 2b | **Registration-desk screen + card-beep queue + auto-advance** (ADDED 2026-05-16 late) | 0.5d | Plan 2 |
| 3 | MIP server: `<entry>` push for direktanmälningar | 1d | Plan 2 |
| 4 | MOP receiver: ingest MeOS `<cmp>` for state reconciliation | 0.5d | Plan 3 |
| 5 | Hyrbricka finish-readout toast | 0.25d | Plan 2 |
| 6 | Parallel-run ops playbook (`docs/ops/parallel-meos-runbook.md`) | 0.25d | Plans 3+4 |
| 7 | **Stretch** — QR self-signup public route | 1d | Plan 2 |

Total committed: **~4d** (was 3.5d before Plan 2b was added). Wednesday morning is the buffer / dry-run. If 4d feels tight, **Plan 2b is the strongest cut candidate** — without it the Phase 1 single-host walkup flow still works for a kids line at a slower per-kid tempo (operator picks subsequent cards from history).

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

## Open questions — RESOLVED in `/gsd-discuss-phase 2` (round 2, 2026-05-16 evening)

All five open questions are now locked. See the `<decisions>` block below
for the full set of round-2 implementation decisions. Summary pointers:

- ~~Eventor download endpoint shape~~ — **resolved (twice, 2026-05-16).**
  Parallel agent investigation landed `/api/export/cachedcompetitors`
  (national, 252 919 competitors, 96 918 SI cards). See revised
  `.planning/research/eventor-api-smoke.md`. Round 2 added: upstart-on-
  bridge-boot trigger, 7-day staleness threshold, warn-and-run offline
  behavior. See D-EV-1 / D-EV-2 / D-EV-3 below.
- ~~Multi-club key coordination~~ — **resolved.** Cachedcompetitors is
  national; no per-club key dance needed.
- ~~MIP authentication~~ — **resolved D-MIP-1.** No `pwd` for 4-klubbs
  (closed club LAN); revisit for 2.1 sanctioned events.
- ~~MOP storage shape~~ — **resolved D-MOP-1.** Shadow `meos_*` tables;
  TRUNCATE+INSERT in transaction on `<MOPComplete>`; auto-merge MeOS-
  only competitors into `competitors` with `source='meos'`.
- ~~Hyrbricka column placement~~ — **resolved D-HB-1.** Junction table
  `hired_cards (competition_id, card_number, marked_at_ms, returned_at_ms,
  contact_name, contact_phone, contact_email, note)` — strict superset of
  MeOS's flat `hiredCardHash<int>` design (verified at
  `/home/jonas/src/meos/code/oEvent.h:930-934`). Adds contact info MeOS
  lacks for the "hunt down non-returners" use case.
- Branch rename — current branch is
  `gsd/phase-2-sanctioned-competition` (off the original Phase 2 name).
  Consider renaming to `gsd/phase-2.0-4-klubbs-mvp` to match the split.
  Not blocking; planner discretion.

</domain>

<decisions>
## Implementation Decisions (round 2 — 2026-05-16 evening)

These 14 decisions came out of `/gsd-discuss-phase 2` round 2, after the
parallel Eventor agent had landed its endpoint research (commits 80d9ab4 +
97b22ac). Together with the 7 first-round locked decisions in `<domain>`
above, they fully scope Phase 2.0 for `/gsd-plan-phase 2`.

### Eventor löpardatabasen cache (Plan 1)

- **D-EV-1:** Refresh trigger = **upstart job on bridge boot + admin
  "Uppdatera från Eventor" button**. No background cron (bridge is
  competition-only, not always-on). Operator can force a refresh from
  the admin/tweaks surface. Reason: the bridge isn't always running, so
  cron is the wrong abstraction; on-boot fetch + on-demand mirrors how
  MeOS does it.
- **D-EV-2:** Staleness threshold = **re-fetch on bridge boot if cache
  > 7 days old**, otherwise reuse the local copy. Admin button is the
  override for "I want fresh data right now". Respects Eventor ToS
  ("members fetched once per day is plenty"; weekly is comfortably
  inside).
- **D-EV-3:** Bridge boots with stale/empty cache and no internet =
  **warn + run with what we have**. If cache exists: use it, surface a
  UI indicator `Eventor: cache N dagar gammal`. If empty: walkup falls
  back to the Phase 1 `cardHolderHint` flow, indicator says `Eventor:
  offline`. Honors REQ-OPS-001 (no internet required). NEVER blocks
  bridge startup on network reachability.

### MIP server `<entry>` push (Plan 3)

- **D-MIP-1:** Auth = **none** for 4-klubbs (closed club LAN). MeOS's
  `pwd` header is ignored. Revisit for Phase 2.1 sanctioned events.
- **D-MIP-2:** `lastid` source = **reuse `events.local_seq`**. Phase 1's
  events table already provides monotonic local_seq; MIP serves
  `WHERE local_seq > ?` and serializes matching `card_bound` rows to
  MIP `<entry>` (and matching `card_read` rows IF Plan 3 ever extends —
  see D-MIP-3). Zero new state.
- **D-MIP-3:** Push scope = **`<entry>` on bind + `<entry>` re-emit on
  card-replace updates**. NOT full `<card>` punch dumps (would violate
  locked decision #3 "no runner double-stamping"). The replace-card
  409 flow re-emits the same FartOL UUID via `<extId>` so MeOS UPDATEs
  rather than inserts.
- **D-MIP-4:** Entry shape = **`<classname>` (string) + `<extId>`
  (FartOL competitor UUID)**. Verified against MeOS source at
  `/home/jonas/src/meos/code/onlineinput.cpp:989-997`: parser falls back
  to `oe.getClass(clsName)` when `<classid>` is absent or unknown.
  Eliminates the MOP-bootstrap dance entirely. Precondition: MeOS has
  the five 4-klubbs classes (Vit/Grön/Gul/Orange/Violett) set up
  pre-event — covered by the parallel-run playbook.

### MOP receiver `<MOPComplete>` / `<MOPDiff>` (Plan 4)

- **D-MOP-1:** Storage = **shadow `meos_competitors` / `meos_classes` /
  `meos_clubs` tables** (not projected into the active `competitors`
  table). Clean separation of FartOL ground truth from MeOS view;
  reconciliation is an explicit step. Crash-recovery query becomes
  trivial: `WHERE NOT EXISTS (SELECT 1 FROM competitors WHERE
  card_number = meos_competitors.card_number)`.
- **D-MOP-2:** `<MOPComplete>` semantics = **TRUNCATE + INSERT inside
  a single transaction**. Matches MOP spec ("receiver should drop prior
  state and replace it"). Transaction makes partial-parse safe (rollback
  preserves prior snapshot). `<MOPDiff>` does plain UPSERT by id, plus
  DELETE for rows with `delete="true"`.
- **D-MOP-3:** Reconciliation behavior = **auto-merge MeOS-only
  competitors into `competitors`**. On every MOP write, find shadow rows
  whose `card_number` doesn't exist in `competitors` and INSERT them
  with `source='meos'`, `consent_status='pending_first_read'` (operator
  confirms on first card_read, same Phase 1 path). Surface a toast:
  `N löpare hämtade från MeOS`. Matches locked decision #2 "MeOS
  registrations during outage flow back via MOP on restart."
- **D-MOP-4:** Lifecycle = **always-on, no auth**. `/mop` mounts
  whenever the bridge runs. Consistent with D-MIP-1; no per-competition
  toggle. Operator just points MeOS at the URL and it works.

### Hyrbricka model + UX (Plans 2 + 5)

- **D-HB-1:** Data shape = **junction table `hired_cards
  (competition_id, card_number PK, marked_at_ms, returned_at_ms
  NULLABLE, contact_name, contact_phone, contact_email, note)`**.
  Card-centric (matches the "zero lost rental cards" inventory framing)
  AND carries contact info MeOS lacks. Strict superset of MeOS's flat
  `oEvent::hiredCardHash` (`set<int>` per event — see
  `/home/jonas/src/meos/code/oEvent.h:930-934` and usage in
  `TabSI.cpp:3272`). Same lookup pattern at finish-readout: `EXISTS
  (SELECT 1 FROM hired_cards WHERE card_number = ? AND returned_at_ms
  IS NULL)`. ADD to REQ-PRIV-002 retention scrub list.
- **D-HB-2:** Return flow = **"Returnerad" button at finish-readout +
  admin "Aktiva hyrbrickor" backstop**. Finish-readout shows the
  Hyrbricka toast with contact info AND a one-tap return button.
  Operator hands card back, clicks, sets `returned_at_ms = now()`.
  Admin page lists open rentals for end-of-event reconciliation.
- **D-HB-3:** Walkup UX = **Hyrbricka checkbox + expandable contact
  fields when checked** (name/phone/email/note). Contact fields are
  required when checkbox is set (operator can't save a hired card
  without at least a phone OR email). Reason: the whole point is being
  able to reach the renter if they don't return.

### Known limitation — documented in playbook (Plan 6)

- **D-LIM-1:** MOP `<cmp>` does NOT carry the hired flag, so rentals
  marked in MeOS during a FartOL outage will NOT auto-import on
  recovery. The parallel-run playbook documents the manual workaround:
  operator re-enters those rentals in FartOL post-restart. Not worth
  fixing in 2.0 because (a) the typical outage is short, (b) MeOS
  operators eyeball rental returns anyway, (c) belt+braces is sufficient.

### Claude's Discretion

Areas explicitly left to the planner / executor:

- Exact Fastify route file organization for `apps/edge/src/integrations/meos/`
  (mip.ts + mop.ts + shared types).
- Streaming XML parser library for the 86 MB Eventor download
  (`saxes`, `sax`, `fast-xml-parser` stream mode — Phase 1 already
  uses XML parsing patterns; reuse where sensible).
- Whether the upstart-on-bridge-boot Eventor fetch shows a splash
  screen, a background indicator, or both. UI-SPEC discretion.
- ADR-0009 ("National runner DB cached locally for walk-up
  autocomplete") timing — Plan 1 task 0 (recommended per
  eventor-api-smoke.md), or a sibling commit before Plan 1's first
  code change.
- Wording of Swedish toasts (`Eventor: cache N dagar gammal`,
  `⚠️ Hyrbricka — be om att få tillbaka brickan!`, `N löpare hämtade
  från MeOS`, `Returnerad`) — UI-SPEC can polish before plan execution.
- Exact MIP polling response when nothing's new (empty
  `<MIPData lastid="N"/>` is the obvious answer; MeOS spec allows it).
- Exact UPDATEs to a competitor row that trigger a MIP `<entry>`
  re-emit (D-MIP-3). Safe default: card_number change, class_id
  change, name change.
- Exact bin path / udev / install-smoke changes for Phase 2 (Phase 1
  Plan 18 patterns hold; planner extends).
- Branch rename (`gsd/phase-2.0-4-klubbs-mvp`) — cosmetic; not
  blocking.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**
This list supersedes the unstructured "References" list inside `<domain>`
above for downstream consumption.

### Phase 2.0 research outputs (MUST READ)

- `.planning/research/meos-protocols.md` — Full MeOS protocol matrix
  (MOP, MIP, SendPunch TCP, UDP broadcast). Sample payloads, XSD
  locations, version landmines, cost estimates. Drives Plans 3 + 4.
- `.planning/research/eventor-api-smoke.md` — Eventor API smoke test +
  endpoint matrix. Locks Plan 1 schema (`eventor_competitors`,
  `eventor_clubs`) and download flow. Includes privacy + ToS
  considerations.

### MeOS source code (referenced during round 2 discussion)

- `/home/jonas/src/meos/code/onlineinput.cpp:985-1100` — MIP
  `<entry>` parser. Verified that `<classname>` string lookup works
  (line 994-996: `entry.getObjectString("classname", clsName); cls =
  oe.getClass(clsName);`). Locks D-MIP-4 entry shape.
- `/home/jonas/src/meos/code/onlineinput.cpp:1065-1073` — MIP card +
  hired parsing. Locks `<card hired="true">12345</card>` wire format.
- `/home/jonas/src/meos/code/oEvent.h:930-934` — MeOS hired-card API
  (`hasHiredCardData`, `isHiredCard(cardNo)`, `setHiredCard`,
  `getHiredCards`, `clearHiredCards`). Confirms MeOS uses flat
  `set<int>` per event — our D-HB-1 junction is a strict superset.
- `/home/jonas/src/meos/code/TabSI.cpp:3272,3309` — MeOS finish-readout
  hired-check pattern (`runner->isRentalCard() || oe->isHiredCard(...)`).
  Reference for our finish-readout `EXISTS` query in D-HB-1.
- `/home/jonas/src/meos/code/TabCompetition.cpp:3107-3108` — MeOS's
  own Eventor cachedcompetitors download call. Locks Plan 1 endpoint
  choice (this is the only Eventor endpoint that's open to club-level
  API keys for the full national DB).

### Event fixtures (the actual race data)

- `docs/2026-05-20 4-klubbs_coursedata.xml` — Condes 10.8.12 IOF XML
  3.0 course export for the 4-klubbs event. Use verbatim as the e2e
  fixture for any Plan that touches course import. 5 courses:
  Vit/Grön/Gul/Orange/Violett.
- `docs/2026-05-20 4-klubbs.wcd` — Purple Pen / Condes native
  sibling. Not load-bearing; FartOL ingests the XML.
- `docs/Guide_Eventor_-_Hamta_data_via_API.pdf` — Eventor API
  reference (ToS guidance for D-EV-1 cadence; key handling).

### Phase 1 code being extended

- `apps/web/src/lib/screens/WalkupModal.svelte` — Plan 2 extends.
  Already has `cardHolderHint` from SI firmware; Plan 2 adds Eventor
  cache lookup as a second autocomplete source AND the Hyrbricka
  checkbox + contact fields (D-HB-3).
- `apps/web/src/lib/screens/ReadoutView.svelte` — Plan 5 extends with
  the Hyrbricka finish-readout toast + Returnerad button (D-HB-2).
- `apps/edge/src/db/schema.ts` — Plans 1 + 4 + 5 add new tables:
  `eventor_competitors`, `eventor_clubs`, `meos_competitors`,
  `meos_classes`, `meos_clubs`, `hired_cards`. Migrations follow
  Phase 1's drizzle-kit pattern.
- `apps/edge/src/ingest/entryImport.ts` — Pattern for clubs upsert +
  competitor insert in a transaction. MIP `<entry>` push (Plan 3)
  follows the inverse: emit `<entry>` for every `card_bound` row.
- `apps/edge/src/routes/` — Plans 3 + 4 add a new `integrations/meos/`
  subdirectory with `mip.ts` (GET /mip) and `mop.ts` (POST /mop) Fastify
  route plugins.
- `apps/edge/src/privacy/` — Phase 1 retention scrubber. Plan 5
  extends to include `hired_cards.contact_*` columns (REQ-PRIV-002).

### Locked decisions (ADRs)

- `.planning/adr/0008-pii-in-append-only-event-log.md` — PII
  retention rules. Runner cache from Eventor (Plan 1) and rental
  contact info (D-HB-1) need scrub coverage. ADR-0009 (forthcoming
  per Plan 1 / Claude's Discretion) extends with national-DB
  considerations.
- `.planning/adr/0006-tech-stack.md` — Node.js 22 LTS + Fastify +
  better-sqlite3 + SvelteKit. Plans 1-6 stay inside this stack.
- `.planning/adr/0007-standards-first-interop.md` — IOF XML 3.0 +
  Eventor + MeOS interop posture. Phase 2.0 instantiates the MeOS
  interop (via MIP+MOP) and the Eventor interop (via cachedcompetitors).

### Phase 1 dependencies

- `.planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md` —
  D-01..D-15 locked. Especially D-09 (mutable config tables, immutable
  events), D-10 (Drizzle ORM), D-11 (card-to-competitor partial unique
  index), D-13 (WebSocket transport).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`apps/web/src/lib/screens/WalkupModal.svelte`** — Phase 1 walk-up
  modal with `cardHolderHint` SI-firmware autocomplete. Plan 2 adds
  Eventor `si_card` lookup as a second source AND Hyrbricka checkbox
  + expandable contact fields. The existing `createCompetitor()` API
  call extends with `hired_card`-context (`hired_card: true` triggers
  a separate `hired_cards` INSERT in the same transaction on the edge).
- **`apps/web/src/lib/screens/ReadoutView.svelte`** — Phase 1 live
  readout view. Plan 5 mounts a Hyrbricka toast + Returnerad button
  on finish-readout for cards with an open `hired_cards` row.
- **`apps/edge/src/db/schema.ts`** — Phase 1 Drizzle schema. New
  tables follow the same patterns (text PKs / cascade FKs / scrub
  columns). The `competitors.cardNumber` partial unique index pattern
  is reused for `eventor_competitors.si_card` index.
- **`apps/edge/src/ingest/entryImport.ts`** — Transaction + bulk-upsert
  pattern. MIP outbound serializer (Plan 3) and MOP inbound writer
  (Plan 4) follow the same shape.
- **`apps/edge/src/privacy/`** (Phase 1 retention scrubber) — extends
  to scrub `hired_cards.contact_*` after 30 days.
- **`events.local_seq`** monotonic ID — MIP `lastid` reuses it
  directly (D-MIP-2).

### Established Patterns

- **Pure-projection reducers over the event log** (Phase 1 D-12) —
  MIP serialization is essentially a projection over `events` filtered
  by `local_seq > ?`. MOP reception writes ONLY to shadow `meos_*`
  tables (no event_log writes — MOP is mutable mirror state).
- **Conventional Commits + commitlint + lefthook** — Phase 0 baseline,
  Phase 1 carries forward, Phase 2 stays inside.
- **TypeScript strict + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`** — Phase 0 baseline; carry into
  `apps/edge/src/integrations/meos/` and the Eventor cache code.
- **Swedish-first i18n** (Phase 1 D-02) — all new strings authored as
  i18next keys with `sv.json` + `en.json` populated from day one.

### Integration Points

- **WalkupModal → /api/competitors** — extended payload carries
  `hired_card: boolean` and `hired_contact: {name, phone, email, note}`
  when hired. Backend creates a `hired_cards` row in the same
  transaction as the competitor row.
- **ReadoutView → WebSocket** — Phase 1 WebSocket already broadcasts
  card_read events. Plan 5 subscribes to the same channel, queries
  `hired_cards` on each card_read, decides toast presentation.
- **`apps/edge/src/integrations/meos/mip.ts`** (NEW) — Fastify route
  `GET /mip?competition=&lastid=&pwd=`. Queries `events WHERE
  local_seq > ?` and serializes matching `card_bound` events to MIP
  XML. Hooks `hired_cards` for the `<card hired="true">` flag.
- **`apps/edge/src/integrations/meos/mop.ts`** (NEW) — Fastify route
  `POST /mop` (with optional `POST /mop/zip` for gzipped variant).
  Parses incoming `<MOPComplete>` / `<MOPDiff>`, writes to shadow
  `meos_*` tables in a transaction, runs the auto-merge step
  (D-MOP-3).
- **`apps/edge/src/eventor/cache.ts`** (NEW) — Streaming download +
  SQLite write for cachedcompetitors + clubs. Called from bridge boot
  (D-EV-1) and `/api/admin/eventor/refresh` (admin button).

</code_context>

<specifics>
## Specific Ideas

- **Hard deadline:** Wednesday **2026-05-20** (4-klubbs training at
  Stora Tuna OK). 4 days from this discussion.
- **MeOS source available** at `/home/jonas/src/meos/` — verified
  during round 2 discussion that `<classname>` lookup, hired-card
  semantics, and Eventor download endpoint all match Phase 2.0
  assumptions. Future MeOS-protocol questions during Plan execution
  should grep this source rather than guess.
- **MeOS-as-superset philosophy** — where MeOS has a feature, we
  match its observable behavior (hired-card check at finish-readout,
  Eventor cachedcompetitors download). Where MeOS is thin (no return
  tracking, no contact info on rentals), we extend with cleaner
  primitives.
- **Eventor key in `.eventor-env`** (gitignored, commit 7ec8866).
  Loaded on bridge boot (D-EV-1); if missing → Eventor cache is
  disabled, indicator says `Eventor: nyckel saknas`.
- **MIP/MOP polling** — MeOS is the HTTP client for BOTH protocols
  (it polls our `/mip` and POSTs to our `/mop`). FartOL is the HTTP
  server in both cases. This is the inverse of what newcomers expect
  from "MIP = input protocol".
- **Mobile readability** (Phase 1 carry-forward) — Jonas reads on
  mobile. AskUserQuestion / chat replies stay terse. Long content
  goes in CONTEXT.md / PLAN.md / ADRs.
- **MeOS as parallel safety backup** — locked decision #2 (round 1)
  AND D-MOP-3 (round 2) jointly imply: FartOL is primary, MeOS is the
  parachute. Belt+braces, not redundant.

</specifics>

<deferred>
## Deferred Ideas

### Multi-course-per-card, same event (Phase 2.1)

Jonas raised during round 2: "if you run a class like H45 and then
you want to run an open course also you need two cards. If our system
can handle two different courses same event competition that would be
super." This is a real Phase 1 limitation (competitors.cardNumber
unique within a competition) that today's MeOS shares.

Three solution sketches, each non-trivial:
1. Relax the unique index + projection that figures out which course
   matched a given card_read attempt.
2. New `competitor_courses (competitor_id, course_id)` junction; one
   competitor row, multiple registered courses; reducer iterates.
3. Operator-driven "New attempt" button that rebinds the card mid-event.

Deferred to **Phase 2.1** because: hard Wednesday deadline; not a
4-klubbs blocker (existing workaround = register twice with two
cards); designing this properly needs a focused planning cycle and
projection-layer thinking. Document in the parallel-run playbook
that the operator workaround is "register twice with two cards" for
2.0.

### Phase 2.1 carryovers (from round 1)

- **Yjs collaborative editing** (REQ-UI-008) — 4-klubbs scale doesn't
  need it; Phase 2.1 sanctioned competition does.
- **QR-code self-signup public route** — Phase 2.1 stretch; sibling
  todo `.planning/todos/pending/2026-05-15-parent-self-signup-qr-flow.md`
  + `.planning/todos/pending/2026-05-15-tailscale-cloudflare-tunnel-for-self-signup.md`.
- **Eventor entries pull** (REQ-STD-004 read path) — irrelevant for
  4-klubbs; Phase 2.1.
- **Eventor results push** (REQ-STD-004 write path) — keep manual IOF
  XML 3.0 export + Eventor web upload; Phase 2.1.
- **MeOS SendPunch TCP / UDP broadcast** — 2014-era binary protocols
  skipped entirely. MIP+MOP cover every Phase 2.0 use case.
- **Spectator live results page** — Phase 2.1.
- **Bridge crash recovery hardening** beyond D-MOP-3 — Phase 2.1.

### MIP authentication for Phase 2.1

D-MIP-1 chose no-auth for 4-klubbs. Phase 2.1 (sanctioned events,
bigger LAN attack surface) should revisit — likely an env-var `pwd`
check on both MIP and MOP endpoints.

### MeOS-side hired-card visibility on FartOL crash recovery

D-LIM-1: MOP `<cmp>` doesn't carry the hired flag, so MeOS-side
rentals during a FartOL outage won't auto-import. Operator re-enters
on restart. Worth revisiting in Phase 2.1 if it becomes painful — a
custom MIP `<response type="hiredcards"/>` query might work, but
that's speculative (not in the spec we have).

### Reviewed Todos (not folded)

- `.planning/todos/pending/2026-05-15-parent-self-signup-qr-flow.md`
  — Phase 2.1 / 3. Public-facing surface, needs tunnel research first.
- `.planning/todos/pending/2026-05-15-tailscale-cloudflare-tunnel-for-self-signup.md`
  — Phase 2.1 dependency for QR self-signup.
- `.planning/todos/pending/2026-05-16-si-card-write-program-name.md`
  — Phase 3 or 4. Walk-up "write back" UX is a follow-on capability,
  not 4-klubbs MVP.
- `.planning/todos/pending/2026-05-16-stortuna-tuesday-to-wednesday-cleanup.md`
  — Docs cleanup; planner can fold into Plan 6 (ops playbook) or run
  as standalone post-Phase-2.0 PR.
- `.planning/todos/pending/2026-05-16-centralize-event-inserts-via-insertevent-helper.md`
  — Refactor; not phase-bound. Pick up opportunistically.
- `.planning/todos/pending/2026-05-16-perf-*` (4 perf todos) — Phase
  4 / 5 territory; not 4-klubbs scale concerns.
- `.planning/todos/pending/2026-05-14-revisit-thermal-receipt-rendering.md`
  — Phase 3 polish; current Phase 1 path works.

</deferred>

---

*Phase: 2-4-klubbs-mvp*
*Context gathered: 2026-05-16 (round 1) + 2026-05-16 evening (round 2)*
