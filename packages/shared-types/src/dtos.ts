// Authored for fartol. Not ported from upstream.
//
// REST DTOs for the Phase 1 edge<->web contract. Real Zod schemas + inferred
// TS types live here so SvelteKit forms (plan 12 wizard + plan 14 walk-up
// modal) and Fastify route handlers share one source of truth at the wire
// boundary. Snake_case at the wire per PATTERNS S-6 + CONTEXT D-15.
//
// Phase 1 schemas:
//   - Competition: CompetitionDTO + CompetitionCreateInput + CompetitionPatchInput
//   - Class:       ClassDTO + ClassCreateInput
//   - Course:      CourseDTO + CourseCreateInput
//   - Competitor:  CompetitorDTO + CompetitorCreateInput
//   - Club:        ClubDTO
//   - Health:      HealthDTO (plan 01 baseline — keep)
//
// Boundary contracts:
//   - REQ-PRIV-001: CompetitorCreateInput requires `consent: true` literal.
//     The server attests `consent_at_ms = Date.now()`; the client cannot
//     backdate consent.
//   - D-15 dates: 'YYYY-MM-DD' string. Regex `^\d{4}-\d{2}-\d{2}$` catches
//     structural failures; SQLite does NOT validate semantic month/day so
//     '2026-13-99' passes the regex by design. UI-SPEC §Visual Anchors —
//     NO locale-dependent date inputs.
//   - C-M4: consent_status arms locked at {explicit, pending_first_read,
//     confirmed_on_read}; CompetitorCreateInput accepts only 'explicit'
//     because walk-up POST is always explicit (the import path in plan 05
//     hits a different code surface).
//   - Receipt template arms locked at UI-SPEC §"Receipt templates" — six
//     names; default 'classic' attached server-side, not via Zod default,
//     so an explicit POST sees an explicit echo of what was stored.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-15
//   (mutable config: competition fields = name + date + receipt_template +
//   auto_print; D-04 walk-up first-class registration)
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-11
//   (hybrid card-to-competitor matching — cardNumber persisted on
//   competitor row; reducer in plan 07 reads from this column)
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-6
//   (snake_case at the I/O boundary; camelCase inside TS bodies)
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M4
//   (consent_status arms; walk-up = 'explicit')
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Auto-print
//   toggle" (event-level, persisted on competitions row)
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Walk-up
//   modal" (name minLength 2, klubb optional autocomplete, klass required,
//   bricka optional integer)
// - REQ-PRIV-001 (explicit consent literal on walk-up POST)

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared atoms — used across multiple schemas, declared once.
// ---------------------------------------------------------------------------

/** UUID string (any version). Hand-rolled `regex` instead of `z.uuid()` so the
 * generated error path stays `path: 'id'` rather than `path: 'id'` plus a
 * Zod-format token; the REST tests grep on `path` for assertions. The regex
 * mirrors RFC 4122 v1-v8 + the v0 nil UUID; it accepts both lowercase and
 * uppercase hex. */
const UUID = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'expected UUID'
  );

/** ISO date 'YYYY-MM-DD'. CONTEXT D-15 + UI-SPEC §Visual Anchors lock the
 * wire shape; SQLite does not validate semantic month/day, so '2026-13-99'
 * passes by design (the regex is purely structural). */
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** UI-SPEC §"Receipt templates" — six template names locked. */
const RECEIPT_TEMPLATE = z.enum(['classic', 'standing', 'detailed', 'top4', 'minimal', 'kids']);

/** Positive integer (>= 1). Used for card_number + course controls. */
const POSITIVE_INT = z.number().int().positive();

// ---------------------------------------------------------------------------
// Competition — D-15 locks four mutable fields: name, date, receipt_template,
// auto_print. UI-SPEC §"Receipt template DEFAULT" pins default to 'classic';
// UI-SPEC §"Auto-print toggle" defaults auto_print to false (OFF).
// ---------------------------------------------------------------------------

export const CompetitionDTO = z.object({
  id: UUID,
  name: z.string().min(1),
  date: ISO_DATE,
  receipt_template: RECEIPT_TEMPLATE,
  auto_print: z.boolean(),
  created_at_ms: z.number().int().nonnegative(),
});
export type CompetitionDTO = z.infer<typeof CompetitionDTO>;

export const CompetitionCreateInput = z.object({
  name: z.string().min(1).max(200),
  date: ISO_DATE,
  receipt_template: RECEIPT_TEMPLATE.optional(),
  auto_print: z.boolean().optional(),
});
export type CompetitionCreateInput = z.infer<typeof CompetitionCreateInput>;

export const CompetitionPatchInput = z.object({
  name: z.string().min(1).max(200).optional(),
  date: ISO_DATE.optional(),
  receipt_template: RECEIPT_TEMPLATE.optional(),
  auto_print: z.boolean().optional(),
});
export type CompetitionPatchInput = z.infer<typeof CompetitionPatchInput>;

// ---------------------------------------------------------------------------
// Class — mutable config table, always nested under a competition.
// ---------------------------------------------------------------------------

export const ClassDTO = z.object({
  id: UUID,
  competition_id: UUID,
  name: z.string().min(1),
  short_name: z.string().nullable(),
});
export type ClassDTO = z.infer<typeof ClassDTO>;

