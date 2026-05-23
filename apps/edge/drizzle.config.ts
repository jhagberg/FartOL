// Authored for fartola. Not ported from upstream.
//
// drizzle-kit configuration for the @fartola/edge package. Dev-only — this
// file is read by `pnpm db:generate` (Phase 1 plan 02). Runtime migrator
// (apps/edge/src/db/migrate.ts) does NOT read this file; it resolves the
// migrations folder relative to import.meta.url so the published tarball
// works without a drizzle.config.ts on disk.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-09/D-10
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md §"Pattern 1"
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H1
//   (triggers live in a separate, hand-authored 0001_append_only_triggers.sql
//    so future `db:generate` runs cannot erase them — drizzle-kit's
//    schema-as-TS has no trigger primitive)

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
