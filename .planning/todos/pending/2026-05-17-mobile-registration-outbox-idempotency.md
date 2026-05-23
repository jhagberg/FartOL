---
created: 2026-05-17T08:30:00+02:00
title: Mobile registration outbox + server-side idempotency (Level B resilience)
area: web,edge
files:
  - apps/web/src/lib/screens/WalkupModal.svelte
  - apps/web/src/lib/api/client.ts
  - apps/edge/src/routes/competitors.ts
  - apps/edge/src/db/schema.ts
  - packages/shared-types/src/competitor.ts
source: Conversation 2026-05-17 — Wednesday 4-klubbs plans to put volunteers on phones reading SI card numbers by eye and typing them in. Local wifi may drop when a volunteer wanders too far from the AP. Level A (auto-retry + prominent banner, this commit) covers the common case; Level B is the durable fix.
---

## Problem

For 4-klubbs and similar trainings we want N volunteers with phones registering
runners in parallel (typing the SI card number by eye, Eventor lookup auto-fills
name + club, Spara). On a local-wifi-only deployment with no AP repeaters,
the phone WILL lose connectivity at some point — wandering volunteer, sleep,
iOS Safari evicting the tab.

Level A (2026-05-17) is the shipped state:

- `createCompetitor` does one auto-retry on raw network failure (TypeError)
- WalkupModal shows a prominent "Frånkopplad" banner that doesn't clear the
  form, with a "Försök igen" CTA

Level A's failure modes:

1. **Tab eviction / phone crash** — form data lives only in JS state; gone on
   reload.
2. **Volunteer closes the modal accidentally** — same; no recovery.
3. **Half-committed POST** — if the server processed the POST but the response
   never got back to the phone (LAN packet loss in one direction), the Level A
   retry creates a **duplicate competitor row**. Today this manifests as
   two registrations with consecutive UUIDs, same name, same card. The
   partial unique index on `(competition_id, card_number)` catches the
   duplicate `card_number` and surfaces a 409, but the FIRST insert
   already happened — so the operator sees a confusing "card_taken"
   pointing at a competitor row they just created.

## Why we haven't fixed yet

- Wednesday 2026-05-20 deadline. Outbox + idempotency is ~0.5-1d of work
  including server schema, client persistence, and tests. Level A is ~2-3h
  and covers the most likely cases.
- The half-committed-POST case is rare on a LAN (it requires the inbound
  packet to succeed and the outbound to fail). Local-wifi mostly fails
  symmetrically; both directions drop together → TypeError → retry-safe.

## Proposed fix (Level B)

**Schema change (server):**

```sql
ALTER TABLE competitors ADD COLUMN idempotency_token TEXT;
CREATE UNIQUE INDEX competitors_idempotency
  ON competitors(competition_id, idempotency_token)
  WHERE idempotency_token IS NOT NULL;
```

Token TTL: 24h (cleanup job scrubs `idempotency_token` to NULL after 24h
so the index stays small and the field can't be re-used as PII).

**Client (POST /api/competitors):**

- Generate `idempotency_token = crypto.randomUUID()` when the form is first
  saved.
- Store the full POST body + token in `localStorage` under
  `fartola.outbox.<token>` _before_ the fetch.
- POST with the token in the body.
- On success → delete the localStorage entry.
- On TypeError → leave in outbox, schedule retry (5s backoff, max ~5 tries).
- On any 4xx that isn't `idempotency_token_replay` → drop from outbox + show
  error.
- On 409 `card_taken` where `existing_competitor_id` is OUR id (the server
  echoes the token-matched row) → treat as success, drop from outbox.

**Server (POST /api/competitors):**

- If `idempotency_token` is supplied, SELECT first. If a row exists with the
  same `(competition_id, idempotency_token)`, return 200 with the existing
  CompetitorDTO instead of 201. This is the de-dup path.
- If insertion fails on the idempotency unique index (race between two
  parallel retries), look up the winner and return its DTO — same treatment
  as the existing card_taken race-safety branch in
  `apps/edge/src/routes/competitors.ts:243-267,468-491`.

**Outbox UI (WalkupModal + RegistrationView):**

- Persistent badge: "N osynkad" with a tap-to-expand drawer listing pending
  registrations. Each shows {name, card, age-since-queued}.
- On app boot / reconnect, drain the outbox automatically (one POST at a
  time to avoid hammering the bridge).
- Manual "Försök igen alla" button.

**Telemetry / observability:**

- New event type `outbox_replay` in the local event log so we can audit
  how often the outbox actually fired in production.
- Bump existing `competitor_create` log to include the idempotency_token
  when present.

## Tests

- Vitest unit: client `createCompetitor` writes localStorage before fetch,
  removes on success, keeps on TypeError.
- Vitest unit: outbox drain logic obeys backoff + max-tries.
- e2e Playwright: emulate offline → save 3 forms → go online → all 3 land
  exactly once (assert by API count).
- Server unit: same `idempotency_token` POSTed twice returns identical DTO
  twice; second response has 200 not 201.
- Server unit: idempotency cleanup job scrubs tokens > 24h old.

## When to fix

Post-Wednesday post-mortem. If the 4-klubbs UAT surfaces ANY lost
registration that the Level A retry didn't catch, this jumps to a
must-have. Until then, keep on the backlog.

## Related

- `.planning/todos/pending/2026-05-15-parent-self-signup-qr-flow.md` —
  similar mobile-on-wifi resilience considerations apply if we ship the
  parent QR self-signup; could share the outbox infrastructure.
- Phase 2.1 roadmap item: revisit if mobile registration becomes a primary
  surface.
