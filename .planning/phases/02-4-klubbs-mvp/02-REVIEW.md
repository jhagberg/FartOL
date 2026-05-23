# Phase 2.0 Code Review

**Date:** 2026-05-17
**Reviewer:** gsd-code-reviewer
**Scope:** git diff 5405e27..HEAD (~57 commits, 7 plans)

## Summary

| Severity | Count |
| -------- | ----- |
| BLOCKER  | 2     |
| HIGH     | 3     |
| MEDIUM   | 3     |
| LOW      | 1     |
| NOTE     | 1     |

Targeted review of the 6 production-critical surfaces for Wednesday's
4-klubbs race. Two BLOCKERs concentrated in the Eventor + MeOS ingest
paths: a UTF-8 streaming bug that will corrupt Swedish names ("Östberg"
→ "�stberg") in the 86 MB cachedcompetitors ingest, and a cross-
competition data-bleed in the MOP auto-merge that fabricates competitor
rows when an operator switches active competition. The remaining HIGH
findings are robustness gaps that will fire in operator scenarios that
4-klubbs will hit (re-mount race in the registration queue, two ingest
paths that bypass the foreign-key safety net, course-only fallback
clobbering of pre-existing classes). Walkup REST, hyrbricka REST, and
MIP wire shape are solid.

## Findings

### F-001: Eventor parser fragments multi-byte UTF-8 across stream chunks

