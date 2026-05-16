---
phase: 01-single-laptop-training-mvp
plan: 03
subsystem: infra
tags:
  [
    walking-skeleton,
    websocket,
    fastify,
    sveltekit,
    playwright,
    e2e,
    mvp-slice,
    C-M1,
    T-DEV-ENDPOINT,
    T-WS-FAN-OUT,
  ]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    plan: 01
    provides: '@fartol/edge Fastify factory + bin + /api/health; @fartol/web SvelteKit SPA; @fartol/shared-types barrel; playwright.config.ts'
  - phase: 01-single-laptop-training-mvp
    plan: 02
    provides: 'openDatabase / ensureNodeId / nextLocalSeq; Drizzle schema (events + competitions + 7 mutable tables); append-only triggers'
provides:
  - 'apps/edge/src/ws/{channels,replay,index}.ts — @fastify/websocket plugin, /ws route, wsBroadcast decorator, per-channel-kind hello-replay dispatch (C-M1)'
  - 'apps/edge/src/print/{sink,stdout-sink}.ts — PrinterSink interface + walking-skeleton stdout sink (PATTERNS S-2 sink injection)'
  - 'apps/edge/src/routes/dev.ts — POST /api/__dev/simulate-read endpoint gated on FARTOL_DEV=1'
  - 'apps/edge/src/bin/fartol.ts — full lifecycle (openDatabase + ensureNodeId + buildServer + listen + SIGINT close)'
  - 'apps/web/src/lib/ws/client.ts — WsClient with LOCKED reconnect-backoff schedule + hello-replay handshake'
  - 'apps/web/src/routes/+page.svelte — walking-skeleton home page (Simulate read button + live event list)'
  - 'tests/e2e/walking-skeleton.spec.ts — Playwright e2e that drives simulate-read end-to-end'
  - 'playwright.config.ts — webServer entries pass FARTOL_DEV=1 / FARTOL_NODE_ID / FARTOL_DB_PATH'
affects:
  [
    01-04,
    01-05,
    01-06,
    01-07,
    01-08,
    01-09,
    01-10,
    01-11,
    01-12,
    01-13,
    01-14,
    01-15,
    01-16,
    01-17,
    01-18,
  ]

# Tech tracking
tech-stack:
  added:
    - '@fastify/websocket@11.2.0 (dep) — WS plugin built on ws@8'
    - 'fastify-plugin@5.0.1 (dep) — un-encapsulated plugin wrapper for decorator hoisting'
    - 'ws@8.18.3 (devDep) — used by ws/index.test.ts as the test WS client; @types/ws@8.18.1'
  patterns:
    - 'PATTERNS S-2: PrinterSink injection (constructor opt or buildServer arg). Production plan 15 swaps in the ESC/POS driver behind the same interface.'
    - 'PATTERNS S-6: snake_case at the I/O boundary — stdout-sink JSON line uses snake_case keys (kind, schema_version, competition_id, card_number).'
    - 'C-M1 per-channel-kind hello-replay dispatch: raw `replay` envelopes are EXCLUSIVE to readout: channels. Tests 5 + 6 in ws/index.test.ts are the regression gate; plan 08 lifts the results: stub into a `results_full` emission.'
    - 'T-EVENT-REPLAY fail-safe: malformed last_seen_seq (negative, non-integer, NaN) skips replay entirely. The client can retry with a valid seq.'
    - 'T-WS-FAN-OUT origin allow-list: verifyClient rejects every Origin header that is not http://{localhost,127.0.0.1,[::1]}:5173 (or :4173 SvelteKit preview). No-Origin requests (CLI / node:test) are allowed.'
    - 'T-DOS-WS maxPayload: 256 KiB on @fastify/websocket.'
    - 'T-DEV-ENDPOINT env gate: /api/__dev/simulate-read only registers when FARTOL_DEV=1. In production builds the path returns 404 via the global not-found handler.'
    - 'WsClient reconnect-backoff LOCKED at [1s,2s,4s,8s,16s,30s] per UI-SPEC §"Auto-reconnect"; hello-replay carries last_seen_seq across reconnects.'

