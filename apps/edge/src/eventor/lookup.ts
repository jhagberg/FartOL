// Authored for fartol. Not ported from upstream.
//
// Read-only Eventor lookup module (Plan 02-02 task 1).
//
// Two pure SQL functions over the Plan-01 cache tables:
//
//   - lookupBySiCard(handle, siCard)
//     Single-row SELECT against eventor_competitors with a LEFT JOIN onto
//     eventor_clubs. Returns a discriminated union { hit: true, ... } |
//     { hit: false }. Uses the partial UNIQUE index idx_eventor_si_card
//     for an O(log N) hit, which matters because the table is ~252k rows
//     after a full Eventor refresh.
//
//   - lookupByNamePrefix(handle, prefix, limit)
//     Returns up to `limit` matches using `family_name LIKE prefix || '%'`.
//     The composite index idx_eventor_name(family_name, given_name) covers
//     the leading-prefix scan. Empty prefix is a cheap guard — returns [].
//     Caller is expected to enforce minLength 2 (Plan-02 RESEARCH §"WalkupModal
//     Hyrbricka extension"), but defensive trimming/early-return here keeps
//     the function honest if a stray ?prefix= ever lands.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02-PLAN.md task 1
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md (provides the
//   eventor_competitors / eventor_clubs tables + the indexes used here)

import { and, eq, like, asc } from 'drizzle-orm';

import type { DbHandle } from '../db/index.ts';
import { eventorCompetitors, eventorClubs } from '../db/schema.ts';

export interface EventorLookupHit {
  hit: true;
  person_id: number;
  family_name: string;
  given_name: string;
  club_id: number | null;
  club_name: string | null;
}

export interface EventorLookupMiss {
  hit: false;
}

export type EventorLookupResult = EventorLookupHit | EventorLookupMiss;

export interface EventorNameSuggestion {
  person_id: number;
  family_name: string;
  given_name: string;
  club_name: string | null;
  si_card: number | null;
}

/** Single-row lookup by SI card number. Returns the hit shape with the
 * resolved club_name (LEFT JOIN — null when the competitor row's club_id
 * is itself null OR points at an unknown club). */
export function lookupBySiCard(handle: DbHandle, siCard: number): EventorLookupResult {
  const row = handle.db
    .select({
      person_id: eventorCompetitors.personId,
      family_name: eventorCompetitors.familyName,
      given_name: eventorCompetitors.givenName,
      club_id: eventorCompetitors.clubId,
      club_name: eventorClubs.name,
    })
    .from(eventorCompetitors)
    .leftJoin(eventorClubs, eq(eventorCompetitors.clubId, eventorClubs.clubId))
    .where(eq(eventorCompetitors.siCard, siCard))
    .get();
  if (!row) return { hit: false };
  return {
    hit: true,
    person_id: row.person_id,
    family_name: row.family_name,
    given_name: row.given_name,
    club_id: row.club_id,
    club_name: row.club_name ?? null,
  };
}

/** Name-prefix autocomplete. `prefix` is matched case-sensitively against
 * the leading characters of `family_name`. Limit is trusted; caller clamps
 * to [1, 50] (see routes/eventor.ts Zod schema). Returns rows ordered by
 * family_name ASC, given_name ASC for a stable picker UX. */
export function lookupByNamePrefix(
  handle: DbHandle,
  prefix: string,
  limit: number
): EventorNameSuggestion[] {
  const trimmed = prefix.trim();
  if (trimmed.length === 0) return [];

  const rows = handle.db
    .select({
      person_id: eventorCompetitors.personId,
      family_name: eventorCompetitors.familyName,
      given_name: eventorCompetitors.givenName,
      club_name: eventorClubs.name,
      si_card: eventorCompetitors.siCard,
    })
    .from(eventorCompetitors)
    .leftJoin(eventorClubs, eq(eventorCompetitors.clubId, eventorClubs.clubId))
    .where(like(eventorCompetitors.familyName, `${trimmed}%`))
    .orderBy(asc(eventorCompetitors.familyName), asc(eventorCompetitors.givenName))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    person_id: r.person_id,
    family_name: r.family_name,
    given_name: r.given_name,
    club_name: r.club_name ?? null,
    si_card: r.si_card,
  }));
}

// `and` is imported above to satisfy the Drizzle pattern's preferred
// chained-where idiom for future extensions (e.g. club filter).
void and;
