# Eventor API smoke-test results (2026-05-16, revised)

Tested the Stora Tuna OK API key against `https://eventor.orientering.se/api/`
to lock down what Phase 2.0 Plan 1 (Eventor löpardatabasen download) can
realistically deliver. Full schema lives at
<https://eventor.orientering.se/api/schema>; API method index at
<https://eventor.orientering.se/api/documentation>.

**This document was revised after consulting the MeOS source at
`/home/jonas/src/meos/code/TabCompetition.cpp` and finding the actual
endpoint MeOS uses for the löpardatabasen download. The first-round
recommendation ("Option A — STK-only name autocomplete, no SI cards") is
superseded by the Option D below.**

## What works with the STK key (org 637)

| Endpoint | Status | Bytes | Notes |
|---|---:|---:|---|
| `GET /organisation/apiKey` | 200 | 1.3 KB | Returns Stora Tuna OK, OrganisationId 637, parent = Dalarnas OF (8) |
| `GET /organisation/{id}` | 200 | ~1.3 KB | Any single org's metadata (verified for 8) |
| `GET /organisations` | 200 | **2.3 MB** | Full national org list; 39 clubs under Dalarnas OF |
| `GET /persons/organisations/637` | 200 | 163 KB | 384 STK members with PersonId, name, birth-year, sex, role — **no SI cards** |
| `GET /persons/organisations/637?includeContactDetails=true` | 200 | 207 KB | Adds phone + email per person — PII we do NOT want to cache |
| **`GET /export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0`** | **200** | **9.4 MB zip → 86 MB XML** | **The national runner DB MeOS uses. 252 919 competitors. 96 918 with SI cards. 5 141 with Emit cards.** |
| `GET /export/clubs?version=3.0` | 200 | 1.3 MB | National clubs DB with name, short name, parent org, contact info |

## What's gated (403 with the STK key)

| Endpoint | Status | Why this matters |
|---|---:|---|
| `GET /competitors?organisationIds=637` | 403 | The *live, queryable* competitors endpoint. MeOS doesn't use it for the löpardatabasen — it uses the bulk `export/cachedcompetitors` endpoint above which is OPEN to club keys. |
| `GET /persons/organisations/8` | 403 | Cannot fetch district-level persons across-club. Not blocking — `export/cachedcompetitors` covers every Swedish competitor anyway. |

## The MeOS approach — the right pattern for FartOL

Found in `/home/jonas/src/meos/code/TabCompetition.cpp:3107-3108`:

```cpp
// in EventorUpdateDB handler
dwl.downloadFile(
  eventorBase + L"export/cachedcompetitors?includePreselectedClasses=false&zip=true"
              + iofExportVersion,  // = "&version=3.0"
  dbFile, key);
```

…and one block above, the same handler downloads `export/clubs?version=3.0` for
the club table. MeOS does this on every "Uppdatera från Eventor" button click;
operator-driven, no automatic schedule.

The two files are then parsed and persisted to MeOS's local `RunnerDB.h`
struct array (`RunnerDBEntryV3`: name, cardNo, clubNo, national, sex,
birthYear, extId). MeOS keys lookups by `cardNo` (the SI card number),
which is exactly the MeOS-style "read bricka → instant name + klubb" UX
we want in FartOL.

The endpoint is named `cachedcompetitors` because **Eventor itself caches
it server-side and expects clients to cache it client-side** — it's
explicitly designed for this download pattern. No additional permission
required beyond a normal club key.

## Sample competitor element (real data, PII redacted to first record only)

```xml
<Competitor modifyTime="2024-12-12T09:46:45Z">
  <Person sex="F" modifyTime="2024-12-12T09:46:45Z">
    <Id type="Sweden">1</Id>
    <Name>
      <Family>Larsson</Family>
      <Given>Lena</Given>
    </Name>
    <BirthDate>1957-01-01</BirthDate>
    <Nationality code="SWE" />
  </Person>
  <Organisation type="Club" modifyTime="2026-03-16T08:25:36Z">
    <Id type="Sweden">320</Id>
    <Name>Sala OK</Name>
    <ShortName>Sala OK</ShortName>
  </Organisation>
  <ControlCard punchingSystem="SI">8303057</ControlCard>
  <ControlCard punchingSystem="Emit">530947</ControlCard>
</Competitor>
```

Notes on the shape:
- Some competitors have **zero, one, or two** `<ControlCard>` elements (SI
  and/or Emit). Plan 1's parser must handle all three cases.
- `BirthDate` is always `YYYY-01-01` (year only, padded).
- `Organisation` is **optional** — orphaned / former-member competitors have
  just `<Person>` and `<ControlCard>`. Don't assume.
- `modifyTime` on `Person` and `Organisation` may differ from the wrapper —
  use the wrapper's for "when did this competitor record last change."
- `Nationality code="SWE"` is on Person, not Competitor.

## Implications for Phase 2.0 Plan 1 — revised

The original CONTEXT.md sketch was right after all: cache the national
löpardatabasen, look up SI cards locally, MeOS-style auto-fill on bricka read.

### Recommended approach — Option D: national runner DB cache (mirrors MeOS)

**Schema (SQLite, in the same DB file as the rest of the bridge state):**

```sql
CREATE TABLE eventor_competitors (
  person_id     INTEGER PRIMARY KEY,
  family_name   TEXT NOT NULL,
  given_name    TEXT NOT NULL,
  birth_year    INTEGER,          -- nullable; year-only when present
  sex           TEXT,             -- 'M' | 'F' | NULL
  club_id       INTEGER,          -- FK to eventor_clubs.club_id; nullable
  si_card       INTEGER,          -- nullable; ~38 % of rows have one
  emit_card     INTEGER,          -- nullable; ~2 % of rows have one
  modify_date_ms INTEGER NOT NULL -- Competitor/@modifyTime parsed to unix ms
);

CREATE INDEX idx_competitors_si ON eventor_competitors(si_card)
  WHERE si_card IS NOT NULL;
CREATE INDEX idx_competitors_name ON eventor_competitors(family_name, given_name);

CREATE TABLE eventor_clubs (
  club_id        INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  short_name     TEXT,
  media_name     TEXT,
  parent_id      INTEGER,
  modify_date_ms INTEGER NOT NULL
);
```

