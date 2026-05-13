---
phase: 0
reviewers: [codex, gemini]
reviewed_at: 2026-05-12T19:50:00Z
revised_reviewed_at: 2026-05-12T20:20:00Z
plans_reviewed:
  - 00-01-PLAN.md
  - 00-02-PLAN.md
  - 00-03-PLAN.md
  - 00-04-PLAN.md
  - 00-05-PLAN.md
  - 00-06-PLAN.md
codex_cli_version: codex-cli 0.130.0
gemini_model: gemini-3-pro (via web-API hack)
review_sequence: codex (pre-revision) → planner revisions → gemini (post-revision second opinion)
---

# Cross-AI Plan Review — Phase 0

## Codex Review

**Summary**

Overall, the plan set is unusually thorough and has the right high-level shape: scaffold, protocol, decoders, transport, output contract, then hardware proof. The main risk is not missing ambition, but over-specifying some mechanics before the low-level contract is stable. The highest-risk gaps are the parser error channel, modern-card station-read coverage, `--record/--replay` determinism, and a few intra-plan dependency contradictions that will likely make later waves brittle.

**Strengths**

- Clear wave ordering from pure protocol to hardware smoke, with CI-only tests separated from manual hardware verification.
- Good preservation of the key SportIdent risks: non-standard CRC, ACK/NAK/WAKEUP handling, SI5 legacy layout, SIAC range-based TODO.
- Strong fixture strategy in principle: upstream fixtures first, Jonas hardware fixtures last.
- NDJSON contract is well-scoped for Phase 1: `schema_version`, `ts_ms`, snake_case fields, machine-readable `frame_error`.
- Fake transport tests are the right approach for CI; real `/dev/ttyUSB0` is correctly kept out of automated tests.
- Human checkpoints in Plan 06 are appropriate. Hardware proof cannot be fully autonomous.

**Concerns**

- **HIGH — Parser errors are not structured early enough.** Plan 02 says bad CRC "`console.warns once`", and Plan 04/05 later try to "capture" or parse `console.warn`. That is brittle and conflicts with the stdout/stderr purity goal. Add `parseAll(input, { onFrameError })` or return `{messages, remainder, errors}` in Plan 02.

- **HIGH — Modern card read path is under-tested.** Plan 04 only proves "`SI5 insertion path`". Phase 0 success depends on SI9/SI10/SIAC via `GET_SI8`; decoder-only tests in Plan 03 do not prove the station page-read sequence, response slicing, or `SI8_DET` dispatch.

- **HIGH — Plan 03 may encode the modern punch-page chain incorrectly.** It says "`read page 0; if punchCount <= 32, done`", while the research says punches live on pages 4-7. Acceptance should explicitly assert a modern card with punches requests page 4 at minimum.

- **HIGH — SI5 range registration looks dangerous.** Plan 03 suggests `registerNumberRange(0, 8_000_000, SiCard5)`, which overlaps SI9/SI10. If the registry is global and first-match, modern cards can be misclassified. Either separate registries by detection command or use exact upstream non-overlapping behavior.

- **HIGH — Plan 04 task ordering can fail typecheck.** Task 1 wants `SerialTransport` to reject with `DeviceClosedError`, but that class is only introduced in Task 2. Move shared errors into `transport/errors.ts` or create them before `SerialTransport`.

- **HIGH — `--record/--replay` is not deterministic as written.** Plan 06 records only inbound raw bytes, but replay through `SiMainStation` needs send/response sequencing. A fake transport cannot know when to release each captured response unless the transcript records direction and chunk boundaries, or the smoke records one command-response script.

- **HIGH — Plan 06 contradicts itself on record path validation.** `record.test.ts` writes under `/tmp`, but the action says reject any basename outside `process.cwd()`. That test will fail unless the allowed roots are explicit.

- **HIGH — Single-session smoke does not naturally create per-card fixtures.** Plan 06 records one `smoke-<ts>` session containing all four cards, then says to copy into `{si5,si9,si10,siac}-jonas-001`. Splitting by card is unspecified. Prefer one `--record --once` invocation per card.

- **MEDIUM — CI workflow has a likely invalid pnpm setup expression.** Plan 01 suggests `version: ${{ packageManager.split('@')[1] }}`. GitHub Actions will not have a `packageManager` variable by default. Pin the pnpm version or use Corepack.

- **MEDIUM — D-01 conflict on workspaces.** Context says "defer pnpm workspaces to Phase 1", but Plan 01 creates `pnpm-workspace.yaml`. This may be pragmatic, but it should be called out as an intentional deviation.

- **MEDIUM — WAKEUP behavior is underspecified.** Research says upstream prepends `WAKEUP` before every command. Plan 04 only clearly sends it during initial handshake. Make `sendMessage()` centrally write `[WAKEUP, ...render(message)]`.

- **MEDIUM — tsup output filenames may not match package `bin`.** Plan 01/05 expect `dist/bin/fartol-readout.cjs`. Ensure `tsup.config.ts` sets `outExtension` explicitly for `.mjs`/`.cjs`.

