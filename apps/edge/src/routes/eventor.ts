// Authored for fartol. Not ported from upstream.
//
// GET /api/eventor/lookup + GET /api/eventor/status (Plan 02-02 task 1).
//
// The lookup route is the walk-up autocomplete back-end:
//
//   - ?si_card=N → single hit lookup ({ hit: true | false }).
//   - ?prefix=S&limit=K → up to K name-prefix suggestions.
//   - Neither → 400 missing_query (operator must supply one).
//   - Both → 400 conflicting_query (the two paths are mutually exclusive;
//     the UI uses si_card after a bricka scan and prefix while the operator
//     types in the name field).
//
// The status route surfaces enough metadata for TweaksPanel to render its
// indicator and (when FARTOL_DEV=1) a manual "Uppdatera" button targeting
// /api/__admin/eventor/refresh:
//
//   - `state`: ready (cache present + <7d old) | stale (>7d old) |
//     offline (cache empty but a key is configured — boot fetch failed) |
//     no_key (no API key in process.env).
//   - `ageDays`: floor((now - marker) / 86400000), null when no marker.
//   - `competitorCount`: row count of eventor_competitors.
//   - `fartol_dev`: process.env.FARTOL_DEV === '1' evaluated at REQUEST
//     time so the web TweaksPanel can correctly gate the admin button in
//     production builds (import.meta.env.DEV would be bundler-time and
//     always false in production).
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02-PLAN.md task 1
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §"UI signaling"
// - .planning/phases/02-4-klubbs-mvp/02-PATTERNS.md §3 (Fastify route shape
//   from routes/clubs.ts + Querystring Zod parsing template)

import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { lookupBySiCard, lookupByNamePrefix } from '../eventor/lookup.ts';
import { eventorCompetitors, config as configTable } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { issuesToErrors } from './_zod-errors.ts';

const LookupQuery = z.object({
  // z.coerce because query strings arrive as strings.
  si_card: z.coerce.number().int().positive().optional(),
  prefix: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const CACHE_MARKER_KEY = 'eventor_cache_refreshed_at_ms';
const STALE_THRESHOLD_MS = 7 * 86_400_000;

export default async function registerEventorRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { si_card?: string; prefix?: string; limit?: string } }>(
    '/api/eventor/lookup',
    async (req, reply) => {
      const parsed = LookupQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send(issuesToErrors(parsed.error.issues));
      }
      const { si_card, prefix, limit } = parsed.data;

      // Mutual-exclusion gate.
      if (si_card !== undefined && prefix !== undefined) {
        return reply.code(400).send({ error: 'conflicting_query' });
      }
      if (si_card === undefined && prefix === undefined) {
        return reply.code(400).send({ error: 'missing_query' });
      }

      if (si_card !== undefined) {
        const result = lookupBySiCard(app.fartolDb, si_card);
        return result;
      }

      // prefix branch (TS narrows after the missing_query guard above).
      const suggestions = lookupByNamePrefix(app.fartolDb, prefix as string, limit ?? 20);
      return { suggestions };
    }
  );

  app.get('/api/eventor/status', async () => {
    // Request-time env eval — closure captures process.env which is mutable
    // at runtime. import.meta.env.DEV would be bundler-time and wrong in
    // production builds.
    const fartolDev = process.env['FARTOL_DEV'] === '1';
    const apiKey = process.env['EVENTOR_API_KEY'];

    // Competitor count is cheap (SQLite COUNT over a 252k indexed table is
    // sub-ms). Drives the 'offline' vs 'no_key' branch when no marker is set.
    const countRow = app.fartolDb.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(eventorCompetitors)
      .get();
    const competitorCount = countRow?.n ?? 0;

    const markerRow = app.fartolDb.db
      .select({ value: configTable.value })
      .from(configTable)
      .where(eq(configTable.key, CACHE_MARKER_KEY))
      .get();

    let state: 'ready' | 'stale' | 'offline' | 'no_key';
    let ageDays: number | null = null;

    if (markerRow) {
      const markerMs = Number.parseInt(markerRow.value, 10);
      if (Number.isFinite(markerMs)) {
        const ageMs = Date.now() - markerMs;
        ageDays = Math.floor(ageMs / 86_400_000);
        state = ageMs >= STALE_THRESHOLD_MS ? 'stale' : 'ready';
      } else {
        state = competitorCount > 0 ? 'ready' : apiKey ? 'offline' : 'no_key';
      }
    } else if (!apiKey || apiKey.length === 0) {
      state = 'no_key';
    } else {
      // Key present but no marker — the boot fetch hasn't run yet OR it
      // failed. If we have rows the prior cache survives ('ready'-ish but
      // we have no age info); otherwise we're offline.
      state = competitorCount > 0 ? 'ready' : 'offline';
    }

    return { state, ageDays, competitorCount, fartol_dev: fartolDev };
  });
}
