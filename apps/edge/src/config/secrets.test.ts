// Authored for fartol. Not ported from upstream.
//
// node:test coverage for resolveSecret / resolveSecretSource (Plan
// 02-07 task 2). The helper lifts the env→config→absent precedence
// out of apps/edge/src/eventor/boot.ts + apps/edge/src/routes/eventor.ts
// so the new POST /api/settings/integrations surface (Plan 02-07 task
// 1) can write to the SAME config row that the next bridge boot reads.
//
// Tests validate the three precedence states:
//   1. env wins when both env AND config are set.
//   2. config fallback when env is undefined.
//   3. absent when neither is set.
// Plus the source variant returns the matching tag.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-07-PLAN.md task 2

import { describe, test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { config as configTable } from '../db/schema.ts';
import { resolveSecret, resolveSecretSource } from './secrets.ts';

const TEST_KEY = 'EVENTOR_API_KEY';

describe('resolveSecret (Plan 02-07 task 2)', () => {
  const SAVED = process.env[TEST_KEY];
  let handle: DbHandle;

  beforeEach(() => {
    handle = openDatabase(':memory:');
    delete process.env[TEST_KEY];
  });

  afterEach(() => {
    try {
      handle.close();
    } catch {
      /* already closed */
    }
    if (SAVED === undefined) delete process.env[TEST_KEY];
    else process.env[TEST_KEY] = SAVED;
  });

  test('Test 1: env set + config set → env wins (precedence)', () => {
    process.env[TEST_KEY] = 'ENV-WINS';
    handle.db.insert(configTable).values({ key: TEST_KEY, value: 'CONFIG-LOSES' }).run();
    assert.equal(resolveSecret(handle, TEST_KEY), 'ENV-WINS');
    assert.equal(resolveSecretSource(handle, TEST_KEY), 'env');
  });

  test('Test 2: env undefined + config set → config fallback', () => {
    handle.db.insert(configTable).values({ key: TEST_KEY, value: 'FROM-UI' }).run();
    assert.equal(resolveSecret(handle, TEST_KEY), 'FROM-UI');
    assert.equal(resolveSecretSource(handle, TEST_KEY), 'config');
  });

  test('Test 3: neither set → undefined + source absent', () => {
    assert.equal(resolveSecret(handle, TEST_KEY), undefined);
    assert.equal(resolveSecretSource(handle, TEST_KEY), 'absent');
  });

  test('env empty-string is treated as absent (boot.ts contract)', () => {
    process.env[TEST_KEY] = '';
    handle.db.insert(configTable).values({ key: TEST_KEY, value: 'FROM-UI' }).run();
    // Empty env string MUST NOT shadow a real config value — that would
    // make `EVENTOR_API_KEY=` (set but empty) silently break the UI
    // override path. boot.ts treats !apiKey || length===0 as no_key
    // today; resolveSecret matches that behaviour so the two stay in
    // sync.
    assert.equal(resolveSecret(handle, TEST_KEY), 'FROM-UI');
    assert.equal(resolveSecretSource(handle, TEST_KEY), 'config');
  });

  test('config empty-string is treated as absent', () => {
    handle.db.insert(configTable).values({ key: TEST_KEY, value: '' }).run();
    assert.equal(resolveSecret(handle, TEST_KEY), undefined);
    assert.equal(resolveSecretSource(handle, TEST_KEY), 'absent');
  });
});
