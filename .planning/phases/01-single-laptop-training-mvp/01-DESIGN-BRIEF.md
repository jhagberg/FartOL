# Phase 1 — Design Brief (for Claude Design / claude.ai)

**Purpose:** Paste/upload this into Claude Design on claude.ai to drive
visual exploration for the Phase 1 UI before locking UI-SPEC.md.
Bring chosen screens back into `01-SKETCHES/`, then run
`/gsd-ui-phase 1` to lock the design contract.

---

## 1. Brief

Single-laptop **orienteering training MVP** (working name: fartOLa).
Target event: StorTuna OK Tuesday training, **20–40 starters**,
**no internet required**, runs entirely on one Linux laptop.

- **Stack (locked):** SvelteKit PWA (`adapter-static`, SPA mode) +
  Fastify backend on the same laptop. localhost:5173 in dev,
  one `fartola` binary in prod. Component library not yet chosen —
  Skeleton or shadcn-svelte are the candidates.
- **Locale:** Swedish primary (`sv` default), English secondary (`en`).
  i18next-driven; all user-facing strings are keys from day one.
- **Operator context:** Club volunteers, stressed at the readout
  table, sometimes glancing on mobile, sometimes on a 13" laptop in
  bright sun. MeOS is what they know today — anchor on MeOS UX where
  in doubt.
- **Hardware in scene:** SPORTident BSM7/8-USB reader at the table
  (cards beep on read via Phase 0 bridge). Star TSP143 / Epson
  TM-T20 / Brother PJ-7 thermal printer beside it.

---

## 2. Four key screens to design

### 2.1 New-competition wizard (REQ-UI-002, REQ-EVT-CMP-001/002)

**Three clicks. That is the bar.**

1. **Click 1 — "Ny tävling" / "New competition"**
   Inline modal: name, date (defaults to today).
2. **Click 2 — "Importera bana" / "Import course"**
   File picker accepts Purple Pen `.xml` AND IOF XML 3.0 CourseData.
   Auto-creates classes from the imported file.
3. **Click 3 — "Starta avläsning" / "Start readout"**
   Auto-detects connected BSM7/8 reader; status light goes green
   on station handshake. Lands on the Readout view (2.2).

Design the wizard surface (full-screen vs sidebar vs modal stack)
and the empty/loading/error states for the file-import step.

### 2.2 Readout view (REQ-UI-003, REQ-EVT-CMP-005..007)

The **primary operator surface during the event**. Card reads land
here in real time over WebSocket.

Information to display per card read:
- Card number (SI number, large).
- Matched competitor (name, class) — OR walk-up state if unmatched.
- Punch sequence vs expected course: ✓ ✓ ✓ ✗ — missing controls
  highlighted, out-of-order flagged.
- Split times.
- Result line (status: OK / MP / DNF, time, place in class).
- "Print receipt" action (thermal); receipt confirmation echoes
  what just printed.

Connection state to the reader station is always visible (green dot
= station online + heartbeat; red dot = disconnected).

### 2.3 Live results page (REQ-EVT-CMP-007)

Public-facing within the LAN. Operators show this on a second
screen or projector during the training. Competitors glance at it.

- Filter / tabs by class.
- Per row: place, name, club, time, status (OK / MP / DNF).
- Live updates as cards are read (no manual refresh).
- Should look fine on a 13" laptop AND on a projector at 1080p.
- High-contrast variant for bright sunlight (REQ-UI-007).

### 2.4 Walk-up registration modal (REQ-EVT-CMP-004)

Triggered when an unknown SI card is read at the readout table.
**The operator already has the card in the reader** and the runner
in front of them — the modal must not block other readouts.

Fields:
- Name (required).
- Club (free-text + autocomplete from past entries).
- Class (dropdown of imported classes for this competition).
- Card SI (pre-filled from the read; editable in case of misread).

On save: competitor is created, the card is bound, and the readout
projection rerenders from the same event log.

---

## 3. Visual anchors / constraints

- **Mobile readability:** Jonas reviews from mobile. Body text
  ≥ 16 px, large hit targets (≥ 44 px), no 12 px gray-on-white
  (REQ-UI-007).
