// Authored for fartol. Not ported from upstream.
//
// REST handler: `GET /api/competitions/:id/results`. Returns the cached
// projection (or computes it on first read) as a snapshot ResultView[]
// grouped by class. Plan 14 (SvelteKit results page) consumes this on
// initial page load; subsequent updates come over the WS results channel.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-08-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Live results auto-update"
// - REQ-EVT-CMP-007 (live HTML results page on localhost during event)

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

import { competitions, classes } from '../db/schema.ts';
import type { ResultView } from '../projection/types.ts';

interface ResultsResponse {
  competition_id: string;
  classes: Array<{
    class_id: string;
    class_name: string;
    rows: ResultView[];
  }>;
  pending_unknown_cards: number[];
  last_event_seq: number;
}

export default async function registerResultsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/competitions/:id/results',
    async (req, reply): Promise<ResultsResponse | undefined> => {
      const { id } = req.params;

      // 404 short-circuit so an unknown competition doesn't return an empty
      // results envelope (which would be indistinguishable from a real
      // competition with zero classes).
      const compRow = app.fartolDb.db
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, id))
        .get();
      if (!compRow) {
        void reply.code(404).send({ error: 'competition not found' });
        return undefined;
      }

      // Pull from cache; fall back to recomputeNow so first reads after boot
      // still produce data. recomputeNow returns null only for unknown comps
      // — we just verified the row exists, so the only way to get null here
      // is a race where the row was deleted between the SELECT and the
      // recompute. Treat that as 404 too.
      let state = app.projectionStore.get(id);
      if (state === null) state = app.projectionStore.recomputeNow(id);
      if (state === null) {
        void reply.code(404).send({ error: 'competition not found' });
        return undefined;
      }

      const classRows = app.fartolDb.db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(eq(classes.competitionId, id))
        .all();

      const out: ResultsResponse = {
        competition_id: id,
        classes: classRows.map((c) => ({
          class_id: c.id,
          class_name: c.name,
          rows: state!.results_by_class.get(c.id) ?? [],
        })),
        pending_unknown_cards: state.pending_unknown_cards,
        last_event_seq: state.last_event_seq,
      };
      return out;
    }
  );
}
