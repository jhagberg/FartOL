// Authored for fartol. Not ported from upstream.
//
// Pure ingester: writes a ParsedCourseData document into the SQLite layer
// inside a transaction. Used by both /api/competitions/:id/import (existing
// competition, ingester wraps its own transaction) and the C-H3 atomic
// /api/competitions/from-wizard endpoint (caller already owns the outer
// transaction — opts.outerTransaction=true skips the wrap so a single
// sqlite.transaction wraps the competition INSERT + ingest together).
//
// Idempotency: re-running ingestCourseData against an already-imported
// competition is safe at the class + control layer (existing rows are
// reused by `(competition_id, name)` and `(competition_id, code)`), but
// every Course row gets a fresh UUID + fresh course_controls — Phase 1
// doesn't merge courses across imports because Purple Pen routinely
// re-emits the entire course set on every export. Callers wanting a true
// re-import should DELETE FROM courses WHERE competition_id = ? first;
// today that's done by orchestration at the wizard level.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H3
//   (atomic create + import in one SQL transaction — opts.outerTransaction
//   is the seam that lets the from-wizard endpoint share the transaction)

import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';

import type { DbHandle } from '../db/index.ts';
import { classes, controls, courses, courseControls } from '../db/schema.ts';
import type { ParsedCourseData } from '../xml/parse.ts';

export interface CourseImportResult {
  classes_created: number;
  controls_created: number;
  courses_created: number;
}

export interface CourseImportOpts {
  /** When true the ingester runs in the CALLER's transaction (the C-H3
   * /from-wizard endpoint) instead of opening its own. Defaults to false:
   * a fresh sqlite.transaction wraps the writes. */
  outerTransaction?: boolean;
}

function doIngest(
  handle: DbHandle,
  competitionId: string,
  data: ParsedCourseData
): CourseImportResult {
  let classesCreated = 0;
  let controlsCreated = 0;
  let coursesCreated = 0;

  // (1) Classes — reuse existing by name within the same competition.
  // Pre-load all existing classes for this competition into a Map so we
  // hit the DB once for the lookup instead of N times. PR #3 Gemini
  // medium feedback. Same pattern as the clubs dedupe in entryImport.ts.
  const classIdByName = new Map<string, string>();
  const existingClasses = handle.db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(sql`${classes.competitionId} = ${competitionId}`)
    .all();
  for (const row of existingClasses) {
    classIdByName.set(row.name, row.id);
  }
  for (const c of data.classes) {
    if (classIdByName.has(c.name)) continue;
    const id = crypto.randomUUID();
    handle.db
      .insert(classes)
      .values({
        id,
        competitionId,
        name: c.name,
        shortName: c.short_name,
      })
      .run();
    classIdByName.set(c.name, id);
    classesCreated++;
  }

  // (2) Controls — reuse existing by (competition_id, code).
  const controlIdByCode = new Map<number, string>();
  for (const ct of data.controls) {
    const existing = handle.db
      .select({ id: controls.id })
      .from(controls)
      .where(sql`${controls.competitionId} = ${competitionId} AND ${controls.code} = ${ct.code}`)
      .get();
    if (existing) {
      controlIdByCode.set(ct.code, existing.id);
      continue;
    }
    const id = crypto.randomUUID();
    handle.db.insert(controls).values({ id, competitionId, code: ct.code }).run();
    controlIdByCode.set(ct.code, id);
    controlsCreated++;
  }

  // (3) Courses + course_controls — always fresh UUIDs (we don't dedup
  // courses; see header note).
  for (const cr of data.courses) {
    const id = crypto.randomUUID();
    const classId = cr.class_id_ref ? (classIdByName.get(cr.class_id_ref) ?? null) : null;
    handle.db
      .insert(courses)
      .values({
        id,
        competitionId,
        name: cr.name,
        classId,
        lengthM: cr.length_m,
        climbM: cr.climb_m,
      })
      .run();
    coursesCreated++;

    for (let i = 0; i < cr.control_codes.length; i++) {
      const code = cr.control_codes[i];
      if (code === undefined) continue;
      const controlId = controlIdByCode.get(code);
      if (!controlId) {
        // The course references a code that wasn't declared as a top-level
        // <Control> in the RaceCourseData. Surface as a hard error so the
        // transaction rolls back (caller / Fastify handler maps to 422).
        // This is the C-H3 mid-transaction-throw regression path.
        throw new Error(`Course ${cr.name} references unknown control ${code}`);
      }
      handle.db
        .insert(courseControls)
        .values({
          id: crypto.randomUUID(),
          courseId: id,
          controlId,
          orderIdx: i,
        })
        .run();
    }
  }

  return {
    classes_created: classesCreated,
    controls_created: controlsCreated,
    courses_created: coursesCreated,
  };
}

export function ingestCourseData(
  handle: DbHandle,
  competitionId: string,
  data: ParsedCourseData,
  opts: CourseImportOpts = {}
): CourseImportResult {
  if (opts.outerTransaction) return doIngest(handle, competitionId, data);
  let result: CourseImportResult = {
    classes_created: 0,
    controls_created: 0,
    courses_created: 0,
  };
  handle.sqlite.transaction(() => {
    result = doIngest(handle, competitionId, data);
  })();
  return result;
}
