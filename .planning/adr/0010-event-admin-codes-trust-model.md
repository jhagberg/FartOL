---
status: proposed
date: 2026-05-17
decision-makers: [Jonas Hagberg]
consulted: [Phase 2.1 planning session, Plan 02-07 settings UI implementation]
informed: []
---

# Event admin codes — minimal auth for mobile sekretariat-helpers

## Context and Problem Statement

Phase 2.0 deployed fartOLa at the 4-klubbs onsdagsträning with
`--bind-host 0.0.0.0 --allow-lan` so the MeOS laptop and the
registration-desk operator could both reach the bridge over the club
Wi-Fi. That posture exposes the FULL sekretariat surface
(`/competition/:id/registration`, walkup modal, `POST /api/competitors`,
DNF, edit, queue advance) to **anyone on the same Wi-Fi**. At a
training session that's everyone in the parking lot — including the
runners themselves, parents waiting for kids, the dog-walker on the
adjacent trail with their phone in pocket.

Phase 2.1 expands the operator model from "one person on the desk
laptop" to "one operator + 2-5 helpers with phones doing walk-up
registration in parallel". We need a way to let trusted helpers add
runners without (a) exposing the surface to everyone on the LAN, and
(b) the operational overhead of provisioning per-person accounts the
day before a training session.

The use case is small-club training events. The operator knows the
helpers by name, can shout a code across the parking lot, and trusts
all of them equally. There is no business need for per-helper audit
trails or role separation — if a helper enters a wrong runner, the
operator fixes it in person.

This ADR locks in the auth model. The implementation lives in Plan
02-08.

## Decision Drivers

- **REQ-OPS-003** (new) — sekretariat-helpers can register runners
  from their phones without installing software or making accounts.
- **REQ-OPS-001** — single-binary install, no internet required at
  event time (rules out OAuth, SSO, hosted IAM).
- **REQ-PRIV-002** — 30-day PII retention; the auth artifacts
  (event_codes, signing secret) live in the same SQLite DB that gets
  scrubbed at the same cadence.
- **ADR-0008** — single-user laptop trust model; full-disk encryption
  is the recommended mitigation for laptop loss/theft.
- **Operator UX gravity** — at a training session the operator's hands
  are busy (BSM reader + walkup modal + handing out hyrbrickor). Any
  auth scheme that requires the operator to spend > 30 s onboarding a
  helper will get bypassed — back to `--allow-lan` no-auth.
- **Helper UX gravity** — helpers bring their personal phones. They
  haven't installed anything, haven't visited the page before, and the
  page must look correct on the first tap. iOS Safari is the worst-
  case browser; Chrome on Android the typical case.
- **Public-internet escape hatch** — Phase 5 (O-Ringen scale)
  eventually wants the bridge reachable beyond the local LAN; the
  decision MUST make explicit what stops working then so the future
  work has a clear gate.

## Considered Options

### A. No auth — keep `--allow-lan` open (status quo)

The Phase 2.0 default. Anyone on the LAN can do anything.

**Rejected.** Works only for the trust model where the LAN itself is
the security boundary (no untrusted devices on the same Wi-Fi). A
training session at a public parking lot breaks that assumption: the
club's Wi-Fi is open or has the WPA2 key shared on a printed sign.

### B. Per-user accounts with username + password

Standard auth: helpers get a username, set a password, log in. Could be
backed by SQLite users table, bcrypt hashes, session cookies.

**Rejected** for the training-event use case. Reasons:

- Onboarding cost — operator must create N accounts and distribute
  credentials before the event. Helpers must remember a password they
  set 3 months ago for the prior training session.
- Password recovery — a forgotten password at 17:25 with helpers
  arriving creates a worse outage than open LAN. We don't want to
  build email-reset.
- Audit trail — none of the data the system collects benefits from
  per-user attribution (the runner record doesn't care who typed it
  in; the operator handles disputes face-to-face).
- Right answer for Phase 5 (sanctioned competition with paid
  sekretariatschef), wrong answer for training events.

Keep in the back pocket for Phase 5+; the per-user model becomes the
right primitive when audit trails matter for federation submission.

### C. Shared event code + signed cookie (CHOSEN)

