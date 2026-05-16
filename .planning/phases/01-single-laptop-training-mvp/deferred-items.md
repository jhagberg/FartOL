# Deferred items — Phase 1

Out-of-scope discoveries surfaced while executing plans. Each entry: where
found, what the symptom is, what fix is appropriate, and which plan should
pick it up.

## 2026-05-15 — e2e flake under heavy parallel load (resolved/superseded)

**Found during:** plan 01-16 (IOF XML export e2e)

**Symptom:** Adding a third or fourth e2e spec to `tests/e2e/` increases
the number of parallel Playwright workers (`fullyParallel: true`,
`workers: 6` from the default). Two pre-existing tests become flaky in
this load pattern:

- `tests/e2e/results.spec.ts > live results update via WS …` — the
  Anna row sometimes doesn't appear within the 5s timeout when run in
  parallel with `walkup.spec.ts` + `export.spec.ts` + `wizard.spec.ts`.
- `tests/e2e/walkup.spec.ts > walk-up creates competitor` and
  `tests/e2e/readout.spec.ts > card_read updates LatestReadCard via WS`
  sometimes fail to render their respective view test-ids.

**Root cause hypothesis:** the shared SQLite tmp DB
(`tests/e2e/.tmp.db`) + the single SvelteKit dev server + WS broadcast
fan-out under 6 parallel workers race in a way that wasn't an issue
when only ~10 specs existed. Adding the 2 export tests pushed the
worker pool past whatever timing margin the existing specs had.

**Reproduction:** `FARTOL_DEV=1 npx playwright test --reporter=line`
on a fresh tmp DB fails 1–2 specs roughly half the time; running each
spec or pair in isolation passes 100% of the time. Plan 01-16 verified
its own two specs pass when run isolated AND when paired with any one
other spec.

**Fix scope:** outside plan 01-16 — likely needs (a) Playwright
`workers: 2` in CI or (b) per-spec DB isolation or (c) WS reconnect
tolerance in the affected views. Picked up by a later phase / cleanup
plan.

**Not a regression** caused by plan 01-16. Verified by running the
full e2e suite with `tests/e2e/export.spec.ts` moved aside — 13 pass,
2 skipped, 0 fail. With it included — 13 pass, 2 skipped, 1 fail.

**Resolution on 2026-05-16:** no longer an active deferred item. The
suite was stabilized/contained by the post-review e2e fixes and CI worker
settings, and a current clean run of `CI=1 pnpm e2e --workers=1` passes:
15 passed, 2 skipped. Keep this entry as historical context only; no
Phase 2 follow-up is required unless the project later requires high-worker
parallel e2e execution with a shared dev server and shared SQLite DB.
