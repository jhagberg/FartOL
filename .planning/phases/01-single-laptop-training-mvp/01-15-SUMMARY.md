---
phase: 01-single-laptop-training-mvp
plan: 15
subsystem: print
tags: [escpos, thermal-print, receipt, hardware, sharp, auto-print, c-m2, w-3, kids-svg-bitmap]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides:
      - plan 03 PrinterSink interface (PATTERNS S-2; PrintEnvelope locked surface)
      - plan 04 receipt_template + auto_print columns (competitions table)
      - plan 06 SI bridge (card_read handler insertion point for auto-print)
      - plan 07 CompetitorView + ResultView (typed projection consumed by templates)
      - plan 08 ProjectionStore.recomputeNow (sync) — the C-M2 contract pivot
      - plan 11 typed REST client wrapper (printReceipt added here)
      - plan 13 Kids.svelte (UI mirror that informed the bitmap template)
provides:
  - createNodeThermalPrinterSink (production ESC/POS sink wrapping node-thermal-printer)
  - 6 server-side receipt templates (classic, standing, detailed, top4, minimal, kids)
  - POST /api/competitions/:id/print-receipt route
  - kids-svg-to-bitmap pipeline (skogis descriptor → SVG → sharp → PNG buffer)
  - Auto-print bridge wiring (card_read + auto_print=true → enqueueAutoPrint(400ms))
  - C-M2 LOCKED: enqueueAutoPrint calls projectionStore.recomputeNow synchronously before reading projection state
  - printReceipt() REST client helper + ReadoutView onPrintClick wiring
  - PATTERNS S-1 header on every new file
affects:
  - plan 16 (IOF XML 3.0 export — can now lean on the same control-codes ordered list helper if needed)
  - plan 17 (privacy scrub — PrintEnvelope is short-lived; no PII persists)
  - plan 18 (packaging — node-thermal-printer + sharp need libusb / libvips wheel for the bench laptop)

# Tech tracking
tech-stack:
  added:
    - node-thermal-printer@4.6.0
    - sharp@0.34.5
  patterns:
    - PATTERNS S-3 lazy native require: node-thermal-printer + sharp loaded INSIDE factory functions (escposDriver.ts buildPrinter, kids-svg-to-bitmap.ts generateKidsBitmap)
    - Single-flight FIFO queue with queueCap=50 (T-DOS-PRINT mitigation) — print() returns a Promise that resolves AFTER printer.execute() completes; concurrent callers serialize
    - W-3 envelope.data.skogisStats populated at construction site (route handler + auto-print bridge), kids template reads as a thin renderer
    - C-M2 await-recompute inside setTimeout callback — the explicit `recomputeNow(activeId)` call before envelope construction sidesteps the 50ms-debounced markDirty race at 400ms
    - Probe /dev/usb/lp{0..3} at print time (Pitfall 6) — handles operators who hotplug the printer mid-event-loop
    - ReceiptTemplate dispatcher pattern — single dispatcher table keyed by template name, each renderer is a pure (printer, data) => void function

key-files:
  created:
    - packages/shared-types/src/skogis.ts (moved from apps/web in Task 2a)
    - apps/edge/src/print/escposDriver.ts
    - apps/edge/src/print/escposDriver.test.ts
    - apps/edge/src/print/templates.ts
    - apps/edge/src/print/templates/classic.ts
    - apps/edge/src/print/templates/standing.ts
    - apps/edge/src/print/templates/detailed.ts
    - apps/edge/src/print/templates/top4.ts
    - apps/edge/src/print/templates/minimal.ts
    - apps/edge/src/print/templates/kids.ts
    - apps/edge/src/print/kids-svg-to-bitmap.ts
    - apps/edge/src/print/kids-svg-to-bitmap.test.ts
    - apps/edge/src/routes/print.ts
    - apps/edge/src/routes/print.test.ts
  modified:
    - apps/edge/package.json (node-thermal-printer + sharp deps)
    - apps/edge/src/bin/fartola.ts (PrinterSink selection + getCompetition for auto-print)
    - apps/edge/src/print/sink.ts (typed ReceiptData; PrintEnvelope.data stays `unknown` for plan-03 back-compat)
    - apps/edge/src/server.ts (register print route)
    - apps/edge/src/si/bridge.ts (auto-print enqueue path with C-M2 await-recompute)
    - apps/edge/src/si/bridge.test.ts (4 new auto-print tests)
    - apps/web/src/lib/skogis/skogis.ts (now a thin re-export from shared-types)
    - apps/web/src/lib/api/client.ts (printReceipt helper)
    - apps/web/src/lib/screens/ReadoutView.svelte (onPrintClick wires apiPrintReceipt)
    - packages/shared-types/src/index.ts (barrel-export skogis module)
    - pnpm-lock.yaml

