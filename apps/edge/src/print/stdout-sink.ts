// Authored for fartola. Not ported from upstream.
//
// Walking-skeleton PrinterSink that writes one JSON line per print() to
// stdout. Proves the print interface is wired without a /dev/usb/lp0 — a
// Playwright e2e in plan 03 spawns the bridge with FARTOLA_DEV=1 and
// asserts the stdout-sink line appears after a simulate-read. Plan 15
// swaps this for the real ESC/POS driver behind the same interface.
//
// Line shape (LOCKED by the walking-skeleton e2e — change this and the
// e2e assertion in tests/e2e/walking-skeleton.spec.ts must change too):
//   { "kind": "print", "schema_version": 1, "template": "...",
//     "competition_id": "...", "card_number": <n>, "data": {...} }
//
// PATTERNS S-6: snake_case at the I/O boundary, including the kind +
// schema_version envelope fields. The `out` injection lets tests capture
// the emit without monkey-patching process.stdout.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-2

import type { PrinterSink, PrintEnvelope } from './sink.ts';

export interface CreateStdoutPrinterSinkOpts {
  /** Override the line writer (tests). Defaults to process.stdout.write
   * + a trailing newline. */
  out?: (line: string) => void;
}

export function createStdoutPrinterSink(opts: CreateStdoutPrinterSinkOpts = {}): PrinterSink {
  const out = opts.out ?? ((line: string) => process.stdout.write(line + '\n'));
  return {
    async isPrinterConnected(): Promise<boolean> {
      return true;
    },
    async print(envelope: PrintEnvelope): Promise<void> {
      out(
        JSON.stringify({
          kind: 'print',
          schema_version: 1,
          template: envelope.template,
          competition_id: envelope.competition_id,
          card_number: envelope.card_number,
          data: envelope.data,
        })
      );
    },
  };
}
