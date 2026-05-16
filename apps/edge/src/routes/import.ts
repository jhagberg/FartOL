// Authored for fartol. Not ported from upstream.
//
// POST /api/competitions/:id/import — multipart XML upload that dispatches
// on the XML root element to either ingestCourseData or ingestEntryList.
// The endpoint validates the bytes against the bundled IOF.xsd BEFORE any
// DB write (RESEARCH §Pattern 7 — XSD validation gates every ingest).
//
// Behavior contract:
//   1. Read the multipart `file` part (single file, 5 MB cap — Fastify's
//      multipart fileSize limit returns 413 automatically).
//   2. Sanitize the filename: '..' or absolute paths → 400 'bad_filename'
//      (T-PATH-TRAVERSAL — the filename is metadata only, never written
//      to disk, but we reject anyway to keep the audit log clean).
//   3. parseIofXml(bytes.toString('utf8')) — DOCTYPE/ENTITY pre-flight +
//      root dispatch. Errors → 400 'parse_failed'.
//   4. validateXml(xmlSource) — XSD gate. Errors → 400 'xsd_invalid' with
//      a structured errors[] (line + message).
//   5. Verify the competition exists → 404 if not.
//   6. Dispatch:
//        - CourseData → ingestCourseData (its own sqlite.transaction).
//        - EntryList  → ingestEntryList  (its own sqlite.transaction).
//   7. 201 with the kind + ingest result counts.
//
// This endpoint is for the "I already have a competition; import data into
// it" path (e.g. uploading an EntryList AFTER the wizard's CourseData
// already went through /api/competitions/from-wizard). The wizard's
// initial CourseData upload uses the atomic /from-wizard endpoint instead
// (C-H3 — see ./competitionsFromWizard.ts) so the competition INSERT and
// the ingest commit/rollback as one unit.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-03 D-15
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"File
//   import flow" + §"Error states" (Filen kunde inte läsas copy contract)
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H3
//   (this route does NOT create the competition — the atomic-wizard route
//   does; this route assumes the competition row already exists)

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { isAbsolute } from 'node:path';
import multipart from '@fastify/multipart';

import { competitions } from '../db/schema.ts';
import { parseIofXml } from '../xml/parse.ts';
import { validateXml } from '../xml/validate.ts';
import { ingestCourseData } from '../ingest/courseImport.ts';
import { ingestEntryList } from '../ingest/entryImport.ts';
import { autoBindNewCompetitors } from '../projection/auto-bind.ts';

export default async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  // 5 MB body cap, single file per request. T-LARGE-BODY-DOS mitigation.
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  app.post<{ Params: { id: string } }>('/api/competitions/:id/import', async (req, reply) => {
    const competitionId = req.params.id;
    const part = await req.file();
    if (!part) {
      return reply.code(400).send({
        error: 'no_file',
        message: 'Förväntar en fil.',
      });
    }
    // T-PATH-TRAVERSAL: filename is metadata only and @fastify/multipart
    // already strips the path component via basename, but reject the
    // obvious adversarial cases up front as defense-in-depth in case a
    // future multipart upgrade changes that behavior.
    const filename = part.filename;
    if (filename.includes('..') || isAbsolute(filename)) {
      return reply.code(400).send({ error: 'bad_filename' });
    }

    let bytes: Buffer;
    try {
      bytes = await part.toBuffer();
    } catch (e) {
      const msg = (e as Error).message ?? '';
      // @fastify/multipart throws { code: 'FST_REQ_FILE_TOO_LARGE' } via
      // its error class. Map to a 413 explicitly.
      if (/file too large|FST_REQ_FILE_TOO_LARGE/i.test(msg)) {
        return reply.code(413).send({ error: 'file_too_large' });
      }
      return reply.code(400).send({ error: 'bad_upload', detail: msg });
    }
    const xmlSource = bytes.toString('utf8');

    let parsed;
    try {
      parsed = parseIofXml(xmlSource);
    } catch (e) {
      return reply.code(400).send({
        error: 'parse_failed',
        message:
          'Filen kunde inte läsas — förväntar Purple Pen .xml (IOF XML 3.0 CourseData) eller IOF XML 3.0 EntryList.',
        detail: (e as Error).message,
      });
    }

    const validation = await validateXml(xmlSource);
    if (!validation.valid) {
      return reply.code(400).send({
        error: 'xsd_invalid',
        errors: validation.errors,
      });
    }

    const comp = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .get();
    if (!comp) {
      return reply.code(404).send({ error: 'competition_not_found' });
    }

    try {
      if (parsed.kind === 'CourseData') {
        const result = ingestCourseData(app.fartolDb, competitionId, parsed.data);
        return reply.code(201).send({ kind: 'CourseData', ...result });
      } else {
        const result = ingestEntryList(app.fartolDb, competitionId, parsed.data, Date.now());
        // Plan 09: close the import-after-read race. The bridge may have
        // already inserted card_read events for cards belonging to the
        // newly-imported competitors. autoBindNewCompetitors emits one
        // synthetic card_bound per match so the next reduce() drops the
        // card from pending_unknown_cards AND attaches the prior read.
        const autoBind = autoBindNewCompetitors(app.fartolDb, competitionId, app.fartolNodeId);
        if (autoBind.bound.length > 0) {
          app.projectionStore.markDirty(competitionId);
        }
        return reply.code(201).send({ kind: 'EntryList', ...result, auto_bound: autoBind.bound });
      }
    } catch (e) {
      const msg = (e as Error).message ?? 'ingest failed';
      app.log.warn({ err: msg, competitionId }, 'ingest failed');
      return reply.code(422).send({
        error: 'ingest_failed',
        detail: msg,
      });
    }
  });
}
