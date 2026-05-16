// Authored for fartol. Not ported from upstream.
//
// node:test coverage for ingestCourseData. Covers:
//   - test 1: sample ParsedCourseData → 2 classes / 4 controls / 2 courses,
//     course_controls inserted in declared order.
//   - test 2: re-running the same import is idempotent at the class + control
//     layer (existing rows reused).
//   - test 3: a Course referencing an unknown control code → ingester throws
//     and the wrapping transaction aborts (no partial writes).
//   - test 4 (C-H3 mid-tx seam): opts.outerTransaction=true makes the
//     ingester throw synchronously inside the caller's transaction; the
//     /from-wizard endpoint relies on this for its rollback contract.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 2

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { openDatabase } from '../db/index.ts';
import type { DbHandle } from '../db/index.ts';
import { classes, competitions, controls, courses, courseControls } from '../db/schema.ts';
import { ingestCourseData } from './courseImport.ts';
import type { ParsedCourseData } from '../xml/parse.ts';

interface Ctx {
  handle: DbHandle;
  competitionId: string;
}

function bootCtx(): Ctx {
  const handle = openDatabase(':memory:');
  const competitionId = crypto.randomUUID();
  handle.db
    .insert(competitions)
    .values({
      id: competitionId,
      name: 'Ingest Test',
      date: '2026-05-14',
      receiptTemplate: 'classic',
      autoPrint: false,
      createdAtMs: Date.now(),
    })
    .run();
  return { handle, competitionId };
}

const SAMPLE: ParsedCourseData = {
  kind: 'CourseData',
  event_name: 'StorTuna Tisdag',
  classes: [
    { id: 'H21', name: 'H21', short_name: 'H21' },
    { id: 'D21', name: 'D21', short_name: 'D21' },
  ],
  controls: [{ code: 31 }, { code: 32 }, { code: 33 }, { code: 34 }],
  courses: [
    {
      id: 'Bana 1',
      name: 'Bana 1',
      class_id_ref: 'H21',
      length_m: 3500,
      climb_m: 45,
      control_codes: [31, 32, 33, 34],
    },
    {
      id: 'Bana 2',
      name: 'Bana 2',
      class_id_ref: 'D21',
      length_m: 2800,
      climb_m: 30,
      control_codes: [34, 33, 32, 31],
    },
  ],
};

