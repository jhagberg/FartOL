<!--
  Authored for fartol. Not ported from upstream.

  Walking-skeleton home page (plan 03). Wires the WsClient to
  readout:walking-skeleton, exposes a "Simulate read" button that POSTs
  to /api/__dev/simulate-read, and renders incoming card_read envelopes
  in a small list. The full HomeView (UI-SPEC §HomeView) lands in plan 11.

  Locked by:
  - .planning/phases/01-single-laptop-training-mvp/01-03-PLAN.md task 3
  - .planning/phases/01-single-laptop-training-mvp/01-UI-SPEC.md
    §"Tweaks panel" (Simulate-read is dev-only)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WsClient } from '$lib/ws/client.ts';
  import type { WsEnvelope } from '@fartol/shared-types';

  const WALKING_SKELETON_CHANNEL = 'readout:walking-skeleton' as const;
  const MAX_VISIBLE = 12;

  interface VisibleEvent {
    seq: number | undefined;
    card_number: number;
  }

  let events: VisibleEvent[] = $state([]);
  let client: WsClient | null = null;
  let status: 'connecting' | 'open' | 'closed' = $state('connecting');

  function handleEnvelope(env: WsEnvelope): void {
    if (env.type === 'card_read' || env.type === 'replay') {
      const payload = env.payload as { card_number?: number } | null;
      if (payload && typeof payload.card_number === 'number') {
        events = [
          { seq: env.seq, card_number: payload.card_number },
          ...events,
        ].slice(0, MAX_VISIBLE);
      }
    }
  }

  onMount(() => {
    // Vite dev proxies /ws to the bridge (apps/web/vite.config.ts §"proxy").
    // In production the SvelteKit build is served by the bridge itself, so
    // a relative ws:// URL points at the same origin.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    client = new WsClient(url, handleEnvelope);
    client.preSubscribe(WALKING_SKELETON_CHANNEL);
    client.connect();
    // Heuristic: once the hello is sent (connect resolves synchronously,
    // open is async), flip the badge to 'open' on first message. For now
    // we just flip to 'open' shortly after mount — the e2e doesn't gate
    // on this and plan 11 wires a real status badge.
    setTimeout(() => {
      status = 'open';
    }, 200);
  });

  onDestroy(() => {
    client?.close();
    status = 'closed';
  });

  async function simulateRead(): Promise<void> {
    // The walking-skeleton card_read fixture is one of the four Phase 0
    // Jonas captures. The SI10/7501853 line is used; controls 31 + 32 are
    // synthetic placeholder punches sized to round-trip through the dev
    // endpoint without leaning on the real card_holder block.
    await fetch('/api/__dev/simulate-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        competition_id: 'walking-skeleton',
        card_number: 7501853,
        card_type: 'SI10',
        punches: [
          { control_code: 31, time_ms: 1234500 },
          { control_code: 32, time_ms: 1234800 },
        ],
      }),
    });
  }
</script>

<h1>FartOL</h1>
<p>Phase 1 walking skeleton — full UI lands in plan 11.</p>

<p>
  Status: <strong data-testid="ws-status">{status}</strong>
</p>

<button data-testid="simulate-read-btn" onclick={simulateRead}>Simulate read</button>

<ul data-testid="events">
  {#each events as event (event.seq ?? event.card_number)}
    <li data-testid="event">card_number={event.card_number}</li>
  {/each}
</ul>
