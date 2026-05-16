// Authored for fartol. Not ported from upstream.
//
// Fastify @fastify/websocket plugin + /ws route + wsBroadcast decorator.
// Implements RESEARCH §"Pattern 4: WebSocket channels with hello-replay
// reconnect" with four phase-1 hardenings:
//
//   1. verifyClient (T-WS-FAN-OUT): only accept upgrades whose Origin
//      header matches http://localhost:5173, http://127.0.0.1:5173,
//      or http://[::1]:5173. Anything else (including undefined origin
//      from same-host CLI tools — that's the test path) is allowed only
//      when there is no Origin header at all (non-browser clients). A
//      foreign Origin (e.g. http://evil.com) is rejected.
//
//   2. maxPayload: 256 * 1024 (T-DOS-WS).
//
//   3. Per-channel-kind hello-replay branch (C-M1 / T-RESULTS-CHANNEL-LEAK):
//      `readout:<id>` hello replays missed events via `replay` envelopes.
//      `results:<id>` hello emits NO `replay` envelopes — plan 08 lifts
//      this stub into a `results_full` emission. The branch IS the
//      mitigation: results clients never see raw event replay.
//
//   4. Per-connection state in a Map keyed by the underlying socket;
//      cleaned up on close so dead connections GC.
//
// wsBroadcast is decorated on the FastifyInstance so route handlers (e.g.
// the /api/__dev/simulate-read endpoint in routes/dev.ts) can fan out
// envelopes to every subscribed client without owning a reference to the
// WebSocket server.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M1
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md Pattern 4
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §"Security
//   Domain V4 + V13" (verifyClient origin, maxPayload).

import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

import { eq } from 'drizzle-orm';

import type { ChannelName, WsHelloMessage, WsSubscribeMessage } from '@fartol/shared-types';
import { isValidChannel, channelKind, isValidSeq } from './channels.ts';
import { replayChannel } from './replay.ts';
import type { DbHandle } from '../db/index.ts';
import { classes as classesTable } from '../db/schema.ts';

// ---------------------------------------------------------------------------
// FastifyInstance decoration — wsBroadcast + fartolDb + fartolNodeId.
// Module augmentation so consumers (routes/dev.ts, plan 06 bridge, etc.) get
// typed access without an `as any` cast.
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    fartolDb: DbHandle;
    fartolNodeId: string;
    wsBroadcast: (
      channel: ChannelName,
      envelope: { type: string; payload: unknown; seq?: number }
    ) => void;
  }
}

// ---------------------------------------------------------------------------
// Origin allow-list (T-WS-FAN-OUT). The dev origin is the SvelteKit Vite
// dev server. CLI tools (no Origin header) are allowed so node:test +
// hardware-smoke + Playwright fixtures still work. A non-empty Origin
// that doesn't match the allow-list is rejected.
// ---------------------------------------------------------------------------

const ORIGIN_ALLOW_LIST = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  // SvelteKit preview, useful for ad-hoc local prod-build verification:
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Packaged production SPA — served same-origin as the API + WS on :3000
  // (CR-001). Loopback only; T-WS-FAN-OUT still blocks non-loopback hosts.
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
]);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // CLI / same-origin tools; no Origin header
  return ORIGIN_ALLOW_LIST.has(origin);
}

// ---------------------------------------------------------------------------
// Per-connection state. `channels` tracks which channel names the client
// has subscribed to so wsBroadcast can fan out only to subscribers. The
// Map lives in module scope and is keyed by the underlying socket so a
// `close` event on the socket frees the entry. Plain Map (not WeakMap)
// because ws clients are kept alive by @fastify/websocket's clients set;
// once `close` fires we explicitly delete.
// ---------------------------------------------------------------------------

interface ConnState {
  channels: Set<ChannelName>;
}

