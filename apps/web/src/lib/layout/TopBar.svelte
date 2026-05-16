<!--
  Authored for fartol. Not ported from upstream.

  Top bar — breadcrumb (callers feed via the `crumb` snippet),
  WS-connection PulseDot (variant bound to the prop), and the wall-clock
  Clock component. UI-SPEC §"Layout shell": 56px tall, --topbar-h.

  Brand mark lives in the sidebar; the topbar focuses on context +
  status. The PulseDot variant follows the readout convention:
    open    → green
    connecting → amber
    closed  → red
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import PulseDot from '../ui/PulseDot.svelte';
  import Clock from './Clock.svelte';
  import { t } from '../i18n/index.ts';

  type WsStatus = 'open' | 'connecting' | 'closed';

  interface Props {
    crumb?: Snippet;
    wsStatus?: WsStatus;
    showWs?: boolean;
  }

  let { crumb, wsStatus = 'closed', showWs = true }: Props = $props();

  const variant = $derived(
    wsStatus === 'open' ? 'green' : wsStatus === 'connecting' ? 'amber' : 'red'
  );

  const label = $derived(
    wsStatus === 'open' ? t('ro.online') : wsStatus === 'connecting' ? t('wiz.detecting') : t('ro.offline')
  );

  const color = $derived(
    wsStatus === 'open' ? 'var(--ok)' : wsStatus === 'connecting' ? 'var(--mp)' : 'var(--dnf)'
  );
</script>

<header class="topbar">
  {#if crumb}
    <div class="crumb">{@render crumb()}</div>
  {/if}
  <div class="spacer"></div>
  {#if showWs}
    <div class="ws-status" data-testid="ws-status">
      <PulseDot {variant} label={label} />
      <span class="ws-label" style="color: {color}">{label}</span>
    </div>
  {/if}
  <Clock />
</header>

<style>
  .topbar {
    height: var(--topbar-h);
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    padding: 0 var(--space-lg);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
  }
  .crumb {
    font-size: var(--fs-label);
    color: var(--fg-muted);
  }
  :global(.crumb strong) {
    color: var(--fg);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .ws-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .ws-label {
    font-weight: 500;
  }
</style>