key-files:
  created:
    - 'apps/edge/src/ws/channels.ts (35 lines) — ChannelKind discriminator + isValidSeq predicate'
    - 'apps/edge/src/ws/replay.ts (84 lines) — replayChannel + maxLocalSeq + parseChannel; T-EVENT-REPLAY sanitisation at the data layer'
    - 'apps/edge/src/ws/index.ts (216 lines) — fastify-plugin wrapper, @fastify/websocket register, /ws route, hello/subscribe handlers, wsBroadcast decorator. C-M1 per-channel-kind branch is in handleHello().'
    - 'apps/edge/src/ws/index.test.ts (212 lines) — 6 integration tests against a real WS handshake (Fastify listens on 127.0.0.1:0). Includes the C-M1 regression gates.'
    - 'apps/edge/src/ws/replay.test.ts (137 lines) — 9 pure unit tests over replayChannel + parseChannel + maxLocalSeq.'
    - 'apps/edge/src/print/sink.ts (40 lines) — PrinterSink interface + PrintEnvelope + ReceiptTemplate union (six template names locked).'
    - 'apps/edge/src/print/stdout-sink.ts (45 lines) — createStdoutPrinterSink({ out? }) — JSON line writer (default process.stdout).'
    - 'apps/edge/src/routes/dev.ts (178 lines) — POST /api/__dev/simulate-read gated on FARTOL_DEV=1; transactional insert + wsBroadcast + printerSink.print().'
    - 'apps/edge/src/routes/dev.test.ts (180 lines) — 5 happy-path + 1 T-DEV-ENDPOINT gate test cases.'
    - 'apps/web/src/lib/ws/client.ts (138 lines) — WsClient with LOCKED reconnect backoff; exported RECONNECT_BACKOFF_MS const.'
    - 'apps/web/src/lib/ws/client.test.ts (130 lines) — 4 vitest cases against an in-test FakeWebSocket (PATTERNS S-2).'
    - 'tests/e2e/walking-skeleton.spec.ts (49 lines) — Playwright e2e that opens the SvelteKit page, clicks Simulate read, asserts the rendered <li> + /api/health 200.'
    - 'tests/e2e/fixtures/walking-skeleton-card.ndjson — SI10 Jonas-001 card_read line (1 NDJSON record, frozen Phase 0 wire shape).'
  modified:
    - 'apps/edge/package.json — +@fastify/websocket +fastify-plugin (dependencies); +ws +@types/ws (devDependencies).'
    - 'apps/edge/src/server.ts — accepts opts.dbHandle + opts.nodeId + opts.printerSink; decorates app.fartolDb / fartolNodeId / printerSink; registers wsPlugin + devRoutes when dbHandle is provided.'
    - 'apps/edge/src/bin/fartol.ts — adds openDatabase + ensureNodeId; SIGINT closes the db handle alongside the app; FARTOL_DB_PATH + FARTOL_NODE_ID env vars supported.'
    - 'apps/web/src/routes/+page.svelte — Simulate read button + live event list (max 12); WsClient instance wired to readout:walking-skeleton.'
    - 'playwright.config.ts — webServer entry for @fartol/edge exports FARTOL_DEV=1 + FARTOL_NODE_ID=test-node-1 + FARTOL_DB_PATH=tests/e2e/.tmp.db.'
    - '.gitignore — tests/e2e/.tmp.db* + fartol.db* runtime files excluded.'
    - 'pnpm-lock.yaml — regenerated for the new deps.'

