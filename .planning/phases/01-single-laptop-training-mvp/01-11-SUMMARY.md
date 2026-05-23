---
phase: 01-single-laptop-training-mvp
plan: 11
subsystem: ui
tags: [svelte5, sveltekit, tokens, oklch, i18next, runes, design-system, tweaks, components]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp/01
    provides: SvelteKit app scaffold + adapter-static SPA + 200.html fallback
  - phase: 01-single-laptop-training-mvp/03
    provides: WsClient with hello-replay + LOCKED reconnect backoff
provides:
  - Locked oklch design-token surface (--bg, --accent, --ok/mp/dnf/pend, --hit, spacing scale)
  - Synchronous i18next bootstrap with 149-key sv + en catalogs (no flash of English)
  - Svelte 5 runes Tweaks store with localStorage persistence + applyTweaksToRoot helper
  - 7 layout components (AppShell, Sidebar, NavItem, TopBar, Clock, BrandMark, StationCard)
  - 10 UI primitives (Button, Input, Select, Field, Card, Modal, StatusPill, PulseDot, Toast, Kbd)
  - Operator-facing TweaksPanel with 5 LOCKED controls + dev-only Simulate-read button
  - Typed REST client (api/client.ts) covering all 20 Phase 1 endpoints with ApiError wrapper
  - +layout.svelte wires tokens.css + fonts.css + i18n + AppShell + TweaksPanel + tweaks→root $effect
affects: [01-12 home + wizard, 01-13 readout view, 01-14 walk-up + results, 01-15 receipt printing]

# Tech tracking
tech-stack:
  added:
    - i18next@^26.1.0
  patterns:
    - 'Svelte 5 runes in .svelte.ts modules (compiler rewrites $state into $.state proxy)'
    - 'Synchronous i18n init via side-effect import in +layout.svelte (Pitfall 10 mitigation)'
    - 'data-* attributes on <html> drive token overrides (data-accent / data-density / data-font-pair)'
    - 'ApiError carries { status, body, text } so callers branch without re-parsing'

key-files:
  created:
    - apps/web/src/lib/layout/AppShell.svelte
    - apps/web/src/lib/layout/Sidebar.svelte
    - apps/web/src/lib/layout/NavItem.svelte
    - apps/web/src/lib/layout/TopBar.svelte
    - apps/web/src/lib/layout/Clock.svelte
    - apps/web/src/lib/layout/BrandMark.svelte
    - apps/web/src/lib/layout/StationCard.svelte
    - apps/web/src/lib/ui/Button.svelte
    - apps/web/src/lib/ui/Input.svelte
    - apps/web/src/lib/ui/Select.svelte
    - apps/web/src/lib/ui/Field.svelte
    - apps/web/src/lib/ui/Card.svelte
    - apps/web/src/lib/ui/Modal.svelte
    - apps/web/src/lib/ui/StatusPill.svelte
    - apps/web/src/lib/ui/PulseDot.svelte
    - apps/web/src/lib/ui/Toast.svelte
    - apps/web/src/lib/ui/Kbd.svelte
    - apps/web/src/lib/components/TweaksPanel.svelte
    - apps/web/src/lib/api/client.ts
  modified:
    - apps/web/src/routes/+layout.svelte
    - apps/web/src/lib/tokens.css # (committed in Task 1, 9449474)
    - apps/web/src/lib/styles/fonts.css # (committed in Task 1, 9449474)
    - apps/web/src/lib/i18n/sv.json # (committed in Task 1, 9449474)
    - apps/web/src/lib/i18n/en.json # (committed in Task 1, 9449474)
    - apps/web/src/lib/i18n/index.ts # (committed in Task 1, 9449474)
    - apps/web/src/lib/stores/tweaks.svelte.ts # (committed in Task 1, 9449474)
    - apps/web/package.json # (committed in Task 1 — i18next dep)

key-decisions:
  - 'i18n import path uses .ts extensions explicitly (matches project convention from shared-types)'
  - '+layout.svelte does not own a top-level WsClient — +page.svelte for the walking-skeleton retains its own; plans 12-14 wire route-scoped WS state where it matters'
  - 'TweaksPanel is a Modal rather than a slide-over — single Esc-to-close path keeps interaction model consistent with future wizard / walk-up modals'
  - "Accent swatches use raw oklch() literals in inline CSS (not tokens) so the swatch shows the underlying hue even when the operator hasn't switched accents yet"
  - 'ApiError surface (status + body + text) — callers can branch on status code without re-parsing; richer than a thrown string'
  - 'Manifest icon-192/512 PNGs deferred to Phase 1.5 (manifest.webmanifest is untouched this plan — out of scope; design surface only)'

