// Authored for fartol. Not ported from upstream.
//
// node:test integration tests for the @fartol/edge Fastify factory.
// Uses app.inject() for HTTP routing assertions (no port consumed) and
// reaches directly into parseArgs for the T-WS-FAN-OUT mitigation gate
// — the bin's main() lifecycle stays guarded by isEntrypoint so this
// test file imports it as a pure module.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildServer } from './server.ts';
import { parseArgs } from './bin/fartol.ts';

describe('apps/edge buildServer', () => {
  test('GET /api/health returns 200 with HealthDTO shape', async () => {
    const app = await buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      assert.equal(res.statusCode, 200);
      const body = res.json() as Record<string, unknown>;
      assert.equal(body['status'], 'ok');
      assert.equal(typeof body['node_id'], 'string');
      assert.equal(typeof body['uptime_ms'], 'number');
    } finally {
      await app.close();
    }
  });

  test('GET /api/unknown returns 404 { error: "Not found" }', async () => {
    const app = await buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/unknown' });
      assert.equal(res.statusCode, 404);
      const body = res.json() as Record<string, unknown>;
      assert.equal(body['error'], 'Not found');
    } finally {
      await app.close();
    }
  });
});

describe('apps/edge bin parseArgs (T-WS-FAN-OUT gate)', () => {
  test('default bind-host is 127.0.0.1', () => {
    const opts = parseArgs([]);
    assert.equal(opts.bindHost, '127.0.0.1');
    assert.equal(opts.port, 3000);
    assert.equal(opts.dbPath, './fartol.db');
    assert.equal(opts.allowLan, false);
  });

  test('--bind-host 0.0.0.0 without --allow-lan is rejected', () => {
    assert.throws(() => parseArgs(['--bind-host', '0.0.0.0']), /allow-lan/);
  });

  test('--bind-host 0.0.0.0 with --allow-lan is accepted', () => {
    const opts = parseArgs(['--bind-host', '0.0.0.0', '--allow-lan']);
    assert.equal(opts.bindHost, '0.0.0.0');
    assert.equal(opts.allowLan, true);
  });

  test('--bind-host 192.168.1.5 without --allow-lan is rejected', () => {
    assert.throws(() => parseArgs(['--bind-host', '192.168.1.5']), /allow-lan/);
  });

  test('--bind-host ::1 (loopback) accepted without --allow-lan', () => {
    const opts = parseArgs(['--bind-host', '::1']);
    assert.equal(opts.bindHost, '::1');
  });

  test('--port parses integer; rejects out-of-range', () => {
    assert.equal(parseArgs(['--port', '4000']).port, 4000);
    assert.throws(() => parseArgs(['--port', '0']), /port/);
    assert.throws(() => parseArgs(['--port', '70000']), /port/);
    assert.throws(() => parseArgs(['--port', 'abc']), /port/);
  });

  test('unknown argument throws', () => {
    assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
  });
});