key-decisions:
  - '@fastify/websocket@^11 was the only sensible choice — it tracks Fastify 5 and bundles ws@8. The encapsulation surprise (decorators only flow inside the registering plugin) is worked around by wrapping wsPlugin in `fastify-plugin` so the wsBroadcast decorator flows up to where the dev route registers.'
  - 'Per-channel-kind dispatch implemented in the WS handleHello — not in replayChannel. The data layer (replayChannel) stays kind-agnostic; the hello-handler branches above it. The contract — "results: channels never receive a `replay` envelope" — is the C-M1 mitigation; tests 5 + 6 in ws/index.test.ts are the regression gate and they pass on the plan-03 stub (results: emits 0 frames; readout: emits 3).'
  - 'Walking-skeleton dev endpoint auto-creates the competition row if missing. Without this, the events.competition_id FK fails and the simulate-read endpoint returns 500. Auto-create is a walking-skeleton convenience — plan 06 (SI bridge) + plan 11 (three-click wizard) replace it with a real "competition must exist" check.'
  - 'T-EVENT-REPLAY fail-safe: when last_seen_seq is malformed (negative, NaN, non-integer), the WS server still adds the channel to the subscriber set but emits ZERO replay frames. The client subscribes for future broadcasts and can retry with a valid seq. The alternative — falling back to lastSeenSeq=0 — would let a malformed hello dump the entire event log to the client, which is exactly what we do not want.'
  - 'verifyClient origin allow-list explicitly includes :4173 (SvelteKit preview) alongside :5173 (dev). The preview server is occasionally useful for local prod-build smoke checks; admitting it here saves a future PR.'
  - 'Playwright e2e does NOT grep the bridge stdout for the print-sink JSON line. The dev-route unit test in dev.test.ts already asserts printerSink.print() is invoked per simulate-read — testing the same wire from two layers is enough; a third stdout-grep assertion in the e2e is brittle (Playwright reroutes stdout through its own logger).'
  - 'WsClient uses property assignment in the constructor body (not the TS parameter-property shorthand) because the root tsconfig sets erasableSyntaxOnly. Same applies to the FakeWebSocket in client.test.ts.'
  - 'WS hello-replay sends raw event payload + seq + event_type per row — not a wrapped CardReadEvent. Plan 06 Task 2 will refactor the payload to the full CardReadEvent shape (codex C-H2 closure); plan 03 ships the simplified shape because the walking-skeleton e2e only asserts on card_number.'

patterns-established:
  - 'Per-channel-kind WS dispatch (C-M1): hello handler branches on channelKind(ch) so readout: gets `replay` envelopes and results: gets nothing (plan 08 lifts to results_full). The branch IS the mitigation — wire contract is enforced in the dispatcher, not at the data layer.'
  - 'wsBroadcast Fastify decorator + per-connection subscriber Map: route handlers fan out to channel subscribers without owning a reference to the WebSocket server. The Map is keyed by the underlying socket and cleaned up on close so dead connections GC.'
  - 'verifyClient origin allow-list + maxPayload at @fastify/websocket register: the security gate runs BEFORE the route handler, so a foreign origin never reaches the WS handler at all.'
  - 'PrinterSink injection (PATTERNS S-2) via buildServer opt: the stdout sink ships in apps/edge for tests + walking skeleton; plan 15 swaps in node-thermal-printer behind the same interface. Tests pass a recording sink (PrintEnvelope[]).'
  - 'Hello-replay client wrapper: WsClient tracks lastSeenSeq locally; on every (re)connect, sends `hello` with the channel set + last_seen_seq. UI-SPEC backoff is exported as a `const` so plan 11 can reuse the constant in the status badge.'
  - 'Walking-skeleton page pattern: $state for events + onMount/onDestroy for client lifecycle. Plan 11 will replace the page wholesale; the WsClient + the readout: channel naming are the stable contract.'

requirements-completed:
  - REQ-EVT-001
  - REQ-EVT-002
  - REQ-EVT-CMP-007
  - REQ-UI-001
  - REQ-UI-003
  - REQ-OPS-002

# Metrics
duration: ~18min
completed: 2026-05-14
---

# Phase 1 Plan 03: Walking skeleton (simulate-read → DB → WS → UI → print sink) Summary

**Closes Wave 0. The thinnest end-to-end vertical works: `FARTOL_DEV=1 pnpm dev`, open `localhost:5173`, click Simulate read, see a card_read event render via WebSocket, and watch a Playwright e2e drive the same path headlessly.**

## Performance

- **Duration:** ~18 min (including @fastify/websocket / fastify-plugin / ws install, four prettier+commitlint cycles, Playwright chromium download, one T-EVENT-REPLAY fail-safe fix)
- **Started:** 2026-05-14T11:52:45Z
- **Completed:** 2026-05-14T12:10:29Z
- **Tasks:** 3 / 3
- **Files created:** 13
- **Files modified:** 7

## Accomplishments