async function wsPlugin(app: FastifyInstance): Promise<void> {
  const clients = new Map<WebSocket, ConnState>();

  await app.register(websocket, {
    options: {
      maxPayload: 256 * 1024, // T-DOS-WS
      verifyClient: (info, next) => {
        const origin = info.req.headers.origin;
        if (!isOriginAllowed(origin)) {
          // Refuse the upgrade. Second arg is the HTTP status code.
          next(false, 403, 'forbidden origin');
          return;
        }
        next(true);
      },
    },
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const state: ConnState = { channels: new Set() };
    clients.set(socket, state);

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: unknown;
      try {
        const text =
          typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        msg = JSON.parse(text);
      } catch {
        // Malformed JSON — silently ignore (T-DOS-WS: don't echo).
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const obj = msg as { type?: unknown };

      if (obj.type === 'hello') {
        handleHello(socket, state, msg as WsHelloMessage, app);
      } else if (obj.type === 'subscribe') {
        handleSubscribe(state, msg as WsSubscribeMessage);
      }
      // Unknown message types are ignored.
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      // Connection-level errors are non-fatal at the plugin layer; the
      // close event cleans up state. Logged via fastify's logger by the
      // underlying ws plugin.
      clients.delete(socket);
    });
  });

  function handleHello(
    socket: WebSocket,
    state: ConnState,
    hello: WsHelloMessage,
    app: FastifyInstance
  ): void {
    if (!Array.isArray(hello.channels)) return;

    // T-EVENT-REPLAY: a malformed last_seen_seq (negative, non-integer,
    // NaN, missing) is treated as fail-safe — channels are still
    // subscribed for future broadcasts, but no replay is sent. The
    // client can retry with a valid seq if needed.
    const seqIsValid = isValidSeq(hello.last_seen_seq);

    for (const ch of hello.channels) {
      if (!isValidChannel(ch)) continue;
      state.channels.add(ch);

      const kind = channelKind(ch);
      if (kind === 'readout') {
        // C-M1: raw `replay` envelopes are EXCLUSIVE to readout: channels.
        // T-EVENT-REPLAY: skip replay entirely on a malformed seq.
        if (!seqIsValid) continue;
        const rows = replayChannel(app.fartolDb, ch, hello.last_seen_seq, app.fartolNodeId);
        for (const row of rows) {
          if (socket.readyState !== 1 /* OPEN */) break;
          try {
            socket.send(
              JSON.stringify({
                type: 'replay',
                channel: ch,
                payload: row.payload,
                seq: row.seq,
              })
            );
          } catch {
            // Dead connection — break out, close handler will clean up.
            break;
          }
        }
      } else {
        // C-M1 LOCKED: `results:` channel hello. Plan 03 stubbed this as a
        // no-op; plan 08 lifts it to emit EXACTLY ONE `results_full`
        // envelope carrying the current projection state. The contract
        // from plan 03 survives: ZERO `replay` envelopes on a results:
        // channel under any condition. If the projection lookup fails
        // (unknown competition) we emit NOTHING — the WS hello succeeds
        // (socket stays open) but no state is replayed. Do NOT fall
        // through to any `replay` codepath.
        const competitionId = ch.slice('results:'.length);
        let projection = app.projectionStore.get(competitionId);
        if (projection === null) projection = app.projectionStore.recomputeNow(competitionId);
        if (projection !== null) {
          const classRows = app.fartolDb.db
            .select({ id: classesTable.id, name: classesTable.name })
            .from(classesTable)
            .where(eq(classesTable.competitionId, competitionId))
            .all();
          const payload = {
            classes: classRows.map((c) => ({
              class_id: c.id,
              class_name: c.name,
              rows: projection!.results_by_class.get(c.id) ?? [],
            })),
            pending_unknown_cards: projection.pending_unknown_cards,
          };
          if (socket.readyState === 1 /* OPEN */) {
            try {
              socket.send(
                JSON.stringify({
                  type: 'results_full',
                  channel: ch,
                  payload,
                  seq: projection.last_event_seq,
                })
              );
            } catch {
              // Dead connection — close handler will clean up. Do NOT
              // attempt any fallback emission.
            }
          }
        }
        // If projection is null (unknown competition), emit NOTHING. The
        // C-M1 contract is preserved.
      }
    }
  }

  function handleSubscribe(state: ConnState, msg: WsSubscribeMessage): void {
    if (!isValidChannel(msg.channel)) return;
    state.channels.add(msg.channel);
  }

  // wsBroadcast fan-out. Broadcast is channel-scoped: only clients that
  // explicitly subscribed to `channel` receive the envelope. Per-channel-
  // kind discipline lives in the hello path (above) — `wsBroadcast` itself
  // is kind-agnostic because callers already know what payload type
  // belongs on which channel.
  function broadcast(
    channel: ChannelName,
    envelope: { type: string; payload: unknown; seq?: number }
  ): void {
    const wire = JSON.stringify({ ...envelope, channel });
    for (const [socket, state] of clients) {
      if (!state.channels.has(channel)) continue;
      if (socket.readyState !== 1 /* OPEN */) continue;
      try {
        socket.send(wire);
      } catch {
        // Drop dead connections silently; close handler removes them.
      }
    }
  }

  app.decorate('wsBroadcast', broadcast);
}

// Plugin must NOT be encapsulated — the decorators (fartolDb, fartolNodeId,
// wsBroadcast) need to flow up to the parent scope where /api/* routes
// register. Wrap with fastify-plugin to skip encapsulation.
export default fp(wsPlugin, {
  name: '@fartol/ws',
  fastify: '5.x',
});