Operator generates a short shared code per competition (`sänkan-127`).
Helper types it on `/access`, server validates against the
`event_codes` table, server sets a signed HMAC cookie scoped to the
competition_id. The cookie is a bearer credential for all subsequent
write requests; revoked when the operator revokes the code, expires
when the code expires (default `competition.date + 24h`).

**Chosen.** Trade-offs in the next section.

### D. mTLS / device pairing

Helpers' devices pair with the bridge (QR-scan + key exchange), the
bridge whitelists the device's cert. Subsequent requests are authed
via the cert.

**Rejected** for the training-event use case. Reasons:

- iOS Safari does not gracefully support client cert installation
  without a configuration profile (signed by Apple). Operationally
  impossible on a typical helper's phone.
- Mistake-cost is high: revoking a paired device is a JSON edit.
- Buys properties we don't need (non-repudiation, per-device audit).

Right answer for Phase 6+ if fartOLa ever ships to clubs with strict
device management requirements.

### E. Rely on Wi-Fi WPA2-PSK as the security boundary

"The Wi-Fi password IS the auth." Don't add any application-layer
auth.

**Rejected.** Two problems:

1. The whole reason this ADR exists is that the LAN trust model is
   too broad — even on a WPA2 network everyone who knows the password
   can hit the sekretariat surface.
2. Many small clubs run open Wi-Fi at training events specifically to
   make hyrbricka registration easier for visitors. The premise
   doesn't hold.

## Decision Outcome

**Chosen option: C — shared event code + signed cookie.**

Encoded as `<word>-<NNN>` where:

- `word` ∈ `EVENT_CODE_WORDS` — a LOCKED 35-entry curated wordlist
  drawn from SOFT 2024 kontrollbeskrivningar (definite-article form,
  1-2 syllables, distinct consonants, no homophones, no compounds,
  no generic words). See Plan 02-08 Task 1 for the exact list and
  source PDF.
- `NNN` ∈ `[100..999]` — 3-digit integer, NEVER zero-padded. The 100
  floor is deliberate: it makes every spoken number exactly 3 distinct
  syllables (`fyra-fem-sex` or `fyrahundrafemtiosex`) instead of the
  failure mode `dungen-noll-noll-sju` where listeners mishear the
  leading nolls and type the wrong code.
- Dash separator is mandatory in both stored form and input: gives a
  clear word boundary when shouted (`dungen STRECK fyra-fem-sex`) and
  in the input box (avoids ambiguous `dungen 456` space-as-separator
  parses).

**Total entropy:** 35 × 900 = **31 500 combinations ≈ 14.9 bits.**

**Cookie:** HMAC-SHA256-signed payload
`{ cid: <competition_id>, exp: <ms>, iat: <ms>, v: 1 }`. Server-side
secret auto-generated via `crypto.randomBytes(32).toString('hex')` on
first `/event-codes` write and persisted in the `config` table as
`event_code_signing_secret` (config-only, no env-var override —
matches the rationale that this is a closed-LAN secret not meant for
operator handling).

**Gate:** Fastify preHandler hook on the write surface:

- `POST /api/competitors`
- `POST /api/competitors/from-wizard`
- `PATCH /api/competitors/:id`
- `POST /api/competitors/:id/dnf`
- (others added as Phase 2.1 expands)

**Localhost bypass:** requests with `req.ip` ∈ `{127.0.0.1, ::1,
::ffff:127.0.0.1}` skip the cookie check entirely. The operator on
the desk laptop is always allowed — same trust model as the FARTOLA_DEV
admin routes.

**Rate limit:** per-IP token bucket on `POST /access`:

- 10 attempts per 60 s window
- After 5 consecutive failures: exponential backoff (1 → 2 → 4 → 8 →
  16 → 32 → 60s cap)
- In-memory map, cleaned every 5 minutes

## Consequences

### Positive

- **Helper onboarding is a single typed code.** From the helper's
  point of view: open URL → type `sänkan-127` → land on
  `/registration`. No app install, no account, no password.
- **Operator onboarding is one button click.** "Generera kod" in
  `/installningar` → kod modal pops with copy button → operator SMSes
  or shouts it.
- **Per-event natural rotation.** Code expires 24h after
  `competition.date` by default. No leaked-from-last-season scenarios.
- **Blast radius is bounded to the ADD surface.** A code cannot
  delete, edit other operators' work, export PII, modify settings,
  hit `/api/__admin/*`, or touch MIP/MOP. Even a fully-compromised
  helper account does limited damage.