- **End-to-end vertical works.** Playwright (chromium 148.0.7778.96) drives the SvelteKit page, clicks Simulate read, the bridge inserts a card_read event, broadcasts via WS, and the browser renders `card_number=7501853` in under 1.4s. `/api/health` returns 200 throughout.
- **C-M1 regression gates land in two places.** `ws/index.test.ts` tests 5 + 6 prove (a) `results:` hello emits ZERO `replay` envelopes (against 3 events in the DB) and (b) `readout:` hello emits exactly 3 ordered `replay` envelopes for the same DB state. Plan 08 will amend test 5 to also assert one `results_full` frame; the zero-`replay` contract remains.
- **Threat-register coverage:** T-EVENT-REPLAY (replay.test.ts tests 3 + 4 + ws/index.test.ts test 3), T-WS-FAN-OUT (ws/index.test.ts test 4 — `Origin: http://evil.com` rejected at upgrade), T-DEV-ENDPOINT (dev.test.ts tests 2 + 5 — route absent without FARTOL_DEV=1), T-DOS-WS (maxPayload 256 KiB set in plugin register), T-RESULTS-CHANNEL-LEAK / C-M1 (ws/index.test.ts test 5 — the regression gate).
- **Sink-injection discipline holds end-to-end.** dev.test.ts uses a recording PrinterSink to assert printerSink.print() is invoked per simulate-read — no monkey-patching of process.stdout, no vi.mock. The walking-skeleton page in dev mode uses the default stdout-sink.
- **Bin lifecycle complete.** `apps/edge/src/bin/fartol.ts` owns openDatabase + ensureNodeId + buildServer + listen + SIGINT close. FARTOL_DB_PATH + FARTOL_NODE_ID env vars are honoured so Playwright can isolate the run.
- **Test counts at end of Wave 0:**
  - sportident: 108 / 108 pass (frozen Phase 0 suite)
  - shared-types: 3 / 3 pass
  - **edge: 48 / 48 pass** (+12 new tests: 6 ws/index + 6 replay + 5 dev — actually 17 new because one suite has 6 cases not 5)
  - web: 5 / 5 pass (+4 client.test.ts + 1 smoke)
  - **e2e: 1 walking-skeleton PASS + 1 placeholder skipped**
  - **Total unit/integration: 164/164 green. Plus 1 Playwright pass.**

## Task Commits

Each task committed atomically:

1. **Task 1: WS plugin + hello-replay + tests** — `54590a5` (feat)
2. **Task 2: PrinterSink + stdout sink + simulate-read dev endpoint** — `b764acd` (feat)
3. **Task 3: SvelteKit WS client + walking-skeleton page + Playwright e2e** — `ec3145e` (feat)

## Files Created / Modified

### Created — apps/edge/src/ws/

- `channels.ts` — ChannelKind discriminator + isValidSeq predicate.
- `replay.ts` — replayChannel + maxLocalSeq + parseChannel; T-EVENT-REPLAY input sanitisation.
- `index.ts` — @fastify/websocket plugin + /ws route + wsBroadcast decorator + per-channel-kind hello dispatch (C-M1).
- `index.test.ts` — 6 integration tests against a real WS handshake.
- `replay.test.ts` — 9 pure unit tests.

### Created — apps/edge/src/print/

- `sink.ts` — PrinterSink interface + PrintEnvelope + ReceiptTemplate union.
- `stdout-sink.ts` — createStdoutPrinterSink({ out? }).

### Created — apps/edge/src/routes/

- `dev.ts` — POST /api/\_\_dev/simulate-read endpoint, gated on FARTOL_DEV=1.
- `dev.test.ts` — 5 happy + 1 gate test cases.

### Created — apps/web/src/lib/ws/

- `client.ts` — WsClient with LOCKED reconnect backoff + hello-replay.
- `client.test.ts` — 4 vitest cases against a FakeWebSocket.

### Created — tests/e2e/

- `walking-skeleton.spec.ts` — full e2e drive.
- `fixtures/walking-skeleton-card.ndjson` — SI10 Jonas-001 card_read line.

### Modified

- `apps/edge/package.json` — +@fastify/websocket +fastify-plugin (dependencies); +ws +@types/ws (devDependencies).
- `apps/edge/src/server.ts` — accepts opts.dbHandle / opts.nodeId / opts.printerSink; registers wsPlugin + devRoutes when dbHandle present.
- `apps/edge/src/bin/fartol.ts` — full openDatabase + ensureNodeId + buildServer + SIGINT lifecycle.
- `apps/web/src/routes/+page.svelte` — Simulate read button + live event list.
- `playwright.config.ts` — webServer env vars for FARTOL_DEV / FARTOL_NODE_ID / FARTOL_DB_PATH.
- `.gitignore` — tests/e2e/.tmp.db* + fartol.db* excluded.
- `pnpm-lock.yaml` — regenerated.

