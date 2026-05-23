// Authored for fartola. Not ported from upstream.
//
// vitest unit tests for the browser-side WsClient wrapper. Uses a minimal
// FakeWebSocket so the test does not actually open a network socket; the
// fake exposes `triggerOpen`, `triggerMessage`, `triggerClose` to drive
// the WsClient through its lifecycle deterministically.
//
// PATTERNS S-2 sink injection: the fake constructor is injected via
// globalThis.WebSocket which the WsClient reads at construction time.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { WsClient, RECONNECT_BACKOFF_MS } from './client.ts';
import type { WsEnvelope } from '@fartola/shared-types';

interface FakeWsCtor {
  instances: FakeWebSocket[];
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState: number = 0; // CONNECTING
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  triggerOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  triggerMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  triggerClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function asCtor(): FakeWsCtor {
  return FakeWebSocket as unknown as FakeWsCtor;
}

const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  // Override globalThis.WebSocket so `new WebSocket(url)` constructs the fake.
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  vi.useRealTimers();
});

describe('WsClient', () => {
  it('test 1: on open, sends hello with subscribed channels + last_seen_seq=0', () => {
    const received: WsEnvelope[] = [];
    const client = new WsClient('ws://example/ws', (env) => received.push(env));
    client.preSubscribe('readout:abc');
    client.connect();

    expect(asCtor().instances.length).toBe(1);
    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();

    expect(ws.sent.length).toBe(1);
    const hello = JSON.parse(ws.sent[0]!) as {
      type: string;
      channels: string[];
      last_seen_seq: number;
    };
    expect(hello.type).toBe('hello');
    expect(hello.channels).toEqual(['readout:abc']);
    expect(hello.last_seen_seq).toBe(0);

    client.close();
  });

  it('test 2: receiving an envelope with seq=5 sets lastSeenSeq=5; reconnect hello reflects it', () => {
    const received: WsEnvelope[] = [];
    const client = new WsClient('ws://example/ws', (env) => received.push(env));
    client.preSubscribe('readout:abc');
    client.connect();

    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();
    ws.triggerMessage({ type: 'card_read', channel: 'readout:abc', payload: { x: 1 }, seq: 5 });

    expect(received.length).toBe(1);
    expect(client.seq).toBe(5);
    expect(received[0]?.type).toBe('card_read');

    // Simulate a disconnect; allow reconnect to schedule but use fake timers
    // so we can advance deterministically.
    vi.useFakeTimers();
    ws.triggerClose();
    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]!);
    expect(asCtor().instances.length).toBe(2);
    const ws2 = FakeWebSocket.instances[1]!;
    ws2.triggerOpen();
    const hello2 = JSON.parse(ws2.sent[0]!) as { last_seen_seq: number };
    expect(hello2.last_seen_seq).toBe(5);

    client.close();
  });

  it('test 3: on close, waits backoff[0]=1000ms before reconnecting', () => {
    vi.useFakeTimers();
    const client = new WsClient('ws://example/ws', () => {});
    client.preSubscribe('readout:abc');
    client.connect();

    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();
    ws.triggerClose();

    // 999ms elapsed — no reconnect yet.
    vi.advanceTimersByTime(999);
    expect(asCtor().instances.length).toBe(1);

    // 1000ms — reconnect scheduled and fired.
    vi.advanceTimersByTime(1);
    expect(asCtor().instances.length).toBe(2);

    client.close();
  });

  it('test 4: after close(), subsequent onclose events do NOT schedule reconnect', () => {
    vi.useFakeTimers();
    const client = new WsClient('ws://example/ws', () => {});
    client.preSubscribe('readout:abc');
    client.connect();

    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();

    client.close();
    // After close(), the underlying close handler fires synchronously
    // (via ws.close() -> onclose). It must NOT spawn a reconnect.
    vi.advanceTimersByTime(60_000);
    expect(asCtor().instances.length).toBe(1);
  });
});
