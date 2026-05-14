// Authored for fartol. Not ported from upstream.
//
// Pure ingester: writes a ParsedEntryList document into the SQLite layer
// inside a transaction. Used by both /api/competitions/:id/import (existing
// competition, ingester wraps its own transaction) and the C-H3 atomic
// /api/competitions/from-wizard endpoint (caller owns the outer transaction
// via opts.outerTransaction=true).
//
// C-M4 EntryList consent semantics (LOCKED here):
//   - Every imported competitor row gets consent_at_ms = NULL AND
//     consent_status = 'pending_first_read'.
//   - Plan 14 surfaces a one-time "Bekräfta samtycke" toast on the first
//     card_read for a pending_first_read competitor; the operator's
//     confirmation flips consent_status → 'confirmed_on_read' AND sets
//     consent_at_ms = Date.now() via an UPDATE in plan 14.
//   - Walk-up registration (plan 04) uses the schema DEFAULT 'explicit' +
//     Date.now() consent_at_ms; plan 04 never calls this function.
//
// Partial-import behavior: if an EntryList Person references a class name
// that does NOT exist in the competition's classes table, that competitor
// is SKIPPED and the class name added to result.classes_missing. This
// matches the wizard's "CourseData first, EntryList second" precondition —
// the wizard surfaces classes_missing as a warning toast instead of failing
// the whole import. (For the from-wizard atomic endpoint, classes_missing
// being non-empty when ALL competitors fall through means we throw inside
// doIngest so the transaction rolls back — see the "entrylist_without_
// courses" path.)
//
// Duplicate card_number: if a competitor with the same card_number already
// exists in the competition, the new row is skipped (silent no-op). The
// D-11 partial unique index would otherwise abort the whole transaction
// with a constraint error; the pre-flight SELECT keeps the failure mode
// graceful for the bulk-import path.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-M4
//   (EntryList consent semantics — pending_first_read + null)

import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';

import type { DbHandle } from '../db/index.ts';
import { classes, clubs, competitors } from '../db/schema.ts';
import type { ParsedEntryList } from '../xml/parse.ts';

export interface EntryImportResult {
  competitors_created: number;
  /** Class names referenced by PersonEntry that did not match any class in
   * the competition's classes table. Non-empty = some entries were
   * skipped; the wizard surfaces this as a warning. */
  classes_missing: string[];
}

export interface EntryImportOpts {
  outerTransaction?: boolean;
}

function doIngest(
  handle: DbHandle,
  competitionId: string,
  data: ParsedEntryList,
  nowMs: number
): EntryImportResult {
  // Pre-load classes for this competition into a Map<name, id> so we don't
  // hit the DB once per competitor.
  const classIdByName = new Map<string, string>();
  const existingClasses = handle.db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(sql`${classes.competitionId} = ${competitionId}`)
    .all();
  for (const row of existingClasses) {
    classIdByName.set(row.name, row.id);
  }

  const missing = new Set<string>();
  let competitorsCreated = 0;

  for (const e of data.competitors) {
    const classId = classIdByName.get(e.class_name);
    if (!classId) {
      missing.add(e.class_name);
      continue;
    }
    // D-11 pre-flight duplicate-card check (silent skip on duplicate).
    if (e.card_number !== null) {
      const dup = handle.db
        .select({ id: competitors.id })
        .from(competitors)
        .where(
          sql`${competitors.competitionId} = ${competitionId} AND ${competitors.cardNumber} = ${e.card_number}`
        )
        .get();
      if (dup) continue;
    }
    // C-M4: EntryList-imported competitors start at pending_first_read +
    // NULL consent_at_ms. Plan 14 flips the status on first card_read.
    handle.db
      .insert(competitors)
      .values({
        id: crypto.randomUUID(),
        competitionId,
        name: e.name,
        club: e.club,
        classId,
        cardNumber: e.card_number,
        consentAtMs: null,
        consentStatus: 'pending_first_read',
        scrubbedAtMs: null,
      })
      .run();
    competitorsCreated++;

    if (e.club !== null && e.club.length > 0) {
      handle.db
        .insert(clubs)
        .values({ name: e.club, lastSeenAtMs: nowMs })
        .onConflictDoUpdate({ target: clubs.name, set: { lastSeenAtMs: nowMs } })
        .run();
    }
  }

  // If EVERY competitor in the EntryList was rejected because its class
  // name didn't match any class in the competition, surface as a hard
  // error so the from-wizard atomic transaction rolls back the competition
  // row. This is the "entrylist_without_courses" precondition the plan
  // calls out: the wizard normally uploads CourseData first. Distinguish
  // from the duplicate-card-skip path (where competitors_created is 0 but
  // classes_missing is empty) — that's a legitimate idempotent no-op.
  if (competitorsCreated === 0 && missing.size > 0) {
    throw new Error(
      `EntryList references ${missing.size} class name(s) but no matching classes exist in the competition; ` +
        `upload CourseData first. Missing: ${[...missing].join(', ')}`
    );
  }

  return {
    competitors_created: competitorsCreated,
    classes_missing: [...missing],
  };
}

export function ingestEntryList(
  handle: DbHandle,
  competitionId: string,
  data: ParsedEntryList,
  nowMs: number,
  opts: EntryImportOpts = {}
): EntryImportResult {
  if (opts.outerTransaction) return doIngest(handle, competitionId, data, nowMs);
  let result: EntryImportResult = {
    competitors_created: 0,
    classes_missing: [],
  };
  handle.sqlite.transaction(() => {
    result = doIngest(handle, competitionId, data, nowMs);
  })();
  return result;
}