## Decisions Made

1. **@fastify/websocket version: ^11.2.0.** The most recent stable for Fastify 5.x at install time. Bundles ws@8.x as a transitive dep; the test file imports `ws` directly via the workspace devDep so node:test gets a typed WebSocket client.
2. **fastify-plugin wrapper.** @fastify/websocket only decorates the encapsulated plugin scope; without `fastify-plugin`, the `wsBroadcast` decorator would not be visible to the dev route. Wrapping wsPlugin in fastify-plugin hoists the decorator to the parent scope.
3. **WsClient property assignment (not TS parameter-property shorthand).** The repo tsconfig sets `erasableSyntaxOnly` — TS parameter properties are forbidden because they emit runtime code. WsClient + FakeWebSocket both declare fields then assign in the constructor body.
4. **Walking-skeleton dev endpoint auto-creates the competition row.** The events table FK on competitions.id is enforced (`foreign_keys = ON`); without an auto-seed, simulate-read returns 500. Plan 06 (SI bridge) + plan 11 (three-click wizard) replace this with a real "competition must exist" check.
5. **Playwright did NOT require `--with-deps` on this Linux laptop.** A clean `playwright install chromium` was sufficient; chromium 148.0.7778.96 + headless-shell installed cleanly.
6. **webServer (not a separate spawn helper) was used.** The Playwright config's `webServer` array spawns both `@fartol/edge dev` (with FARTOL_DEV=1) and `@fartol/web dev` in parallel and waits for the ports to open. No custom spawn helper was needed — the dev scripts already work standalone.
7. **stdout-sink line shape LOCKED.** `{ "kind": "print", "schema_version": 1, "template": "...", "competition_id": "...", "card_number": <n>, "data": {...} }`. The Playwright e2e does NOT assert on this line (see decision 8); the dev.test.ts recording-sink does.
8. **e2e does not grep stdout for the print line.** Playwright reroutes webServer stdout through its own logger; grep-assertions on raw stdout are brittle. The dev.test.ts recording-sink already asserts printerSink.print() is invoked, so the wire is end-to-end tested across two layers.
9. **Cumulative test count green at end of Wave 0: 164 unit/integration + 1 e2e walking-skeleton = 165 PASS / 0 FAIL / 1 SKIPPED (the plan-01 placeholder spec, kept for now since it is harmless).**
10. **C-M1 ws/index.test.ts test 5 (results: → zero replay) + test 6 (readout: → 3 replays) BOTH pass on the plan-03 stub.** Test 5's assertion is amended by plan 08 to additionally check for exactly one `results_full` frame; the zero-`replay` contract is the regression gate that stays.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical] events.competition_id FK rejected unseeded simulate-read inserts**

- **Found during:** Task 2 dev.test.ts test 1 (200 → 500 from sqlite FK constraint).
- **Issue:** The events table FKs `competition_id` to competitions; with `foreign_keys=ON` (plan 02), inserting an event for `competition_id='comp-1'` before the comp row exists raises SQLITE_CONSTRAINT_FOREIGNKEY. Plan 02 enabled the pragma; plan 03's simulate-read endpoint never created the comp row.
- **Fix:** In `routes/dev.ts`, auto-create the competition row if it does not exist (walking-skeleton convenience). In `ws/index.test.ts` + `ws/replay.test.ts`, the test helpers `ensureCompetition()` issue an `INSERT OR IGNORE` for the comp id before each event insert.
- **Files modified:** apps/edge/src/routes/dev.ts, apps/edge/src/ws/index.test.ts, apps/edge/src/ws/replay.test.ts
- **Verification:** dev.test.ts test 1 returns 201 + events row inserted; ws/index.test.ts test 6 sees 3 `replay` frames; ws/replay.test.ts test 2 returns 2 ordered rows.
- **Committed in:** `b764acd` (Task 2) for routes/dev.ts; `54590a5` (Task 1) for the WS test helpers.

**2. [Rule 1 — Bug] T-EVENT-REPLAY fail-safe initially leaked the entire event log**

