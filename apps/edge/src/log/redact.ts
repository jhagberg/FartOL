// Authored for fartola. Not ported from upstream.
//
// Pino redaction paths for the Fastify logger.
//
// Surface protected: PUT /api/settings/* request bodies carry API keys
// (currently EVENTOR_API_KEY; Phase 3 adds LIVELOX_API_KEY +
// LIVERESULTAT_API_KEY). Without redaction, Fastify's default
// `req` serializer would surface the `req.body.value` field to stdout
// logs on every request, and any subsequent error logger would echo
// the same body back. Plan 02-07 task 1 wires this list into the
// fastify logger config in server.ts.
//
// Pino redact docs: https://getpino.io/#/docs/redaction. Paths use the
// fast-redact selector syntax — wildcards allowed at one level. We
// redact:
//
//   - req.body.value: scrub any request body's `value` field. Specific
//     to the integrations PUT — other routes never name a field
//     `value` at the top level (verified across apps/edge/src/routes/*
//     2026-05-17).
//   - res.body.value: belt-and-suspenders — fastify never echoes the
//     request body to res.body by default, but a future error handler
//     might mistakenly include the body in the response. Redact here
//     so any such regression cannot leak.
//
// CRITICAL: the censor string is the pino default ('[REDACTED]') so
// log readers can grep for it to spot accidental key paste-debug.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-07-PLAN.md task 1 (truth-key #4)
// - OWASP A02:2021 (cryptographic / secret material write-only field)

/** Pino fast-redact path list for the Fastify logger.
 *
 * Path semantics (fast-redact):
 *   - `body.value` — catches handlers that explicitly log `{ body: ... }`
 *     (the typical "log this incoming payload" debug pattern).
 *   - `*.body.value` — catches handlers that log a nested object whose
 *     immediate child is a `body` envelope (e.g. `{ req: { body: ... } }`
 *     when the pino req-serializer is bypassed).
 *   - `request.body.value` / `req.body.value` — explicit fastify
 *     request-style keys.
 *
 * Intentionally scoped to the `body.value` shape — a bare top-level
 * `value` would mask unrelated debug data (e.g. `log.info({ value: 42 },
 * 'count')`) which costs more in observability than it buys in defense.
 *
 * Phase-3 expansion: when LIVELOX_API_KEY / LIVERESULTAT_API_KEY land,
 * no change needed here — the redact is on the FIELD NAME (`body.value`),
 * not the integration key name. New integrations using the same
 * { key, value } payload shape inherit the redaction automatically. */
export const LOGGER_REDACT_PATHS: readonly string[] = [
  'body.value',
  '*.body.value',
  'req.body.value',
  'request.body.value',
];

/** Default pino redact config for buildServer. Censor matches the pino
 * default so existing grep tooling (`journalctl --user -u fartola | grep
 * REDACTED`) keeps working. */
export const LOGGER_REDACT_OPTIONS = {
  paths: [...LOGGER_REDACT_PATHS],
  censor: '[REDACTED]',
} as const;
