// Authored for fartola. Not ported from upstream.
//
// Browser-side WebSocket wrapper. Handles:
//   - Auto-reconnect with the LOCKED backoff schedule from UI-SPEC
//     §"Auto-reconnect": 1s / 2s / 4s / 8s / 16s / 30s (caps at 30s).
//   - Hello-replay handshake: on every (re)connect, sends
//     `{ type: 'hello', channels: [...], last_seen_seq }` so the server
//     can replay missed events for the readout: channels (C-M1 dispatch
//     on the server side is `replay` envelopes for readout, nothing for
//     results — plan 08 lifts results to `results_full`).
//   - `subscribe(channel)` for after-the-fact channel additions.
//   - close() to gracefully stop the reconnect loop.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 3
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"WebSocket client wrapper" (verbatim with Svelte-5-runes adaptation)
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Auto-reconnect" — backoff schedule LOCKED

import type {
  ChannelName,
  WsEnvelope,
  WsHelloMessage,
  WsSubscribeMessage,
} from '@fartola/shared-types';

/** UI-SPEC §"Auto-reconnect" — LOCKED. Do not adjust without an ADR. */
export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export class WsClient {
  private ws: WebSocket | null = null;
  private channels = new Set<ChannelName>();
  private lastSeenSeq = 0;
  private attempt = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly url: string;
  private readonly onMessage: (env: WsEnvelope) => void;

  constructor(url: string, onMessage: (env: WsEnvelope) => void) {
    this.url = url;
    this.onMessage = onMessage;
  }

  /** Pre-register channels BEFORE connect() so the initial hello carries
   * them. Channels added after the socket is open are sent as `subscribe`
   * messages. */
  preSubscribe(channel: ChannelName): void {
    this.channels.add(channel);
  }

  /** Open the socket (or schedule a reconnect when called from a close
   * handler). Idempotent against closed clients. */
  connect(): void {
    if (this.closed) return;
    if (this.ws && this.ws.readyState <= 1 /* CONNECTING | OPEN */) return;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = (): void => {
      this.attempt = 0;
      const hello: WsHelloMessage = {
        type: 'hello',
        channels: [...this.channels],
        last_seen_seq: this.lastSeenSeq,
      };
      ws.send(JSON.stringify(hello));
    };

    ws.onmessage = (ev: MessageEvent): void => {
      try {
        const env = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as WsEnvelope & {
          seq?: number;
        };
        if (typeof env.seq === 'number' && env.seq > this.lastSeenSeq) {
          this.lastSeenSeq = env.seq;
        }
        this.onMessage(env);
      } catch {
        // Malformed envelope — skip.
      }
    };

    ws.onclose = (): void => {
      if (this.closed) return;
      const delay = RECONNECT_BACKOFF_MS[Math.min(this.attempt, RECONNECT_BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    };

    ws.onerror = (): void => {
      // Errors flow to onclose for reconnect handling; the wrapper does
      // not surface them to onMessage because there is no useful UI
      // signal beyond the reconnect-in-progress state.
    };
  }

  /** Send a subscribe message for an additional channel (after connect).
   * Idempotent — adds to the local set whether or not the socket is open. */
  subscribe(channel: ChannelName): void {
    this.channels.add(channel);
    if (this.ws?.readyState === 1 /* OPEN */) {
      const msg: WsSubscribeMessage = { type: 'subscribe', channel };
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Stop the reconnect loop and close the underlying socket. Subsequent
   * calls are no-ops. */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // best-effort
    }
  }

  /** Currently subscribed channels — for tests. */
  get subscribedChannels(): ReadonlySet<ChannelName> {
    return this.channels;
  }

  /** Last seq seen — for tests. */
  get seq(): number {
    return this.lastSeenSeq;
  }
}
