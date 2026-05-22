# MeOS integration todo — gaps surfaced 2026-05-18..22

**Status:** queued for Phase 2.1 (and one Phase 2.2 spike).
**Author:** jonas, 2026-05-22.
**Provenance:** post-merge debugging session on PR #20 against a live
MeOS v5 instance. We chased a "Okänd klass" rejection in MeOS's
Onlineinput receive log all the way to its source, mapped the MeOS REST
API surface, and characterised a Wine-host failure mode that anyone
operating MeOS-in-Wine will hit. This file captures the followups so
they don't get lost between phases.

## Context

PR #20 (Phase 2.0 4-klubbs MVP) merged. Race ran 2026-05-20 on MeOS as
primary, FartOL as parallel. During pre-race testing we drove FartOL's
MIP output into MeOS and the receive log showed:

```
Fel: Fagerström, Andreas, Okänd klass
```

Even though `classname="Violett"` on the FartOL side matched
`oclass.Name="Violett"` (Id=5) on the MeOS side byte-for-byte. The
runner was never inserted. Investigation traced the rejection to a real
bug in MeOS — see §1 below. Operational notes from the same session
captured in §5–7.

## Phase 2.1 scope items

### 1. MIP: emit `classid` attribute on every entry — **fixes "Okänd klass"**

**Root cause:** MeOS's `RestServer::newEntryErrorCheck`
(`restserver.cpp:1372-1375`) does its own class lookup by integer ID
and ignores the name-resolved `cls` that the caller (`onlineinput.cpp:
996`) already obtained. The caller passes the raw `classId=0` (since
FartOL omits the attribute) at `onlineinput.cpp:1141`, never
substituting `cls->getId()`. So name-only entries always fail the
permission check, even though name resolution succeeded.

**Workaround:** FartOL's MIP emitter must include `classid="N"`
alongside `classname="…"` so MeOS's id-first lookup short-circuits the
broken name-fallback path.

**Three implementation options, in order of preference:**

1. **MeOS REST auto-discovery** (cleanest, requires Informationsserver):
   On every poll/push cycle, query `http://<meos-host>:2009/?get=class`
   to fetch the class list (`InfoClass` XML with internal IDs).
   Maintain a `classname → classid` cache, invalidate on every poll.
   Pro: zero operator setup, follows MeOS automatically.
   Con: depends on Informationsserver being up; flaky under Wine
   (see §6).

2. **Direct MySQL read** at session start (`SELECT Id, Name FROM
oclass`). Read-only, low risk. Op enters MySQL DSN once per event.
   Pro: works headlessly, no MeOS REST dependency.
   Con: a second integration surface we have to maintain.

3. **Operator-entered mapping** (cheapest, brittle): a "MeOS
   klassmappning" panel in FartOL settings where the op pastes the 5–10
   class IDs by hand once per event.
   Pro: trivial to implement.
   Con: silent breakage when MeOS IDs change between events.

**Recommendation:** ship (1) as primary, fall back to (3) for offline
hosts. Skip (2) for the MIP path — keep MySQL access for the read-only
spike in Phase 2.2 (§4 below).

### 2. Upstream the MeOS bug

File an issue (or patch) with Erik Melin against MeOS:
`restserver.cpp:1372` should use the caller-resolved class, not re-do
the lookup with raw `classId`. Diff sketch:

```cpp
// Caller passes resolved cls* through; permission check uses cls->getId() not raw int.
void RestServer::newEntryErrorCheck(oEvent &oe, pClass cls, ...)
```

Even after our workaround lands, every other MIP client (e.g. roc-
integrations, custom tools) hits this same trap. Worth fixing
upstream.

### 3. Human-readable competition URL slugs

Current: `/competition/76ae3337-cc26-4c38-ac2e-2cc2d647b585/readout`.
Desired: `/competition/4-klubbs-2026/readout`.

Backwards-compat: keep UUID as canonical, slug as additional alias.
Auto-derive slug from `competitions.name + date` at create time;
operator override field in settings.