- **No new infra dependencies.** Pure SQLite + HMAC + a Fastify
  cookie plugin (`@fastify/cookie`, ~50 KB).

### Negative

- **15 bits of entropy is weak in the absolute sense.** Anyone who can
  bypass or saturate the rate limit (e.g., from a botnet of distinct
  IPs) can brute-force the code space in hours. This is the explicit
  trade-off for memorability — every bit shaved off the entropy is a
  bit added to the speak-and-type usability budget.
- **No per-helper audit trail.** Two helpers using the same code look
  identical in the `competitors.source = 'walkup'` rows. If a wrong
  registration shows up, the operator can't trace it to a specific
  helper. Acceptable for the training-event use case (operator-
  resolved face-to-face).
- **Codes survive helper turnover within the 24h window.** A helper
  who leaves mid-event keeps the cookie on their phone until the code
  expires or the operator revokes it. Operator must explicitly revoke
  if a phone is lost or a helper goes home antagonistic.
- **Cookie is NOT marked `Secure`.** The bridge serves HTTP on LAN
  (no TLS termination at this tier). Anyone passively sniffing the
  network can capture the signed cookie. Mitigated by the closed-LAN
  trust model + 24h expiry; broken if the bridge ever goes public-
  internet.

### Neutral

- **Localhost bypass.** Operator on the desk laptop never needs a
  code. Matches the existing FARTOLA_DEV admin-route pattern; consistent
  with the trust model that the laptop itself is the trust boundary
  for operator-level actions.
- **Helpers and the operator both write to `competitors.source =
'walkup'`.** The `source` field is not used for permissions, only
  for downstream PII-scrub and observability. No schema change needed.

## Public-internet escape hatch

This ADR is explicitly **NOT sufficient** if the bridge is exposed to
the public internet. Concretely, the assumptions that break:

1. Per-IP rate limit is trivially bypassed by a distributed attacker;
   31 500 codes fall in seconds.
2. Passive network sniffing captures unsigned-cookie HTTP traffic.
3. The 24h-window assumption (attacker must complete attack within
   event day) no longer scopes blast-radius — the attacker has weeks
   between events to enumerate the public surface.

Before any public-internet exposure happens, this ADR MUST be revisited
and either:

- (a) extended with proper auth (Option B reconsidered), OR
- (b) the code space expanded to ≥80 bits AND HTTPS termination added,
  AND a global rate limit at the edge AND CAPTCHA on `/access`.

Phase 5 (O-Ringen scale) is the natural trigger to revisit. Anything
earlier that puts the bridge behind a public domain (e.g., a Phase 4
spectator-results page) must explicitly carve the gated routes out of
the public surface or upgrade auth.

## Verification

Plan 02-08 Task 6 enumerates the manual test plan that exercises this
ADR's assumptions:

1. **Brute-force probe** — scripted POST loop hits the rate limit
   ceiling by attempt 11.
2. **Log scrub** — `audit-canary-99` code in a POST body produces zero
   matches in `journalctl --user -u fartola`.
3. **Cookie scrub** — HttpOnly verified in browser DevTools (cookie
   not exposed to `document.cookie`).
4. **Localhost bypass** — operator-desk curl POST succeeds without a
   cookie.
5. **Revocation propagation** — revoked code rejects on the very next
   write attempt from any cookie that previously validated against it.
6. **24h expiry** — fast-forward test (testClock injection) confirms
   the code stops working at `competition.date + 24h`.

The manual run happens once during 02-08 implementation; the
automated tests in Plan 02-08 cover the regression surface for
subsequent changes.

## Cross-references

- Plan 02-08 — implementation (Phase 2.1 sub-plan, deferred from
  Phase 2.0)
- Plan 02-07 — Settings UI (provides the `/installningar` host page
  for the "Hjälpkoder" section + the `config`-table pattern this ADR
  reuses for `event_code_signing_secret`)
- ADR-0008 — PII in append-only event log (parent trust model;
  single-user laptop + FDE)
- REQ-OPS-001 — offline-first single-binary deployment
- REQ-OPS-003 — NEW; minimal auth for mobile sekretariat-helpers
  (added to `.planning/REQUIREMENTS.md` by Plan 02-08 Task 1)
