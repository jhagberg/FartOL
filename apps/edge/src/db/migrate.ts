// Authored for fartola. Not ported from upstream.
//
// Embedded Drizzle migrator for the apps/edge bridge. Runs at every cold
// start; idempotent. drizzle-orm's migrator walks meta/_journal.json
// numerically and applies every listed migration whose hash is not yet
// recorded in the __drizzle_migrations table, so this single function
// applies BOTH 0000_initial.sql AND 0001_append_only_triggers.sql on a
// fresh database. On second + subsequent calls it is a no-op.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md
//   "Claude's Discretion" — embedded migrator at bridge startup so
//   `npm install -g fartola && fartola` Just Works on an empty data dir.
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Pattern 2: Embedded migrator at bridge cold start" (verbatim).
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H1
//   (migrate.test.ts asserts BOTH 0000 + 0001 apply on cold start —
//    the regression gate for "drizzle-kit regenerates 0000, forgets 0001").
// - REQ-OPS-001 (single-binary install), REQ-OPS-002 (restart-safe).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled drizzle/ folder. Resolved relative to this
 * file via import.meta.url so the embedded migrator works regardless of how
 * the binary is launched (pnpm dev, tsx, node dist/, npm install -g, etc.).
 * Exported so tests can assert the resolution + so a future build step can
 * verify the folder is present in the published tarball. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/** Run all pending Drizzle migrations on the given better-sqlite3 instance.
 * Idempotent — subsequent calls on the same db are a no-op. */
export function runMigrations(sqlite: Database.Database): void {
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
}
