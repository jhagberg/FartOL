// Authored for fartola. Not ported from upstream.
//
// Shared Zod-issue → wire error mapper for plan 04 REST routes. Every route
// uses the same structured 400 shape so SvelteKit forms (plan 12 wizard +
// plan 14 walk-up modal) render issues in one place:
//
//   { errors: [{ path: 'consent', code: 'invalid_literal', message: '...' }] }
//
// Zod v4's issue.path is `PropertyKey[]` (string | number | symbol). We
// stringify the path with `String(seg)` because symbols never appear in our
// schemas — every field is a literal string property — but TS demands the
// widening.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-04-PLAN.md task 1
//   (body-validation pattern in <action>: parsed.error.issues.map(i => ({
//   path: i.path.join('.'), code: i.code, message: i.message })))

import type { ZodIssue } from 'zod';

export interface WireZodError {
  path: string;
  code: string;
  message: string;
}

export function issuesToErrors(issues: readonly ZodIssue[]): { errors: WireZodError[] } {
  return {
    errors: issues.map((i) => ({
      path: i.path.map((seg) => String(seg)).join('.'),
      code: i.code,
      message: i.message,
    })),
  };
}
