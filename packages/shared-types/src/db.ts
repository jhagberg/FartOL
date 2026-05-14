// Authored for fartol. Not ported from upstream.
//
// Plain DTO interfaces describing the REST/WS wire shape (snake_case). Per
// codex review C-H5, `packages/shared-types/` is a pure DTO package — zero
// upward imports from `apps/`, zero `drizzle-orm` import. Drizzle row types
// live in `apps/edge/src/db/types.ts`. apps/edge is responsible for mapping
// internal rows to these DTOs at response boundaries (plan 04 wires the
// route handlers + mappers).
//
// These interfaces are hand-mirrored from the Drizzle schema; if the schema
// drifts, the apps/edge mapper layer bridges the gap and this file is
// updated to match. PATTERNS S-6 locks snake_case at the wire boundary.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-08
//   (shared-types is a publishable DTO package, no upward apps/ imports)
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-6
//   (snake_case at the I/O boundary)
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5
//   (zero upward apps/ imports, zero drizzle-orm import)
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M4
//   (consent_status is a fixed three-arm string union)

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

export interface ClassDTO {
  id: string;
  competition_id: string;
  name: string;
  short_name: string | null;
}

export interface ControlDTO {
  id: string;
  competition_id: string;
  code: number;
}

export interface CourseDTO {
  id: string;
  competition_id: string;
  name: string;
  class_id: string | null;
  length_m: number | null;
  climb_m: number | null;
}

export interface CourseControlDTO {
  id: string;
  course_id: string;
  control_id: string;
  order_idx: number;
}

export interface ClubDTO {
  name: string;
  last_seen_at_ms: number;
}
