// Authored for fartol. Not ported from upstream.
//
// Unit tests for the cardQueue Svelte 5 runes FIFO store.
//
// Mirrors the tweaks.svelte.test.ts pattern — module-scoped singleton,
// reset between tests via afterEach(cardQueue.clear) so state doesn't
// leak. Each test exercises one of the 8 behaviors locked by
// 02-02b-PLAN.md task 1.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02b-PLAN.md task 1

import { describe, it, expect, afterEach } from 'vitest';
import { cardQueue, type QueuedCard } from './cardQueue.svelte.ts';

afterEach(() => {
  cardQueue.clear();
});

describe('cardQueue runes store', () => {
  it('fresh queue: count=0, current=null, pop()=null', () => {
    expect(cardQueue.count).toBe(0);
    expect(cardQueue.current).toBeNull();
    expect(cardQueue.pop()).toBeNull();
  });

  it('push stores the card with hint + enqueuedAtMs; count becomes 1', () => {
    const before = Date.now();
    const ok = cardQueue.push(8535005, 'Jonas Hagberg');
    const after = Date.now();
    expect(ok).toBe(true);
    expect(cardQueue.count).toBe(1);
    const c = cardQueue.current;
    expect(c).not.toBeNull();
    expect(c!.cardNumber).toBe(8535005);
    expect(c!.cardHolderHint).toBe('Jonas Hagberg');
    expect(c!.enqueuedAtMs).toBeGreaterThanOrEqual(before);
    expect(c!.enqueuedAtMs).toBeLessThanOrEqual(after);
    expect(cardQueue.contains(8535005)).toBe(true);
  });

  it('dedupe: pushing the same card_number twice returns false on the second push', () => {
    expect(cardQueue.push(8535005, 'Jonas Hagberg')).toBe(true);
    expect(cardQueue.push(8535005, null)).toBe(false);
    expect(cardQueue.count).toBe(1);
  });

  it('two distinct cards: count=2, current is still the first (peek semantics)', () => {
    expect(cardQueue.push(8535005, 'Jonas')).toBe(true);
    expect(cardQueue.push(99999, null)).toBe(true);
    expect(cardQueue.count).toBe(2);
    expect(cardQueue.current?.cardNumber).toBe(8535005);
  });

  it('pop removes the first card; current becomes the next; count decrements', () => {
    cardQueue.push(8535005, 'Jonas');
    cardQueue.push(99999, null);
    const popped = cardQueue.pop();
    expect(popped?.cardNumber).toBe(8535005);
    expect(cardQueue.count).toBe(1);
    expect(cardQueue.current?.cardNumber).toBe(99999);
  });

  it('pop until empty then once more: returns the remaining cards then null', () => {
    cardQueue.push(8535005, 'Jonas');
    cardQueue.push(99999, null);
    expect(cardQueue.pop()?.cardNumber).toBe(8535005);
    expect(cardQueue.pop()?.cardNumber).toBe(99999);
    expect(cardQueue.pop()).toBeNull();
    expect(cardQueue.count).toBe(0);
  });

  it('clear empties the queue and resets count to 0', () => {
    cardQueue.push(1, null);
    cardQueue.push(2, null);
    cardQueue.push(3, null);
    expect(cardQueue.count).toBe(3);
    cardQueue.clear();
    expect(cardQueue.count).toBe(0);
    expect(cardQueue.current).toBeNull();
  });

  it('hint=null and hint="" stored verbatim (caller controls normalization)', () => {
    cardQueue.push(1, null);
    cardQueue.push(2, '');
    expect(cardQueue.pop()?.cardHolderHint).toBeNull();
    expect(cardQueue.pop()?.cardHolderHint).toBe('');
  });

  // Phase 2.1 (2026-05-18) — skip-ahead pop: operator clicks a specific
  // chip in the visible queue list to process it next instead of FIFO.
  it('take(cardNumber) removes + returns the matching card from any position', () => {
    cardQueue.push(11, 'a');
    cardQueue.push(22, 'b');
    cardQueue.push(33, 'c');
    const taken = cardQueue.take(22);
    expect(taken?.cardNumber).toBe(22);
    expect(cardQueue.count).toBe(2);
    // Remaining order preserved: 11 then 33.
    expect(cardQueue.pop()?.cardNumber).toBe(11);
    expect(cardQueue.pop()?.cardNumber).toBe(33);
  });

  it('take(cardNumber) on a card not in the queue returns null and does not mutate', () => {
    cardQueue.push(11, null);
    expect(cardQueue.take(99)).toBeNull();
    expect(cardQueue.count).toBe(1);
  });

  it('items returns a read-only snapshot in FIFO order', () => {
    cardQueue.push(1, 'a');
    cardQueue.push(2, 'b');
    const snap = cardQueue.items;
    expect(snap.map((q) => q.cardNumber)).toEqual([1, 2]);
    // Mutating the snapshot array must not affect the underlying queue.
    // (Cast through unknown so we can prove the runtime defense, even
    // though the type system marks `items` as readonly.)
    (snap as unknown as QueuedCard[]).push({
      cardNumber: 99,
      cardHolderHint: null,
      enqueuedAtMs: 0,
    });
    expect(cardQueue.count).toBe(2);
  });
});
