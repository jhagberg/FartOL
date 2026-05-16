---
created: 2026-05-16T14:30:00+02:00
title: Projection loader runs N+1 query for course control codes
area: perf
files:
  - apps/edge/src/projection/loader.ts
source: PR #3 Gemini review, 2026-05-16 (medium)
---

## Problem

`loadCompetitionInputs` in `apps/edge/src/projection/loader.ts:65-74` runs
one `course_controls JOIN controls` query per course inside a
`coursesRows.map(...)`. For a competition with K courses, that's K queries
where 1 join query would suffice:

```ts
const coursesWithCodes: CourseWithControlCodes[] = coursesRows.map((c) => {
  const codeRows = handle.db
    .select({ code: controls.code, orderIdx: courseControls.orderIdx })
    .from(courseControls)
    .innerJoin(controls, eq(courseControls.controlId, controls.id))
    .where(eq(courseControls.courseId, c.id))
    .orderBy(asc(courseControls.orderIdx))
    .all();
  return { ...c, control_codes: codeRows.map((r) => r.code) };
});
```

## Impact

- **Phase 1 (training, 1 comp × 5-10 courses)**: ~5-10 SQLite calls per
  recompute. Invisible at debounce-window scale.
- **Phase 2 (sanctioned, 1 comp × 10-20 courses)**: still invisible.
- **Phase 4-5 (multi-arena / O-ringen, dozens of courses per stage)**:
  starts to add up; recompute under load matters.

## Proposed fix

Single join query using `inArray(course_controls.courseId, courseIds)`,
group by `courseId` in memory. Gemini's full suggestion:

```ts
const allCodes = handle.db
  .select({ courseId: course_controls.courseId, code: controls.code })
  .from(course_controls)
  .innerJoin(controls, eq(course_controls.controlId, controls.id))
  .where(
    inArray(
      course_controls.courseId,
      coursesRows.map((c) => c.id)
    )
  )
  .orderBy(asc(course_controls.orderIdx))
  .all();
const codesByCourse = new Map<string, number[]>();
for (const r of allCodes) {
  const list = codesByCourse.get(r.courseId) ?? [];
  list.push(r.code);
  codesByCourse.set(r.courseId, list);
}
const coursesWithCodes = coursesRows.map((c) => ({
  ...c,
  control_codes: codesByCourse.get(c.id) ?? [],
}));
```

## When to fix

Phase 4 or 5 perf hardening pass. No urgency for Phase 1/2.
