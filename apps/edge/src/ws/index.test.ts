// Authored for fartol. Not ported from upstream.
//
// node:test integration coverage for the @fastify/websocket plugin. Uses
// a real WS handshake against a Fastify instance listening on 127.0.0.1
// with port 0 (OS-assigned ephemeral port) so the tests don't fight over
// a fixed port in CI.
//
// Tests 1-4: WS lifecycle + hello/subscribe + T-EVENT-REPLAY + T-WS-FAN-OUT.
// Tests 5-6 (C-M1 regression gates): readout: emits replay; results:
// emits zero replay envelopes. The C-M1 contract — `results:` channels
// never receive raw `replay` envelopes — is locked here in plan 03 and
// amended (not replaced) by plan 08 to also assert one `results_full`
// frame.

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';

import { buildServer } from '../server.ts';
import { openDatabase } from '../db/index.ts';
import { ensureNodeId } from '../db/node-id.ts';
import { events, classes, controls, courses, courseControls, competitors } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import type { FastifyInstance } from 'fastify';
import { readoutChannel, resultsChannel } from '@fartol/shared-types';

interface Ctx {
  app: FastifyInstance;
  handle: DbHandle;
  nodeId: string;
  url: string;
}

async function bootServer(): Promise<Ctx> {
  const handle = openDatabase(':memory:');
  const nodeId = ensureNodeId(handle);
  // Inject debounce 0 so markDirty -> recompute -> broadcast happens
  // synchronously (the hello path calls recomputeNow directly so this is
  // not strictly required for plan 08's tests, but it keeps any future
  // markDirty-driven assertions deterministic).
  const app = await buildServer({
    logger: false,
    dbHandle: handle,
    nodeId,
    projectionDebounceMs: 0,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as AddressInfo;
  return { app, handle, nodeId, url: `ws://127.0.0.1:${addr.port}/ws` };
}

function seedCompetitionForResults(handle: DbHandle, competitionId: string): string {
  handle.sqlite
    .prepare(
      `INSERT OR IGNORE INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms)
       VALUES (?, ?, ?, 'classic', 0, ?)`
    )
    .run(competitionId, `C-${competitionId}`, '2026-05-14', 1_000);
  const classId = `cls-${competitionId}`;
  handle.db.insert(classes).values({ id: classId, competitionId, name: 'H21' }).run();
  const controlId = `ctl-${competitionId}-31`;
  handle.db.insert(controls).values({ id: controlId, competitionId, code: 31 }).run();
  const courseId = `crs-${competitionId}`;
  handle.db
    .insert(courses)
    .values({ id: courseId, competitionId, name: 'A', classId, lengthM: 1000 })
    .run();
  handle.db
    .insert(courseControls)
    .values({ id: `cc-${competitionId}-1`, courseId, controlId, orderIdx: 0 })
    .run();
  handle.db
    .insert(competitors)
    .values({
      id: `cmp-${competitionId}`,
      competitionId,
      name: 'Anna',
      club: 'Test',
      classId,
      cardNumber: 7501853,
      consentAtMs: 1_000,
      consentStatus: 'explicit',
      scrubbedAtMs: null,
    })
    .run();
  return classId;
}

function ensureCompetition(handle: DbHandle, id: string): void {
  handle.sqlite
    .prepare(
      'INSERT OR IGNORE INTO competitions (id, name, date, receipt_template, auto_print, created_at_ms) VALUES (?, ?, ?, ?, 0, ?)'
    )
    .run(id, `test-${id}`, '2026-05-14', 'classic', 1_000);
}

function insertCardRead(
  handle: DbHandle,
  nodeId: string,
  competitionId: string,
  seq: number
): void {
  ensureCompetition(handle, competitionId);
  handle.db
    .insert(events)
    .values({
      nodeId,
      localSeq: seq,
      competitionId,
      eventType: 'card_read',
      eventTimeMs: 1000 + seq,
      recordedAtMs: 1000 + seq,
      payload: {
        event_type: 'card_read',
        card_number: 100 + seq,
        card_type: 'SI10',
        start: null,
        finish: null,
        check: null,
        clear: null,
        punch_count: 0,
        punches: [],
        card_holder: null,
      },
    })
    .run();
}

function collectFrames(ws: WebSocket, ms: number): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve) => {
    const frames: Array<Record<string, unknown>> = [];
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      try {
        frames.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // skip malformed
      }
    });
    setTimeout(() => resolve(frames), ms);
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', (err) => reject(err));
  });
}

