// Authored for fartol. Not ported from upstream.
//
// DNF/MP detection over a card_read payload. Per codex review C-H2
// (revision 2):
//
//   - DNF when payload.finish === null. The prior revision filtered
//     punches[] for FINISH_CODES = {2, 3, 240}; those codes in Phase 0's
//     surface are CONTROL-STATION punches, not finish events. Phase 0
//     emits start/finish as top-level HalfDayClock fields on
//     CardReadEvent (packages/sportident/src/output/ndjson.ts lines
//     84-98). The reducer now reads payload.start and payload.finish
//     directly.
//
//   - The START_CODES / FINISH_CODES / CHECK_CODES filter constants from
//     revision 1 are REMOVED. punches[] from a Phase-0-decoded card_read
//     contains only control-station punches — the decoder layer already
//     separates start/finish/check at the storage→raceResult boundary.
//
//   - Elapsed time = diffMs(payload.start, payload.finish) from
//     halfDayClockMath.ts. Caller wraps the call; we return null when
//     either half-day clock is null.
//
// Per CONTEXT D-12 (punch-only DNF, no time-auto-DNF in Phase 1) and
// UI-SPEC §"Manual DNF override" (manual_dnf wins). The manual override is
// applied by reduce.ts (not here) — this helper only consumes the bare
// payload and emits OK/MP/DNF on its own.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-12
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md §"Manual
//   DNF override"
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H2

import type { NdjsonPunch, HalfDayClock } from '@fartol/sportident';
import { diffMs } from './halfDayClockMath.ts';

export interface DetectInput {
  start: HalfDayClock | null;
  finish: HalfDayClock | null;
  punches: readonly NdjsonPunch[];
}

export interface StatusResult {
  status: 'OK' | 'MP' | 'DNF';
  missing_codes: number[];
  extra_codes: number[];
  out_of_order_codes: number[];
  elapsed_time_ms: number | null;
}

/**
 * Classify a single card_read against the expected course controls.
 *
 * Gate 1 (DNF, codex C-H2 LOCKED): `input.finish === null` → status='DNF'
 * regardless of how many punches were collected. A clean run with all
 * controls but no finish stamp is genuinely DNF (operator killed the
 * read before the finish punch, or the cable was yanked mid-read).
 *
 * Gate 2 (OK/MP): `input.finish !== null` → compare `input.punches`
 * (control-station punches only — Phase 0 decoder separates start/finish/
 * check at the storage→raceResult boundary) against `expectedControlCodes`
 * in order. OK = exact match; MP = any divergence with diff arrays.
 */
export function detectStatus(
  input: DetectInput,
  expectedControlCodes: readonly number[]
): StatusResult {
  const elapsed = diffMs(input.start, input.finish);

  // Gate 1: no finish stamp → DNF, regardless of punches[] contents.
  if (input.finish === null) {
    return {
      status: 'DNF',
      missing_codes: [...expectedControlCodes],
      extra_codes: input.punches.map((p) => p.code),
      out_of_order_codes: [],
      elapsed_time_ms: null,
    };
  }

  // Gate 2: order-match expected vs actual control punches.
  //
  // Phase 1 invariant: each control code appears at most once in a course
  // and at most once on a clean card_read (a competitor doesn't re-punch
  // the same control). Under this invariant the diff splits cleanly:
  //   - missing: expected codes NOT present in actual at all
  //   - extra:   actual codes NOT present in expected (strays)
  //   - out_of_order: a code present in BOTH but punched too early (it
  //     "jumped ahead" of the next-expected code, which then catches up
  //     after the swap). Only the LEADING punch of each swap is reported
  //     so a single 32/33 transposition surfaces as one out-of-order
  //     entry, not two.
  //
  // Walk both sequences. When they mismatch:
  //   (a) if expected[ei] appears later in actual[ai..], the leading
  //       actual[ai] is out-of-order (or extra if not in expected).
  //   (b) otherwise expected[ei] is missing.
  // Codes already attributed to out-of-order do NOT then surface as
  // missing later in the walk (the C-H2 review's "single transposition"
  // shape).
  const expected = [...expectedControlCodes];
  const actual = input.punches.map((p) => p.code);
  const expectedSet = new Set(expected);
  const missing: number[] = [];
  const extra: number[] = [];
  const outOfOrder: number[] = [];
  const outOfOrderSet = new Set<number>();
  let ei = 0;
  let ai = 0;
  while (ei < expected.length || ai < actual.length) {
    if (ei < expected.length && ai < actual.length && expected[ei] === actual[ai]) {
      ei++;
      ai++;
      continue;
    }
    if (ei < expected.length && ai < actual.length) {
      if (actual.slice(ai).includes(expected[ei]!)) {
        const code = actual[ai]!;
        if (expectedSet.has(code)) {
          outOfOrder.push(code);
          outOfOrderSet.add(code);
        } else {
          extra.push(code);
        }
        ai++;
        continue;
      }
      // expected[ei] is missing unless we already reported it as out-of-order.
      if (!outOfOrderSet.has(expected[ei]!)) missing.push(expected[ei]!);
      ei++;
      continue;
    }
    if (ei < expected.length) {
      if (!outOfOrderSet.has(expected[ei]!)) missing.push(expected[ei]!);
      ei++;
      continue;
    }
    if (ai < actual.length) {
      const code = actual[ai]!;
      if (expectedSet.has(code)) outOfOrder.push(code);
      else extra.push(code);
      ai++;
      continue;
    }
  }

  const status: 'OK' | 'MP' =
    missing.length === 0 && extra.length === 0 && outOfOrder.length === 0 ? 'OK' : 'MP';
  return {
    status,
    missing_codes: missing,
    extra_codes: extra,
    out_of_order_codes: outOfOrder,
    elapsed_time_ms: elapsed,
  };
}
