---
created: 2026-05-15T00:00:00+02:00
title: Parent self-signup flow via QR code (NOT the receipt-QR feature)
area: ux
files:
  - apps/edge/src/routes/competitors.ts
  - apps/web/src/lib/screens/HomeView.svelte
  - apps/web/src/lib/screens/NewCompetitionWizard.svelte
  - .planning/ROADMAP.md
---

## Problem

Live training events frequently have a queue of parents arriving with
kids who all need to be signed up the same evening. Today the only
path is the operator typing each Name + Class into the walk-up modal
while a queue grows. This is the single most stressful part of
running a training session per Jonas (2026-05-15).

**This is a different feature from REQ-UI-005 "QR receipt".** REQ-UI-005
is about printing a QR code on the thermal receipt that links to a
results page. THIS is about giving parents a QR sticker / poster they
scan to open a self-signup form on their phone, pick a class, and
register their kid — all without the operator typing.

## Solution

Conceptual flow:

1. Operator opens a competition, hits "Sign-up kiosk" or similar — UI
   generates a QR code containing a URL like `http://<laptop-hostname-or-tunnel>/signup/<comp-id>?token=<short-lived>`.
2. Parent scans QR with their phone → mobile-optimised page with:
   - Name (required)
   - Class (dropdown, only classes from this competition)
   - Club (autocomplete or "no club")
   - Card number (optional — leave blank if rental Bricka)
   - Consent checkbox
3. Submit → server creates competitor row with `consent_status='explicit'`.
4. Operator-side: a "Pending signups" list ticks up; new entries are
   either auto-accepted or operator-confirmed.
5. The same flow could mint a single-use rental Bricka assignment if
   the operator has a pool of rental cards configured.

Open design questions:

- **Auth.** Token in URL (short-lived JWT? simple HMAC?) to prevent
  signup spam from outside the venue.
- **Class restriction.** Some classes (H21, D21) probably aren't open
  for parent-driven kid registrations. Per-class `selfSignupAllowed`
  flag? Or operator-curated whitelist per competition?
- **Reconciliation.** What if the operator and the parent register
  the same kid simultaneously? Need a dedup window or merge UI.
- **Offline.** What if parent's phone has no signal but is on the
  laptop's WiFi AP? Same-LAN happy path should Just Work via the
  laptop's hostname.

## No-cloud DNS / public reachability

See sibling todo `2026-05-15-tailscale-cloudflare-tunnel-for-self-signup.md`
for the networking research that unblocks this feature outdoors where
the laptop has no inbound port.

## Acceptance

- Roadmap entry exists (Phase 2 or 3) with a one-paragraph user story.
- A PRD/spec doc captures the auth model, class restrictions, and
  reconciliation rules.
- This todo is referenced from Roadmap so future planning sessions
  pick it up.

## Priority

High operational pain point — Jonas flagged it as "maybe the most
stressful thing" about running training sessions. Belongs in the
next planning cycle, not this MVP phase.