- **MEDIUM — MIT attribution is partly enforced by grep, but incompletely.** Acceptance checks a few files, not all ported files and fixtures. Add a small script/check that scans all `src/**` and `tests/fixtures/upstream/**` files that are copied from upstream.

- **LOW — Threat models contain some theatre.** Parser DoS, pending send aborts, PII, and record path traversal are real. Commit-message "spoofing", CRC timing, and registry tampering are mostly noise for this phase.

**Suggestions**

- Change Plan 02's parser contract now to emit structured frame errors; remove all later `console.warn` interception.
- Add Plan 04 station tests for `SI8_DET` with SI9, SI10, and SIAC, including expected `GET_SI8` page requests.
- Add a modern-card fixture with more than 32 punches to prove multi-page reads.
- Resolve the SI5/modern registry design before implementation; acceptance should assert SI9/SI10/SIAC are never captured by SI5.
- Move shared transport errors into a small early file used by both `SerialTransport` and `SiSendTask`.
- Make `--record` capture a directional transcript, e.g. `out <hex>` / `in <hex>`, or record one card per process and replay with response boundaries.
- Use a JSON parser in `hardware-smoke.sh` instead of grep key-order assumptions.
- Replace the real pre-commit verification commit in Plan 01 with `lefthook run pre-commit` and a non-mutating commitlint command.
- Explicitly document any deviation from D-01 if the workspace file stays in Phase 0.

**Risk Assessment**

Overall risk: **MEDIUM-HIGH**. The architecture is sound and the test strategy is directionally strong, but several high-leverage contracts are unstable: structured frame errors, modern-card station reads, record/replay transcript fidelity, and some build/CI details. Fixing those before execution would bring the plan set down to **MEDIUM** or **LOW-MEDIUM** risk without materially increasing scope.

---

## Gemini Review (post-revision second opinion)

**Reviewed:** the 6 plans AFTER planner addressed codex's 8 HIGH findings.
**Model:** gemini-3-pro
**Brief:** validate codex's fixes are substantial (not word-painting), surface what codex missed, check cross-plan invariants, residual-risk delta.

### 1. Spot-check of codex's 8 fixes
Ja, de är tekniskt verifierbara och påverkar arkitekturen, inte bara dokumentationen.
- **Fix 1 (onFrameError):** Implementerad i Plan 02 (`siProtocol.ts`) och vidarebefordrad i Plan 04/05. Detta tar bort behovet av skör "monkey-patching" av `console.warn`.
- **Fix 3 & 4 (Registries/Page 4):** Plan 03 separerar `si5DetectionRegistry` och `si8DetectionRegistry`. Detta är kritiskt eftersom SI5 och SI8-kommandon kan returnera krockande ID-rymder. Att tvinga fram Page 4-läsning för moderna kort är korrekt enligt protokollet för att få ut alla stämplingar.
- **Fix 6 (Directional transcript):** Plan 06 implementerar `out <hex>` / `in <hex>`. Utan detta är replay-tester värdelösa för race-condition-detektering.
- **Fix 8 (--once per kort):** Plan 06's smoke script kör 4 separata processer. Säkrare "clean slate"-metod än att klippa i en lång NDJSON-logg.

### 2. What Codex Missed (Gemini's independent findings)

- **MEDIUM — Receive buffer overflow.** I Plan 04 (`SiTargetMultiplexer.ts`) ackumuleras bytes i `receiveBuffer`. Om en enhet (eller brus) skickar oändligt med data utan STX/ETX kommer Node-processen till slut att krascha på minne. *Rekommendation:* Hård gräns (t.ex. 64 KB) som rensar buffer + kastar `frame_error: "overflow"` när den överskrids.

- **MEDIUM — Zombie processes on serialport hang.** Om hårdvaran kopplas ur mitt under en async `typeSpecificRead` kan kvarvarande `sendMessage`-promiser "hänga" om inte `transport.on('close')` proaktivt avbryter kön. *Status:* Delvis täckt i Plan 04 (SiSendTask abort), men säkerställ att queue-rejection faktiskt händer vid transport-close — annars hänger `bin/fartol-readout` kvar trots urkoppling.

- **LOW (Phase 1 gap) — Timestamp semantics card-vs-host.** Plan 05 blandar host-tid (`ts_ms`) med kort-tid (`seconds_in_half_day`). Vid midnatt-passering / orienteringstävlingar över flera dagar räcker inte `half_day` för att korrelera stämplingar utan en referenspunkt. Acceptabelt för Phase 0; flagga som "Phase 1 gap".

### 3. Cross-plan invariants (Drift-check)
Kontrakten ser stabila ut genom kedjan:
- **`parseAll` signature:** Plan 02 definierar, Plan 04 konsumerar, Plan 05 testar. Ingen drift.
- **Error types:** Plan 04 introducerar `transport/errors.ts` som Task 0 — utmärkt för att undvika cirkulära beroenden mellan `SerialTransport` och `SiSendTask`.
- **NDJSON namn:** Snake_case (`card_number`, `card_type`) hålls konsekvent i Plan 05.