**Severity:** BLOCKER
**File:** `apps/edge/src/eventor/parser.ts:196-206`
**Issue:** The header comment claims `createReadStream` is opened without
`encoding: 'utf8'` because "saxes accepts Buffers and decodes
internally." But saxes v6's `write()` signature is `string | object |
null` (verified at `node_modules/.pnpm/saxes@6.0.0/.../saxes.d.ts:463`)
— it does NOT accept Buffers. The loop is forced to call
`chunk.toString('utf8')` per chunk. Buffer.toString('utf8') has no
streaming state, so a chunk boundary that lands inside a multi-byte
codepoint (extremely common in a 86 MB file at 64 KB chunk sizes) yields
a U+FFFD replacement character at the seam. Every "Östberg", "Pär",
"André", "Mörn" in the Swedish runner database has ~64KB / N
probability of corruption. The very pitfall the comment claims to
mitigate is the bug being shipped.
**Recommendation:** Use a streaming UTF-8 decoder:

```ts
import { StringDecoder } from 'node:string_decoder';
const decoder = new StringDecoder('utf8');
const stream = createReadStream(path);
for await (const chunk of stream) {
  parser.write(decoder.write(chunk as Buffer));
  if (parserError) throw parserError;
}
parser.write(decoder.end());
```

StringDecoder buffers partial multi-byte sequences across writes —
that's exactly its purpose. Alternative: open `createReadStream(path, {
encoding: 'utf8' })` and accept the same per-chunk decode (Node's own
internal decoder is also stateful in that mode).
**Evidence:** parser.ts:199-203:

```ts
const stream = createReadStream(path);
for await (const chunk of stream) {
  parser.write(chunk.toString('utf8')); // ← per-chunk stateless decode
  if (parserError) throw parserError;
}
```

### F-002: MOP auto-merge re-merges stale shadow rows into new competition

**Severity:** BLOCKER
**File:** `apps/edge/src/integrations/meos/mop.ts:259-294` (+ schema.ts:412-431)
**Issue:** `meos_competitors` has NO `competition_id` column — it is a
global shadow table mirroring all MeOS state the bridge has ever
ingested. The auto-merge SELECT iterates EVERY row in `meos_competitors`
and inserts a competitor into the currently-active competition for each
row whose card_number isn't taken AND whose MeOS class name matches a
class name in the active competition. Scenario for Wednesday:

1. Bridge runs morning HD-träning (active comp = A). MeOS POSTs MOP for
   competition A → shadow rows for runners 100..120 land in
   meos_competitors.
2. Operator switches active comp to 4-klubbs (comp B) for afternoon.
3. Next MOP POST (even an empty MOPDiff or just the next heartbeat
   POST from MeOS) re-evaluates the auto-merge against the SAME stale
   shadow rows. Any morning runner whose card isn't already bound in
   comp B AND whose class name happens to match (very likely — H10/D10/
   Vit are universal) gets silently inserted as a 4-klubbs competitor
   with consent_status='pending_first_read'.
   The TRUNCATE in mop.ts:160-162 only fires on `<MOPComplete>`, never on
   `<MOPDiff>` or empty POSTs.
   **Recommendation:** Either (a) add a `competition_id` column to
   `meos_competitors` and key it off the active-at-ingest competition, with
   the auto-merge constrained to `mc.competition_id = ${activeCompetitionId}`;
   or (b) TRUNCATE `meos_competitors` (and meos_classes, meos_clubs) on
   every active-competition switch (in `routes/sessions.ts` PATCH active);
   or (c) gate the auto-merge on the `lastMopUpdateMs` being from the
   current POST (`WHERE mc.last_mop_update_ms = ${nowMs}` so only rows
   just-written get merged). Option (c) is the smallest patch and is
   race-safe inside the transaction.
   **Evidence:** schema.ts:412-431 — `meosCompetitors` has no
   competitionId column. mop.ts:160-162 — TRUNCATE only inside the
   `MOPComplete` branch. mop.ts:279-291 — `FROM meos_competitors mc` with
   no temporal or scope filter.

### F-003: cardQueue race — second card_read between pop() and modal mount drops the read

**Severity:** HIGH
**File:** `apps/web/src/lib/screens/RegistrationView.svelte:118-136`
**Issue:** `handleIncomingCard` runs the dedup check (`currentCard !==
null && currentCard.cardNumber === cardNumber`) BEFORE the
`cardQueue.push`. If a second card arrives in the gap between the modal
emitting `onClose` (which sets `currentCard = cardQueue.pop()`) and the
WalkupModal actually re-mounting/handling the next read, the new card
sees `currentCard !== null` (just assigned by pop) — fine. But the
real risk is a more subtle ordering: when modal close runs
`onWalkupClose` → `currentCard = cardQueue.pop()` returns null on
empty queue → modal unmounts. If a card arrives during that microtask
gap, the dedup check passes (`currentCard === null`), push() succeeds,
then `currentCard = cardQueue.pop()` is called. So far so good. But
the original test (02-02b) covers happy-path enqueue, not the case
where two card_reads land in the same JS turn (saxes/SI-bridge can
deliver two card_inserted events within one ms when the operator
flicks two cards in succession). Both `handleIncomingCard` invocations
might both observe `currentCard === null` and both invoke
`cardQueue.pop()` — the second pop returns `undefined`/null because
push only added one item; the first `currentCard` assignment wins but
the second overwrites `currentCard` with null, dropping the modal
mount for the first card. The {#key currentCard.cardNumber} block then
unmounts.
**Recommendation:** Make the push-then-mount atomic. Either pop
unconditionally and check the return:

```ts
if (currentCard === null) {
  const next = cardQueue.pop();
  if (next !== null) currentCard = next;
}
```

or push first then only mount if `currentCard` is still null:

```ts
if (!cardQueue.push(cardNumber, hint)) { toast(...); return; }
if (currentCard === null && cardQueue.count > 0) {
  currentCard = cardQueue.pop();
}
```

The store is single-threaded but the JS event loop runs `await`s and
microtasks between bullet points; the test should cover two reads in
one tick.
**Evidence:** RegistrationView.svelte:121-135 — see ordering of dedup
check vs push vs pop.

### F-004: courseImport fallback clobbers pre-existing classes on re-import

**Severity:** HIGH
**File:** `apps/edge/src/ingest/courseImport.ts:62-74`
**Issue:** The course-only fallback (fb31c81 fix) gates on
`data.classes.length === 0 && data.courses.length > 0`. The synthesised
classes use `name: cr.name` and a hand-rolled id `auto-${cr.name}` (not
a UUID). The id field is set inside `synthesised.push({ id: ..., name,
short_name: null })` but `id` is never consumed by the downstream
INSERT — line 91 uses `crypto.randomUUID()` regardless. So the
`auto-X` id is dead data. Worse: the fallback fires on EVERY re-import
that lacks `<Class>` elements. If an operator re-imports an updated
courseData XML (Purple Pen re-export to fix a control coordinate), the
fallback creates the same class names a SECOND time using
`classIdByName.has(c.name) ? skip : insert`. The skip path works for
the synthesised classes BUT the courses still get fresh UUIDs (line
123 comment says so), and the new course rows point at the SAME
classIdByName.get(name) → existing class. The competitors that were
already bound to the previous course set now point at orphan
course/class chains because Phase 1 doesn't delete old courses on
re-import (header comment line 16-17). This isn't a bug introduced by
the fallback per se — it's a latent re-import hazard amplified by the
fallback making re-imports easier. 4-klubbs operator may do exactly
this if they realise a course code was wrong on Tuesday evening.
**Recommendation:** (1) Remove the dead `id: 'auto-...'` field from
the synthesised class objects — it's misleading. (2) Document in the
courseImport header that course-only re-imports leave orphan course
rows; consider a CLI flag or pre-flight check in the wizard upload
endpoint that warns the operator. (3) For 4-klubbs Wednesday: confirm
the smoke script (bench-smoke-phase2.sh) doesn't exercise re-import,
and add a runbook note "if you re-import courses, delete old courses
first."
**Evidence:** courseImport.ts:70 `synthesised.push({ id: 'auto-${cr.name}', ...})`
and courseImport.ts:91 ignores the id and uses `crypto.randomUUID()`.

### F-005: Eventor ingest swallows orphan-club FKs silently — but the FK chain itself is fragile

**Severity:** HIGH
**File:** `apps/edge/src/eventor/cache.ts:106-122`
**Issue:** The FK-safety strategy nulls competitor.club_id when the
referenced club isn't in the just-loaded clubs.xml. The intent is
documented but two things make this fragile in production:

1. `knownClubIds = new Set(allClubs.map((c) => c.club_id))` is built
   from the parsed clubs XML, not from what was actually INSERTed.
   `parseClubsXmlSync` filters out rows with `clubId === null || clubId
