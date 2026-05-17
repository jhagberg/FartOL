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
import {
  lookupBySiCard,
  lookupByNamePrefix,
  searchCompetitorsByName,
  searchClubsByName,
  type EventorLookupHit,
} from './lookup.ts';

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

describe('eventor lookup FTS5 — searchCompetitorsByName', () => {
  test('matches given name as a leading prefix (Jonas → Hagberg, Jonas)', async () => {
    await withSeededDb((handle) => {
      const rows = searchCompetitorsByName(handle, 'jonas', 20);
      const hit = rows.find((r) => r.family_name === 'Hagberg');
      assert.ok(hit, 'expected Hagberg row matching given_name prefix');
      assert.equal(hit.given_name, 'Jonas');
    });
  });

  test('matches across given AND family in either word order (jonas hag, hag jonas)', async () => {
    await withSeededDb((handle) => {
      const a = searchCompetitorsByName(handle, 'jonas hag', 20);
      const b = searchCompetitorsByName(handle, 'hag jonas', 20);
      assert.ok(a.find((r) => r.family_name === 'Hagberg' && r.given_name === 'Jonas'));
      assert.ok(b.find((r) => r.family_name === 'Hagberg' && r.given_name === 'Jonas'));
    });
  });

  test('folds diacritics (ostberg → Östberg, par → Pär)', async () => {
    await withSeededDb((handle) => {
      const a = searchCompetitorsByName(handle, 'ostberg', 20);
      assert.ok(a.find((r) => r.family_name === 'Östberg'));
      const b = searchCompetitorsByName(handle, 'par', 20);
      assert.ok(b.find((r) => r.given_name === 'Pär'));
    });
  });

  test('returns [] for whitespace-only / sanitised-empty query', async () => {
    await withSeededDb((handle) => {
      assert.deepEqual(searchCompetitorsByName(handle, '', 20), []);
      assert.deepEqual(searchCompetitorsByName(handle, '   ', 20), []);
      assert.deepEqual(searchCompetitorsByName(handle, '* ( )', 20), []);
    });
  });

  test('limit clamps the result count', async () => {
    await withSeededDb((handle) => {
      // All 3 fixture competitors share club_name 'Stora Tuna OK' — the
      // FTS5 club_name column matches every row for the 'stora' token.
      // limit=2 must clamp the 3-match set down to 2.
      const rows = searchCompetitorsByName(handle, 'stora', 2);
      assert.equal(rows.length, 2);
    });
  });
});

describe('eventor lookup FTS5 — searchClubsByName', () => {
  test('matches by short_name (STK → Stora Tuna OK)', async () => {
    await withSeededDb((handle) => {
      const rows = searchClubsByName(handle, 'stk', 10);
      assert.ok(rows.find((r) => r.name === 'Stora Tuna OK'));
    });
  });

  test('matches by full name token (tuna → Stora Tuna OK)', async () => {
    await withSeededDb((handle) => {
      const rows = searchClubsByName(handle, 'tuna', 10);
      assert.ok(rows.find((r) => r.name === 'Stora Tuna OK'));
    });
  });

  test('matches across both word splits (stora tuna AND tuna stora)', async () => {
    await withSeededDb((handle) => {
      const a = searchClubsByName(handle, 'stora tuna', 10);
      const b = searchClubsByName(handle, 'tuna stora', 10);
      assert.ok(a.find((r) => r.name === 'Stora Tuna OK'));
      assert.ok(b.find((r) => r.name === 'Stora Tuna OK'));
    });
  });

  test('returns [] for empty / sanitised-empty query', async () => {
    await withSeededDb((handle) => {
      assert.deepEqual(searchClubsByName(handle, '', 10), []);
      assert.deepEqual(searchClubsByName(handle, '   ', 10), []);
    });
  });
});
