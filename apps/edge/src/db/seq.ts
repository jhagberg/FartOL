// Authored for fartola. Not ported from upstream.
//
// local_seq next-value helper for the events table. Plan 02 ships this as a
// trailing-edge SELECT max(local_seq) + 1 because Phase 1 has a single
// writer per node_id (the bridge process is single-process per install).
// Phase 2's multi-operator path will move to an in-process counter primed
// from the same query at boot, but the on-disk shape and (node_id, local_seq)
// PK stay identical — so the projection layer is invariant under the swap.
//
// REQ-EVT-001 (event log shape), REQ-EVT-003 (per-node monotonic local_seq).

import { sql, eq } from 'drizzle-orm';

import { events } from './schema.ts';
import type { DbHandle } from './index.ts';

/** Return the next local_seq for the given node_id. 1 on an empty events
 * table for that node, otherwise max(local_seq) + 1. Safe to call inside
 * a transaction with the matching insert to avoid race conditions when a
 * future plan parallelises ingest. */
export function nextLocalSeq(handle: DbHandle, nodeId: string): number {
  const row = handle.db
    .select({ max: sql<number | null>`coalesce(max(${events.localSeq}), 0)` })
    .from(events)
    .where(eq(events.nodeId, nodeId))
    .get();
  return (row?.max ?? 0) + 1;
}
