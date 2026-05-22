// Authored for fartola. Not ported from upstream.
//
// Plain DTO interfaces describing the REST/WS wire shape (snake_case) for
// the subset of plan 02 schema tables that do NOT yet have a Zod schema in
// dtos.ts. Per codex review C-H5, `packages/shared-types/` is a pure DTO
// package — zero upward imports from `apps/`, zero `drizzle-orm` import.
// Drizzle row types live in `apps/edge/src/db/types.ts`. apps/edge is
// responsible for mapping internal rows to these DTOs at response
// boundaries.
//
// Plan 04 moved Class / Course / CourseControl / Club to Zod schemas (see
// dtos.ts). EventDTO + ControlDTO stay here as plain interfaces; the events
// projection (plan 08) + control management (post-Phase-1) will lift them
// when they need server-side validation.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-08
//   (shared-types is a publishable DTO package, no upward apps/ imports)
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-6
//   (snake_case at the I/O boundary)
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5
//   (zero upward apps/ imports, zero drizzle-orm import)

/** Event row as exposed over REST. Mirrors the Drizzle `events` table.
 * `payload` is `unknown` here because the discriminated EventPayload
 * union lives in apps/edge/src/db/schema.ts (C-H5 boundary); consumers
 * narrow the type via the `event_type` discriminator. */
export interface EventDTO {
  node_id: string;
  local_seq: number;
  competition_id: string | null;
  event_type: string;
  event_time_ms: number;
  recorded_at_ms: number;
  payload: unknown;
}

/** Control row — physical SI control box record. Plan 04 does NOT wire a
 * CRUD route for controls (they are auto-created as side effect of course
 * imports in plan 05); this DTO exists for future use. */
export interface ControlDTO {
  id: string;
  competition_id: string;
  code: number;
}
