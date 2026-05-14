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
import { events } from '../db/schema.ts';
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
  const app = await buildServer({ logger: false, dbHandle: handle, nodeId });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as AddressInfo;
  return { app, handle, nodeId, url: `ws://127.0.0.1:${addr.port}/ws` };
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

  test('test 5 (C-M1 regression gate): results: hello emits ZERO replay envelopes', async () => {
    // Pre-load DB with 3 card_read events for comp-5.
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 1);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 2);
    insertCardRead(ctx.handle, ctx.nodeId, 'comp-5', 3);
    const ws = new WebSocket(ctx.url);
    await waitOpen(ws);
    const framesPromise = collectFrames(ws, 200);
    ws.send(
      JSON.stringify({
        type: 'hello',
        channels: [resultsChannel('comp-5')],
        last_seen_seq: 0,
      })
    );
    const frames = await framesPromise;
    const replayFrames = frames.filter((f) => f['type'] === 'replay');
    assert.equal(
      replayFrames.length,
      0,
      `results: channel emitted ${replayFrames.length} replay envelopes — C-M1 regression`
    );
    // Plan 08 will assert ONE results_full frame here; plan 03 stub emits
    // nothing so we accept zero frames total.
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
});