describe('apps/edge ws plugin', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await bootServer();
  });

  afterEach(async () => {
    await ctx.app.close();
    ctx.handle.close();
  });

  test('test 1: hello on a readout: channel completes without disconnect', async () => {
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [readoutChannel('test-id')],
        last_seen_seq: 0,
      })
    );
    // Give the server 100ms; we expect zero frames (no missed events) and
    // an open socket.
    await sleep(100);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  test('test 2: wsBroadcast delivers card_read to a subscribed client', async () => {
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    const channel = readoutChannel('comp-2');
    ws.send(JSON.stringify({ type: 'hello', channels: [channel], last_seen_seq: 0 }));
    // Wait for the hello to be processed.
    await sleep(50);

    const framesPromise = collectFrames(ws, 200);
    ctx.app.wsBroadcast(channel, {
      type: 'card_read',
      payload: { card_number: 7501853, card_type: 'SI10' },
      seq: 7,
    });
    const frames = await framesPromise;
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.['type'], 'card_read');
    assert.equal(frames[0]?.['channel'], channel);
    assert.equal(frames[0]?.['seq'], 7);
    const payload = frames[0]?.['payload'] as { card_number: number };
    assert.equal(payload.card_number, 7501853);
    ws.close();
  });

  test('test 3 (T-EVENT-REPLAY): hello with last_seen_seq=-1 sends no replay frames', async () => {
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-3', 1);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-3', 2);
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    const framesPromise = collectFrames(ws, 200);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [readoutChannel('comp-3')],
        last_seen_seq: -1,
      })
    );
    const frames = await framesPromise;
    assert.equal(frames.length, 0);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  test('test 4 (T-WS-FAN-OUT): Origin: http://evil.com is rejected at upgrade', async () => {
    const ws = new WebSocket(ctx.url, { headers: { Origin: 'http://evil.com:1234' } });
    let unexpectedOpen = false;
    let rejected = false;
    await new Promise<void>((resolve) => {
      ws.once('open', () => {
        unexpectedOpen = true;
        ws.close();
        resolve();
      });
      ws.once('unexpected-response', () => {
        rejected = true;
        resolve();
      });
      ws.once('error', () => {
        rejected = true;
        resolve();
      });
      setTimeout(resolve, 500);
    });
    assert.equal(unexpectedOpen, false, 'connection from foreign origin must not open');
    assert.equal(rejected, true, 'foreign-origin upgrade must surface unexpected-response/error');
  });

  test('test 4b (CR-001): Origin: http://127.0.0.1:3000 (packaged prod SPA) is accepted at upgrade', async () => {
    const ws = new WebSocket(ctx.url, { headers: { Origin: 'http://127.0.0.1:3000' } });
    let opened = false;
    let rejected = false;
    await new Promise<void>((resolve) => {
      ws.once('open', () => {
        opened = true;
        resolve();
      });
      ws.once('unexpected-response', () => {
        rejected = true;
        resolve();
      });
      ws.once('error', () => {
        rejected = true;
        resolve();
      });
      setTimeout(resolve, 500);
    });
    assert.equal(rejected, false, 'packaged-prod loopback origin must not be 403d');
    assert.equal(opened, true, 'packaged-prod loopback origin must complete WS handshake');
    ws.close();
  });

  test('test 5 (C-M1 regression gate): results: hello emits ZERO replay + exactly ONE results_full', async () => {
    // Seed competition + class + course + competitor so the projection has
    // content (plan 08 amends the plan-03 stub which emitted zero frames).
    seedCompetitionForResults(ctx.handle, 'comp-5');
    // Pre-load DB with 3 card_read events for comp-5.
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 1);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 2);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 3);
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    // 300ms gives recomputeNow time to walk the events table on machines
    // slower than the local laptop. The hello-driven results_full emission
    // is synchronous in the hello handler but the WS frame still has to
    // make a round trip back to the test client.
    const framesPromise = collectFrames(ws, 300);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [resultsChannel('comp-5')],
        last_seen_seq: 0,
      })
    );
    const frames = await framesPromise;
    // C-M1: ZERO `replay` envelopes on a results: channel under any
    // condition (plan 03 contract; survives plan 08).
    const replayFrames = frames.filter((f) => f['type'] === 'replay');
    assert.equal(
      replayFrames.length,
      0,
      `results: channel emitted ${replayFrames.length} replay envelopes — C-M1 regression`
    );
    // Plan 08: EXACTLY ONE `results_full` envelope with the right shape.
    const fullFrames = frames.filter((f) => f['type'] === 'results_full');
    assert.equal(
      fullFrames.length,
      1,
      `expected exactly one results_full; got ${fullFrames.length}`
    );
    const full = fullFrames[0]!;
    assert.equal(full['channel'], resultsChannel('comp-5'));
    const payload = full['payload'] as { classes: unknown[]; pending_unknown_cards: unknown };
    assert.ok(Array.isArray(payload.classes), 'payload.classes must be an array');
    assert.ok(
      Array.isArray(payload.pending_unknown_cards),
      'payload.pending_unknown_cards must be an array'
    );
    ws.close();
  });

  test('test 6 (C-M1 readout still gets replay): readout: hello emits one replay per missed event', async () => {
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-6', 1);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-6', 2);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-6', 3);
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    const framesPromise = collectFrames(ws, 200);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [readoutChannel('comp-6')],
        last_seen_seq: 0,
      })
    );
    const frames = await framesPromise;
    const replayFrames = frames.filter((f) => f['type'] === 'replay');
    assert.equal(replayFrames.length, 3, 'readout: hello must emit one replay per missed event');
    assert.deepEqual(
      replayFrames.map((f) => f['seq']),
      [1, 2, 3]
    );
    for (const frame of replayFrames) {
      assert.equal(frame['channel'], readoutChannel('comp-6'));
    }
    ws.close();
  });

  test('test 7 (plan 08 silent fall-through): results: hello on unknown competition emits zero frames', async () => {
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    const framesPromise = collectFrames(ws, 300);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [resultsChannel('does-not-exist')],
        last_seen_seq: 0,
      })
    );
    const frames = await framesPromise;
    // Unknown competition → ZERO frames total. Specifically zero `replay`
    // (C-M1 preserved) AND zero `results_full` (silent fall-through).
    const replayFrames = frames.filter((f) => f['type'] === 'replay');
    const fullFrames = frames.filter((f) => f['type'] === 'results_full');
    assert.equal(replayFrames.length, 0);
    assert.equal(fullFrames.length, 0);
    assert.equal(
      frames.length,
      0,
      `unknown comp results: hello must emit zero frames; got ${frames.length}`
    );
    // Socket must still be open — the hello succeeded silently.
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  test('test 8 (plan 08 integration): card_read via simulate-read triggers a results_update on results:<id>', async () => {
    // Bootstrap: seed comp + class + competitor; subscribe to results:.
    process.env['FARTOL_DEV'] = '1';
    // Build a fresh server WITH FARTOL_DEV so /api/__dev/simulate-read is
    // registered (beforeEach's server was built without that env).
    const handle = openDatabase(':memory:');
    const nodeId = ensureNodeId(handle);
    const app = await buildServer({
      logger: false,
      dbHandle: handle,
      nodeId,
      projectionDebounceMs: 0,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    try {
      const addr = app.server.address() as AddressInfo;
      const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
      seedCompetitionForResults(handle, 'comp-8');

      const ws = new WebSocket(wsUrl);
      await waitOpen(ws);
      // Subscribe to the results channel.
      ws.send(
        JSON.stringify({
          type: 'hello',
          channels: [resultsChannel('comp-8')],
          last_seen_seq: 0,
        })
      );
      // Drain hello-time frames (results_full).
      await sleep(80);

      // Now record subsequent frames.
      const framesPromise = collectFrames(ws, 400);

      // Drive a card_read via simulate-read.
      const res = await app.inject({
        method: 'POST',
        url: '/api/__dev/simulate-read',
        payload: {
          competition_id: 'comp-8',
          card_number: 7501853,
          card_type: 'SI10',
          punches: [{ control_code: 31, time_ms: 1000 }],
        },
      });
      assert.equal(res.statusCode, 201);

      const frames = await framesPromise;
      const updateFrames = frames.filter((f) => f['type'] === 'results_update');
      assert.ok(
        updateFrames.length >= 1,
        `expected ≥1 results_update on simulate-read; got ${updateFrames.length}`
      );
      const update = updateFrames[0]!;
      assert.equal(update['channel'], resultsChannel('comp-8'));
      const payload = update['payload'] as { class_id: string; rows: unknown[] };
      assert.ok(Array.isArray(payload.rows));
      ws.close();
    } finally {
      await app.close();
      handle.close();
      delete process.env['FARTOL_DEV'];
    }
  });

  test('test 9 (plan 08 walk-up integration): POST /api/competitors triggers a results_update on results:<id>', async () => {
    // Build a fresh server + seed via REST so the walk-up path is exercised
    // end-to-end (POST /api/competitors with a card → card_bound event →
    // projection markDirty → results_update broadcast).
    const handle = openDatabase(':memory:');
    const nodeId = ensureNodeId(handle);
    const app = await buildServer({
      logger: false,
      dbHandle: handle,
      nodeId,
      projectionDebounceMs: 0,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    try {
      const addr = app.server.address() as AddressInfo;
      const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

      // Seed comp + class so POST /api/competitors validates.
      const compRes = await app.inject({
        method: 'POST',
        url: '/api/competitions',
        payload: { name: 'WkUp', date: '2026-05-22' },
      });
      const competitionId = (compRes.json() as { id: string }).id;
      const classRes = await app.inject({
        method: 'POST',
        url: `/api/competitions/${competitionId}/classes`,
        payload: { name: 'H21' },
      });
      const classId = (classRes.json() as { id: string }).id;

      const ws = new WebSocket(wsUrl);
      await waitOpen(ws);
      ws.send(
        JSON.stringify({
          type: 'hello',
          channels: [resultsChannel(competitionId)],
          last_seen_seq: 0,
        })
      );
      // Drain hello-time frames.
      await sleep(80);

      const framesPromise = collectFrames(ws, 400);

      // Walk-up POST with consent + a card_number → card_bound event.
      const postRes = await app.inject({
        method: 'POST',
        url: '/api/competitors',
        payload: {
          competition_id: competitionId,
          class_id: classId,
          name: 'Walk-Up Alice',
          club: 'WkUp Club',
          card_number: 8888888,
          consent: true,
        },
      });
      assert.equal(postRes.statusCode, 201);

      const frames = await framesPromise;
      const updateFrames = frames.filter((f) => f['type'] === 'results_update');
      assert.ok(
        updateFrames.length >= 1,
        `expected ≥1 results_update on walk-up POST; got ${updateFrames.length}`
      );
      const update = updateFrames[0]!;
      assert.equal(update['channel'], resultsChannel(competitionId));
      ws.close();
    } finally {
      await app.close();
      handle.close();
    }
  });
});