patterns-established:
  - 'Layout components forward state down via props rather than reading a singleton store — keeps AppShell/Sidebar/TopBar pure structural'
  - 'PulseDot variant prop binds to a status enum + a derived label via $derived'
  - 'Components named `*.svelte` use HTML-comment PATTERNS S-1 header; `.svelte.ts` modules use JS-comment header'
  - 'Side-effect import for synchronous i18n bootstrap (avoids the flash-of-English Pitfall 10 trap)'

requirements-completed: [REQ-UI-001, REQ-UI-006, REQ-UI-007]

# Metrics
duration: ~35 min (resumed from quota-exhausted prior subagent at Task 2 mid-point)
completed: 2026-05-14
---

# Phase 01 Plan 11: SvelteKit shell foundation Summary

**Locked oklch design-token surface + Svelte 5 runes Tweaks store + 17 layout/primitive components + TweaksPanel + typed REST client wired into +layout.svelte — Plans 12-14 can compose Home/Wizard/Readout/Walk-up/Results screens without touching the visual contract**

## Performance

- **Duration:** ~35 min (resumed mid-plan from a quota-exhausted prior subagent)
- **Started:** 2026-05-14T17:14Z (Task 1, prior subagent)
- **Completed:** 2026-05-14T17:24Z
- **Tasks:** 2 (both completed)
- **Files created/modified:** 27 in plan 11 total (8 from Task 1's prior commit + 19 from Task 2 + +layout.svelte modification)

## Accomplishments

- 7 layout components: AppShell (240px sidebar + 56px topbar grid), Sidebar, NavItem (44px tap-target with active-state accent left-bar), TopBar (WS-status PulseDot + Clock), Clock (HH:MM:SS local wall-clock at 1Hz), BrandMark (orienteering control flag SVG — LOCKED per UI-SPEC §Visual Anchors), StationCard
- 10 UI primitives: Button (primary/ghost/danger × sm/md/lg, all `var(--hit)` tap-target), Input, Select, Field, Card (head/body snippets), Modal (Esc-to-close), StatusPill (OK/MP/DNF/PEND with soft+strong colour pairs), PulseDot (1.6s heartbeat × green/amber/red), Toast (top-right auto-dismiss), Kbd
- TweaksPanel with the 5 LOCKED operator controls (locale, density, accent, contrast, font-pair) + dev-only Simulate-read button gated on `import.meta.env.DEV || URLSearchParams.has('dev')`
- Typed REST client at `apps/web/src/lib/api/client.ts` — 20 functions covering competitions, classes, courses, competitors, manual-DNF, un-DNF, import, readout, results, clubs, sessions, dev simulate-read; throws `ApiError { status, body, text }` on non-2xx
- +layout.svelte now imports tokens.css + fonts.css + i18n bootstrap (side-effect — synchronous init per RESEARCH §Pitfall 10), wraps children in `<AppShell>`, mounts `<TweaksPanel>`, and runs a `$effect` mirroring tweaks store onto `<html data-accent/density/font-pair>` so tokens.css attribute selectors pick up overrides
- All 14 web vitest tests pass; `pnpm build` produces `apps/web/build/200.html`

## Task Commits

Plan 01-11 commits on `gsd/phase-1-training-mvp`:

1. **Task 1: tokens + i18n + tweaks store** — `9449474` (feat — landed by prior subagent before quota exhaustion)
2. **Task 2 (a): layout components** — `b83b79c` (feat — 7 layout components)
3. **Task 2 (b): UI primitives** — `ff133a4` (feat — 10 UI primitives)
4. **Task 2 (c): TweaksPanel + api client + +layout wiring** — `ea9c06c` (feat — closes plan 11)

**Plan metadata:** TBD (commit alongside SUMMARY.md write)

## Files Created/Modified

### Task 2 (a) — Layout components (commit b83b79c)

- `apps/web/src/lib/layout/AppShell.svelte` — Two-column grid (240px sidebar / 1fr) + 56px topbar; forwards route/onNavigate/wsStatus/stationStatus props down
- `apps/web/src/lib/layout/Sidebar.svelte` — BrandMark + 5 nav items (Tävlingar/Avläsning/Resultat/Export/Inställningar) + StationCard footer + version line
- `apps/web/src/lib/layout/NavItem.svelte` — Active-state accent left-bar + soft background; min-height var(--hit)
- `apps/web/src/lib/layout/TopBar.svelte` — Optional crumb snippet + WS PulseDot + Clock; variant maps open/connecting/closed → green/amber/red
- `apps/web/src/lib/layout/Clock.svelte` — HH:MM:SS local wall-clock ticking at 1Hz inside onMount (cleanup via returned function)
- `apps/web/src/lib/layout/BrandMark.svelte` — Orienteering control flag SVG (rotated diamond, white + #F36F21, 1.4px stroke #1a1a1a)
- `apps/web/src/lib/layout/StationCard.svelte` — SI-bridge status card (online/connecting/offline) with PulseDot

### Task 2 (b) — UI primitives (commit ff133a4)

- `apps/web/src/lib/ui/Button.svelte` — variants primary/ghost/danger × sizes sm/md/lg; min-height var(--hit)
- `apps/web/src/lib/ui/Input.svelte` — native input wrapper; 16px font (iOS no-zoom); var(--hit) height
- `apps/web/src/lib/ui/Select.svelte` — token-styled native select
- `apps/web/src/lib/ui/Field.svelte` — label + slot + optional hint, 6px gap
- `apps/web/src/lib/ui/Card.svelte` — head + body + foot snippets with fallback children slot
- `apps/web/src/lib/ui/Modal.svelte` — scrim + dialog; Esc-to-close via `<svelte:window on:keydown>`
- `apps/web/src/lib/ui/StatusPill.svelte` — OK/MP/DNF/PEND with soft+strong colour pairs; high-contrast adds 1.5px currentColor border
- `apps/web/src/lib/ui/PulseDot.svelte` — 1.6s heartbeat × green/amber/red
- `apps/web/src/lib/ui/Toast.svelte` — top-right auto-dismiss (2s default, 5s extended)
- `apps/web/src/lib/ui/Kbd.svelte` — keyboard-key hint, monospace, sm

### Task 2 (c) — Panel + client + layout (commit ea9c06c)

- `apps/web/src/lib/components/TweaksPanel.svelte` — 5 LOCKED operator controls + dev-only Simulate-read
- `apps/web/src/lib/api/client.ts` — 20 typed REST functions + `ApiError` class
- `apps/web/src/routes/+layout.svelte` — imports tokens + fonts + i18n bootstrap; wraps `<AppShell>`; mounts `<TweaksPanel>`; $effect mirrors tweaks→html data-\* attrs

## Decisions Made

- **i18n imports use explicit `.ts` extensions** — matches the project's existing convention from shared-types (`./events.ts`, `./dtos.ts`); SvelteKit + Vite resolve them via the vite-plugin-svelte preprocessor.
- **+layout.svelte does NOT own a singleton WsClient.** The walking-skeleton +page.svelte already wires its own WsClient against `readout:walking-skeleton` (a synthetic competition_id). Plans 12-14 add per-route WsClient management when real competitions exist. Plan 11 stays purely visual.
- **TweaksPanel is a Modal, not a slide-over.** Single Esc-to-close interaction model carries over to the wizard (plan 12) and walk-up (plan 14) modals — consistent operator muscle memory.
- **Accent swatch buttons use raw `oklch(...)` literals in inline CSS** (not tokens) — the swatch needs to show the underlying hue regardless of which accent is currently active.
- **ApiError carries `{ status, body, text }`** so callers can branch on status code without re-parsing the response — richer than a thrown string, simpler than re-fetching headers.
- **Manifest icon-192/512 PNGs deferred to Phase 1.5.** Plan 11 is the design surface; `manifest.webmanifest` left untouched. Generating PNGs from the BrandMark SVG is a single-step `sharp`/`rsvg-convert` job for Phase 1.5.
- **Layout components forward props down rather than read singletons.** Keeps AppShell / Sidebar / TopBar pure structural — easier to test, easier for plans 12-14 to swap a part without churning the rest.

## Deviations from Plan

### Rule 1/2 — minor scope adjustments (all in-scope)

**1. [Rule 2 - Missing] Tweaks panel mounted in +layout.svelte rather than left for plans 12-14**

- **Found during:** Task 2 (TweaksPanel + +layout.svelte wiring)
- **Issue:** Plan said the TweaksPanel is "toggled from the topbar's Inställningar nav-item" but didn't specify which file mounts it. Without a mount, the panel can't be opened.
- **Fix:** +layout.svelte owns the `tweaksOpen` $state flag, mounts `<TweaksPanel open={tweaksOpen} onClose={...}>`, and the Sidebar's Inställningar NavItem calls `onOpenSettings()` which the +layout's AppShell prop sets to `tweaksOpen = true`.
- **Files modified:** apps/web/src/routes/+layout.svelte
- **Verification:** Typecheck passes; tests pass; tweaks-store state flow is end-to-end
- **Committed in:** ea9c06c

**2. [Rule 2 - Missing] Skipped top-level WsClient bootstrap in +layout.svelte**

- **Found during:** Task 2 (+layout.svelte wiring)
- **Issue:** Plan called for "Initializes a singleton `wsClient = new WsClient(...)` and `wsClient.connect()` on mount." But the existing +page.svelte (plan 03 walking-skeleton) already owns its own WsClient against `readout:walking-skeleton` — a synthetic competition_id. Adding a second singleton would duplicate connections and confuse the bridge.
- **Fix:** Deferred top-level WsClient ownership to plans 12-14 where the route-scoped WsClient wires to a real `readout:<competition_id>` after the operator selects an active competition. AppShell accepts `wsStatus?: WsStatus` prop with default 'closed' so the PulseDot shows red until plans 12-14 wire real state.
- **Files modified:** apps/web/src/routes/+layout.svelte (decision documented in component header)
- **Verification:** Existing +page.svelte still passes its WsClient tests (ws/client.test.ts, 4 tests)

**3. [Rule 1 - Scope] Manifest icons left for Phase 1.5**

- **Found during:** Task 2 (manifest.webmanifest update)
- **Issue:** Plan called for "manifest references them. The executor may add SVG placeholders for icon-192.png and icon-512.png as actual PNGs derived from BrandMark.svelte's flag — or leave them as 404 entries." Generating PNGs requires sharp or rsvg-convert; placeholder PNGs would mislead lighthouse.
- **Fix:** Left manifest.webmanifest untouched. PNG generation deferred to Phase 1.5 (single-step `sharp` job from BrandMark.svelte). No regression — plan 01's manifest works as-is for SPA install.
- **Files modified:** None

---

**Total deviations:** 3 minor in-scope adjustments
**Impact on plan:** All deviations narrow scope to design-system-only as the plan's success criteria require. Plans 12-14 wire WS + manifest icons; plan 11 stays purely visual.

## Issues Encountered

- **Prior subagent quota exhaustion mid-Task-2:** The 17 layout + ui Svelte files were on disk but uncommitted. Verified each file against UI-SPEC §Component Inventory before committing. All files were complete and high-quality (PATTERNS S-1 headers present, Svelte 5 runes properly used, `var(--hit)` tap-targets, no hardcoded colors). Two atomic commits (b83b79c + ff133a4) captured them.
- **Prettier formatting on api/client.ts** — initial commit blocked by pre-commit prettier hook; ran `pnpm exec prettier --write` to fix minor wrapping; commit landed clean on retry.
- **commitlint header-max-length** — first attempt at the UI primitives commit had a 111-char header (commitlint limit is 100). Shortened to "feat(01-11): add 10 UI primitives (Button, Input, Modal, StatusPill, PulseDot, ...)".

## Verification

- `pnpm --filter @fartola/web typecheck` — passes (svelte-kit sync + tsc --noEmit)
- `pnpm --filter @fartola/web test` — 14/14 tests pass (ws/client 4, smoke 1, i18n 4, tweaks 5)
- `pnpm --filter @fartola/web build` — succeeds; `apps/web/build/200.html` present
- i18n parity: 149 keys in sv.json, 149 keys in en.json (full parity test in i18n.test.ts asserts this on every run)

## User Setup Required

None — no external services. Phase 1 stays localhost-only.

## Next Phase Readiness

Plans 12-14 are unblocked:

- **Plan 12 (Home + Wizard):** Uses `<AppShell>`, `<Card>`, `<Modal>`, `<Field>`, `<Input>`, `<Select>`, `<Button>`, `t()`, `listCompetitions`, `createCompetitionFromWizard`. All primitives + REST client are ready.
- **Plan 13 (Readout view):** Uses `<StatusPill>`, `<StationCard>`, `<PulseDot>`, `<Toast>`, `getReadout`, `manualDnf`, `unDnf`. Density toggle on tweaks store is wired — readout typography respects `[data-density]` automatically.
- **Plan 14 (Walk-up + Results):** Uses `<Modal>`, `<Field>`, `<Input>`, `listClubs`, `createCompetitor` (walk-up + replace-card modes), `getResults`. ApiError handles 422 validation surface so the walk-up form can show field-level errors.

Owned next-phase blockers: none. The PWA manifest icons (Phase 1.5) and route-scoped WS bootstrap (plans 12-14) are tracked as deviations 2 + 3 above.

## Self-Check: PASSED

Verified each commit hash exists in `git log`:

- 9449474 (Task 1, prior subagent) — present
- b83b79c (Task 2 layout) — present
- ff133a4 (Task 2 primitives) — present
- ea9c06c (Task 2 closing — panel + client + layout) — present

Verified each created file exists on disk (19 new files + 1 modified +layout.svelte).

Verified `pnpm --filter @fartola/web typecheck && pnpm --filter @fartola/web test` exits 0 with 14/14 tests green.

---

_Phase: 01-single-laptop-training-mvp_
_Plan: 11_
_Completed: 2026-05-14_
