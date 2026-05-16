---
created: 2026-05-16T15:00:00+02:00
title: Program names + clubs onto SI cards via FartOL (write side of the protocol)
area: hardware,feature
files:
  - packages/sportident/src/SiCard/BaseSiCard.ts
  - packages/sportident/src/SiCard/types/SiCard5.ts
  - packages/sportident/src/SiCard/types/SiCard9.ts
  - packages/sportident/src/SiCard/types/SiCard10.ts
  - packages/sportident/src/SiCard/types/SiCard11.ts
  - packages/sportident/src/SiCard/types/SIAC.ts
  - packages/sportident/src/SiStation/SiMainStation.ts
  - apps/edge/src/si/bridge.ts
  - apps/edge/src/routes/ # new programming endpoint
  - apps/web/src/lib/ # walk-up "write back" UI
source: conversation 2026-05-16 — Jonas asked if we can program names onto cards
---

## Background

The SI `card_holder` field is read-only from FartOL's perspective today: the
Phase 0 library implements `BaseSiCard.typeSpecificRead()` but has no write
counterpart. Clubs that want to program names onto cards use SPORTident
Config+ (free desktop tool, supports all card models).

The hardware itself supports it — BSM7/8-USB master stations expose the
write side of the wire protocol; FartOL just doesn't drive that path.

## Why this might be worth building

| Use case                                                                                                      | Value                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk-up "write back" — after walk-up registration, write the name + class to the card so next read auto-fills | Highest UX win. Clubs with rental fleets recycle cards across members; programming on first use removes that operator burden forever after. |
| Batch-program fleet from competitor list — import roster, plug card, program                                  | Replaces a Config+ session; only marginally useful since Config+ already does this well.                                                    |
| PII scrub at retirement — write empty `card_holder` before reselling/recycling a card                         | REQ-PRIV adjacent. Edge-case but cleanly bounded.                                                                                           |

## Why we haven't built it yet

- Out of Phase 1 scope; not part of "single-laptop training MVP".
- Clubs have Config+ already; the redundant-tool argument is real.
- Card-write protocol is non-trivial — different command IDs, different page
  layouts per card model, different handshake (the card stays in the master
  station longer during write).

## Technical scope (if we do it)

### packages/sportident extensions

- Add `BaseSiCard.typeSpecificWrite(station, patch)` mirror of
  `typeSpecificRead()`. Per-subclass overrides for SiCard5, SiCard9, SiCard10,
  SiCard11, SIAC — each writes to its own card_holder block layout.
- Add the write-side commands to `SiMainStation` (likely a new method that
  wraps the same `sendMessage` queue we already have, with different
  command code constants).
- Bench-verify: same SI5/9/10/SIAC fixtures Jonas already has, plus a
  write-then-read roundtrip test against a known card.

### apps/edge

- New REST endpoint, e.g. `POST /api/competitors/:id/program-card` —
  writes the bound competitor's name + club to the currently-inserted
  card. Returns 409 if no card present, 422 if card chip doesn't support
  writing.
- The bridge's existing card-insert lifecycle ensures one card at a time;
  the write command runs while the card is still seated.
- Auth surface: write commands MUST be gated to localhost-bound operator
  surface only (same threat model as `/api/__dev` endpoints — never
  exposed to a LAN client).

### apps/web

- Walk-up modal: after successful registration, optional "Programmera kort"
  button → POST programming endpoint. Operator sees confirmation toast.
- Settings: "Program SI cards on walk-up" toggle (off by default — clubs
  using rental fleets opt in).

## Phase placement

Speculative — proposed Phase 3 or 4:

- **Phase 3** (children's finish, public engagement): walk-up write-back
  fits if clubs want kids' cards to "remember" the name across sessions.
- **Phase 4** (multi-arena, radio controls): batch fleet management for
  large multi-day events becomes more valuable.

Park here until either: (a) Jonas hits a club that explicitly wants this,
or (b) a Phase 2/3 user-story can't be satisfied without it.

## Reference

- SPORTident Config+ (the existing tool):
  https://www.sportident.com/products/configuration/
- Upstream `sportident.js` had partial write support; the Phase 0 port
  deliberately scoped to read-only. Check git blame on
  `packages/sportident/src/SiCard/types/*.ts` for the read-only commit
  rationale.