Approximate row counts at 2026-05-16:
- `eventor_competitors`: **252 919 rows** (~20 MB SQLite once indexed)
- `eventor_clubs`: ~few thousand rows (~few hundred KB)

**Download pipeline:**

1. `GET /export/cachedcompetitors?includePreselectedClasses=false&zip=true&version=3.0`
   with `ApiKey: <key>` header. Save the zip to a tempfile.
2. Unzip in memory (Node `node:zlib` or `unzipper`).
3. **Streaming XML parse** (sax / saxes / fast-xml-parser stream mode) — the
   86 MB XML will not fit comfortably in memory if parsed to a single DOM.
   Emit each `</Competitor>` event into an `INSERT OR REPLACE` prepared
   statement in a single transaction. Phase 1 already uses sax-style for the
   IOF XML 3.0 ResultList; same pattern.
4. Same for clubs (`/export/clubs?version=3.0`), unzipped is ~1.3 MB and
   safe to parse as DOM.
5. Wrap both inserts in one outer transaction so the cache table is always
   consistent.
6. Schedule: refresh nightly via the same in-process cron Phase 1 uses for
   SQLite backup (plan 17), OR on-demand via an admin button. Eventor's
   terms-of-service explicitly call out "members fetched once per day is
   plenty."

**WalkupModal lookup flow (Plan 2):**

- When operator enters bricka → `SELECT family_name, given_name, club_id
  FROM eventor_competitors WHERE si_card = ?`
- If found: pre-fill `name` and `klubb` (resolve `club_id` via
  `eventor_clubs.name`). Operator can still edit.
- If not found: keep current Phase 1 path (`cardHolderHint` from SI firmware
  if present, otherwise blank).
- When operator types in the name field: prefix-match autocomplete on
  `(family_name, given_name)` index.

This delivers the **full MeOS-style UX** for ~96 918 SI-card-carrying
runners across Sweden — 100% coverage of any 4-klubbs starter who has a
registered SI card. The earlier "Option A — STK only, 384 names" is no
longer the realistic floor; it was based on a wrong endpoint guess.

### Superseded options (kept for context)

- **Option A — STK persons only.** What we'd fall back to if
  `/export/cachedcompetitors` ever 403'd. ~25 % coverage, no SI cards. Skip.
- **Option B — multi-club keys.** Pointless now that one endpoint gives us
  all clubs.
- **Option C — defer Eventor entirely.** Plan-budget abort path only.

## Privacy + Eventor terms-of-service considerations

The national runner DB is **252 919 names + birth years + clubs + SI cards**.
This is materially more PII than Phase 1's local model. Mitigations:

- **Local-only.** The cache table never leaves the laptop. MIP `<entry>`
  pushes to MeOS only carry the competitors actively registered for *this*
  event, not the cache. MOP receiver writes to a separate shadow table.
- **No phone / email.** `/export/cachedcompetitors` does NOT include contact
  details (verified by grep — no `<Tele>`, no `<Contact>`). Only the
  contact-details-enabled `/persons/organisations/{id}` endpoint exposes
  phone+email, and Plan 1 deliberately uses the *cachedcompetitors* endpoint
  to avoid that PII surface.
- **REQ-PRIV-002 retention.** The append-only event log (ADR-0008) still
  scrubs `card_holder` after 30 days. The Eventor cache is a different
  table outside the append-only domain — it's safe to delete and re-fetch
  any time. Plan 1 should add a "clear cache" admin endpoint analogous to
  Phase 1's retention scrubber.
- **Eventor ToS** (`docs/Guide_Eventor_-_Hamta_data_via_API.pdf` page 2):
  - **Cache aggressively** — refresh nightly, not on-demand-per-event.
  - **No tight loops** — one nightly fetch is fine; polling every minute
    triggers their throttle.
  - **Key is `värdehandling`** — never share externally. The `.eventor-env`
    file is `.gitignore`'d (commit 7ec8866). If the key ever leaks,
    regenerate under Klubben → Klubbinställningar in Eventor.
  - **Schema can change** — backward compatibility is the *ambition*, not a
    guarantee. Parser should tolerate unknown child elements.

An **ADR is warranted** ("ADR-0009: National runner DB cached locally for
walk-up autocomplete") covering the PII trade-off + the chosen mitigations.
Plan 1 should write it before the download code lands.

## What was NOT tested

- `?modifiedSince=...` or equivalent for incremental refresh. Phase 1 cron
  pattern handles full re-download fine at 9 MB; incremental is optimisation.
- POST endpoints. None needed for Phase 2.0.
- Other IOF-XML-formatted result endpoints (Phase 2.1 territory: results
  push, entries pull).

## /tmp cleanup note

The smoke test produced these files which contain real PII (252k names,
SI cards). They have been **purged after analysis**:

- `/tmp/eventor-cached.zip` (9.4 MB)
- `/tmp/eventor-cached/competitors.xml` (86 MB)
- `/tmp/eventor-clubs.xml` (1.3 MB)
- `/tmp/eventor-persons-637.xml` (163 KB)
- `/tmp/eventor-persons-637-cards.xml` (207 KB, phone+email)
- etc.

The Eventor API key itself remains only in `.eventor-env` (`.gitignore`'d
at commit 7ec8866).