describe('ingestCourseData', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = bootCtx();
  });
  afterEach(() => {
    ctx.handle.close();
  });

  test('test 1: writes 2 classes, 4 controls, 2 courses with ordered course_controls', () => {
    const result = ingestCourseData(ctx.handle, ctx.competitionId, SAMPLE);
    assert.deepEqual(result, {
      classes_created: 2,
      controls_created: 4,
      courses_created: 2,
    });

    // Classes persisted with correct competition_id.
    const classRows = ctx.handle.db
      .select()
      .from(classes)
      .where(eq(classes.competitionId, ctx.competitionId))
      .all();
    assert.equal(classRows.length, 2);
    const names = classRows.map((r) => r.name).sort();
    assert.deepEqual(names, ['D21', 'H21']);

    // Controls.
    const controlRows = ctx.handle.db
      .select()
      .from(controls)
      .where(eq(controls.competitionId, ctx.competitionId))
      .all();
    const codes = controlRows.map((r) => r.code).sort((a, b) => a - b);
    assert.deepEqual(codes, [31, 32, 33, 34]);

    // Courses.
    const courseRows = ctx.handle.db
      .select()
      .from(courses)
      .where(eq(courses.competitionId, ctx.competitionId))
      .all();
    assert.equal(courseRows.length, 2);
    const bana1 = courseRows.find((c) => c.name === 'Bana 1');
    assert.ok(bana1);
    assert.equal(bana1.lengthM, 3500);
    assert.equal(bana1.climbM, 45);
    // class_id should be the H21 row id, not the source XML's local 'H21' string.
    const h21 = classRows.find((c) => c.name === 'H21');
    assert.ok(h21);
    assert.equal(bana1.classId, h21.id);

    // course_controls for Bana 1 in correct order.
    const cc1 = ctx.handle.db
      .select()
      .from(courseControls)
      .where(eq(courseControls.courseId, bana1.id))
      .all()
      .sort((a, b) => a.orderIdx - b.orderIdx);
    assert.equal(cc1.length, 4);
    // Resolve the codes via control rows.
    const idToCode = new Map(controlRows.map((r) => [r.id, r.code]));
    const orderedCodes = cc1.map((cc) => idToCode.get(cc.controlId));
    assert.deepEqual(orderedCodes, [31, 32, 33, 34]);
  });

  test('test 2: re-running the same input is idempotent for classes + controls', () => {
    ingestCourseData(ctx.handle, ctx.competitionId, SAMPLE);
    const r2 = ingestCourseData(ctx.handle, ctx.competitionId, SAMPLE);
    // Second pass: classes + controls already exist; courses are fresh.
    assert.equal(r2.classes_created, 0);
    assert.equal(r2.controls_created, 0);
    assert.equal(r2.courses_created, 2);

    // Total class rows still 2, total controls still 4.
    const classRows = ctx.handle.db
      .select()
      .from(classes)
      .where(eq(classes.competitionId, ctx.competitionId))
      .all();
    assert.equal(classRows.length, 2);
    const controlRows = ctx.handle.db
      .select()
      .from(controls)
      .where(eq(controls.competitionId, ctx.competitionId))
      .all();
    assert.equal(controlRows.length, 4);
  });

  test('test 3: unknown control code → ingest throws, transaction aborts', () => {
    const bad: ParsedCourseData = {
      ...SAMPLE,
      controls: [{ code: 31 }, { code: 32 }],
      courses: [
        {
          id: 'Bana 1',
          name: 'Bana 1',
          class_id_ref: null,
          length_m: null,
          climb_m: null,
          control_codes: [31, 32, 99], // 99 not in controls list
        },
      ],
    };
    assert.throws(
      () => ingestCourseData(ctx.handle, ctx.competitionId, bad),
      /Course Bana 1 references unknown control 99/
    );
    // Transaction rolled back — no class / control / course rows for this
    // competition.
    const classRows = ctx.handle.db
      .select()
      .from(classes)
      .where(eq(classes.competitionId, ctx.competitionId))
      .all();
    assert.equal(classRows.length, 0);
    const controlRows = ctx.handle.db
      .select()
      .from(controls)
      .where(eq(controls.competitionId, ctx.competitionId))
      .all();
    assert.equal(controlRows.length, 0);
    const courseRows = ctx.handle.db
      .select()
      .from(courses)
      .where(eq(courses.competitionId, ctx.competitionId))
      .all();
    assert.equal(courseRows.length, 0);
  });

  test('test 4 (C-H3 mid-tx seam): outerTransaction=true throws synchronously inside caller tx', () => {
    const bad: ParsedCourseData = {
      ...SAMPLE,
      controls: [{ code: 31 }],
      courses: [
        {
          id: 'Phantom',
          name: 'Phantom',
          class_id_ref: null,
          length_m: null,
          climb_m: null,
          control_codes: [31, 99],
        },
      ],
    };
    let thrown = false;
    assert.throws(
      () => {
        ctx.handle.sqlite.transaction(() => {
          ingestCourseData(ctx.handle, ctx.competitionId, bad, { outerTransaction: true });
        })();
      },
      (e: Error) => {
        thrown = true;
        return /unknown control 99/.test(e.message);
      }
    );
    assert.equal(thrown, true);
    // No rows committed.
    const courseRows = ctx.handle.db
      .select()
      .from(courses)
      .where(eq(courses.competitionId, ctx.competitionId))
      .all();
    assert.equal(courseRows.length, 0);
  });
});
