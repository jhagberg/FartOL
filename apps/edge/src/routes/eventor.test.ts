// Authored for fartola. Not ported from upstream.
//
// node:test coverage for GET /api/eventor/lookup + GET /api/eventor/status
// (Plan 02-02 task 1). Validates:
//
//   - GET /api/eventor/lookup?si_card=8535005 → 200 { hit: true, ... }
//   - GET /api/eventor/lookup (no params) → 400 { error: 'missing_query' }
//   - GET /api/eventor/lookup with si_card AND prefix → 400
//     { error: 'conflicting_query' }
//   - GET /api/eventor/status returns 'no_key' when EVENTOR_API_KEY absent
//   - GET /api/eventor/status returns 'ready' when marker is fresh
//   - GET /api/eventor/status returns 'stale' when marker > 7 days old
//   - GET /api/eventor/status returns fartola_dev:true when FARTOLA_DEV=1
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02-PLAN.md task 1
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §"UI signaling"
//   (status payload shape: { state, ageDays, competitorCount, fartola_dev })

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

import { buildServer } from '../server.ts';
import { openDatabase, type DbHandle } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { ingestEventorCache } from '../eventor/cache.ts';
import { config as configTable } from '../db/schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, '..', 'eventor', '__fixtures__');
const COMPETITORS_XML = path.join(FIX_DIR, 'competitors-sample.xml');
const CLUBS_XML = path.join(FIX_DIR, 'clubs-sample.xml');

interface Ctx {
  app: FastifyInstance;
  handle: DbHandle;
}

async function boot(): Promise<Ctx> {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  const app = await buildServer({ logger: false, dbHandle: handle, nodeId });
  return { app, handle };
}

async function teardown(ctx: Ctx): Promise<void> {
  await ctx.app.close();
  try {
    ctx.handle.close();
  } catch {
    /* already closed */
  }
}

describe('GET /api/eventor/lookup', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await boot();
    await ingestEventorCache(ctx.handle, COMPETITORS_XML, CLUBS_XML, 1_700_000_000_000);
  });

  afterEach(async () => {
    await teardown(ctx);
  });

  test('si_card hit → 200 with hit shape', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/eventor/lookup?si_card=8535005',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      hit: boolean;
      person_id?: number;
      family_name?: string;
      given_name?: string;
      club_name?: string | null;
    };
    assert.equal(body.hit, true);
    assert.equal(body.person_id, 1001);
    assert.equal(body.family_name, 'Hagberg');
    assert.equal(body.given_name, 'Jonas');
    assert.equal(body.club_name, 'Stora Tuna OK');
  });

  test('si_card miss → 200 with miss shape', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/eventor/lookup?si_card=99999999',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { hit: boolean };
    assert.equal(body.hit, false);
  });

  test('prefix hit → 200 with suggestions array', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/eventor/lookup?prefix=Östb',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      suggestions: Array<{ person_id: number; family_name: string; club_name: string | null }>;
    };
    assert.ok(Array.isArray(body.suggestions));
    const ost = body.suggestions.find((s) => s.family_name === 'Östberg');
    assert.ok(ost, 'expected Östberg in suggestions');
    assert.equal(ost.club_name, 'Stora Tuna OK');
  });

  test('no params → 400 missing_query', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/lookup' });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.equal(body.error, 'missing_query');
  });

  test('both params → 400 conflicting_query', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/eventor/lookup?si_card=8535005&prefix=Hag',
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.equal(body.error, 'conflicting_query');
  });
});

