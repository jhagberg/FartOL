---
phase: 01-single-laptop-training-mvp
plan: 18
subsystem: packaging
tags:
  [packaging, npm-install-g, systemd, udev, install-smoke, tsup, fastify-static, BLOCKING-CHECKPOINT-PENDING]

# Dependency graph
requires:
  - phase: 01-single-laptop-training-mvp
    provides: |
      plan 01 buildServer + bin scaffold;
      plan 02 cold-start migrator + drizzle/ directory;
      plan 05 bundled IOF.xsd;
      plan 11 SvelteKit adapter-static apps/web/build/ tree;
      plan 13 routes/print + escposDriver;
      plan 14 wave-4 reducer / projection;
      plan 15 thermal print pipeline + auto-print bridge wiring;
      plan 16 IOF ResultList export endpoints + routes/export.ts;
      plan 17 daily backup + retention schedulers + routes/admin.ts + bin CLI flags.
provides:
  - Single-binary `fartol` tarball produced by `bash scripts/build-fartol.sh`.
    Chains pnpm `--filter @fartol/web build`, `--filter @fartol/edge build`,
    copies the SvelteKit static output into dist/web/, then `pnpm pack`s
    the edge package with a `fartol-<version>.tgz` alias for stable
    operator-facing references.
  - tsup `noExternal` for @fartol/sportident + @fartol/shared-types so the
    published tarball is self-contained — no separate workspace publish
    step. Workspace deps live in devDependencies; the tsup-bundled output
    has no runtime references to them.
  - tsup `shims: true` polyfill for `import.meta.url` so the CJS bin
    (`dist/bin/fartol.cjs`) can resolve `__dirname`-equivalent paths.
  - server.ts production static-serve: when `dist/web/` exists,
    @fastify/static is registered and 404s for non-/api/* non-/ws paths
    fall back to `200.html` (RESEARCH Pattern 3 — SvelteKit SPA router
    handles deep-link clientside). Dev (no dist/web/) keeps the JSON-404
    handler so REST tools see clean 404s.
  - server.ts multi-candidate static-root probe — works whether server.ts
    is bundled into `dist/server.{cjs,mjs}` (sibling `dist/web/`) or
    `dist/bin/fartol.cjs` (parent `dist/web/`).
  - xml/validate.ts multi-candidate IOF.xsd probe — works under tsx
    source-tree, dist/ bundled server, AND dist/bin/ bundled bin.
  - apps/edge/scripts/install-smoke.sh: tarball install regression gate.
    `npm install --prefix <tmpdir> -g <tarball>` puts the bin at
    `$prefix/bin/fartol`; the script asserts that path BEFORE invocation
    (C-H4 transparency hook) then boots `fartol --port <P> --no-bridge`
    and curls /api/health (must contain `"status":"ok"`), / (must serve
    the SvelteKit shell, >=200 bytes with "FartOL" marker), a deep-link
    fallback (must return 200), and a missing /api/* path (must return
    404). Exits PASS on success.
  - tests/install/install-smoke.test.ts: node:test wrapper with the
    smoke-script run AND a dedicated BIN-layout regression check using
    the raw npm invocation.
  - apps/edge/systemd/fartol.service: example user-scope systemd unit
    with Restart=on-failure + 5s backoff + NoNewPrivileges + ProtectSystem
    strict + ProtectHome read-only + ReadWritePaths under
    %h/.local/share/fartol. REQ-OPS-002.
  - apps/edge/udev/99-fartol-sportident.rules: vendor-pinned rules for
    SPORTident BSM7/8/SI-Master/BSF8 (10c4:800a + 10c4:8004) at MODE=0660
    GROUP=dialout, and Star/Epson/Brother thermal printers at MODE=0660
    GROUP=lp. All TAG+="uaccess" so logind also grants the seated user.
  - apps/edge/README.md: operator-facing install + run + hardware (udev,
    dialout, lp) + CUPS + systemd + privacy docs.
  - apps/edge/NOTICE.md: cumulative third-party attribution covering the
    bundled workspace siblings, IOF XSD, the production deps installed
    by npm, and the SvelteKit SPA.
  - .github/workflows/build-fartol.yml: workflow_dispatch CI that builds
    the tarball, runs both install-smoke gates, and uploads the tarball
    as an artifact.
affects:
  - Phase 1 final checkpoint (Task 3) — blocking human bench verification
    of SC#3 (real card read via Jonas's BSM7/8-USB), SC#5 (real thermal
    print), SC#7 (StorTuna Tuesday rehearsal). Software-only verification
    is COMPLETE; the bench gate is the last-mile manual hand-off and is
    deferred to operator bench session (see "Outstanding work" below).
  - Phase 2 npm publishing — the tarball name + bin shape stays stable;
    the only delta is moving from a locally-built tarball to an npm
    registry release with provenance signing.

# Tech tracking
tech-stack:
  added: [] # No new runtime deps; tsx@^4.20 added to root devDependencies for tests/install
  patterns:
    - "Self-contained tsup bundle pattern: noExternal workspace deps +
      shims:true for CJS import.meta.url polyfill. Lets a private
      workspace publish a single tarball that operators install with
      `npm install -g` without resolving sibling workspace packages
      from a registry."
    - "Multi-candidate path resolution for bundled assets — probe a
      list of likely locations (source-tree, dist/, dist/bin/) so a
      single source file works in dev (tsx) AND under both bundled
      output layouts (server.cjs siblings + bin/fartol.cjs parent)."
    - "Fastify SPA fallback gate: API/WS paths return JSON 404, all
      other paths fall back to the SvelteKit 200.html so the client-
      side router owns deep-link routing. Static block is conditional
      on the directory existing so dev (Vite at :5173) is unaffected."
    - "C-H4 install-smoke layout assertion: assert the BIN path resolves
      BEFORE invocation. Layout drift between npm versions surfaces as
      a clear filesystem check failure with debug `ls` output, not as a
      confusing `command not found` from the spawn step."

key-files:
  created:
    - apps/edge/scripts/build-tarball.sh
    - apps/edge/scripts/install-smoke.sh
    - apps/edge/systemd/fartol.service
    - apps/edge/udev/99-fartol-sportident.rules
    - apps/edge/README.md
    - apps/edge/NOTICE.md
    - scripts/build-fartol.sh
    - tests/install/install-smoke.test.ts
    - .github/workflows/build-fartol.yml
  modified:
    - apps/edge/package.json
    - apps/edge/tsup.config.ts
    - apps/edge/src/server.ts
    - apps/edge/src/xml/validate.ts
    - package.json

key-decisions:
  - "Kept the workspace package name as `@fartol/edge` (not the plan's
    suggested `fartol`) because the root package.json is already named
    `fartol` (the workspace meta-package) and pnpm forbids duplicate
    workspace names. The `bin` field still maps to `fartol`, so
    `npm install -g <tarball>` puts a `fartol` binary in PATH; only the
    tarball-file alias name (pnpm packs as `fartol-edge-0.1.0.tgz`)
    differs from the plan's `fartol-0.1.0.tgz`. The build script copies
    the pnpm-named file to `fartol-<version>.tgz` so install-smoke and
    README references remain stable."
  - "Moved @fartol/sportident + @fartol/shared-types from dependencies
    to devDependencies. Reason: tsup's `noExternal` bundles them into
    the dist/ artefact; if they stayed in dependencies, npm would try
    to resolve `0.0.0` versions from the registry (404) when an
    operator runs `npm install -g <tarball>`. Build-time only is the
    correct placement for tsup-bundled sources."
  - "tsup `shims: true` was required, not optional. The compiled CJS bin
    crashed at startup without it because xml/validate.ts and
    server.ts's defaultStaticRoot both use `import.meta.url` for
    __dirname-equivalent path resolution. Without the shim,
    `fileURLToPath(undefined)` throws ERR_INVALID_ARG_TYPE before any
    handler registers."
  - "Static-root probe uses two candidates instead of a single fixed
    path because the same server.ts source compiles into BOTH
    `dist/server.{cjs,mjs}` (where dist/web/ is a sibling) AND is
    rolled into `dist/bin/fartol.cjs` (where dist/web/ is the parent
    directory). Hardcoding either path would break one of the entry
    points."
  - "xml/validate.ts probe extended from 1 to 3 candidate paths
    (source-tree, dist/, dist/bin/) — first plan-18 binary build
    crashed with `ENOENT: dist/bin/IOF.xsd` because the pre-existing
    code assumed a fixed source-tree layout. Pre-existing wishful
    comment `PATTERNS S-5: both layouts resolve correctly` was false;
    the tarball build path was never actually exercised."
  - "C-H4 BIN-path layout: the plan PLAN.md text quoted
    `$tmpdir/lib/node_modules/.bin/fartol`. Empirically, `npm install
    --prefix <prefix> -g <tarball>` puts the bin SYMLINK at
    `$prefix/bin/fartol` and the package contents at
    `$prefix/lib/node_modules/<scope>/<name>/`. The C-H4 CONTRACT
    (predict the BIN location before invocation; surface a layout
    drift clearly) is preserved — only the predicted path differs.
    Tests + script assert the empirical layout."
  - "Tarball file alias step: pnpm pack names scoped tarballs as
    `<scope>-<name>-<version>.tgz`, i.e. `fartol-edge-0.1.0.tgz`. The
    build script cp -f's that file to `dist/fartol-<version>.tgz` so
    operator-facing docs + the install-smoke regex (`fartol-VERSION`
    NOT `fartol-edge-`) can refer to a stable name without leaking the
    workspace-internal package name."
  - "udev rules use `TAG+=\"uaccess\"` alongside `GROUP=dialout/lp` so
    seated-user access works on systemd-logind systems (most modern
    Linux desktops) AND group-membership access works on older
    sysvinit setups. Single rule set covers both."
  - "systemd unit is user-scope (systemctl --user, %h paths) not
    system-scope. Phase 1 single-laptop deployments have one operator;
    requiring root would force a setup-time `sudo` workflow the
    operator-facing README is explicit about avoiding."

patterns-established:
  - "Pattern (packaging): tsup `noExternal: ['<workspace-pkg>']` +
    `shims: true` + `outExtension({ format })` -> single self-contained
    CJS+ESM dist with prebuilt-binding deps left external. Re-usable
    for any future @fartol/* package that ships as a binary."
  - "Pattern (Fastify production deploy): conditional @fastify/static
    registration based on `existsSync(staticRoot)` keeps the same
    server factory usable in dev (no static, Vite serves SPA) and
    production (static + 200.html fallback) without separate code
    paths."
  - "Pattern (install-smoke gate): bash smoke-script + node:test wrapper
    is the cheapest possible regression gate for distribution-format
    issues. Both run against the SAME tarball under the SAME npm flags,
    so any single drift fails BOTH gates with overlapping debug output."

requirements-completed:
  - REQ-OPS-001
  - REQ-OPS-002
  - REQ-HW-001
  - REQ-HW-002
  - REQ-HW-003
  - REQ-HW-004

# Metrics
duration: ~38min
completed: 2026-05-15
---

# Phase 1 Plan 18: Single-binary packaging Summary

**Single `fartol-0.1.0.tgz` (793 KB) — tsup-bundled CJS+ESM with the workspace
siblings inlined, ships drizzle/ migrations + bundled IOF.xsd + SvelteKit
SPA static build under dist/web/. `npm install -g` drops a `fartol` binary
in PATH; the bin boots a Fastify server that serves SPA + REST + WS on
127.0.0.1:3000 with cold-start migrations, daily backups, 30-day PII
retention, optional SI bridge, and example systemd/udev wrappers. Bench
human-verify gate (Task 3) is the only outstanding item.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-05-15T07:33:37Z
- **Completed:** 2026-05-15T08:11:41Z
- **Tasks:** 2 of 3 (Task 3 is the blocking human-verify checkpoint;
  see "Outstanding work" below)
- **Files created/modified:** 14 (9 created, 5 modified)
- **Tarball size:** 793 KB (`dist/fartol-0.1.0.tgz`, 56 files)
- **Cumulative tests passing:** 388 unit + 2 install-smoke = 390 green
  - apps/edge: 274 pass / 0 fail
  - packages/sportident: 108 pass / 0 fail
  - packages/shared-types: 3 pass / 0 fail
  - apps/web (vitest): 31 pass / 0 fail (sometimes 1 flake on busy CPU
    — pre-existing, documented in deferred-items.md from plan 16)
  - tests/install: 2 pass / 0 fail
  - (Phase 0 92 tests roll up into the sportident count above.)

## Accomplishments

- `bash scripts/build-fartol.sh` produces a self-contained
  `dist/fartol-0.1.0.tgz` end-to-end. The build chain: web build →
  edge tsup build → copy web build into edge dist/web → assert all
  expected files present → pnpm pack → cp alias for stable naming.
- The installed binary works as advertised: `npm install --prefix
<tmp> -g <tarball>` puts `fartol` at `$tmp/bin/fartol`; running
  `fartol --port 3000 --db-path <p> --backup-dir <p> --no-bridge`
  serves /api/health=ok, / = SvelteKit shell, /competition/abc = SPA
  fallback (200.html), /api/missing = JSON 404, with cold-start
  Drizzle migrations writing the initial schema + the append-only
  triggers from plan 02.
- C-H4 install-smoke gate proven: BOTH the bash smoke-script and the
  node:test layout-regression test pass against the real tarball.
  The BIN path resolves to `$prefix/bin/fartol` (npm global layout)
  with the executable bit set; if a future npm release shifts the
  layout, both gates fail cleanly with debug `ls` output.
- systemd + udev example units shipped in the tarball under
  `systemd/` and `udev/` so operators can copy them from
  `$(npm prefix -g)/lib/node_modules/@fartol/edge/{systemd,udev}/`
  without hunting for them in repo sources.
- README.md is operator-facing: install + run + hardware setup
  (udev + dialout + lp) + CUPS guide + systemd unit installation +
  privacy + troubleshooting. Pulls together all the operator-relevant
  detail from prior plans into a single document the global install
  exposes via `$(npm prefix -g)/lib/node_modules/@fartol/edge/README.md`.
- NOTICE.md captures cumulative attribution: AGPL-3.0 application,
  MIT @fartol/sportident, IOF XSD, the production deps installed by
  npm, and the SvelteKit-built SPA. Aligned with the PATTERNS S-8
  AGPL vs MIT boundary.
- CI workflow (`build-fartol.yml`) wires the same build + smoke chain
  for workflow_dispatch invocations. Tarball uploaded as an artifact
  for handover to bench operators.

## Task Commits

Each task was committed atomically (commit hashes from
`git log --oneline gsd/phase-1-wave5`):

1. **Task 1: production static-serve + tsup bundle + tarball build
   script** — `da0dc92` (feat)
2. **Task 2: install-smoke + systemd + udev + CI workflow** — `18af12e`
   (feat)

Task 3 (blocking checkpoint:human-verify) — pending operator bench session.

## Files Created/Modified

### Created

- `apps/edge/scripts/build-tarball.sh` — orchestrates the 5-step build
  chain (web build → edge build → copy web build → asset verification
  → pnpm pack + alias). Exits non-zero with named-step output on any
  failure.
- `apps/edge/scripts/install-smoke.sh` — install + boot + health +
  SPA + deep-link + /api/\* 404 regression gate. C-H4 LOCKED.
- `apps/edge/systemd/fartol.service` — user-scope unit with
  Restart=on-failure + hardening flags.
- `apps/edge/udev/99-fartol-sportident.rules` — vendor-pinned MODE=0660
  rules for SI + thermal printers with TAG+="uaccess".
- `apps/edge/README.md` — operator-facing install + run + hardware +
  systemd + privacy + troubleshooting docs.
- `apps/edge/NOTICE.md` — cumulative third-party attribution.
- `scripts/build-fartol.sh` — repo-root convenience wrapper delegating
  to apps/edge/scripts/build-tarball.sh.
- `tests/install/install-smoke.test.ts` — node:test wrapper with the
  smoke-script run + the dedicated C-H4 BIN-layout assertion.
- `.github/workflows/build-fartol.yml` — workflow_dispatch CI for
  build + smoke + upload-artifact.

### Modified

- `apps/edge/package.json` — version 0.1.0; `files[]` adds
  `systemd/`, `udev/`, `README.md`, `NOTICE.md`; `exports` adds
  `require` entry + `main` field; new `pack:tarball` script; moved
  workspace siblings from dependencies to devDependencies.
- `apps/edge/tsup.config.ts` — `noExternal: ['@fartol/sportident',
'@fartol/shared-types']`, `shims: true` for CJS `import.meta.url`
  polyfill.
- `apps/edge/src/server.ts` — production static-serve registration
  (conditional on `existsSync(staticRoot)`), multi-candidate static-
  root probe (`<here>/web` + `<here>/../web`), SPA fallback in
  setNotFoundHandler that keeps /api/\* + /ws as JSON 404 but routes
  every other path to `200.html`.
- `apps/edge/src/xml/validate.ts` — multi-candidate IOF.xsd probe
  (source-tree, dist/, dist/bin/) so the validator works under tsx
  AND both bundled output layouts. Pre-existing wishful "both layouts
  resolve correctly" assumption was wrong; this is the fix.
- `package.json` — `tsx@^4.20` in devDependencies (tests/install
  needs it for the `--import tsx` runtime), `test:install` and
  `build:fartol` scripts.

## Decisions Made

See `key-decisions` in the frontmatter above (9 decisions). The most
load-bearing:

1. **Package name stays @fartol/edge** (not `fartol` per the plan) to
   avoid a duplicate-name collision with the root workspace package.
   The build script aliases the tarball file as `fartol-<version>.tgz`
   so operator-facing references stay stable.
2. **Workspace deps moved to devDependencies** because tsup bundles
   them; `dependencies` would force npm to look them up from the
   registry where they are not (and won't be) published.
3. **`shims: true` was mandatory**, not optional — without it, the
   compiled CJS bin crashed at startup on `fileURLToPath(undefined)`.
4. **C-H4 BIN path is `$prefix/bin/fartol`**, not the plan's quoted
   `lib/node_modules/.bin/fartol` (that's a local-install layout).
   The contract — predict + assert BEFORE invocation — is preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] xml/validate.ts crashed in the bundled bin (ENOENT
on `dist/bin/IOF.xsd`)**

- **Found during:** Task 1 (first attempt to boot the built binary
  for verification).
- **Issue:** validate.ts loaded IOF.xsd via `path.join(HERE, 'IOF.xsd')`
  where HERE was derived from `import.meta.url`. The pre-existing
  comment claimed "both source-tree and dist/xml/ layouts resolve
  correctly" but only the source-tree path actually worked. When the
  module is bundled into `dist/bin/fartol.cjs`, HERE = `dist/bin/`
  and `dist/bin/IOF.xsd` does not exist (the XSD is at `dist/xml/IOF.xsd`).
- **Fix:** Probe a candidate list `[here/IOF.xsd, here/xml/IOF.xsd,
here/../xml/IOF.xsd]` so source-tree, dist/-bundled-server, and
  dist/bin/-bundled-bin all resolve correctly.
- **Files modified:** apps/edge/src/xml/validate.ts.
- **Verification:** Built bin boots without ENOENT;
  `pnpm --filter @fartol/edge test` (which exercises validate.ts via
  the source-tree path) still passes 274/274.
- **Committed in:** `da0dc92` (task 1 commit).

**2. [Rule 3 — Blocking] tsup CJS bundle crashed at startup on
`fileURLToPath(undefined)` (`ERR_INVALID_ARG_TYPE`)**

- **Found during:** Task 1 (first `node apps/edge/dist/bin/fartol.cjs
--help` invocation).
- **Issue:** validate.ts + server.ts (defaultStaticRoot) +
  bin/fartol.ts (isEntrypoint guard) all read `import.meta.url` for
  ESM-style path resolution. esbuild leaves `import_meta.url`
  undefined in CJS output by default, so every consumer crashes at
  module-init time.
- **Fix:** Set `shims: true` in tsup.config.ts. tsup injects a
  polyfill that derives `import.meta.url` from CJS `__filename`.
- **Files modified:** apps/edge/tsup.config.ts.
- **Verification:** Rebuilt bin → `fartol --help` prints usage and
  `--port 3001 --no-bridge` boots cleanly.
- **Committed in:** `da0dc92` (task 1 commit).

**3. [Rule 3 — Blocking] server.ts defaultStaticRoot returned undefined
under the bundled-bin layout**

- **Found during:** Task 1 (after fixing #2 + #1, first SPA fetch
  against the booted bin returned 404 JSON).
- **Issue:** defaultStaticRoot probed only `path.resolve(here, 'web')`.
  When server.ts is bundled into `dist/bin/fartol.cjs`, `here =
dist/bin/` and the probe checks `dist/bin/web/` (doesn't exist) so
  the static block was skipped.
- **Fix:** Probe both `<here>/web` (server.cjs sibling) AND
  `<here>/../web` (bin/fartol.cjs parent) so a single source compiles
  to both bundled entry points.
- **Files modified:** apps/edge/src/server.ts.
- **Verification:** Rebuilt bin → `curl /` = 200, 1882 bytes SvelteKit
  shell; `curl /competition/foo` = 200 (SPA fallback); `curl
/api/missing` = 404 JSON.
- **Committed in:** `da0dc92` (task 1 commit).

**4. [Rule 1 — Bug] Plan's C-H4 BIN path
(`lib/node_modules/.bin/fartol`) was wrong; correct path is
`bin/fartol`**

- **Found during:** Task 2 (first install-smoke run).
- **Issue:** The plan PLAN.md, threat model, and verification section
  all quoted `$tmpdir/lib/node_modules/.bin/fartol` as the C-H4
  layout. Empirically, `npm install --prefix <p> -g <tarball>` puts
  the bin SYMLINK at `$prefix/bin/fartol` and the package contents at
  `$prefix/lib/node_modules/<scope>/<name>/`. The lib path is npm's
  LOCAL-install convention; the global-install convention is
  `$prefix/bin/`. The plan author's reference was an artefact of the
  prior C-H4 revision (where the bin was looked for at the LOCAL path).
- **Fix:** Updated install-smoke.sh + install-smoke.test.ts to assert
  the empirical global-prefix layout. The C-H4 CONTRACT (predict +
  assert BEFORE invocation, fail loud on drift) is preserved; only
  the predicted path differs.
- **Files modified:** apps/edge/scripts/install-smoke.sh,
  tests/install/install-smoke.test.ts.
- **Verification:** `pnpm test:install` → 2 pass / 0 fail;
  `bash apps/edge/scripts/install-smoke.sh dist/fartol-0.1.0.tgz` →
  PASS with `Resolved BIN path: /tmp/fartol-install-XXXXXX/bin/fartol`.
- **Committed in:** `18af12e` (task 2 commit).

**5. [Rule 1 — Bug] Workspace siblings in `dependencies` caused
`npm install -g` to 404**

- **Found during:** Task 2 (first install-smoke run, after the BIN
  path was corrected).
- **Issue:** pnpm rewrites `workspace:*` to the workspace package's
  current version on `pnpm pack`. Since @fartol/sportident +
  @fartol/shared-types are private workspace packages at version
  0.0.0, the tarball's package.json listed them as `^0.0.0`
  dependencies; `npm install -g <tarball>` then tried to resolve
  them from the public registry and got 404. But these are
  tsup-bundled into the dist/ artefact, so they are build-time-only.
- **Fix:** Moved both workspace siblings from `dependencies` to
  `devDependencies` in apps/edge/package.json. pnpm pack now omits
  them from the published tarball; the bundle's runtime references
  are all to inlined code.
- **Files modified:** apps/edge/package.json.
- **Verification:** Rebuilt tarball; `tar -xzf dist/fartol-0.1.0.tgz
-O package/package.json` confirms `@fartol/*` no longer appears
  under `dependencies`; install-smoke passes.
- **Committed in:** `18af12e` (task 2 commit).

**6. [Rule 3 — Blocking] tests/install couldn't resolve `tsx`
(`ERR_MODULE_NOT_FOUND`)**

- **Found during:** Task 2 (first `pnpm test:install`).
- **Issue:** The `test:install` script invokes `node --import tsx
tests/install/install-smoke.test.ts`. tsx was only in
  apps/edge/devDependencies; from the repo root it wasn't on the
  resolution path.
- **Fix:** Added `tsx@^4.20.0` to root devDependencies.
- **Files modified:** package.json, pnpm-lock.yaml.
- **Verification:** `pnpm test:install` → 2 pass / 0 fail.
- **Committed in:** `18af12e` (task 2 commit).

**7. [Rule 1 — Style] Prettier reformat across new files**

- **Found during:** Both pre-commit hooks.
- **Issue:** README.md table-column padding + a few JSON whitespace
  tweaks didn't match Prettier defaults.
- **Fix:** `pnpm exec prettier --write` on the staged files; re-staged
  and re-committed.
- **Files modified:** README.md, package.json, tsup.config.ts,
  install-smoke.test.ts (formatting only; no semantic change).
- **Committed in:** `da0dc92` + `18af12e` (incorporated into both task
  commits).

---

**Total deviations:** 7 auto-fixed (3 Rule 1 bugs, 3 Rule 3 blockers,
1 Rule 1 style).
**Impact on plan:** Deviations 1-3 + 5 + 6 were correctness-required
(the binary wouldn't boot without them). Deviation 4 is a plan-text
correction with no semantic effect on the gate. Deviation 7 is
cosmetic. None of these are scope creep — every fix was in service of
"make the install-smoke pass end-to-end against a real tarball."

## Issues Encountered

- **Pre-existing apps/web i18n test flake** under heavy CPU
  contention. Same flake plan 16 + 17 documented in deferred-items.md;
  not caused by plan 18, not blocking — passes deterministically when
  run in isolation. The CI workflow uses `pnpm -r test` which can
  surface it on busy runners; a dedicated retry of `pnpm --filter
@fartol/web test` clears it. Out of plan-18 scope.

## Outstanding work

**Task 3 (checkpoint:human-verify, BLOCKING) is pending operator bench
session.** This is the only Phase 1 work item that remains. The
checkpoint covers three success criteria that require physical
hardware + a real event:

- **SC#3** — Read cards via Phase 0 bridge, match to course, show
  results live. Requires Jonas's BSM7/8-USB plus the SI5/SI9/SI10/SIAC
  card set; the bench laptop runs `fartol --port 3000 --db-path
/tmp/fartol-bench.db --backup-dir /tmp/fartol-bench-bak`.
- **SC#5** — Real thermal print across all 6 templates (classic,
  standing, detailed, top4, minimal, kids). Requires the Star TSP143
  (or equivalent) on /dev/usb/lp0 OR via CUPS.
- **SC#7** — StorTuna OK Tuesday training rehearsal (20-40 starters).
  End-to-end flow: create competition → import course → run readout
  for ~2 hours → print receipts → export IOF XML.

Plan 18 PLAN.md Task 3 documents the exact bench protocol. After the
operator types `approved` with the bench outcome, Phase 1 is complete
and the `v0.1.0-training-mvp` tag can be created. If the bench
session surfaces gaps, a Phase 1.1 gap-closure cycle handles them
(mirrors the Phase 0.1 pattern from 2026-05-13).

## Known Stubs

None. Every endpoint, every CLI flag, every udev rule, every README
section references real working surface. The bin opens a real DB,
runs real migrations, registers real REST + WS + static routes, drives
a real SI bridge (or skips it cleanly with `--no-bridge`), prints to
a real CUPS / direct-USB / stdout sink, schedules real daily backups

- retention, and serves the real SvelteKit-built SPA.

## Threat Flags

No new surface beyond the plan's threat register. The packaged binary
inherits all prior plan threat mitigations (T-WS-FAN-OUT loopback bind

- allow-lan gate, T-FILE-IMPORT XML body limits, T-XSD-INVALID-LEAK
  SC#6 gate, T-RETENTION-MISS + T-RETENTION-OVERREACH retention tests,
  T-BACKUP-WAL-CORRUPT db.backup online API, T-DEV-ENDPOINT FARTOL_DEV
  gate, T-ADMIN-DEV-GATE admin endpoint gate).

Plan-18-specific threat mitigations confirmed:

- **T-INSTALL-BACKDOOR (accept)** — Phase 1 distributes locally-built
  tarballs to known operators; Phase 2 moves to npm registry with
  provenance signing.
- **T-PROD-DEV-LEAK (mitigate)** — README + systemd unit both omit
  FARTOL_DEV from the example invocations; the README explicitly
  warns about it.
- **T-UDEV-OVER-PERMISSION (accept)** — MODE=0660 with vendor-pinned
  rules and GROUP=dialout/lp + TAG+="uaccess" — narrow enough to
  matter, broad enough to work on both logind and group-based systems.
- **T-SYSTEMD-RESTART-LOOP (mitigate)** — RestartSec=5s + journal
  logging make crash loops observable via `journalctl --user -u
fartol`.
- **T-MIGRATIONS-MISSING (mitigate)** — `files[]` includes `drizzle/`
  and the build script verifies `dist/xml/IOF.xsd` + `dist/bin/`
  exist before pack. install-smoke confirms cold-start migrations
  run by booting fresh and asserting /api/health.
- **T-INSTALL-LAYOUT-DRIFT (mitigate, C-H4)** — install-smoke.sh
  - install-smoke.test.ts both assert the BIN path BEFORE
    invocation. The empirical path (`$prefix/bin/fartol`) differs from
    the plan's quoted path (`$prefix/lib/node_modules/.bin/fartol`),
    but the contract holds.

## Self-Check

### Files

- FOUND: apps/edge/scripts/build-tarball.sh
- FOUND: apps/edge/scripts/install-smoke.sh
- FOUND: apps/edge/systemd/fartol.service
- FOUND: apps/edge/udev/99-fartol-sportident.rules
- FOUND: apps/edge/README.md
- FOUND: apps/edge/NOTICE.md
- FOUND: scripts/build-fartol.sh
- FOUND: tests/install/install-smoke.test.ts
- FOUND: .github/workflows/build-fartol.yml
- FOUND: apps/edge/package.json (modified)
- FOUND: apps/edge/tsup.config.ts (modified)
- FOUND: apps/edge/src/server.ts (modified)
- FOUND: apps/edge/src/xml/validate.ts (modified)
- FOUND: package.json (modified)

### Commits

- FOUND: da0dc92 (task 1)
- FOUND: 18af12e (task 2)

### Tarball

- FOUND: dist/fartol-0.1.0.tgz (793 KB, 56 files)
- VERIFIED: install-smoke `PASS` against the rebuilt tarball
- VERIFIED: `pnpm test:install` 2/2 green

## Self-Check: PASSED

## Recommendation

After Jonas runs the Task 3 bench session and types `approved`, tag the
wrap-up commit on `main` as `v0.1.0-training-mvp` (annotated, not pushed
— matching the Phase 0 tag convention). The tarball uploaded by the CI
workflow run on that commit is the shareable artefact for the StorTuna
operator(s).

---

_Phase: 01-single-laptop-training-mvp_
_Plan 18 (final): 2 / 3 tasks complete; Task 3 awaits bench verification._
_Completed (software): 2026-05-15_