Surfaced as TODO during the 2026-05-18 active-competition-pill work;
parked then because the pill made stale-URL pain less acute. Still
worth doing for shareable links + operator memory.

### 4. (Phase 2.2 spike candidate) Direct MySQL — third-station mode

MeOS's multi-station mode is exactly what FartOL would emulate by
talking to MeOS's MySQL directly: two MeOS clients + one FartOL all
pointed at the same DB. The `Counter` + `ModifiedDate` columns on
every `oRunner` / `oCard` / `oClass` row exist for this exact pattern.

Scope as a **read-only spike first**: FartOL pulls class/runner state
from MySQL, displays it, but only ever writes via MIP. Once that's
stable for one full event, evaluate adding writes (which require
respecting MeOS's optimistic-concurrency contract — bumping Counter,
ModifiedDate, and the dbrunner/orunner two-tier model correctly).

Risk profile is higher than MIP: a bad UPDATE during a race can't be
git-reverted. Pin to Phase 2.2 at the earliest, after Phase 2.1
sanctioned-competition work is in.

## Operational notes (for runbook, not features)

### 5. MeOS REST endpoint cheat-sheet

The Informationsserver automat (added under MeOS → Automater) hosts a
REST API. Defaults:

- **Port 2009** (configurable in the automat settings)
- **Path is ignored** — MeOS routes by query params. `/?get=class` and
  `/meos?get=class` are equivalent.
- Useful queries:
  - `?get=class` — class list with internal IDs (the value we need for §1)
  - `?get=competition` — comp meta
  - `?get=organization` — clubs
  - `?get=iofresult` / `?get=iofstart` — IOF XML 3.0
  - `?difference=zero` — full MOP snapshot; `?difference=<n>` — delta
- "Mappa rootadressen" setting is OPTIONAL — only affects bare `/`
  requests. Leave unchecked for FartOL's use.

Add to the operator runbook as a "How to query MeOS state" section.

### 6. Wine + MeOS warning

The MeOS REST server (restbed) runs on a worker thread; MeOS's main
GUI thread drains the queue via the Windows message pump. Under Wine,
that handoff is unreliable — requests reach MeOS but the main thread
never wakes, and after 10 s restbed gives up with `"Error (MeOS):
Internal timeout"` (`restserver.cpp:113-114`).

Workaround: click around in MeOS to nudge the message loop. Real fix:
native Windows host (or stub MeOS's REST role with FartOL eventually).

Recommend documenting this in the operator runbook: **deploy MeOS on
native Windows for any setup that exposes REST.** Wine is fine for
GUI-only / MySQL-only use.

### 7. Orphan-card pile in `oCard`

During testing on 2026-05-18 we observed: cards read into MeOS via SI
station _before_ the matching runner existed end up as orphan rows in
`oCard` with `Removed=1`. MeOS does NOT retroactively bind them when
the matching runner is later inserted via MIP — they stay orphan and
show in the unassigned-cards pile.

Operational fix: import startlist _before_ enabling card reading. Or:
operator does the "tilldela" step in MeOS manually after import.
Worth surfacing in the runbook as a sequencing rule.

## Out of scope (intentionally)

- Patching MeOS ourselves and shipping a fork — license-clean but
  maintenance burden too high. Upstream fix (§2) is the right path.
- Replacing MIP entirely with direct MySQL writes — see §4 spike
  rationale.
- Re-implementing MeOS's Informationsserver inside FartOL — premature;
  MIP-out + REST-poll covers our needs through Phase 2.1.

## Refs

- MeOS source: `/home/jonas/src/meos/code/`
  - `restserver.cpp:1372-1375` — the bug
  - `onlineinput.cpp:985-1014` — MIP entry processor + name fallback
  - `RestService.cpp:33,82` — Informationsserver automat + port default
  - `restserver.cpp:96-120` — request handler + Wine timeout path
- Memories (auto-memory store):
  - `reference_meos_rest_api.md` — endpoint contract
  - `project_meos_mip_okand_klass_bug.md` — bug summary + workaround