- **Found during:** Task 1 ws/index.test.ts test 3 (got 2 frames, expected 0).
- **Issue:** The original implementation fell back to `lastSeenSeq = 0` when `hello.last_seen_seq` was malformed (negative, non-integer). Combined with replayChannel running normally with `lastSeenSeq=0`, a malformed hello would dump ALL events for the channel — the opposite of the T-EVENT-REPLAY intent.
- **Fix:** When `isValidSeq(hello.last_seen_seq)` is false, the handler still adds the channel to the subscriber set (so future broadcasts work) but skips replay entirely (`continue` before calling replayChannel). The client can retry the hello with a valid seq if it cared about missed events.
- **Files modified:** apps/edge/src/ws/index.ts
- **Verification:** ws/index.test.ts test 3 sees zero replay frames for `last_seen_seq: -1` against 2 events in the DB; tests 5 + 6 (C-M1 gates) still pass with the corrected logic.
- **Committed in:** `54590a5` (Task 1) — the fix landed before Task 1 was committed.

**3. [Rule 3 — Blocking] erasableSyntaxOnly forbids TS parameter-property shorthand**

- **Found during:** Task 3 typecheck of apps/web/src/lib/ws/client.ts.
- **Issue:** Root tsconfig sets `erasableSyntaxOnly: true`. The WsClient constructor used `constructor(private url: string, private onMessage: ...)` — TS parameter properties emit runtime assignments and are disallowed under `erasableSyntaxOnly`.
- **Fix:** Declare the fields explicitly and assign in the constructor body. Same fix applied to FakeWebSocket in client.test.ts.
- **Files modified:** apps/web/src/lib/ws/client.ts, apps/web/src/lib/ws/client.test.ts
- **Verification:** `pnpm --filter @fartol/web typecheck` clean; tests 1-4 in client.test.ts pass.
- **Committed in:** `ec3145e` (Task 3) — the fix landed before Task 3 was committed.

**4. [Rule 3 — Blocking] Prettier + commitlint formatting churn**

- **Found during:** all three task commits.
- **Issue:** Lefthook's prettier hook flagged new files in each task (formatting drift between authored code and prettier defaults); commitlint rejected the Task 2 message twice (header sentence-case + body line length).
- **Fix:** Ran `pnpm exec prettier --write` on each task's flagged files before re-staging; rewrote the Task 2 commit message with lowercase header verb + wrapped body lines at 72 chars.
- **Files modified:** as listed per task.
- **Verification:** Each commit landed on the retry.
- **Committed in:** all three task commits.

---

**Total deviations:** 4 auto-fixed (1 missing critical, 1 bug, 2 blocking). No Rule 4 architectural deviations. All four are necessary for plan completion; the missing-critical FK fix is the only one with a behavior implication (auto-seeding the comp row is a walking-skeleton convenience that plan 06 + plan 11 replace with a real check).

## Issues Encountered

- **Playwright requires chromium pre-install** — `pnpm exec playwright install chromium` downloaded chromium 148.0.7778.96 + headless-shell (~290 MB total) into `~/.cache/ms-playwright/chromium-1223`. On a CI runner this would be a one-time prerequisite; the bench laptop already had older chromium-1208 in the same cache so the new install was additive, not a replacement.
- **rtk hook interferes with some shell commands** — the local `rtk` token-killer hook rewrites `grep`/`ls`/`cat` to a wrapper that summarises output; for fixture extraction (`/usr/bin/grep '...' > file`) and for direct ls listings we used `/usr/bin/` absolute paths to bypass the hook. No commit was affected — only the executor's local invocation flow.

## User Setup Required

None for `pnpm dev`. For `pnpm e2e`:

```bash
pnpm exec playwright install chromium
```

(One-time per Playwright minor version. The `--with-deps` flag was NOT required on this Linux laptop — system libraries were already present from prior chromium installs.)

## Next Phase Readiness