- **MeOS UX bar:** Look up "MeOS Open Orienteering" — that is the
  baseline operators know. Don't be *too* clever; be familiar.
- **Thermal receipt mirror:** The on-screen "print confirmation"
  should visually echo the thermal receipt layout
  (split list, status, control sequence).
- **Status colors:** green = OK, amber = MP, red = DNF, gray =
  pending / waiting on finish.
- **i18n-ready:** Every label is a key. Don't hard-code "Print" or
  "Skriv ut" — leave room for both ("Skriv ut kvitto" can be 30%
  wider than "Print receipt").

---

## 4. Inline requirements (so you don't have to paste REQUIREMENTS.md)

### Competition workflow (v1, Phase 1)

- **REQ-EVT-CMP-001** — Create a new competition: name, date,
  classes, courses. Persistable to local SQLite.
- **REQ-EVT-CMP-002** — Import a Purple Pen XML course file.
  Auto-create classes if not already present.
- **REQ-EVT-CMP-003** — Import IOF XML 3.0 EntryList for start-list
  registration. Match competitors to classes.
- **REQ-EVT-CMP-004** — Manual entry: register a competitor at
  readout time who was not pre-entered (walk-up registration).
- **REQ-EVT-CMP-005** — Auto-assign a punched card to its matching
  course when the start list has the SI number; fall back to
  operator confirmation otherwise.
- **REQ-EVT-CMP-006** — Mark DNF / MP based on missing or
  out-of-order punches against the expected course.
- **REQ-EVT-CMP-007** — Display live results page (HTML) on
  localhost during the event.
- **REQ-EVT-CMP-008** — Export final results as IOF XML 3.0
  ResultList. Validate against XSD before saving.

### UI (v1, Phase 1)

- **REQ-UI-001** — PWA on Chrome desktop and Chrome Android.
  Tablet form factor must work.
- **REQ-UI-002** — Three-click new-competition flow (MeOS UX bar).
- **REQ-UI-003** — Readout view: live card-read feed, course match,
  immediate results. No page reload.
- **REQ-UI-004** — Thermal paper receipt with splits via ESC/POS
  (Star TSP143 / Epson TM-T20 / Brother PJ-7).
- **REQ-UI-005** — QR-code receipt (DEFERRED to Phase 2 per D-01;
  thermal is the Phase 1 receipt surface).
- **REQ-UI-006** — Swedish primary, English secondary. i18next
  from day one.
- **REQ-UI-007** — Accessibility: bright-sunlight readable on 13"
  laptop, large hit targets, no 12 px gray-on-white.

### Deferred (do NOT design for Phase 1)

- Multi-operator simultaneous editing / Yjs presence (REQ-UI-008).
- Speaker dashboard, big-screen overlay, kids' finish screen,
  SMS / email (REQ-UI-009..012).
- QR-receipt (REQ-UI-005) — deferred to Phase 2.

---

## 5. Phase 1 decisions that constrain UI (excerpt from CONTEXT.md)

- **D-13** Live transport = WebSocket. Readout view subscribes to
  `readout:<competitionId>`; results page to `results:<competitionId>`.
  Reconnection handled by a small client wrapper.
- **D-14** PWA depth = manifest + installable icons. No service
  worker / offline asset cache in Phase 1 (bridge IS the server).
- **D-15** Three-click new-competition: Create → Import course →
  Ready. The three-click contract is literal.

Full context: `.planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md`.

---

## 6. After Claude Design

1. Save chosen screens (PNG / Figma export / HTML) into
   `.planning/phases/01-single-laptop-training-mvp/01-SKETCHES/`.
2. Note in the file's filename which screen it is
   (`readout-v3.png`, `walkup-modal-final.png`, etc).
3. Run `/gsd-ui-phase 1`. The UI researcher will read CONTEXT.md
   AND any sketches present in `01-SKETCHES/`, then produce
   `01-UI-SPEC.md` — the design contract the planner consumes.

---

*Phase: 1-Single-laptop-training-mvp*
*Brief authored: 2026-05-13*
