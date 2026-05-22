// Authored for fartola. Not ported from upstream.
//
// Internal Drizzle row types for apps/edge. Per codex review C-H5:
// `packages/shared-types/` is a pure DTO package that does NOT import the
// Drizzle schema across the apps/ boundary. apps/edge maps these internal
// rows to the plain shared-types DTOs at REST/WS response boundaries
// (plan 04 wires the route handlers + mappers).
//
// The pattern is "Drizzle-bound types live where the schema lives" — this
// file is the single source of truth for $inferSelect / $inferInsert row
// types within @fartola/edge, and shared-types stays Drizzle-free.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-08
//   (shared-types is a publishable DTO package; no upward apps/ imports)

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  events,
  competitions,
  classes,
  controls,
  courses,
  courseControls,
  competitors,
  clubs,
  config,
} from './schema.ts';

export type Event = InferSelectModel<typeof events>;
export type EventInsert = InferInsertModel<typeof events>;

export type Competition = InferSelectModel<typeof competitions>;
export type CompetitionInsert = InferInsertModel<typeof competitions>;

export type Class = InferSelectModel<typeof classes>;
export type ClassInsert = InferInsertModel<typeof classes>;

export type Control = InferSelectModel<typeof controls>;
export type ControlInsert = InferInsertModel<typeof controls>;

export type Course = InferSelectModel<typeof courses>;
export type CourseInsert = InferInsertModel<typeof courses>;

export type CourseControl = InferSelectModel<typeof courseControls>;
export type CourseControlInsert = InferInsertModel<typeof courseControls>;

export type Competitor = InferSelectModel<typeof competitors>;
export type CompetitorInsert = InferInsertModel<typeof competitors>;

export type Club = InferSelectModel<typeof clubs>;
export type ClubInsert = InferInsertModel<typeof clubs>;

export type ConfigRow = InferSelectModel<typeof config>;
export type ConfigInsert = InferInsertModel<typeof config>;

// Re-export the schema's EventPayload union so internal consumers
// (ingest helpers, projection reducers) can import it via './db/types.ts'
// alongside the row types.
export type { EventPayload } from './schema.ts';
