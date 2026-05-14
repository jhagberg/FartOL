// Authored for fartol. Not ported from upstream.
//
// REST DTOs for the Phase 1 edge<->web contract. Snake_case at the wire
// boundary per PATTERNS S-6 + CONTEXT D-15. Plan 01 lands the minimal
// surface needed for /api/health + downstream plan stubs; subsequent
// plans (02 events table, 03 competition CRUD, 04 walk-up registration,
// etc.) extend each interface as their schema lands.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-15
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-6

/** Competition row as exposed over REST. Mirrors the Drizzle `competitions`
 * table shape that lands in plan 02. */
export interface CompetitionDTO {
  id: string;
  name: string;
  date: string;
  receipt_template: string;
  auto_print: boolean;
  created_at_ms: number;
}

/** Competitor row as exposed over REST. Consent metadata flows through
 * plans 14 (import path) and 17 (walk-up registration); the three
 * consent_status arms cover all entry routes in Phase 1. scrubbed_at_ms
 * is set by plan 17's daily retention scrub (REQ-PRIV-002) — non-null
 * indicates an anonymized row. */
export interface CompetitorDTO {
  id: string;
  competition_id: string;
  name: string;
  club: string | null;
  class_id: string;
  card_number: number | null;
  consent_at_ms: number | null;
  consent_status: 'explicit' | 'pending_first_read' | 'confirmed_on_read';
  scrubbed_at_ms: number | null;
}

/** Bridge health probe. node_id is a stable per-install identifier; the
 * `local-dev` default makes plan 01 work without env config. uptime_ms is
 * `process.uptime() * 1000` rounded to an integer at the boundary. */
export interface HealthDTO {
  status: 'ok';
  node_id: string;
  uptime_ms: number;
}
