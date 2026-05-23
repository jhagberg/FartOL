---
phase: 00-hardware-proof
plan: 01
subsystem: infra
tags: [pnpm, typescript, tsup, eslint, prettier, lefthook, commitlint, node-test, github-actions, corepack]

# Dependency graph
requires: []
provides:
  - pnpm workspace anchored at repo root (intentional D-01 deviation)
  - TypeScript strict toolchain (erasableSyntaxOnly + verbatimModuleSyntax + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
  - @fartola/sportident sub-package skeleton (MIT, ESM+CJS exports, fartola-readout bin path)
  - tsup config with explicit outExtension stub (codex review #12)
  - lefthook pre-commit + commit-msg hooks with commitlint conventional rules
  - GitHub Actions CI workflow on ubuntu-latest with Corepack-pinned pnpm (codex review #9)
  - 8 Wave 0 node:test placeholder files at the exact paths required by 00-VALIDATION.md
  - Fixture directories tests/fixtures/{upstream,jonas,synthetic}
  - scripts/hardware-smoke.sh stub (chmod +x, exit 2)
affects: [00-02, 00-03, 00-04, 00-05, 00-06, all future phases]

# Tech tracking
tech-stack:
  added:
    - pnpm@10.30.3 (D-03)
    - typescript@5.9.3 (D-02)
    - tsup@8.5.1 (D-05)
    - eslint@9.39.4 + typescript-eslint@8.59.3 (flat config)
    - prettier@3.8.3
    - lefthook@1.13.6 (D-08)
    - "@commitlint/cli@19.8.1 + @commitlint/config-conventional@19.8.1 (D-08)"
    - serialport@13.0.0 (declared in @fartola/sportident; D-09)
    - "@types/node@22.19.19"
    - globals@15.15.0
  patterns:
    - Single root tsconfig.json; sub-packages extend it via tsconfig.extends
    - Per-extension globals in ESLint flat config (.cjs/.mjs/.ts get the right Node globals)
    - Corepack-pinned pnpm in CI (auto-derives version from packageManager field — no drift possible)
    - test placeholders use test.skip() + a top-of-file comment naming the wave-owner plan

key-files:
  created:
    - package.json — root workspace, scripts (lint/typecheck/test/format/prepare), pnpm@10.30.3 pinned
    - pnpm-workspace.yaml — packages/* anchor, carries the D-01-deviation comment
    - pnpm-lock.yaml
    - .nvmrc — '22'
    - tsconfig.json — strict + erasableSyntaxOnly + verbatimModuleSyntax (10 compilerOptions)
    - eslint.config.js — flat config, typescript-eslint recommended, per-extension globals
    - .prettierrc.json + .prettierignore
    - lefthook.yml — pre-commit (prettier + eslint) and commit-msg (commitlint)
    - commitlint.config.cjs
    - .gitignore + .npmrc
    - packages/sportident/package.json — @fartola/sportident, MIT, ESM+CJS exports, fartola-readout bin
    - packages/sportident/tsconfig.json — extends root
    - packages/sportident/tsup.config.ts — dual ESM+CJS + .d.ts + outExtension stub (codex #12)
    - packages/sportident/LICENSE — MIT
    - packages/sportident/NOTICE.md — upstream attribution (allestuetsmerweh/sportident.js MIT)
    - packages/sportident/README.md — Phase 0 scope + run instructions
    - packages/sportident/src/index.ts — stub
    - packages/sportident/src/siProtocol.test.ts — Wave 1 (PLAN 02) placeholder
    - packages/sportident/src/output/ndjson.test.ts — Wave 4 (PLAN 05) placeholder
    - packages/sportident/src/integration/frameError.test.ts — Wave 1 (PLAN 02) placeholder
    - packages/sportident/src/integration/e2e.test.ts — Wave 4 (PLAN 05) placeholder
    - packages/sportident/src/SiCard/types/SiCard5.test.ts — Wave 2 (PLAN 03) placeholder
    - packages/sportident/src/SiCard/types/SiCard9.test.ts — Wave 2 (PLAN 03) placeholder
    - packages/sportident/src/SiCard/types/SiCard10.test.ts — Wave 2 (PLAN 03) placeholder
    - packages/sportident/src/SiCard/types/SIAC.test.ts — Wave 2 (PLAN 03) placeholder
    - packages/sportident/tests/fixtures/{upstream,jonas,synthetic}/.gitkeep
    - scripts/hardware-smoke.sh — chmod +x stub, exit 2
    - .github/workflows/ci.yml — Corepack-pinned pnpm pipeline on ubuntu-latest
  modified: []

key-decisions:
  - "D-01 deviation: anchor pnpm-workspace.yaml in Phase 0 (codex review #10). 5 lines now vs Phase 1 restructure of package.json exports/paths."
  - "CI uses Corepack to pin pnpm from root packageManager field. Falls back to pnpm/action-setup@v4 with explicit version: if Corepack proves flaky (codex review #9 default)."
  - "tsup outExtension explicitly returns .mjs for esm and .cjs for cjs so package.json bin (./dist/bin/fartola-readout.cjs) and exports map resolve to real files (codex review #12 stub; Plan 05 may extend)."
  - "ESLint flat config carries per-extension globals (Node globals for .ts/.js/.mjs/.cjs); .cjs explicitly typed as sourceType: commonjs so module/require/exports/process resolve."
  - "Root package.json is type: module so eslint.config.js loads as ESM without re-parsing warning."

patterns-established:
  - "Plan-numbered placeholder pattern: every Wave 0 test file carries a // Wave 0 scaffold comment naming the plan that will land real assertions."
  - "Per-task atomic commits using conventional commits with (00-NN) scope; body wrapped ≤ 100 chars to satisfy footer-max-line-length."

requirements-completed: []

# Metrics
duration: 7 min
completed: 2026-05-12
---

# Phase 0 Plan 01: Wave 0 scaffolding Summary

**fartOLa repo bootstrapped to "git clone && pnpm install && pnpm lint && pnpm typecheck && pnpm test exits 0" with the full Phase 0 toolchain (pnpm + TypeScript strict + tsup + lefthook + commitlint + GitHub Actions CI) and every Wave 0 test/fixture path from 00-VALIDATION.md pre-created as a placeholder.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-12T20:36:00Z
- **Completed:** 2026-05-12T20:43:00Z
- **Tasks:** 3
- **Files modified:** 31 (29 created + 2 in-flight self-fixes to root configs during Task 1)

## Accomplishments

- Root workspace toolchain installs and runs cleanly from a frozen lockfile.
- `@fartola/sportident` sub-package skeleton in place with MIT LICENSE + NOTICE.md attributing upstream `allestuetsmerweh/sportident.js`, ESM+CJS export map, `fartola-readout` bin path, `serialport@^13` dep.
- All 8 Wave 0 node:test placeholder files exist at the exact paths called out by 00-VALIDATION.md; `pnpm test` runs them via `node --test` and reports `8 skipped / 0 failed`.
- GitHub Actions CI workflow installs (frozen lockfile), lints, typechecks, and tests on `ubuntu-latest` with Corepack-pinned pnpm — no broken `${{ packageManager.split }}` expression (codex review #9).
- tsup config carries the explicit `outExtension` stub so Plan 05's `bin: ./dist/bin/fartola-readout.cjs` will resolve to a real file on disk (codex review #12).
- D-01 deviation (anchoring workspace file in Phase 0 rather than Phase 1) explicitly documented in `pnpm-workspace.yaml` header and in this summary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Root scaffold + pnpm workspace anchor + tsconfig + lint/format toolchain** — `3b6afaf` (feat)
2. **Task 2: packages/sportident/ skeleton — package.json + tsconfig + tsup + LICENSE + NOTICE + README + index.ts** — `0a59fdc` (feat)
3. **Task 3: Wave 0 test placeholders + fixture dirs + CI workflow + smoke-script stub** — `fd83a56` (feat)

## Files Created/Modified

### Root toolchain (Task 1)

- `package.json` — root scripts (lint/typecheck/test/format/prepare), pnpm@10.30.3 pinned via packageManager, engines.node >=22.18.0, devDependencies for the toolchain
- `pnpm-workspace.yaml` — `packages: ['packages/*']` with the D-01 deviation comment header
- `pnpm-lock.yaml` — generated
- `.nvmrc` — `22`
- `tsconfig.json` — root config: strict + 9 sibling options (RESEARCH §Validation Architecture)
- `eslint.config.js` — ESLint 9 flat config with typescript-eslint recommended and per-extension globals
- `.prettierrc.json` — singleQuote, trailingComma=es5, printWidth=100
- `.prettierignore` — excludes pnpm-lock.yaml
- `lefthook.yml` — pre-commit (prettier + eslint) and commit-msg (commitlint)
- `commitlint.config.cjs` — extends @commitlint/config-conventional
- `.gitignore` — node*modules/, dist/, coverage/, *.log, .env\_, .DS_Store, tmp/, .vscode/settings.json
- `.npmrc` — auto-install-peers=true, strict-peer-dependencies=false

### Sub-package skeleton (Task 2)

- `packages/sportident/package.json` — @fartola/sportident, MIT, ESM+CJS exports, fartola-readout bin (`./dist/bin/fartola-readout.cjs`), serialport@^13 dep
- `packages/sportident/tsconfig.json` — extends root, includes src/ and tests/
- `packages/sportident/tsup.config.ts` — dual ESM+CJS + dts, target node22, explicit outExtension (codex #12)
- `packages/sportident/LICENSE` — MIT (Copyright 2026 Jonas Hagberg and the fartOLa contributors)
- `packages/sportident/NOTICE.md` — upstream attribution (allestuetsmerweh/sportident.js MIT; per-magnusson reference-only GPL; GecoSI reference-only Apache-2.0)
- `packages/sportident/README.md` — Phase 0 scope, run instructions, FARTOLA_DEVICE env var
- `packages/sportident/src/index.ts` — `export {};` stub for Plan 05

### Wave 0 test placeholders + CI + smoke (Task 3)

- `packages/sportident/src/siProtocol.test.ts` — PLAN 02 placeholder
- `packages/sportident/src/output/ndjson.test.ts` — PLAN 05 placeholder
- `packages/sportident/src/integration/frameError.test.ts` — PLAN 02 placeholder
- `packages/sportident/src/integration/e2e.test.ts` — PLAN 05 placeholder
- `packages/sportident/src/SiCard/types/SiCard5.test.ts` — PLAN 03 placeholder
- `packages/sportident/src/SiCard/types/SiCard9.test.ts` — PLAN 03 placeholder
- `packages/sportident/src/SiCard/types/SiCard10.test.ts` — PLAN 03 placeholder
- `packages/sportident/src/SiCard/types/SIAC.test.ts` — PLAN 03 placeholder
- `packages/sportident/tests/fixtures/upstream/.gitkeep`
- `packages/sportident/tests/fixtures/jonas/.gitkeep`
- `packages/sportident/tests/fixtures/synthetic/.gitkeep`
- `scripts/hardware-smoke.sh` — chmod +x stub, prints TODO, exit 2 (Plan 06 lands real body)
- `.github/workflows/ci.yml` — ubuntu-latest, timeout 10 min, Corepack-pinned pnpm, four-step pipeline

## D-01 Deviation (codex review #10)

**Decision:** Anchor `pnpm-workspace.yaml` in Phase 0 (this plan) instead of deferring to Phase 1.

**What D-01 said:** "Single `packages/sportident/` package now; defer pnpm workspaces to Phase 1 when the second package lands." (00-CONTEXT.md)

**Why we deviated now:**

1. **Cost is trivial:** 5 lines of YAML + a comment header.
2. **Cost of deferring:** Adding `pnpm-workspace.yaml` in Phase 1 alongside a new sibling package (likely `@fartola/ingester` or `@fartola/db`) forces a simultaneous restructure of root `package.json` (the `pnpm -r --if-present run lint` pattern only takes effect with a workspace file present) and any path-resolution machinery downstream. Doing it in one focused commit now beats juggling two structural changes in the same Phase 1 wave.
3. **Codex review #10 explicitly flagged this:** Recommended documenting the deviation rather than reverting to D-01's literal text.

**How it's documented:**

- `pnpm-workspace.yaml` header carries an 8-line YAML comment explaining the deviation and pointing here.
- Root scripts use the `-r --if-present` pattern, so when Phase 1 adds `@fartola/ingester` the existing `pnpm lint/typecheck/test` scripts pick it up without any further root edits.
- This summary section satisfies the codex-review-mandated rationale capture.

**Future-proofing:** When Phase 1 lands the second package, no edits are required here — it just appears under `packages/*`.

## CI pnpm-pinning strategy chosen

**Strategy:** Corepack (with `pnpm/action-setup@v4` as the documented fallback).

**Why Corepack first:**

- Reads pnpm version from the root `package.json` `packageManager` field (`pnpm@10.30.3`). The CI runner can never use a different pnpm version than the developer's machine.
- One source of truth — bumping pnpm means editing exactly one file (root `package.json`).
- No GHA context-variable substitution required (sidesteps the broken `${{ packageManager.split('@')[1] }}` expression that codex review #9 flagged).

**Documented fallback (in ci.yml as a comment block):** If Corepack proves flaky on a runner, switch to `pnpm/action-setup@v4` with `version: 10.30.3` and update both `package.json` and `ci.yml` in a single commit so they never drift.

**Greppable invariant:** `grep -c 'packageManager.split' .github/workflows/ci.yml` returns 0 (codex review #9 satisfied).

## Decisions Made

- **Root `type: module`** — added so `eslint.config.js` loads as ESM without Node's MODULE_TYPELESS reparse warning. Sub-package separately sets `type: module` in its own package.json (D-04 standalone shape).
- **`@types/node` added at root** — required for the sub-package's `tsc --noEmit` to resolve `node:test` and `node:assert`. Not called out in the plan; added as a Rule 3 blocking-issue fix during Task 3 verification.
- **`globals@15.15.0` added** — needed by ESLint flat config to provide Node globals per-extension (caught when Task 1's lint run hit `module is not defined` in `commitlint.config.cjs`).
- **`.prettierignore`** — created to exclude `pnpm-lock.yaml` from pre-commit prettier checks (lockfiles are not human-formatted).
- **`type: "module"` on the root package.json** plus a `.cjs` carve-out in the ESLint config for `commitlint.config.cjs` — pragmatic mix that lets us keep commitlint's official config-conventional format while keeping the rest of the repo ESM-first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint `no-undef` on `commitlint.config.cjs`**

- **Found during:** Task 1 verification (`pnpm lint`)
- **Issue:** ESLint flat config didn't expose Node globals for `.cjs` source files, so `module.exports = ...` flagged `'module' is not defined`.
- **Fix:** Added `globals` dependency, separated ESLint config blocks per-extension (`.ts/.mts`, `.js/.mjs` as ESM with Node globals; `.cjs` as `sourceType: commonjs` with Node globals).
- **Files modified:** `eslint.config.js`, `package.json` (added `globals` dep).
- **Verification:** `pnpm lint` exits 0.
- **Committed in:** `3b6afaf` (Task 1 commit).

**2. [Rule 1 - Bug] Node MODULE_TYPELESS_PACKAGE_JSON warning when loading eslint.config.js**

- **Found during:** Task 1 verification.
- **Issue:** Root `package.json` had no `"type": "module"`, so Node reparsed `eslint.config.js` as ESM with a warning.
- **Fix:** Added `"type": "module"` to root package.json. Required no other changes (all root configs are ESM-compatible; `.cjs` extension explicitly carves out commitlint's CJS config).
- **Files modified:** `package.json`.
- **Verification:** Warning gone; pipeline silent.
- **Committed in:** `3b6afaf` (Task 1 commit).

**3. [Rule 3 - Blocking] pnpm-lock.yaml caused prettier pre-commit to fail**

- **Found during:** Task 1 commit attempt (lefthook pre-commit blocked the commit).
- **Issue:** Pre-commit prettier check tried to format the generated `pnpm-lock.yaml` and rejected it; commit aborted.
- **Fix:** Created `.prettierignore` listing `pnpm-lock.yaml`, `dist/`, `coverage/`, `node_modules/`.
- **Files modified:** `.prettierignore` (new).
- **Verification:** Re-staged and committed cleanly.
- **Committed in:** `3b6afaf` (Task 1 commit).

**4. [Rule 1 - Bug] commitlint footer-max-line-length rejected first commit body**

- **Found during:** Task 1 commit attempt (lefthook commit-msg).
- **Issue:** Initial commit body had lines >100 chars; conventional-commit footer-max-line-length is 100.
- **Fix:** Rewrote commit body with all lines ≤100 chars.
- **Files modified:** none (commit message only).
- **Verification:** commit-msg passed.
- **Committed in:** `3b6afaf` (Task 1 commit).

**5. [Rule 3 - Blocking] @types/node missing — sub-package tsc could not resolve `node:test`**

- **Found during:** Task 3 verification (`pnpm typecheck` after creating Wave 0 test placeholders).
- **Issue:** Test placeholders `import { test } from 'node:test'; import assert from 'node:assert';` failed TS2307 because no `@types/node` was installed at the workspace root.
- **Fix:** Added `@types/node@^22.10.0` to root devDependencies.
- **Files modified:** `package.json`, `pnpm-lock.yaml`.
- **Verification:** `pnpm typecheck` exits 0.
- **Committed in:** `fd83a56` (Task 3 commit).

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs, 2 Rule 3 blockers).
**Impact on plan:** All five were toolchain-config follow-on fixes that the plan didn't anticipate. None of them changed scope — they just made the toolchain the plan specified actually work end-to-end. No scope creep.

## Final pipeline output

The exact final two lines of `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`:

```
ℹ skipped 8
ℹ duration_ms 212.95403
```

Full `pnpm test` tail (8 placeholder tests, all skipped, zero failures):

```
ℹ tests 8
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 8
ℹ todo 0
ℹ duration_ms 212.95403
```

## Captured versions at install time

| Tool        | Version                                |
| ----------- | -------------------------------------- |
| Node        | v22.19.0                               |
| pnpm        | 10.30.3                                |
| TypeScript  | 5.9.3                                  |
| ESLint      | 9.39.4                                 |
| Prettier    | 3.8.3                                  |
| lefthook    | 1.13.6                                 |
| commitlint  | 19.8.1                                 |
| tsup        | 8.5.1                                  |
| serialport  | 13.0.0 (sub-package, not yet imported) |
| @types/node | 22.19.19                               |

## Issues Encountered

- The hook environment runs commands through `rtk`, which occasionally rewrites/filters output (e.g. `eslint --version` returned empty in one early run). Worked around by invoking `rtk proxy` for raw output during verification spot-checks; this had no effect on actual pipeline behavior or commits.

## User Setup Required

None for this plan. Plan-level `user_setup` entry says enable Corepack and prepare pnpm — already done locally by Jonas. CI uses Corepack so no separate runner setup needed.

## Next Phase Readiness

- Plan 02 (Wave 1: port siProtocol) starts from `packages/sportident/src/siProtocol.test.ts` already present and skipped — the Wave 1 plan just replaces the `test.skip` body with real assertions.
- All Wave 0 paths called out in 00-VALIDATION.md §"Wave 0 Requirements" are populated; the validator's `nyquist_compliant: true` flag can flip in a follow-up planner pass.
- Sub-package shape is standalone — when Phase 1 needs to publish, only the `version` bump + `npm publish` step are missing (Plan 06 stays focused on the hardware proof, not publishing).

## Self-Check: PASSED

- `/home/jonas/src/fartOLa/package.json` — FOUND
- `/home/jonas/src/fartOLa/pnpm-workspace.yaml` — FOUND (with D-01 deviation comment)
- `/home/jonas/src/fartOLa/tsconfig.json` — FOUND
- `/home/jonas/src/fartOLa/eslint.config.js` — FOUND
- `/home/jonas/src/fartOLa/lefthook.yml` — FOUND
- `/home/jonas/src/fartOLa/commitlint.config.cjs` — FOUND
- `/home/jonas/src/fartOLa/packages/sportident/package.json` — FOUND
- `/home/jonas/src/fartOLa/packages/sportident/tsup.config.ts` — FOUND (with outExtension)
- `/home/jonas/src/fartOLa/packages/sportident/LICENSE` — FOUND
- `/home/jonas/src/fartOLa/packages/sportident/NOTICE.md` — FOUND
- All 8 Wave 0 test placeholders — FOUND
- All 3 fixture dirs — FOUND
- `/home/jonas/src/fartOLa/scripts/hardware-smoke.sh` — FOUND (executable)
- `/home/jonas/src/fartOLa/.github/workflows/ci.yml` — FOUND (Corepack, no broken expression)
- Commit `3b6afaf` (Task 1) — FOUND in git log
- Commit `0a59fdc` (Task 2) — FOUND in git log
- Commit `fd83a56` (Task 3) — FOUND in git log

---

_Phase: 00-hardware-proof_
_Completed: 2026-05-12_
