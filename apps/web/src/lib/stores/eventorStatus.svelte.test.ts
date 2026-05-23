// Authored for fartola. Not ported from upstream.
//
// Vitest coverage for the eventorStatus runes store (Plan 02-02 task 4).
//
//   - refreshEventorStatus fetches /api/eventor/status and reflects the
//     response into the store.
//   - refreshEventorStatus on fetch error sets state='offline'.
//   - triggerEventorRefresh optimistically flips state to 'refreshing'
//     and then refetches to land the truth.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('eventorStatus store', () => {
  it('refreshEventorStatus reflects /api/eventor/status response', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            state: 'ready',
            ageDays: 2,
            competitorCount: 252919,
            fartola_dev: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    ) as unknown as typeof fetch;
    const mod = await import('./eventorStatus.svelte.ts');
    await mod.refreshEventorStatus();
    const s = mod.getEventorStatus();
    expect(s.state).toBe('ready');
    expect(s.ageDays).toBe(2);
    expect(s.competitorCount).toBe(252919);
    expect(s.fartola_dev).toBe(false);
  });

  it('refreshEventorStatus on network failure sets state=offline', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const mod = await import('./eventorStatus.svelte.ts');
    await mod.refreshEventorStatus();
    expect(mod.getEventorStatus().state).toBe('offline');
  });

  it('triggerEventorRefresh fires the admin POST + re-fetches status', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calls.push(url);
      if (url.includes('/api/__admin/eventor/refresh')) {
        return new Response(JSON.stringify({ ok: true, skipped: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          state: 'ready',
          ageDays: 0,
          competitorCount: 100,
          fartola_dev: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const mod = await import('./eventorStatus.svelte.ts');
    await mod.triggerEventorRefresh();
    const adminCall = calls.find((u) => u.includes('/api/__admin/eventor/refresh'));
    const statusCall = calls.find((u) => u.includes('/api/eventor/status'));
    expect(adminCall, 'admin refresh POST invoked').toBeTruthy();
    expect(statusCall, 'status GET invoked afterwards').toBeTruthy();
    expect(mod.getEventorStatus().fartola_dev).toBe(true);
    expect(mod.getEventorStatus().competitorCount).toBe(100);
  });
});
