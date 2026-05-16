// Authored for fartol. Not ported from upstream.
//
// WebSocket envelopes + channel name helpers for the Phase 1 edge<->web
// realtime contract. Channel naming is per CONTEXT.md "Claude's
// Discretion" (`readout:<competitionId>`, `results:<competitionId>`) and
// matches RESEARCH §Pattern 4.
//
// Plan 01 lands the minimal envelope + 2 channel kinds + hello/subscribe
// stubs needed for the websocket plugin in plan 03. Subsequent plans
// add per-channel payload unions on top of WsEnvelope<T>.

/** Template-literal type pinning channel names to a known prefix. Phase 1
 * Plan 01 ships two prefixes; later plans may add (e.g. `peers:<id>`). */
export type ChannelName = `readout:${string}` | `results:${string}`;

export function readoutChannel(competitionId: string): ChannelName {
  return `readout:${competitionId}`;
}

export function resultsChannel(competitionId: string): ChannelName {
  return `results:${competitionId}`;
}

/** Discriminated envelope for every WS frame. `type` is the discriminator
 * (e.g. `'card_read'`, `'subscribe'`, `'hello'`); `channel` is set on
 * channel-scoped messages and omitted on protocol-level ones (hello,
 * subscribe). `seq` lets the client gap-detect and request replay. */
export interface WsEnvelope<T = unknown> {
  type: string;
  channel?: ChannelName;
  payload: T;
  seq?: number;
}

/** Server -> client greeting on connect. Lists the channels the server
 * exposes plus the last sequence number the server has emitted for any
 * channel — the client uses this to detect missed messages after
 * reconnect. */
export interface WsHelloMessage {
  type: 'hello';
  channels: ChannelName[];
  last_seen_seq: number;
}

/** Client -> server subscription request. */
export interface WsSubscribeMessage {
  type: 'subscribe';
  channel: ChannelName;
}
