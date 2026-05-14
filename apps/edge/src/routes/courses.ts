// Authored for fartol. Not ported from upstream.
//
// REST CRUD for courses — always nested under a competition. Controls are
// embedded as `{ control_code, order_idx }` pairs at the wire boundary; the
// route maps codes → control rows (auto-creating missing controls in the
// same transaction) and writes the course_controls join.
//
// Routes registered here:
//   - GET    /api/competitions/:id/courses  — list courses with embedded controls
//   - POST   /api/competitions/:id/courses  — create course + (auto-)controls + course_controls atomically
//
// The control auto-create behaviour mirrors the XML import path (plan 05):
// IOF CourseData / Purple Pen rarely names the controls explicitly, so the
// route either reuses an existing control row for the (competition_id, code)
// pair or inserts a fresh one. Plan 05 will share this helper when it
// dispatches CourseData.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-04-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-09 D-03
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §Wizard

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { asc, eq, and, inArray } from 'drizzle-orm';

import { CourseCreateInput, type CourseDTO, type CourseControlDTO } from '@fartol/shared-types';
import { competitions, courses, courseControls, controls } from '../db/schema.ts';
import { issuesToErrors } from './_zod-errors.ts';

export default async function registerCourses(app: FastifyInstance): Promise<void> {
  // GET /api/competitions/:id/courses — list with embedded controls.
  app.get<{ Params: { id: string } }>('/api/competitions/:id/courses', async (req, reply) => {
    const { id } = req.params;
    const compRow = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, id))
      .get();
    if (!compRow) return reply.code(404).send({ error: 'competition not found' });

    const courseRows = app.fartolDb.db
      .select()
      .from(courses)
      .where(eq(courses.competitionId, id))
      .orderBy(asc(courses.name))
      .all();

    const controlsByCourse = new Map<string, CourseControlDTO[]>();
    for (const c of courseRows) controlsByCourse.set(c.id, []);
    if (courseRows.length > 0) {
      const joined = app.fartolDb.db
        .select({
          courseId: courseControls.courseId,
          orderIdx: courseControls.orderIdx,
          code: controls.code,
        })
        .from(courseControls)
        .innerJoin(controls, eq(courseControls.controlId, controls.id))
        .where(eq(controls.competitionId, id))
        .orderBy(asc(courseControls.courseId), asc(courseControls.orderIdx))
        .all();
      for (const row of joined) {
        const arr = controlsByCourse.get(row.courseId);
        if (arr) arr.push({ control_code: row.code, order_idx: row.orderIdx });
      }
    }

    const courseDTOs: CourseDTO[] = courseRows.map((c) => ({
      id: c.id,
      competition_id: c.competitionId,
      name: c.name,
      class_id: c.classId,
      length_m: c.lengthM,
      climb_m: c.climbM,
      controls: controlsByCourse.get(c.id) ?? [],
    }));
    return { courses: courseDTOs };
  });

  // POST /api/competitions/:id/courses — create course + auto-controls + course_controls.
  app.post<{ Params: { id: string } }>('/api/competitions/:id/courses', async (req, reply) => {
    const { id: competitionId } = req.params;
    const parsed = CourseCreateInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(issuesToErrors(parsed.error.issues));
    }
    const existing = app.fartolDb.db
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .get();
    if (!existing) return reply.code(404).send({ error: 'competition not found' });

    const courseId = crypto.randomUUID();
    const ccRowsToInsert: { id: string; courseId: string; controlId: string; orderIdx: number }[] =
      [];

    app.fartolDb.sqlite.transaction(() => {
      // Insert the course row.
      app.fartolDb.db
        .insert(courses)
        .values({
          id: courseId,
          competitionId,
          name: parsed.data.name,
          classId: parsed.data.class_id ?? null,
          lengthM: parsed.data.length_m ?? null,
          climbM: parsed.data.climb_m ?? null,
        })
        .run();

      // Bulk-select existing controls for this competition matching any of
      // the codes we need; bulk-insert anything missing.
      const wantedCodes = Array.from(new Set(parsed.data.controls.map((c) => c.control_code)));
      const existingControls = wantedCodes.length
        ? app.fartolDb.db
            .select()
            .from(controls)
            .where(
              and(eq(controls.competitionId, competitionId), inArray(controls.code, wantedCodes))
            )
            .all()
        : [];
      const codeToControlId = new Map<number, string>();
      for (const c of existingControls) codeToControlId.set(c.code, c.id);
      const newControlRows: { id: string; competitionId: string; code: number }[] = [];
      for (const code of wantedCodes) {
        if (!codeToControlId.has(code)) {
          const newId = crypto.randomUUID();
          codeToControlId.set(code, newId);
          newControlRows.push({ id: newId, competitionId, code });
        }
      }
      if (newControlRows.length > 0) {
        app.fartolDb.db.insert(controls).values(newControlRows).run();
      }

      // Build the course_controls rows in the requested order.
      for (const cc of parsed.data.controls) {
        const controlId = codeToControlId.get(cc.control_code);
        // codeToControlId is guaranteed to have every requested code at
        // this point — we just inserted any missing ones.
        if (!controlId) continue;
        ccRowsToInsert.push({
          id: crypto.randomUUID(),
          courseId,
          controlId,
          orderIdx: cc.order_idx,
        });
      }
      if (ccRowsToInsert.length > 0) {
        app.fartolDb.db.insert(courseControls).values(ccRowsToInsert).run();
      }
    })();

    // Echo the created row as a CourseDTO with the controls list in order.
    const sortedControls: CourseControlDTO[] = [...parsed.data.controls]
      .sort((a, b) => a.order_idx - b.order_idx)
      .map((c) => ({ control_code: c.control_code, order_idx: c.order_idx }));
    const dto: CourseDTO = {
      id: courseId,
      competition_id: competitionId,
      name: parsed.data.name,
      class_id: parsed.data.class_id ?? null,
      length_m: parsed.data.length_m ?? null,
      climb_m: parsed.data.climb_m ?? null,
      controls: sortedControls,
    };
    return reply.code(201).send(dto);
  });
}
