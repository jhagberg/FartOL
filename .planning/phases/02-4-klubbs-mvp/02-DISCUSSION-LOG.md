# Phase 2: 4-klubbs MVP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or
> execution agents. Decisions are captured in 02-CONTEXT.md — this log
> preserves the alternatives considered.

**Date:** 2026-05-16 (round 2 — evening)
**Phase:** 02-4-klubbs-mvp
**Areas discussed:** MIP server design, Eventor runner-cache, MOP receiver design, Hyrbricka model + UX

Round 1 (earlier 2026-05-16) produced the original 02-CONTEXT.md with 7
locked decisions. Round 2 resolved the 5 open questions from that file
plus 9 additional implementation details surfaced during scout of the
existing code and review of the MeOS source.

---

## MIP server design

| Option                 | Description                                            | Selected |
| ---------------------- | ------------------------------------------------------ | -------- |
| No auth (4-klubbs LAN) | Closed club LAN, no pwd header. Saves config friction. | ✓        |
| pwd header from env    | Belt+braces. fartOLa reads MIP_PASSWORD from .env.     |          |
| pwd opt-in             | Default off; admin tweak flips on mid-event.           |          |

**User's choice:** No auth (D-MIP-1).
**Notes:** Phase 2.1 sanctioned events will revisit.

---

| Option                     | Description                                       | Selected |
| -------------------------- | ------------------------------------------------- | -------- |
| Reuse events.local_seq     | Zero new state; query events WHERE local_seq > ?. | ✓        |
| Dedicated mip_outbox table | Cleaner separation; doubles writes.               |          |
| Per-table cursors          | Most flexible; two cursors to keep monotonic.     |          |

**User's choice:** Reuse events.local_seq (D-MIP-2).

---

| Option                         | Description                                | Selected |
| ------------------------------ | ------------------------------------------ | -------- |
| Just `<entry>` on bind         | Smallest surface; stale on card-replace.   |          |
| Entries + card-replace updates | Re-emit on UPDATE; idempotent via extId.   | ✓        |
| Entries + cards (belt+braces)  | Double wire-traffic; violates decision #3. |          |

**User's choice:** Entries + card-replace updates (D-MIP-3).
**Notes:** Pros/cons explanation requested before answer.

---

| Option                                    | Description                                                                             | Selected |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| classname + extId (MeOS source verified)  | Falls back to name lookup at onlineinput.cpp:994-996; extId enables idempotent re-emit. | ✓        |
| MOP-first bootstrap (waterfall map build) | Plan 4 ships before Plan 3; bootstrap latency.                                          |          |

**User's choice:** classname + extId (D-MIP-4).
**Notes:** User asked "can't we use MOP to get class IDs?" — investigated, found MeOS source confirms name-lookup works, eliminating the dance entirely.

---

## Eventor runner-cache

**Background:** Round 1 deferred Eventor scope to a parallel agent. That
agent's smoke-test (commits 80d9ab4 + 97b22ac) landed
`/api/export/cachedcompetitors` as the right endpoint (national,
252 919 competitors, 96 918 SI cards). Round 2 picked up the operational
gray areas.

| Option                                    | Description                                                            | Selected |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Nightly cron only                         | Cron handles refresh; no operator-driven path.                         |          |
| Cron + admin button                       | Combines automatic + on-demand.                                        |          |
| Manual-only (no cron)                     | Operator-driven only.                                                  |          |
| **Upstart on bridge boot + admin button** | User free-text. Bridge is competition-only; cron is wrong abstraction. | ✓        |

**User's choice:** Upstart on bridge boot + admin button (D-EV-1).
**Notes:** User pointed out bridge isn't always-on, so cron doesn't fit. Reframed to on-boot + admin.

---

| Option                         | Description                                           | Selected |
| ------------------------------ | ----------------------------------------------------- | -------- |
| Re-fetch on every bridge start | Simple; ~30s slower startup.                          |          |
| Re-fetch if cache > 7 days     | Survives across competitions; admin button overrides. | ✓        |
| First-time bootstrap only      | Conservative; risks staleness if operator forgets.    |          |

**User's choice:** Re-fetch if cache > 7 days (D-EV-2).

---

| Option                       | Description                                                 | Selected |
| ---------------------------- | ----------------------------------------------------------- | -------- |
| Warn + run with what we have | Honors REQ-OPS-001 no-internet; cache-or-firmware fallback. | ✓        |
| Block until reachable        | Strict; breaks no-internet-required.                        |          |
| Silent fallback              | Simplest code; worst UX.                                    |          |

**User's choice:** Warn + run (D-EV-3).

---

## MOP receiver design

| Option                                    | Description                                   | Selected |
| ----------------------------------------- | --------------------------------------------- | -------- |
| Shadow meos\_\* tables                    | Clean separation; reconciliation is explicit. | ✓        |
| Project into competitors with source flag | Single table; conflict-prone.                 |          |
| Append-only meos_events table             | Matches event-sourcing; heavy for MVP.        |          |

