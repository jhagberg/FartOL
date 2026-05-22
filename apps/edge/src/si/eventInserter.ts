// Authored for fartola. Not ported from upstream.
//
// `insertEvent(handle, nodeId, eventType, eventTimeMs, payload, competitionId)`
// — the SINGLE insertion path into the events table for Phase 1. Both the SI
// bridge (apps/edge/src/si/bridge.ts) and the dev-only simulate-read endpoint
// (apps/edge/src/routes/dev.ts) call this helper. Keeping the path single
// guarantees the (node_id, local_seq, recorded_at_ms) invariants are
// identical across hardware-driven and synthetic inserts (REQ-EVT-001/002/003).
//
// Atomicity (T-SEQ-COLLISION mitigation): nextLocalSeq() + insert() run inside
// a single `sqlite.transaction(() => {...})` block. better-sqlite3's transaction
// API serialises commits via SQLite's BEGIN/COMMIT — a concurrent caller's
// max(local_seq) read sees the committed value, never a half-written row.
// Phase 1 is single-writer (the bridge process is single-process per install)
// so the transaction is belt-and-braces; Phase 2 multi-operator ingest will
// rely on it to be correct.
//
// recordedAtMs is captured inside the function (Date.now()) so callers cannot
// backdate inserts. eventTimeMs is the caller's responsibility — it may differ
// from recordedAtMs for replayed events (Phase 0 bench fixtures hand-off the
// captured ts to recordedAtMs via the bridge tests).
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-06-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-2
//   (sink injection — eventInserter is a pure function; tests pass a fresh
//   in-memory handle, no globals)
// - REQ-EVT-001 (event log shape: node_id, local_seq, competition_id,
//   event_type, event_time_ms, recorded_at_ms, payload)
// - REQ-EVT-003 (per-node monotonic local_seq)

import { events } from '../db/schema.ts';
import { nextLocalSeq } from '../db/seq.ts';
import type { DbHandle } from '../db/index.ts';
import type { EventPayload } from '../db/schema.ts';

export interface InsertResult {
  node_id: string;
  local_seq: number;
  event_time_ms: number;
  recorded_at_ms: number;
}

/**
 * Append one event to the events table, allocating the next local_seq for
 * this node inside a transaction. Returns the row's identity fields so
 * callers (the bridge, dev route) can broadcast / log the seq downstream.
 *
 * @param handle      Open DbHandle (plan 02 openDatabase).
 * @param nodeId      Stable per-install identifier (plan 02 ensureNodeId).
 * @param eventType   Discriminant of the payload union. MUST equal
 *                    payload.event_type — caller's responsibility.
 * @param eventTimeMs Host clock at the event itself (ms epoch).
 * @param payload     One of the EventPayload union arms.
 * @param competitionId Active competition or null when the bridge is idle.
 *                    Persisting with null is intentional (forensic value);
 *                    the WS broadcast skip is enforced upstream in bridge.ts.
 */
export function insertEvent(
  handle: DbHandle,
  nodeId: string,
  eventType: EventPayload['event_type'],
  eventTimeMs: number,
  payload: EventPayload,
  competitionId: string | null
): InsertResult {
  const recordedAtMs = Date.now();
  let localSeq = 0;
  handle.sqlite.transaction(() => {
    localSeq = nextLocalSeq(handle, nodeId);
    handle.db
      .insert(events)
      .values({
        nodeId,
        localSeq,
        competitionId,
        eventType,
        eventTimeMs,
        recordedAtMs,
        payload,
      })
      .run();
  })();
  return {
    node_id: nodeId,
    local_seq: localSeq,
    event_time_ms: eventTimeMs,
    recorded_at_ms: recordedAtMs,
  };
}