describe('GET /api/eventor/status', () => {
  const SAVED_KEY = process.env['EVENTOR_API_KEY'];
  const SAVED_DEV = process.env['FARTOLA_DEV'];

  afterEach(() => {
    if (SAVED_KEY === undefined) delete process.env['EVENTOR_API_KEY'];
    else process.env['EVENTOR_API_KEY'] = SAVED_KEY;
    if (SAVED_DEV === undefined) delete process.env['FARTOLA_DEV'];
    else process.env['FARTOLA_DEV'] = SAVED_DEV;
  });

  test('no key + no marker → state=no_key, fartola_dev derived from env', async () => {
    delete process.env['EVENTOR_API_KEY'];
    delete process.env['FARTOLA_DEV'];
    const ctx = await boot();
    try {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        state: string;
        ageDays: number | null;
        competitorCount: number;
        fartola_dev: boolean;
      };
      assert.equal(body.state, 'no_key');
      assert.equal(body.ageDays, null);
      assert.equal(body.competitorCount, 0);
      assert.equal(body.fartola_dev, false);
    } finally {
      await teardown(ctx);
    }
  });

  test('key + fresh marker + seeded cache → state=ready', async () => {
    process.env['EVENTOR_API_KEY'] = 'TEST-KEY';
    delete process.env['FARTOLA_DEV'];
    const ctx = await boot();
    try {
      const now = Date.now();
      // Seed the cache (3 rows) + write a fresh marker (1 day old).
      await ingestEventorCache(ctx.handle, COMPETITORS_XML, CLUBS_XML, now);
      // Overwrite marker to 1 day old to verify ageDays calculation.
      const oneDayAgo = now - 86_400_000;
      ctx.handle.db
        .insert(configTable)
        .values({ key: 'eventor_cache_refreshed_at_ms', value: String(oneDayAgo) })
        .onConflictDoUpdate({
          target: configTable.key,
          set: { value: String(oneDayAgo) },
        })
        .run();

      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        state: string;
        ageDays: number | null;
        competitorCount: number;
        fartola_dev: boolean;
      };
      assert.equal(body.state, 'ready');
      assert.equal(body.ageDays, 1);
      assert.equal(body.competitorCount, 3);
      assert.equal(body.fartola_dev, false);
    } finally {
      await teardown(ctx);
    }
  });

  test('key + stale marker (>7d) → state=stale', async () => {
    process.env['EVENTOR_API_KEY'] = 'TEST-KEY';
    const ctx = await boot();
    try {
      const now = Date.now();
      await ingestEventorCache(ctx.handle, COMPETITORS_XML, CLUBS_XML, now);
      const tenDaysAgo = now - 10 * 86_400_000;
      ctx.handle.db
        .insert(configTable)
        .values({ key: 'eventor_cache_refreshed_at_ms', value: String(tenDaysAgo) })
        .onConflictDoUpdate({
          target: configTable.key,
          set: { value: String(tenDaysAgo) },
        })
        .run();

      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { state: string; ageDays: number };
      assert.equal(body.state, 'stale');
      assert.equal(body.ageDays, 10);
    } finally {
      await teardown(ctx);
    }
  });

  test('FARTOLA_DEV=1 → fartola_dev=true (request-time eval, not bundler-time)', async () => {
    process.env['FARTOLA_DEV'] = '1';
    delete process.env['EVENTOR_API_KEY'];
    const ctx = await boot();
    try {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { fartola_dev: boolean };
      assert.equal(body.fartola_dev, true);
    } finally {
      await teardown(ctx);
    }
  });

  // ---------------------------------------------------------------------------
  // Plan 02-07 task 2 — boot precedence reflected in /status.
  //
  // The status endpoint exposes a `source` field so the SettingsView
  // banner can render "Värdet kommer från ~/.env.fartola …" when env
  // wins, and ops can confirm at a glance which precedence path is
  // active without restarting the bridge. Truth keys:
  //   - env set → source: 'env'
  //   - env unset, config row set → source: 'config'
  //   - neither → state: 'no_key' (existing) + source: 'absent'
  // ---------------------------------------------------------------------------

  test('Task 2 Test 4a: env set → source=env', async () => {
    process.env['EVENTOR_API_KEY'] = 'ENV-WINS';
    const ctx = await boot();
    try {
      // Seed a config row that would normally lose to env.
      ctx.handle.db
        .insert(configTable)
        .values({ key: 'EVENTOR_API_KEY', value: 'CONFIG-LOSES' })
        .run();
      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { source: string };
      assert.equal(body.source, 'env');
    } finally {
      await teardown(ctx);
    }
  });

  test('Task 2 Test 4b: env undefined + config row → source=config (UI write path)', async () => {
    delete process.env['EVENTOR_API_KEY'];
    const ctx = await boot();
    try {
      ctx.handle.db.insert(configTable).values({ key: 'EVENTOR_API_KEY', value: 'FROM-UI' }).run();
      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { state: string; source: string };
      // When the UI writes a key, the bridge should NOT report no_key
      // even though the env var is unset. ageDays/marker still drives
      // ready/stale/offline; here we just assert source switched.
      assert.equal(body.source, 'config');
      assert.notEqual(body.state, 'no_key');
    } finally {
      await teardown(ctx);
    }
  });

  test('Task 2 Test 4c: neither → source=absent + state=no_key', async () => {
    delete process.env['EVENTOR_API_KEY'];
    const ctx = await boot();
    try {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/eventor/status' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { state: string; source: string };
      assert.equal(body.state, 'no_key');
      assert.equal(body.source, 'absent');
    } finally {
      await teardown(ctx);
    }
  });
});