key-decisions:
  - "Skogis function name kept as `skogisFromInput` (NOT renamed to `generateSkogis` as the plan body suggested). Renaming would force changes to plan-13's Kids.svelte + the 17 determinism tests in apps/web/src/lib/skogis/skogis.test.ts. Byte-for-byte mechanical move preserves the test corpus."
  - 'SkogisStats type alias added as a top-level export (was nested as SkogisDescriptor.stats) so the PrintEnvelope can thread `skogisStats?: SkogisStats` without dragging the full descriptor through the typed surface.'
  - 'PrintEnvelope.data stays `unknown` at the interface; ReceiptData is the production-side typed shape (cast at the renderer boundary). The plan-03 dev simulate-read still passes `{ punches }` — refining the interface field would have broken that path with no benefit.'
  - 'Half-day clock split derivation: a small `halfDayClockGapMs` helper in templates.ts derives cum / split times from `NdjsonPunch.{seconds_in_half_day, half_day}` against `CompetitorView.latest_start`. The reducer does not yet precompute per-leg splits — plan 16 (IOF XML) will land them, at which point the detailed.ts template can fill in the Rank/Lost columns currently rendered as `—`.'
  - 'Sharp lazy-required; on dev boxes without libvips the kids template catches the throw and emits a `[Skogis: <error>]` text placeholder. The kids-svg-to-bitmap test skips with `ctx.skip()` if libvips is unavailable so the test suite remains green on every dev box.'
  - "autoPrintDelayMs is exposed on BridgeOpts (default 400). Tests inject 0 instead of using node:test fake timers because mock.timers conflicts with the PlaybackTransport's setImmediate/setTimeout tick loop. Production 400ms remains hardcoded via the default."
  - 'Auto-print wiring lives inside the bridge (not the route handler) because the trigger is a card_read event, not an HTTP request. The bin passes printerSink + getCompetition + projectionStore to attachBridge; the bridge owns the C-M2 contract.'
  - 'C-M2 unknown-card handling: skip + stderr warning. Alternative (queue auto-print until walk-up completes) was rejected as too magical — operator can manually print after walk-up registration.'

patterns-established:
  - 'Production PrinterSink wraps a lazy-required native module behind a printerFactory injection point — tests never touch libusb / libvips; production uses createRequire(import.meta.url) inside buildPrinter.'
  - "Single-flight FIFO with queueCap: the sink owns the queue; the route handler's only responsibility is to map thrown error messages to HTTP status codes."
  - 'C-M2 await-recompute inside debounced flows: when a triggered action needs FRESH projection state, call `recomputeNow(id)` synchronously in the trigger callback rather than relying on the 50ms-debounced markDirty fan-out completing first.'
  - 'Pure template renderers reading from envelope.data.skogisStats — the deterministic-stats input is resolved ONCE at construction, then threaded through the envelope. No second skogisFromInput call inside the template (W-3 LOCKED).'

requirements-completed:
  - REQ-UI-004

# Metrics
duration: ~2h 20min
completed: 2026-05-14
---

# Phase 1 Plan 15: ESC/POS Thermal Driver + Auto-Print Summary

