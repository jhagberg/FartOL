// Authored for fartola. Not ported from upstream.
//
// Shared constants + XML normalizers for the MeOS integration plugins
// (mip.ts and, when Plan 02-04 lands, mop.ts).
//
// Why this module exists separately:
// - Both MIP and MOP route plugins want the same wire-format namespace URIs
//   and the same fast-xml-parser one-vs-many normalizers. Duplicating these
//   in each route file would let the two drift; centralising here keeps the
//   namespaced wire shape consistent and gives Plan 02-04 a single import
//   target.
// - The four helpers (toArray, asString, asInt, asBool) intentionally copy
//   the verbatim shape used by apps/edge/src/xml/parse.ts lines 171-200 so
//   downstream callers (e.g. the MOP receiver dispatching on root element)
//   can share the same mental model as the IOF importer.
// - coerceInt is a thin wrapper used by mip.ts header parsing; it rejects
//   negative integers AND non-numeric strings (returns undefined) so the
//   MIP `lastid` parser can safely fall through to `?? 0`.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-03-PLAN.md task 1
// - .planning/phases/02-4-klubbs-mvp/02-PATTERNS.md §5 (shared.ts pattern —
//   normalizer signatures match xml/parse.ts:171-200)
// - .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md D-MIP-4 (namespace
//   constant locked at MIP_NS = 'http://www.melin.nu/mip')
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §"MIP wire format"
//   (xmlns="http://www.melin.nu/mip" required on every MIPData response;
//   same for MOP_NS Plan 04 use)

/** MIP wire-format namespace URI. Every MIPData response MUST declare this
 * namespace at the root element so xmllint validation against mip.xsd
 * passes (the XSD has `targetNamespace="http://www.melin.nu/mip"`). */
export const MIP_NS = 'http://www.melin.nu/mip';

/** MOP wire-format namespace URI. Plan 04 (MOP receiver) imports this. */
export const MOP_NS = 'http://www.melin.nu/mop';

/** fast-xml-parser yields a single object when one child exists and an
 * array when multiple children exist; `toArray` collapses both shapes to an
 * iterable array, dropping null/undefined. Copy of xml/parse.ts:173-176. */
export function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/** Normalize a raw fast-xml-parser leaf to a trimmed string (or null when
 * empty/absent). Numbers and booleans are stringified verbatim. Copy of
 * xml/parse.ts:178-183. */
export function asString(x: unknown): string | null {
  if (x === undefined || x === null) return null;
  if (typeof x === 'string') return x.trim().length > 0 ? x.trim() : null;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  return null;
}

/** Normalize a raw fast-xml-parser leaf to a finite integer (or null when
 * non-numeric). Truncates decimals (e.g. "31.0" → 31). Copy of
 * xml/parse.ts:195-200. */
export function asInt(x: unknown): number | null {
  if (x === undefined || x === null) return null;
  if (typeof x === 'number' && Number.isFinite(x)) return Math.trunc(x);
  if (typeof x === 'string' && x.trim().length > 0) {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/** Normalize a raw fast-xml-parser leaf to a boolean. Accepts true, false,
 * 'true', 'false', 1, 0, '1', '0'. Anything else returns false. Used by
 * MOP `<cmp delete="true">` parsing in Plan 04 + the MIP `<card hired="...">`
 * test fixtures here in Plan 03. */
export function asBool(x: unknown): boolean {
  if (x === true || x === 1) return true;
  if (typeof x === 'string') {
    const lower = x.trim().toLowerCase();
    return lower === 'true' || lower === '1';
  }
  return false;
}

/** Parse a header value to a non-negative integer. Returns undefined for
 * negative numbers, non-numeric strings, or anything other than a string.
 * Used by mip.ts to read `lastid` / `competition` from headers (where the
 * raw value is always string | string[] | undefined per the Node HTTP API).
 *
 * Stricter than input.php's `(int)$value` cast — see RESEARCH "Landmine:
 * input.php lastid coercion". We surface a clean undefined so the caller
 * can fall through to a query-string source or `?? 0` default; MeOS sending
 * garbage in the header is treated the same as not sending it. */
export function coerceInt(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  // Strict integer regex — reject decimals ("3.5"), hex, scientific notation.
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
