// Authored for fartol. Not ported from upstream.
//
// SQLite-backed missed-event replay for the WS hello handshake. The client
// sends `{ type: 'hello', channels, last_seen_seq }` on (re)connect; the
// server iterates the channels and — for `readout:` channels only — pulls
// every event in this competition with local_seq > last_seen_seq and
// re-emits them as `{ type: 'replay', channel, payload, seq }` envelopes.
//
// C-M1 (T-RESULTS-CHANNEL-LEAK): callers MUST check channelKind === 'readout'
// before invoking replayChannel. The function itself is kind-agnostic at
// the data layer — it never asserts the channel kind — but the WS handler
// in ws/index.ts branches above it so that `results:` channels never reach
// this path. Plan 08 lifts the results: stub into a `results_full` emission
// that DOES NOT call replayChannel.
//
// T-EVENT-REPLAY mitigation: last_seen_seq is validated against [0, max+1].
// Negative or future values return an empty array — the client gets no
// replay (and the server logs nothing about the rejection). The point is
// fail-safe, not loud — a malformed hello cannot inject crafted seq values
// to scan the events table.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M1
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Pattern 4: WebSocket channels with hello-replay reconnect"

import { gt, eq, and, sql } from 'drizzle-orm';

import { events } from '../db/schema.ts';
import type { DbHandle } from '../db/index.ts';
import type { ChannelName } from './channels.ts';

export interface ReplayRow {
  seq: number;
  payload: unknown;
  event_type: string;
}

/** Parse a channel name into its kind discriminator + competition id. The
 * client-side parsing should match — `readout:abc` -> { kind: 'readout',
 * competitionId: 'abc' }. */
export function parseChannel(channel: ChannelName): {
  kind: 'readout' | 'results';
  competitionId: string;
} {
  const idx = channel.indexOf(':');
  return {
    kind: channel.slice(0, idx) as 'readout' | 'results',
    competitionId: channel.slice(idx + 1),
  };
}

/** Largest local_seq currently recorded for this node. Returns 0 on an
 * empty events table. Used to validate the client's hello.last_seen_seq
 * (T-EVENT-REPLAY): any value > max + 1 is rejected as future-dated. */
export function maxLocalSeq(handle: DbHandle, nodeId: string): number {
  const row = handle.db
    .select({ max: sql<number | null>`coalesce(max(${events.localSeq}), 0)` })
    .from(events)
    .where(eq(events.nodeId, nodeId))
    .get();
  return row?.max ?? 0;
}

/** Pull every event for `channel`'s competition with local_seq > lastSeenSeq.
 * Returns ordered ascending by local_seq so the client can apply them in
 * order. Empty array on validation failure (T-EVENT-REPLAY) — see header. */
export function replayChannel(
  handle: DbHandle,
  channel: ChannelName,
  lastSeenSeq: number,
  nodeId: string
): ReplayRow[] {
  const max = maxLocalSeq(handle, nodeId);
  if (!Number.isInteger(lastSeenSeq) || lastSeenSeq < 0 || lastSeenSeq > max + 1) return [];
  const { competitionId } = parseChannel(channel);
  const rows = handle.db
    .select({
      seq: events.localSeq,
      payload: events.payload,
      event_type: events.eventType,
    })
    .from(events)
    .where(
      and(
        eq(events.competitionId, competitionId),
        eq(events.nodeId, nodeId),
        gt(events.localSeq, lastSeenSeq)
      )
    )
    .orderBy(events.localSeq)
    .all();
  return rows.map((r) => ({
    seq: r.seq,
    payload: r.payload,
    event_type: r.event_type,
  }));
}