**Production escpos thermal printer driver (Star TSP143 default; Epson + Brother via env var) wrapping node-thermal-printer with a single-flight FIFO queue + 6 server-side templates + a kids template that rasterizes the procedural Skogis SVG via sharp + auto-print bridge wiring with the C-M2 await-recompute contract.**

## Performance

- **Duration:** ~2h 20min
- **Started:** 2026-05-14T18:27:00Z
- **Completed:** 2026-05-14T20:48:00Z
- **Tasks:** 3 (Task 2a Skogis move, Task 1 driver+route, Task 2b auto-print+kids+button)
- **Files created:** 14
- **Files modified:** 11
- **Tests added:** 6 escposDriver + 7 print route + 3 kids-svg-to-bitmap + 4 auto-print bridge = 20 new edge tests
- **Edge tests:** 226 → 246 (all pass)
- **Web tests:** 31 → 31 (all pass; skogis tests still green after the shared-types move)

## Accomplishments

- **ESC/POS driver (Task 1):** `createNodeThermalPrinterSink({ printerType, devicePath?, characterSet?, queueCap?, printerFactory? })` produces a `PrinterSink & { dispose() }`. PATTERNS S-3 lazy native require — node-thermal-printer is only required when `buildPrinter()` runs (NOT at module load). Single-flight FIFO queue serializes concurrent prints; queueCap=50 cap protects against runaway-loop DoS (T-DOS-PRINT). probePath() scans `/dev/usb/lp{0..3}` at print time (Pitfall 6) so the operator can hot-plug. printerFactory injection (PATTERNS S-2) lets tests exercise the queue + error-mapping without any native dep.
- **6 templates (Task 1):** classic (header → splits table → total → place), standing (large total → "PLATS X av Y" → leader gap), detailed (per-leg with placeholder Rank/Lost columns — plan 16 fills them), top4 (top-4 leaderboard + "Din placering" footer when this runner is outside top 4), minimal (big total + place line only), kids (SVG → PNG bitmap + FART/STIG/KART/TUR stat row). The `halfDayClockGapMs` helper in templates.ts derives cum / split times from the half-day clock fields on `NdjsonPunch`.
- **POST /api/competitions/:id/print-receipt (Task 1):** resolves competitor + class + course + projection + placeContext, populates `data.skogisStats` for kids at the construction site (W-3 LOCKED — template is a pure renderer), and dispatches to `app.printerSink`. Error mapping: `printer_offline` / `paper_out` → 503, `queue_full` → 429, anything else → 503 with `print_failed`.
- **Skogis to shared-types (Task 2a):** mechanical move of `apps/web/src/lib/skogis/skogis.ts` to `packages/shared-types/src/skogis.ts` with byte-for-byte parity (the 17 determinism tests still pass without re-baselining). Added a top-level `SkogisStats` type alias so the PrintEnvelope can thread stats without importing the full descriptor. The apps/web file is now a thin re-export so Kids.svelte + the determinism tests compile unchanged.
- **Kids SVG → PNG pipeline (Task 2b):** `descriptorToSvgString(d)` builds a minimal mono-printable SVG (body + ears + eyes + mouth + accessory; everything `stroke="#000"` or `fill="#fff"`); `generateKidsBitmap(input)` invokes skogisFromInput, builds the SVG, and rasterizes via sharp at 384px wide (80mm thermal column at 8 dots/mm). Sharp is lazy-required — dev boxes without libvips get a friendly placeholder + skipped tests.
- **Auto-print bridge wiring (Task 2b):** `attachBridge` BridgeOpts now accepts optional `printerSink`, `getCompetition`, and `autoPrintDelayMs`. The `onCardRead` handler enqueues a `setTimeout(..., 400)` that calls `enqueueAutoPrint(activeId, card.cardNumber)` when `activeCompetitionId !== null AND comp.auto_print === true`. C-M2 contract enforced: the callback calls `projectionStore.recomputeNow(activeId)` synchronously BEFORE building the envelope; unknown-card race is handled by skipping the print with a stderr warning. Pending timeouts cleared on `detach()` so test teardown + bridge tear-down don't leak timers.
- **ReadoutView print button (Task 2b):** `onPrintClick` reads `latestReadProp.competitorId` and POSTs to the route via the new `apiPrintReceipt(...)` client helper. Optimistic toast on click; failures surface as a "Utskrift misslyckades" toast (UI-SPEC §"Error states"). Keyboard 'P' shortcut wires through the same handler.

