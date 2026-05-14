// Authored for fartol. Not ported from upstream.
//
// ProjectionStore — Map-backed cache of the last reduce() output per
// competition_id + a debounced markDirty + recompute + broadcast loop. Plan
// 06's bridge calls `store.markDirty(activeCompetitionId)` after each event
// that could change the projection (card_read, card_inserted), as does the
// dev simulate-read route and the walk-up POST /api/competitors. The store
// coalesces bursts: multiple markDirty calls within `debounceMs` collapse to
// a single recompute + broadcast.
//
// On recompute, ONE WS envelope per class is broadcast on the
// `results:<competitionId>` channel. `results_full` is reserved for the WS
// hello reply (see ws/index.ts) — markDirty-driven broadcasts emit
// `results_update` per affected class.
//
// **No-active-competition contract (plan 06 + plan 08):** callers MUST gate
// markDirty with `if (getActiveCompetitionId() !== null)`. The store itself
// has no notion of an active competition — it only knows competition_id keys.
// The B-2 regression gate lives in bridge.test.ts + store.test.ts: a replay
// with `getActiveCompetitionId() === null` must produce zero markDirty calls.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-08-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M1
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Live results auto-update"

import { reduce } from './reduce.ts';
import { loadCompetitionInputs } from './loader.ts';
import type { DbHandle } from '../db/index.ts';
import type { CompetitionState } from './types.ts';
import { resultsChannel, type ChannelName } from '@fartol/shared-types';

export interface ProjectionStore {
  /** Get the last cached state for this competition. Returns null if no
   * recompute has run (or recomputeNow returned null for an unknown
   * competition). */
  get(competitionId: string): CompetitionState | null;
  /** Schedule a debounced recompute + broadcast. Coalesces: a second call
   * inside the debounce window is a no-op. */
  markDirty(competitionId: string): void;
  /** Recompute immediately (synchronously). Updates the cache and broadcasts
   * one `results_update` envelope per class. Returns null when the
   * competition row is missing. Used by hello handlers + tests. */
  recomputeNow(competitionId: string): CompetitionState | null;
  /** Cancel pending debounced recomputes (called on Fastify close). */
  dispose(): void;
}

export interface ProjectionStoreOpts {
  handle: DbHandle;
  /** Broadcast hook — typically `app.wsBroadcast`. */
  broadcast: (
    channel: ChannelName,
    envelope: { type: string; payload: unknown; seq: number }
  ) => void;
  /** Debounce window for coalescing markDirty bursts. Default 50ms (one
   * frame at 20 Hz). Tests inject 0 for synchronous assertions. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 50;

export function createProjectionStore(opts: ProjectionStoreOpts): ProjectionStore {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const cache = new Map<string, CompetitionState>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;

  function recomputeNow(competitionId: string): CompetitionState | null {
    const input = loadCompetitionInputs(opts.handle, competitionId);
    if (input === null) return null;
    const next = reduce(input);
    cache.set(competitionId, next);

    // One results_update envelope per class. The hello handler is the
    // only emitter of results_full — markDirty-driven broadcasts are
    // per-class deltas (UI-SPEC §"Live results auto-update": one envelope
    // per affected class).
    const classNameById = new Map<string, string>();
    for (const c of input.classes) classNameById.set(c.id, c.name);
    for (const [classId, rows] of next.results_by_class) {
      opts.broadcast(resultsChannel(competitionId), {
        type: 'results_update',
        payload: {
          class_id: classId,
          class_name: classNameById.get(classId) ?? '',
          rows,
        },
        seq: next.last_event_seq,
      });
    }
    return next;
  }

  return {
    get(competitionId) {
      return cache.get(competitionId) ?? null;
    },

    markDirty(competitionId) {
      if (disposed) return;
      if (pending.has(competitionId)) return; // coalesce
      const t = setTimeout(() => {
        pending.delete(competitionId);
        if (disposed) return;
        recomputeNow(competitionId);
      }, debounceMs);
      // setTimeout returns a Timer in node; if available, unref so a stray
      // pending timer doesn't keep the process alive (matters for tests that
      // forget to call dispose — node:test workers exit cleanly).
      if (typeof t === 'object' && t !== null && 'unref' in t && typeof t.unref === 'function') {
        t.unref();
      }
      pending.set(competitionId, t);
    },

    recomputeNow,

    dispose() {
      disposed = true;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    },
  };
}
