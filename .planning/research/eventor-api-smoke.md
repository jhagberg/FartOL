# Eventor API smoke-test results (2026-05-16)

Tested the Stora Tuna OK API key against `https://eventor.orientering.se/api/`
to lock down what Phase 2.0 Plan 1 (Eventor löpardatabasen download) can
realistically deliver. Full schema lives at
<https://eventor.orientering.se/api/schema>; API method index at
<https://eventor.orientering.se/api/documentation>.

## What works with the STK key (org 637)

| Endpoint | Status | Bytes | Notes |
|---|---:|---:|---|
| `GET /organisation/apiKey` | 200 | 1.3 KB | Returns Stora Tuna OK, OrganisationId 637, parent = Dalarnas OF (8) |
| `GET /organisation/{id}` | 200 | ~1.3 KB | Any single org's metadata (verified for 8) |
| `GET /organisations` | 200 | **2.3 MB** | Full national org list; 39 clubs under Dalarnas OF |
| `GET /persons/organisations/637` | 200 | 163 KB | **384 STK members** with PersonId, name, birth-year, sex, role |
| `GET /persons/organisations/637?includeContactDetails=true` | 200 | 207 KB | Adds phone + email per person — **PII we do NOT want to cache** |

## What's gated (403 with the STK key)

| Endpoint | Status | Why this matters |
|---|---:|---|
| `GET /competitors?organisationIds=637` | **403** | This is the Eventor "Competitor" element — the one that wraps a person with their **default SI control card number**. The 403 means we cannot pull SI-card-keyed runner data with a club-level key. |
| `GET /persons/organisations/8` | **403** | Cannot fetch district-level (Dalarna) persons. Club keys see only their own org. |

## Critical finding — no SI cards in any accessible endpoint

The MeOS-style "read bricka → look up name + klubb" UX **cannot be built from
this API key alone**. The `/persons/organisations/{id}` endpoint returns
person records WITHOUT a `ControlCard` / `CCard` / `cardNumber` element, and
`?includeControlCards=true` (and `includePersons`, `includeAll`) are all
ignored — same 163 KB response. The only Eventor endpoint that exposes the
SI-card-to-person mapping is `/competitors`, which the STK key cannot reach.

This is consistent with Eventor's permission model: SI control cards are
treated as personal data and a federation-/admin-level key is required to
download them across an organisation.

## Implications for Phase 2.0 Plan 1

The original CONTEXT.md sketch was: "load runner DB, when operator types or
reads bricka → auto-fill name + klubb." That MeOS-style flow is **infeasible
with this API key**. Two realistic alternatives:

### Option A — name-only autocomplete (recommended for Wednesday)

- Cache `/persons/organisations/637` nightly → 384 STK members → SQLite table
  `eventor_persons(person_id, given_name, family_name, birth_year, sex,
  org_id, modify_date)`.
- WalkupModal change: when operator types in the **name** field, suggest
  matches from this cache; selecting a match pre-fills Klubb = "Stora Tuna OK".
- SI bricka field stays manual (operator types it or reader populates it).
- Non-STK runners (other 3 clubs) → operator types full name + uses existing
  Phase 1 ClubAutocomplete.

**Pros**: ships in Plan 1 budget (~1d). No new permissions required.
**Cons**: doesn't match MeOS UX; only covers ~25% of 4-klubbs starters
(STK members) — but those are the ones FartOL is most likely to be tested
against in a club-internal training.

### Option B — multi-club keys (better but coordination-blocked)

- Ask each of the 4 partner clubs for their Eventor API key (one per club).
- Cache all 4 clubs' member lists into the same `eventor_persons` table,
  partitioned by `org_id`.
- Coverage jumps from ~25% to ~100% of likely starters.

**Pros**: matches the 4-klubbs use case fully.
**Cons**: requires getting 3 other clubs' admins to share their keys before
Wednesday — coordination risk. Each key is "att betrakta som en värdehandling"
per the Eventor terms; clubs may be reluctant.

### Option C — defer Eventor entirely

- Skip Plan 1; WalkupModal uses only the existing local clubs cache.
- Plan 1 budget redirected to QR self-signup (currently stretch).

**Pros**: zero Eventor dependency on Wednesday.
**Cons**: loses the "type 3 letters of a known runner's name → done"
ergonomics improvement.

## Recommendation

Go with **Option A** for Phase 2.0 — covers the STK home-club runners
(the ones we most need autocomplete for), ships in budget, doesn't block on
external coordination. Option B becomes a Phase 2.1 enhancement (sanctioned
competitions where every participating club's key matters). Option C is the
abort path if Plan 1 hits unexpected blockers.

If Jonas can get the other 4-klubbs clubs' API keys before Wednesday, Plan 1
trivially extends to Option B — schema is partitioned by `org_id` from day
one, and adding more keys is a config change plus another nightly fetch.

## Eventor terms-of-service worth remembering

From the API guide (`docs/Guide_Eventor_-_Hamta_data_via_API.pdf` page 2):

- **Cache aggressively** — "data som hämtas ofta bör i möjligaste mån
  mellanlagras (cachas) på klientsidan." Tumregel: members fetched **once
  per day** is plenty. Plan 1's nightly refresh fits.
- **Excessive traffic gets blocked** — "alltför stora trafikmängder för en
  enskild API-nyckel" triggers action. The 5 calls this smoke test made are
  totally fine; a tight polling loop is not.
- **Key is sensitive** — `värdehandling`, never share externally. The
  `.eventor-env` file is now `.gitignore`'d. If the key ever leaks, regenerate
  under Klubben → Klubbinställningar in Eventor.
- **Schema can change without notice** — backward compatibility is the
  ambition, not a guarantee. Plan 1's parser should be tolerant of unknown
  child elements.

## Sample STK Person element (PII redacted)

```xml
<Person sex="M">
  <PersonName>
    <Family>{name-redacted}</Family>
    <Given sequence="1">{name-redacted}</Given>
  </PersonName>
  <PersonId>1415</PersonId>
  <BirthDate><Date>1948-01-01</Date></BirthDate>
  <Nationality><CountryId value="752" /></Nationality>
  <OrganisationId>637</OrganisationId>
  <Role>
    <OrganisationId>637</OrganisationId>
    <RoleTypeId>1</RoleTypeId>
  </Role>
  <ModifyDate><Date>2026-01-13</Date><Clock>18:12:47</Clock></ModifyDate>
</Person>
```

Note: `BirthDate` is always `YYYY-01-01` (year only, padded). The fine-grained
date is intentionally not exposed via the API.

## What was NOT tested

- Date-filtered queries (`?modifiedFrom=...`) for incremental refresh. Plan 1
  should test this — it would let us avoid downloading the full 384-person
  list every night and instead pull only changes.
- POST endpoints (none needed for Phase 2.0).
- Any of the IOF-XML-formatted result endpoints. Phase 2.1 territory.
