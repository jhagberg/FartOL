// Authored for fartol. Not ported from upstream.
//
// node:test coverage for the Eventor read-only lookup module
// (Plan 02-02 task 1). Validates four behaviors:
//
//   - lookupBySiCard returns a hit shape with the JOIN-resolved club_name
//     for the seeded SI card.
//   - lookupBySiCard returns the miss shape for an unseeded SI card.
//   - lookupByNamePrefix returns up to N suggestions ordered by family_name
//     prefix match, with club_name resolved via LEFT JOIN.
//   - lookupByNamePrefix returns [] for an empty prefix (caller is expected
//     to gate on minLength 2).
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02-PLAN.md task 1
// - .planning/phases/02-4-klubbs-mvp/02-01-SUMMARY.md (re-uses the same
//   competitors-sample.xml fixture seeded via ingestEventorCache).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, type DbHandle } from '../db/index.ts';
import { ingestEventorCache } from './cache.ts';
import { lookupBySiCard, lookupByNamePrefix, type EventorLookupHit } from './lookup.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, '__fixtures__');
const COMPETITORS_XML = path.join(FIX_DIR, 'competitors-sample.xml');
const CLUBS_XML = path.join(FIX_DIR, 'clubs-sample.xml');

function withSeededDb(fn: (handle: DbHandle) => void | Promise<void>): Promise<void> {
  const handle = openDatabase(':memory:');
  return (async () => {
    await ingestEventorCache(handle, COMPETITORS_XML, CLUBS_XML, 1_700_000_000_000);
    try {
      await fn(handle);
    } finally {
      handle.close();
    }
  })();
}

describe('eventor lookup module', () => {
  test('lookupBySiCard returns hit shape with JOIN-resolved club_name', async () => {
    await withSeededDb((handle) => {
      const res = lookupBySiCard(handle, 8535005);
      assert.equal(res.hit, true);
      const hit = res as EventorLookupHit;
      assert.equal(hit.person_id, 1001);
      assert.equal(hit.family_name, 'Hagberg');
      assert.equal(hit.given_name, 'Jonas');
      assert.equal(hit.club_id, 637);
      assert.equal(hit.club_name, 'Stora Tuna OK');
    });
  });

  test('lookupBySiCard returns miss shape for unseeded card', async () => {
    await withSeededDb((handle) => {
      const res = lookupBySiCard(handle, 99999999);
      assert.equal(res.hit, false);
    });
  });

  test('lookupByNamePrefix returns Östberg row with resolved club_name', async () => {
    await withSeededDb((handle) => {
      const rows = lookupByNamePrefix(handle, 'Östb', 20);
      const ostberg = rows.find((r) => r.family_name === 'Östberg');
      assert.ok(ostberg, 'expected Östberg row in suggestions');
      assert.equal(ostberg.given_name, 'Pär');
      assert.equal(ostberg.club_name, 'Stora Tuna OK');
      assert.equal(ostberg.si_card, null);
    });
  });

  test('lookupByNamePrefix returns [] for empty prefix', async () => {
    await withSeededDb((handle) => {
      const rows = lookupByNamePrefix(handle, '', 20);
      assert.deepEqual(rows, []);
    });
  });
});
