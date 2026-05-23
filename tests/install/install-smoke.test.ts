// Authored for fartola. Not ported from upstream.
//
// Install-smoke regression gate. Two tests:
//
//   1. End-to-end: spawn apps/edge/scripts/install-smoke.sh against the
//      locally-built tarball; assert it emits `PASS` and prints the
//      `Resolved BIN path: ...` line (C-H4 transparency hook). This is the
//      same path REQ-OPS-001 binds operators to — `npm install -g <tarball>`
//      drops the `fartola` bin in PATH and `fartola` boots cleanly.
//
//   2. C-H4 layout assertion (independent of the shell script): run the
//      raw `npm install --prefix <tmpdir> -g <tarball>` invocation and
//      verify that the bin resolves at `$tmpdir/lib/node_modules/.bin/fartola`
//      with the executable bit set. If a future npm release shifts the
//      global-prefix layout, this test fails BEFORE the longer smoke run
//      and gives operators a precise pointer at the regression.
//
// Run via `node --test --import tsx tests/install/install-smoke.test.ts`
// (the root `test:install` script wires this up; `bash scripts/build-fartola.sh`
// must have produced a tarball under `dist/` first).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-18-PLAN.md task 2
//   (C-H4 LOCKED contract: both --prefix and -g flags required).
// - threat_model T-INSTALL-LAYOUT-DRIFT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function resolveTarball(): string {
  // The build script aliases the pnpm-named tarball to `dist/fartola-<version>.tgz`
  // so this test (and operators following the README) refer to a stable name.
  // Match only fartola-VERSION.tgz, NOT fartola-edge-VERSION.tgz (the pnpm-default
  // scoped name) which npm would attempt to resolve as a git url when passed
  // as a relative path.
  const list = execSync(
    'ls dist/fartola-[0-9]*.tgz 2>/dev/null || ls dist/fartola-*.tgz 2>/dev/null',
    { encoding: 'utf8' }
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /\/fartola-\d/.test(line));
  list.sort();
  const relative = list[list.length - 1] ?? '';
  if (!relative) {
    throw new Error(
      'tests/install: no tarball under dist/. Run `bash scripts/build-fartola.sh` first.'
    );
  }
  // Convert to absolute path so `npm install <tarball>` doesn't treat it as
  // a git remote when the working directory differs from the project root.
  const absolute = path.resolve(process.cwd(), relative);
  if (!existsSync(absolute)) {
    throw new Error(`tests/install: resolved ${absolute} but the file does not exist.`);
  }
  return absolute;
}

test('install-smoke: tarball boots cleanly via the smoke script', () => {
  const tarball = resolveTarball();
  // Allocate a unique port per test run to avoid clashes when this runs
  // alongside the dev server or another smoke run.
  const port = String(31000 + Math.floor(Math.random() * 1000));
  const out = execSync(`bash apps/edge/scripts/install-smoke.sh '${tarball}'`, {
    encoding: 'utf8',
    env: { ...process.env, FARTOLA_SMOKE_PORT: port },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  assert.match(out, /PASS/, `expected PASS marker in install-smoke output; got:\n${out}`);
  // C-H4 transparency hook: the smoke script prints the resolved BIN path
  // so a future layout drift is debuggable without reading the script.
  assert.match(out, /Resolved BIN path:/, 'expected smoke script to print the resolved BIN path');
});

test('C-H4 regression: install-smoke BIN path resolves to a real executable BEFORE invocation', () => {
  const tarball = resolveTarball();
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fartola-bin-check-'));
  try {
    // --prefix + -g together is what produces the global-prefix bin layout.
    // Dropping -g shifts the bin to $tmpRoot/node_modules/.bin/fartola which
    // the install-smoke shell script does NOT look at — the historical
    // C-H4 regression.
    const r = spawnSync('npm', ['install', '--prefix', tmpRoot, '-g', '--silent', tarball], {
      stdio: 'inherit',
    });
    assert.equal(r.status, 0, 'npm install --prefix ... -g exit code must be 0');
    // npm global-prefix layout: the bin symlink lives at $prefix/bin/<name>
    // and points into $prefix/lib/node_modules/<scope>/<name>/dist/bin/fartola.cjs.
    const BIN = path.join(tmpRoot, 'bin', 'fartola');
    assert.ok(
      existsSync(BIN),
      `BIN must exist at ${BIN} (C-H4 layout assertion — if npm has changed its global-prefix layout, update apps/edge/scripts/install-smoke.sh to match)`
    );
    const stat = statSync(BIN);
    assert.ok(stat.isFile() || stat.isSymbolicLink(), 'BIN must be a file or symlink');
    if (process.platform !== 'win32') {
      assert.ok((stat.mode & 0o111) !== 0, 'BIN must have at least one execute bit set');
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
