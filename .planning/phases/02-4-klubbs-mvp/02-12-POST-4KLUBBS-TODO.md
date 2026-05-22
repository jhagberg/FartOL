# Post-4-klubbs todo — gaps surfaced 2026-05-20

**Status:** queued for Phase 2.1.
**Author:** jonas, 2026-05-21.
**Provenance:** 4-klubbs 2026-05-20 ran on MeOS, not FartOL. Too many
late-binding pieces were missing for FartOL to be primary system. This
doc captures the gaps so Phase 2.1 closes them before the next real
training.

## Context

The Phase 2.0 success criteria (`ROADMAP.md` §Phase 2.0) targeted the
2026-05-20 4-klubbs training. The PR (#20) landed in time but lacked
several pieces only visible at the registration desk on race day:

- No way to load / generate a **start list** before the race
- No **start time** column on competitors — every runner shows as "—"
- No **"lottat starttid"** (drawn start times) flow for forskott / pre-
  drawn starts the way MeOS handles them
- No **"kvar i skogen"** view (still-in-forest tally from check-unit
  punches) — operator can't tell who hasn't punched-finish yet without
  cross-referencing a printed start list

These are not bugs in the shipped Phase 2.0 code — they are scope that
was never planned. The 4-klubbs format leaned on MeOS's lottning +
start-list + arena-finish features that FartOL doesn't implement.

## Phase 2.1 scope items

### 1. Create start list (lottning) — **primary feature, MeOS parity**

This is the main missing piece. MeOS handles the full create-edit-publish
loop in-app (see `oEvent::drawList` / `oClass::drawList` in
`/home/jonas/src/meos/code/oEvent.cpp` for prior-art on the algorithm).
FartOL should match that level of functionality before relying on
external imports.

- Schema: `competitors.start_time_ms INTEGER NULL` (epoch ms or
  competition-relative ms — pick after looking at IOF XML 3.0
  `<StartTime>` semantics)
- Schema: `classes.first_start_ms INTEGER NULL` +
  `classes.start_interval_sec INTEGER NULL` per class
- Operator UI: per-class "Lotta start" panel with:
  - First-start clock (HH:MM)
  - Start interval (60 s / 90 s / 120 s / custom)
  - Vakanta startplatser (number of empty slots reserved for late adds)
  - Mode: pure random / klubb-blocking / seeded-by-rank
- Algorithm: random-permutation lottning within class, respecting:
  - **Klubb-blocking rule** — do not place two from same klubb
    adjacent (MeOS calls this `pairwiseDifferent`)
  - **Vakanta startplatser** — gaps for late entries, evenly distributed
  - **Seeded mode** (Phase 2.2+) — top-N ranked runners get late slots
- Output: writes `competitors.start_time_ms` for every row in the class
- Re-lotta: wipes prior times for that class only; preserves manual
  edits to other classes
- Manual edit: per-row inline "ändra starttid" so the operator can shift
  a single runner without re-lotta-ing the class
- Export: round-trip through IOF XML 3.0 `<StartList>` so MeOS /
  Eventor can consume what FartOL drew
- Receipt: thermal print start-list per class for the secretariat board

### 2. Start list import (secondary)

For events where the start list is drawn elsewhere (Eventor for
sanctioned competitions, or another club's MeOS instance).

- Importer: accept IOF XML 3.0 `<StartList>` document; map to
  `competitors.start_time_ms` keyed on (class, name) or eventor
  person_id
- Read-only view: `/competition/:id/start-list` sorted by start_time +
  class

### 3. Start-time column in registration + readout views

- Walk-up: show start time (or "—") in the LatestReadCard sidebar
- Registration desk: column in the queue + a "starttid om HH:MM" relative
  ticker when start_time_ms is set and in the future
- Readout: optional "vänteande" panel listing competitors with
  start_time_ms in the next 5 min — used by speaker / arena-finish
- Late-start handling: if `actual_start > start_time + tolerance`,
  flag for operator (decisional — not auto-DQ)

### 4. "Kvar i skogen" — check-unit backup readout

**This is the high-value safety feature.** At the end of a race the
arena needs to know who is still out (safety call to alert the rescue
team). Today the only way is to count printed receipts vs printed
start list.

**Approach:**

- The **SI check unit** (typically a BSF8 set to mode 0x02
  "Control" with the read-after-punch flag) accumulates a punch for
  every card that has passed through it at start
- pcprog5.pdf §3 + `.reference/pcprog5-v11-2018-10-15/BSx7_8_readbackup.txt`
  document the **backup memory readout** (instruction 0x81 GET_BACKUP +
  0x83 GET_SYS_VAL memory pointer); 128-byte blocks; ring-buffer
  semantics with memory-overflow flag
- The same SPORTident binary protocol our existing
  `packages/sportident/` already speaks — **no new hardware code, just
  a new operation** on `SiMainStation`

**Implementation sketch:**

1. New `packages/sportident/src/SiStation/readBackup.ts` — calls 0x83
   to fetch the backup-memory pointer + overflow flag, then loops
   `GET_BACKUP (0x81)` in 128-byte chunks, yielding `{ cardNumber,
punchTime }` records
2. New edge endpoint `POST /api/checkunit/snapshot` — operator plugs
   the check unit into the bridge, posts to this route; route opens
   the serial port, runs `readBackup`, returns the card-number set
3. New view `/competition/:id/kvar-i-skogen` — diff `check_set MINUS
finish_set` (where finish_set = competitors with status OK / MP /
   DNF / DQ / MAX in the projection); display as a sorted list with
   name + klubb + class + (start_time if known) + elapsed-since-start
4. Refresh button — re-runs the snapshot; no auto-poll (the unit
   has to be physically connected)
5. Safety-call summary: count + comma-separated names → copy-to-
   clipboard for the räddningstjänst phone call

**Estimate:** ~1 day for the bridge endpoint (the protocol is fully
covered by the SPORTident-supplied docs); ~0.5 day for the view; +0.5
day for bench-testing against a real BSF8 with a few stamped cards.

**Reference:**

- `.reference/pcprog5-v11-2018-10-15/pcprog5.pdf` §3 (do not commit;
  manufacturer-provided under a "do-not-redistribute" clause)
- `.reference/pcprog5-v11-2018-10-15/BSx7_8_readbackup.txt`
- Existing `packages/sportident/src/constants.ts` already defines
  `Command.GET_BACKUP = 0x81` and `Command.GET_SYS_VAL = 0x83`
- See parallel feasibility report on dropping the upstream MIT port
  (verdict: hybrid — keep the port, add `readBackup()` as a new method,
  ~1 day; no rewrite needed)

## Out of scope for 2.1 (Phase 2.2 / 3)

- Automatic late-start DQ
- "Drop-in" lottning during the race (insert a runner with a free start
  slot)
- Multi-leg / relay start lists
- Spectator-facing start list page
