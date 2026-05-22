## Code Review — 2026-05-17 — dfc1496..b04a6cd

| Severity | Count |
| -------- | ----- |
| BLOCKER  | 0     |
| HIGH     | 0     |
| MEDIUM   | 1     |
| LOW      | 1     |
| NOTE     | 0     |

### F-001: Eventor refresh keeps the pre-settings API key snapshot

**Severity:** MEDIUM
**File:** apps/edge/src/bin/fartola.ts:534-539
**Issue:** `main()` resolves `EVENTOR_API_KEY` once at boot and stores that value inside the `scheduleEventorBoot(...)` handle. After an operator saves a key through `PUT /api/settings/integrations`, `/api/eventor/status` re-reads the config table per request, but `POST /api/__admin/eventor/refresh` still calls the old handle's `runNow()` and `boot.ts` still gates on the captured `opts.apiKey`, so a no-key boot continues returning `reason: 'no_key'` until restart. That makes the new settings UI/status path misleading for the operator who saves a key and then presses "Uppdatera Eventor".
**Recommendation:** Make the Eventor refresh path resolve the key at `runNow()` time, or update/recreate `app.fartolaEventor` after a successful settings PUT. Add a regression test that boots with no key, writes `EVENTOR_API_KEY` to config, and verifies the admin refresh uses the config value without restarting.

### F-002: no_key recovery points operators at a contradictory secret-file location

**Severity:** LOW
**File:** docs/ops/parallel-meos-runbook.md:284-286
**Issue:** The runbook now creates `~/.env.fartola` in the user's home directory, but the no-key recovery text says to add the key to `~/.env.fartola` "in the working directory" and still references a commit-local gitignored secret file. That contradiction can send an event operator to edit the wrong file while trying to recover Eventor prefill.
**Recommendation:** Keep the recovery wording aligned with the setup section: edit the home-directory `~/.env.fartola` and restart/source it, or point operators to the `/installningar` settings UI when that is the intended recovery path.

Summary: 2 findings total — 0 BLOCKER, 0 HIGH, 1 MEDIUM, 1 LOW.