<= 0` AND `name === null` (parser.ts:275-277). So the Set CAN
   include club_ids that were never inserted (if filtered later) and
   also can MISS clubs that ARE in `eventor_clubs` from a prior
   snapshot — but the TRUNCATE on cache.ts:83 wipes those. So the Set
   should match. OK on this point.
2. There is no logging when a competitor's club_id is nulled. If half
   the Eventor cache lands with null club_id (likely cause: a clubs.xml
   missing a popular org), the autocomplete will be missing clubs for
   thousands of runners and no warning surfaces. The 4-klubbs operator
   won't notice until a runner walks up and Stora Tuna OK doesn't
   autocomplete.
   **Recommendation:** Add a counter:

```ts
let nulledClubCount = 0;
const mappedCompetitors = allRecords.map((r) => {
  const okClub = r.club_id !== null && knownClubIds.has(r.club_id);
  if (r.club_id !== null && !okClub) nulledClubCount++;
  return { ..., clubId: okClub ? r.club_id : null };
});
// log after the transaction: if nulledClubCount > threshold, warn.
```

Surface this in the existing log line at boot.ts:130 alongside
"competitors / clubs". A jump from 0 to thousands of nulled clubs is a
canary for a clubs.xml fetch regression.

### F-006: hiredCards return uses idempotent semantics but ALWAYS broadcasts on the non-idempotent branch

**Severity:** MEDIUM
**File:** `apps/edge/src/routes/hiredCards.ts:161-181`
**Issue:** The branch at line 153 returns early with `already_returned:
true` and no broadcast (correct). The non-idempotent branch runs the
UPDATE inside a transaction, then unconditionally broadcasts. Race:
two near-simultaneous PATCH requests (operator double-taps the
"Returnerad" button + a cross-operator returns the same card from the
admin view) both pass the pre-flight SELECT (returned_at_ms IS NULL),
both UPDATE (the second is a no-op because the first set
returned_at_ms = ts1), both broadcast. The second broadcast carries
the OLD `now` timestamp captured before either UPDATE, so subscribers
see two `hired_card_returned` envelopes with different timestamps for
the same card. The ReadoutView's "Set-based dismissal logic"
referenced in the file header is robust against duplicate envelopes,
but other listeners may not be.
**Recommendation:** Either (a) check the UPDATE affected rowcount and
suppress broadcast when it's 0:

```ts
const result = app.fartolaDb.db.update(hiredCards).set(...).where(
  and(eq(...), eq(...), isNull(hiredCards.returnedAtMs))   // ← extra guard
).run();
if (result.changes === 0) {  // someone else won the race
  return reply.code(200).send({ ok: true, already_returned: true, returned_at_ms: <re-read> });
}
```

or (b) move the SELECT into the same transaction and use SELECT FOR
UPDATE semantics (better-sqlite3 doesn't have that, but SERIALIZABLE
inside `sqlite.transaction` is implicit since SQLite serializes
writers).
**Evidence:** hiredCards.ts:139-181 — pre-flight SELECT is
non-transactional; UPDATE doesn't filter on isNull(returnedAtMs);
broadcast is unconditional.

### F-007: MIP class-name cache uses class UUID as key but stores '' for missing classes — entries silently dropped on lookup failure

**Severity:** MEDIUM
**File:** `apps/edge/src/integrations/meos/mip.ts:225-238`
**Issue:** When `classes.id` lookup returns no row, `className =
classRow?.name ?? ''`, the cache stores '', and the route SKIPS the
entry at line 238 (`if (className.length === 0) continue;`). This is
described as a "landmine mitigation" but the symptom for the operator
is: a competitor row exists in `competitors` referencing a class_id
that has been DELETED (e.g. operator accidentally removed a class from
the admin UI). The MIP poll silently drops these entries — MeOS never
sees them — and no log fires. The walk-up modal shows the runner
exists, but MeOS shows nothing. Diagnosis is hard.
**Recommendation:** Log at warn-level when a competitor is skipped due
to a missing class:

```ts
if (className.length === 0) {
  req.log.warn(
    { competitorId: competitor.id, classId: competitor.classId },
    'MIP: skipping competitor with unresolvable class'
  );
  continue;
}
```

This is a no-op at 4-klubbs scale (5 classes, no deletes expected) but
the diagnostic value is huge if something goes sideways during the race.

### F-008: scheduleEventorBoot ingest-failure path lies about reason='network_error'

**Severity:** MEDIUM
**File:** `apps/edge/src/eventor/boot.ts:127-140`
**Issue:** The catch around `ingestFn(...)` at line 138-140 returns
`{ skipped: true, reason: 'network_error', error: err }` even though
the error came from parsing/SQLite/FK-violation in the ingester, not
from the network. Operators reading the log "Eventor: ingest failed"
with reason `network_error` will look at their internet connection
instead of the more likely cause (a 252919-row payload that hit an FK
violation or a parser exception on malformed XML). 4-klubbs LAN
diagnosis time matters.
**Recommendation:** Add a separate reason:

```ts
type Reason = 'fresh' | 'empty' | 'no_key' | 'network_error' | 'ingest_error';
// ... in the ingest catch:
return { skipped: true, reason: 'ingest_error', error: err };
```

And update EventorBootResult union + downstream `/api/eventor/status`
mapping. One-line fix, zero behavior change beyond clearer logs.

### F-009: hired_card pre-flight bypassed when hired_contact omitted entirely

**Severity:** LOW
**File:** `apps/edge/src/routes/competitors.ts:338-345`
**Issue:** The check at line 338-345 reads:

```ts
if (input.hired_card === true) {
  const hc = input.hired_contact;
  const phone = hc?.phone?.trim() ?? '';
  const email = hc?.email?.trim() ?? '';
  if (phone === '' && email === '') {
    return reply.code(400).send({ error: 'hyrbricka_contact_required' });
  }
}
```

This is correct (`hc?.phone?.trim() ?? ''` handles
hired_contact=undefined). The LOW concern is that the Zod schema
(dtos.ts:250-258) doesn't enforce this — the contact is fully
optional. The server-side check is the only guard. If a future PR
removes the route-level check thinking "Zod handles it", the rental
hyrbricka contract silently breaks. Worth a Zod superRefine.
**Recommendation:** Move the validation into the Zod superRefine
already in CompetitorCreateInput so the wire contract is self-
documenting and the route handler can rely on shape narrowing:

```ts
if (val.hired_card === true) {
  const hasContact = val.hired_contact?.phone?.trim() || val.hired_contact?.email?.trim();
  if (!hasContact)
    ctx.addIssue({ code: 'custom', path: ['hired_contact'], message: 'phone or email required' });
}
```

### F-010: mop.ts dead branch — `<cls delete="true">` documented as not in XSD but still wired

**Severity:** NOTE
**File:** `apps/edge/src/integrations/meos/mop.ts:208-216`
**Issue:** Comment explicitly says "mop.xsd v2.0 doesn't formally
declare a `delete` attribute on Class — fixtures intended for round-
trip validation avoid it. We still honor the attribute defensively..."
Defensive code is fine in principle; the concern is that any XML
arriving with `<cls delete="true">` would fail XSD validation upstream
(if validation is wired) — so this branch is unreachable in
production. Either remove and re-add when the XSD evolves, or
document why fast-xml-parser bypasses XSD validation in this code
path (it does; nothing here validates against mop.xsd at parse time).
**Recommendation:** Either remove the dead branch (saves 3 lines) or
add a one-line `// NOTE: this branch is reachable only if validation
is disabled — see PATTERNS S-7` comment so readers don't think it's
exercised in tests.

---

_End of review. 6/6 priority files covered. Tests + planning
artifacts intentionally not flagged._