## Task Commits

Each chunk was committed atomically:

1. **Task 2a — Skogis move to shared-types (mechanical):** `8d5e5a3` (refactor)
2. **Task 1 — ESC/POS driver + 6 templates + print route:** `baf64a8` (feat)
3. **Task 2b — auto-print bridge + kids bitmap test + readout button:** `afd1035` (feat)

## C-M2 Confirmation

The auto-print path calls `projectionStore.recomputeNow(activeId)` synchronously inside the 400ms setTimeout callback BEFORE building the PrintEnvelope. The `apps/edge/src/si/bridge.test.ts` adds two regression gates:

1. **"auto-print fires when auto_print=true and competitor is known"** — seeds a competitor matching the SI10 fixture's card (7501853), replays through the bridge with `auto_print=true`, asserts `printerSink.print` was called once with `envelope.data.competitor.id === 'cmp-anna'` (proving the post-recompute projection sees the just-read card).
2. **"C-M2: auto-print skipped + stderr warning when card is unknown"** — does NOT seed a competitor for the SI10 fixture's card, replays through the bridge with `auto_print=true`, asserts `printerSink.print` was NOT called AND `process.stderr.write` was called with a string containing `'auto-print skipped'` AND the card number `7501853`.

Both tests pass. The recomputeNow API is synchronous in plan 08, so the C-M2 contract is purely structural (no `await` needed); if a future refactor makes recomputeNow async, the call site is already a single-statement boundary that swapping to `await` covers.

## Fake-timer Decision

Plan body proposed `mock.timers.enable({ apis: ['setTimeout'] })` for deterministic 400ms simulation. Implementation chose the simpler `autoPrintDelayMs=0` injection because node:test mock.timers conflicts with the PlaybackTransport's setImmediate / setTimeout tick loop that drives the SiMainStation handshake. With delay=0 plus a real 50ms `await new Promise(r => setTimeout(r, 50))` after `pumpRemaining()`, the pending auto-print callback fires before the assertions run. Production 400ms is the BridgeOpts default — covered structurally by the codepath and by the bench-smoke step in the plan's manual verification.

## Native Module Notes

- **node-thermal-printer 4.6.0:** No native build step; ships with TypeScript declarations. Loaded lazily inside `escposDriver.buildPrinter` so unrelated edge tests + the bin's `--no-bridge` boot don't pay the require cost.
- **sharp 0.34.5:** Loaded lazily inside `kids-svg-to-bitmap.generateKidsBitmap`. On the Linux dev box (Ubuntu 24.10 / kernel 6.17 / glibc 2.39) libvips is bundled in the npm prebuild — no system install needed. The kids template wraps the call in a try/catch so a missing libvips on a future arch (e.g. Linux ARM64 without prebuilds) degrades gracefully to a text placeholder.
- **No /dev/usb/lp\* on the CI / dev box:** All 6 escposDriver tests inject a fake `printerFactory` so they never touch real USB. The `test 4: no /dev/usb/lp* + no factory → print rejects with printer_offline` confirms the probe-failure path.

## Quirks + Deviations