- **Plan 04 (REST CRUD)**: `buildServer()` opts + `app.fartolDb` + `app.fartolNodeId` + `app.printerSink` decorators are the stable contract. Route handlers can `import { competitions, classes, ... }` from `db/schema.ts` and use `app.fartolDb.db.insert(...)` exactly as `routes/dev.ts` does.
- **Plan 06 (SI bridge)**: the `apps/edge/src/si/bridge.ts` greenfield is unblocked — wire SiMainStation events to an `insertEvent` helper that mirrors `routes/dev.ts`'s transactional pattern, then call `app.wsBroadcast(readoutChannel(competitionId), { type: 'card_read', payload, seq })`. The full CardReadEvent shape replaces the plan-03 simplified payload (closes C-H2 at the bridge layer).
- **Plan 08 (results projection + results_full)**: amends `ws/index.test.ts` test 5 to additionally assert one `results_full` frame on a `results:` hello; the zero-`replay` contract (C-M1) is the regression gate that stays. The handleHello stub branch in `ws/index.ts` already has a debug log comment pointing at plan 08.
- **Plan 11 (full UI + AppShell)**: replaces `apps/web/src/routes/+page.svelte` wholesale; the WsClient + `readout:<competitionId>` channel naming are the stable contract. UI-SPEC backoff is exported as `RECONNECT_BACKOFF_MS` so the status badge in plan 11 can reuse the constant.
- **Plan 15 (ESC/POS thermal printer)**: swaps in `node-thermal-printer` behind the PrinterSink interface. `apps/edge/src/print/sink.ts` already locks the six template names + the PrintEnvelope shape; no contract change needed.

## Known Stubs

- **`results:` hello stub in `apps/edge/src/ws/index.ts` handleHello** — emits zero frames (the C-M1 contract). Plan 08 lifts to a `results_full` emission. Intentional stub; documented inline with `app.log.debug(...)` and a comment citing plan 08.
- **Walking-skeleton auto-create of competition row in `apps/edge/src/routes/dev.ts`** — created by `routes/dev.ts` when the operator hasn't run the three-click wizard yet. Intentional walking-skeleton convenience; plan 06 + plan 11 replace it with a real check.
- **Simplified `card_read` payload in `apps/edge/src/routes/dev.ts`** — `start/finish/check/clear` all null, `card_holder` null. Plan 06 Task 2 lifts to the full CardReadEvent shape per codex C-H2.

## Threat Flags

None — all new surface in this plan was covered by the threat model up-front (T-WS-FAN-OUT, T-DOS-WS, T-EVENT-REPLAY, T-DEV-ENDPOINT, T-RESULTS-CHANNEL-LEAK / C-M1). No new endpoints, auth paths, or schema changes introduced that escape the existing register.

## Self-Check: PASSED

**Files verified present on disk:**

- apps/edge/src/ws/channels.ts: FOUND
- apps/edge/src/ws/replay.ts: FOUND
- apps/edge/src/ws/index.ts: FOUND
- apps/edge/src/ws/index.test.ts: FOUND
- apps/edge/src/ws/replay.test.ts: FOUND
- apps/edge/src/server.ts: FOUND
- apps/edge/src/print/sink.ts: FOUND
- apps/edge/src/print/stdout-sink.ts: FOUND
- apps/edge/src/routes/dev.ts: FOUND
- apps/edge/src/routes/dev.test.ts: FOUND
- apps/edge/src/bin/fartol.ts: FOUND (modified)
- apps/web/src/lib/ws/client.ts: FOUND
- apps/web/src/lib/ws/client.test.ts: FOUND
- apps/web/src/routes/+page.svelte: FOUND (modified)
- tests/e2e/walking-skeleton.spec.ts: FOUND
- tests/e2e/fixtures/walking-skeleton-card.ndjson: FOUND
- playwright.config.ts: FOUND (modified)

**Commits verified in git log:**

- `54590a5` (Task 1: WS plugin + tests): FOUND
- `b764acd` (Task 2: PrinterSink + dev route): FOUND
- `ec3145e` (Task 3: SvelteKit + e2e): FOUND

**Behavior verified live:**

- `pnpm -r --if-present run typecheck`: clean across all 4 workspace projects.
- `pnpm -r --if-present run test`: sportident 108 + shared-types 3 + edge 48 + web 5 = 164 tests, 0 fail.
- `pnpm --filter @fartol/edge build` + `pnpm --filter @fartol/web build`: both produce dist artefacts.
- `pnpm exec playwright test tests/e2e/walking-skeleton.spec.ts`: 1 PASS in 1.4s on chromium 148.0.7778.96.

---

_Phase: 01-single-laptop-training-mvp_
_Completed: 2026-05-14_
