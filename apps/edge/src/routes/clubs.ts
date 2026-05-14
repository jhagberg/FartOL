// Authored for fartol. Not ported from upstream.
//
// GET /api/clubs — autocomplete source for the walk-up modal's Klubb field
// (UI-SPEC §"Walk-up modal"). Returns clubs ordered by last_seen_at_ms DESC
// so recent clubs rank first; an optional ?prefix= filter narrows to
// name LIKE prefix%. Default limit 50; max 200 to protect the autocomplete
// transport.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-04-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Walk-up modal"

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, like } from 'drizzle-orm';

import type { ClubDTO } from '@fartol/shared-types';
import { clubs } from '../db/schema.ts';
import { issuesToErrors } from './_zod-errors.ts';

const ClubsQuery = z.object({
  prefix: z.string().max(120).optional(),
  // Coerce because query strings arrive as strings; z.coerce.number().int()
  // converts and validates.
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export default async function registerClubs(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { prefix?: string; limit?: string } }>(
    '/api/clubs',
    async (req, reply) => {
      const parsed = ClubsQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send(issuesToErrors(parsed.error.issues));
      }
      const limit = parsed.data.limit ?? 50;

      // Drizzle's query builder chain order is select → from → where → orderBy
      // → limit; branching on the optional prefix means we have to declare
      // two separate chains because Drizzle's builder methods are final at
      // each stage.
      const rows = parsed.data.prefix
        ? app.fartolDb.db
            .select()
            .from(clubs)
            .where(like(clubs.name, `${parsed.data.prefix}%`))
            .orderBy(desc(clubs.lastSeenAtMs))
            .limit(limit)
            .all()
        : app.fartolDb.db.select().from(clubs).orderBy(desc(clubs.lastSeenAtMs)).limit(limit).all();

      const dtos: ClubDTO[] = rows.map((r) => ({
        name: r.name,
        last_seen_at_ms: r.lastSeenAtMs,
      }));
      return { clubs: dtos };
    }
  );
}