### 4. Residual Risk post-revision
**LOW / MEDIUM.** Största kvarvarande risken är **hårdvaruspecifik**. CP210x-drivrutiner på Linux kan kräva en "Wakeup-burst" (skicka 0xFF flera gånger) efter att porten öppnats för att väcka BSM8 från strömsparläge. Plan 04's centrala WAKEUP-prepending täcker detta men kan kräva finjustering i Plan 06 hardware smoke.

### 5. Bottom Line
**Kör `/gsd-execute-phase 0` nu.** Fix-listan är redan inarbetad i planerna (codex-concerns + verifierat av plan-checker). Gemini's tillägg om buffer-overflow och zombie-processer är små kodändringar som kan hanteras under exekvering av Plan 04/06. Planerna är ovanligt mogna för en greenfield-port.

**Sista check innan start:** Säkerställ att lokal användare är med i `dialout`-gruppen (vanligaste orsaken till att Phase 0-projekt dör vid första hårdvarutestet — redan verifierat i RESEARCH.md bench check, men värt att re-confirma vid körning).

---

## Consensus Summary

Two reviewers: codex (pre-revision) and gemini-3-pro (post-revision).

### Agreed Strengths (both reviewers)

- Wave ordering is sound (protocol → decoders → transport → output → hardware proof).
- `transport/errors.ts` as Task 0 in Plan 04 correctly avoids circular dependencies.
- Directional `out <hex>` / `in <hex>` record transcript (post-revision) makes replay deterministic.
- Per-card `--record --once` smoke (post-revision) is a clean fixture-capture strategy.

### Status After Revision

| Codex HIGH finding | Status (per gemini spot-check) |
|---|---|
| #1 parseAll callback | VERIFIED FIXED |
| #2 modern station tests | VERIFIED FIXED |
| #3 page-4 punch chain | VERIFIED FIXED |
| #4 SI5/SI8 registry split | VERIFIED FIXED |
| #5 transport/errors.ts Task 0 | VERIFIED FIXED |
| #6 directional transcript | VERIFIED FIXED |
| #7 allowedRoots path validation | VERIFIED FIXED |
| #8 per-card --record --once | VERIFIED FIXED |

### New Findings (gemini, post-revision)

- **MEDIUM** — Receive buffer overflow (Plan 04 `SiTargetMultiplexer.receiveBuffer`)
- **MEDIUM** — Zombie processes on serialport hang (Plan 04 SiSendTask close-rejection)
- **LOW (Phase 1 gap)** — Timestamp semantics (card half_day vs host ts_ms)

### Combined Risk Assessment

- Codex pre-revision: MEDIUM-HIGH
- Gemini post-revision: LOW–MEDIUM
- Two new MEDIUM findings can be addressed inline during Plan 04 execution; not blockers.

### Original Codex's Highest-Priority Concerns (now historical — all VERIFIED FIXED)

1. **Plan 02 frame-error channel** is `console.warn`-based; Plan 04/05 then try to intercept it. Replace with a structured `parseAll(input, { onFrameError })` callback or `{messages, errors}` return — fixes brittleness across 3 plans with one contract change.
2. **Modern-card station-read path under-tested in Plan 04.** Decoder tests (Plan 03) don't prove the `GET_SI8` page sequence, response slicing, or `SI8_DET` dispatch. Add station-level tests for SI9/SI10/SIAC.
3. **Plan 03 may mis-encode the modern punch-page chain.** Research says punches live on pages 4-7; plan says "read page 0; done if punchCount ≤ 32". Acceptance must assert page 4 is requested when a card has punches.
4. **SI5 range registration overlaps SI9/SI10** (Plan 03 says `registerNumberRange(0, 8_000_000, SiCard5)`). Risk of misclassifying modern cards. Either separate registries by detection command, or match upstream's non-overlapping behavior exactly.
5. **Plan 04 task ordering will fail typecheck** — Task 1 references `DeviceClosedError`, which Task 2 introduces. Move shared errors into `transport/errors.ts` before `SerialTransport`.
6. **`--record/--replay` non-determinism** (Plan 06) — only inbound bytes captured, but replay needs send/response sequencing. Record a directional transcript or one card per process.
7. **Plan 06 path-validation contradiction** — record.test.ts writes to `/tmp`, but action rejects non-cwd basenames.
8. **Single-session smoke doesn't split per-card fixtures.** Plan 06 records all 4 cards in one session then says "copy into {si5,si9,si10,siac}-jonas-001" without specifying how. Use `--record --once` per card instead.

### Divergent Views

N/A — single reviewer.

---

## Next Steps

To incorporate these concerns into the plans:

```
/gsd-plan-phase 0 --reviews
```

The `--reviews` flag instructs the planner to read this REVIEWS.md and produce targeted plan revisions addressing each HIGH-severity concern.

To add more reviewer perspectives before replanning:

```
/gsd-review --phase 0 --gemini --claude
```

(Each adds the corresponding CLI's review under a new section in this file.)