**User's choice:** Shadow meos\_\* tables (D-MOP-1).

---

| Option                     | Description                           | Selected |
| -------------------------- | ------------------------------------- | -------- |
| TRUNCATE + INSERT in txn   | Matches MOP spec; partial-parse safe. | ✓        |
| Soft-delete + UPSERT       | Preserves history; more columns.      |          |
| Snapshot table per receive | Full history; excessive for MVP.      |          |

**User's choice:** TRUNCATE + INSERT in txn (D-MOP-2).

---

| Option                        | Description                                           | Selected |
| ----------------------------- | ----------------------------------------------------- | -------- |
| Auto-merge into competitors   | Crash-recovery 'just works'; toast notifies operator. | ✓        |
| Stage for operator review     | Safer; manual step every restart.                     |          |
| Read-only mirror, never merge | Defeats crash-recovery purpose.                       |          |

**User's choice:** Auto-merge into competitors (D-MOP-3).
**Notes:** Matches locked round-1 decision #2 (MeOS-registrations-during-outage flow back via MOP).

---

| Option                 | Description                                       | Selected |
| ---------------------- | ------------------------------------------------- | -------- |
| Always-on, no auth     | Mounts whenever bridge runs; consistent with MIP. | ✓        |
| Per-competition toggle | Operator must remember to flip on.                |          |
| Always-on with pwd     | Slight friction; defends rogue LAN devices.       |          |

**User's choice:** Always-on, no auth (D-MOP-4).

---

## Hyrbricka model + UX

| Option                                     | Description                                      | Selected |
| ------------------------------------------ | ------------------------------------------------ | -------- |
| Defer to Phase 2.1 (multi-course-per-card) | Wednesday-deadline reality; document workaround. | ✓        |
| Include via course-junction                | Adds ~1d; touches schema, walk-up, projection.   |          |
| Quick hack: re-bind mid-event              | Cheaper but brittle.                             |          |

**User's choice:** Defer to Phase 2.1.
**Notes:** Side-question raised by user during Hyrbricka discussion — "if our system can handle two different courses same event competition that would be super." Real Phase 1 limitation; deferred because Wednesday deadline.

---

| Option                                      | Description                                   | Selected |
| ------------------------------------------- | --------------------------------------------- | -------- |
| Junction with contact info inline           | Card-centric; self-contained PII.             | ✓        |
| Add phone/email + hired_card to competitors | Reuses scrub path; fuzzy on card-swap.        |          |
| Separate rental_contacts + hired_cards      | Cleanest privacy separation; over-normalised. |          |

**User's choice:** Junction with contact info inline (D-HB-1).
**Notes:** User initially asked "leaning toward option 1, but check MeOS first". MeOS source (`oEvent.h:930-934`, `TabSI.cpp:3272`) confirms MeOS uses flat `set<int>` per event — no contact info, no return tracking. D-HB-1 is a strict superset.

---

| Option                                      | Description                                 | Selected |
| ------------------------------------------- | ------------------------------------------- | -------- |
| Button at finish-readout (+ admin backstop) | One-tap; matches physical moment of return. | ✓        |
| Admin page only                             | End-of-event batch; no per-card moment.     |          |
| Both: button + admin page + reminder banner | Most aware; three surfaces.                 |          |

**User's choice:** Button at finish-readout + admin backstop (D-HB-2).

---

## Claude's Discretion

- Splash-vs-background UI for first-time Eventor download (Plan 1).
- ADR-0009 timing (Plan 1 task 0 vs separate sibling commit).
- Swedish toast wording for all new surfaces.
- Empty-MIP-poll response shape.
- Exact UPDATE field set that triggers MIP `<entry>` re-emit (D-MIP-3).
- Branch rename `gsd/phase-2.0-4-klubbs-mvp` (cosmetic).

## Deferred Ideas

- **Multi-course-per-card same event** → Phase 2.1. Real Phase 1
  limitation; user-flagged as "super" if supported. Defer because
  Wednesday deadline + needs projection-layer thinking.
- **MIP authentication** → Phase 2.1. D-MIP-1 chose no-auth for the
  closed 4-klubbs LAN; sanctioned events with bigger attack surfaces
  should add pwd checks.
- **MeOS-side hired-card visibility on fartOLa crash recovery**
  (D-LIM-1) → Phase 2.1. MOP `<cmp>` doesn't carry the hired flag, so
  rentals marked in MeOS during outage need manual re-entry on
  restart. Documented in the parallel-run playbook.
- All round-1 Phase 2.1 carryovers (Yjs, QR self-signup, Eventor
  entries pull, Eventor results push, MeOS SendPunch/UDP, spectator
  results page, bridge crash hardening) remain deferred per the
  round-1 02-CONTEXT.md scope decisions.
