// Authored for fartol. Not ported from upstream.
//
// Svelte 5 runes FIFO store of pending card_read events for the
// registration-desk surface (/competition/:id/registration). Buffers
// subsequent unknown card_reads while the WalkupModal is already open
// for an earlier card, so the operator can save each one in turn
// without losing reads to the Phase 1 silent-drop site at
// ReadoutView.svelte:494-499 (`walkupCard === null` guard).
//
// Dedupe-on-card_number: push() returns false instead of throwing when
// the same SI bricka is already queued. Callers (RegistrationView)
// decide whether to surface a toast. This keeps the store pure (no
// fetch, no DOM) so it is importable from both browser and Node test
// environments without side effects.
//
// See .planning/phases/02-4-klubbs-mvp/02-CONTEXT.md lines 51-64 for
// the design rationale.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02b-PLAN.md task 1

export interface QueuedCard {
  cardNumber: number;
  cardHolderHint: string | null;
  enqueuedAtMs: number;
}

const _queue = $state<QueuedCard[]>([]);

export const cardQueue = {
  /** Current pending count — does NOT include the card currently
   * mounted in the WalkupModal (the consumer lifts the card OUT of the
   * queue via pop() when opening the modal). */
  get count(): number {
    return _queue.length;
  },
  /** Peek at the next-to-pop card without removing it. */
  get current(): QueuedCard | null {
    return _queue[0] ?? null;
  },
  /** Read-only snapshot of the queue contents for rendering. Returns a
   * fresh array so mutations of the result can't punch through into the
   * store. Order matches FIFO pop order (index 0 = next to pop). */
  get items(): readonly QueuedCard[] {
    return [..._queue];
  },
  /** FIFO push. Returns false if the same card_number is already in
   * the queue — the caller (RegistrationView) is expected to surface a
   * dedupe toast on the false branch. */
  push(cardNumber: number, hint: string | null): boolean {
    if (_queue.some((q) => q.cardNumber === cardNumber)) return false;
    _queue.push({ cardNumber, cardHolderHint: hint, enqueuedAtMs: Date.now() });
    return true;
  },
  /** FIFO pop. Returns null on an empty queue. */
  pop(): QueuedCard | null {
    return _queue.shift() ?? null;
  },
  /** Skip-ahead pop: remove + return the queued card matching the given
   * number, regardless of its position. Returns null if not found. Used
   * by the operator UI when an operator clicks a specific queued chip
   * to process it next instead of the FIFO head. */
  take(cardNumber: number): QueuedCard | null {
    const idx = _queue.findIndex((q) => q.cardNumber === cardNumber);
    if (idx < 0) return null;
    return _queue.splice(idx, 1)[0] ?? null;
  },
  /** Drain the queue. Called on RegistrationView unmount so stale
   * queue entries don't carry across navigation to /readout. */
  clear(): void {
    _queue.length = 0;
  },
  /** Sibling-check helper for RegistrationView's dedupe-against-open-modal
   * path (the queue holds only pending cards; the currently-displayed
   * card lives one level up). */
  contains(cardNumber: number): boolean {
    return _queue.some((q) => q.cardNumber === cardNumber);
  },
};
