// Authored for fartol. Not ported from upstream.
//
// PrinterSink interface — PATTERNS S-2 sink injection. Production passes
// the real node-thermal-printer (ESC/POS) driver (plan 15); the walking
// skeleton (plan 03) and unit tests pass the stdout-sink or an in-memory
// recorder. The interface is intentionally minimal: isPrinterConnected
// for the UI status badge, print(envelope) for the actual receipt emit.
//
// Plan 15 refines PrintEnvelope.data into a typed ReceiptData union
// (template-specific shapes). For plan 03 the field is `unknown` so the
// walking-skeleton can flow punches verbatim.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 2
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-2
// - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
//   §"Receipt templates" (six template names locked here so plan 15's
//   ESC/POS implementation has a stable contract)
//
// PATTERNS S-6 (snake_case at the I/O boundary): receipt fields stay
// snake_case in the print payload — see stdout-sink.ts JSON keys.

export type ReceiptTemplate = 'classic' | 'standing' | 'detailed' | 'top4' | 'minimal' | 'kids';

export interface PrintEnvelope {
  template: ReceiptTemplate;
  competition_id: string;
  card_number: number;
  /** Refined by plan 15. Plan 03 stores a `{ punches }` payload verbatim. */
  data: unknown;
}

export interface PrinterSink {
  /** Liveness probe for the UI status badge. The stdout sink always
   * returns true; the ESC/POS driver returns false when no /dev/usb/lp0
   * is detected. */
  isPrinterConnected(): Promise<boolean>;
  /** Emit a receipt. Implementations must not throw on a disconnected
   * printer — surface the failure via isPrinterConnected() instead so the
   * REST handler can return a 503 cleanly. */
  print(envelope: PrintEnvelope): Promise<void>;
}