- **[Rule 3 — Schema mismatch] Plan referenced `generateSkogis` returning `{ stats }`; actual function is `skogisFromInput` returning `SkogisDescriptor` with `stats: { fart, stig, kart, tur }`.** Aligned the move + downstream callers to the actual API. Added a `SkogisStats` type alias on the descriptor so the PrintEnvelope can declare `skogisStats?: SkogisStats` without dragging the full descriptor.
- **[Rule 3 — Schema mismatch] Plan suggested `NdjsonPunch.time_ms` — that field does not exist; the punch type carries `seconds_in_half_day + half_day` from the SI wire format.** Added `halfDayClockGapMs` helper to derive cum/split times by computing the modular delta against `CompetitorView.latest_start`. The detailed.ts template's "Rank" + "Lost" columns are placeholders (`—`) — plan 16 will land per-leg ranks on the reducer.
- **[Rule 3 — Back-compat] `PrintEnvelope.data: ReceiptData` was the original refinement; tightening broke the plan-03 dev simulate-read which passes `{ punches }`.** Reverted to `data: unknown` at the interface, kept `ReceiptData` as the production-side typed shape with a single cast at `escposDriver.print`'s render boundary. Documented inline.
- **[Rule 3 — Conventional commits subject case]** First commit attempt used "ESC/POS" in the subject which commitlint rejects as upper-case. Reworded to "add escpos thermal driver" + body explains.
- **Kids template's defensive try/catch around `generateKidsBitmap`** — wasn't in the plan body but added per Rule 2 (correctness): without it, a dev-box libvips outage would crash the entire print pipeline (one failed kids template → 503 for ALL templates because the kids module is statically imported by the templates dispatcher). The catch downgrades to a text placeholder so the rest of the receipt still emits.

## Verification

- **Edge tests:** 246 pass (226 before + 6 escposDriver + 7 print route + 3 kids-bitmap + 4 auto-print).
- **Edge typecheck:** clean.
- **Edge lint:** clean (after fixing prettier + 1 unused import).
- **Edge build:** `pnpm --filter @fartola/edge build` produces `dist/server.mjs`, `dist/bin/fartola.mjs`, and DTS bundles.
- **Web tests:** 31 pass (all 17 skogis determinism tests still pass after the Task 2a move).
- **Web typecheck:** clean.
- **Web build:** `pnpm --filter @fartola/web build` still produces `apps/web/build/200.html`.
- **Sportident build:** clean.

## Bench-test Pending

This box has no Star TSP143 plugged in at `/dev/usb/lp0` so the physical-print smoke is gated to a Wave 5 verification task. The structural path is fully exercised by the 20 new tests + the auto-print bridge regression suite; the only thing the bench adds is ESC/POS byte-stream visual confirmation (paper alignment, encoding of å/ä/ö, Skogis raster resolution).

## Wave 5 Unblocked

- Plan 16 (IOF XML 3.0 export) can land per-leg splits on the reducer; the detailed.ts Rank/Lost placeholders auto-fill from the same projection.
- Plan 17 (privacy scrub) inherits the consent toast + scrubbed-at_ms semantics — no changes needed in print path.
- Plan 18 (packaging / install script) adds `apt install libvips42 libusb-1.0-0` + udev rule for `/dev/usb/lp*` (`lp` group membership). The plan-15 docs are already structured to point at plan 18 for the install instructions.

## Self-Check: PASSED

- packages/shared-types/src/skogis.ts: FOUND
- apps/edge/src/print/escposDriver.ts: FOUND
- apps/edge/src/print/templates.ts: FOUND
- apps/edge/src/print/templates/{classic,standing,detailed,top4,minimal,kids}.ts: FOUND
- apps/edge/src/print/kids-svg-to-bitmap.ts: FOUND
- apps/edge/src/routes/print.ts: FOUND
- apps/edge/src/print/escposDriver.test.ts: FOUND (6 tests)
- apps/edge/src/print/kids-svg-to-bitmap.test.ts: FOUND (3 tests)
- apps/edge/src/routes/print.test.ts: FOUND (7 tests)
- Commit 8d5e5a3 (Task 2a): FOUND
- Commit baf64a8 (Task 1): FOUND
- Commit afd1035 (Task 2b): FOUND