export const ClassCreateInput = z.object({
  name: z.string().min(1).max(120),
  short_name: z.string().max(40).nullable().optional(),
});
export type ClassCreateInput = z.infer<typeof ClassCreateInput>;

// ---------------------------------------------------------------------------
// Course — controls embedded as { control_code, order_idx } pairs at the wire
// boundary (mirrors the joined SELECT in routes/courses.ts). class_id is
// nullable because XML import (D-03) may assign later.
// ---------------------------------------------------------------------------

export const CourseControlDTO = z.object({
  control_code: POSITIVE_INT,
  order_idx: z.number().int().nonnegative(),
});
export type CourseControlDTO = z.infer<typeof CourseControlDTO>;

export const CourseDTO = z.object({
  id: UUID,
  competition_id: UUID,
  name: z.string().min(1),
  class_id: UUID.nullable(),
  length_m: z.number().int().nullable(),
  climb_m: z.number().int().nullable(),
  controls: z.array(CourseControlDTO),
});
export type CourseDTO = z.infer<typeof CourseDTO>;

export const CourseCreateInput = z.object({
  name: z.string().min(1).max(120),
  class_id: UUID.nullable().optional(),
  length_m: z.number().int().nullable().optional(),
  climb_m: z.number().int().nullable().optional(),
  controls: z.array(CourseControlDTO),
});
export type CourseCreateInput = z.infer<typeof CourseCreateInput>;

// ---------------------------------------------------------------------------
// Competitor — REQ-PRIV-001 enforces `consent: true` literal. C-M4 locks the
// three consent_status arms; walk-up POST is always 'explicit' so the create
// input accepts only that arm (or omits it for the server default).
//
// UI-SPEC §"Walk-up modal" form contract:
//   - name:        required, min 2 chars
//   - klubb/club:  optional autocomplete
//   - klass:       required (class_id)
//   - bricka/card: optional integer (card_number)
// ---------------------------------------------------------------------------

export const CompetitorDTO = z.object({
  id: UUID,
  competition_id: UUID,
  name: z.string(),
  club: z.string().nullable(),
  class_id: UUID,
  card_number: POSITIVE_INT.nullable(),
  consent_at_ms: z.number().int().nonnegative().nullable(),
  consent_status: z.enum(['explicit', 'pending_first_read', 'confirmed_on_read']),
  scrubbed_at_ms: z.number().int().nullable(),
});
export type CompetitorDTO = z.infer<typeof CompetitorDTO>;

export const CompetitorCreateInput = z.object({
  competition_id: UUID,
  /** UI-SPEC §"Walk-up modal" — minLength 2. `.trim()` normalises trailing
   * whitespace before length is checked. */
  name: z.string().trim().min(2).max(200),
  /** Optional autocomplete. Empty string + missing key both collapse to null
   * via the transform so the DB sees a single shape. */
  club: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : v)),
  class_id: UUID,
  card_number: POSITIVE_INT.nullable()
    .optional()
    .transform((v) => v ?? null),
  /** REQ-PRIV-001 — explicit consent literal. The server attests
   * `consent_at_ms = Date.now()`; the client cannot backdate. */
  consent: z.literal(true),
  /** C-M4: walk-up POST is always 'explicit'. Omitted = server default
   * 'explicit' (mirrors the schema column DEFAULT from plan 02). */
  consent_status: z.literal('explicit').optional(),
});
export type CompetitorCreateInput = z.infer<typeof CompetitorCreateInput>;

// ---------------------------------------------------------------------------
// Plan 10 — manual DNF override + un-DNF reversal.
//
// REST inputs for POST /api/competitions/:id/competitors/:competitorId/manual-dnf
// and .../un-dnf. The un-DNF endpoint takes no body; the schema is exported
// for symmetry with ManualDnfInput so SvelteKit can declare both `import`
// types together (plan 13 readout view).
//
// UI-SPEC §"Manual DNF override": the reason field is operator-typed,
// length-capped at 500 to fit the receipt template + readout-row tooltip.
// ---------------------------------------------------------------------------

export const ManualDnfInput = z.object({
  reason: z.string().min(1).max(500),
});
export type ManualDnfInput = z.infer<typeof ManualDnfInput>;

/** Un-DNF takes no body (presence of the POST is the action). Exported as a
 * passthrough object so SvelteKit `import type` consumers can reference a
 * matching name; the route handler does NOT parse the body. */
export const UnDnfInput = z.object({}).passthrough();
export type UnDnfInput = z.infer<typeof UnDnfInput>;

// ---------------------------------------------------------------------------
// Club — walk-up autocomplete cache.
// ---------------------------------------------------------------------------

export const ClubDTO = z.object({
  name: z.string(),
  last_seen_at_ms: z.number().int().nonnegative(),
});
export type ClubDTO = z.infer<typeof ClubDTO>;

// ---------------------------------------------------------------------------
// Health — plan 01 baseline. Kept here so apps/edge keeps a single import
// surface for shared schemas + types.
// ---------------------------------------------------------------------------

export const HealthDTO = z.object({
  status: z.literal('ok'),
  node_id: z.string(),
  uptime_ms: z.number(),
});
export type HealthDTO = z.infer<typeof HealthDTO>;
