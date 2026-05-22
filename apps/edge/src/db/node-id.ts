// Authored for fartola. Not ported from upstream.
//
// node_id persistence helper. The bridge stores a per-install UUID in the
// `config` table under key='node_id' on first boot; subsequent boots read
// it back. This is the `node_id` half of the (node_id, local_seq) primary
// key on the events table — stable across restarts so a single bridge can
// keep appending sequentially, and unique per install so future peer-sync
// (Phase 4) can merge non-conflicting log segments.
//
// REQ-OPS-002 (restart-safe). Tested by apps/edge/src/db/migrate.test.ts
// test 4 — opens a file-based db, calls ensureNodeId, closes, reopens,
// asserts the second call returns the same UUID.

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { config } from './schema.ts';
import type { DbHandle } from './index.ts';

/** Read the persisted node_id from config; if missing, generate a fresh
 * UUID v4, persist it, and return it. Idempotent on the same handle.
 * Stable across handle close/reopen on the same file path. */
export function ensureNodeId(handle: DbHandle): string {
  const existing = handle.db
    .select({ value: config.value })
    .from(config)
    .where(eq(config.key, 'node_id'))
    .get();
  if (existing) return existing.value;
  const nodeId = crypto.randomUUID();
  handle.db.insert(config).values({ key: 'node_id', value: nodeId }).run();
  return nodeId;
}
