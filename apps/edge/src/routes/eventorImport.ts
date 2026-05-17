// Authored for fartol. Not ported from upstream.
//
// POST /api/competitions/:id/eventor-import — fetch the IOF EntryList XML
// for an Eventor event ID directly from Eventor and pipe it through the
// same ingestEntryList + autoBindNewCompetitors path that the manual
// XML-upload route uses.
//
// The Eventor REST endpoint used here (`export/entries?eventId=N&
// version=3.0`) is documented in the SOFT "Guide Eventor — Hämta data
// via API" v2.1 (.reference/Guide_Eventor_-_Hamta_data_via_API.pdf) and
// at https://eventor.orientering.se/api/documentation.
//
// Request:
//   { eventId: number }  (positive integer)
//
// Responses:
//   201 { kind: 'EntryList', competitors_created, classes_missing, auto_bound }
//   400 { error: 'bad_request' | 'bad_event_id' }
//   404 { error: 'competition_not_found' }
//   422 { error: 'ingest_failed', detail }
//   502 { error: 'eventor_fetch_failed', detail }
//   503 { error: 'eventor_no_key' }
//
// Why a separate file from routes/import.ts:
//   - import.ts is multipart-only (5 MB file cap, no JSON body)
//   - this route is JSON-in / JSON-out, no @fastify/multipart wiring
//   - keeps the eventor-direct path independent of the wizard-time
//     atomic /from-wizard flow

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { competitions } from '../db/schema.ts';
import { downloadEventorEntries } from '../eventor/entries.ts';
import { parseIofXml } from '../xml/parse.ts';
import { validateXml } from '../xml/validate.ts';
import { ingestEntryList } from '../ingest/entryImport.ts';
import { autoBindNewCompetitors } from '../projection/auto-bind.ts';
import { resolveSecret } from '../config/secrets.ts';
import { issuesToErrors } from './_zod-errors.ts';

const Body = z.object({
  eventId: z.number().int().positive(),
});

export default async function registerEventorImportRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { eventId: number } }>(
    '/api/competitions/:id/eventor-import',
    async (req, reply) => {
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(issuesToErrors(parsed.error.issues));
      }
      const competitionId = req.params.id;
      const { eventId } = parsed.data;

      // 1. Verify competition exists BEFORE talking to Eventor — saves a
      //    round-trip on the wrong-URL case.
      const comp = app.fartolDb.db
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, competitionId))
        .get();
      if (!comp) {
        return reply.code(404).send({ error: 'competition_not_found' });
      }

      // 2. Resolve API key (env > config). 503 if absent.
      const apiKey = resolveSecret(app.fartolDb, 'EVENTOR_API_KEY');
      if (!apiKey || apiKey.length === 0) {
        return reply.code(503).send({ error: 'eventor_no_key' });
      }

      // 3. Pull the EntryList XML from Eventor.
      let xml: string;
      try {
        xml = await downloadEventorEntries({ apiKey, eventId });
      } catch (e) {
        const msg = (e as Error).message ?? 'fetch failed';
        app.log.warn({ err: msg, eventId, competitionId }, 'eventor entries fetch failed');
        return reply.code(502).send({ error: 'eventor_fetch_failed', detail: msg });
      }

      // 4. Parse + validate against XSD. Eventor SHOULD return well-formed
      //    IOF 3.0 EntryList, but we run the same gates as the manual-
      //    upload path because (a) defensive (b) catches the no-entries
      //    sentinel (Eventor returns an empty/200 body when nothing is
      //    registered yet, which parseIofXml will reject cleanly).
      let parsedXml;
      try {
        parsedXml = parseIofXml(xml);
      } catch (e) {
        return reply.code(422).send({
          error: 'parse_failed',
          detail: (e as Error).message,
        });
      }
      if (parsedXml.kind !== 'EntryList') {
        return reply.code(422).send({
          error: 'wrong_kind',
          detail: `expected EntryList, got ${parsedXml.kind}`,
        });
      }
      const validation = await validateXml(xml);
      if (!validation.valid) {
        return reply.code(422).send({ error: 'xsd_invalid', errors: validation.errors });
      }

      // 5. Ingest + auto-bind any prior-read cards. Same calls as the
      //    manual-upload path so the consent semantics, club upserts,
      //    and projection-dirty handling are identical.
      try {
        const result = ingestEntryList(app.fartolDb, competitionId, parsedXml.data, Date.now());
        const autoBind = autoBindNewCompetitors(app.fartolDb, competitionId, app.fartolNodeId);
        if (autoBind.bound.length > 0) {
          app.projectionStore.markDirty(competitionId);
        }
        return reply.code(201).send({
          kind: 'EntryList',
          ...result,
          auto_bound: autoBind.bound,
        });
      } catch (e) {
        const msg = (e as Error).message ?? 'ingest failed';
        app.log.warn({ err: msg, competitionId, eventId }, 'eventor ingest failed');
        return reply.code(422).send({ error: 'ingest_failed', detail: msg });
      }
    }
  );
}
